# nitroping-sdk — Working Notes

Lockstep multi-language SDK monorepo (JS/TS, Go, Python, PHP, Kotlin, Swift,
React Native). One version covers every language.

## Release workflow

1. Land changes (PR or direct to `main` — `main` is not protected; release
   commits/tags have historically gone straight to `main`).
2. Add a dated section to `CHANGELOG.md` under `[Unreleased]`.
3. `./bump.sh <X.Y.Z>` — lockstep-bumps every manifest + in-source
   `SDK_VERSION` constant, commits `vX.Y.Z`, creates `vX.Y.Z` + `go/vX.Y.Z`
   tags. (0.x convention: features go in a patch bump, e.g. 0.2.12 → 0.2.13.)
4. `git push origin main --follow-tags` — the tag triggers
   `.github/workflows/release.yml` (publishes npm / PyPI / Maven, cuts a
   GitHub release, Packagist auto-indexes).

## ALWAYS: update the GitHub release note after every version bump

> User rule (2026-06-15): **after every new SDK release, update the GitHub
> release note.**

`release.yml` auto-generates a thin release body (just the PR title + a wrong
`compare` base). That is NOT acceptable as the final note. After the release
run completes, rewrite it from the `CHANGELOG.md` section for that version:

```bash
gh release edit vX.Y.Z --notes "$(...changelog section, install lines,
  correct compare link vPREV...vX.Y.Z...)"
```

Include: the Added/Fixed/Changed bullets from the changelog, per-language
install commands (`npm i nitroping@X.Y.Z`, `pip install nitroping==X.Y.Z`,
`go get .../go@vX.Y.Z`, etc.), and a correct
`compare/vPREV...vX.Y.Z` Full Changelog link. Verify with
`gh release view vX.Y.Z --json body -q .body`.
