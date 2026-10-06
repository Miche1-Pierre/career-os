/**
 * REST API v1 — a thin layer over the services (same logic as the UI and the MCP server).
 * Designed for the future CLI, browser extension, mobile app and integrations.
 */
import { z } from "zod";
import { strToU8 } from "fflate";
import { API, AppError, errorMessage, type Ctx } from "@/server/context";
import { isISODate } from "@/lib/dates";
import { DOCUMENT_KINDS, type OpportunityType, type Priority, type StageCategory } from "@/lib/constants";
import * as opp from "@/server/services/opportunities";
import * as orgs from "@/server/services/organizations";
import * as people from "@/server/services/contacts";
import * as docs from "@/server/services/documents";
import * as ivs from "@/server/services/interviews";
import * as todo from "@/server/services/tasks";
import * as tl from "@/server/services/timeline";
import * as inbox from "@/server/services/inbox";
import * as stages from "@/server/services/stages";
import * as tagsSvc from "@/server/services/tags";
import * as settingsSvc from "@/server/services/settings";
import * as analytics from "@/server/services/analytics";
import * as data from "@/server/services/data-transfer";
import * as notif from "@/server/services/notifications";
import * as views from "@/server/services/views";
import * as demo from "@/server/services/demo";
import { applyFollowUpAction } from "@/server/services/followups";
import { analyzeOpportunity, interpretCommand } from "@/server/services/analysis";
import { getToday } from "@/server/services/today";
import { searchAll } from "@/server/services/search";
import { eventsToICS, getCalendarEvents } from "@/server/services/calendar";
import { aiStatus } from "@/server/ai";
import { storageConfig } from "@/server/storage";
import { SETTINGS_SECTIONS, type SettingsSection } from "@/lib/settings-schema";
import { appUrl } from "@/server/mcp/tools";

interface RouteContext {
  req: Request;
  params: Record<string, string>;
  query: URLSearchParams;
  json: <T = unknown>() => Promise<T>;
  form: () => Promise<FormData>;
  ctx: Ctx;
}

type Handler = (c: RouteContext) => Promise<unknown>;
type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

const routes: { method: Method; pattern: string; regex: RegExp; keys: string[]; handler: Handler; doc?: string }[] = [];

function route(method: Method, pattern: string, handler: Handler, doc?: string) {
  const keys: string[] = [];
  const regex = new RegExp(
    "^" +
      pattern.replace(/\//g, "\\/").replace(/:(\w+)/g, (_, key: string) => {
        keys.push(key);
        return "([^/]+)";
      }) +
      "$",
  );
  routes.push({ method, pattern, regex, keys, handler, doc });
}

const list = (q: URLSearchParams, key: string) => {
  const values = q.getAll(key).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
  return values.length ? values : undefined;
};
const bool = (q: URLSearchParams, key: string) => (q.has(key) ? ["1", "true", "yes"].includes(q.get(key)!.toLowerCase()) : undefined);

