import { z } from "zod";

export type RouteProtocol = "http" | "https" | "ws" | "wss";

export type Url = `${RouteProtocol}://${string}`;

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
				attributes: z.record(z.string(), z.string()).optional(),
			}),
		})
		.optional(),
});

export const RouteMapZod = z.record(
	z.string(),
	z.record(
		z.string(),
		S3RouteResourceZod.or(LambdaRouteResourceZod).or(StaticRouteResourceZod),
	),
);

export const RoutePathsZod = RouteMapZod.valueType;
