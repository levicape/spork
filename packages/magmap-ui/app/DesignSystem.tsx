import type { FC, PropsWithChildren } from "hono/jsx";
import { Fragment } from "hono/jsx";

export const DesignSystem: FC<PropsWithChildren> = ({ children }) => (
	<Fragment>{children}</Fragment>
);
