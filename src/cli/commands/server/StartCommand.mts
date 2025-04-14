import { buildCommand } from "@stricli/core";
import { watch } from "chokidar";
import { Deferred, Duration, Effect, Exit } from "effect";
import { makeSemaphore } from "effect/Effect";
import type { RuntimeFiber } from "effect/Fiber";
import { serializeError } from "serialize-error";
import VError from "verror";
import type { SporkServerStartImportExpects } from "../../../app/router/hono/HonoHttpServer.mjs";
import type { SporkCliAppProps } from "../../SporkCliApp.mjs";

type Flags = {
	readonly port: number;
	readonly watch?: string;
};

export const StartCommand = async (props: SporkCliAppProps) => {
	return async () =>
		buildCommand({
			loader: async () => {
				const nowunix = Date.now();
				return async ({ port, watch: watchpath }: Flags, target: string) => {
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
							try: async (): Promise<SporkServerStartImportExpects> => {
								const uncachepath = `${path}?${Date.now()}`;
								const module = await import(uncachepath);
								if (!module["server"]) {
									logger
										.withMetadata({
											StartCommand: {
												path: uncachepath,
												module,
											},
										})
										.error(
											"Exports not found. Please ensure the module exports 'server'",
										);
									throw new VError(
										{
											info: {
												path: uncachepath,
												module,
											},
										},
										"Exports not found. Please ensure the module exports 'server'",
									);
								}
								const HonoHttpServer: SporkServerStartImportExpects = module;

								logger
									.withMetadata({
										StartCommand: {
											path: uncachepath,
											HonoHttpServer,
										},
									})
									.debug("Imported module");
								return Promise.resolve(HonoHttpServer);
							},
							catch: (error: unknown) => {
								logger
									.withMetadata({
										StartCommand: {
											error: serializeError(error),
										},
									})
									.error("Failed to import server module");
								return Promise.reject(error);
							},
						}).pipe(
							Effect.flatMap(({ server }) => {
								return Effect.gen(function* () {
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

									logger
										.withMetadata({
											StartCommand: {
												routes: [
													...new Set(
														server.app.routes
															?.filter(
																(route: { path: string }) =>
																	route.path !== "/*",
															)
															.map(
																(route: { method: string; path: string }) =>
																	`${route.method} ${route.path}`,
															),
													),
												],
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
							watch(path, {
								atomic: true,
								awaitWriteFinish: true,
								binaryInterval: 1000,
								interval: 800,
								persistent: true,
								usePolling: true,
							}).on("all", (event, path) => {
								if (
									["add", "addDir", "change", "ready"].every((e) => e !== event)
								) {
									return;
								}

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
