import { Logger } from "../logging/Logger.js";
// import { taskForMessageType } from "$server/tasks/Registry";
import type { IQueue, IQueueMessage } from "./IQueue.js";

export class MockQueue<T extends IQueueMessage> implements IQueue<T> {
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
			Logger.debug(`Received message ${JSON.stringify(message)}`);
			const worker = {
				process: async (message: IQueueMessage) => {
					Logger.debug(`Processing message ${JSON.stringify(message)}`);
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
