import type { SporkHonoApp } from "@levicape/spork/hono";
import { showRoutes } from "hono/dev";
// import { NONCE, secureHeaders } from "hono/secure-headers";
import { createApp } from "honox/server";

// @ts-ignore
const _: SporkHonoApp | undefined = undefined;

// Top level async is not supported in browsers
// export const { server, handler } = await SporkHonoHttpServer(
// 	(app) =>
// 		app.use(

const app = createApp();

if (process.env.NODE_ENV === "development") {
	// @ts-ignore
	showRoutes(app);
}
export default app;
