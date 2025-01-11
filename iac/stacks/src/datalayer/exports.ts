import { z } from "zod";

export const DatalayerStackExportsZod = z.object({
	props: z.object({
		lambda: z.object({
			role: z.string(),
			fileSystemConfig: z.object({
				arn: z.string(),
				localMountPath: z.string(),
			}),
			vpcConfig: z.object({
				securityGroupIds: z.array(z.string()),
				subnetIds: z.array(z.string()),
			}),
		}),
	}),
	ec2: z.object({
		vpc: z.object({
			vpcId: z.string(),
			subnetIds: z.string(),
		}),
		securitygroup: z.object({
			securityGroupId: z.string(),
		}),
	}),
	efs: z.object({
		filesystem: z.object({
			arn: z.string(),
			kmsKeyId: z.string(),
			dnsName: z.string(),
			sizeInBytes: z.string(),
		}),
		accesspoint: z.object({
			arn: z.string(),
			rootDirectory: z.string(),
		}),
	}),
	iam: z.object({
		roles: z.object({
			lambda: z.object({
				arn: z.string(),
			}),
		}),
	}),
});
