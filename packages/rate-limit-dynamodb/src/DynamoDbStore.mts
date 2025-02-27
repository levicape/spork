type DynamoDbStoreOptions = {
	tableName: string;
	region: string;
};

export const store = (_opts: DynamoDbStoreOptions) => {};
