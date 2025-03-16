import { createMiddleware } from "hono/factory";
import VError from "verror";
import {
	type HonoHttpAuthenticationBearerContext,
	HonoHttpAuthenticationBearerPrincipal,
} from "../../middleware/security/HonoAuthenticationBearer.mjs";
import type { HonoBearerAuthMiddleware } from "../../middleware/security/HonoBearerAuth.mjs";

export const HonoGuardAuthentication = (
	guard: (context: HonoHttpAuthenticationBearerContext) => Promise<boolean>,
) => {
	return createMiddleware<HonoBearerAuthMiddleware>(async (context, next) => {
		const principal = context.get(HonoHttpAuthenticationBearerPrincipal);
		if (principal) {
			const authenticated = await guard({ principal });
			if (authenticated) {
				return next();
			}
			return context.json(
				{
					error: {
						code: "Unauthorized",
					},
				},
				401,
			);
		}

		throw new VError("No principal to authenticate");
	});
};
