import { SporkHonoHttpServer } from "@levicape/spork/hono";
import { HonoGuardAuthentication } from "@levicape/spork/hono/guard/HonoHttpGuard";
import { Hono } from "hono/quick";
import { HTTP_BASE_PATH } from "./Atlas.mjs";

export const { server, handler } = await SporkHonoHttpServer(
	(app) =>
		app.basePath(HTTP_BASE_PATH).get(
			"/test123",
			HonoGuardAuthentication(() => Promise.resolve(true)),
			async (c) => {
				return c.json({ message: `Hello, ${Hono.name}!` });
			},
		),
	// .get("/test1234", async (c) => c.json({ message: `Hello, ${Hono.name}!` })),
);
export type MagmapHonoApp = typeof server.app;
