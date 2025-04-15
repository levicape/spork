import type { Context } from "hono";
import type { JwtPayload } from "jsonwebtoken";
import type { ILogLayer } from "loglayer";
import { serializeError } from "serialize-error";
import {
	JwtVerificationAsyncLocalStorage,
	type JwtVerificationInterface,
	JwtVerificationNoop,
} from "../../../../server/security/JwtVerification.mjs";
import { LoginToken } from "../../../../server/security/model/LoginToken.mjs";
import type { HonoHttpMiddlewareContext } from "../HonoHttpMiddleware.mjs";
import { HonoLoggingStorage } from "../log/HonoLoggingContext.mjs";
import { __internal_HonoBearerAuth } from "./HonoBearerAuth.mjs";

export type HonoHttpAuthenticationBearerContext<Token> = {
	principal:
		| {
				$case: "anonymous";
				value: undefined;
		  }
		| {
				$case: "authenticated";
				value: Token;
		  };
};

export type HonoHttpAuthenticationBearerProps = {
	/**
	 *	 The JWT verification function. If not provided, the default JWT verification function will be used.
	 * @default JwtVerificationJose
	 * @see `JwtVerificationLayerConfig`
	 */
	jwtVerification?: JwtVerificationInterface;
};

const JWT_SAMPLE_PERCENT = 0.22;

function HonoHttpAuthenticationDerive<Token>({
	jwtVerification,
	logging,
}: HonoHttpAuthenticationBearerProps & {
	logging?: ILogLayer;
}) {
	return async function HonoVerifyTokenDerivation(
		token: string | undefined,
		context: Context<HonoHttpMiddlewareContext & HonoHttpAuthentication<Token>>,
	): Promise<boolean> {
		let jwt: JwtPayload | undefined;
		let unparseable: boolean | string = false;
		let error: unknown | undefined;

		let requestLogger = context.var.Logging ?? logging;
		if (token) {
			try {
				jwt = await jwtVerification?.jwtVerify?.(token, {});

				// Cognito specific
				// verifyClaims: (jwt) => boolean
				if (jwt?.["payload"]?.["token_use"] !== "access") {
					requestLogger
						?.withMetadata({
							jwt,
						})
						.warn("JwT valid but token_use is not access");

					throw "NOT_ACCESS_TOKEN";
				}

				context.set(HonoHttpAuthenticationBearerPrincipal, {
					$case: "authenticated",
					// TODO: this should be a type guard
					// token: <Token>(jwt) => Token = ((jwt) => LoginToken),
					value: new LoginToken(
						jwt.sub ?? "",
						Date.now().toString(),
						"localhost",
					) as Token,
				});
				requestLogger?.withContext({
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
			requestLogger
				?.withMetadata({
					HonoAuthenticationBearer: {
						jwt,
						unparseable,
						randomset: `${random}/1 < ${JWT_SAMPLE_PERCENT}`,
					},
					error,
				})
				.debug("Parsing request jwt");
		}

		return !unparseable;
	};
}

export type HonoHttpAuthentication<Token = LoginToken> = {
	Variables: {
		JwtVerification: JwtVerificationInterface;
		HonoHttpAuthenticationBearerPrincipal: HonoHttpAuthenticationBearerContext<Token>["principal"];
	};
};
/**
 * HonoHttpAuthenticationBearerPrincipal is the context key for the parsed request principal  (`HonoHttpAuthenticationBearerContext`).
 */
export const HonoHttpAuthenticationBearerPrincipal =
	"HonoHttpAuthenticationBearerPrincipal" as const;

/**
 * Middleware for Hono that provides JWT verification of a bearer token.
 * @requires `JwtVerificationInterface`
 */
export function HonoHttpAuthenticationMiddleware<Token = LoginToken>(
	props?: HonoHttpAuthenticationBearerProps,
) {
	const { logging } = HonoLoggingStorage.getStore() ?? {};
	let jwtVerification: JwtVerificationInterface;
	if (props?.jwtVerification) {
		logging?.debug(
			"Building HonoHttpAuthenticationBearer with custom jwtVerification",
		);
		jwtVerification = props.jwtVerification;
	} else {
		const store = JwtVerificationAsyncLocalStorage.getStore();
		if (store !== undefined) {
			logging?.debug(
				"Building HonoHttpAuthenticationBearer with default jwtVerification",
			);
		} else {
			logging?.warn(
				"Building HonoHttpAuthenticationBearer with default jwtVerification but no store found. This feature is only supported within a HonoHttpServer app",
			);
		}
		jwtVerification = store?.JwtVerification ?? new JwtVerificationNoop();
	}
	const derive = HonoHttpAuthenticationDerive<Token>({
		logging,
		jwtVerification,
	});
	return __internal_HonoBearerAuth<Token>({
		jwtVerification,
		verifyToken: async function HonoVerifyToken(token, c) {
			return await derive(token, c);
		},
	});
}
