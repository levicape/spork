import { bearerAuth } from "hono/bearer-auth";

export const HonoHttpAuthentication = () => {
	return bearerAuth({
		verifyToken: async (token, c) => {
			return true;
		},
	});
};

// Load Signing Key from JWTTools
// Extract JWT from Bearer
// Add prinicpal to context
/*
		.derive(
			{ as: "global" },
			async function principalFromBearerToken({ jwt, bearer, headers }) {
				const validation = await jwt.verify(bearer);
				if (validation === false) {
					if (headers.leaftoken === thetoken) {
						return {
							principal: {
								$case: "admin",
								value: new LoginToken(
									"admin",
									[SecurityRoles.LOGIN, SecurityRoles.REGISTERED],
									Date.now().toString(),
									"localhost",
								),
							},
						};
					}

					return {
						principal: {
							$case: "anonymous",
							value: undefined,
						},
					};
				}

				if (validation.aud === "admin") {
					// TODO: RBAC
					return {
						principal: {
							$case: "admin",
							value: new LoginToken(
								validation.sub ?? "",
								[SecurityRoles.LOGIN, SecurityRoles.REGISTERED],
								Date.now().toString(),
								"localhost",
							),
						},
					};
				}

				return {
					principal: {
						$case: "user",
						value: new LoginToken(
							validation.sub ?? "",
							[
								// TODO:
								SecurityRoles.LOGIN,
							],
							Date.now().toString(),
							"localhost",
						),
					},
				};
			},
		);

*/
