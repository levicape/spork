import {
	CodeBuildBuildspecArtifactsBuilder,
	CodeBuildBuildspecBuilder,
	CodeBuildBuildspecEnvBuilder,
	CodeBuildBuildspecResourceLambdaPhaseBuilder,
	CodeDeployAppspecBuilder,
	CodeDeployAppspecResourceBuilder,
} from "@levicape/fourtwo-builders";
import { Context } from "@levicape/fourtwo-pulumi";
import { EventRule, EventTarget } from "@pulumi/aws/cloudwatch";
import { LogGroup } from "@pulumi/aws/cloudwatch/logGroup";
import { Project } from "@pulumi/aws/codebuild";
import { Pipeline } from "@pulumi/aws/codepipeline";
import { getAuthorizationToken } from "@pulumi/aws/ecr/getAuthorizationToken";
import { ManagedPolicy } from "@pulumi/aws/iam";
import { getRole } from "@pulumi/aws/iam/getRole";
import { RolePolicy } from "@pulumi/aws/iam/rolePolicy";
import { RolePolicyAttachment } from "@pulumi/aws/iam/rolePolicyAttachment";
import { Alias, Function as LambdaFn } from "@pulumi/aws/lambda";
import { FunctionUrl } from "@pulumi/aws/lambda/functionUrl";
import {
	Bucket,
	BucketServerSideEncryptionConfigurationV2,
} from "@pulumi/aws/s3";
import { BucketObjectv2 } from "@pulumi/aws/s3/bucketObjectv2";
import { BucketPublicAccessBlock } from "@pulumi/aws/s3/bucketPublicAccessBlock";
import { BucketVersioningV2 } from "@pulumi/aws/s3/bucketVersioningV2";
import { Instance } from "@pulumi/aws/servicediscovery/instance";
import { Service } from "@pulumi/aws/servicediscovery/service";
import { Image } from "@pulumi/docker-build";
import { all, getStack } from "@pulumi/pulumi";
import { stringify } from "yaml";
import { $ref, $val } from "../Stack";
import { SporkCodestarStackExportsZod } from "../codestar/exports";
import { SporkDatalayerStackExportsZod } from "../datalayer/exports";

