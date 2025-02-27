import type {} from "hono";

declare module "hono" {
	type Head = {
		title?: string;
	};

	type ContextRenderer = (
		content: string | Promise<string>,
		head?: Head,
	) => Response | Promise<Response>;
}
