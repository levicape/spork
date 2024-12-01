import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";

export const WellknownHealthcheckRoute = () => (app: Hono) => {
	return app.get("/healthcheck", (c) => {
		return c.json({
			health: "ok",
		});
	});
};
export const wellknownHealthcheckRoute = WellknownHealthcheckRoute();
