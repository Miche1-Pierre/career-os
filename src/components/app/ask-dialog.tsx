"use client";

import { createContext, useContext, useMemo } from "react";
import { useChat } from "@/components/chat/chat-dock";

/**
 * « Demander à Career OS » now goes through the always-visible chat bar (Claude Code with the app's tools).
 * Kept as a thin adapter so existing callers (command palette) keep working.
 */
interface AskContextValue {
  open: (text?: string) => void;
}
const AskContext = createContext<AskContextValue | null>(null);

export function useAsk() {
  const ctx = useContext(AskContext);
  if (!ctx) throw new Error("useAsk must be used inside AskProvider");
  return ctx;
}

export function AskProvider({ children }: { children: React.ReactNode }) {
  const chat = useChat();
  const value = useMemo<AskContextValue>(() => ({ open: (text) => (text?.trim() ? chat.send(text) : chat.focus()) }), [chat]);
  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}
