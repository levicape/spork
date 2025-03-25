import type { RoutePaths, RouteResource } from "../RouteMap";

export class SporkWWWRootRoutes {
	static readonly REQUIRED_ROUTES = ["/~/Spork/Http"] as const;
}

export type SporkWWWRootRoute =
	(typeof SporkWWWRootRoutes.REQUIRED_ROUTES)[number];
export type SporkWWWRootRouteMap<Resource extends RouteResource> = RoutePaths<
	SporkWWWRootRoute,
	Resource
>;
