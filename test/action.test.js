import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAction } from '../src/action.js';
import { commitFile, git, makeDirtyBranch } from './helpers.js';

const MARKER = '<!-- slop-check -->';

function setup({ eventName = 'pull_request', event, inputs = {} } = {}) {
  const repo = makeDirtyBranch();
  const temp = mkdtempSync(join(tmpdir(), 'slop-check-action-'));
  const baseSha = git(repo, 'rev-parse', 'main').trim();
  const eventPath = join(temp, 'event.json');
  writeFileSync(eventPath, JSON.stringify(event || { pull_request: { number: 7, base: { sha: baseSha } } }));
  writeFileSync(join(temp, 'summary.md'), '');
  writeFileSync(join(temp, 'output.txt'), '');
  const env = {
    GITHUB_EVENT_NAME: eventName,
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_STEP_SUMMARY: join(temp, 'summary.md'),
    GITHUB_OUTPUT: join(temp, 'output.txt'),
    GITHUB_REPOSITORY: 'someone/app',
    GITHUB_API_URL: 'https://api.github.test',
    'INPUT_MAX-SCORE': '',
    INPUT_COMMENT: 'true',
    'INPUT_GITHUB-TOKEN': 'test-token',
    ...inputs,
  };
  return { repo, temp, env, baseSha };
}

// Records every request and answers from a list of canned responses, in order.
function fakeFetch(responses) {
  const calls = [];
  const fetchFn = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    const next = responses.shift() || { status: 200, json: [] };
    return { ok: next.status < 300, status: next.status, headers: { get: () => next.link || null }, json: async () => next.json };
  };
  return { calls, fetchFn };
}

function quietly(fn) {
  const write = process.stdout.write;
  process.stdout.write = () => true;
  return fn().finally(() => {
    process.stdout.write = write;
  });
}

test('pull_request uses the PR base sha and writes summary and output', async () => {
  const { repo, env, baseSha } = setup();
  const { fetchFn } = fakeFetch([{ status: 200, json: [] }, { status: 201, json: {} }]);
  const result = await quietly(() => runAction({ env, fetchFn, cwd: repo }));
  assert.deepEqual(result, { score: 25, failed: false });
  const summary = readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8');
  assert.match(summary, /Slop score: 25\/100/);
  assert.match(summary, /empty-catch/);
  assert.ok(summary.includes(baseSha.slice(0, 7)));
  assert.equal(readFileSync(env.GITHUB_OUTPUT, 'utf8'), 'score=25\n');
});

test('creates a marked comment when none exists', async () => {
  const { repo, env } = setup();
  const { calls, fetchFn } = fakeFetch([{ status: 200, json: [{ id: 1, body: 'hello' }] }, { status: 201, json: {} }]);
  await quietly(() => runAction({ env, fetchFn, cwd: repo }));
  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ['GET', 'https://api.github.test/repos/someone/app/issues/7/comments?per_page=100'],
    ['POST', 'https://api.github.test/repos/someone/app/issues/7/comments'],
  ]);
  assert.ok(calls[1].body.body.startsWith(MARKER));
});

test('updates the existing marked comment', async () => {
  const { repo, env } = setup();
  const { calls, fetchFn } = fakeFetch([{ status: 200, json: [{ id: 42, body: `${MARKER}\nold` }] }, { status: 200, json: {} }]);
  await quietly(() => runAction({ env, fetchFn, cwd: repo }));
  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ['GET', 'https://api.github.test/repos/someone/app/issues/7/comments?per_page=100'],
    ['PATCH', 'https://api.github.test/repos/someone/app/issues/comments/42'],
  ]);
});

test('a 403 on the comment warns and does not fail', async () => {
  const { repo, env } = setup();
  const { fetchFn } = fakeFetch([{ status: 200, json: [] }, { status: 403, json: { message: 'Resource not accessible by integration' } }]);
  const lines = [];
  const write = process.stdout.write;
  process.stdout.write = (text) => lines.push(String(text));
  try {
    const result = await runAction({ env, fetchFn, cwd: repo });
    assert.equal(result.failed, false);
  } finally {
    process.stdout.write = write;
  }
  assert.ok(lines.join('').includes('::warning::'));
});

test('comment: false makes no requests', async () => {
  const { repo, env } = setup({ inputs: { INPUT_COMMENT: 'false' } });
  const { calls, fetchFn } = fakeFetch([]);
  await quietly(() => runAction({ env, fetchFn, cwd: repo }));
  assert.equal(calls.length, 0);
});

test('a score above max-score fails', async () => {
  const { repo, env } = setup({ inputs: { 'INPUT_MAX-SCORE': '10', INPUT_COMMENT: 'false' } });
  const result = await quietly(() => runAction({ env, fetchFn: fakeFetch([]).fetchFn, cwd: repo }));
  assert.deepEqual(result, { score: 25, failed: true });
});

