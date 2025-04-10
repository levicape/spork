import { createMiddleware } from "hono/factory";
import type { ILogLayer } from "loglayer";
import type { HonoLoglayer } from "../../middleware/log/HonoLoggingContext.mjs";

export type HonoGuardLoggingProps = {
	before?: (logger: ILogLayer) => void;
	after?: (logger: ILogLayer) => void;
};
export const HonoGuardLogging = (props: HonoGuardLoggingProps) => {
	return createMiddleware<HonoLoglayer>(async function LoggingContext(c, next) {
		const logger = c.get("Logging");
		props.before?.(logger);
		await next();
		props.after?.(logger);
	});
};
