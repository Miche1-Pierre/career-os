"use client";

import { Suspense } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppDataProvider, type AppData } from "./app-data";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { QuickImportProvider } from "./quick-import";
import { CommandPaletteProvider } from "./command-palette";
import { AskProvider } from "./ask-dialog";
import { GlobalShortcuts } from "./shortcuts";
import { ConfirmProvider } from "./confirm";
import { ChatDock, ChatProvider } from "@/components/chat/chat-dock";

export function AppShell({ data, children, defaultOpen = true }: { data: AppData; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <AppDataProvider value={data}>
      <ConfirmProvider>
        <QuickImportProvider>
          <ChatProvider>
          <AskProvider>
            <CommandPaletteProvider>
              <SidebarProvider defaultOpen={defaultOpen}>
                <AppSidebar />
                <SidebarInset className="min-w-0">
                  <AppHeader />
                  <div className="flex-1">{children}</div>
                  <Suspense>
                    <ChatDock />
                  </Suspense>
                </SidebarInset>
                <GlobalShortcuts />
              </SidebarProvider>
            </CommandPaletteProvider>
          </AskProvider>
          </ChatProvider>
        </QuickImportProvider>
      </ConfirmProvider>
    </AppDataProvider>
  );
}
