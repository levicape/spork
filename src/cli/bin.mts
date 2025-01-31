#!/usr/bin/env node
import { NodeRuntime } from "@effect/platform-node";
import { run } from "@stricli/core";
import { Context, Effect } from "effect";
import { process } from "std-env";
import VError from "verror";
import { withConsolaLogger } from "../app/server/logging/ConsolaLogger.mjs";
import { LoggingContext } from "../app/server/logging/LoggingContext.mjs";
import { SporkCliApp } from "./SporkCliApp.mjs";

NodeRuntime.runMain(
	Effect.provide(
		Effect.gen(function* () {
			const consola = yield* LoggingContext;
			const logger = yield* consola.logger;

			const app = yield* Effect.tryPromise(() =>
				SporkCliApp({
					service: {
						logger,
					},
				}),
			);
			yield* Effect.tryPromise(async () => {
				if (process.stderr === undefined || process.stdout === undefined) {
					throw new VError("process.stderr or process.stdout is undefined");
				}

				await run(app, process.argv?.slice?.(2) ?? [], {
					process: {
						env: process.env,
						stderr: process.stderr,
						stdout: process.stdout,
					},
				});
			});
		}),
		Context.empty().pipe(withConsolaLogger({ prefix: "CLI" })),
	),
);
