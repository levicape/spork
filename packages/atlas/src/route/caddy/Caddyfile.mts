import type { Route } from "../RouteResource.mjs";

export const indent = (str: string) => str.replace(/^/gm, "\t");

export const CADDYFILE_LOCAL_CERTIFICATES = "local_certs";

export const CaddyfileLocalBlock = () => {
	return (configuration: string) => `{\n${indent(configuration)}\n}\n`;
};

export const CaddyfileLocation = (domain?: string) => {
	const empty = (s?: string) =>
		(s ?? "")
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.trim().length > 0)
			.filter((line) => !line.startsWith("#"))
			.join("")
			.trim().length === 0;

	const coalesce = (s: string) => {
		if (empty(s)) {
			return "";
		}
		return s;
	};
	if (
		domain?.trim().length === 0 ||
		domain === "undefined" ||
		domain === null ||
		domain === undefined
	) {
		return (configuration: string) => coalesce(`${configuration}`);
	}

	return (configuration: string) => {
		let indented = indent(configuration ?? "");
		if (!indented.endsWith("\n")) {
			indented += "\n";
		}
		return empty(configuration)
			? `## DOMAIN: ${domain} \n#${indent(configuration)
					.split("\n")
					.map((c) => `#${c}`)
					.join("\n")}\n`
			: `${domain} {\n${indented}}\n`;
	};
};

export const CaddyfileReverseProxy = (path: string, route: Route) => {
	if (route.hostname.trim() === "" || route.hostname === "undefined") {
		return `## HOSTNAME: reverse_proxy ${path} ${JSON.stringify(route)}`;
	}
	const pathstar = path.endsWith("/") ? `${path}*` : `${path}/*`;
	return `reverse_proxy ${
		path === "/" ? "" : pathstar
	} ${route.hostname}${route.port ? `:${route.port}` : ""}`;
};
