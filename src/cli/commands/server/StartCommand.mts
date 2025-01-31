import { buildCommand } from "@stricli/core";
import { watch } from "chokidar";
import { Deferred, Duration, Effect, Exit } from "effect";
import { makeSemaphore } from "effect/Effect";
import type { RuntimeFiber } from "effect/Fiber";
import type { Hono } from "hono";
import { serializeError } from "serialize-error";
import VError from "verror";
import type { HonoHttpServerExports } from "../../../app/router/hono/HonoHttpServerBuilder.mjs";
import type { SporkCliAppProps } from "../../SporkCliApp.mjs";

type Flags = {
	readonly port: number;
	readonly import: string;
	readonly watch?: string;
};

export const StartCommand = async (props: SporkCliAppProps) => {
	return async () =>
		buildCommand({
			loader: async () => {
				const nowunix = Date.now();
				return async (
					{ port, import: import_, watch: watchpath }: Flags,
					target: string,
				) => {
					const path = `${process.cwd()}/${target}`;
					const logger = props.service.logger.withContext({
						parent: ["server"],
						command: "start",
					});
					logger
						.withMetadata({
							StartCommand: {
								target,
								path,
								args: {
									port,
									import: import_,
									watch: watchpath,
									target,
								},
							},
						})
						.debug("Starting server");

					let serve = Effect.gen(function* () {
						let ready = yield* Deferred.make<boolean, Error>();
						let signal = yield* Deferred.make<boolean, Error>();

						let lifecycle = Effect.tryPromise({
							try: async (): ReturnType<HonoHttpServerExports<Hono>> => {
								const uncachepath = `${path}?${nowunix}`;
								const module = await import(uncachepath);
								if (!module[import_]) {
									throw new VError(
										{
											info: {
												path: uncachepath,
												import: import_,
												module,
											},
										},
										"Export not found",
									);
								}
								const HonoHttpServer: HonoHttpServerExports<Hono> =
									module[import_];

								logger
									.withMetadata({
										StartCommand: {
											path: uncachepath,
											import: import_,
											HonoHttpServer,
										},
									})
									.debug("Imported module");
								return await HonoHttpServer();
							},
							catch: (error: unknown) => {
								logger
									.withMetadata({
										StartCommand: {
											error: serializeError(error),
										},
									})
									.error("Failed to start server");
								return Promise.reject(error);
							},
						}).pipe(
							Effect.flatMap((builder) => {
								return Effect.gen(function* () {
									const server = yield* builder;
									yield* Effect.tryPromise({
										try: async () => {
											await server.serve({
												port,
											});
										},
										catch: (error: unknown) => {
											logger
												.withMetadata({
													StartCommand: {
														error: serializeError(error),
													},
												})
												.error("Failed to start server");
											return Promise.reject(error);
										},
									});

									logger
										.withMetadata({
											StartCommand: {
												port,
											},
										})
										.info("Server started");

									yield* Deferred.succeed(ready, true);

									const app = yield* server.app;
									logger
										.withMetadata({
											StartCommand: {
												routes: app.routes
													?.filter(
														(route: { path: string }) => route.path !== "/*",
													)
													.map((route) => `${route.method} ${route.path}`),
											},
										})
										.info("Routes");

									yield* Deferred.await(signal);
									yield* Effect.tryPromise(async () => {
										await server.stop();
									});
								});
							}),
						);

						if (watchpath && watchpath !== "") {
							let fiber: RuntimeFiber<unknown, unknown> | undefined;
							let semaphore = makeSemaphore(1);
							watch(path).on("all", (event, path) => {
								Effect.runFork(
									Effect.gen(function* () {
										const lock = yield* semaphore;
										yield* lock.take(1);
										logger
											.withMetadata({
												event,
												path,
											})
											.info("File changed");

										if (fiber !== undefined) {
											yield* Deferred.await(ready);
											yield* Deferred.succeed(signal, true);
											yield* fiber.await;
										}
										yield* Effect.sleep(Duration.millis(350));
										ready = yield* Deferred.make<boolean, Error>();
										signal = yield* Deferred.make<boolean, Error>();
										fiber = yield* Effect.forkDaemon(lifecycle);
										yield* Effect.sleep(Duration.millis(350));
										yield* lock.release(1);
									}),
								);
							});
						} else {
							yield* lifecycle;
						}

						const block = yield* Deferred.make();
						yield* Deferred.await(block);

						const then = Date.now();
						const elapsed = then - nowunix;

						logger
							.withMetadata({
								StartCommand: {
									elapsed,
								},
							})
							.info("Exiting StartCommand");

						return Exit.succeed({
							elapsed,
						});
					});

					await Effect.runPromise(serve);
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
									throw new VError("File must be a js file (mjs, cjs)");
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
					watch: {
						brief: "Watch directory for changes",
						kind: "parsed",
						parse: String,
						optional: true,
					},
				},
			},
			docs: {
				brief: "Start a spork server",
			},
		});
};
