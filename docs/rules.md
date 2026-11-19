# slop-check rules

Every rule looks at one added line, sometimes with the line right below it, and
answers yes or no. Weights feed the score: high = 5, medium = 3, low = 1.

Turn any rule on or off in `.slopcheckrc.json`:

```json
{ "rules": { "em-dash": "on", "restating-comment": "off" } }
```

This file is full of bad examples on purpose, so the repo's own config ignores it.

---

## empty-catch

High. On by default.

Catches a named `catch` block with nothing in it, a broad Python `except`
(`except:`, `except Exception:`) that only says `pass`, or an empty Go
`if err != nil` block.

Why: the error disappears. When it fails in production there is no trace of it.

```js
// Bad
try { await save(user); } catch (error) {}

// Good
try {
  await save(user);
} catch (error) {
  logger.error('user.save_failed', { userId: user.id, error });
  throw error;
}
```

```go
// Bad
if err != nil {
}

// Good
if err != nil {
	return err
}
```

Not flagged: `catch {}` without a name and `except ImportError: pass`. Both are
usually a deliberate choice.

## placeholder-code

High. On by default.

Catches comments such as `// ... existing code ...`, `// ... rest of the code`,
`// TODO: implement`, `// your code here` and `# implementation goes here`.

Why: these come from pasting a chat answer that only showed part of the file. The
real code is missing.

```js
// Bad
export function saveUser(user) {
  // ... existing code ...
}
```

## catch-rethrow

Medium. On by default.

Catches a catch block whose only statement throws the same error again.

Why: it does nothing except add noise and a stack frame.

```js
// Bad
try { run(); } catch (e) { throw e; }

// Good
run();
```

```python
# Bad
try:
    run()
except ValueError as e:
    raise
```

## debug-leftover

Medium. On by default. Skips test files and files in `scripts/`, `script/`,
`bin/`, `tools/` and `cli/`.

Catches `debugger`, `breakpoint()`, `pdb.set_trace()`, `console.debug(...)`,
`console.log('label:', value)` and `console.log` calls whose text says `debug`,
`here`, `test` or `>>>`.

Why: debug output in a pull request means the change was not cleaned up.

```js
// Bad
console.log('user:', user);
console.log('here');
debugger;
```

## type-escape

Medium. On by default. TypeScript and Python files only. Skips test files.

Catches `as any`, `: any`, `// @ts-ignore` and Python `# type: ignore` with no
error code.

Why: the type checker found a problem and was told to be quiet.

```ts
// Bad
export function saveUser(user: any) {}
const id = (request as any).user.id;

// Good
export function saveUser(user: User) {}
```

`# type: ignore[attr-defined]` is not flagged: naming the error shows it was a
choice. `as unknown as T` is not flagged either.

## change-history-comment

Medium. On by default.

Catches comments that start by describing the edit: `// Updated to use ...`,
`// Changed from ...`, `// Added error handling`, `// Fixed the bug where ...`,
`// New: ...`.

Why: the next reader needs to know what the code does, not what it used to do.
That history belongs in the commit message.

```js
// Bad
// Updated to use the new cache API
const user = cache.get(id);

// Good
// The cache is filled at login, so this never hits the database.
const user = cache.get(id);
```

## narration-comment

Medium. On by default.

Catches comments where the assistant talks to the person who prompted it:
`// Let me ...`, `// I've added ...`, `// I'll ...`, `// As requested, ...`,
`// Now let's ...`, `// Step 1: ...`.

Why: the comment was written for the chat, not for the next reader.

```js
// Bad
// I've added a guard so this doesn't crash
if (!user) return null;
```

"Let's" and "here we" alone are not flagged. Human code uses them all the time.

## disclaimer-comment

Medium. On by default.

Catches comments such as `// In a real application you would ...`,
`// For demonstration purposes`, `// This is a simplified version`,
`// You may want to add ...`, `// In production you would ...`.

Why: this is production code. If the thing matters, do it now or open an issue.

```js
// Bad
// In a real application you would hash this password
user.password = input.password;
```

## placeholder-value

Medium. On by default. Skips markdown, test files and files such as
`.env.example` or `config.sample.json`.

Catches values like `your-api-key-here`, `YOUR_API_KEY`, `"<your-server-url>"`,
`REPLACE_ME` and `"changeme"` in code.

Why: a placeholder that reaches main is a bug waiting for the first request.

```js
// Bad
const apiKey = 'your-api-key-here';

// Good
const apiKey = process.env.PAYMENTS_API_KEY;
```

## restating-comment

Low. On by default.

Catches a short comment (2 to 6 words) whose words almost all appear in the line
right below it.

Why: it repeats the code. A comment should say why, or not be there.

```js
// Bad
// get user by id
const user = getUserById(id);

// Good
// Admins can open any profile, so skip the ownership check.
const user = getUserById(id);
```

Not flagged: one-word section labels, banners such as `// ---- users ----`,
commented-out code, Go doc comments that start with the name they describe, and
lines in the middle of a longer comment.

## emoji-in-code

Low. On by default. Skips test files and YAML or TOML config.

Catches an emoji at the start of a comment, or inside a logging call such as
`console.log`, `logger.info` or `print`.

Why: emoji in logs break log search and look out of place in production output.

```js
// Bad
console.log('✅ User saved');
// 🚀 fast path
```

Emoji used as data (`const icon = '🦄'`) is not flagged.

## buzzword

Low. On by default. Reads comments, markdown and commit messages.

Catches phrases such as "delve into", "tapestry", "it's worth noting",
"in today's fast-paced", "game-changer", "unleash the", "elevate your",
"embark on", "a testament to", "ever-evolving", "cutting-edge", "supercharge"
and "navigate the complexities".

Why: plain words are clearer and do not read like a brochure.

```text
Bad:  feat: supercharge user caching
Good: feat: cache users for 5 minutes
```

## em-dash

Low. **Off by default.**

Catches the em dash character (—) in code, markdown and commit messages. Points
stop at 5 per file and 5 per commit.

Why it is off: plenty of careful human writers use em dashes. In calibration,
every em dash in express, requests and ky was written by a person. Turn it on if
your team has decided not to use them.

## ai-attribution

High. **Off by default.**

Catches tool credit in commit messages, such as `Co-Authored-By: Claude`,
`Generated with Claude Code`, or Copilot, Cursor and ChatGPT credit lines.

Why it is off: many teams require this disclosure, and that is a fair policy.
Turn it on only if your team has decided commits carry no tool credit.
