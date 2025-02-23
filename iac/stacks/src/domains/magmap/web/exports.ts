import { z } from "zod";
import { RouteMapZod } from "../../../RouteMap";

export const SporkMagmapWebStackExportsZod = z.object({
	spork_magmap_web_s3: z.object({
		pipeline: z.object({
			bucket: z.string(),
		}),
		artifacts: z.object({
			bucket: z.string(),
		}),
		staticwww: z.object({
			bucket: z.string(),
			public: z.object({
				arn: z.string(),
				domainName: z.string(),
				websiteEndpoint: z.string(),
				websiteDomain: z.string(),
			}),
		}),
	}),
	spork_magmap_web_codebuild: z.object({
		project: z.object({
			arn: z.string(),
			name: z.string(),
		}),
	}),
	spork_magmap_web_pipeline: z.object({
		pipeline: z.object({
			arn: z.string(),
			name: z.string(),
		}),
	}),
	spork_magmap_web_eventbridge: z.object({
		EcrImageAction: z.object({
			rule: z.object({
				arn: z.string(),
				name: z.string(),
			}),
			targets: z.object({
				pipeline: z.object({
					arn: z.string(),
					targetId: z.string(),
				}),
			}),
		}),
	}),
	spork_magmap_web_routemap: RouteMapZod.valueSchema,
});
