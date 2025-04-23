import { createMiddleware } from "hono/factory";
import type { JWTPayload, SignJWT } from "jose";
import {
	JwtSignatureAsyncLocalStorage,
	type JwtSignatureInterface,
	JwtSignatureNoop,
} from "../../../../server/security/JwtSignature.mjs";
import { HonoLoggingStorage } from "../log/HonoLoggingContext.mjs";

export type HonoJwtIssuerProps<Token extends JWTPayload> = {
	/**
	 * The JWT signature interface. If not provided, the default JWT signature function will be used.
	 * @default JwtSignatureJose
	 * @see {@link JwtSignatureLayerConfig}
	 */
	jwtSignature?: JwtSignatureInterface<Token>;
	/**
	 * Initializer for tokens created by this middleware.
	 */
	initializeToken?: (token: Exclude<SignJWT, "sign">) => SignJWT;
};

export type HonoJwtIssuer<Token extends JWTPayload> = {
	Variables: {
		JwtSignature: Omit<JwtSignatureInterface<Token>, "initializeToken">;
	};
};

/**
 * Middleware for Hono that provides JWT issuance.
 * @requires `JwtSignatureInterface`
 */
export function HonoHttpJwtIssuerMiddleware<Token extends JWTPayload>(
	props?: HonoJwtIssuerProps<Token>,
) {
	const { logging } = HonoLoggingStorage.getStore() ?? {};
	let jwtSignature: JwtSignatureInterface<Token>;
	if (props?.jwtSignature) {
		logging?.debug("Building HonoHttpJwtIssuer with custom jwtSign function");
		jwtSignature = props.jwtSignature;
	} else {
		const store = JwtSignatureAsyncLocalStorage.getStore();
		if (store !== undefined && store.JwtSignature !== undefined) {
			logging?.debug("Building HonoHttpJwtIssuer with default jwtSignature");
		} else {
			logging?.warn(
				"Building HonoHttpJwtIssuer with default jwtSignature but no store found. This feature is only supported within a HonoHttpServer app",
			);
		}
		jwtSignature =
			(store?.JwtSignature as unknown as JwtSignatureInterface<Token>) ??
			new JwtSignatureNoop<Token>();
	}

	jwtSignature.initializeToken = props?.initializeToken;

	return createMiddleware<HonoJwtIssuer<Token>>(async (context, next) => {
		context.set("JwtSignature", jwtSignature);
		await next();
	});
}
