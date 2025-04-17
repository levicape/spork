import { hash } from "node:crypto";
import { inspect } from "node:util";
import {
	CodeBuildBuildspecArtifactsBuilder,
	CodeBuildBuildspecBuilder,
	CodeBuildBuildspecEnvBuilder,
	CodeBuildBuildspecResourceLambdaPhaseBuilder,
	CodeDeployAppspecBuilder,
	CodeDeployAppspecResourceBuilder,
} from "@levicape/fourtwo-builders/commonjs/index.cjs";
import { Context } from "@levicape/fourtwo-pulumi/commonjs/context/Context.cjs";
import { Version } from "@pulumi/aws-native/lambda";
import {
	ConfigurationProfile,
	Deployment,
	Environment,
	HostedConfigurationVersion,
} from "@pulumi/aws/appconfig";
import { DeploymentStrategy } from "@pulumi/aws/appconfig/deploymentStrategy";
import { EventRule, EventTarget } from "@pulumi/aws/cloudwatch";
import { LogGroup } from "@pulumi/aws/cloudwatch/logGroup";
import { Project } from "@pulumi/aws/codebuild";
import { DeploymentGroup } from "@pulumi/aws/codedeploy/deploymentGroup";
import { Pipeline } from "@pulumi/aws/codepipeline";
import { getRole } from "@pulumi/aws/iam/getRole";
import { Alias, Function as LambdaFn, Runtime } from "@pulumi/aws/lambda";
import { FunctionUrl } from "@pulumi/aws/lambda/functionUrl";
import {
	Bucket,
	BucketServerSideEncryptionConfigurationV2,
} from "@pulumi/aws/s3";
import { BucketLifecycleConfigurationV2 } from "@pulumi/aws/s3/bucketLifecycleConfigurationV2";
import { BucketObjectv2 } from "@pulumi/aws/s3/bucketObjectv2";
import { BucketPublicAccessBlock } from "@pulumi/aws/s3/bucketPublicAccessBlock";
import { BucketVersioningV2 } from "@pulumi/aws/s3/bucketVersioningV2";
import { Instance } from "@pulumi/aws/servicediscovery/instance";
import { Service } from "@pulumi/aws/servicediscovery/service";
import { Output, all, getStack, interpolate, log } from "@pulumi/pulumi";
import { AssetArchive, StringAsset } from "@pulumi/pulumi/asset";
import { error, warn } from "@pulumi/pulumi/log";
import { RandomId } from "@pulumi/random/RandomId";
import { destr } from "destr";
import { serializeError } from "serialize-error";
import { VError } from "verror";
import { stringify } from "yaml";
import type { z } from "zod";
import { objectEntries, objectFromEntries } from "../../../Object";
import { AwsCodeBuildContainerRoundRobin } from "../../../RoundRobin";
import type { LambdaRouteResource, Route } from "../../../RouteMap";
import { $$root, $deref, type DereferencedOutput } from "../../../Stack";
import {
	SporkApplicationRoot,
	SporkApplicationStackExportsZod,
} from "../../../application/exports";
import { SporkCodestarStackExportsZod } from "../../../codestar/exports";
import { SporkDatalayerStackExportsZod } from "../../../datalayer/exports";
import {
	SporkIdpUsersStackExportsZod,
	SporkIdpUsersStackrefRoot,
} from "../../../idp/users/exports";
import type { MapgmapWWWRootRoute } from "../wwwroot/routes";
import { SporkMagmapHttpStackExportsZod } from "./exports";

const PACKAGE_NAME = "@levicape/spork-magmap-io" as const;
const DESCRIPTION = "Spork HTTP api" as const;
const LLRT_ARCH: string | undefined = process.env["LLRT_ARCH"]; //"lambda-arm64-full-sdk";
const LLRT_PLATFORM: "node" | "browser" | undefined = LLRT_ARCH
	? "node"
	: undefined;
const OUTPUT_DIRECTORY = `output/esbuild`;
const HANDLER = `${LLRT_ARCH ? `${OUTPUT_DIRECTORY}/${LLRT_PLATFORM}` : "module"}/http/HonoApp.stream`;

const APPLICATION_IMAGE_NAME = SporkApplicationRoot;
const CI = {
	APPLICATION_ENVIRONMENT: process.env.APPLICATION_ENVIRONMENT ?? "unknown",
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
		codestar: {
			refs: {
				appconfig: SporkCodestarStackExportsZod.shape.spork_codestar_appconfig,
				codedeploy:
					SporkCodestarStackExportsZod.shape.spork_codestar_codedeploy,
				ecr: SporkCodestarStackExportsZod.shape.spork_codestar_ecr,
				codeartifact:
					SporkCodestarStackExportsZod.shape.spork_codestar_codeartifact,
				ssm: SporkCodestarStackExportsZod.shape.spork_codestar_ssm,
			},
		},
		datalayer: {
			refs: {
				props: SporkDatalayerStackExportsZod.shape.spork_datalayer_props,
				ec2: SporkDatalayerStackExportsZod.shape.spork_datalayer_ec2,
				efs: SporkDatalayerStackExportsZod.shape.spork_datalayer_efs,
				iam: SporkDatalayerStackExportsZod.shape.spork_datalayer_iam,
				cloudmap: SporkDatalayerStackExportsZod.shape.spork_datalayer_cloudmap,
			},
		},
		[SporkIdpUsersStackrefRoot]: {
			refs: {
				cognito: SporkIdpUsersStackExportsZod.shape.spork_idp_users_cognito,
			},
		},
	},
};

const HANDLER_TYPE = "httphandler" as const;

const ROUTE_MAP = async (
	_$refs: DereferencedOutput<typeof STACKREF_CONFIG>[typeof STACKREF_ROOT],
) => {
	return {};
};

const ATLASFILE_PATHS: Record<
	string,
	{
		content: (
			_$refs: DereferencedOutput<typeof STACKREF_CONFIG>[typeof STACKREF_ROOT],
		) => Promise<Record<string, unknown>>;
		path: string;
		envName?: string;
	}
> = {
	routes: {
		content: ROUTE_MAP,
		path: "atlas.routes.json",
	},
	jwks: {
		content: async ($refs) => {
			const { JWT_POOL_ID, JWT_REGION } = ENVIRONMENT($refs);
			const url = `https://cognito-idp.${JWT_REGION}.amazonaws.com/${JWT_POOL_ID}/.well-known/jwks.json`;
			const response = await fetch(url, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
			});
			if (response.ok === false) {
				throw new VError(
					{
						info: {
							url,
							status: response.status,
							statusText: response.statusText,
						},
					},
					`Failed to fetch JWKS from ${url}`,
				);
			}
			return destr<{
				keys: Array<{
					alg: string;
					kid: string;
					kty: string;
					use: string;
					n: string;
					e: string;
				}>;
			}>(await response.text());
		},
		path: "jwks.json",
		envName: "JWT_VERIFICATION_JWKS_URI",
	},
} as const;

