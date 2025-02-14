import { Hono } from "hono";
import { AuthenticatedRouter } from "../../domains/authenticated/AuthenticatedRouter.mjs";
import { SporkHonoHttpServer } from "./HonoHttpServerBuilder.mjs";

export const { server, handler } = await SporkHonoHttpServer((app) =>
	app
		.route(
			"/!/pls",
			new Hono().get("/abba", (c) => c.json("pls")),
		)
		.route("/!/v1/Authenticated/", AuthenticatedRouter()),
);
