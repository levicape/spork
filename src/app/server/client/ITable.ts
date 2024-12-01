export type IRow<K> = {
	[key in keyof K]: string;
};

export interface ITable<T, Key> {
	getById(partitionKey: string, rowKey?: string): Promise<T>;
	getByMultiplePartitionIds(
		partitionKey: string[],
		rowKey?: string,
	): Promise<T[]>;
	readPartition(
		partitionKey: string,
		partitionKeyColumn: string,
		{
			limit,
			exclusiveStartKey,
		}: { limit?: number; exclusiveStartKey?: string },
	): Promise<AsyncGenerator<T>>;
	post(body: T): Promise<void>;
	put<Item extends Key>(
		partitionKey: string,
		rowKey: string | undefined,
		item: Item,
	): Promise<void>;
	insert<Item extends Key>(partitionKey: string, items: Item[]): Promise<void>;
	forGsi(gsi: string): ITable<T, Key>;
}
export type PostgresString =
	| `postgresql://${string}`
	| `postgresql://${string}:${number}`
	| `postgresql://${string}:${number}/${string}`;
export type TableName = `${string}`;
export type Namespace = "us-east-1" | "compute-jamboree-dev-k8s" | `${string}`;
export type Service = PostgresString | TableName;
export type ITableContext = {
	namespace: Namespace;
	service: Service;
	postgres?: {
		master: PostgresString;
		replica: PostgresString;
		database: string;
		schema: string;
		reader: {
			username: string;
			password: string;
		};
		writer: {
			username: string;
			password: string;
		};
		owner: {
			username: string;
			password: string;
		};
	};
	gsi?: {
		GSIS: string;
		GSIP: string;
		GSI1: string;
	};
};

export type ITableStreamProcessor<T> = {
	filterStream: (entity: T) => boolean;
	processItem: (newRow: T, previousRow?: T) => Promise<void>;
};
