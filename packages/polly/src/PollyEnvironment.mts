import { ensureFileSync } from "fs-extra/esm";
import { isNode, process } from "std-env";
import { z } from "zod";
import { envsubst } from "./transform/Envsubst.mjs";
import { fileURLToPath } from "./transform/FileUrlToPath.mjs";

let accessSync: (path: string, mode: number) => void;
let constants: {
	R_OK: number;
	W_OK: number;
} = { R_OK: 0, W_OK: 0 };
if (isNode) {
	// @ts-ignore
	const { accessSync: _accessSync, constants: _constants } = await import(
		"node:fs"
	);
	accessSync = _accessSync;
	constants = _constants;
}
const { R_OK, W_OK } = constants;

/**
 * PollyEnvironment configuration interface for environment variables.
 * @see {@link PollyEnvironmentZod}
 * @see {@link Polly}
 */
export interface PollyTopologyEnvironment {
	/**
	 * POLLY_ROUTES is a URL to a JSON file that contains an Polly configuration.
	 * Supported protocols:
	 * - file://
	 */
	POLLY_ROUTES?: string;
	/**
	 * POLLY_CADDYFILE is an optional path to a Caddyfile.
	 * Polly will edit the file at this path to include the routes
	 * in Caddyfile format when instantiated.
	 */
	POLLY_CADDYFILE?: string;
	/**
	 * POLLY_CADDYFILE_LOCAL replaces the file and adds a local block for certificates.
	 */
	POLLY_CADDYFILE_REPLACE?: string;
	/**
	 * POLLY_CADDYFILE_DOMAIN adds a domain block around the rendered locations.
	 */
	POLLY_CADDYFILE_DOMAIN?: string;
}

/**
 * PollyEnvironmentZod parses and validates environment variables.
 * @see {@link PollyTopologyEnvironment}
 */
export const PollyEnvironmentZod = z.object({
	POLLY_ROUTES: z
		.string()
		.regex(/^file:\/\/|^https?:\/\//)
		.optional()
		.transform((path) => (path ? envsubst(path) : undefined))
		.refine(
			(path) => {
				if (path) {
					const filepath = fileURLToPath(path, "/");
					if (path.startsWith("file://")) {
						try {
							accessSync(filepath, R_OK);
						} catch (e) {
							process.stderr?.write(
								`POLLY_ROUTES (${path}) -> ${filepath} is not readable: ${e}\n`,
							);
							return false;
						}
					}
				}
				return true;
			},
			{ message: "POLLY_ROUTES is not readable" },
		),
	POLLY_CADDYFILE: z
		.string()
		.optional()
		.refine(
			(path) => {
				if (path) {
					try {
						ensureFileSync(path);
						accessSync(path, W_OK);
					} catch (e) {
						process.stderr?.write(
							`POLLY_CADDYFILE (${path}) is not writable: ${e}\n`,
						);
						return false;
					}
				}
				return true;
			},
			{ message: "POLLY_CADDYFILE is not writable" },
		),
	POLLY_CADDYFILE_DOMAIN: z
		.string()
		.optional()
		.transform((path) => (path ? envsubst(path) : undefined))
		.refine(
			(path) => {
				if (path?.includes(" ")) {
					process.stderr?.write(
						`POLLY_CADDYFILE_DOMAIN (${path}) contains spaces\n`,
					);
					return false;
				}
				return true;
			},
			{ message: "POLLY_CADDYFILE_DOMAIN contains spaces" },
		),
	POLLY_CADDYFILE_REPLACE: z.coerce.boolean().optional(),
});
