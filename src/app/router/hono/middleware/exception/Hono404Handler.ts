import type { Context } from "hono";

export const Hono404Handler = () => {
	return (c: Context) => {
		return c.json(
			{
				error: {
					code: "UNPROCESSABLE_ENTITY",
					message: "Could not process the request",
					validations: [],
				},
			},
			418,
		);
	};
};
