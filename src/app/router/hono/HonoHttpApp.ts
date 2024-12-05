import { Hono, type MiddlewareHandler } from "hono";
import { serviceHonoRouter } from "../../domains/service/ServiceHonoRouter.js";
import { wellknownHonoRouter } from "../../domains/wellknown/WellknownHonoRouter.js";
import { jwtTools } from "../../server/security/JwtTools.js";
import type { HonoHttpMiddlewareStandard } from "./middleware/HonoHttpMiddleware.js";
import { Hono404Handler } from "./middleware/exception/Hono404Handler.js";
import { HonoExceptionMiddleware } from "./middleware/exception/HonoExceptionMiddleware.js";

// ServerTiming
// OpenTelmetry
// IP Header

export const HonoSporkContext = async <App extends Hono>(
	app: App,
): Promise<App> => {
	await jwtTools.initialize();
	return app;
};

export type HonoHttpAppProps<Middleware extends Readonly<MiddlewareHandler[]>> =
	{
		middleware: Middleware;
	};

// Default app
export const HonoHttpApp = <
	Middleware extends Readonly<MiddlewareHandler[]> = ReturnType<
		typeof HonoHttpMiddlewareStandard
	>,
>({
	middleware,
}: HonoHttpAppProps<Middleware>) =>
	new Hono()
		.use(...middleware)
		.onError(HonoExceptionMiddleware())
		.notFound(Hono404Handler())
		.route("/.well-known/", wellknownHonoRouter)
		.route("/!/v1/Service", serviceHonoRouter);
