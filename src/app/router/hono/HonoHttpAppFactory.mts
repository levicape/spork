import { Effect } from "effect";
import type { Factory } from "hono/factory";
import type { BlankEnv, ErrorHandler } from "hono/types";
import { WellknownHonoRouter } from "../../domains/wellknown/WellknownHonoRouter.mjs";
import { LoggingContext } from "../../server/logging/LoggingContext.mjs";
import type { HonoHttpMiddlewareBuilder } from "./middleware/HonoHttpMiddleware.mjs";
import { Hono404Handler } from "./middleware/exception/Hono404Handler.js";
import { HonoExceptionMiddleware } from "./middleware/exception/HonoExceptionMiddleware.mjs";
import { HonoLoggingContext } from "./middleware/log/HonoLoggingContext.mjs";
import { HonoRequestLogger } from "./middleware/log/HonoRequestLogger.mjs";

interface Pipe {
	<A>(value: A): A;
	<A, B>(value: A, fn1: (input: A) => B): B;
	<A, B, C>(value: A, fn1: (input: A) => B, fn2: (input: B) => C): C;
	<A, B, C, D>(
		value: A,
		fn1: (input: A) => B,
		fn2: (input: B) => C,
		fn3: (input: C) => D,
	): D;
	<A, B, C, D, E>(
		value: A,
		fn1: (input: A) => B,
		fn2: (input: B) => C,
		fn3: (input: C) => D,
		fn4: (input: D) => E,
	): E;
	// ... and so on
}

export const pipe: Pipe = (value: unknown, ...fns: Function[]): unknown => {
	return fns.reduce((acc, fn) => fn(acc), value);
};

export const HonoHttpAppFactory = <
	Env extends BlankEnv,
	BasePath extends string,
>(
	factory: Factory<Env, BasePath>,
	{ middleware }: { middleware: ReturnType<typeof HonoHttpMiddlewareBuilder> },
) =>
	Effect.gen(function* () {
		const consola = yield* LoggingContext;
		const logger = yield* consola.logger;

		logger
			.withMetadata({
				HonoHttpApp: {
					factory,
					middleware: middleware.map((m) => m.name),
				},
			})
			.debug("Building HonoHttpApp");

		return factory
			.createApp()
			.use(...middleware)
			.use(HonoLoggingContext({ logger }))
			.use(HonoRequestLogger({ logger }))
			.notFound((c) => {
				const [json, status] = Hono404Handler;
				return c.json(json, status);
			})
			.onError(HonoExceptionMiddleware({ logger }) as unknown as ErrorHandler)
			.route("/.well-known", WellknownHonoRouter());
	});
