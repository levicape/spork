import { z } from "zod";

export const SporkCodeStackExportsZod = z.object({
	codedeploy: z.object({
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
	ecr: z.object({
		repository: z.object({
			arn: z.string(),
			url: z.string(),
		}),
	}),
});
