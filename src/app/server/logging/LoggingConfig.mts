import { Config } from "effect";
/**
 * Configuration for Spork logging.
 */
export class LoggingConfig {
	/**
	 * Number representing the log level. 0 is the least verbose, 5 is the most verbose.
	 */
	constructor(readonly LOG_LEVEL: number) {}
}

/**
 * Effectjs configuration for Spork Logging.
 */
export const SporkLoggingConfig = Config.map(
	Config.all([Config.number("LOG_LEVEL").pipe(Config.withDefault(3))] as const),
	([level]) => new LoggingConfig(level),
);
