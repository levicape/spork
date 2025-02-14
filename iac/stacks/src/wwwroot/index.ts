// import { Context } from "@levicape/fourtwo-pulumi";
// import {
// 	Distribution,
// 	Function,
// 	OriginAccessIdentity,
// } from "@pulumi/aws/cloudfront";
// import {
// 	Dashboard,
// 	type DashboardArgs,
// 	MetricAlarm,
// 	type MetricAlarmArgs,
// } from "@pulumi/aws/cloudwatch";
// import { getRole } from "@pulumi/aws/iam/getRole";
// import { Permission } from "@pulumi/aws/lambda";
// import {
// 	BucketAclV2,
// 	BucketLifecycleConfigurationV2,
// 	BucketObject,
// 	BucketOwnershipControls,
// 	type BucketPolicy,
// 	BucketV2,
// 	CannedAcl,
// } from "@pulumi/aws/s3";
// import { Output, all, getStack } from "@pulumi/pulumi";
// import { interpolate, jsonStringify } from "@pulumi/pulumi";
// import type { z } from "zod";
// import type {
// 	ComputeManifest,
// 	LambdaRouteResource,
// 	Prefix,
// 	Route,
// 	Service,
// 	WebsiteManifest,
// } from "../RouteMap";
// import { $deref, type DereferencedOutput } from "../Stack";
// import { SporkDatalayerStackExportsZod } from "../datalayer/exports";
// import { SporkManifestWebStackExportsZod } from "../domains/manifest/web/exports";
// import { SporkHttpStackExportsZod } from "../http/exports";
// import { SporkWWWRootStackExportsZod } from "./exports";

// class AwsCloudfrontCachePolicy {
// 	static OPTIMIZED = "658327ea-f89d-4fab-a63d-7e88639e58f6";
// 	static DISABLED = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad";
// }
// class AwsCloudfrontRequestPolicy {
// 	static ALL_VIEWER_EXCEPT_HOST_HEADER = "b689b0a8-53d0-40ab-baf2-68738e2966ac";
// 	private _uid = Date.now().toString();
// }

// const PACKAGE_NAME = "@levicape/spork";

// const STACKREF_ROOT = process.env["STACKREF_ROOT"] ?? "spork";
// const STACKREF_CONFIG = {
// 	[STACKREF_ROOT]: {
// 		["datalayer"]: {
// 			refs: {
// 				props: SporkDatalayerStackExportsZod.shape.spork_datalayer_props,
// 				iam: SporkDatalayerStackExportsZod.shape.spork_datalayer_iam,
// 			},
// 		},
// 		["http"]: {
// 			refs: {
// 				cloudmap: SporkHttpStackExportsZod.shape.spork_http_cloudmap,
// 				lambda: SporkHttpStackExportsZod.shape.spork_http_lambda,
// 			},
// 		},
// 		["manifest-ui"]: {
// 			refs: {
// 				s3: SporkManifestWebStackExportsZod.shape.spork_manifest_web_s3,
// 			},
// 		},
// 		// ["wwwdomain"]: {
// 		// 	refs: {
// 		// 		acm: SporkWWWDomainStackExportsZod.shape.spork_wwwdomain_web_acm,
// 		// 	}
// 		// }
// 	},
// } as const;
// const ROUTE_MAP: (
// 	refs: DereferencedOutput<typeof STACKREF_CONFIG>,
// ) => Output<Record<Service, Record<Prefix, Route<LambdaRouteResource>>>> = (
// 	refs,
// ) => {};

// export = async () => {
// 	const context = await Context.fromConfig();
// 	const _ = (name: string) => `${context.prefix}-${name}`;
// 	const stage = process.env.CI_ENVIRONMENT ?? "unknown";
// 	const farRole = await getRole({ name: "FourtwoAccessRole" });

// 	// Stack references
// 	const dereference = await $deref(STACKREF_CONFIG);

// 	//
// 	const identity = new OriginAccessIdentity(
// 		_("Cdn-iam--origin-access-identity"),
// 		{
// 			comment: `OAI for ${name}`,
// 		},
// 		{ parent: this },
// 	);

// 	const rewriteUrls = new Function(
// 		_("Cdn--cache-rewrite-url"),
// 		{
// 			runtime: "cloudfront-js-2.0",
// 			code: `
// function handler(event) {
//   var request = event.request;
//   var uri = request.uri;
//   if (uri endsWith('/')) {
//       request.uri = '/index.html';
//   } else if (!uri.includes('.')) {
//       request.uri = '/index.html';
//   }
//   return request;
// }
//               `,
// 		},
// 		{ parent: this },
// 	);

// 	const hostHeaderInjection = new Function(
// 		_("Cdn--cache-host-header"),
// 		{
// 			runtime: "cloudfront-js-2.0",
// 			code: `
// function handler(event) {
//   event.request.uri = event.request.uri.split('/').map(encodeURIComponent).join('/');
//   event.request.headers["x-forwarded-host"] = event.request.headers.host;
//   return event.request;
// }
//               `,
// 		},
// 		{ parent: this },
// 	);

