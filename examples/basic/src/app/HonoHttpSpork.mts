import { HonoHttpServer } from "@levicape/spork/router/hono/HonoHttpServer";
import { HonoGuardAuthentication } from "@levicape/spork/router/hono/guard/security/HonoGuardAuthentication";
import type { HonoHttp } from "@levicape/spork/router/hono/middleware/HonoHttpMiddleware";
import { Hono } from "hono";
import { createFactory } from "hono/factory";

export const { server, handler, stream } = await HonoHttpServer(
	createFactory<HonoHttp>(),
	(app) =>
		app

			.get(
				"/user",
				HonoGuardAuthentication(async ({ principal }) => {
					return principal.$case === "authenticated";
				}),
			)
			.route(
				"/",
				new Hono().use(
					HonoGuardAuthentication(async ({ principal }) => {
						return principal.$case !== "anonymous";
					}),
				),
			)
			.route(
				"/",
				new Hono()
					.use(
						HonoGuardAuthentication(async ({ principal }) => {
							return principal.$case === "anonymous";
						}),
					)
					.get("/anonymous", async (c) => {
						c.json({ message: "Hello, anonymous!" });
					}),
			),
);

export type HonoHttpSpork = typeof server.app;
