import { process } from "std-env";

const varNames = "[a-zA-Z_]+[a-zA-Z0-9_]*";
const placeholders = ["\\$_", "\\${_}", "{{_}}"];

const envVars = placeholders
	.map((placeholder) => placeholder.replace("_", `(${varNames})`))
	.join("|");
const rgEnvVars = new RegExp(envVars, "gm");

function includeVariable(shellFormat: string | undefined, varName: string) {
	return (
		typeof shellFormat === "undefined" || shellFormat.indexOf(varName) > -1
	);
}
/**
 * Substitute env vars onto a given string. Adapted from "@tuplo/envsubst".
 * @link https://github.com/tuplo/envsubst
 * @variation ESM compatibility fixed. Original package default export is incompatible
 */
export function envsubst(input: string, shellFormat?: string) {
	const match = input.matchAll(rgEnvVars);
	if (!match) return input;

	return Array.from(match)
		.map((m) => {
			const [varInput, varName] = m
				.slice(0, placeholders.length + 1)
				.filter(Boolean);

			const value =
				typeof process?.env?.[varName ?? ""] === "undefined"
					? varInput
					: process.env?.[varName ?? ""];

			return [varInput, value];
		})
		.filter(([varInput]) => varInput && includeVariable(shellFormat, varInput))
		.reduce(
			(acc, [varInput = "", value = ""]) => acc.replace(varInput, value),
			input,
		);
}
