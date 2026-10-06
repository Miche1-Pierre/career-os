"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, TagInput } from "@/components/app/fields";
import { useAction } from "@/hooks/use-action";
import { createContactAction, updateContactAction } from "@/app/actions/network";
import { RELATIONSHIPS, RELATIONSHIP_LABEL, type Relationship } from "@/lib/constants";

export interface ContactFormValue {
  id?: string;
  fullName: string;
  organizationId?: string | null;
  organizationName?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  relationship?: Relationship | null;
  notes?: string | null;
  tags?: string[];
}

const NONE = "__none__";

export function ContactDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial: ContactFormValue }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [v, setV] = useState(initial);
  const set = <K extends keyof ContactFormValue>(k: K, value: ContactFormValue[K]) => setV((s) => ({ ...s, [k]: value }));
  const clean = (s?: string | null) => (s?.trim() ? s.trim() : null);
  const save = () => {
    const payload = {
      fullName: v.fullName.trim(),
      organizationId: v.organizationId ?? null,
      organizationName: v.organizationId ? null : clean(v.organizationName),
      role: clean(v.role),
      email: clean(v.email),
      phone: clean(v.phone),
      linkedinUrl: clean(v.linkedinUrl),
      relationship: v.relationship ?? null,
      notes: v.notes ?? null,
      tags: v.tags ?? [],
    };
    run(() => (v.id ? updateContactAction(v.id, payload) : createContactAction(payload)), {
      success: v.id ? "Contact saved" : "Contact created",
      onSuccess: (d) => {
        onOpenChange(false);
        if (!v.id) router.push(`/contacts/${d.id}`);
      },
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{v.id ? "Edit contact" : "New contact"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Full name" className="sm:col-span-2" required>
            <Input value={v.fullName} onChange={(e) => set("fullName", e.target.value)} autoFocus />
          </FormField>
          <FormField label="Organization" hint={v.organizationId ? undefined : "Created if it doesn't exist"}>
            <Input value={v.organizationName ?? ""} onChange={(e) => setV((s) => ({ ...s, organizationName: e.target.value, organizationId: null }))} />
          </FormField>
          <FormField label="Role">
            <Input value={v.role ?? ""} onChange={(e) => set("role", e.target.value)} />
          </FormField>
          <FormField label="Email">
            <Input type="email" value={v.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </FormField>
          <FormField label="Phone">
            <Input value={v.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </FormField>
          <FormField label="LinkedIn">
            <Input value={v.linkedinUrl ?? ""} onChange={(e) => set("linkedinUrl", e.target.value)} placeholder="https://www.linkedin.com/in/…" />
          </FormField>
          <FormField label="Relationship">
            <Select value={v.relationship ?? NONE} onValueChange={(x) => set("relationship", x === NONE ? null : (x as Relationship))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {RELATIONSHIPS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {RELATIONSHIP_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Notes" className="sm:col-span-2">
            <Textarea value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Met during…" />
          </FormField>
          <FormField label="Tags" className="sm:col-span-2">
            <TagInput value={v.tags ?? []} onChange={(t) => set("tags", t)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!v.fullName.trim() || pending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
