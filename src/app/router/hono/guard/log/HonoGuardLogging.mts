import { createMiddleware } from "hono/factory";
import type { ILogLayer } from "loglayer";

export type HonoGuardLoggingProps = {
	before?: (logger: ILogLayer) => void;
	after?: (logger: ILogLayer) => void;
};
export const HonoGuardLogging = (props: HonoGuardLoggingProps) => {
	return createMiddleware<{
		Variables: {
			Logging: ILogLayer;
		};
	}>(async function LoggingContext(c, next) {
		const logger = c.get("Logging");
		props.before?.(logger);
		await next();
		props.after?.(logger);
	});
};
