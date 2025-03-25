/** @jsxImportSource @levicape/fourtwo */
/** @jsxRuntime automatic */
import {
	GithubJobX,
	GithubStepCheckoutX,
	GithubStepNodeInstallX,
	GithubStepNodeSetupX,
	GithubStepX,
	GithubWorkflowExpressions,
	GithubWorkflowX,
} from "@levicape/fourtwo/github";
import { CODECATALYST_PULUMI_STACKS } from "../../PulumiStacks.mts";
import {
	GITHUB_CI_MATRIX,
	type GithubWorkflowProps,
} from "../GithubMatrix.mjs";
const {
	current: { register, context: _$_, env, secret },
} = GithubWorkflowExpressions;

const APPLICATION = "spork";
const PUSH_IMAGE_ECR_STACK_OUTPUT = "spork_codestar_ecr";
const OUTPUT_PULUMI_PATH = "_pulumi";
const RUNS_ON = "act-darwin-a64-atoko";
const FOURTWO_BIN = "pnpm exec fourtwo";

export const NodeGhaConfiguration = ({
	env: e,
	secret,
	cache,
}: { env: typeof env; secret?: string; cache?: boolean }) =>
	({
		packageManager: {
			node: "pnpm",
			cache: !!(cache === undefined || cache === true),
		},
		registry: {
			scope: "@levicape",
			/**
			 * @see iac/stacks/codestar
			 */
			host: `${e("NPM_REGISTRY_PROTOCOL_LEVICAPE")}://${e("NPM_REGISTRY_HOST_LEVICAPE")}`,
			secret,
		},
		version: {
			node: "22.13.0",
		},
	}) as const;

const DEPLOY_PREAMBLE = [
	"echo '@levicape/fourtwo:'",
	"ls -la node_modules/@levicape/fourtwo || true",
	"cat node_modules/@levicape/fourtwo/package.json || true",
];

