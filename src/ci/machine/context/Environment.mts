import { appendFileSync } from "node:fs";
import { githubActions, isGithubAction } from "../executor/GithubActions.mjs";
import { localExecutor } from "../executor/Local.mjs";

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
