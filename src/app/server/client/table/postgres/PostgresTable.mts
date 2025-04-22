import {
	type DatabasePool,
	createPool,
	createTypeParserPreset,
	sql,
} from "slonik";
import type { IRow, ITable } from "../ITable.mjs";
type BasicDataType = string | number | boolean | Date | null | Uint8Array;
export type PostgresCredentials = {
	username: string;
	password: string;
};
export type PostgresTableProps = {
	master: string;
	replica: string;
	databaseName: string;
	tableName: string;
	schemaName: string;
	writer: PostgresCredentials;
	reader: PostgresCredentials;
	writes: DatabasePool;
	reads: DatabasePool;
};

export type PostgresGetKey<K> = (
	partitionKey: string,
	rowKey?: string,
) => { [k in keyof K]: string };

export class PostgresTable<
	T extends Partial<Record<keyof T, BasicDataType>> & IRow<K>,
	K extends IRow<K>,
> implements ITable<T, K>
{
	private tableName: string;
	private master: string;
	private replica: string;
	private databaseName: string;
	private schemaName: string;
	private writer: PostgresCredentials;
	private reader: PostgresCredentials;
	private reads: DatabasePool;
	private writes: DatabasePool;

	static SSL_MODE = "&sslmode=require";
	protected constructor(
		{
			master,
			replica,
			databaseName,
			tableName,
			schemaName,
			writer,
			reader,
			writes,
			reads,
		}: PostgresTableProps,
		private readonly getKey: (
			partitionKey: string,
			rowKey?: string,
		) => { [k in keyof K]: string },
	) {
		this.master = master;
		this.replica = replica;
		this.tableName = tableName;
		this.schemaName = schemaName;
		this.databaseName = databaseName;
		this.writer = writer;
		this.reader = reader;
		this.writes = writes;
		this.reads = reads;
	}

	static for = async <
		RowType extends Partial<Record<keyof RowType, BasicDataType>> &
			IRow<KeyAttributeMap>,
		KeyAttributeMap extends IRow<KeyAttributeMap>,
	>(
		props: Omit<PostgresTableProps, "writes" | "reads"> & {
			writes?: DatabasePool | undefined;
			reads?: DatabasePool | undefined;
		},
		getKey: PostgresGetKey<KeyAttributeMap>,
	): Promise<PostgresTable<RowType, KeyAttributeMap>> => {
		const { master, replica, databaseName, schemaName, writer, reader } = props;
		let { writes, reads } = props;

		if (!writes) {
			writes = await createPool(
				`${master.replace(
					"postgresql://",
					`postgresql://${writer.username}:${writer.password}@`,
				)}/${databaseName}?currentSchema=${schemaName}${PostgresTable.SSL_MODE}`,
				{
					typeParsers: [
						...createTypeParserPreset(),
						// {
						//   name: "bytea",
						//   parse: (value) => {
						//     if (value instanceof Buffer) {
						//       return value.toString("base64");
						//     }
						//     return value;
						//   }
						// }
					],
				},
			);
		}

		if (!reads) {
			reads = await createPool(
				`${replica.replace(
					"postgresql://",
					`postgresql://${reader.username}:${reader.password}@`,
				)}/${databaseName}?currentSchema=${schemaName}${PostgresTable.SSL_MODE}`,
				{
					typeParsers: [
						...createTypeParserPreset(),
						// {
						//   name: "bytea",
						//   parse: (value) => {
						//     if (value instanceof Buffer) {
						//       return value.toString("base64");
						//     }
						//     return value;
						//   }
						// }
					],
				},
			);
		}
		return new PostgresTable(
			{
				master,
				replica,
				databaseName,
				tableName: props.tableName,
				schemaName,
				writer,
				reader,
				writes,
				reads,
			},
			getKey,
		);
	};

	forGsi = (gsi: string): ITable<T, K> => {
		return new PostgresTable(
			{
				master: this.master,
				replica: this.replica,
				databaseName: this.databaseName,
				tableName: gsi,
				schemaName: this.schemaName,
				writer: this.writer,
				reader: this.reader,
				writes: this.writes,
				reads: this.reads,
			},
			this.getKey,
		);
	};

	getById = async (partitionKey: string, rowKey?: string): Promise<T> => {
		const key = this.getKey(partitionKey, rowKey);
		const conditions = Object.entries(key).map(
			([col, val]) => sql.fragment`${sql.identifier([col])} = ${val as string}`,
		);
		const result = await this.reads.query(
			sql.unsafe`SELECT * FROM ${sql.identifier([this.tableName])} WHERE ${sql.join(conditions, sql.fragment` AND `)}`,
		);
		return result.rows[0] as T;
	};

	getByMultiplePartitionIds = async (
		partitionKeys: string[],
		rowKey?: string,
	): Promise<T[]> => {
		const keys = partitionKeys.map((pk) => this.getKey(pk, rowKey));
		const conditions = keys.map((key) => {
			const keyConditions = Object.entries(key).map(
				([col, val]) =>
					sql.fragment`${sql.identifier([col])} = ${val as string}`,
			);
			return sql.fragment`(${sql.join(keyConditions, sql.fragment` AND `)})`;
		});

		const result = await this.reads.query(
			sql.unsafe`SELECT * FROM ${sql.identifier([this.tableName])} WHERE ${sql.join(conditions, sql.fragment` OR `)}`,
		);

		return result.rows as T[];
	};

	readPartition = async (
		partitionKey: string,
		partitionKeyColumn: string,
		{
			limit,
			exclusiveStartKey,
		}: { limit?: number; exclusiveStartKey?: string },
	): Promise<AsyncGenerator<T>> => {
		const conditions = [
			sql.fragment`${sql.identifier([partitionKeyColumn])} = ${partitionKey}`,
		];

		if (exclusiveStartKey) {
			conditions.push(
				sql.fragment`${sql.identifier([partitionKeyColumn])} > ${exclusiveStartKey}`,
			);
		}

		const reads = this.reads;
		const table = this.tableName;
		return (async function* () {
			// TODO:
			const result = await reads.query(
				sql.unsafe`SELECT * FROM ${sql.identifier([table])} WHERE ${sql.join(conditions, sql.fragment` OR `)} ${limit ? sql.fragment`LIMIT ${limit}` : sql.fragment``}`,
			);

			for (const row of result.rows) {
				yield row as T;
			}
		})();
	};

	post = async (body: T): Promise<void> => {
		const columns = Object.keys(body).map((col) => sql.identifier([col]));
		const values = Object.values(body);
		/*
      ON CONFLICT DO UPDATE SET ${sql.join(
        columns.map((col, index) => sql.fragment`${col} = ${values[index] as string}`),
        sql.fragment`, `,
      )}
    */

		// isClientLoggingEnabled() &&
		// 	Logger.client({
		// 		PostgresTable: {
		// 			post: JSON.stringify({
		// 				columns,
		// 				values,
		// 			}),
		// 		},
		// 	});
		const insertSql = sql.unsafe`INSERT INTO ${sql.identifier([this.tableName])} (${sql.join(columns, sql.fragment`, `)}) VALUES (${sql.join(
			values.map((val) => {
				if (typeof val === "string") {
					return sql.literalValue(val);
				}
				if (typeof val === "object" && val instanceof Buffer) {
					return sql.literalValue(val.toString("base64"));
				}
				return sql.fragment`${val as string}`;
			}),
			sql.fragment`, `,
		)});`;

		// isClientLoggingEnabled() &&
		// 	Logger.client({
		// 		PostgresTable: {
		// 			post: JSON.stringify({
		// 				insertSql,
		// 			}),
		// 		},
		// 	});
		await this.writes.query(insertSql);
	};

	put = async (
		partitionKey: string,
		rowKey: string | undefined,
		body: K | T,
	): Promise<void> => {
		const key = this.getKey(partitionKey, rowKey);
		const updates = Object.entries(body).map(
			([col, val]) => sql.fragment`${sql.identifier([col])} = ${val as string}`,
		);
		const keyConditions = Object.entries(key).map(
			([col, val]) => sql.fragment`${sql.identifier([col])} = ${val as string}`,
		);
		await this.writes.query(sql.unsafe`UPDATE ${sql.identifier([this.tableName])} SET ${sql.join(updates, sql.fragment`, `)} WHERE ${sql.join(keyConditions, sql.fragment` AND `)}
    `);
	};
	insert = async <Item extends K>(
		_partitionKey: string,
		items: Item[],
	): Promise<void> => {
		const insertStatements = items.map((item) => {
			const columns = Object.keys(item)
				.filter(
					(col) =>
						(item as { [Key in typeof col]: unknown })[col] !== undefined,
				)
				.map((col) => sql.identifier([col]));

			const values = Object.values(item)
				.filter((val) => val !== undefined)
				.map((val) => {
					if (typeof val === "string") {
						return sql.literalValue(val);
					}
					if (typeof val === "object" && val instanceof Buffer) {
						return sql.literalValue(val.toString("base64"));
					}
					return sql.fragment`${val as string}`;
				});
			return sql.unsafe`INSERT INTO ${sql.identifier([this.tableName])} (${sql.join(columns, sql.fragment`, `)}) VALUES (${sql.join(values, sql.fragment`, `)}) ON CONFLICT DO NOTHING;`;
		});

		// isClientLoggingEnabled() &&
		// 	Logger.warn({
		// 		PostgresTable: {
		// 			insert: JSON.stringify({
		// 				insertStatements: insertStatements.map((statement) => {
		// 					return statement.sql;
		// 				}),
		// 			}),
		// 		},
		// 	});

		await this.writes.transaction(async (trx) => {
			for (const statement of insertStatements) {
				await trx.query(statement);
			}
		});
	};
}
