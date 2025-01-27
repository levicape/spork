import {
	CodeBuildBuildspecArtifactsBuilder,
	CodeBuildBuildspecBuilder,
	CodeBuildBuildspecEnvBuilder,
	CodeBuildBuildspecResourceLambdaPhaseBuilder,
} from "@levicape/fourtwo-builders";
import { Context } from "@levicape/fourtwo-pulumi";
import { EventRule, EventTarget } from "@pulumi/aws/cloudwatch";
import { Project } from "@pulumi/aws/codebuild";
import { Pipeline } from "@pulumi/aws/codepipeline";
import { ManagedPolicy } from "@pulumi/aws/iam";
import { getRole } from "@pulumi/aws/iam/getRole";
import { RolePolicyAttachment } from "@pulumi/aws/iam/rolePolicyAttachment";
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
import { all, getStack } from "@pulumi/pulumi";
import { stringify } from "yaml";
import { $ref, $val } from "../../../Stack";
import { SporkCodestarStackExportsZod } from "../../../codestar/exports";
import { SporkDatalayerStackExportsZod } from "../../../datalayer/exports";

const STACKREF_ROOT = process.env["STACKREF_ROOT"] ?? "spork";
const EXTRACT_ENTRYPOINT = "deploy-spork-ui-manifest";
const ARTIFACT_ROOT = "/tmp/spork-ui-manifest/build-staticwww/client" as const;

