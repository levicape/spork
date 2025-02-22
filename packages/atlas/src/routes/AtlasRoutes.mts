import { z } from "zod";

export type RouteProtocol = "http" | "https" | "ws" | "wss";
export type Service = string;
export type Prefix = "/" | `/${"!" | "~" | "-"}/v${number}/${string}`;
export type ComposeRouteResource = {
	$kind: "ComposeRouteResource";
};
export type LambdaRouteResource = {
	$kind: "LambdaRouteResource";
	lambda: {
		arn?: string;
		name: string;
		role?: {
			arn: string;
			name: string;
		};
		qualifier?: string;
	};
	cloudmap?: {
		namespace: {
			arn?: string;
			name: string;
			id?: string;
			hostedZone?: string;
		};
		service: {
			arn: string;
			name: string;
		};
		instance: {
			id?: string;
			attributes: Record<string, string>;
		};
	};
};

export type RouteResource = ComposeRouteResource | LambdaRouteResource;

export type Route = {
	hostname: string;
	protocol: RouteProtocol;
	port?: number;
} & RouteResource;

export type RoutePaths<Paths extends Prefix> = Record<Paths, Route>;

export type AtlasRouteMap<Paths extends Prefix> = Record<
	Service,
	RoutePaths<Paths | Prefix>
>;

export const RouteResourceZod = z.object({
	hostname: z.string(),
	protocol: z.enum(["http", "https", "ws", "wss"] as const),
	port: z.number().min(0).max(65335).optional(),
});

export const ComposeRouteResourceZod = RouteResourceZod.merge(
	z.object({
		$kind: z.literal("ComposeRouteResource"),
	}),
);

export const LambdaRouteResourceZod = RouteResourceZod.merge(
	z.object({
		$kind: z.literal("LambdaRouteResource"),
		lambda: z.object({
			arn: z.string().optional(),
			name: z.string(),
			role: z
				.object({
					arn: z.string(),
					name: z.string(),
				})
				.optional(),
			qualifier: z.string().optional(),
		}),
		cloudmap: z
			.object({
				namespace: z
					.object({
						arn: z.string().optional(),
						name: z.string(),
						id: z.string().optional(),
						hostedZone: z.string().optional(),
					})
					.optional(),
				service: z
					.object({
						arn: z.string().optional(),
						name: z.string(),
					})
					.optional(),
				instance: z
					.object({
						id: z.string().optional(),
						attributes: z.record(z.string()),
					})
					.optional(),
			})
			.optional(),
	}),
);

export const RouteZod = z.discriminatedUnion("$kind", [
	ComposeRouteResourceZod,
	LambdaRouteResourceZod,
]);

export const RoutePathsZod = z.record(RouteZod);

type RoutePathsZodType = z.infer<typeof RoutePathsZod>;
({
	"/": {
		$kind: "ComposeRouteResource",
		hostname: "localhost",
		protocol: "http",
		port: 80,
	},
	"/lambda": {
		$kind: "LambdaRouteResource",
		hostname: "localhost",
		protocol: "http",
		port: 80,
		lambda: {
			name: "test",
		},
		cloudmap: {
			namespace: {
				name: "test",
			},
			service: {
				name: "test",
			},
			instance: {
				attributes: {
					test: "test",
				},
			},
		},
	},
}) satisfies RoutePathsZodType;
