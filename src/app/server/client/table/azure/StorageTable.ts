// import axios, {
//   AxiosError,
//   AxiosInstance,
//   InternalAxiosRequestConfig,
// } from "axios";
// import * as http from "http";
// import * as https from "https";
// import * as crypto from "crypto";
// import { ITable } from "../ITable";

// const STORAGE_URL =
//   process.env["PELORIS_TABLE_URL"] || "http://127.0.0.1:10002";
// const STORAGE_USERNAME =
//   process.env["PELORIS_STORAGE_USERNAME"] || "devstoreaccount1";
// const STORAGE_PASSWORD =
//   process.env["PELORIS_STORAGE_PASSWORD"] ||
//   "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";

// const HTTP_AGENT = new http.Agent({ keepAlive: true });
// const HTTPS_AGENT = new https.Agent({ keepAlive: true });

// export class StorageTable<T> implements ITable<T, object> {
//   axios: AxiosInstance;
//   password: Buffer;
//   constructor(readonly tableName: string) {
//     const baseURL = `${STORAGE_URL}`;
//     this.axios = axios.create({
//       baseURL,
//       timeout: 4000,
//       httpAgent: HTTP_AGENT,
//       httpsAgent: HTTPS_AGENT,
//       headers: {
//         accept: "application/json;odata=nometadata",
//         "content-type": "application/json",
//         DataServiceVersion: "3.0;NetFx",
//         MaxDataServiceVersion: "3.0;NetFx",
//         "x-ms-version": "2019-07-07",
//       },
//     });

//     this.axios.interceptors.request.use(
//       (config: InternalAxiosRequestConfig) => {
//         const url = this.parseUrl(new URL(config.url!, config.baseURL));
//         config.url = url.toString();
//         Object.entries(this.generateRequestHeaders).forEach(([key, value]) => {
//           config.headers.set(key, value);
//         });
//         return config;
//       },
//     );

//     this.password = Buffer.from(STORAGE_PASSWORD, "base64");
//   }
//   readPartition(
//     /* eslint-disable @typescript-eslint/no-unused-vars */

//     partitionKey: string,
//     partitionKeyColumn: string,
//     {
//       limit,
//       exclusiveStartKey,
//     }: { limit?: number; exclusiveStartKey?: string },
//     /* eslint-enable @typescript-eslint/no-unused-vars */
//   ): Promise<AsyncGenerator<T>> {
//     throw new Error("Method not implemented.");
//   }
//   insert<Item extends object>(
//     partitionKey: string,
//     items: Item[],
//   ): Promise<void> {
//     console.log({ partitionKey, items });
//     throw new Error("Method not implemented.");
//   }
//   private signWithPassword(signature: string): string {
//     return crypto
//       .createHmac("sha256", this.password)
//       .update(signature)
//       .digest("base64");
//   }
//   private parseUrl(url: URL): URL {
//     let path = url?.pathname;

//     //Remove leading slash if request uses parenthesis
//     if (path.includes("(")) {
//       path = path.substring(1);
//     }

//     //Include username in path if using local development
//     if (STORAGE_USERNAME === "devstoreaccount1") {
//       path = `/${STORAGE_USERNAME}/${this.tableName}${path}`;
//     } else {
//       path = `/${this.tableName}${path}`;
//     }

//     url.pathname = path;
//     return url!;
//   }
//   private generateRequestHeaders(url: URL) {
//     const date = new Date(Date.now()).toUTCString();

//     const signature = `${date}\n/${STORAGE_USERNAME}${url.pathname}`;
//     const authorization = `SharedKeyLite ${STORAGE_USERNAME}:${this.signWithPassword(
//       signature,
//     )}`;
//     return {
//       date,
//       authorization,
//     };
//   }
//   private exceptionHandler(e: AxiosError) {
//     //TODO: handle 401, 422 and 400
//     if (e.response) {
//       const { data, status } = e.response;
//       if (data) {
//         console.trace(data);
//       }

//       if (status === 400) {
//         throw {
//           status: 503,
//           error: {
//             code: "DATABASE_ACCESS_ERROR",
//             reason: "Bad request",
//             date: Date.now(),
//           },
//         };
//       }
//       if (status === 403) {
//         throw {
//           status: 503,
//           error: {
//             code: "DATABASE_ACCESS_ERROR",
//             reason: "Connection failure",
//             date: Date.now(),
//           },
//         };
//       }
//     }

//     //Unhandled exception, throw it forward
//     throw e;
//   }
//   async getById(partitionKey: string, rowKey: string): Promise<T> {
//     const filter = `PartitionKey eq '${partitionKey}' and RowKey eq '${rowKey}'`;
//     try {
//       const { data } = await this.axios.get(
//         `/?$filter=${encodeURIComponent(filter)}`,
//       );
//       return Promise.resolve(data);
//     } catch (e) {
//       throw this.exceptionHandler(e as AxiosError);
//     }
//   }
//   async getByMultiplePartitionIds(
//     partitionKey: string[],
//     rowKey: string,
//   ): Promise<T[]> {
//     let filter = "";
//     partitionKey.forEach((pk) => {
//       if (filter.length > 0) {
//         filter += "or ";
//       }
//       filter += `PartitionKey eq '${pk}' `;
//     });
//     filter += `and RowKey eq '${rowKey}'`;

//     try {
//       const { data } = await this.axios.get(
//         `/?$filter=${encodeURIComponent(filter)}`,
//       );

//       return Promise.resolve(data);
//     } catch (e) {
//       throw this.exceptionHandler(e as AxiosError);
//     }
//   }
//   async post(body: T): Promise<void> {
//     try {
//       await this.axios.post("/", JSON.stringify(body));
//     } catch (e) {
//       this.exceptionHandler(e as AxiosError);
//     }
//   }
//   async put(partitionKey: string, rowKey: string, body: object): Promise<void> {
//     const filter =
//       `(PartitionKey='${partitionKey}', RowKey='${rowKey}')`.replace(
//         /'/g,
//         "%27",
//       );

//     try {
//       await this.axios.put(filter, JSON.stringify(body), {
//         headers: {
//           "If-Match": "*",
//         },
//       });
//     } catch (e) {
//       this.exceptionHandler(e as AxiosError);
//     }
//   }
// }
