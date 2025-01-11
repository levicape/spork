import { Context } from "@levicape/fourtwo-pulumi";
import { Application } from "@pulumi/aws/codedeploy";
import { DeploymentConfig } from "@pulumi/aws/codedeploy/deploymentConfig";
import { DeploymentGroup } from "@pulumi/aws/codedeploy/deploymentGroup";
import { Repository as ECRRepository } from "@pulumi/aws/ecr";
import { getRole } from "@pulumi/aws/iam/getRole";
import { all } from "@pulumi/pulumi/output";

export = async () => {
	const context = await Context.fromConfig();
	const _ = (name: string) => `${context.prefix}-${name}`;

	const farRole = await getRole({ name: "FourtwoAccessRole" });

	const ecr = await (async () => {
		const repository = new ECRRepository(_("binaries"));

		return {
			repository,
		};
	})();

	const codedeploy = await (async () => {
		const application = new Application(_("application"), {
			computePlatform: "Lambda",
		});

		const deploymentConfig = new DeploymentConfig(_("deployment-config"), {
			computePlatform: "Lambda",
			trafficRoutingConfig: {
				type: "TimeBasedLinear",
				timeBasedLinear: {
					interval: 10,
					percentage: 10,
				},
			},
		});

		const deploymentGroup = new DeploymentGroup(_("deployment-group"), {
			appName: application.name,
			deploymentGroupName: _("deployment-group"),
			serviceRoleArn: farRole.arn,
			deploymentConfigName: deploymentConfig.id,
			deploymentStyle: {
				deploymentOption: "WITH_TRAFFIC_CONTROL",
				deploymentType: "BLUE_GREEN",
			},
		});

		return {
			application,
			deploymentConfig,
			deploymentGroup,
		};
	})();

	return all([
		ecr.repository.arn,
		ecr.repository.repositoryUrl,
		codedeploy.application.arn,
		codedeploy.deploymentConfig.arn,
		codedeploy.deploymentGroup.arn,
	]).apply(
		([
			ecrRepositoryArn,
			ecrRepositoryUrl,
			codedeployApplicationArn,
			codedeployDeploymentConfigArn,
			codedeployDeploymentGroupArn,
		]) => {
			return {
				spork_codestar_ecr: {
					repository: {
						arn: ecrRepositoryArn,
						url: ecrRepositoryUrl,
					},
				},
				spork_codestar_codedeploy: {
					application: {
						arn: codedeployApplicationArn,
					},
					deploymentConfig: {
						arn: codedeployDeploymentConfigArn,
					},
					deploymentGroup: {
						arn: codedeployDeploymentGroupArn,
					},
				},
			};
		},
	);
};
