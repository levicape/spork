import { buildRouteMap } from "@stricli/core";
import { GenerateCommand } from "./GenerateCommand.mjs";

export const CodeRoutemap = async () => {
	const [prepareGenerate] = await Promise.all([GenerateCommand()]);
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
