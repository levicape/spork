import { Context, Effect, pipe } from "effect";
import { Hono } from "hono";
import { AuthenticatedRouter } from "../../domains/authenticated/AuthenticatedRouter.mjs";
import { withConsolaLogger } from "../../server/logging/ConsolaLogger.mjs";
import { LoggingContext } from "../../server/logging/LoggingContext.mjs";
import { Jwt, JwtLayer } from "../../server/security/Jwt.mjs";
import { HonoHttpApp } from "./HonoHttpApp.mjs";
import { HonoHttpServerApp } from "./HonoHttpServer.mjs";
import { HonoHttpServerBuilder } from "./HonoHttpServerBuilder.mjs";
import { HonoHttpMiddlewareStandard } from "./middleware/HonoHttpMiddleware.mjs";

export const server = HonoHttpServerBuilder({
	app: pipe(
		Effect.provide(
			Effect.provide(
				Effect.gen(function* () {
					const consola = yield* LoggingContext;
					const logger = yield* consola.logger;
					const { jwtTools } = yield* Jwt;
					return yield* pipe(
						HonoHttpApp({
							middleware: HonoHttpMiddlewareStandard({
								logger,
								jwtTools,
							}),
						}),
						Effect.andThen((app) =>
							app
								.route(
									"/!/pls",
									new Hono().get("/", (c) => c.json("pls")),
								)
								.route("/!/v1/Authenticated/", AuthenticatedRouter()),
						),
					);
				}),
				JwtLayer,
			),
			Context.empty().pipe(withConsolaLogger({ prefix: "APP" })),
		),
	),
});

export const app = HonoHttpServerApp(server);
