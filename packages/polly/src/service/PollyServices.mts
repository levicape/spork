// import { appendFileSync, readFileSync } from "node:fs";
// import { fileURLToPath } from "node:url";
// import { inspect } from "node:util";
// import { destr } from "destr";
// import { deserializeError, serializeError } from "serialize-error";
// import { env, process } from "std-env";
// import VError from "verror";
// import { PollyEnvironmentZod } from "../PollyEnvironment.mjs";
// import {
// 	type Route,
// 	type Service,
// 	type Prefix,
// 	RoutePathsZod,
// } from "./routes/RouteResource.mjs";
// import { CaddyfileReverseProxy } from "./transform/caddy/Caddyfile.mjs";

// /**
//  * Internal data structure for each Topology entry
//  */
// export type PollyPrototype = {
// 	["~protocol"]?: string;
// 	["~hostname"]: string;
// 	["~port"]?: number;
// };

// /**
//  * Maps a Topology entry to a Route
//  */
// export type PollyRoutePaths<Paths extends Prefix = Prefix> = Record<
// 	Paths,
// 	Route
// >;

// /**
//  * Defines a mapping of services to their respective route paths.
//  */
// export type PollyRouteMap<Paths extends Prefix = Prefix> = Record<
// 	Service,
// 	PollyRoutePaths<Paths>
// >;

// /**
//  * Client API that each Topology entry implements
//  */
// export interface PollyMap {
// 	/**
// 	 * @returns Computed hostname of Topology instance
// 	 */
// 	url: () => string;
// 	/**
// 	 * @returns Cloudmap instance url, if available. Falls back to url()
// 	 */
// 	instance: () => string;
// }

// export type PollyTopology<Paths extends Prefix> = Record<Paths, PollyMap>;
// export type PollyConfiguration<Paths extends Prefix> = {
// 	Routes: PollyRouteMap<Paths>[keyof PollyRouteMap<Paths>];
// };

// function deferExit() {
// 	const { AWS_LAMBDA_FUNCTION_NAME } = env;
// 	if (
// 		AWS_LAMBDA_FUNCTION_NAME !== undefined &&
// 		AWS_LAMBDA_FUNCTION_NAME.length > 0
// 	) {
// 		setTimeout(() => {
// 			process.exit?.(1);
// 		}, 500);
// 	}
// }

// /**
//  * PollyRoutes is a function that takes an map of routes and returns a topology of routes.
//  * It will also replace the routes with the ones in the POLLY_ROUTES env var if it is set, allowing for Service Discovery.
//  * @param routes - The map of routes to use.
//  * @returns A topology of routes.
//  *
//  * @see {@link PollyEnvironment}
//  */
// export function PollyRoutes<Paths extends Prefix>(
// 	routes: PollyRoutePaths<Paths>,
// ): PollyTopology<Paths> {
// 	///
// 	// Parse environment
// 	//
// 	const parsedEnv = PollyEnvironmentZod.safeParse(env);
// 	const { POLLY_ROUTES, POLLY_CADDYFILE } = parsedEnv.data ?? {};
// 	if (!parsedEnv.success) {
// 		console.error(
// 			`PollyEnvZod failed to parse env: ${inspect(parsedEnv.error.flatten(), { depth: null })}\n`,
// 		);

// 		deferExit();
// 		throw new VError(
// 			deserializeError(parsedEnv.error),
// 			"PollyEnvZod failed to parse env",
// 		);
// 	}
// 	///
// 	// Resolve POLLY_ROUTES
// 	//
// 	let resolved = routes as Record<
// 		Paths,
// 		PollyRoutePaths<Paths>[keyof PollyRoutePaths<Paths>]
// 	>;
// 	if (POLLY_ROUTES) {
// 		///
// 		// Read file
// 		//
// 		const filepath = fileURLToPath(POLLY_ROUTES);
// 		let file: string | undefined;
// 		try {
// 			file = readFileSync(filepath, "utf-8");
// 			resolved = destr(file);
// 		} catch (error) {
// 			console.error(
// 				`Polly failed to parse POLLY_ROUTES: ${inspect(
// 					{
// 						filepath,
// 						file,
// 						resolved,
// 					},
// 					{ depth: null },
// 				)}\n`,
// 			);
// 			console.error(
// 				inspect(
// 					{
// 						error: serializeError(error),
// 					},
// 					{ depth: null },
// 				),
// 			);

// 			deferExit();

// 			throw new VError(
// 				deserializeError(error),
// 				"Polly failed to parse POLLY_ROUTES",
// 			);
// 		}

// 		///
// 		// Validate with RoutePathsZod
// 		//
// 		const result = RoutePathsZod.safeParse(resolved);
// 		if (!result.success) {
// 			console.error(`Filename: ${POLLY_ROUTES} \n`);
// 			console.error("Raw: \n");
// 			console.error(inspect(file, { depth: null }));
// 			console.error("\n Parsed:\n");
// 			console.error(inspect(resolved, { depth: null }));
// 			console.error(
// 				`\n RoutePathsZod failed validation: ${inspect(result.error.flatten(), { depth: null })}\n`,
// 			);
// 			deferExit();
// 			throw new VError(
// 				deserializeError(result.error),
// 				"RoutePathsZod failed to validate routes",
// 			);
// 		}
// 	}
// 	///
// 	// Caddyfile transform
// 	//
// 	if (POLLY_CADDYFILE) {
// 		console.info(`Polly: Appending Caddyfile to ${POLLY_CADDYFILE}\n`);
// 		const caddy = Object.entries(resolved)
// 			.map(([path, route]) => {
// 				let routeObject =
// 					route as PollyRoutePaths<Paths>[keyof PollyRoutePaths<Paths>];
// 				return CaddyfileReverseProxy(path, routeObject);
// 			})
// 			.join("\n");
// 		console.info(`Caddyfile:\n${caddy}\n`);
// 		appendFileSync(POLLY_CADDYFILE, caddy);
// 	}

// 	return Object.entries(resolved).reduce(
// 		(acc, [path, route]) => {
// 			let routeObject =
// 				route as PollyRoutePaths<Paths>[keyof PollyRoutePaths<Paths>];
// 			acc[path as Paths] = {
// 				url: () =>
// 					[
// 						`${routeObject.protocol}://${routeObject.hostname}`,
// 						routeObject.port ? `:${routeObject.port}` : "",
// 					].join(""),
// 				// @ts-ignore
// 				["~protocol"]: routeObject.protocol,
// 				["~hostname"]: routeObject.hostname,
// 				["~port"]: routeObject.port,
// 			} satisfies PollyMap;
// 			return acc;
// 		},
// 		{} as PollyTopology<Paths>,
// 	);
// }

// export const Polly = {
// 	routes: PollyRoutes,
// } as const;
// export const a = Polly;

// export * from "../PollyEnvironment.mjs";
// export * from "./routes/RouteResource.mjs";
// export * from "./transform/caddy/Caddyfile.mjs";
// export * from "../transform/Envsubst.mjs";
