#!/usr/bin/env bash
#
# Lints only the staged files, dispatched to the workspace that owns each one
# so every package keeps its own ESLint config and plugin resolution. Files
# outside any workspace package (root scripts, configs) are skipped: there is
# no root ESLint config to apply.
#
# Usage (from lefthook): bash scripts/lint-staged.sh <file>...
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Finds the workspace directory owning a file: the nearest directory above it
# with a package.json that is not the repo root.
find_workspace_dir() {
  local dir
  dir=$(cd "$(dirname "$1")" && pwd)
  while [ "$dir" != "/" ]; do
    if [ -f "$dir/package.json" ] && [ "$dir" != "$ROOT" ]; then
      echo "$dir"
      return
    fi
    dir=$(dirname "$dir")
  done
}

declare -A files_by_dir=()

for file in "$@"; do
  [ -f "$file" ] || continue
  # Terraform lives outside the JS workspaces; vendored modules under
  # infrastructure/.terraform ship their own package.json fixtures.
  case "$file" in
    infrastructure/*|.terraform/*) continue ;;
  esac
  workspace_dir=$(find_workspace_dir "$file" || true)
  [ -n "${workspace_dir:-}" ] || continue
  files_by_dir["$workspace_dir"]+="$ROOT/$file "
done

status=0
for workspace_dir in "${!files_by_dir[@]}"; do
  name=$(node -pe "require('$workspace_dir/package.json').name")

  if ! ls "$workspace_dir"/eslint.config.* >/dev/null 2>&1; then
    echo "eslint ($name): no eslint config in this workspace, skipping"
    continue
  fi

  echo "eslint ($name)"
  if ! pnpm --dir "$workspace_dir" exec eslint --fix --no-warn-ignored ${files_by_dir[$workspace_dir]}; then
    status=1
  fi
done

exit $status
