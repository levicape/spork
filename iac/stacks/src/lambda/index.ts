import { error } from "node:console";
import { Context } from "@levicape/fourtwo-pulumi";
import { LogGroup } from "@pulumi/aws/cloudwatch/logGroup";
import { ManagedPolicy } from "@pulumi/aws/iam";
import { getRole } from "@pulumi/aws/iam/getRole";
import { RolePolicy } from "@pulumi/aws/iam/rolePolicy";
import { RolePolicyAttachment } from "@pulumi/aws/iam/rolePolicyAttachment";
import {
	Bucket,
	BucketServerSideEncryptionConfigurationV2,
} from "@pulumi/aws/s3";
import { BucketPublicAccessBlock } from "@pulumi/aws/s3/bucketPublicAccessBlock";
import { BucketVersioningV2 } from "@pulumi/aws/s3/bucketVersioningV2";
import { Instance } from "@pulumi/aws/servicediscovery/instance";
import { Service } from "@pulumi/aws/servicediscovery/service";
import { StackReference, all, getStack } from "@pulumi/pulumi";
import type { z } from "zod";
import { SporkCodestarStackExportsZod } from "../codestar/exports";
import { SporkDatalayerStackExportsZod } from "../datalayer/exports";

class JsonParseException extends Error {
	name: string;

	constructor(
		readonly cause: unknown,
		readonly json: string,
	) {
		super((cause as { message: string })?.message ?? "Unknown error");
		this.name = "JsonParseException";
		error(`Failed to parse JSON: ${JSON.stringify(json)}`);
	}
}

