import { Context } from "@levicape/fourtwo-pulumi";
import { LogGroup } from "@pulumi/aws/cloudwatch/logGroup";
import { getAuthorizationToken } from "@pulumi/aws/ecr/getAuthorizationToken";
import { ManagedPolicy } from "@pulumi/aws/iam";
import { getRole } from "@pulumi/aws/iam/getRole";
import { RolePolicy } from "@pulumi/aws/iam/rolePolicy";
import { RolePolicyAttachment } from "@pulumi/aws/iam/rolePolicyAttachment";
import { Function as LambdaFn } from "@pulumi/aws/lambda";
import { FunctionUrl } from "@pulumi/aws/lambda/functionUrl";
import {
	Bucket,
	BucketServerSideEncryptionConfigurationV2,
} from "@pulumi/aws/s3";
import { BucketPublicAccessBlock } from "@pulumi/aws/s3/bucketPublicAccessBlock";
import { BucketVersioningV2 } from "@pulumi/aws/s3/bucketVersioningV2";
import { Instance } from "@pulumi/aws/servicediscovery/instance";
import { Service } from "@pulumi/aws/servicediscovery/service";
import { Image } from "@pulumi/docker-build";
import { all, getStack } from "@pulumi/pulumi";
import { $ref, $val } from "../Stack";
import { SporkCodestarStackExportsZod } from "../codestar/exports";
import { SporkDatalayerStackExportsZod } from "../datalayer/exports";

export = async () => {
	const context = await Context.fromConfig();
	const _ = (name: string) => `${context.prefix}-${name}`;
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

	// Resources
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
			tags: [`${codestar.ecr.repository.url}:latest`],
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
				imageUri: `${codestar.ecr.repository.url}:latest`,
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

		const url = new FunctionUrl(_("lambda-handler-http-url"), {
			functionName: lambda.name,
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
			},
		};
	})({ codestar, datalayer }, cloudwatch);

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

	// const codepipeline = (() => {
	// 	const pipeline = new Pipeline(
	// 		_("codepipeline"),
	// 		{
	// 		name: "tf-test-pipeline",
	// 		roleArn: farRole.arn,
	// 		artifactStores: [{
	// 			location: s3.artifactStore.bucket,
	// 			type: "S3"
	// 		}],
	// 		pipelineType: "V2",
	// 		// triggers: [new CodePipelineTriggerBuilder().build()],
	// 		stages: [
	// 			{
	// 				name: "Build",
	// 				actions: [{
	// 					name: "Build",
	// 					category: "Build",
	// 					owner: "AWS",
	// 					provider: "CodeBuild",
	// 					inputArtifacts: ["source_output"],
	// 					outputArtifacts: ["build_output"],
	// 					version: "1",
	// 					configuration: {
	// 						ProjectName: "test",
	// 					},
	// 				}],
	// 			},
	// 			{
	// 				name: "Deploy",
	// 				actions: [{
	// 					name: "Deploy",
	// 					category: "Deploy",
	// 					owner: "AWS",
	// 					provider: "CloudFormation",
	// 					inputArtifacts: ["build_output"],
	// 					version: "1",
	// 					configuration: {
	// 						ActionMode: "REPLACE_ON_FAILURE",
	// 						Capabilities: "CAPABILITY_AUTO_EXPAND,CAPABILITY_IAM",
	// 						OutputFileName: "CreateStackOutput.json",
	// 						StackName: "MyStack",
	// 						TemplatePath: "build_output::sam-templated.yaml",
	// 					},
	// 				}],
	// 			},
	// 		],
	// 	});

	// 	new RolePolicyAttachment(_("codepipeline-rolepolicy"), {
	// 		policyArn: ManagedPolicy.CodePipeline_FullAccess,
	// 		role: farRole.name,
	// 	});

	// 	return {
	// 		pipeline
	// 	};
	// })();

	return all([
		cloudwatch.loggroup.arn,
		handler.role.arn,
		handler.role.name,
		handler.http.arn,
		handler.http.url,
		// codepipeline.role.arn,
		s3.artifactStore.bucket,
		cloudmap.service.arn,
		cloudmap.instance.instanceId,
	]).apply(
		([
			cloudwatch,
			functionRoleArn,
			functionRoleName,
			functionHttpArn,
			functionHttpUrl,
			// pipeline,
			artifactStoreBucket,
			cloudmapService,
			cloudmapInstance,
		]) => {
			return {
				_SPORK_LAMBDA_IMPORTS: {
					spork: {
						codestar,
						datalayer,
					},
				},
				spork_lambda_cloudwatch: {
					loggroup: {
						arn: cloudwatch,
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
					},
				},
				spork_lambda_cloudmap: {
					service: {
						arn: cloudmapService,
					},
					instance: {
						id: cloudmapInstance,
					},
				},
				spork_lambda_s3: {
					artifactStore: {
						bucket: artifactStoreBucket,
					},
				},
				// spork_lambda_pipeline: {
				// 	role: {
				// 		arn: pipeline,
				// 	},
				// },
			};
		},
	);
};
