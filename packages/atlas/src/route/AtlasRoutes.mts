import { destr } from "destr";
import { deserializeError, serializeError } from "serialize-error";
import { env, isNode, process } from "std-env";
import VError from "verror";
import { AtlasEnvironmentZod } from "../AtlasEnvironment.mjs";
import { fileURLToPath } from "../transform/FileUrlToPath.mjs";
import { type Prefix, type Route, RoutePathsZod } from "./RouteResource.mjs";
import { CaddyfileReverseProxy } from "./caddy/Caddyfile.mjs";

let readFileSync: (path: string, mode: string) => string;
let appendFileSync: (path: string, data: string) => void;
if (isNode) {
	const { readFileSync: _readFileSync, appendFileSync: _appendFileSync } =
		await import("node:fs");
	// @ts-ignore
	readFileSync = _readFileSync;
	appendFileSync = _appendFileSync;
}

/**
 * Internal data structure for each Topology entry
 */
export type AtlasRoutePrototype = {
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
 * Options for Topology url()
 */
export interface AtlasMapUrlProps {
	/*
	 * Whether to render undefined or empty hostnames as empty strings
	 * @defaultValue `true`
	 */
	coalesce?: boolean;
}

/**
 * Options for Topology instance()
 */
export interface AtlasMapInstanceProps extends AtlasMapUrlProps {
	/*
	 * Throw error if not available
	 * @defaultValue `false`
	 */
	strict?: boolean;
}

/**
 * Client API that each Topology entry implements
 */
export interface AtlasMap {
	/**
	 * @returns Computed hostname of Topology instance
	 */
	url: (props?: AtlasMapUrlProps) => string;
	/**
	 * @returns Cloudmap instance url, if available. Falls back to url()
	 */
	instance: (props?: AtlasMapInstanceProps) => string;
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
 * It also supports Service Discovery by dynamically loading the `AtlasTopology` from a file
 * specified with the `ATLAS_ROUTES` environment variable.
 *
 * @env `ATLAS_ROUTES` - The path to a JSON file containing an `AtlasTopology` object to replace at runtime.
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
			`AtlasEnvZod failed to parse env: ${JSON.stringify(parsedEnv.error.flatten())}\n`,
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
		const filepath = fileURLToPath(ATLAS_ROUTES, "/");
		let file: string | undefined;
		try {
			file = readFileSync(filepath, "utf-8");
			resolved = destr(file);
		} catch (error) {
			console.error(
				`Atlas failed to parse ATLAS_ROUTES: ${JSON.stringify({
					filepath,
					file,
					resolved,
				})}\n`,
			);
			console.error(
				JSON.stringify({
					error: serializeError(error),
				}),
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
			console.error(JSON.stringify(file));
			console.error("\n Parsed:\n");
			console.error(JSON.stringify(resolved));
			console.error(
				`\n RoutePathsZod failed validation: ${JSON.stringify(result.error.flatten())}\n`,
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
			.map((line) => {
				return line.endsWith("\n") ? line : `${line}\n`;
			})
			.join("");
		console.info(`Caddyfile:\n${caddy}\n`);
		appendFileSync(ATLAS_CADDYFILE, caddy);
	}

	return Object.entries(resolved).reduce(
		(acc, [path, route]) => {
			let routeObject =
				route as AtlasRoutePaths<Paths>[keyof AtlasRoutePaths<Paths>];

			const url = (props?: AtlasMapUrlProps) => {
				const { coalesce } = {
					...({ coalesce: true } as AtlasMapUrlProps),
					...(props ?? {}),
				};

				if (coalesce) {
					if (
						routeObject.hostname === undefined ||
						routeObject.hostname === "undefined" ||
						routeObject.hostname.trim() === ""
					) {
						return "";
					}
				}
				return [
					`${routeObject.protocol}://${routeObject.hostname}`,
					routeObject.port ? `:${routeObject.port}` : "",
				].join("");
			};
			acc[path as Paths] = {
				url,
				instance: (props) => {
					const { strict, ...urlProps } = {
						...({ strict: false } as AtlasMapInstanceProps),
						...(props ?? {}),
					};
					if (strict) {
						if (routeObject.$kind !== "LambdaRouteResource") {
							throw new VError(
								`AtlasMap: instance() called with strict=true and $kind=${routeObject.$kind}`,
							);
						}
						if (!routeObject.cloudmap) {
							throw new VError(
								`AtlasMap: instance() called with strict=true and cloudmap is not set`,
							);
						}
					}

					if (routeObject.$kind === "LambdaRouteResource") {
						if (routeObject.cloudmap) {
							const { namespace, service, instance } = routeObject.cloudmap;
							if (namespace && service && instance) {
								/*

									The general format for the DNS hostname to reach a specific instance is:
									<instance-id>.<service-name>.<namespace-name>.<region>.aws
									For example, if the namespace is "my-namespace", the service is "my-service",
									and the instance ID is "my-instance", the URL would be:
									my-instance.my-service.my-namespace.us-east-1.aws
								*/
								const { id } = instance;
								const { name } = service;
								const { name: namespaceName } = namespace;

								const region = env.AWS_REGION ?? "us-east-1";
								return `https://${id}.${name}.${namespaceName}.${region}.aws`;
							}
						}
					}
					return url(urlProps);
				},
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