test('push with an all-zero before falls back to the default base', async () => {
  const event = { before: '0'.repeat(40), after: 'x' };
  const { repo, env } = setup({ eventName: 'push', event, inputs: { INPUT_COMMENT: 'false' } });
  const result = await quietly(() => runAction({ env, fetchFn: fakeFetch([]).fetchFn, cwd: repo }));
  assert.equal(result.score, 25);
  assert.match(readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8'), /changes since main/);
});

test('a missing base commit fails with a clear error', async () => {
  const event = { pull_request: { number: 7, base: { sha: 'deadbeef'.repeat(5) } } };
  const { repo, env } = setup({ event, inputs: { INPUT_COMMENT: 'false' } });
  const lines = [];
  const write = process.stdout.write;
  process.stdout.write = (text) => lines.push(String(text));
  let result;
  try {
    result = await runAction({ env, fetchFn: fakeFetch([]).fetchFn, cwd: repo });
  } finally {
    process.stdout.write = write;
  }
  assert.equal(result.failed, true);
  assert.match(lines.join(''), /::error::.*fetch-depth: 0/);
});

test('an invalid max-score fails with a clear error', async () => {
  const { repo, env } = setup({ inputs: { 'INPUT_MAX-SCORE': 'high', INPUT_COMMENT: 'false' } });
  const lines = [];
  const write = process.stdout.write;
  process.stdout.write = (text) => lines.push(String(text));
  let result;
  try {
    result = await runAction({ env, fetchFn: fakeFetch([]).fetchFn, cwd: repo });
  } finally {
    process.stdout.write = write;
  }
  assert.equal(result.failed, true);
  assert.match(lines.join(''), /::error::.*max-score must be a whole number from 0 to 100/);
});

function captureStdout(fn) {
  const lines = [];
  const write = process.stdout.write;
  process.stdout.write = (text) => lines.push(String(text));
  return fn().finally(() => {
    process.stdout.write = write;
  }).then((result) => ({ result, output: lines.join('') }));
}

test('maxScore from .slopcheckrc.json is used when the input is empty', async () => {
  const { repo, env } = setup({ inputs: { INPUT_COMMENT: 'false' } });
  commitFile(repo, '.slopcheckrc.json', '{ "maxScore": 10, "rules": { "nope": "off" } }');
  const { result, output } = await captureStdout(() => runAction({ env, fetchFn: fakeFetch([]).fetchFn, cwd: repo }));
  assert.equal(result.failed, true);
  assert.match(output, /::warning::slop-check: unknown rule "nope"/);
});

test('push after a force push falls back to the default base', async () => {
  const event = { before: 'deadbeef'.repeat(5), after: 'x' };
  const { repo, env } = setup({ eventName: 'push', event, inputs: { INPUT_COMMENT: 'false' } });
  const { result } = await captureStdout(() => runAction({ env, fetchFn: fakeFetch([]).fetchFn, cwd: repo }));
  assert.deepEqual(result, { score: 25, failed: false });
});

test('file names cannot run workflow commands in the log', async () => {
  const { repo, env } = setup({ inputs: { INPUT_COMMENT: 'false' } });
  commitFile(repo, '::error::x.js', 'debugger;\n');
  const { output } = await captureStdout(() => runAction({ env, fetchFn: fakeFetch([]).fetchFn, cwd: repo }));
  const stop = /^::stop-commands::(\S+)$/m.exec(output);
  assert.ok(stop, output);
  const resume = output.indexOf(`::${stop[1]}::`);
  assert.ok(output.indexOf('::error::x.js') > stop.index && output.indexOf('::error::x.js') < resume);
});

test('a file name with backticks cannot close the report code block', async () => {
  const { repo, env } = setup({ inputs: { INPUT_COMMENT: 'false' } });
  commitFile(repo, 'a```b.js', 'debugger;\n');
  await captureStdout(() => runAction({ env, fetchFn: fakeFetch([]).fetchFn, cwd: repo }));
  const summary = readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8');
  assert.match(summary, /^````+text$/m);
});

test('the action entry runs even when its path goes through a symlink', () => {
  const { repo, env } = setup({ inputs: { INPUT_COMMENT: 'false' } });
  const root = fileURLToPath(new URL('..', import.meta.url));
  const main = /^\s*main:\s*(\S+)/m.exec(readFileSync(join(root, 'action.yml'), 'utf8'))[1];
  const linkDir = mkdtempSync(join(tmpdir(), 'slop-check-link-'));
  symlinkSync(root, join(linkDir, 'action'));
  spawnSync(process.execPath, [join(linkDir, 'action', main)], {
    env: { ...process.env, ...env, GITHUB_WORKSPACE: repo },
    encoding: 'utf8',
  });
  assert.equal(readFileSync(env.GITHUB_OUTPUT, 'utf8'), 'score=25\n');
});

for (const scenario of ['found', 'missing', 'rate limited', 'foreign host', 'cycle']) {
  test(`paginated comments: ${scenario}`, async () => {
    const { repo, env } = setup();
    const first = `${env.GITHUB_API_URL}/repos/someone/app/issues/7/comments?per_page=100`;
    const second = `${first}&page=2`;
    const next = scenario === 'foreign host' ? 'https://elsewhere.test/comments' : second;
    const responses = [
      { status: 200, json: [{ id: 1, body: 'unrelated' }], link: `<${next}>; rel="next"` },
      { status: scenario === 'rate limited' ? 429 : 200,
        json: scenario === 'found' ? [{ id: 42, body: `${MARKER} old` }] : [],
        link: scenario === 'cycle' ? `<${first}>; rel="next"` : null },
      { status: 200, json: {} },
    ];
    const { calls, fetchFn } = fakeFetch(responses);
    await quietly(() => runAction({ env, fetchFn, cwd: repo }));
    const expected = [['GET', first]];
    if (scenario !== 'foreign host') expected.push(['GET', second]);
    if (scenario === 'found') expected.push(['PATCH', `${env.GITHUB_API_URL}/repos/someone/app/issues/comments/42`]);
    if (scenario === 'missing') expected.push(['POST', first.split('?')[0]]);
    assert.deepEqual(calls.map(({ method, url }) => [method, url]), expected);
  });
}
