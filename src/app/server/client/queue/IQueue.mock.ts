// import { taskForMessageType } from "./Registry";
import type { IQueue, IQueueMessage } from "./IQueue.js";

export class MemoryQueue<T extends IQueueMessage> implements IQueue<T> {
	readonly queue: AsyncGenerator;

	constructor() {
		this.queue = this.work();
		this.queue.next();
	}
	async sendMessage(message: T): Promise<void> {
		this.queue.next(message);
	}

	async *work() {
		while (true) {
			const message: IQueueMessage = yield;
			// Logger.debug(`Received message ${JSON.stringify(message)}`);
			const worker = {
				process: async (_message: IQueueMessage) => {
					// Logger.debug(`Processing message ${JSON.stringify(message)}`);
					// const task = taskForMessageType(message.type);
					// if (task) {
					//   await task.execute(message);
					// }
				},
			};

			if (worker) {
				await worker.process(message);
			}
		}
	}
}

// TODO: CLI entrypoint uses node.runEntry.
// Each command has a { loglayer: ILogLayer } parameter.
// HonoHttpServerBuilder serve, stop and app return effects instead of promises
// Lambda handlers, verify compatibility with HonoHttpServerBuilder.app
/*
import { handler } from "hono/lambda";
export const handler = await Effect.runPromise(
	pipe(
		HonoHttpServerBuilder({ app }),
		Effect.promise(({app}) => handler(app))
	)
);

*/
