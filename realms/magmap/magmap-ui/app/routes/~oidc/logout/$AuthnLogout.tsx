import { useEffect, useMemo } from "react";
import { useOidcClient } from "../../../atoms/authentication/OidcClientAtom";

export const AuthnLogout = () => {
	const { oidc } = useOidcClient();
	const { enabled: discordEnabled } = {} as Record<string, unknown>; //useDiscord();

	useEffect(() => {
		if (!discordEnabled) {
			console.debug({
				AuthnLogout: {
					message: "Processing logout callback",
				},
			});

			oidc?.userManager.signoutCallback().finally(async () => {
				let signoutError: unknown;
				try {
					await oidc?.userManager.clearStaleState();
				} catch (error) {
					signoutError = error;
				}
				console.debug({
					AuthnLogout: {
						message: "Navigating to root after sign-out",
						signoutError,
					},
				});
				setTimeout(
					() => {
						location.replace("/");
						setTimeout(() => {
							location.reload();
						}, 3);
					},
					Math.random() * 100 + 20,
				);
			});
		}
	}, [oidc, discordEnabled]);

	const style: React.CSSProperties = useMemo(
		() => ({
			display: "none",
			pointerEvents: "none",
			touchAction: "none",
			position: "fixed",
			visibility: "hidden",
			width: 0,
			height: 0,
			top: 0,
			left: 0,
			zIndex: -1,
		}),
		[],
	);

	return (
		<object
			aria-hidden
			style={style}
			typeof={"AuthnLogout"}
			data-oidc={oidc ? "true" : "false"}
			suppressHydrationWarning
		/>
	);
};
