import { Effect } from "effect";
import type { Context } from "hono";

export default async function Home(_c: Context) {
	const rendered = Date.now();

	await Effect.runPromise(
		Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 1200))),
	);
	return (
		<main>
			<article className={"hidden"} suppressHydrationWarning>
				<small>{rendered}</small>
			</article>
			<article>
				<h1>About</h1>
			</article>
		</main>
	);
}
