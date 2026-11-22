"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { usePalette } from "./command-palette";
import { useQuickImport } from "./quick-import";

const GO: Record<string, string> = {
  t: "/today",
  d: "/dashboard",
  i: "/inbox",
  a: "/applications",
  b: "/applications/board",
  c: "/calendar",
  k: "/tasks",
  o: "/companies",
  u: "/institutions",
  p: "/contacts",
  f: "/documents",
  n: "/analytics",
  s: "/settings/general",
};

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Ctrl", "K"], label: "Palette de commandes / recherche" },
  { keys: ["/"], label: "Rechercher" },
  { keys: ["N"], label: "Nouvelle opportunité" },
  { keys: ["I"], label: "Import rapide" },
  { keys: ["T"], label: "Actions du jour" },
  { keys: ["G", "D"], label: "Aller au tableau de bord" },
  { keys: ["G", "I"], label: "Aller à « À trier »" },
  { keys: ["G", "A"], label: "Aller aux candidatures" },
  { keys: ["G", "B"], label: "Aller au tableau" },
  { keys: ["G", "C"], label: "Aller au calendrier" },
  { keys: ["G", "K"], label: "Aller aux tâches" },
  { keys: ["G", "P"], label: "Aller aux contacts" },
  { keys: ["G", "F"], label: "Aller aux documents" },
  { keys: ["G", "S"], label: "Aller aux paramètres" },
  { keys: ["Ctrl", "B"], label: "Afficher / masquer la barre latérale" },
  { keys: ["?"], label: "Afficher les raccourcis" },
];

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable || !!el.closest("[role=dialog] [cmdk-root]");
}

export function GlobalShortcuts() {
  const router = useRouter();
  const palette = usePalette();
  const quickImport = useQuickImport();
  const [help, setHelp] = useState(false);
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        palette.open();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector("[role=dialog][data-state=open]")) return;
      const key = e.key.toLowerCase();
      if (pendingG.current) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const href = GO[key];
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }
      switch (key) {
        case "g":
          pendingG.current = window.setTimeout(() => (pendingG.current = null), 900);
          break;
        case "/":
          e.preventDefault();
          palette.open();
          break;
        case "n":
          e.preventDefault();
          router.push("/applications/new");
          break;
        case "i":
          e.preventDefault();
          quickImport.open();
          break;
        case "t":
          e.preventDefault();
          router.push("/today");
          break;
        case "?":
          e.preventDefault();
          setHelp(true);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [palette, quickImport, router]);

  return (
    <Dialog open={help} onOpenChange={setHelp}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Raccourcis clavier</DialogTitle>
          <DialogDescription>Career OS se pilote au clavier. Les raccourcis sont désactivés pendant la saisie dans un champ.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{s.label}</span>
              <KbdGroup>
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </KbdGroup>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
