import { process } from "std-env";
export const ApplicationName = "Magmap";

export const ApplicationHead = {
	title: {
		template: `%s | ${ApplicationName}`,
		default: ApplicationName,
	},
	description: [
		"Server operations. All here.",
		"Visualize and observe Spork services.",
	],
	metadataBase:
		(process?.env.URL !== undefined && new URL(process.env.URL)) || undefined,
	openGraph: {
		type: "website",
		title: ApplicationName,
		url: process.env.URL,
		images: [`${process.env.URL}/static/social/splash.png`],
	},
	footer: {
		default: `Levicape ${new Date().getFullYear()}`,
	},
} as const;
