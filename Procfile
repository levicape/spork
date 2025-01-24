cli: pnpm run dx:cli:mjs
deploy-spork: pnpm --filter @levicape/spork --prod --node-linker=hoisted deploy /tmp/spork && sleep 1200s
deploy-spork-ui-manifest: pnpm --filter @levicape/spork-ui-manifest --prod --node-linker=hoisted deploy /tmp/spork-ui-manifest && sleep 1200s
deploy: pnpm --filter $DEPLOY_FILTER --prod --node-linker=hoisted deploy $DEPLOY_OUTPUT || true; ls -la $DEPLOY_OUTPUT || true; echo 'rebuilding $DEPLOY_FILTER' && pnpm -c $DEPLOY_OUTPUT rebuild || true; echo 'procfile deploy to $DEPLOY_OUTPUT complete'; sleep 1200s
project: pnpm run -C $PROJECT_PATH
test: pnpm run test