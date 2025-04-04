export interface BaseError {
	code: string;
	reason: string;
	field?: string;
	message?: string;
	unrecoverable?: boolean;
	date?: string;
	doThrow?: boolean;
}

export interface ServiceError {
	status: number;
	error: {
		rootCauses?: BaseError[];
	} & BaseError;
}
