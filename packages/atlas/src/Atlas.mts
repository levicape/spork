import { AtlasRoutes } from "./route/AtlasRoutes.mjs";
// import { AtlasCredentials } from "./credential/AtlasCredentials.mjs";

export const Atlas = {
	routes: AtlasRoutes,
	// credentials, AtlasCredentials
} as const;
export const a = Atlas;
