import { type FC, Fragment, type PropsWithChildren } from "hono/jsx";

export const Appshell: FC<PropsWithChildren> = ({ children }) => (
	<Fragment>{children}</Fragment>
);
