import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { Logger } from "../../../../server/logging/Logger.js";

export type HonoException = {
	code: string;
	message: string;
	cause: unknown;
	validations: {
		code: string;
		message: string;
		field: string;
		unrecoverable: boolean;
	}[];
	unrecoverable: boolean;
};

export const HonoExceptionMiddleware = () => {
	return (error: unknown) => {
		if (error instanceof ZodError) {
			return new Response(
				JSON.stringify({
					error: {
						code: "VALIDATION_FAILED",
						message: "Validation failed",
						cause: error.cause,
						validations: error.errors.map((e) => ({
							code: e.code,
							message: e.message,
							field: e.path.join("."),
							unrecoverable: e.fatal ?? false,
						})),
						unrecoverable: false,
					},
				}),
				{ status: 403 },
			);
		}

		if (error instanceof HTTPException) {
			return error.getResponse();
		}
		Logger.warn({
			HonoExceptionMiddleware: {
				error: JSON.stringify(error),
			},
		});

		return new Response(
			JSON.stringify({
				error: {
					code: "INTERNAL_SERVER_ERROR",
					message: "Could not process the request",
					cause: undefined,
					validations: [],
					unrecoverable: true,
				},
			}),
			{ status: 500 },
		);
	};
};
