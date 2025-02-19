import { z } from "zod";

export const SporkMagmapWWWRootStackExportsZod = z.object({
	spork_magmap_wwwroot_iam: z.object({
		identity: z.object({
			arn: z.string(),
			name: z.string(),
		}),
		policy: z
			.object({
				arn: z.string(),
				name: z.string(),
			})
			.optional(),
	}),
	spork_magmap_wwwroot_s3: z.object({
		accesslogs: z.object({
			bucket: z.object({
				arn: z.string(),
				name: z.string(),
			}),
		}),
	}),
	spork_magmap_wwwroot_cloudfront: z.object({
		distribution: z.object({
			id: z.string(),
			arn: z.string(),
		}),
	}),
	spork_magmap_wwwroot_lambda: z.object({
		rewriteUrls: z.object({
			lambda: z.object({
				arn: z.string(),
				name: z.string(),
			}),
		}),
	}),
});
