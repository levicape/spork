import { Effect } from "effect";
import { useCallback, useMemo, useState } from "hono/jsx";

export const App = () => {
	const [count, setCount] = useState(0);

	const task = useMemo(
		() => Effect.sync(() => setCount((current) => current + 1)),
		[setCount],
	);

	const increment = useCallback(() => Effect.runSync(task), [task]);

	return (
		<>
			<h1 className={"text-2xl"}>hmm + Hono/jsx</h1>
			<button type={"button"} onClick={increment}>
				count is {count}
			</button>
			<div className="card">
				<button type={"button"} onClick={() => setCount((count) => count + 1)}>
					count is {count}
				</button>
				<p>
					Edit <code>src/App.tsx</code> and save to test HMR
				</p>
			</div>
		</>
	);
};
