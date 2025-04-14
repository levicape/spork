import { AsyncLocalStorage } from "node:async_hooks";
import { createMiddleware } from "hono/factory";
import type { RequestIdVariables } from "hono/request-id";
import type { ILogLayer } from "loglayer";
import { $$_traceId_$$ } from "../../../../server/logging/LoggingPlugins.mjs";

export type HonoLoglayer = {
	Variables: {
		Logging: ILogLayer;
	} & RequestIdVariables;
};

export type HonoLoggingContextProps = {
	logger: ILogLayer;
};

export const HonoLogging = new AsyncLocalStorage<{ logging?: ILogLayer }>();

export const HonoLoggingContext = (props: HonoLoggingContextProps) => {
	const logger = props.logger.withPrefix("HONO");
	HonoLogging.enterWith({ logging: logger });
	const contextId = $$_traceId_$$();

	return createMiddleware<HonoLoglayer>(async function LoggingContext(c, next) {
		const requestId = c.var.requestId ?? $$_traceId_$$();
		const { traceId } = logger.getContext();
		const child = logger.child().withContext({
			$event: "request",
		});

		child
			.withMetadata({
				HonoLoggingContext: {
					requestId,
					contextId,
					rootTraceId: traceId,
				},
			})
			.info("HonoLoggingContext");

		c.set(
			"Logging",
			child.withContext({
				traceId: requestId,
			}),
		);

		await next();
	});
};
