import { buildRouteMap } from "@stricli/core";
import type { SporkCliAppProps } from "../../SporkCliApp.mjs";
import { ClusterCommand } from "./ClusterCommand.mjs";
import { StartCommand } from "./StartCommand.mjs";

export const ServerRoutemap = async (props: SporkCliAppProps) => {
	const [prepareStart, prepareCluster] = await Promise.all([
		StartCommand(props),
		ClusterCommand(props),
	]);
	const [start, cluster] = await Promise.all([
		prepareStart(),
		prepareCluster(),
	]);

	return async () =>
		buildRouteMap({
			defaultCommand: "start",
			routes: {
				// dev,
				start,
				// cluster,
			},
			docs: {
				brief: "Start a spork server",
			},
		});
};
