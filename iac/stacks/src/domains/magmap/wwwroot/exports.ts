import { z } from "zod";

/**
 * 	@see Cloudfront distributions are not provisioned immediately.
 *  An undefined distribution means that it is not yet available,
 *  but subsequent push will populate the values.
 *  This is a workaround to allow the pipeline to be created
 * 	without waiting for the distribution to be available
 */
export const SporkMagmapWWWRootExportsZod = z
	.object({
		spork_magmap_wwwroot_cloudfront: z
			.object({
				distribution: z.object({
					arn: z.string(),
					id: z.string(),
					domainName: z.string(),
					status: z.string(),
					aliases: z.array(z.string()).optional(),
					originAccessIdentity: z.string().optional(),
					etag: z.string(),
					lastModifiedTime: z.string(),
					enabled: z.boolean().optional(),
					isIpv6Enabled: z.boolean().optional(),
					httpVersion: z.string().optional(),
					priceClass: z.string().optional(),
					webAclId: z.string().optional(),
					origins: z.array(
						z.object({
							originId: z.string(),
							domainName: z.string(),
							s3OriginConfig: z
								.object({
									originAccessIdentity: z.string().optional(),
								})
								.optional(),
							customOriginConfig: z
								.object({
									httpPort: z.number().optional(),
									httpsPort: z.number().optional(),
									originProtocolPolicy: z.string().optional(),
									originSslProtocols: z.array(z.string()).optional(),
									originReadTimeout: z.number().optional(),
									originKeepaliveTimeout: z.number().optional(),
								})
								.optional(),
							connectionAttempts: z.number().optional(),
							connectionTimeout: z.number().optional(),
							originPath: z.string().optional(),
							originShield: z
								.object({
									enabled: z.boolean(),
									originShieldRegion: z.string().optional(),
								})
								.optional(),
						}),
					),
					defaultCacheBehavior: z.object({
						cachePolicyId: z.string().optional(),
						targetOriginId: z.string(),
						functionAssociations: z
							.array(
								z.object({
									functionArn: z.string(),
									eventType: z.string(),
								}),
							)
							.optional(),
						viewerProtocolPolicy: z.string().optional(),
						allowedMethods: z.array(z.string()),
						cachedMethods: z.array(z.string()),
						compress: z.boolean().optional(),
						originRequestPolicyId: z
							.union([z.string(), z.null(), z.undefined()])
							.optional(),
						smoothStreaming: z.boolean().optional(),
						fieldLevelEncryptionId: z.string().optional(),
						trustedSigners: z.array(z.string()).optional(),
						trustedKeyGroups: z.array(z.string()).optional(),
						lambdaFunctionAssociations: z
							.array(
								z.object({
									eventType: z.string(),
									lambdaArn: z.string(),
									includeBody: z.boolean().optional(),
								}),
							)
							.optional(),
					}),
					orderedCacheBehaviors: z
						.array(
							z.object({
								pathPattern: z.string(),
								targetOriginId: z.string(),
								cachePolicyId: z.string().optional(),
								originRequestPolicyId: z.string().optional(),
								viewerProtocolPolicy: z.string().optional(),
								allowedMethods: z.array(z.string()),
								functionAssociations: z
									.array(
										z.object({
											functionArn: z.string(),
											eventType: z.string(),
										}),
									)
									.optional(),
								cachedMethods: z.array(z.string()),
								compress: z.boolean().optional(),
								smoothStreaming: z.boolean().optional(),
								fieldLevelEncryptionId: z.string().optional(),
								trustedSigners: z.array(z.string()).optional(),
								trustedKeyGroups: z.array(z.string()).optional(),
								lambdaFunctionAssociations: z
									.array(
										z.object({
											eventType: z.string(),
											lambdaArn: z.string(),
											includeBody: z.boolean().optional(),
										}),
									)
									.optional(),
							}),
						)
						.optional(),
					customErrorResponses: z
						.array(
							z.object({
								errorCode: z.number(),
								responsePagePath: z.string().optional(),
								responseCode: z.number().optional(),
								errorCachingMinTtl: z.number().optional(),
							}),
						)
						.optional(),
					restrictions: z
						.object({
							geoRestriction: z.object({
								restrictionType: z.string(),
								locations: z.array(z.string()).optional(),
							}),
						})
						.optional(),
					viewerCertificate: z
						.object({
							acmCertificateArn: z.string().optional(),
							cloudfrontDefaultCertificate: z.boolean().optional(),
							iamCertificateId: z.string().optional(),
							minimumProtocolVersion: z.string().optional(),
							sslSupportMethod: z.string().optional(),
						})
						.optional(),
					loggingConfig: z
						.object({
							bucket: z.string(),
							includeCookies: z.boolean().optional(),
							prefix: z.string().optional(),
						})
						.optional(),
				}),
			})
			.optional(),
		spork_magmap_wwwroot_codebuild: z.object({
			invalidate: z.object({
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
		spork_magmap_wwwroot_s3: z.object({
			artifacts: z.object({
				bucket: z.string(),
				region: z.string(),
			}),
			logs: z.object({
				bucket: z.string(),
				region: z.string(),
			}),
		}),
	})
	.passthrough();
