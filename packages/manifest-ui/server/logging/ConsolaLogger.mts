import { ConsolaTransport } from "@loglayer/transport-consola";
import { createConsola } from "consola";
import { Context, Effect } from "effect";
import type { ILogLayer } from "loglayer";
import { LogLayer } from "loglayer";
import { serializeError } from "serialize-error";
import { env } from "std-env";
import { ulid } from "ulidx";

const lazy = () =>
	new LogLayer({
		transport: new ConsolaTransport({
			logger: createConsola({
				level: Number(env.LOG_LEVEL ?? "3"),
			}),
		}),
		errorSerializer: serializeError,
		plugins: [
			{
				id: "timestamp-plugin",
				onBeforeDataOut: ({ data }) => {
					if (data) {
						data.timestamp = Date.now();
					}
					return data;
				},
			},
		],
	}).withContext({
		rootId: ulid(),
	});

let rootloglayer: ILogLayer | undefined;

export type ConsolaLoggerProps = {
	readonly prefix?: string;
	readonly context?: Record<string, unknown>;
};

export class ConsolaLogger extends Context.Tag("ConsolaLogger")<
	ConsolaLogger,
	{
		readonly props: ConsolaLoggerProps;
		readonly logger: Effect.Effect<ILogLayer>;
	}
>() {}

export const withConsolaLogger = (props: {
	prefix?: string;
	context?: Record<string, unknown>;
}) =>
	Context.add(ConsolaLogger, {
		props,
		logger: Effect.sync(() => {
			if (rootloglayer === undefined) {
				rootloglayer = lazy();
			}

			let child = props.prefix
				? rootloglayer.withPrefix(props.prefix)
				: rootloglayer.child();
			return child.withContext({
				...props.context,
			});
		}),
	});
