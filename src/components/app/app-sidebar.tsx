"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Bookmark,
  Building2,
  CalendarDays,
  FileText,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  List,
  ListChecks,
  Plus,
  Settings,
  SquareKanban,
  Sun,
  Trash2,
  Users,
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

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  exact?: boolean;
  shortcut?: string;
}

function NavGroup({ label, items }: { label?: string; items: NavItem[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isMobile, setOpenMobile } = useSidebar();
  const view = searchParams.get("view");
  return (
    <SidebarGroup className="py-1">
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const [path, query] = item.href.split("?");
            const active = query
              ? pathname === path && query === `view=${view}`
              : item.exact
                ? pathname === path && !view
                : pathname === path || (pathname.startsWith(`${path}/`) && !(path === "/applications" && pathname.startsWith("/applications/board")));
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                  <Link href={item.href} onClick={() => isMobile && setOpenMobile(false)}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
                {!!item.badge && <SidebarMenuBadge className="tabular-nums">{item.badge}</SidebarMenuBadge>}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { badges, views, ai } = useAppData();
  const { open: openImport } = useQuickImport();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="gap-2">
        <Link href="/today" className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-hover">
          {collapsed ? <CareerOsGlyph className="size-6" /> : <CareerOsMark className="h-[20px]" />}
          {!collapsed && (
            <span className="flex min-w-0 flex-col gap-0.5 leading-none">
              <span className="heading-sm text-foreground">Career OS</span>
              <span className="text-xs text-faint">Personal pipeline</span>
            </span>
          )}
        </Link>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="highlight" size="icon-sm" onClick={() => openImport()} aria-label="Quick import">
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Quick import (I)</TooltipContent>
          </Tooltip>
        ) : (
          <Button variant="highlight" onClick={() => openImport()} className="w-full justify-start gap-2">
            <Plus />
            Quick import
            <Kbd className="ml-auto border-transparent bg-white/20 text-white shadow-none dark:bg-white/20">I</Kbd>
          </Button>
        )}
      </SidebarHeader>
      <SidebarContent>
        <NavGroup
          items={[
            { href: "/today", label: "Today", icon: Sun, badge: badges.today },
            { href: "/inbox", label: "Inbox", icon: Inbox, badge: badges.inbox },
            { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
          ]}
        />
        <NavGroup
          label="Pipeline"
          items={[
            { href: "/applications", label: "Applications", icon: List, exact: true },
            { href: "/applications/board", label: "Board", icon: SquareKanban },
            { href: "/calendar", label: "Calendar", icon: CalendarDays },
            { href: "/tasks", label: "Tasks", icon: ListChecks },
          ]}
        />
        <NavGroup
          label="Network"
          items={[
            { href: "/companies", label: "Companies", icon: Building2 },
            { href: "/institutions", label: "Institutions", icon: GraduationCap },
            { href: "/contacts", label: "Contacts", icon: Users },
          ]}
        />
        <NavGroup
          label="Library"
          items={[
            { href: "/documents", label: "Documents", icon: FileText },
            { href: "/analytics", label: "Analytics", icon: BarChart3 },
          ]}
        />
        {views.length > 0 && <NavGroup label="Views" items={views.map((v) => ({ href: `/applications?view=${v.id}`, label: v.name, icon: Bookmark }))} />}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Trash">
              <Link href="/trash">
                <Trash2 />
                <span>Recently deleted</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Settings">
              <Link href="/settings/general">
                <Settings />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={ai.available ? `AI: ${ai.detail}` : "AI not configured"}>
              <Link href="/settings/ai">
                <span className={cn("ml-1 size-2 shrink-0 rounded-full", ai.available ? "bg-success-500" : "bg-stone-400")} />
                <span className="truncate text-xs text-faint">{ai.available ? `AI · ${ai.provider}` : "AI off — MCP only"}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
