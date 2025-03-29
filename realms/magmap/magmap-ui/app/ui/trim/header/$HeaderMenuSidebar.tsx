import clsx from "clsx";
import {
	type FunctionComponent,
	type MouseEventHandler,
	type PropsWithChildren,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
} from "react";
import { env } from "std-env";
import { useFormatMessage } from "../../../atoms/localization/I18nAtom";
import { LanguageDropdown } from "../../../atoms/localization/input/$LanguageDropdown";
import { ApplicationHead } from "../../../variant/ApplicationHead";
import { Link } from "../../daisy/navigation/Link";
import { DaisyMenu, DaisyMenuItem } from "../../daisy/navigation/Menu";
import { QuestionMark_Icon } from "../../display/icons/QuestionMark";
import { RightArrow_Icon } from "../../display/icons/RightArrow";
import { HeaderMenuOpenContextExport } from "./HeaderContext";

const HeaderMenuOpenContext = HeaderMenuOpenContextExport();

const ARTIFACT_VERSION = env.ARTIFACT_VERSION;

interface HeaderMenuLinkProps {
	href: string;
	messageI18nId: string;
	i18nDescription: string;
	icon: ReactNode;
}

const HeaderMenuListItem: FunctionComponent<PropsWithChildren> = ({
	children,
}) => {
	return (
		<DaisyMenuItem
			className={clsx(
				"border-y-1",
				"group",
				"cursor-pointer",
				"border-dotted",
				"border-neutral-content/30",
				"text-primary-content",
				"hover:border-spacing-4",
				"hover:border-double",
				"hover:bg-secondary-content",
				"hover:text-secondary",
			)}
		>
			{children}
		</DaisyMenuItem>
	);
};

const HeaderMenuLink: FunctionComponent<HeaderMenuLinkProps> = ({
	href,
	messageI18nId,
	i18nDescription,
	icon,
}) => {
	const formatMessage = useFormatMessage();
	const [, setHeaderMenuOpen] = useContext(HeaderMenuOpenContext);
	return (
		<Link
			role={"menuitem"}
			href={href}
			onClick={() => setHeaderMenuOpen(false)}
		>
			<HeaderMenuListItem>
				<div className={clsx("flex", "cursor-[inherit]")}>
					{icon}
					<span className={clsx("grow", "cursor-[inherit]")}>
						{formatMessage({
							id: messageI18nId,
							description: i18nDescription,
						})}
					</span>
					<div
						className={clsx(
							"h-6",
							"w-6",
							"cursor-[inherit]",
							"opacity-20",
							"transition-opacity",
							"will-change-[opacity]",
							"group-hover:opacity-100",
							"transform-3d",
						)}
					>
						<RightArrow_Icon />
					</div>
				</div>
			</HeaderMenuListItem>
		</Link>
	);
};

export const HeaderMenuSidebar: FunctionComponent<{ className?: string }> = ({
	className,
}) => {
	const [menuOpen, setMenuOpen] = useContext(HeaderMenuOpenContext);

	const preventDefault: MouseEventHandler<HTMLElement> = useCallback(
		(event) => {
			event.preventDefault();
		},
		[],
	);

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() === "escape") {
				setMenuOpen(false);
			}
		};

		if (menuOpen) {
			document.addEventListener("keydown", handler);
		}

		return () => {
			document.removeEventListener("keydown", handler);
		};
	}, [menuOpen, setMenuOpen]);

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents:
		<div
			className={clsx(
				"fixed",
				"bottom-0",
				"left-0",
				"right-0",
				"top-0",
				"z-50",
				"w-64",
				"border-t-0",
				"bg-base-200",
				"transform-gpu",
				menuOpen
					? clsx("visible", "translate-x-0")
					: clsx("invisible", "-translate-x-64"),
				"transition-[transform,translate,visibility]",
				"will-change-[transform,translate,visibility]",
				className,
			)}
			onClick={preventDefault}
		>
			<div
				className={clsx("mb-0", "flex", "justify-center", "py-2", "shadow-md")}
			>
				{ApplicationHead.title.default}
			</div>
			<div>
				<div className={clsx("px-2", "pb-2", "pt-1")}>
					<LanguageDropdown />
				</div>
				<hr className={clsx("border-accent/10", "border-y-1")} />
				<nav>
					<DaisyMenu className={clsx("p-0", "w-full")}>
						<HeaderMenuLink
							href={"/help/rules"}
							messageI18nId={"lobby.howtoplay.header"}
							i18nDescription={"How to play"}
							icon={<QuestionMark_Icon />}
						/>
					</DaisyMenu>
				</nav>
				<aside className={clsx("absolute", "bottom-0", "w-full")}>
					<DaisyMenu className={clsx("p-0", "w-full")} size={"sm"}>
						<HeaderMenuListItem>
							<div className={clsx("flex", "justify-center")}>
								{new Date().getFullYear()}
								<Link color={"primary"} hover href={"https://github.com/atoko"}>
									<object className={"inline"}>Pedro Cardona</object>
								</Link>
							</div>
						</HeaderMenuListItem>
						<HeaderMenuListItem>
							<p>{ARTIFACT_VERSION ? `v${ARTIFACT_VERSION}` : ""}</p>
						</HeaderMenuListItem>
					</DaisyMenu>
				</aside>
			</div>
		</div>
	);
};
