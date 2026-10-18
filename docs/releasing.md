# Metaproject release procedure

The first public release is **0.11.0**. Never publish from a pull request or ordinary push. The GitHub **Release** workflow supports a manual verification-only run from main and an automatic publish from approved version tags.

## What to create on npmjs.org

**Package name:** metaproject (unscoped, public). **GitHub repository:** metaproject/core.

1. Sign in to npmjs.org with a publishing account and enable **two-factor authentication**. Verify it owns (or has publishing access to) the exact unscoped package name. Run npm view metaproject version --registry=https://registry.npmjs.org to check registry existence; a 404 is not proof of permanent name availability.
2. If the package does not exist, it must be **bootstrapped by an authorized npm publisher** before its settings can be configured. Prefer an approved public prerelease (for example 0.11.0-rc.0) published manually with npm login and 2FA, from an already-reviewed and verified prerelease tarball, using npm publish FILE.tgz --access public --tag next. This initial creation must not claim the final 0.11.0 version; no automatic token fallback is provided. If another owner controls the name, stop and arrange authorized transfer or choose a different name.
3. In the npm package page, open **Settings → Trusted publishing → GitHub Actions** and enter:

   | Field | Value |
   | --- | --- |
   | Organization/user | `metaproject` |
   | Repository | core |
   | Workflow filename | release.yml |
   | Environment | leave blank |
   | Allowed action | **Allow direct npm publish** |

   This matches the file .github/workflows/release.yml. An npm org account is optional for an unscoped package; consider ownership under an npm organization for team continuity.

4. **Timing matters:** A new trusted publisher must complete its first successful publication within **two days**, or the configuration expires. Create it shortly before final publication and remove/recreate if expired. npm does not fully validate these fields until a publish is attempted.
5. After a successful OIDC publication, choose **Publishing access → Require two-factor authentication and disallow tokens** and revoke unused traditional publishing tokens. OIDC still works. Do **not** create an NPM_TOKEN GitHub secret for this workflow.

Documentation: https://docs.npmjs.com/trusted-publishers/

## GitHub prerequisites (issue #22)

Before any final release: finish full-history secret and license review, make the repository **public**, enable main-branch and v* tag protections, and activate private vulnerability reporting. GitHub-hosted Actions and Node 24 are used for OIDC with npm CLI version 11.5.1 or newer. npm automatically generates provenance for a public package and public GitHub repository.

## Rehearsal without publishing

On GitHub Actions select **Release → Run workflow** on the main branch. This does not use an npm publishing credential and never publishes or creates a GitHub Release; it exercises the Node 22/24/26 tests, static checks/examples, npm pack and clean consumer, checkout-based Chromium E2E and a second Chromium smoke test using **the exact uploaded package tarball**.

Locally, you can run:

    npm ci
    npm test
    npm run check
    npm run test:examples
    node tools/release/validate-release.mjs --rehearsal
    mkdir -p dist
    npm pack --pack-destination dist
    node tools/release/verify-package.mjs dist/*.tgz
    node tests/packed-consumer.mjs dist/*.tgz
    npx playwright install chromium
    node tests/packed-browser-smoke.mjs dist/*.tgz

A green rehearsal does not verify live npm trusted-publisher ownership or permissions.

## Deliberate final release (issue #23)

1. Review and merge the release-candidate change to **both package.json and package-lock.json**, including lockfile root version, setting 0.11.0. Finalize CHANGELOG.md: remove “Planned” in the 0.11.0 heading and any future-tense “not published yet” text.
2. Ensure the public repo, npm ownership, trusted publisher and 2FA are ready. Run the manual Release rehearsal on main and confirm ordinary CI is green at the **exact main commit**.
3. Confirm metaproject@0.11.0 is not already published.
4. Create an **annotated tag** at the verified *current main HEAD*:

       git checkout main
       git pull --ff-only
       git tag -a v0.11.0 -m "Metaproject Core v0.11.0"
       git push origin v0.11.0

5. The tag workflow rejects lightweight tags, mismatched manifest/lock/tag versions, tags off current main, duplicate npm versions, an unfinalized changelog, and unsafe or incomplete tarballs. It retests the same commit, packs **once**, verifies that tarball in Chromium, downloads identical bytes into the npm job, publishes through OIDC, and checks the registry tarball digests and provenance.
6. A matching GitHub Release with changelog notes and the same tarball is created **only after** npm publishing and verification succeed.
7. Check the npm package page's provenance badge, verify the source commit/build workflow, check GitHub Releases, and perform a public clean install. You can also run npm audit signatures on an installed package.

## Partial-failure recovery

Published npm versions cannot be overwritten. Never rerun a workflow to republish an existing version.

- If tag validation or OIDC fails before publishing, resolve the issue without moving an already published tag. Coordinate protected tag handling with maintainers.
- If npm publishes but registry provenance/integrity checks fail, **stop** and inspect npm metadata and the original tarball manually; don't republish.
- If npm succeeds and GitHub Release fails, download the verified tarball from that workflow's artifact, verify SHA256SUMS, and create the GitHub Release manually on the **existing tag**, using the same tarball and the release notes. Example:

       gh release create v0.11.0 dist/metaproject-0.11.0.tgz --verify-tag --title "Metaproject 0.11.0" --notes-file release-notes.md

Actual publication/visibility and npm account configuration remain separate manual gates in #22 and #23.
