import { ConsoleLogger } from "./ConsoleLogger.js";

type LogFunction = typeof console.log;

export interface ILogger {
	log: LogFunction;
	warn: LogFunction;
	debug: LogFunction;
	trace: LogFunction;
	client: LogFunction;
}

export const Logger: ILogger = ConsoleLogger;
