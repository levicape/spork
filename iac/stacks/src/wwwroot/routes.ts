import type { RoutePaths, RouteResource } from "../RouteMap";

export class WWWRootRoutes {
	static readonly REQUIRED_ROUTES = ["/~/v1/Spork/Http"] as const;

	static readonly ADMIN_ROUTES = ["/!/v1/Spork/Http"] as const;
}

export type WWWRootRoute = (typeof WWWRootRoutes.REQUIRED_ROUTES)[number];
export type WWWRootRouteMap<Resource extends RouteResource> = RoutePaths<
	WWWRootRoute,
	Resource
>;
