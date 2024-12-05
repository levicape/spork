import { buildRouteMap } from "@stricli/core";
import { ClusterCommand } from "./ClusterCommand.mjs";
import { StartCommand } from "./StartCommand.mjs";

export const ServerRoutemap = async () => {
	const [prepareStart, prepareCluster] = await Promise.all([
		StartCommand(),
		ClusterCommand(),
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
