import clsx from "clsx";
import type { CSSProperties } from "hono/jsx";
import { jsxRenderer } from "hono/jsx-renderer";
import { Link, Script } from "honox/server";
import { ApplicationHead } from "../variant/ApplicationHead";

const foafStyle: CSSProperties = {
	display: "none",
	pointerEvents: "none",
	touchAction: "none",
	position: "fixed",
	visibility: "hidden",
	width: 0,
	height: 0,
	top: 0,
	left: 0,
	zIndex: -1,
};

export default jsxRenderer(({ children }) => {
	return (
		<html className={clsx("overflow-x-hidden", "overscroll-contain")} lang="en">
			{/* <!-- Root --> */}
			<head>
				{/* <!-- Head --> */}
				<title>{ApplicationHead.title.default}</title>
				<meta
					name="description"
					content={ApplicationHead.description[0] ?? ""}
				/>
				<meta charSet="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<link rel="icon" href={"/favicon.ico"} type="image/png" />
				<script type="module" src="/_window/oidc.js" />
				<Script src="/app/client.ts" />
				<Link href="/app/style.css" rel="stylesheet" />
			</head>
			{/* <!-- Body --> */}
			{children}
			<object
				suppressHydrationWarning
				typeof="foaf:Document"
				style={foafStyle}
				aria-hidden
				data-base-uri={ApplicationHead.metadataBase?.href}
				data-meta-base-url={import.meta.env.BASE_URL}
				data-open-graph-url={ApplicationHead.openGraph.url}
				data-rendered={new Date().toISOString()}
			/>
		</html>
	);
});
