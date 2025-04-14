import { createMiddleware } from "hono/factory";
import type { ILogLayer } from "loglayer";

const HEALTHCHECK_SAMPLE_PERCENT = 0.08;

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
const ignore = (method: string, path: string) => {
	if (method === "GET" && path === "/.well-known/healthcheck") {
		if (Math.random() < HEALTHCHECK_SAMPLE_PERCENT) {
			return false;
		}
		return true;
	}
	return false;
};
function before(fn: ILogLayer["withMetadata"], method: string, path: string) {
	fn({
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

export type HonoRequestLoggerProps = {
	logger: ILogLayer;
};
export const HonoRequestLogger = (props: HonoRequestLoggerProps) => {
	const logger = props.logger.withPrefix("REQUEST");
	return createMiddleware(async function RequestLogger(c, next) {
		const { method } = c.req;
		const path = getPath(c.req.raw);
		const ignored = ignore(method, path);
		if (ignored) {
			await next();
			return;
		}

		before(logger.withMetadata.bind(logger), method, path);
		const start: number = Date.now();
		await next();
		after(
			logger.withMetadata.bind(logger),
			method,
			path,
			c.res.status,
			timed(start),
		);
	});
};
