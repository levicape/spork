import type { Context } from "hono";
import { App } from "./index/$App.tsx";

export default async function Home(_c: Context) {
	return (
		<main className="hero">
			<App />
		</main>
	);
}
