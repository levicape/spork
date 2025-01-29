import { buildCommand } from "@stricli/core";
import { env } from "std-env";
import { Logger } from "../../../app/server/logging/Logger.js";

type Flags = {
	readonly port: number;
	readonly import: string;
};

export const StartCommand = async () => {
	return async () =>
		buildCommand({
			loader: async () => {
				return async ({ port, import: import_ }: Flags, target: string) => {
					const path = `${process.cwd()}/${target}`;
					Logger.debug({
						StartCommand: {
							target,
							path,
						},
					});
					const HonoHttpServer = (await import(path))[import_];
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
				positional: {
					kind: "tuple",
					parameters: [
						{
							brief: "File to serve",
							parse: (input: string) => {
								const allowed = ["js", "mjs", "cjs"];
								if (!allowed.some((ext) => input.endsWith(ext))) {
									throw new Error("File must be a js file (mjs, cjs)");
								}
								return input;
							},
						},
					],
				},
				flags: {
					port: {
						brief: "Port to listen on",
						kind: "parsed",
						default: "5555",
						parse: (port) => {
							if (port === "") {
								port = "5555";
							}
							return Number(port);
						},
						optional: false,
					},
					import: {
						brief:
							'Export to use from target file. (Defaults to --import "default")',
						kind: "parsed",
						default: "default",
						parse: String,
					},
				},
			},
			docs: {
				brief: "Start a spork server",
			},
		});
};
