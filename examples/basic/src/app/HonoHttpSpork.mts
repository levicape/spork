import { SporkHonoHttpServer } from "@levicape/spork/hono";
import { HonoGuardAuthentication } from "@levicape/spork/hono/guard";
import type { Context as HonoContext } from "hono";
import { Hono } from "hono/quick";

export const { server, handler, stream } = await SporkHonoHttpServer((app) =>
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
				.get("/anonymous", async (c: HonoContext) => {
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
