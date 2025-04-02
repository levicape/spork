import { inspect } from "node:util";
import { Context } from "@levicape/fourtwo-pulumi/commonjs/context/Context.cjs";
import {
	UserPoolClient,
	type UserPoolClientArgs,
} from "@pulumi/aws/cognito/userPoolClient";
import { all } from "@pulumi/pulumi";
import { error, warn } from "@pulumi/pulumi/log";
import type { z } from "zod";
import { objectEntries, objectFromEntries } from "../../../Object";
import { $$root, $deref } from "../../../Stack";
import {
	SporkApplicationRoot,
	SporkApplicationStackExportsZod,
} from "../../../application/exports";
import {
	SporkDnsRootStackExportsZod,
	SporkDnsRootStackrefRoot,
} from "../../../dns/root/exports";
import {
	SporkIdpUsersStackExportsZod,
	SporkIdpUsersStackrefRoot,
} from "../../../idp/users/exports";
import { SporkMagmapWWWRootSubdomain } from "../wwwroot/exports";
import {
	SporkMagmapClientOauthRoutes,
	SporkMagmapClientStackExportsZod,
} from "./exports";

const APPLICATION_IMAGE_NAME = SporkApplicationRoot;
const SUBDOMAIN =
	process.env["STACKREF_SUBDOMAIN"] ?? SporkMagmapWWWRootSubdomain;
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
		[SporkDnsRootStackrefRoot]: {
			refs: {
				acm: SporkDnsRootStackExportsZod.shape.spork_dns_root_acm,
			},
		},
		[SporkIdpUsersStackrefRoot]: {
			refs: {
				cognito: SporkIdpUsersStackExportsZod.shape.spork_idp_users_cognito,
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

	const { cognito } = dereferenced$[SporkIdpUsersStackrefRoot];
	const { acm } = dereferenced$[SporkDnsRootStackrefRoot];
	const domainName = (() => {
		const domainName = acm.certificate?.domainName;
		if (domainName?.startsWith("*.")) {
			return domainName.slice(2);
		}
		return domainName;
	})();

	/**
	 * Cognito User Pool Clients
	 */
	const clients = (() => {
		const userpoolclient = (
			name: string,
			userPoolId: string,
			config?: Omit<UserPoolClientArgs, "userPoolId">,
		) => {
			/**
			 * Subdomain relative to the hosted zone
			 */
			const callbackDomain = `${SUBDOMAIN}.${domainName}`;
			const client = new UserPoolClient(_(`${name}-client`), {
				userPoolId,
				allowedOauthFlows: ["code", "implicit"],
				allowedOauthFlowsUserPoolClient: true,
				allowedOauthScopes: [
					"email",
					"openid",
					"profile",
					"aws.cognito.signin.user.admin",
				],
				authSessionValidity: 7,
				callbackUrls: [`https://${callbackDomain}`].flatMap((url) => [
					url.endsWith("/") ? url.slice(0, -1) : url,
					...Object.values(SporkMagmapClientOauthRoutes).map(
						(route) => `${url}/${route}`,
					),
				]),
				enableTokenRevocation: true,
				logoutUrls: [
					`https://${callbackDomain}/${SporkMagmapClientOauthRoutes.logout}`,
				],
				preventUserExistenceErrors: "ENABLED",
				supportedIdentityProviders: ["COGNITO"],
				...(config ?? {}),
			});

			return { client };
		};

		const userPoolId = cognito.operators.pool.id;
		return {
			operators: userpoolclient("operators", userPoolId),
		};
	})();

	const clientsOutput = all(objectEntries(clients)).apply((entries) =>
		objectFromEntries(
			entries.map(([name, { client }]) => [
				name,
				all([
					all([client.id, client.name, client.userPoolId]).apply(
						([clientId, name, userPoolId]) => ({
							clientId,
							name,
							userPoolId,
						}),
					),
				]).apply(([client]) => {
					return {
						client,
					};
				}),
			]),
		),
	);

	return all([clientsOutput]).apply(([clients]) => {
		const exported = {
			spork_magmap_client_cognito: {
				operators: clients.operators,
			},
		} satisfies z.infer<typeof SporkMagmapClientStackExportsZod>;

		const validate = SporkMagmapClientStackExportsZod.safeParse(exported);
		if (!validate.success) {
			error(`Validation failed: ${JSON.stringify(validate.error, null, 2)}`);
			warn(inspect(exported, { depth: null }));
		}

		return $$root(APPLICATION_IMAGE_NAME, STACKREF_ROOT, exported);
	});
};
