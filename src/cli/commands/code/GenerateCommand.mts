import { dirname, resolve } from "node:path";
import { buildCommand } from "@stricli/core";
import { Logger } from "../../../app/server/logging/Logger.js";
import type { CompileModuleProps } from "../../../ci/cli/CompileModule.mjs";
import { CompileModule } from "../../../ci/cli/CompileModule.mjs";

export const isDirectory = (path: string) => {
	const resolved = resolve(path);
	const parent = dirname(resolved);
	return resolved !== parent;
};

export const GenerateCommand = async () => {
	return async () =>
		buildCommand({
			loader: async () => {
				return async (flags: CompileModuleProps) => {
					Logger.debug({
						GenerateCommand: {
							flags,
						},
					});

					const compileModule = CompileModule(flags);
					const { value: sources } = await compileModule.next();
					Logger.log({
						GenerateCommand: {
							sources,
						},
					});

					const { value: artifacts } = await compileModule.next();
					Logger.log({
						GenerateCommand: {
							artifacts,
						},
					});

					if (artifacts !== undefined && artifacts.$kind === "artifacts") {
						const failedArtifacts = artifacts.artifacts.filter(
							(artifact) => artifact?.result.exitCode !== 0,
						);
						if (failedArtifacts.length > 0) {
							Logger.warn({
								GenerateCommand: {
									message: "Failed to generate artifacts",
									artifacts: failedArtifacts,
								},
							});
						}

						if (failedArtifacts.length === artifacts.artifacts.length) {
							throw new Error("All artifacts failed to generate");
						}
					}

					const { value: copies } = await compileModule.next();
					Logger.log({
						GenerateCommand: {
							copies,
						},
					});

					if (copies !== undefined && copies.$kind === "copies") {
						const failedCopies = copies.copies.filter(
							(copy) => copy?.result.exitCode !== 0,
						);
						if (failedCopies.length > 0) {
							Logger.warn({
								GenerateCommand: {
									message: "Failed to copy artifacts",
									copies: failedCopies,
								},
							});
						}

						if (failedCopies.length === copies.copies.length) {
							throw new Error("All copies failed to generate");
						}
					}

					const { done } = await compileModule.next();
					if (!done) {
						Logger.warn({
							GenerateCommand: {
								message: "CompileModule did not finish, please verify",
							},
						});

						throw new Error("CompileModule did not finish");
					}
				};
			},
			parameters: {
				flags: {
					root: {
						brief: "Root of sources to build",
						kind: "parsed",
						parse: (input: string) => {
							if (!isDirectory(input)) {
								throw new Error("Root must be a directory");
							}
							return input;
						},
						optional: false,
					},
					command: {
						brief: "Command to run",
						kind: "parsed",
						parse: String,
						optional: false,
					},
					artifact: {
						brief: "Artifact directory to copy",
						kind: "parsed",
						parse: (input: string) => {
							if (!isDirectory(input)) {
								throw new Error("Artifact must be a directory");
							}
							return input;
						},
						optional: false,
					},
					destination: {
						brief: "Destination directory to copy to",
						kind: "parsed",
						parse: (input: string) => {
							if (!isDirectory(input)) {
								throw new Error("Destination must be a directory");
							}
							return input;
						},
						optional: false,
					},
					clean: {
						brief: "Clean destination directory",
						kind: "boolean",
						optional: true,
					},
				},
			},
			docs: {
				brief: "Start a spork server",
			},
		});
};
