import { PinoTransport } from "@loglayer/transport-pino";
import { Context, Effect, pipe } from "effect";
import { LogLayer } from "loglayer";
import { pino } from "pino";
import pretty from "pino-pretty";
import { serializeError } from "serialize-error";
import { SporkLoggingConfig } from "./LoggingConfig.mjs";
import { LoggingContext, LogstreamPassthrough } from "./LoggingContext.mjs";
import {
	$$_spanId_$$,
	$$_traceId_$$,
	LoggingPlugins,
} from "./LoggingPlugins.mjs";

const rootloglayer = pipe(
	SporkLoggingConfig,
	Effect.flatMap(({ LOG_LEVEL }) =>
		Effect.sync(() => {
			const rootId = $$_traceId_$$();
			return new LogLayer({
				transport: new PinoTransport({
					logger: pino(
						{
							level: LOG_LEVEL >= 3 ? "info" : "debug",
						},
						pretty({
							errorLikeObjectKeys: ["err", "error", "$error"],
						}),
					),
				}),
				errorSerializer: serializeError,
				plugins: LoggingPlugins,
			}).withContext({
				_$span: "root",
				rootId,
				traceId: rootId,
			});
		}),
	),
);

export const withPinoLogger = (props: {
	prefix: string;
	context?: Record<string, unknown>;
}) =>
	Context.add(LoggingContext, {
		props,
		logger: Effect.gen(function* () {
			const logger = yield* yield* Effect.cached(rootloglayer);
			const loggerId = $$_spanId_$$();
			let child = props.prefix
				? logger.withPrefix(props.prefix)
				: logger.child();
			const loglayer = child.withContext({
				...props.context,
				_$span: "logger",
				loggerId,
				spanId: loggerId,
			});

			loglayer.debug(`logger span`);

			return loglayer;
		}),
		stream: LogstreamPassthrough,
	});