async function fileFromForm(form: FormData, field = "file") {
  const file = form.get(field);
  if (!file || typeof file === "string") return null;
  const f = file as File;
  if (f.size > storageConfig.maxUploadBytes) throw new AppError("VALIDATION", `File too large (max ${process.env.MAX_UPLOAD_MB ?? 25} MB)`);
  return { buffer: Buffer.from(await f.arrayBuffer()), fileName: f.name, mimeType: f.type || null };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

route("GET", "/", async () => ({ name: "Career OS API", version: "v1", routes: routes.map((r) => `${r.method} /api/v1${r.pattern}${r.doc ? ` — ${r.doc}` : ""}`) }), "This index");

// Overview
route("GET", "/today", async ({ query }) => getToday({ horizonDays: Number(query.get("days")) || undefined }), "Action center");
route("GET", "/dashboard", async () => analytics.getDashboard());
route("GET", "/analytics", async ({ query }) =>
  analytics.getAnalytics({ family: (query.get("family") as "ALL" | "JOB" | "EDUCATION") ?? "ALL", segment: (query.get("segment") as analytics.SegmentKey) ?? "source" }),
);
route("GET", "/search", async ({ query }) => searchAll(query.get("q") ?? "", Number(query.get("limit")) || 8), "?q=");
route("GET", "/calendar", async ({ query }) => {
  const from = query.get("from") ?? "";
  const to = query.get("to") ?? "";
  if (!isISODate(from) || !isISODate(to)) throw new AppError("VALIDATION", "from/to must be YYYY-MM-DD");
  return getCalendarEvents(from, to);
});
route("GET", "/ai/status", async () => aiStatus({ fresh: true }));

// Opportunities
route("GET", "/opportunities", async ({ query }) =>
  opp.listOpportunities({
    q: query.get("q") ?? undefined,
    family: (query.get("family") as "JOB" | "EDUCATION") ?? undefined,
    types: list(query, "type") as OpportunityType[] | undefined,
    categories: list(query, "category") as StageCategory[] | undefined,
    stageKeys: list(query, "status"),
    tags: list(query, "tag"),
    sources: list(query, "source"),
    priorities: list(query, "priority") as Priority[] | undefined,
    countries: list(query, "country"),
    organizationId: query.get("organizationId") ?? undefined,
    includeClosed: bool(query, "includeClosed"),
    archived: (query.get("archived") as "exclude" | "only" | "include") ?? undefined,
    sort: (query.get("sort") as opp.OpportunityFilters["sort"]) ?? undefined,
    limit: Number(query.get("limit")) || undefined,
    offset: Number(query.get("offset")) || undefined,
  }),
);
route("POST", "/opportunities", async ({ json, query, ctx }) => opp.createOpportunity(await json(), ctx, { force: bool(query, "force") }), "?force=1 to bypass duplicate check");
route("GET", "/opportunities/:id", async ({ params }) => opp.getOpportunity(params.id));
route("PATCH", "/opportunities/:id", async ({ params, json, ctx }) => opp.updateOpportunity(params.id, await json(), ctx));
route("DELETE", "/opportunities/:id", async ({ params, ctx }) => opp.softDeleteOpportunity(params.id, ctx), "Moves to trash");
route("POST", "/opportunities/:id/restore", async ({ params, ctx }) => opp.restoreOpportunity(params.id, ctx));
route("POST", "/opportunities/:id/archive", async ({ params, json, ctx }) => opp.setOpportunityArchived(params.id, (await json<{ archived?: boolean }>().catch(() => ({}) as { archived?: boolean })).archived ?? true, ctx));
route("POST", "/opportunities/:id/status", async ({ params, json, ctx }) => {
  const body = await json<{ status: string; date?: string; note?: string }>();
  return opp.changeStatus(params.id, { status: body.status, date: body.date && isISODate(body.date) ? body.date : null, note: body.note ?? null }, ctx);
});
route("POST", "/opportunities/:id/follow-up", async ({ params, json, ctx }) => applyFollowUpAction(params.id, await json(), ctx), "{action: done|schedule|snooze|clear|pause|resume}");
route("POST", "/opportunities/:id/events", async ({ params, json, ctx }) => tl.logCommunication({ ...(await json<object>()), opportunityId: params.id } as never, ctx));
route("POST", "/opportunities/:id/contacts", async ({ params, json, ctx }) => people.addContactToOpportunity(params.id, await json(), ctx));
route("DELETE", "/opportunities/:id/contacts/:contactId", async ({ params, ctx }) => people.unlinkContactFromOpportunity(params.id, params.contactId, ctx));
route("POST", "/opportunities/:id/documents", async ({ params, json, ctx }) => docs.attachDocument({ ...(await json<object>()), opportunityId: params.id } as never, ctx));
route("POST", "/opportunities/:id/analyze", async ({ params, ctx }) => analyzeOpportunity(params.id, ctx));
route("POST", "/opportunities/:id/duplicate", async ({ params, ctx }) => opp.duplicateOpportunity(params.id, ctx));
route("GET", "/duplicates", async ({ query }) => opp.findDuplicates({ title: query.get("title"), organizationName: query.get("organization"), url: query.get("url") }));
route("DELETE", "/attachments/:id", async ({ params, ctx }) => docs.detachDocument(params.id, ctx));

// Organizations & contacts
route("GET", "/organizations", async ({ query }) => orgs.listOrganizations({ kind: (query.get("kind") as "COMPANY" | "INSTITUTION") ?? undefined, q: query.get("q") ?? undefined }));
route("POST", "/organizations", async ({ json, ctx }) => orgs.createOrganization(await json(), ctx));
route("GET", "/organizations/:id", async ({ params }) => orgs.getOrganization(params.id));
route("PATCH", "/organizations/:id", async ({ params, json, ctx }) => orgs.updateOrganization(params.id, await json(), ctx));
route("DELETE", "/organizations/:id", async ({ params, ctx }) => orgs.softDeleteOrganization(params.id, ctx));
route("GET", "/contacts", async ({ query }) => people.listContacts({ q: query.get("q") ?? undefined, organizationId: query.get("organizationId") ?? undefined }));
route("POST", "/contacts", async ({ json, ctx }) => people.createContact(await json(), ctx));
route("GET", "/contacts/:id", async ({ params }) => people.getContact(params.id));
route("PATCH", "/contacts/:id", async ({ params, json, ctx }) => people.updateContact(params.id, await json(), ctx));
route("DELETE", "/contacts/:id", async ({ params, ctx }) => people.softDeleteContact(params.id, ctx));

// Documents
route("GET", "/documents", async ({ query }) => docs.listDocuments({ kind: (query.get("kind") as (typeof DOCUMENT_KINDS)[number]) ?? undefined, q: query.get("q") ?? undefined }));
route(
  "POST",
  "/documents",
  async ({ req, json, form, ctx }) => {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const f = await form();
      const upload = await fileFromForm(f);
      return docs.createDocumentWithVersion(
        { name: String(f.get("name") || upload?.fileName || "Document"), kind: (String(f.get("kind") || "OTHER") as never) ?? "OTHER", description: (f.get("description") as string) || null, tags: String(f.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean), label: (f.get("label") as string) || null, path: (f.get("path") as string) || null },
        upload,
        ctx,
      );
    }
    const body = await json<{ name: string; kind: never; path?: string; label?: string; description?: string; tags?: string[] }>();
    return docs.createDocumentWithVersion(body, null, ctx);
  },
  "JSON {name, kind, path?} or multipart with file",
);
route("GET", "/documents/scan", async () => docs.scanLibrary(), "Scan the documents library folder");
route("POST", "/documents/register", async ({ json, ctx }) => docs.registerLibraryFiles(await json(), ctx));
route("GET", "/documents/:id", async ({ params }) => docs.getDocument(params.id));
route("PATCH", "/documents/:id", async ({ params, json, ctx }) => docs.updateDocument(params.id, await json(), ctx));
route("DELETE", "/documents/:id", async ({ params, ctx }) => docs.softDeleteDocument(params.id, ctx));
route("POST", "/documents/:id/versions", async ({ req, params, json, form, ctx }) => {
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const f = await form();
    const upload = await fileFromForm(f);
    if (!upload) throw new AppError("VALIDATION", "file is required");
    return docs.addVersionFromUpload(params.id, { ...upload, label: (f.get("label") as string) || null, notes: (f.get("notes") as string) || null }, ctx);
  }
  const body = await json<{ path: string; label?: string; notes?: string }>();
  return docs.addVersionFromPath(params.id, body, ctx);
});

