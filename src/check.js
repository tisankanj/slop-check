// Runs the enabled rules over one file's added lines.

import { getComment } from './comments.js';
import { getExtension, getLanguage, isExampleFile, isTestFile } from './languages.js';
import { RULES } from './rules.js';

// Very long lines are almost always minified or generated code.
export const MAX_LINE_LENGTH = 1000;
const IGNORE_MARKER = 'slop-check-ignore';

function commentOf(text, style) {
  return style === 'text' ? null : getComment(text, style);
}

function cleanBlockLine(text) {
  return text.trim().replace(/^\/?\*+/, '').replace(/\*\/\s*$/, '').trim();
}

// Works out which lines are comments, following /* ... */ blocks across lines so
// code examples inside doc comments are not read as code.
function readComments(lines, style) {
  const result = [];
  let inBlock = false;
  let previousNumber = null;

  for (const line of lines) {
    if (previousNumber !== null && line.number !== previousNumber + 1) {
      inBlock = false;
    }
    previousNumber = line.number;
    const trimmed = line.text.trim();

    if (inBlock) {
      result.push({ comment: cleanBlockLine(line.text), isCommentLine: true });
      inBlock = !trimmed.includes('*/');
      continue;
    }
    if (style === 'slash' && trimmed.startsWith('/*')) {
      inBlock = !trimmed.slice(2).includes('*/');
    }

    const comment = commentOf(line.text, style);
    const markers = { slash: ['//', '/*', '*'], hash: ['#'], dash: ['--'], text: [] }[style];
    const startsWithMarker = markers.some((marker) => trimmed.startsWith(marker));
    result.push({ comment, isCommentLine: comment !== null && startsWithMarker });
  }
  return result;
}

// Rules that read a block (a Ruby rescue with blank lines in it) need more than one
// line below. Only lines this change also added, in an unbroken run, are returned.
const LOOKAHEAD_LINES = 4;

function readLookahead(lines, comments, index) {
  const result = [];
  let expected = lines[index].number + 1;
  for (let i = index + 1; i < lines.length && result.length < LOOKAHEAD_LINES; i += 1) {
    if (lines[i].number !== expected) {
      break;
    }
    result.push({ number: lines[i].number, text: lines[i].text, ...comments[i] });
    expected += 1;
  }
  return result;
}

export function checkFile(file, enabled) {
  const language = getLanguage(file.path);
  if (!language) {
    return [];
  }

  const info = {
    path: file.path,
    style: language.style,
    extension: getExtension(file.path),
    isTest: isTestFile(file.path),
    isExample: isExampleFile(file.path),
  };
  const rules = RULES.filter((rule) => rule.scope === 'line' && enabled.has(rule.id) && rule.appliesTo(info));
  const comments = readComments(file.lines, info.style);
  const findings = [];

  for (let i = 0; i < file.lines.length; i += 1) {
    const line = file.lines[i];
    if (line.text.length > MAX_LINE_LENGTH || line.text.includes(IGNORE_MARKER)) {
      continue;
    }

    // A rule may only look ahead at a line this change also added, right below.
    const following = file.lines[i + 1];
    let next = null;
    if (following && following.number === line.number + 1) {
      next = { number: following.number, text: following.text, ...comments[i + 1] };
    }

    const previous = file.lines[i - 1];
    const previousIsComment = Boolean(previous && previous.number === line.number - 1 && comments[i - 1].isCommentLine);
    const ctx = { text: line.text, ...comments[i], previousIsComment, next, lookahead: readLookahead(file.lines, comments, i), file: info };
    for (const rule of rules) {
      if (rule.check(ctx)) {
        findings.push({ rule: rule.id, weight: rule.weight, message: rule.message, file: file.path, line: line.number });
      }
    }
  }

  return findings;
}

// Commit messages are plain text, so only rules that also read markdown apply,
// plus the commit-only rules.
const COMMIT_TEXT = { path: '', style: 'text', extension: '', isTest: false, isExample: false };

export function checkCommit(commit, enabled) {
  const rules = RULES.filter((rule) => {
    if (!enabled.has(rule.id)) {
      return false;
    }
    return rule.scope === 'commit' || rule.appliesTo(COMMIT_TEXT);
  });
  const findings = [];

  for (const text of commit.message.split('\n')) {
    if (text.includes(IGNORE_MARKER)) {
      continue;
    }
    const ctx = { text, comment: null, isCommentLine: false, previousIsComment: false, next: null, file: COMMIT_TEXT };
    for (const rule of rules) {
      if (rule.check(ctx)) {
        findings.push({ rule: rule.id, weight: rule.weight, message: rule.message, commit: commit.sha.slice(0, 7) });
      }
    }
  }

  return findings;
}
