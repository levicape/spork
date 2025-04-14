import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ILogLayer } from "loglayer";
import { serializeError } from "serialize-error";
import { ZodError } from "zod";
import type { HonoLoglayer } from "../log/HonoLoggingContext.mjs";

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

export const HonoExceptionMiddleware = (props: { logger: ILogLayer }) => {
	const logger = props.logger;
	const handler: ErrorHandler<HonoLoglayer> = (error, c) => {
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
		(c.var?.Logging ?? logger)
			.withMetadata({
				HonoExceptionMiddleware: {
					error: serializeError(error),
				},
			})
			.warn("Unhandled exception");

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

	return handler;
};
