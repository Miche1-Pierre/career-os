/**
 * Background services started once per server process (see src/instrumentation.ts):
 *  - resume analyses interrupted by a restart
 *  - periodic rules evaluation (deadlines, missing documents, ghosting, stale interviews)
 *  - automatic JSON backups to ./backups
 */
const g = globalThis as unknown as { __careerOsBackground?: boolean };

export function startBackgroundServices() {
  if (g.__careerOsBackground) return;
  g.__careerOsBackground = true;
  const tick = async (first = false) => {
    try {
      if (first) {
        const { recoverQueue } = await import("./jobs");
        await recoverQueue();
      }
      const { evaluateRulesThrottled } = await import("./services/rules");
      await evaluateRulesThrottled(first ? 0 : 60_000);
      const { autoBackupIfDue } = await import("./services/data-transfer");
      const backup = await autoBackupIfDue();
      if (backup) console.log(`[backup] automatic backup written: ${backup.name}`);
    } catch (error) {
      // The database may not be ready yet; the next tick will retry.
      console.error("[background] tick failed:", error instanceof Error ? error.message : error);
    }
  };
  setTimeout(() => void tick(true), 4_000);
  setInterval(() => void tick(false), 15 * 60_000).unref?.();
}
