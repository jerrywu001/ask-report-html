# Publishing askreport to npm

The npm package and executable are `askreport`. The GitHub repository, installed skill name, configuration paths and rule markers remain `ask-report-html`.

The workflow is implemented in `.github/workflows/publish.yml`. It only publishes matching `v*` tags whose commits are on the default branch, after Linux, macOS and Windows checks pass. No publish runs on an ordinary branch push or pull request. A package version cannot be republished or overwritten.

## One-time first release

Trusted Publisher configuration requires the package to exist on npm. The workflow intentionally has no token bootstrap or token fallback. A maintainer must publish the first version with their npm account, then enable OIDC for later versions.

1. Confirm you have an npm account with 2FA enabled and permission to register the unscoped name `askreport`. An absent registry entry is not a reservation or a guarantee that npm will accept the name.
2. Review the package contents and validate the source checkout:

   ```bash
   npm ci --ignore-scripts
   npm run build
   npm run check
   npm test
   npm run test:package
   RELEASE_TAG=v0.2.0 npm run check:release
   ```

   The version example must match the current `package.json`. In PowerShell, use `$env:RELEASE_TAG = 'v0.2.0'` before running `npm run check:release`.

3. Authenticate and publish the first version manually, following npm's browser/2FA prompts:

   ```bash
   npm login --registry=https://registry.npmjs.org
   npm publish --ignore-scripts --access public
   ```

   Do not push the tag for this already-published version: the automatic workflow would try to publish it again. First-run `npx askreport` becomes available only after npm has accepted this release.

4. In npm's package Settings → Trusted Publisher, add GitHub Actions with:

   | Field | Value |
   | --- | --- |
   | Organization or user | `jerrywu001` |
   | Repository | `ask-report-html` |
   | Workflow filename | `publish.yml` — filename only, not the full path |
   | Environment name | Leave blank; the workflow does not declare an environment |
   | Allowed actions | Allow direct `npm publish`, not only staged publishing |

   The repository URL in `package.json` must continue to match this repository. The workflow is guarded against publishing from a fork.

5. Complete a successful OIDC publish of a **new version within 2 days** of creating the binding. If it expires, delete it and create a new binding before retrying.
6. After OIDC works, restrict traditional token publishing in npm's Publishing access settings if appropriate for your account policy. No `NPM_TOKEN` GitHub secret is required by this workflow.

The publishing job uses a GitHub-hosted runner, Node 24, npm 11 and `id-token: write`. These exceed npm's OIDC minimums of Node 22.14.0 and npm 11.5.1; consumer installation still requires only Node 22+. For an eligible public repository and public package, npm generates provenance automatically; no local `--provenance` flag is needed.

## Later releases

1. Start from the default branch and review the changes to release. Update the version without creating an automatic commit or tag:

   ```bash
   npm version patch --no-git-tag-version
   npm run build
   npm run check
   npm test
   npm run test:package
   RELEASE_TAG=v0.2.1 npm run check:release
   ```

   Use the version actually written to `package.json`, not the literal example. The build updates `assets/skill-manifest.json`; package metadata, lockfile and manifest must agree. Review and commit those changes yourself, and put the commit on the remote default branch before pushing its release tag.

2. Tag the reviewed commit with the matching version and push that tag. This triggers a real npm publish:

   ```bash
   git tag v0.2.1
   git push origin v0.2.1
   ```

3. The workflow validates release identity and default-branch ancestry, then calls the shared three-OS checks. Each OS verifies source/archive parity, runs the full test suite, and installs an actual npm tarball in an isolated home and cache.
4. Only after every gate passes, the publish job rebuilds the deterministic skill archive, checks it again and publishes via OIDC. Stable versions use `latest`; versions containing a prerelease suffix use `next` so they do not replace the stable installer.
5. Check the Actions result, npm version and executable after the registry has propagated:

   ```bash
   npm view askreport version --registry=https://registry.npmjs.org
   npx askreport@latest --version
   npx askreport@latest --lang=zh_CN -h
   # For a prerelease: npx askreport@next --version
   ```

The workflow does not increment versions, create commits/tags, or update existing agent sessions. Installed skills are refreshed only when a user runs the installer and confirms; Pi needs `/reload`, and other agents need a session restart.

## Packed-package checks

`npm run test:package` checks the tarball's runtime whitelist, executable mode, ZIP/manifest integrity, license files, default CLI mode, locale forms, an extra `--`, help/version, cancellation, read-only preview, scoped installation, repeated installation, preserved thresholds and opt-in legacy cleanup. It also serves the packaged web assets, verifies token protection and renders from the installed skill **after removing the npm cache and installer package**.

It uses a separate home, npm cache and empty npm configuration under `.agent-work/npm-cli/`; it does not install into the maintainer's real agent directories. The default removes its fixture and leaves a compact summary. Use `npm run test:package -- --keep` to retain the fixture for diagnosis. Fetching public npm dependencies requires registry access.

The npm package includes only runtime modules, web assets, the verified skill ZIP/manifest, READMEs and licenses. Tests, screenshots, workflow files, temporary materials and the duplicate skill source tree are excluded. No `preinstall`, `install`, `postinstall` or `prepare` hook modifies agent settings during npm installation.

## Troubleshooting

- **Version/tag or manifest mismatch:** update the version and rebuild the archive before creating a new matching tag. A tag never changes `package.json`.
- **Default-branch ancestry check fails:** the tagged commit is not yet on the remote default branch. Review/merge it before tagging the release.
- **OIDC authorization fails:** verify owner, repository, workflow filename, blank environment and direct publish permission in npm. Confirm the new binding has not expired. The workflow does not fall back to a stored token.
- **Version already published:** inspect the registry and choose a new version. Do not keep retrying the same version.
- **Tarball smoke check fails:** inspect the CLI/resource error; fix it before publishing. Network failures while fetching dependencies are not evidence of an installer defect.
- **Package name rejected or owned by someone else:** stop before publishing and choose a new name. That changes the promised `npx askreport` command and requires a coordinated metadata, smoke-test and documentation update.

References: [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/), [npm trust prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/), [npm exec and npx arguments](https://docs.npmjs.com/cli/v11/commands/npm-exec/).
