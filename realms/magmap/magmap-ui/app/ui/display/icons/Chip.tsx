import { clsx } from "clsx";
import type { FC } from "hono/jsx";

export type Chip_IconProps = {
	className?: string;
	viewBox?: `${number} ${number} ${number} ${number}`;
	width?: `w-${string}`;
	height?: `h-${string}`;
	fill?: `fill-${string}`;
	stroke?: `stroke-${string}`;
};

const getClassName = ({
	className,
	width,
	height,
	fill,
	stroke,
}: Chip_IconProps) => {
	return clsx(
		width ?? "w-6",
		height ?? "h-6",
		fill ?? "fill-current",
		stroke ?? "stroke-none",
		"cursor-[inherit]",
		className,
	);
};

export const Chip_Icon: FC<Chip_IconProps> = (props) => {
	const { viewBox } = props;

	return (
		<svg
			role={"img"}
			aria-label={"Computer chip icon"}
			xmlns="http://www.w3.org/2000/svg"
			viewBox={viewBox ?? "0 0 24 24"}
			className={getClassName(props)}
		>
			<path d="M16.5 7.5h-9v9h9v-9z" />
			<path
				fillRule="evenodd"
				d="M8.25 2.25A.75.75 0 019 3v.75h2.25V3a.75.75 0 011.5 0v.75H15V3a.75.75 0 011.5 0v.75h.75a3 3 0 013 3v.75H21A.75.75 0 0121 9h-.75v2.25H21a.75.75 0 010 1.5h-.75V15H21a.75.75 0 010 1.5h-.75v.75a3 3 0 01-3 3h-.75V21a.75.75 0 01-1.5 0v-.75h-2.25V21a.75.75 0 01-1.5 0v-.75H9V21a.75.75 0 01-1.5 0v-.75h-.75a3 3 0 01-3-3v-.75H3A.75.75 0 013 15h.75v-2.25H3a.75.75 0 010-1.5h.75V9H3a.75.75 0 010-1.5h.75v-.75a3 3 0 013-3h.75V3a.75.75 0 01.75-.75zM6 6.75A.75.75 0 016.75 6h10.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75H6.75a.75.75 0 01-.75-.75V6.75z"
				clipRule="evenodd"
			/>
		</svg>
	);
};
