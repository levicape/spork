import { AsyncLocalStorage } from "node:async_hooks";
import { createMiddleware } from "hono/factory";
import type { RequestIdVariables } from "hono/request-id";
import type { ILogLayer } from "loglayer";
import { $$_traceId_$$ } from "../../../../server/logging/LoggingPlugins.mjs";

export type HonoLoglayer = {
	Variables: {
		Logging: ILogLayer;
		RequestLogging: ILogLayer;
	} & RequestIdVariables;
};

export type HonoLoggingContextProps = {
	logger: ILogLayer;
};

export const HonoLoggingStorage = new AsyncLocalStorage<{
	logging?: ILogLayer;
}>();

export const HonoLoggingContext = (props: HonoLoggingContextProps) => {
	const logger = props.logger.withPrefix("HONO");
	HonoLoggingStorage.enterWith({ logging: logger });
	const contextId = $$_traceId_$$();

	return createMiddleware<HonoLoglayer>(async function LoggingContext(c, next) {
		const requestId = c.var.requestId ?? $$_traceId_$$();
		const child = logger.child().withContext({
			$event: "duration",
			traceId: requestId,
		});

		child
			.withMetadata({
				$otel: false,
				HonoLoggingContext: {
					requestId,
					contextId,
				},
			})
			.info("HonoLoggingContext");

		c.set("Logging", child);

		await next();
	});
};
