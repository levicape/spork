import { Effect } from "effect";
import { Hono } from "hono/quick";
import { ServiceHonoRouter } from "../../domains/service/ServiceHonoRouter.js";
import { WellknownHonoRouter } from "../../domains/wellknown/WellknownHonoRouter.mjs";
import { LoggingContext } from "../../server/logging/LoggingContext.mjs";
import {
	type HonoHttpMiddlewareStandard,
	HonoLoggingContext,
} from "./middleware/HonoHttpMiddleware.mjs";
import { Hono404Handler } from "./middleware/exception/Hono404Handler.js";
import { HonoExceptionMiddleware } from "./middleware/exception/HonoExceptionMiddleware.mjs";

let _factory: () => Hono;
export const SporkHonoFactory = (factory: () => Hono) => {
	_factory = factory;
};

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

// Default app
export const HonoHttpApp = ({
	middleware,
}: { middleware: ReturnType<typeof HonoHttpMiddlewareStandard> }) =>
	Effect.gen(function* () {
		const consola = yield* LoggingContext;
		const logger = yield* consola.logger;

		logger
			.withMetadata({
				HonoHttpApp: {
					factory: _factory !== undefined ? _factory.name : Hono.name,
					middleware: middleware.map((m) => m.name),
				},
			})
			.debug("Building HonoHttpApp");

		return (_factory?.() ?? new Hono())
			.use(HonoLoggingContext({ logger }))
			.use(...middleware)
			.notFound((c) => {
				const [json, status] = Hono404Handler;
				return c.json(json, status);
			})
			.onError(HonoExceptionMiddleware({ logger }))
			.route("/.well-known", WellknownHonoRouter())
			.route("/!/v1/Service", ServiceHonoRouter());
	});
