import { userInfo } from "node:os";
import { githubActions, isGithubAction } from "../executor/GithubActions.mjs";
import { getEnv } from "./Environment.mjs";

const isBuildkite = false;

export const isCI =
	getEnv("CI", false) === "true" || isBuildkite || githubActions.isActive();

export function getUsername() {
	const { username } = userInfo();
	return username;
}
