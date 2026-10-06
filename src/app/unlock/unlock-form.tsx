"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unlockAction } from "@/app/actions/settings";

export function UnlockForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(unlockAction, null as { error?: string } | null);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <Input name="token" type="password" placeholder="Access token" autoFocus required autoComplete="current-password" />
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Unlock
      </Button>
    </form>
  );
}
