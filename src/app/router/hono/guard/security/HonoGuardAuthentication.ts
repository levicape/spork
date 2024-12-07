import type { MiddlewareHandler } from "hono";
import {
	type HonoHttpAuthenticationBearerContext,
	HonoHttpAuthenticationBearerPrincipal,
} from "../../middleware/security/HonoAuthenticationBearer.js";

export const HonoGuardAuthentication = (
	guard: (context: HonoHttpAuthenticationBearerContext) => Promise<boolean>,
): MiddlewareHandler => {
	return async (context, next) => {
		const principal = context.get(
			HonoHttpAuthenticationBearerPrincipal,
		) as HonoHttpAuthenticationBearerContext["principal"];
		if (principal) {
			const authenticated = await guard({ principal });
			if (authenticated) {
				return next();
			}
			context.json(
				{
					error: {
						code: "Unauthorized",
					},
				},
				401,
			);
		}

		throw new Error("No principal to authenticate");
	};
};
