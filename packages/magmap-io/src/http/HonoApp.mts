import { SporkHonoHttpServer } from "@levicape/spork/hono";
import { HonoGuardAuthentication } from "@levicape/spork/hono/guard/HonoHttpGuard";
import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import type {
	ApiGatewayRequestContextV2,
	LambdaContext,
	LambdaEvent,
} from "hono/aws-lambda";
import { env } from "std-env";
import { HTTP_BASE_PATH } from "./Atlas.mjs";

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

export const { server, stream } = await SporkHonoHttpServer((app) =>
	app
		.use(
			rateLimiter({
				windowMs: 2 * 60 * 1000, // 2 minutes
				limit: 300, //
				standardHeaders: "draft-7",
				keyGenerator: SporkRateLimiterKeyGenerator,
			}),
		)
		.basePath(HTTP_BASE_PATH)
		.get(
			"/test123",
			HonoGuardAuthentication(() => Promise.resolve(true)),
			async (c) => {
				return c.json({ message: `Hello, world!` });
			},
		),
);

export type MagmapHonoApp = typeof server.app;
