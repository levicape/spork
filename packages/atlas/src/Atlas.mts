import { appendFileSync, readFileSync } from "node:fs";
import { inspect } from "node:util";
import { deserializeError } from "serialize-error";
import { env, process } from "std-env";
import VError from "verror";
import { AtlasEnvironmentZod } from "./AtlasEnvironment.mjs";
import {
	type AtlasRouteMap,
	AtlasRouteMapZod,
	type Prefix,
} from "./routes/AtlasRoutes.mjs";
import { CaddyfileReverseProxy } from "./transform/caddy/Caddyfile.mjs";

/**
 * Internal data structure for each Topology entry
 */
export type AtlasPrototype = {
	["~protocol"]?: string;
	["~hostname"]: string;
	["~port"]?: number;
};

/**
 * Client API that each Topology entry implements
 */
export interface AtlasMap {
	url: () => string;
	//subscribe: () => EventEmitter;
}

export type AtlasTopology<Paths extends Prefix> = Record<Paths, AtlasMap>;
export type AtlasConfiguration<Paths extends Prefix> = {
	Routes: AtlasRouteMap<Paths>[keyof AtlasRouteMap<Paths>];
};

/**
 * Atlas is a function that takes an map of routes and returns a topology of routes.
 * It will also replace the routes with the ones in the ATLAS_ROUTES env var if it is set, allowing for Service Discovery.
 * @param routes - The map of routes to use.
 * @returns A topology of routes.
 *
 * @see {@link AtlasEnvironment}
 */
export function Atlas<Paths extends Prefix>(
	routes: AtlasRouteMap<Paths>[keyof AtlasRouteMap<Paths>],
): AtlasTopology<Paths> {
	const parsedEnv = AtlasEnvironmentZod.safeParse(env);
	const { ATLAS_ROUTES, ATLAS_CADDYFILE } = parsedEnv.data ?? {};
	if (!parsedEnv.success) {
		process.stderr?.write(
			`AtlasEnvZod failed to parse env: ${JSON.stringify(parsedEnv.error.flatten())}\n`,
		);

		throw new VError(
			deserializeError(parsedEnv.error),
			"AtlasEnvZod failed to parse env",
		);
	}
	let resolved = routes;
	if (ATLAS_ROUTES) {
		const file = readFileSync(ATLAS_ROUTES, "utf-8");
		resolved = JSON.parse(file);
		const result = AtlasRouteMapZod.safeParse(resolved);
		if (!result.success) {
			process.stderr?.write(`Filename: ${ATLAS_ROUTES} \n`);
			process.stderr?.write("Raw: \n");
			process.stderr?.write(inspect(file, { depth: null }));
			process.stderr?.write("\n Parsed:\n");
			process.stderr?.write(inspect(resolved, { depth: null }));
			process.stderr?.write(
				`\n AtlasRouteMapZod failed to parse routes: ${JSON.stringify(result.error.flatten())}\n`,
			);
			throw new VError(
				deserializeError(result.error),
				"AtlasRouteMapZod failed to parse routes",
			);
		}
	}

	// Caddyfile transform
	if (ATLAS_CADDYFILE) {
		process.stdout?.write(`Atlas: Appending Caddyfile to ${ATLAS_CADDYFILE}\n`);
		const caddy = Object.entries(resolved)
			.map(([path, route]) => {
				return CaddyfileReverseProxy(path, route);
			})
			.join("\n");
		process.stdout?.write(`Caddyfile:\n${caddy}\n`);
		appendFileSync(ATLAS_CADDYFILE, caddy);
	}

	return Object.entries(routes).reduce(
		(acc, [path, route]) => {
			acc[path as Paths] = {
				url: () =>
					[
						`${route.protocol}://${route.hostname}`,
						route.port ? `:${route.port}` : "",
					].join(""),
				// @ts-ignore
				["~protocol"]: route.protocol,
				["~hostname"]: route.hostname,
				["~port"]: route.port,
			} satisfies AtlasMap;
			return acc;
		},
		{} as AtlasTopology<Paths>,
	);
}
export const a = Atlas;

export * from "./AtlasEnvironment.mjs";
export * from "./routes/AtlasRoutes.mjs";
export * from "./transform/caddy/Caddyfile.mjs";
