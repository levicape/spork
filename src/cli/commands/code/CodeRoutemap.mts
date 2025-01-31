import { buildRouteMap } from "@stricli/core";
import type { SporkCliAppProps } from "../../SporkCliApp.mjs";
import { GenerateCommand } from "./GenerateCommand.mjs";

export const CodeRoutemap = async (props: SporkCliAppProps) => {
	const [prepareGenerate] = await Promise.all([GenerateCommand(props)]);
	const [gen] = await Promise.all([prepareGenerate()]);

	return async () =>
		buildRouteMap({
			defaultCommand: "gen",
			routes: {
				// dev,
				gen,
				// cluster,
			},
			docs: {
				brief: "Start a spork server",
			},
		});
};
