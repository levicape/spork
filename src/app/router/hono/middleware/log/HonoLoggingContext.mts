import type { Hono, MiddlewareHandler } from "hono";
import type { ILogLayer } from "loglayer";

export type HonoRequestLoggerProps = {
	logger: ILogLayer;
};
export const HonoLoggingContext = (props: HonoRequestLoggerProps) => {
	const logger = props.logger.withPrefix("HONO");
	return async function context(c, next) {
		c.set("Logging", logger as ILogLayer | undefined);
		await next();
	} satisfies MiddlewareHandler;
};
