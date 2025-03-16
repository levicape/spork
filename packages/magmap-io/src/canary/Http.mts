import { Canary, PromiseActivity } from "@levicape/paloma";
import { LoggingContext } from "@levicape/paloma/runtime/server/RuntimeContext";
import { withStructuredLogging } from "@levicape/paloma/runtime/server/loglayer/LoggingContext";
import { Context, Effect } from "effect";
import { hc } from "hono/client";
import { HTTP_BASE_PATH, MagmapRoutemap } from "../http/Atlas.mjs";
import type { MagmapHonoApp } from "../http/HonoApp.mjs";

const client = hc<MagmapHonoApp>(MagmapRoutemap[HTTP_BASE_PATH].url());
// @ts-ignore
const { trace } = await Effect.runPromise(
	// @ts-ignore
	Effect.provide(
		// @ts-ignore
		Effect.gen(function* () {
			const logging = yield* LoggingContext;
			return {
				trace: (yield* logging.logger).withPrefix("canary").withContext({
					$event: "main",
				}),
			};
		}),
		// @ts-ignore
		Context.empty().pipe(withStructuredLogging({ prefix: "Canary" })),
	),
);

export const healthcheck = new Canary(
	"http-healthcheck",
	{},
	new PromiseActivity(
		{
			events: {
				enter: async () => {
					const now = Date.now();
					trace
						.withMetadata({
							PromiseActivity: {
								now,
							},
						})
						.info("enter");
					return {
						now,
					};
				},
				exit: async ({ events }) => {
					trace
						.withMetadata({
							PromiseActivity: {
								now: events?.enter,
							},
						})
						.info("exit");
				},
			},
		},
		async ({ events }) => {
			trace.warn("Hello world");
			trace.metadataOnly([
				events,
				{ a: 1, b: "Y" },
				client["~"].Spork.Magmap.atlas.$url({}),
				{ a: "Z", b: 2 },
			]);
			{
				const response = await client["!"].v1.Service.liveness.$get({
					query: "sesame",
				});
				const json = await response.json();
				trace.withMetadata({ json }).info("Fetched");
			}

			{
				const response = await client["!"].v1.Service.liveness.$get({
					query: "spaghetti" as "sesame",
				});
				const json = await response.json();
				trace.withMetadata({ json }).info("Fetched");
			}
		},
	),
);

export const handler = healthcheck;
