import type { Context } from "hono";
import type { JWTPayload } from "jose";
import type { ILogLayer } from "loglayer";
import { type ErrorLike, serializeError } from "serialize-error";
import {
	JwtVerificationAsyncLocalStorage,
	type JwtVerificationInterface,
	JwtVerificationNoop,
} from "../../../../server/security/JwtVerification.mjs";
import type { HonoHttp } from "../HonoHttpMiddleware.mjs";
import { HonoLoggingStorage } from "../log/HonoLoggingContext.mjs";
import { __internal_HonoBearerAuth } from "./HonoBearerAuth.mjs";

export type HonoHttpAuthenticationError = {
	code: "invalid_token";
} & Omit<ErrorLike, "code">;

export const isHonoHttpAuthenticationError = (
	error: unknown,
): error is HonoHttpAuthenticationError => {
	if ((error as HonoHttpAuthenticationError).code === "invalid_token") {
		return true;
	}
	return false;
};

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

export type HonoHttpAuthenticationHandler = (
	token: JWTPayload,
) => boolean | Promise<boolean>;

type HttpAuthenticationContext<Token extends JWTPayload> = Context<
	HonoHttp & HonoHttpAuthentication<Token>
>;

export function HonoHttpAuthenticationDerive<
	Token extends JWTPayload,
	HonoContext extends Context<HonoHttp & HonoHttpAuthentication<Token>>,
>({
	jwtVerification,
	hook,
	onError,
	logging,
}: {
	/**
	 * Advanced usage only. Override the JWT verification interface. If not provided, the default verifyJWT will be used.
	 * @default JwtVerificationJose
	 * @see `JwtVerificationLayerConfig`
	 */
	jwtVerification?: JwtVerificationInterface;
	hook?: Array<HonoHttpAuthenticationHandler>;
	onError?: (
		context: HonoContext,
		error: HonoHttpAuthenticationError,
	) => Promise<void>;
	logging?: ILogLayer;
}) {
	return async function HonoVerifyTokenDerivation(
		token: string | undefined,
		context: HonoContext,
	): Promise<boolean> {
		let jwt: JWTPayload | undefined;
		let unparseable: boolean | string = false;
		let error: unknown | undefined;
		let requestLogger = context.var.Logging ?? logging;

		if (token) {
			try {
				jwt = (await jwtVerification?.jwtVerify?.(token, {}))?.payload;

				if (jwt) {
					let valid = true;
					for (const check of hook ?? []) {
						if (valid) {
							valid = await check(jwt);
						}
					}
					if (!valid) {
						throw {
							code: "invalid_token",
						} as HonoHttpAuthenticationError;
					}

					context.set(HonoHttpAuthenticationBearerPrincipal, {
						$case: "authenticated",
						value: jwt as Token,
					});

					requestLogger?.withContext({
						HonoAuthenticationBearer: {
							principal: jwt.sub,
						},
					});
				}
			} catch (exception) {
				jwt = undefined;
				error = serializeError(exception);
				unparseable = typeof error === "string" ? error : true;

				if (onError) {
					await onError(context, exception as HonoHttpAuthenticationError);
				}
			}
		}

		if (error) {
			requestLogger
				?.withMetadata({
					HonoAuthenticationBearer: {
						jwt,
						unparseable,
					},
					error,
				})
				.warn("Error parsing request jwt");
			return false;
		}

		if (!jwt) {
			context.set(HonoHttpAuthenticationBearerPrincipal, {
				$case: "anonymous",
				value: undefined,
			});
		}

		return true;
	};
}

export type HonoHttpAuthentication<Token extends JWTPayload = JWTPayload> = {
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
 * This middleware will provide a JwtSignature in context and also parse the current Authentication header
 * By default, requests without a JWT are not rejected unless any hook handler returns false.
 * To secure an endpoint, please use `HonoHttpAuthenticationGuard` to check the value of the principal.
 * @requires `JwtVerificationInterface`
 * @see `HonoHttpAuthenticationGuard`
 */
export function HonoHttpAuthenticationMiddleware<
	Token extends JWTPayload = JWTPayload,
>(...hook: Array<HonoHttpAuthenticationHandler>) {
	const { logging } = HonoLoggingStorage.getStore() ?? {};
	let jwtVerification: JwtVerificationInterface;
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

	const derive = HonoHttpAuthenticationDerive<
		Token,
		HttpAuthenticationContext<Token>
	>({
		hook,
		logging,
		jwtVerification,
	});
	return __internal_HonoBearerAuth<Token>({
		jwtVerification,
		verifyToken: async function HonoVerifyToken(
			token,
			c: HttpAuthenticationContext<Token>,
		) {
			c.set("JwtVerification", jwtVerification);
			return await derive(token, c);
		},
	});
}
