import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../src/rules.js';
import { checkFile } from '../src/check.js';

const DEFAULT_RULES = new Set(RULES.filter((rule) => rule.defaultOn).map((rule) => rule.id));

// Lines are given as [lineNumber, text] so tests can leave gaps between them.
function ruleIds(path, numberedLines) {
  const lines = numberedLines.map(([number, text]) => ({ number, text }));
  return checkFile({ path, lines }, DEFAULT_RULES).map((finding) => finding.rule);
}

function lines(...texts) {
  return texts.map((text, index) => [index + 1, text]);
}

describe('empty-catch', () => {
  test('flags swallowed errors', () => {
    assert.ok(ruleIds('a.js', lines('} catch (e) {}')).includes('empty-catch'));
    assert.ok(ruleIds('a.js', lines('} catch (err) {', '}')).includes('empty-catch'));
    assert.ok(ruleIds('a.py', lines('except: pass')).includes('empty-catch'));
    assert.ok(ruleIds('a.py', lines('except Exception:', '    pass')).includes('empty-catch'));
    assert.ok(ruleIds('a.go', lines('if err != nil {}')).includes('empty-catch'));
    assert.ok(ruleIds('a.go', lines('if err != nil { }')).includes('empty-catch'));
    assert.ok(ruleIds('a.go', lines('if err != nil {', '}')).includes('empty-catch'));
  });
  test('leaves deliberate ignores alone (calibration)', () => {
    assert.ok(!ruleIds('a.ts', lines('try { a() } catch {}')).includes('empty-catch'));
    assert.ok(!ruleIds('a.py', lines('except ImportError:', '    pass')).includes('empty-catch'));
    assert.ok(!ruleIds('a.py', lines('except StopIteration: pass')).includes('empty-catch'));
  });
  test('leaves handled errors alone', () => {
    assert.ok(!ruleIds('a.js', lines('} catch (e) { log(e) }')).includes('empty-catch'));
    assert.ok(!ruleIds('a.js', lines('} catch (e) {', '  log(e);')).includes('empty-catch'));
    assert.ok(!ruleIds('a.go', lines('if err != nil { return err }')).includes('empty-catch'));
    assert.ok(!ruleIds('a.go', lines('if err != nil {', '  return err')).includes('empty-catch'));
    assert.ok(!ruleIds('a.go', lines('if err != nil {', '} else {', '  fallback()', '}')).includes('empty-catch'));
  });
  test('needs the closing line to be added right below', () => {
    assert.ok(!ruleIds('a.js', [[3, '} catch (err) {'], [9, '}']]).includes('empty-catch'));
    assert.ok(!ruleIds('a.go', [[3, 'if err != nil {'], [9, '}']]).includes('empty-catch'));
  });
});

describe('catch-rethrow', () => {
  test('flags catch blocks that only rethrow', () => {
    assert.ok(ruleIds('a.js', lines('} catch (e) { throw e; }')).includes('catch-rethrow'));
    assert.ok(ruleIds('a.js', lines('} catch (error) {', '  throw error;')).includes('catch-rethrow'));
    assert.ok(ruleIds('a.py', lines('except ValueError as e:', '    raise')).includes('catch-rethrow'));
    assert.ok(ruleIds('a.py', lines('except ValueError as e:', '    raise e')).includes('catch-rethrow'));
  });
  test('leaves wrapped errors alone', () => {
    assert.ok(!ruleIds('a.js', lines('} catch (e) { throw new AppError(e) }')).includes('catch-rethrow'));
    assert.ok(!ruleIds('a.py', lines('except KeyError as e:', '    raise ValueError("bad")')).includes('catch-rethrow'));
  });
});

describe('restating-comment', () => {
  test('flags comments that repeat the next line', () => {
    assert.ok(ruleIds('a.js', lines('// increment the counter', 'counter++;')).includes('restating-comment'));
    assert.ok(ruleIds('a.js', lines('// get user by id', 'const user = getUserById(id);')).includes('restating-comment'));
    assert.ok(ruleIds('a.py', lines('# return the result', 'return result')).includes('restating-comment'));
  });
  test('leaves comments that explain why alone', () => {
    assert.ok(!ruleIds('a.js', lines('// retry because the gateway drops the first call', 'retry();')).includes('restating-comment'));
    assert.ok(!ruleIds('a.js', lines('// get the user record and the account record', 'const user = getUser(id);')).includes('restating-comment'));
  });
  test('leaves section labels and commented-out code alone (calibration)', () => {
    assert.ok(!ruleIds('a.js', lines('// view', 'if (!view) {')).includes('restating-comment'));
    assert.ok(!ruleIds('a.sh', lines('# \u2500\u2500\u2500 USER ROLES \u2500\u2500\u2500', 'user_roles) list_user_roles ;;')).includes('restating-comment'));
    assert.ok(!ruleIds('a.js', lines('// ===== user roles =====', 'const userRoles = listUserRoles();')).includes('restating-comment'));
    assert.ok(!ruleIds('a.js', lines('// -- User Roles --', 'userRoles: [')).includes('restating-comment'));
    assert.ok(!ruleIds('a.js', lines('// content-type', "if (!this.get('Content-Type')) {")).includes('restating-comment'));
    assert.ok(!ruleIds('a.py', lines("# source_suffix = ['.rst', '.md']", 'source_suffix = ".rst"')).includes('restating-comment'));
    assert.ok(!ruleIds('a.go', lines('// Test active help config for a flag', 'activeHelpCfg = "a config for a flag"')).includes('restating-comment'));
  });
  test('leaves Go doc comments and multi-line comments alone (calibration)', () => {
    assert.ok(!ruleIds('a.go', lines('// SetHelpCommand sets help command.', 'func (c *Command) SetHelpCommand(cmd *Command) {')).includes('restating-comment'));
    assert.ok(!ruleIds('a.go', lines('// flags is full set of flags.', 'flags *flag.FlagSet')).includes('restating-comment'));
    assert.ok(ruleIds('a.go', lines('// set TraverseChildren to true on the root cmd', 'rootCmd.TraverseChildren = true')).includes('restating-comment'));
    assert.ok(ruleIds('a.js', lines('// load the user', 'const user = loadUser(id);')).includes('restating-comment'));
    assert.ok(!ruleIds('a.js', lines('// The session expires after one hour, so', '// load the user', 'const user = loadUser(id);')).includes('restating-comment'));
  });
  test('needs the code line to be added right below', () => {
    assert.ok(!ruleIds('a.js', [[1, '// return the result'], [5, 'return result;']]).includes('restating-comment'));
  });
});
