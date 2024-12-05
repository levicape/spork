import type { Context, Next } from "hono";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";
import { HonoRequestLogger } from "./log/HonoRequestLogger.js";
import {
	HonoRequestIdHeader,
	HonoRequestIdHeaderStandard,
} from "./request/HonoRequestIdHeader.js";
import {
	HonoResponseTimeHeader,
	HonoResponseTimeHeaderStandard,
} from "./response/HonoResponseTimeHeader.js";
import { HonoHttpAuthentication } from "./security/HonoAuthenticationBearer.js";
import { HonoServiceAuthentication } from "./security/HonoAuthenticationKeypair.js";

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
	requestIdHeader,
}: {
	requestIdHeader?: string;
}) =>
	[
		HonoRequestLogger(),
		HonoRequestIdHeader({
			requestIdHeader: requestIdHeader ?? HonoRequestIdHeaderStandard(),
		}),
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

export const HonoHttpSecurity = () =>
	[HonoServiceAuthentication(), HonoHttpAuthentication()] as const;

export const HonoHttpMiddlewareStandard = () =>
	[
		...HonoHttpCore({
			timeoutMs: 12000,
			secure: true,
			bodyLimitBytes: 64 * 1024,
			compression: true,
			pretty: true,
		}),
		...HonoHttpRequest({}),
		...HonoHttpResponse({}),
		...HonoHttpSecurity(),
	] as const;
