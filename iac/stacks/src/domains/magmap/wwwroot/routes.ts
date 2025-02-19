import type { RoutePaths, RouteResource } from "../../../RouteMap";

export class MapgmapWWWRootRoutes {
	static readonly REQUIRED_ROUTES = ["/~/v1/Spork/Magmap"] as const;
}

export type MapgmapWWWRootRoute =
	(typeof MapgmapWWWRootRoutes.REQUIRED_ROUTES)[number];
export type MapgmapWWWRootRouteMap<Resource extends RouteResource> = RoutePaths<
	MapgmapWWWRootRoute,
	Resource
>;
