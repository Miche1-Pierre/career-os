"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Mail, PackageCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/app/fields";
import { SectionHeader } from "@/components/app/sparkle";
import { useAction } from "@/hooks/use-action";
import { applyWithKitAction, updateKitAction } from "@/app/actions/opportunities";
import { KIT_CHANNEL_LABEL, KIT_CHANNELS, kitMissing, parseKit, type KitChannel } from "@/lib/kit";
import type { OpportunityDetail } from "@/server/services/opportunities";
import type { VersionOption } from "./detail-documents";
import { EmailDialog } from "./email-dialog";

const NONE = "__none__";

/** Application kit: CV version, letter, channel and link, message, then "J'ai postulé". */
export function DetailKit({ opp, versions }: { opp: OpportunityDetail; versions: VersionOption[] }) {
  const { run, pending } = useAction();
  const kit = parseKit(opp.details) ?? {};
  const [url, setUrl] = useState(kit.applyUrl ?? opp.url ?? "");
  const [emailOpen, setEmailOpen] = useState(false);
  const cvs = versions.filter((v) => v.kind === "CV");
  const letters = versions.filter((v) => v.kind === "COVER_LETTER");
  const missing = kitMissing({ ...kit, applyUrl: kit.applyUrl ?? (opp.url || null) });
  const save = (patch: Record<string, unknown>) => run(() => updateKitAction(opp.id, patch));
  const label = (v: VersionOption) => `${v.documentName} · v${v.version}${v.label ? ` · ${v.label}` : ""}`;

  return (
    <section className="space-y-3">
      <SectionHeader title="Kit de candidature" icon={PackageCheck} description={missing.length ? `Il manque : ${missing.join(", ")}` : "Prêt à envoyer"} />
      <div className="@container surface space-y-3 px-4 py-4">
        <div className="grid gap-3 @xl:grid-cols-2">
          <FormField label="CV" hint={cvs.length ? undefined : "Aucun CV dans Documents"}>
            <Select value={kit.cvVersionId ?? NONE} onValueChange={(v) => save({ cvVersionId: v === NONE ? null : v })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir la version" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Aucun</SelectItem>
                {cvs.map((v) => (
                  <SelectItem key={v.versionId} value={v.versionId}>
                    {label(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Lettre">
            <Select value={kit.letterVersionId ?? NONE} onValueChange={(v) => save({ letterVersionId: v === NONE ? null : v })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Aucune" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Aucune</SelectItem>
                {letters.map((v) => (
                  <SelectItem key={v.versionId} value={v.versionId}>
                    {label(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Canal">
            <Select value={kit.channel ?? NONE} onValueChange={(v) => save({ channel: v === NONE ? null : (v as KitChannel) })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Non choisi</SelectItem>
                {KIT_CHANNELS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {KIT_CHANNEL_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Lien pour postuler">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => url !== (kit.applyUrl ?? opp.url ?? "") && save({ applyUrl: url.trim() || null })} placeholder="https://…" />
          </FormField>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-separator pt-3">
          <Button size="sm" variant="ghost" asChild>
            <Link href="/cv">Générer un CV</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEmailOpen(true)}>
            <Mail /> Préparer le message
          </Button>
          {url && /^https?:\/\//.test(url) && (
            <Button size="sm" variant="outline" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Ouvrir le lien
              </a>
            </Button>
          )}
          <Button size="sm" className="ml-auto" disabled={pending} onClick={() => run(() => applyWithKitAction(opp.id), { success: (d) => (d.changed ? `${d.from} → ${d.to}` : "Déjà marquée comme postulée") })}>
            <Send /> J’ai postulé
          </Button>
        </div>
      </div>
      {emailOpen && <EmailDialog opportunityId={opp.id} open={emailOpen} onOpenChange={setEmailOpen} />}
    </section>
  );
}
