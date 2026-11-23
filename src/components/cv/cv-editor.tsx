"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUp,
  ArrowUpToLine,
  Bold,
  CaseUpper,
  Check,
  Copy,
  Download,
  Eye,
  Heading1,
  Heading2,
  Italic,
  List,
  Loader2,
  Lock,
  Minus,
  Plus,
  Redo2,
  RectangleHorizontal,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { editCvWithClaudeAction, exportVariantAction, renameVariantAction, saveDesignAction } from "@/app/actions/cv";
import {
  FONT_LABEL,
  FONTS,
  PAGE_H,
  PAGE_W,
  contentBottom,
  cvDesignSchema,
  findElement,
  heightOf,
  layoutToFit,
  newId,
  pushBelow,
  snapBox,
  snapTargets,
  snapValue,
  textStyleSchema,
  updateElements,
  type Box,
  type CvDesign,
  type DesignElement,
  type Guide,
  type TextElement,
  type TextStyle,
} from "@/lib/cv-design";
import { CV_SECTION_LABEL, CV_SECTIONS, type CvBlock, type CvEntryView, type CvHeader, type CvLang, type CvStyle } from "@/lib/cv";
import { cn } from "@/lib/utils";
import { ElementView, TextContent, createDomMeasure, fillTextBox, textCss } from "./design-view";

export interface EditorVariant {
  id: string;
  name: string;
  lang: CvLang;
  design: CvDesign | null;
  header: CvHeader;
  sections: CvBlock[];
  style: CvStyle;
}

type DragState =
  | { kind: "move"; page: number; startX: number; startY: number; from: CvDesign; ids: string[]; moved: boolean }
  | { kind: "resize"; page: number; handle: string; startX: number; startY: number; from: CvDesign; id: string; moved: boolean }
  | { kind: "marquee"; page: number; x0: number; y0: number; rect: DOMRect; moved: boolean };

interface Pending {
  id: string;
  oldBottom: number;
  oldH: number;
}

const HISTORY = 100;
const round = (n: number) => Math.round(n * 10) / 10;
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Converts the inline editor's DOM back to markup (**bold**, *italic*, [label](url), one line per paragraph). */
function serialize(root: HTMLElement): string {
  const walk = (node: Node, bold: boolean, italic: boolean): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? "").replace(/ /g, " ");
      if (!t) return "";
      if (bold) return `**${t}**`;
      if (italic) return `*${t}*`;
      return t;
    }
    if (!(node instanceof HTMLElement)) return "";
    if (node.tagName === "BR") return "";
    const tag = node.tagName;
    const href = node.getAttribute("data-href") ?? (tag === "A" ? node.getAttribute("href") : null);
    if (href) return `[${node.textContent ?? ""}](${href})`;
    const fw = node.style.fontWeight;
    const b = bold || tag === "B" || tag === "STRONG" || fw === "bold" || Number(fw) >= 600;
    const i = italic || tag === "I" || tag === "EM" || node.style.fontStyle === "italic";
    return [...node.childNodes].map((c) => walk(c, b, i)).join("");
  };
  const lines: string[] = [];
  let inline = "";
  for (const child of [...root.childNodes]) {
    if (child instanceof HTMLElement && (child.tagName === "DIV" || child.tagName === "P")) {
      if (inline) {
        lines.push(inline);
        inline = "";
      }
      lines.push(walk(child, false, false));
    } else inline += walk(child, false, false);
  }
  if (inline) lines.push(inline);
  // Merge "**a****b**" produced by adjacent bold nodes.
  return lines
    .map((l) => l.replace(/\*\*\*\*/g, "").replace(/(?<!\*)\*\*(?!\*)/g, "**"))
    .join("\n")
    .replace(/\n+$/, "");
}

