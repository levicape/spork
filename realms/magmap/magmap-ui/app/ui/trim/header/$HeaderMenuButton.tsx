import { clsx } from "clsx";
import {
	type FC,
	type PropsWithChildren,
	useCallback,
	useContext,
} from "hono/jsx";
import { useOidcClient } from "../../../atoms/authentication/OidcClientAtom";
import { useFormatMessage } from "../../../atoms/localization/I18nAtom";
import { Button } from "../../daisy/action/Button";
import { HeaderMenuOpenContextExport } from "./HeaderContext";

const HeaderMenuOpenContext = HeaderMenuOpenContextExport();

export type HeaderMenuButtonProps = {
	className?: string;
};

export const HeaderMenuButton: FC<PropsWithChildren<HeaderMenuButtonProps>> = (
	props,
) => {
	const { user } = useOidcClient();
	const formatMessage = useFormatMessage();
	const [menuOpen, setHeaderMenuOpen] = useContext(HeaderMenuOpenContext);

	const { className, children } = props;

	const menuButtonOnClick = useCallback(() => {
		setHeaderMenuOpen();
	}, [setHeaderMenuOpen]);

	return (
		<Button
			role={"menubar"}
			aria-label={formatMessage({
				id: "ui.trim.header.menu.button.aria-label",
				defaultMessage: "Open Navigation Menu",
				description: "aria-label for HeaderMenuButton",
			})}
			color={"neutral"}
			variant={"ghost"}
			square
			className={clsx(
				menuOpen ? "invisible" : "visible",
				user ? clsx("opacity-100") : clsx("opacity-0"),
				className,
			)}
			onClick={menuButtonOnClick}
		>
			{children}
		</Button>
	);
};
