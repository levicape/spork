import { type StdioOptions, spawn } from "node:child_process";
import { appendFile, rmSync } from "node:fs";
import { isWindows } from "../../machine/context/System.mjs";
import { getWindowsExitReason } from "./parse.mjs";

export interface SpawnResult {
	ok: boolean;
	error?: string;
	errors?: string;
	spawnError?: Error | null;
	exitCode?: number | null;
	signalCode?: number | null;
	timestamp: number;
	duration: string;
	stdout: string;
	stderr?: string;
	testPath?: string;
	status?: string;
}

export interface SpawnOptions {
	command?: string;
	args?: string[];
	cwd?: string;
	timeout?: number;
	env?: Record<string, string | undefined>;
	stdio?: StdioOptions;
	stdin?: (...props: unknown[]) => unknown;
	stdout?: (...props: unknown[]) => unknown;
	stderr?: (...props: unknown[]) => unknown;
	retries?: number;
	privileged?: boolean;
}

export class Spawn {
	static cleanLogs = async () => {
		try {
			rmSync(`/tmp/spork-runner.stdout.log`, { recursive: true, force: true });
			rmSync(`/tmp/spork-runner.stderr.log`, { recursive: true, force: true });
		} finally {
		}
	};

	static spawnSafe = async (options: SpawnOptions): Promise<SpawnResult> => {
		const {
			timeouts: { spawnTimeout },
			options: { "max-retries": maxRetries },
		} = {
			timeouts: { spawnTimeout: 12_000 },
			options: {
				"max-retries": "1",
			},
		};

		const {
			command,
			args,
			cwd,
			env,
			timeout = spawnTimeout,
			stdout = (data: string) => {
				appendFile(`/tmp/spork-runner.stdout.log`, data, () => {});
			},
			stderr = (data: string) => {
				appendFile(`/tmp/spork-runner.stderr.log`, data, () => {});
			},
			retries = 0,
		} = options;
		let exitCode: string | number | undefined = undefined;
		let signalCode: string | undefined = undefined;
		let spawnError:
			| { code: string; stack: string[]; message: string }
			| undefined = undefined;
		let timestamp = 0;
		let duration: number | undefined;
		let subprocess: {
			stderr: {
				destroy: () => void;
				on: (arg0: string, arg1: (chunk: string) => void) => void;
			};
			stdout: {
				destroy: () => void;
				on: (arg0: string, arg1: (chunk: string) => void) => void;
			};
			unref: () => void;
			killed: unknown;
			kill: (arg0: number) => void;
			on: (
				arg0: string,
				arg1: {
					(): void;
					(error: unknown): void;
					(code: number, signal: unknown): void;
				},
			) => void;
		};
		let timer: number | undefined;
		let buffer = "";
		let buffererror = "";
		let doneCalls = 0;
		const beforeDone = (resolve: {
			(value: unknown): void;
			(value: unknown): void;
		}) => {
			// TODO: wait for stderr as well, spawn.test currently causes it to hang
			if (doneCalls++ === 1) {
				// @ts-ignore
				done(resolve);
			}
		};
		const done = (resolve: {
			(value: unknown): void;
			(value: unknown): void;
			(value: unknown): void;
			(): void;
		}) => {
			if (timer) {
				clearTimeout(timer);
			}
			subprocess.unref();
			if (!signalCode && exitCode === undefined) {
				subprocess.stdout.destroy();
				subprocess.stderr.destroy();
				if (!subprocess.killed) {
					subprocess.kill(9);
				}
			}
			resolve();
		};
		await new Promise((resolve) => {
			try {
				subprocess = spawn(command ?? "", args ?? [], {
					stdio: ["ignore", "pipe", "pipe"],
					timeout,
					cwd,
					env,
				});
				// @ts-ignore
				subprocess.ref();
				// @ts-ignore
				const group = -subprocess.pid;

				subprocess.on("spawn", () => {
					timestamp = Date.now();
					// @ts-ignore
					timer = setTimeout(() => done(resolve), timeout);
				});
				// @ts-ignore
				subprocess.on("error", (error: typeof spawnError) => {
					spawnError = error;
					// @ts-ignore
					done(resolve);
				});
				// @ts-ignore
				subprocess.on("exit", (code: number, signal: typeof signalCode) => {
					if (!isWindows) {
						try {
							// @ts-ignore
							process.kill(group, "SIGTERM");
						} catch (error: unknown) {
							if ((error as typeof spawnError)?.code !== "ESRCH") {
								console.warn(error);
							}
						}
					}

					duration = Date.now() - timestamp;
					exitCode = code;
					signalCode = signal;
					if (signalCode || exitCode !== 0) {
						beforeDone(resolve);
					} else {
						// @ts-ignore
						done(resolve);
					}
				});
				subprocess.stdout.on("end", () => {
					beforeDone(resolve);
				});
				// @ts-ignore
				subprocess.stdout.on(
					"data",
					(chunk: { toString: (arg0: string) => string }) => {
						const text = chunk.toString("utf-8");
						stdout?.(text);
						buffer += text;
					},
				);
				subprocess.stderr.on(
					"data",
					(chunk: { toString: (arg0: string) => string }) => {
						const text = chunk.toString("utf-8");
						stderr?.(text);
						buffererror += text;
					},
				);
			} catch (error) {
				spawnError = error as unknown as typeof spawnError;
				// @ts-ignore
				resolve();
			}
		});

		const max = Number.parseInt(maxRetries);
		if (spawnError && retries < max) {
			const { code } = spawnError;
			if (code === "EBUSY" || code === "UNKNOWN") {
				await new Promise((resolve) =>
					setTimeout(resolve, 1000 * (retries + 1)),
				);
				return Spawn.spawnSafe({
					...options,
					retries: retries + 1,
				});
			}
		}
		let error: string | RegExpExecArray | never[] | null = null;
		if (exitCode === 0) {
			// ...
		} else if (spawnError) {
			const { stack, message } = spawnError;
			if (/timed? ?out/.test(message)) {
				error = "timeout";
			} else {
				error = "spawn error";
				buffererror = (stack as unknown as string) || message;
			}
		} else if (
			(error = /thread \d+ panic: (.*)(?:\r\n|\r|\n|\\n)/i.exec(buffererror)) ||
			(error = /panic\(.*\): (.*)(?:\r\n|\r|\n|\\n)/i.exec(buffererror)) ||
			(error = /(Segmentation fault) at address/i.exec(buffererror)) ||
			(error = /(Internal assertion failure)/i.exec(buffererror)) ||
			(error = /(Illegal instruction) at address/i.exec(buffererror)) ||
			(error = /panic: (.*) at address/i.exec(buffererror))
		) {
			const [, message] = error || [];
			error = message
				? (message.split("\n")?.[0] ?? "").toLowerCase()
				: "crash";
			error =
				error.indexOf("\\n") !== -1
					? error.substring(0, error.indexOf("\\n"))
					: error;
		} else if (signalCode) {
			if (
				signalCode === "SIGTERM" &&
				duration !== undefined &&
				duration >= timeout
			) {
				error = "timeout";
			} else {
				error = signalCode;
			}
		} else if (exitCode === 1) {
			const match = buffererror.match(/\x1b\[31m\s(\d+) fail/);
			if (match) {
				error = `${match[1]} failing`;
			} else {
				error = "code 1";
			}
		} else if (exitCode === undefined) {
			error = "timeout";
		} else if (exitCode !== 0) {
			if (isWindows) {
				const winCode = getWindowsExitReason(exitCode as number);
				if (winCode) {
					exitCode = winCode;
				}
			}
			error = `code ${exitCode}`;
		}
		return {
			ok: (exitCode as unknown as number) === 0 && !signalCode && !spawnError,
			error: error !== null ? (error as string) : undefined,
			exitCode: exitCode as unknown as number,
			signalCode: signalCode as unknown as number,
			spawnError: spawnError as unknown as Error | null,
			stdout: buffer,
			stderr: buffererror,
			timestamp: timestamp || Date.now(),
			duration: duration?.toString() ?? "0",
		};
	};
}
