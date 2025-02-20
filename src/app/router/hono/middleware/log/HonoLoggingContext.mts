import { createMiddleware } from "hono/factory";
import type { ILogLayer } from "loglayer";

export type HonoLoggingContextProps = {
	logger: ILogLayer;
};
export const HonoLoggingContext = (props: HonoLoggingContextProps) => {
	const logger = props.logger.withPrefix("HONO");
	return createMiddleware<{
		Variables: {
			Logging: ILogLayer | undefined;
		};
	}>(async function LoggingContext(c, next) {
		c.set("Logging", logger);
		await next();
	});
};
