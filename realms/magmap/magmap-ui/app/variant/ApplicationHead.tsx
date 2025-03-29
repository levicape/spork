import { process } from "std-env";
export const ApplicationName = "Magmap";

export const ApplicationHead = {
	title: {
		template: `%s | ${ApplicationName}`,
		default: ApplicationName,
	},
	description:
		"Magmap is a web-based user interface for querying a Spork server's configuration and state.",
	metadataBase:
		(process?.env.URL !== undefined && new URL(process.env.URL)) || undefined,
	openGraph: {
		type: "website",
		title: ApplicationName,
		url: process.env.URL,
		images: [`${process.env.URL}/static/social/splash.png`],
	},
} as const;
