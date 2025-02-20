import { Effect } from "effect";
import type { BlankEnv, BlankSchema } from "hono/types";
import type { ILogLayer } from "loglayer";
import { deserializeError, serializeError } from "serialize-error";
import VError from "verror";
import type { HonoHttpServerBuilder } from "./HonoHttpServerBuilder.mjs";

export const HonoHttpServerFold = <
	Env extends BlankEnv,
	Schema extends BlankSchema,
	BasePath extends string,
>(
	server: ReturnType<typeof HonoHttpServerBuilder<Env, Schema, BasePath>>,
	{ trace }: { trace: ILogLayer },
) => {
	return Effect.gen(function* () {
		trace
			.withContext({
				$event: "server-start",
			})
			.debug("Folding server initialization effects");
		const service = yield* Effect.tryPromise({
			try() {
				const future = server();
				trace.debug("Server effects folded");
				return future;
			},
			catch(error) {
				trace
					.withContext({
						$error: serializeError(error),
					})
					.withError(deserializeError(error))
					.error("Server failed to fold");

				throw new VError(deserializeError(error), "Server failed to fold");
			},
		});

		return yield* service;
	});
};
