"use client";

import { useCallback, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/action-utils";

/** Calls a Server Action inside a transition, with toasts for success / errors. */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const run = useCallback(
    <T>(action: () => Promise<ActionResult<T>>, options: { success?: string | ((data: T) => string); onSuccess?: (data: T) => void; onError?: (error: string) => void } = {}) =>
      new Promise<ActionResult<T>>((resolve) => {
        startTransition(async () => {
          try {
            const result = await action();
            if (result.ok) {
              const message = typeof options.success === "function" ? options.success(result.data) : options.success;
              if (message) toast.success(message);
              options.onSuccess?.(result.data);
            } else {
              toast.error(result.error);
              options.onError?.(result.error);
            }
            resolve(result);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Something went wrong";
            toast.error(message);
            options.onError?.(message);
            resolve({ ok: false, error: message });
          }
        });
      }),
    [],
  );
  return { run, pending };
}
