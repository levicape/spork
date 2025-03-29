import type { MagmapHonoApp } from "@levicape/spork-magmap-io/http/HonoApp";
import clsx from "clsx";
import { hc } from "hono/client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Await } from "react-router";
import { serializeError } from "serialize-error";
import {
	type OidcFetch,
	type OidcUser,
	useOidcClient,
} from "../../atoms/authentication/OidcClientAtom";
import { useFormatMessage } from "../../atoms/localization/I18nAtom";
import { AwaitClient } from "../../ui/ClientSuspense";
import { Button } from "../../ui/daisy/action/Button";
import { Alert } from "../../ui/daisy/feedback/Alert";
import { Loading } from "../../ui/daisy/feedback/Loading";

declare global {
	interface Window {
		"--magmap-revalidate"?: () => void;
		"--magmap-debug"?: boolean;
	}
}

const Magmap = hc<MagmapHonoApp>("");
const GetMagmapAtlasfile = async (user: OidcUser, oidcFetch: OidcFetch) => {
	const debugEnabled =
		typeof window !== "undefined" ? window["--magmap-debug"] : undefined;

	if (!user) {
		await AwaitClient();
	}

	try {
		const atlasfiles = await Magmap["~"].Spork.Magmap.atlas.$get(
			{},
			{
				fetch: oidcFetch,
			},
		);
		const response =
			atlasfiles.status < 500
				? await atlasfiles.json()
				: {
						data: undefined,
						error: {
							message: `Error fetching liveness for route ${atlasfiles.status}: ${atlasfiles.statusText}`,
							code: "RouteNotFound",
						},
					};
		debugEnabled &&
			console.log({
				MagmapRoutemap: {
					atlasfiles,
					response,
				},
			});

		const maybeError = (response as { error?: unknown }).error;
		if (maybeError !== undefined) {
			console.warn({
				MagmapRoutemap: {
					message: "Error in response",
					error: maybeError,
				},
			});
			throw maybeError;
		}

		return response as typeof response & { error?: never };
	} catch (error) {
		console.warn({
			MagmapRoutemap: {
				message: "Error fetching liveness",
				error: serializeError(error),
			},
		});

		throw error;
	}
};

// type MagmapAtlasfile = Awaited<ReturnType<typeof GetMagmapAtlasfile>>;
export const MagmapAtlas = () => {
	const formatMessage = useFormatMessage();
	const { user, oidcFetch } = useOidcClient();
	const [active, setActive] = useState(true);
	const revalidate = useCallback(() => {
		setActive(() => false);
		setTimeout(() => {
			setActive(() => true);
		}, 39);
	}, []);

	const fetchPromise = useMemo(async () => {
		return GetMagmapAtlasfile(user, oidcFetch);
	}, [user, oidcFetch]);

	const [url, setUrl] = useState("");

	useEffect(() => {
		window["--magmap-revalidate"] = () => {
			revalidate();
		};

		return () => {
			window["--magmap-revalidate"] = undefined;
		};
	}, [revalidate]);

	useEffect(() => {
		setUrl(location.href);
	}, []);

	return (
		<>
			<h2
				className={clsx(
					"font-bold",
					"text-2xl",
					"flex",
					"pt-4",
					"pb-4",
					"bg-neutral-300/12",
					"bg-blend-soft-light",
				)}
				suppressHydrationWarning
			>
				Atlasfile @ {url.toString()}
			</h2>
			<article
				className={clsx(
					"card",
					"border-1",
					"rounded-lg",
					"p-1",
					"border-info/80",
					"border-double",
					"bg-neutral/20",
					"bg-blend-soft-light",
					"min-h-24",
					"min-w-16",
				)}
			>
				<header className={clsx("card-title")}>
					<h3>AtlasRoutes</h3>
				</header>
				<pre className="overflow-x-auto card-body">
					<Suspense
						fallback={
							<section
								className={clsx([
									"card-body",
									"min-w-64",
									"min-h-12",
									"flex",
									"flex-col",
									"gap-4",
									"items-center",
									"justify-center",
									"bg-neutral-300/12",
									"bg-blend-soft-light",
								])}
							>
								<span
									className={clsx(
										"font-bold",
										"text-lg",
										"text-accent-content",
										"animate-pulse",
									)}
								>
									{formatMessage({
										id: "atlas.$MagmapAtlas.loading",
										defaultMessage: "Loading",
										description: "Loading Atlas",
									})}
								</span>
								<Loading
									className={clsx(
										"bg-clip-content",
										"stroke-accent",
										"fill-primary",
										"text-accent-content",
										"blur-2xl",
										"w-14",
										"animate-[loader]",
										"duration-500",
										"delay-700",
										"ease-out",
									)}
									variant="dots"
									size="lg"
								/>
							</section>
						}
					>
						<ErrorBoundary
							FallbackComponent={({ error, resetErrorBoundary }) => (
								<>
									<Alert
										className={clsx("text-error-content", "py-[-2]")}
										color={"error"}
									>
										<h3 className={clsx("font-bold", "text-md", "md:text-lg")}>
											{formatMessage({
												id: "atlas.$MagmapAtlas.error.title",
												defaultMessage: "Error loading atlasfile",
												description: "$MagmapAtlas: Error boundary heading",
											})}
										</h3>
										<p className={clsx("hidden", "md:block")}>
											{formatMessage({
												id: "atlas.$MagmapAtlas.error.content",
												defaultMessage: "Could not fetch atlasfile.",
											})}
										</p>
										<Button
											onClick={resetErrorBoundary}
											color={"error"}
											variant={"link"}
										>
											{formatMessage({
												id: "atlas.$MagmapAtlas.error.refresh",
												defaultMessage: "Refresh",
											})}
										</Button>
									</Alert>

									<details className={clsx("w-full")}>
										<summary>
											{formatMessage({
												id: "atlas.$MagmapAtlas.error.summary",
												defaultMessage: "Click to view details",
											})}
										</summary>
										<p
											className={clsx(
												"text-end",
												"ml-2",
												"w-11/12",
												"bg-gray-900",
												"text-gray-200",
												"pt-2",
												"pb-1",
												"pr-1.5",
												"font-mono",
											)}
										>
											{JSON.stringify(serializeError(error))}
										</p>
									</details>
								</>
							)}
							onReset={revalidate}
						>
							{active ? (
								<Await resolve={fetchPromise}>
									{(response) => {
										const { data } = response ?? {};
										return JSON.stringify(data ?? {}, null, 2);
									}}
								</Await>
							) : (
								<></>
							)}
						</ErrorBoundary>
					</Suspense>
				</pre>
			</article>
		</>
	);
};
