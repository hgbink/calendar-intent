# CI and npm releases

CI runs tests, syntax checks, and a package preview on Node 18, 20, 22, and 24
for pushes to main and pull requests. There are no dependencies to install.

## Publishing configuration

The public package is `@hgbink/calendar-intent`. Version `0.1.0` was published
on 2026-09-27 and verified with a fresh install and an import smoke test.

npm trusted publishing is configured and verified for:

- GitHub owner: `hgbink`
- Repository: `calendar-intent`
- Workflow filename: `publish.yml`
- Environment: none
- Direct publishing: allowed

The workflow uses OIDC and does not need an `NPM_TOKEN` repository secret.
The GitHub repository is private, so npm provenance is disabled.
See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## Subsequent releases

1. Update `package.json` to a new stable version and merge the change into main.
2. Wait for CI to pass.
3. Create and publish a GitHub release on main with the tag `v` followed by the
   exact package version, for example `v0.1.1`.

`publish.yml` checks out the release tag, validates its version, reruns tests and
syntax checks, previews the package, and publishes to npm. Drafts and prereleases
do not publish. Existing npm versions cannot be overwritten; use a new version
for each release. Do not create a release for the manually bootstrapped version.
