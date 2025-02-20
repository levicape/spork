import { createMiddleware } from "hono/factory";

export const HonoResponseTimeHeaderStandard = () => "X_Response_Time";

export const HonoResponseTimeHeader = ({
	responseTimeHeader,
}: {
	responseTimeHeader: string;
}) =>
	createMiddleware(async function ResponseTimeHeader(c, next) {
		const start = Date.now();
		await next();
		const ms = Date.now() - start;
		c.header(responseTimeHeader, `${ms}`);
	});
