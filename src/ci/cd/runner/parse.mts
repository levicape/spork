import { getWindowsExitReason } from "../../machine/context/Process.mjs";

export function unescapeGitHubAction(string: string) {
	return string
		.replace(/%25/g, "%")
		.replace(/%0D/g, "\r")
		.replace(/%0A/g, "\n");
}

export function getAnsi(color: string): string {
	switch (color) {
		case "red":
			return "\x1b[31m";
		case "green":
			return "\x1b[32m";
		case "yellow":
			return "\x1b[33m";
		case "blue":
			return "\x1b[34m";
		case "reset":
			return "\x1b[0m";
		case "gray":
			return "\x1b[90m";
		default:
			return "";
	}
}

export function stripAnsi(string: string): string {
	return string.replace(/\u001b\[\d+m/g, "");
}

export function escapeHtml(string: string): string {
	return string
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;")
		.replace(/`/g, "&#96;");
}

export function parseDuration(duration: string): number | undefined {
	const match = /(\d+\.\d+)(m?s)/.exec(duration);
	if (!match) {
		return undefined;
	}
	const [, value, unit] = match;
	return Number.parseFloat(value ?? "-1000") * (unit === "ms" ? 1 : 1000);
}

export function getExitCode(outcome: "pass" | "fail" | "cancel") {
	if (outcome === "pass") {
		return 0;
	}

	// On Buildkite, you can define a `soft_fail` property to differentiate
	// from failing tests and the runner itself failing.
	if (outcome === "fail") {
		return 2;
	}
	if (outcome === "cancel") {
		return 3;
	}
	return 1;
}

export { getWindowsExitReason };
