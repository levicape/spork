
export const Hono404Handler = [
	{
		error: {
			code: "UNPROCESSABLE_ENTITY",
			message: "Could not process the request",
			validations: [],
		},
	},
	418,
] as const;
