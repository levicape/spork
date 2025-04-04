import type { BaseError } from "../../../Error.mjs";

export class UnprocessableQueueItem implements BaseError {
	code = "UNPROCESSABLE_QUEUE_ITEM";
	date: string = Date.now().toString();
	doThrow = false;

	constructor(
		readonly reason: string,
		readonly rootCauses: BaseError[] = [],
	) {}
}
