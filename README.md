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

## Layout

- `extensions/` — TypeScript or JavaScript Pi extensions
- `skills/` — skill directories containing `SKILL.md`
- `prompts/` — Markdown prompt templates
