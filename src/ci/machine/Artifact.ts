import { relative } from "node:path";
import { executeSafe } from "./Execute.js";
import { isBuildkite } from "./executor/Buildkite.js";

export async function uploadArtifact(filename: string, cwd?: string) {
	if (isBuildkite) {
		const relativePath = relative(cwd ?? process.cwd(), filename);
		await executeSafe(["buildkite-agent", "artifact", "upload", relativePath], {
			cwd,
			stdio: "inherit",
		});
	}
}
