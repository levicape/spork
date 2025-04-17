import type { MagmapHonoApp } from "@levicape/spork-magmap-io/http/HonoApp";
import clsx from "clsx";
import { destr } from "destr";
import { hc } from "hono/client";
import {
	ErrorBoundary,
	type FC,
	Fragment,
	Suspense,
	use,
	useCallback,
	useMemo,
	useState,
} from "hono/jsx";
import { deserializeError, serializeError } from "serialize-error";
import {
	type OidcFetch,
	useOidcClient,
} from "../../atoms/authentication/OidcClientAtom";
import { useFormatMessage } from "../../atoms/localization/I18nAtom";
import { SUSPENSE_GUARD } from "../../ui/ClientSuspense";
import { Button } from "../../ui/daisy/action/Button";
import { Alert } from "../../ui/daisy/feedback/Alert";
import { Loading } from "../../ui/daisy/feedback/Loading";
// import { Button } from "../../ui/daisy/action/Button";
// import { Alert } from "../../ui/daisy/feedback/Alert";
// import { Loading } from "../../ui/daisy/feedback/Loading";

declare global {
	interface Window {
		"--magmap-revalidate"?: () => void;
		"--magmap-debug"?: boolean;
	}
}

const windowLocation = typeof location !== "undefined" ? location.origin : "";
const ServiceClient = hc<MagmapHonoApp>(windowLocation);
type GetProps = {
	oidcFetch: OidcFetch;
	userReady: boolean | null;
};
export const get__ = async (props: GetProps) => {
	const { userReady, oidcFetch } = props;
	const debugEnabled =
		typeof window !== "undefined" ? window["--magmap-debug"] : undefined;

	if (!userReady || typeof window === "undefined") {
		throw SUSPENSE_GUARD;
	}

	let url: URL | undefined;
	try {
		url = ServiceClient["~"].Spork.Magmap.atlas.$url();
		const data = await ServiceClient["~"].Spork.Magmap.atlas.$get(
			{},
			{
				fetch: oidcFetch,
			},
		);
		let response = (await data.text()) as unknown as Awaited<
			ReturnType<(typeof data)["json"]>
		>;
		debugEnabled &&
			console.log({
				ServiceClient: {
					atlasfiles: data.status,
					response,
				},
			});

		if (typeof response === "string") {
			response = destr(response);
		}

		const maybeError = (response as { error?: unknown }).error;
		const isErrorStatus = data.status > 401;
		if (isErrorStatus || maybeError !== undefined) {
			throw {
				FetchError: {
					message: `Response ${data.status}: ${data.statusText}`,
					url,
					response,
					error: maybeError,
				},
			};
		}

		if (data.status === 401) {
			throw {
				Unauthorized: {
					message: `Unauthorized ${data.status} ${data.statusText}`,
					url,
					response,
				},
			};
		}

		return response as typeof response & { error?: never };
	} catch (error) {
		const message = `Fetching ${url}`;
		console.warn({
			ServiceClient: {
				message,
				error: serializeError(error),
			},
		});

		throw new Error(message, { cause: deserializeError(error) });
	}
};

const Loader = () => {
	const formatMessage = useFormatMessage();
	return (
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
					id: "nevada.loading",
					defaultMessage: "Loading",
					description: "Loading",
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
	);
};

const AtlasData: FC<{
	data: ReturnType<typeof get__>;
}> = ({ data }) => {
	const response = use(data);
	if (response.error) {
		throw response.error;
	}

	return (
		<pre className="overflow-x-auto card-body">
			<code className={clsx("overflow-x-auto")}>
				{JSON.stringify(response, null, 2)}
			</code>
		</pre>
	);
};

// type MagmapAtlasfile = Awaited<ReturnType<typeof GetMagmapAtlasfile>>;
export const MagmapAtlas = () => {
	const [revalidate, setRevalidate] = useState(Date.now());
	const { userReady, oidcFetch } = useOidcClient();
	const formatMessage = useFormatMessage();
	const data = useMemo(() => {
		return get__({
			oidcFetch,
			userReady,
		});
	}, [revalidate, oidcFetch, userReady]);

	const onRetry = useCallback(() => {
		setRevalidate(Date.now());
	}, [setRevalidate]);

	return (
		<ErrorBoundary
			fallbackRender={(error) => {
				if ((error as unknown) === SUSPENSE_GUARD) {
					return <Loader />;
				}

				const stack = error?.stack;
				if (error instanceof Error) {
					error.stack = undefined;
				}
				return (
					<Fragment>
						<Alert
							className={clsx("text-error-content", "-py-2")}
							color={"error"}
						>
							<h3 className={clsx("font-bold", "text-md", "md:text-lg")}>
								{formatMessage({
									id: "atlas.$MagmapAtlas.error.title",
									defaultMessage: "Error loading",
									description: "Error boundary heading",
								})}
							</h3>
							<p className={clsx("hidden", "md:block")}>
								{formatMessage({
									id: "atlas.$MagmapAtlas.error.content",
									defaultMessage: "Could not fetch",
								})}
							</p>
							<div className={clsx("size-1", "invisible")} />
							<Button color={"error"} variant={"link"} onClick={onRetry}>
								{formatMessage({
									id: "atlas.$MagmapAtlas.error.refresh",
									defaultMessage: "Refresh",
								})}
							</Button>
						</Alert>

						<details className={clsx("w-full")}>
							<summary className={clsx("text-sm")}>
								{formatMessage({
									id: "atlas.$MagmapAtlas.error.summary",
									defaultMessage: "Click to view details",
								})}
							</summary>
							<textarea
								contentEditable={false}
								className={clsx(
									"ml-2",
									"w-11/12",
									"bg-gray-950",
									"text-gray-50",
									"border-b-1",
									"border-x-1",
									"border-error/30",
									"border-s",
									"shadow-xs",
									"pt-2",
									"pb-2.5",
									"pr-1.5",
									"pl-0.5",
									"m-w-54",
									"whitespace-pre-wrap",
									"text-md",
									"font-mono",
									"min-h-8",
								)}
							>
								{JSON.stringify(serializeError(error), null, 4)}
							</textarea>
							{stack ? (
								<textarea
									contentEditable={false}
									className={clsx(
										"block",
										"text-end",
										"mt-3.5",
										"ml-2",
										"w-11/12",
										"bg-gray-200/80",
										"bg-blend-color-burn",
										"text-error",
										"border-t-1",
										"border-x-2",
										"border-accent/20",
										"shadow-md",
										"pt-1",
										"pb-2",
										"pr-1",
										"pl-0.5",
										"m-w-54",
										"whitespace-pre-wrap",
										"text-md",
										"font-mono",
										"min-h-14",
									)}
								>
									{stack}
								</textarea>
							) : (
								<></>
							)}
						</details>
					</Fragment>
				);
			}}
		>
			<Suspense fallback={<Loader />}>
				<AtlasData data={data} />
			</Suspense>
		</ErrorBoundary>
	);
};
