import { jsxRenderer } from "hono/jsx-renderer";
import { Link, Script } from "honox/server";
import { Appshell } from "../Appshell.tsx";

export default jsxRenderer(({ children }, c) => {
	return (
		<html lang="en">
			{/* <!-- React-Helmet-Async-SSR --> */}
			<head>
				<meta charSet="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<Script
					src="/app/client.ts"
					async
					nonce={c.get("secureHeadersNonce")}
				/>
				<Link href="/app/style.css" rel="stylesheet" />
				<Link href="/app/routes/index.css" rel="stylesheet" />
			</head>
			<body>
				<Appshell>{children}</Appshell>
			</body>
		</html>
	);
});
