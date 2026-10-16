#!/usr/bin/env bash
#
# Builds apps/main-site and deploys it to the domain bucket behind
# CloudFront (infrastructure/modules/static-site).
#
# Prerequisites:
#   - `pnpm infra:apply` has been run once (bucket + distribution exist)
#   - AWS credentials for the target account are active
#
# Note: public/.well-known/assetlinks.json currently carries the *debug* signing
# fingerprint so development builds verify. Add the Play App Signing SHA-256
# (Play Console > Release > Setup > App signing) before the first release.
#
# Usage:
#   bash scripts/deploy-main-site.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/apps/main-site/dist"

echo "==> Reading Terraform outputs"
BUCKET="$(terraform -chdir="$ROOT/infrastructure" output -raw main_site_bucket)"
DISTRIBUTION_ID="$(terraform -chdir="$ROOT/infrastructure" output -raw main_site_distribution_id)"

echo "==> Building main-site"
pnpm --dir "$ROOT" --filter main-site build

echo "==> Syncing site to s3://$BUCKET"
# Everything except hashed assets: revalidate on every load, so HTML and the
# .well-known association files are never stale.
aws s3 sync "$DIST" "s3://$BUCKET" \
  --delete \
  --exclude "assets/*" \
  --cache-control "no-cache"

# Vite fingerprints filenames in assets/, so cache them forever.
aws s3 sync "$DIST/assets" "s3://$BUCKET/assets" \
  --delete \
  --cache-control "public, max-age=31536000, immutable"

# The extension-less AASA file needs an explicit JSON content type (iOS
# rejects the application/octet-stream the CLI would guess otherwise).
aws s3 cp "$DIST/.well-known/apple-app-site-association" \
  "s3://$BUCKET/.well-known/apple-app-site-association" \
  --content-type "application/json" \
  --cache-control "no-cache"
aws s3 cp "$DIST/.well-known/assetlinks.json" \
  "s3://$BUCKET/.well-known/assetlinks.json" \
  --content-type "application/json" \
  --cache-control "no-cache"

echo "==> Invalidating CloudFront"
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/index.html" "/.well-known/*" > /dev/null

echo "==> Deployed"
