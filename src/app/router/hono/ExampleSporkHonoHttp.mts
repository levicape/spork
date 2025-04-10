import { createFactory } from "hono/factory";
import { SporkHonoHttpServer } from "./HonoHttpServerBuilder.mjs";
import type { DefaultHonoHttpMiddleware } from "./middleware/HonoHttpMiddleware.mjs";

export const { server, handler } = await SporkHonoHttpServer(
	createFactory<DefaultHonoHttpMiddleware>(),
	(app) => {
		let news = app.get("/test123", async (c) => {
			c.get("Logging")?.info("Hello, world!");
			c.json({ message: `Hello, ${c?.env ?? ""}!` });
		});
		return news;
	},
);
// 	(
// 	// (app) => {
// 	// 	return app.get("/test123", async (c) => {
// 	// 		// c.get("Logging")?.info("Hello, world!");
// 	// 		c.json({ message: `Hello, ${Hono.name}!` });
// 	// 	});
// 	// 	// .route(
// 	// 	// 	"/!",
// 	// 	// 	new Hono().get("/abba", (c) => c.json("Hello, world!")),
// 	// 	// )
// 	// 	// .route("/!/v1/Authenticated/", AuthenticatedRouter());
// 	// },
// );

export type ExampleSporkHonoApp = typeof server.app;

/*


the typing for Hono is actually Hono<Env, Schema, Path>, but for middleware it's Middleware<Env, Path, Input>

*/
