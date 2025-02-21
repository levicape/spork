#!/usr/bin/env -S node --no-warnings --watch

import { Atlas } from "@levicape/spork-atlas";

const { MAGMAP_HTTP, MAGMAP_UI } = process.env;

// Import from -io?
export const MagmapRoutemap = Atlas({
	"/": {
		$kind: "ComposeRouteResource",
		hostname: `ui:${MAGMAP_UI}`,
		protocol: "http",
	},
	"/~/v1/Spork/Magmap": {
		$kind: "ComposeRouteResource",
		hostname: `http:${MAGMAP_HTTP}`,
		protocol: "http",
	},
});
