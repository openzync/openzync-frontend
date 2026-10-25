---
"frontend": patch
---

Add security headers (`X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, minimal CSP) in `next.config.ts`. Tokens stay in `localStorage` for now — the httpOnly-cookie migration needs a backend change and is out of scope.
