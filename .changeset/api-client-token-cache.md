---
"frontend": patch
---

Centralized token access behind tokenStorage single-swap for future httpOnly-cookie migration with credentials:include on all fetch sites, and bounded the GET cache with expiry-delete + 200-entry LRU while preserving 30s TTL and /v1/auth/me bypass.
