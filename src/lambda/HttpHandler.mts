import type { Hono } from "hono";
import { type LambdaContext, type LambdaEvent, handle } from "hono/aws-lambda";
import { HonoHttpApp } from "../app/router/hono/HonoHttpApp.js";
import { HonoHttpServerBuilder } from "../app/router/hono/HonoHttpServerBuilder.js";
import { HonoHttpMiddlewareStandard } from "../app/router/hono/middleware/HonoHttpMiddleware.js";

export type LambdaBindings = {
	event: LambdaEvent;
	lambdaContext: LambdaContext;
};

// let { getLambdaContext, setLambdaContext }: HonoLambdaContext | undefined;
const server: Hono = (
	await HonoHttpServerBuilder({
		app: HonoHttpApp({
			// TODO: Lambda middleware
			middleware: [
				...HonoHttpMiddlewareStandard(),
				// setLambdaContext
			],
		}),
	})({
		catchExceptions: false,
	})
).app;

export const handler = async (
	event: LambdaEvent,
	lambdaContext: LambdaContext,
) => {
	// if (server === undefined) {
	// 	server =
	// }

	// Update the context
	return handle(server);
};
