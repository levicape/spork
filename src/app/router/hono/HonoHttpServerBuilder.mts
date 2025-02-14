import { serve } from "@hono/node-server";
import { Context, Effect, pipe } from "effect";
import type { Hono, MiddlewareHandler } from "hono";
import { handle } from "hono/aws-lambda";
import { serializeError } from "serialize-error";
import { env, process } from "std-env";
import {
	LoggingContext,
	withStructuredLogging,
} from "../../server/logging/LoggingContext.mjs";
import { Jwt, JwtLayer } from "../../server/security/Jwt.mjs";
import { HonoHttpApp } from "./HonoHttpApp.mjs";
import { HonoHttpServerFold } from "./HonoHttpServer.mjs";
import {
	HonoHttpMiddlewareStandard,
	type HonoHttpMiddlewareStandardProps,
} from "./middleware/HonoHttpMiddleware.mjs";

const { trace } = await Effect.runPromise(
	Effect.provide(
		Effect.gen(function* () {
			const logging = yield* LoggingContext;
			return {
				trace: (yield* logging.logger).withContext({
					$event: "honohttpserver-main",
				}),
			};
		}),
		Context.empty().pipe(withStructuredLogging({ prefix: "http" })),
	),
);

export type HonoHttpServerBuilderProps<App extends Hono> = {
	app: Effect.Effect<
		{ app: App; handler?: ReturnType<typeof handle> },
		unknown
	>;
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

export type SporkServerStartImportExpects = Awaited<
	ReturnType<Awaited<Awaited<typeof SporkHonoHttpServer>>>
>;

export const HonoHttpServerDefaultProps: () => HonoHttpServerProps = () => ({
	catchExceptions: true,
});

export const HonoHttpServerBuilder =
	<App extends Hono>({ app, effect }: HonoHttpServerBuilderProps<App>) =>
	async (props?: HonoHttpServerProps) => {
		trace.debug("Building server");

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
				const instance = yield* app;
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
					handler: instance.handler,
					server: {
						app: instance.app,
						serve: async ({ port }: ServeOptions) => {
							server = serve({
								fetch: instance.app.fetch,
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
export const SporkHonoHttpServer = async (
	app: (app: SporkHonoApp) => Hono,
	props: {
		middleware?: (
			services: HonoHttpMiddlewareStandardProps,
		) => Array<MiddlewareHandler>;
	} = {},
) => {
	return await Effect.runPromise(
		pipe(
			HonoHttpServerFold(
				HonoHttpServerBuilder({
					app: Effect.provide(
						Effect.provide(
							pipe(
								Effect.gen(function* () {
									const consola = yield* LoggingContext;
									const logger = yield* consola.logger;
									const { jwtTools } = yield* Jwt;
									const middleware =
										(props.middleware ?? HonoHttpMiddlewareStandard)?.({
											logger,
											jwtTools,
										}) ?? [];

									if (middleware.length > 0) {
										logger
											.withMetadata({
												SporkHonoHttpServer: {
													middleware: middleware.map((m) => m.name),
												},
											})
											.debug("Middleware added");
									} else {
										logger.debug("No middleware added");
									}

									return yield* Effect.flatMap(
										HonoHttpApp({
											middleware,
										}),
										(spork) => {
											const { AWS_LAMBDA_FUNCTION_NAME } = env;
											const resolvedapp = app(spork);
											return Effect.succeed({
												app: resolvedapp,
												handler:
													(AWS_LAMBDA_FUNCTION_NAME && handle(resolvedapp)) ||
													undefined,
											});
										},
									);
								}),
								Effect.onError((error) => {
									return Effect.sync(() => {
										trace
											.withMetadata({
												SporkHonoHttpServer: {
													error: serializeError(error),
												},
											})
											.error("Failed to build app");
									});
								}),
							),
							JwtLayer,
						),
						Context.empty().pipe(withStructuredLogging({ prefix: "APP" })),
					),
				}),
				{ trace },
			),
		),
	);
};

export * from "./HonoHttpApp.mjs";
export * from "./HonoHttpServer.mjs";
