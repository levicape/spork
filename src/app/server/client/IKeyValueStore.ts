export interface IKeyValueStore<T> {
	get(key: string): Promise<T>;
}
