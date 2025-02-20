import type { Hono } from "hono";

export const WellknownHealthcheckRoute = <App extends Hono>(app: App) => {
	return app.get("/healthcheck", (c) => {
		return c.json({
			health: "ok",
		});
	});
};