export = async () => {
	const context = await Context.fromConfig();
	const $ = <Z extends z.AnyZodObject>(json: string, schema: Z): z.infer<Z> => {
		try {
			if (typeof json !== "string") {
				return schema.parse(json);
			}

			return schema.parse(JSON.parse(json));
		} catch (e) {
			throw new JsonParseException(e, json);
		}
	};
	const _ = (name: string) => `${context.prefix}-${name}`;
	const farRole = await getRole({ name: "FourtwoAccessRole" });

	// Stack references
	const codestar = await (async () => {
		const code = new StackReference(
			`organization/spork-codestar/spork-codestar.${getStack().split(".").pop()}`,
		);
		return {
			codedeploy: $(
				(await code.getOutputDetails("spork_codestar_codedeploy")).value,
				SporkCodestarStackExportsZod.shape.spork_codestar_codedeploy,
			),
			ecr: $(
				(await code.getOutputDetails("spork_codestar_ecr")).value,
				SporkCodestarStackExportsZod.shape.spork_codestar_ecr,
			),
		};
	})();

	const datalayer = await (async () => {
		const data = new StackReference(
			`organization/spork-datalayer/spork-datalayer.${getStack().split(".").pop()}`,
		);
		return {
			props: $(
				(await data.getOutputDetails("_SPORK_DATALAYER_PROPS")).value,
				SporkDatalayerStackExportsZod.shape._SPORK_DATALAYER_PROPS,
			),
			ec2: $(
				(await data.getOutputDetails("spork_datalayer_ec2")).value,
				SporkDatalayerStackExportsZod.shape.spork_datalayer_ec2,
			),
			efs: $(
				(await data.getOutputDetails("spork_datalayer_efs")).value,
				SporkDatalayerStackExportsZod.shape.spork_datalayer_efs,
			),
			iam: $(
				(await data.getOutputDetails("spork_datalayer_iam")).value,
				SporkDatalayerStackExportsZod.shape.spork_datalayer_iam,
			),
			cloudmap: $(
				(await data.getOutputDetails("spork_datalayer_cloudmap")).value,
				SporkDatalayerStackExportsZod.shape.spork_datalayer_cloudmap,
			),
		};
	})();
	//

	// Resources
	const s3 = (() => {
		const artifactStore = new Bucket(_("artifact-store"), {
			acl: "private",
		});

		new BucketServerSideEncryptionConfigurationV2(
			_("artifact-store-encryption"),
			{
				bucket: artifactStore.bucket,
				rules: [
					{
						applyServerSideEncryptionByDefault: {
							sseAlgorithm: "AES256",
						},
					},
				],
			},
		);
		new BucketVersioningV2(
			_("artifact-store-versioning"),

			{
				bucket: artifactStore.bucket,
				versioningConfiguration: {
					status: "Enabled",
				},
			},
			{ parent: this },
		);
		new BucketPublicAccessBlock(_("artifact-store-public-access-block"), {
			bucket: artifactStore.bucket,
			blockPublicAcls: true,
			blockPublicPolicy: true,
			ignorePublicAcls: true,
			restrictPublicBuckets: true,
		});

		return {
			artifactStore,
		};
	})();

	const cloudwatch = (() => {
		const loggroup = new LogGroup(_("loggroup"), {
			retentionInDays: 365,
		});

		return {
			loggroup,
		};
	})();

	const manifest = (() => {
		return {};
	})();

	const handler = (({ datalayer }, cloudwatch) => {
		// const table = data.
		const role = datalayer.iam.roles.lambda.name;
		const loggroup = cloudwatch.loggroup;

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
		].forEach(([policy, policyArn]) => {
			new RolePolicyAttachment(_(`lambda-policy-${policy}`), {
				role,
				policyArn,
			});
		});

		//   const lambda = new Function(
		// 	`${name}-Bun-js-lambda`,
		// 	{
		// 		architectures: ["arm64"],
		// 		runtime: Runtime.NodeJS20dX,
		// 		memorySize: Number.parseInt(memorySize),
		// 		handler: `${handler}.${callback}`,
		// 		role: role.arn,
		// 		s3Bucket: bucket.bucket,
		// 		s3Key: zip.key,
		// 		timeout,
		// 		environment: all([envs, manifestContent]).apply(
		// 			([env, manifestContent]) => {
		// 				const variables = {
		// 					LOG_LEVEL: "DEBUG",
		// 					...env,
		// 				};

		// 				if (manifestContent) {
		// 					Object.assign(variables, {
		// 						LEAF_MANIFEST: Buffer.from(
		// 							JSON.stringify(manifestContent),
		// 						).toString("base64"),
		// 					});
		// 				}

		// 				console.debug({
		// 					BunComponentAwsNode: { build: artifact, variables },
		// 				});
		// 				return {
		// 					variables,
		// 				} as { variables: Record<string, string> };
		// 			},
		// 		),
		// 		loggingConfig: {
		// 			logFormat: "JSON",
		// 			logGroup: logGroup.name,
		// 		},
		// 	},
		// 	{
		// 		parent: this,
		// 		dependsOn: [image],
		// 	},
		// );

		// 	const hosts: string[] = [];
		// 	const hostnames: string[] =
		// 		context?.frontend?.dns?.hostnames
		// 			?.map((host) => [`https://${host}`, `https://www.${host}`])
		// 			.reduce((acc, current) => [...acc, ...current], []) ?? [];

		// 	url = new FunctionUrl(
		// 		`${name}-Bun-js-http-url--lambda-url`,
		// 		{
		// 			functionName: lambda.name,
		// 			authorizationType: context.environment.isProd ? "AWS_IAM" : "NONE",
		// 			cors: {
		// 				allowMethods: ["*"],
		// 				allowOrigins: hostnames,
		// 				maxAge: 86400,
		// 			},
		// 		},
		// 		{
		// 			parent: this,
		// 			transforms: [
		// 				async ({ props, opts }) => {
		// 					const functionCors = (props as FunctionUrlArgs).cors;
		// 					const allowOrigins =
		// 						(functionCors as unknown as { allowOrigins: [] })
		// 							?.allowOrigins ?? [];

		// 					await Promise.any([
		// 						new Promise((resolve) => setTimeout(resolve, 4000)),
		// 					]);
		// 					// cors.promise = Promise.withResolvers();

		// 					console.debug({
		// 						BunComponentAwsNode: {
		// 							build: artifact,
		// 							transform: {
		// 								hosts: JSON.stringify(hosts),
		// 								allowOrigins: JSON.stringify(allowOrigins),
		// 							},
		// 						},
		// 					});
		// 					return {
		// 						props: {
		// 							...props,
		// 							cors: {
		// 								...functionCors,
		// 								allowOrigins: [...allowOrigins, ...hosts],
		// 							},
		// 						},
		// 						opts,
		// 					};
		// 				},
		// 			],
		// 		},
		// 	);
		// }

		return {
			role: datalayer.props.lambda.role,
			http: {
				arn: "",
				name: "",
				url: "",
				routes: {},
			},
		};
	})({ codestar, datalayer }, cloudwatch);

	const cloudmap = (({ datalayer: { ec2, cloudmap } }) => {
		const { vpc } = ec2;
		const { namespace } = cloudmap;
		const cloudMapService = new Service(_("cloudmap-service"), {
			description: `(${getStack()}) Service mesh service`,
			dnsConfig: {
				namespaceId: namespace.id,
				routingPolicy: "MULTIVALUE",
				dnsRecords: [
					{
						type: "A",
						ttl: 55,
					},
				],
			},
		});

		// const cloudMapInstance = new Instance(_("cloudmap-instance"), {
		// 	serviceId: cloudMapService.id,
		// 	instanceId: _("cloudmap-instance"),
		// 	attributes: {
		// 		"aws:lambda:service-name": "bun",
		// 		"aws:lambda:function-name": handler.http.name,
		// 		"aws:lambda:url": handler.http.url,
		// 	},
		// });

		return {
			service: cloudMapService,
			// instance: cloudMapInstance,
		};
	})({ datalayer });

	const pipeline = (() => {
		return {
			role: farRole,
		};
	})();

	return all([
		cloudwatch.loggroup.arn,
		handler.role.arn,
		handler.role.name,
		pipeline.role.arn,
		s3.artifactStore.bucket,
		cloudmap.service.arn,
		// cloudmap.instance.instanceId,
	]).apply(
		([
			cloudwatch,
			functionRoleArn,
			functionRoleName,
			pipeline,
			artifactStoreBucket,
			cloudmapService,
			// cloudmapInstance,
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
				spork_lambda_manifest: {
					routes: {
						// http: lambdaRoutes
					},
				},
				spork_lambda_handler: {
					role: {
						arn: functionRoleArn,
						name: functionRoleName,
					},
					http: {
						// arn: functionArn,
						// url: functionUrl,
					},
				},
				spork_lambda_cloudmap: {
					service: {
						arn: cloudmapService,
					},
					// instance: {
					// 	id: cloudmapInstance,
					// },
				},
				spork_lambda_s3: {
					artifactStore: {
						bucket: artifactStoreBucket,
					},
				},
				spork_lambda_pipeline: {
					role: {
						arn: pipeline,
					},
				},
			};
		},
	);
};
