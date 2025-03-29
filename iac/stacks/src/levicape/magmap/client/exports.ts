import { z } from "zod";

export const SporkMagmapClientOauthRoutes = {
	callback: "~oidc/callback",
	renew: "~oidc/renew",
	logout: "~oidc/logout",
} as const;

export const SporkMagmapClientStackrefRoot = "magmap-client";

export const SporkMagmapClientStackExportsZod = z
	.object({
		spork_magmap_client_cognito: z.object({
			operators: z.object({
				client: z.object({
					name: z.string(),
					clientId: z.string(),
					userPoolId: z.string(),
				}),
			}),
		}),
	})
	.passthrough();
