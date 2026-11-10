# Pi plugins

Personal extensions, skills, and prompt templates for [Pi](https://github.com/earendil-works/pi-mono).

## Installation

Install the working tree as a local Pi package:

```sh
pi install ~/devel/pi-plugins
```

Pi records the local path in `~/.pi/agent/settings.json`, so edits are picked up after running `/reload`. Do not also copy these extensions into `~/.pi/agent/extensions`, or Pi will load them twice.

Pi transpiles TypeScript extensions with its bundled `jiti` loader. Neither `tsx` nor a globally installed TypeScript compiler is required at runtime.

## Development

Enter the Nix development shell to get Node.js, npm, TypeScript, the TypeScript language server, and Prettier:

```sh
nix develop
```

Format Nix files with `nix fmt`.

## Extensions

### GSD mode

`extensions/gsd-mode.ts` makes the Get Shit Done workflow opt-in per Pi session.

- `/gsd on` enables GSD.
- `/gsd off` disables GSD.
- `/gsd` toggles the current state.
- `/gsd status` reports the current state.

GSD defaults to off for new sessions, forks, and clones. The selected state persists across reloads and resumes within the same session.

### direnv

`extensions/direnv.ts` gives Pi's shell commands the same direnv environment an interactive shell would have, even when Pi was not started from the project directory (for example under agent orchestrators).

- On session start, and again after each agent run, it runs `direnv export json` in the session directory and applies the result to Pi's process environment. Loading does not block startup.
- Every `bash` tool call and `!`/`!!` command gets a one-line preamble that runs the direnv hook and wraps `cd`, `pushd`, and `popd`, so `cd ~/other/project && make` picks up that project's `.envrc`. The preamble is added in the spawn hook, so the model and transcript only see the original command.
- Cost: about 3–4 ms per command when the environment is already loaded, and about 120 ms for a command that `cd`s into a different project (with a warm nix-direnv cache).
- The footer shows `direnv: <dir>`, `direnv: blocked`, or `direnv: error`.
- Git worktrees inherit approval from the main checkout. direnv keys approvals on the `.envrc` path, so worktrees created by agents start out blocked. When an export fails, the extension runs `direnv allow` on a linked worktree's `.envrc` only if direnv reports it as not allowed (never denied), the main checkout has an `.envrc` at the same relative path with identical contents, and direnv reports the main checkout's `.envrc` as allowed. Any other blocked `.envrc` needs `direnv allow`.
- `/direnv` or `/direnv reload` reloads; `/direnv status` reports the current state.

This replaces the built-in `bash` tool, so it conflicts with other extensions that also override `bash`.

## Skills

Skill directories under `skills/` are a subset of
[tstack](https://github.com/t3dotgg/tstack) (Theo Browne's daily-driver agent
skills), vendored unmodified at commit `1085050`. `council` and `sol-loop` are
intentionally omitted:

| Skill | Say | What it does |
|---|---|---|
| `full-send` | "full send" | Takes a change to a merged PR with nobody watching: proves it, reviews it, files it, babysits it, merges it. |
| `full-stop` | "full stop" | Same as `full-send`, but stops when the PR is ready for you to merge. |
| `file-pr` | "file a PR" | Files a short PR that leads with the problem, not an inventory of changes. |
| `takeover` | "take over" | Finishes someone else's PR, branch, or agent thread, and keeps their credit. |
| `babysit-pr` | "babysit" | Watches a PR through CI and review bots, and fixes the real findings. |
| `modernize` | "modernize" | Rebases an old PR and decides if it should still exist. |
| `leaving-pr-comments` | (automatic) | Formats comments that an agent posts on your behalf. |

Some skills call others (`full-send` → `file-pr`, `babysit-pr`;
`full-stop` → `full-send`; `takeover` → `modernize`, `file-pr`, `babysit-pr`,
`leaving-pr-comments`), so they are kept together. Upstream `full-send` also
calls the omitted `sol-loop` for its review step; without it, that step falls
back to your agent's own review.

These skills require an authenticated [GitHub CLI](https://cli.github.com)
(`gh`), and `babysit-pr` additionally needs `python3`.

## Attribution

- `skills/` — © Theo Browne, MIT licensed; vendored from
  [t3dotgg/tstack](https://github.com/t3dotgg/tstack). See
  [`licenses/tstack-LICENSE`](licenses/tstack-LICENSE).

## Layout

- `extensions/` — TypeScript or JavaScript Pi extensions
- `skills/` — skill directories containing `SKILL.md`
- `prompts/` — Markdown prompt templates
- `licenses/` — third-party license texts
