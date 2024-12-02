import { getEnv } from "./context/Environment.js";

export const isDebug = getEnv("DEBUG", false) === "1";

/**
 * @param  {...unknown} args
 */
export function debugLog(...args: string[]) {
	if (isDebug) {
		console.log(...args);
	}
}
