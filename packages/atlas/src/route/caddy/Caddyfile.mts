import type { Route } from "../RouteResource.mjs";

export const CaddyfileReverseProxy = (path: string, route: Route) => {
	if (route.hostname.trim() === "" || route.hostname === "undefined") {
		return `## HOSTNAME_ERROR: reverse_proxy ${path} ${JSON.stringify(route)}`;
	}
	const pathstar = path.endsWith("/") ? `${path}*` : `${path}/*`;
	return `reverse_proxy ${
		path === "/" ? "" : pathstar
	} ${route.hostname}${route.port ? `:${route.port}` : ""}`;
};
