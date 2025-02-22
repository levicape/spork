import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { AuthenticatedRouter } from "../../domains/authenticated/AuthenticatedRouter.mjs";
import { SporkHonoHttpServer } from "./HonoHttpServerBuilder.mjs";

export const { server, handler } = await SporkHonoHttpServer((app) =>
	app
		.basePath("/base")
		.get("/test123", async (c) => {
			c.get("Logging")?.info("Hello, world!");
			c.json({ message: `Hello, ${Hono.name}!` });
		})
		.use(
			createMiddleware<{ Variables: { hol: "up" } }>(async (c, next) => {
				c.set("hol", "up");
				await next();
			}),
		)
		.route(
			"/!",
			new Hono().get("/abba", (c) => c.json("Hello, world!")),
		)
		.route("/!/v1/Authenticated/", AuthenticatedRouter()),
);

export type ExampleSporkHonoApp = typeof server.app;
