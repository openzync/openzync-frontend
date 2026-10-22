---
"frontend": patch
---

Rebuild the request body from stored args before retrying after a 401
refresh, so FormData uploads no longer fail on token renewal. Debounce the
command palette search (100ms, 2-char minimum, only while open) with stale
response guards and in-flight abort. Encode graph node ids in navigation
URLs. Cache the access token in memory to avoid repeated cookie reads, and
fail closed (sign out) when a refresh is rejected so a stale session can no
longer linger. Note: legacy `openzync_token` cookie sessions will need to
re-authenticate once against the `__Host-` prefixed cookie.
