import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { createMiddleware } from "hono/factory";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";
import type { ILogLayer } from "loglayer";
import type { JwtVerificationInterface } from "../../../server/security/JwtVerification.mjs";
import type { HonoLoglayer } from "./log/HonoLoggingContext.mjs";
import { HonoRequestLogger } from "./log/HonoRequestLogger.mjs";
import {
	HonoRequestIdHeader,
	HonoRequestIdHeaderStandard,
} from "./request/HonoRequestIdHeader.mjs";
import {
	HonoResponseTimeHeader,
	HonoResponseTimeHeaderStandard,
} from "./response/HonoResponseTimeHeader.mjs";
import { HonoHttpAuthenticationBearer } from "./security/HonoAuthenticationBearer.mjs";
import { HonoAuthenticationKeypair } from "./security/HonoAuthenticationKeypair.mjs";
import type { HonoBearerAuthMiddleware } from "./security/HonoBearerAuth.mjs";

const noop = createMiddleware(async (_, next) => {
	await next();
});

export const HonoHttpCore = ({
	timeoutMs,
	secure,
	bodyLimitBytes,
	compression,
	pretty,
}: {
	timeoutMs?: number;
	secure?: boolean;
	bodyLimitBytes?: number;
	compression?: boolean;
	pretty?: boolean;
}) =>
	[
		timeout(timeoutMs ?? 12000),
		secure ? secureHeaders() : noop,
		bodyLimit({
			maxSize: bodyLimitBytes ?? 64 * 1024,
		}),
		compression ? compress() : noop,
		pretty ? prettyJSON() : noop,
	] as const;

export const HonoHttpRequest = ({
	logger,
	requestIdHeader,
}: {
	logger?: ILogLayer;
	requestIdHeader?: string;
}) =>
	[
		HonoRequestIdHeader({
			requestIdHeader: requestIdHeader ?? HonoRequestIdHeaderStandard(),
		}),
		...([logger ? HonoRequestLogger({ logger }) : undefined] as [
			ReturnType<typeof HonoRequestLogger>,
		]),
	] as const;

export const HonoHttpResponse = ({
	responseTimeHeader,
}: {
	responseTimeHeader?: string;
}) =>
	[
		HonoResponseTimeHeader({
			responseTimeHeader:
				responseTimeHeader ?? HonoResponseTimeHeaderStandard(),
		}),
	] as const;

export type HonoHttpSecurityProps = {
	logger?: ILogLayer;
	jwtVerification: JwtVerificationInterface;
};
export const HonoHttpSecurity = ({
	logger,
	jwtVerification,
}: HonoHttpSecurityProps) =>
	[
		HonoAuthenticationKeypair(),
		HonoHttpAuthenticationBearer({
			logger,
			jwtVerification,
		}),
	] as const;

export type HonoHttpMiddlewareStandardProps = HonoHttpSecurityProps;

export type DefaultHonoHttpMiddleware = HonoBearerAuthMiddleware & HonoLoglayer;

export const HonoHttpMiddlewareStandard = (
	props: HonoHttpMiddlewareStandardProps,
) => {
	const { logger, jwtVerification } = props;

	return [
		...HonoHttpCore({
			timeoutMs: 12000,
			secure: true,
			bodyLimitBytes: 64 * 1024,
			compression: true,
			pretty: true,
		}),
		...HonoHttpRequest({
			logger,
		}),
		...((jwtVerification
			? HonoHttpSecurity({ logger, jwtVerification })
			: []) as ReturnType<typeof HonoHttpSecurity>),
		...HonoHttpResponse({
			responseTimeHeader: "X-Response-Time",
		}),
	] as const;
};
