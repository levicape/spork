// import { zValidator } from "@hono/zod-validator";
// import type { Hono } from "hono";
// import { z } from "zod";

// export const ServiceValidationZodSchema = z.literal("sesame");

// export const ServiceValidationZodRoute = () => (app: Hono) => {
// 	return app.post(
// 		"/open",
// 		zValidator("json", ServiceValidationZodSchema, (result, c) => {
// 			if (!result.success) {
// 				throw new Error("Invalid input");
// 			}

// 			return c.json({
// 				message: "you may pass",
// 			});
// 		}),
// 	);
// };

// export const serviceValidationZodRoute = ServiceValidationZodRoute();
// export type ServiceValidationZodRouteProtocol = ReturnType<
// 	typeof serviceValidationZodRoute
// >;
