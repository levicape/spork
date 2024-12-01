export interface IQueueMessage<T = string> {
	messageType: T;
}

export interface IQueue<T extends IQueueMessage> {
	sendMessage<Message extends T>(
		message: Message,
		delaySeconds?: number,
	): Promise<void>;
}

export interface IQueueTask<T extends IQueueMessage> {
	process(message: T): Promise<void>;
}
