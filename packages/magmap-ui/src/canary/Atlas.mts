#!/usr/bin/env -S node --no-warnings --watch

import { Atlas } from "@levicape/spork-atlas";
import { env } from "std-env";

const { MAGMAP_UI } = env;

// Import from -io?
export const MagmapRoutemap = Atlas.routes({
	"/": {
		$kind: "StaticRouteResource",
		hostname: `ui:${MAGMAP_UI}`,
		protocol: "http",
	},
});