export = async () => {
	const context = await Context.fromConfig();
	const _ = (name: string) => `${context.prefix}-${name}`;
	const stage = process.env.CI_ENVIRONMENT ?? "unknown";
	const farRole = await getRole({ name: "FourtwoAccessRole" });

	// Stack references
	const codestar = await (async () => {
		const code = $ref(`${STACKREF_ROOT}-codestar`);
		return {
			ecr: $val(
				(await code.getOutputDetails(`${STACKREF_ROOT}_codestar_ecr`)).value,
				SporkCodestarStackExportsZod.shape.spork_codestar_ecr,
			),
		};
	})();

	const datalayer = await (async () => {
		const data = $ref(`${STACKREF_ROOT}-datalayer`);
		return {
			props: $val(
				(
					await data.getOutputDetails(
						`_${STACKREF_ROOT.toUpperCase()}_DATALAYER_PROPS`,
					)
				).value,
				SporkDatalayerStackExportsZod.shape._SPORK_DATALAYER_PROPS,
			),
			iam: $val(
				(await data.getOutputDetails(`${STACKREF_ROOT}_datalayer_iam`)).value,
				SporkDatalayerStackExportsZod.shape.spork_datalayer_iam,
			),
		};
	})();
	//

	// Object Store
	const s3 = (() => {
		const bucket = (
			name: string,
			props: {
				daysToRetain?: number;
				www?: boolean;
			} = {
				daysToRetain: 30,
				www: false,
			},
		) => {
			const { daysToRetain, www } = props;
			const bucket = new Bucket(_(name), {
				acl: "private",
			});

			new BucketServerSideEncryptionConfigurationV2(_(`${name}-encryption`), {
				bucket: bucket.bucket,
				rules: [
					{
						applyServerSideEncryptionByDefault: {
							sseAlgorithm: "AES256",
						},
					},
				],
			});
			new BucketVersioningV2(
				_(`${name}-versioning`),

				{
					bucket: bucket.bucket,
					versioningConfiguration: {
						status: "Enabled",
					},
				},
			);

			let website: BucketWebsiteConfigurationV2 | undefined;
			if (www) {
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
						dependsOn: [bucket],
						replaceOnChanges: ["*"],
						deleteBeforeReplace: true,
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
						dependsOn: [bucket],
						replaceOnChanges: ["*"],
						deleteBeforeReplace: true,
					},
				);
			}

			if (daysToRetain) {
				new BucketLifecycleConfigurationV2(_(`${name}-lifecycle`), {
					bucket: bucket.bucket,
					rules: [
						{
							status: "Enabled",
							id: "ExpireObjects",
							expiration: {
								days: daysToRetain,
							},
						},
					],
				});
			}

			return {
				bucket,
				website,
			};
		};
		return {
			artifactStore: bucket("artifact-store"),
			build: bucket("build"),
			staticwww: bucket("staticwww", { www: true }),
		};
	})();

	const codebuild = (() => {
		const buildspec = (() => {
			const content = stringify(
				new CodeBuildBuildspecBuilder()
					.setVersion("0.2")
					.setArtifacts(
						new CodeBuildBuildspecArtifactsBuilder()
							.setFiles(["**/*"])
							.setBaseDirectory(".extractimage")
							.setName("staticwww_extractimage"),
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
								"docker --version",
								`aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $STACKREF_CODESTAR_ECR_REPOSITORY_URL`,
								"docker pull $SOURCE_IMAGE_URI",
								"docker images",
								`docker run --detach --entrypoint ${EXTRACT_ENTRYPOINT} $SOURCE_IMAGE_URI > .container`,
								"docker ps -al",
								"cat .container",
								"sleep 10s",
								`docker container logs $(cat .container)`,
								`docker cp $(cat .container):${ARTIFACT_ROOT} $CODEBUILD_SRC_DIR/.extractimage`,
								"ls -al $CODEBUILD_SRC_DIR/.extractimage || true",
								"du -sh $CODEBUILD_SRC_DIR/.extractimage || true",
								"aws s3 ls s3://$S3_STATICWWW_BUCKET",
							]),
					})
					.build(),
			);

			const upload = new BucketObjectv2(_("buildspec-upload"), {
				bucket: s3.build.bucket.bucket,
				content,
				key: "Buildspec.yml",
			});

			return {
				content,
				upload,
			};
		})();

		const project = (() => {
			const project = new Project(_("project"), {
				description: `(${getStack()}) CodeBuild project`,
				buildTimeout: 8,
				serviceRole: farRole.arn,
				artifacts: {
					type: "CODEPIPELINE",
					artifactIdentifier: "staticwww_extractimage",
				},
				environment: {
					type: "ARM_CONTAINER",
					computeType: "BUILD_GENERAL1_MEDIUM",
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
				source: {
					type: "CODEPIPELINE",
					buildspec: buildspec.content,
				},
			});

			return {
				project,
			};
		})();

		return {
			...project,
			spec: {
				buildspec,
			},
		};
	})();

	const codepipeline = (() => {
		const pipeline = new Pipeline(_("web-pipeline"), {
			pipelineType: "V2",
			roleArn: farRole.arn,
			executionMode: "QUEUED",
			artifactStores: [
				{
					location: s3.artifactStore.bucket.bucket,
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
							outputArtifacts: ["staticwww_extractimage"],
							configuration: all([
								codestar.ecr.repository.arn,
								codestar.ecr.repository.name,
								codestar.ecr.repository.url,
								codebuild.project.name,
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
							inputArtifacts: ["staticwww_extractimage"],
							configuration: all([s3.staticwww.bucket.bucket]).apply(
								([BucketName]) => ({
									BucketName,
									Extract: "true",
									CannedACL: "public-read",
								}),
							),
						},
					],
				},
			],
		});

		new RolePolicyAttachment(_("codepipeline-rolepolicy"), {
			policyArn: ManagedPolicy.CodePipeline_FullAccess,
			role: farRole.name,
		});

		return {
			pipeline,
		};
	})();

	// Eventbridge will trigger on ecr push
	const eventbridge = (() => {
		const { name } = codestar.ecr.repository;

		const rule = new EventRule(_("event-rule-ecr-push"), {
			description: `(${getStack()}) ECR push event rule`,
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
		});
		const pipeline = new EventTarget(_("event-target-pipeline-web"), {
			rule: rule.name,
			arn: codepipeline.pipeline.arn,
			roleArn: farRole.arn,
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
		s3.artifactStore.bucket.bucket,
		s3.build.bucket.bucket,
		s3.staticwww.bucket.arn,
		s3.staticwww.bucket.bucket,
		s3.staticwww.bucket.bucketDomainName,
		s3.staticwww.website?.websiteEndpoint ?? "",
		s3.staticwww.website?.websiteDomain ?? "",
		codebuild.project.arn,
		codebuild.project.name,
		codepipeline.pipeline.arn,
		codepipeline.pipeline.name,
		eventbridge.EcrImageAction.rule.arn,
		eventbridge.EcrImageAction.rule.name,
		eventbridge.EcrImageAction.targets.pipeline.arn,
		eventbridge.EcrImageAction.targets.pipeline.targetId,
	]).apply(
		([
			artifactStoreBucket,
			buildBucket,
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
			return {
				_SPORK_UIMANIFEST_WEB_IMPORTS: {
					spork: {
						codestar,
						datalayer,
					},
				},
				spork_uimanifest_web_s3: {
					artifactStore: {
						bucket: artifactStoreBucket,
					},
					build: {
						bucket: buildBucket,
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
				spork_uimanifest_web_codebuild: {
					project: {
						arn: codebuildProjectArn,
						name: codebuildProjectName,
					},
				},
				spork_uimanifest_web_pipeline: {
					pipeline: {
						arn: pipelineArn,
						name: pipelineName,
					},
				},
				spork_uimanifest_web_eventbridge: {
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
			};
		},
	);
};
