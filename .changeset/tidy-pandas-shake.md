---
"frontend": patch
---

Add a CI `test` job (`npm ci` + `npm test`) on pull requests, and pass `NEXT_PUBLIC_API_URL` as a compose `build.args` (with a rebuild-on-domain-change note) since the value is baked at build time.
