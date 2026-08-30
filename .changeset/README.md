# Changesets

Hello and welcome! This folder has been automatically generated via `npx changeset init`.

## What is a changeset?

A changeset is a piece of information about changes made in a branch or commit.
It holds three bits of information:

- What we need to release
- What type of release it is (patch/minor/major)
- A description of the change for the changelog

You can create one with:

```bash
npx changeset
```

Follow the prompts. A markdown file like `fluffy-pandas-fly.md` will be created
in this folder. Commit it alongside your code — one changeset per user-facing
change. CI checks that PRs touching `src/**` include a changeset (unless the
PR has label `trivial` or `skip-changelog`).

## Versioning

When ready to release, run locally (from `main`):

```bash
npx changeset version   # bumps package.json + updates CHANGELOG.md, removes fragments
git add -A && git commit -m "chore: version packages"
git tag v0.x.y && git push --follow-tags
```

The `changelog` formatter is `@changesets/changelog-github` (repo:
`openzync/openzync-frontend`) so entries link back to PRs/commits.

More docs: https://github.com/changesets/changesets

> **Note — seed fragment:** `large-moons-move.md` is intentional. It documents
> the initial changesets infra (config, CHANGELOG seed, CI jobs, npm scripts)
> and will be consumed automatically on the next `npx changeset version`
> (do not delete it pre-merge).
