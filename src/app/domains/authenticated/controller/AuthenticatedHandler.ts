// import type { Context, Handler } from "hono";
// import { HonoHttpAuthenticationBearerPrincipal } from "../../../router/hono/middleware/security/HonoAuthenticationBearer.mjs";

// export const AuthenticatedHandler = async (context) => {
// 		const principal = context.get(HonoHttpAuthenticationBearerPrincipal);
// 		return context.json({
// 			data: {
// 				authenticated: {
// 					message: "Hello, authenticated user!",
// 					principal,
// 				},
// 			},
// 		});
// 	};
// };