// Interviews, tasks, events
route("POST", "/interviews", async ({ json, ctx }) => ivs.createInterview(await json(), ctx));
route("GET", "/interviews/:id", async ({ params }) => ivs.getInterview(params.id));
route("PATCH", "/interviews/:id", async ({ params, json, ctx }) => ivs.updateInterview(params.id, await json(), ctx));
route("DELETE", "/interviews/:id", async ({ params, ctx }) => ivs.deleteInterview(params.id, ctx));
route("GET", "/tasks", async ({ query }) => todo.listTasks({ opportunityId: query.get("opportunityId") ?? undefined, status: (query.get("status") as "open" | "done" | "all") ?? "open" }));
route("POST", "/tasks", async ({ json, ctx }) => todo.createTask(await json(), ctx));
route("PATCH", "/tasks/:id", async ({ params, json, ctx }) => todo.updateTask(params.id, await json(), ctx));
route("DELETE", "/tasks/:id", async ({ params, ctx }) => todo.deleteTask(params.id, ctx));
route("GET", "/events", async ({ query }) => tl.listEvents({ opportunityId: query.get("opportunityId") ?? undefined, contactId: query.get("contactId") ?? undefined, organizationId: query.get("organizationId") ?? undefined }));
route("POST", "/events", async ({ json, ctx }) => tl.logCommunication(await json(), ctx));
route("PATCH", "/events/:id", async ({ params, json, ctx }) => tl.updateEvent(params.id, await json(), ctx));
route("DELETE", "/events/:id", async ({ params, ctx }) => tl.deleteEvent(params.id, ctx));

