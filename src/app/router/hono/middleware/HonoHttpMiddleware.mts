import type { Context, MiddlewareHandler, Next } from "hono";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";
import type { ILogLayer } from "loglayer";
import type { JwtTools } from "../../../server/security/Jwt.mjs";
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

const noop = async (_: Context, next: Next) => {
	await next();
};

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
	jwtTools: JwtTools;
};
export const HonoHttpSecurity = ({ logger, jwtTools }: HonoHttpSecurityProps) =>
	[
		HonoAuthenticationKeypair(),
		HonoHttpAuthenticationBearer({
			logger,
			jwtTools,
		}),
	] as const;

export type HonoHttpMiddlewareStandardLogProps = {
	logger?: ILogLayer;
};

export type HonoHttpMiddlewareStandardProps = HonoHttpSecurityProps &
	HonoHttpMiddlewareStandardLogProps;

export const HonoHttpMiddlewareStandard = (
	props: HonoHttpMiddlewareStandardProps,
): Array<MiddlewareHandler> => {
	const { logger, jwtTools } = props;

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
		// ...(HonoHttpCtxLogger{}),
		...((jwtTools ? HonoHttpSecurity({ logger, jwtTools }) : []) as ReturnType<
			typeof HonoHttpSecurity
		>),
		// ...HonoHttpResponse({
		// 	responseTimeHeader: "X-Response-Time",
		// }),
	];
};

export * from "./exception/Hono404Handler.js";
export * from "./exception/HonoExceptionMiddleware.mjs";
export * from "./log/HonoRequestLogger.mjs";
export * from "./ratelimit/HonoRateLimiter.mjs";
export * from "./request/HonoCors.mjs";
export * from "./request/HonoRequestIdHeader.mjs";
export * from "./response/HonoResponseTimeHeader.mjs";
export * from "./security/HonoAuthenticationBearer.mjs";
export * from "./security/HonoAuthenticationKeypair.mjs";
export * from "./security/HonoBearerAuth.mjs";
