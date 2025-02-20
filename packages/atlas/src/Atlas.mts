import type { AtlasRouteMap, Prefix } from "./routes/AtlasRoutes.mjs";

export type AtlasPrototype = {
	["~protocol"]?: string;
	["~hostname"]: string;
	["~port"]?: number;
};
export interface AtlasMap {
	url: () => string;
}

export type AtlasTopology<Paths extends Prefix> = Record<Paths, AtlasMap>;
export type AtlasConfiguration<Paths extends Prefix> = {
	Routes: AtlasRouteMap<Paths>[keyof AtlasRouteMap<Paths>];
};
export function Atlas<Paths extends Prefix>(
	routes: AtlasRouteMap<Paths>[keyof AtlasRouteMap<Paths>],
): AtlasTopology<Paths> {
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

export * from "./routes/AtlasRoutes.mjs";
