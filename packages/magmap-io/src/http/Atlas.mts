#!/usr/bin/env -S node --no-warnings --watch

import { a } from "@levicape/spork-atlas";
import { env } from "std-env";

const { MAGMAP_HTTP, MAGMAP_UI } = env;

export const HTTP_BASE_PATH = "/~/Spork/Magmap";
export const MagmapRoutemap = a.routes({
	"/": {
		$kind: "StaticRouteResource",
		hostname: `ui:${MAGMAP_UI}`,
		protocol: "http",
	},
	[HTTP_BASE_PATH]: {
		$kind: "StaticRouteResource",
		hostname: `http:${MAGMAP_HTTP}`,
		protocol: "http",
	},
});
