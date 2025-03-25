import { z } from "zod";

export const SporkMagmapChannelsStackrefRoot = "magmap-channels";

export const SporkMagmapChannelsStackExportsZod = z
	.object({
		spork_magmap_channels_sns: z.object({
			revalidate: z.object({
				topic: z.object({
					arn: z.string(),
					name: z.string(),
					id: z.string(),
				}),
			}),
		}),
	})
	.passthrough();
