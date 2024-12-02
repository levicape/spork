#!/usr/bin/env node --experimental-strip-types

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PipelineOptionsBuilder } from "../cd/pipeline/PipelineOptionsBuilder.js";
import {
	type BuildkiteBuild,
	BuildkitePipeline,
} from "../cd/pipeline/buildkite/BuildkitePipeline.js";
import type { SpawnOptions } from "../cd/runner/Spawn.js";
import { BuildkitePipelineCodegen } from "../codegen/pipeline/BuildkitePipelineCodegen.js";
import { uploadArtifact } from "../machine/Artifact.js";
import { executeSafe } from "../machine/Execute.js";
import { getCanaryRevision } from "../machine/code/Git.js";
import { printEnvironment } from "../machine/context/Environment.js";
import { isBuildkite } from "../machine/executor/Buildkite.js";
import { toYaml } from "../machine/format/Yaml.js";

async function writeBuildkitePipelineYaml({
	options,
	contentPath,
}: {
	options: PipelineOptionsBuilder<BuildkiteBuild>;
	contentPath: string;
}) {
	printEnvironment();

	const pipeline = BuildkitePipelineCodegen(options.build());
	if (pipeline === undefined) {
		console.dir(
			{
				Pipeline: {
					message: "Failed to generate pipeline",
					pipeline,
				},
			},
			{ depth: null },
		);

		throw new Error("Failed to generate pipeline");
	}

	const content = toYaml(pipeline);
	console.dir({
		Pipeline: {
			message: "Generated pipeline",
			path: contentPath,
			size: `${(content.length / 1024).toFixed()}KB`,
		},
	});

	try {
		mkdirSync(dirname(contentPath), { recursive: true });
	} catch (_) {}
	writeFileSync(contentPath, content);

	return options;
}

async function uploadBuildkitePipelineToAgent({
	contentPath,
	buildRelease,
}: {
	contentPath: string;
	buildRelease: boolean;
}) {
	console.log("Uploading artifact...");
	await uploadArtifact(contentPath);

	console.log("Setting canary revision...");
	const canaryRevision = buildRelease ? 0 : await getCanaryRevision();
	await executeSafe(
		["buildkite-agent", "meta-data", "set", "canary", `${canaryRevision}`],
		{
			stdio: "inherit",
		} as SpawnOptions,
	);

	console.log("Uploading pipeline...");
	await executeSafe(["buildkite-agent", "pipeline", "upload", contentPath], {
		stdio: "inherit",
	} as SpawnOptions);
}

export const GenerateBuildkitePipeline = async () => {
	const contentPath = join(process.cwd(), ".buildkite", "ci.yml");
	const { buildRelease } = await writeBuildkitePipelineYaml({
		options: await PipelineOptionsBuilder.for<BuildkiteBuild>(
			BuildkitePipeline.lastBuild,
			BuildkitePipeline.changedFiles,
			BuildkitePipeline.buildRelease,
		),
		contentPath,
	});

	if (isBuildkite) {
		await uploadBuildkitePipelineToAgent({
			contentPath,
			buildRelease: buildRelease,
		});
	} else {
		console.log("Not running in Buildkite, skipping pipeline upload.");
	}
};