// Capture & inbox
route(
  "POST",
  "/capture",
  async ({ req, json, form, ctx, query }) => {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const f = await form();
      const file = await fileFromForm(f);
      return inbox.createCapture(
        { text: (f.get("text") as string) || null, url: (f.get("url") as string) || null, file, title: (f.get("title") as string) || null, sourceType: file ? "FILE" : "API" },
        ctx,
        { analyze: f.get("analyze") ? f.get("analyze") !== "false" : undefined },
      );
    }
    const body = await json<{ text?: string; url?: string; title?: string; analyze?: boolean; source?: string }>();
    return inbox.createCapture({ text: body.text, url: body.url, title: body.title, sourceType: body.source === "extension" ? "EXTENSION" : "API" }, ctx, { analyze: body.analyze ?? bool(query, "analyze") });
  },
  "JSON {text?, url?, title?, analyze?} or multipart {file, text?, url?}",
);
route("GET", "/inbox", async ({ query }) => inbox.listInbox({ view: (query.get("view") as "active" | "converted" | "archived" | "all") ?? "active" }));
route("GET", "/inbox/:id", async ({ params }) => inbox.getInboxItem(params.id));
route("PATCH", "/inbox/:id", async ({ params, json, ctx }) => inbox.updateInboxItem(params.id, await json(), ctx));
route("DELETE", "/inbox/:id", async ({ params, ctx }) => inbox.deleteInboxItem(params.id, ctx));
route("POST", "/inbox/:id/analyze", async ({ params }) => {
  await inbox.requestAnalysis(params.id);
  return { queued: true };
});
route("POST", "/inbox/:id/analysis", async ({ params, json, ctx }) => inbox.submitAnalysis(params.id, await json(), ctx), "Submit an externally produced analysis");
route("POST", "/inbox/:id/convert", async ({ params, json, query, ctx }) => inbox.convertToOpportunity(params.id, await json(), ctx, { force: bool(query, "force") }));
route("POST", "/inbox/:id/actions", async ({ params, json, ctx }) => inbox.applyActions((await json<{ actions: unknown[] }>()).actions, ctx, { inboxId: params.id }));
route("POST", "/inbox/:id/archive", async ({ params, ctx }) => inbox.setInboxArchived(params.id, true, ctx));
route("POST", "/actions", async ({ json, ctx }) => inbox.applyActions((await json<{ actions: unknown[] }>()).actions, ctx));
route("POST", "/commands", async ({ json }) => interpretCommand((await json<{ text: string }>()).text), "Natural language → proposed operations (not executed)");

// Configuration
route("GET", "/stages", async () => stages.listStages(undefined, { includeArchived: true }));
route("POST", "/stages", async ({ json, ctx }) => stages.createStage(await json(), ctx));
route("PATCH", "/stages/:id", async ({ params, json, ctx }) => stages.updateStage(params.id, await json(), ctx));
route("DELETE", "/stages/:id", async ({ params, ctx }) => stages.deleteStage(params.id, ctx));
route("GET", "/tags", async () => tagsSvc.listTags());
route("PATCH", "/tags/:name", async ({ params, json, ctx }) => {
  const body = await json<{ name?: string; color?: string }>();
  if (body.name && body.name !== decodeURIComponent(params.name)) await tagsSvc.renameTag(decodeURIComponent(params.name), body.name, ctx);
  if (body.color) return tagsSvc.updateTag(body.name ?? decodeURIComponent(params.name), { color: body.color });
  return { ok: true };
});
route("DELETE", "/tags/:name", async ({ params, ctx }) => tagsSvc.deleteTag(decodeURIComponent(params.name), ctx));
route("GET", "/settings", async () => settingsSvc.getSettings());
route("PATCH", "/settings/:section", async ({ params, json, ctx }) => {
  if (!SETTINGS_SECTIONS.includes(params.section as SettingsSection)) throw new AppError("NOT_FOUND", "Unknown settings section");
  return settingsSvc.patchSettingsSection(params.section as SettingsSection, await json(), ctx);
});
route("GET", "/notifications", async () => notif.listNotifications());
route("POST", "/notifications/:id/dismiss", async ({ params }) => notif.dismissNotification(params.id));
route("GET", "/views", async () => views.listViews());
route("POST", "/views", async ({ json, ctx }) => views.createView(await json(), ctx));
route("PATCH", "/views/:id", async ({ params, json, ctx }) => views.updateView(params.id, await json(), ctx));
route("DELETE", "/views/:id", async ({ params, ctx }) => views.deleteView(params.id, ctx));
route("GET", "/goals", async () => analytics.listGoals());
route("POST", "/goals", async ({ json, ctx }) => analytics.createGoal(await json(), ctx));
route("PATCH", "/goals/:id", async ({ params, json, ctx }) => analytics.updateGoal(params.id, await json(), ctx));
route("DELETE", "/goals/:id", async ({ params, ctx }) => analytics.deleteGoal(params.id, ctx));

