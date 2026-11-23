/** Types of scripts/local-db.mjs (local database server for the no-Docker mode). */
export function portInUse(port: number): Promise<boolean>;
export function startLocalDb(options: { dir: string; port: number }): Promise<{ stop: () => Promise<void> }>;
