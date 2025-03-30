import { inspect } from "node:util";
import {
	CodeBuildBuildspecArtifactsBuilder,
	CodeBuildBuildspecBuilder,
	CodeBuildBuildspecEnvBuilder,
	CodeBuildBuildspecResourceLambdaPhaseBuilder,
} from "@levicape/fourtwo-builders/commonjs/index.cjs";
import { Context } from "@levicape/fourtwo-pulumi/commonjs/context/Context.cjs";
import { EventRule, EventTarget } from "@pulumi/aws/cloudwatch";
import { Project } from "@pulumi/aws/codebuild";
import { Pipeline } from "@pulumi/aws/codepipeline";
import { getRole } from "@pulumi/aws/iam/getRole";
import {
	Bucket,
	BucketLifecycleConfigurationV2,
	BucketServerSideEncryptionConfigurationV2,
} from "@pulumi/aws/s3";
import { BucketObjectv2 } from "@pulumi/aws/s3/bucketObjectv2";
import { BucketOwnershipControls } from "@pulumi/aws/s3/bucketOwnershipControls";
import { BucketPublicAccessBlock } from "@pulumi/aws/s3/bucketPublicAccessBlock";
import { BucketVersioningV2 } from "@pulumi/aws/s3/bucketVersioningV2";
import { BucketWebsiteConfigurationV2 } from "@pulumi/aws/s3/bucketWebsiteConfigurationV2";
import { type Output, all, interpolate } from "@pulumi/pulumi";
import { error, warn } from "@pulumi/pulumi/log";
import { RandomId } from "@pulumi/random/RandomId";
import { stringify } from "yaml";
import type { z } from "zod";
import { AwsCodeBuildContainerRoundRobin } from "../../../RoundRobin";
import type {
	Route,
	S3RouteResource,
	WebsiteManifest,
} from "../../../RouteMap";
import { $deref, type DereferencedOutput } from "../../../Stack";
import {
	SporkApplicationRoot,
	SporkApplicationStackExportsZod,
} from "../../../application/exports";
import { SporkCodestarStackExportsZod } from "../../../codestar/exports";
import { SporkDatalayerStackExportsZod } from "../../../datalayer/exports";
import {
	SporkHttpStackExportsZod,
	SporkHttpStackrefRoot,
} from "../../../http/exports";
import {
	SporkIdpUsersStackExportsZod,
	SporkIdpUsersStackrefRoot,
} from "../../../idp/users/exports";
import {
	SporkMagmapChannelsStackExportsZod,
	SporkMagmapChannelsStackrefRoot,
} from "../channels/exports";
import {
	SporkMagmapClientOauthRoutes,
	SporkMagmapClientStackExportsZod,
	SporkMagmapClientStackrefRoot,
} from "../client/exports";
import {
	SporkMagmapHttpStackExportsZod,
	SporkMagmapHttpStackrefRoot,
} from "../http/exports";
import { SporkMagmapWWWRootSubdomain } from "../wwwroot/exports";

import { LogGroup } from "@pulumi/aws/cloudwatch/logGroup";
import { SporkMagmapWebStackExportsZod } from "./exports";

const PACKAGE_NAME = "@levicape/spork-magmap-ui" as const;
const SUBDOMAIN =
	process.env["STACKREF_SUBDOMAIN"] ?? SporkMagmapWWWRootSubdomain;
const DEPLOY_DIRECTORY = "dist" as const;
const MANIFEST_PATH = "/_web/routemap.json" as const;

