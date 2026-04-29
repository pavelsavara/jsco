# Plan 3: Publish to npm

## Motivation
JSCO is at a healthy v0.1.0 milestone:
- 763 tests / 24 suites green; only 2 capability-gated skips (Firefox JSPI).
- WASIp1, WASIp2, WASIp3 hosts all implemented and adapter-bridged.
- Demo site already live.
- Publish workflow already wired ([.github/workflows/publish.yml](.github/workflows/publish.yml)).
- `npm view @pavelsavara/jsco version` returns "not on npm" — nothing has been released yet.

Continuing to harden in private has diminishing returns. Shipping starts the external-feedback loop. Even an explicit *preview* release is high-leverage.

## Goal
Publish `@pavelsavara/jsco@0.2.0-preview.0` (or similar) to npm under `--access public`, with documentation that sets honest expectations about preview status.

## Approach

### Step 1: Pre-flight checklist
- [ ] [package.json](package.json) `name`, `version`, `description`, `license`, `repository`, `homepage`, `bugs`, `keywords` are all set sensibly for discovery.
- [ ] `files` whitelist published is minimal — `dist/`, `README.md`, `LICENSE`, `THIRD-PARTY-NOTICES.TXT`. No tests, no integration-tests, no `.map` files (or include them — decide).
- [ ] `exports` map covers: main entry, type entry, on-demand `host/wasip3`, `host/wasip2-via-wasip3`, `host/wasip1-via-wasip3`, `host/wasip3-node`, etc. Each with `import`/`require`/`types` conditions where appropriate.
- [ ] `engines.node` set to a supported floor (Node ≥ 22 for `--experimental-wasm-jspi` if required, else lower).
- [ ] `bin` entry for the `jsco` CLI is correct and the shebang line is preserved through Rollup.
- [ ] `peerDependencies` (none expected) and `dependencies` audited; only `@thi.ng/leb128` and `just-camel-case` should be runtime.

### Step 2: Dry-run the package
- `npm pack --dry-run` and inspect the file list — confirm no leakage of source maps you don't want, no `.test.ts`, no `coverage/`, no `integration-tests/`.
- `npm pack` to produce the tarball; install it into a scratch project: `npm install ../jsco/pavelsavara-jsco-0.2.0-preview.0.tgz` and run a hello-world component.
- Try the same install in **both Node.js and a bundler** (e.g. Vite/esbuild) to confirm the `exports` map.

### Step 3: Documentation polish
- README "Status" section: replace 🚧 with an honest preview-quality statement and link to known-issue tracker.
- Add a `CHANGELOG.md` (start with a single `0.2.0-preview.0` entry summarising what works and what doesn't).
- Verify all README code samples copy-paste-run.
- Confirm the demo site's link is correct.

### Step 4: Versioning policy
- Decide the version line: `0.2.0-preview.0` and bump preview suffix until stabilization, or `0.2.0` direct. Recommend the preview suffix to avoid users assuming semver stability.
- Document the policy in CONTRIBUTING.md or README "Releasing" section.

### Step 5: Publish workflow run
- Set `NPM_TOKEN` repo secret (or use OIDC trusted publisher if available).
- Tag the release commit (e.g. `v0.2.0-preview.0`).
- Run [publish.yml](.github/workflows/publish.yml). It already does `npm publish --access public`.
- Verify `npm view @pavelsavara/jsco` shows the new version.

### Step 6: Smoke-test the published package
- In a fresh scratch project: `npm install @pavelsavara/jsco@latest` and run the README's first usage example.
- Open an issue template and a PR template if not already present.

## Acceptance criteria
- [ ] `npm view @pavelsavara/jsco version` returns the published preview version.
- [ ] A scratch project can install and run a P2 and a P3 component.
- [ ] CHANGELOG.md exists and is referenced from README.
- [ ] CI publish workflow succeeded end-to-end.

## Risks
- Once a name is published, *unpublishing* is highly restricted (24-hour window only). Triple-check the package contents and exports map before pressing the button.
- Bundler interop bugs (CJS/ESM dual-package hazard) often surface only after publish. Mitigate with the scratch-project tests in Step 2 *and* Step 6.
- Public attention may bring issue noise. Have a triage policy in mind.

## Out of scope
- 1.0 stability commitments.
- Browser CDN distribution (jsdelivr/unpkg work for free once on npm).
