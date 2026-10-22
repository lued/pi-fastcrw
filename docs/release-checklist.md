# Security defaults for a public release

Checklist for a public pi package or Paseo plugin. It is what this repository follows for
`pi-fastcrw`; the items marked *one-time* apply once per repository, the rest to every release.

Sources: GitHub's own defaults, the hardening used by public pi packages
(`pi-web-access` pins actions by SHA with `persist-credentials: false`, `pi-goal-x` and
`rpiv-mono` run Dependabot, `pi-web-access` and `pi-subagents` ship a `SECURITY.md`), and the
Paseo registry review policy (`getpaseo/plugins` `REVIEW.md`, `omercnet/paseo-plugins`
`SECURITY.md`).

## 1. Repository settings (one-time)

- [ ] Secret scanning, push protection, validity checks and non-provider patterns are enabled.
      `gh api repos/<owner>/<repo> --jq .security_and_analysis`
- [ ] Dependabot alerts and security updates are enabled; `.github/dependabot.yml` covers
      `github-actions` and the package ecosystem you actually use.
- [ ] Private vulnerability reporting is enabled, and `SECURITY.md` links to it.
- [ ] Account has 2FA, and no unreviewed collaborator or deploy key exists.
- [ ] Default branch is protected: no force-push, no deletion, review for other people's PRs.
- [ ] `delete_branch_on_merge` and wiki settings are what you intend (a public wiki is a second
      content surface with its own history).
- [ ] Git commit identity is a role address or a `noreply` address, never a personal mailbox that
      you would not publish. Check with `git log --all --format='%ae' | sort -u`.
- [ ] Author name and URL in `package.json` are the ones you want public.

## 2. Every commit

- [ ] `git diff --cached` is reviewed, and staged explicit paths only.
- [ ] No credential, token, engine key, webhook secret or private hostname is in the staged diff.
- [ ] No absolute home path (`/home/<user>`, `/Users/<user>`), machine name, workspace id or
      internal domain in code, docs, test fixtures or capture files.
- [ ] `.gitignore` covers `node_modules`, `*.tgz`, `.env*`, key material (`*.pem`, `*.key`,
      `*.p12`), and editor or OS droppings.
- [ ] A test fixture made from real output had its paths, ids and payloads replaced first.

## 3. Automation

- [ ] `npm run check:secrets` passes locally and in CI. It fails on provider token shapes, private
      key headers, long assigned secrets and private home paths, and prints the location only.
- [ ] Workflows declare least privilege, normally `permissions: { contents: read }`.
- [ ] Third-party actions are pinned by commit SHA with the version in a comment; `checkout` sets
      `persist-credentials: false`.
- [ ] No `pull_request_target` job checks out or executes fork content, and no workflow echoes a
      secret, even masked.
- [ ] CI installs with `npm ci` from the committed lockfile, never `npm install`.
- [ ] CI runs the same commands a maintainer runs locally.

## 4. Package manifest

- [ ] `files` is an allowlist: the extension entry, README, LICENSE, CHANGELOG, and only the docs
      and assets that belong in the artifact. Tests, fixtures, capture scripts and plans stay out.
- [ ] Host packages (`@earendil-works/pi-*`, `typebox`) are `"*"` `peerDependencies`, never
      `dependencies`; the tested versions are pinned in `devDependencies`.
- [ ] No `preinstall`, `install` or `postinstall` script. Publishable packages run no code at
      install time.
- [ ] `private: true` for anything that must never reach a registry.
- [ ] The name is free before you rely on it:
      `npm view <name> version` must 404, or the name is already someone else's package.
- [ ] `license`, `repository`, `homepage`, `bugs`, `engines` and the `pi-package` keyword are set.
- [ ] `pi` manifest entries are relative paths; `pi.image`/`pi.video` are absolute HTTPS URLs.
- [ ] A `SECURITY.md` states supported versions, the private reporting path, and what is out of
      scope.

## 5. Before tagging

- [ ] Full-history scan, not just the working tree:
      `git rev-list --objects --all | git cat-file --batch | grep -aE '<token patterns>'`
      or the object scan described in section 3. History is what a clone gets.
- [ ] Tags are reviewed too: `git tag -n` and `git ls-remote --tags origin`.
- [ ] `npm pack --dry-run` file list is exactly what you expect, with no fixture, no local path
      and no screenshot of a private session.
- [ ] Screenshots and recordings are re-checked at full size for hostnames, keys, tabs, notifications
      and spill paths.
- [ ] `CHANGELOG.md` has a dated section for the version.
- [ ] The README's install line resolves today, and its version pin matches the tag you are about
      to publish.

## 6. Publish

- [ ] `npm publish --dry-run` then `npm publish --access public --provenance` from a clean
      checkout, with a granular token or trusted publishing, never a classic token in a file.
- [ ] The tag is created from the published commit and pushed; the remote SHA equals the local one.
- [ ] `npm audit signatures` verifies the published provenance.
- [ ] An install in a throwaway `HOME` loads the extension and runs one real call before the
      announcement.

## 7. Runtime defaults this repository already implements

Documented in `docs/security.md`; keep them true:

- credentials come only from user config or environment, each pinned to its own origin, HTTPS
  required off loopback, manual redirects, job ids path-encoded;
- state written `0600` into `0700` directories, atomic replace, no secrets in snapshot metadata;
- best-effort redaction of known keys and header values, with the documented limit spelled out;
- fetched content wrapped as `<untrusted-web-content>` and treated as evidence;
- bounded output with private spill files, terminal control escaping, no model-callable admin reset.

## 8. Reviewing someone else's pi package or Paseo plugin

The Paseo registry reviews the artifact, not the README. Check, in this order:

- [ ] The artifact is inspectable: source or a source map for bundled code, and a pinned commit or
      version you can diff.
- [ ] Dependencies and preparation scripts: resolved origin, install behaviour, anything unexplained.
- [ ] Network: destinations, what is sent, whether credentials are attached, and what triggers it.
- [ ] Credentials and environment: which secrets are read, from where, and where they go. Keychain
      or another plugin's storage reads are findings unless the purpose requires them.
- [ ] Filesystem: what is read, written or deleted, and whether the user controls it.
- [ ] Execution: subprocesses, shell construction, `eval`, generated or remote code, and the path
      from external input to execution.
- [ ] Runtime downloads: what is installed, from where, and whether the user must confirm. Declining
      must leave nothing installed.
- [ ] Sandboxing claims: "trusted, unsandboxed code" is the default for both ecosystems, so state it
      rather than implying isolation.