const STACKREF_ROOT = process.env["STACKREF_ROOT"] ?? SporkApplicationRoot;
const STACKREF_CONFIG = {
	[STACKREF_ROOT]: {
		application: {
			refs: {
				servicecatalog:
					SporkApplicationStackExportsZod.shape
						.spork_application_servicecatalog,
				sns: SporkApplicationStackExportsZod.shape.spork_application_sns,
			},
		},
		codestar: {
			refs: {
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
				iam: SporkDatalayerStackExportsZod.shape.spork_datalayer_iam,
			},
		},
		[SporkIdpUsersStackrefRoot]: {
			refs: {
				cognito: SporkIdpUsersStackExportsZod.shape.spork_idp_users_cognito,
			},
		},

		[SporkHttpStackrefRoot]: {
			refs: {
				routemap: SporkHttpStackExportsZod.shape.spork_http_routemap,
			},
		},
		[SporkMagmapClientStackrefRoot]: {
			refs: {
				cognito:
					SporkMagmapClientStackExportsZod.shape.spork_magmap_client_cognito,
			},
		},
		[SporkMagmapChannelsStackrefRoot]: {
			refs: {
				sns: SporkMagmapChannelsStackExportsZod.shape.spork_magmap_channels_sns,
			},
		},
		[SporkMagmapHttpStackrefRoot]: {
			refs: {
				routemap:
					SporkMagmapHttpStackExportsZod.shape.spork_magmap_http_routemap,
			},
		},
	},
};

const ROUTE_MAP = ({
	http,
}: DereferencedOutput<typeof STACKREF_CONFIG>[typeof STACKREF_ROOT]) => {
	return {
		...http.routemap,
	};
};

