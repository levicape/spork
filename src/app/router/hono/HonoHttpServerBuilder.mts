import { serve } from "@hono/node-server";
import { Context, Effect, pipe } from "effect";
import type { Hono } from "hono";
import { serializeError } from "serialize-error";
import { process } from "std-env";
import {
	LoggingContext,
	withStructuredLogging,
} from "../../server/logging/LoggingContext.mjs";
import { Jwt, JwtLayer } from "../../server/security/Jwt.mjs";
import { HonoHttpApp } from "./HonoHttpApp.mjs";
import { HonoHttpServerApp } from "./HonoHttpServer.mjs";
import { HonoHttpMiddlewareStandard } from "./middleware/HonoHttpMiddleware.mjs";

export type HonoHttpServerBuilderProps<App extends Hono> = {
	app: Effect.Effect<App, unknown>;
	effect?: {
		context?: Context.Context<unknown>;
	};
};

export type HonoHttpServerProps = {
	catchExceptions?: boolean;
};

export type ServeOptions = {
	port?: number;
};

// The "spork server start" command expects a HonoHttpServer to be exported from the target file.
// This can be created using the HonoHttpServerBuilder function, which takes a Hono app and returns a function that can be called to create a server.
// Example usage:
// ```typescript
// import { HonoHttpServerBuilder, HonoHttpServerApp } from "@levicape/spork";

// export const HonoHttpServer = HonoHttpServerBuilder(
//     HonoHttpServerApp..get("/hello", (c) => { ... });
// );
// ```
export type HonoServerExports<App extends Hono> = {
	HonoHttpServer: (props?: HonoHttpServerProps) => Promise<
		Effect.Effect<
			{
				app: Effect.Effect<App, unknown>;
				serve: (options: ServeOptions) => Promise<void>;
				stop: () => Promise<void>;
			},
			unknown
		>
	>;
};

export type HonoHttpServerExports<App extends Hono> =
	HonoServerExports<App>["HonoHttpServer"];

export const HonoHttpServerDefaultProps: () => HonoHttpServerProps = () => ({
	catchExceptions: true,
});

export const HonoHttpServerBuilder =
	<App extends Hono>({ app, effect }: HonoHttpServerBuilderProps<App>) =>
	async (props?: HonoHttpServerProps) => {
		return Effect.provide(
			Effect.gen(function* () {
				const consola = yield* LoggingContext;
				const logger = yield* consola.logger;
				let server: ReturnType<typeof serve> | undefined;

				const now = Date.now();
				const { catchExceptions } = {
					...HonoHttpServerDefaultProps(),
					...(props ?? {}),
				};
				let instance = yield* app;
				if (catchExceptions) {
					process.on?.("unhandledRejection", (reason: string) => {
						logger.withMetadata({
							unhandledRejection: serializeError(reason),
						});
						throw { $case: "unhandledRejection", reason };
					});

					process.on?.("uncaughtException", (error) => {
						// biome-ignore lint/suspicious/noExplicitAny:
						if ((error as unknown as any)?.$case !== "unhandledRejection") {
						} else {
							logger
								.withMetadata({
									HonoHttpServerBuilder: {
										uncaughtException: {
											error: serializeError(error),
										},
									},
								})
								.warn("Uncaught exception");
						}
					});
				}

				logger
					.withMetadata({
						HonoHttpServerBuilder: {
							timing: {
								elapsed: Date.now() - now,
							},
						},
					})
					.info("Server built");

				return {
					app,
					serve: async ({ port }: ServeOptions) => {
						server = serve({
							fetch: instance.fetch,
							port,
						});

						while (!server.listening) {
							await new Promise((resolve) => setTimeout(resolve, 1000));
						}
						logger
							.withMetadata({
								HonoHttpServerBuilder: {
									serve: {
										port,
									},
									server: {
										listening: server.listening,
									},
								},
							})

							.debug("Server started");
					},
					stop: async () => {
						return new Promise<void>((resolve, reject) => {
							server?.close((error) => {
								logger
									.withMetadata({
										HonoHttpServerBuilder: {
											server: {
												listening: server?.listening,
											},
											error: serializeError(error),
										},
									})
									.info("Server closed");

								if (error) {
									reject(error);
								} else {
									resolve();
								}
							});
						});
					},
				};
			}),
			(effect?.context ?? Context.empty()).pipe(
				withStructuredLogging({ prefix: "SERVER" }),
			),
		);
	};

export type SporkHonoApp = Effect.Effect.Success<
	ReturnType<typeof HonoHttpApp>
>;
/**
 * SporkHonoHttpServer is a function that configures a Hono instance, and prepares it for use with `spork server start`.
 *
 * @param app A configured Hono instance. Add your routes to this app.
 * @see SporkHonoApp
 * @returns
 */
export const SporkHonoHttpServer = (
	app: <App extends Hono>(app: SporkHonoApp) => App,
) => {
	return HonoHttpServerApp(
		HonoHttpServerBuilder({
			app: pipe(
				Effect.provide(
					Effect.provide(
						Effect.gen(function* () {
							const consola = yield* LoggingContext;
							const logger = yield* consola.logger;
							const { jwtTools } = yield* Jwt;
							return yield* Effect.flatMap(
								HonoHttpApp({
									middleware: HonoHttpMiddlewareStandard({
										logger,
										jwtTools,
									}),
								}),
								(spork) => Effect.succeed(app(spork)),
							);
						}),
						JwtLayer,
					),
					Context.empty().pipe(withStructuredLogging({ prefix: "APP" })),
				),
			),
		}),
	);
};

export * from "./HonoHttpApp.mjs";
export * from "./HonoHttpServer.mjs";