export function CvEditor({ variant, entries, opportunities }: { variant: EditorVariant; entries: CvEntryView[]; opportunities: { id: string; label: string }[] }) {
  const firstSave = useRef(!variant.design);
  const [design, setDesignState] = useState<CvDesign>(() => {
    if (variant.design) {
      const parsed = cvDesignSchema.safeParse(variant.design);
      if (parsed.success) return parsed.data;
    }
    // Never opened in the editor: lay the structured CV out like its PDF (heights measured by the browser).
    const { measure, dispose } = createDomMeasure();
    try {
      return layoutToFit({ header: variant.header, sections: variant.sections, entries: new Map(entries.map((e) => [e.id, e])), style: variant.style }, measure);
    } finally {
      dispose();
    }
  });
  const designRef = useRef(design);
  const setDesign = useCallback((next: CvDesign | ((d: CvDesign) => CvDesign)) => {
    setDesignState((cur) => {
      const value = typeof next === "function" ? next(cur) : next;
      designRef.current = value;
      return value;
    });
  }, []);
  const history = useRef<{ past: CvDesign[]; future: CvDesign[] }>({ past: [], future: [] });
  const [hist, setHist] = useState({ past: 0, future: 0 });
  const syncHistory = useCallback(() => setHist({ past: history.current.past.length, future: history.current.future.length }), []);
  const [selection, setSelection] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.2);
  const [guides, setGuides] = useState<{ page: number; guides: Guide[] } | null>(null);
  const [marquee, setMarquee] = useState<{ page: number; box: Box } | null>(null);
  const [pushDown, setPushDown] = useState(true);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "error">(variant.design ? "saved" : "dirty");
  const [name, setName] = useState(variant.name);
  const [preview, setPreview] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const drag = useRef<DragState | null>(null);
  const pending = useRef<Pending[]>([]);
  const clipboard = useRef<DesignElement[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromise = useRef<Promise<void> | null>(null);
  const editRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(zoom);
  useLayoutEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // ---------------------------------------------------------------------------
  // Saving (debounced autosave) and history
  // ---------------------------------------------------------------------------

  const save = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    setSaveState("saving");
    const r = await saveDesignAction(variant.id, designRef.current);
    setSaveState(r.ok ? "saved" : "error");
    if (!r.ok) toast.error(`Enregistrement impossible : ${r.error}`);
  }, [variant.id]);

  const scheduleSave = useCallback(() => {
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      savePromise.current = save();
    }, 800);
  }, [save]);

  const flush = useCallback(async () => {
    if (saveTimer.current) await save();
    else if (savePromise.current) await savePromise.current;
  }, [save]);

  useEffect(() => {
    if (!firstSave.current) return;
    firstSave.current = false;
    const t = setTimeout(() => void save(), 300);
    return () => clearTimeout(t);
  }, [save]);

  // Save on leave.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (saveTimer.current) {
        void save();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [save]);

  /** Records `before` in the history and applies `next`. */
  const commit = useCallback(
    (next: CvDesign, before: CvDesign = designRef.current) => {
      const h = history.current;
      h.past.push(before);
      if (h.past.length > HISTORY) h.past.shift();
      h.future = [];
      setDesign(next);
      syncHistory();
      scheduleSave();
    },
    [scheduleSave, setDesign, syncHistory],
  );

  const undo = useCallback(() => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(designRef.current);
    setDesign(prev);
    syncHistory();
    scheduleSave();
  }, [scheduleSave, setDesign, syncHistory]);

  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(designRef.current);
    setDesign(next);
    syncHistory();
    scheduleSave();
  }, [scheduleSave, setDesign, syncHistory]);

  // ---------------------------------------------------------------------------
  // Measuring text heights; content below follows a box that grows
  // ---------------------------------------------------------------------------

  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  useLayoutEffect(() => {
    const heights = new Map<string, number>();
    for (const pageEl of pageRefs.current) {
      pageEl?.querySelectorAll<HTMLElement>("[data-text-id]").forEach((node) => heights.set(node.dataset.textId!, Math.round(node.offsetHeight * 100) / 100));
    }
    const cur = designRef.current;
    let changed = false;
    let next: CvDesign = {
      ...cur,
      pages: cur.pages.map((pg) => ({
        ...pg,
        elements: pg.elements.map((el) => {
          if (el.type !== "text") return el;
          const h = heights.get(el.id);
          if (h === undefined || (el.h !== undefined && Math.abs(el.h - h) < 0.3)) return el;
          changed = true;
          return { ...el, h };
        }),
      })),
    };
    if (pending.current.length) {
      const todo = [...pending.current].sort((a, b) => b.oldBottom - a.oldBottom);
      pending.current = [];
      if (pushDown)
        for (const p of todo) {
          const h = heights.get(p.id);
          if (h === undefined) continue;
          const moved = pushBelow(next, p.id, p.oldBottom, h - p.oldH);
          if (moved !== next) {
            next = moved;
            changed = true;
          }
        }
    }
    // Heights are measurements, not edits: no history entry (the edit that caused them already has one).
    if (changed) setDesign(next);
  });

  /** Remembers the text boxes whose content changes, so the content below can follow their new height. */
  const watchGrowth = useCallback((before: CvDesign, ids: string[]) => {
    for (const id of ids) {
      const at = findElement(before, id);
      if (at && at.el.type === "text") pending.current.push({ id, oldBottom: at.el.y + heightOf(at.el), oldH: heightOf(at.el) });
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------

  const selected = useMemo(() => selection.map((id) => findElement(design, id)).filter((x): x is NonNullable<typeof x> => !!x), [design, selection]);
  const selectedTexts = selected.map((s) => s.el).filter((e): e is TextElement => e.type === "text");
  const onlyTexts = selected.length > 0 && selectedTexts.length === selected.length;

  const pagePoint = (page: number, clientX: number, clientY: number) => {
    const rect = pageRefs.current[page]?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left) / zoomRef.current, y: (clientY - rect.top) / zoomRef.current };
  };

  // ---------------------------------------------------------------------------
  // Pointer: move, resize, marquee
  // ---------------------------------------------------------------------------

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const z = zoomRef.current;
      if (d.kind === "marquee") {
        const x1 = (e.clientX - d.rect.left) / z;
        const y1 = (e.clientY - d.rect.top) / z;
        if (!d.moved && Math.abs(x1 - d.x0) + Math.abs(y1 - d.y0) < 3) return;
        d.moved = true;
        setMarquee({ page: d.page, box: { x: Math.min(d.x0, x1), y: Math.min(d.y0, y1), w: Math.abs(x1 - d.x0), h: Math.abs(y1 - d.y0) } });
        return;
      }
      let dx = (e.clientX - d.startX) / z;
      let dy = (e.clientY - d.startY) / z;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 2 / z) return;
      d.moved = true;
      const threshold = 6 / z;
      const page = d.from.pages[d.page];
      if (d.kind === "move") {
        const ids = new Set(d.ids);
        const moving = page.elements.filter((el) => ids.has(el.id) && !el.locked);
        if (!moving.length) return;
        const minX = Math.min(...moving.map((el) => el.x));
        const minY = Math.min(...moving.map((el) => el.y));
        const maxX = Math.max(...moving.map((el) => el.x + el.w));
        const maxY = Math.max(...moving.map((el) => el.y + heightOf(el)));
        const snapped = e.altKey ? { dx: 0, dy: 0, guides: [] } : snapBox({ x: minX + dx, y: minY + dy, w: maxX - minX, h: maxY - minY }, snapTargets(page, ids), threshold);
        dx += snapped.dx;
        dy += snapped.dy;
        setGuides({ page: d.page, guides: snapped.guides });
        const movingIds = new Set(moving.map((m) => m.id));
        setDesign(updateElements(d.from, movingIds, (el) => ({ ...el, x: round(el.x + dx), y: round(el.y + dy) })));
      } else {
        const at = findElement(d.from, d.id);
        if (!at) return;
        const el = at.el;
        const t = snapTargets(page, new Set([d.id]));
        const g: Guide[] = [];
        let { x, y, w } = el;
        let h = heightOf(el);
        if (d.handle.includes("e")) {
          const s = e.altKey ? { value: el.x + el.w + dx, guide: null } : snapValue(el.x + el.w + dx, t.xs, threshold);
          w = Math.max(12, s.value - el.x);
          if (s.guide !== null) g.push({ axis: "x", at: s.guide });
        }
        if (d.handle.includes("w")) {
          const s = e.altKey ? { value: el.x + dx, guide: null } : snapValue(el.x + dx, t.xs, threshold);
          x = Math.min(s.value, el.x + el.w - 12);
          w = el.x + el.w - x;
          if (s.guide !== null) g.push({ axis: "x", at: s.guide });
        }
        if (el.type === "rect" && d.handle.includes("s")) {
          const s = e.altKey ? { value: el.y + h + dy, guide: null } : snapValue(el.y + h + dy, t.ys, threshold);
          h = Math.max(2, s.value - el.y);
          if (s.guide !== null) g.push({ axis: "y", at: s.guide });
        }
        if (el.type === "rect" && d.handle.includes("n")) {
          const s = e.altKey ? { value: el.y + dy, guide: null } : snapValue(el.y + dy, t.ys, threshold);
          y = Math.min(s.value, el.y + h - 2);
          h = el.y + h - y;
          if (s.guide !== null) g.push({ axis: "y", at: s.guide });
        }
        setGuides({ page: d.page, guides: g });
        setDesign(updateElements(d.from, [d.id], (cur) => (cur.type === "rect" ? { ...cur, x: round(x), y: round(y), w: round(w), h: round(h) } : { ...cur, x: round(x), w: round(w) })));
      }
    },
    [setDesign],
  );

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    setGuides(null);
    if (!d) return;
    if (d.kind === "marquee") {
      setMarquee((m) => {
        if (m && d.moved) {
          const page = designRef.current.pages[m.page];
          const hit = page.elements.filter((el) => el.x < m.box.x + m.box.w && el.x + el.w > m.box.x && el.y < m.box.y + m.box.h && el.y + heightOf(el) > m.box.y);
          setSelection(hit.map((el) => el.id));
        } else setSelection([]);
        return null;
      });
      return;
    }
    if (d.moved) {
      const h = history.current;
      h.past.push(d.from);
      if (h.past.length > HISTORY) h.past.shift();
      h.future = [];
      syncHistory();
      scheduleSave();
    }
  }, [scheduleSave, syncHistory]);

  const startDrag = (state: DragState) => {
    drag.current = state;
    const move = (e: PointerEvent) => onPointerMove(e);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onPointerUp();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onElementPointerDown = (e: React.PointerEvent, page: number, el: DesignElement) => {
    if (editingId === el.id || e.button !== 0) return;
    e.stopPropagation();
    if (editingId) setEditingId(null);
    let ids = selection;
    if (e.shiftKey) ids = selection.includes(el.id) ? selection.filter((x) => x !== el.id) : [...selection, el.id];
    else if (!selection.includes(el.id)) ids = [el.id];
    setSelection(ids);
    if (!e.shiftKey && !el.locked) startDrag({ kind: "move", page, startX: e.clientX, startY: e.clientY, from: designRef.current, ids: ids.filter((id) => findElement(designRef.current, id)?.page === page), moved: false });
  };

  const onHandlePointerDown = (e: React.PointerEvent, page: number, id: string, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    startDrag({ kind: "resize", page, handle, startX: e.clientX, startY: e.clientY, from: designRef.current, id, moved: false });
  };

  const onPagePointerDown = (e: React.PointerEvent, page: number) => {
    if (e.button !== 0) return;
    if (editingId) {
      editRef.current?.blur();
      return;
    }
    const rect = pageRefs.current[page]!.getBoundingClientRect();
    const p = pagePoint(page, e.clientX, e.clientY);
    startDrag({ kind: "marquee", page, x0: p.x, y0: p.y, rect, moved: false });
  };

  // ---------------------------------------------------------------------------
  // Text editing (double click)
  // ---------------------------------------------------------------------------

  const startEditing = (id: string) => {
    const at = findElement(designRef.current, id);
    if (!at || at.el.type !== "text" || at.el.locked) return;
    setSelection([id]);
    setEditingId(id);
  };

  const editorRef = useCallback(
    (node: HTMLDivElement | null) => {
      editRef.current = node;
      if (!node || !editingId) return;
      const at = findElement(designRef.current, editingId);
      if (!at || at.el.type !== "text") return;
      fillTextBox(node, at.el);
      node.focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    },
    [editingId],
  );

  const finishEditing = () => {
    const node = editRef.current;
    const id = editingId;
    setEditingId(null);
    if (!node || !id) return;
    const at = findElement(designRef.current, id);
    if (!at || at.el.type !== "text") return;
    const text = serialize(node);
    if (text === at.el.text) return;
    const before = designRef.current;
    watchGrowth(before, [id]);
    commit(updateElements(before, [id], (el) => ({ ...el, text }) as DesignElement), before);
  };

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  const styleTexts = (patch: Partial<TextStyle>) => {
    const ids = selectedTexts.map((t) => t.id);
    if (!ids.length) return;
    const before = designRef.current;
    watchGrowth(before, ids);
    commit(updateElements(before, ids, (el) => (el.type === "text" ? { ...el, style: textStyleSchema.parse({ ...el.style, ...patch }) } : el)), before);
  };

  const patchSelected = (fn: (el: DesignElement) => DesignElement) => {
    if (!selection.length) return;
    const before = designRef.current;
    watchGrowth(before, selectedTexts.map((t) => t.id));
    commit(updateElements(before, selection, fn), before);
  };

  const removeSelected = () => {
    const ids = new Set(selected.filter((s) => !s.el.locked).map((s) => s.el.id));
    if (!ids.size) return;
    commit({ ...designRef.current, pages: designRef.current.pages.map((pg) => ({ ...pg, elements: pg.elements.filter((el) => !ids.has(el.id)) })) });
    setSelection([]);
  };

  const insert = (page: number, els: DesignElement[]) => {
    commit({ ...designRef.current, pages: designRef.current.pages.map((pg, i) => (i === page ? { ...pg, elements: [...pg.elements, ...els] } : pg)) });
    setSelection(els.map((e) => e.id));
  };

  const duplicate = (els: DesignElement[] = selected.map((s) => s.el)) => {
    if (!els.length) return;
    const page = findElement(designRef.current, els[0].id)?.page ?? 0;
    insert(
      page,
      els.map((el) => ({ ...el, id: newId(el.type[0]), x: round(el.x + 10), y: round(el.y + 10), locked: false })),
    );
  };

  const reorder = (direction: "front" | "back") => {
    const ids = new Set(selection);
    commit({
      ...designRef.current,
      pages: designRef.current.pages.map((pg) => {
        const moving = pg.elements.filter((el) => ids.has(el.id));
        const rest = pg.elements.filter((el) => !ids.has(el.id));
        return { ...pg, elements: direction === "front" ? [...rest, ...moving] : [...moving, ...rest] };
      }),
    });
  };

  const align = (how: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") => {
    const els = selected.map((s) => s.el);
    if (!els.length) return;
    const single = els.length === 1;
    const box = single
      ? { x: 0, y: 0, w: PAGE_W, h: PAGE_H }
      : { x: Math.min(...els.map((e) => e.x)), y: Math.min(...els.map((e) => e.y)), w: Math.max(...els.map((e) => e.x + e.w)) - Math.min(...els.map((e) => e.x)), h: Math.max(...els.map((e) => e.y + heightOf(e))) - Math.min(...els.map((e) => e.y)) };
    patchSelected((el) => {
      if (el.locked) return el;
      const h = heightOf(el);
      if (how === "left") return { ...el, x: round(box.x) };
      if (how === "hcenter") return { ...el, x: round(box.x + (box.w - el.w) / 2) };
      if (how === "right") return { ...el, x: round(box.x + box.w - el.w) };
      if (how === "top") return { ...el, y: round(box.y) };
      if (how === "vcenter") return { ...el, y: round(box.y + (box.h - h) / 2) };
      return { ...el, y: round(box.y + box.h - h) };
    });
  };

  const distribute = (axis: "x" | "y") => {
    const els = [...selected.map((s) => s.el)].sort((a, b) => (axis === "x" ? a.x - b.x : a.y - b.y));
    if (els.length < 3) return;
    const size = (e: DesignElement) => (axis === "x" ? e.w : heightOf(e));
    const start = axis === "x" ? els[0].x : els[0].y;
    const end = axis === "x" ? els[els.length - 1].x + els[els.length - 1].w : els[els.length - 1].y + heightOf(els[els.length - 1]);
    const gap = (end - start - els.reduce((s, e) => s + size(e), 0)) / (els.length - 1);
    let cursor = start;
    const pos = new Map<string, number>();
    for (const e of els) {
      pos.set(e.id, round(cursor));
      cursor += size(e) + gap;
    }
    patchSelected((el) => (pos.has(el.id) ? (axis === "x" ? { ...el, x: pos.get(el.id)! } : { ...el, y: pos.get(el.id)! }) : el));
  };

  /** Where new content goes: under the lowest element of the last page. */
  const insertionPoint = () => {
    const page = designRef.current.pages.length - 1;
    const bottom = contentBottom(designRef.current.pages[page]);
    return { page, y: Math.min(PAGE_H - 60, bottom ? bottom + 8 : 40) };
  };

  const addText = (kind: "title" | "subtitle" | "body" | "list") => {
    const { page, y } = insertionPoint();
    const presets: Record<typeof kind, { text: string; style: Partial<TextStyle>; list?: TextElement["list"] }> = {
      title: { text: "| TITRE", style: { size: 11, bold: true } },
      subtitle: { text: "Intitulé du poste, Entreprise", style: { bold: true, italic: true } },
      body: { text: "Ton texte", style: { align: "justify" } },
      list: { text: "Première réalisation\nDeuxième réalisation", style: { align: "justify" }, list: "dash" },
    };
    const p = presets[kind];
    insert(page, [{ type: "text", id: newId("t"), x: 44, y, w: PAGE_W - 88, text: p.text, list: p.list ?? "none", style: textStyleSchema.parse({ size: 9.2, ...p.style }) }]);
  };

  const addShape = (kind: "line" | "rect") => {
    const { page, y } = insertionPoint();
    insert(page, [kind === "line" ? { type: "line", id: newId("l"), x: 44, y, w: PAGE_W - 88, h: 0.6, color: "#9a9a9a" } : { type: "rect", id: newId("r"), x: 44, y, w: 160, h: 60, fill: "#eef2ff", stroke: null, strokeWidth: 0, radius: 6 }]);
  };

  /** Inserts an entry of the library (experience, project, education) as title + dates + bullets. */
  const insertEntry = (entry: CvEntryView) => {
    const { page, y } = insertionPoint();
    const { measure, dispose } = createDomMeasure();
    try {
      const W = PAGE_W - 88;
      const datesW = entry.dates ? Math.min(150, Math.max(70, entry.dates.length * 4.6)) : 0;
      const els: DesignElement[] = [];
      const title: TextElement = { type: "text", id: newId("t"), role: "entry-title", x: 44, y, w: W - datesW - 10, text: entry.title, list: "none", style: textStyleSchema.parse({ bold: true, italic: true }) };
      title.h = measure(title);
      els.push(title);
      let bottom = y + title.h;
      if (entry.dates) {
        const dates: TextElement = { type: "text", id: newId("t"), role: "dates", x: 44 + W - datesW, y, w: datesW, text: entry.dates, list: "none", style: textStyleSchema.parse({ color: "#444444", align: "right" }) };
        dates.h = measure(dates);
        els.push(dates);
        bottom = Math.max(bottom, y + dates.h);
      }
      if (entry.subtitle) {
        const sub: TextElement = { type: "text", id: newId("t"), role: "subtitle", x: 44, y: bottom, w: W, text: entry.subtitle, list: "none", style: textStyleSchema.parse({ size: 8.8, italic: true, color: "#444444" }) };
        sub.h = measure(sub);
        els.push(sub);
        bottom += sub.h;
      }
      if (entry.bullets.length) {
        const bullets: TextElement = { type: "text", id: newId("t"), role: "bullets", x: 48, y: bottom, w: W - 4, text: entry.bullets.join("\n"), list: "dash", style: textStyleSchema.parse({ align: "justify" }) };
        bullets.h = measure(bullets);
        els.push(bullets);
      }
      insert(page, els);
    } finally {
      dispose();
    }
  };

  const addPage = () => commit({ ...designRef.current, pages: [...designRef.current.pages, { id: newId("p"), elements: [] }] });
  const removePage = (index: number) => {
    if (designRef.current.pages.length < 2) return;
    commit({ ...designRef.current, pages: designRef.current.pages.filter((_, i) => i !== index) });
    setSelection([]);
  };

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (editingId) {
        if (e.key === "Escape") {
          e.preventDefault();
          editRef.current?.blur();
        }
        return;
      }
      if (isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (mod && key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (key === "y" || (key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (mod && key === "d") {
        e.preventDefault();
        duplicate();
      } else if (mod && key === "c" && selected.length) clipboard.current = selected.map((s) => s.el);
      else if (mod && key === "v" && clipboard.current.length) {
        e.preventDefault();
        duplicate(clipboard.current);
      } else if (mod && key === "a") {
        e.preventDefault();
        const page = selected[0]?.page ?? 0;
        setSelection(designRef.current.pages[page].elements.map((el) => el.id));
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected.length) {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "Escape") setSelection([]);
      else if (e.key === "Enter" && selected.length === 1 && selected[0].el.type === "text") {
        e.preventDefault();
        startEditing(selected[0].el.id);
      } else if (e.key.startsWith("Arrow") && selected.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        patchSelected((el) => (el.locked ? el : { ...el, x: round(el.x + dx), y: round(el.y + dy) }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------------------------------------------------------------------------
  // Name, preview, export
  // ---------------------------------------------------------------------------

  const rename = async () => {
    const n = name.trim();
    if (!n || n === variant.name) return setName(variant.name);
    const r = await renameVariantAction(variant.id, n);
    if (!r.ok) {
      toast.error(r.error);
      setName(variant.name);
    }
  };

  const openPreview = async () => {
    await flush();
    setPreview(`/api/cv/variants/${variant.id}/pdf?t=${Date.now()}`);
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      await flush();
      const r = await exportVariantAction(variant.id);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Version enregistrée : ${r.data.fileName}`, { action: { label: "Télécharger", onClick: () => window.open(`/api/files/versions/${r.data.versionId}?download=1`, "_blank") } });
    } finally {
      setExporting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Claude
  // ---------------------------------------------------------------------------

  const [instruction, setInstruction] = useState("");
  const [offerId, setOfferId] = useState<string>("none");
  const [claudeBusy, setClaudeBusy] = useState(false);
  const [claudeNote, setClaudeNote] = useState<{ summary: string; refused: string[] } | null>(null);

  const askClaude = async (text = instruction) => {
    const ask = text.trim();
    if (!ask || claudeBusy) return;
    if (editingId) editRef.current?.blur();
    setClaudeBusy(true);
    setClaudeNote(null);
    const before = designRef.current;
    const r = await editCvWithClaudeAction(variant.id, { instruction: ask, design: before, opportunityId: offerId === "none" ? null : offerId });
    setClaudeBusy(false);
    if (!r.ok) return void toast.error(r.error);
    const changedTexts = before.pages.flatMap((pg) => pg.elements.filter((el) => el.type === "text" && JSON.stringify(findElement(r.data.design, el.id)?.el) !== JSON.stringify(el)).map((el) => el.id));
    if (r.data.applied) {
      watchGrowth(before, changedTexts);
      commit(r.data.design, before);
    }
    setInstruction("");
    setClaudeNote({ summary: r.data.summary, refused: r.data.refused });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const canUndo = hist.past > 0;
  const canRedo = hist.future > 0;
  const textStyle = selectedTexts[0]?.style;
  const single = selected.length === 1 ? selected[0].el : null;
  const lang = variant.lang;
  const library = CV_SECTIONS.map((section) => ({ section, items: entries.filter((e) => e.section === section && e.lang === lang) })).filter((g) => g.items.length);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-muted-background text-foreground">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-separator bg-background px-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/cv" onClick={() => void flush()}>
            <ArrowLeft /> CV
          </Link>
        </Button>
        <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void rename()} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} className="h-8 w-64 font-medium" aria-label="Nom du CV (nom du fichier PDF)" title="Nom du fichier PDF" />
        <span className="text-xs text-muted-foreground">.pdf</span>
        <span className={cn("ml-1 text-xs", saveState === "error" ? "text-destructive" : "text-muted-foreground")}>
          {saveState === "saving" ? "Enregistrement…" : saveState === "dirty" ? "Modifications non enregistrées" : saveState === "error" ? "Erreur d’enregistrement" : "Enregistré"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <ToolButton label="Annuler (Ctrl Z)" onClick={undo} disabled={!canUndo}>
            <Undo2 />
          </ToolButton>
          <ToolButton label="Rétablir (Ctrl Y)" onClick={redo} disabled={!canRedo}>
            <Redo2 />
          </ToolButton>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolButton label="Zoom arrière" onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 10) / 10))}>
            <ZoomOut />
          </ToolButton>
          <button type="button" className="w-12 text-center text-xs tabular-nums text-muted-foreground hover:text-foreground" onClick={() => setZoom(1)} title="100 %">
            {Math.round(zoom * 100)} %
          </button>
          <ToolButton label="Zoom avant" onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.1) * 10) / 10))}>
            <ZoomIn />
          </ToolButton>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button variant="outline" size="sm" onClick={() => void openPreview()}>
            <Eye /> Aperçu PDF
          </Button>
          <Button variant="highlight" size="sm" onClick={() => void exportPdf()} disabled={exporting}>
            {exporting ? <Loader2 className="animate-spin" /> : <Download />} Exporter
          </Button>
        </div>
      </header>

      {/* Contextual toolbar */}
      <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-1 border-b border-separator bg-background px-3 py-1">
        {!selected.length && <span className="text-xs text-muted-foreground">Clique un élément pour le modifier, double-clique un texte pour l’écrire. Glisse pour déplacer : les guides roses alignent (Alt pour les ignorer).</span>}
        {onlyTexts && textStyle && (
          <>
            <Select value={textStyle.font} onValueChange={(v) => styleTexts({ font: v as TextStyle["font"] })}>
              <SelectTrigger size="sm" className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[60]">
                {FONTS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FONT_LABEL[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center">
              <ToolButton label="Plus petit" onClick={() => styleTexts({ size: Math.max(4, Math.round((textStyle.size - 0.5) * 10) / 10) })}>
                <Minus />
              </ToolButton>
              <Input
                key={`${selection.join()}-${textStyle.size}`}
                defaultValue={textStyle.size}
                onBlur={(e) => {
                  const v = Number(e.target.value.replace(",", "."));
                  if (Number.isFinite(v) && v >= 4 && v <= 96 && v !== textStyle.size) styleTexts({ size: v });
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                className="h-8 w-14 text-center tabular-nums"
                aria-label="Taille du texte"
              />
              <ToolButton label="Plus grand" onClick={() => styleTexts({ size: Math.min(96, Math.round((textStyle.size + 0.5) * 10) / 10) })}>
                <Plus />
              </ToolButton>
            </div>
            <Sep />
            <ToolButton label="Gras (Ctrl B)" active={editingId ? false : textStyle.bold} onMouseDown={(e) => e.preventDefault()} onClick={() => (editingId ? document.execCommand("bold") : styleTexts({ bold: !textStyle.bold }))}>
              <Bold />
            </ToolButton>
            <ToolButton label="Italique (Ctrl I)" active={editingId ? false : textStyle.italic} onMouseDown={(e) => e.preventDefault()} onClick={() => (editingId ? document.execCommand("italic") : styleTexts({ italic: !textStyle.italic }))}>
              <Italic />
            </ToolButton>
            <ToolButton label="Majuscules" active={textStyle.uppercase} onClick={() => styleTexts({ uppercase: !textStyle.uppercase })}>
              <CaseUpper />
            </ToolButton>
            <label className="relative flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-hover" title="Couleur du texte">
              <span className="size-4 rounded-full border border-border" style={{ background: textStyle.color }} />
              <input type="color" value={textStyle.color} onChange={(e) => styleTexts({ color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Couleur du texte" />
            </label>
            <Sep />
            {(
              [
                ["left", AlignLeft, "Aligner à gauche"],
                ["center", AlignCenter, "Centrer"],
                ["right", AlignRight, "Aligner à droite"],
                ["justify", AlignJustify, "Justifier"],
              ] as const
            ).map(([a, Icon, label]) => (
              <ToolButton key={a} label={label} active={textStyle.align === a} onClick={() => styleTexts({ align: a })}>
                <Icon />
              </ToolButton>
            ))}
            <Sep />
            <ToolButton
              label={selectedTexts[0].list === "none" ? "Liste à tirets" : selectedTexts[0].list === "dash" ? "Liste à puces" : "Sans liste"}
              active={selectedTexts[0].list !== "none"}
              onClick={() => patchSelected((el) => (el.type === "text" ? { ...el, list: el.list === "none" ? "dash" : el.list === "dash" ? "bullet" : "none" } : el))}
            >
              <List />
            </ToolButton>
            <Select value={String(textStyle.lineHeight)} onValueChange={(v) => styleTexts({ lineHeight: Number(v) })}>
              <SelectTrigger size="sm" className="h-8 w-24" title="Interligne">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[60]">
                {[...new Set([1, 1.1, 1.15, 1.2, 1.25, 1.3, 1.4, 1.5, 1.75, 2, textStyle.lineHeight])]
                  .sort((a, b) => a - b)
                  .map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      Interligne {v}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={String(textStyle.letterSpacing)} onValueChange={(v) => styleTexts({ letterSpacing: Number(v) })}>
              <SelectTrigger size="sm" className="h-8 w-28" title="Espacement des lettres">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[60]">
                {[...new Set([-0.3, 0, 0.3, 0.6, 1, 1.5, 2, 3, textStyle.letterSpacing])]
                  .sort((a, b) => a - b)
                  .map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      Lettres {v > 0 ? `+${v}` : v}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </>
        )}
        {single?.type === "line" && (
          <>
            <ColorField label="Couleur" value={single.color} onChange={(c) => patchSelected((el) => (el.type === "line" ? { ...el, color: c } : el))} />
            <Select value={String(single.h)} onValueChange={(v) => patchSelected((el) => (el.type === "line" ? { ...el, h: Number(v) } : el))}>
              <SelectTrigger size="sm" className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[60]">
                {[...new Set([0.3, 0.6, 1, 1.5, 2, 3, 4, single.h])]
                  .sort((a, b) => a - b)
                  .map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      Épaisseur {v}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </>
        )}
        {single?.type === "rect" && (
          <>
            <ColorField label="Fond" value={single.fill ?? "#ffffff"} onChange={(c) => patchSelected((el) => (el.type === "rect" ? { ...el, fill: c } : el))} />
            <ColorField label="Bordure" value={single.stroke ?? "#9a9a9a"} onChange={(c) => patchSelected((el) => (el.type === "rect" ? { ...el, stroke: c, strokeWidth: el.strokeWidth || 1 } : el))} />
            <Select value={String(single.radius)} onValueChange={(v) => patchSelected((el) => (el.type === "rect" ? { ...el, radius: Number(v) } : el))}>
              <SelectTrigger size="sm" className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[60]">
                {[...new Set([0, 2, 4, 6, 8, 12, 20, single.radius])]
                  .sort((a, b) => a - b)
                  .map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      Arrondi {v}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </>
        )}
        {selected.length > 0 && (
          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <AlignHorizontalJustifyCenter /> Position
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[60] w-56">
                <DropdownMenuLabel>{selected.length > 1 ? "Aligner la sélection" : "Aligner sur la page"}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => align("left")}>
                  <AlignHorizontalJustifyStart /> À gauche
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => align("hcenter")}>
                  <AlignHorizontalJustifyCenter /> Au centre
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => align("right")}>
                  <AlignHorizontalJustifyEnd /> À droite
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => align("top")}>
                  <AlignVerticalJustifyStart /> En haut
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => align("vcenter")}>
                  <AlignVerticalJustifyCenter /> Au milieu
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => align("bottom")}>
                  <AlignVerticalJustifyEnd /> En bas
                </DropdownMenuItem>
                {selected.length > 2 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => distribute("x")}>Répartir horizontalement</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => distribute("y")}>Répartir verticalement</DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => reorder("front")}>
                  <ArrowUpToLine /> Au premier plan
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => reorder("back")}>
                  <ArrowDownToLine /> À l’arrière-plan
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ToolButton label="Dupliquer (Ctrl D)" onClick={() => duplicate()}>
              <Copy />
            </ToolButton>
            <ToolButton label={selected.every((s) => s.el.locked) ? "Déverrouiller" : "Verrouiller"} onClick={() => patchSelected((el) => ({ ...el, locked: !selected.every((s) => s.el.locked) }))}>
              {selected.every((s) => s.el.locked) ? <Unlock /> : <Lock />}
            </ToolButton>
            <ToolButton label="Supprimer (Suppr)" onClick={removeSelected}>
              <Trash2 />
            </ToolButton>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left panel */}
        <aside className="hidden w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-separator bg-background p-3 md:flex">
          <div className="space-y-1.5">
            <p className="label-xs text-muted-foreground">Ajouter</p>
            <div className="grid grid-cols-2 gap-1.5">
              <AddButton icon={Heading1} label="Titre" onClick={() => addText("title")} />
              <AddButton icon={Heading2} label="Sous-titre" onClick={() => addText("subtitle")} />
              <AddButton icon={Type} label="Texte" onClick={() => addText("body")} />
              <AddButton icon={List} label="Liste" onClick={() => addText("list")} />
              <AddButton icon={Minus} label="Ligne" onClick={() => addShape("line")} />
              <AddButton icon={RectangleHorizontal} label="Forme" onClick={() => addShape("rect")} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={pushDown} onChange={(e) => setPushDown(e.target.checked)} />
            Décaler le contenu en dessous quand un texte grandit
          </label>
          {library.length > 0 && (
            <div className="space-y-2">
              <p className="label-xs text-muted-foreground">Bibliothèque</p>
              {library.map((g) => (
                <div key={g.section} className="space-y-1">
                  <p className="text-xs font-medium text-foreground">{CV_SECTION_LABEL[g.section]}</p>
                  {g.items.map((e) => (
                    <button key={e.id} type="button" onClick={() => insertEntry(e)} className="block w-full rounded-md px-2 py-1 text-left text-xs hover:bg-hover" title="Ajouter au CV">
                      <span className="line-clamp-2">{e.title}</span>
                      {e.dates && <span className="text-muted-foreground">{e.dates}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Canvas */}
        <main className="relative min-w-0 flex-1 overflow-auto bg-stone-200/60 dark:bg-stone-950" onPointerDown={(e) => e.target === e.currentTarget && setSelection([])}>
          <div className="mx-auto flex w-max flex-col items-center gap-8 px-12 pt-10 pb-48">
            {design.pages.map((pg, p) => {
              const overflow = contentBottom(pg) > PAGE_H + 0.5;
              return (
                <div key={pg.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Page {p + 1}
                      {overflow && <span className="ml-2 text-destructive">Le contenu dépasse la page</span>}
                    </span>
                    {design.pages.length > 1 && (
                      <button type="button" onClick={() => removePage(p)} className="hover:text-destructive">
                        Supprimer la page
                      </button>
                    )}
                  </div>
                  <div className="relative bg-white shadow-lg ring-1 ring-black/5" style={{ width: PAGE_W * zoom, height: PAGE_H * zoom }}>
                    <div
                      ref={(node) => {
                        pageRefs.current[p] = node;
                      }}
                      className="absolute top-0 left-0 origin-top-left text-[#111]"
                      style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${zoom})` }}
                      onPointerDown={(e) => onPagePointerDown(e, p)}
                    >
                      {pg.elements.map((el) => {
                        const isSel = selection.includes(el.id);
                        if (el.type === "text" && editingId === el.id)
                          return (
                            // Own key: React must drop this node (and the DOM typed into it) when editing ends.
                            <div
                              key={`edit-${el.id}`}
                              ref={editorRef}
                              data-text-id={el.id}
                              contentEditable
                              suppressContentEditableWarning
                              spellCheck
                              lang={lang}
                              className="cv-text outline outline-2 outline-[#8b5cf6] outline-offset-1"
                              style={{ position: "absolute", left: el.x, top: el.y, width: el.w, minHeight: el.style.size * el.style.lineHeight, cursor: "text", ...textCss(el) }}
                              onPointerDown={(e) => e.stopPropagation()}
                              onBlur={finishEditing}
                            />
                          );
                        return (
                          <div
                            key={el.id}
                            data-el={el.id}
                            className={cn("absolute", !el.locked && "cursor-move", el.locked && "cursor-default")}
                            style={{ left: el.x, top: el.y, width: el.w, height: el.type === "text" ? undefined : Math.max(el.h, 4) }}
                            onPointerDown={(e) => onElementPointerDown(e, p, el)}
                            onDoubleClick={() => el.type === "text" && startEditing(el.id)}
                          >
                            {el.type === "text" ? (
                              <div className="cv-text" data-text-id={el.id} style={textCss(el)}>
                                <TextContent el={el} />
                              </div>
                            ) : (
                              <div className="pointer-events-none absolute inset-0">
                                <ElementView el={{ ...el, x: 0, y: 0 }} />
                              </div>
                            )}
                            {!isSel && <div className="pointer-events-none absolute -inset-px rounded-[1px] opacity-0 ring-1 ring-[#8b5cf6]/60 hover:opacity-100" />}
                          </div>
                        );
                      })}

                      {/* Selection frames and handles (constant size on screen) */}
                      {selected
                        .filter((s) => s.page === p && s.el.id !== editingId)
                        .map(({ el }) => {
                          const h = heightOf(el);
                          const hs = 8 / zoom;
                          const handles = el.locked || selected.length > 1 ? [] : el.type === "rect" ? ["nw", "n", "ne", "e", "se", "s", "sw", "w"] : ["w", "e"];
                          return (
                            <div key={`sel-${el.id}`} className="pointer-events-none absolute" style={{ left: el.x, top: el.y, width: el.w, height: Math.max(h, 2) }}>
                              <div className="absolute inset-0" style={{ outline: `${1.5 / zoom}px solid ${el.locked ? "#a8a29e" : "#8b5cf6"}` }} />
                              {handles.map((hd) => {
                                const left = hd.includes("w") ? 0 : hd.includes("e") ? el.w : el.w / 2;
                                const top = hd.includes("n") ? 0 : hd.includes("s") ? Math.max(h, 2) : Math.max(h, 2) / 2;
                                const vertical = hd === "w" || hd === "e";
                                return (
                                  <div
                                    key={hd}
                                    className="pointer-events-auto absolute rounded-full border bg-white shadow-sm"
                                    style={{
                                      left: left - (vertical ? hs / 3 : hs / 2),
                                      top: top - (vertical ? hs : hs / 2),
                                      width: vertical ? (hs * 2) / 3 : hs,
                                      height: vertical ? hs * 2 : hs,
                                      borderColor: "#8b5cf6",
                                      borderWidth: 1 / zoom,
                                      cursor: hd === "n" || hd === "s" ? "ns-resize" : vertical ? "ew-resize" : hd === "nw" || hd === "se" ? "nwse-resize" : "nesw-resize",
                                    }}
                                    onPointerDown={(e) => onHandlePointerDown(e, p, el.id, hd)}
                                  />
                                );
                              })}
                            </div>
                          );
                        })}

                      {/* Alignment guides */}
                      {guides?.page === p &&
                        guides.guides.map((g, i) => (
                          <div key={i} className="pointer-events-none absolute bg-[#ff2fb3]" style={g.axis === "x" ? { left: g.at - 0.5 / zoom, top: 0, width: 1 / zoom, height: PAGE_H } : { top: g.at - 0.5 / zoom, left: 0, height: 1 / zoom, width: PAGE_W }} />
                        ))}
                      {marquee?.page === p && <div className="pointer-events-none absolute border border-[#8b5cf6] bg-[#8b5cf6]/10" style={{ left: marquee.box.x, top: marquee.box.y, width: marquee.box.w, height: marquee.box.h }} />}
                    </div>
                  </div>
                </div>
              );
            })}
            <Button variant="outline" size="sm" onClick={addPage}>
              <Plus /> Ajouter une page
            </Button>
          </div>
        </main>
      </div>

      {/* Claude */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-4 md:pl-64">
        <div className="pointer-events-auto w-full max-w-2xl space-y-2">
          {claudeNote && (
            <div className="rounded-2xl border border-border bg-background px-3 py-2 text-sm shadow-lg">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-highlight-500" />
                <p className="min-w-0 flex-1">{claudeNote.summary}</p>
                <Button size="xs" variant="ghost" onClick={() => (undo(), setClaudeNote(null))} disabled={!canUndo}>
                  Annuler
                </Button>
                <Button size="icon-xs" variant="ghost" onClick={() => setClaudeNote(null)} aria-label="Fermer">
                  <Check />
                </Button>
              </div>
              {claudeNote.refused.length > 0 && (
                <ul className="mt-1 list-disc pl-9 text-xs text-warning-700">
                  {claudeNote.refused.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="relative isolate">
            <div aria-hidden className="composer-halo pointer-events-none absolute -inset-[3px] -z-10 rounded-[23px] opacity-70 blur-md" />
            <div className="flex items-end gap-2 rounded-[20px] border border-transparent bg-background p-2 shadow-lg">
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void askClaude();
                  }
                }}
                rows={1}
                disabled={claudeBusy}
                placeholder={claudeBusy ? "Claude modifie ton CV…" : "Demande à Claude : « raccourcis le profil à 3 lignes », « traduis en anglais », « mets les dates en gris »…"}
                className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-faint"
                aria-label="Instruction pour Claude"
              />
              <Select value={offerId} onValueChange={setOfferId}>
                <SelectTrigger size="sm" className="h-8 w-44 shrink-0" title="Adapter à une offre">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[60] max-h-72">
                  <SelectItem value="none">Sans offre</SelectItem>
                  {opportunities.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="highlight" size="icon-sm" onClick={() => void askClaude()} disabled={!instruction.trim() || claudeBusy} aria-label="Envoyer à Claude">
                {claudeBusy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="z-[60] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Aperçu du PDF</DialogTitle>
          </DialogHeader>
          {preview && <iframe title="Aperçu du PDF" src={preview} className="h-[75vh] w-full rounded-lg border border-border" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolButton({ label, active, children, ...props }: { label: string; active?: boolean; children: React.ReactNode } & React.ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} aria-pressed={active} className={cn(active && "bg-selected text-foreground")} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="z-[60]">{label}</TooltipContent>
    </Tooltip>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}

function AddButton({ icon: Icon, label, onClick }: { icon: typeof Type; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1 rounded-xl border border-border px-2 py-2.5 text-xs hover:bg-hover">
      <Icon className="size-4 text-highlight-500" />
      {label}
    </button>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (c: string) => void }) {
  return (
    <label className="relative flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs hover:bg-hover">
      <span className="size-4 rounded-full border border-border" style={{ background: value }} />
      {label}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label} />
    </label>
  );
}
