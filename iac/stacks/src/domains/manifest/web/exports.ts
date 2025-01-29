import { z } from "zod";

export const SporkManifestWebStackExportsZod = z.object({
	spork_manifest_web_s3: z.object({
		artifactStore: z.object({
			bucket: z.string(),
		}),
		build: z.object({
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
	spork_manifest_web_codebuild: z.object({
		project: z.object({
			arn: z.string(),
			name: z.string(),
		}),
	}),
	spork_manifest_web_pipeline: z.object({
		pipeline: z.object({
			arn: z.string(),
			name: z.string(),
		}),
	}),
	spork_manifest_web_eventbridge: z.object({
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
});
