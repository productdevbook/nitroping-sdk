#!/usr/bin/env bash
# Lockstep version bump across every SDK in the monorepo.
#
# Usage:
#   ./bump.sh 0.2.0            # bump + commit + tag
#   ./bump.sh 0.2.0 --dry-run  # show what would change, don't commit
#
# What it does:
#   1. Validates the new version is a clean semver (X.Y.Z)
#   2. Confirms working tree is clean and we're on main
#   3. Updates VERSION + every SDK manifest
#   4. Commits with "v<X.Y.Z>" message
#   5. Tags `v<X.Y.Z>` (Swift SPM, JS, Python, Kotlin, PHP)
#   6. Tags `go/v<X.Y.Z>` (Go modules subdir convention)
#   7. Reports next step: `git push origin main --follow-tags`

set -euo pipefail

NEW="${1:?usage: ./bump.sh <X.Y.Z> [--dry-run]}"
DRY_RUN=0
[[ "${2:-}" == "--dry-run" ]] && DRY_RUN=1

if ! [[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "✗ '$NEW' is not a clean semver. Expected X.Y.Z (no leading v, no pre-release tag)." >&2
    exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_ROOT"

if [[ "$DRY_RUN" -eq 0 ]]; then
    if [[ -n "$(git status --porcelain)" ]]; then
        echo "✗ Working tree is not clean. Commit or stash first." >&2
        exit 1
    fi
    BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || echo DETACHED)"
    if [[ "$BRANCH" != "main" ]]; then
        echo "✗ Must release from main, currently on '$BRANCH'." >&2
        exit 1
    fi
fi

OLD="$(cat VERSION 2>/dev/null || echo 0.0.0)"
echo "→ Bumping $OLD → $NEW"

# Helpers
sed_inplace() {
    if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "  (would) sed $1 in $2"
    else
        # macOS sed needs '' after -i; Linux doesn't. Detect.
        if sed --version >/dev/null 2>&1; then
            sed -i "$1" "$2"
        else
            sed -i '' "$1" "$2"
        fi
    fi
}

# 1. VERSION file
if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  (would) write VERSION = $NEW"
else
    echo "$NEW" > VERSION
fi

# 2. js/package.json — bump "version" field
sed_inplace "s/\"version\": \"$OLD\"/\"version\": \"$NEW\"/" js/package.json

# 3. python/pyproject.toml — bump "version = ..."
sed_inplace "s/^version = \"$OLD\"/version = \"$NEW\"/" python/pyproject.toml

# 4. php/composer.json — composer.json's version field is OPTIONAL when reading
#    from git tags, but if it exists, keep it in sync.
if grep -q "\"version\"" php/composer.json 2>/dev/null; then
    sed_inplace "s/\"version\": \"$OLD\"/\"version\": \"$NEW\"/" php/composer.json
fi

# 5. kotlin/gradle.properties — VERSION=...
sed_inplace "s/^VERSION=$OLD/VERSION=$NEW/" kotlin/gradle.properties

# 6. Go: nothing to bump in source — the tag IS the version.
#    Swift: nothing to bump in source either.

if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "✓ Dry run complete. Re-run without --dry-run to apply."
    exit 0
fi

# Commit + tag
git add VERSION js/package.json python/pyproject.toml kotlin/gradle.properties
if grep -q "\"version\"" php/composer.json 2>/dev/null; then
    git add php/composer.json
fi
git commit -m "v$NEW"
git tag -a "v$NEW" -m "v$NEW"
git tag -a "go/v$NEW" -m "Go module $NEW"

echo
echo "✓ Bumped to $NEW. Tags created locally:"
echo "    v$NEW         (Swift Package Manager, JS, Python, Kotlin, PHP — read from manifests)"
echo "    go/v$NEW      (Go modules subdir convention)"
echo
echo "Next step:"
echo "    git push origin main --follow-tags"
echo
echo "Pushing the tag will trigger .github/workflows/release.yml — which publishes to"
echo "the registries whose secrets you've configured. Configured today: npm. The other"
echo "registry jobs (PyPI, Maven Central) are gated 'if: false' until their tokens"
echo "are added. Packagist auto-indexes on tag push (no job needed)."
