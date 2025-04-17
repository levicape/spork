import clsx from "clsx";
import type { Context } from "hono";
import { Fragment } from "hono/jsx/jsx-runtime";
import { MagmapAtlas } from "./$MagmapAtlas";

export default function AtlasPage(_c: Context) {
	return (
		<main>
			<Fragment>
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
					{"Nevada"}
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
						<h3>Magmap Atlas</h3>
						<MagmapAtlas />
					</header>
				</article>
			</Fragment>
		</main>
	);
}
