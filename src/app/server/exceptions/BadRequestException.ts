import type { BaseError, ServiceError } from "./Error.js";
// import { ValidationError } from "class-validator";

export class BadRequestException implements ServiceError {
	status = 400;
	error = {
		rootCauses: [] as BaseError[],
		code: "BAD_REQUEST",
		reason: "Malformed Request",
		date: Date.now().toString(),
	};

	constructor(reason: string);
	constructor(
		validations?: { property: string; constraints: string }[] | string,
	) {
		if (typeof validations === "string") {
			this.error.rootCauses.push({
				code: "VALIDATION_ERROR",
				reason: validations,
			});
		} else if (validations && typeof validations.map === "function") {
			this.error.rootCauses = validations.map((ve) => {
				return {
					code: "INVALID_PROPERTY",
					reason: `Invalid ${ve.property}: ${JSON.stringify(ve.constraints)}`,
				};
			});
		}
	}
}
