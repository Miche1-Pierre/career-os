import type { Actor } from "@/lib/constants";

/** Who is performing an operation (recorded in the timeline and the audit log). */
export interface Ctx {
  actor: Actor;
}

export const USER: Ctx = { actor: "USER" };
export const CLAUDE: Ctx = { actor: "CLAUDE" };
export const AI: Ctx = { actor: "AI" };
export const SYSTEM: Ctx = { actor: "SYSTEM" };
export const RULE: Ctx = { actor: "RULE" };
export const API: Ctx = { actor: "API" };

export type AppErrorCode = "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "FORBIDDEN" | "UNAVAILABLE" | "BAD_REQUEST";

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  get status(): number {
    switch (this.code) {
      case "NOT_FOUND":
        return 404;
      case "VALIDATION":
      case "BAD_REQUEST":
        return 400;
      case "CONFLICT":
        return 409;
      case "FORBIDDEN":
        return 403;
      case "UNAVAILABLE":
        return 503;
    }
  }
}

export const notFound = (what: string) => new AppError("NOT_FOUND", `${what} not found`);
export const badRequest = (message: string, details?: unknown) => new AppError("BAD_REQUEST", message, details);

export function errorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error && typeof error === "object" && "issues" in error && Array.isArray((error as { issues: unknown[] }).issues)) {
    const issues = (error as { issues: { path: (string | number)[]; message: string }[] }).issues;
    return issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
