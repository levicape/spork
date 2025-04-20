#!/usr/bin/env -S node --no-warnings --watch

import { a } from "@levicape/spork-atlas";
import { env } from "std-env";

const { MAGMAP_HTTP_HOST, MAGMAP_UI_HOST } = env;

export const HTTP_BASE_PATH = "/~/Spork/Magmap";
export const MagmapRoutemap = a.routes({
	"/": {
		$kind: "StaticRouteResource",
		hostname: `${MAGMAP_UI_HOST}`,
		protocol: "http",
	},
	[HTTP_BASE_PATH]: {
		$kind: "StaticRouteResource",
		hostname: `${MAGMAP_HTTP_HOST}`,
		protocol: "http",
	},
});
