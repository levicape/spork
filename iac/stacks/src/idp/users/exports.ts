import { z } from "zod";

export const SporkIdpUsersStackrefRoot = "idp-users";

export const SporkIdpUsersCognitoDomain = `idp.az`;

export const SporkIdpUsersStackExportsZod = z
	.object({
		spork_idp_users_cognito: z.object({
			operators: z.object({
				pool: z.object({
					arn: z.string(),
					name: z.string(),
					id: z.string(),
					region: z.string(),
					userPoolTier: z.string(),
				}),
				domain: z
					.object({
						domain: z.string(),
						userPoolId: z.string(),
						version: z.string().nullish(),
						certificateArn: z.string().nullish(),
						certificateName: z.string().nullish(),
						certificateZoneId: z.string().nullish(),
						certificateZoneName: z.string().nullish(),
					})
					.nullish(),
				record: z
					.object({
						ip4: z.object({
							id: z.string(),
							name: z.string().nullish(),
							zoneId: z.string(),
							type: z.string(),
							fqdn: z.string(),
						}),
						ip6: z
							.object({
								id: z.string(),
								name: z.string().nullish(),
								zoneId: z.string(),
								type: z.string(),
								fqdn: z.string(),
							})
							.nullish(),
					})
					.nullish(),
			}),
		}),
	})
	.passthrough();
