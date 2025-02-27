import type { Context } from "hono";
import { App } from "./$index.tsx";

export default function Home(_c: Context) {
	return <App />;
}
