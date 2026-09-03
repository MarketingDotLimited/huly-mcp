#!/usr/bin/env bash
set -euo pipefail

MCP_PACKAGE_NAME="@firfi/huly-mcp"
CLI_PACKAGE_NAME="@firfi/huly-cli"
RELEASE_BRANCH="master"
CHANGES_DIR=".changeset"
ESBUILD_VERSION="0.27.2"

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$RELEASE_BRANCH" ]]; then
  echo "Refusing MDL release from branch '$current_branch'; expected '$RELEASE_BRANCH'." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing MDL release with a dirty worktree." >&2
  git status --short
  exit 1
fi

node_version="$(node -p 'process.versions.node')"
if [[ "$node_version" != "22.22.2" && "$node_version" != "24.15.0" ]]; then
  echo "Refusing MDL release under Node $node_version; expected 22.22.2 or 24.15.0." >&2
  exit 1
fi

mcp_package_version="$(node -p "require('./package.json').version")"
if [[ ! "$mcp_package_version" =~ ^0\.50\.0-mdl\.([0-9]+)$ ]]; then
  echo "Error: MCP version $mcp_package_version is not a valid MDL prerelease version (e.g., 0.50.0-mdl.18)." >&2
  exit 1
fi
current_mdl_num="${BASH_REMATCH[1]}"

if ! git merge-base --is-ancestor origin/master HEAD; then
  echo "Error: origin/master is not an ancestor of HEAD. Cannot push diverging history." >&2
  exit 1
fi

git fetch origin --tags
previous_tag=$(git tag -l "v0.50.0-mdl.*" | sort -V | tail -n 1)
if [[ -n "$previous_tag" ]]; then
  if [[ ! "$previous_tag" =~ ^v0\.50\.0-mdl\.([0-9]+)$ ]]; then
    echo "Error: Could not parse previous tag $previous_tag" >&2
    exit 1
  fi
  prev_mdl_num="${BASH_REMATCH[1]}"
  
  if (( current_mdl_num != prev_mdl_num + 1 )); then
    echo "Error: Current MDL version .${current_mdl_num} must be exactly one greater than previous .${prev_mdl_num}" >&2
    exit 1
  fi

  cli_package_version="$(node -p "require('./packages/huly-cli/package.json').version")"
  expected_cli_version="$(git show "$previous_tag:packages/huly-cli/package.json" | node -p "JSON.parse(require('fs').readFileSync(0, 'utf-8')).version")"
  if [[ "$cli_package_version" != "$expected_cli_version" ]]; then
    echo "Error: CLI version $cli_package_version differs from previous tag $previous_tag ($expected_cli_version)." >&2
    exit 1
  fi
fi

pending_changeset="$(find "$CHANGES_DIR" -maxdepth 1 -type f -name "*.md" ! -name "README.md" -print -quit)"
if [[ -n "$pending_changeset" ]]; then
  echo "Error: Pending changesets found. MDL releases must not use changesets." >&2
  exit 1
fi

echo "Installing dependencies..."
CI=true pnpm install --frozen-lockfile --prod=false

echo "Running checks..."
pnpm check-all

echo "Building MCP package..."
node_engine_requirement="$(node -p "require('./package.json').engines.node")"
pnpm dlx "esbuild@$ESBUILD_VERSION" src/launcher.ts \
  --bundle \
  --platform=node \
  --format=cjs \
  --outfile=dist/index.cjs \
  --external:ws \
  "--define:PKG_VERSION=\"$mcp_package_version\"" \
  "--define:NODE_ENGINE_REQUIREMENT=\"$node_engine_requirement\""
pnpm verify-version

release_tag="v$mcp_package_version"
if git rev-parse -q --verify "refs/tags/$release_tag" >/dev/null; then
  echo "Error: Tag $release_tag already exists." >&2
  exit 1
fi

echo "======================"
echo "MDL Release Plan"
echo "Version: $mcp_package_version"
echo "Tag: $release_tag"
echo "Commit: $(git log -n 1 --oneline HEAD)"
echo "Action: Will push master to origin and push $release_tag to trigger GHCR."
echo "======================"

if [[ "${MDL_RELEASE_CONFIRM:-}" != "true" ]]; then
  echo "Run with MDL_RELEASE_CONFIRM=true to execute."
  exit 0
fi

git push origin "$RELEASE_BRANCH"
git tag "$release_tag"
git push origin "$release_tag"

echo "MDL release triggered successfully!"
