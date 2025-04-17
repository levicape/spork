import { zValidator } from "@hono/zod-validator";
import { HonoHttpServer } from "@levicape/spork/router/hono/HonoHttpServer";
import { HonoGuardAuthentication } from "@levicape/spork/router/hono/guard/security/HonoGuardAuthentication";
import type { HonoHttp } from "@levicape/spork/router/hono/middleware/HonoHttpMiddleware";
import {
	type HonoHttpAuthentication,
	HonoHttpAuthenticationMiddleware,
} from "@levicape/spork/router/hono/middleware/security/HonoAuthenticationBearer";
import { JwtClaimsCognitoTokenUse } from "@levicape/spork/server/security/claims/JwtClaimsCognito";
import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import type {
	ApiGatewayRequestContextV2,
	LambdaContext,
	LambdaEvent,
} from "hono/aws-lambda";
import { createFactory } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { deserializeError, serializeError } from "serialize-error";
import { env } from "std-env";
import { z } from "zod";
import { HTTP_BASE_PATH, MagmapRoutemap } from "./Atlas.mjs";
// import { getConnInfo } from "@hono/node-server/conninfo";

const getConnInfo = (c: Parameters<typeof SporkRateLimiterKeyGenerator>[0]) => {
	const bindings = c.env.server ? c.env.server : c.env;
	const address = bindings.incoming.socket.remoteAddress;
	const port = bindings.incoming.socket.remotePort;
	const family = bindings.incoming.socket.remoteFamily;
	return {
		remote: {
			address,
			port,
			addressType:
				family === "IPv4" ? "IPv4" : family === "IPv6" ? "IPv6" : void 0,
		},
	};
};
const SporkRateLimiterKeyGenerator = (
	c: Context<{
		Bindings: {
			event: LambdaEvent;
			lambdaContext: LambdaContext;
		} & {
			server: {
				incoming: {
					socket: {
						remoteAddress: string;
						remotePort: number;
						remoteFamily: string;
					};
				};
			};
		} & {
			incoming: {
				socket: {
					remoteAddress: string;
					remotePort: number;
					remoteFamily: string;
				};
			};
		};
	}>,
) => {
	// use config
	const { AWS_LAMBDA_FUNCTION_NAME } = env;
	if (AWS_LAMBDA_FUNCTION_NAME) {
		const context = c.env.event.requestContext as ApiGatewayRequestContextV2;
		const { http } = context ?? {
			http: {
				sourceIp: "_IP_",
				path: "_PATH_",
				method: "_METHOD_",
			},
		};
		return `${http.sourceIp}+${http.path}+${http.method}`;
	}

	const info = getConnInfo(c);
	return info.remote.address || "unknown";
};

export const { server, stream } = await HonoHttpServer(
	createFactory<HonoHttp & HonoHttpAuthentication>({
		initApp(app) {
			app.use(
				rateLimiter({
					windowMs: 2 * 60 * 1000, // 2 minutes
					limit: 300, //
					standardHeaders: "draft-7",
					keyGenerator: SporkRateLimiterKeyGenerator,
				}),
			);
			app.use(
				HonoHttpAuthenticationMiddleware((_token) => {
					return true;
				}, JwtClaimsCognitoTokenUse("access")),
			);
		},
	}),
	(app) =>
		app
			.basePath(HTTP_BASE_PATH)
			.get("/anon", async (c) => {
				return c.json({
					data: {
						magmap: {
							atlas: {
								routes: "elo",
							},
						},
					},
				});
			})
			.use(
				HonoGuardAuthentication(async ({ principal }) => {
					return principal.$case !== "anonymous";
				}),
			)
			.get("/atlas", async (c) => {
				return c.json({
					data: {
						magmap: {
							atlas: {
								routes: MagmapRoutemap,
							},
						},
					},
				});
			})
			.post(
				"/atlas/routes/!/status",
				zValidator(
					"query",
					z.object({
						route: z.string(),
					}),
				),
				async (c) => {
					let { route } = c.req.valid("query");
					if (MagmapRoutemap[route as "/~/Spork/Magmap"] === undefined) {
						throw new HTTPException(200, {
							res: new Response(
								JSON.stringify({
									error: {
										message: `Route ${route} not found`,
										code: "RouteNotFound",
									},
								}),
								{
									headers: { "Content-Type": "application/json" },
								},
							),
						});
					}
					let liveness: Error | Response = await fetch(
						MagmapRoutemap[route as "/~/Spork/Magmap"].instance(),
					).catch((e) => {
						c.var.Logging?.withMetadata({
							AtlasRoutes: {
								status: {
									error: serializeError(e),
								},
							},
						}).error(`Error fetching liveness for route ${route}: ${e}`);
						return deserializeError(e);
					});

					return c.json({
						data: {
							magmap: {
								atlas: {
									[route]: {
										liveness:
											liveness instanceof Response
												? {
														status: liveness.status,
														statusText: liveness.statusText,
													}
												: liveness,
									},
								},
							},
						},
					});
				},
			),
);

export type MagmapHonoApp = typeof server.app;
