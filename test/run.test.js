import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCheck } from '../src/run.js';
import { SlopCheckError } from '../src/git.js';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'slop-check-run-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'clean.js'), 'const a = 1;\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'chore: start');
  return dir;
}

function commitFile(dir, path, content, message = 'feat: change') {
  writeFileSync(join(dir, path), content);
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', message);
}

function ruleIds(result) {
  return result.findings.map((finding) => finding.rule);
}

test('branch mode finds only lines added on the branch', () => {
  const dir = makeRepo();
  commitFile(dir, 'old.js', 'debugger;\n');
  git(dir, 'checkout', '-q', '-b', 'feature');
  commitFile(dir, 'new.js', 'const b = 2;\ndebugger;\n');
  const result = runCheck({ cwd: dir, mode: 'branch' });
  assert.deepEqual(result.findings.map((f) => [f.rule, f.file, f.line]), [['debug-leftover', 'new.js', 2]]);
  assert.equal(result.base, 'main');
  assert.equal(result.files, 1);
  assert.equal(result.addedLines, 2);
});

test('branch mode includes uncommitted changes to tracked files', () => {
  const dir = makeRepo();
  git(dir, 'checkout', '-q', '-b', 'feature');
  appendFileSync(join(dir, 'clean.js'), 'debugger;\n');
  assert.deepEqual(ruleIds(runCheck({ cwd: dir, mode: 'branch' })), ['debug-leftover']);
});

test('on main with no changes there is nothing to check', () => {
  const dir = makeRepo();
  const result = runCheck({ cwd: dir, mode: 'branch' });
  assert.equal(result.base, null);
  assert.equal(result.addedLines, 0);
  assert.equal(result.score, 0);
});

test('on main, uncommitted changes are checked against HEAD', () => {
  const dir = makeRepo();
  appendFileSync(join(dir, 'clean.js'), 'debugger;\n');
  assert.deepEqual(ruleIds(runCheck({ cwd: dir, mode: 'branch' })), ['debug-leftover']);
});

test('staged mode ignores unstaged edits', () => {
  const dir = makeRepo();
  writeFileSync(join(dir, 'staged.js'), 'debugger;\n');
  git(dir, 'add', 'staged.js');
  appendFileSync(join(dir, 'clean.js'), '// Let me check this\n');
  assert.deepEqual(ruleIds(runCheck({ cwd: dir, mode: 'staged' })), ['debug-leftover']);
});

test('all mode scans every tracked file', () => {
  const dir = makeRepo();
  commitFile(dir, 'old.js', 'debugger;\n');
  const result = runCheck({ cwd: dir, mode: 'all' });
  assert.deepEqual(ruleIds(result), ['debug-leftover']);
  assert.equal(result.files, 2);
  assert.equal(result.base, null);
});

test('commit messages are checked in branch mode', () => {
  const dir = makeRepo();
  git(dir, 'checkout', '-q', '-b', 'feature');
  commitFile(dir, 'b.js', 'const b = 2;\n', 'feat: supercharge b');
  const result = runCheck({ cwd: dir, mode: 'branch' });
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].rule, 'buzzword');
  assert.equal(result.findings[0].commit.length, 7);
});

test('ignored and unknown files do not count', () => {
  const dir = makeRepo();
  git(dir, 'checkout', '-q', '-b', 'feature');
  mkdirSync(join(dir, 'node_modules'));
  writeFileSync(join(dir, 'node_modules', 'x.js'), 'debugger;\n');
  writeFileSync(join(dir, 'notes.xyz'), 'debugger;\n');
  git(dir, 'add', '-f', '.');
  git(dir, 'commit', '-q', '-m', 'chore: add files');
  const result = runCheck({ cwd: dir, mode: 'branch' });
  assert.equal(result.files, 0);
  assert.equal(result.addedLines, 0);
  assert.deepEqual(result.findings, []);
});

test('config passed in is used', () => {
  const dir = makeRepo();
  git(dir, 'checkout', '-q', '-b', 'feature');
  commitFile(dir, 'b.js', 'debugger;\n');
  const config = { rules: { 'debug-leftover': 'off' }, ignore: [], maxScore: null, warnings: [] };
  assert.deepEqual(runCheck({ cwd: dir, mode: 'branch', config }).findings, []);
});

