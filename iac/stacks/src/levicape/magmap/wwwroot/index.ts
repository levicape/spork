import { inspect } from "node:util";
import {
	CodeBuildBuildspecBuilder,
	CodeBuildBuildspecEnvBuilder,
	CodeBuildBuildspecResourceLambdaPhaseBuilder,
} from "@levicape/fourtwo-builders/commonjs/index.cjs";
import { Context } from "@levicape/fourtwo-pulumi/commonjs/context/Context.cjs";
import { Certificate } from "@pulumi/aws/acm";
import { Function as CloudfrontFunction } from "@pulumi/aws/cloudfront";
import type { DistributionArgs } from "@pulumi/aws/cloudfront/distribution";
import { Distribution } from "@pulumi/aws/cloudfront/distribution";
import { OriginAccessIdentity } from "@pulumi/aws/cloudfront/originAccessIdentity";
import { Project } from "@pulumi/aws/codebuild";
import { getRole } from "@pulumi/aws/iam/getRole";
import { CallbackFunction, Permission, Runtime } from "@pulumi/aws/lambda";
import { Provider } from "@pulumi/aws/provider";
import { Record as DnsRecord } from "@pulumi/aws/route53";
import { Bucket } from "@pulumi/aws/s3/bucket";
import { BucketAclV2 } from "@pulumi/aws/s3/bucketAclV2";
import { BucketLifecycleConfigurationV2 } from "@pulumi/aws/s3/bucketLifecycleConfigurationV2";
import { BucketObjectv2 } from "@pulumi/aws/s3/bucketObjectv2";
import { BucketOwnershipControls } from "@pulumi/aws/s3/bucketOwnershipControls";
import { BucketPublicAccessBlock } from "@pulumi/aws/s3/bucketPublicAccessBlock";
import { BucketServerSideEncryptionConfigurationV2 } from "@pulumi/aws/s3/bucketServerSideEncryptionConfigurationV2";
import { BucketVersioningV2 } from "@pulumi/aws/s3/bucketVersioningV2";
import { type TopicEvent, TopicEventSubscription } from "@pulumi/aws/sns";
import { Topic } from "@pulumi/aws/sns/topic";
import { CannedAcl } from "@pulumi/aws/types/enums/s3";
import { Command } from "@pulumi/command/local";
import { Output, all, interpolate, log } from "@pulumi/pulumi";
import { error, warn } from "@pulumi/pulumi/log";
import { RandomId } from "@pulumi/random/RandomId";
import VError from "verror";
import { stringify } from "yaml";
import type { z } from "zod";
import {
	AwsCloudfrontCachePolicy,
	AwsCloudfrontRequestPolicy,
} from "../../../Cloudfront";
import { AwsCodeBuildContainerRoundRobin } from "../../../RoundRobin";
import { $deref, type DereferencedOutput } from "../../../Stack";
import {
	SporkApplicationRoot,
	SporkApplicationStackExportsZod,
} from "../../../application/exports";
import { SporkDatalayerStackExportsZod } from "../../../datalayer/exports";
import {
	SporkDnsRootStackExportsZod,
	SporkDnsRootStackrefRoot,
} from "../../../dns/root/exports";
import {
	SporkMagmapChannelsStackExportsZod,
	SporkMagmapChannelsStackrefRoot,
} from "../channels/exports";
import {
	SporkMagmapHttpStackExportsZod,
	SporkMagmapHttpStackrefRoot,
} from "../http/exports";
import {
	SporkMagmapWebStackExportsZod,
	SporkMagmapWebStackrefRoot,
} from "../web/exports";
import {
	SporkMagmapWWWRootExportsZod,
	SporkMagmapWWWRootSubdomain,
} from "./exports";

const WORKSPACE_PACKAGE_NAME = "@levicape/spork";
const SUBDOMAIN =
	process.env["STACKREF_SUBDOMAIN"] ?? SporkMagmapWWWRootSubdomain;

const ROUTE_MAP = ({
	[SporkMagmapHttpStackrefRoot]: http,
	[SporkMagmapWebStackrefRoot]: web,
}: DereferencedOutput<typeof STACKREF_CONFIG>[typeof STACKREF_ROOT]) => {
	return {
		...http.routemap,
		...web.routemap,
	};
};

const CI = {
	CI_ENVIRONMENT: process.env.CI_ENVIRONMENT ?? "unknown",
	CI_ACCESS_ROLE: process.env.CI_ACCESS_ROLE ?? "FourtwoAccessRole",
};

