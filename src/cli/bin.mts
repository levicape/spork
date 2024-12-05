#!/usr/bin/env node --experimental-strip-types
import { run } from "@stricli/core";
import { SporkCliApp } from "./SporkCliApp.mjs";

const app = await SporkCliApp();
await run(app, process.argv.slice(2), {
	process: {
		...process,
		exit: (code: number) => {
			console.dir({
				Cli: {
					message: "Command execution complete",
					args: process.argv.slice(2),
					code,
				},
			});

			if (code !== 0) {
				setImmediate(() => process.exit(code));
			}
		},
	},
});
