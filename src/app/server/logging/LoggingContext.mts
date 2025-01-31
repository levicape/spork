import { Context, type Effect } from "effect";
import type { ILogLayer } from "loglayer";

export type LoggingContextProps = {
	readonly prefix?: string;
	readonly context?: Record<string, unknown>;
};

export class LoggingContext extends Context.Tag("LoggingContext")<
	LoggingContext,
	{
		readonly props: LoggingContextProps;
		readonly logger: Effect.Effect<ILogLayer, unknown>;
	}
>() {}

// export const withStructuredLogging
