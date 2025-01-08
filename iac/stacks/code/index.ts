import { Context } from "@levicape/fourtwo-pulumi";
import { Application } from "@pulumi/aws/codedeploy";
import { DeploymentConfig } from "@pulumi/aws/codedeploy/deploymentConfig";
import { DeploymentGroup } from "@pulumi/aws/codedeploy/deploymentGroup";
import { Repository as ECRRepository } from "@pulumi/aws/ecr";
import { getRole } from "@pulumi/aws/iam/getRole";
import {
	Bucket,
	BucketServerSideEncryptionConfigurationV2,
} from "@pulumi/aws/s3";
import { BucketPublicAccessBlock } from "@pulumi/aws/s3/bucketPublicAccessBlock";
import { BucketVersioningV2 } from "@pulumi/aws/s3/bucketVersioningV2";

export = async () => {
	const context = await Context.fromConfig();
	const _ = (name: string) => `${context.prefix}-${name}`;

	const farRole = await getRole({ name: "FourtwoAccessRole" });

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
			// autoRollbackConfiguration: {
			// 	enabled: true,
			// 	events: ["DEPLOYMENT_STOP_ON_ALARM"],
			// },
			// alarmConfiguration: {
			// 	alarms: ["my-alarm-name"],
			// 	enabled: true,
			// },
		});

		return {
			application,
			s3,
			deploymentConfig,
			deploymentGroup,
		};
	})();

	const pipelines = ["infrastructure", "application", "website"].map(() => {
		// CodePipeline
		// const codePipeline = new Pipeline("codePipeline", {
		// 	name: "artifact"
		// });
	});

	return {
		s3,
		ecr,
		codedeploy,
	};
};
