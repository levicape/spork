import type { IKeyValueStore } from "./IKeyValueStore.mjs";

export class MemoryKV<T> implements IKeyValueStore<T> {
	get(): Promise<T> {
		return Promise.resolve(null as T);
	}
}
