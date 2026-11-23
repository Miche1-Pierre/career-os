"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  FileText,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  Plane,
  Plus,
  Settings,
  Sun,
  Trash2,
  UserRound,
  Users,
  Radar,
  FileUser,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { CareerOsGlyph, CareerOsMark } from "@/components/app/logo";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAppData } from "./app-data";
import { useQuickImport } from "./quick-import";
import { ClaudeUsage } from "./claude-usage";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  /** Extra path prefixes that also activate this item. */
  also?: string[];
}

function isActive(pathname: string, item: NavItem) {
  const prefixes = [item.href, ...(item.also ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function NavGroup({ label, items }: { label?: string; items: NavItem[] }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarGroup className="py-1">
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={isActive(pathname, item)} tooltip={item.label}>
                <Link href={item.href} onClick={() => isMobile && setOpenMobile(false)}>
                  <item.icon />
                  <span className="truncate">{item.label}</span>
                </Link>
              </SidebarMenuButton>
              {!!item.badge && <SidebarMenuBadge className="tabular-nums">{item.badge}</SidebarMenuBadge>}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/**
 * Navigation follows the journey: what to do now, then Prepare → Apply → Settle in, then the network and the
 * review screens. Saved views live in the Applications toolbar, the inbox only shows up when captures wait.
 */
export function AppSidebar() {
  const { badges, ai } = useAppData();
  const { open: openImport } = useQuickImport();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const apply: NavItem[] = [
    { href: "/applications", label: "Candidatures", icon: Briefcase },
    { href: "/searches", label: "Recherches", icon: Radar },
  ];
  if (badges.inbox > 0) apply.push({ href: "/inbox", label: "À trier", icon: Inbox, badge: badges.inbox });
  return (
    <Sidebar collapsible="icon" variant="floating" className="macos-sidebar">
      <SidebarHeader className={cn("gap-1 pt-3 pb-1", collapsed ? "items-center px-2" : "px-3")}>
        <div className={cn("flex items-center gap-2", collapsed && "flex-col")}>
          <Link href="/today" className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-black/5 dark:hover:bg-white/5">
            {collapsed ? <CareerOsGlyph className="size-5" /> : <CareerOsMark className="h-[18px]" />}
            {!collapsed && <span className="truncate text-[13px] font-semibold text-foreground">Career OS</span>}
          </Link>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="highlight" size="icon-xs" className="size-6 shrink-0 rounded-full" onClick={() => openImport()} aria-label="Import rapide">
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Import rapide <Kbd className="ml-1">I</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavGroup
          items={[
            { href: "/today", label: "Aujourd'hui", icon: Sun, badge: badges.today, also: ["/tasks"] },
            { href: "/calendar", label: "Calendrier", icon: CalendarDays },
          ]}
        />
        <NavGroup
          label="Préparer"
          items={[
            { href: "/settings/profile", label: "Profil", icon: UserRound },
            { href: "/cv", label: "CV", icon: FileUser },
            { href: "/documents", label: "Documents", icon: FileText },
          ]}
        />
        <NavGroup label="Candidater" items={apply} />
        <NavGroup label="S'installer" items={[{ href: "/moves", label: "Installations", icon: Plane }]} />
        <NavGroup
          label="Réseau"
          items={[
            { href: "/companies", label: "Entreprises", icon: Building2 },
            { href: "/institutions", label: "Établissements", icon: GraduationCap },
            { href: "/contacts", label: "Contacts", icon: Users },
          ]}
        />
        <NavGroup
          label="Bilan"
          items={[
            { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
            { href: "/analytics", label: "Statistiques", icon: BarChart3 },
          ]}
        />
      </SidebarContent>
      <SidebarFooter>
        {ai.available && ai.provider === "claude-code" && <ClaudeUsage />}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Corbeille">
              <Link href="/trash">
                <Trash2 />
                <span>Corbeille</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Paramètres">
              <Link href="/settings/general">
                <Settings />
                <span>Paramètres</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={ai.available ? `IA : ${ai.detail}` : "IA non configurée"}>
              <Link href="/settings/ai">
                <span className={cn("ml-1 size-2 shrink-0 rounded-full", ai.available ? "bg-success-500" : "bg-stone-400")} />
                <span className="truncate text-xs text-faint">{ai.available ? `IA · ${ai.provider}` : "IA désactivée (MCP seul)"}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
