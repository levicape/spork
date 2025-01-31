import type { ILogLayer } from "loglayer";

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
function getColorEnabled() {
	const { process } = globalThis;
	const isNoColor = process !== undefined ? "NO_COLOR" in process.env : false;
	return !isNoColor;
}
const humanize = (times: string[]) => {
	const [delimiter, separator] = [",", "."];
	const orderTimes = times.map((v: string) =>
		v.replace(/(\d)(?=(\d\d\d)+(?!\d))/g, `$1${delimiter}`),
	);
	return orderTimes.join(separator);
};
const timed = (start: number) => {
	const delta = Date.now() - start;
	return delta;
};
const colorStatus = (status: number) => {
	const colorEnabled = getColorEnabled();
	if (colorEnabled) {
		switch ((status / 100) | 0) {
			case 5:
				return `\x1B[31m${status}\x1B[0m`;
			case 4:
				return `\x1B[33m${status}\x1B[0m`;
			case 3:
				return `\x1B[36m${status}\x1B[0m`;
			case 2:
				return `\x1B[32m${status}\x1B[0m`;
		}
	}
	return `${status}`;
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
	// TODO: use Hono context logger
	const logger = props.logger;
	return async function logger2(
		c: {
			req: { raw: { url: string }; method: string };
			res: { status: number | undefined };
		},
		next: () => unknown,
	) {
		const { method } = c.req;
		const path = getPath(c.req.raw);
		// TODO: Include request id
		const log = logger.withPrefix(`[${method}] ${path}`);

		before(log.withMetadata.bind(logger), method, path);
		const start: number = Date.now();
		await next();
		after(
			log.withMetadata.bind(logger),
			method,
			path,
			c.res.status,
			timed(start),
		);
	};
};
