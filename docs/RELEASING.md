# Releasing

The three `@quickdrawjs/*` packages version in lockstep.

## One-time setup

1. An npm account that owns the `@quickdrawjs` scope. If the scope doesn't
   exist yet, create a free org named `quickdrawjs` at
   npmjs.com → Add Organization (scoped public packages are free).
2. For CI publishing: an **Automation** token (npmjs.com → Access Tokens),
   saved as the `NPM_TOKEN` secret in the GitHub repo. The
   [release workflow](../.github/workflows/release.yml) publishes with
   provenance whenever a `v*` tag is pushed; if the secret is missing it
   builds and tests but skips publishing.

## Cutting a release

```bash
# 1. bump versions in packages/*/package.json (keep the three in lockstep,
#    and @quickdrawjs/react-native's dependency on @quickdrawjs/core)
# 2. update CHANGELOG.md
npm test && npm run typecheck && npm run build
git commit -am "vX.Y.Z"
git tag vX.Y.Z
git push && git push origin vX.Y.Z   # CI publishes to npm
```

## Publishing locally instead

```bash
npm login          # must be a member of the quickdrawjs org
npm run publish:all
```
