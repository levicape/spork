import { execSync } from "node:child_process";
import { getAuthorizationTokenOutput } from "@pulumi/aws/ecr/getAuthorizationToken";
import { Image } from "@pulumi/docker-build";
import { all, interpolate } from "@pulumi/pulumi/output";

const context: {
	commit: string;
	url: string;
	registryId: string;
} = {
	commit: (() => {
		const commit = process.env.GIT_SHA;
		if (!commit) {
			throw new Error("GIT_SHA is required");
		}
		return commit;
	})(),
	url: (() => {
		const url = process.env.ECR_REGISTRY_URL;
		if (!url) {
			throw new Error("ECR_REGISTRY_URL is required");
		}
		return url;
	})(),
	registryId: (() => {
		const registryId = process.env.ECR_REGISTRY_ID;
		if (!registryId) {
			throw new Error("ECR_REGISTRY_ID is required");
		}
		return registryId;
	})(),
};

const toolchain = {
	linux: (({ commit, url, registryId }: typeof context) => {
		const { userName, password } = getAuthorizationTokenOutput({
			registryId,
		});

		const refs = {
			latest: interpolate`${url}/toolchain:latest`,
		};

		const registries = all([url, userName, password]).apply(
			([address, username, password]) => {
				return [
					{
						address,
						username,
						password,
					},
				];
			},
		);

		const build = new Image(`linux-arm64-toolchain`, {
			tags: [refs.latest],
			registries,
			context: {
				location: "../../..",
			},
			dockerfile: {
				location: "./linux/Dockerfile",
			},
			platforms: ["linux/arm64"],
			buildArgs: {
				GIT_SHA: commit,
			},
			push: true,
			cacheFrom: [
				{
					registry: {
						ref: refs.latest,
					},
				},
			],
			cacheTo: [
				{
					inline: {},
				},
			],
		});

		return {
			build,
			// policy,
		};
	})(context),
};

export const linux = {
	image: toolchain.linux.build.ref,
};

const policy = () => {
	// const policy = new RepositoryPolicy(
	//     `${name}--Resource-Policy`,
	//     {
	//         repository: repository.name,
	//         policy: all([currentGetPartition, current, role.arn]).apply(
	//             ([currentGetPartition, current, roleArn]) =>
	//                 getPolicyDocument({
	//                     statements: [
	//                         {
	//                             sid: "root",
	//                             effect: "Allow",
	//                             principals: [
	//                                 {
	//                                     type: "AWS",
	//                                     identifiers: [
	//                                         `arn:${currentGetPartition.partition}:iam::${current.accountId}:root`,
	//                                     ],
	//                                 },
	//                             ],
	//                             actions: ["ecr:*"],
	//                         },
	//                         {
	//                             sid: "LambdaECRImageRetrievalPolicy",
	//                             effect: "Allow",
	//                             principals: [
	//                                 {
	//                                     type: "Service",
	//                                     identifiers: ["lambda.amazonaws.com"],
	//                                 },
	//                                 {
	//                                     type: "AWS",
	//                                     identifiers: [roleArn],
	//                                 },
	//                             ],
	//                             actions: [
	//                                 "ecr:GetDownloadUrlForLayer",
	//                                 "ecr:BatchGetImage",
	//                                 "ecr:BatchCheckLayerAvailability",
	//                             ],
	//                         },
	//                     ],
	//                 }).then(({ json }) => {
	//                     console.debug({
	//                         AwsContainerDomain: { name, policy: { json } },
	//                     });
	//                     return json;
	//                 }),
	//         ),
	//     },
	//     {
	//         parent: repository,
	//     },
	// );
	// return policy;
};
