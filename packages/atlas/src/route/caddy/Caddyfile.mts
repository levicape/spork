import type { Route } from "../RouteResource.mjs";

export const indent = (str: string) => str.replace(/^/gm, "\t");

export const CADDYFILE_LOCAL_CERTIFICATES = "local_certs";

export const CaddyfileLocalBlock = () => {
	return (configuration: string) => `{\n${indent(configuration)}\n}`;
};

export const CaddyfileLocation = (domain?: string) => {
	if (
		domain?.trim().length === 0 ||
		domain === "undefined" ||
		domain === null ||
		domain === undefined
	) {
		return (configuration: string) => `${configuration}`;
	}
	return (configuration: string) => {
		let indented = indent(configuration ?? "");
		if (!indented.endsWith("\n")) {
			indented += "\n";
		}
		return `${domain} {\n${indented}}\n`;
	};
};

export const CaddyfileReverseProxy = (path: string, route: Route) => {
	if (route.hostname.trim() === "" || route.hostname === "undefined") {
		return `## HOSTNAME_ERROR: reverse_proxy ${path} ${JSON.stringify(route)}`;
	}
	const pathstar = path.endsWith("/") ? `${path}*` : `${path}/*`;
	return `reverse_proxy ${
		path === "/" ? "" : pathstar
	} ${route.hostname}${route.port ? `:${route.port}` : ""}`;
};
