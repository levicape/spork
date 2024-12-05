import { type Mock, before, beforeEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import { type DatabasePool, type QueryResult, createPool, sql } from "slonik";
import type { IRow } from "../ITable.js";
import { PostgresTable } from "./PostgresTable.js";

// mock("slonik", () => {
// 	const actualSlonik = jest.requireActual("slonik");
// 	return {
// 		...actualSlonik,
// 		createPool: jest.fn(() => ({
// 			query: jest.fn(),
// 		})),
// 	};
// });

type TestKey = { primary_key: string; sort_key: string };
interface TestRow extends IRow<TestKey> {
	primary_key: string;
	sort_key: string;
	data: string;
}

describe("PostgresTable", () => {
	let writes: DatabasePool;
	let reads: DatabasePool;
	let table: PostgresTable<TestRow, TestKey>;

	before(() => {
		writes = createPool("mock-connection-string") as unknown as DatabasePool;
		reads = createPool("mock-connection-string") as unknown as DatabasePool;
		table = new PostgresTable<TestRow, TestKey>(
			{
				master: "mock-master",
				replica: "mock-replica",
				databaseName: "test_database",
				tableName: "test_table",
				schemaName: "test_schema",
				writer: {
					username: "mock-writer-username",
					password: "mock-writer-password",
				},
				reader: {
					username: "mock-reader-username",
					password: "mock-reader-password",
				},
			},
			(pk, sk) => ({ primary_key: pk, sort_key: sk || "" }),
		);
		table = Object.assign(table, { writes, reads });
	});

	beforeEach(() => {
		mock.restoreAll();
		table = Object.assign(table, { writes, reads });
	});

	it("should generate correct query for getById", async () => {
		const mockQuery = reads.query as Mock<typeof reads.query>;
		mockQuery.mock.mockImplementation(() =>
			Promise.resolve({
				rows: [{ primary_key: "1", sort_key: "2", data: "test" }],
			} as unknown as QueryResult<unknown>),
		);

		const result = await table.getById("1", "2");

		expect(JSON.stringify(mockQuery.mock.calls[0]?.arguments[0])).toBe(
			JSON.stringify(sql.unsafe`
      SELECT * FROM ${sql.identifier(["test_table"])}
      WHERE ${sql.identifier(["primary_key"])} = ${"1"} AND ${sql.identifier(["sort_key"])} = ${"2"}
    `),
		);
		expect(result).toEqual({ primary_key: "1", sort_key: "2", data: "test" });
	});

	it("should generate correct query for getByMultiplePartitionIds", async () => {
		const mockQuery = reads.query as Mock<typeof reads.query>;
		mockQuery.mock.mockImplementation(() =>
			Promise.resolve({
				rows: [{ primary_key: "1", sort_key: "2", data: "test" }],
			} as unknown as QueryResult<unknown>),
		);

		const result = await table.getByMultiplePartitionIds(["1", "3"], "2");

		expect(JSON.stringify(mockQuery.mock.calls[0]?.arguments[0])).toBe(
			JSON.stringify(sql.unsafe`
      SELECT * FROM ${sql.identifier(["test_table"])}
      WHERE (${sql.identifier(["primary_key"])} = ${"1"} AND ${sql.identifier(["sort_key"])} = ${"2"}) OR (${sql.identifier(["primary_key"])} = ${"3"} AND ${sql.identifier(["sort_key"])} = ${"2"})
    `),
		);
		expect(result).toEqual([{ primary_key: "1", sort_key: "2", data: "test" }]);
	});

	it("should generate correct query for post", async () => {
		const mockQuery = reads.query as Mock<typeof reads.query>;
		mockQuery.mock.mockImplementation(() =>
			Promise.resolve({} as unknown as QueryResult<unknown>),
		);

		await table.post({ primary_key: "1", sort_key: "2", data: "test" });

		// TODO: Upsert
		`
      ON CONFLICT DO UPDATE SET ${sql.join(
				["data"].map(
					(col) =>
						sql.fragment`${col} = ${"test"}` as ReturnType<typeof sql.fragment>,
				),
				sql.fragment`, `,
			)}          
    `;

		expect(JSON.stringify(mockQuery.mock.calls[0]?.arguments[0])).toBe(
			JSON.stringify(sql.unsafe`
      INSERT INTO ${sql.identifier(["test_table"])} (${sql.identifier(["primary_key"])}, ${sql.identifier(["sort_key"])}, ${sql.identifier(["data"])})
      VALUES (${"1"}, ${"2"}, ${"test"})
    `),
		);
	});

	it("should generate correct query for put", async () => {
		const mockQuery = reads.query as Mock<typeof reads.query>;
		mockQuery.mock.mockImplementation(() =>
			Promise.resolve({} as unknown as QueryResult<unknown>),
		);

		await table.put("1", "2", {
			primary_key: "1",
			sort_key: "2",
			data: "updated",
		});
		expect(JSON.stringify(mockQuery.mock.calls[0]?.arguments[0])).toBe(
			JSON.stringify(sql.unsafe`
      UPDATE ${sql.identifier(["test_table"])}
      SET ${sql.identifier(["primary_key"])} = ${"1"}, ${sql.identifier(["sort_key"])} = ${"2"}, ${sql.identifier(["data"])} = ${"updated"}
      WHERE ${sql.identifier(["primary_key"])} = ${"1"} AND ${sql.identifier(["sort_key"])} = ${"2"}
    `),
		);
	});

	it("should generate correct query for insert", async () => {
		const mockQuery = reads.query as Mock<typeof reads.query>;
		mockQuery.mock.mockImplementation(() =>
			Promise.resolve({} as unknown as QueryResult<unknown>),
		);

		await table.insert("1", [
			{ primary_key: "1", sort_key: "2", data: "test" },
			{ primary_key: "1", sort_key: "3", data: "test2" },
		]);
		expect(JSON.stringify(mockQuery.mock.calls[0]?.arguments[0])).toBe(
			JSON.stringify(sql.unsafe`
      INSERT INTO ${sql.identifier(["test_table"])} (${sql.identifier(["primary_key"])}, ${sql.identifier(["sort_key"])}, ${sql.identifier(["data"])})
      VALUES (${"1"}, ${"2"}, ${"test"}), (${"1"}, ${"3"}, ${"test2"})
    `),
		);
	});
});
