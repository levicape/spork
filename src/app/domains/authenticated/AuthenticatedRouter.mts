import type { Effect } from "effect/Effect";
import { Hono } from "hono";
import type { HonoHttpApp } from "../../router/hono/HonoHttpApp.mjs";
import { HonoGuardAuthentication } from "../../router/hono/guard/security/HonoGuardAuthentication.mjs";
import { AuthenticatedHandler } from "./controller/AuthenticatedHandler.js";

type SporkHonoApp = Effect.Success<ReturnType<typeof HonoHttpApp>>;
export const AuthenticatedRouter = () =>
	(new Hono() as SporkHonoApp)
		// .route(
		// 	"/admin",
		// 	(new Hono() as SporkHonoApp)
		// 		.use(
		// 			HonoGuardAuthentication(async ({ principal }) => {
		// 				return principal.$case === "admin";
		// 			}),
		// 		)
		// 		.get("/hello", AuthenticatedHandler()),
		// )
		// .route(
		// 	"/user",
		// 	(new Hono() as SporkHonoApp)
		// 		.use(
		// 			HonoGuardAuthentication(async ({ principal }) => {
		// 				return principal.$case === "admin";
		// 			}),
		// 		)
		// 		.get("/hello", AuthenticatedHandler()),
		// )
		// .route(
		// 	"/guest",
		// 	(new Hono() as SporkHonoApp)
		// 		.use(
		// 			HonoGuardAuthentication(async ({ principal }) => {
		// 				return principal.$case === "anonymous";
		// 			}),
		// 		)
		// 		.get("/hello", AuthenticatedHandler()),
		// )
		.get("/hello", AuthenticatedHandler());
