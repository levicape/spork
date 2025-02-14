import { appendFileSync } from "node:fs";
import {
	getBranch,
	getCommit,
	getCommitMessage,
	getMainBranch,
	getPullRequest,
	getRepository,
	getTargetBranch,
	isFork,
	isMainBranch,
	isMergeQueue,
	isPullRequest,
} from "../code/Git.mjs";
import { githubActions, isGithubAction } from "../executor/GithubActions.mjs";
import { localExecutor } from "../executor/Local.mjs";
import { getTailscaleIp } from "../executor/Tailscale.mjs";
import { getBuildId, getBuildLabel, getBuildUrl } from "./Build.mjs";
import { getUsername, isCI } from "./Compute.mjs";
import { tmpdir } from "./Filesystem.mjs";
import { getHostname, getPublicIp } from "./Network.mjs";
import {
	getAbi,
	getAbiVersion,
	getArch,
	getKernel,
	getOs,
	isLinux,
} from "./System.mjs";
import { getDistro, getDistroVersion } from "./Version.mjs";

export const MachineContextEnvironmentExecutor = [
	githubActions,
	localExecutor,
].find((executor) => executor.isActive);

export interface MachineExecutor {
	name: string;
	isActive(): boolean;
	startGroup(title: string): void;
	endGroup(): void;
	inspect(object: unknown): void;
	environment(): Record<string, unknown>;
}
// & MachineCodeGitExecutor

export function getEnv<Required extends boolean>(
	name: string | number,
	required: Required = true as Required,
): Required extends true ? string : string | undefined {
	const value = process.env[name];

	if (required && !value) {
		throw new Error(`Environment variable is missing: ${name}`);
	}

	return value as Required extends true ? string : string | undefined;
}

export function setEnv(name: string, value: string | undefined) {
	process.env[name] = value;

	if (isGithubAction && !/^GITHUB_/i.test(name)) {
		const envFilePath = process.env.GITHUB_ENV;
		if (envFilePath) {
			const delimeter = Math.random().toString(36).substring(2, 15);
			const content = `${name}<<${delimeter}\n${value}\n${delimeter}\n`;
			appendFileSync(envFilePath, content);
		}
	}
}

export async function startGroup(title: string, fn: () => unknown) {
	MachineContextEnvironmentExecutor?.startGroup(title);

	if (typeof fn === "function") {
		let result: unknown;
		try {
			result = fn();
		} finally {
		}

		if (result instanceof Promise) {
			try {
				return await result;
			} finally {
				// biome-ignore lint/correctness/noUnsafeFinally:
				return endGroup();
			}
		}
		endGroup();
	}

	return;
}

export function endGroup() {
	MachineContextEnvironmentExecutor?.endGroup();
}

export function print(object: unknown) {
	MachineContextEnvironmentExecutor?.inspect(object);
}

export function printEnvironment() {
	startGroup("Machine", () => {
		print({
			"Operating System": getOs(),
			Architecture: getArch(),
			Kernel: getKernel(),
			Linux: isLinux
				? {
						ABI: getAbi(),
						"ABI Version": getAbiVersion(),
					}
				: undefined,
			Distro: getDistro(),
			"Distro Version": getDistroVersion(),
			Hostname: getHostname(),
			CI: isCI
				? {
						"Tailscale IP": getTailscaleIp(),
						"Public IP": getPublicIp(),
					}
				: undefined,
			Username: getUsername(),
			"Working Directory": process.cwd(),
			"Temporary Directory": tmpdir(),
		});
	});

	if (isCI) {
		startGroup("Environment", () => {
			for (const [key, value] of Object.entries(process.env)) {
				console.log(`${key}:`, value);
			}
		});
	}

	startGroup("Repository", () => {
		print({
			Repository: getRepository(),
			Commit: getCommit(),
			"Commit Message": getCommitMessage(),
			Branch: getBranch(),
			"Main Branch": getMainBranch(),
			"Is Fork": isFork(),
			"Is Merge Queue": isMergeQueue(),
			"Is Main Branch": isMainBranch(),
			"Is Pull Request": isPullRequest(),
			"Pull Request": isPullRequest() ? getPullRequest() : undefined,
			"Target Branch": isPullRequest() ? getTargetBranch() : undefined,
		});
	});

	if (isCI) {
		startGroup("CI", () => {
			print({
				CI: {
					"Build ID": getBuildId(),
					"Build Label": getBuildLabel(),
					"Build URL": getBuildUrl(),
				},
				Environment: MachineContextEnvironmentExecutor?.environment(),
			});
		});
	}
}
