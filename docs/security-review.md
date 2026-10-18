# 0.11 public-readiness audit — issue #22

> **Status: RELEASE BLOCKED.** This document records observations, not security
> or legal approval. Do not create `v0.11.0` until maintainers record independent
> history, release-protection, vulnerability-reporting and licensing sign-off.

## Verified by repository inspection (2026-10-18)

- Public repository: [bravado/metaproject](https://github.com/bravado/metaproject),
  repository ID `1357458810`, default `master`.
- The modern baseline `d5ce11893b7467e48756426208c49b0dbedc412f`
  is a zero-parent commit. PR #45 was merged and the current master CI
  [passed](https://github.com/bravado/metaproject/actions/runs/39171539351).
- `master` is reported protected, but its actual branch-protection
  configuration could not be read (GitHub integration returned HTTP 403).
  Repository ruleset listing returned no rulesets. **Do not infer the
  protection's exact requirements from its boolean `protected` flag.**
- Git references exposed through GitHub API: **2 branches** (`master` and
  `issue-18-npm-oidc-release`), **18 `refs/pull/*/head` references**, and
  **no tags** at review time. The remaining branch contains obsolete
  npm-OIDC release work and pre-root history. PR refs can preserve earlier
  commits even after deleting ordinary branches.
- No published GitHub Releases were listed. Several CI runs still retain
  downloadable `metaproject-npm-package` artifacts; their contents and
  historical job logs need independent security review.
- A **limited, pattern-based snapshot inspection** of the `master` and
  obsolete branch HEAD trees covered **172 unique file blobs**. No committed
  `.env`/private-key filenames or high-confidence matches for common
  AWS, GitHub, Google, Slack, PEM private-key or credentialed database URL
  patterns were found. **This is not a complete historical secret scan**:
  intervening commits, PR snapshots, deleted files, logs, artifacts and
  unexpected encodings may contain data missed here.
- `package-lock.json` declares license metadata for **36 dependency entries**:
  `MIT` (28), `BSD-3-Clause` (5), `Apache-2.0` (2), and `ISC` (1).
  Lit and its included runtime packages use BSD-3-Clause. Generated browser
  bundles may incorporate third-party code and require preservation of
  appropriate notices. Declared SPDX values alone do not prove distribution
  compliance or ownership rights for this project's MIT license.
- The GitHub Release workflow is read-only by default, with
  `contents: write` on the final release job. It has a tagged-HEAD guard.
  A `release` environment is referenced in the proposed security PR, but
  its required reviewers and protection rules **must be set by an admin**.

## Security work an administrator must perform

1. **Public history:** obtain an offline mirror and fetch PR refs. Inventory
   all tags, old branch tips, commit ancestry, PR conversations/attachments,
   issue comments, GitHub Pages/legacy references and downloadable workflow
   logs/artifacts. Preserve an approved archival copy before any ref cleanup.
   Assess the previous Bravado project separately and record repository IDs,
   origin/transfer and legal attribution. Do not assume disappearing branches
   eliminates publicly reachable commits.
2. **Secrets:** use a maintained full-history scanner (for example Gitleaks)
   on **all** refs. Review findings privately; rotate/revoke any exposed key,
   and remediate exposure under organization policy. Never paste suspected
   secrets into public issues, CI logs, or this document.
3. **Licensing:** obtain explicit copyright/MIT approval from rights holders
   and check third-party licenses/notices in the `npm pack` tarball and in
   esbuild-generated browser bundles, particularly Lit's BSD-3-Clause notice.
   Review dependencies/versions and any non-code sample assets.
4. **Reporting:** enable **Private vulnerability reporting** in the repository's
   Security settings and verify that an external reporter can reach
   [the private advisory form](https://github.com/bravado/metaproject/security/advisories/new).
   Also review dependency alerts, secret scanning and push protection settings
   available to the organization.
5. **Protection:** check effective rules for `master` and `v*` tags (prevent
   force pushes/deletions, require passing checks and reviews as appropriate).
   Under Settings → Environments configure a `release` environment with
   **required reviewers** (and branch/tag restrictions if offered). The mere
   existence of an environment does not require approval. Verify release asset
   immutability and scoped Actions permissions; record screenshots/settings.
6. **Authorization:** record independent security, licensing, maintainership
   and organizational permission for release. Only then mark #22 complete
   and proceed to the final version/tag sequence in #23.

## Reproducible history audit (local, confidential)

A GitHub administrator or designated security reviewer with the necessary
permissions should perform a **mirror**, not only a default-branch clone:

```bash
git clone --mirror https://github.com/bravado/metaproject.git metaproject-audit.git
git -C metaproject-audit.git fetch origin '+refs/pull/*/head:refs/pull/*/head'
git -C metaproject-audit.git for-each-ref --format='%(refname) %(objectname)'
git -C metaproject-audit.git rev-list --all --count

# Install/review a trusted scanner version, then check its help for flags.
gitleaks git --source metaproject-audit.git --log-opts='--all' --redact
```

Perform the scan on trusted local infrastructure; keep detailed findings
private. Cross-check accessible GitHub Actions logs and artifacts separately,
since Git history scanners do **not** inspect those. Manually review PR/issue
metadata and historical objects that are not covered by the mirror.

## Release disposition

- **Code-level defense:** basic tracked-file secret checks and dependency-license
  metadata checks are added to tests; `.gitignore` discourages accidentally
  committing local credentials; CI checkout no longer persists credentials.
- **Workflow gate:** GitHub Release publication uses the `release` environment,
  which administrators must configure with required reviewers.
- **Still blocked:** complete history scan, historical metadata and artifact
  review, provenance/legacy archive, rights-holder and notice verification,
  vulnerability-reporting confirmation, effective tag/branch/environment
  protections and written approvals.

Keep [#22](https://github.com/bravado/metaproject/issues/22) open until all
independent gates have been evidenced and approved. Reference this checklist
in [release instructions](releasing.md).