export = async () => {
	const context = await Context.fromConfig();
	const _ = (name: string) => `${context.prefix}-${name}`;
	// TODO: From $CI_ENVIRONMENT
	const stage = "current";
	const farRole = await getRole({ name: "FourtwoAccessRole" });

	// Stack references
	const codestar = await (async () => {
		const code = $ref("spork-codestar");
		return {
			codedeploy: $val(
				(await code.getOutputDetails("spork_codestar_codedeploy")).value,
				SporkCodestarStackExportsZod.shape.spork_codestar_codedeploy,
			),
			ecr: $val(
				(await code.getOutputDetails("spork_codestar_ecr")).value,
				SporkCodestarStackExportsZod.shape.spork_codestar_ecr,
			),
		};
	})();

	const datalayer = await (async () => {
		const data = $ref("spork-datalayer");
		return {
			props: $val(
				(await data.getOutputDetails("_SPORK_DATALAYER_PROPS")).value,
				SporkDatalayerStackExportsZod.shape._SPORK_DATALAYER_PROPS,
			),
			ec2: $val(
				(await data.getOutputDetails("spork_datalayer_ec2")).value,
				SporkDatalayerStackExportsZod.shape.spork_datalayer_ec2,
			),
			efs: $val(
				(await data.getOutputDetails("spork_datalayer_efs")).value,
				SporkDatalayerStackExportsZod.shape.spork_datalayer_efs,
			),
			iam: $val(
				(await data.getOutputDetails("spork_datalayer_iam")).value,
				SporkDatalayerStackExportsZod.shape.spork_datalayer_iam,
			),
			cloudmap: $val(
				(await data.getOutputDetails("spork_datalayer_cloudmap")).value,
				SporkDatalayerStackExportsZod.shape.spork_datalayer_cloudmap,
			),
		};
	})();
	//

	// Object Store
	const s3 = (() => {
		const bucket = (name: string) => {
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
				{ parent: this },
			);
			new BucketPublicAccessBlock(_(`${name}-public-access-block`), {
				bucket: bucket.bucket,
				blockPublicAcls: true,
				blockPublicPolicy: true,
				ignorePublicAcls: true,
				restrictPublicBuckets: true,
			});

			return bucket;
		};
		return {
			artifactStore: bucket("artifact-store"),
			assets: bucket("assets"),
			build: bucket("build"),
			deploy: bucket("deploy"),
		};
	})();

	// Logging
	const cloudwatch = (() => {
		const loggroup = new LogGroup(_("loggroup"), {
			retentionInDays: 365,
		});

		return {
			loggroup,
		};
	})();

	// Compute
	const handler = await (async ({ datalayer, codestar }, cloudwatch) => {
		const role = datalayer.iam.roles.lambda.name;
		const roleArn = datalayer.iam.roles.lambda.arn;
		const loggroup = cloudwatch.loggroup;

		// Bootstrap container lambda with empty image.
		const ecrCredentials = await getAuthorizationToken({});
		new Image(_("lambda-kickstart-image"), {
			tags: [`${codestar.ecr.repository.url}:kickstart`],
			push: true,
			pull: true,
			registries: [
				{
					address: ecrCredentials.proxyEndpoint,
					username: ecrCredentials.userName,
					password: ecrCredentials.password,
				},
			],
			dockerfile: {
				inline: `FROM busybox:latest`,
			},
		});

		const lambdaPolicyDocument = all([loggroup.arn]).apply(([loggroupArn]) => {
			return {
				Version: "2012-10-17",
				Statement: [
					//   {
					// 	Effect: "Allow",
					// 	Action: [
					// 	  "dynamodb:DescribeStream",
					// 	  "dynamodb:GetRecords",
					// 	  "dynamodb:GetShardIterator",
					// 	  "dynamodb:ListStreams",
					// 	],
					// 	Resource: "*",
					//   },
					{
						Effect: "Allow",
						Action: [
							"ec2:CreateNetworkInterface",
							"ec2:DescribeNetworkInterfaces",
							"ec2:DeleteNetworkInterface",
						],
						Resource: "*",
					},
					{
						Effect: "Allow",
						Action: [
							"logs:CreateLogGroup",
							"logs:CreateLogStream",
							"logs:PutLogEvents",
						],
						Resource: loggroupArn,
					},
				],
			};
		});

		new RolePolicy(_("lambda-policy"), {
			role,
			policy: lambdaPolicyDocument.apply((lpd) => JSON.stringify(lpd)),
		});

		[
			["basic", ManagedPolicy.AWSLambdaBasicExecutionRole],
			["vpc", ManagedPolicy.AWSLambdaVPCAccessExecutionRole],
			["efs", ManagedPolicy.AmazonElasticFileSystemClientReadWriteAccess],
			["cloudmap", ManagedPolicy.AWSCloudMapDiscoverInstanceAccess],
			["s3", ManagedPolicy.AmazonS3ReadOnlyAccess],
			["ssm", ManagedPolicy.AmazonSSMReadOnlyAccess],
			["xray", ManagedPolicy.AWSXrayWriteOnlyAccess],
		].forEach(([policy, policyArn]) => {
			new RolePolicyAttachment(_(`lambda-policy-${policy}`), {
				role,
				policyArn,
			});
		});

		const cloudmapEnvironment = {
			AWS_CLOUDMAP_NAMESPACE_ID: datalayer.cloudmap.namespace.id,
			AWS_CLOUDMAP_NAMESPACE_NAME: datalayer.cloudmap.namespace.name,
		};

		const lambda = new LambdaFn(
			_("lambda-handler-http"),
			{
				role: roleArn,
				architectures: ["arm64"],
				memorySize: Number.parseInt("512"),
				timeout: 18,
				packageType: "Image",
				imageUri: `${codestar.ecr.repository.url}:kickstart`,
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
					logGroup: cloudwatch.loggroup.name,
					applicationLogLevel: "DEBUG",
				},
				environment: all([cloudmapEnvironment]).apply(([cloudmapEnv]) => {
					return {
						variables: {
							...cloudmapEnv,
						},
					};
				}),
			},
			{
				ignoreChanges: ["imageUri"],
			},
		);

		const hostnames: string[] =
			context?.frontend?.dns?.hostnames
				?.map((host) => [`https://${host}`, `https://www.${host}`])
				.reduce((acc, current) => [...acc, ...current], []) ?? [];

		const alias = new Alias(
			_("lambda-handler-http-alias"),
			{
				name: stage,
				functionName: lambda.name,
				functionVersion: "$LATEST",
			},
			{
				ignoreChanges: ["functionVersion"],
			},
		);

		const url = new FunctionUrl(_("lambda-handler-http-url"), {
			functionName: lambda.name,
			qualifier: alias.name,
			authorizationType: context.environment.isProd ? "AWS_IAM" : "NONE",
			cors: {
				allowMethods: ["*"],
				allowOrigins: hostnames,
				maxAge: 86400,
			},
		});

		return {
			role: datalayer.props.lambda.role,
			http: {
				arn: lambda.arn,
				name: lambda.name,
				url: url.functionUrl,
				qualifier: url.qualifier,
				alias,
			},
		};
	})({ codestar, datalayer }, cloudwatch);

	// Cloudmap
	const cloudmap = (({ datalayer: { cloudmap } }) => {
		const { namespace } = cloudmap;
		const cloudMapService = new Service(_("cloudmap-service"), {
			name: _("cloudmap-service"),
			description: `(${getStack()}) Service mesh service`,
			dnsConfig: {
				namespaceId: namespace.id,
				routingPolicy: "WEIGHTED",
				dnsRecords: [
					{
						type: "CNAME",
						ttl: 55,
					},
				],
			},
		});

		const cloudMapInstance = new Instance(_("cloudmap-instance"), {
			serviceId: cloudMapService.id,
			instanceId: _("cloudmap-instance"),
			attributes: {
				AWS_INSTANCE_CNAME: handler.http.url,
				LAMBDA_FUNCTION_ARN: handler.http.arn,
				STACK_NAME: _(""),
			},
		});

		return {
			service: cloudMapService,
			instance: cloudMapInstance,
		};
	})({ datalayer });

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
							"<APPLICATION_IMAGE_NAME>": new CodeDeployAppspecResourceBuilder()
								.setName(props.name)
								.setAlias(props.alias)
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

		const buildspec = (() => {
			const content = stringify(
				new CodeBuildBuildspecBuilder()
					.setVersion("0.2")
					.setArtifacts(
						new CodeBuildBuildspecArtifactsBuilder()
							.setFiles(["appspec.yml", "appspec.zip"])
							.setName("httphandler_update"),
					)
					.setEnv(
						new CodeBuildBuildspecEnvBuilder().setVariables({
							APPSPEC_TEMPLATE: appspec({
								name: "<LAMBDA_FUNCTION_NAME>",
								alias: "<LAMBDA_FUNCTION_ALIAS>",
								currentVersion: "<CURRENT_VERSION>",
								targetVersion: "<TARGET_VERSION>",
							}).content,
							SOURCE_IMAGE_REPOSITORY: "<SOURCE_IMAGE_REPOSITORY>",
							SOURCE_IMAGE_URI: "<SOURCE_IMAGE_URI>",
							LAMBDA_FUNCTION_NAME: "<LAMBDA_FUNCTION_NAME>",
						}),
					)
					.setPhases({
						build:
							new CodeBuildBuildspecResourceLambdaPhaseBuilder().setCommands([
								"env",
								"export CURRENT_VERSION=$(aws lambda get-function --function-name $LAMBDA_FUNCTION_NAME --query 'Configuration.Version' --output text)",
								"echo $CURRENT_VERSION",
								"aws lambda update-function-configuration --function-name $LAMBDA_FUNCTION_NAME --image-uri $SOURCE_IMAGE_URI",
								"sleep 10",
								"aws lambda publish-version --function-name $LAMBDA_FUNCTION_NAME  > .version",
								"export TARGET_VERSION=$(jq -r '.Version' .version)",
								"echo $TARGET_VERSION",
								"echo $APPSPEC_TEMPLATE",
								`NODE_NO_WARNINGS=1 node -e '(${(
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
									}
								).toString()})()' > appspec.yml`,
								"cat appspec.yml",
								"zip appspec.zip appspec.yml",
								"ls -al",
							]),
					})
					.build(),
			);

			const upload = new BucketObjectv2(_("buildspec-upload"), {
				bucket: s3.deploy.bucket,
				content,
				key: "Buildspec.yml",
			});

			return {
				content,
				upload,
			};
		})();

		const project = (() => {
			const project = new Project(_("codebuild-project"), {
				description: `(${getStack()}) CodeBuild project`,
				buildTimeout: 8,
				serviceRole: farRole.arn,
				artifacts: {
					type: "CODEPIPELINE",
					artifactIdentifier: "httphandler_update",
				},
				environment: {
					type: "ARM_LAMBDA_CONTAINER",
					computeType: "BUILD_LAMBDA_1GB",
					image: "aws/codebuild/amazonlinux-aarch64-lambda-standard:nodejs20",
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
							name: "LAMBDA_FUNCTION_NAME",
							value: "LAMBDA_FUNCTION_NAME",
							type: "PLAINTEXT",
						},
						{
							name: "LAMBDA_FUNCTION_ALIAS",
							value: "LAMBDA_FUNCTION_ALIAS",
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
		const pipeline = new Pipeline(_("http-handler-pipeline"), {
			pipelineType: "V2",
			roleArn: farRole.arn,
			executionMode: "QUEUED",
			artifactStores: [
				{
					location: s3.artifactStore.bucket,
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
					name: "HttpHandler",
					actions: [
						{
							runOrder: 1,
							name: "Update",
							namespace: "HttpHandlerUpdate",
							category: "Build",
							owner: "AWS",
							provider: "CodeBuild",
							version: "1",
							inputArtifacts: ["source_image"],
							outputArtifacts: ["httphandler_update"],
							configuration: all([
								codebuild.project.name,
								handler.http.name,
								handler.http.alias.name,
							]).apply(([projectName, functionName, aliasName]) => {
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
									]),
								};
							}),
						},
						{
							runOrder: 2,
							name: "Cutover",
							category: "Deploy",
							owner: "AWS",
							provider: "CodeDeploy",
							version: "1",
							inputArtifacts: ["httphandler_update"],
							configuration: all([
								codestar.codedeploy.application.name,
								codestar.codedeploy.deploymentGroup.name,
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
		const pipeline = new EventTarget(_("event-target-http-pipeline"), {
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
		s3.artifactStore.bucket,
		s3.assets.bucket,
		s3.build.bucket,
		s3.deploy.bucket,
		cloudwatch.loggroup.arn,
		handler.role.arn,
		handler.role.name,
		handler.http.arn,
		handler.http.url,
		handler.http.alias.arn,
		handler.http.alias.name,
		cloudmap.service.arn,
		cloudmap.service.name,
		cloudmap.instance.instanceId,
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
			assetsBucket,
			buildBucket,
			deployBucket,
			cloudwatchLoggroupArn,
			functionRoleArn,
			functionRoleName,
			functionHttpArn,
			functionHttpUrl,
			functionAliasArn,
			functionAliasName,
			cloudmapServiceArn,
			cloudmapServiceName,
			cloudmapInstanceId,
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
				_SPORK_LAMBDA_IMPORTS: {
					spork: {
						codestar,
						datalayer,
					},
				},
				spork_lambda_s3: {
					build: {
						bucket: buildBucket,
					},
					deploy: {
						bucket: deployBucket,
					},
					artifactStore: {
						bucket: artifactStoreBucket,
					},
					assets: {
						bucket: assetsBucket,
					},
				},
				spork_lambda_cloudwatch: {
					loggroup: {
						arn: cloudwatchLoggroupArn,
					},
				},
				spork_lambda_handler: {
					role: {
						arn: functionRoleArn,
						name: functionRoleName,
					},
					http: {
						arn: functionHttpArn,
						url: functionHttpUrl,
						alias: {
							arn: functionAliasArn,
							name: functionAliasName,
						},
					},
				},
				spork_lambda_cloudmap: {
					service: {
						arn: cloudmapServiceArn,
						name: cloudmapServiceName,
					},
					instance: {
						id: cloudmapInstanceId,
					},
				},
				spork_lambda_codebuild: {
					project: {
						arn: codebuildProjectArn,
						name: codebuildProjectName,
					},
				},
				spork_lambda_pipeline: {
					pipeline: {
						arn: pipelineArn,
						name: pipelineName,
					},
				},
				spork_lambda_eventbridge: {
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
