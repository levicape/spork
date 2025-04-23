import { z } from "zod";

export const SporkMagmapMonitorStackExportsZod = z
	.object({
		spork_magmap_monitor_cloudwatch: z.object({
			build: z.object({
				logGroup: z.object({
					arn: z.string(),
					name: z.string(),
				}),
			}),
		}),
		spork_magmap_monitor_s3: z.object({
			artifacts: z.object({
				bucket: z.string(),
				region: z.string(),
			}),
			pipeline: z.object({
				bucket: z.string(),
				region: z.string(),
			}),
		}),
		spork_magmap_monitor_codebuild: z.record(
			z.string(),
			z.object({
				extractimage: z.object({
					buildspec: z.object({
						bucket: z.string(),
						key: z.string(),
					}),
					project: z.object({
						arn: z.string(),
						name: z.string(),
					}),
				}),
				updatelambda: z.object({
					buildspec: z.object({
						bucket: z.string(),
						key: z.string(),
					}),
					project: z.object({
						arn: z.string(),
						name: z.string(),
					}),
				}),
			}),
		),
		spork_magmap_monitor_codepipeline: z.object({
			pipeline: z.object({
				arn: z.string(),
				name: z.string(),
				roleArn: z.string(),
				stages: z.array(
					z.object({
						actions: z.array(
							z.object({
								category: z.string(),
								configuration: z
									.record(z.string(), z.string().optional())
									.optional(),
								name: z.string(),
								provider: z.string(),
								runOrder: z.number(),
							}),
						),
						name: z.string(),
					}),
				),
			}),
		}),
		spork_magmap_monitor_eventbridge: z.record(
			z.string(),
			z.object({
				targets: z.array(
					z.record(
						z.string(),
						z.object({
							rule: z.object({
								arn: z.string(),
								name: z.string(),
							}),
							target: z.object({
								arn: z.string(),
								id: z.string(),
							}),
						}),
					),
				),
			}),
		),
		spork_magmap_monitor_lambda: z.record(
			z.string(),
			z.object({
				codedeploy: z.object({
					deploymentGroup: z.object({
						arn: z.string(),
						name: z.string(),
					}),
				}),
				cloudwatch: z.object({
					logGroup: z.object({
						arn: z.string(),
						name: z.string(),
					}),
				}),
				monitor: z.object({
					alias: z.object({
						arn: z.string(),
						functionVersion: z.string(),
						name: z.string(),
					}),
					arn: z.string(),
					name: z.string(),
					version: z.string(),
				}),
				role: z.object({
					arn: z.string(),
					name: z.string(),
				}),
			}),
		),
	})
	.passthrough();
