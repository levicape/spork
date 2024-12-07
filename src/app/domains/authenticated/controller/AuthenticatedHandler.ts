import type { Context, Handler } from "hono";
import { HonoHttpAuthenticationBearerPrincipal } from "../../../router/hono/middleware/security/HonoAuthenticationBearer.js";

export const AuthenticatedHandler = (): Handler => {
	return async (context: Context) => {
		const principal = context.get(HonoHttpAuthenticationBearerPrincipal);
		context.json({
			data: {
				authenticated: {
					message: "Hello, authenticated user!",
					principal,
				},
			},
		});
	};
};
