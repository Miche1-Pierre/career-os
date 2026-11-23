"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, AtSign, Check, ChevronDown, Flag, History, Loader2, MapPin, Mic, Plus, Sparkles, Square, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppData } from "@/components/app/app-data";
import { cn } from "@/lib/utils";
import { useDictation } from "./use-dictation";
import { ChatForm, formKey, parseChatForm, type ChatFormSpec } from "./chat-form";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMention {
  type: string;
  id: string;
  label: string;
  href?: string | null;
}

interface ToolLine {
  name: string;
  summary: string | null;
}

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools: ToolLine[];
  error?: string | null;
  mentions?: ChatMention[];
  streaming?: boolean;
  /** A form shown by a quick action (local, not sent to Claude). */
  form?: ChatFormSpec;
}

interface ThreadSummary {
  id: string;
  title: string;
  updatedAt: string;
}

interface ChatContextValue {
  /** Puts text in the chat bar and focuses it (does not send). */
  prefill: (text: string) => void;
  /** Sends a message right away. */
  send: (text: string) => void;
  /** Attaches an element (job, home, company…) to the next message. */
  mention: (m: ChatMention) => void;
  focus: () => void;
  /** Opens the conversation panel with a form (job or housing search) ready to fill. */
  showForm: (spec: ChatFormSpec) => void;
  /** Opens a previous conversation. */
  openThread: (id: string) => void;
  /** The home page gives the place where the chat bar sits in the middle of the page (null elsewhere). */
  heroSlot: (el: HTMLElement | null) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);
export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside ChatProvider");
  return ctx;
}

const THREAD_KEY = "cos-chat-thread";
const store = {
  get: () => {
    try {
      return localStorage.getItem(THREAD_KEY);
    } catch {
      return null;
    }
  },
  set: (v: string | null) => {
    try {
      if (v) localStorage.setItem(THREAD_KEY, v);
      else localStorage.removeItem(THREAD_KEY);
    } catch {
      /* ignore */
    }
  },
};

// ---------------------------------------------------------------------------
// Suggestions by page
// ---------------------------------------------------------------------------

function suggestionsFor(path: string): string[] {
  if (/^\/moves\/[0-9a-f-]{36}/.test(path))
    return ["Quelles démarches me restent à faire ?", "Compare mes 3 meilleurs logements", "Cherche d'autres colocs meublées à moins de 800 € près du bureau", "Prépare les messages pour les logements à contacter", "Combien je mets de côté avec le logement le moins cher à pied ?"];
  if (path.startsWith("/moves")) return ["J'ai signé, prépare mon installation", "Où en est ma recherche de logement ?"];
  if (/^\/applications\/[0-9a-f-]{36}/.test(path))
    return ["Analyse cette offre par rapport à mon profil", "Prépare mon prochain entretien", "Analyse le contrat de cette offre", "Rédige une relance", "Résume où en est cette candidature"];
  if (path.startsWith("/applications")) return ["Ajoute cette offre : ", "Quelles candidatures n'ont pas de réponse depuis 2 semaines ?", "Lesquelles dois-je relancer cette semaine ?"];
  if (path.startsWith("/companies") || path.startsWith("/institutions")) return ["Trouve des entreprises IA à Bruxelles", "Quelles entreprises ont le plus de candidatures ?"];
  if (path.startsWith("/contacts")) return ["Qui dois-je recontacter ?", "Ajoute ce contact : "];
  if (path.startsWith("/calendar")) return ["Qu'est-ce que j'ai cette semaine ?", "Ajoute un entretien : "];
  if (path.startsWith("/documents")) return ["Quel CV ai-je envoyé pour ma dernière candidature ?"];
  if (path.startsWith("/analytics") || path.startsWith("/dashboard")) return ["Résume mes statistiques du mois", "Quel canal me donne le plus de réponses ?"];
  if (path.startsWith("/searches")) return ["Crée une recherche d'offres AI engineer à Bruxelles", "Lance mes recherches", "Quelles entreprises IA à Bruxelles ont une page carrières Greenhouse ou Lever ?"];
  if (path.startsWith("/settings")) return ["Lis mon CV et remplis mon profil"];
  if (path === "/") return ["Trouve-moi des offres AI engineer à Bruxelles", "Qu'est-ce que je dois faire aujourd'hui ?", "Cherche une coloc meublée près du bureau", "Ajoute cette offre : "];
  return ["Qu'est-ce que je dois faire aujourd'hui ?", "Rédige mes relances en retard", "Ajoute cette offre : "];
}

