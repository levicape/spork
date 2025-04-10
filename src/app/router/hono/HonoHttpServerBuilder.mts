import { serve } from "@hono/node-server";
import { Context, Effect, Layer, pipe } from "effect";
import type { Hono } from "hono";
import {
	type APIGatewayProxyResult,
	type LambdaContext,
	type LambdaEvent,
	handle,
	streamHandle,
} from "hono/aws-lambda";
import type { Factory } from "hono/factory";
import type { BlankEnv, BlankSchema } from "hono/types";
import { serializeError } from "serialize-error";
import { env, process } from "std-env";
import {
	LoggingContext,
	withStructuredLogging,
} from "../../server/logging/LoggingContext.mjs";
import { FilesystemJwkCache } from "../../server/security/JwkCache/JwkCache.mjs";
import {
	JwtVerification,
	JwtVerificationLayer,
} from "../../server/security/JwtVerification.mjs";
import { HonoHttpApp } from "./HonoHttpApp.mjs";
import { HonoHttpServerFold } from "./HonoHttpServer.mjs";
import { HonoHttpMiddlewareStandard } from "./middleware/HonoHttpMiddleware.mjs";

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

export type HonoHttpLambdaHandler = (
	event: LambdaEvent,
	lambdaContext?: LambdaContext,
) => Promise<APIGatewayProxyResult>;

export type HonoHttpServerBuilderProps<
	Env extends BlankEnv,
	Schema extends BlankSchema,
	BasePath extends string,
> = {
	app: Effect.Effect<
		{
			app: Hono<Env, Schema, BasePath>;
		},
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
	<Env extends BlankEnv, Schema extends BlankSchema, BasePath extends string>({
		app,
		effect,
	}: HonoHttpServerBuilderProps<Env, Schema, BasePath>) =>
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
				const { AWS_LAMBDA_FUNCTION_NAME } = env;
				const initialized = instance.app;
				return {
					stream: AWS_LAMBDA_FUNCTION_NAME
						? (streamHandle(initialized) as HonoHttpLambdaHandler)
						: undefined,
					handler: AWS_LAMBDA_FUNCTION_NAME ? handle(initialized) : undefined,
					server: {
						app: initialized,
						serve: async ({ port }: ServeOptions) => {
							server = serve({
								fetch: initialized.fetch,
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

export type ExtractEnv<T> = T extends Hono<infer Env, BlankSchema>
	? Env
	: never;

/**
 * SporkHonoHttpServer is a function that configures a Hono instance, and prepares it for use with `spork server start`.
 *
 * @param app A configured Hono instance. Add your routes to this app.
 * @see SporkHonoApp
 * @returns
 */
export const SporkHonoHttpServer = async <
	Env extends BlankEnv,
	BasePath extends string,
	AppSchema extends BlankSchema,
	AppPath extends string,
>(
	/**
	 *	factory created by Hono `createFactory`. Configure your Hono app middleware (app.use) here
	 */
	factory: Factory<Env, BasePath>,
	/**
	 *
	 */
	app: (
		app: ReturnType<typeof factory.createApp>,
	) => Hono<Env, AppSchema, AppPath>,
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
									const jwtVerification = yield* JwtVerification;
									const middleware = HonoHttpMiddlewareStandard({
										logger,
										jwtVerification,
									});

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
										HonoHttpApp(factory, {
											middleware,
										}),
										(spork) => {
											const instance = app(
												spork as unknown as ReturnType<
													typeof factory.createApp
												>,
											);
											return Effect.succeed({
												app: instance,
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
							Layer.provide(JwtVerificationLayer, FilesystemJwkCache),
						),
						Context.empty().pipe(withStructuredLogging({ prefix: "APP" })),
					),
				}),
				{ trace },
			),
		),
	);
};
