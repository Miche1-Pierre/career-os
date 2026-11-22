/**
 * In-app chat: Claude Code driving Career OS through its own MCP server (the same 39 tools as Claude Code in this
 * folder) + WebSearch / WebFetch. No shell, no file access. Conversations are stored (chat_threads / chat_messages)
 * and resumed with Claude Code sessions so the model keeps the full context.
 */
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { chatMessages, chatThreads, housingListings, moves, opportunities, organizations, type ChatToolCall } from "@/server/db/schema";
import { claudeMode, inDocker } from "@/server/ai";
import { streamClaude } from "../../../bridge/claude-runner.mjs";
import { AppError, notFound } from "@/server/context";
import { getSettings } from "@/server/services/settings";
import { todayISO } from "@/lib/dates";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const chatMentionSchema = z.object({
  type: z.string().max(40),
  id: z.string().max(80),
  label: z.string().max(300),
  href: z.string().max(500).nullish(),
});
export type ChatMention = z.infer<typeof chatMentionSchema>;

export const chatRequestSchema = z.object({
  threadId: z.string().uuid().nullish(),
  message: z.string().trim().min(1).max(20_000),
  context: z
    .object({
      path: z.string().max(500).nullish(),
      title: z.string().max(300).nullish(),
    })
    .nullish(),
  mentions: z.array(chatMentionSchema).max(20).optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ChatEvent =
  | { type: "thread"; threadId: string }
  | { type: "session"; sessionId: string }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; summary: string | null }
  | { type: "done"; text: string; model: string | null; costUsd: number | null; durationMs: number; wrote: boolean }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export async function listThreads(limit = 30) {
  return db.select().from(chatThreads).where(isNull(chatThreads.deletedAt)).orderBy(desc(chatThreads.updatedAt)).limit(limit);
}

export async function getThread(id: string) {
  const [thread] = await db.select().from(chatThreads).where(and(eq(chatThreads.id, id), isNull(chatThreads.deletedAt)));
  if (!thread) throw notFound("Conversation");
  const messages = await db.select().from(chatMessages).where(eq(chatMessages.threadId, id)).orderBy(asc(chatMessages.createdAt));
  return { thread, messages };
}

export async function deleteThread(id: string) {
  await db.update(chatThreads).set({ deletedAt: new Date() }).where(eq(chatThreads.id, id));
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const TOOL_LABEL: Record<string, string> = {
  WebSearch: "Recherche web",
  WebFetch: "Lecture d'une page",
  get_today: "Lecture des actions du jour",
  search: "Recherche dans Career OS",
  list_opportunities: "Lecture des candidatures",
  get_opportunity: "Lecture d'une candidature",
  check_duplicates: "Vérification des doublons",
  create_opportunity: "Création d'une candidature",
  update_opportunity: "Mise à jour d'une candidature",
  set_status: "Changement de statut",
  add_interview: "Ajout d'un entretien",
  update_interview: "Mise à jour d'un entretien",
  follow_up: "Relance",
  render_email_template: "Préparation d'un email",
  get_profile: "Lecture du profil",
  update_profile: "Mise à jour du profil",
  save_analysis: "Enregistrement d'une analyse",
  get_calendar: "Lecture du calendrier",
  get_analytics: "Lecture des statistiques",
  capture: "Capture",
  list_moves: "Lecture des installations",
  get_move: "Lecture de l'installation",
  create_move: "Création d'une installation",
  update_move: "Mise à jour de l'installation",
  update_budget: "Mise à jour du budget",
  upsert_housing_listing: "Enregistrement d'une annonce",
  set_listing_status: "Changement de statut d'une annonce",
  draft_listing_message: "Préparation d'un message",
};

const READ_ONLY = /^(get_|list_|search$|check_duplicates$|render_email_template$|draft_listing_message$|WebSearch$|WebFetch$)/;

export function summarizeTool(rawName: string, input: unknown): ChatToolCall {
  const name = rawName.replace(/^mcp__career-os__/, "");
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const detail = [i.query, i.q, i.url, i.title, i.status, i.organizationName].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const label = TOOL_LABEL[name] ?? name.replace(/_/g, " ");
  return { name, summary: detail ? `${label} · ${detail.slice(0, 120)}` : label };
}

async function describeContext(req: ChatRequest) {
  const lines: string[] = [];
  const path = req.context?.path ?? null;
  if (path) {
    lines.push(`Page ouverte : ${path}${req.context?.title ? ` (« ${req.context.title} »)` : ""}`);
    const url = new URL(path, "http://x");
    const opp = url.pathname.match(/^\/applications\/([0-9a-f-]{36})/)?.[1];
    if (opp) {
      const [o] = await db
        .select({ title: opportunities.title, org: organizations.name })
        .from(opportunities)
        .leftJoin(organizations, eq(organizations.id, opportunities.organizationId))
        .where(eq(opportunities.id, opp));
      if (o) lines.push(`Candidature affichée : ${o.org ? `${o.org} — ` : ""}${o.title} (opportunityId ${opp})`);
    }
    const moveId = url.pathname.match(/^\/moves\/([0-9a-f-]{36})/)?.[1];
    if (moveId) {
      const [m] = await db.select({ title: moves.title }).from(moves).where(eq(moves.id, moveId));
      if (m) lines.push(`Installation affichée : ${m.title} (moveId ${moveId})`);
      const listing = url.searchParams.get("listing");
      if (listing && /^[0-9a-f-]{36}$/.test(listing)) {
        const [l] = await db.select({ title: housingListings.title }).from(housingListings).where(eq(housingListings.id, listing));
        if (l) lines.push(`Annonce ouverte : ${l.title} (listingId ${listing})`);
      }
    }
  }
  for (const m of req.mentions ?? []) lines.push(`Élément mentionné (@) : ${m.label} — type ${m.type}, id ${m.id}${m.href ? `, lien ${m.href}` : ""}`);
  return lines;
}

async function systemPrompt() {
  const settings = await getSettings();
  const tz = settings.general.timezone;
  const name = settings.general.userName || settings.profile.fullName || null;
  return `Tu es l'assistant intégré de Career OS, l'outil personnel de pilotage de carrière${name ? ` de ${name}` : ""} : candidatures (emplois, stages, VIE, formations, thèses), entretiens, relances, documents, réseau, puis installation après une offre (logement, budget).
Tu agis dans l'application grâce aux outils Career OS (préfixe mcp__career-os__) et tu peux chercher sur le web (WebSearch) et lire des pages (WebFetch). Tu n'as accès à rien d'autre.

Aujourd'hui : ${todayISO(tz)} (fuseau ${tz}). Les dates calendrier sont au format YYYY-MM-DD.

Règles, plus importantes que la vitesse :
- N'invente jamais de données. Inconnu = laisse vide. Quand tu crées ou mets à jour à partir d'une source, renseigne la provenance (EXTRACTED avec une courte citation, ou INFERRED).
- Avant de créer une candidature, vérifie les doublons (check_duplicates). Les annonces de logement sont dédoublonnées par URL.
- Actions qui modifient des données : si l'utilisateur a clairement demandé cette action précise, fais-la. Sinon, décris en une ou deux lignes ce que tu vas faire et termine par une question de confirmation ; exécute seulement après son accord. Confirmation explicite obligatoire avant de clore une candidature (REJECTED, WITHDRAWN, GHOSTED…), d'archiver, de supprimer ou de modifier en masse.
- N'envoie jamais d'email ni de message, ne paie rien, ne remplis aucun formulaire externe : prépare des brouillons que l'utilisateur enverra lui-même.
- Les analyses sont descriptives (correspondances, écarts, questions), jamais « postule / ne postule pas ».
- Logement : lis l'annonce complète, sépare loyer, charges (et ce qu'elles couvrent), garantie, frais, disponibilité, bail minimum, meublé. Le prix affiché sur une page de résultats est souvent le loyer seul. Si un site exige une connexion ou bloque les robots, dis-le et propose à l'utilisateur de coller l'annonce ou le lien ; ne contourne rien.
- Recherche web : cite tes sources avec leurs liens.

Réponse :
- En français, courte et structurée (listes, gras pour l'essentiel). Pas de tirets cadratins.
- Donne des liens vers les fiches Career OS en chemin relatif, par exemple [Cohabs Saint-Gilles](/moves/<id>?tab=housing&listing=<id>) : enlève le http://hôte des URLs renvoyées par les outils.
- Termine par la prochaine action utile quand c'est pertinent.`;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const running = new Map<string, () => void>();

function mcpEndpoint(requestOrigin: string, mode: "cli" | "bridge") {
  const forced = process.env.CHAT_MCP_URL?.trim();
  if (forced) return forced;
  if (mode === "cli" && inDocker()) return `http://127.0.0.1:${process.env.PORT || 3000}/api/mcp`;
  return `${requestOrigin.replace(/\/$/, "")}/api/mcp`;
}

function chatModel() {
  return process.env.CHAT_MODEL?.trim() || "sonnet";
}

export async function startChat(raw: unknown, requestOrigin: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const req = chatRequestSchema.parse(raw);
  if ((process.env.AI_PROVIDER?.trim() || "claude-code") !== "claude-code") {
    throw new AppError("UNAVAILABLE", "Le chat utilise Claude Code. Choisis le fournisseur « claude-code » dans Paramètres → IA.");
  }
  const mode = claudeMode();
  if (!mode) throw new AppError("UNAVAILABLE", "Claude Code n'est pas configuré (Paramètres → IA).");

  let thread = req.threadId ? (await db.select().from(chatThreads).where(and(eq(chatThreads.id, req.threadId), isNull(chatThreads.deletedAt))))[0] : undefined;
  if (!thread) {
    [thread] = await db
      .insert(chatThreads)
      .values({ title: req.message.replace(/\s+/g, " ").slice(0, 80) })
      .returning();
  }
  if (running.has(thread.id)) throw new AppError("CONFLICT", "Une réponse est déjà en cours dans cette conversation.");
  const threadId = thread.id;
  const contextLines = await describeContext(req);
  await db.insert(chatMessages).values({ threadId, role: "user", content: req.message, context: { path: req.context?.path ?? null, mentions: req.mentions ?? [] } });

  const prompt = contextLines.length ? `${req.message}\n\n[Contexte de l'application]\n${contextLines.map((l) => `- ${l}`).join("\n")}` : req.message;
  const system = await systemPrompt();
  const mcpUrl = mcpEndpoint(requestOrigin, mode);
  const token = process.env.APP_ACCESS_TOKEN?.trim();
  const mcpHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;
  const sessionId = thread.sessionId;
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const tools: ChatToolCall[] = [];
      let wrote = false;
      let latestSession = sessionId;
      const emit = (event: ChatEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      const finish = async (final: { text: string; error?: string; model?: string | null; costUsd?: number | null; durationMs?: number }) => {
        running.delete(threadId);
        await db.insert(chatMessages).values({
          threadId,
          role: "assistant",
          content: final.text || (final.error ? "" : "(réponse vide)"),
          tools,
          model: final.model ?? null,
          costUsd: final.costUsd ?? null,
          durationMs: final.durationMs ?? null,
          error: final.error ?? null,
        });
        await db.update(chatThreads).set({ sessionId: latestSession, updatedAt: new Date() }).where(eq(chatThreads.id, threadId));
        if (!closed) {
          closed = true;
          controller.close();
        }
      };
      const onEvent = (event: Record<string, unknown>) => {
        switch (event.type) {
          case "session":
            latestSession = String(event.sessionId);
            break;
          case "text":
            emit({ type: "text", delta: String(event.delta ?? "") });
            break;
          case "tool": {
            const call = summarizeTool(String(event.name ?? ""), event.input);
            if (!READ_ONLY.test(call.name)) wrote = true;
            tools.push(call);
            emit({ type: "tool", name: call.name, summary: call.summary });
            break;
          }
        }
      };

      emit({ type: "thread", threadId });
      const options = { system, prompt, mcpUrl, mcpHeaders, model: chatModel(), sessionId };
      let final: Record<string, unknown> | null = null;
      const capture = (event: Record<string, unknown>) => {
        if (event.type === "done" || event.type === "error") final = event;
        else onEvent(event);
      };
      try {
        if (mode === "cli") {
          const run = streamClaude(options, capture);
          running.set(threadId, run.cancel);
          signal?.addEventListener("abort", run.cancel);
          await run.done;
        } else {
          const ac = new AbortController();
          running.set(threadId, () => ac.abort());
          signal?.addEventListener("abort", () => ac.abort());
          const url = (process.env.CLAUDE_BRIDGE_URL ?? "").replace(/\/$/, "");
          const res = await fetch(`${url}/v1/chat`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${process.env.CLAUDE_BRIDGE_TOKEN ?? ""}` },
            body: JSON.stringify(options),
            signal: ac.signal,
          });
          if (!res.ok || !res.body) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? `Bridge error ${res.status} (is the bridge up to date? restart it)`);
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let nl;
            while ((nl = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (line) capture(JSON.parse(line) as Record<string, unknown>);
            }
          }
        }
      } catch (error) {
        final = { type: "error", message: error instanceof Error ? error.message : String(error) };
      }
      const f = (final ?? { type: "error", message: "Pas de réponse de Claude Code" }) as Record<string, unknown>;
      if (typeof f.sessionId === "string") latestSession = f.sessionId;
      if (f.type === "done") {
        const text = String(f.text ?? "");
        emit({ type: "done", text, model: (f.model as string) ?? null, costUsd: (f.costUsd as number) ?? null, durationMs: Number(f.durationMs ?? 0), wrote });
        await finish({ text, model: f.model as string, costUsd: f.costUsd as number, durationMs: Number(f.durationMs ?? 0) });
      } else {
        const message = String(f.message ?? "Erreur");
        emit({ type: "error", message });
        await finish({ text: "", error: message });
      }
    },
    cancel() {
      running.get(threadId)?.();
    },
  });
}
