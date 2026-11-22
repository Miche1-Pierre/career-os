/** URL ⇄ filters for the applications list (shareable, bookmarkable, used by saved views). */
import type { OpportunityType, Priority, StageCategory } from "./constants";

export interface ListFilters {
  q?: string;
  family?: "JOB" | "EDUCATION";
  types?: OpportunityType[];
  categories?: StageCategory[];
  stages?: string[];
  tags?: string[];
  sources?: string[];
  priorities?: Priority[];
  countries?: string[];
  includeClosed?: boolean;
  archived?: boolean;
  sort?: string;
}

type SearchParamsLike = { get(name: string): string | null };

const splitList = (v: string | null) => (v ? v.split(",").map((x) => decodeURIComponent(x.trim())).filter(Boolean) : undefined);

export function parseListFilters(sp: SearchParamsLike | Record<string, string | string[] | undefined>): ListFilters {
  const get = (k: string): string | null => {
    if (typeof (sp as SearchParamsLike).get === "function") return (sp as SearchParamsLike).get(k);
    const v = (sp as Record<string, string | string[] | undefined>)[k];
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  };
  return {
    q: get("q") ?? undefined,
    family: (get("family") as ListFilters["family"]) ?? undefined,
    types: splitList(get("types")) as OpportunityType[] | undefined,
    categories: splitList(get("categories")) as StageCategory[] | undefined,
    stages: splitList(get("stages")),
    tags: splitList(get("tags")),
    sources: splitList(get("sources")),
    priorities: splitList(get("priorities")) as Priority[] | undefined,
    countries: splitList(get("countries")),
    includeClosed: get("closed") === "1" ? true : get("closed") === "0" ? false : undefined,
    archived: get("archived") === "1" || undefined,
    sort: get("sort") ?? undefined,
  };
}

export function filtersToSearch(filters: ListFilters, extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams();
  const set = (k: string, v: string | undefined) => v && params.set(k, v);
  set("q", filters.q);
  set("family", filters.family);
  set("types", filters.types?.join(","));
  set("categories", filters.categories?.join(","));
  set("stages", filters.stages?.join(","));
  set("tags", filters.tags?.join(","));
  set("sources", filters.sources?.join(","));
  set("priorities", filters.priorities?.join(","));
  set("countries", filters.countries?.join(","));
  if (filters.includeClosed !== undefined) params.set("closed", filters.includeClosed ? "1" : "0");
  if (filters.archived) params.set("archived", "1");
  set("sort", filters.sort);
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function hasActiveFilters(f: ListFilters) {
  return !!(f.q || f.family || f.types?.length || f.categories?.length || f.stages?.length || f.tags?.length || f.sources?.length || f.priorities?.length || f.countries?.length || f.archived || f.includeClosed === false);
}
