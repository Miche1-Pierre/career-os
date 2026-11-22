"use client";

import { Moon, Plus, Search, Sun, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePalette } from "./command-palette";
import { useQuickImport } from "./quick-import";
import { useAppData } from "./app-data";

export function AppHeader() {
  const palette = usePalette();
  const quickImport = useQuickImport();
  const { hasDemo } = useAppData();
  const { setTheme } = useTheme();
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-separator bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-4">
      <SidebarTrigger className="-ml-1 text-muted-foreground" />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <button
        type="button"
        onClick={() => palette.open()}
        className="flex h-8 w-full min-w-0 max-w-md items-center gap-2 rounded-xl border border-border-form bg-background px-3 text-sm text-faint transition-colors hover:border-border-form-active hover:text-muted-foreground dark:bg-transparent"
      >
        <Search className="size-4" />
        <span className="truncate">Rechercher ou lancer une commande…</span>
        <Kbd className="ml-auto hidden sm:inline-flex">Ctrl K</Kbd>
      </button>
      <div className="ml-auto flex items-center gap-1.5">
        {hasDemo && <span className="hidden h-6 items-center rounded-[9px] bg-info-50 px-[9px] heading-xs text-info-800 md:inline-flex">Données de démo</span>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost-secondary" size="icon-sm" aria-label="Thème">
              <Sun className="dark:hidden" />
              <Moon className="hidden dark:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun /> Clair
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon /> Sombre
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <SunMoon /> Système
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="highlight" size="icon-sm" onClick={() => quickImport.open()} className="md:hidden" aria-label="Import rapide">
          <Plus />
        </Button>
      </div>
    </header>
  );
}
