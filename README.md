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
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Docker

```bash
docker compose up --build
```

Starts the Next.js dev server (hot reload) on [http://localhost:3000](http://localhost:3000)
and a Postgres 16 database on `localhost:5432` (`peerscore` / `peerscore`, db `peerscore`).

Or double-click `dev.command` (uses Docker if available, otherwise `npm run dev`).
