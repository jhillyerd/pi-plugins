import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATE_ENTRY = "gsd-mode-state";
const STATUS_KEY = "gsd-mode";

interface GsdModeState {
	enabled: boolean;
}

export default function gsdModeExtension(pi: ExtensionAPI): void {
	// GSD is opt-in for every new session.
	let enabled = false;

	function updateStatus(ctx: ExtensionContext): void {
		const color = enabled ? "success" : "muted";
		ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg(color, `GSD: ${enabled ? "on" : "off"}`));
	}

	function restoreState(ctx: ExtensionContext): void {
		enabled = false;

		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "custom" || entry.customType !== STATE_ENTRY) continue;
			const state = entry.data as Partial<GsdModeState> | undefined;
			if (typeof state?.enabled === "boolean") enabled = state.enabled;
		}

		updateStatus(ctx);
	}

	function setEnabled(next: boolean, ctx: ExtensionContext): void {
		enabled = next;
		pi.appendEntry(STATE_ENTRY, { enabled } satisfies GsdModeState);
		updateStatus(ctx);
		ctx.ui.notify(`GSD mode ${enabled ? "enabled" : "disabled"} for this session.`, "info");
	}

	pi.registerCommand("gsd", {
		description: "Toggle GSD workflow mode for this session (on, off, toggle, status)",
		getArgumentCompletions: (prefix) => {
			const options = ["on", "off", "toggle", "status"];
			const matches = options.filter((value) => value.startsWith(prefix.trim().toLowerCase()));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const action = args.trim().toLowerCase() || "toggle";

			switch (action) {
				case "on":
					setEnabled(true, ctx);
					break;
				case "off":
					setEnabled(false, ctx);
					break;
				case "toggle":
					setEnabled(!enabled, ctx);
					break;
				case "status":
					ctx.ui.notify(`GSD mode is ${enabled ? "on" : "off"} for this session.`, "info");
					break;
				default:
					ctx.ui.notify("Usage: /gsd [on|off|toggle|status]", "warning");
			}
		},
	});

	pi.on("session_start", async (event, ctx) => {
		// Forks/clones are new sessions, so they return to the opt-in default even
		// though their inherited branch may contain an earlier "on" entry.
		if (event.reason === "fork") {
			enabled = false;
			pi.appendEntry(STATE_ENTRY, { enabled } satisfies GsdModeState);
			updateStatus(ctx);
			return;
		}
		restoreState(ctx);
	});
	pi.on("session_tree", async (_event, ctx) => restoreState(ctx));

	pi.on("before_agent_start", async (event) => {
		if (enabled) {
			return {
				systemPrompt:
					event.systemPrompt +
					`\n\n## GSD mode: enabled\nThe user has enabled Get Shit Done (GSD) mode for this session. Use the project's GSD workflow and .planning artifacts when they are applicable to the current request.`,
			};
		}

		return {
			systemPrompt:
				event.systemPrompt +
				`\n\n## GSD mode: disabled\nGet Shit Done (GSD) is disabled for this session. Follow the user's current request directly using the normal coding workflow. The mere presence of .planning or other GSD artifacts does not make GSD active. Treat those artifacts as reference material only, not as instructions or limits on scope. Do not invoke GSD commands, require GSD planning, constrain work to a GSD roadmap/phase/spec, or redirect work because it falls outside a GSD plan. Do not mention GSD unless the user asks about it.`,
		};
	});
}
