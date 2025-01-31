import { dirname, resolve } from "node:path";
import { buildCommand } from "@stricli/core";
import VError from "verror";
import type { CompileModuleProps } from "../../../ci/cli/CompileModule.mjs";
import { CompileModule } from "../../../ci/cli/CompileModule.mjs";
import type { SporkCliAppProps } from "../../SporkCliApp.mjs";

export const isDirectory = (path: string) => {
	const resolved = resolve(path);
	const parent = dirname(resolved);
	return resolved !== parent;
};

export const GenerateCommand = async (props: SporkCliAppProps) => {
	return async () =>
		buildCommand({
			loader: async () => {
				return async (flags: CompileModuleProps) => {
					const logger = props.service.logger.withContext({
						parent: ["code"],
						command: "gen",
					});

					logger
						.withMetadata({
							flags,
						})
						.debug("Generating artifacts");

					const compileModule = CompileModule(flags);
					const { value: sources } = await compileModule.next();
					logger
						.withMetadata({
							sources,
						})
						.info("Compiling sources");

					const { value: artifacts } = await compileModule.next();
					logger
						.withMetadata({
							artifacts,
						})
						.info("Generating artifacts");

					if (artifacts !== undefined && artifacts.$kind === "artifacts") {
						const failedArtifacts = artifacts.artifacts.filter(
							(artifact) => artifact?.result.exitCode !== 0,
						);
						if (failedArtifacts.length > 0) {
							logger
								.withMetadata({
									artifacts: failedArtifacts,
								})
								.warn("Failed to generate artifacts");
						}

						if (failedArtifacts.length === artifacts.artifacts.length) {
							throw new VError("All artifacts failed to generate");
						}
					}

					const { value: copies } = await compileModule.next();
					logger
						.withMetadata({
							copies,
						})
						.info("Copying artifacts");

					if (copies !== undefined && copies.$kind === "copies") {
						const failedCopies = copies.copies.filter(
							(copy) => copy?.result.exitCode !== 0,
						);
						if (failedCopies.length > 0) {
							logger
								.withMetadata({
									copies: failedCopies,
								})
								.warn("Failed to copy artifacts");
						}

						if (failedCopies.length === copies.copies.length) {
							throw new VError("All copies failed to generate");
						}
					}

					const { done } = await compileModule.next();
					if (!done) {
						throw new VError("CompileModule did not finish");
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
								throw new VError("Root must be a directory");
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
								throw new VError("Artifact must be a directory");
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
								throw new VError("Destination must be a directory");
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
