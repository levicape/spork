import { Logger } from "../../../server/logging/Logger.js";

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
	return humanize([delta < 1e3 ? `${delta}ms` : `${Math.round(delta / 1e3)}s`]);
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
function before(
	fn: {
		// biome-ignore lint/suspicious/noExplicitAny:
		(...data: any[]): void;
		(message?: string, ...optionalParams: string[]): void;
		(...data: string[]): void;
		(message?: string, ...optionalParams: string[]): void;
		(arg0: string): void;
	},
	method: string,
	path: string,
	status = 0,
	elapsed?: string,
) {
	fn({
		HonoRequestLogger: {
			request: {
				method,
				path,
			},
		},
	});
}

function after(
	fn: {
		// biome-ignore lint/suspicious/noExplicitAny:
		(...data: any[]): void;
		(message?: string, ...optionalParams: string[]): void;
		(...data: string[]): void;
		(message?: string, ...optionalParams: string[]): void;
		(arg0: string): void;
	},
	method: string,
	path: string,
	status = 0,
	elapsed?: string,
) {
	fn({
		HonoRequestLogger: {
			response: { method, path, status, elapsed },
		},
	});
}

export const HonoRequestLogger = (fn = Logger.request) => {
	return async function logger2(
		c: {
			req: { raw: { url: string }; method: string };
			res: { status: number | undefined };
		},
		next: () => unknown,
	) {
		const { method } = c.req;
		const path = getPath(c.req.raw);
		before(fn, method, path, undefined, undefined);
		const start: number = Date.now();
		await next();
		after(fn, method, path, c.res.status, timed(start));
	};
};