const cd = (matrix: GithubWorkflowProps<boolean, boolean>) => {
	return (
		<GithubWorkflowX
			name={matrix.name}
			on={matrix.triggers}
			env={{
				...Object.entries(matrix.pipeline.install.npm)
					.map(([name, npm]) => [name.toUpperCase(), npm] as const)
					.reduce(
						(acc, [name, npm]) => ({
							...acc,
							...register(`NPM_REGISTRY_PROTOCOL_${name}`, npm.protocol),
							...register(`NPM_REGISTRY_HOST_${name}`, npm.host),
							...register(
								`NPM_TOKEN_${name}`,
								npm.token(GithubWorkflowExpressions),
							),
						}),
						{},
					),
				...register("NPM_DEFAULT", _$_("vars.NPM_MIRROR")),
				...register("LEVICAPE_REGISTRY_HOST", "npm.pkg.github.com/"),
				...register("LEVICAPE_REGISTRY", "https://npm.pkg.github.com"),
				...register("LEVICAPE_TOKEN", secret("GITHUB_TOKEN")),
				...register("NODE_NO_WARNINGS", "1"),
				...register("NPM_CONFIG_UPDATE_NOTIFIER", "false"),
				...register("FRONTEND_HOSTNAME", `at.levicape.cloud`),
				...register(
					"PULUMI_CONFIG_PASSPHRASE",
					secret("PULUMI_CONFIG_PASSPHRASE"),
				),
				...register("APPLICATION_IMAGE_NAME", APPLICATION),
				...register("CI_ENVIRONMENT", matrix.pipeline.environment.name),
				...register("AWS_PAGER", ""),
				...register("AWS_REGION", matrix.region),
				...register("AWS_PROFILE", matrix.pipeline.environment.name),
				...register("PULUMI_STACK_FILTER", _$_("vars.STACK_FILTER")),
				...register("DOCKER_NO_IMAGE", _$_("vars.NO_IMAGE")),
			}}
		>
			{
				<GithubJobX
					id={
						matrix.pipeline.deploy
							? "deploy"
							: matrix.pipeline.delete
								? "delete"
								: "preview"
					}
					name={
						matrix.pipeline.deploy
							? "Deploy Pulumi Stacks"
							: matrix.pipeline.delete
								? "Delete Pulumi Stacks"
								: "Preview Pulumi Stacks"
					}
					runsOn={RUNS_ON}
					steps={
						<>
							<GithubStepCheckoutX />
							<GithubStepNodeSetupX
								configuration={NodeGhaConfiguration({ env, cache: true })}
							>
								{(node) => (
									<>
										{/* Verdaccio NPM mirror https://verdaccio.org */}
										<GithubStepX
											name="Set NPM Registry to Verdaccio:31313 or NPM_MIRROR"
											run={[
												"pnpm set registry ${NPM_DEFAULT:-http://localhost:31313}",
											]}
										/>
										{/* Install */}
										<GithubStepNodeInstallX {...node} />
										{/* Compile sources */}
										<GithubStepX
											name="Build image"
											run={[
												`if [ -z "\$DOCKER_NO_IMAGE" ]; then 
													pnpm exec nx pack:build iac-images-application --verbose; 
												fi`,
											]}
										/>
										{/* AWS CLI credentials */}
										<GithubStepX
											name="Verify AWS credentials"
											uses="aws-actions/configure-aws-credentials@v4"
											with={{
												"aws-region": "${{ env.AWS_REGION }}",
											}}
										/>
										{/* Pulumi state backend */}
										<GithubStepX
											name="Setup Pulumi state backend"
											run={[
												`echo "Retriving AWS credentials with ${FOURTWO_BIN} aws in $AWS_REGION"`,
												`${FOURTWO_BIN}`,
												`STRUCTURED_LOGGING=quiet ${FOURTWO_BIN} aws pulumi ci --region $AWS_REGION > .pulumi-ci`,
											]}
										/>
										<GithubStepX
											name="Display Pulumi CI output"
											run={["cat .pulumi-ci"]}
										/>
										<GithubStepX
											name="Extract exports from Pulumi CI"
											run={[`cat .pulumi-ci | grep "export" > .export-cd`]}
										/>
										<GithubStepX
											name="Load environment variables"
											run={["cat .export-cd"]}
										/>
										{/* Setup Pulumi helper functions */}
										<GithubStepX
											name="Create Pulumi Helper Functions"
											run={[
												`cat > .pulumi-helper.sh << 'EOF'
configure_stack() {
  local step="$1"
  local stack_name="$2"
  local stack_cwd="$3"
  local project="$4"
  local output="$5"

  echo "\${step}: Stack: \${stack_name}. CWD: \${stack_cwd}. Output: \${output}."
  echo "name: \${project}" >> "\${stack_cwd}/Pulumi.yaml"
  cat "\${stack_cwd}"/Pulumi.{yaml,"*".yaml} || true
}

setup_stack() {
  local stack_name="$1"
  local stack_cwd="$2"
  
  echo "Setting up stack: \${stack_name}. CWD: \${stack_cwd}."
  for cmd in init select; do
    pulumi stack \${cmd} \${stack_name} -C \${stack_cwd} || true
  done
}

configure_stack_settings() {
  local stack_cwd="$1"
  local configs="$2"
  
  echo "Configuring stack settings"
  
  while IFS= read -r line; do
    if [[ -n "$line" ]]; then
      key="\${line%%=*}"
      value="\${line#*=}"
      
      # Expand variables in value
      eval "value=\"$value\""
      
      if [[ -n "$key" && -n "$value" ]]; then
        echo "Setting $key to $value"
        pulumi config set --path "$key" "$value" -C "$stack_cwd"
      fi
    fi
  done <<< "$configs"
}

refresh_and_preview() {
  local message="$1"
  local stack_cwd="$2"
  shift 2
  local default_args="$@"

  pulumi refresh --yes --skip-preview --clear-pending-creates --message "\${message}-refresh" -C "\${stack_cwd}" \${default_args}
  pulumi preview --show-replacement-steps --message "\${message}-preview" -C "\${stack_cwd}" \${default_args} || true
}

deploy_stack() {
  local message="$1"
  local stack_cwd="$2"
  shift 2
  local default_args="$@"

  pulumi up --yes --message "\${message}-up" -C "\${stack_cwd}" \${default_args}
}

remove_stack() {
	local message="$1"
	local stack_cwd="$2"
	shift 2
	local default_args="$@"
  
	pulumi down --yes --message "\${message}-down" -C "\${stack_cwd}" \${default_args}
  }
  
capture_outputs() {
  local stack_cwd="$1"
  local output="$2"

  pulumi stack output -C "\${stack_cwd}" --json > "$(pwd)/\${output}.json"
  cat "\${output}.json"
  pulumi stack output -C "\${stack_cwd}" --shell > "$(pwd)/\${output}.sh"
  cat "\${output}.sh"
  ls ${OUTPUT_PULUMI_PATH}
  chmod +x "$(pwd)/\${output}.sh"
  echo "Output captured in \${output}.sh"
}
EOF
chmod +x .pulumi-helper.sh
source .pulumi-helper.sh`,
											]}
										/>

										{/* Process Pulumi Stacks */}
										<GithubStepX
											name={`Deploy ${APPLICATION} stacks`}
											run={[
												`mkdir -p ${OUTPUT_PULUMI_PATH}`,
												"source .export-cd",
												...DEPLOY_PREAMBLE,
												"source .pulumi-helper.sh",
												...((s) =>
													matrix.pipeline.delete !== true ? s : s.reverse())(
													CODECATALYST_PULUMI_STACKS,
												).flatMap(({ stack, name, output, root }) => {
													const STEP = matrix.pipeline.deploy
														? "Deploy"
														: matrix.pipeline.delete
															? "Delete"
															: "Preview";
													const PULUMI_DEFAULT_ARGS =
														"--non-interactive --suppress-progress --diff --json";
													const PULUMI_STACK_CWD = `$(pwd)/iac/stacks/src/${stack}`;
													const PULUMI_PROJECT = `${root ?? APPLICATION}-${name ?? stack}`;
													const PULUMI_STACK_NAME = `${PULUMI_PROJECT}.${matrix.pipeline.environment.name}`;
													const PULUMI_STACK_OUTPUT = `${OUTPUT_PULUMI_PATH}/${output}`;
													const PULUMI_MESSAGE =
														"${{ github.ref_name }}-${{ github.sha }}";
													const PULUMI_CONFIGS = Object.entries({
														"aws:skipMetadataApiCheck": false,
														"context:stack.environment.isProd": false,
														"context:stack.environment.features": "aws",
														"frontend:stack.dns.hostnames[0]": `${matrix.pipeline.environment.name}.${root ?? APPLICATION}.$FRONTEND_HOSTNAME`,
													})
														.map(([k, v]) => `${k}=${v}`)
														.join("\n");
													// STACK_FILTER:
													// -> * will deploy every stack
													// -> (head, next...): comma delimited list of stacks to deploy
													const STACK_FILTER = `
													if [ -n "\$PULUMI_STACK_FILTER" ]; then
														if [ "\$PULUMI_STACK_FILTER" = "*" ]; then
															echo "Running all stacks due to wildcard filter"
															true
														elif [ "\$PULUMI_STACK_FILTER" = "${PULUMI_PROJECT}" ]; then
															echo "Stack ${PULUMI_PROJECT} matched in filter"
															true
														elif echo ",\$PULUMI_STACK_FILTER," | grep -q ",${PULUMI_PROJECT},"; then
															echo "Stack ${PULUMI_PROJECT} found in comma-separated list"
															true
														else
															echo "Stack ${PULUMI_PROJECT} not in filter '\$PULUMI_STACK_FILTER', skipping"
															false
														fi
													else
														echo "No stack filter specified, processing all stacks"
														true
													fi &&`;

													// DIFF_FILTER:
													// Only applied if STACK_FILTER is empty or not set
													// Will "git diff" the location at PULUMI_STACK_CWD, and only issue commands if there are any changes
													// const DIFF_FILTER = `if [ -z "\$PULUMI_STACK_FILTER" ]; then
													// 		if git diff --quiet HEAD HEAD~1 -- "${PULUMI_STACK_CWD}"; then
													// 			echo "No changes detected in ${PULUMI_PROJECT}, skipping."
													// 			false
													// 		else
													// 			echo "Changes detected in ${PULUMI_PROJECT}, proceeding..."
													// 		fi
													// 	fi &&`;

													const FILTERBASH = `${STACK_FILTER}`;

													return [
														`configure_stack "${STEP}" "${PULUMI_STACK_NAME}" "${PULUMI_STACK_CWD}" "${PULUMI_PROJECT}" "${PULUMI_STACK_OUTPUT}"`,
														`setup_stack "${PULUMI_STACK_NAME}" "${PULUMI_STACK_CWD}"`,
														`configure_stack_settings "${PULUMI_STACK_CWD}" '${PULUMI_CONFIGS}'`,
														matrix.pipeline.delete
															? `remove_stack "${PULUMI_MESSAGE}" "${PULUMI_STACK_CWD}" ${PULUMI_DEFAULT_ARGS}`
															: `refresh_and_preview "${PULUMI_MESSAGE}" "${PULUMI_STACK_CWD}" ${PULUMI_DEFAULT_ARGS}`,
														...(matrix.pipeline.deploy
															? [
																	`deploy_stack "${PULUMI_MESSAGE}" "${PULUMI_STACK_CWD}" ${PULUMI_DEFAULT_ARGS}`,
																	`capture_outputs "${PULUMI_STACK_CWD}" "${PULUMI_STACK_OUTPUT}"`,
																]
															: []),
													]
														.map((bash) => `${FILTERBASH} ${bash}`)
														.concat([
															`echo "Stack ${PULUMI_STACK_NAME} processed"`,
														]);
												}),
											]}
										/>
										{/* Tag and push images */}
										{matrix.pipeline.push === true &&
											[
												"git-${{ github.sha }}",
												"${{ env.CI_ENVIRONMENT }}",
											].map((tag) => (
												<>
													{/* Push to ECR */}
													<GithubStepX
														name={`Tag and push image with ${tag}`}
														run={[
															`
															if [[ -z "\$PULUMI_STACK_FILTER" || "\$PULUMI_STACK_FILTER" == "*" || "\$PULUMI_STACK_FILTER" =~ "codestar" ]]; then
																echo "Codestar output found, deploying image"
																true
															else
																echo "Please verify PULUMI_STACK_FILTER: \$PULUMI_STACK_FILTER \n This should include codestar for the image push mechanism"
																exit 0
															fi`,
															...[
																`ls -la ${OUTPUT_PULUMI_PATH} || true`,
																...CODECATALYST_PULUMI_STACKS.flatMap(
																	({ output }) => [
																		`[ -f ${OUTPUT_PULUMI_PATH}/${output}.sh ] && cat ${OUTPUT_PULUMI_PATH}/${output}.sh`,
																		`[ -f ${OUTPUT_PULUMI_PATH}/${output}.sh ] && source ${OUTPUT_PULUMI_PATH}/${output}.sh`,
																	],
																),
																`echo "Verify imported environment variables"`,
																`echo "Codestar output ${PUSH_IMAGE_ECR_STACK_OUTPUT}: $${PUSH_IMAGE_ECR_STACK_OUTPUT}"`,
																`export ECR_URL=$(echo  $${PUSH_IMAGE_ECR_STACK_OUTPUT} | jq -r .repository.url)`,
																`echo "ECR_URL: $ECR_URL"`,
																`aws sts get-caller-identity --output json`,
																"sleep 2s",
																`aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_URL`,
															],
															`echo "Tagging $ECR_URL:${tag}"`,
															`docker tag \${{ env.APPLICATION_IMAGE_NAME }}:latest $ECR_URL:${tag}`,
															`docker push $ECR_URL:${tag}`,
														]}
													/>
												</>
											))}
										{/* Cleanup */}
										<GithubStepX
											name="Cleanup"
											run={[
												`rm -f ${[
													".pulumi-ci",
													".export-cd",
													".pulumi-helper.sh",
													".ci-env",
												].join(" ")}`,
												`rm -rf ${OUTPUT_PULUMI_PATH}`,
											]}
										/>
									</>
								)}
							</GithubStepNodeSetupX>
						</>
					}
				/>
			}
		</GithubWorkflowX>
	);
};

export default async () => GITHUB_CI_MATRIX.map(cd);
