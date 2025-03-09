import type { FC, PropsWithChildren } from "hono/jsx";
import { Fragment } from "hono/jsx";
import { DesignSystem } from "./DesignSystem";

const HeaderRoot: FC<PropsWithChildren> = ({ children }) => (
	<Fragment>
		<header className="flex px-4 py-2 m-0">
			<h1 className="text-xl py-0 text-amber-100">MagMap</h1>
		</header>
		<nav
			className={"absolute right-0 top-0 z-10 flex gap-4 px-4 py-2"}
			aria-label="Main navigation"
		>
			<ul className={"flex gap-4"}>
				<li>
					<a href="/">Home</a>
				</li>
				<li>
					<a href="/about">About</a>
				</li>
			</ul>
		</nav>
		{children}
	</Fragment>
);

export const AppBody: FC<PropsWithChildren> = ({ children }) => (
	<body>
		<DesignSystem>
			<HeaderRoot>{children}</HeaderRoot>
		</DesignSystem>
	</body>
);
