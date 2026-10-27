# Release checklist: openclaw-flowspeech 0.2.1

The previous 0.2.0 package remains unchanged. Release 0.2.1 packages the reviewed
safety fixes; verify its exact artifacts and registry read-back before recording
publication. Do not overwrite 0.2.0 or move its tag.

## Required before any external write

1. Review the diff on `codex/public-api-v1`; preserve unrelated/user edits.
2. Recheck npm ownership and select a new unpublished version. The package
   already exists; source publication does not update the registry artifact.
3. Confirm the existing GitHub repository and intended release/tag target.
4. Confirm an active paid API subscription/key for real users. No paid generation
   is required for this release's automated tests.

## Local verification

Use fresh 0.2.1 output directories. Never overwrite retained registry artifacts.

Use Node 22.23.2 (the verified local runtime) or the CI matrix's Node 24.19.0.
Ensure the selected runtime's bin directory is first in PATH before invoking npm;
an absolute npm path alone does not control its node interpreter. Node 20 is
unsupported and the tooling guard rejects it before loading dependencies.
Lockfiles contain dependency integrity hashes. Installation for
this migration used `npm ci --ignore-scripts --no-audit --no-fund`; no dependency
lifecycle scripts were executed.

```bash
npm ci --ignore-scripts
npm run check:runtime
npm run test:runtime
npm test
npm run check
npm run build
npm run test:dist
npm pack --dry-run
npm pack
mkdir -p .cache/packed
tar -xzf openclaw-flowspeech-0.2.1.tgz -C .cache/packed
FLOWSPEECH_ARTIFACT_ROOT=.cache/packed/package npm run test:dist
npm run audit:package
shasum -a 256 openclaw-flowspeech-0.2.1.tgz
```

The tarball allowlist is dist, README, CHANGELOG, LICENSE, package metadata, and openclaw.plugin.json.
The source and artifact suites include actual OpenClaw config normalization,
directive parsing and rendered-error recovery checks. Re-run against each
supported host version before extending the compatibility claim.
Do not include tests, caches, node_modules, .env, credentials, reports, raw user
content or local absolute paths. The artifact smoke suite uses five-second
polling against a fake fetch and never calls production.

The four runtime-guard tests include both pinned CI version strings and unsupported
Node 20. This is not a substitute for actually running the Node 24 CI job.
CI now extracts the package before audit:package, matching the audit's input path.
Guard/test tooling is excluded from the published runtime payload.

## Coordinator-only release

1. Commit reviewed changes and publish the intended GitHub branch/tag/release
   using the existing repository; attach the verified artifact when appropriate.
2. Do not overwrite the existing 0.2.0 release. For a future unpublished version,
   follow RELEASE_PRIVACY.md to verify and publish a clean staged directory, never
   a tarball path. Existing registry path exposure has not been corrected by the
   local guard; publication remains a coordinator-only action.
3. Separately confirm ClawHub ownership, policy, release availability and the supported host matrix before any ClawHub publication. The plugin metadata is not evidence of a published ClawHub release.
4. Verify the resulting registry version, dist integrity and clean-install behavior;
   only then announce availability and update the unreleased documentation.

## Known boundaries

- The canonical service and corrected migration contract return `subscription`
  for quota metadata. It is preserved, including null; optional `entitlement`
  compatibility is also tested. The server was not changed.
- API credentials and production generation were not used. This verifies transport,
  framework contracts and artifacts, not live billing or live storage reachability.
- Redirects are rejected, including storage redirects. Custom fetch is trusted
  application code and must obey the provided signal/redirect/credential options.
- Aborting or timing out does not cancel a paid server job. Preserve request/job IDs.
- The installed OpenClaw buffered host contract has no abort signal. The plugin respects its timeout; the exported helper/client supports AbortSignal. Host voice discovery remains an offline snapshot; the client offers the live catalog. No streaming/telephony encoding is added.
