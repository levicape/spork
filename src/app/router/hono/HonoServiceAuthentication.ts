import { bearerAuth } from "hono/bearer-auth";
export const HonoServiceAuthentication = () => {
	const thetoken = encodeURIComponent(
		"porfavorabracadabraAAAa012392ssSWWWSSwwFFHHTYCEEFGWFBEFBWFBCDewd",
	);

	return bearerAuth({
		verifyToken: async (token, c) => {
			return true;
		},
	});
};

// Load Signing Key from JWTTools
// Extract JWT from Bearer
// Add prinicpal to context
