import type { Context } from "hono";
import type { JwtPayload } from "jsonwebtoken";
import type { ILogLayer } from "loglayer";
import { serializeError } from "serialize-error";
import type { JwtVerificationInterface } from "../../../../server/security/JwtVerification.mjs";
import { LoginToken } from "../../../../server/security/model/LoginToken.mjs";
import { SecurityRoles } from "../../../../server/security/model/Security.mjs";
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
	jwtVerification: JwtVerificationInterface;
};

export const HonoHttpAuthenticationBearerPrincipal =
	"HonoHttpAuthenticationBearerPrincipal" as const;

export const HonoHttpAuthenticationBearer = ({
	logger,
	jwtVerification,
}: HonoHttpAuthenticationBearerProps) => {
	const derive = HonoHttpAuthenticationDerive({ logger, jwtVerification });
	logger?.debug("Building HonoHttpAuthenticationBearer");
	return HonoBearerAuth({
		jwtVerification,
		verifyToken: async function HonoVerifyToken(token, c) {
			return await derive(token, c);
		},
	});
};

export const HonoHttpAuthenticationDerive = ({
	logger,
	jwtVerification,
}: HonoHttpAuthenticationBearerProps) =>
	async function HonoVerifyTokenDerivation(
		token: string | undefined,
		context: Context,
	): Promise<boolean> {
		let jwt: JwtPayload | undefined;
		let unparseable: boolean | string = false;
		let error: unknown | undefined;

		if (token) {
			try {
				jwt = await jwtVerification.jwtVerify(token, {});

				// Cognito specific
				// verifyClaims: (jwt) => undefined | string
				if (jwt?.["payload"]?.["token_use"] !== "access") {
					logger
						?.withMetadata({
							jwt,
						})
						.warn("JwT valid but token_use is not access");

					throw "NOT_ACCESS_TOKEN";
				}

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
			} catch (e) {
				error = serializeError(e);
				unparseable = typeof e === "string" ? e : true;
			}
		}

		if (!jwt) {
			context.set(HonoHttpAuthenticationBearerPrincipal, {
				$case: "anonymous",
				value: undefined,
			});
		}

		const random = Math.random();
		const ignored = random > JWT_SAMPLE_PERCENT;
		if (unparseable === true || !ignored) {
			logger
				?.withMetadata({
					HonoAuthenticationBearer: {
						jwt,
						unparseable,
						randomset: `${random}/1 > ${JWT_SAMPLE_PERCENT}`,
					},
					error,
				})
				.debug("Parsing request jwt");
		}

		return !unparseable;
	};
