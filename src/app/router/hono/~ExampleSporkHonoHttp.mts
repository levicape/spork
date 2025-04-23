import { handle, streamHandle } from "hono/aws-lambda";
import { createFactory } from "hono/factory";
import { HonoHttpServer } from "./HonoHttpServer.mjs";
import type { HonoHttp } from "./middleware/HonoHttpMiddleware.mjs";

export const { server } = await HonoHttpServer(
	createFactory<HonoHttp>(),
	(app) => {
		let news = app.get("/test123", async (c) => {
			c.var.Logging?.info("Hello, world!");
			c.json({ message: `Hello, ${c?.env ?? ""}!` });
		});
		return news;
	},
);

export const handler = handle(server.app);
export const stream = streamHandle(server.app) as ReturnType<
	typeof streamHandle
>;

export type ExampleSporkHonoApp = typeof server.app;
