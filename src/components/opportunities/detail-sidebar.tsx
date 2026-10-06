"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, GraduationCap, Link2, Mail, Phone, Plus, Tags, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityCombobox, type ComboOption } from "@/components/app/entity-combobox";
import { FormField, TagInput } from "@/components/app/fields";
import { TagList } from "@/components/app/badges";
import { useAction } from "@/hooks/use-action";
import { addContactAction, unlinkContactAction, updateOpportunityAction } from "@/app/actions/opportunities";
import { RELATIONSHIPS, RELATIONSHIP_LABEL, type Relationship } from "@/lib/constants";
import { initials } from "@/lib/text";
import type { OpportunityDetail } from "@/server/services/opportunities";

export function DetailSidebar({ opp, contactOptions }: { opp: OpportunityDetail; contactOptions: ComboOption[] }) {
  const { run } = useAction();
  const [addOpen, setAddOpen] = useState(false);
  const [editTags, setEditTags] = useState(false);
  const [tags, setTags] = useState(opp.tags);
  const org = opp.organization;
  return (
    <aside className="space-y-4">
      {org && (
        <div className="surface p-4">
          <div className="mb-2 text-xs font-medium text-muted-foreground">{org.kind === "INSTITUTION" ? "Institution" : "Company"}</div>
          <Link href={`/${org.kind === "INSTITUTION" ? "institutions" : "companies"}/${org.id}`} className="flex items-center gap-2 font-medium hover:underline">
            {org.kind === "INSTITUTION" ? <GraduationCap className="size-4 text-muted-foreground" /> : <Building2 className="size-4 text-muted-foreground" />}
            {org.name}
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">{[org.industry, org.city, org.country].filter(Boolean).join(" · ") || "No details yet"}</p>
          {org.website && (
            <a href={org.website} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-xs text-primary hover:underline">
              {org.website.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      )}

      <div className="surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Contacts</span>
          <Button size="icon-xs" variant="ghost" onClick={() => setAddOpen(true)} aria-label="Add contact">
            <UserPlus />
          </Button>
        </div>
        {opp.contacts.length === 0 ? (
          <button type="button" onClick={() => setAddOpen(true)} className="text-sm text-muted-foreground hover:text-foreground">
            + Add the recruiter or program contact
          </button>
        ) : (
          <ul className="space-y-3">
            {opp.contacts.map((c) => (
              <li key={c.id} className="group flex items-start gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{initials(c.fullName)}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/contacts/${c.id}`} className="block truncate text-sm font-medium hover:underline">
                    {c.fullName}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">{c.opportunityRole ?? c.role ?? (c.relationship ? RELATIONSHIP_LABEL[c.relationship] : "")}</p>
                  <div className="mt-1 flex gap-1">
                    {c.email && (
                      <Button size="icon-xs" variant="ghost" asChild>
                        <a href={`mailto:${c.email}`} aria-label={`Email ${c.fullName}`}>
                          <Mail />
                        </a>
                      </Button>
                    )}
                    {c.phone && (
                      <Button size="icon-xs" variant="ghost" asChild>
                        <a href={`tel:${c.phone}`} aria-label={`Call ${c.fullName}`}>
                          <Phone />
                        </a>
                      </Button>
                    )}
                    {c.linkedinUrl && (
                      <Button size="icon-xs" variant="ghost" asChild>
                        <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                          <Link2 />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
                <button type="button" className="opacity-0 group-hover:opacity-100" onClick={() => run(() => unlinkContactAction(opp.id, c.id), { success: "Contact unlinked" })} aria-label="Unlink contact">
                  <X className="size-3.5 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Tags className="size-3.5" /> Tags
          </span>
          <Button size="xs" variant="ghost" onClick={() => setEditTags((v) => !v)}>
            {editTags ? "Done" : "Edit"}
          </Button>
        </div>
        {editTags ? (
          <div className="space-y-2">
            <TagInput value={tags} onChange={setTags} />
            <Button size="xs" onClick={() => run(() => updateOpportunityAction(opp.id, { tags }), { success: "Tags saved", onSuccess: () => setEditTags(false) })}>
              Save tags
            </Button>
          </div>
        ) : opp.tags.length ? (
          <TagList tags={opp.tags} max={20} />
        ) : (
          <p className="text-sm text-muted-foreground">No tag</p>
        )}
      </div>
      {addOpen && <AddContactDialog opportunityId={opp.id} contactOptions={contactOptions} onClose={() => setAddOpen(false)} />}
    </aside>
  );
}

function AddContactDialog({ opportunityId, contactOptions, onClose }: { opportunityId: string; contactOptions: ComboOption[]; onClose: () => void }) {
  const { run, pending } = useAction();
  const [existing, setExisting] = useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [linkedinUrl, setLinkedin] = useState("");
  const [relationship, setRelationship] = useState<Relationship>("RECRUITER");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a contact</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="new">
          <TabsList>
            <TabsTrigger value="new">
              <Plus /> New
            </TabsTrigger>
            <TabsTrigger value="existing">Existing</TabsTrigger>
          </TabsList>
          <TabsContent value="new" className="space-y-3 pt-2">
            <FormField label="Full name">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
            </FormField>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="Role">
                <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Talent acquisition" />
              </FormField>
              <FormField label="Relationship">
                <Select value={relationship} onValueChange={(v) => setRelationship(v as Relationship)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIPS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {RELATIONSHIP_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            <FormField label="Email">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </FormField>
            <FormField label="LinkedIn">
              <Input value={linkedinUrl} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://www.linkedin.com/in/…" />
            </FormField>
            <DialogFooter>
              <Button
                disabled={!fullName.trim() || pending}
                onClick={() =>
                  run(() => addContactAction(opportunityId, { fullName: fullName.trim(), role: role || null, opportunityRole: role || null, email: email || null, linkedinUrl: linkedinUrl || null, relationship }), {
                    success: "Contact added",
                    onSuccess: onClose,
                  })
                }
              >
                Add
              </Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="existing" className="space-y-3 pt-2">
            <EntityCombobox options={contactOptions} value={existing} onChange={setExisting} placeholder="Choose a contact" allowCreate={false} />
            <DialogFooter>
              <Button disabled={!existing.id || pending} onClick={() => existing.id && run(() => addContactAction(opportunityId, { contactId: existing.id }), { success: "Contact linked", onSuccess: onClose })}>
                Link
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
