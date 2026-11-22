/**
 * URL ⇄ state of the Candidatures page (layout, saved view, filters) and the French wording of the
 * "next action" chips. Pure: shared by the server page, the client toolbar and the tests.
 */
import { filtersToSearch, parseListFilters, type ListFilters } from "@/lib/filters";
import { dueStatus, formatISODate, type DueKind, type ISODate } from "@/lib/dates";
import type { StageCategory } from "@/lib/constants";

export type ApplicationsLayout = "list" | "board";
export type SearchParamsRecord = Record<string, string | string[] | undefined>;
/** A saved view as the page needs it. */
export interface SavedViewRef {
  id: string;
  name: string;
  filters: unknown;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseLayout(sp: SearchParamsRecord): ApplicationsLayout {
  return first(sp.layout) === "board" ? "board" : "list";
}

/** Default sort per layout: freshest first in the list, most important first on the board. */
export function defaultSort(layout: ApplicationsLayout): string {
  return layout === "board" ? "priority" : "updated";
}

/** Canonical form used to compare two filter sets (array order and "closed shown" default don't matter). */
function canonical(filters: ListFilters | null | undefined): string {
  const f: ListFilters = { ...(filters ?? {}) };
  for (const key of Object.keys(f) as (keyof ListFilters)[]) {
    const value = f[key];
    if (Array.isArray(value)) (f as Record<string, unknown>)[key] = value.length ? [...value].sort() : undefined;
  }
  if (f.includeClosed === true) f.includeClosed = undefined;
  return filtersToSearch(f);
}

export function sameFilters(a: ListFilters | null | undefined, b: ListFilters | null | undefined): boolean {
  return canonical(a) === canonical(b);
}

/**
 * Filters of the page. Without a view, the URL is the whole state. With `?view=<id>` alone, the view's saved
 * filters apply; as soon as the URL carries filters (or `custom=1`, written when the user empties them), the
 * URL wins — so removing one of the view's filters really removes it.
 */
export function resolveFilters(sp: SearchParamsRecord, view: SavedViewRef | null | undefined): ListFilters {
  const fromUrl = parseListFilters(sp);
  if (!view) return fromUrl;
  const custom = first(sp.custom) === "1" || filtersToSearch(fromUrl) !== "";
  return custom ? fromUrl : { ...((view.filters ?? {}) as ListFilters) };
}

/** True when the current filters differ from what the view saved (`archived` is never saved in a view). */
export function isViewDirty(filters: ListFilters, view: SavedViewRef | null | undefined): boolean {
  if (!view) return false;
  return !sameFilters({ ...filters, archived: undefined }, view.filters as ListFilters);
}

/** Link to the Candidatures page for a given state; a view whose filters are untouched keeps a clean `?view=<id>`. */
export function applicationsHref({ filters = {}, layout = "list", view }: { filters?: ListFilters; layout?: ApplicationsLayout; view?: SavedViewRef | null }): string {
  const custom = !!view && !sameFilters(filters, view.filters as ListFilters);
  const search = filtersToSearch(view && !custom ? {} : filters, {
    view: view?.id,
    custom: custom ? "1" : undefined,
    layout: layout === "board" ? "board" : undefined,
  });
  return `/applications${search}`;
}

/** `/applications/board?…` (old URL) → `/applications?…&layout=board`, keeping every other parameter. */
export function boardRedirectHref(sp: SearchParamsRecord): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (key === "layout" || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }
  params.set("layout", "board");
  return `/applications?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// "Next action" wording
// ---------------------------------------------------------------------------

export type NextActionKind = "DEADLINE" | "FOLLOW_UP" | "ANSWER";

export interface NextAction {
  kind: NextActionKind;
  date: ISODate;
  time: string | null;
  tone: DueKind;
  /** Short text shown in the chip (may be truncated). */
  text: string;
}

export interface NextActionSource {
  stage: { category: StageCategory };
  deadline: string | null;
  deadlineTime?: string | null;
  nextFollowUpAt: string | null;
  followUpPaused: boolean;
  expectedResponseAt: string | null;
}

const days = (n: number) => (n === 1 ? "1 jour" : `${n} jours`);

function phrase(kind: NextActionKind, date: ISODate, today: ISODate, locale: string): { tone: DueKind; text: string } {
  const status = dueStatus(date, today);
  const when =
    status.kind === "today"
      ? "aujourd’hui"
      : status.kind === "tomorrow"
        ? "demain"
        : status.kind === "later"
          ? `le ${formatISODate(date, "dayMonth", locale)}`
          : status.kind === "overdue"
            ? null
            : `dans ${days(status.days)}`;
  const late = days(-status.days);
  const text =
    kind === "DEADLINE"
      ? when
        ? `Date limite ${when}`
        : `Date limite dépassée de ${late}`
      : kind === "FOLLOW_UP"
        ? when
          ? `Relance ${when}`
          : `Relance en retard de ${late}`
        : when
          ? `Réponse attendue ${when}`
          : `Réponse attendue depuis ${late}`;
  return { tone: status.kind, text };
}

/** What comes next for an application: its deadline before applying, then the follow-up, then the expected answer. */
export function nextActionOf(row: NextActionSource, today: ISODate, locale: string): NextAction | null {
  const closed = ["WON", "LOST"].includes(row.stage.category);
  const pre = ["BACKLOG", "TO_APPLY", "PREPARING"].includes(row.stage.category);
  let kind: NextActionKind | null = null;
  let date: string | null = null;
  if (pre && row.deadline) [kind, date] = ["DEADLINE", row.deadline];
  else if (row.nextFollowUpAt && !row.followUpPaused && !closed) [kind, date] = ["FOLLOW_UP", row.nextFollowUpAt];
  else if (row.expectedResponseAt && !closed) [kind, date] = ["ANSWER", row.expectedResponseAt];
  if (!kind || !date) return null;
  return { kind, date, time: kind === "DEADLINE" ? (row.deadlineTime ?? null) : null, ...phrase(kind, date, today, locale) };
}

/** "Aujourd’hui", "Hier", "Il y a 3 jours", "Dans 2 jours"… */
export function relativeDayFr(diff: number): string {
  if (diff === 0) return "Aujourd’hui";
  if (diff === 1) return "Demain";
  if (diff === -1) return "Hier";
  return diff > 1 ? `Dans ${days(diff)}` : `Il y a ${days(-diff)}`;
}
