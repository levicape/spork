import { env } from "std-env";
import { z } from "zod";

export type RouteProtocol = "http" | "https" | "ws" | "wss";
export type Service = string;
export type Prefix = "/" | `/${"!" | "~" | "-"}/v${number}/${string}`;
export type ComposeRouteResource = {
	$kind: "ComposeRouteResource";
	hostname: string;
	protocol: RouteProtocol;
	port?: number;
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
} & Omit<Route<ComposeRouteResource>, "$kind">;
export type NoRouteResource = { [key: symbol]: never };
export type RouteResource =
	| ComposeRouteResource
	| LambdaRouteResource
	| NoRouteResource;

export type Route<T> = {
	hostname: string;
	protocol: RouteProtocol;
	port?: number;
	cdn?: string;
} & T;

export type RoutePaths<Paths extends Prefix> = Record<
	Paths,
	Route<RouteResource>
>;

export type AtlasRouteMap<Paths extends Prefix> = Record<
	Service,
	RoutePaths<Paths | Prefix>
>;

export const ComposeRouteResourceZod = z.object({
	$kind: z.literal("ComposeRouteResource"),
	hostname: z.string(),
	protocol: z.enum(["http", "https"]),
	port: z.number().min(0).max(65335).optional(),
});

export const LambdaRouteResourceZod = z.intersection(
	ComposeRouteResourceZod,
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
export const RouteResourceZod = z.union([
	ComposeRouteResourceZod,
	LambdaRouteResourceZod,
]);

export const AtlasRouteMapZod = z.record(z.record(RouteResourceZod));

type AtlasRouteMapZodType = z.infer<typeof AtlasRouteMapZod>;
type AtlasRouteMapZodTypecheck = AtlasRouteMapZodType extends Record<
	string,
	Record<string, Route<RouteResource>>
>
	? true
	: false;

const _atlasRouteMapZodTypecheck: AtlasRouteMapZodTypecheck = true;
