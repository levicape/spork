import type { Context } from "hono";
import type { JwtPayload } from "jsonwebtoken";
import type { ILogLayer } from "loglayer";
import type { JwtTools } from "../../../../server/security/Jwt.mjs";
import { LoginToken } from "../../../../server/security/model/LoginToken.js";
import { SecurityRoles } from "../../../../server/security/model/Security.js";
import { HonoBearerAuth } from "./HonoBearerAuth.mjs";

const JWT_SAMPLE_PERCENT = 0.22;

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

export type HonoHttpAuthenticationBearerProps = {
	logger?: ILogLayer;
	jwtTools: JwtTools;
};

export const HonoHttpAuthenticationBearerPrincipal =
	"HonoHttpAuthenticationBearerPrincipal" as const;

export const HonoHttpAuthenticationBearer = ({
	logger,
	jwtTools,
}: HonoHttpAuthenticationBearerProps) => {
	const derive = HonoHttpAuthenticationDerive({ logger, jwtTools });
	logger?.debug("Building HonoHttpAuthenticationBearer");
	return HonoBearerAuth({
		jwtTools,
		verifyToken: async function HonoVerifyToken(token, c) {
			return await derive(token, c);
		},
	});
};

export const HonoHttpAuthenticationDerive = ({
	logger,
	jwtTools,
}: HonoHttpAuthenticationBearerProps) =>
	async function HonoVerifyTokenDerivation(
		token: string | undefined,
		context: Context,
	): Promise<boolean> {
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
						logger?.withContext({
							principal: {
								id: "admin",
							},
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
						logger?.withContext({
							principal: {
								id: jwt.sub,
							},
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

		const ignored = Math.random() > JWT_SAMPLE_PERCENT;
		if (unparseable === true || !ignored) {
			logger
				?.withMetadata({
					HonoAuthenticationBearer: {
						jwt,
						unparseable,
						randomset: `${ignored}/1 > ${JWT_SAMPLE_PERCENT}`,
					},
				})
				.debug("Parsing request jwt");
		}

		return !unparseable;
	};
