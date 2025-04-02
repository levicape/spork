/**
 * Configures the location, project name and stack name of the Pulumi stacks
 */
export const CODECATALYST_PULUMI_STACKS: Array<{
	/**
	 * Path to stack from "iac/stacks" directory
	 */
	stack: string;
	/**
	 * Name of the stack for use in pulumi
	 */
	name?: string;
	/**
	 * Whether this stack should only be deployed if APPLICATION_IMAGE_NAME matches APPLICATION_STACKREF_ROOT
	 */
	root?: boolean;
	/**
	 * The name of the stack for use in output shell exports. Automatically derived from the stack name if not provided
	 */
	output: string;
}> = (
	[
		{
			stack: "application",
			root: true,
		},
		{
			stack: "codestar",
			root: true,
		},
		{
			stack: "datalayer",
			root: true,
		},
		{
			stack: "dns/root",
			name: "dns-root",
			root: true,
		},
		{
			stack: "idp/oidc",
			name: "idp-oidc",
			root: true,
		},
		{
			stack: "idp/users",
			name: "idp-users",
			root: true,
		},
		{
			stack: "levicape/magmap/channels",
			name: "magmap-channels",
		},
		{
			stack: "levicape/magmap/client",
			name: "magmap-client",
		},
		{
			stack: "http",
			root: true,
		},
		{
			stack: "levicape/magmap/http",
			name: "magmap-http",
		},
		{
			stack: "levicape/magmap/web",
			name: "magmap-web",
		},
		{
			stack: "levicape/magmap/monitor",
			name: "magmap-monitor",
		},
		{
			stack: "levicape/magmap/wwwroot",
			name: "magmap-wwwroot",
		},
	] as const
).map((stack) => ({ ...stack, output: stack.stack.replaceAll("/", "_") }));
