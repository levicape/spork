import { z } from "zod";

export const SporkCodestarStackExportsZod = z
	.object({
		spork_codestar_ecr: z.object({
			repository: z.object({
				arn: z.string(),
				url: z.string(),
				name: z.string(),
			}),
		}),
		spork_codestar_codedeploy: z.object({
			application: z.object({
				arn: z.string(),
				name: z.string(),
			}),
			deploymentConfig: z.object({
				arn: z.string(),
				name: z.string(),
			}),
		}),
		spork_codestar_appconfig: z.object({
			application: z.object({
				arn: z.string(),
				id: z.string(),
				name: z.string(),
			}),
		}),
	})
	.passthrough();
