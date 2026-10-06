import { htmlToText } from "./html";

/** Deterministic facts read from schema.org JSON-LD (JobPosting, EducationalOccupationalProgram, Course). */
export interface JsonLdHints {
  schemaType: string;
  title: string | null;
  organizationName: string | null;
  organizationWebsite: string | null;
  city: string | null;
  country: string | null;
  remote: boolean | null;
  employmentType: string | null;
  datePosted: string | null;
  validThrough: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: "YEAR" | "MONTH" | "DAY" | "HOUR" | null;
  description: string | null;
  applicationDeadline: string | null;
  startDate: string | null;
  url: string | null;
}

type Obj = Record<string, unknown>;

function types(item: Obj): string[] {
  const t = item["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
}

function str(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "name" in value) return str((value as Obj).name);
  return null;
}

function first<T>(value: T | T[] | undefined | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function isoDay(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

const PERIODS: Record<string, JsonLdHints["salaryPeriod"]> = { YEAR: "YEAR", MONTH: "MONTH", DAY: "DAY", HOUR: "HOUR", WEEK: null };

export function extractJsonLdHints(items: unknown[]): JsonLdHints | null {
  const flat: Obj[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(visit);
    const o = v as Obj;
    flat.push(o);
    if (Array.isArray(o["@graph"])) (o["@graph"] as unknown[]).forEach(visit);
  };
  items.forEach(visit);
  const job = flat.find((o) => types(o).includes("JobPosting"));
  const program = flat.find((o) => types(o).some((t) => ["EducationalOccupationalProgram", "Course", "EducationalProgram"].includes(t)));
  const item = job ?? program;
  if (!item) return null;
  const org = (first(item.hiringOrganization as Obj | Obj[]) ?? first(item.provider as Obj | Obj[]) ?? first(item.offeredBy as Obj | Obj[])) as Obj | null;
  const location = first(item.jobLocation as Obj | Obj[]) as Obj | null;
  const address = (location?.address ?? null) as Obj | null;
  const salary = (item.baseSalary ?? null) as Obj | null;
  const salaryValue = (salary?.value ?? null) as Obj | null;
  const description = str(item.description);
  return {
    schemaType: job ? "JobPosting" : types(item)[0] ?? "Program",
    title: str(item.title) ?? str(item.name),
    organizationName: str(org?.name),
    organizationWebsite: str(org?.sameAs) ?? str(org?.url),
    city: str(address?.addressLocality),
    country: str(address?.addressCountry),
    remote: item.jobLocationType === "TELECOMMUTE" ? true : null,
    employmentType: Array.isArray(item.employmentType) ? item.employmentType.join(", ") : str(item.employmentType),
    datePosted: isoDay(item.datePosted),
    validThrough: isoDay(item.validThrough),
    salaryMin: num(salaryValue?.minValue ?? salaryValue?.value),
    salaryMax: num(salaryValue?.maxValue),
    salaryCurrency: str(salary?.currency),
    salaryPeriod: PERIODS[String(salaryValue?.unitText ?? "").toUpperCase()] ?? null,
    description: description ? htmlToText(description).slice(0, 60_000) : null,
    applicationDeadline: isoDay(item.applicationDeadline),
    startDate: isoDay(item.startDate) ?? isoDay(item.jobStartDate),
    url: str(item.url),
  };
}
