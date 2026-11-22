import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { AppError, errorMessage } from "./context";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string; code?: string };

/** Runs a mutation for a Server Action: returns a serializable result and refreshes the UI. */
export async function runAction<T>(fn: () => Promise<T>, options: { revalidate?: boolean } = {}): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    if (options.revalidate !== false) revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (error) {
    unstable_rethrow(error);
    if (!(error instanceof AppError)) console.error("[action]", error);
    return { ok: false, error: errorMessage(error), code: error instanceof AppError ? error.code : undefined };
  }
}
