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
 * AtlasEnvironment configuration interface for environment variables.
 * @see {@link AtlasEnvironmentZod}
 * @see {@link Atlas}
 */
export interface AtlasEnvironment {
	/**
	 * ATLAS_ROUTES is a URL to a JSON file that contains an Atlas configuration.
	 * Supported protocols:
	 * - file://
	 */
	ATLAS_ROUTES?: string;
	/**
	 * ATLAS_CADDYFILE is an optional path to a Caddyfile. Atlas will append the current configuration in Caddyfile format when instantiated.
	 */
	ATLAS_CADDYFILE?: string;
}

/**
 * AtlasEnvironmentZod parses and validates environment variables. It is used in lieu of Effect-js to keep this package lightweight.
 * @see {@link AtlasEnvironment}
 */
export const AtlasEnvironmentZod = z.object({
	ATLAS_ROUTES: z
		.string()
		.url()
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
								`ATLAS_ROUTES (${path}) -> ${filepath} is not readable: ${e}\n`,
							);
							return false;
						}
					}
				}
				return true;
			},
			{ message: "ATLAS_ROUTES is not readable" },
		),
	ATLAS_CADDYFILE: z
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
							`ATLAS_CADDYFILE (${path}) is not writable: ${e}\n`,
						);
						return false;
					}
				}
				return true;
			},
			{ message: "ATLAS_CADDYFILE is not writable" },
		),
});

export * from "./transform/Envsubst.mjs";
