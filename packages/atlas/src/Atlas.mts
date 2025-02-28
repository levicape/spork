import { AtlasRoutes } from "./route/AtlasRoutes.mjs";

export const Atlas = {
	routes: AtlasRoutes,
} as const;
export const a = Atlas;

export * from "./AtlasEnvironment.mjs";
export * from "./route/AtlasRoutes.mjs";
export * from "./service/AtlasServices.mjs";
