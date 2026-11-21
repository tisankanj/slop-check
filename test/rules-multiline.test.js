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
  });
  test('leaves deliberate ignores alone (calibration)', () => {
    assert.ok(!ruleIds('a.ts', lines('try { a() } catch {}')).includes('empty-catch'));
    assert.ok(!ruleIds('a.py', lines('except ImportError:', '    pass')).includes('empty-catch'));
    assert.ok(!ruleIds('a.py', lines('except StopIteration: pass')).includes('empty-catch'));
  });
  test('leaves handled errors alone', () => {
    assert.ok(!ruleIds('a.js', lines('} catch (e) { log(e) }')).includes('empty-catch'));
    assert.ok(!ruleIds('a.js', lines('} catch (e) {', '  log(e);')).includes('empty-catch'));
  });
  test('needs the closing line to be added right below', () => {
    assert.ok(!ruleIds('a.js', [[3, '} catch (err) {'], [9, '}']]).includes('empty-catch'));
  });

  test('flags empty Ruby rescue blocks', () => {
    const flagged = (...texts) => ruleIds('a.rb', lines(...texts)).includes('empty-catch');
    assert.ok(flagged('rescue => e', 'end'));
    assert.ok(flagged('rescue', 'end'));
    assert.ok(flagged('rescue StandardError', 'end'));
    assert.ok(flagged('rescue StandardError => e', 'end'));
    assert.ok(flagged('rescue Exception => e', 'end'));
    assert.ok(flagged('rescue ::StandardError => e', 'end'));
    assert.ok(flagged('  rescue => e', '  end'));
  });
  test('flags Ruby rescue blocks with only blank lines in them', () => {
    const flagged = (...texts) => ruleIds('a.rb', lines(...texts)).includes('empty-catch');
    assert.ok(flagged('rescue => e', '', 'end'));
    assert.ok(flagged('rescue => e', '', '', 'end'));
    assert.ok(flagged('rescue Exception', '', '', '', 'end'));
  });
  test('flags Ruby rescue and end on one line', () => {
    const flagged = (...texts) => ruleIds('a.rb', lines(...texts)).includes('empty-catch');
    assert.ok(flagged('begin; charge(card); rescue; end'));
    assert.ok(flagged('begin; charge(card); rescue => e; end'));
    assert.ok(flagged('begin; charge(card); rescue StandardError => e; end'));
  });
  test('leaves named Ruby error classes and commented rescues alone (calibration)', () => {
    const flagged = (...texts) => ruleIds('a.rb', lines(...texts)).includes('empty-catch');
    assert.ok(!flagged('rescue LoadError', 'end'));
    assert.ok(!flagged('rescue LoadError', '  # optional dependency', 'end'));
    assert.ok(!flagged('rescue Errno::ENOENT => e', '  # the file may not exist yet', 'end'));
    assert.ok(!flagged('rescue Errno::ENOENT, Errno::EACCES', 'end'));
    assert.ok(!flagged('rescue *RETRYABLE_ERRORS', 'end'));
    assert.ok(!flagged('begin; require "json"; rescue LoadError; end'));
    assert.ok(!flagged('rescue', '  # best effort, ignore network errors', 'end'));
    assert.ok(!flagged('rescue => e # expected when disconnected', 'end'));
    assert.ok(!flagged('rescue => @setup_exception', 'end'));
    assert.ok(!flagged('rescue StandardError', '  nil', 'end'));
  });
  test('leaves Ruby rescue blocks that do something alone', () => {
    const flagged = (...texts) => ruleIds('a.rb', lines(...texts)).includes('empty-catch');
    assert.ok(!flagged('rescue => e', '  logger.error(e)', 'end'));
    assert.ok(!flagged('rescue => e', '', '  raise', 'end'));
    assert.ok(!flagged('rescue StandardError => e', '  # report it', '  notify(e)', 'end'));
    assert.ok(!flagged('rescue => e', '  nil', '  retry_later', 'end'));
    assert.ok(!flagged('rescue => e', 'else', 'end'));
    assert.ok(!flagged('rescue => e', 'ensure', 'end'));
    assert.ok(!flagged('rescue => e', '  handle(e)', 'end'));
    assert.ok(!flagged('begin; charge(card); rescue => e; log(e); end'));
  });
  test('leaves inline Ruby rescue modifiers and lookalikes alone', () => {
    const flagged = (...texts) => ruleIds('a.rb', lines(...texts)).includes('empty-catch');
    assert.ok(!flagged('value = Integer(input) rescue nil'));
    assert.ok(!flagged('Integer(input) rescue nil', 'end'));
    assert.ok(!flagged('name = user.name rescue "unknown"', 'end'));
    assert.ok(!flagged('# rescue => e', 'end'));
    assert.ok(!flagged('puts "rescue => e"', 'end'));
    assert.ok(!flagged('rescue_from StandardError, with: :handle', 'end'));
    assert.ok(!flagged('rescue => e'));
  });
  test('needs the Ruby end to be added in an unbroken run below the rescue', () => {
    assert.ok(!ruleIds('a.rb', [[3, 'rescue => e'], [9, 'end']]).includes('empty-catch'));
    assert.ok(!ruleIds('a.rb', [[3, 'rescue => e'], [4, ''], [9, 'end']]).includes('empty-catch'));
    assert.ok(!ruleIds('a.rb', lines('rescue => e', '', '', '', '', 'end')).includes('empty-catch'));
  });
  test('only reads rescue in Ruby files', () => {
    for (const path of ['a.js', 'a.ts', 'a.py', 'a.go', 'a.sh', 'a.md']) {
      assert.ok(!ruleIds(path, lines('rescue => e', 'end')).includes('empty-catch'), path);
      assert.ok(!ruleIds(path, lines('rescue StandardError', '', 'end')).includes('empty-catch'), path);
    }
  });
  test('Ruby files do not read JavaScript catch blocks', () => {
    assert.ok(!ruleIds('a.rb', lines('catch(:done) {}')).includes('empty-catch'));
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
