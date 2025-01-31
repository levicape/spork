import { buildApplication, buildRouteMap } from "@stricli/core";
import type { ILogLayer } from "loglayer";
import { CodeRoutemap } from "./commands/code/CodeRoutemap.mjs";
import { ServerRoutemap } from "./commands/server/ServerRoutemap.mjs";

export type SporkCliDependencyContainer = {
	logger: ILogLayer;
};

export type SporkCliAppProps = {
	service: SporkCliDependencyContainer;
};

export const SporkCliApp = async (props: SporkCliAppProps) => {
	const routemap = [
		["server", await ServerRoutemap(props)],
		["code", await CodeRoutemap(props)],
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
