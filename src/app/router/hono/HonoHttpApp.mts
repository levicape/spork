import { Effect } from "effect";
import { Hono, type MiddlewareHandler } from "hono";
import { serviceHonoRouter } from "../../domains/service/ServiceHonoRouter.js";
import { wellknownHonoRouter } from "../../domains/wellknown/WellknownHonoRouter.mjs";
import { LoggingContext } from "../../server/logging/LoggingContext.mjs";
import type { SporkHonoApp } from "./HonoHttpServerBuilder.mjs";
import type { HonoHttpMiddlewareStandard } from "./middleware/HonoHttpMiddleware.mjs";
import { Hono404Handler } from "./middleware/exception/Hono404Handler.js";
import { HonoExceptionMiddleware } from "./middleware/exception/HonoExceptionMiddleware.mjs";

export type HonoHttpAppProps<Middleware extends Array<MiddlewareHandler>> = {
	middleware: Middleware;
};

// Default app
export const HonoHttpApp = <
	Middleware extends Array<MiddlewareHandler> = ReturnType<
		typeof HonoHttpMiddlewareStandard
	>,
>({
	middleware,
}: HonoHttpAppProps<Middleware>) =>
	Effect.gen(function* () {
		const consola = yield* LoggingContext;
		const logger = yield* consola.logger;
		logger.debug("Building HonoHttpApp");
		return new Hono()
			.use(...middleware)
			.notFound(Hono404Handler())
			.onError(HonoExceptionMiddleware({ logger }))
			.route("/.well-known/", wellknownHonoRouter)
			.route("/!/v1/Service/", serviceHonoRouter);
	});

export const SporkHono = () => new Hono() as unknown as SporkHonoApp;