const ENVIRONMENT = (
	_$refs: DereferencedOutput<typeof STACKREF_CONFIG>["spork"],
) => {
	const efs = (() => {
		const { lambda } = _$refs.datalayer.props;

		return {
			mountPath: lambda.fileSystemConfig.localMountPath,
		};
	})();

	const idpUsers = (() => {
		const { cognito } = _$refs[SporkIdpUsersStackrefRoot];
		return {
			region: cognito.operators.pool.region,
			poolId: cognito.operators.pool.id,
		};
	})();

	return {
		JWT_POOL_ID: idpUsers.poolId,
		JWT_REGION: idpUsers.region,
		JWT_CACHE_FS_ROOT: `${efs.mountPath}/levicape/jwks/azc`,
		JWT_CACHE_FS_KEY: `${idpUsers.poolId}.json`,
		JWT_SIGNATURE_JWKS_URI: "unload",
	} as const;
};

export = async () => {
	// Stack references
	const dereferenced$ = await $deref(STACKREF_CONFIG);
	const { codestar: __codestar, datalayer: __datalayer } = dereferenced$;

	const context = await Context.fromConfig({
		aws: {
			awsApplication: dereferenced$.application.servicecatalog.application.tag,
		},
	});
	const _ = (name: string) => `${context.prefix}-${name}`;
	context.resourcegroups({ _ });

	const stage = CI.APPLICATION_ENVIRONMENT;
	const automationRole = await getRole({
		name: __datalayer.iam.roles.automation.name,
	});

	// Object Store
	const s3 = (() => {
		const bucket = (
			name: string,
			props?: {
				daysToRetain?: number;
			},
		) => {
			const { daysToRetain } = {
				daysToRetain: context.environment.isProd ? 30 : 8,
				...props,
			};

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
						PackageName: PACKAGE_NAME,
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
			new BucketPublicAccessBlock(
				_(`${name}-public-access-block`),
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

			return bucket;
		};

		return {
			/*
			 * CodePipeline cache
			 */
			pipeline: bucket("pipeline"),
			/*
			 * Staging bucket for Lambda zip files and CodeDeploy appspec
			 */
			artifacts: bucket("artifacts"),
			/*
			 * CodeBuild and Appconfig resources
			 */
			resources: bucket("resources", { daysToRetain: 0 }),
		};
	})();

	// Logging
	const cloudwatch = (() => {
		const loggroup = (name: string) => {
			const loggroup = new LogGroup(_(`${name}-logs`), {
				retentionInDays: context.environment.isProd ? 180 : 60,
				tags: {
					Name: _(`${name}-logs`),
					StackRef: STACKREF_ROOT,
					PackageName: PACKAGE_NAME,
				},
			});

			return { loggroup };
		};

		return {
			build: loggroup("build"),
			function: loggroup("function"),
		};
	})();

	// Configuration
	const appconfig = (() => {
		const environment = new Environment(
			_("environment"),
			{
				applicationId: __codestar.appconfig.application.id,
				description: `(${PACKAGE_NAME}) "${DESCRIPTION}" in #${stage}`,
				tags: {
					Name: _("environment"),
					StackRef: STACKREF_ROOT,
					PackageName: PACKAGE_NAME,
				},
			},
			{
				dependsOn: [s3.artifacts],
			},
		);

		const deploymentStrategy = new DeploymentStrategy(_(`config-dev`), {
			growthFactor: 100,
			deploymentDurationInMinutes: 2,
			finalBakeTimeInMinutes: 1,
			replicateTo: "NONE",
		});

		return {
			environment,
			deploymentStrategy,
		};
	})();

	// Compute
	const handler = await (async ({ datalayer, codestar }, cloudwatch) => {
		const roleArn = datalayer.iam.roles.lambda.arn;
		const loggroup = cloudwatch.function.loggroup;

		const zip = new BucketObjectv2(_("zip"), {
			bucket: s3.resources.bucket,
			source: new AssetArchive({
				"index.js": new StringAsset(
					`export const handler = (${(
						// @ts-ignore
						(_event, context) => {
							const {
								functionName,
								functionVersion,
								getRemainingTimeInMillis,
								invokedFunctionArn,
								memoryLimitInMB,
								awsRequestId,
								logGroupName,
								logStreamName,
								identity,
								clientContext,
								deadline,
							} = context;

							console.log({
								functionName,
								functionVersion,
								getRemainingTimeInMillis,
								invokedFunctionArn,
								memoryLimitInMB,
								awsRequestId,
								logGroupName,
								logStreamName,
								identity,
								clientContext,
								deadline,
							});

							return {
								statusCode: 200,
								body: JSON.stringify({
									message: "Hello from Lambda!",
								}),
							};
						}
					).toString()})`,
				),
			}),
			contentType: "application/zip",
			key: `bootstrap/code.zip`,
			tags: {
				Name: _(`zip`),
				StackRef: STACKREF_ROOT,
			},
		});

		const cloudmapEnvironment = {
			AWS_CLOUDMAP_NAMESPACE_ID: datalayer.cloudmap.namespace.id,
			AWS_CLOUDMAP_NAMESPACE_NAME: datalayer.cloudmap.namespace.name,
		};

		const configfile = async (
			kind: string,
			{ path, content }: (typeof ATLASFILE_PATHS)[string],
		) => {
			const stringcontent = JSON.stringify(await content(dereferenced$));
			const md5hash = hash("md5", stringcontent, "hex");
			const first6 = md5hash.slice(0, 6);
			const last6 = md5hash.slice(-6);

			const object = new BucketObjectv2(
				_(`${kind}-configfile`),
				{
					bucket: s3.resources.bucket,
					source: new StringAsset(stringcontent),
					contentType: "application/json",
					key: `configuration/${kind}.${first6}${last6}.json`,
					tags: {
						Name: _(`${kind}-configfile`),
						StackRef: STACKREF_ROOT,
						PackageName: PACKAGE_NAME,
						Kind: kind,
						Path: path,
						MD5: md5hash,
					},
				},
				{
					retainOnDelete: true,
				},
			);

			const configuration = new ConfigurationProfile(
				_(`${kind}-config`),
				{
					applicationId: codestar.appconfig.application.id,
					description: `(${PACKAGE_NAME}) "${kind}" configfile in #${stage}`,
					locationUri: "hosted",
					tags: {
						Name: _(`${kind}-config`),
						StackRef: STACKREF_ROOT,
						PackageName: PACKAGE_NAME,
						Kind: kind,
						Path: path,
					},
				},
				{
					dependsOn: [object],
				},
			);

			const version = new HostedConfigurationVersion(
				_(`${kind}-config-version`),
				{
					applicationId: codestar.appconfig.application.id,
					configurationProfileId: configuration.configurationProfileId,
					description: `(${PACKAGE_NAME}) "${kind}" configfile in #${stage}`,
					content: stringcontent,
					contentType: "application/json",
				},
				{
					dependsOn: [object, configuration],
				},
			);

			const deployment = new Deployment(
				_(`${kind}-config-deployment`),
				{
					description: `(${PACKAGE_NAME}) "${kind}" configfile in #${stage}`,
					applicationId: codestar.appconfig.application.id,
					environmentId: appconfig.environment.environmentId,
					configurationProfileId: configuration.configurationProfileId,
					configurationVersion: version.versionNumber.apply((v) => String(v)),
					deploymentStrategyId: context.environment.isProd
						? "AppConfig.Canary10Percent20Minutes"
						: appconfig.deploymentStrategy.id,
					tags: {
						Name: _(`${kind}-config-deployment`),
						StackRef: STACKREF_ROOT,
						PackageName: PACKAGE_NAME,
						Kind: kind,
					},
				},
				{
					dependsOn: [object, configuration, version],
				},
			);

			return {
				object,
				content: stringcontent,
				version,
				configuration,
				deployment,
			};
		};

		const configuration = objectFromEntries(
			await Promise.all(
				objectEntries(ATLASFILE_PATHS).map(([named, resource]) =>
					configfile(named, resource).then(
						(config) => [named, config] as const,
					),
				),
			),
		);
		const appconfigEnvironment = all([
			codestar.appconfig.application.name,
			appconfig.environment.name,
		]).apply(([applicationName, environmentName]) => {
			return {
				AWS_APPCONFIG_HOST: "http://localhost:2772",
				AWS_APPCONFIG_APPLICATION: applicationName,
				AWS_APPCONFIG_ENVIRONMENT: environmentName,
			};
		});

		const memorySize = context.environment.isProd ? 512 : 256;
		const timeout = context.environment.isProd ? 18 : 11;
		const lambda = new LambdaFn(
			_("fn"),
			{
				description: `(${PACKAGE_NAME}) "${DESCRIPTION ?? `HTTP lambda`}" in #${stage}`,
				role: roleArn,
				architectures: ["arm64"],
				memorySize,
				timeout: timeout,
				packageType: "Zip",
				runtime: LLRT_ARCH ? Runtime.CustomAL2023 : Runtime.NodeJS22dX,
				handler: "index.handler",
				s3Bucket: s3.resources.bucket,
				s3Key: zip.key,
				s3ObjectVersion: zip.versionId,
				vpcConfig: {
					securityGroupIds: datalayer.props.lambda.vpcConfig.securityGroupIds,
					subnetIds: datalayer.props.lambda.vpcConfig.subnetIds,
				},
				fileSystemConfig: {
					localMountPath:
						datalayer.props.lambda.fileSystemConfig.localMountPath,
					arn: datalayer.props.lambda.fileSystemConfig.arn,
				},
				loggingConfig: {
					logFormat: "JSON",
					logGroup: loggroup.name,
					applicationLogLevel: context.environment.isProd ? "INFO" : "DEBUG",
				},
				// Requires VPC Privatelink / RIP to match region to layer ARN
				// layers: [
				// 	`arn:aws:lambda:us-west-2:359756378197:layer:AWS-AppConfig-Extension-Arm64:132`,
				// ],
				environment: all([cloudmapEnvironment, appconfigEnvironment]).apply(
					([cloudmap, _appconfig]) => {
						return {
							variables: {
								NODE_OPTIONS: [
									"--no-force-async-hooks-checks",
									"--enable-source-maps",
								].join(" "),
								NODE_ENV: "production",
								LOG_LEVEL: "5",
								...cloudmap,
								// ...appconfig,
								// AWS_APPCONFIG_EXTENSION_PREFETCH_LIST: (() => {
								// 	let prefetch = [];

								// 	const configpath = (file: keyof typeof ATLASFILE_PATHS) => {
								// 		return all([appconfigEnvironment]).apply(([appconfigenvironment]) => {
								// 			const applicationName = appconfigenvironment.AWS_APPCONFIG_APPLICATION;
								// 			const environmentName = appconfigenvironment.AWS_APPCONFIG_ENVIRONMENT;
								// 			return interpolate`/applications/${applicationName}/environments/${environmentName}/configurations/${atlas[file].configuration.name}`;
								// 		});
								// 	};

								// 	for (const af of Object.keys(atlas)) {
								// 		if (af) {
								// 			prefetch.push(af);
								// 		}
								// 	}
								// 	return Output.create(
								// 		prefetch.map((af) => configpath(af as keyof typeof ATLASFILE_PATHS)),
								// 	);
								// })().apply((list) => list.join(",")),
								...objectFromEntries(
									objectEntries(ATLASFILE_PATHS).map(
										([name, { path, envName }]) => [
											envName ?? `ATLAS_${name.toUpperCase()}`,
											`file://$LAMBDA_TASK_ROOT/${HANDLER_TYPE}/${path}`,
										],
									),
								),
								...(LLRT_PLATFORM
									? {
											LLRT_PLATFORM,
											LLRT_GC_THRESHOLD_MB: String(memorySize / 4),
										}
									: {}),
								...(ENVIRONMENT !== undefined &&
								typeof ENVIRONMENT === "function"
									? objectFromEntries(
											objectEntries(ENVIRONMENT(dereferenced$))
												.filter(([_, value]) => value !== undefined)
												.filter(
													([_, value]) =>
														typeof value !== "function" &&
														typeof value !== "symbol",
												)
												.map(([key, value]) => {
													log.debug(
														inspect({
															LambdaFn: {
																environment: {
																	key,
																	value,
																},
															},
														}),
													);

													if (typeof value === "object") {
														return [
															key,
															Buffer.from(JSON.stringify(value)).toString(
																"base64",
															),
														];
													}
													try {
														return [key, String(value)];
													} catch (e) {
														log.warn(
															inspect(
																{
																	LambdaFn: {
																		environment: {
																			key,
																			value,
																			error: serializeError(e),
																		},
																	},
																},
																{ depth: null },
															),
														);
														return [key, undefined];
													}
												}),
										)
									: {}),
							},
						};
					},
				),
				tags: {
					Name: _("fn"),
					StackRef: STACKREF_ROOT,
					Handler: "Http",
					PackageName: PACKAGE_NAME,
				},
			},
			{
				dependsOn: [zip],
				ignoreChanges: ["handler", "s3Bucket", "s3Key", "s3ObjectVersion"],
			},
		);

		const hostnames: string[] =
			context?.frontend?.dns?.hostnames
				?.map((hostname) => {
					return hostname.replaceAll(/[^a-zA-Z0-9.-]/g, "-");
				})
				?.map((host) => [`https://${host}`, `https://www.${host}`])
				.reduce((acc, current) => [...acc, ...current], []) ?? [];

		const version = new Version(_("version"), {
			description: `(${PACKAGE_NAME}) version for "${stage}"`,
			functionName: lambda.name,
		});

		const alias = new Alias(
			_("alias"),
			{
				description: `(${PACKAGE_NAME}) alias`,
				name: stage,
				functionName: lambda.name,
				functionVersion: version.version,
			},
			{
				ignoreChanges: ["functionVersion"],
			},
		);

		const url = new FunctionUrl(_("url"), {
			authorizationType: context.environment.isProd ? "AWS_IAM" : "NONE",
			cors: {
				allowMethods: ["*"],
				allowOrigins: context.environment.isProd ? hostnames : ["*"],
				maxAge: 86400,
			},
			functionName: lambda.name,
			invokeMode: "RESPONSE_STREAM",
			qualifier: alias.name,
		});

		let latestUrl: FunctionUrl | undefined;
		if (!context.environment.isProd) {
			latestUrl = new FunctionUrl(_("url-latest"), {
				authorizationType: "AWS_IAM",
				cors: {
					allowMethods: ["*"],
					allowOrigins: hostnames,
					maxAge: 86400,
				},
				functionName: lambda.name,
				invokeMode: "RESPONSE_STREAM",
			});
		}

		const deploymentGroup = new DeploymentGroup(
			_("deployment-group"),
			{
				deploymentGroupName: lambda.arn.apply((arn) =>
					_(`deploybg-${arn.slice(-10)}`),
				),
				serviceRoleArn: automationRole.arn,
				appName: codestar.codedeploy.application.name,
				deploymentConfigName: codestar.codedeploy.deploymentConfig.name,
				deploymentStyle: {
					deploymentOption: "WITH_TRAFFIC_CONTROL",
					deploymentType: "BLUE_GREEN",
				},
				tags: {
					Name: _("deployment-group"),
					StackRef: STACKREF_ROOT,
					PackageName: PACKAGE_NAME,
					Kind: "HttpHandler",
					LambdaArn: lambda.arn,
					LambdaFunction: lambda.name,
					LambdaAlias: alias.name,
					LambdaVersion: version.version,
					LambdaUrl: url.functionUrl,
				},
			},
			{
				deleteBeforeReplace: true,
				dependsOn: [alias, url],
				replaceOnChanges: [
					"appName",
					"deploymentConfigName",
					"deploymentStyle",
				],
			},
		);

		return {
			configuration,
			codedeploy: {
				deploymentGroup,
			},
			http: {
				arn: lambda.arn,
				name: lambda.name,
				url: url.functionUrl,
				qualifier: url.qualifier,
				alias,
				version,
				$latest: latestUrl,
			},
			role: datalayer.props.lambda.role,
		};
	})({ codestar: __codestar, datalayer: __datalayer }, cloudwatch);

	// Cloudmap
	const cloudmap = (({ datalayer: { cloudmap } }) => {
		const { namespace } = cloudmap;
		const cloudMapService = new Service(_("service"), {
			name: handler.http.name.apply((name) => _(`service-${name.slice(-10)}`)),
			description: `(${PACKAGE_NAME}) "${DESCRIPTION}" in #${stage}`,
			dnsConfig: {
				namespaceId: namespace.id,
				routingPolicy: "WEIGHTED",
				dnsRecords: [
					{
						type: "CNAME",
						ttl: context.environment.isProd ? 55 : 175,
					},
				],
			},
			tags: {
				Name: _("service"),
				StackRef: STACKREF_ROOT,
				PackageName: PACKAGE_NAME,
			},
		});

		const cloudMapInstance = new Instance(_("instance"), {
			serviceId: cloudMapService.id,
			instanceId: _("instance"),
			attributes: {
				APPLICATION_ENVIRONMENT: stage,
				AWS_INSTANCE_CNAME: handler.http.url,
				CONTEXT_PREFIX: context.prefix,
				LAMBDA_FUNCTION_ARN: handler.http.arn,
				PACKAGE_NAME,
				STACK_NAME: getStack(),
				STACKREF_ROOT,
			},
		});

		return {
			service: cloudMapService,
			instance: cloudMapInstance,
		};
	})({ datalayer: __datalayer });

	const codebuild = (() => {
		const appspec = (props: {
			name: string;
			alias: string;
			currentVersion: string;
			targetVersion: string;
		}) => {
			const content = stringify(
				new CodeDeployAppspecBuilder()
					.setResources([
						{
							[HANDLER_TYPE]: new CodeDeployAppspecResourceBuilder()
								.setName(props.name)
								.setAlias(props.alias)
								// .setDescription()
								.setCurrentVersion(props.currentVersion)
								.setTargetVersion(props.targetVersion),
						},
					])
					.build(),
			);
			return {
				content,
			};
		};

		const project = (() => {
			const PIPELINE_STAGE = HANDLER_TYPE;
			const EXTRACT_ACTION = "extractimage" as const;
			const UPDATE_ACTION = "updatelambda" as const;
			const DEPLOY_SENTINEL = "procfile deploy complete" as const;

			const ATLAS_PIPELINE_VARIABLES = objectFromEntries(
				Object.keys(ATLASFILE_PATHS).map(
					(name) =>
						[
							`ATLASFILE_${name.toUpperCase()}_KEY`,
							`<ATLASFILE_${name.toUpperCase()}_KEY>`,
						] as const,
				),
			);

			const { codeartifact, ssm } = __codestar;
			const stages = [
				{
					stage: PIPELINE_STAGE,
					action: EXTRACT_ACTION,
					artifact: {
						name: `${PIPELINE_STAGE}_${EXTRACT_ACTION}`,
						baseDirectory: `.${EXTRACT_ACTION}` as string | undefined,
						files: ["**/*"] as string[],
					},
					variables: {
						AWS_PAGER: "",
						STACKREF_CODESTAR_ECR_REPOSITORY_ARN:
							"<STACKREF_CODESTAR_ECR_REPOSITORY_ARN>",
						STACKREF_CODESTAR_ECR_REPOSITORY_NAME:
							"<STACKREF_CODESTAR_ECR_REPOSITORY_NAME>",
						STACKREF_CODESTAR_ECR_REPOSITORY_URL:
							"<STACKREF_CODESTAR_ECR_REPOSITORY_URL>",
						SOURCE_IMAGE_REPOSITORY: "<SOURCE_IMAGE_REPOSITORY>",
						SOURCE_IMAGE_URI: "<SOURCE_IMAGE_URI>",
						S3_DEPLOY_BUCKET: "<S3_DEPLOY_BUCKET>",
						S3_DEPLOY_KEY: "<S3_DEPLOY_KEY>",
						...ATLAS_PIPELINE_VARIABLES,
					},
					exportedVariables: [
						"STACKREF_CODESTAR_ECR_REPOSITORY_ARN",
						"STACKREF_CODESTAR_ECR_REPOSITORY_NAME",
						"STACKREF_CODESTAR_ECR_REPOSITORY_URL",
						"S3_DEPLOY_BUCKET",
						"S3_DEPLOY_KEY",
						"DeployKey",
					] as string[],
					environment: {
						type: "ARM_CONTAINER",
						computeType: AwsCodeBuildContainerRoundRobin.next().value,
						image: "aws/codebuild/amazonlinux-aarch64-standard:3.0",
						environmentVariables: [
							{
								name: "AWS_PAGER",
								value: "",
								type: "PLAINTEXT",
							},
							{
								name: "STACKREF_CODESTAR_ECR_REPOSITORY_ARN",
								value: "<STACKREF_CODESTAR_ECR_REPOSITORY_ARN>",
								type: "PLAINTEXT",
							},
							{
								name: "STACKREF_CODESTAR_ECR_REPOSITORY_NAME",
								value: "<STACKREF_CODESTAR_ECR_REPOSITORY_NAME>",
								type: "PLAINTEXT",
							},
							{
								name: "STACKREF_CODESTAR_ECR_REPOSITORY_URL",
								value: "<STACKREF_CODESTAR_ECR_REPOSITORY_URL>",
								type: "PLAINTEXT",
							},
							{
								name: "SOURCE_IMAGE_REPOSITORY",
								value: "SourceImage.RepositoryName",
								type: "PLAINTEXT",
							},
							{
								name: "SOURCE_IMAGE_URI",
								value: "SourceImage.ImageURI",
								type: "PLAINTEXT",
							},
							{
								name: "S3_DEPLOY_BUCKET",
								value: s3.artifacts.bucket,
								type: "PLAINTEXT",
							},
							{
								name: "S3_DEPLOY_KEY",
								value: "SourceImage.ImageURI",
								type: "PLAINTEXT",
							},
							...Object.keys(ATLAS_PIPELINE_VARIABLES).map((name) => ({
								name,
								value: `<${name}>`,
								type: "PLAINTEXT",
							})),
						] as { name: string; value: string; type: "PLAINTEXT" }[],
					},
					phases: {
						build: [
							"env",
							[
								"aws",
								"codeartifact",
								"get-authorization-token",
								"--domain",
								codeartifact.domain.name,
								"--domain-owner",
								codeartifact.domain.owner ?? "<DOMAIN_OWNER>",
								"--region $AWS_REGION",
								"--query authorizationToken",
								"--output text",
								" > .codeartifact-token",
							].join(" "),
							[
								"aws",
								"codeartifact",
								"get-repository-endpoint",
								"--domain",
								codeartifact.domain.name,
								"--domain-owner",
								codeartifact.domain.owner ?? "<DOMAIN_OWNER>",
								"--repository",
								codeartifact.repository.npm?.name,
								"--format npm",
								"--region $AWS_REGION",
								"--query repositoryEndpoint",
								"--output text",
								" > .codeartifact-repository",
							].join(" "),
							`export LEVICAPE_TOKEN=$(${[
								"aws",
								"ssm",
								"get-parameter",
								"--name",
								`"${ssm.levicape.npm.parameter.name}"`,
								"--with-decryption",
								"--region $AWS_REGION",
								"--query Parameter.Value",
								"--output text",
								"--no-cli-pager",
							].join(" ")})`,
							"docker --version",
							`aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $STACKREF_CODESTAR_ECR_REPOSITORY_URL`,
							"docker pull $SOURCE_IMAGE_URI",
							"docker images",
							"export NPM_REGISTRY=$(cat .codeartifact-repository)",
							[
								...[
									"docker run",
									...[
										"--detach",
										"--entrypoint deploy",
										`--env DEPLOY_FILTER=${PACKAGE_NAME}`,
										`--env DEPLOY_OUTPUT=/tmp/${PIPELINE_STAGE}`,
										`--env DEPLOY_ARGS="--verify-store-integrity=false --node-linker=hoisted --prefer-offline"`,
										`--env NPM_REGISTRY`,
										`--env NPM_REGISTRY_HOST=\${NPM_REGISTRY#https://}`,
										`--env NPM_TOKEN=$(cat .codeartifact-token)`,
										`--env NPM_ALWAYS_AUTH=true`,
										`--env LEVICAPE_REGISTRY=${ssm.levicape.npm.url}`,
										`--env LEVICAPE_REGISTRY_HOST=${ssm.levicape.npm.host}`,
										`--env LEVICAPE_TOKEN`,
										`--env LEVICAPE_ALWAYS_AUTH=true`,
									],
									"$SOURCE_IMAGE_URI",
								],
								"> .container",
							].join(" "),
							"docker ps -al",
							"export DEPLOY_COMPLETE=0",
							"echo 'Waiting for procfile deploy'",
							...[4, 16, 20, 16, 4, 2, 8, 10, 8, 2, 1, 4, 5, 4, 1].flatMap(
								(i) => [
									`cat .container`,
									`if [ "$DEPLOY_COMPLETE" != "0" ];
										then echo "Deploy completed. Skipping ${i}s wait";
										else echo "Sleeping for ${i}s..."; echo "..."; 
											sleep ${i}s; docker container logs $(cat .container);
											export DEPLOY_COMPLETE=$(docker container logs $(cat .container) | grep -c "${DEPLOY_SENTINEL}");
									fi`,
									`echo "DEPLOY_COMPLETE: $DEPLOY_COMPLETE"`,
								],
							),
							`mkdir -p $CODEBUILD_SRC_DIR/.${EXTRACT_ACTION} || true`,
							`docker cp $(cat .container):/tmp/${PIPELINE_STAGE} $CODEBUILD_SRC_DIR/.${EXTRACT_ACTION}`,
							`ls -al $CODEBUILD_SRC_DIR/.${EXTRACT_ACTION} || true`,
							`ls -al $CODEBUILD_SRC_DIR/.${EXTRACT_ACTION}/${PIPELINE_STAGE} || true`,
							`ls -al $CODEBUILD_SRC_DIR/.${EXTRACT_ACTION}/${PIPELINE_STAGE}/node_modules`,
							// bootstrap binary
							...(LLRT_ARCH
								? [
										`echo 'LLRT_ARCH: ${LLRT_ARCH}, extracting bootstrap'`,
										[
											...[
												"docker run",
												...[
													"--detach",
													"--entrypoint bootstrap",
													`--env BOOTSTRAP_ARCH=llrt/${LLRT_ARCH}`,
												],
												"$SOURCE_IMAGE_URI",
											],
											"> .container",
										].join(" "),
										"docker ps -al",
										...[8, 4].flatMap((i) => [
											`cat .container`,
											`sleep ${i}s`,
											`docker container logs $(cat .container)`,
										]),
										`docker cp $(cat .container):/tmp/bootstrap $CODEBUILD_SRC_DIR/.${EXTRACT_ACTION}/bootstrap`,
										`ls -al $CODEBUILD_SRC_DIR/.${EXTRACT_ACTION} || true`,
										`ls -al $CODEBUILD_SRC_DIR/.${EXTRACT_ACTION}/${PIPELINE_STAGE} || true`,
										`du -sh $CODEBUILD_SRC_DIR/.${EXTRACT_ACTION}/${PIPELINE_STAGE}/${OUTPUT_DIRECTORY} || true`,
									]
								: [
										`echo 'No LLRT_ARCH specified, removing ${OUTPUT_DIRECTORY}'`,
										`rm -rf $CODEBUILD_SRC_DIR/.${EXTRACT_ACTION}/${PIPELINE_STAGE}/${OUTPUT_DIRECTORY} || true`,
										`ls -al $CODEBUILD_SRC_DIR/.${EXTRACT_ACTION}/${PIPELINE_STAGE} || true`,
									]),
							// atlasfiles
							...objectEntries(ATLASFILE_PATHS).flatMap(([name, { path }]) => {
								const objectKey = `$ATLASFILE_${name.toUpperCase()}_KEY`;
								return [
									`echo "Rendering Atlasfile: ${name}"`,
									`echo "s3://${objectKey}"`,
									`aws s3 cp s3://${objectKey} $CODEBUILD_SRC_DIR/.${EXTRACT_ACTION}/${PIPELINE_STAGE}/${path}`,
									`cat $CODEBUILD_SRC_DIR/.${EXTRACT_ACTION}/${PIPELINE_STAGE}/${path}`,
								];
							}),
							// deploy key
							`echo "Rendering deploy key to .deploykey"`,
							`NODE_NO_WARNINGS=1 node -e '(${
								// biome-ignore lint/complexity/useArrowFunction:
								function () {
									const deploykey = (
										process.env.S3_DEPLOY_KEY ?? "UNKNOWN"
									).replace(/[^a-zA-Z0-9-_.]/g, "_");
									process.stdout.write(deploykey);
								}.toString()
							})()' > .deploykey`,
							"cat .deploykey",
							"aws s3 ls s3://$S3_DEPLOY_BUCKET",
							`export DeployKey=$(cat .deploykey)`,
							`echo $DeployKey`,
						] as string[],
					},
				},
				{
					stage: PIPELINE_STAGE,
					action: UPDATE_ACTION,
					artifact: {
						name: `${PIPELINE_STAGE}_${UPDATE_ACTION}`,
						baseDirectory: undefined as string | undefined,
						files: ["appspec.yml", "appspec.zip"] as string[],
					},
					variables: {
						APPSPEC_TEMPLATE: appspec({
							name: "<LAMBDA_FUNCTION_NAME>",
							alias: "<LAMBDA_FUNCTION_ALIAS>",
							currentVersion: "<CURRENT_VERSION>",
							targetVersion: "<TARGET_VERSION>",
						}).content,
						SOURCE_IMAGE_REPOSITORY: "<SOURCE_IMAGE_REPOSITORY>",
						SOURCE_IMAGE_URI: "<SOURCE_IMAGE_URI>",
						LAMBDA_FUNCTION_NAME: "<LAMBDA_FUNCTION_NAME>",
						S3_DEPLOY_BUCKET: "<S3_DEPLOY_BUCKET>",
						S3_DEPLOY_KEY: "<S3_DEPLOY_KEY>",
						DeployKey: "<DeployKey>",
					},
					exportedVariables: undefined as string[] | undefined,
					environment: {
						type: "ARM_CONTAINER",
						computeType: AwsCodeBuildContainerRoundRobin.next().value,
						image: "aws/codebuild/amazonlinux-aarch64-standard:3.0",
						environmentVariables: [
							{
								name: "SOURCE_IMAGE_REPOSITORY",
								value: "SourceImage.RepositoryName",
								type: "PLAINTEXT",
							},
							{
								name: "SOURCE_IMAGE_URI",
								value: "SourceImage.ImageURI",
								type: "PLAINTEXT",
							},
							{
								name: "LAMBDA_FUNCTION_NAME",
								value: "LAMBDA_FUNCTION_NAME",
								type: "PLAINTEXT",
							},
							{
								name: "LAMBDA_FUNCTION_ALIAS",
								value: "LAMBDA_FUNCTION_ALIAS",
								type: "PLAINTEXT",
							},
							{
								name: "S3_DEPLOY_BUCKET",
								value: s3.artifacts.bucket,
								type: "PLAINTEXT",
							},
							{
								name: "S3_DEPLOY_KEY",
								value: "SourceImage.ImageURI",
								type: "PLAINTEXT",
							},
							{
								name: "DeployKey",
								value: "HttpHandlerExtractImage.DeployKey",
								type: "PLAINTEXT",
							},
						] as { name: string; value: string; type: "PLAINTEXT" }[],
					},
					phases: {
						build: [
							"env",
							"aws s3 ls s3://$S3_DEPLOY_BUCKET",
							`export CURRENT_VERSION=$(aws lambda get-function --qualifier ${stage} --function-name $LAMBDA_FUNCTION_NAME --query 'Configuration.Version' --output text)`,
							"echo $CURRENT_VERSION",
							[
								"aws lambda update-function-configuration",
								"--function-name $LAMBDA_FUNCTION_NAME",
								`--handler ${PIPELINE_STAGE}/${HANDLER}`,
							].join(" "),
							[
								"aws lambda wait function-updated",
								"--function-name $LAMBDA_FUNCTION_NAME",
								`--qualifier ${stage}`,
							].join(" "),
							"echo $DeployKey",
							[
								"aws lambda update-function-code",
								"--function-name $LAMBDA_FUNCTION_NAME",
								"--s3-bucket $S3_DEPLOY_BUCKET",
								"--s3-key $DeployKey",
								"--publish",
								"> .version",
							].join(" "),
							"export TARGET_VERSION=$(jq -r '.Version' .version)",
							"echo $TARGET_VERSION",
							"echo $APPSPEC_TEMPLATE",
							`NODE_NO_WARNINGS=1 node -e '(${
								// biome-ignore lint/complexity/useArrowFunction:
								function () {
									const template = process.env.APPSPEC_TEMPLATE;
									const lambdaArn = process.env.LAMBDA_FUNCTION_NAME;
									const lambdaAlias = process.env.LAMBDA_FUNCTION_ALIAS;
									const currentVersion = process.env.CURRENT_VERSION;
									const targetVersion = process.env.TARGET_VERSION;

									if (!template) {
										throw new Error("APPSPEC_TEMPLATE not set");
									}

									if (currentVersion === targetVersion) {
										throw new Error("Version is the same");
									}

									const appspec = template
										.replace("<LAMBDA_FUNCTION_NAME>", lambdaArn ?? "!")
										.replace("<LAMBDA_FUNCTION_ALIAS>", lambdaAlias ?? "!")
										.replace("<CURRENT_VERSION>", currentVersion ?? "!")
										.replace("<TARGET_VERSION>", targetVersion ?? "!");

									process.stdout.write(appspec);
								}.toString()
							})()' > appspec.yml`,
							"cat appspec.yml",
							"zip appspec.zip appspec.yml",
							"ls -al",
						] as string[],
					},
				},
			] as const;

			const entries = objectFromEntries(
				stages.map(
					({
						stage,
						action,
						artifact,
						environment,
						variables,
						phases,
						exportedVariables,
					}) => {
						const artifacts = new CodeBuildBuildspecArtifactsBuilder()
							.setFiles(artifact.files)
							.setName(artifact.name);

						if (artifact.baseDirectory) {
							artifacts.setBaseDirectory(artifact.baseDirectory);
						}

						const env = new CodeBuildBuildspecEnvBuilder().setVariables(
							variables,
						);
						if (exportedVariables) {
							env.setExportedVariables(exportedVariables);
						}

						const content = stringify(
							new CodeBuildBuildspecBuilder()
								.setVersion(0.2)
								.setArtifacts(artifacts)
								.setEnv(env)
								.setPhases({
									build:
										new CodeBuildBuildspecResourceLambdaPhaseBuilder().setCommands(
											phases.build,
										),
								})
								.build(),
						);

						const upload = new BucketObjectv2(_(`${artifact.name}-buildspec`), {
							bucket: s3.resources.bucket,
							content,
							key: `build/${artifact.name}/Buildspec.yml`,
						});

						const project = new Project(
							_(`${artifact.name}`),
							{
								description: `(${PACKAGE_NAME}) Deploy "${stage}" pipeline stage: "${action}"`,
								buildTimeout: 14,
								serviceRole: automationRole.arn,
								artifacts: {
									type: "CODEPIPELINE",
									artifactIdentifier: artifact.name,
								},
								logsConfig: {
									cloudwatchLogs: {
										groupName: cloudwatch.build.loggroup.name,
										streamName: `${artifact.name}`,
									},
									// s3Logs: {
									// 	status: "ENABLED",
									// 	location: s3.build.bucket,
									// },
								},
								environment,
								source: {
									type: "CODEPIPELINE",
									buildspec: content,
								},
								tags: {
									Name: _(artifact.name),
									StackRef: STACKREF_ROOT,
									PackageName: PACKAGE_NAME,
									Handler: "http",
									DeployStage: stage,
									Action: action,
								},
							},
							{
								dependsOn: [
									upload,
									cloudmap.instance,
									handler.codedeploy.deploymentGroup,
									...Object.values(handler.configuration).map((c) => c.object),
								],
							},
						);

						return [
							artifact.name,
							{
								stage,
								action,
								artifactName: artifact.name,
								project,
								buildspec: {
									content,
									upload,
								},
							},
						];
					},
				),
			);

			return entries;
		})();

		return {
			...project,
		} as const;
	})();

	const imageTag = `${APPLICATION_IMAGE_NAME}-${stage}`;
	const codepipeline = (() => {
		const randomid = new RandomId(_("deploy-id"), {
			byteLength: 4,
		});
		const pipelineName = _("deploy").replace(/[^a-zA-Z0-9_]/g, "-");
		const pipeline = new Pipeline(
			_("deploy"),
			{
				name: interpolate`${pipelineName}-${randomid.hex}`,
				pipelineType: "V2",
				roleArn: automationRole.arn,
				executionMode: "QUEUED",
				artifactStores: [
					{
						location: s3.pipeline.bucket,
						type: "S3",
					},
				],
				stages: [
					{
						name: "Source",
						actions: [
							{
								name: "Image",
								namespace: "SourceImage",
								category: "Source",
								owner: "AWS",
								provider: "ECR",
								version: "1",
								outputArtifacts: ["source_image"],
								configuration: all([__codestar.ecr.repository.name]).apply(
									([repositoryName]) => {
										return {
											RepositoryName: repositoryName,
											ImageTag: imageTag,
										};
									},
								),
							},
						],
					},
					{
						name: "HttpHandler",
						actions: [
							{
								runOrder: 1,
								name: "ExtractImage",
								namespace: "HttpHandlerExtractImage",
								category: "Build",
								owner: "AWS",
								provider: "CodeBuild",
								version: "1",
								inputArtifacts: ["source_image"],
								outputArtifacts: [
									codebuild.httphandler_extractimage.artifactName,
								],
								configuration: all([
									__codestar.ecr.repository.arn,
									__codestar.ecr.repository.name,
									__codestar.ecr.repository.url,
									codebuild.httphandler_extractimage.project.name,
									s3.artifacts.bucket,
									Output.create([
										...objectEntries(handler.configuration).map(
											([name, file]) => ({
												name: name.toUpperCase(),
												value: interpolate`${file.object.bucket}/${file.object.key}`,
											}),
										),
									]),
								]).apply(
									([
										repositoryArn,
										repositoryName,
										repositoryUrl,
										projectExtractImageName,
										deployBucketName,
										atlasfiles,
									]) => {
										return {
											ProjectName: projectExtractImageName,
											EnvironmentVariables: JSON.stringify([
												{
													name: "STACKREF_CODESTAR_ECR_REPOSITORY_ARN",
													value: repositoryArn,
													type: "PLAINTEXT",
												},
												{
													name: "STACKREF_CODESTAR_ECR_REPOSITORY_NAME",
													value: repositoryName,
													type: "PLAINTEXT",
												},
												{
													name: "STACKREF_CODESTAR_ECR_REPOSITORY_URL",
													value: repositoryUrl,
													type: "PLAINTEXT",
												},
												{
													name: "SOURCE_IMAGE_REPOSITORY",
													value: "#{SourceImage.RepositoryName}",
													type: "PLAINTEXT",
												},
												{
													name: "SOURCE_IMAGE_URI",
													value: "#{SourceImage.ImageURI}",
													type: "PLAINTEXT",
												},
												{
													name: "S3_DEPLOY_BUCKET",
													value: deployBucketName,
													type: "PLAINTEXT",
												},
												{
													name: "S3_DEPLOY_KEY",
													value: "#{SourceImage.ImageURI}",
													type: "PLAINTEXT",
												},
												...atlasfiles.map(({ name, value }) => ({
													name: `ATLASFILE_${name.toUpperCase()}_KEY`,
													value,
													type: "PLAINTEXT",
												})),
											]),
										};
									},
								),
							},
							{
								runOrder: 2,
								name: "UploadS3",
								namespace: "HttpHandlerUploadS3",
								category: "Deploy",
								owner: "AWS",
								provider: "S3",
								version: "1",
								inputArtifacts: [
									codebuild.httphandler_extractimage.artifactName,
								],
								configuration: all([s3.artifacts.bucket]).apply(
									([BucketName]) => ({
										BucketName,
										Extract: "false",
										ObjectKey: "#{HttpHandlerExtractImage.DeployKey}",
									}),
								),
							},
							{
								runOrder: 3,
								name: "UpdateLambda",
								namespace: "HttpHandlerUpdateLambda",
								category: "Build",
								owner: "AWS",
								provider: "CodeBuild",
								version: "1",
								inputArtifacts: [
									codebuild.httphandler_extractimage.artifactName,
								],
								outputArtifacts: [
									codebuild.httphandler_updatelambda.artifactName,
								],
								configuration: all([
									codebuild.httphandler_updatelambda.project.name,
									handler.http.name,
									handler.http.alias.name,
									s3.artifacts.bucket,
								]).apply(
									([
										projectName,
										functionName,
										aliasName,
										deployBucketName,
									]) => {
										return {
											ProjectName: projectName,
											EnvironmentVariables: JSON.stringify([
												{
													name: "SOURCE_IMAGE_REPOSITORY",
													value: "#{SourceImage.RepositoryName}",
													type: "PLAINTEXT",
												},
												{
													name: "SOURCE_IMAGE_URI",
													value: "#{SourceImage.ImageURI}",
													type: "PLAINTEXT",
												},
												{
													name: "LAMBDA_FUNCTION_NAME",
													value: functionName,
													type: "PLAINTEXT",
												},
												{
													name: "LAMBDA_FUNCTION_ALIAS",
													value: aliasName,
													type: "PLAINTEXT",
												},
												{
													name: "S3_DEPLOY_BUCKET",
													value: deployBucketName,
													type: "PLAINTEXT",
												},
												{
													name: "S3_DEPLOY_KEY",
													value: "#{SourceImage.ImageURI}",
													type: "PLAINTEXT",
												},
												{
													name: "DeployKey",
													value: "#{HttpHandlerExtractImage.DeployKey}",
													type: "PLAINTEXT",
												},
											]),
										};
									},
								),
							},
							{
								runOrder: 4,
								name: "Cutover",
								category: "Deploy",
								owner: "AWS",
								provider: "CodeDeploy",
								version: "1",
								inputArtifacts: [
									codebuild.httphandler_updatelambda.artifactName,
								],
								configuration: all([
									__codestar.codedeploy.application.name,
									handler.codedeploy.deploymentGroup.deploymentGroupName,
								]).apply(([applicationName, deploymentGroupName]) => {
									return {
										ApplicationName: applicationName,
										DeploymentGroupName: deploymentGroupName,
									};
								}),
							},
						],
					},
				],
				tags: {
					Name: _("deploy"),
					StackRef: STACKREF_ROOT,
					PackageName: PACKAGE_NAME,
				},
			},
			{
				dependsOn: [handler.codedeploy.deploymentGroup],
			},
		);

		return {
			pipeline,
		};
	})();

	// Eventbridge
	const eventbridge = (() => {
		const { name: codestarRepositoryName } = __codestar.ecr.repository;
		const rule = new EventRule(
			_("on-ecr-push"),
			{
				description: `(${PACKAGE_NAME}) ECR image deploy pipeline trigger for tag "${imageTag}"`,
				state: "ENABLED",
				eventPattern: JSON.stringify({
					source: ["aws.ecr"],
					"detail-type": ["ECR Image Action"],
					detail: {
						"repository-name": [codestarRepositoryName],
						"action-type": ["PUSH"],
						result: ["SUCCESS"],
						"image-tag": [imageTag],
					},
				}),
				tags: {
					Name: _(`on-ecr-push`),
					StackRef: STACKREF_ROOT,
					Stage: stage,
					ImageTag: imageTag,
				},
			},
			{
				deleteBeforeReplace: true,
			},
		);

		const pipeline = new EventTarget(
			_("on-ecr-push-deploy"),
			{
				rule: rule.name,
				arn: codepipeline.pipeline.arn,
				roleArn: automationRole.arn,
			},
			{
				deleteBeforeReplace: true,
			},
		);

		return {
			EcrImageAction: {
				rule,
				targets: {
					pipeline,
				},
			},
		};
	})();

	// Outputs
	const s3Output = Output.create(
		objectFromEntries(
			objectEntries(s3).map(([key, bucket]) => {
				return [
					key,
					all([bucket.bucket, bucket.region]).apply(
						([bucketName, bucketRegion]) => ({
							bucket: bucketName,
							region: bucketRegion,
						}),
					),
				];
			}),
		),
	);

	const cloudwatchOutput = Output.create(
		objectFromEntries(
			objectEntries(cloudwatch).map(([key, { loggroup }]) => {
				return [
					key,
					all([loggroup.name, loggroup.arn]).apply(([name, arn]) => ({
						logGroup: {
							name,
							arn,
						},
					})),
				];
			}),
		),
	);

	const codebuildProjectsOutput = Output.create(
		objectFromEntries(
			objectEntries(codebuild).map(([key, resources]) => {
				return [
					key,
					all([
						resources.project.arn,
						resources.project.name,
						resources.buildspec.upload.bucket,
						resources.buildspec.upload.key,
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
		),
	);

	const handlerOutput = Output.create(handler).apply((handler) => ({
		role: all([handler.role.arn, handler.role.name]).apply(([arn, name]) => ({
			arn,
			name,
		})),
		function: all([
			handler.http.arn,
			handler.http.name,
			handler.http.url,
			handler.http.version.version,
			handler.http.alias.arn,
			handler.http.alias.name,
			handler.http.alias.functionVersion,
		]).apply(
			([arn, name, url, version, aliasArn, aliasName, functionVersion]) => ({
				arn,
				name,
				url,
				version,
				alias: {
					arn: aliasArn,
					name: aliasName,
					functionVersion,
				},
			}),
		),
		codedeploy: all([
			handler.codedeploy.deploymentGroup.arn,
			handler.codedeploy.deploymentGroup.deploymentGroupName,
		]).apply(([arn, name]) => ({ deploymentGroup: { arn, name } })),
	}));

	const cloudmapOutput = Output.create(cloudmap).apply((cloudmap) => ({
		namespace: {
			arn: __datalayer.cloudmap.namespace.arn,
			name: __datalayer.cloudmap.namespace.name,
			id: __datalayer.cloudmap.namespace.id,
			hostedZone: __datalayer.cloudmap.namespace.hostedZone,
		},
		service: all([cloudmap.service.arn, cloudmap.service.name]).apply(
			([arn, name]) => ({ arn, name }),
		),
		instance: all([
			cloudmap.instance.instanceId,
			cloudmap.instance.attributes,
		]).apply(([id, attributes]) => ({ id, attributes })),
	}));

	const codepipelineOutput = Output.create(codepipeline).apply(
		(codepipeline) => ({
			pipeline: all([
				codepipeline.pipeline.arn,
				codepipeline.pipeline.name,
				codepipeline.pipeline.roleArn,
				codepipeline.pipeline.stages.apply((stages) =>
					stages.map((stage) => ({
						name: stage.name,
						actions: stage.actions.map((action) => ({
							runOrder: action.runOrder,
							name: action.name,
							category: action.category,
							provider: action.provider,
							configuration: action.configuration,
						})),
					})),
				),
			]).apply(([arn, name, roleArn, stages]) => ({
				arn,
				name,
				roleArn,
				stages,
			})),
		}),
	);

	const eventbridgeRulesOutput = Output.create(eventbridge).apply(
		(eventbridge) => {
			return objectFromEntries(
				objectEntries(eventbridge).map(([key, value]) => {
					return [
						key,
						all([
							value.rule.arn,
							value.rule.name,
							Output.create(value.targets).apply((targets) =>
								objectFromEntries(
									objectEntries(targets).map(([key, value]) => {
										return [
											key,
											all([value.arn, value.targetId]).apply(
												([arn, targetId]) => ({ arn, targetId }),
											),
										];
									}),
								),
							),
						]).apply(([ruleArn, ruleName, targets]) => ({
							rule: {
								arn: ruleArn,
								name: ruleName,
							},
							targets,
						})),
					];
				}),
			);
		},
	);

	return all([
		s3Output,
		cloudwatchOutput,
		handlerOutput,
		cloudmapOutput,
		codebuildProjectsOutput,
		codepipelineOutput,
		eventbridgeRulesOutput,
	]).apply(
		([
			spork_magmap_http_s3,
			spork_magmap_http_cloudwatch,
			spork_magmap_http_lambda,
			spork_magmap_http_cloudmap,
			spork_magmap_http_codebuild,
			spork_magmap_http_codepipeline,
			spork_magmap_http_eventbridge,
		]) => {
			const spork_magmap_http_routemap = (() => {
				const routes: Partial<
					Record<MapgmapWWWRootRoute, Route<LambdaRouteResource>>
				> = {
					["/~/Spork/Magmap"]: {
						$kind: "LambdaRouteResource",
						lambda: {
							arn: spork_magmap_http_lambda.function.arn,
							name: spork_magmap_http_lambda.function.name,
							role: {
								arn: spork_magmap_http_lambda.role.arn,
								name: spork_magmap_http_lambda.role.name,
							},
							qualifier: spork_magmap_http_lambda.function.alias.name,
						},
						hostname: spork_magmap_http_lambda.function.url.replace(
							"https://",
							"",
						),
						protocol: "https",
						cloudmap: {
							namespace: {
								arn: spork_magmap_http_cloudmap.namespace.arn,
								name: spork_magmap_http_cloudmap.namespace.name,
								id: spork_magmap_http_cloudmap.namespace.id,
								hostedZone: spork_magmap_http_cloudmap.namespace.hostedZone,
							},
							service: {
								arn: spork_magmap_http_cloudmap.service.arn,
								name: spork_magmap_http_cloudmap.service.name,
							},
							instance: {
								id: spork_magmap_http_cloudmap.instance.id,
								attributes: spork_magmap_http_cloudmap.instance.attributes,
							},
						},
					},
				};
				return routes;
			})();

			const exported = {
				spork_magmap_http_imports: {
					[SporkApplicationRoot]: {
						codestar: __codestar,
						datalayer: __datalayer,
					},
				},
				spork_magmap_http_s3,
				spork_magmap_http_cloudwatch,
				spork_magmap_http_lambda,
				spork_magmap_http_cloudmap,
				spork_magmap_http_codebuild,
				spork_magmap_http_codepipeline,
				spork_magmap_http_eventbridge,
				spork_magmap_http_routemap,
			} satisfies z.infer<typeof SporkMagmapHttpStackExportsZod> & {
				spork_magmap_http_imports: {
					[SporkApplicationRoot]: {
						codestar: typeof __codestar;
						datalayer: typeof __datalayer;
					};
				};
			};
			const validate = SporkMagmapHttpStackExportsZod.safeParse(exported);
			if (!validate.success) {
				error(`Validation failed: ${JSON.stringify(validate.error, null, 2)}`);
				warn(inspect(exported, { depth: null }));
			}

			return $$root(APPLICATION_IMAGE_NAME, STACKREF_ROOT, exported);
		},
	);
};
