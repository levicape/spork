import { Project } from "@pulumi/aws/codebuild/index.js";
import { getCallerIdentity } from "@pulumi/aws/getCallerIdentity";
import {
	Role,
	RolePolicy,
	assumeRolePolicyForPrincipal,
} from "@pulumi/aws/iam/index.js";
import { Bucket } from "@pulumi/aws/s3/index.js";
import { Repository } from "@pulumi/awsx/ecr/index.js";
import { all, interpolate } from "@pulumi/pulumi/output";
import { getCommit } from "../../machine/code/Git.ts";

export const artifact = (() => {
	const ecr = new Repository("bun-ci", {
		forceDelete: true,
	});
	return {
		ecr,
	};
})();

export const s3 = (() => {
	const bucket = new Bucket("bun-ci", {
		acl: "private",
	});

	return {
		bucket,
	};
})();

export const codebuild = (({
	artifact: {
		ecr: { url },
	},
	s3: { bucket },
}: { artifact: typeof artifact; s3: typeof s3 }) => {
	const role = new Role("bun-ci", {
		assumeRolePolicy: assumeRolePolicyForPrincipal({
			Service: "codebuild.amazonaws.com",
		}),
	});

	const credentials = {
		arn: `arn:aws:secretsmanager:us-west-2:632520973842:secret:ecr-pullthroughcache/atoko-q22ow8`,
	};

	const project = new Project("bun-ci", {
		artifacts: {
			type: "NO_ARTIFACTS",
		},
		environment: {
			computeType: "BUILD_GENERAL1_SMALL",
			image: "aws/codebuild/standard:7.0",
			type: "LINUX_CONTAINER",
			privilegedMode: true,
			registryCredential: {
				credential: credentials.arn,
				credentialProvider: "SECRETS_MANAGER",
			},
			imagePullCredentialsType: "SERVICE_ROLE",
			environmentVariables: all([url, getCallerIdentity()]).apply(
				([ecrUrl, principal]) => [
					{
						name: "ECR_REGISTRY_URL",
						value: ecrUrl,
						type: "PLAINTEXT",
					},
					...(principal
						? [
								{
									name: "ECR_REGISTRY_ID",
									value: principal.accountId,
									type: "PLAINTEXT",
								},
							]
						: []),
					{
						name: "BUILD_ARCH",
						value: "arm64",
						type: "PLAINTEXT",
					},
					{
						name: "GIT_SHA",
						value: getCommit() ?? (undefined as unknown as string),
						type: "PLAINTEXT",
					},
					{
						name: "PULUMI_CONFIG_PASSPHRASE",
						value: "static123",
						type: "PLAINTEXT",
					},
				],
			),
		},
		logsConfig: {
			cloudwatchLogs: {
				status: "ENABLED",
			},
		},
		cache: {
			type: "S3",
			location: bucket.bucket,
		},
		serviceRole: role.arn,
		source: {
			// TODO: Batch API
			// // "buildspec": "ci/stacks/toolchain/buildspec.yml",
			// type: "S3",
			// location: bucket.bucket,
			type: "GITHUB",
			location: "https://github.com/oven-sh/bun.git",
			buildspec: "bun/ci/stacks/toolchain/linux/buildspec.yml",
		},
		sourceVersion: getCommit(),
	});

	const policy = new RolePolicy("bun-ci", {
		role: role,
		policy: {
			Version: "2012-10-17",
			Statement: [
				{
					Effect: "Allow",
					Action: [
						"ecr:GetAuthorizationToken",
						"ecr:BatchCheckLayerAvailability",
						"ecr:GetDownloadUrlForLayer",
						"ecr:BatchGetImage",
						"ecr:InitiateLayerUpload",
						"ecr:UploadLayerPart",
						"ecr:CompleteLayerUpload",
						"ecr:PutImage",
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
					Resource: "*",
				},
				{
					Effect: "Allow",
					Action: [
						"ssm:GetParameters",
						"ssm:GetParameter",
						"ssm:GetParametersByPath",
						"ssm:GetParameterHistory",
					],
					Resource: `*`,
				},
				{
					Effect: "Allow",
					Action: [
						"secretsmanager:GetSecretValue",
						"secretsmanager:DescribeSecret",
					],
					Resource: credentials.arn,
				},
				{
					Effect: "Allow",
					Action: [
						"s3:GetObject",
						"s3:GetObjectVersion",
						"s3:GetBucketVersioning",
						"s3:GetBucketLocation",
						"s3:GetBucketPolicy",
						"s3:GetBucketAcl",
						"s3:ListBucket",
						"s3:ListBucketVersions",
						"s3:ListBucketMultipartUploads",
						"s3:ListMultipartUploadParts",
						"s3:AbortMultipartUpload",
						"s3:CreateBucket",
						"s3:PutObject",
						"s3:PutObjectAcl",
						"s3:PutObjectVersionAcl",
						"s3:DeleteObject",
						"s3:DeleteObjectVersion",
						"s3:DeleteBucket",
					],
					Resource: [interpolate`${bucket.arn}/*`, interpolate`${bucket.arn}`],
				},
			],
		},
	});

	return {
		role,
		policy,
		project,
	};
})({ artifact, s3 });
