// Every rule slop-check knows. Each rule looks at one added line (or one line of a
// commit message) and answers yes or no. Weights: high 5, medium 3, low 1.

export const EM_DASH = String.fromCharCode(0x2014);

const HIGH = 5;
const MEDIUM = 3;
const LOW = 1;

const TYPESCRIPT_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts'];

const PLACEHOLDER_CODE = [
  /^(?:\.{3}|…)\s*(?:existing|rest of|remaining|other|previous|unchanged)\b/i,
  /^todo:?\s*implement(?:\s+(?:this|me|it|here))?\s*\.?$/i,
  /\byour code (?:goes )?here\b/i,
  /\bimplementation goes here\b/i,
];

const DEBUG_OUTPUT = [
  /^\s*debugger\s*;?\s*$/,
  /\bbreakpoint\(\)/,
  /\bpdb\.set_trace\(\)/,
  /\bconsole\.debug\(/,
  /\bconsole\.log\(\s*(['"`])[A-Za-z]\w*:\s*\1\s*,/,
  /\bconsole\.log\(\s*(['"`])[^'"`]*(?:\bdebug\b|\bhere\b|\btesting\b|\btest\b|>>>)/i,
];

const TYPESCRIPT_ESCAPES = [/\bas any\b/, /:\s*any\b(?![\w$])/];

const HISTORY_CHANGE = /^(?:updated|changed|modified|refactored|replaced|switched|moved|converted)\s+(?:to|from)\b/i;
const HISTORY_VERB = /^(?:updated|changed|modified|added|removed|replaced|refactored|fixed)\s+([a-z]\S*)(?:\s+(\S+))?/i;
const HISTORY_NEXT_WORDS = [
  'the', 'a', 'an', 'this', 'that', 'support', 'proper', 'missing', 'new', 'unused', 'extra',
  'redundant', 'old',
];

const NARRATION = /^(?:let me|now let[’']s|as requested|as you requested|i[’']ve|i have|i[’']ll)/i;

const DISCLAIMERS = [
  /\bin a real(?:[- ]world)? (?:app|application|project|scenario|system|implementation)\b/i,
  /\bfor (?:demo|demonstration|illustration|illustrative|example) purposes\b/i,
  /\bthis is a (?:simplified|basic|simple|naive|mock|placeholder)\b/i,
  /\byou (?:may|might) want to\b/i,
  /\bin production,? you (?:would|should|might)\b/i,
];

const PLACEHOLDER_VALUES = [
  /your[-_ ]?(?:api[-_ ]?key|secret|token|password)[-_ ]?here/i,
  /\bYOUR_[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD|ID|URL)\b/,
  /(['"`])<your[-_ ][^>]+>\1/i,
  /\bREPLACE_ME\b/,
  /(['"`])changeme\1/i,
];

// The copyright, registered and trademark signs count as pictographic in Unicode.
const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u;
const EMOJI_AT_START = /^(?![©®™])\p{Extended_Pictographic}/u;
const LOG_CALL = /\b(?:console\.(?:log|info|warn|error|debug)|logger\.\w+|log\.\w+|print|println|fmt\.Print\w*)\s*\(/;
const CONFIG_EXTENSIONS = ['yml', 'yaml', 'toml'];

const BUZZWORDS = [
  /\bdelv(?:e|es|ed|ing) into\b/i,
  /\btapestry\b/i,
  /\bit[’']s worth noting\b/i,
  /\bin today[’']s fast[- ]paced\b/i,
  /\bgame[- ]changer\b/i,
  /\bunleash(?:es|ed|ing)? the\b/i,
  /\belevate your\b/i,
  /\bembark(?:s|ed|ing)? on\b/i,
  /\btestament to\b/i,
  /\bever[- ]evolving\b/i,
  /\bcutting[- ]edge\b/i,
  /\bsupercharg(?:e|es|ed|ing)\b/i,
  /\bnavigat(?:e|ing) the complexities\b/i,
];

// `catch {}` without a name and `except ImportError: pass` are deliberate choices
// in human code, so only a named catch or a broad Python except counts.
const EMPTY_CATCH_SAME_LINE = /\bcatch\s*\([^)]*\)\s*\{\s*\}/;
const CATCH_OPENS_BLOCK = /\bcatch\s*\([^)]*\)\s*\{\s*$/;
const GO_EMPTY_ERR_SAME_LINE = /\bif\s+err\s*!=\s*nil\s*\{\s*\}/;
const GO_ERR_OPENS_BLOCK = /\bif\s+err\s*!=\s*nil\s*\{\s*$/;
const BROAD_EXCEPT = String.raw`except(?:\s+(?:Exception|BaseException)(?:\s+as\s+\w+)?)?`;
const PYTHON_EXCEPT_PASS = new RegExp(String.raw`^\s*${BROAD_EXCEPT}\s*:\s*pass\s*$`);
const PYTHON_BROAD_EXCEPT_OPENS = new RegExp(String.raw`^\s*${BROAD_EXCEPT}\s*:\s*$`);
const PYTHON_EXCEPT_OPENS = /^\s*except\b([^:]*):\s*$/;

const RETHROW_SAME_LINE = /\bcatch\s*\(\s*(\w+)\s*\)\s*\{\s*throw\s+(\w+)\s*;?\s*\}/;
const CATCH_WITH_NAME_OPENS = /\bcatch\s*\(\s*(\w+)\s*\)\s*\{\s*$/;

const AI_ATTRIBUTION = [
  /^co-authored-by:.*\b(?:claude|copilot|cursor|chatgpt|openai|gemini|codeium|windsurf|devin)\b/i,
  /^co-authored-by:.*noreply@anthropic\.com/i,
  /\bgenerated (?:with|by) \[?(?:claude|chatgpt|copilot|cursor|gemini|codex|windsurf)/i,
  /^(?:created|written|authored|powered) (?:with|by) \[?(?:claude|chatgpt|copilot|cursor|gemini|codex)/i,
];

const STOP_WORDS = ['the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'then', 'all', 'was'];
// Comments holding code (commented-out lines, examples) are not prose.
const CODE_IN_COMMENT = /[=(){}[\];`]/;
// Section banners such as `# ---- USERS ----` label a block, they do not restate a line.
const BANNER = /[─-╿]|[-=*#~_]{3,}|^[-=*#~_]{2,}.*[-=*#~_]{2,}$/;
const SCRIPT_FOLDERS = ['scripts', 'script', 'bin', 'tools', 'cli'];

// Code says some verbs with symbols, so `// increment the counter` matches `counter++`.
const SYMBOL_WORDS = [
  [/\+\+/, 'increment'],
  [/--/, 'decrement'],
  [/\bif\s*\(/, 'check'],
  [/[^=!<>]=[^=>]/, 'set'],
  [/\bnew\s/, 'create'],
];

function matchesAny(text, patterns) {
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

function isCodeFile(file) {
  return file.style !== 'text';
}

// Command line scripts print on purpose.
function isScriptFile(file) {
  const folders = file.path.split('/').slice(0, -1);
  return folders.some((folder) => SCRIPT_FOLDERS.includes(folder));
}

// Blank out string contents so `'pick: any'` is not read as a type.
function withoutStrings(text) {
  return text.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
}

function isHistoryComment(comment) {
  if (/^new:/i.test(comment) || HISTORY_CHANGE.test(comment)) {
    return true;
  }
  const match = HISTORY_VERB.exec(comment);
  if (!match) {
    return false;
  }
  const nextWords = [match[1], match[2] || ''].map((word) => word.toLowerCase());
  if (HISTORY_NEXT_WORDS.includes(nextWords[0])) {
    return true;
  }
  return nextWords[1].endsWith('ing');
}

function isEmptyCatch(ctx) {
  if (ctx.isCommentLine) {
    return false;
  }
  const code = withoutStrings(ctx.text);
  const nextLine = ctx.next ? ctx.next.text.trim() : '';
  if (ctx.file.extension === 'py') {
    return PYTHON_EXCEPT_PASS.test(code) || (PYTHON_BROAD_EXCEPT_OPENS.test(code) && nextLine === 'pass');
  }
  if (ctx.file.extension === 'go') {
    return GO_EMPTY_ERR_SAME_LINE.test(code) || (GO_ERR_OPENS_BLOCK.test(code) && nextLine === '}');
  }
  return EMPTY_CATCH_SAME_LINE.test(code) || (CATCH_OPENS_BLOCK.test(code) && nextLine.startsWith('}'));
}

function isCatchRethrow(ctx) {
  if (ctx.isCommentLine) {
    return false;
  }
  const code = withoutStrings(ctx.text);
  const nextLine = ctx.next ? ctx.next.text.trim() : '';
  if (ctx.file.extension === 'py') {
    const opens = PYTHON_EXCEPT_OPENS.exec(code);
    if (!opens) {
      return false;
    }
    const name = /\bas\s+(\w+)\s*$/.exec(opens[1]);
    return nextLine === 'raise' || (name !== null && nextLine === `raise ${name[1]}`);
  }
  const sameLine = RETHROW_SAME_LINE.exec(code);
  if (sameLine) {
    return sameLine[1] === sameLine[2];
  }
  const opens = CATCH_WITH_NAME_OPENS.exec(code);
  return opens !== null && new RegExp(`^throw\\s+${opens[1]}\\s*;?$`).test(nextLine);
}

function commentWords(comment) {
  const words = comment.toLowerCase().split(/[^a-z]+/);
  return words.filter((word) => word.length >= 3 && !STOP_WORDS.includes(word));
}

function codeWords(code) {
  const words = new Set();
  const identifiers = code.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/);
  for (const word of identifiers) {
    words.add(word);
  }
  for (const [pattern, word] of SYMBOL_WORDS) {
    if (pattern.test(code)) {
      words.add(word);
    }
  }
  return words;
}

// Go requires doc comments to start with the name they describe.
function isGoDocComment(ctx) {
  if (ctx.file.extension !== 'go') {
    return false;
  }
  const firstWord = ctx.comment.split(/\s+/)[0].replace(/\W/g, '');
  return firstWord !== '' && new RegExp(`\\b${firstWord}\\b`).test(ctx.next.text);
}

function isRestatingComment(ctx) {
  if (!ctx.isCommentLine || ctx.previousIsComment || ctx.next === null || ctx.next.isCommentLine) {
    return false;
  }
  if (CODE_IN_COMMENT.test(ctx.comment) || BANNER.test(ctx.comment) || isGoDocComment(ctx)) {
    return false;
  }
  // Single-word section labels such as `// render` are a common human habit.
  const words = commentWords(ctx.comment);
  if (words.length < 2 || words.length > 6) {
    return false;
  }
  const code = codeWords(withoutStrings(ctx.next.text));
  let matched = 0;
  for (const word of words) {
    if (code.has(word) || code.has(word.replace(/s$/, ''))) {
      matched += 1;
    }
  }
  return matched / words.length >= 0.75;
}

export const RULES = [
  {
    id: 'empty-catch',
    weight: HIGH,
    defaultOn: true,
    scope: 'line',
    message: 'Error swallowed. Log it, handle it, or let it throw.',
    appliesTo: isCodeFile,
    check: isEmptyCatch,
  },
  {
    id: 'placeholder-code',
    weight: HIGH,
    defaultOn: true,
    scope: 'line',
    message: 'Unfinished code pasted from a chat.',
    appliesTo: isCodeFile,
    check: (ctx) => ctx.comment !== null && matchesAny(ctx.comment, PLACEHOLDER_CODE),
  },
  {
    id: 'catch-rethrow',
    weight: MEDIUM,
    defaultOn: true,
    scope: 'line',
    message: 'This try/catch does nothing. Remove it.',
    appliesTo: isCodeFile,
    check: isCatchRethrow,
  },
  {
    id: 'debug-leftover',
    weight: MEDIUM,
    defaultOn: true,
    scope: 'line',
    message: 'Debug output left behind.',
    appliesTo: (file) => isCodeFile(file) && !file.isTest && !isScriptFile(file),
    check: (ctx) => !ctx.isCommentLine && matchesAny(ctx.text, DEBUG_OUTPUT),
  },
  {
    id: 'type-escape',
    weight: MEDIUM,
    defaultOn: true,
    scope: 'line',
    message: 'The type checker was silenced instead of satisfied.',
    appliesTo: (file) => !file.isTest && (TYPESCRIPT_EXTENSIONS.includes(file.extension) || file.extension === 'py'),
    check: (ctx) => {
      if (ctx.file.extension === 'py') {
        return ctx.comment !== null && /^type:\s*ignore\s*$/.test(ctx.comment);
      }
      if (ctx.comment !== null && ctx.comment.startsWith('@ts-ignore')) {
        return true;
      }
      return !ctx.isCommentLine && matchesAny(withoutStrings(ctx.text), TYPESCRIPT_ESCAPES);
    },
  },
  {
    id: 'change-history-comment',
    weight: MEDIUM,
    defaultOn: true,
    scope: 'line',
    message: 'Comments describe the code, not your edit. Put history in the commit.',
    appliesTo: isCodeFile,
    check: (ctx) => ctx.comment !== null && !ctx.previousIsComment && isHistoryComment(ctx.comment),
  },
  {
    id: 'narration-comment',
    weight: MEDIUM,
    defaultOn: true,
    scope: 'line',
    message: 'The AI is talking to you, not to the next reader.',
    appliesTo: isCodeFile,
    check: (ctx) => ctx.comment !== null && NARRATION.test(ctx.comment),
  },
  {
    id: 'disclaimer-comment',
    weight: MEDIUM,
    defaultOn: true,
    scope: 'line',
    message: 'If it matters in production, do it now or open an issue.',
    appliesTo: isCodeFile,
    check: (ctx) => ctx.comment !== null && matchesAny(ctx.comment, DISCLAIMERS),
  },
  {
    id: 'placeholder-value',
    weight: MEDIUM,
    defaultOn: true,
    scope: 'line',
    message: 'Placeholder value left in real code.',
    appliesTo: (file) => isCodeFile(file) && !file.isTest && !file.isExample,
    check: (ctx) => !ctx.isCommentLine && matchesAny(ctx.text, PLACEHOLDER_VALUES),
  },
  {
    id: 'restating-comment',
    weight: LOW,
    defaultOn: true,
    scope: 'line',
    message: 'Comment repeats the next line. Say why, or delete it.',
    appliesTo: isCodeFile,
    check: isRestatingComment,
  },
  {
    id: 'emoji-in-code',
    weight: LOW,
    defaultOn: true,
    scope: 'line',
    message: 'Emoji in code or logs.',
    appliesTo: (file) => isCodeFile(file) && !file.isTest && !CONFIG_EXTENSIONS.includes(file.extension),
    check: (ctx) => {
      if (ctx.comment !== null && EMOJI_AT_START.test(ctx.comment)) {
        return true;
      }
      return !ctx.isCommentLine && LOG_CALL.test(ctx.text) && EMOJI.test(ctx.text);
    },
  },
  {
    id: 'em-dash',
    weight: LOW,
    defaultOn: false,
    scope: 'line',
    message: 'The em dash is the best-known sign of unedited AI text.',
    appliesTo: () => true,
    check: (ctx) => ctx.text.includes(EM_DASH),
  },
  {
    id: 'buzzword',
    weight: LOW,
    defaultOn: true,
    scope: 'line',
    message: 'Marketing words where plain words would do.',
    appliesTo: () => true,
    check: (ctx) => {
      const text = ctx.file.style === 'text' ? ctx.text : ctx.comment;
      return text !== null && matchesAny(text, BUZZWORDS);
    },
  },
  {
    id: 'ai-attribution',
    weight: HIGH,
    defaultOn: false,
    scope: 'commit',
    message: 'Tool credit in the commit message.',
    appliesTo: () => false,
    check: (ctx) => matchesAny(ctx.text.trim(), AI_ATTRIBUTION),
  },
];
