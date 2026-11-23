/**
 * Microsoft Store version: Career OS does not ship Claude Code (Anthropic's program that runs the assistant). When it
 * is missing, the user can install it with one click: a window opens with Windows' own package manager (winget), which
 * shows Anthropic's terms and asks for consent before installing. Elsewhere (install command, Docker), nothing here runs.
 */
import { spawn, spawnSync } from "node:child_process";

export const CLAUDE_CODE_SETUP_URL = "https://code.claude.com/docs/en/setup";
export const WINGET_ID = "Anthropic.ClaudeCode";

export function claudeInstallOffered(): boolean {
  return process.platform === "win32" && process.env.CAREER_OS_DISTRIBUTION?.trim() === "store";
}

function wingetAvailable(): boolean {
  try {
    return spawnSync("where.exe", ["winget"], { windowsHide: true, stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

/** Opens the install window; false when winget is missing (the caller then shows Anthropic's install page). */
export function startClaudeCodeInstall(): boolean {
  if (!claudeInstallOffered() || !wingetAvailable()) return false;
  const done = "Claude Code est installé. Tu peux fermer cette fenêtre, puis cliquer sur « Vérifier » dans Career OS.";
  // The console window shows Unicode text as is (cmd writes to it with the wide API).
  const command = `winget install --id ${WINGET_ID} --exact --source winget && (echo. & echo ${done})`;
  const child = spawn("cmd.exe", ["/d", "/c", `start "Installer Claude Code" cmd.exe /d /k "${command}"`], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    windowsVerbatimArguments: true,
  });
  child.unref();
  return true;
}
