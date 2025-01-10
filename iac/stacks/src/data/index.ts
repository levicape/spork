import { Context } from "@levicape/fourtwo-pulumi";
import { SecurityGroup } from "@pulumi/aws/ec2/securityGroup";
import { AccessPoint } from "@pulumi/aws/efs/accessPoint";
import { FileSystem } from "@pulumi/aws/efs/fileSystem";
import { MountTarget } from "@pulumi/aws/efs/mountTarget";
import { Vpc } from "@pulumi/awsx/ec2/vpc";

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
				fileSystemConfig,
				vpcConfig,
			},
		};
	})(ec2, efs);

	return {
		props,
		ec2: ((ec2) => {
			return {
				vpc: {
					vpcId: ec2.vpc.vpcId,
					subnetIds: ec2.subnetIds,
				},
				securitygroup: {
					securityGroupId: ec2.securitygroup.id,
				},
			};
		})(ec2),
		efs: ((efs) => {
			return {
				filesystem: {
					arn: efs.filesystem.arn,
					kmsKeyId: efs.filesystem.kmsKeyId,
					dnsName: efs.filesystem.dnsName,
					sizeInBytes: efs.filesystem.sizeInBytes,
				},
				mounttargets: efs.mounttargets.apply((mounttargets) =>
					mounttargets.map((mounttarget) => ({
						fileSystemId: mounttarget.fileSystemId,
						networkInterfaceId: mounttarget.networkInterfaceId,
						ipAddress: mounttarget.ipAddress,
					})),
				),
				accesspoint: {
					arn: efs.accesspoint.arn,
					uid: efs.accesspoint.posixUser,
					rootDirectory: efs.accesspoint.rootDirectory,
				},
			};
		})(efs),
		// sqs
		// dynamodb
		// streams
	};
};
