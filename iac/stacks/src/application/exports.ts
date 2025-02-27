import { z } from "zod";

export const SporkApplicationStackExportsZod = z.object({
	spork_application_servicecatalog: z.object({
		application: z.object({
			arn: z.string(),
			id: z.string(),
			name: z.string(),
			tag: z.string(),
		}),
	}),
	spork_application_resourcegroups: z.record(
		z.object({
			group: z.object({
				arn: z.string(),
				id: z.string(),
				name: z.string(),
			}),
		}),
	),
	spork_application_sns: z.record(
		z.object({
			topic: z.object({
				arn: z.string(),
				name: z.string(),
				id: z.string(),
			}),
		}),
	),
});
