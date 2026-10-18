---
"frontend": patch
---

Route 401 sign-outs through client-side navigation instead of a full
page reload, preserving app shell state. The redirect stays scoped to
the authenticated layout.
