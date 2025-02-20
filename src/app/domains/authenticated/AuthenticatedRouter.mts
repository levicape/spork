import { Hono } from "hono/quick";
import { HonoGuardAuthentication } from "../../router/hono/guard/security/HonoGuardAuthentication.mjs";

export const AuthenticatedRouter = () =>
	new Hono().route(
		"/admin",
		new Hono().get(
			"/hello",
			HonoGuardAuthentication(async ({ principal }) => {
				return principal.$case === "admin";
			}),
			(context) => {
				const principal = context.var.HonoHttpAuthenticationBearerPrincipal;
				return context.json({
					data: {
						authenticated: {
							message: "Hello, authenticated user!",
							principal,
						},
					},
				});
			},
		),
	);
// .route(
// 	"/user",
// 	new Hono()
// 		.use(
// 			HonoGuardAuthentication(async ({ principal }) => {
// 				return principal.$case === "admin";
// 			}),
// 		)
// 		.get("/hello", AuthenticatedHandler()),
// )
// .route(
// 	"/guest",
// 	new Hono()
// 		.use(
// 			HonoGuardAuthentication(async ({ principal }) => {
// 				return principal.$case === "anonymous";
// 			}),
// 		)
// 		.get("/hello", AuthenticatedHandler()),
// )
// .get("/hello", AuthenticatedHandler());
