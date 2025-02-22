import { buildRouteMap } from "@stricli/core";
import type { SporkCliAppProps } from "../../SporkCliApp.mjs";
import { StartCommand } from "./StartCommand.mjs";

export const ServerRoutemap = async (props: SporkCliAppProps) => {
	const [prepareStart] = await Promise.all([StartCommand(props)]);
	const [start] = await Promise.all([prepareStart()]);

	return async () =>
		buildRouteMap({
			defaultCommand: "start",
			routes: {
				start,
			},
			docs: {
				brief: "Start a spork server",
			},
		});
};
