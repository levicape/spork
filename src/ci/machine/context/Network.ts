import { hostname } from "node:os";
import { executeSync } from "../Execute.js";
import { isBuildkite } from "../executor/Buildkite.js";
import { isGithubAction } from "../executor/GithubActions.js";
import { getEnv } from "./Environment.js";

export function getPublicIp(): string | undefined {
	for (const url of ["https://checkip.amazonaws.com", "https://ipinfo.io/ip"]) {
		const { error, stdout } = executeSync(["curl", url]);
		if (!error) {
			return stdout.trim();
		}
	}

	return;
}

export function getHostname(): string {
	if (isBuildkite) {
		const agent = getEnv("BUILDKITE_AGENT_NAME", false);
		if (agent) {
			return agent;
		}
	}

	if (isGithubAction) {
		const runner = getEnv("RUNNER_NAME", false);
		if (runner) {
			return runner;
		}
	}

	return hostname();
}
