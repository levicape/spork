import type { Route } from "../AtlasRoutes.mjs";

export const CaddyfileReverseProxy = (path: string, route: Route) => {
	const pathstar = path.endsWith("/") ? `${path}*` : `${path}/*`;
	return `reverse_proxy ${
		path === "/" ? "" : pathstar
	} ${route.hostname}${route.port ? `:${route.port}` : ""}`;
};
