import { SporkHono, SporkHonoHttpServer } from "@levicape/spork/hono";
import { HonoGuardAuthentication } from "@levicape/spork/hono/guard";
import type { Context as HonoContext } from "hono";

export const { server, handler } = await SporkHonoHttpServer((app) =>
	app
		.route(
			"/user",
			SporkHono().use(
				HonoGuardAuthentication(async ({ principal }) => {
					return principal.$case === "user";
				}),
			),
		)
		.route(
			"/",
			SporkHono().use(
				HonoGuardAuthentication(async ({ principal }) => {
					return principal.$case !== "anonymous";
				}),
			),
		)
		.route(
			"/",
			SporkHono()
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
			SporkHono().use(
				HonoGuardAuthentication(async ({ principal }) => {
					return principal.$case !== "admin";
				}),
			),
		),
);
