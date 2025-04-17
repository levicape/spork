import { AsyncLocalStorage } from "node:async_hooks";
import { bodyLimit as hono_bodyLimit } from "hono/body-limit";
import { compress as hono_compress } from "hono/compress";
import { createMiddleware } from "hono/factory";
import { prettyJSON as hono_prettyJSON } from "hono/pretty-json";
import { secureHeaders as hono_secureHeaders } from "hono/secure-headers";
import { timeout as hono_timeout } from "hono/timeout";
import type { HonoLoglayer } from "./log/HonoLoggingContext.mjs";
import {
	HonoRequestIdHeader,
	HonoRequestIdHeaderStandard,
} from "./request/HonoRequestIdHeader.mjs";
import {
	HonoResponseTimeHeader,
	HonoResponseTimeHeaderStandard,
} from "./response/HonoResponseTimeHeader.mjs";

const noop = createMiddleware(async (_, next) => {
	await next();
});

export const HonoHttpCore = ({
	timeout,
	secure,
	bodyLimit,
	compress,
	prettyJSON,
}: {
	timeout?: {
		duration: Parameters<typeof hono_timeout>[0];
		exception?: Parameters<typeof hono_timeout>[1];
	};
	secure?: Parameters<typeof hono_secureHeaders>[0] | true;
	bodyLimit?: Parameters<typeof hono_bodyLimit>[0];
	compress?: Parameters<typeof hono_compress>[0] | true;
	prettyJSON?: Parameters<typeof hono_prettyJSON>[0] | true;
}) =>
	[
		timeout
			? hono_timeout(timeout.duration, timeout.exception)
			: (noop as ReturnType<typeof hono_timeout>),
		secure
			? hono_secureHeaders(typeof secure === "boolean" ? undefined : secure)
			: (noop as ReturnType<typeof hono_secureHeaders>),
		bodyLimit ? hono_bodyLimit(bodyLimit) : noop,
		compress
			? hono_compress(typeof compress === "boolean" ? undefined : compress)
			: (noop as ReturnType<typeof hono_compress>),
		prettyJSON
			? hono_prettyJSON(
					typeof prettyJSON === "boolean" ? undefined : prettyJSON,
				)
			: (noop as ReturnType<typeof hono_prettyJSON>),
	] as const;

export const HonoHttpRequest = ({
	requestIdHeader,
}: {
	requestIdHeader?: string;
}) =>
	[
		requestIdHeader
			? HonoRequestIdHeader({
					requestIdHeader,
				})
			: (noop as ReturnType<typeof HonoRequestIdHeader>),
	] as const;

export const HonoHttpResponse = ({
	responseTimeHeader,
}: {
	responseTimeHeader?: string;
}) =>
	[
		responseTimeHeader
			? HonoResponseTimeHeader({
					responseTimeHeader,
				})
			: (noop as ReturnType<typeof HonoResponseTimeHeader>),
	] as const;

export type HonoHttpMiddlewareProps = {
	core?: Parameters<typeof HonoHttpCore>[0];
	request?: Parameters<typeof HonoRequestIdHeader>[0];
	response?: Parameters<typeof HonoResponseTimeHeader>[0];
};

export const HonoHttpMiddlewareCore: HonoHttpMiddlewareProps["core"] = {
	timeout: {
		duration: 12000,
	},
	secure: true,
	bodyLimit: {
		maxSize: 64 * 1024,
	},
	compress: true,
	prettyJSON: true,
} as const;

export type HonoHttp = HonoLoglayer;

export const HonoHttpMiddlewareLocalStorage =
	new AsyncLocalStorage<HonoHttpMiddlewareProps>();

export const HonoHttpMiddleware = () => {
	const props = HonoHttpMiddlewareLocalStorage.getStore();
	const middleware = [
		...HonoHttpCore(props?.core ?? HonoHttpMiddlewareCore),
		...HonoHttpRequest(
			props?.request ?? {
				requestIdHeader: HonoRequestIdHeaderStandard(),
			},
		),
		...HonoHttpResponse(
			props?.response ?? {
				responseTimeHeader: HonoResponseTimeHeaderStandard(),
			},
		),
	] as const;

	return middleware.filter((m) => m !== noop) as unknown as typeof middleware;
};