// 	const logs = new BucketV2(_("Cdn-monitor--logs"), {}, { parent: this });
// 	const ownership = new BucketOwnershipControls(
// 		_("Cdn-monitor--logs-ownership-controls"),
// 		{
// 			bucket: logs.bucket,
// 			rule: {
// 				objectOwnership: "BucketOwnerPreferred",
// 			},
// 		},
// 		{ parent: this },
// 	);
// 	const acl = new BucketAclV2(
// 		_("Cdn-monitor--logs-acl"),
// 		{
// 			bucket: logs.bucket,
// 			acl: CannedAcl.Private,
// 		},
// 		{ parent: this, dependsOn: ownership },
// 	);
// 	new BucketLifecycleConfigurationV2(
// 		_("Cdn-monitor--logs-lifecycle"),
// 		{
// 			bucket: logs.bucket,
// 			rules: [
// 				{
// 					id: "expire30days",
// 					status: context.environment.isProd ? "Disabled" : "Enabled",
// 					expiration: {
// 						days: 30,
// 					},
// 				},
// 			],
// 		},
// 		{ parent: this },
// 	);

// 	const cache = new Distribution(
// 		_("Cdn--cache"),
// 		{
// 			enabled: true,
// 			comment: `CDN for ${name}`,
// 			httpVersion: "http2and3",
// 			priceClass: "PriceClass_100",
// 			isIpv6Enabled: true,
// 			aliases: hostnames
// 				?.filter((hostname) => {
// 					return hostname !== "localhost";
// 				})
// 				.flatMap((hostname) => [hostname, `www.${hostname}`]),
// 			viewerCertificate: {
// 				acmCertificateArn: certificate?.arn,
// 				cloudfrontDefaultCertificate: true,
// 			},
// 			origins:
// 				origins === undefined
// 					? []
// 					: all([
// 							origins,
// 							bucketDomainName,
// 							identity.cloudfrontAccessIdentityPath,
// 						]).apply(
// 							([origins, bucketDomainName, cloudfrontAccessIdentityPath]) => {
// 								const applied = [
// 									...(bucketDomainName !== undefined
// 										? [
// 												{
// 													originId: bucketDomainName,
// 													domainName: bucketDomainName,
// 													s3OriginConfig: {
// 														originAccessIdentity: cloudfrontAccessIdentityPath,
// 													},
// 												},
// 											]
// 										: []),
// 									...origins
// 										.filter(({ originId }) => {
// 											return originId !== bucketDomainName;
// 										})
// 										.map(({ originId, domainName }) => ({
// 											originId,
// 											domainName,
// 											customOriginConfig: {
// 												httpPort: 80,
// 												httpsPort: 443,
// 												originProtocolPolicy:
// 													originId === "default__origin__assets"
// 														? "http-only"
// 														: "https-only",
// 												originReadTimeout: 20,
// 												originSslProtocols: ["TLSv1.2"],
// 											},
// 										})),
// 								];
// 								console.debug({
// 									CdnComponentAws: {
// 										origins: JSON.stringify(applied, null, 4),
// 										applied,
// 									},
// 								});
// 								return applied;
// 							},
// 						),
// 			defaultCacheBehavior: {
// 				cachePolicyId:
// 					props.compute === undefined
// 						? AwsCloudfrontCachePolicy.OPTIMIZED
// 						: AwsCloudfrontCachePolicy.DISABLED,
// 				targetOriginId:
// 					props.compute !== undefined && computePath === undefined
// 						? "default__origin__compute"
// 						: (bucketDomainName ?? ""),
// 				functionAssociations: [
// 					{
// 						functionArn:
// 							props.compute === undefined && computePath !== undefined
// 								? rewriteUrls.arn
// 								: hostHeaderInjection.arn,
// 						eventType: "viewer-request",
// 					},
// 				],
// 				viewerProtocolPolicy: "redirect-to-https",
// 				allowedMethods:
// 					props.compute === undefined && computePath !== undefined
// 						? ["HEAD", "GET", "OPTIONS"]
// 						: ["HEAD", "DELETE", "POST", "GET", "OPTIONS", "PUT", "PATCH"],
// 				cachedMethods: ["HEAD", "GET", "OPTIONS"],
// 				compress: true,
// 				originRequestPolicyId:
// 					props.compute !== undefined && computePath === undefined
// 						? AwsCloudfrontRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER
// 						: undefined,
// 			},
// 			orderedCacheBehaviors:
// 				origins === undefined
// 					? []
// 					: all([origins]).apply(([origins]) => {
// 							const allorigins = origins
// 								.filter(({ originId }) => {
// 									return (
// 										props.compute === undefined ||
// 										originId !== "default__origin__compute" ||
// 										(props.compute !== undefined &&
// 											computePath !== undefined &&
// 											originId === "default__origin__compute")
// 									);
// 								})
// 								.flatMap(({ prefix, originId: targetOriginId }) => {
// 									return {
// 										pathPattern: `${prefix}/*`,
// 										targetOriginId,
// 										cachePolicyId:
// 											targetOriginId === "default__origin__assets"
// 												? AwsCloudfrontCachePolicy.OPTIMIZED
// 												: AwsCloudfrontCachePolicy.DISABLED,
// 										originRequestPolicyId:
// 											AwsCloudfrontRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
// 										viewerProtocolPolicy: "redirect-to-https",
// 										allowedMethods: [
// 											"HEAD",
// 											"DELETE",
// 											"POST",
// 											"GET",
// 											"OPTIONS",
// 											"PUT",
// 											"PATCH",
// 										],
// 										functionAssociations: targetOriginId.startsWith(
// 											"default__origin",
// 										)
// 											? [
// 													{
// 														functionArn:
// 															targetOriginId === "default__origin__assets"
// 																? rewriteUrls.arn
// 																: hostHeaderInjection.arn,
// 														eventType: "viewer-request",
// 													},
// 												]
// 											: undefined,
// 										cachedMethods: ["HEAD", "GET"],
// 										compress: targetOriginId === "default__origin__assets",
// 									};
// 								});
// 							console.debug({
// 								CdnComponentAws: {
// 									allorigins: JSON.stringify(allorigins, null, 4),
// 								},
// 							});
// 							return allorigins;
// 						}),
// 			loggingConfig: {
// 				bucket: logs.bucketDomainName,
// 				includeCookies: false,
// 				prefix: "",
// 			},
// 			restrictions: {
// 				geoRestriction: {
// 					restrictionType: "none",
// 				},
// 			},
// 		},
// 		{ parent: this, protect: true, dependsOn: [acl] },
// 	);

