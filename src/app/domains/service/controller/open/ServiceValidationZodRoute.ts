import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";

export const ServiceValidationZodSchema = z.literal("sesame");

export const ServiceValidationZodRoute = () => (app: Hono) => {
	return app.get(
		"/open",
		zValidator("query", ServiceValidationZodSchema, (result, c) => {
			if (!result.success) {
				return c.json({
					message: "you shall not pass",
					result,
				});
			}

			return c.json({
				message: "you may pass",
				result,
			});
		}),
	);
};

export const serviceValidationZodRoute = ServiceValidationZodRoute();
export type ServiceValidationZodRouteProtocol = ReturnType<
	typeof serviceValidationZodRoute
>;
