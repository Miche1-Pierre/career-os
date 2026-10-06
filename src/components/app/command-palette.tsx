"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  BarChart3,
  Bookmark,
  Briefcase,
  Building2,
  CalendarDays,
  FileText,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Loader2,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  SquareKanban,
  Sun,
  SunMoon,
  User,
  Users,
} from "lucide-react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { useAppData } from "./app-data";
import { useQuickImport } from "./quick-import";
import { useAsk } from "./ask-dialog";

interface PaletteContextValue {
  open: (query?: string) => void;
}
const PaletteContext = createContext<PaletteContextValue | null>(null);
export function usePalette() {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error("usePalette must be used inside CommandPaletteProvider");
  return ctx;
}

interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

const HIT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  opportunity: Briefcase,
  organization: Building2,
  contact: User,
  document: FileText,
  interview: CalendarDays,
  event: MessageSquare,
};
const HIT_GROUP: Record<string, string> = {
  opportunity: "Opportunities",
  organization: "Companies & institutions",
  contact: "Contacts",
  document: "Documents",
  interview: "Interviews",
  event: "Notes & messages",
};

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { views, ai } = useAppData();
  const quickImport = useQuickImport();
  const ask = useAsk();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  const openPalette = useCallback((q?: string) => {
    setQuery(q ?? "");
    setOpen(true);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}&limit=6`, { signal: controller.signal });
        const body = (await res.json()) as { data?: SearchHit[] };
        setHits(body.data ?? []);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 140);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const run = (fn: () => void) => {
    setOpen(false);
    setTimeout(fn, 50);
  };

  const actions = useMemo(
    () => [
      { label: "Quick import", icon: Plus, shortcut: "I", run: () => run(() => quickImport.open()) },
      { label: "New opportunity", icon: Briefcase, shortcut: "N", run: () => go("/applications/new") },
      { label: "New formation / program", icon: GraduationCap, run: () => go("/applications/new?type=FORMATION") },
      { label: "New company", icon: Building2, run: () => go("/companies?new=1") },
      { label: "New institution", icon: GraduationCap, run: () => go("/institutions?new=1") },
      { label: "New contact", icon: Users, run: () => go("/contacts?new=1") },
      { label: "New task", icon: ListChecks, run: () => go("/tasks?new=1") },
      { label: "Add document", icon: FileText, run: () => go("/documents?new=1") },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quickImport],
  );
  const navigation = [
    { label: "Today's actions", icon: Sun, shortcut: "T", href: "/today" },
    { label: "Inbox", icon: Inbox, shortcut: "G I", href: "/inbox" },
    { label: "Dashboard", icon: LayoutDashboard, shortcut: "G D", href: "/dashboard" },
    { label: "Applications", icon: Briefcase, shortcut: "G A", href: "/applications" },
    { label: "Board", icon: SquareKanban, shortcut: "G B", href: "/applications/board" },
    { label: "Calendar", icon: CalendarDays, shortcut: "G C", href: "/calendar" },
    { label: "Tasks", icon: ListChecks, shortcut: "G K", href: "/tasks" },
    { label: "Companies", icon: Building2, href: "/companies" },
    { label: "Institutions", icon: GraduationCap, href: "/institutions" },
    { label: "Contacts", icon: Users, shortcut: "G P", href: "/contacts" },
    { label: "Documents", icon: FileText, shortcut: "G F", href: "/documents" },
    { label: "Analytics", icon: BarChart3, href: "/analytics" },
    { label: "Settings", icon: Settings, shortcut: "G S", href: "/settings/general" },
  ];
  const q = query.trim().toLowerCase();
  const matches = (label: string) => !q || label.toLowerCase().includes(q);
  const grouped = (query.trim() ? hits : []).reduce<Record<string, SearchHit[]>>((acc, h) => {
    (acc[h.type] ??= []).push(h);
    return acc;
  }, {});

  return (
    <PaletteContext.Provider value={{ open: openPalette }}>
      {children}
      <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Search or run a command">
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:text-xs">
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search anything or type a command…" />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>{loading ? "Searching…" : "No results."}</CommandEmpty>
            {q && ai.available && (
              <CommandGroup heading="Assistant">
                <CommandItem value={`ask ${q}`} onSelect={() => run(() => ask.open(query))}>
                  <Sparkles className="text-highlight-500" />
                  <span className="truncate">
                    Ask Career OS: <span className="text-muted-foreground">“{query}”</span>
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            {Object.entries(grouped).map(([type, list]) => (
              <CommandGroup key={type} heading={HIT_GROUP[type] ?? type}>
                {list.map((hit) => {
                  const Icon = HIT_ICON[hit.type] ?? Search;
                  return (
                    <CommandItem key={`${hit.type}:${hit.id}`} value={`${hit.type}:${hit.id}`} onSelect={() => go(hit.href)}>
                      <Icon />
                      <span className="truncate">{hit.title}</span>
                      {hit.subtitle && <span className="ml-2 truncate text-xs text-muted-foreground">{hit.subtitle}</span>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
            {loading && !grouped.length && q && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Searching…
              </div>
            )}
            {actions.some((a) => matches(a.label)) && (
              <CommandGroup heading="Actions">
                {actions.filter((a) => matches(a.label)).map((a) => (
                  <CommandItem key={a.label} value={a.label} onSelect={a.run}>
                    <a.icon />
                    {a.label}
                    {a.shortcut && <CommandShortcut>{a.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {navigation.some((n) => matches(n.label)) && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Go to">
                  {navigation.filter((n) => matches(n.label)).map((n) => (
                    <CommandItem key={n.href} value={n.label} onSelect={() => go(n.href)}>
                      <n.icon />
                      {n.label}
                      {n.shortcut && <CommandShortcut>{n.shortcut}</CommandShortcut>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {views.some((v) => matches(v.name)) && (
              <CommandGroup heading="Saved views">
                {views.filter((v) => matches(v.name)).map((v) => (
                  <CommandItem key={v.id} value={`view ${v.name}`} onSelect={() => go(`/applications?view=${v.id}`)}>
                    <Bookmark />
                    {v.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {["theme light", "theme dark", "theme system"].some((t) => matches(t)) && (
              <CommandGroup heading="Theme">
                <CommandItem value="theme light" onSelect={() => run(() => setTheme("light"))}>
                  <Sun /> Light
                </CommandItem>
                <CommandItem value="theme dark" onSelect={() => run(() => setTheme("dark"))}>
                  <Moon /> Dark
                </CommandItem>
                <CommandItem value="theme system" onSelect={() => run(() => setTheme("system"))}>
                  <SunMoon /> System
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </PaletteContext.Provider>
  );
}
