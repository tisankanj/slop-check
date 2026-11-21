# slop-check

[![slop score](https://img.shields.io/badge/slop_score-0-brightgreen)](https://github.com/tisankanj/slop-check)
[![ci](https://github.com/tisankanj/slop-check/actions/workflows/ci.yml/badge.svg)](https://github.com/tisankanj/slop-check/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@tisankan/slop-check)](https://www.npmjs.com/package/@tisankan/slop-check)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Catch AI slop in your diff before your reviewer does.**

AI writes code fast, and it leaves things behind: swallowed errors,
`// ... existing code ...` pasted from a chat, comments that narrate the edit,
`as any`, debug logs. slop-check reads only the lines you added, flags those
leftovers with a one-line reason, and gives the change one number: the slop score.

![slop-check output on a 16-line change: 10 findings, slop score 100, Pure slop](docs/demo.png)

<details>
<summary>The 16 lines behind this screenshot</summary>

```ts
import { db } from './db';

// Get user by id
export async function getUserById(id: string) {
  try {
    const user = await db.users.find(id);
    console.log('user:', user);
    return user;
  } catch (error) {}
}

// Updated to use the new cache API
export function saveUser(user: any) {
  // ... existing code ...
  console.log('✅ User saved');
}

// In a real application you would rotate this key
const apiKey = 'your-api-key-here';
```

Commit message: `feat: supercharge user caching`. <!-- slop-check-ignore -->

</details>

## Try it

Run it inside any git repo, on any branch. No config, no dependencies, no API keys.

```bash
npx @tisankan/slop-check
```

It compares your branch with `main` (or `master`, or `origin/HEAD`) and includes
uncommitted changes to tracked files. New files count once you `git add` them.
Needs Node.js 20 or newer. To install it once: `npm i -g @tisankan/slop-check`,
then run `slop-check`.

```bash
npx @tisankan/slop-check --all       # every tracked file
npx @tisankan/slop-check --staged    # staged changes, for a git hook
npx @tisankan/slop-check develop     # compare with another base
```

## What's your repo's slop score?

```bash
npx @tisankan/slop-check --all --badge
```

That prints a badge for your README, like the one at the top of this page:

```markdown
[![slop score](https://img.shields.io/badge/slop_score-0-brightgreen)](https://github.com/tisankanj/slop-check)
```

| Score | Label |
| --- | --- |
| 0 | Hand-written |
| 1 to 10 | Mostly human |
| 11 to 30 | Needs a once-over |
| 31 to 60 | Sloppy |
| 61 to 100 | Pure slop |

The score is slop points per 100 added lines, capped at 100. A high finding is
worth 5 points, a medium one 3, a low one 1. Changes under 20 lines count as 20,
so one small slip does not score like a disaster.

## Check every pull request

```yaml
# .github/workflows/slop-check.yml
name: slop-check
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  slop-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: tisankanj/slop-check@v1
        with:
          max-score: 30
```

The action writes the report to the job summary, prints inline annotations on
the diff, and keeps one comment on the pull request up to date.

| Input | Default | What it does |
| --- | --- | --- |
| `max-score` | empty | Fail the job when the score is above this number. Empty never fails. |
| `comment` | `true` | Post one PR comment and update it on every push. |
| `annotations` | `true` | Show findings as inline annotations on the diff. |
| `github-token` | `github.token` | Token used for the comment. |

Output: `score`. Pull requests from forks get a read-only token, so they get the
job summary but no comment.

## Rules

| Rule | Weight | Catches |
| --- | --- | --- |
| `empty-catch` | high | `catch (e) {}` and `except: pass` |
| `placeholder-code` | high | `// ... existing code ...`, `// TODO: implement` |
| `catch-rethrow` | medium | A catch block that only rethrows |
| `debug-leftover` | medium | `debugger`, `console.log('user:', user)`, `breakpoint()` |
| `type-escape` | medium | `as any`, `: any`, `@ts-ignore`, bare `# type: ignore` |
| `change-history-comment` | medium | `// Updated to use ...`, `// Added error handling` |
| `narration-comment` | medium | `// Let me ...`, `// I've added ...`, `// As requested` |
| `disclaimer-comment` | medium | `// In a real application you would ...` |
| `placeholder-value` | medium | `'your-api-key-here'`, `YOUR_API_KEY`, `REPLACE_ME` |
| `restating-comment` | low | `// get user by id` above `getUserById(id)` |
| `emoji-in-code` | low | Emoji in log calls and at the start of comments |
| `buzzword` | low | Brochure phrases in comments, docs and commit messages |
| `em-dash` | low | The em dash character. **Off by default.** |
| `ai-attribution` | high | Tool credit lines in commits. **Off by default.** |

Every rule, with bad and good examples: [docs/rules.md](docs/rules.md).

## Quiet on human code

Before release, every rule ran against express, requests, cobra and ky: about
83,000 lines of code written by people. Any rule that fired on normal human code
more than once in ten was narrowed or switched off. On those four repos the
default rules now report 23 findings in total, almost all of them real restating
comments and real `as any` casts.

If slop-check flags something a careful person wrote on purpose, that is a bug.
Please [open an issue](https://github.com/tisankanj/slop-check/issues) with the line.

## Anti-slop, not anti-AI

slop-check does not try to guess whether AI wrote your code, and it does not care.
It flags leftovers a reviewer would ask you to remove, whoever typed them. That is
also why AI credit lines in commits are off by default: many teams require them.

## Config

Optional `.slopcheckrc.json` in the repo root. Command line flags win over it.

```json
{
  "rules": { "em-dash": "on", "restating-comment": "off" },
  "ignore": ["docs/legacy/**", "**/*.generated.ts"],
  "maxScore": 30
}
```

`ignore` takes `**`, `*` and `?`. Dependencies, build output, lockfiles and
minified files are skipped already. Add `slop-check-ignore` anywhere on a line to
skip that line.

## Git hook

```bash
# .git/hooks/pre-commit
npx --yes @tisankan/slop-check --staged --max-score 30
```

## All options

```text
slop-check [base]          check the current branch against base
  --staged                 check staged changes only
  --all                    check every tracked file
  --json                   print JSON instead of text
  --badge                  print a README badge for this score
  --max-score <n>          exit 1 if the score is above n
  --list-rules             print every rule with its weight and status
  --no-color               plain output (NO_COLOR is also respected)
  -h, --help               show help
  -v, --version            show the version
```

Exit codes: `0` done, `1` score above `--max-score`, `2` usage or git error.

`--json` prints `{ score, label, base, mode, files, addedLines, findings }`. Each
finding has `rule`, `weight`, `message`, and either `file` and `line` or `commit`.

## Contributing

False positives are the most useful thing you can report.
[CONTRIBUTING.md](CONTRIBUTING.md) explains how to run the tests and add a rule,
and there are [good first issues](https://github.com/tisankanj/slop-check/labels/good%20first%20issue)
ready to pick up.

A new rule is one object in [src/rules.js](src/rules.js), a test file with
"flags" and "does not flag" cases, a section in [docs/rules.md](docs/rules.md), and
a run against a few human-written repos to show it stays quiet. `node --test` runs
everything. Zero dependencies is on purpose; please keep it that way.

This repo checks itself on every pull request with `max-score: 0`. Its test
fixtures and `docs/rules.md` are full of slop on purpose, so
[.slopcheckrc.json](.slopcheckrc.json) ignores them.

## License

[MIT](LICENSE). Made by [Tisankan Jeyakumar](https://github.com/tisankanj).
