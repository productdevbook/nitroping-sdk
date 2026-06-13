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

# 2. js/package.json — bump "version" field + the SDK_VERSION constant
#    (the constant feeds the User-Agent; keeping it here prevents drift).
sed_inplace "s/\"version\": \"$OLD\"/\"version\": \"$NEW\"/" js/package.json
sed_inplace "s/export const SDK_VERSION = \"$OLD\"/export const SDK_VERSION = \"$NEW\"/" js/src/http.ts

# 2b. react-native/package.json — bump "version" field
sed_inplace "s/\"version\": \"$OLD\"/\"version\": \"$NEW\"/" react-native/package.json
#     and keep its dependency on the core package in lockstep.
sed_inplace "s/\"nitroping\": \"\\^$OLD\"/\"nitroping\": \"^$NEW\"/" react-native/package.json

# 3. python/pyproject.toml — bump "version = ..." + the SDK version constants
sed_inplace "s/^version = \"$OLD\"/version = \"$NEW\"/" python/pyproject.toml
sed_inplace "s/__version__ = \"$OLD\"/__version__ = \"$NEW\"/" python/src/nitroping/__init__.py 2>/dev/null || true
sed_inplace "s/SDK_VERSION = \"$OLD\"/SDK_VERSION = \"$NEW\"/" python/src/nitroping/_http.py 2>/dev/null || true

# 4. php — composer.json version is OPTIONAL (registry reads git tags); the
#    SDK_VERSION constant feeds the User-Agent and must stay in lockstep.
if grep -q "\"version\"" php/composer.json 2>/dev/null; then
    sed_inplace "s/\"version\": \"$OLD\"/\"version\": \"$NEW\"/" php/composer.json
fi
sed_inplace "s/SDK_VERSION = '$OLD'/SDK_VERSION = '$NEW'/" php/src/Internal/CurlTransport.php 2>/dev/null || true

# 5. kotlin/gradle.properties — VERSION= + the SDK_VERSION constant
sed_inplace "s/^VERSION=$OLD/VERSION=$NEW/" kotlin/gradle.properties
sed_inplace "s/SDK_VERSION: String = \"$OLD\"/SDK_VERSION: String = \"$NEW\"/" kotlin/nitroping/src/main/kotlin/dev/nitroping/internal/HttpTransport.kt 2>/dev/null || true

# 6. Go: the tag is the version, but the User-Agent uses a constant.
sed_inplace "s/const Version = \"$OLD\"/const Version = \"$NEW\"/" go/http.go 2>/dev/null || true

# 7. Swift: package-wide version constant (User-Agent).
sed_inplace "s/version = \"$OLD\"/version = \"$NEW\"/" swift/Sources/Nitroping/Nitroping.swift 2>/dev/null || true

if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "✓ Dry run complete. Re-run without --dry-run to apply."
    exit 0
fi

# Re-format edited files so oxfmt / ruff / php-cs-fixer don't reject them
# at release time. Run only the formatters that are cheap to invoke locally
# (no network, no Docker). Each formatter is best-effort — skip silently if
# the binary isn't available, since the release CI will still verify format
# from scratch.
if [[ "$DRY_RUN" -eq 0 ]]; then
    if [[ -x js/node_modules/.bin/oxfmt ]]; then
        (cd js && ./node_modules/.bin/oxfmt package.json) || true
    elif command -v pnpm >/dev/null 2>&1; then
        (cd js && pnpm install --frozen-lockfile --silent && ./node_modules/.bin/oxfmt package.json) || true
    fi
    # ruff / black for python — only if installed locally
    if command -v ruff >/dev/null 2>&1; then
        ruff format python/pyproject.toml || true
    fi
    # php-cs-fixer for composer.json — only if installed locally
    if command -v php-cs-fixer >/dev/null 2>&1; then
        (cd php && composer.json php-cs-fixer fix composer.json) || true
    fi
fi

# Commit + tag. Stage every file the sed edits above may have touched —
# manifests AND the in-source SDK_VERSION constants — so a release never
# ships with a stale User-Agent version.
git add -u \
    VERSION \
    js/package.json js/src/http.ts \
    react-native/package.json \
    python/pyproject.toml python/src/nitroping/__init__.py python/src/nitroping/_http.py \
    kotlin/gradle.properties kotlin/nitroping/src/main/kotlin/dev/nitroping/internal/HttpTransport.kt \
    go/http.go \
    swift/Sources/Nitroping/Nitroping.swift \
    php/src/Internal/CurlTransport.php
if grep -q "\"version\"" php/composer.json 2>/dev/null; then
    git add -u php/composer.json
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
