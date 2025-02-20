import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";

export const ServiceValidationZodSchema = z.literal("sesame");

export const ServiceValidationZodRoute = <App extends Hono>(app: App) => {
	return app.get(
		"/open",
		zValidator("query", ServiceValidationZodSchema),
		(c) => {
			return c.json({
				message: "you may pass",
				query: c.req.valid("query"),
			});
		},
	);
};
