---
"frontend": patch
---

Fix the audit log page getting stuck in its loading state and rendering stale
rows when a background refresh resolves after a foreground filter change.
