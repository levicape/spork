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

export const alpine = (({ commit, url, registryId }: typeof context) => {
	["build-alpine", "test-alpine"].forEach((dir) => {
		try {
			execSync(`mkdir -p ${dir}`);
		} catch (_) {}
	});
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

	const build = new Image(`alpine-arm64-build`, {
		buildOnPreview: false,
		tags: [refs.latest],
		registries,
		context: {
			location: "../../..",
		},
		dockerfile: {
			location: "./bun/build.Dockerfile",
		},
		builder: {
			name: "desktop-linux",
		},
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

	// TODO: Uses previous image as base layer, so it has to be templated
	// const test = new Image(
	//   `alpine-arm64-test`,
	//   {
	//     context: {
	//       location: ".",
	//     },
	//     dockerfile: {
	//       location: "./bun/test.Dockerfile",
	//     },
	//     exports: [
	//       {
	//         docker: {}
	//       },
	//     ],
	//     platforms: ["linux/arm64"],
	//     push: false,
	//     cacheTo: [
	//       {
	//         inline: {},
	//       },
	//     ],
	//   },
	//   {
	//     dependsOn: [build],
	//   }
	// );

	return {
		build: build.ref,
		// test: test.ref,
	};
})(context);
