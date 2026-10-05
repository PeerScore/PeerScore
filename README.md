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
| `npm run db:seed` | Seed fields, 8 fictional researchers with per-publication analyses + synthesis, 2 queued submissions (idempotent) |
| `npm run db:reset` | Drop, re-migrate and re-seed the database (destructive) |
| `npm test` | Unit tests: scoring helpers + worker (field mapping, OpenAlex mapping, JSON parsing, mock models) |

The Prisma client is generated with `engineType = "client"` and talks to Postgres through
`@prisma/adapter-pg`, so the app runtime needs no Prisma engine binary.

## Worker

The worker (`worker/`) is a separate long-running process that turns each `QUEUED`
submission into a published researcher article. The unit of analysis is the
**publication**: every paper is reviewed by every model, the researcher score is an
aggregate of the paper scores and the researcher-level text is a synthesis of the
per-paper reviews.

1. **Claim** — `claimNextSubmission()` atomically takes the oldest `QUEUED` submission
   (status → `RESOLVING`). Several workers can run side by side.
2. **Resolve** — the name is looked up in [OpenAlex](https://docs.openalex.org)
   (`/authors?search=`), the best match is chosen by name similarity + works count, and
   the author's most-cited works are fetched (`MAX_PUBLICATIONS`, default 50) with
   abstracts rebuilt from the inverted index, the `cited_by_count` (stored as
   `citationCount`) and a "has code" heuristic. The OpenAlex topic taxonomy is mapped to
   a PeerScore field (`worker/fields.ts`); unknown areas land in a `general` field that
   the worker creates on demand.
3. **Fetch** (status `FETCHING`) — researcher + publications are upserted through the
   repositories (existing publication rows are matched by OpenAlex id / DOI / title so
   their ids survive) and the submission is linked to the researcher.
4. **Analyze** (status `ANALYZING`) — an `AnalysisRun` is opened, then **for each
   publication** (`PAPER_CONCURRENCY` papers at a time, default 3) the field's reviewer
   prompt (`prompts/<promptKey>.md`, front-matter `version`, sha recorded on the run) is
   applied to *that paper* (title, year, venue, citations, code availability, abstract)
   and sent to every enabled LLM provider in parallel. Each model must return strict JSON
   `{ scores, rationale, summary, strengths, concerns }` (`worker/schema.ts`,
   zod-validated; one automatic repair round on invalid output). A paper needs at least
   one successful model: its `PublicationAnalysis` stores every `ModelScore`, the
   consensus score (mean of the model weighted scores) and the median model's prose;
   otherwise the analysis is marked `FAILED` and the paper is excluded.
   Then **one synthesis call** (`prompts/_synthesis.md`, first provider that answers)
   receives the researcher and the list of per-paper summaries / scores / strengths /
   concerns plus a computed note on the widest model disagreement, and returns
   `{ summary, sections[3], disagreement }`.
   `completeRun()` computes the researcher score — citation-weighted mean of the paper
   scores with weight `1 + ln(1 + citations)` — the spread (max − min of the paper
   scores), the field median and `publicationsAnalyzed`, and makes the run and its
   publication analyses current in one transaction.
5. **Publish** — status → `PUBLISHED`; the article page is live. Any exception marks the
   run `FAILED` and the submission `FAILED` with the error message (visible on `/queue`).

```bash
npm run worker          # poll forever (POLL_INTERVAL_MS, default 10 s), SIGTERM/SIGINT stop gracefully
npm run worker:once     # process one submission (or none) and exit
npm run worker:smoke    # one pass in mock + fixture mode against DATABASE_URL, prints slug, score + per-paper scores
```

Logs are JSON lines with a timestamp (`LOG_LEVEL=debug` for more).

### Mock mode

With no API keys configured — or with `LLM_MOCK=1` — the worker uses three deterministic
mock models (`model-a`, `model-b`, `model-c`): per-paper scores and prose are generated
from a PRNG seeded with the paper title and the model id (the synthesis from the
researcher name), so the same works always produce the same article and the three
models disagree a little. `OPENALEX_FIXTURE=1` replaces
the OpenAlex API with `worker/__fixtures__/*.json` (the fixture author takes the submitted
name). Together they allow the full pipeline to run offline; this is the default in
`docker compose` (`LLM_MOCK=1`).

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | Postgres connection (required) |
| `LLM_MOCK` | unset | `1` → mock models only |
| `LLM_PROVIDERS` | keys present, else mock | Comma list of `anthropic`, `openai`, `mock` |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | — / `claude-sonnet-4-5` | Anthropic provider |
| `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL` | — / `gpt-4o` / — | OpenAI (or compatible) provider |
| `LLM_TIMEOUT_MS` / `LLM_MAX_OUTPUT_TOKENS` | `180000` / `4096` | Provider limits |
| `OPENALEX_MAILTO` | — | Your e-mail for the OpenAlex polite pool |
| `OPENALEX_BASE_URL` | `https://api.openalex.org` | API base |
| `OPENALEX_FIXTURE` | unset | `1` → fixture data instead of the API |
| `MAX_PUBLICATIONS` | `50` | Most-cited works fetched and reviewed per researcher |
| `PAPER_CONCURRENCY` | `3` | Publications reviewed at the same time (each fans out to every provider) |
| `HTTP_TIMEOUT_MS` | `15000` | Per-request timeout (3 retries with backoff) |
| `POLL_INTERVAL_MS` | `10000` | Sleep when the queue is empty |
| `WORKER_ONCE` | unset | `1` → single pass then exit |
| `PROMPTS_DIR` | `./prompts` | Prompt files location |
| `ABSTRACT_MAX_CHARS` | `900` | Abstract truncation in the model input |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

### Prompts

One Markdown file per field in `prompts/` (`compbio`, `ml`, `physics-cm`, `oncology`,
`applied-math`, `marine-ecology`, `behavioral-econ`, `astrophysics`, `general`). Each
starts with front-matter (`version: 2`), explains what rigor, reproducibility, novelty,
impact and clarity mean in that field, and specifies the JSON output for **one
publication**. `prompts/_synthesis.md` is the researcher-level synthesis prompt (it reads
the per-paper reviews, not the papers). Editing a prompt changes its sha, which is
recorded on every `AnalysisRun` for provenance.

## Docker

```bash
docker compose up --build --renew-anon-volumes
```

Starts a Postgres 16 database on `localhost:5432` (`peerscore` / `peerscore`, db `peerscore`),
applies the migrations, seeds the demo data, then runs the Next.js dev server (hot reload) on
[http://localhost:3000](http://localhost:3000).

Or double-click `dev.command` (uses Docker if available, otherwise `npm run dev`).
