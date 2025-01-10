import { Context } from "@levicape/fourtwo-pulumi";
import { SecurityGroup } from "@pulumi/aws/ec2/securityGroup";
import { AccessPoint } from "@pulumi/aws/efs/accessPoint";
import { FileSystem } from "@pulumi/aws/efs/fileSystem";
import { MountTarget } from "@pulumi/aws/efs/mountTarget";
import { Role } from "@pulumi/aws/iam/role";
import { Vpc } from "@pulumi/awsx/ec2/vpc";
import { all } from "@pulumi/pulumi";

export = async () => {
	const context = await Context.fromConfig();
	const _ = (name: string) => `${context.prefix}-${name}`;
	const ec2 = (() => {
		const vpc = new Vpc(
			_("vpc"),
			{
				enableDnsHostnames: true,
				enableDnsSupport: true,
				subnetStrategy: "Auto",
				numberOfAvailabilityZones: 3,
				natGateways: {
					strategy: "None",
				},
				tags: {
					Name: _("vpc"),
				},
			},
			{
				replaceOnChanges: ["numberOfAvailabilityZones"],
			},
		);
		const subnetIds = vpc.publicSubnetIds;
		const securitygroup = new SecurityGroup(
			_("security-group"),
			{
				vpcId: vpc.vpcId,
				ingress: [
					{
						fromPort: 0,
						toPort: 0,
						protocol: "-1",
						cidrBlocks: ["0.0.0.0/0"],
					},
				],
				egress: [
					{
						fromPort: 0,
						toPort: 0,
						protocol: "-1",
						cidrBlocks: ["0.0.0.0/0"],
					},
				],
			},
			{
				parent: vpc,
			},
		);

		return {
			vpc,
			subnetIds,
			securitygroup,
		};
	})();

	const efs = (({ subnetIds, securitygroup }) => {
		const filesystem = new FileSystem(_("efs"), {
			throughputMode: "elastic",
			tags: {
				Name: _("efs"),
			},
		});

		const mounttargets = subnetIds.apply((subnetIds) => {
			return subnetIds.map((subnetId, i) => {
				return new MountTarget(
					_(`efs-mount-${i}`),
					{
						fileSystemId: filesystem.id,
						subnetId,
						securityGroups: [securitygroup.id],
					},
					{
						deleteBeforeReplace: true,
						replaceOnChanges: ["*"],
					},
				);
			});
		});

		const accesspoint = new AccessPoint(
			_("efs-access-point"),
			{
				fileSystemId: filesystem.id,
				rootDirectory: {
					path: "/spork",
					creationInfo: {
						ownerGid: 1000,
						ownerUid: 1000,
						permissions: "777",
					},
				},
				posixUser: {
					gid: 1000,
					uid: 1000,
				},
			},
			{
				dependsOn: mounttargets,
			},
		);

		return {
			filesystem,
			mounttargets,
			accesspoint,
		};
	})(ec2);

	const iam = (() => {
		const lambda = new Role(
			_("lambda-role"),
			{
				assumeRolePolicy: JSON.stringify({
					Version: "2012-10-17",
					Statement: [
						{
							Effect: "Allow",
							Principal: {
								Service: "lambda.amazonaws.com",
							},
							Action: "sts:AssumeRole",
						},
					],
				}),
			},
			{ parent: this },
		);

		//   AwsDynamoDbTable.resourcePolicy(
		// 	this,
		// 	`${name}-lambda-data`,
		// 	[
		// 	  ["users", accountsTable],
		// 	],
		// 	role,
		//   );

		return {
			roles: {
				lambda,
			},
		};
	})();

	const props = (({ vpc, securitygroup }, { accesspoint }) => {
		const fileSystemConfig = {
			arn: accesspoint.arn,
			localMountPath: "/mnt/efs",
		};

		const vpcConfig = {
			subnetIds: vpc.privateSubnetIds,
			securityGroupIds: [securitygroup.id],
		};

		return {
			lambda: {
				role: iam.roles.lambda.arn,
				fileSystemConfig,
				vpcConfig,
			},
		};
	})(ec2, efs);

	return all([
		iam.roles.lambda.arn,
		ec2.vpc.vpcId,
		ec2.subnetIds.apply((ids) => ids.join(",")),
		ec2.securitygroup.id,
		efs.filesystem.arn,
		efs.filesystem.kmsKeyId,
		efs.filesystem.dnsName,
		efs.filesystem.sizeInBytes.apply((size) =>
			size.map((s) => s.value).join(","),
		),
		efs.accesspoint.arn,
		efs.accesspoint.rootDirectory.path,
	]).apply(
		([
			iamLambdaArn,
			ec2VpcId,
			ec2SubnetIds,
			ec2SecurityGroupId,
			efsFilesystemArn,
			efsFilesystemKmsKeyId,
			efsFilesystemDnsName,
			efsFilesystemSizeInBytes,
			efsAccessPointArn,
			efsAccessPointRootDirectory,
		]) => {
			return Object.fromEntries(
				Object.entries({
					props,
					iam: {
						roles: {
							lambda: {
								arn: iamLambdaArn,
							},
						},
					},
					ec2: {
						vpc: {
							vpcId: ec2VpcId,
							subnetIds: ec2SubnetIds,
						},
						securitygroup: {
							securityGroupId: ec2SecurityGroupId,
						},
					},
					efs: {
						filesystem: {
							arn: efsFilesystemArn,
							kmsKeyId: efsFilesystemKmsKeyId,
							dnsName: efsFilesystemDnsName,
							sizeInBytes: efsFilesystemSizeInBytes,
						},
						accesspoint: {
							arn: efsAccessPointArn,
							rootDirectory: efsAccessPointRootDirectory,
						},
					},
					// sqs
					// dynamodb
					// streams
				}).map(([key, value]) => [key, JSON.stringify(value)]),
			);
		},
	);
};
