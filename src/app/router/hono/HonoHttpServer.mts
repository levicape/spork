import { Effect, pipe } from "effect";
import type { HonoHttpServerBuilder } from "./HonoHttpServerBuilder.mjs";

// TODO: tryPromise try, use LoggingContext
export const HonoHttpServerApp = (
	server: ReturnType<typeof HonoHttpServerBuilder>,
) => {
	return Effect.gen(function* () {
		return yield* pipe(
			yield* Effect.tryPromise(() => server()),
			Effect.flatMap(({ app }) => app),
		);
	});
};
