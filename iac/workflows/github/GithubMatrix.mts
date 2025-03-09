import type {
	CodeCatalystComputeSpec,
	CodeCatalystWorkflowExpressions,
} from "@levicape/fourtwo/codecatalyst";
import type { GithubOn } from "@levicape/fourtwo/github";

const ENVIRONMENT = "elm_pst_3";
export const GITHUB_CI_MATRIX = [
	{
		name: "Dispatch: Preview, Deploy, Push",
		region: "us-west-2",
		triggers: {
			workflow_dispatch: {},
		} satisfies GithubOn,
		pipeline: {
			install: undefined as unknown as GithubWorkflowProps<
				boolean,
				boolean
			>["pipeline"]["install"],
			environment: {
				name: ENVIRONMENT,
			},
			preview: true as const,
			deploy: true as const,
			push: true as const,
		},
	},
	{
		name: "on Schedule: Preview, Deploy",
		region: "us-west-2",
		triggers: {
			schedule: [
				{
					cron: "0 0 * * *",
				},
			],
		} satisfies GithubOn,
		pipeline: {
			install: undefined as unknown as GithubWorkflowProps<
				boolean,
				boolean
			>["pipeline"]["install"],
			environment: {
				name: ENVIRONMENT,
			},
			preview: true as const,
			deploy: true as const,
			push: false as const,
		},
	},
	{
		name: "Dispatch: Preview",
		region: "us-west-2",
		triggers: {
			workflow_dispatch: {},
		} satisfies GithubOn,
		pipeline: {
			install: undefined as unknown as GithubWorkflowProps<
				boolean,
				boolean
			>["pipeline"]["install"],
			environment: {
				name: ENVIRONMENT,
			},
			preview: true as const,
			deploy: false as const,
			push: false as const,
		},
	},
	{
		name: "Dispatch: Delete",
		region: "us-west-2",
		triggers: {
			workflow_dispatch: {},
		} satisfies GithubOn,
		pipeline: {
			install: undefined as unknown as GithubWorkflowProps<
				boolean,
				boolean
			>["pipeline"]["install"],
			environment: {
				name: ENVIRONMENT,
			},
			preview: true as const,
			delete: true as const,
		},
	},
].map((ci) => {
	ci.pipeline.install = {
		npm: {
			LEVICAPE: {
				scope: "@levicape",
				token: ({ current: { context: _$_ } }) => {
					return _$_("Secrets.GITHUB_LEVICAPE_PAT");
				},
				protocol: "https",
				host: "npm.pkg.github.com",
			},
		},
	};
	return ci;
}) satisfies Array<GithubWorkflowProps<boolean, boolean>>;

export type GithubWorkflowProps<
	Preview extends boolean,
	Deploy extends boolean,
> = {
	name: string;
	region: string;
	triggers: GithubOn;
	compute?: CodeCatalystComputeSpec;
	pipeline: {
		install: {
			npm: Record<
				string,
				{
					scope: string;
					token: (
						expresssions: typeof CodeCatalystWorkflowExpressions,
					) => string;
					protocol: string;
					host: string;
				}
			>;
		};
	} & (Preview extends true
		? {
				environment: {
					name: string;
				};
				preview: Preview;
				deploy?: Deploy;
			}
		: {
				environment: {
					name: string;
				};
				preview: Preview;
				deploy?: false;
			}) &
		(Deploy extends true
			? {
					push?: boolean;
					delete?: false;
				}
			: {
					push?: false;
					delete?: boolean;
				});
};
