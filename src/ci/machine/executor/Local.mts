import { inspect } from "node:util";
import { env } from "std-env";
import type { MachineExecutor } from "../context/Environment.mjs";

export class ExecutorLocal implements MachineExecutor {
	name = "Local" as const;

	isActive() {
		return true;
	}

	startGroup(title: string) {
		console.group(title);
	}

	endGroup() {
		console.groupEnd();
	}

	inspect(object: unknown) {
		console.log(
			inspect(object, {
				depth: null,
				compact: false,
				sorted: true,
			}),
		);
	}

	environment() {
		return env;
	}
}

export const localExecutor = new ExecutorLocal();
