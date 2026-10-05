# PeerScore — build spec (shared by all agents)

PeerScore is an open-source Next.js 16 (App Router, TypeScript, Tailwind 4) site that indexes researchers worldwide and analyzes their publications with several LLMs, using a prompt specific to the research field. UI language: English. Code comments: English.

## Visitor flow
1. Visitor clicks "Submit a researcher", fills ONE field: `name`. No account.
2. A message confirms: "Analysis queued… results within 24–48 h" (request id + queue position).
3. Submission stored in Postgres with status `QUEUED`.
4. A worker (separate process) picks submissions asynchronously: resolves the researcher in open records (OpenAlex), downloads publication metadata/abstracts, runs the field-specific LLM analysis with several models, writes the result, status → `PUBLISHED`. The article page goes live automatically.

## Domain model (Prisma, Postgres) — authoritative names
- `Submission` { id (cuid), name, status: QUEUED|RESOLVING|FETCHING|ANALYZING|PUBLISHED|FAILED, error?, researcherId?, createdAt, updatedAt }
- `Researcher` { id, slug (unique, from name), name, affiliation?, country?, orcid?, openalexId?, fieldId, activeFrom?, activeTo?, publicationCount, openCodeCount, topics: string[], createdAt, updatedAt }
- `Field` { id, slug (unique), name, promptKey (e.g. "compbio"), weights: Json {rigor, reproducibility, novelty, impact, clarity} }
- `Publication` { id, researcherId, title, year, venue?, doi?, url?, abstract?, hasCode: boolean, score?: Int }
- `AnalysisRun` { id, researcherId, status, promptKey, promptVersion, promptSha, startedAt, finishedAt?, durationSec?, score? (weighted consensus 0-100), spread?, fieldMedian?, summary? (markdown), disagreement? (markdown), sections: Json (array of {title, body}), isCurrent: boolean }
- `ModelScore` { id, runId, model (string, e.g. "model-a"), rigor, reproducibility, novelty, impact, clarity, weighted, rationale: Json }

Scores are integers 0–100. Consensus = mean of model weighted scores, rounded. Spread = max − min of model weighted scores.

### Prisma notes (data layer, implemented)
- `Submission.status` and `AnalysisRun.status` are Postgres enums: `SubmissionStatus` (values above) and `RunStatus { RUNNING, COMPLETED, FAILED }`. A run is "live" when `isCurrent && status = COMPLETED`; `completeRun()` sets `isCurrent` on the new run and clears it on older runs in one transaction.
- `ModelScore` has `@@unique([runId, model])`. `Researcher.activeFrom/activeTo` are `Int` years. `Field.weights` and `AnalysisRun.sections` / `ModelScore.rationale` are `Json`.
- Derived researcher status for the index filters (`src/lib/types.ts` → `ResearcherStatus`): `published` (has a live run), `analyzing` (a RUNNING run, nothing live), `pending` (neither). `GET /api/researchers` also accepts `status`, `letter`, `pageSize`, `sort=score|name|recent` (default `score`).
- `POST /api/submissions` returns `200 { existingSlug }` when a researcher with the same slug already exists (nothing is created) and `201 { id, position }` otherwise; a name already in the pipeline returns that submission instead of a duplicate.
- Prisma client is generated with `engineType = "client"` + `@prisma/adapter-pg` (no Rust query engine at runtime); CLI options live in `prisma.config.ts`.

## Routes
- `/` main page (featured analysis, recently published, browse by field, how it works, stats)
- `/researchers` index (A–Z nav, filters: field, status, min score; table; pagination)
- `/researchers/[slug]` article (contents sidebar, infobox with score ring, score breakdown table with per-model columns, analysis sections, publications table, provenance, references, categories)
- `/submit` single-field form → confirmation state (server action)
- `/queue` list of non-published submissions with status
- `GET /api/researchers?q=&field=&minScore=&page=` JSON
- `POST /api/submissions` { name } → { id, position }
- `GET /api/researchers/[slug]` JSON export

## Data access
All pages/API go through `src/lib/repositories/*.ts` (no Prisma calls in components). `src/lib/db.ts` exports a singleton `prisma`.

## Design tokens (from the approved mockups)
- Fonts (next/font/google): headings `Source Serif 4` (weights 400/500/600), body `Instrument Sans` (400/500/600), data `JetBrains Mono` (400/500/600).
- Light: page bg `#F6F6F4`, surface `#FFFFFF`, border `#E6E6E2`, hairline `#F0F0EC`, ink `#16181D`, text `#1F2937`, muted `#6B7280`, link `#3B5BDB`.
- Dark (class `dark` on html): page `#0F1115`, surface `#171A20`, border `#262A33`, hairline `#22262E`, ink `#F4F5F7`, text `#C4C8D0`, muted `#8B919C`, link `#8FA6FF`.
- Score colors: high (≥70) green `#0E8A6D` on `#E6F4EF` (dark: `#2DD4A8` on `#10302A`); mid (50–69) amber `#C77A14` on `#FBF1DF` (dark `#F5B04C` on `#332512`); low (<50) red `#C43D3D` on `#FBE7E7` (dark `#F08080` on `#3A1A1A`).
- Field chip: `#EEF2FF` / `#3730A3` (dark `#252A45` / `#C7D2FE`).
- Radii: cards 16px, inputs/buttons 10–12px, chips 999px. Shadows minimal: `0 1px 2px rgba(16,24,40,.04)`.
- Layout: max-width 1232px, 24px gutters; article = left contents rail (220px) + main + infobox (300px); everything wraps on phone.
- Components to build: Header (logo, search with `/` kbd, nav Index/Recent/Random, dark CTA), Footer, Chip, ScorePill, ScoreRing (SVG), ScoreBar, SegmentedTabs, Card, Infobox, ContentsRail, DataTable, Notice (warning), ThemeToggle.
- Accessibility: real buttons/links/labels, 44px touch targets, 4.5:1 contrast.

## Dev environment
`docker compose up --build` → web (next dev, hot reload) + Postgres 16 (`DATABASE_URL=postgres://peerscore:peerscore@db:5432/peerscore`). Local without Docker: `.env` with `DATABASE_URL=postgres://peerscore:peerscore@localhost:5432/peerscore`.
