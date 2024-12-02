import { userInfo } from "node:os";
import { isBuildkite } from "../executor/Buildkite.js";
import { isGithubAction } from "../executor/GithubActions.js";
import { getEnv } from "./Environment.js";

export const isCI =
	getEnv("CI", false) === "true" || isBuildkite || isGithubAction;

export function getUsername() {
	const { username } = userInfo();
	return username;
}
