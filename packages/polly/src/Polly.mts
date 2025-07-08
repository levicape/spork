import { PollyRoutes } from "./route/PollyRoutes.mjs";
// import { PollyCredentials } from "./credential/PollyCredentials.mjs";

export const Polly = {
	routes: PollyRoutes,
	// credentials, PollyCredentials
} as const;
export const p = Polly;
