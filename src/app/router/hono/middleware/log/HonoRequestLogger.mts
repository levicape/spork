import { AsyncLocalStorage } from "node:async_hooks";
import { createMiddleware } from "hono/factory";
import type { ILogLayer } from "loglayer";
import type { HonoHttp } from "../HonoHttpMiddleware.mjs";

// const HEALTHCHECK_SAMPLE_PERCENT = 0.08;

const tryDecode = (
	str: string,
	decoder: { (encodedURI: string): string; (arg0: string): string },
) => {
	try {
		return decoder(str);
	} catch {
		return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match: string) => {
			try {
				return decoder(match);
			} catch {
				return match;
			}
		});
	}
};
const tryDecodeURI = (str: string) => tryDecode(str, decodeURI);
const getPath = (request: { url: string }) => {
	const url = request.url;
	const start = url.indexOf("/", 8);
	let i = start;
	for (; i < url.length; i++) {
		const charCode = url.charCodeAt(i);
		if (charCode === 37) {
			const queryIndex = url.indexOf("?", i);
			const path = url.slice(start, queryIndex === -1 ? void 0 : queryIndex);
			return tryDecodeURI(
				path.includes("%25") ? path.replace(/%25/g, "%2525") : path,
			);
		}
		if (charCode === 63) {
			break;
		}
	}
	return url.slice(start, i);
};
const timed = (start: number) => {
	const delta = Date.now() - start;
	return delta;
};
function before(fn: ILogLayer["withMetadata"], method: string, path: string) {
	fn({
		$otel: false,
		HonoRequestLoggerRequest: {
			method,
			path,
		},
	}).debug("Request");
}

function after(
	fn: ILogLayer["withMetadata"],
	method: string,
	path: string,
	status = 0,
	elapsed?: number,
) {
	fn({
		HonoRequestLoggerResponse: { method, path, status, elapsed },
	}).info("Response");
}

export const HonoRequestLoggingStorage = new AsyncLocalStorage<{
	logging?: ILogLayer;
}>();

export type HonoRequestLoggerProps = {
	logger: ILogLayer;
};
export const HonoRequestLogger = (props: HonoRequestLoggerProps) => {
	const logger = props.logger.withPrefix("REQUEST");
	return createMiddleware<HonoHttp>(async function RequestLogger(c, next) {
		const { method } = c.req;
		const path = getPath(c.req.raw);
		const requestLogger = c.var.Logging ?? logger;
		const withMetadata = requestLogger.withMetadata.bind(requestLogger);
		before(withMetadata, method, path);
		const start: number = Date.now();

		await HonoRequestLoggingStorage.run({ logging: requestLogger }, () => {
			return next();
		});

		after(withMetadata, method, path, c.res.status, timed(start));
	});
};
