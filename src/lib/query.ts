// Parse the researcher index query string. Shared by the /researchers page
// (searchParams) and GET /api/researchers.
import {
  RESEARCHER_SORTS,
  RESEARCHER_STATUSES,
  type ResearcherListParams,
  type ResearcherSort,
  type ResearcherStatus,
} from "./types";

type SearchParamsLike = URLSearchParams | Record<string, string | string[] | undefined>;

function read(params: SearchParamsLike, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

function intParam(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function parseResearcherListParams(params: SearchParamsLike): ResearcherListParams {
  const status = read(params, "status");
  const sort = read(params, "sort");
  return {
    q: read(params, "q"),
    field: read(params, "field"),
    minScore: intParam(read(params, "minScore")),
    status: status && (RESEARCHER_STATUSES as readonly string[]).includes(status) ? (status as ResearcherStatus) : undefined,
    letter: read(params, "letter"),
    page: intParam(read(params, "page")),
    pageSize: intParam(read(params, "pageSize")),
    sort: sort && (RESEARCHER_SORTS as readonly string[]).includes(sort) ? (sort as ResearcherSort) : undefined,
  };
}
