# PeerScore

Open-source Next.js site that indexes researchers worldwide and analyzes their publications with LLMs.

## Concept

1. A visitor clicks **Submit your researcher** and fills in a single `name` field.
2. The site confirms the analysis is queued; results are visible within **24–48 h**.
3. The submission is stored in the database.
4. An asynchronous agent picks up each submission, downloads the researcher's publications,
   runs an LLM analysis with a prompt specific to the research field, and publishes the result automatically.

## Getting started

```bash
npm install
cp .env.example .env        # DATABASE_URL → local Postgres 16
npm run db:migrate          # create / update the schema (prisma migrate dev)
npm run db:seed             # fictional demo data
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database

Postgres 16 + [Prisma 6](https://www.prisma.io/). The schema lives in `prisma/schema.prisma`
(model names follow `docs/SPEC.md`), migrations in `prisma/migrations/`, the demo seed in
`prisma/seed.ts`. All data access goes through `src/lib/repositories/*` (never call Prisma
from components); `src/lib/db.ts` exports the `prisma` singleton.

| Script | What it does |
| --- | --- |
| `npm run db:generate` | Regenerate the Prisma client after editing the schema |
| `npm run db:migrate` | `prisma migrate dev` — create a migration from schema changes and apply it (dev) |
| `npm run db:deploy` | `prisma migrate deploy` — apply pending migrations (CI / Docker / prod) |
| `npm run db:seed` | Seed fields, 8 fictional researchers with analyses, 2 queued submissions (idempotent) |
| `npm run db:reset` | Drop, re-migrate and re-seed the database (destructive) |
| `npm test` | Unit tests for the pure scoring helpers (`node:test`) |

The Prisma client is generated with `engineType = "client"` and talks to Postgres through
`@prisma/adapter-pg`, so the app runtime needs no Prisma engine binary.

## Docker

```bash
docker compose up --build
```

Starts a Postgres 16 database on `localhost:5432` (`peerscore` / `peerscore`, db `peerscore`),
applies the migrations, seeds the demo data, then runs the Next.js dev server (hot reload) on
[http://localhost:3000](http://localhost:3000).

Or double-click `dev.command` (uses Docker if available, otherwise `npm run dev`).
