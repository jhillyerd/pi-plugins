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

## Layout

- `extensions/` — TypeScript or JavaScript Pi extensions
- `skills/` — skill directories containing `SKILL.md`
- `prompts/` — Markdown prompt templates
