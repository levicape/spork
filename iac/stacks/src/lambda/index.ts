import { error } from "node:console";
import { Context } from "@levicape/fourtwo-pulumi";
import { LogGroup } from "@pulumi/aws/cloudwatch/logGroup";
import { getRole } from "@pulumi/aws/iam/getRole";
import {
	Bucket,
	BucketServerSideEncryptionConfigurationV2,
} from "@pulumi/aws/s3";
import { BucketPublicAccessBlock } from "@pulumi/aws/s3/bucketPublicAccessBlock";
import { BucketVersioningV2 } from "@pulumi/aws/s3/bucketVersioningV2";
import { StackReference, all, getStack } from "@pulumi/pulumi";

class JsonParseException extends Error {
	constructor(cause: unknown, json: string) {
		super((cause as { message: string })?.message ?? "Unknown error");
		this.cause = cause;
		this.name = "JsonParseException";
		error(`Failed to parse JSON: ${json}`);
	}
}

export = async () => {
	const context = await Context.fromConfig();
	const $ = (json: string): unknown => {
		try {
			return JSON.parse(json);
		} catch (e) {
			throw new JsonParseException(e, json);
		}
	};
	const _ = (name: string) => `${context.prefix}-${name}`;
	const farRole = await getRole({ name: "FourtwoAccessRole" });

	// Stack reference: code/ecr/repository
	const code = await (async () => {
		const code = new StackReference(
			`organization/spork-code/spork-code.${getStack().split(".").pop()}`,
		);
		return {
			codedeploy: $((await code.getOutputDetails("codedeploy")).value),
			ecr: $((await code.getOutputDetails("ecr")).value),
		};
	})();
	// -> Stack reference: code/props/pipeline
	// new StackReference(_code("props/pipeline"));
	// Stack reference: spork-data/props
	const data = await (async () => {
		const data = new StackReference(
			`organization/spork-data/spork-data.${getStack().split(".").pop()}`,
		);
		return {
			props: $((await data.getOutputDetails("props")).value),
		};
	})();

	const s3 = await (async () => {
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

	// const iam = (() => {

	// 	new RolePolicy(
	// 		`${name}-lambda-policy`,
	// 		{
	// 		  role: role.name,
	// 		  policy: JSON.stringify(lambdaPolicyDocument),
	// 		},
	// 		{ parent: this },
	// 	  );

	// 	  [
	// 		["basic", ManagedPolicy.AWSLambdaBasicExecutionRole],
	// 		["vpc", ManagedPolicy.AWSLambdaVPCAccessExecutionRole],
	// 		["efs", ManagedPolicy.AmazonElasticFileSystemClientReadWriteAccess]
	// 	  ].forEach(([policy, policyArn]) => {
	// 		new RolePolicyAttachment(
	// 		  `${name}-lambda-policy-${policy}`,
	// 		  {
	// 			role: role.name,
	// 			policyArn,
	// 		  },
	// 		  { parent: this },
	// 		);
	// 	  })

	// })();

	const pipeline = (() => {
		return {
			role: farRole,
		};
	})();

	return all([
		cloudwatch.loggroup.arn,
		// iam.role.arn,
		pipeline.role.arn,
		s3.artifactStore.bucket,
	]).apply(
		([
			cloudwatch,
			// iam,
			pipeline,
			s3,
		]) => {
			return Object.fromEntries(
				Object.entries({
					_: {
						spork: {
							code,
							data,
						},
					},
					cloudwatch: {
						loggroup: cloudwatch,
					},
					// iam: iam,
					pipeline: {
						role: pipeline,
					},
					s3: {
						artifactStore: s3,
					},
				}).map(([key, value]) => [key, JSON.stringify(value)]),
			);
		},
	);
};
