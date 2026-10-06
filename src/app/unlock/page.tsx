import type { Metadata } from "next";
import { UnlockForm } from "./unlock-form";

export const metadata: Metadata = { title: "Unlock" };


export default async function UnlockPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="flex min-h-svh items-center justify-center bg-app-background p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">C</span>
          <span className="font-semibold">Career OS</span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">This instance is protected. Enter your access token (APP_ACCESS_TOKEN).</p>
        <UnlockForm next={next ?? "/today"} />
      </div>
    </div>
  );
}
