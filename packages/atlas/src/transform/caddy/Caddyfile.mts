import type { Route, RouteResource } from "../../Atlas.mjs";

export const CaddyfileReverseProxy = (
	path: string,
	route: Route<RouteResource>,
) => {
	const pathstar = path.endsWith("/") ? `${path}*` : `${path}/*`;
	return `reverse_proxy ${
		path === "/" ? "" : pathstar
	} ${route.hostname}${route.port ? `:${route.port}` : ""}`;
};
