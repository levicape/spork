import { DynamoDB } from "@aws-sdk/client-dynamodb";
import {
	type BatchGetCommandOutput,
	DynamoDBDocument,
	type GetCommandOutput,
	type QueryCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import type { NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";
import VError from "verror";
import type { IRow, ITable } from "../../table/ITable.js";

// Logger.log({
// 	ServerContext: {
// 		message: "Polyfilling BigInt.toJSON",
// 	},
// });
// BigIntJsonSupport();
type Region = string;

export type DynamoImageAttribute = { N?: string; S?: string };
export type DynamoImageAttributeMap = { [x: string]: DynamoImageAttribute };
export class DynamoTable<
	T extends Partial<Record<keyof T, NativeScalarAttributeValue>> & IRow<K>,
	K extends IRow<K>,
> implements ITable<T, K>
{
	static clients: Record<Region, DynamoDBDocument> = {};

	constructor(
		readonly tableName: string,
		readonly region: Region,
		readonly getKey: (
			partitionKey: string,
			rowKey?: string,
		) => { [k in keyof K]: string },
		readonly indexName?: string | undefined,
	) {
		if (DynamoTable.clients[region] === undefined) {
			DynamoTable.clients[region] = DynamoDBDocument.from(
				new DynamoDB({
					region,
				}),
				{
					marshallOptions: {
						convertClassInstanceToMap: true,
						removeUndefinedValues: true,
					},
				},
			);
		}
	}

	private get client(): DynamoDBDocument {
		if (DynamoTable.clients[this.region] === undefined) {
			throw new VError(`Client not initialized for region ${this.region}`);
		}
		return DynamoTable.clients[this.region] as DynamoDBDocument;
	}

	forGsi = (gsi: string) => {
		return new DynamoTable<T, K>(this.tableName, this.region, this.getKey, gsi);
	};

	async getById(partitionKey: string, rowKey?: string): Promise<T> {
		const result: GetCommandOutput = await this.client.get({
			TableName: this.tableName,
			Key: this.getKey(partitionKey, rowKey),
		});

		return result.Item as T;
	}

	async readPartition(
		partitionKey: string,
		partitionKeyColumn: string,
		{
			limit,
			exclusiveStartKey,
		}: { limit?: number; exclusiveStartKey?: string },
	): Promise<AsyncGenerator<T>> {
		const table = this.tableName;
		const index = this.indexName;
		const client = this.client;
		return (async function* () {
			const result: QueryCommandOutput = await client.query({
				TableName: table,
				IndexName: index,
				KeyConditionExpression: `${partitionKeyColumn} = :pk`,
				ExpressionAttributeValues: {
					":pk": partitionKey,
				},
				Limit: limit,
			});

			for (const row of result.Items ?? []) {
				yield row as T;
			}
		})();
	}

	async getByMultiplePartitionIds(
		partitionKey: string[],
		rowKey?: string | undefined,
	): Promise<T[]> {
		const result: BatchGetCommandOutput = await this.client.batchGet({
			RequestItems: {
				[this.tableName]: {
					Keys: partitionKey.map((k) => this.getKey(k, rowKey)),
				},
			},
		});

		return (result.Responses?.[this.tableName] as T[]) ?? [];
	}

	async post(body: T): Promise<void> {
		await this.client.put({
			TableName: this.tableName,
			Item: body,
		});
	}

	async put(
		_partitionKey: string,
		_rowKey: string | undefined,
		body: K,
	): Promise<void> {
		await this.post(body as unknown as T);
	}

	async insert<Item extends K>(
		_partitionKey: string,
		items: Item[],
	): Promise<void> {
		await this.client.transactWrite({
			TransactItems: items.map((item) => ({
				Put: { Item: item, TableName: this.tableName },
			})),
			ClientRequestToken: Date.now().toString(),
		});
	}
}
