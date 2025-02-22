import { subtle } from "node:crypto";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import VError from "verror";
import type { JwtTools } from "../../../../server/security/Jwt.mjs";
import type { HonoHttpAuthenticationBearerContext } from "./HonoAuthenticationBearer.mjs";

// TODO: Use unenv crypto to support LLRT

type MessageFunction = (
	c: Context,
) => string | object | Promise<string | object>;

type BearerAuthOptions = (
	| {
			token: string | string[];
			realm?: string;
			prefix?: string;
			headerName?: string;
			hashFunction?: Function;
			noAuthenticationHeaderMessage?: string | object | MessageFunction;
			invalidAuthenticationHeaderMessage?: string | object | MessageFunction;
			invalidTokenMessage?: string | object | MessageFunction;
	  }
	| {
			realm?: string;
			prefix?: string;
			headerName?: string;
			verifyToken: (
				token: string | undefined,
				c: Context,
			) => boolean | Promise<boolean>;
			hashFunction?: Function;
			noAuthenticationHeaderMessage?: string | object | MessageFunction;
			invalidAuthenticationHeaderMessage?: string | object | MessageFunction;
			invalidTokenMessage?: string | object | MessageFunction;
	  }
) & { jwtTools: JwtTools };

const TOKEN_STRINGS = "[A-Za-z0-9._~+/-]+=*";
const PREFIX = "Bearer";
const HEADER = "Authorization";

type Algorithm = {
	name: string;
	alias: string;
};

type Data = string | boolean | number | ArrayBufferView | ArrayBuffer;

const sha256 = async (data: Data): Promise<string | null> => {
	const algorithm: Algorithm = { name: "SHA-256", alias: "sha256" };
	const hash = await createHash(data, algorithm);
	return hash;
};

const createHash = async (
	data: Data,
	algorithm: Algorithm,
): Promise<string | null> => {
	let sourceBuffer: ArrayBufferView | ArrayBuffer;

	if (ArrayBuffer.isView(data) || data instanceof ArrayBuffer) {
		sourceBuffer = data;
	} else {
		if (typeof data === "object") {
			data = JSON.stringify(data);
		}
		sourceBuffer = new TextEncoder().encode(String(data));
	}

	if (subtle) {
		const buffer = await subtle.digest(
			{
				name: algorithm.name,
			},
			sourceBuffer as ArrayBuffer,
		);
		const hash = Array.prototype.map
			.call(new Uint8Array(buffer), (x) => `00${x.toString(16)}`.slice(-2))
			.join("");
		return hash;
	}
	return null;
};
const timingSafeEqual = async (
	a: string | object | boolean,
	b: string | object | boolean,
	hashFunction?: Function,
): Promise<boolean> => {
	if (!hashFunction) {
		hashFunction = sha256;
	}

	const [sa, sb] = await Promise.all([hashFunction(a), hashFunction(b)]);

	if (!sa || !sb) {
		return false;
	}

	return sa === sb && a === b;
};

export type HonoBearerAuthMiddleware = {
	Variables: {
		JwtTools: JwtTools;
		HonoHttpAuthenticationBearerPrincipal: HonoHttpAuthenticationBearerContext["principal"];
	};
};

/**
 * Bearer Auth Middleware for Hono. Forked from original middleware.
 *
 * @see {@link https://hono.dev/docs/middleware/builtin/bearer-auth}
 *
 */
export const HonoBearerAuth = (options: BearerAuthOptions) => {
	if (!("token" in options || "verifyToken" in options)) {
		throw new VError('bearer auth middleware requires options for "token"');
	}
	if (!options.realm) {
		options.realm = "";
	}
	if (options.prefix === undefined) {
		options.prefix = PREFIX;
	}

	// const realm = options.realm?.replace(/"/g, '\\"')
	const prefixRegexStr = options.prefix === "" ? "" : `${options.prefix} +`;
	const regexp = new RegExp(`^${prefixRegexStr}(${TOKEN_STRINGS}) *$`);
	const wwwAuthenticatePrefix =
		options.prefix === "" ? "" : `${options.prefix} `;

	const throwHTTPException = async (
		c: Context,
		status: ContentfulStatusCode,
		wwwAuthenticateHeader: string,
		messageOption: string | object | MessageFunction,
	): Promise<Response> => {
		const headers = {
			"WWW-Authenticate": wwwAuthenticateHeader,
		};
		const responseMessage =
			typeof messageOption === "function"
				? await messageOption(c)
				: messageOption;
		const res =
			typeof responseMessage === "string"
				? new Response(responseMessage, { status, headers })
				: new Response(JSON.stringify(responseMessage), {
						status,
						headers: {
							...headers,
							"content-type": "application/json",
						},
					});
		throw new HTTPException(status, { res });
	};

	return createMiddleware<HonoBearerAuthMiddleware>(
		async function BearerAuth(c, next) {
			const headerToken = c.req.header(options.headerName || HEADER);
			c.set("JwtTools", options.jwtTools);

			let equal = false;
			if (!headerToken) {
				// No Authorization header
				// await throwHTTPException(
				//   c,
				//   401,
				//   `${wwwAuthenticatePrefix}realm="${realm}"`,
				//   options.noAuthenticationHeaderMessage || 'Unauthorized'
				// )
				if ("verifyToken" in options) {
					equal = await options.verifyToken(undefined, c);
				}
			} else {
				const match = regexp.exec(headerToken);
				if (!match) {
					// Invalid Request
					await throwHTTPException(
						c,
						400,
						`${wwwAuthenticatePrefix}error="invalid_request"`,
						options.invalidAuthenticationHeaderMessage || "Bad Request",
					);
				} else {
					if ("verifyToken" in options) {
						equal = await options.verifyToken(match[1], c);
					} else if (typeof options.token === "string") {
						equal = await timingSafeEqual(
							options.token,
							match[1] ?? String(Date.now()),
							options.hashFunction,
						);
					} else if (Array.isArray(options.token) && options.token.length > 0) {
						for (const token of options.token) {
							if (
								await timingSafeEqual(
									token,
									match[1] ?? String(Date.now()),
									options.hashFunction,
								)
							) {
								equal = true;
								break;
							}
						}
					}
				}
			}

			if (!equal) {
				// Invalid Token
				await throwHTTPException(
					c,
					401,
					`${wwwAuthenticatePrefix}error="invalid_token"`,
					options.invalidTokenMessage || "Unauthorized",
				);
			}

			await next();
		},
	);
};
