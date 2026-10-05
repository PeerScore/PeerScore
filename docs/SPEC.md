# PeerScore — build spec (shared by all agents)

PeerScore is an open-source Next.js 16 (App Router, TypeScript, Tailwind 4) site that indexes researchers worldwide and analyzes their publications with several LLMs, using a prompt specific to the research field. UI language: English. Code comments: English.

## Visitor flow
1. Visitor clicks "Submit a researcher", fills ONE field: `name`. No account.
2. A message confirms: "Analysis queued… results within 24–48 h" (request id + queue position).
3. Submission stored in Postgres with status `QUEUED`.
4. A worker (separate process) picks submissions asynchronously: resolves the researcher in open records (OpenAlex), downloads publication metadata/abstracts, runs the field-specific LLM analysis with several models, writes the result, status → `PUBLISHED`. The article page goes live automatically.

## Domain model (Prisma, Postgres) — authoritative names
The unit of analysis is the **publication**: every paper is read and scored by several LLMs with the field-specific prompt; the researcher's score is an aggregate of its publications and the researcher-level text is a synthesis generated from the per-publication analyses.

- `Submission` { id (cuid), name, status: QUEUED|RESOLVING|FETCHING|ANALYZING|PUBLISHED|FAILED, error?, researcherId?, createdAt, updatedAt }
- `Researcher` { id, slug (unique, from name), name, affiliation?, country?, orcid?, openalexId?, fieldId, activeFrom?, activeTo?, publicationCount, openCodeCount, topics: string[], createdAt, updatedAt } — no score columns; the score lives on the current `AnalysisRun`.
- `Field` { id, slug (unique), name, promptKey (e.g. "compbio"), weights: Json {rigor, reproducibility, novelty, impact, clarity} }
- `Publication` { id, researcherId, title, year, venue?, doi?, url?, abstract?, hasCode: boolean, citationCount (OpenAlex `cited_by_count`, default 0), openalexId? } — no stored score (derived from its current `PublicationAnalysis`).
- `AnalysisRun` — researcher-level batch + synthesis { id, researcherId, status, promptKey, promptVersion, promptSha, models: string[], startedAt, finishedAt?, durationSec?, score? (aggregate, see below), spread? (max − min of the current publication scores), fieldMedian?, publicationsAnalyzed, summary? (markdown synthesis, 2 paragraphs), disagreement? (markdown: the publication/criterion where models disagree most), sections: Json (array of {title, body}), isCurrent: boolean }
- `PublicationAnalysis` { id, publicationId, runId, status, score? (consensus 0–100 = rounded mean of the model weighted scores), spread? (max − min of the model weighted scores), summary? (markdown, one short paragraph), strengths: Json (string[]), concerns: Json (string[]), isCurrent, createdAt, finishedAt? } — `@@unique([runId, publicationId])`, `@@index([publicationId, isCurrent])`.
- `ModelScore` { id, analysisId (→ PublicationAnalysis), model (string, e.g. "model-a"), rigor, reproducibility, novelty, impact, clarity, weighted, rationale: Json } — `@@unique([analysisId, model])`.

Scores are integers 0–100. Per model and publication: `weighted` = weighted mean of the five criteria with the field weights. Per publication: consensus = mean of the model weighted scores, rounded; spread = max − min. Per researcher (`src/lib/scoring.ts` → `aggregateResearcherScore`): citation-weighted mean of the current publication scores with weight `w = 1 + ln(1 + citationCount)` (uncited papers still count with weight 1), rounded; spread = max − min of the publication scores.

### Prisma notes (data layer, implemented)
- `Submission.status`, `AnalysisRun.status` and `PublicationAnalysis.status` are Postgres enums: `SubmissionStatus` (values above) and `RunStatus { RUNNING, COMPLETED, FAILED }`. A run is "live" when `isCurrent && status = COMPLETED`; `completeRun()` derives score/spread/publicationsAnalyzed from the run's COMPLETED publication analyses, sets `isCurrent` on the run and on those analyses, and clears it on the researcher's older runs / analyses in one transaction. A publication whose every model failed has a FAILED analysis and is excluded from the aggregate.
- `replacePublications()` matches existing rows by OpenAlex id, DOI or (title, year) so publication ids — and the analyses attached to them — survive a re-analysis.
- `Researcher.activeFrom/activeTo` are `Int` years. `Field.weights`, `AnalysisRun.sections`, `PublicationAnalysis.strengths/concerns` and `ModelScore.rationale` are `Json`.
- Derived researcher status for the index filters (`src/lib/types.ts` → `ResearcherStatus`): `published` (has a live run), `analyzing` (a RUNNING run, nothing live), `pending` (neither). `GET /api/researchers` also accepts `status`, `letter`, `pageSize`, `sort=score|name|recent` (default `score`).
- `POST /api/submissions` returns `200 { existingSlug }` when a researcher with the same slug already exists (nothing is created) and `201 { id, position }` otherwise; a name already in the pipeline returns that submission instead of a duplicate.
- `GET /api/researchers/[slug]` returns `ResearcherArticle`: `run` (aggregate, synthesis, `models`, `modelAverages` = per-model criterion averages over the publications) and `publications[]`, each with `citationCount` and `analysis` ({ score, spread, summary, strengths, concerns, modelScores[] } or null).
- Prisma client is generated with `engineType = "client"` + `@prisma/adapter-pg` (no Rust query engine at runtime); CLI options live in `prisma.config.ts`.

## Routes
- `/` main page (featured analysis, recently published, browse by field, how it works, stats)
- `/researchers` index (A–Z nav, filters: field, status, min score; table; pagination)
- `/researchers/[slug]` article (contents sidebar, infobox with score ring + "citation-weighted mean of N publications · spread · field median", score breakdown = per-criterion averages across publications with per-model average columns, synthesis sections + disagreement, publications list — most cited first, each row expandable to its per-paper analysis: criterion bars with per-model values, summary, strengths, concerns — provenance, references, categories)
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
