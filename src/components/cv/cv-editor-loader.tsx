"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { CvEntryView } from "@/lib/cv";
import { loadCvFonts } from "./design-view";
import type { EditorVariant } from "./cv-editor";

// The editor measures text in the browser: never rendered on the server.
const CvEditor = dynamic(() => import("./cv-editor").then((m) => m.CvEditor), { ssr: false });

/** Waits for the CV fonts (text is measured with them), then opens the editor. */
export function CvEditorLoader(props: { variant: EditorVariant; entries: CvEntryView[]; opportunities: { id: string; label: string }[] }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadCvFonts().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  if (!ready)
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-muted-background text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Ouverture de l’éditeur…
      </div>
    );
  return <CvEditor {...props} />;
}
