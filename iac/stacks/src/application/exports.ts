import { z } from "zod";

export const SporkApplicationRoot = "spork";
export const SporkApplicationStackExportsZod = z
	.object({
		spork_application_servicecatalog: z.object({
			application: z.object({
				arn: z.string(),
				id: z.string(),
				name: z.string(),
				tag: z.string(),
			}),
		}),
		spork_application_resourcegroups: z.record(
			z.string(),
			z.object({
				group: z.object({
					arn: z.string(),
					id: z.string(),
					name: z.string(),
				}),
			}),
		),
		spork_application_sns: z.object({
			changelog: z.object({
				topic: z.object({
					arn: z.string(),
					name: z.string(),
					id: z.string(),
				}),
			}),
			capacity: z.object({
				topic: z.object({
					arn: z.string(),
					name: z.string(),
					id: z.string(),
				}),
			}),
		}),
	})
	.passthrough();
