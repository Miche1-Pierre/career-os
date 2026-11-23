/**
 * Forms shown inside the chat (spec: « tu fais pop le form dans le chat »). Claude writes a ```careeros-form block
 * holding JSON; the chat turns it into the real form, pre-filled. Pure and client-safe.
 */
import type { SearchFormInitial } from "@/components/discovery/search-form";

/** A form shown inside the chat: by a quick action, or by Claude in a ```careeros-form block. */
export interface ChatFormSpec extends SearchFormInitial {
  form: "search";
}

/** Parses the JSON of a ```careeros-form block; null while it streams or when it is not a known form. */
export function parseChatForm(raw: string): ChatFormSpec | null {
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (v.form !== "search" || (v.domain !== "JOBS" && v.domain !== "HOUSING")) return null;
    return {
      form: "search",
      domain: v.domain,
      criteria: v.criteria && typeof v.criteria === "object" ? (v.criteria as Record<string, unknown>) : {},
      moveId: typeof v.moveId === "string" ? v.moveId : null,
      useAgent: typeof v.useAgent === "boolean" ? v.useAgent : undefined,
    };
  } catch {
    return null;
  }
}

/** Stable key of a form (same JSON = same form, also after reloading the conversation). */
export function formKey(spec: ChatFormSpec) {
  const text = JSON.stringify(spec);
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return `f${(h >>> 0).toString(36)}`;
}

