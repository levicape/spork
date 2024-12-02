import { buildApplication, buildRouteMap } from "@stricli/core";
import { CodeRoutemap } from "./commands/code/CodeRoutemap.js";
import { ServerRoutemap } from "./commands/server/ServerRoutemap.js";

export const SporkCliApp = async () => {
	const routemap = [
		["server", await ServerRoutemap()],
		["code", await CodeRoutemap()],
	] as const;

	const prepare = await Promise.all(
		routemap.map(async ([name, promise]) => {
			return [name, await promise()];
		}),
	);

	const routes = Object.fromEntries(prepare);

	return buildApplication(
		buildRouteMap({
			routes,
			docs: {
				brief: "All available commands",
			},
		}),
		{
			name: "spork",
		},
	);
};
