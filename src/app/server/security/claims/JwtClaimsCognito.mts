import type { JWTPayload } from "jose";
import { HonoLoggingStorage } from "../../../router/hono/middleware/log/HonoLoggingContext.mjs";
import { HonoRequestLoggingStorage } from "../../../router/hono/middleware/log/HonoRequestLogger.mjs";

export type JwtClaimsCognito = {
	/**
	 * The token use type (e.g., access, id).
	 */
	token_use: "access" | "id" | "refresh";
	/**
	 * The username of the user that the token is issued to.
	 */
	username: string;
	/**
	 * The client ID that the token is issued to.
	 */
	client_id: string;
	/**
	 * The authentication method used to authenticate the user.
	 */
	auth_time: number;
	/**
	 * The groups that the user belongs to.
	 */
	"cognito:groups"?: string[];
	/**
	 * The email of the user that the token is issued to.
	 */
	email?: string;
	/**
	 * The email verified status of the user that the token is issued to.
	 */
	"cognito:email_verified"?: boolean;
	/**
	 * The phone number of the user that the token is issued to.
	 *
	 * @deprecated Use `phone_number` instead.
	 */
	"cognito:phone_number_verified"?: boolean;
	/**
	 * The phone number of the user that the token is issued to.
	 */
	phone_number?: string;
};

export const JwtClaimsCognitoTokenUse =
	(token_use: JwtClaimsCognito["token_use"]) =>
	async (jwt: JWTPayload & Partial<JwtClaimsCognito>) => {
		const logger =
			HonoRequestLoggingStorage.getStore()?.logging ??
			HonoLoggingStorage.getStore()?.logging;

		logger
			?.withMetadata({
				jwt,
				token_use,
			})
			.debug("ATOKO Check token_use");

		if (jwt?.["token_use"] !== token_use) {
			logger
				?.withMetadata({
					jwt,
					token_use,
				})
				.warn("JwT valid but token_use is not valid");

			return false;
		}

		return true;
	};