const STACKREF_ROOT = process.env["STACKREF_ROOT"] ?? SporkApplicationRoot;
const STACKREF_CONFIG = {
	[STACKREF_ROOT]: {
		application: {
			refs: {
				servicecatalog:
					SporkApplicationStackExportsZod.shape
						.spork_application_servicecatalog,
			},
		},
		datalayer: {
			refs: {
				iam: SporkDatalayerStackExportsZod.shape.spork_datalayer_iam,
			},
		},
		[SporkDnsRootStackrefRoot]: {
			refs: {
				route53: SporkDnsRootStackExportsZod.shape.spork_dns_root_route53,
				acm: SporkDnsRootStackExportsZod.shape.spork_dns_root_acm,
			},
		},
		[SporkMagmapChannelsStackrefRoot]: {
			refs: {
				sns: SporkMagmapChannelsStackExportsZod.shape.spork_magmap_channels_sns,
			},
		},
		[SporkMagmapHttpStackrefRoot]: {
			refs: {
				cloudmap:
					SporkMagmapHttpStackExportsZod.shape.spork_magmap_http_cloudmap,
				routemap:
					SporkMagmapHttpStackExportsZod.shape.spork_magmap_http_routemap,
			},
		},
		[SporkMagmapWebStackrefRoot]: {
			refs: {
				s3: SporkMagmapWebStackExportsZod.shape.spork_magmap_web_s3,
				routemap: SporkMagmapWebStackExportsZod.shape.spork_magmap_web_routemap,
			},
		},
	},
} as const;