// 	const isManifestOk = websiteContent;
// 	const version = all([isManifestOk, websiteContent]).apply(([m, content]) => {
// 		return m?.manifest.ok && content?.manifest.ok === true
// 			? Output.create([
// 					{
// 						build: content.manifest.version.build,
// 						stage: content.manifest.version.stage,
// 					},
// 				])
// 			: Output.create([
// 					{
// 						build: "0",
// 						stage: "dev",
// 					},
// 				]);
// 	});

// 	routes === undefined
// 		? []
// 		: all([
// 				routes,
// 				cache.arn,
// 				cache.orderedCacheBehaviors,
// 				cache.defaultCacheBehavior,
// 				cache.origins,
// 			]).apply(
// 				([
// 					routes,
// 					cacheArn,
// 					orderedCacheBehaviors,
// 					defaultCacheBehavior,
// 					origins,
// 				]) => {
// 					console.debug({
// 						CdnComponentAws: {
// 							routes,
// 							hostnames,
// 							orderedCacheBehaviors: JSON.stringify(
// 								orderedCacheBehaviors,
// 								null,
// 								4,
// 							),
// 							defaultCacheBehavior: JSON.stringify(
// 								defaultCacheBehavior,
// 								null,
// 								4,
// 							),
// 							origins: JSON.stringify(origins, null, 4),
// 						},
// 					});

// 					return Object.entries(routes).flatMap(([, routes]) =>
// 						Object.entries(routes)
// 							.filter(([, { lambdaName }]) => {
// 								return lambdaName.startsWith("arn:aws:lambda");
// 							})
// 							.flatMap(([prefix, { lambdaName }]) => {
// 								const route = prefix.replaceAll("/", "_").replaceAll("~", "-");
// 								const policy = new Permission(
// 									`${name}-Cdn-cache-${route}-role-policy`,
// 									{
// 										function: lambdaName,
// 										principal: `cloudfront.amazonaws.com`,
// 										action: "lambda:InvokeFunctionUrl",
// 										sourceArn: cacheArn,
// 									},
// 									{ parent: this },
// 								);
// 								return {
// 									policy,
// 								};
// 							}),
// 					);
// 				},
// 			);

// 	const exported = {
// 		spork_wwwroot_iam: {
// 			identity: {
// 				arn: identity.arn,
// 				name: identity.id,
// 			},
// 			policy: undefined,
// 		},
// 		spork_wwwroot_cloudfront: {
// 			distributionId: cache.id,
// 			distributionArn: cache.arn,
// 		},
// 		spork_wwwroot_lambda: {
// 			rewriteUrls: {
// 				functionName: rewriteUrls.name,
// 				functionArn: rewriteUrls.arn,
// 			},
// 		},
// 	};

// 	const validate = SporkWWWRootStackExportsZod.safeParse(exported);
// 	if (!validate.success) {
// 		process.stderr.write(
// 			`Validation failed: ${JSON.stringify(validate.error, null, 2)}`,
// 		);
// 	}

// 	return exported;
// };
