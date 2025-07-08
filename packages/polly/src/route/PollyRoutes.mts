import { writeFileSync } from "node:fs";
import { destr } from "destr";
import { deserializeError, serializeError } from "serialize-error";
import { env, isNode, process } from "std-env";
import VError from "verror";
import { PollyEnvironmentZod } from "../PollyEnvironment.mjs";
import { fileURLToPath } from "../transform/FileUrlToPath.mjs";
import { type Prefix, type Route, RoutePathsZod } from "./RouteResource.mjs";
import {
	CADDYFILE_LOCAL_CERTIFICATES,
	CaddyfileLocalBlock,
	CaddyfileLocation,
	CaddyfileReverseProxy,
} from "./caddy/Caddyfile.mjs";

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
export type PollyRoutePrototype = {
	["~protocol"]?: string;
	["~hostname"]: string;
	["~port"]?: number;
};

/**
 * Maps a Topology entry to a Route
 */
export type PollyRoutePaths<Paths extends Prefix = Prefix> = Record<
	Paths,
	Route
>;
/**
 * Options for Topology url()
 */
export interface PollyMapUrlProps {
	/*
	 * Whether to render undefined or empty hostnames as empty strings
	 * @defaultValue `true`
	 */
	coalesce?: boolean;
}

/**
 * Options for Topology instance()
 */
export interface PollyMapInstanceProps extends PollyMapUrlProps {
	/*
	 * Throw error if not available
	 * @defaultValue `false`
	 */
	strict?: boolean;
}

/**
 * Client API that each Topology entry implements
 */
export interface PollyMap {
	/**
	 * @returns Computed hostname of Topology instance
	 */
	url: (props?: PollyMapUrlProps) => string;
	/**
	 * @returns Cloudmap instance url, if available. Falls back to url()
	 */
	instance: (props?: PollyMapInstanceProps) => string;
}

export type PollyTopology<Paths extends Prefix> = Record<Paths, PollyMap>;
export type PollyConfiguration<Paths extends Prefix> = {
	Routes: PollyRoutePaths<Paths>;
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
 * PollyRoutes is a function that takes an map of routes and returns a topology of routes.
 * It also supports Service Discovery by dynamically loading the `PollyTopology` from a file
 * specified with the `POLLY_ROUTES` environment variable.
 *
 * @env `POLLY_ROUTES` - The path to a JSON file containing an `PollyTopology` object to replace at runtime.
 * @param routes - The map of routes to use.
 * @returns A topology of routes.
 *
 * @see {@link PollyEnvironment}
 */
export function PollyRoutes<Paths extends Prefix>(
	routes: PollyRoutePaths<Paths>,
): PollyTopology<Paths> {
	///
	// Parse environment
	//
	const parsedEnv = PollyEnvironmentZod.safeParse(env);
	const {
		POLLY_ROUTES,
		POLLY_CADDYFILE,
		POLLY_CADDYFILE_DOMAIN,
		POLLY_CADDYFILE_REPLACE,
	} = parsedEnv.data ?? {};
	if (!parsedEnv.success) {
		console.error(
			`PollyEnvZod failed to parse env: ${JSON.stringify(parsedEnv.error.flatten())}\n`,
		);

		deferExit();
		throw new VError(
			deserializeError(parsedEnv.error),
			"PollyEnvZod failed to parse env",
		);
	}
	///
	// Resolve POLLY_ROUTES
	//
	let resolved = routes as Record<
		Paths,
		PollyRoutePaths<Paths>[keyof PollyRoutePaths<Paths>]
	>;
	if (POLLY_ROUTES) {
		///
		// Read file
		//
		const filepath = fileURLToPath(POLLY_ROUTES, "/");
		let file: string | undefined;
		try {
			file = readFileSync(filepath, "utf-8");
			resolved = destr(file);
		} catch (error) {
			console.error(
				`Polly failed to parse POLLY_ROUTES: ${JSON.stringify({
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
				"Polly failed to parse POLLY_ROUTES",
			);
		}

		///
		// Validate with RoutePathsZod
		//
		const result = RoutePathsZod.safeParse(resolved);
		if (!result.success) {
			console.error(`Filename: ${POLLY_ROUTES} \n`);
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
	} else {
		console.info(
			`Polly: No POLLY_ROUTES specified. Using routes from PollyRoutes()`,
		);
	}
	///
	// Caddyfile transform
	//
	if (POLLY_CADDYFILE) {
		console.info(`Polly: Appending Caddyfile to ${POLLY_CADDYFILE}\n`);
		const local = CaddyfileLocalBlock();
		const location = CaddyfileLocation(POLLY_CADDYFILE_DOMAIN);
		const proxies = Object.entries(resolved)
			.map(([path, route]) => {
				let routeObject =
					route as PollyRoutePaths<Paths>[keyof PollyRoutePaths<Paths>];

				return CaddyfileReverseProxy(path, routeObject);
			})
			.map((line) => {
				return line.endsWith("\n") ? line : `${line}\n`;
			})
			.join("");

		if (POLLY_CADDYFILE_REPLACE) {
			const caddyfile = `${local([CADDYFILE_LOCAL_CERTIFICATES].join("\n"))}\n${location(proxies)}\n`;
			console.info(`Caddyfile:\n${caddyfile}`);
			writeFileSync(
				POLLY_CADDYFILE,
				caddyfile.endsWith("\n") ? caddyfile : `${caddyfile}\n`,
			);
		} else {
			const caddyfile = `${location(proxies)}\n`;
			console.info(`Caddyfile:\n${caddyfile}`);
			appendFileSync(
				POLLY_CADDYFILE,
				caddyfile.endsWith("\n") ? caddyfile : `${caddyfile}\n`,
			);
		}
	} else {
		console.info(
			`Polly: No Caddyfile specified. Skipping Caddyfile generation. To enable this feature, set the \`POLLY_CADDYFILE\` environment variable to a valid, writable filepath\n`,
		);
	}

	return Object.entries(resolved).reduce(
		(acc, [path, route]) => {
			let routeObject =
				route as PollyRoutePaths<Paths>[keyof PollyRoutePaths<Paths>];

			const url = (props?: PollyMapUrlProps) => {
				const { coalesce } = {
					...({ coalesce: true } as PollyMapUrlProps),
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
						...({ strict: false } as PollyMapInstanceProps),
						...(props ?? {}),
					};
					if (strict) {
						if (routeObject.$kind !== "LambdaRouteResource") {
							throw new VError(
								`PollyMap: instance() called with strict=true and $kind=${routeObject.$kind}`,
							);
						}
						if (!routeObject.cloudmap) {
							throw new VError(
								`PollyMap: instance() called with strict=true and cloudmap is not set`,
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
			} satisfies PollyMap;
			return acc;
		},
		{} as PollyTopology<Paths>,
	);
}
