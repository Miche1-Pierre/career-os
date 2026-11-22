"use client";

import { createContext, useContext } from "react";
import type { PipelineKey, StageCategory } from "@/lib/constants";

export interface StageOption {
  id: string;
  pipeline: PipelineKey;
  key: string;
  label: string;
  category: StageCategory;
  color: string | null;
  position: number;
  isDefault: boolean;
}

export interface AppData {
  today: string;
  timezone: string;
  dateLocale: string;
  weekStartsOn: number;
  userName: string;
  stages: StageOption[];
  tags: { name: string; color: string | null }[];
  ai: { available: boolean; provider: string; detail: string; setup: string | null; model: string | null };
  badges: { today: number; inbox: number };
  views: { id: string; name: string; filters: Record<string, unknown> }[];
  hasDemo: boolean;
  accessProtected: boolean;
}

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ value, children }: { value: AppData; children: React.ReactNode }) {
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used inside AppDataProvider");
  return ctx;
}

export function useStages(pipeline?: PipelineKey) {
  const { stages } = useAppData();
  return pipeline ? stages.filter((s) => s.pipeline === pipeline) : stages;
}
