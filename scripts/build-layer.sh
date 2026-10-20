#!/usr/bin/env bash
#
# Builds the shared Lambda layer for the API functions.
#
# The layer ends up as:  nodejs/node_modules/{ <deps>, @repo/api }
# so Lambdas can import third-party packages (hono, @aws-sdk/*, zod, ...)
# AND the workspace package `@repo/api` (packages/api) at runtime.
#
# Why not just copy packages/api/node_modules?
#   pnpm installs with symlinks, which break once zipped. Dereferencing them
#   balloons the layer to ~276MB (over Lambda's limit) and still mis-resolves.
#   So we install the same deps into a temp dir with npm (real files, no links)
#   and drop packages/api's build output in as @repo/api.
#
# Usage:
#   bash scripts/build-layer.sh            # build + terraform apply (push)
#   bash scripts/build-layer.sh --no-push  # build the zip only
#   bash scripts/build-layer.sh clean      # only delete built artifacts
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PKG="$ROOT/packages/api"
TYPES_PKG="$ROOT/packages/types"
OUT_ZIP="$ROOT/layers/api/build.zip"
PUSH=1
[ "${1:-}" = "--no-push" ] && PUSH=0

# --- clean: only delete built artifacts, then exit ----------------------------
if [ "${1:-}" = "clean" ]; then
  echo "==> Cleaning built artifacts"
  rm -rf "$ROOT/layers"
  rm -rf "$API_PKG/dist"
  rm -rf "${TMPDIR:-/tmp}"/api-layer.*
  echo "    removed layers/, packages/api/dist, and stray temp build dirs"
  exit 0
fi

# --- make sure node/npm are available -----------------------------------------
if ! command -v npm >/dev/null 2>&1; then
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
  fi
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm not found. Install Node.js or load nvm first." >&2
  exit 1
fi

# --- always rebuild @repo/api --------------------------------------------------
# The layer ships packages/api/dist, and the lambdas import it at runtime. A
# stale dist silently shadows source edits (e.g. a removed export only blows up
# inside Lambda), so rebuild unconditionally rather than reusing whatever is there.
echo "==> Building @repo/types and @repo/api"
( cd "$ROOT" && pnpm --filter @repo/types --filter @repo/api build )

BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/api-layer.XXXXXX")"
#cleanup() { rm -rf "$BUILD_DIR"; }
#trap cleanup EXIT
NODEJS="$BUILD_DIR/nodejs"

# --- 1. layer package.json = @repo/api's production deps (single source) ------
# Workspace deps (@repo/types) use the "workspace:" protocol, which npm cannot
# resolve; their built output is copied into the layer in step 3 instead.
mkdir -p "$NODEJS"
node -e '
  const fs = require("fs");
  const api = require(process.argv[1]);
  const deps = Object.fromEntries(
    Object.entries(api.dependencies || {}).filter(([, spec]) => !String(spec).startsWith("workspace:")),
  );
  const layer = {
    name: "api-layer",
    version: "1.0.0",
    private: true,
    dependencies: deps,
  };
  fs.writeFileSync(process.argv[2], JSON.stringify(layer, null, 2) + "\n");
' "$API_PKG/package.json" "$NODEJS/package.json"

# --- 2. install deps as real files (no pnpm symlinks) -------------------------
echo "==> Installing layer dependencies (real files)"
( cd "$NODEJS" && npm install --omit=dev --no-package-lock --ignore-scripts --silent )

# --- 3. add the compiled workspace packages so Lambdas can import them --------
# @repo/types is a runtime dependency of @repo/api (its DAOs import the storage
# schemas), so it has to ship in the layer too.
for pkg in "$API_PKG" "$TYPES_PKG"; do
  name="$(node -p "require('$pkg/package.json').name")"
  dest="$NODEJS/node_modules/$name"
  echo "==> Adding $name into the layer"
  mkdir -p "$dest"
  cp "$pkg/package.json" "$dest/package.json"
  rsync -a --exclude '*.map' "$pkg/dist/" "$dest/dist/"
done

# --- 4. zip with the required nodejs/node_modules/ layout ---------------------
echo "==> Zipping layer"
mkdir -p "$(dirname "$OUT_ZIP")"
#rm -f "$OUT_ZIP"
( cd "$BUILD_DIR" && zip -rq "$OUT_ZIP" nodejs )
echo "    built $OUT_ZIP ($(du -h "$OUT_ZIP" | cut -f1))"

# --- 5. push (upload + attach via terraform) ----------------------------------
if [ "$PUSH" -eq 1 ]; then
  echo "==> Pushing layer with terraform"
  ( cd "$ROOT/infrastructure" && terraform init -input=false >/dev/null && terraform apply -auto-approve )

  echo "==> Cleaning up layers/ (already uploaded; no longer needed on disk)"
#  rm -rf "$ROOT/layers"
else
  echo "==> Skipping push (--no-push); keeping $OUT_ZIP"
fi
