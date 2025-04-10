import { SporkHonoHttpServer } from "@levicape/spork/router/hono/HonoHttpServerBuilder";
import { HonoGuardAuthentication } from "@levicape/spork/router/hono/guard/security/HonoGuardAuthentication";
import type { DefaultHonoHttpMiddleware } from "@levicape/spork/router/hono/middleware/HonoHttpMiddleware";
import { Hono } from "hono";
import { createFactory } from "hono/factory";
export const { server, handler, stream } = await SporkHonoHttpServer(
	createFactory<DefaultHonoHttpMiddleware>(),
	(app) =>
		app

			.get(
				"/user",
				HonoGuardAuthentication(async ({ principal }) => {
					return principal.$case === "user";
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
			)
			.route(
				"/not-admin",
				new Hono().use(
					HonoGuardAuthentication(async ({ principal }) => {
						return principal.$case !== "admin";
					}),
				),
			),
);

export type HonoHttpSpork = typeof server.app;
