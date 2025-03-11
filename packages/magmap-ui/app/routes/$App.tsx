import { Suspense, use, useCallback, useMemo, useState } from "react";
import { SuspenseGuard } from "../ui/Client";
import { DesignSystem } from "../ui/DesignSystem";

const ExpensiveComponent = ({ wait }: { wait: Promise<unknown> }) => {
	SuspenseGuard();

	const [count, setCount] = useState(0);
	const increment = useCallback(() => setCount((current) => current + 1), []);

	use(wait);
	return (
		<>
			<header>
				<h3>Async Component Loaded, no need to keep an isLoading state!</h3>
			</header>
			<footer className="pt-4 pb-2">
				<button
					className="btn btn-wide btn-primary"
					type={"button"}
					onClick={increment}
				>
					count is {count}
				</button>
			</footer>
		</>
	);
};

const Content = ({
	wait,
}: {
	wait: Promise<unknown>;
}) => {
	SuspenseGuard();

	return (
		<section className="card p-2 bg-ironstone-300 border-8 rounded-lg">
			<ExpensiveComponent wait={wait} />
		</section>
	);
};

export const App = () => {
	const wait = useMemo(
		() =>
			new Promise((resolve) => {
				setTimeout(resolve, 2000);
			}),
		[],
	);

	return (
		<article>
			<h2>{"Cloudscape <3 HonoX"}</h2>
			<Suspense fallback={<DesignSystem.Fallback />}>
				<Content wait={wait} />
			</Suspense>
		</article>
	);
};
