import { AuthenticatedRouter } from "../../domains/authenticated/AuthenticatedRouter.js";
import { HonoHttpApp } from "./HonoHttpApp.js";
import {
	HonoHttpServerBuilder,
	type HonoHttpServerExports,
} from "./HonoHttpServerBuilder.js";
import { HonoHttpMiddlewareStandard } from "./middleware/HonoHttpMiddleware.js";

// Default Server, should not be exported from index.mts
export default HonoHttpServerBuilder({
	app: HonoHttpApp({
		middleware: HonoHttpMiddlewareStandard(),
	}).route("/!/v1/Authenticated", AuthenticatedRouter()),
}) satisfies HonoHttpServerExports<
	ReturnType<typeof HonoHttpApp>
>["HonoHttpServer"];
