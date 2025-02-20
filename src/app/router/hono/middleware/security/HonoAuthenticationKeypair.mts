import { createMiddleware } from "hono/factory";
export const HonoAuthenticationKeypair = () => {
	const thetoken = encodeURIComponent(
		"porfavorabracadabraAAAa012392ssSWWWSSwwFFHHTYCEEFGWFBEFBWFBCDewd",
	);

	return createMiddleware(async function AuthenticationKeypair(_, next) {
		await next();
	});
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