const MENTION_LABEL: Record<string, string> = {
  opportunity: "Candidature",
  organization: "Organisation",
  contact: "Contact",
  document: "Document",
  interview: "Entretien",
  move: "Installation",
  listing: "Logement",
  event: "Note",
  cv: "CV",
};

// ---------------------------------------------------------------------------
// Provider + dock
// ---------------------------------------------------------------------------

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [input, setInput] = useState("");
  const [mentions, setMentions] = useState<ChatMention[]>([]);
  const [open, setOpen] = useState(false);
  const [pendingSend, setPendingSend] = useState<string | null>(null);
  const [pendingForm, setPendingForm] = useState<ChatFormSpec | null>(null);
  const [pendingThread, setPendingThread] = useState<string | null>(null);
  const [heroSlot, setHeroSlot] = useState<HTMLElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const value = useMemo<ChatContextValue>(
    () => ({
      prefill: (text) => {
        setInput(text);
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.setSelectionRange(text.length, text.length);
        });
      },
      send: (text) => setPendingSend(text),
      mention: (m) => {
        setMentions((list) => (list.some((x) => x.type === m.type && x.id === m.id) ? list : [...list, m]));
        requestAnimationFrame(() => inputRef.current?.focus());
      },
      focus: () => inputRef.current?.focus(),
      showForm: (spec) => setPendingForm(spec),
      openThread: (id) => setPendingThread(id),
      heroSlot: setHeroSlot,
    }),
    [],
  );

  const dock = useMemo<DockProps>(
    () => ({
      input,
      setInput,
      mentions,
      setMentions,
      open,
      setOpen,
      inputRef,
      pendingSend,
      clearPending: () => setPendingSend(null),
      pendingForm,
      clearPendingForm: () => setPendingForm(null),
      pendingThread,
      clearPendingThread: () => setPendingThread(null),
      heroSlot,
    }),
    [input, mentions, open, pendingSend, pendingForm, pendingThread, heroSlot],
  );

  return (
    <ChatContext.Provider value={value}>
      <DockStateContext.Provider value={dock}>{children}</DockStateContext.Provider>
    </ChatContext.Provider>
  );
}

interface DockProps {
  input: string;
  setInput: (v: string) => void;
  mentions: ChatMention[];
  setMentions: React.Dispatch<React.SetStateAction<ChatMention[]>>;
  open: boolean;
  setOpen: (v: boolean) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  pendingSend: string | null;
  clearPending: () => void;
  pendingForm: ChatFormSpec | null;
  clearPendingForm: () => void;
  pendingThread: string | null;
  clearPendingThread: () => void;
  heroSlot: HTMLElement | null;
}

const DockStateContext = createContext<DockProps | null>(null);

/** The always-visible chat bar, mounted at the bottom of the page area (state lives in ChatProvider). */
export function ChatDock() {
  const props = useContext(DockStateContext);
  const pathname = usePathname();
  // The CV editor has its own Claude bar (it edits the CV directly).
  if (/^\/cv\/[^/]+/.test(pathname)) return null;
  return props ? <Dock {...props} /> : null;
}

