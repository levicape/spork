import type { BaseError } from "../Error.mjs";

export class InvalidVersionKeyException implements BaseError {
	code = "INVALID_VERSION_KEY";
	date: string = Date.now().toString();
	doThrow = false;

	constructor(
		readonly reason: string,
		readonly rootCauses: BaseError[] = [],
	) {}
}
