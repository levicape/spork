import { buildCommand } from "@stricli/core";
import { Logger } from "../../../app/server/logging/Logger.js";

type Flags = {
	readonly target: string;
	readonly port: number;
};

export const StartCommand = async () => {
	return async () =>
		buildCommand({
			loader: async () => {
				return async ({ target, port }: Flags) => {
					const path = `${process.cwd()}/${target}`;
					Logger.debug({
						StartCommand: {
							target,
							path,
						},
					});
					const { HonoHttpServer } = await import(path);
					const server = await HonoHttpServer();
					Logger.log({
						StartCommand: {
							port,
							server: {
								routes: server.app.routes.filter(
									(route: { path: string }) => route.path !== "/*",
								),
							},
						},
					});
					await server.serve({
						port,
					});
				};
			},
			parameters: {
				flags: {
					target: {
						brief: "File to serve",
						kind: "parsed",
						parse: (input: string) => {
							if (!input.endsWith(".js")) {
								throw new Error("File must be a .js file");
							}
							return input;
						},
						optional: false,
					},
					port: {
						brief: "Port to listen on",
						kind: "parsed",
						default: "5555",
						parse: Number,
						optional: false,
					},
				},
			},
			docs: {
				brief: "Start a spork server",
			},
		});
};
