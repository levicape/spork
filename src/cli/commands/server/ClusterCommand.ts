import { buildCommand } from "@stricli/core";

type Flags = {
	readonly target: string;
};
type Subprocess = import("child_process").ChildProcess;

const defaults = { NODE_ENV: process.env.NODE_ENV };

/**
 * Spawn a new process with corresponding ENV
 * @param env
 * @returns the process spawned or `null` if process is a worker
 */
function fork(props: {
	target: string;
	cwd?: string;
	worker?: boolean;
}) {
	// : Subprocess | null {
	const { target, cwd, worker } = props;
	if (worker) return undefined;

	return true;

	// return thread([process.execPath, target], {
	//     {
	// 		...defaults,
	// 		WORKER: ""
	// 	}, cwd,
	//     stdin: 'inherit',
	//     stdout: 'inherit',
	//     stderr: 'inherit'
	// });
}

function spawn(
	props: {
		worker: boolean;
		target: string;
	},
	...args: Array<string | number | boolean | undefined>
) {
	const { worker, target } = props;
	if (worker) return [];

	if (args.length === 0) return spawn(props, navigator.hardwareConcurrency);

	if (typeof args[0] === "object")
		return spawn(props, navigator.hardwareConcurrency, args[0]);

	const arr = new Array(args[0]);

	let i = 0;
	while (i < (args[0] as number)) {
		arr[i] = fork({
			target,
			worker,
		});
		++i;
	}

	return arr;
}

export const ClusterCommand = async () => {
	return async () =>
		buildCommand({
			loader: async () => {
				return (flags: Flags, text: string) => {
					const { target } = flags;
					const worker = "WORKER" in process.env && process.env.WORKER !== "";
					const cwd = process.cwd();

					spawn({ worker, target }, 1);
				};
			},
			parameters: {
				flags: {
					target: {
						brief: "Number of times to repeat the argument",
						kind: "parsed",
						parse: String,
						optional: false,
					},
				},
				positional: {
					kind: "tuple",
					parameters: [
						{
							brief: "",
							parse: String,
						},
					],
				},
			},
			docs: {
				brief: "Echo the first argument to the console",
			},
		});
};