test('a renamed file with a space in its new name reports the new path', () => {
  const dir = makeRepo();
  git(dir, 'checkout', '-q', '-b', 'feature');
  git(dir, 'mv', 'clean.js', 'new name.js');
  appendFileSync(join(dir, 'new name.js'), 'debugger;\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'refactor: rename');
  assert.deepEqual(runCheck({ cwd: dir, mode: 'branch' }).findings.map((f) => f.file), ['new name.js']);
});

test('a base commit missing from the clone names fetch-depth', () => {
  const dir = makeRepo();
  assert.throws(
    () => runCheck({ cwd: dir, mode: 'branch', baseSha: 'deadbeef'.repeat(5) }),
    (error) => error instanceof SlopCheckError && /fetch-depth: 0/.test(error.message),
  );
});

test('outside a git repository it throws a readable error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slop-check-nogit-'));
  assert.throws(
    () => runCheck({ cwd: dir, mode: 'branch' }),
    (error) => error instanceof SlopCheckError && error.message === 'not inside a git repository',
  );
});

test('a repository with no commits throws a readable error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slop-check-empty-'));
  git(dir, 'init', '-q', '-b', 'main');
  assert.throws(
    () => runCheck({ cwd: dir, mode: 'branch' }),
    (error) => error instanceof SlopCheckError && /no commits yet/.test(error.message),
  );
});

test('all mode skips tracked directories such as submodules or symlinks', () => {
  const dir = makeRepo();
  mkdirSync(join(dir, 'real'));
  writeFileSync(join(dir, 'real', 'x.txt'), 'x\n');
  symlinkSync('real', join(dir, 'linked.js'));
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'chore: link');
  assert.doesNotThrow(() => runCheck({ cwd: dir, mode: 'all' }));
});

test('renamed files are not treated as new even when diff.renames is off', () => {
  const dir = makeRepo();
  commitFile(dir, 'old.js', 'debugger;\n');
  git(dir, 'config', 'diff.renames', 'false');
  git(dir, 'checkout', '-q', '-b', 'feature');
  git(dir, 'mv', 'old.js', 'new.js');
  git(dir, 'commit', '-q', '-m', 'refactor: rename');
  assert.deepEqual(runCheck({ cwd: dir, mode: 'branch' }).findings, []);
});

test('a shallow clone gets a hint about fetching full history', () => {
  const origin = makeRepo();
  commitFile(origin, 'b.js', 'const b = 2;\n');
  git(origin, 'checkout', '-q', '-b', 'feature');
  commitFile(origin, 'c.js', 'const c = 3;\n');
  commitFile(origin, 'd.js', 'const d = 4;\n');
  git(origin, 'checkout', '-q', 'main');
  commitFile(origin, 'e.js', 'const e = 5;\n');
  const clone = mkdtempSync(join(tmpdir(), 'slop-check-shallow-'));
  git(clone, 'clone', '-q', '--depth', '1', '--no-single-branch', `file://${origin}`, 'repo');
  const repo = join(clone, 'repo');
  git(repo, 'checkout', '-q', 'feature');
  assert.throws(
    () => runCheck({ cwd: repo, mode: 'branch' }),
    (error) => error instanceof SlopCheckError && /shallow/.test(error.message) && /fetch-depth: 0/.test(error.message),
  );
});

test('staged mode works in a repo with no commits yet', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slop-check-first-'));
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'a.js'), 'debugger;\n');
  git(dir, 'add', 'a.js');
  assert.deepEqual(ruleIds(runCheck({ cwd: dir, mode: 'staged' })), ['debug-leftover']);
});

test('branch mode flags empty Go if err != nil block and ignores handled errors', () => {
  const dir = makeRepo();
  git(dir, 'checkout', '-q', '-b', 'feature');
  commitFile(
    dir,
    'main.go',
    'package main\n\nfunc run() error {\n\tif err != nil {\n\t}\n\tif err != nil {\n\t\treturn err\n\t}\n\treturn nil\n}\n',
  );
  const result = runCheck({ cwd: dir, mode: 'branch' });
  assert.deepEqual(result.findings.map((f) => [f.rule, f.file, f.line]), [['empty-catch', 'main.go', 4]]);
});
