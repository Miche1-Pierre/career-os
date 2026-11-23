/**
 * Background services started once per server process (see src/instrumentation.ts):
 *  - resume analyses interrupted by a restart
 *  - periodic rules evaluation (deadlines, missing documents, ghosting, stale interviews)
 *  - automatic JSON backups to ./backups
 *  - scheduled searches of the discovery engine (one at a time, never blocking the tick)
 */
const g = globalThis as unknown as { __careerOsBackground?: boolean; __careerOsDiscoveryTick?: boolean };

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
      if (!g.__careerOsDiscoveryTick) {
        g.__careerOsDiscoveryTick = true;
        void import("./services/discovery")
          .then(({ runDueSearches }) => runDueSearches())
          .then((run) => run && console.log(`[discovery] scheduled search done: ${run.resultsNew} new`))
          .catch((error) => console.error("[discovery] scheduled search failed:", error instanceof Error ? error.message : error))
          .finally(() => {
            g.__careerOsDiscoveryTick = false;
          });
      }
    } catch (error) {
      // The database may not be ready yet; the next tick will retry.
      console.error("[background] tick failed:", error instanceof Error ? error.message : error);
    }
  };
  setTimeout(() => void tick(true), 4_000);
  setInterval(() => void tick(false), 15 * 60_000).unref?.();
}
