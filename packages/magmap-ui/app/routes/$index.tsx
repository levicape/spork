import { Effect } from "effect";
import { Suspense, useCallback, useMemo, useState } from "hono/jsx";

const waitFor = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

export const App = async () => {
	const [count, setCount] = useState(0);

	const task = useMemo(
		() => Effect.sync(() => setCount((current) => current + 1)),
		[],
	);

	const increment = useCallback(() => Effect.runSync(task), [task]);

	await waitFor(3400);

	return (
		<Suspense
			fallback={
				<div className="card backdrop-blur-3xl bg-amber-300 border-8 rounded-lg">
					<p>Loading...</p>
				</div>
			}
		>
			<main>
				<h2 className={"text-2xl"}>hmr + Hono/jsx</h2>
				<button type={"button"} onClick={increment}>
					count is {count}
				</button>
				<div className="card backdrop-blur-3xl bg-amber-300 border-8 rounded-lg">
					<p>
						Edit <code>src/App.tsx</code>
					</p>
				</div>
			</main>
		</Suspense>
	);
};
