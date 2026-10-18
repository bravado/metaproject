# Releasing Metaproject 0.11.0

Metaproject is distributed **only through GitHub Releases** at
[bravado/metaproject](https://github.com/bravado/metaproject).
The npm-compatible tarball is made with `npm pack` but is **not** uploaded
to npmjs.org, GitHub Packages, or another registry.

The canonical branch is `master`. The first public tag is `v0.11.0`.
Until #22 and #23 are approved, this document describes preparation, not
permission to publish.

## Administrator and owner gates (#22)

Before a tag is pushed, the repository owners must:

1. Independently review all accessible branch/tag/PR history, issue comments,
   workflow logs/artifacts and licenses for secrets, private data, provenance
   and copyright rights. A clean root commit does **not** erase older
   objects reachable from other refs.
2. Confirm the existing public `bravado/metaproject` repository is approved
   for release and verify private vulnerability reporting is enabled.
3. Protect `master` and `v*` tags, prevent destructive tag rewriting, restrict
   release permissions, and configure any required organization approvals.
   Enable immutable GitHub Releases if supported.
4. Review and approve the MIT license, copyright attribution and the exact
   source commit. Obtain separate legal/security/organization sign-off.
5. Approve the final package version and notes, and review the release workflow
   in `.github/workflows/release.yml`.

None of these settings or approvals is established merely by merging this code.

## Verification-only rehearsal

Choose Actions → GitHub Release → Run workflow, selecting **master**. The
workflow accepts manual dispatch only from `master` and performs:

- Node.js 22.12.0, 24 and 26 unit tests;
- syntax checks and runnable product examples;
- exactly one `npm pack` of the source at the checked-out commit;
- tarball content/version verification and SHA256SUMS generation;
- a clean, unrelated consumer install using the packed tarball;
- checkout Chromium E2E and a Chromium smoke test of that **same tarball**.

A manual run never creates a GitHub Release, publishes a package, or pushes a
tag. You can rehearse the equivalent steps locally using `npm ci`, `npm test`,
`npm run check`, `npm run test:examples`, `npm pack --pack-destination dist`,
and the scripts in `tools/release/`.

## Prepare and publish the approved tag (#23)

1. Update **both** `package.json` and `package-lock.json` to `0.11.0`.
   Change the `CHANGELOG.md` header from *Planned first public release* to
   final notes. Keep the tag, manifest and lockfile versions identical.
2. Merge to protected `master`; confirm ordinary CI and a manual release
   rehearsal pass on the exact current HEAD.
3. After all administrator approvals, create an **annotated** tag at that
   exact `master` commit:

   ```bash
   git switch master
   git pull --ff-only
   git tag -a v0.11.0 -m "Metaproject 0.11.0"
   git push origin v0.11.0
   ```

4. The tag-triggered pipeline refuses a lightweight tag, mismatched package
   version/lockfile, a tag off current `master`, or unfinished release notes.
   It publishes only if the repository is public and exactly
   `bravado/metaproject`.
5. The workflow rechecks the source and pack, runs the consumer and browser
   suites, creates a **draft GitHub Release**, uploads the exact `.tgz`
   and SHA256SUMS, downloads and re-verifies them, then publishes the release.
   Only the last release job gets `contents: write`; no registry credentials
   or npm publisher ownership are required.
6. Verify that the public asset URL and its checksum work from an unrelated
   machine before marking #23 complete.

The approved release asset will be:

`https://github.com/bravado/metaproject/releases/download/v0.11.0/metaproject-0.11.0.tgz`

## Installing from a GitHub Release

**The URL is only usable after v0.11.0 has actually been published.** Once
available, install the tarball as a normal npm development dependency:

```bash
npm install --save-dev https://github.com/bravado/metaproject/releases/download/v0.11.0/metaproject-0.11.0.tgz
npx --no-install metaproject init
npx --no-install metaproject check
npx --no-install metaproject build
```

The shorter `npx metaproject` used throughout product documentation also works
after a local installation. Prefer `npx --no-install` to avoid accidentally
looking up an unrelated or unavailable package on npmjs.org. Transitive
dependencies such as Lit still require normal npm-compatible registry access.

## Failed publication and recovery

Do not retag an existing published version or overwrite release archives.
If the workflow fails before draft creation, correct the problem and rerun
only after verifying the tag still points at the approved commit.
If it fails **after draft creation**, the draft deliberately remains unpublished:
inspect the logs/assets, manually verify SHA256SUMS and either publish the
existing verified draft with owner approval or remove the draft and rerun
under an agreed recovery procedure. Do not silently replace a public asset.
