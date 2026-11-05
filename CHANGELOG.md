# Changelog

## 1.0.1

### Patch Changes

- 28250b9: Centralized token access behind tokenStorage single-swap for future httpOnly-cookie migration with credentials:include on all fetch sites, and bounded the GET cache with expiry-delete + 200-entry LRU while preserving 30s TTL and /v1/auth/me bypass.
- 226616a: Centralized email validation for sign-in and sign-up so invalid addresses now show an inline error instead of a failed server round-trip.
- 226616a: Added short-lived caching for session data so revisiting tabs reuses recent results instead of refetching everything.
- 3637a9d: Add security headers (`X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, minimal CSP) in `next.config.ts`. Tokens stay in `localStorage` for now — the httpOnly-cookie migration needs a backend change and is out of scope.
- 226616a: Reduced the session graph bundle size and scoped session tabs to the active session for faster loading.
- 3637a9d: Add a CI `test` job (`npm ci` + `npm test`) on pull requests, and pass `NEXT_PUBLIC_API_URL` as a compose `build.args` (with a rebuild-on-domain-change note) since the value is baked at build time.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This changelog is managed by [Changesets](https://github.com/changesets/changesets)
with `@changesets/changelog-github`. Fragments live in `.changeset/*.md` and are
consumed on `npx changeset version`.

## [Unreleased]

## 1.0.0 — 2026-10-22

### Major Changes

- Stable v1.0.0 release.

### Patch Changes

- Fix the audit log page getting stuck in its loading state and rendering
  stale rows when a background refresh resolves after a foreground filter
  change.
- Route 401 sign-outs through client-side navigation instead of a full page
  reload, preserving app shell state. The redirect stays scoped to the
  authenticated layout.
- Read dev origins from the environment instead of a committed LAN IP, and
  use the email keyboard with email autocomplete on the login form.
- Remove the email and session parameters from the URL once the MFA
  challenge loads, keeping the values in component state.
- Refresh the session once before signing out after a transient refresh
  failure, and show a retry/offline state instead of a blank screen.
- Add root error and loading boundaries and give the login and invite
  loading states real skeletons instead of blank screens.
- Rebuild the request body from stored args before retrying after a 401
  refresh, so FormData uploads no longer fail on token renewal. Debounce
  the command palette search (100ms, 2-char minimum, only while open) with
  stale response guards and in-flight abort. Encode graph node ids in
  navigation URLs. Cache the access token in memory to avoid repeated
  cookie reads, and fail closed (sign out) when a refresh is rejected so a
  stale session can no longer linger. Note: legacy `openzync_token` cookie
  sessions will need to re-authenticate once against the `__Host-` prefixed
  cookie.
- Load older chat messages through the backend keyset cursor instead of
  re-fetching the whole prefix, and stop distinct id-less messages with
  equal text from collapsing into one. The initial page is now the newest
  100 messages; display order is unchanged.
- Install @changesets/cli + @changesets/changelog-github, add
  .changeset/config.json (repo openzync/openzync-frontend,
  privatePackages.version=true), seed CHANGELOG.md (Keep a Changelog), add
  npm scripts and CI jobs for changesets.

## 0.1.0 — 2026-08-30

- Initial release.