function Dock({ input, setInput, mentions, setMentions, open, setOpen, inputRef, pendingSend, clearPending, pendingForm, clearPendingForm, pendingThread, clearPendingThread, heroSlot }: DockProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { ai } = useAppData();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threadTitle, setThreadTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const [includePage, setIncludePage] = useState(true);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionHits, setMentionHits] = useState<{ type: string; id: string; title: string; subtitle: string | null; href: string }[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const levelSink = useRef<((level: number) => void) | null>(null);
  const onDictationText = useCallback(
    (text: string) => {
      const current = inputRef.current?.value ?? "";
      const next = current.trim() ? `${current.trimEnd()} ${text}` : text;
      setInput(next);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(next.length, next.length);
      });
    },
    [inputRef, setInput],
  );
  const onDictationError = useCallback((message: string) => toast.error(message), []);
  const onDictationLevel = useCallback((level: number) => levelSink.current?.(level), []);
  const dictation = useDictation({ onText: onDictationText, onError: onDictationError, onLevel: onDictationLevel });
  const recording = dictation.state === "recording";
  const transcribing = dictation.state === "transcribing";
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pageTitle, setPageTitle] = useState("");
  const fullPath = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;

  useEffect(() => {
    const t = setTimeout(() => setPageTitle(document.title.replace(/\s*·\s*Career OS\s*$/, "")), 300);
    return () => clearTimeout(t);
  }, [fullPath]);

  // Restore the last conversation.
  const loadThread = useCallback(async (id: string) => {
    const res = await fetch(`/api/chat/threads/${id}`);
    if (!res.ok) {
      store.set(null);
      return;
    }
    const body = (await res.json()) as {
      data: { thread: { id: string; title: string }; messages: { id: string; role: "user" | "assistant"; content: string; tools: ToolLine[]; error: string | null; context: { mentions?: ChatMention[] } | null }[] };
    };
    setThreadId(body.data.thread.id);
    setThreadTitle(body.data.thread.title);
    setMessages(body.data.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, tools: m.tools ?? [], error: m.error, mentions: m.context?.mentions ?? [] })));
  }, []);

  useEffect(() => {
    const id = store.get();
    if (id) void loadThread(id);
  }, [loadThread]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  // Mention search (@…)
  useEffect(() => {
    if (mentionQuery === null || mentionQuery.length < 1) {
      setMentionHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(mentionQuery)}`, { signal: ctrl.signal });
        const body = (await res.json()) as { data?: { type: string; id: string; title: string; subtitle: string | null; href: string }[] };
        setMentionHits((body.data ?? []).filter((h) => h.type !== "event").slice(0, 8));
        setMentionIndex(0);
      } catch {
        /* ignore */
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [mentionQuery]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      if (!ai.available) {
        toast.error("Le chat a besoin de Claude Code : configure-le dans Paramètres → IA.");
        return;
      }
      const sentMentions = mentions;
      const userMsg: UiMessage = { id: `u-${Date.now()}`, role: "user", content: text, tools: [], mentions: sentMentions };
      const assistant: UiMessage = { id: `a-${Date.now()}`, role: "assistant", content: "", tools: [], streaming: true };
      setMessages((m) => [...m, userMsg, assistant]);
      setInput("");
      setMentions([]);
      setOpen(true);
      setBusy(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const patch = (fn: (m: UiMessage) => UiMessage) => setMessages((list) => list.map((m) => (m.id === assistant.id ? fn(m) : m)));
      let wrote = false;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ threadId, message: text, context: includePage ? { path: fullPath, title: pageTitle } : null, mentions: sentMentions }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? `Erreur ${res.status}`);
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
            if (!line) continue;
            const ev = JSON.parse(line) as { type: string; [k: string]: unknown };
            if (ev.type === "thread") {
              const id = String(ev.threadId);
              setThreadId(id);
              store.set(id);
              setThreadTitle((t) => t ?? text.slice(0, 80));
            } else if (ev.type === "text") patch((m) => ({ ...m, content: m.content + String(ev.delta ?? "") }));
            else if (ev.type === "tool") patch((m) => ({ ...m, tools: [...m.tools, { name: String(ev.name), summary: (ev.summary as string) ?? null }] }));
            else if (ev.type === "done") {
              wrote = !!ev.wrote;
              patch((m) => ({ ...m, content: String(ev.text ?? m.content) || m.content, streaming: false }));
            } else if (ev.type === "error") patch((m) => ({ ...m, error: String(ev.message ?? "Erreur"), streaming: false }));
          }
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") patch((m) => ({ ...m, error: error instanceof Error ? error.message : String(error), streaming: false }));
        else patch((m) => ({ ...m, error: "Arrêté.", streaming: false }));
      } finally {
        patch((m) => ({ ...m, streaming: false }));
        setBusy(false);
        abortRef.current = null;
        if (wrote) router.refresh();
      }
    },
    [ai.available, busy, fullPath, includePage, mentions, pageTitle, router, setInput, setMentions, setOpen, threadId],
  );

  useEffect(() => {
    if (pendingSend) {
      clearPending();
      void send(pendingSend);
    }
  }, [pendingSend, clearPending, send]);

  // A quick action asked for a form: it appears as a message of the conversation.
  useEffect(() => {
    if (!pendingForm) return;
    clearPendingForm();
    const spec = pendingForm;
    const msg: UiMessage = { id: `f-${Date.now()}`, role: "assistant", content: "", tools: [], form: spec };
    // A quick action starts a new conversation (unless Claude is answering in the current one).
    if (busy) setMessages((list) => [...list, msg]);
    else {
      setThreadId(null);
      setThreadTitle(spec.domain === "HOUSING" ? "Recherche de logement" : "Recherche d’offres");
      store.set(null);
      setMessages([msg]);
    }
    setOpen(true);
  }, [pendingForm, clearPendingForm, setOpen, busy]);

  useEffect(() => {
    if (!pendingThread) return;
    clearPendingThread();
    const id = pendingThread;
    void loadThread(id).then(() => {
      store.set(id);
      setOpen(true);
    });
  }, [pendingThread, clearPendingThread, loadThread, setOpen]);

  // Keyboard: Ctrl/Cmd+J focuses the chat from anywhere; Escape collapses the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        inputRef.current?.focus();
        if (messages.length) setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inputRef, messages.length, setOpen]);

  const newThread = () => {
    abortRef.current?.abort();
    setThreadId(null);
    setThreadTitle(null);
    setMessages([]);
    store.set(null);
    inputRef.current?.focus();
  };

  const loadThreads = async () => {
    const res = await fetch("/api/chat/threads");
    const body = (await res.json()) as { data: ThreadSummary[] };
    setThreads(body.data ?? []);
  };

  const pickMention = (hit: { type: string; id: string; title: string; href: string }) => {
    setMentions((list) => (list.some((x) => x.id === hit.id) ? list : [...list, { type: hit.type, id: hit.id, label: hit.title, href: hit.href }]));
    setInput(input.replace(/@([^\s@]*)$/, ""));
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const onChange = (value: string) => {
    setInput(value);
    const m = value.match(/@([^\s@]{0,40})$/);
    setMentionQuery(m ? m[1] : null);
  };

  // While recording: Enter finishes, Escape cancels.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        dictation.stop();
      } else if (e.key === "Escape") {
        e.preventDefault();
        dictation.cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording, dictation]);

  // Home page: the bar sits in the middle of the page (hero) until a conversation opens.
  const hero = !!heroSlot && !(open && messages.length > 0);

  // The input grows with its content up to 8 lines, then scrolls.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 8 * 20 + 16;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [input, inputRef, dictation.state, hero]);

  // Home page: the bar sits in the middle of the page (hero) until a conversation opens; on every other page it is
  // docked at the bottom. It is the same element, so it slides from one place to the other (FLIP animation).
  const outerRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const lastRect = useRef<DOMRect | null>(null);
  const wasHero = useRef(hero);
  // No slide when the app has just loaded on the home page: only page changes animate.
  const mountedAt = useRef<number | null>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const box = boxRef.current;
    if (!outer || !box) return;
    if (!hero || !heroSlot) {
      outer.style.removeProperty("top");
      outer.style.removeProperty("left");
      outer.style.removeProperty("width");
      return;
    }
    const place = () => {
      const host = outer.parentElement;
      if (!host) return;
      const h = host.getBoundingClientRect();
      const r = heroSlot.getBoundingClientRect();
      outer.style.top = `${r.top - h.top}px`;
      outer.style.left = `${r.left - h.left}px`;
      outer.style.width = `${r.width}px`;
      heroSlot.style.height = `${box.offsetHeight}px`;
    };
    place();
    // The slot can move without changing size (fonts loading, text wrapping above it): watch its surroundings too,
    // and re-place a few frames while the page settles.
    const ro = new ResizeObserver(place);
    ro.observe(heroSlot);
    ro.observe(box);
    if (heroSlot.parentElement) ro.observe(heroSlot.parentElement);
    if (outer.parentElement) ro.observe(outer.parentElement);
    window.addEventListener("resize", place);
    void document.fonts?.ready.then(place);
    let frames = 0;
    let raf = requestAnimationFrame(function tick() {
      place();
      if (++frames < 30) raf = requestAnimationFrame(tick);
    });
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
    };
  }, [hero, heroSlot]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const now = box.getBoundingClientRect();
    const before = lastRect.current;
    mountedAt.current ??= performance.now();
    const settled = performance.now() - mountedAt.current > 800;
    if (wasHero.current !== hero && before && settled && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const dx = before.left - now.left;
      const dy = before.top - now.top;
      if (Math.abs(dx) + Math.abs(dy) > 4) box.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], { duration: 560, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    }
    wasHero.current = hero;
    lastRect.current = now;
  });

  // Keep the last position fresh while the page scrolls (the animation starts from where the bar really was).
  useEffect(() => {
    const onScroll = () => {
      if (boxRef.current) lastRect.current = boxRef.current.getBoundingClientRect();
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  const suggestions = suggestionsFor(pathname);
  const last = messages[messages.length - 1];
  const asksConfirmation = !busy && last?.role === "assistant" && !last.error && /\?\s*$/.test(last.content.trim());
  const showSuggestions = !input.trim() && !mentions.length && !busy && dictation.state === "idle" && !(open && messages.length > 0);

  return (
    <div ref={outerRef} className={cn("pointer-events-none z-30", hero ? "absolute" : "sticky bottom-0 w-full px-3 pb-3 sm:px-6")}>
      <div ref={boxRef} className={cn("pointer-events-auto mx-auto w-full", !hero && "max-w-3xl")}>
        {open && messages.length > 0 && (
          <div className="mb-2 flex max-h-[min(62vh,620px)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
            <div className="flex items-center gap-2 border-b border-separator px-3 py-2">
              <Sparkles className="size-4 shrink-0 text-highlight-500" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{threadTitle ?? "Conversation"}</span>
              <DropdownMenu onOpenChange={(o) => o && void loadThreads()}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-xs" aria-label="Conversations précédentes">
                        <History />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Conversations précédentes</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Conversations</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {threads.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">Aucune autre conversation</div>}
                  {threads.map((t) => (
                    <DropdownMenuItem key={t.id} onClick={() => void loadThread(t.id).then(() => store.set(t.id))}>
                      <span className="truncate">{t.title}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-xs" onClick={newThread} aria-label="Nouvelle conversation">
                    <Plus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Nouvelle conversation</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-xs" onClick={() => setOpen(false)} aria-label="Réduire">
                    <ChevronDown />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Réduire (Échap)</TooltipContent>
              </Tooltip>
            </div>
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {messages.map((m) => (
                <MessageView key={m.id} m={m} onNavigate={(href) => router.push(href)} />
              ))}
            </div>
            {asksConfirmation && (
              <div className="flex flex-wrap gap-2 border-t border-separator px-3 py-2">
                {["Oui, vas-y", "Non", "Modifie d'abord"].map((t) => (
                  <Button key={t} size="xs" variant={t === "Oui, vas-y" ? "highlight" : "outline"} onClick={() => (t === "Modifie d'abord" ? inputRef.current?.focus() : void send(t))}>
                    {t}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="relative isolate">
          <div aria-hidden className={cn("composer-halo pointer-events-none absolute -inset-[3px] -z-10 rounded-[23px] opacity-45 blur-md transition-opacity duration-300", (focused || hero || dictation.state !== "idle") && "opacity-100")} />
          <div className={cn("relative rounded-[20px] border bg-background shadow-lg transition-colors", focused || dictation.state !== "idle" ? "border-transparent" : "border-border")}>
            {mentionQuery !== null && mentionHits.length > 0 && (
              <div className="absolute inset-x-2 bottom-full mb-3 overflow-hidden rounded-xl border border-border bg-background shadow-lg">
                {mentionHits.map((h, i) => (
                  <button
                    key={`${h.type}:${h.id}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickMention(h)}
                    className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm", i === mentionIndex ? "bg-hover" : "hover:bg-hover")}
                  >
                    <Badge size="sm" variant="outline" className="shrink-0">
                      {MENTION_LABEL[h.type] ?? h.type}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate">{h.title}</span>
                    {h.subtitle && <span className="hidden max-w-[40%] truncate text-xs text-muted-foreground sm:inline">{h.subtitle}</span>}
                  </button>
                ))}
              </div>
            )}

            {(mentions.length > 0 || (includePage && pageTitle && focused)) && (
              <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                {includePage && pageTitle && focused && (
                  <Badge size="sm" variant="outline" className="max-w-56 gap-1">
                    <MapPin className="shrink-0" />
                    <span className="truncate">{pageTitle}</span>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setIncludePage(false)} aria-label="Ne pas joindre la page">
                      <X className="size-3" />
                    </button>
                  </Badge>
                )}
                {mentions.map((m) => (
                  <Badge key={`${m.type}:${m.id}`} size="sm" variant="highlight" className="max-w-56 gap-1">
                    <AtSign className="shrink-0" />
                    <span className="truncate">{m.label}</span>
                    <button type="button" onClick={() => setMentions((l) => l.filter((x) => x !== m))} aria-label={`Retirer ${m.label}`}>
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {recording ? (
              <div className="flex h-11 items-center gap-3 px-4 pt-2" role="status" aria-label="Enregistrement en cours">
                <span className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" />
                <VoiceWave sinkRef={levelSink} />
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatElapsed(dictation.elapsedMs)}</span>
              </div>
            ) : (
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                disabled={transcribing}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => {
                  setFocused(true);
                  setIncludePage(true);
                }}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => {
                  if (mentionQuery !== null && mentionHits.length) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setMentionIndex((i) => (i + 1) % mentionHits.length);
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setMentionIndex((i) => (i - 1 + mentionHits.length) % mentionHits.length);
                      return;
                    }
                    if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault();
                      pickMention(mentionHits[mentionIndex]);
                      return;
                    }
                  }
                  if (e.key === "Escape") {
                    if (mentionQuery !== null) setMentionQuery(null);
                    else if (open) setOpen(false);
                    else (e.target as HTMLTextAreaElement).blur();
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder={
                  transcribing
                    ? dictation.progress !== null
                      ? `Préparation de la dictée (téléchargement du modèle, une seule fois)… ${dictation.progress} %`
                      : "Transcription…"
                    : busy
                      ? "Claude travaille…"
                      : hero
                        ? "Que veux-tu faire ? Des offres, un logement, une question… (@ pour citer une candidature, un CV…)"
                        : "Demande n'importe quoi… (@ pour citer une candidature, un CV…)"
                }
                className={cn("block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm leading-5 outline-none placeholder:text-faint disabled:cursor-wait", hero ? "min-h-[76px] text-[15px] leading-6" : "min-h-11")}
                aria-label="Message pour Claude"
              />
            )}

            <div className="flex items-center gap-1.5 px-2 pt-1 pb-2">
              <div className="min-w-0 flex-1">
                {showSuggestions && suggestions.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto px-1 [mask-image:linear-gradient(to_right,black_88%,transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <Sparkles className="size-3.5 shrink-0 text-highlight-500" aria-hidden />
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (s.endsWith(": ")) {
                            onChange(s);
                            inputRef.current?.focus();
                          } else void send(s);
                        }}
                        className="shrink-0 rounded-full bg-highlight-50 px-2.5 py-1 text-xs whitespace-nowrap text-highlight-700 transition-colors hover:bg-highlight-100"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {recording && <p className="truncate px-2 text-xs text-muted-foreground">Parle, puis valide : le texte s’écrit à la fin. Entrée pour valider, Échap pour annuler.</p>}
              </div>
              {recording ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" onClick={dictation.cancel} aria-label="Annuler l'enregistrement">
                        <X />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Annuler (Échap)</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="highlight" size="icon-sm" onClick={dictation.stop} aria-label="Terminer et transcrire">
                        <Check />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Terminer et transcrire (Entrée)</TooltipContent>
                  </Tooltip>
                </>
              ) : (
                <>
                  {messages.length > 0 && !open && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label="Afficher la conversation">
                          <Sparkles className="text-highlight-500" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Afficher la conversation (Ctrl J)</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" onClick={() => void dictation.start()} disabled={transcribing} aria-label="Dicter">
                        {transcribing ? <Loader2 className="animate-spin" /> : <Mic />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{transcribing ? "Transcription…" : "Dicter"}</TooltipContent>
                  </Tooltip>
                  {busy ? (
                    <Button variant="outline" size="icon-sm" onClick={() => abortRef.current?.abort()} aria-label="Arrêter">
                      <Square className="fill-current" />
                    </Button>
                  ) : (
                    <Button variant="highlight" size="icon-sm" onClick={() => void send(input)} disabled={!input.trim() || transcribing} aria-label="Envoyer">
                      <ArrowUp />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const WAVE_BARS = 72;

/** Scrolling level meter of the microphone (bars updated directly, outside React renders). */
function VoiceWave({ sinkRef }: { sinkRef: React.RefObject<((level: number) => void) | null> }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    const history = new Array<number>(WAVE_BARS).fill(0);
    let last = 0;
    // Adapts to the microphone: the background noise becomes the baseline, the voice fills the height (a quiet
    // microphone would otherwise keep every bar near the floor).
    let floor = 1;
    let peak = 0;
    sinkRef.current = (level) => {
      const now = performance.now();
      if (now - last < 55) return;
      last = now;
      floor = Math.min(level, floor + 0.002);
      peak = Math.max(level, peak * 0.985, floor + 0.05);
      const norm = Math.max(0, Math.min(1, (level - floor) / (peak - floor)));
      history.shift();
      history.push(0.08 + 0.92 * Math.pow(norm, 0.85));
      history.forEach((v, i) => {
        const el = bars.current[i];
        if (el) el.style.transform = `scaleY(${Math.max(0.1, Math.min(1, v))})`;
      });
    };
    return () => {
      sinkRef.current = null;
    };
  }, [sinkRef]);
  return (
    <div className="flex h-7 min-w-0 flex-1 items-center justify-end gap-[3px] overflow-hidden" aria-hidden>
      {Array.from({ length: WAVE_BARS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
          className="h-full w-[3px] shrink-0 origin-center scale-y-[0.1] rounded-full bg-foreground/70 transition-transform duration-75"
        />
      ))}
    </div>
  );
}

function rewriteHref(href: string | undefined) {
  if (!href) return href;
  return href.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?=\/)/, "");
}

function MessageView({ m, onNavigate }: { m: UiMessage; onNavigate: (href: string) => void }) {
  if (m.form) return <ChatForm spec={m.form} storageKey={m.id} />;
  if (m.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        {!!m.mentions?.length && (
          <div className="flex flex-wrap justify-end gap-1">
            {m.mentions.map((x) => (
              <Badge key={x.id} size="sm" variant="highlight" className="max-w-56">
                <span className="truncate">@{x.label}</span>
              </Badge>
            ))}
          </div>
        )}
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-muted-background px-3.5 py-2 text-sm whitespace-pre-wrap">{m.content}</div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {m.tools.length > 0 && (
        <div className="space-y-0.5">
          {m.tools.map((t, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wrench className="size-3 shrink-0" />
              <span className="truncate">{t.summary ?? t.name}</span>
            </div>
          ))}
        </div>
      )}
      {m.content ? (
        <div className="prose-cos text-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // ```careeros-form blocks written by Claude become real forms.
              pre: ({ node, children, ...rest }) => {
                const first = node?.children?.[0] as { properties?: { className?: unknown } } | undefined;
                const cls = first?.properties?.className;
                if (Array.isArray(cls) && cls.includes("language-careeros-form")) return <>{children}</>;
                return <pre {...rest}>{children}</pre>;
              },
              code: ({ className, children, ...rest }) => {
                if (className?.includes("language-careeros-form")) {
                  const spec = parseChatForm(String(children));
                  if (!spec)
                    return (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" /> Préparation du formulaire…
                      </span>
                    );
                  return <ChatForm spec={spec} storageKey={formKey(spec)} />;
                }
                return (
                  <code className={className} {...rest}>
                    {children}
                  </code>
                );
              },
              a: ({ href, children }) => {
                const target = rewriteHref(href);
                const internal = !!target && target.startsWith("/");
                return internal ? (
                  <a
                    href={target}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate(target!);
                    }}
                  >
                    {children}
                  </a>
                ) : (
                  <a href={target} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                );
              },
            }}
          >
            {m.content}
          </ReactMarkdown>
        </div>
      ) : m.streaming ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {m.tools.length ? "Claude travaille…" : "Claude réfléchit…"}
        </div>
      ) : null}
      {m.streaming && m.content && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      {m.error && <p className="rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700">{m.error}</p>}
      {!m.streaming && m.content && (
        <a href={REPORT_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-faint hover:text-muted-foreground" title="Réponse fausse, choquante ou inappropriée ? Signale-la.">
          <Flag className="size-3" /> Signaler
        </a>
      )}
    </div>
  );
}

/** Reporting an assistant answer (required for generated content): a prefilled issue, with no conversation content. */
const REPORT_URL = `https://github.com/Miche1-Pierre/career-os/issues/new?${new URLSearchParams({
  title: "Réponse de l'assistant à signaler",
  labels: "ia",
  body: "Décris ce qui ne va pas dans la réponse (fausse, choquante, inappropriée…).\n\nN'y colle pas d'informations personnelles : ce signalement est public.",
})}`;
