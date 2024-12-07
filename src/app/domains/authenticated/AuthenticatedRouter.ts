import { Hono } from "hono";
import type { HonoHttpApp } from "../../router/hono/HonoHttpApp.js";
import { HonoGuardAuthentication } from "../../router/hono/guard/security/HonoGuardAuthentication.js";
import { AuthenticatedHandler } from "./controller/AuthenticatedHandler.js";

export const AuthenticatedRouter = () =>
	(new Hono() as ReturnType<typeof HonoHttpApp>)
		.route(
			"/admin",
			(new Hono() as ReturnType<typeof HonoHttpApp>)
				.use(
					HonoGuardAuthentication(async ({ principal }) => {
						return principal.$case === "admin";
					}),
				)
				.get("/hello", AuthenticatedHandler()),
		)
		.route(
			"/user",
			(new Hono() as ReturnType<typeof HonoHttpApp>)
				.use(
					HonoGuardAuthentication(async ({ principal }) => {
						return principal.$case === "admin";
					}),
				)
				.get("/hello", AuthenticatedHandler()),
		)
		.route(
			"/guest",
			(new Hono() as ReturnType<typeof HonoHttpApp>)
				.use(
					HonoGuardAuthentication(async ({ principal }) => {
						return principal.$case === "anonymous";
					}),
				)
				.get("/hello", AuthenticatedHandler()),
		)
		.get("/hello", AuthenticatedHandler());
