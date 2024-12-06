import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import { Logger } from "../../server/logging/Logger.js";
import { HonoSporkContext } from "./HonoHttpApp.js";

// The "spork server start" command expects a HonoHttpServer to be exported from the target file.
// This can be created using the HonoHttpServerBuilder function, which takes a Hono app and returns a function that can be called to create a server.
// Example usage:
// ```typescript
// import { HonoHttpServerBuilder, HonoHttpServerApp } from "@levicape/spork";

// export const HonoHttpServer = HonoHttpServerBuilder(
//     HonoHttpServerApp..get("/hello", (c) => { ... });
// );
// ```
export type HonoHttpServerExports<App extends Hono> = {
	HonoHttpServer: (props?: HonoHttpServerProps) => Promise<{
		app: App;
		serve: (options: ServeOptions) => Promise<void>;
	}>;
};
export type HonoHttpServerProps = {
	catchExceptions?: boolean;
};

export const HonoHttpServerDefaultProps: () => HonoHttpServerProps = () => ({
	catchExceptions: true,
});

export type HonoHttpServerBuilderProps<App extends Hono> = {
	app: App;
	context?: {
		before?: (app: App) => Promise<App>;
		// Automatically defaults to HonoSporkContext
		server?: (app: App) => Promise<App>;
		after?: (app: App) => Promise<App>;
	};
};

export type ServeOptions = {
	port?: number;
};

export const HonoHttpServerBuilder =
	<App extends Hono>({ app, context }: HonoHttpServerBuilderProps<App>) =>
	async (props?: HonoHttpServerProps) => {
		const then = Date.now();

		const { catchExceptions } = {
			...HonoHttpServerDefaultProps(),
			...(props ?? {}),
		};
		let instance = app;
		const { before, after } = context ?? {};
		if (before) {
			instance = await before(instance);
		}
		instance = await (context?.server ?? HonoSporkContext)(instance);
		if (after) {
			instance = await after(instance);
		}

		Logger.debug({
			Http: {
				primed: true,
			},
		});
		if (catchExceptions) {
			process.on("unhandledRejection", (reason: string) => {
				Logger.warn({
					Http: {
						unhandledRejection: {
							reason,
							stringify: JSON.stringify(reason),
						},
					},
				});
				throw { $case: "unhandledRejection", reason };
			});

			process.on("uncaughtException", (error: Error) => {
				// biome-ignore lint/suspicious/noExplicitAny:
				if ((error as unknown as any)?.$case !== "unhandledRejection") {
				} else {
					Logger.warn({
						Http: {
							uncaughtException: {
								error: JSON.stringify({
									splat: {
										...(error as unknown as object),
									},
									json: JSON.stringify(error),
									string: error?.toString(),
									stack:
										(error as unknown as { stack: string }).stack !== undefined
											? (error as unknown as { stack: string }).stack
											: undefined,
								}),
							},
						},
						elapsed: Date.now() - then,
					});
				}

				process.exit(1);
			});
		}

		return {
			app,
			serve: async ({ port }: ServeOptions) => {
				const server = serve({
					fetch: app.fetch,
					port,
				});

				while (!server.listening) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
				Logger.log({
					Http: {
						serve: {
							port,
						},
						server: {
							listening: server.listening,
						},
					},
				});
			},
		};
	};