export = async () => {
	// Stack references
	const dereferenced$ = await $deref(STACKREF_CONFIG);
	const { codestar, datalayer } = dereferenced$;

	const context = await Context.fromConfig({
		aws: {
			awsApplication: dereferenced$.application.servicecatalog.application.tag,
		},
	});
	const _ = (name?: string) =>
		name ? `${context.prefix}-${name}` : context.prefix;
	context.resourcegroups({ _ });

	const stage = process.env.CI_ENVIRONMENT ?? "unknown";
	const automationRole = await getRole({
		name: datalayer.iam.roles.automation.name,
	});

	const routemap = ROUTE_MAP(dereferenced$);

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
		};
	})();

	// Object Store
	const s3 = (() => {
		const bucket = (
			name: string,
			props?: {
				daysToRetain?: number;
				www?: boolean;
			},
		) => {
			const { daysToRetain, www } = {
				daysToRetain:
					props?.www === true ? undefined : context.environment.isProd ? 30 : 8,
				www: false,
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

			let website: BucketWebsiteConfigurationV2 | undefined;
			if (www === true) {
				const bucketName = bucket.bucket;
				const publicAccessBlock = new BucketPublicAccessBlock(
					_(`${name}-public-access`),
					{
						bucket: bucketName,
						blockPublicAcls: false,
						blockPublicPolicy: false,
						ignorePublicAcls: false,
						restrictPublicBuckets: false,
					},
					{
						deletedWith: bucket,
					},
				);

				const ownershipControls = new BucketOwnershipControls(
					_(`${name}-ownership-controls`),
					{
						bucket: bucketName,
						rule: {
							objectOwnership: "ObjectWriter",
						},
					},
					{
						dependsOn: [bucket, publicAccessBlock],
						deletedWith: bucket,
					},
				);

				website = new BucketWebsiteConfigurationV2(
					_(`${name}-website`),
					{
						bucket: bucketName,
						indexDocument: {
							suffix: "index.html",
						},
						errorDocument: {
							key: "error.html",
						},
					},
					{
						dependsOn: [bucket, publicAccessBlock, ownershipControls],
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
				bucket,
				website,
			};
		};

		return {
			pipeline: bucket("pipeline"),
			artifacts: bucket("artifacts"),
			staticwww: bucket("staticwww", { www: true }),
		};
	})();

	// Website Manifest
	if (routemap) {
		(() => {
			const {
				environment: { isProd },
				frontend,
			} = context;

			let content: Output<{ WebsiteComponent: WebsiteManifest }> | undefined;
			content = all([s3.staticwww.website?.websiteEndpoint ?? ""]).apply(
				([url]) => {
					const { dns } = frontend ?? {};
					const { hostnames } = dns ?? {};
					return {
						WebsiteComponent: {
							manifest: {
								ok: true,
								routes: routemap,
								frontend: {
									...(isProd
										? {}
										: {
												website: {
													hostname: url,
													protocol: "http",
												},
											}),
									hostnames: hostnames ?? [],
								},
							},
						} satisfies WebsiteManifest,
					};
				},
			);

			let upload: BucketObjectv2 | undefined;
			if (content) {
				upload = new BucketObjectv2(_("manifest-upload"), {
					bucket: s3.staticwww.bucket.bucket,
					content: content.apply((c) => JSON.stringify(c, null, 2)),
					key: MANIFEST_PATH,
				});
			}

			return {
				routemap: {
					content,
					upload,
				},
			};
		})();
	}

	const extractimage = (() => {
		const deployStage = "staticwww";
		const deployAction = "extractimage";
		const DEPLOY_SENTINEL = "procfile deploy complete" as const;
		const artifactIdentifier = `${deployStage}_${deployAction}`;

		const { codeartifact, ssm } = dereferenced$.codestar;
		// TODO (stackref) => client; // Allow customizing the OIDC.js output
		const { domain } =
			dereferenced$[SporkIdpUsersStackrefRoot].cognito.operators; // *.idp.az.
		const { client: oidcClient } =
			dereferenced$[SporkMagmapClientStackrefRoot].cognito.operators;
		const { clientId, userPoolId } = oidcClient;
		let { domain: domainName } = domain ?? {};
		domainName = domainName?.split(".").slice(3).join("."); // *.
		domainName = `${SUBDOMAIN}.${domainName}`; // SUBDOMAIN.
		const buildspec = (() => {
			const content = stringify(
				new CodeBuildBuildspecBuilder()
					.setVersion("0.2")
					.setArtifacts(
						new CodeBuildBuildspecArtifactsBuilder()
							.setFiles(["**/*"])
							.setBaseDirectory(`.${deployAction}/${DEPLOY_DIRECTORY}`)
							.setName(artifactIdentifier),
					)
					.setEnv(
						new CodeBuildBuildspecEnvBuilder().setVariables({
							STACKREF_CODESTAR_ECR_REPOSITORY_ARN:
								"<STACKREF_CODESTAR_ECR_REPOSITORY_ARN>",
							STACKREF_CODESTAR_ECR_REPOSITORY_NAME:
								"<STACKREF_CODESTAR_ECR_REPOSITORY_NAME>",
							STACKREF_CODESTAR_ECR_REPOSITORY_URL:
								"<STACKREF_CODESTAR_ECR_REPOSITORY_URL>",
							SOURCE_IMAGE_REPOSITORY: "<SOURCE_IMAGE_REPOSITORY>",
							SOURCE_IMAGE_URI: "<SOURCE_IMAGE_URI>",
							S3_STATICWWW_BUCKET: "<S3_STATICWWW_BUCKET>",
						}),
					)
					.setPhases({
						build:
							new CodeBuildBuildspecResourceLambdaPhaseBuilder().setCommands([
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
								`export NPM_REGISTRY=$(cat .codeartifact-repository)`,
								[
									"docker run",
									"--detach",
									"--entrypoint",
									"deploy",
									`-e DEPLOY_FILTER=${PACKAGE_NAME}`,
									`-e DEPLOY_OUTPUT=/tmp/${deployAction}`,
									`--env DEPLOY_ARGS="--verify-store-integrity=false --node-linker=hoisted --prefer-offline"`,
									`--env NPM_REGISTRY`,
									`--env NPM_REGISTRY_HOST=\${NPM_REGISTRY#https://}`,
									`--env NPM_TOKEN=$(cat .codeartifact-token)`,
									`--env NPM_ALWAYS_AUTH=true`,
									`--env LEVICAPE_REGISTRY=${ssm.levicape.npm.url}`,
									`--env LEVICAPE_REGISTRY_HOST=${ssm.levicape.npm.host}`,
									`--env LEVICAPE_TOKEN`,
									`--env LEVICAPE_ALWAYS_AUTH=true`,
									"$SOURCE_IMAGE_URI",
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
								`docker cp $(cat .container):/tmp/${deployAction} $CODEBUILD_SRC_DIR/.${deployAction}`,
								`ls -al $CODEBUILD_SRC_DIR/.${deployAction} || true`,
								`ls -al $CODEBUILD_SRC_DIR/.${deployAction}/${DEPLOY_DIRECTORY} || true`,
								`du -sh $CODEBUILD_SRC_DIR/.${deployAction}/${DEPLOY_DIRECTORY} || true`,
								// OIDC
								...(domainName !== undefined
									? [
											...Object.entries({
												OAUTH_PUBLIC_OIDC_AUTHORITY: `https://cognito-idp.${context?.environment?.aws?.region}.amazonaws.com/${userPoolId}`,
												OAUTH_PUBLIC_OIDC_CLIENT_ID: clientId,
												OAUTH_PUBLIC_OIDC_REDIRECT_URI: `https://${domainName}/${SporkMagmapClientOauthRoutes.callback}`,
												OAUTH_PUBLIC_OIDC_RESPONSE_TYPE: "code",
												OAUTH_PUBLIC_OIDC_SCOPE: "openid profile email",
												OAUTH_PUBLIC_OIDC_POST_LOGOUT_REDIRECT_URI: `https://${domainName}/${SporkMagmapClientOauthRoutes.logout}`,
												OAUTH_PUBLIC_OIDC_SILENT_REDIRECT_URI: `https://${domainName}/${SporkMagmapClientOauthRoutes.renew}`,
											}).flatMap(([key, value]) => [
												`export ${key}="${value}"`,
												`echo $${key}`,
											]),
											`cat $CODEBUILD_SRC_DIR/.${deployAction}/${DEPLOY_DIRECTORY}/_window/oidc.js || true`,
											`cat $CODEBUILD_SRC_DIR/.${deployAction}/${DEPLOY_DIRECTORY}/_window/oidc.js | envsubst  > $CODEBUILD_SRC_DIR/.${deployAction}/${DEPLOY_DIRECTORY}/_window/oidc.js.tmp`,
											`echo "oidc.js: $CODEBUILD_SRC_DIR/.${deployAction}/${DEPLOY_DIRECTORY}/_window/oidc.js"`,
											`cat $CODEBUILD_SRC_DIR/.${deployAction}/${DEPLOY_DIRECTORY}/_window/oidc.js || true`,
											`echo "oidc.js.tmp: $CODEBUILD_SRC_DIR/.${deployAction}/${DEPLOY_DIRECTORY}/_window/oidc.js.tmp"`,
											`cat $CODEBUILD_SRC_DIR/.${deployAction}/${DEPLOY_DIRECTORY}/_window/oidc.js.tmp || true`,
											`mv $CODEBUILD_SRC_DIR/.${deployAction}/${DEPLOY_DIRECTORY}/_window/oidc.js.tmp $CODEBUILD_SRC_DIR/.${deployAction}/${DEPLOY_DIRECTORY}/_window/oidc.js`,
											`cat $CODEBUILD_SRC_DIR/.${deployAction}/${DEPLOY_DIRECTORY}/_window/oidc.js`,
										]
									: []),
								"aws s3 ls s3://$S3_STATICWWW_BUCKET",
							]),
					})
					.build(),
			);

			const upload = new BucketObjectv2(
				_(`${artifactIdentifier}-buildspec-upload`),
				{
					bucket: s3.artifacts.bucket.bucket,
					content,
					key: `${artifactIdentifier}/Buildspec.yml`,
				},
			);

			return {
				content,
				upload,
			};
		})();

		const project = (() => {
			const project = new Project(
				_(artifactIdentifier),
				{
					description: `(${PACKAGE_NAME}) Deploy pipeline "${deployStage}" stage: "${deployAction}"`,
					buildTimeout: 14,
					queuedTimeout: 60 * 6,
					concurrentBuildLimit: 1,
					serviceRole: automationRole.arn,
					artifacts: {
						type: "CODEPIPELINE",
						artifactIdentifier,
					},
					environment: {
						type: "ARM_CONTAINER",
						computeType: AwsCodeBuildContainerRoundRobin.next().value,
						image: "aws/codebuild/amazonlinux-aarch64-standard:3.0",
						environmentVariables: [
							{
								name: "STACKREF_CODESTAR_ECR_REPOSITORY_ARN",
								value: codestar.ecr.repository.arn,
								type: "PLAINTEXT",
							},
							{
								name: "STACKREF_CODESTAR_ECR_REPOSITORY_NAME",
								value: codestar.ecr.repository.name,
								type: "PLAINTEXT",
							},
							{
								name: "STACKREF_CODESTAR_ECR_REPOSITORY_URL",
								value: codestar.ecr.repository.url,
							},
							{
								name: "SOURCE_IMAGE_REPOSITORY",
								value: "SourceImage.RepositoryName",
								type: "PLAINTEXT",
							},
							{
								name: "SOURCE_IMAGE_URI",
								value: "SourceImage.ImageUri",
								type: "PLAINTEXT",
							},
							{
								name: "S3_STATICWWW_BUCKET",
								value: s3.staticwww.bucket.bucket,
								type: "PLAINTEXT",
							},
						],
					},
					logsConfig: {
						cloudwatchLogs: {
							groupName: cloudwatch.build.loggroup.name,
							streamName: `${artifactIdentifier}`,
						},
						// s3Logs: {
						// 	status: "ENABLED",
						// 	location: s3.build.bucket,
						// },
					},
					source: {
						type: "CODEPIPELINE",
						buildspec: buildspec.content,
					},
					tags: {
						Name: _(artifactIdentifier),
						StackRef: STACKREF_ROOT,
						PackageName: PACKAGE_NAME,
						DeployStage: deployStage,
						Action: deployAction,
					},
				},
				{
					dependsOn: [buildspec.upload, s3.staticwww.bucket],
				},
			);

			return {
				project,
			};
		})();

		return {
			...project,
			spec: {
				artifactIdentifier,
				buildspec,
			},
		};
	})();

	const publishchange = (() => {
		const deployStage = "staticwww";
		const deployAction = "publishchangelog";
		const artifactIdentifier = `${deployStage}_${deployAction}`;

		const buildspec = (() => {
			const content = stringify(
				new CodeBuildBuildspecBuilder()
					.setVersion("0.2")
					.setEnv(
						new CodeBuildBuildspecEnvBuilder().setVariables({
							SOURCE_IMAGE_REPOSITORY: "<SOURCE_IMAGE_REPOSITORY>",
							SOURCE_IMAGE_URI: "<SOURCE_IMAGE_URI>",
							SNS_CHANGELOG_TOPIC: "<SNS_CHANGELOG_TOPIC>",
						}),
					)
					.setPhases({
						build:
							new CodeBuildBuildspecResourceLambdaPhaseBuilder().setCommands([
								"env",
								[
									"aws",
									"sns",
									"publish",
									"--topic-arn ${SNS_CHANGELOG_TOPIC}",
									`--message "${PACKAGE_NAME}|\${SOURCE_IMAGE_REPOSITORY}|\${SOURCE_IMAGE_URI}"`,
									"--region $AWS_REGION",
								].join(" "),
							]),
					})
					.build(),
			);

			const upload = new BucketObjectv2(
				_(`${artifactIdentifier}-buildspec-upload`),
				{
					bucket: s3.artifacts.bucket.bucket,
					content,
					key: `${artifactIdentifier}/Buildspec.yml`,
				},
			);

			return {
				content,
				upload,
			};
		})();

		const project = (() => {
			const project = new Project(
				_(artifactIdentifier),
				{
					description: `(${PACKAGE_NAME}) Deploy pipeline "${deployStage}" stage: "${deployAction}"`,
					buildTimeout: 14,
					queuedTimeout: 60 * 8,
					concurrentBuildLimit: 1,
					serviceRole: automationRole.arn,
					artifacts: {
						type: "CODEPIPELINE",
						artifactIdentifier,
					},
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
								value: "SourceImage.ImageUri",
								type: "PLAINTEXT",
							},
							{
								name: "SNS_CHANGELOG_TOPIC",
								value: "<SNS_CHANGELOG_TOPIC>",
								type: "PLAINTEXT",
							},
						],
					},
					logsConfig: {
						cloudwatchLogs: {
							groupName: cloudwatch.build.loggroup.name,
							streamName: `${artifactIdentifier}`,
						},
						// s3Logs: {
						// 	status: "ENABLED",
						// 	location: s3.build.bucket,
						// },
					},
					source: {
						type: "CODEPIPELINE",
						buildspec: buildspec.content,
					},
					tags: {
						Name: _(artifactIdentifier),
						StackRef: STACKREF_ROOT,
						PackageName: PACKAGE_NAME,
						DeployStage: deployStage,
						Action: deployAction,
					},
				},
				{
					dependsOn: [buildspec.upload, s3.staticwww.bucket],
				},
			);

			return {
				project,
			};
		})();

		return {
			...project,
			spec: {
				artifactIdentifier,
				buildspec,
			},
		};
	})();

	const publishrevalidate = (() => {
		const deployStage = "staticwww";
		const deployAction = "publishrevalidate";
		const artifactIdentifier = `${deployStage}_${deployAction}`;

		const buildspec = (() => {
			const content = stringify(
				new CodeBuildBuildspecBuilder()
					.setVersion("0.2")
					.setEnv(
						new CodeBuildBuildspecEnvBuilder().setVariables({
							SOURCE_IMAGE_REPOSITORY: "<SOURCE_IMAGE_REPOSITORY>",
							SOURCE_IMAGE_URI: "<SOURCE_IMAGE_URI>",
							SNS_REVALIDATE_TOPIC: "<SNS_REVALIDATE_TOPIC>",
						}),
					)
					.setPhases({
						build:
							new CodeBuildBuildspecResourceLambdaPhaseBuilder().setCommands([
								"env",
								"set -o noglob",
								[
									"aws",
									"sns",
									"publish",
									"--topic-arn ${SNS_REVALIDATE_TOPIC}",
									`--message "${PACKAGE_NAME}|/*|${SUBDOMAIN}"`,
									"--region $AWS_REGION",
								].join(" "),
							]),
					})
					.build(),
			);

			const upload = new BucketObjectv2(
				_(`${artifactIdentifier}-buildspec-upload`),
				{
					bucket: s3.artifacts.bucket.bucket,
					content,
					key: `${artifactIdentifier}/Buildspec.yml`,
				},
			);

			return {
				content,
				upload,
			};
		})();

		const project = (() => {
			const project = new Project(
				_(artifactIdentifier),
				{
					description: `(${PACKAGE_NAME}) Deploy pipeline "${deployStage}" stage: "${deployAction}"`,
					buildTimeout: 14,
					queuedTimeout: 60 * 8,
					concurrentBuildLimit: 1,
					serviceRole: automationRole.arn,
					artifacts: {
						type: "CODEPIPELINE",
						artifactIdentifier,
					},
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
								value: "SourceImage.ImageUri",
								type: "PLAINTEXT",
							},
							{
								name: "SNS_REVALIDATE_TOPIC",
								value: "<SNS_REVALIDATE_TOPIC>",
								type: "PLAINTEXT",
							},
						],
					},
					logsConfig: {
						cloudwatchLogs: {
							groupName: cloudwatch.build.loggroup.name,
							streamName: `${artifactIdentifier}`,
						},
						// s3Logs: {
						// 	status: "ENABLED",
						// 	location: s3.build.bucket,
						// },
					},
					source: {
						type: "CODEPIPELINE",
						buildspec: buildspec.content,
					},
					tags: {
						Name: _(artifactIdentifier),
						StackRef: STACKREF_ROOT,
						PackageName: PACKAGE_NAME,
						DeployStage: deployStage,
						Action: deployAction,
					},
				},
				{
					dependsOn: [buildspec.upload, s3.staticwww.bucket],
				},
			);

			return {
				project,
			};
		})();

		return {
			...project,
			spec: {
				artifactIdentifier,
				buildspec,
			},
		};
	})();

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
						location: s3.pipeline.bucket.bucket,
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
								configuration: all([codestar.ecr.repository.name]).apply(
									([repositoryName]) => {
										return {
											RepositoryName: repositoryName,
											ImageTag: stage,
										};
									},
								),
							},
						],
					},
					{
						name: "StaticWWW",
						actions: [
							{
								runOrder: 1,
								name: "ExtractImage",
								namespace: "StaticWWWExtractImage",
								category: "Build",
								owner: "AWS",
								provider: "CodeBuild",
								version: "1",
								inputArtifacts: ["source_image"],
								outputArtifacts: [extractimage.spec.artifactIdentifier],
								configuration: all([
									codestar.ecr.repository.arn,
									codestar.ecr.repository.name,
									codestar.ecr.repository.url,
									extractimage.project.name,
									s3.staticwww.bucket.bucket,
								]).apply(
									([
										repositoryArn,
										repositoryName,
										repositoryUrl,
										projectName,
										bucketName,
									]) => {
										return {
											ProjectName: projectName,
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
													name: "S3_STATICWWW_BUCKET",
													value: bucketName,
													type: "PLAINTEXT",
												},
											]),
										};
									},
								),
							},
							{
								runOrder: 2,
								name: "UploadS3",
								namespace: "StaticWWWUploadS3",
								category: "Deploy",
								owner: "AWS",
								provider: "S3",
								version: "1",
								inputArtifacts: [extractimage.spec.artifactIdentifier],
								configuration: all([s3.staticwww.bucket.bucket]).apply(
									([BucketName]) => ({
										BucketName,
										Extract: "true",
										CannedACL: "public-read",
									}),
								),
							},
							{
								runOrder: 3,
								name: "PublishChangelog",
								namespace: "StaticWWWPublishChangelog",
								category: "Build",
								owner: "AWS",
								provider: "CodeBuild",
								version: "1",
								inputArtifacts: ["source_image"],
								configuration: all([publishchange.project.name]).apply(
									([projectName]) => {
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
													name: "SNS_CHANGELOG_TOPIC",
													value:
														dereferenced$.application.sns.changelog.topic.arn,
													type: "PLAINTEXT",
												},
											]),
										};
									},
								),
							},
							{
								runOrder: 3,
								name: "PublishRevalidate",
								namespace: "StaticWWWPublishRevalidate",
								category: "Build",
								owner: "AWS",
								provider: "CodeBuild",
								version: "1",
								inputArtifacts: ["source_image"],
								configuration: all([publishrevalidate.project.name]).apply(
									([projectName]) => {
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
													name: "SNS_REVALIDATE_TOPIC",
													value:
														dereferenced$[SporkMagmapChannelsStackrefRoot].sns
															.revalidate.topic.arn,
													type: "PLAINTEXT",
												},
											]),
										};
									},
								),
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
				dependsOn: [
					s3.pipeline.bucket,
					s3.artifacts.bucket,
					extractimage.project,
					publishchange.project,
				],
			},
		);

		return {
			pipeline,
		};
	})();

	// Eventbridge will trigger on ecr push
	const eventbridge = (() => {
		const { name } = codestar.ecr.repository;

		const rule = new EventRule(_("on-ecr-push"), {
			description: `(${PACKAGE_NAME}) ECR image deploy pipeline trigger for tag "${name}"`,
			state: "ENABLED",
			eventPattern: JSON.stringify({
				source: ["aws.ecr"],
				"detail-type": ["ECR Image Action"],
				detail: {
					"repository-name": [name],
					"action-type": ["PUSH"],
					result: ["SUCCESS"],
					"image-tag": [stage],
				},
			}),
			tags: {
				Name: _(`on-ecr-push`),
				StackRef: STACKREF_ROOT,
			},
		});
		const pipeline = new EventTarget(_("on-ecr-deploy"), {
			rule: rule.name,
			arn: codepipeline.pipeline.arn,
			roleArn: automationRole.arn,
		});

		return {
			EcrImageAction: {
				rule,
				targets: {
					pipeline,
				},
			},
		};
	})();

	return all([
		s3.pipeline.bucket.bucket,
		s3.artifacts.bucket.bucket,
		s3.staticwww.bucket.arn,
		s3.staticwww.bucket.bucket,
		s3.staticwww.bucket.bucketDomainName,
		s3.staticwww.website?.websiteEndpoint ?? "",
		s3.staticwww.website?.websiteDomain ?? "",
		extractimage.project.arn,
		extractimage.project.name,
		codepipeline.pipeline.arn,
		codepipeline.pipeline.name,
		eventbridge.EcrImageAction.rule.arn,
		eventbridge.EcrImageAction.rule.name,
		eventbridge.EcrImageAction.targets.pipeline.arn,
		eventbridge.EcrImageAction.targets.pipeline.targetId,
	]).apply(
		([
			pipelineBucket,
			artifactsBucket,
			webBucketArn,
			webBucketName,
			webBucketDomainName,
			webBucketWebsiteEndpoint,
			webBucketWebsiteDomain,
			codebuildProjectArn,
			codebuildProjectName,
			pipelineArn,
			pipelineName,
			eventRuleArn,
			eventRuleName,
			eventTargetArn,
			eventTargetId,
		]) => {
			const spork_magmap_web_routemap = (() => {
				const routes: Partial<Record<"/", Route<S3RouteResource>>> = {
					["/"]: {
						$kind: "S3RouteResource",
						hostname: webBucketWebsiteEndpoint.replace("http://", ""),
						protocol: "http",
						bucket: {
							arn: webBucketArn,
							name: webBucketName,
							domainName: webBucketDomainName,
						},
						website: {
							domain: webBucketWebsiteDomain,
							endpoint: webBucketWebsiteEndpoint,
						},
					},
				};
				return routes;
			})();

			const exported = {
				spork_magmap_web_imports: {
					[SporkApplicationRoot]: {
						codestar,
						datalayer,
						http: dereferenced$["http"],
						[SporkMagmapHttpStackrefRoot]:
							dereferenced$[SporkMagmapHttpStackrefRoot],
					},
				},
				spork_magmap_web_s3: {
					pipeline: {
						bucket: pipelineBucket,
					},
					artifacts: {
						bucket: artifactsBucket,
					},
					staticwww: {
						bucket: webBucketName,
						public: {
							arn: webBucketArn,
							domainName: webBucketDomainName,
							websiteEndpoint: webBucketWebsiteEndpoint,
							websiteDomain: webBucketWebsiteDomain,
						},
					},
				},
				spork_magmap_web_codebuild: {
					project: {
						arn: codebuildProjectArn,
						name: codebuildProjectName,
					},
				},
				spork_magmap_web_pipeline: {
					pipeline: {
						arn: pipelineArn,
						name: pipelineName,
					},
				},
				spork_magmap_web_eventbridge: {
					EcrImageAction: {
						rule: {
							arn: eventRuleArn,
							name: eventRuleName,
						},
						targets: {
							pipeline: {
								arn: eventTargetArn,
								targetId: eventTargetId,
							},
						},
					},
				},
				spork_magmap_web_routemap,
			} satisfies z.infer<typeof SporkMagmapWebStackExportsZod> & {
				spork_magmap_web_imports: {
					[SporkApplicationRoot]: {
						codestar: typeof codestar;
						datalayer: typeof datalayer;
						http: (typeof dereferenced$)["http"];
						[SporkMagmapHttpStackrefRoot]: (typeof dereferenced$)[typeof SporkMagmapHttpStackrefRoot];
					};
				};
			};

			const validate = SporkMagmapWebStackExportsZod.safeParse(exported);
			if (!validate.success) {
				error(`Validation failed: ${JSON.stringify(validate.error, null, 2)}`);
				warn(inspect(exported, { depth: null }));
			}

			return exported;
		},
	);
};
