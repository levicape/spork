import type { Context, MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import type { JwtPayload } from "jsonwebtoken";
import { jwtTools } from "../../../../server/security/JwtTools.js";
import { LoginToken } from "../../../../server/security/model/LoginToken.js";
import { SecurityRoles } from "../../../../server/security/model/Security.js";

export const HonoHttpAuthenticationBearerPrincipal =
	"HonoHttpAuthenticationBearerPrincipal" as const;
export type HonoHttpAuthenticationBearerContext = {
	principal:
		| {
				$case: "anonymous";
				value: undefined;
		  }
		| {
				$case: "user";
				value: LoginToken;
		  }
		| {
				$case: "admin";
				value: LoginToken;
		  };
};

export const HonoHttpAuthenticationBearer = () => {
	return bearerAuth({
		verifyToken: async (token, c) => {
			return await HonoHttpAuthenticationDerive(token, c);
		},
	});
};

export const HonoHttpAuthenticationDerive = async (
	token: string,
	context: Context,
): Promise<boolean> => {
	let jwt: JwtPayload | undefined;
	let unparseable = false;
	if (token) {
		try {
			jwt = await jwtTools.verify(token, "ACCESS");

			switch (jwt.aud) {
				case "admin":
					context.set(HonoHttpAuthenticationBearerPrincipal, {
						$case: "admin",
						value: new LoginToken(
							"admin",
							[SecurityRoles.LOGIN, SecurityRoles.REGISTERED],
							Date.now().toString(),
							"localhost",
						),
					});
					break;
				default:
					context.set(HonoHttpAuthenticationBearerPrincipal, {
						$case: "user",
						value: new LoginToken(
							jwt.sub ?? "",
							[
								// TODO:
								SecurityRoles.LOGIN,
							],
							Date.now().toString(),
							"localhost",
						),
					});
					break;
			}
		} catch (e) {
			unparseable = true;
		}
	}

	if (!jwt) {
		context.set(HonoHttpAuthenticationBearerPrincipal, {
			$case: "anonymous",
			value: undefined,
		});
	}

	return !unparseable;
};
