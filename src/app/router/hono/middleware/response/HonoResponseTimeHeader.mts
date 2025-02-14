import type { MiddlewareHandler } from "hono";

export const HonoResponseTimeHeaderStandard = () => "X_Response_Time";

export const HonoResponseTimeHeader =
	({
		responseTimeHeader,
	}: {
		responseTimeHeader: string;
	}): MiddlewareHandler =>
	async (c, next) => {
		const start = Date.now();
		await next();
		const ms = Date.now() - start;
		c.header(responseTimeHeader, `${ms}`);
	};
