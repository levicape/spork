import type { ITable, ITableStreamProcessor } from "./ITable.mjs";

const flattenKey = <T,>(
	key: { [k in keyof T]: string | undefined },
): string => {
	return Object.values(key).join("_");
};

export class MemoryTable<T, K> implements ITable<T, K> {
	stream?: ITableStreamProcessor<T>;
	map: Record<string, K> = {};

	constructor(
		readonly getKey: (
			partitionKey: string,
			rowKey?: string,
		) => { [k in keyof K]: string },
		readonly keyFromRow: (row: T) => {
			[k in keyof K]: string;
		},
	) {}

	forGsi(_gsi: string): ITable<T, K> {
		return this;
	}

	readPartition(
		partitionKey: string,
		_partitionKeyColumn: string,
		readOptions: { limit?: number; exclusiveStartKey?: string },
	): Promise<AsyncGenerator<T>> {
		const map = this.map;
		const { limit, exclusiveStartKey } = readOptions;

		limit;
		exclusiveStartKey;

		return Promise.resolve(
			(async function* () {
				const entries = Object.entries(map);
				for (let i = 0; i < entries.length; i++) {
					const entry = entries[i];
					const key = entry?.[0] as string;
					const value = entry?.[1] as K;
					if (key.startsWith(partitionKey)) {
						yield value as unknown as T;
					}
				}
			})(),
		);
	}

	async getById(partitionKey: string, rowKey?: string): Promise<T> {
		const fullKey = flattenKey(this.getKey(partitionKey, rowKey));
		return Promise.resolve(this.map[fullKey] as unknown as T);
	}

	async getByMultiplePartitionIds(
		partitionKeys: string[],
		rowKey?: string | undefined,
	): Promise<T[]> {
		return Promise.resolve(
			partitionKeys
				.map((id) => {
					const fullKey = flattenKey(this.getKey(id, rowKey));
					if (this.map[fullKey] !== undefined) {
						return this.map[fullKey] as unknown as T;
					}
					return undefined;
				})
				.filter((row) => row !== undefined)
				.map((r) => r),
		);
	}

	async post(body: T): Promise<void> {
		const fullKey = this.keyFromRow(body);
		this.map[flattenKey(fullKey)] = body as unknown as K;
		if (this.stream?.filterStream(body as unknown as T)) {
			await this.stream?.processItem(body);
		}

		return Promise.resolve();
	}

	async put(
		partitionKey: string,
		rowKey: string | undefined,
		body: K,
	): Promise<void> {
		const fullKey = flattenKey({ partitionKey, rowKey });
		const previous = this.map[fullKey];
		this.map[fullKey] = body;
		if (this.stream?.filterStream(body as unknown as T)) {
			await this.stream?.processItem(
				body as unknown as T,
				previous as unknown as T,
			);
		}
		return Promise.resolve();
	}

	async insert<Item extends K>(
		_partitionKey: string,
		items: Item[],
	): Promise<void> {
		await Promise.all(
			items.map((item) => {
				return this.post(item as unknown as T);
			}),
		);
	}
}
