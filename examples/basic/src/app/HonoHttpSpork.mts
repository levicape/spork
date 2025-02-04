import {
	HonoGuardAuthentication,
	HonoHttpApp,
	HonoHttpMiddlewareStandard,
	HonoHttpServerApp,
	HonoHttpServerBuilder,
} from "@levicape/spork/router/hono";
import {
	Jwt,
	JwtLayer,
	LoggingContext,
	withStructuredLogging,
} from "@levicape/spork/server";
import { Context, Effect, pipe } from "effect";
import type { Effect as IEffect } from "effect/Effect";
import type { Context as HonoContext } from "hono";
import { Hono } from "hono";

type SporkHonoApp = IEffect.Success<ReturnType<typeof HonoHttpApp>>;
const hono = () => new Hono() as unknown as SporkHonoApp;
export const BasicExampleApp = hono();

export const BasicExampleRouter = BasicExampleApp.route(
	"/",
	hono().use(
		HonoGuardAuthentication(async ({ principal }) => {
			return principal.$case === "user";
		}),
	),
)
	.route(
		"/",
		hono().use(
			HonoGuardAuthentication(async ({ principal }) => {
				return principal.$case !== "anonymous";
			}),
		),
	)
	.route(
		"/",
		hono()
			.use(
				HonoGuardAuthentication(async ({ principal }) => {
					return principal.$case === "anonymous";
				}),
			)
			.get("/anonymous", async (c: HonoContext) => {
				c.json({ message: "Hello, anonymous!" });
			}),
	)
	.route(
		"/",
		hono().use(
			HonoGuardAuthentication(async ({ principal }) => {
				return principal.$case !== "admin";
			}),
		),
	);
export const server = HonoHttpServerBuilder({
	app: pipe(
		Effect.provide(
			Effect.provide(
				Effect.gen(function* () {
					const consola = yield* LoggingContext;
					const logger = yield* consola.logger;
					const { jwtTools } = yield* Jwt;
					return yield* Effect.flatMap(
						HonoHttpApp({
							middleware: HonoHttpMiddlewareStandard({
								logger,
								jwtTools,
							}),
						}),
						(app) =>
							Effect.succeed(
								app.route(
									"/",
									(new Hono() as SporkHonoApp).get(async (c) => {
										return c.json({ message: "Hello, World!" });
									}),
								),
							),
					);
				}),
				JwtLayer,
			),
			Context.empty().pipe(withStructuredLogging({ prefix: "APP" })),
		),
	),
});

export const app = HonoHttpServerApp(server);
