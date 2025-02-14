import { inspect } from "node:util";
import { env } from "std-env";
import { executeSync } from "../Execute.mjs";
import { getSecret } from "../Secret.mjs";
import {
	type MachineExecutor,
	getEnv,
	setEnv,
} from "../context/Environment.mjs";

export function getGithubApiUrl(): URL {
	return new URL(getEnv("GITHUB_API_URL", false) || "https://api.github.com");
}

export function getGithubUrl(): URL {
	return new URL(getEnv("GITHUB_SERVER_URL", false) || "https://github.com");
}

export function getGithubToken(): string | undefined {
	const cachedToken = getSecret("GITHUB_TOKEN", { required: false });

	if (typeof cachedToken === "string") {
		return cachedToken || undefined;
	}

	const { error, stdout } = executeSync(["gh", "auth", "token"]);
	const token = error ? "" : stdout.trim();

	setEnv("GITHUB_TOKEN", token);
	return token || undefined;
}

export const isGithubAction = getEnv("GITHUB_ACTIONS", false) === "true";

export class ExecutorGithubActions implements MachineExecutor {
	name = "GitHub Actions" as const;

	isActive() {
		return isGithubAction;
	}

	startGroup(title: string) {
		console.log(`::group::${title}`);
	}

	endGroup() {
		console.log("::endgroup::");
	}

	inspect(object: unknown) {
		console.log(
			inspect(object, {
				depth: null,
				compact: false,
				sorted: true,
			}),
		);
	}

	environment() {
		return env;
	}
}

export const githubActions = new ExecutorGithubActions();
