import { createId } from "@paralleldrive/cuid2";
import { ulid } from "ulidx";
import { $$_spanId_$$, $$_traceId_$$ } from "../logging/LoggingPlugins.mjs";

export type KeygenSrand = typeof cuidKeygen;
export type KeygenKsort = typeof ulidKeygen;
export type KeygenOtel = typeof otelKeygen;

export const cuidKeygen = {
	srand: () => createId(),
};

export const ulidKeygen = {
	ksort: () => ulid(),
};

export const otelKeygen = {
	trace: $$_traceId_$$,
	span: $$_spanId_$$,
};
