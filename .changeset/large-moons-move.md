---
"frontend": patch
---

Add changesets for versioning and changelog

- Install @changesets/cli + @changesets/changelog-github
- Add .changeset/config.json (repo openzync/openzync-frontend, privatePackages.version=true)
- Seed CHANGELOG.md (Keep a Changelog)
- Add npm scripts changeset, changeset:check, changeset:version, changeset:publish
- Add CI jobs changeset-check (PR gate) and changeset-version (tag helper) to deploy.yml
