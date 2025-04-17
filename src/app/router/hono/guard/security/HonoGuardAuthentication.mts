import { createMiddleware } from "hono/factory";
import type { JWTPayload } from "jose";
import VError from "verror";
import type { HonoHttp } from "../../middleware/HonoHttpMiddleware.mjs";
import type { HonoHttpAuthentication } from "../../middleware/security/HonoAuthenticationBearer.mjs";
import {
	type HonoHttpAuthenticationBearerContext,
	HonoHttpAuthenticationBearerPrincipal,
} from "../../middleware/security/HonoAuthenticationBearer.mjs";

export function HonoGuardAuthentication<Token extends JWTPayload = JWTPayload>(
	guard: (
		context: HonoHttpAuthenticationBearerContext<Token>,
	) => Promise<boolean>,
) {
	return createMiddleware<HonoHttp & HonoHttpAuthentication<Token>>(
		async (context, next) => {
			const principal = context.get(HonoHttpAuthenticationBearerPrincipal);

			context.var.Logging?.withMetadata({
				HonoGuardAuthentication: {
					principal,
				},
			});

			if (principal) {
				const authenticated = await guard({ principal });
				if (authenticated) {
					return next();
				}
				return context.json(
					{
						error: {
							code: "PrincipalNotAuthenticated",
						},
					},
					401,
				);
			}

			throw new VError("No principal to authenticate");
		},
	);
}
