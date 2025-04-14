import { createMiddleware } from "hono/factory";
import VError from "verror";
import type { LoginToken } from "../../../../server/security/model/LoginToken.mjs";
import type { HonoHttpAuthentication } from "../../middleware/security/HonoAuthenticationBearer.mjs";
import {
	type HonoHttpAuthenticationBearerContext,
	HonoHttpAuthenticationBearerPrincipal,
} from "../../middleware/security/HonoAuthenticationBearer.mjs";

export function HonoGuardAuthentication<Token = LoginToken>(
	guard: (
		context: HonoHttpAuthenticationBearerContext<Token>,
	) => Promise<boolean>,
) {
	return createMiddleware<HonoHttpAuthentication<Token>>(
		async (context, next) => {
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
		},
	);
}
