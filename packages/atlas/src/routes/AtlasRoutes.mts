import { z } from "zod";

export type RouteProtocol = "http" | "https" | "ws" | "wss";

export type Url = `${RouteProtocol}://${string}`;

export type Service = string;

export type Prefix = "/" | `/${"!" | "~" | "-"}/${string}`;

export type StaticRouteResource = {
	$kind: "StaticRouteResource";
};

export type LambdaRouteResource = {
	$kind: "LambdaRouteResource";
	lambda: {
		arn: string;
		name: string;
		role: {
			arn: string;
			name: string;
		};
		qualifier?: string;
	};
	cloudmap?: {
		namespace: {
			arn: string;
			name: string;
			id: string;
			hostedZone: string;
		};
		service: {
			arn: string;
			name: string;
		};
		instance: {
			id: string;
			attributes?: Record<string, string>;
		};
	};
};

export type S3RouteResource = {
	$kind: "S3RouteResource";
	bucket: {
		arn: string;
		name: string;
		domainName: string;
	};
	website: {
		domain: string;
		endpoint: string;
	};
};

export type RouteResource =
	| LambdaRouteResource
	| StaticRouteResource
	| S3RouteResource;

export type Route = {
	hostname: string;
	protocol: RouteProtocol;
	port?: string;
} & (StaticRouteResource | LambdaRouteResource | S3RouteResource);

export type AtlasRoutePaths<Paths extends Prefix = Prefix> = Record<
	Paths,
	Route
>;

export type AtlasRouteMap<Paths extends Prefix = Prefix> = Record<
	Service,
	AtlasRoutePaths<Paths | Prefix>
>;

export const StaticRouteResourceZod = z.object({
	$kind: z.literal("StaticRouteResource"),
	hostname: z.string(),
	protocol: z.union([
		z.literal("http"),
		z.literal("https"),
		z.literal("ws"),
		z.literal("wss"),
	]),
	port: z.string().optional(),
});

export const S3RouteResourceZod = z.object({
	$kind: z.literal("S3RouteResource"),
	hostname: z.string().optional(),
	protocol: z.union([
		z.literal("http"),
		z.literal("https"),
		z.literal("ws"),
		z.literal("wss"),
	]),
	port: z.string().optional(),
	bucket: z.object({
		arn: z.string(),
		name: z.string(),
		domainName: z.string(),
	}),
	website: z.object({
		domain: z.string(),
		endpoint: z.string(),
	}),
});

export const LambdaRouteResourceZod = z.object({
	$kind: z.literal("LambdaRouteResource"),
	hostname: z.string(),
	protocol: z.union([
		z.literal("http"),
		z.literal("https"),
		z.literal("ws"),
		z.literal("wss"),
	]),
	port: z.string().optional(),
	lambda: z.object({
		arn: z.string(),
		name: z.string(),
		qualifier: z.string().optional(),
		role: z.object({
			arn: z.string(),
			name: z.string(),
		}),
	}),
	cloudmap: z
		.object({
			namespace: z.object({
				arn: z.string(),
				name: z.string(),
				id: z.string(),
				hostedZone: z.string(),
			}),
			service: z.object({
				arn: z.string(),
				name: z.string(),
			}),
			instance: z.object({
				id: z.string(),
				attributes: z.record(z.string()).optional(),
			}),
		})
		.optional(),
});

export const RouteMapZod = z.record(
	z.record(
		S3RouteResourceZod.or(LambdaRouteResourceZod).or(StaticRouteResourceZod),
	),
);

export const RoutePathsZod = RouteMapZod.valueSchema;

type RoutePathsZodType = z.infer<typeof RoutePathsZod>;
({
	"/": {
		$kind: "StaticRouteResource",
		hostname: "localhost",
		protocol: "http",
		port: "80",
	},
	"/lambda": {
		$kind: "LambdaRouteResource",
		hostname: "localhost",
		protocol: "http",
		port: "80",
		lambda: {
			name: "test",
			arn: "arn:aws:lambda:region:account-id:function:test",
			role: {
				arn: "arn:aws:iam::account-id:role/test",
				name: "test",
			},
		},
		cloudmap: {
			namespace: {
				name: "test",
				arn: "arn:aws:servicediscovery:region:account-id:namespace/test",
				id: "test",
				hostedZone: "test",
			},
			service: {
				arn: "arn:aws:servicediscovery:region:account-id:service/test",
				name: "test",
			},
			instance: {
				id: "test-instance",
				attributes: {
					test: "test",
				},
			},
		},
	},
}) satisfies RoutePathsZodType;
