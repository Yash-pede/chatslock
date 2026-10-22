#!/usr/bin/env bash
#
# Deploys backend code:
#   1. Builds all workspaces + Lambda functions and packages every bundle.
#      Nothing touches AWS until every function has been built and zipped.
#   2. Publishes the shared Lambda layer and updates referencing functions.
#   3. Uploads each function's code via the CLI.
#
# Terraform (`pnpm infra:apply`) remains the source of truth for
# infrastructure *shape* (routes, roles, env vars); this script only ships
# code, so it never runs a plan or touches state.
#
# Usage: bash scripts/deploy.sh [--no-layer]
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="${AWS_REGION:-ap-south-1}"
LAYER_NAME="api_layer"
SKIP_LAYER=false
[ "${1:-}" = "--no-layer" ] && SKIP_LAYER=true

cd "$ROOT"

declare -a DEPLOYED=()
declare -a FAILED=()

run_step() {
  # run_step <description> <command...> — abort the whole deploy on failure.
  local description="$1"
  shift
  if ! "$@"; then
    echo "ERROR: ${description} failed" >&2
    exit 1
  fi
}

echo "==> Building all workspaces, then every Lambda function"
run_step "workspace build" pnpm build
run_step "function build" pnpm --filter auth --filter users --filter conversations --filter ws-connections --filter ws-authorizer run build

echo "==> Determining functions from Terraform config"
declare -a FUNCTIONS=()
while IFS='=' read -r name path; do
  [ -n "$name" ] && FUNCTIONS+=("${name}=${path}")
done < <(node -e '
  const fs = require("fs");
  const tf = fs.readFileSync("infrastructure/modules/backend/lambda/main.tf", "utf8");
  const re = /function_name\s+=\s+"([^"]+)"[\s\S]{0,600}?source_path\s+=\s+"\$\{path\.root\}\/([^"]+)"/g;
  let m;
  while ((m = re.exec(tf)) !== null) {
    const repoPath = m[2].replace(/^(\.\.\/)+/, "");
    console.log(`${m[1]}=${repoPath}`);
  }
') || { echo "ERROR: could not parse functions from main.tf" >&2; exit 1; }

if [ "${#FUNCTIONS[@]}" -eq 0 ]; then
  echo "ERROR: no functions found in main.tf — refusing to deploy nothing" >&2
  exit 1
fi

echo "==> Found ${#FUNCTIONS[@]} functions: ${FUNCTIONS[*]%%=*}"

# Preflight: verify + package every function BEFORE touching AWS, so a failed
# build can never leave the deployed set half-updated.
echo "==> Packaging every function (preflight)"
rm -f /tmp/chatslock-deploy-*.zip
for entry in "${FUNCTIONS[@]}"; do
  name="${entry%%=*}"
  dist="${entry#*=}"
  if [ ! -f "$ROOT/${dist}" ]; then
    echo "ERROR: build output missing at $dist — the build failed or was skipped for $name; stopping deploy" >&2
    exit 1
  fi
  if ! zip -q -j "/tmp/chatslock-deploy-${name}.zip" "$ROOT/${dist}"; then
    echo "ERROR: packaging $name failed; stopping deploy" >&2
    exit 1
  fi
  echo "    $name packaged"
done

if [ "$SKIP_LAYER" = false ]; then
  echo "==> Building and publishing the shared layer"
  run_step "layer build" bash scripts/build-layer.sh
  [ -f "$ROOT/layers/api/build.zip" ] || { echo "ERROR: layers/api/build.zip missing after build" >&2; exit 1; }
  LAYER_ARN=$(aws lambda publish-layer-version \
    --layer-name "$LAYER_NAME" \
    --zip-file "fileb://$ROOT/layers/api/build.zip" \
    --compatible-runtimes nodejs24.x \
    --description "Deployed $(date -u +%FT%TZ) from $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)" \
    --region "$REGION" \
    --query "LayerVersionArn" --output text) || { echo "ERROR: publishing layer failed" >&2; exit 1; }
  [ -n "$LAYER_ARN" ] && [ "$LAYER_ARN" != "None" ] || { echo "ERROR: layer ARN empty" >&2; exit 1; }
  echo "    layer: $LAYER_ARN"
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text) || { echo "ERROR: sts get-caller-identity failed" >&2; exit 1; }
fi

for entry in "${FUNCTIONS[@]}"; do
  name="${entry%%=*}"
  echo "==> Deploying $name"

  if [ "$SKIP_LAYER" = false ]; then
    # --output text prints "None" when the function has no other layers (e.g.
    # wsAuthorizer); normalize it to empty so --layers stays a clean ARN list.
    OTHER_LAYERS=$(aws lambda get-function-configuration \
      --function-name "$name" --region "$REGION" \
      --query "Layers[?!starts_with(Arn, 'arn:aws:lambda:$REGION:$ACCOUNT_ID:layer:$LAYER_NAME:')].Arn" \
      --output text) || { echo "ERROR: reading $name configuration failed" >&2; FAILED+=("$name"); continue; }
    [ "$OTHER_LAYERS" = "None" ] && OTHER_LAYERS=""

    if ! aws lambda update-function-configuration \
      --function-name "$name" \
      --layers "$LAYER_ARN" $OTHER_LAYERS \
      --region "$REGION" >/dev/null; then
      echo "ERROR: layer update for $name failed" >&2
      FAILED+=("$name")
      continue
    fi

    if ! aws lambda wait function-updated --function-name "$name" --region "$REGION" >/dev/null; then
      echo "ERROR: $name did not reach a settled state after layer update" >&2
      FAILED+=("$name")
      continue
    fi
  fi

  if ! aws lambda update-function-code \
    --function-name "$name" \
    --zip-file "fileb:///tmp/chatslock-deploy-${name}.zip" \
    --region "$REGION" \
    --query "LastUpdateStatus" --output text; then
    echo "ERROR: code update for $name failed" >&2
    FAILED+=("$name")
    continue
  fi

  if ! aws lambda wait function-updated --function-name "$name" --region "$REGION" >/dev/null; then
    echo "ERROR: $name did not reach a settled state after code update" >&2
    FAILED+=("$name")
    continue
  fi

  DEPLOYED+=("$name")
  echo "    $name updated"
done

echo
echo "==> Deploy summary: ${#DEPLOYED[@]} succeeded (${DEPLOYED[*]:-none}), ${#FAILED[@]} failed (${FAILED[*]:-none})"

if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "ERROR: deploy FAILED for: ${FAILED[*]}" >&2
  exit 1
fi

echo "==> Deploy complete"
