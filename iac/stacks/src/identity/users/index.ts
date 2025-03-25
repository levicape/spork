import { inspect } from "node:util";
import { Context } from "@levicape/fourtwo-pulumi/commonjs/context/Context.cjs";
import { UserPool, type UserPoolArgs } from "@pulumi/aws/cognito";
import { type Output, all } from "@pulumi/pulumi";
import { error, warn } from "@pulumi/pulumi/log";
import type { z } from "zod";
import { $deref } from "../../Stack";
import {
	SporkApplicationRoot,
	SporkApplicationStackExportsZod,
} from "../../application/exports";
import { SporkIdentityUsersStackExportsZod } from "./exports";

const PACKAGE_NAME = "@levicape/spork";
const STACKREF_ROOT = process.env["STACKREF_ROOT"] ?? SporkApplicationRoot;
const STACKREF_CONFIG = {
	[STACKREF_ROOT]: {
		application: {
			refs: {
				servicecatalog:
					SporkApplicationStackExportsZod.shape
						.spork_application_servicecatalog,
			},
		},
	},
};

export = async () => {
	const dereferenced$ = await $deref(STACKREF_CONFIG);
	const context = await Context.fromConfig({
		aws: {
			awsApplication: dereferenced$.application.servicecatalog.application.tag,
		},
	});
	const _ = (name: string) => `${context.prefix}-${name}`;
	context.resourcegroups({ _ });

	const pools = (() => {
		const userpool = (name: string, config: UserPoolArgs) => {
			const pool = new UserPool(_(`${name}`), {
				userPoolTier: "LITE",
				tags: {
					Name: _(`${name}`),
					PackageName: PACKAGE_NAME,
				},
				...config,
			});

			return { pool };
		};

		return {
			chat: userpool("chat", {}),
			operations: userpool("operations", {
				adminCreateUserConfig: {
					allowAdminCreateUserOnly: true,
				},
			}),
		};
	})();

	const userpoolsOutput = all(Object.entries(pools)).apply(
		(entries) =>
			Object.fromEntries(
				entries.map(([name, { pool }]) => [
					name as keyof typeof pools,
					all([pool.arn, pool.name, pool.id, pool.userPoolTier]).apply(
						([arn, name, id, userPoolTier]) => ({
							pool: {
								arn,
								name,
								id,
								userPoolTier,
							},
						}),
					),
				]),
			) as {
				[key in keyof typeof pools]: Output<{
					pool: {
						arn: string;
						name: string;
						id: string;
						userPoolTier: string;
					};
				}>;
			},
	);

	return all([userpoolsOutput]).apply(([userpools]) => {
		const exported = {
			spork_identity_users_cognito: userpools,
		} satisfies z.infer<typeof SporkIdentityUsersStackExportsZod>;

		const validate = SporkIdentityUsersStackExportsZod.safeParse(exported);
		if (!validate.success) {
			error(`Validation failed: ${JSON.stringify(validate.error, null, 2)}`);
			warn(inspect(exported, { depth: null }));
		}

		return exported;
	});
};
