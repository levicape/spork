import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { destr } from "destr";
import { deserializeError, serializeError } from "serialize-error";
import { env, process } from "std-env";
import VError from "verror";
import { AtlasEnvironmentZod } from "../AtlasEnvironment.mjs";
import { type Prefix, type Route, RoutePathsZod } from "./RouteResource.mjs";
import { CaddyfileReverseProxy } from "./caddy/Caddyfile.mjs";

/**
 * Internal data structure for each Topology entry
 */
export type AtlasPrototype = {
	["~protocol"]?: string;
	["~hostname"]: string;
	["~port"]?: number;
};

/**
 * Maps a Topology entry to a Route
 */
export type AtlasRoutePaths<Paths extends Prefix = Prefix> = Record<
	Paths,
	Route
>;

/**
 * Client API that each Topology entry implements
 */
export interface AtlasMap {
	/**
	 * @returns Computed hostname of Topology instance
	 */
	url: () => string;
	/**
	 * @returns Cloudmap instance url, if available. Falls back to url()
	 */
	instance: () => string;
}

export type AtlasTopology<Paths extends Prefix> = Record<Paths, AtlasMap>;
export type AtlasConfiguration<Paths extends Prefix> = {
	Routes: AtlasRoutePaths<Paths>;
};

function deferExit() {
	const { AWS_LAMBDA_FUNCTION_NAME } = env;
	if (
		AWS_LAMBDA_FUNCTION_NAME !== undefined &&
		AWS_LAMBDA_FUNCTION_NAME.length > 0
	) {
		setTimeout(() => {
			process.exit?.(1);
		}, 500);
	}
}

/**
 * AtlasRoutes is a function that takes an map of routes and returns a topology of routes.
 * It will also replace the routes with the ones in the ATLAS_ROUTES env var if it is set, allowing for Service Discovery.
 * @param routes - The map of routes to use.
 * @returns A topology of routes.
 *
 * @see {@link AtlasEnvironment}
 */
export function AtlasRoutes<Paths extends Prefix>(
	routes: AtlasRoutePaths<Paths>,
): AtlasTopology<Paths> {
	///
	// Parse environment
	//
	const parsedEnv = AtlasEnvironmentZod.safeParse(env);
	const { ATLAS_ROUTES, ATLAS_CADDYFILE } = parsedEnv.data ?? {};
	if (!parsedEnv.success) {
		console.error(
			`AtlasEnvZod failed to parse env: ${inspect(parsedEnv.error.flatten(), { depth: null })}\n`,
		);

		deferExit();
		throw new VError(
			deserializeError(parsedEnv.error),
			"AtlasEnvZod failed to parse env",
		);
	}
	///
	// Resolve ATLAS_ROUTES
	//
	let resolved = routes as Record<
		Paths,
		AtlasRoutePaths<Paths>[keyof AtlasRoutePaths<Paths>]
	>;
	if (ATLAS_ROUTES) {
		///
		// Read file
		//
		const filepath = fileURLToPath(ATLAS_ROUTES);
		let file: string | undefined;
		try {
			file = readFileSync(filepath, "utf-8");
			resolved = destr(file);
		} catch (error) {
			console.error(
				`Atlas failed to parse ATLAS_ROUTES: ${inspect(
					{
						filepath,
						file,
						resolved,
					},
					{ depth: null },
				)}\n`,
			);
			console.error(
				inspect(
					{
						error: serializeError(error),
					},
					{ depth: null },
				),
			);

			deferExit();

			throw new VError(
				deserializeError(error),
				"Atlas failed to parse ATLAS_ROUTES",
			);
		}

		///
		// Validate with RoutePathsZod
		//
		const result = RoutePathsZod.safeParse(resolved);
		if (!result.success) {
			console.error(`Filename: ${ATLAS_ROUTES} \n`);
			console.error("Raw: \n");
			console.error(inspect(file, { depth: null }));
			console.error("\n Parsed:\n");
			console.error(inspect(resolved, { depth: null }));
			console.error(
				`\n RoutePathsZod failed validation: ${inspect(result.error.flatten(), { depth: null })}\n`,
			);
			deferExit();
			throw new VError(
				deserializeError(result.error),
				"RoutePathsZod failed to validate routes",
			);
		}
	}
	///
	// Caddyfile transform
	//
	if (ATLAS_CADDYFILE) {
		console.info(`Atlas: Appending Caddyfile to ${ATLAS_CADDYFILE}\n`);
		const caddy = Object.entries(resolved)
			.map(([path, route]) => {
				let routeObject =
					route as AtlasRoutePaths<Paths>[keyof AtlasRoutePaths<Paths>];
				return CaddyfileReverseProxy(path, routeObject);
			})
			.join("\n");
		console.info(`Caddyfile:\n${caddy}\n`);
		appendFileSync(ATLAS_CADDYFILE, caddy);
	}

	return Object.entries(resolved).reduce(
		(acc, [path, route]) => {
			let routeObject =
				route as AtlasRoutePaths<Paths>[keyof AtlasRoutePaths<Paths>];
			acc[path as Paths] = {
				url: () =>
					[
						`${routeObject.protocol}://${routeObject.hostname}`,
						routeObject.port ? `:${routeObject.port}` : "",
					].join(""),
				// @ts-ignore
				["~protocol"]: routeObject.protocol,
				["~hostname"]: routeObject.hostname,
				["~port"]: routeObject.port,
			} satisfies AtlasMap;
			return acc;
		},
		{} as AtlasTopology<Paths>,
	);
}

export * from "./RouteResource.mjs";
export * from "./caddy/Caddyfile.mjs";
