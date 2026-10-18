---
"frontend": patch
---

Load older chat messages through the backend keyset cursor instead of
re-fetching the whole prefix, and stop distinct id-less messages with
equal text from collapsing into one. The initial page is now the newest
100 messages; display order is unchanged.
