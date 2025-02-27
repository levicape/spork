import type { SporkHonoApp } from "@levicape/spork/hono";
import { Hono } from "hono";
import { showRoutes } from "hono/dev";
import { NONCE, secureHeaders } from "hono/secure-headers";
import { createApp } from "honox/server";

// @ts-ignore
const _: SporkHonoApp | undefined = undefined;

// export const { server, handler } = await SporkHonoHttpServer(
// 	(app) =>
// 		app.use(

// secureHeaders({
// 	contentSecurityPolicy: {
// 	  scriptSrc: [NONCE]
// 	}
//   })
// 		)
// );

const app = createApp({
	app: new Hono().use(
		secureHeaders({
			contentSecurityPolicy: {
				scriptSrc: [NONCE],
			},
		}),
	),
});

showRoutes(app);

export default app;
