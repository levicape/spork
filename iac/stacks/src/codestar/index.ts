import { Context } from "@levicape/fourtwo-pulumi";
import { Application } from "@pulumi/aws/codedeploy";
import { DeploymentConfig } from "@pulumi/aws/codedeploy/deploymentConfig";
import { Repository as ECRRepository, LifecyclePolicy } from "@pulumi/aws/ecr";
import { getLifecyclePolicyDocument } from "@pulumi/aws/ecr/getLifecyclePolicyDocument";
import { RepositoryPolicy } from "@pulumi/aws/ecr/repositoryPolicy";
import { all } from "@pulumi/pulumi/output";
import type { z } from "zod";
import { SporkCodestarStackExportsZod } from "./exports";

const PACKAGE_NAME = "@levicape/spork";

export = async () => {
	const context = await Context.fromConfig();
	const _ = (name: string) => `${context.prefix}-${name}`;

	const ecr = await (async () => {
		const repository = new ECRRepository(_("binaries"), {
			tags: {
				Name: _("binaries"),
				PackageName: PACKAGE_NAME,
			},
		});
		const daysTtl = context.environment.isProd ? 28 : 9;
		new LifecyclePolicy(_("binaries-lifecycle"), {
			repository: repository.name,
			policy: repository.repositoryUrl.apply(
				async () =>
					(
						await getLifecyclePolicyDocument({
							rules: [
								{
									priority: 1,
									description: `Expire images older than ${daysTtl} days`,
									selection: {
										tagStatus: "tagged",
										countType: "sinceImagePushed",
										countUnit: "days",
										countNumber: daysTtl,
										tagPrefixLists: ["git"],
									},
									action: {
										type: "expire",
									},
								},
							],
						})
					).json,
			),
		});
		new RepositoryPolicy(_("binaries-policy"), {
			repository: repository.name,
			policy: repository.repositoryUrl.apply(() =>
				JSON.stringify({
					Version: "2008-10-17",
					Statement: [
						{
							Effect: "Allow",
							Principal: {
								Service: [
									"codebuild.amazonaws.com",
									"codedeploy.amazonaws.com",
									"codepipeline.amazonaws.com",
									"lambda.amazonaws.com",
								],
							},
							Action: [
								"ecr:GetDownloadUrlForLayer",
								"ecr:BatchGetImage",
								"ecr:BatchCheckLayerAvailability",
							],
						},
					],
				}),
			),
		});

		return {
			repository,
		};
	})();

	const codedeploy = await (async () => {
		const application = new Application(_("application"), {
			computePlatform: "Lambda",
			tags: {
				Name: _("application"),
				PackageName: PACKAGE_NAME,
			},
		});

		const deploymentConfig = new DeploymentConfig(_("deployment-config"), {
			computePlatform: "Lambda",
			trafficRoutingConfig: context.environment.isProd
				? {
						type: "TimeBasedLinear",
						timeBasedLinear: {
							interval: 2,
							percentage: 12,
						},
					}
				: {
						type: "AllAtOnce",
					},
		});

		return {
			application,
			deploymentConfig,
		};
	})();

	return all([
		ecr.repository.arn,
		ecr.repository.repositoryUrl,
		ecr.repository.name,
		codedeploy.application.arn,
		codedeploy.application.name,
		codedeploy.deploymentConfig.arn,
		codedeploy.deploymentConfig.deploymentConfigName,
	]).apply(
		([
			ecrRepositoryArn,
			ecrRepositoryUrl,
			ecrRepositoryName,
			codedeployApplicationArn,
			codedeployApplicationName,
			codedeployDeploymentConfigArn,
			codedeployDeploymentConfigName,
		]) => {
			const exported = {
				spork_codestar_ecr: {
					repository: {
						arn: ecrRepositoryArn,
						url: ecrRepositoryUrl,
						name: ecrRepositoryName,
					},
				},
				spork_codestar_codedeploy: {
					application: {
						arn: codedeployApplicationArn,
						name: codedeployApplicationName,
					},
					deploymentConfig: {
						arn: codedeployDeploymentConfigArn,
						name: codedeployDeploymentConfigName,
					},
				},
			} satisfies z.infer<typeof SporkCodestarStackExportsZod>;

			const validate = SporkCodestarStackExportsZod.safeParse(exported);
			if (!validate.success) {
				process.stderr.write(
					`Validation failed: ${JSON.stringify(validate.error, null, 2)}`,
				);
			}

			return exported;
		},
	);
};
