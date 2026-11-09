import {
	createBashToolDefinition,
	createLocalBashOperations,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { basename, dirname } from "node:path";

/**
 * direnv integration for Pi's shell commands.
 *
 * Two layers work together:
 *
 * 1. Process environment: on session start (and after each agent run) the
 *    extension runs `direnv export json` in the session cwd and applies the diff
 *    to `process.env`, exactly like direnv's shell hook does for an interactive
 *    shell. Every spawned command inherits it, including DIRENV_DIFF, so the
 *    per-command check below is a ~1ms no-op inside the session's project.
 *
 * 2. Per-command preamble: every `bash` tool call and `!`/`!!` command gets a
 *    one-line preamble that re-runs the direnv hook and wraps cd/pushd/popd so
 *    that `cd ~/other/project && make` picks up that project's environment.
 *
 * The preamble is added inside the spawn hook, so the model and the session
 * transcript only ever see the original command.
 */

const STATUS_KEY = "direnv";
const EXPORT_TIMEOUT_MS = 120_000;

// Agent orchestrators create git worktrees without anyone around to run
// `direnv allow`, and direnv keys approvals on the .envrc's absolute path, so a
// fresh linked worktree starts out blocked even when its .envrc is identical to
// the main checkout's. This function inherits the main checkout's approval when
// all of the following hold:
//   - direnv reports the .envrc for <dir> as "not allowed" (never "denied")
//   - <dir> is inside a linked worktree and the .envrc lives inside it
//   - the main checkout has an .envrc at the same relative path with identical
//     contents (`cmp`), and direnv reports that one as allowed
// Approval state comes from `direnv status --json`, so direnv's own allow/deny
// bookkeeping is the source of truth. The directory is passed to `direnv allow`
// because direnv 2.37 rejects a path to a symlinked .envrc. Shared by the per-command preamble and the
// session-start load; it only runs after an export fails.
const INHERIT_FN = `__pi_direnv_inherit() {
	local dir="$1" re st envrc main_rc out top gitdir common main;
	command -v git >/dev/null 2>&1 || return 1;
	re='"foundRC": [{][^}]*"allowed": ([0-9]+),[^}]*"path": "([^"]*)"';
	st=$(builtin cd -P -- "$dir" 2>/dev/null && direnv status --json 2>/dev/null) || return 1;
	[[ $st =~ $re ]] || return 1;
	[ "\${BASH_REMATCH[1]}" = 1 ] || return 1;
	envrc="\${BASH_REMATCH[2]}";
	out=$(git -C "$dir" rev-parse --path-format=absolute --show-toplevel --git-dir --git-common-dir 2>/dev/null) || return 1;
	{ read -r top; read -r gitdir; read -r common; } <<<"$out";
	[ -n "$common" ] && [ "$gitdir" != "$common" ] || return 1;
	case "$envrc" in "$top"/*) ;; *) return 1 ;; esac;
	main="\${common%/.git}";
	[ "$main" != "$common" ] || return 1;
	main_rc="$main/\${envrc#"$top"/}";
	[ -f "$main_rc" ] && cmp -s -- "$envrc" "$main_rc" || return 1;
	st=$(builtin cd -P -- "\${main_rc%/*}" 2>/dev/null && direnv status --json 2>/dev/null) || return 1;
	[[ $st =~ $re ]] && [ "\${BASH_REMATCH[1]}" = 0 ] && [ "\${BASH_REMATCH[2]}" = "$main_rc" ] || return 1;
	direnv allow "\${envrc%/*}" >/dev/null 2>&1 || return 1;
	echo "pi-direnv: inherited direnv approval for $envrc from $main_rc" >&2;
}`.replace(/\n\s*/g, " ");

// Kept on a single line so bash error line numbers in user commands are only
// offset by one. direnv's stderr chatter ("loading", "export +FOO ...") is
// discarded (DIRENV_LOG_FORMAT= is not honored by direnv 2.37); a failed export,
// such as a blocked .envrc, is reported with a short message instead. Only one
// process (direnv) is forked when nothing changes.
const PREAMBLE =
	"if command -v direnv >/dev/null 2>&1; then " +
	`${INHERIT_FN}; ` +
	"__pi_direnv_hook() { local __pi_o __pi_rc; __pi_o=$(direnv export bash 2>/dev/null); __pi_rc=$?; " +
	'eval "$__pi_o"; ' +
	'if [ "$__pi_rc" -ne 0 ] && __pi_direnv_inherit "$PWD"; then ' +
	'__pi_o=$(direnv export bash 2>/dev/null); __pi_rc=$?; eval "$__pi_o"; fi; ' +
	'if [ "$__pi_rc" -ne 0 ]; then echo "pi-direnv: failed to load .envrc for $PWD (blocked? run: direnv allow)" >&2; fi; return 0; }; ' +
	'cd() { builtin cd "$@" && __pi_direnv_hook; }; ' +
	'pushd() { builtin pushd "$@" && __pi_direnv_hook; }; ' +
	'popd() { builtin popd "$@" && __pi_direnv_hook; }; ' +
	"__pi_direnv_hook; fi";

function withPreamble(command: string): string {
	return `${PREAMBLE}\n${command}`;
}

type DirenvState =
	| { kind: "unavailable" }
	| { kind: "idle" }
	| { kind: "loading" }
	| { kind: "loaded"; file: string; changed: number }
	| { kind: "blocked"; file?: string; message: string }
	| { kind: "error"; message: string };

export default function direnvExtension(pi: ExtensionAPI): void {
	let available: boolean | undefined;
	let state: DirenvState = { kind: "idle" };
	let ctxRef: ExtensionContext | undefined;
	let running: Promise<void> | undefined;
	let rerun = false;
	let lastNotified: string | undefined;

	function updateStatus(): void {
		const ctx = ctxRef;
		if (!ctx) return;
		const theme = ctx.ui.theme;
		switch (state.kind) {
			case "loading":
				ctx.ui.setStatus(STATUS_KEY, theme.fg("muted", "direnv: loading…"));
				break;
			case "loaded":
				ctx.ui.setStatus(STATUS_KEY, theme.fg("success", `direnv: ${basename(dirname(state.file))}`));
				break;
			case "blocked":
				ctx.ui.setStatus(STATUS_KEY, theme.fg("warning", "direnv: blocked"));
				break;
			case "error":
				ctx.ui.setStatus(STATUS_KEY, theme.fg("error", "direnv: error"));
				break;
			default:
				ctx.ui.setStatus(STATUS_KEY, undefined);
		}
	}

	function notifyOnce(key: string, message: string, level: "info" | "warning" | "error"): void {
		if (lastNotified === key) return;
		lastNotified = key;
		ctxRef?.ui.notify(message, level);
	}

	async function detect(): Promise<boolean> {
		if (available !== undefined) return available;
		try {
			const result = await pi.exec("direnv", ["version"], { timeout: 5000 });
			available = result.code === 0;
		} catch {
			available = false;
		}
		return available;
	}

	/** Apply a `direnv export json` diff to process.env. Returns non-DIRENV_* keys changed. */
	function applyExport(stdout: string): number {
		const text = stdout.trim();
		if (!text) return 0;
		const diff = JSON.parse(text) as Record<string, string | null>;
		let changed = 0;
		for (const [key, value] of Object.entries(diff)) {
			if (value === null) delete process.env[key];
			else process.env[key] = value;
			if (!key.startsWith("DIRENV_")) changed++;
		}
		return changed;
	}

	/** Try to inherit the main checkout's approval for a blocked worktree .envrc. */
	async function inheritApproval(cwd: string): Promise<string | undefined> {
		try {
			const result = await pi.exec("bash", ["-c", `${INHERIT_FN}\n__pi_direnv_inherit "$1"`, "pi-direnv", cwd], {
				cwd,
				timeout: 10_000,
			});
			return result.code === 0 ? result.stderr.trim().replace(/^pi-direnv: /, "") : undefined;
		} catch {
			return undefined;
		}
	}

	async function exportOnce(cwd: string, allowInherit = true): Promise<void> {
		const result = await pi.exec("direnv", ["export", "json"], { cwd, timeout: EXPORT_TIMEOUT_MS });
		const stderr = result.stderr.replace(/\x1b\[[0-9;]*m/g, "").trim();

		// direnv still emits DIRENV_* bookkeeping (watches, diff) on errors such
		// as a blocked .envrc; apply it so later checks behave like a shell would.
		let changed = 0;
		try {
			changed = applyExport(result.stdout);
		} catch (err) {
			state = { kind: "error", message: `failed to parse direnv output: ${String(err)}` };
			return;
		}

		if (result.killed) {
			state = { kind: "error", message: `direnv export timed out after ${EXPORT_TIMEOUT_MS / 1000}s` };
		} else if (result.code !== 0) {
			const message = (
				stderr
					.split("\n")
					.filter((line) => line.includes("error"))
					.pop() ?? stderr
			).replace(/^direnv: /, "");
			if (/blocked|not allowed/.test(message)) {
				const inherited = allowInherit ? await inheritApproval(cwd) : undefined;
				if (inherited) {
					ctxRef?.ui.notify(`direnv: ${inherited}`, "info");
					return exportOnce(cwd, false);
				}
				state = { kind: "blocked", file: process.env.DIRENV_FILE, message };
			} else {
				state = { kind: "error", message };
			}
		} else if (process.env.DIRENV_FILE) {
			const prev = state.kind === "loaded" && state.file === process.env.DIRENV_FILE ? state.changed : 0;
			state = { kind: "loaded", file: process.env.DIRENV_FILE, changed: changed || prev };
		} else {
			state = { kind: "idle" };
		}
	}

	/** Run the direnv hook for the session cwd. Concurrent calls coalesce into one re-run. */
	function refresh(ctx: ExtensionContext, showLoading = false): Promise<void> {
		ctxRef = ctx;
		if (running) {
			rerun = true;
			return running;
		}
		running = (async () => {
			if (!(await detect())) {
				state = { kind: "unavailable" };
				updateStatus();
				return;
			}
			do {
				rerun = false;
				if (showLoading && state.kind !== "loaded") {
					state = { kind: "loading" };
					updateStatus();
				}
				try {
					await exportOnce(ctxRef?.cwd ?? ctx.cwd);
				} catch (err) {
					state = { kind: "error", message: err instanceof Error ? err.message : String(err) };
				}
			} while (rerun);

			updateStatus();
			if (state.kind === "blocked") notifyOnce(`blocked:${state.file}`, `direnv: ${state.message}`, "warning");
			else if (state.kind === "error") notifyOnce(`error:${state.message}`, `direnv: ${state.message}`, "error");
			else lastNotified = undefined;
		})().finally(() => {
			running = undefined;
		});
		return running;
	}

	function describe(): string {
		switch (state.kind) {
			case "unavailable":
				return "direnv is not installed or not on PATH.";
			case "idle":
				return "No .envrc applies to the session directory.";
			case "loading":
				return "Loading direnv environment…";
			case "loaded":
				return `Loaded ${state.file} (${state.changed} variables).`;
			case "blocked":
			case "error":
				return state.message;
		}
	}

	// Replace the built-in bash tool with an identical one whose spawn hook adds
	// the direnv preamble. createBashToolDefinition keeps the built-in prompt
	// snippet, guidelines, and renderers; ctx.cwd is used at execution time.
	pi.registerTool(
		createBashToolDefinition(process.cwd(), {
			spawnHook: ({ command, cwd, env }) => ({
				command: available === false ? command : withPreamble(command),
				cwd,
				env,
			}),
		}),
	);

	pi.on("user_bash", () => {
		if (available === false) return undefined;
		const local = createLocalBashOperations();
		return {
			operations: {
				exec: (command, cwd, options) => local.exec(withPreamble(command), cwd, options),
			},
		};
	});

	pi.on("session_start", async (_event, ctx) => {
		// Don't block startup on a cold nix evaluation; commands issued before the
		// load finishes still get the environment through the preamble.
		void refresh(ctx, true);
	});

	// Pick up .envrc edits, `direnv allow`, and watched-file changes. When
	// nothing changed this is a cheap no-op export.
	pi.on("agent_end", async (_event, ctx) => {
		void refresh(ctx);
	});

	pi.on("session_shutdown", async () => {
		ctxRef = undefined;
	});

	pi.registerCommand("direnv", {
		description: "Reload or show the direnv environment for this session (reload, status)",
		getArgumentCompletions: (prefix) => {
			const options = ["reload", "status"];
			const matches = options.filter((value) => value.startsWith(prefix.trim().toLowerCase()));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const action = args.trim().toLowerCase() || "reload";
			if (action === "reload") {
				lastNotified = undefined;
				await refresh(ctx, true);
				ctx.ui.notify(describe(), state.kind === "error" ? "error" : "info");
			} else if (action === "status") {
				ctx.ui.notify(describe(), "info");
			} else {
				ctx.ui.notify("Usage: /direnv [reload|status]", "warning");
			}
		},
	});
}