export = async () => {
	// Stack references
	const dereferenced$ = await $deref(STACKREF_CONFIG);
	const routes = ROUTE_MAP(dereferenced$);

	const context = await Context.fromConfig({
		aws: {
			awsApplication: dereferenced$.application.servicecatalog.application.tag,
		},
	});
	const _ = (name?: string) =>
		name ? `${context.prefix}-${name}` : context.prefix;
	context.resourcegroups({ _ });

	const farRole = await getRole({ name: CI.CI_ACCESS_ROLE });

	////////
	// Origins
	//
	const origins = (() => {
		return Object.entries(routes).flatMap(([prefix, route]) => {
			const { hostname, $kind } = route;
			if (hostname?.startsWith("http")) {
				warn(
					inspect(
						{
							WWWRoot: {
								message:
									"!!!!!!!!! WARNING !!!!!!!!!\n Urls should not start with http or https. This will fail resource creation",
								hostname,
							},
						},
						{ depth: null },
					),
				);
			}

			const domainName = `${hostname?.at(-1) !== "/" ? hostname : hostname?.slice(0, hostname?.length - 1)}`;
			if (prefix === "/") {
				switch ($kind) {
					case "LambdaRouteResource":
						return [
							{
								originId: "default__origin__compute",
								domainName,
								prefix: "",
							},
							// {
							// 	originId: "default__origin__assets",
							// 	domainName,
							// 	prefix: "",
							// },
						];
					case "S3RouteResource":
						return [
							{
								originId: route.bucket.domainName,
								domainName: route.bucket.domainName,
								prefix: "",
								s3: true,
							},
							{
								originId: "default__origin__assets",
								domainName,
								prefix: "",
							},
						];
					default:
						throw new VError(
							`Route ${prefix} is not a LambdaRouteResource or S3RouteResource`,
						);
				}
			}

			return {
				originId: prefix.replaceAll("/", "_"),
				domainName,
				prefix,
				s3: $kind === "S3RouteResource",
			};
		});
	})();

	if (
		origins.filter((o) => o.originId === "default__origin__compute").length > 1
	) {
		throw new VError(
			`More than one origin with id default__origin__compute. Please verify your route map`,
		);
	}

	if (
		origins.filter((o) => o.originId === "default__origin__assets").length > 1
	) {
		throw new VError(
			`More than one origin with id default__origin__assets. Please verify your route map`,
		);
	}

	////////
	// Cloudfront Functions
	//////
	//// Rewrite URLs
	//
	const rewriteUrls = new CloudfrontFunction(_("rewrite-url"), {
		runtime: "cloudfront-js-2.0",
		comment: `Rewrite URLs for ${context.prefix}. Paths ending with / or without a file extension will be rewritten to /index.html`,
		code: `
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (!uri.includes('.')) {
	
	if (uri.length === 0) {
		uri = '/index.html';
	}

    if(uri === '/') {
		uri = uri + "index.html";
	}

	if (!uri.endsWith('.html')) {
		if (uri.endsWith('/')) {
		   uri = uri.slice(0, -1);
		}

		request.uri = uri + ".html";
	} else {
	   request.uri = uri;	 
	}
  }
  return request;
}
	  `,
	});

	if (_(`rewrite-url`).length > 64 - 8) {
		const combined = `${_(`rewrite-url`)}`;
		throw new VError(
			`Combined name of function too long: ${combined} (${combined.length})`,
		);
	}
	//

	//////
	//// Host header injection
	//
	const hostHeaderInjection = new CloudfrontFunction(_("host-header"), {
		runtime: "cloudfront-js-2.0",
		comment: `Host header injection for ${context.prefix}. This function is used to inject the host header into the request. This is useful for S3 origins.`,
		code: `
function handler(event) {
  event.request.uri = event.request.uri.split('/').map(encodeURIComponent).join('/');
  event.request.headers["x-forwarded-host"] = event.request.headers.host;
  return event.request;
}
	  `,
	});

	if (_(`host-header`).length > 64 - 8) {
		const combined = `${_(`host-header`)}`;
		throw new VError(
			`Combined name of lambda too long: ${combined} (${combined.length})`,
		);
	}
	//

	////////
	// S3
	//////
	//
	const s3 = (() => {
		const bucket = (
			name: string,
			props: {
				daysToRetain?: number;
				ownership?: "BucketOwnerPreferred";
			} = {
				daysToRetain: context.environment.isProd ? 30 : 8,
				ownership: undefined,
			},
		) => {
			const { daysToRetain, ownership } = props;
			const randomid = new RandomId(_(`${name}-id`), {
				byteLength: 4,
			});

			const urlsafe = _(name).replace(/[^a-zA-Z0-9]/g, "-");
			const bucket = new Bucket(
				_(name),
				{
					bucket: interpolate`${urlsafe}-${randomid.hex}`,
					acl: "private",
					forceDestroy: !context.environment.isProd,
					tags: {
						Name: _(name),
						StackRef: STACKREF_ROOT,
						WORKSPACE_PACKAGE_NAME,
						Key: name,
					},
				},
				{
					ignoreChanges: [
						"acl",
						"lifecycleRules",
						"loggings",
						"policy",
						"serverSideEncryptionConfiguration",
						"versioning",
						"website",
						"websiteDomain",
						"websiteEndpoint",
					],
				},
			);

			new BucketServerSideEncryptionConfigurationV2(
				_(`${name}-encryption`),
				{
					bucket: bucket.bucket,
					rules: [
						{
							applyServerSideEncryptionByDefault: {
								sseAlgorithm: "AES256",
							},
						},
					],
				},
				{
					deletedWith: bucket,
				},
			);
			new BucketVersioningV2(
				_(`${name}-versioning`),
				{
					bucket: bucket.bucket,
					versioningConfiguration: {
						status: "Enabled",
					},
				},
				{
					deletedWith: bucket,
				},
			);

			let acl: undefined | BucketAclV2;
			if (ownership) {
				const ownership = new BucketOwnershipControls(
					_(`${name}-ownership`),
					{
						bucket: bucket.bucket,
						rule: {
							objectOwnership: "BucketOwnerPreferred",
						},
					},
					{
						dependsOn: [bucket],
						deletedWith: bucket,
					},
				);

				acl = new BucketAclV2(
					_(`${name}-acl`),
					{
						bucket: bucket.bucket,
						acl: CannedAcl.Private,
					},
					{
						dependsOn: ownership,
						deletedWith: bucket,
					},
				);
			} else {
				new BucketPublicAccessBlock(
					_(`${name}-public-access`),
					{
						bucket: bucket.bucket,
						blockPublicAcls: true,
						blockPublicPolicy: true,
						ignorePublicAcls: true,
						restrictPublicBuckets: true,
					},
					{
						deletedWith: bucket,
					},
				);
			}

			if (daysToRetain && daysToRetain > 0) {
				new BucketLifecycleConfigurationV2(
					_(`${name}-lifecycle`),
					{
						bucket: bucket.bucket,
						rules: [
							{
								status: "Enabled",
								id: "DeleteMarkers",
								expiration: {
									expiredObjectDeleteMarker: true,
								},
							},
							{
								status: "Enabled",
								id: "IncompleteMultipartUploads",
								abortIncompleteMultipartUpload: {
									daysAfterInitiation: context.environment.isProd ? 3 : 7,
								},
							},
							{
								status: "Enabled",
								id: "NonCurrentVersions",
								noncurrentVersionExpiration: {
									noncurrentDays: context.environment.isProd ? 13 : 6,
								},
								filter: {
									objectSizeGreaterThan: 1,
								},
							},
							{
								status: "Enabled",
								id: "ExpireObjects",
								expiration: {
									days: context.environment.isProd ? 20 : 10,
								},
								filter: {
									objectSizeGreaterThan: 1,
								},
							},
						],
					},
					{
						deletedWith: bucket,
					},
				);
			}

			return {
				acl,
				bucket,
				region: bucket.region,
			};
		};

		return {
			artifacts: bucket("artifacts"),
			logs: bucket("logs", {
				daysToRetain: context.environment.isProd ? 30 : 8,
				ownership: "BucketOwnerPreferred",
			}),
		};
	})();
	//

	////////
	// TLS
	//////
	const acm = dereferenced$[SporkDnsRootStackrefRoot]?.acm;
	const certificate =
		acm?.certificate !== undefined && acm?.certificate !== null
			? Certificate.get(_("certificate"), acm.certificate.arn, undefined, {
					provider: new Provider("us-east-1", {
						region: "us-east-1",
					}),
				})
			: undefined;
	//

	////////
	// CDN
	//////
	//
	const identity = new OriginAccessIdentity(_("oai"), {
		comment: `OAI for ${context.prefix}`,
	});
	const isCompute =
		origins.filter((o) => o.originId === "default__origin__compute").length > 0;
	const defaultOriginDomain = origins.find(
		(o) => o.prefix === "" && o.s3,
	)?.domainName;

	const distributionArgs: (props: {
		logPrefix: string;
	}) => DistributionArgs = ({ logPrefix }) => ({
		enabled: true,
		comment: `CDN ${logPrefix} for ${context.prefix}`,
		httpVersion: "http2and3",
		priceClass: "PriceClass_100",
		isIpv6Enabled: true,
		...(certificate
			? {
					aliases: [
						certificate.domainName.apply((domainName) => {
							if (domainName.startsWith("*.")) return domainName.slice(2);
							return domainName;
						}),
						certificate.domainName.apply((domainName) => {
							if (domainName.startsWith("*.")) {
								return domainName;
							}
							return `*.${domainName}`;
						}),
					],
					viewerCertificate: {
						minimumProtocolVersion: "TLSv1.2_2021",
						acmCertificateArn: certificate?.arn,
						sslSupportMethod: "sni-only",
					},
				}
			: {
					viewerCertificate: {
						cloudfrontDefaultCertificate: true,
					},
				}),
		origins:
			origins === undefined
				? []
				: all([origins, identity.cloudfrontAccessIdentityPath]).apply(
						([origins, cloudfrontAccessIdentityPath]) => {
							const applied = [
								...origins
									.filter(({ originId }) => {
										return originId === defaultOriginDomain;
									})
									.map(({ originId, domainName }) => ({
										originId,
										domainName,
										s3OriginConfig: {
											originAccessIdentity: cloudfrontAccessIdentityPath,
										},
									})),
								...origins
									.filter(({ originId }) => {
										return originId !== defaultOriginDomain;
									})
									.map(({ originId, domainName }) => ({
										originId,
										domainName,
										customOriginConfig: {
											httpPort: 80,
											httpsPort: 443,
											originProtocolPolicy:
												originId === "default__origin__assets"
													? "http-only"
													: "https-only",
											originReadTimeout: 20,
											originSslProtocols: ["TLSv1.2"],
										},
									})),
							];
							return applied;
						},
					),
		defaultCacheBehavior: {
			cachePolicyId: isCompute
				? AwsCloudfrontCachePolicy.DISABLED
				: AwsCloudfrontCachePolicy.OPTIMIZED,
			targetOriginId: isCompute
				? "default__origin__compute"
				: (defaultOriginDomain ?? ""),
			functionAssociations: [
				{
					functionArn: isCompute ? hostHeaderInjection.arn : rewriteUrls.arn,
					eventType: "viewer-request",
				},
			],
			viewerProtocolPolicy: "redirect-to-https",
			allowedMethods: isCompute
				? ["HEAD", "DELETE", "POST", "GET", "OPTIONS", "PUT", "PATCH"]
				: ["HEAD", "GET", "OPTIONS"],
			cachedMethods: ["HEAD", "GET", "OPTIONS"],
			compress: true,
			originRequestPolicyId: isCompute
				? AwsCloudfrontRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER
				: undefined,
		},
		orderedCacheBehaviors:
			origins === undefined
				? []
				: all([origins]).apply(([origins]) => {
						const allorigins = origins
							.filter(({ originId }) => {
								return (
									originId !== defaultOriginDomain &&
									originId !== "default__origin__compute"
								);
							})
							.flatMap(({ prefix, originId: targetOriginId }) => {
								return {
									pathPattern: `${prefix}/*`,
									targetOriginId,
									cachePolicyId:
										targetOriginId === "default__origin__assets"
											? AwsCloudfrontCachePolicy.OPTIMIZED
											: AwsCloudfrontCachePolicy.DISABLED,
									originRequestPolicyId:
										AwsCloudfrontRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
									viewerProtocolPolicy: "redirect-to-https",
									allowedMethods: [
										"HEAD",
										"DELETE",
										"POST",
										"GET",
										"OPTIONS",
										"PUT",
										"PATCH",
									],
									functionAssociations: targetOriginId.startsWith(
										"default__origin",
									)
										? [
												{
													functionArn:
														targetOriginId === "default__origin__assets"
															? rewriteUrls.arn
															: hostHeaderInjection.arn,
													eventType: "viewer-request",
												},
											]
										: undefined,
									cachedMethods: ["HEAD", "GET"],
									compress: targetOriginId === "default__origin__assets",
								};
							});
						return allorigins;
					}),
		loggingConfig: {
			bucket: s3.logs.bucket.bucketDomainName,
			includeCookies: false,
			prefix: logPrefix,
		},
		restrictions: {
			geoRestriction: {
				restrictionType: "whitelist",
				locations: ["US", "CA"],
			},
		},
		tags: {
			Name: _("cdn"),
			awsApplication: dereferenced$.application.servicecatalog.application.tag,
			StackRef: STACKREF_ROOT,
			WORKSPACE_PACKAGE_NAME,
		},
	});

	const cache = new Distribution(
		_("cdn"),
		{
			...distributionArgs({
				logPrefix: "cache",
			}),
		},
		{ dependsOn: [...(s3.logs.acl ? [s3.logs.acl] : [])] },
	);

	//////
	//// Lambda permissions
	routes === undefined
		? []
		: all([cache.arn]).apply(([cacheArn]) => {
				return Object.entries(routes)
					.filter(([, route]) => {
						return (
							route.$kind === "LambdaRouteResource" &&
							route.lambda.arn.startsWith("arn:aws:lambda")
						);
					})
					.flatMap(([prefix, route]) => {
						if (route.$kind !== "LambdaRouteResource") {
							throw new VError(`Route ${prefix} is not a LambdaRouteResource`);
						}
						const routeKey = prefix.replaceAll("/", "_").replaceAll("~", "-");

						const policy = new Permission(_(routeKey), {
							function: route.lambda.arn,
							principal: `cloudfront.amazonaws.com`,
							action: "lambda:InvokeFunctionUrl",
							sourceArn: cacheArn,
						});
						return {
							policy,
						};
					});
			});

	//

	////////
	// Codebuild
	//////
	//// Cache Invalidation
	//

	const codebuild = (() => {
		const deployStage = "wwwroot";
		const deployAction = "invalidate-cache";
		const artifactIdentifier = `${deployStage}_${deployAction}`;

		const buildspec = (() => {
			const content = stringify(
				new CodeBuildBuildspecBuilder()
					.setVersion("0.2")
					.setEnv(
						new CodeBuildBuildspecEnvBuilder().setVariables({
							CLOUDFRONT_DISTRIBUTION_ID: `<CLOUDFRONT_DISTRIBUTION_ID>`,
						}),
					)
					.setPhases({
						build:
							new CodeBuildBuildspecResourceLambdaPhaseBuilder().setCommands([
								"env",
								"aws --version",
								"aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths '/*'",
								"echo 'Cache invalidation initiated.'",
							]),
					})
					.build(),
			);

			const upload = new BucketObjectv2(_("buildspec-upload"), {
				bucket: s3.artifacts.bucket.bucket,
				content,
				key: "Buildspec.yml",
			});

			return {
				content,
				upload,
			};
		})();

		const project = (() => {
			const project = new Project(
				_(artifactIdentifier),
				{
					description: `(${WORKSPACE_PACKAGE_NAME}) Pipeline "${deployStage}" stage: "${deployAction}"`,
					buildTimeout: 14,
					serviceRole: farRole.arn,
					artifacts: {
						type: "NO_ARTIFACTS",
					},
					concurrentBuildLimit: 1,
					queuedTimeout: 7,
					environment: {
						type: "ARM_CONTAINER",
						computeType: AwsCodeBuildContainerRoundRobin.next().value,
						image: "aws/codebuild/amazonlinux-aarch64-standard:3.0",
						environmentVariables: [
							{
								name: "CLOUDFRONT_DISTRIBUTION_ID",
								value: cache.id,
								type: "PLAINTEXT",
							},
						],
					},
					source: {
						type: "NO_SOURCE",
						buildspec: buildspec.content,
					},
					tags: {
						Name: _(artifactIdentifier),
						StackRef: STACKREF_ROOT,
						WORKSPACE_PACKAGE_NAME,
						DeployStage: deployStage,
						Action: deployAction,
					},
				},
				{
					dependsOn: [buildspec.upload, s3.artifacts.bucket],
				},
			);

			return {
				project,
			};
		})();

		return {
			invalidate: {
				...project,
				spec: {
					artifactIdentifier,
					buildspec,
				},
			},
		};
	})();
	//////
	//// Trigger Codebuild project
	new Command(
		_("invalidate-command"),
		{
			create: interpolate`aws codebuild start-build --project-name ${codebuild.invalidate.project.name}`,
			triggers: [Date.now().toString()],
		},
		{
			deleteBeforeReplace: true,
			replaceOnChanges: ["*"],
			dependsOn: [
				codebuild.invalidate.project,
				codebuild.invalidate.spec.buildspec.upload,
				cache,
			],
		},
	);
	//

	/////
	/// Lambda handler for revalidate SNS topic
	//
	const { iam } = dereferenced$["datalayer"];
	const { automation } = iam.roles;
	(() => {
		const revalidateTopicArn =
			dereferenced$[SporkMagmapChannelsStackrefRoot].sns.revalidate.topic.arn;
		const topic = Topic.get(_("revalidate-topic"), revalidateTopicArn);

		if (topic) {
			log.info(
				JSON.stringify({
					Revalidate: {
						event: "Registering revalidate handler",
						timestamp: new Date().toISOString(),
					},
				}),
			);

			new TopicEventSubscription(
				_("revalidate-on-event"),
				topic,
				new CallbackFunction(_("revalidate"), {
					description: `(${WORKSPACE_PACKAGE_NAME}) ${context.prefix} - revalidate topic handler`,
					architectures: ["arm64"],
					callback: async (event: TopicEvent, context) => {
						const codebuild = await import("@aws-sdk/client-codebuild");
						const { CODEBUILD_INVALIDATE_PROJECT_NAME } = process.env;
						console.log({
							Revalidate: {
								event: JSON.stringify(event),
								context: JSON.stringify(context),
								codebuild,
								env: {
									CODEBUILD_INVALIDATE_PROJECT_NAME,
								},
							},
						});

						const client = new codebuild.CodeBuildClient({});
						const response = await client.send(
							new codebuild.StartBuildCommand({
								projectName: CODEBUILD_INVALIDATE_PROJECT_NAME,
							}),
						);

						console.log({
							Revalidate: {
								response: JSON.stringify(response),
							},
						});
					},
					environment: {
						variables: {
							NODE_ENV: "production",
							LOG_LEVEL: "5",
							CODEBUILD_INVALIDATE_PROJECT_NAME:
								codebuild.invalidate.project.name,
						},
					},
					loggingConfig: {
						logFormat: "JSON",
						applicationLogLevel: "DEBUG",
						systemLogLevel: "DEBUG",
					},
					role: automation.arn,
					runtime: Runtime.NodeJS22dX,
					tags: {
						Name: _("revalidate-lambda"),
						StackRef: STACKREF_ROOT,
						WORKSPACE_PACKAGE_NAME,
					},
					timeout: 15,
				}),
			);
		} else {
			log.warn(
				JSON.stringify({
					Revalidate: {
						message: "Revalidate topic not found",
						timestamp: new Date().toISOString(),
					},
				}),
			);
		}
	})();

	// DNS Record
	const route53 = dereferenced$[SporkDnsRootStackrefRoot].route53;
	if (route53?.zone && certificate) {
		new DnsRecord(
			_("dns"),
			{
				zoneId: route53.zone.hostedZoneId,
				name: SUBDOMAIN,
				type: "A",
				aliases: [
					{
						name: cache.domainName,
						zoneId: cache.hostedZoneId,
						evaluateTargetHealth: false,
					},
				],
			},
			{
				deleteBeforeReplace: true,
			},
		);

		new DnsRecord(
			_("dns-aaaa"),
			{
				zoneId: route53.zone.hostedZoneId,
				name: SUBDOMAIN,
				type: "AAAA",
				aliases: [
					{
						name: cache.domainName,
						zoneId: cache.hostedZoneId,
						evaluateTargetHealth: false,
					},
				],
			},
			{
				deleteBeforeReplace: true,
			},
		);
	}

	////////
	//// Outputs
	/////
	const s3Output = Output.create(
		Object.fromEntries(
			Object.entries(s3).map(([key, bucket]) => {
				return [
					key,
					all([bucket.bucket.bucket, bucket.region]).apply(
						([bucketName, bucketRegion]) => ({
							bucket: bucketName,
							region: bucketRegion,
						}),
					),
				];
			}) as [],
		) as Record<keyof typeof s3, Output<{ bucket: string; region: string }>>,
	);

	const cloudfrontOutput = Output.create({
		distribution: {
			arn: cache.arn,
			id: cache.id,
			domainName: cache.domainName,
			status: cache.status,
			aliases: cache.aliases,
			originAccessIdentity: identity.cloudfrontAccessIdentityPath,
			etag: cache.etag,
			lastModifiedTime: cache.lastModifiedTime,
			origins: cache.origins,
			defaultCacheBehavior: cache.defaultCacheBehavior,
			orderedCacheBehaviors: cache.orderedCacheBehaviors,
			customErrorResponses: cache.customErrorResponses,
			restrictions: cache.restrictions,
			viewerCertificate: cache.viewerCertificate,
			loggingConfig: cache.loggingConfig,
		},
	}).apply(({ distribution }) => {
		return {
			distribution,
		};
	});

	const codebuildProjectsOutput = Output.create(
		Object.fromEntries(
			Object.entries(codebuild).map(([key, resources]) => {
				return [
					key,
					all([
						resources.project.arn,
						resources.project.name,
						resources.spec.buildspec.upload.bucket,
						resources.spec.buildspec.upload.key,
					]).apply(([projectArn, projectName, bucketName, bucketKey]) => ({
						buildspec: {
							bucket: bucketName,
							key: bucketKey,
						},
						project: {
							arn: projectArn,
							name: projectName,
						},
					})),
				];
			}),
		) as Record<
			"invalidate",
			Output<{
				buildspec: { bucket: string; key: string };
				project: { arn: string; name: string };
			}>
		>,
	);
	const $http = dereferenced$[SporkMagmapHttpStackrefRoot];
	const $web = dereferenced$[SporkMagmapWebStackrefRoot];

	return all([s3Output, cloudfrontOutput, codebuildProjectsOutput]).apply(
		([
			spork_magmap_wwwroot_s3,
			spork_magmap_wwwroot_cloudfront,
			spork_magmap_wwwroot_codebuild,
		]) => {
			const exported = {
				spork_magmap_wwwroot_imports: {
					[SporkApplicationRoot]: {
						nevada_http: $http,
						nevada_web: $web,
					},
				},
				spork_magmap_wwwroot_cloudfront,
				spork_magmap_wwwroot_codebuild,
				spork_magmap_wwwroot_s3,
			} satisfies z.infer<typeof SporkMagmapWWWRootExportsZod> & {
				spork_magmap_wwwroot_imports: {
					[SporkApplicationRoot]: {
						nevada_http: typeof $http;
						nevada_web: typeof $web;
					};
				};
			};

			const validate = SporkMagmapWWWRootExportsZod.safeParse(exported);
			if (!validate.success) {
				error(`Validation failed: ${inspect(validate.error, { depth: null })}`);
				warn(inspect(exported, { depth: null }));
			}

			return exported;
		},
	);
};
