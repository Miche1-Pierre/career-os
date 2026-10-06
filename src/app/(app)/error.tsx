"use client";

import { useEffect } from "react";
import { AlertTriangle, Database, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const database = /ECONNREFUSED|database|postgres|connect|relation .* does not exist/i.test(error.message);
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-20 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">{database ? <Database /> : <AlertTriangle />}</div>
      <div className="space-y-1">
        <h1 className="heading-xl text-foreground">{database ? "Database unavailable" : "Something went wrong"}</h1>
        <p className="text-sm text-muted-foreground">
          {database
            ? "Career OS cannot reach PostgreSQL. If you run Docker, check that the stack is up: docker compose ps (then docker compose up -d)."
            : "This page failed to load. Your data is safe — try again."}
        </p>
        {error.digest && <p className="font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>}
      </div>
      <Button onClick={reset}>
        <RotateCcw /> Retry
      </Button>
    </div>
  );
}
