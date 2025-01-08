import {
	HonoGuardAuthentication,
	HonoHttpApp,
	HonoHttpMiddlewareStandard,
	HonoHttpServerBuilder,
} from "@levicape/spork/router/hono";
import { type Context, Hono } from "hono";

const app = () => new Hono() as unknown as ReturnType<typeof HonoHttpApp>;
export const BasicExampleApp = app();

export const BasicExampleRouter = BasicExampleApp.route(
	"/",
	app().use(
		HonoGuardAuthentication(async ({ principal }) => {
			return principal.$case === "user";
		}),
	),
)
	.route(
		"/",
		app().use(
			HonoGuardAuthentication(async ({ principal }) => {
				return principal.$case !== "anonymous";
			}),
		),
	)
	.route(
		"/",
		app()
			.use(
				HonoGuardAuthentication(async ({ principal }) => {
					return principal.$case === "anonymous";
				}),
			)
			.get("/anonymous", async (c: Context) => {
				c.json({ message: "Hello, anonymous!" });
			}),
	)
	.route(
		"/",
		app().use(
			HonoGuardAuthentication(async ({ principal }) => {
				return principal.$case !== "admin";
			}),
		),
	);

export const BasicHonoApp = async () =>
	HonoHttpApp({
		middleware: [...HonoHttpMiddlewareStandard()],
	}).route("/", BasicExampleRouter);

export default HonoHttpServerBuilder({
	app: await BasicHonoApp(),
});