// Data
route("GET", "/export", async ({ query }) => {
  const format = query.get("format") ?? "json";
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "zip") {
    const zip = await data.exportZip({ includeFiles: query.get("files") !== "0" });
    return new Response(Buffer.from(zip), { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="career-os-${stamp}.zip"` } });
  }
  if (format === "csv") {
    const files = await data.csvFiles();
    const name = query.get("table") ?? "opportunities";
    const content = files[`${name}.csv`];
    if (!content) throw new AppError("NOT_FOUND", `Unknown table ${name}`);
    return new Response(strToU8(content), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="career-os-${name}-${stamp}.csv"` } });
  }
  const file = await data.exportAll();
  return new Response(JSON.stringify(file, null, 1), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="career-os-${stamp}.json"` } });
}, "?format=json|zip|csv&table=");
route("POST", "/import", async ({ req, json, form, query, ctx }) => {
  const mode = query.get("mode") === "merge" ? "merge" : "replace";
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const upload = await fileFromForm(await form());
    if (!upload) throw new AppError("VALIDATION", "file is required");
    if (upload.fileName.endsWith(".zip")) return data.importZip(new Uint8Array(upload.buffer), mode, ctx);
    await data.createBackup("pre-restore");
    return data.importAll(JSON.parse(upload.buffer.toString("utf8")), mode, ctx);
  }
  await data.createBackup("pre-restore");
  return data.importAll(await json(), mode, ctx);
}, "?mode=replace|merge — JSON body or multipart file (.json/.zip)");
route("GET", "/backups", async () => data.listBackups());
route("POST", "/backups", async () => data.createBackup("manual"));
route("POST", "/backups/:name/restore", async ({ params, ctx }) => data.restoreBackup(params.name, ctx));
route("POST", "/demo", async ({ ctx }) => demo.seedDemoData(ctx));
route("DELETE", "/demo", async ({ ctx }) => demo.deleteDemoData(ctx));

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

function toJson(value: unknown) {
  return JSON.stringify({ data: value ?? null }, (_k, v) => (v instanceof Date ? v.toISOString() : v));
}

export async function dispatch(req: Request, segments: string[]): Promise<Response> {
  const path = `/${segments.map(decodeURIComponent).join("/")}`.replace(/\/+$/, "") || "/";
  const method = req.method.toUpperCase() as Method;
  if (path === "/calendar.ics" && method === "GET") {
    const url = new URL(req.url);
    const today = new Date();
    const from = url.searchParams.get("from") ?? new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    const to = url.searchParams.get("to") ?? new Date(today.getTime() + 180 * 86_400_000).toISOString().slice(0, 10);
    const ics = eventsToICS(await getCalendarEvents(from, to), { appUrl: appUrl() });
    return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'inline; filename="career-os.ics"' } });
  }
  const candidates = routes.filter((r) => r.regex.test(path));
  if (!candidates.length) return Response.json({ error: { code: "NOT_FOUND", message: `No route ${method} ${path}` } }, { status: 404 });
  const match = candidates.find((r) => r.method === method);
  if (!match) return Response.json({ error: { code: "METHOD_NOT_ALLOWED", message: `${method} not allowed` } }, { status: 405 });
  const m = match.regex.exec(path)!;
  const params = Object.fromEntries(match.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
  const url = new URL(req.url);
  try {
    const result = await match.handler({
      req,
      params,
      query: url.searchParams,
      json: async <T,>() => {
        const text = await req.text();
        if (!text) return {} as T;
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new AppError("BAD_REQUEST", "Invalid JSON body");
        }
      },
      form: () => req.formData(),
      ctx: API,
    });
    if (result instanceof Response) return result;
    return new Response(toJson(result), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status });
    if (error instanceof z.ZodError) return Response.json({ error: { code: "VALIDATION", message: errorMessage(error), details: error.issues } }, { status: 400 });
    console.error(`[api] ${method} ${path}`, error);
    return Response.json({ error: { code: "INTERNAL", message: "Internal error" } }, { status: 500 });
  }
}
