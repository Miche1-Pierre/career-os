"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, TagInput } from "@/components/app/fields";
import { useAction } from "@/hooks/use-action";
import { createOrganizationAction, updateOrganizationAction } from "@/app/actions/network";
import type { OrgKind } from "@/lib/constants";

export interface OrganizationFormValue {
  id?: string;
  kind: OrgKind;
  name: string;
  website?: string | null;
  linkedinUrl?: string | null;
  industry?: string | null;
  size?: string | null;
  city?: string | null;
  country?: string | null;
  description?: string | null;
  tags?: string[];
}

export function OrganizationDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial: OrganizationFormValue }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [v, setV] = useState(initial);
  const institution = v.kind === "INSTITUTION";
  const set = <K extends keyof OrganizationFormValue>(k: K, value: OrganizationFormValue[K]) => setV((s) => ({ ...s, [k]: value }));
  const clean = (s?: string | null) => (s?.trim() ? s.trim() : null);
  const save = () => {
    const payload = {
      kind: v.kind,
      name: v.name.trim(),
      website: clean(v.website),
      linkedinUrl: clean(v.linkedinUrl),
      industry: clean(v.industry),
      size: clean(v.size),
      city: clean(v.city),
      country: clean(v.country),
      description: clean(v.description),
      tags: v.tags ?? [],
    };
    run(() => (v.id ? updateOrganizationAction(v.id, payload) : createOrganizationAction(payload)), {
      success: v.id ? "Saved" : `${institution ? "Institution" : "Company"} created`,
      onSuccess: (d) => {
        onOpenChange(false);
        if (!v.id) router.push(`/${institution ? "institutions" : "companies"}/${d.id}`);
      },
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{v.id ? "Edit" : "New"} {institution ? "institution" : "company"}</DialogTitle>
          <DialogDescription>{institution ? "University, school, lab or program provider." : "Employer, startup, recruiting firm…"}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Name" className="sm:col-span-2" required>
            <Input value={v.name} onChange={(e) => set("name", e.target.value)} autoFocus />
          </FormField>
          <FormField label="Website">
            <Input value={v.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="https://…" />
          </FormField>
          <FormField label="LinkedIn">
            <Input value={v.linkedinUrl ?? ""} onChange={(e) => set("linkedinUrl", e.target.value)} placeholder="https://www.linkedin.com/company/…" />
          </FormField>
          <FormField label={institution ? "Type / domain" : "Industry"}>
            <Input value={v.industry ?? ""} onChange={(e) => set("industry", e.target.value)} placeholder={institution ? "University, grande école…" : "HealthTech, SaaS…"} />
          </FormField>
          <FormField label="Size">
            <Input value={v.size ?? ""} onChange={(e) => set("size", e.target.value)} placeholder={institution ? "Students…" : "Startup, 50–200, large…"} />
          </FormField>
          <FormField label="City">
            <Input value={v.city ?? ""} onChange={(e) => set("city", e.target.value)} />
          </FormField>
          <FormField label="Country">
            <Input value={v.country ?? ""} onChange={(e) => set("country", e.target.value)} />
          </FormField>
          <FormField label="Description" className="sm:col-span-2">
            <Textarea value={v.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={3} />
          </FormField>
          <FormField label="Tags" className="sm:col-span-2">
            <TagInput value={v.tags ?? []} onChange={(t) => set("tags", t)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!v.name.trim() || pending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
