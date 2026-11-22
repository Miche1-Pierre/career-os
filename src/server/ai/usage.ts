/**
 * Claude subscription usage (5-hour and weekly windows) for the indicator in the sidebar.
 * On the host (npm run dev) it is read directly with the local Claude Code login; in Docker it goes through the
 * host bridge, because the container's long-lived token is not allowed to read usage.
 */
import { readClaudeUsage } from "../../../bridge/claude-runner.mjs";
import { inDocker } from "./index";

export interface UsageWindow {
  utilization: number;
  resetsAt: string | null;
}

export type ClaudeUsage =
  | { available: true; fiveHour: UsageWindow | null; sevenDay: UsageWindow | null; plan: string | null; fetchedAt: string }
  | { available: false; reason: string };

const cache = globalThis as unknown as { __careerOsUsage?: { at: number; value: ClaudeUsage } };
const TTL_MS = 60_000;

export async function getClaudeUsage(options: { fresh?: boolean } = {}): Promise<ClaudeUsage> {
  const hit = cache.__careerOsUsage;
  if (!options.fresh && hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await load();
  cache.__careerOsUsage = { at: Date.now(), value };
  return value;
}

async function load(): Promise<ClaudeUsage> {
  const fetchedAt = new Date().toISOString();
  try {
    if (!inDocker()) return { available: true, ...(await readClaudeUsage()), fetchedAt };
    const bridge = process.env.CLAUDE_BRIDGE_URL?.trim().replace(/\/$/, "");
    if (!bridge) return { available: false, reason: "Le quota se lit via le bridge hôte (npm run bridge) : configure CLAUDE_BRIDGE_URL." };
    const res = await fetch(`${bridge}/v1/usage`, { headers: { authorization: `Bearer ${process.env.CLAUDE_BRIDGE_TOKEN ?? ""}` }, signal: AbortSignal.timeout(10_000) });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; fiveHour?: UsageWindow | null; sevenDay?: UsageWindow | null; plan?: string | null };
    if (res.status === 404) return { available: false, reason: "Bridge trop ancien : redémarre-le pour afficher le quota." };
    if (!res.ok || !body.ok) return { available: false, reason: body.error ?? `Bridge : erreur ${res.status}` };
    return { available: true, fiveHour: body.fiveHour ?? null, sevenDay: body.sevenDay ?? null, plan: body.plan ?? null, fetchedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { available: false, reason: /fetch failed|ECONNREFUSED|timeout/i.test(message) ? "Bridge hôte injoignable : lance-le (npm run bridge) pour voir le quota." : message };
  }
}
