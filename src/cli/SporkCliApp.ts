import { buildApplication, buildRouteMap } from "@stricli/core";
import { HandlerRoutemap } from "./commands/handler/HandlerRoutemap.js";
import { ServerRoutemap } from "./commands/server/ServerRoutemap.js";

export const SporkCliApp = async () => {
	const [prepareHandler, prepareServer] = await Promise.all([
		HandlerRoutemap(),
		ServerRoutemap(),
	]);
	const [handler, server] = await Promise.all([
		prepareHandler(),
		prepareServer(),
	]);

	return buildApplication(
		buildRouteMap({
			routes: {
				handler,
				server,
			},
			docs: {
				brief: "All available commands",
			},
		}),
		{
			name: "spork",
		},
	);
};
