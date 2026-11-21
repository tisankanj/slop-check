// GitHub Action entry: runs the check on a pull request, writes the job summary,
// and keeps one PR comment up to date with the score.

import { randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { loadConfig } from './config.js';
import { commitExists, findRepoRoot, SlopCheckError } from './git.js';
import { formatText } from './report.js';
import { runCheck } from './run.js';
import { badgeMarkdown } from './score.js';

const MARKER = '<!-- slop-check -->';
const ZERO_SHA = '0'.repeat(40);
// GitHub rejects comments over 65536 characters.
const MAX_REPORT_LENGTH = 60000;
// GitHub shows at most 10 warning annotations per step.
const MAX_ANNOTATIONS = 10;

function readInputs(env) {
  const maxScoreText = (env['INPUT_MAX-SCORE'] || '').trim();
  return {
    maxScore: maxScoreText === '' ? null : Number(maxScoreText),
    comment: (env.INPUT_COMMENT || 'true').trim() !== 'false',
    annotations: (env.INPUT_ANNOTATIONS || 'true').trim().toLowerCase() !== 'false',
    token: env['INPUT_GITHUB-TOKEN'] || '',
  };
}

function readEvent(env) {
  if (!env.GITHUB_EVENT_PATH) {
    return {};
  }
  return JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
}

function pickBaseSha(eventName, event, root) {
  if (event.pull_request) {
    return event.pull_request.base.sha;
  }
  // After a force push the old `before` commit is gone, so use the default base.
  if (eventName === 'push' && event.before && event.before !== ZERO_SHA && commitExists(root, event.before)) {
    return event.before;
  }
  return undefined;
}

// A fence longer than any backtick run in the text, so file names cannot close it.
function codeFence(text) {
  let longest = 0;
  for (const run of text.match(/`+/g) || []) {
    longest = Math.max(longest, run.length);
  }
  return '`'.repeat(Math.max(3, longest + 1));
}

// File names are printed in the log. Pausing workflow commands stops a file named
// `::error::x.js` from being run as a command.
function writeLog(text) {
  const token = randomUUID();
  process.stdout.write(`::stop-commands::${token}\n${text}::${token}::\n`);
}

function escapeMessage(value) {
  return String(value)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}

function escapeProperty(value) {
  return escapeMessage(value)
    .replaceAll(':', '%3A')
    .replaceAll(',', '%2C');
}

function byWeightThenLocation(a, b) {
  if (a.weight !== b.weight) {
    return b.weight - a.weight;
  }
  if (a.file !== b.file) {
    return a.file < b.file ? -1 : 1;
  }
  return a.line - b.line;
}

export function formatAnnotations(findings) {
  const fileFindings = findings.filter((finding) => finding.file && Number.isInteger(finding.line));
  fileFindings.sort(byWeightThenLocation);
  return fileFindings.slice(0, MAX_ANNOTATIONS).map((finding) => {
    const file = escapeProperty(finding.file);
    const title = escapeProperty(finding.rule);
    const message = escapeMessage(finding.message);
    return `::warning file=${file},line=${finding.line},title=${title}::${message}`;
  });
}

function writeAnnotations(findings) {
  for (const line of formatAnnotations(findings)) {
    process.stdout.write(`${line}\n`);
  }
}

function buildReport(result) {
  let text = formatText(result, { color: false });
  if (text.length > MAX_REPORT_LENGTH) {
    text = `${text.slice(0, MAX_REPORT_LENGTH)}\n... report cut short, run slop-check locally for the rest.\n`;
  }
  const fence = codeFence(text);
  return [
    MARKER,
    `### Slop score: ${result.score}/100 (${result.label})`,
    '',
    `${fence}text`,
    text.trimEnd(),
    fence,
    '',
    badgeMarkdown(result.score, result.color),
    '',
  ].join('\n');
}

async function upsertComment(env, inputs, prNumber, body, fetchFn) {
  const api = `${env.GITHUB_API_URL || 'https://api.github.com'}/repos/${env.GITHUB_REPOSITORY}`;
  const headers = {
    Authorization: `Bearer ${inputs.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'slop-check',
  };

  const list = await fetchFn(`${api}/issues/${prNumber}/comments?per_page=100`, { headers });
  if (!list.ok) {
    return list.status;
  }
  const comments = await list.json();
  const existing = comments.find((comment) => typeof comment.body === 'string' && comment.body.startsWith(MARKER));

  const request = existing
    ? { url: `${api}/issues/comments/${existing.id}`, method: 'PATCH' }
    : { url: `${api}/issues/${prNumber}/comments`, method: 'POST' };
  const response = await fetchFn(request.url, { method: request.method, headers, body: JSON.stringify({ body }) });
  return response.ok ? null : response.status;
}

export async function runAction({ env, fetchFn, cwd }) {
  const inputs = readInputs(env);
  const event = readEvent(env);

  let result;
  let config;
  try {
    const validMaxScore = Number.isInteger(inputs.maxScore) && inputs.maxScore >= 0 && inputs.maxScore <= 100;
    if (inputs.maxScore !== null && !validMaxScore) {
      throw new SlopCheckError('max-score must be a whole number from 0 to 100');
    }
    const root = findRepoRoot(cwd);
    config = loadConfig(root);
    for (const warning of config.warnings) {
      process.stdout.write(`::warning::slop-check: ${warning}\n`);
    }
    result = runCheck({ cwd, mode: 'branch', baseSha: pickBaseSha(env.GITHUB_EVENT_NAME, event, root), config });
  } catch (error) {
    if (!(error instanceof SlopCheckError)) {
      throw error;
    }
    process.stdout.write(`::error::slop-check: ${error.message}\n`);
    return { score: null, failed: true };
  }

  writeLog(formatText(result, { color: false }));
  if (inputs.annotations) {
    writeAnnotations(result.findings);
  }
  const report = buildReport(result);
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, report);
  }
  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, `score=${result.score}\n`);
  }

  const prNumber = event.pull_request ? event.pull_request.number : null;
  if (inputs.comment && prNumber && inputs.token) {
    let failedStatus;
    try {
      failedStatus = await upsertComment(env, inputs, prNumber, report, fetchFn);
    } catch (error) {
      failedStatus = error.message;
    }
    // Fork PRs get a read-only token. The job summary still has the full report.
    if (failedStatus) {
      process.stdout.write(`::warning::slop-check could not post the PR comment (${failedStatus}). The job summary has the report.\n`);
    }
  }

  const maxScore = inputs.maxScore === null ? config.maxScore : inputs.maxScore;
  const failed = maxScore !== null && result.score > maxScore;
  if (failed) {
    process.stdout.write(`::error::Slop score ${result.score} is above max-score ${maxScore}.\n`);
  }
  return { score: result.score, failed };
}

