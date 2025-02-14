import type { MiddlewareHandler } from "hono";
export const HonoAuthenticationKeypair = (): MiddlewareHandler => {
	const thetoken = encodeURIComponent(
		"porfavorabracadabraAAAa012392ssSWWWSSwwFFHHTYCEEFGWFBEFBWFBCDewd",
	);

	return async (_, next) => {
		await next();
	};
};

// async function principalFromBearerToken({ jwt, bearer, headers }) {
// 	const validation = await jwt.verify(bearer);
// 	if (validation === false) {
// 		if (headers.leaftoken === thetoken) {
// 			return {
// 				principal: {
// 					$case: "admin",
// 					value: new LoginToken(
// 						"admin",
// 						[SecurityRoles.LOGIN, SecurityRoles.REGISTERED],
// 						Date.now().toString(),
// 						"localhost",
// 					),
// 				},
// 			};
// 		}
