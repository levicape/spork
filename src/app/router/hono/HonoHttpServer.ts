import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { prettyJSON } from "hono/pretty-json";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";
import { ulid } from "ulidx";
import {
	StandsTelemetryHttpHeaderBasic,
	standsTelemetryHttpHeaderBasicToJSON,
} from "../../../_protocols/stands/ts/domain/telemetry/http/requests/telemetry._._.http.request._.js";
import { serviceHonoRouter } from "../../domains/service/ServiceHonoRouter.js";
import { wellknownHonoRouter } from "../../domains/wellknown/WellknownHonoRouter.js";
import { Logger } from "../../server/logging/Logger.js";
import { jwtTools } from "../../server/security/JwtTools.js";
import { HonoRequestLogger } from "./middleware/HonoRequestLogger.js";

export type ServeOptions = {
	port?: number;
};
////
const corsed = {
	middleware: cors(),
};
//
const app = new Hono()
	.use(timeout(12000))
	.use(secureHeaders())
	.use(
		bodyLimit({
			maxSize: 64 * 1024,
		}),
	)
	.use(compress())
	.use(
		"*",
		requestId({
			generator() {
				return ulid();
			},
			headerName: standsTelemetryHttpHeaderBasicToJSON(
				StandsTelemetryHttpHeaderBasic.X_Request_ID,
			),
		}),
	)
	.use(prettyJSON())
	.use(HonoRequestLogger())
	//TODO: HonoCors
	.use(async (c, next) => {
		return corsed.middleware(c, next);
	})
	//TODO: HonoResponseTime
	.use("*", async (c, next) => {
		const start = Date.now();
		await next();
		const ms = Date.now() - start;
		c.header("X_Response_Time", `${ms}`);
	})
	.onError((error) => {
		if (error instanceof HTTPException) {
			return error.getResponse();
		}
		Logger.warn({
			OnRootError: {
				error: JSON.stringify(error),
			},
		});
		return new Response(
			JSON.stringify({
				error: {
					message: "Unprocessable Entity",
				},
			}),
			{ status: 420 },
		);
	})
	.notFound((c) => {
		return c.json(
			{
				error: {
					code: "I_AM_A_TEAPOT",
				},
			},
			418,
		);
	})
	.route("/.well-known/", wellknownHonoRouter)
	.route("/!/v1/Service", serviceHonoRouter);

// ServerTiming
// OpenTelmetry
// IP Header

const serverContext = async <App extends Hono>(app: App): Promise<App> => {
	await jwtTools.initialize();
	return app;
};

// The "spork server start" command expects a HonoHttpServer to be exported from the target file.
// This can be created using the HonoHttpServerBuilder function, which takes a Hono app and returns a function that can be called to create a server.
// Example usage:
// ```typescript
// import { HonoHttpServerBuilder, HonoHttpServerApp } from "@levicape/spork-typescript";

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

// Default app with middleware configured
export const HonoHttpServerApp = app;

export type HonoHttpServerProps = {
	catchExceptions?: boolean;
};
const defaultProps: HonoHttpServerProps = {
	catchExceptions: true,
};

export type HonoHttpServerBuilderProps<App extends Hono> = {
	app: App;
	context?: {
		before?: (app: App) => Promise<App>;
		after?: (app: App) => Promise<App>;
	};
};

export const HonoHttpServerBuilder =
	<App extends Hono>({ app, context }: HonoHttpServerBuilderProps<App>) =>
	async (props?: HonoHttpServerProps) => {
		const then = Date.now();

		const { catchExceptions } = {
			...defaultProps,
			...(props ?? {}),
		};
		let instance = app;
		const { before, after } = context ?? {};
		if (before) {
			instance = await before(instance);
		}
		instance = await serverContext(instance);
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

export const HonoHttpServer: HonoHttpServerExports<
	typeof app
>["HonoHttpServer"] = HonoHttpServerBuilder({
	app,
});
