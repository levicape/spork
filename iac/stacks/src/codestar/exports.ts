import { z } from "zod";

export const SporkCodestarStackExportsZod = z.object({
	spork_codestar_ecr: z.object({
		repository: z.object({
			arn: z.string(),
			url: z.string(),
		}),
	}),
	spork_codestar_codedeploy: z.object({
		application: z.object({
			arn: z.string(),
		}),
		deploymentConfig: z.object({
			arn: z.string(),
		}),
		deploymentGroup: z.object({
			arn: z.string(),
		}),
	}),
});
