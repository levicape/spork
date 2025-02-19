#!/usr/bin/env -S node --no-warnings --watch

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { PinoTransport } from "@loglayer/transport-pino";
import dotenv from "dotenv";
import { LogLayer } from "loglayer";
import { pino } from "pino";
import pretty from "pino-pretty";
import { serializeError } from "serialize-error";
import { env } from "std-env";

const { CI = "", LOG_LEVEL = "5" } = env;

const log = new LogLayer({
	transport: new PinoTransport({
		logger: pino(
			{
				level: CI !== "" || Number(LOG_LEVEL) < 5 ? "debug" : "info",
			},
			pretty(),
		),
	}),
	errorSerializer: serializeError,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(join(__filename, ".."));
log.withMetadata({ __filename, __dirname }).debug("import.meta");

const envpath = resolve(join(__dirname, ".env"));
const envcontents = readFileSync(envpath);
log
	.withContext({ envpath })
	.withMetadata({ envcontents })
	.debug("loaded env file");

const {
	ROOT_NS, // "spork"
	HTTP_NS,
	MAGMAP_NS,
	MAGMAP_HTTP,
	MAGMAP_UI,
	SPORK_NS,
	SPORK_HTTP,
} = dotenv.parse(envcontents);

log
	.withMetadata({
		ROOT_NS,
		HTTP_NS,
		MAGMAP_NS,
		MAGMAP_UI,
		MAGMAP_HTTP,
		SPORK_NS,
		SPORK_HTTP,
	})
	.info("parsed env");

class Routemap {
	routes;
	constructor(routes) {
		this.routes = routes;
	}
}

const routemap = new Routemap({
	"/": {
		$kind: "ComposeRouteResource",
		url: `ui:${MAGMAP_UI}`,
		protocol: "http",
	},
	"/~/v1/Spork/Magmap": {
		$kind: "ComposeRouteResource",
		url: `magmap-http:${MAGMAP_HTTP}`,
		protocol: "http",
	},
	"/~/v1/Spork": {
		$kind: "LambdaRouteResource",
		url: `spork-server:${SPORK_HTTP}`,
		protocol: "http",
		lambda: {
			arn: "arn:aws:lambda:::function:spork-magmap",
			name: "spork-magmap-http-current-function-12345",
			qualifier: "aliasname",
		},
		cloudmap: {
			namespace: {
				name: "spork-datalayer-current-ps-52-0d",
			},
			service: {
				name: "spork-magmap-http-current-see-on-8",
			},
			instance: {
				id: "spork-magmap-http-current-instance",
				attributes: {
					AWS_INSTANCE_CNAME: "https://wya.lambda-url.us-west-2.on.aws/",
					CI_ENVIRONMENT: "current",
					CONTEXT_PREFIX: "spork-magmap-http-current",
					PACKAGE_NAME: "@levicape/spork-mapgmap-io",
					STACKREF_ROOT: "spork",
					STACK_NAME: "spork-magmap-http.current",
				},
			},
		},
	},
});
log.info(inspect(routemap));
