import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import type { IQueue, IQueueMessage } from "../IQueue.js";

export class SqsQueue<T extends IQueueMessage> implements IQueue<T> {
	client: SQSClient;
	constructor(
		readonly region: string,
		readonly url: string,
	) {
		this.client = new SQSClient({
			region,
		});
	}
	async sendMessage(
		message: IQueueMessage,
		delaySeconds?: number | undefined,
	): Promise<void> {
		await this.client.send(
			new SendMessageCommand({
				MessageBody: JSON.stringify(message),
				QueueUrl: this.url,
				DelaySeconds: delaySeconds,
			}),
		);
	}
}
