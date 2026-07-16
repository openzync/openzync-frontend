# OpenZync Frontend

**Admin dashboard for the OpenZync agent memory platform.**

<p align="center">
  <img src="https://img.shields.io/badge/next.js-16.2.9-black" alt="Next.js 16">
  <img src="https://img.shields.io/badge/react-19.2-blue" alt="React 19">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

Web interface for managing agent memory — graph visualization, tenant administration, and system configuration.

Built with [Next.js](https://nextjs.org) 16, [React](https://react.dev) 19, [Tailwind CSS](https://tailwindcss.com) 4, and [D3.js](https://d3js.org) for graph exploration.

## Features

- **Knowledge graph visualization** — interactive D3.js force-directed graph for exploring entities, relationships, and communities
- **Memory browser** — inspect and search ingested episodes, facts, and classifications
- **Tenant management** — create and manage organizations, projects, and API keys
- **Session viewer** — browse conversation sessions and message history
- **System config UI** — configure LLM providers, rate limits, and webhooks
- **Dark/light theme** — next-themes with system preference detection
- **Command palette** — cmdk-powered quick navigation

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.9 (App Router) |
| UI Library | React 19.2, Radix UI primitives |
| Styling | Tailwind CSS 4, tailwind-merge, class-variance-authority |
| Graph Viz | D3.js 7 |
| Icons | Lucide React |
| Toasts | sonner |
| Codegen | openapi-typescript (from openzync-core) |
| Package Manager | npm |

## Getting Started

```bash
# Install dependencies
npm install

# Generate API client from local core OpenAPI spec
npx openapi-typescript ../openzync-core/openapi.json -o src/lib/api.ts

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Build & Deploy

```bash
# Production build
npm run build

# Start production server
npm start

# Docker
docker build -t openzync-frontend .
docker run -p 3000:3000 openzync-frontend
```

## Related Repositories

- [openzync-core](https://github.com/openzync/openzync-core) — backend API this dashboard connects to
- [openzync-landing](https://github.com/openzync/openzync-landing) — marketing site at [openzync.tech](https://openzync.tech)

## License

MIT — see [LICENSE](./LICENSE).
