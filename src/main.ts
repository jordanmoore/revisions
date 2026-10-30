import "./style.css";
import { type Doc, type Rev, addDoc, ago, getDoc, loadStore, newDoc, newRev, removeDoc, saveStore } from "./store";
import { type Command, closePalette, isPaletteOpen, openPalette } from "./palette";

type Mode = "edit" | "browse" | "banked";
type View = "drafts" | "editor";

/** Coarse pointer = phone or tablet: show tappable actions instead of key hints. */
const touch = window.matchMedia("(pointer: coarse)").matches;
const pad = (n: number) => String(n).padStart(2, "0");
const app = document.getElementById("app")!;
const MARK = `${import.meta.env.BASE_URL}squiggle.svg`;

let view: View = "drafts";

// ======================================================================
// Editor state
// ======================================================================

let doc: Doc = newDoc();
let mode: Mode = "edit";
let focusId = "";
let savedAt: Date | null = null;
let dirty = false;
let saveTimer: number | undefined;

const live = () => doc.revs[doc.revs.length - 1];
const revById = (id: string) => doc.revs.find((r) => r.id === id)!;
const revIndex = (id: string) => doc.revs.findIndex((r) => r.id === id);
const visibleRevs = () => (mode === "banked" ? doc.revs.filter((r) => r.banked) : doc.revs);

function markDirty() {
  dirty = true;
  doc.updatedAt = Date.now();
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 300);
  renderChrome();
}

function save() {
  saveStore();
  savedAt = new Date();
  dirty = false;
  renderChrome();
}

// ---------- editor dom ----------

let stageEl: HTMLElement;
let streamEl: HTMLElement;
let railDotsEl: HTMLElement;
let hintsEl: HTMLElement;
let titleEl: HTMLElement;
let revLabelEl: HTMLElement;
let bankedCountEl: HTMLElement;
let statusEl: HTMLElement;

type RowEls = {
  row: HTMLElement;
  sentence: HTMLElement;
  note: HTMLElement;
  hint: HTMLElement;
  marks: SVGSVGElement;
  revno: HTMLElement;
  struck: boolean;
  underlined: boolean;
  sig: string;
};

let rows = new Map<string, RowEls>();

function mountEditor(d: Doc) {
  view = "editor";
  doc = d;
  mode = "edit";
  focusId = live().id;
  savedAt = null;
  dirty = false;
  rows = new Map();

  app.innerHTML = `
    <header class="topbar">
      <div class="crumbs">
        <a class="home" href="#/"><img class="mark" src="${MARK}" alt="" />Revisions</a>
        <span>/</span>
        <span class="title" contenteditable="plaintext-only" spellcheck="false" data-placeholder="Untitled"></span>
      </div>
      <div class="counter">
        <span class="rev-label"></span>
        <span class="banked-count" title="Show banked only (⌘⇧B)"></span>
        <span class="status"></span>
        <button type="button" class="theme-toggle" title="Dark or light, for this draft only (⌘⇧D)"></button>
      </div>
    </header>
    <main class="stage">
      <div class="rail"><div class="rail-line"></div><div class="rail-dots"></div></div>
      <div class="stream"></div>
    </main>
    <footer class="footer"><div class="hints"></div></footer>
  `;
  const $ = <T extends HTMLElement>(sel: string) => app.querySelector(sel) as T;
  stageEl = $(".stage");
  streamEl = $(".stream");
  railDotsEl = $(".rail-dots");
  hintsEl = $(".hints");
  titleEl = $(".title");
  revLabelEl = $(".rev-label");
  bankedCountEl = $(".banked-count");
  statusEl = $(".status");

  // "Untitled" is a placeholder, not text, so a click lands the caret at the start and typing names the draft
  titleEl.textContent = doc.title === "Untitled" ? "" : doc.title;
  titleEl.addEventListener("input", () => {
    doc.title = titleEl.textContent?.trim() || "Untitled";
    markDirty();
  });
  bankedCountEl.addEventListener("click", () => toggleBankedOnly());
  const themeEl = $(".theme-toggle");
  themeEl.addEventListener("pointerdown", (e) => e.preventDefault()); // keep the caret where it is
  themeEl.addEventListener("click", () => toggleTheme());
  applyTheme();

  // clicking empty stage puts you back on the live line
  stageEl.addEventListener("mousedown", (e) => {
    if (e.target === stageEl || e.target === streamEl) {
      e.preventDefault();
      goLatest();
    }
  });

  // keep the editable's focus (and the soft keyboard) when tapping an action
  hintsEl.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) e.preventDefault();
  });
  hintsEl.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]");
    if (b) runAction(b.dataset.act as Action);
  });

  render({ instant: true });
  focusLive(live().text ? "start" : "end");
}

function makeRow(rev: Rev): RowEls {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.id = rev.id;
  row.innerHTML = `
    <div class="revno"><span class="n"></span></div>
    <div class="sentence" spellcheck="false" data-placeholder="Write."></div>
    <div class="note-slot">
      <div class="note" contenteditable="plaintext-only" spellcheck="false"></div>
      <div class="restore-hint"><kbd>↵</kbd><span></span></div>
    </div>
    <svg class="marks" aria-hidden="true"></svg>
  `;
  const els: RowEls = {
    row,
    sentence: row.querySelector(".sentence")!,
    note: row.querySelector(".note")!,
    hint: row.querySelector(".restore-hint")!,
    marks: row.querySelector(".marks")!,
    revno: row.querySelector(".revno")!,
    struck: false,
    underlined: false,
    sig: "",
  };
  els.sentence.textContent = rev.text;
  els.note.textContent = rev.note;

  els.sentence.addEventListener("input", () => {
    if (rev.id !== live().id) return;
    rev.text = els.sentence.textContent ?? "";
    markDirty();
    scheduleLayout();
    markChanges();
  });
  els.note.addEventListener("input", () => {
    rev.note = els.note.textContent ?? "";
    markDirty();
    scheduleLayout();
  });
  els.note.addEventListener("focus", () => {
    if (focusId !== rev.id) setFocus(rev.id, false);
    renderChrome();
  });
  els.note.addEventListener("blur", () => renderChrome());
  els.sentence.addEventListener("focus", () => renderChrome());
  els.sentence.addEventListener("blur", () => renderChrome());

  row.addEventListener("mousedown", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(".note")) return; // let the note take focus on its own
    if (rev.id === live().id && mode !== "banked") {
      if (mode !== "edit") goLatest();
      return; // native caret placement
    }
    e.preventDefault();
    browseTo(rev.id);
  });

  return els;
}

// ---------- rendering ----------

let layoutScheduled = false;
function scheduleLayout() {
  if (layoutScheduled) return;
  layoutScheduled = true;
  requestAnimationFrame(() => {
    layoutScheduled = false;
    if (view === "editor") layout();
  });
}

function render(opts: { instant?: boolean } = {}) {
  const visible = visibleRevs();
  const visibleIds = new Set(visible.map((r) => r.id));
  const liveRev = live();
  const focusPos = visible.findIndex((r) => r.id === focusId);

  for (const rev of doc.revs) {
    if (!rows.has(rev.id)) rows.set(rev.id, makeRow(rev));
  }
  for (const [id, els] of rows) {
    if (!doc.revs.some((r) => r.id === id)) {
      els.row.remove();
      rows.delete(id);
    }
  }
  doc.revs.forEach((rev, i) => {
    const els = rows.get(rev.id)!;
    if (streamEl.children[i] !== els.row) streamEl.insertBefore(els.row, streamEl.children[i] ?? null);
  });

  doc.revs.forEach((rev, i) => {
    const els = rows.get(rev.id)!;
    els.revno.querySelector(".n")!.textContent = String(i + 1);
    const isLive = rev.id === liveRev.id;
    const isFocus = rev.id === focusId;
    const pos = visible.findIndex((r) => r.id === rev.id);
    const hidden = !visibleIds.has(rev.id);

    els.row.classList.toggle("is-hidden", hidden);
    els.row.classList.toggle("is-live", isLive);
    els.row.classList.toggle("is-focus", isFocus);
    els.row.classList.toggle("is-banked", rev.banked);
    els.sentence.contentEditable = isLive && mode !== "banked" ? "plaintext-only" : "false";
    if (els.sentence.textContent !== rev.text && document.activeElement !== els.sentence) {
      els.sentence.textContent = rev.text;
    }
    if (els.note.textContent !== rev.note && document.activeElement !== els.note) {
      els.note.textContent = rev.note;
    }

    const d = hidden ? 0 : Math.abs(pos - focusPos);
    const opacity = d === 0 ? 1 : d === 1 ? 0.5 : d === 2 ? 0.3 : d === 3 ? 0.18 : 0.1;
    const blur = d <= 1 ? 0 : d === 2 ? 0.5 : d === 3 ? 1 : 1.5;
    els.row.style.opacity = String(opacity);
    els.row.style.filter = blur ? `blur(${blur}px)` : "none";

    const showRestore = mode !== "edit" && isFocus && !rev.note && document.activeElement !== els.note;
    els.row.classList.toggle("show-restore", showRestore);
    if (showRestore) {
      els.hint.querySelector("span")!.textContent =
        mode === "banked" ? `Continue from here as rev ${pad(doc.revs.length + 1)}` : `Restore as rev ${pad(doc.revs.length + 1)}`;
    }
  });

  stageEl.classList.toggle("has-below", mode !== "edit" && focusPos < visible.length - 1);

  renderRail();
  renderChrome();
  markChanges();
  if (opts.instant) {
    streamEl.classList.add("no-anim");
    railDotsEl.classList.add("no-anim");
  }
  layout();
  if (opts.instant) {
    void streamEl.offsetHeight;
    streamEl.classList.remove("no-anim");
    railDotsEl.classList.remove("no-anim");
  }
}

function renderRail() {
  const visible = visibleRevs();
  const liveRev = live();
  railDotsEl.innerHTML = "";
  visible.forEach((rev) => {
    const n = revIndex(rev.id) + 1;
    const tick = document.createElement("div");
    tick.className = "tick";
    tick.classList.toggle("is-banked", rev.banked);
    tick.classList.toggle("is-focus", rev.id === focusId);
    tick.classList.toggle("is-latest", rev.id === liveRev.id && rev.id !== focusId);
    tick.innerHTML = `<div class="dot"></div><span class="num">${pad(n)}</span>`;
    tick.title = rev.text || `Rev ${pad(n)}`;
    tick.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (rev.id === liveRev.id && mode !== "banked") goLatest();
      else browseTo(rev.id);
    });
    railDotsEl.appendChild(tick);
  });
}

function activeKind(): "sentence" | "note" | "chrome" | "none" {
  const a = document.activeElement as HTMLElement | null;
  if (!a) return "none";
  if (a.classList.contains("sentence")) return "sentence";
  if (a.classList.contains("note")) return "note";
  if (a.closest(".crumbs")) return "chrome";
  return "none";
}

function renderChrome() {
  if (view !== "editor") return;
  const total = doc.revs.length;
  const n = revIndex(focusId) + 1;
  const banked = doc.revs.filter((r) => r.banked).length;
  const focusRev = revById(focusId);

  revLabelEl.textContent = mode === "edit" ? `Rev ${pad(total)}` : `Rev ${pad(n)} of ${pad(total)}`;
  bankedCountEl.textContent = mode === "banked" ? "Viewing banked" : `${banked} banked`;
  bankedCountEl.classList.toggle("is-on", mode === "banked");
  statusEl.textContent =
    mode === "browse"
      ? "Browsing"
      : dirty
        ? "Unsaved"
        : savedAt
          ? `Saved ${savedAt.getHours()}:${pad(savedAt.getMinutes())}`
          : "";

  const kind = activeKind();
  if (touch) {
    renderActions(kind);
    return;
  }
  let hints: [string, string][];
  if (mode === "edit" && kind === "note") {
    hints = [
      ["↵", "Next revision"],
      ["Tab", "Back to sentence"],
      ["⌘B", focusRev.banked ? "Unbank" : "Bank"],
      ["Esc", "Back to sentence"],
    ];
  } else if (mode === "edit") {
    hints = [
      ["↵", "New revision"],
      ["⌘↵", "Blank revision"],
      ["⌥ ← →", "Hop words"],
      ["⌃⌥ ← →", "First / last word"],
      ["Tab", "Note"],
      ["⌘B", focusRev.banked ? "Unbank" : "Bank"],
      ["↑ ↓", "Browse"],
      ["⌘⇧B", "View banked"],
      ["Esc", "All drafts"],
    ];
  } else if (mode === "browse") {
    hints = [
      ["↵", "Restore as latest"],
      ["↑ ↓", "Browse"],
      ["⌘ ↑ ↓", "First / latest"],
      ["Esc", "Back to latest"],
      ["B", focusRev.banked ? "Unbank" : "Bank"],
      ["Tab", focusRev.note ? "Edit note" : "Note"],
    ];
  } else {
    hints = [
      ["↵", "Continue from here"],
      ["Tab", focusRev.note ? "Edit note" : "Note"],
      ["B", "Unbank"],
      ["↑ ↓", "Browse"],
      ["⌘ ↑ ↓", "First / last"],
      ["Esc", "All revisions"],
    ];
  }
  hints.push(["⌘K", "Commands"]);
  hintsEl.innerHTML = hints.map(([k, l]) => `<div class="hint"><kbd>${k}</kbd><span>${l}</span></div>`).join("");
}

type Action = "bank" | "note" | "done" | "bankedOnly" | "restore" | "latest" | "all" | "theme" | "commands";

function renderActions(kind: ReturnType<typeof activeKind>) {
  const focusRev = revById(focusId);
  const bankLabel = focusRev.banked ? "Unbank" : "Bank";
  const anyBanked = doc.revs.some((r) => r.banked);
  let actions: [Action, string, boolean?][];
  if (mode === "edit" && kind === "note") {
    actions = [
      ["done", "Done"],
      ["bank", bankLabel],
    ];
  } else if (mode === "edit") {
    actions = [
      ["bank", bankLabel],
      ["note", focusRev.note ? "Edit note" : "Note"],
      ["bankedOnly", "View banked", anyBanked],
    ];
  } else if (mode === "browse") {
    actions = [
      ["restore", "Restore", true],
      ["latest", "Latest"],
      ["bank", bankLabel],
      ["note", focusRev.note ? "Edit note" : "Note"],
    ];
  } else {
    actions = [
      ["restore", "Continue from here", true],
      ["all", "All revisions"],
      ["bank", "Unbank"],
      ["note", focusRev.note ? "Edit note" : "Note"],
    ];
  }
  actions.push(["commands", "More…"]);
  hintsEl.innerHTML = actions
    .filter(([a, , show]) => a !== "bankedOnly" || show)
    .map(([a, l, primary]) => `<button type="button" class="act${primary && a !== "bankedOnly" ? " is-primary" : ""}" data-act="${a}">${l}</button>`)
    .join("");
}

function runAction(a: Action) {
  switch (a) {
    case "bank":
      toggleBank();
      break;
    case "note":
      if (activeKind() === "note") break;
      focusNote();
      break;
    case "done":
      if (mode === "edit") focusLive("end");
      else (document.activeElement as HTMLElement | null)?.blur();
      renderChrome();
      break;
    case "bankedOnly":
    case "all":
      toggleBankedOnly();
      break;
    case "restore":
      restore();
      break;
    case "latest":
      goLatest();
      break;
    case "theme":
      toggleTheme();
      break;
    case "commands":
      openCommands();
      break;
  }
}

// ---------- layout: centering, marks ----------

function layout() {
  const els = rows.get(focusId);
  if (!els) return;
  const centre = els.row.offsetTop + els.row.offsetHeight / 2;
  streamEl.style.transform = `translateY(${Math.round(-centre)}px)`;

  const ticks = Array.from(railDotsEl.children) as HTMLElement[];
  const focusTick = ticks.find((t) => t.classList.contains("is-focus"));
  if (focusTick) {
    const c = focusTick.offsetTop + focusTick.offsetHeight / 2;
    railDotsEl.style.transform = `translateY(${Math.round(-c)}px)`;
  }

  for (const rev of doc.revs) drawMarks(rev);
}

/** Visual line boxes of a text element, in the row's coordinate space. */
function lineRects(el: HTMLElement, origin: DOMRect): DOMRect[] {
  const range = document.createRange();
  range.selectNodeContents(el);
  const lines: DOMRect[] = [];
  for (const r of Array.from(range.getClientRects())) {
    if (r.width < 1 || r.height < 1) continue;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.top - r.top) < 6) {
      const left = Math.min(last.left, r.left);
      const right = Math.max(last.right, r.right);
      lines[lines.length - 1] = new DOMRect(left, last.top, right - left, Math.max(last.height, r.height));
    } else {
      lines.push(new DOMRect(r.left, r.top, r.width, r.height));
    }
  }
  return lines.map((l) => new DOMRect(l.left - origin.left, l.top - origin.top, l.width, l.height));
}

/** Deterministic wobble so a mark keeps its shape across re-renders. */
function wobble(seed: string, i: number): number {
  let h = 2166136261;
  for (const ch of seed + i) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000 - 0.5;
}

function strokePath(x0: number, x1: number, y: number, seed: string): string {
  const w = x1 - x0;
  const n = Math.max(2, Math.round(w / 180));
  let d = `M ${x0.toFixed(1)} ${(y + wobble(seed, 0) * 6).toFixed(1)}`;
  for (let i = 1; i <= n; i++) {
    const x = x0 + (w * i) / n;
    const cx = x0 + (w * (i - 0.5)) / n;
    const cy = y + wobble(seed, i * 2) * 10;
    const ey = y + wobble(seed, i * 2 + 1) * 6;
    d += ` Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${ey.toFixed(1)}`;
  }
  return d;
}

function drawMarks(rev: Rev) {
  const els = rows.get(rev.id)!;
  if (els.row.classList.contains("is-hidden")) return;
  const isLive = rev.id === live().id;
  const isFocusBrowsing = mode !== "edit" && rev.id === focusId;
  const wantStrike = !isLive && !rev.banked && !isFocusBrowsing && rev.text.trim() !== "";
  const wantUnderline = rev.banked && rev.text.trim() !== "";

  const origin = els.row.getBoundingClientRect();
  const lines = lineRects(els.sentence, origin);
  const sig = lines.map((l) => `${l.left | 0},${l.top | 0},${l.width | 0}`).join("|");
  const geometryChanged = sig !== els.sig;
  els.sig = sig;

  let strikeGroup = els.marks.querySelector<SVGGElement>("g.strikes");
  if (!strikeGroup) {
    strikeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    strikeGroup.setAttribute("class", "strikes");
    els.marks.appendChild(strikeGroup);
  }
  if (wantStrike && (!els.struck || geometryChanged)) {
    const animate = !els.struck;
    strikeGroup.innerHTML = "";
    lines.forEach((l, i) => {
      const y = l.top + l.height * 0.53;
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("class", "strike");
      p.setAttribute("d", strokePath(2, l.width + 14, y, rev.id + "s" + i));
      strikeGroup!.appendChild(p);
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = animate ? `${len}` : "0";
      if (animate) {
        p.style.transitionDelay = `${120 + i * 160}ms`;
        void p.getBoundingClientRect();
        p.style.strokeDashoffset = "0";
      }
    });
    els.struck = true;
  } else if (!wantStrike && els.struck) {
    const paths = Array.from(strikeGroup.querySelectorAll<SVGPathElement>("path"));
    paths.forEach((p, i) => {
      const len = p.getTotalLength();
      p.style.transitionDelay = `${(paths.length - 1 - i) * 120}ms`;
      p.style.strokeDashoffset = `${len}`;
    });
    const group = strikeGroup;
    window.setTimeout(() => {
      if (!els.struck) group.innerHTML = "";
    }, 700 + paths.length * 120);
    els.struck = false;
  }

  let ul = els.marks.querySelector<SVGPathElement>("path.underline");
  const last = lines[lines.length - 1];
  if (wantUnderline && last && (!els.underlined || geometryChanged)) {
    const animate = !els.underlined;
    if (!ul) {
      ul = document.createElementNS("http://www.w3.org/2000/svg", "path");
      ul.setAttribute("class", "underline");
      els.marks.appendChild(ul);
    }
    ul.setAttribute("d", strokePath(2, last.width + 12, last.top + last.height + 6, rev.id + "u"));
    const len = ul.getTotalLength();
    ul.style.strokeDasharray = `${len}`;
    ul.style.transitionDelay = "0ms";
    ul.style.strokeDashoffset = animate ? `${len}` : "0";
    if (animate) {
      void ul.getBoundingClientRect();
      ul.style.strokeDashoffset = "0";
    }
    els.underlined = true;
  } else if (!wantUnderline && els.underlined && ul) {
    const len = ul.getTotalLength();
    ul.style.transitionDelay = "0ms";
    ul.style.strokeDashoffset = `${len}`;
    const node = ul;
    window.setTimeout(() => {
      if (!els.underlined) node.remove();
    }, 600);
    els.underlined = false;
  }
}

// ---------- actions ----------

function placeCaret(el: HTMLElement, where: "start" | "end") {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(where === "start");
  sel.removeAllRanges();
  sel.addRange(range);
}

const placeCaretAtEnd = (el: HTMLElement) => placeCaret(el, "end");

function setFocus(id: string, rerender = true) {
  focusId = id;
  if (rerender) render();
}

function focusLive(where: "start" | "end" = "end") {
  const els = rows.get(live().id)!;
  placeCaret(els.sentence, where);
}

// ---------- word hopping (⌥ ← →) ----------

function selectionOffsets(el: HTMLElement): { text: string; start: number; end: number } {
  const text = el.textContent ?? "";
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return { text, start: 0, end: 0 };
  const r = sel.getRangeAt(0);
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  const start = pre.toString().length;
  return { text, start, end: start + r.toString().length };
}

function pointAt(el: HTMLElement, offset: number): [Node, number] {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0;
    if (seen + len >= offset) return [node, offset - seen];
    seen += len;
  }
  return [el, el.childNodes.length];
}

function selectRange(el: HTMLElement, start: number, end: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const [sn, so] = pointAt(el, start);
  const [en, eo] = pointAt(el, end);
  range.setStart(sn, so);
  range.setEnd(en, eo);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Highlight the next or previous whole word so that typing replaces it; `edge` jumps straight to the first or last. */
function hopWord(el: HTMLElement, dir: 1 | -1, edge = false) {
  const { text, start, end } = selectionOffsets(el);
  // words only, so replacing "once," keeps its comma
  const words = Array.from(text.matchAll(/[\p{L}\p{N}'’-]+/gu)).map((m) => ({ s: m.index!, e: m.index! + m[0].length }));
  if (!words.length) return;
  if (edge) {
    const w = dir === 1 ? words[words.length - 1] : words[0];
    selectRange(el, w.s, w.e);
    return;
  }
  const collapsed = start === end;
  const inside = collapsed ? words.find((w) => w.s < start && start < w.e) : undefined;
  let target = inside;
  if (!target) {
    target = dir === 1 ? words.find((w) => w.s >= end) : [...words].reverse().find((w) => w.e <= start);
  }
  if (!target) target = dir === 1 ? words[words.length - 1] : words[0];
  selectRange(el, target.s, target.e);
}

// ---------- what changed since the last revision ----------
// Words in the live line that differ from the previous revision are marked with a CSS
// highlight, which colours ranges of text without altering the editable or its caret.
// A near-total rewrite is left clean: the marks only help when a few words moved.

type Token = { w: string; s: number; e: number };
const tokenize = (text: string): Token[] =>
  Array.from(text.matchAll(/[\p{L}\p{N}'’-]+/gu)).map((m) => ({ w: m[0].toLowerCase(), s: m.index!, e: m.index! + m[0].length }));

/**
 * Character ranges of words in `cur` that are not part of the longest common word
 * sequence with `prev`, plus how much of the two sentences that sequence covers.
 */
function changedRanges(prev: string, cur: string): { ranges: [number, number][]; similarity: number } {
  const a = tokenize(prev);
  const b = tokenize(cur);
  if (!a.length || !b.length) return { ranges: [], similarity: 0 };
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i].w === b[j].w ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const kept = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].w === b[j].w) {
      kept.add(j);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const changed = b.filter((_, k) => !kept.has(k));
  // shared words over the longer of the two sentences, so a half-typed new line scores low
  const similarity = kept.size / Math.max(a.length, b.length);
  return { ranges: changed.map((t) => [t.s, t.e]), similarity };
}

// Once a line drifts far enough from the previous revision it is a rewrite, not an edit:
// marks stay off for that revision so words don't flash as the count changes mid-typing.
let rewriteLatchedFor: string | null = null;

type HighlightCtor = new (...ranges: Range[]) => object;
const highlightsApi = (CSS as unknown as { highlights?: Map<string, object> }).highlights;
const HighlightClass = (window as unknown as { Highlight?: HighlightCtor }).Highlight;

function markChanges() {
  if (!highlightsApi || !HighlightClass) return;
  highlightsApi.delete("revised");
  if (view !== "editor" || mode !== "edit") return;
  const liveRev = live();
  const prev = doc.revs[doc.revs.length - 2];
  const els = rows.get(liveRev.id);
  if (!prev || !prev.text.trim() || !els) return;
  const text = els.sentence.textContent ?? "";
  if (rewriteLatchedFor === liveRev.id) return;
  const diff = changedRanges(prev.text, text);
  if (diff.similarity < 0.5) {
    rewriteLatchedFor = liveRev.id;
    return;
  }
  const ranges = diff.ranges.map(([s, e]) => {
    const r = document.createRange();
    const [sn, so] = pointAt(els.sentence, s);
    const [en, eo] = pointAt(els.sentence, e);
    r.setStart(sn, so);
    r.setEnd(en, eo);
    return r;
  });
  if (ranges.length) highlightsApi.set("revised", new HighlightClass(...ranges));
}

// ---------- dark mode ----------
// Two layers: a global setting (defaults to the system preference) and a per-draft
// override on top. A draft with no override follows the global; toggling inside a
// draft sets its own, and setting it back to match the global clears the override.

const THEME_KEY = "revisions:theme";
let globalDark = (() => {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
})();

const effectiveDark = (d: Doc) => d.dark ?? globalDark;

function applyTheme() {
  const dark = view === "editor" ? effectiveDark(doc) : globalDark;
  app.dataset.theme = dark ? "dark" : "light";
  const b = app.querySelector<HTMLButtonElement>(".theme-toggle");
  if (b) b.textContent = dark ? "Light" : "Dark";
}

/** Editor: flip this draft; if that lands on the global setting, drop the override. */
function toggleTheme() {
  const next = !effectiveDark(doc);
  if (next === globalDark) delete doc.dark;
  else doc.dark = next;
  markDirty();
  applyTheme();
  renderChrome();
}

/** Dashboard: flip the whole app. Drafts with their own setting keep it. */
function toggleGlobalTheme() {
  globalDark = !globalDark;
  localStorage.setItem(THEME_KEY, globalDark ? "dark" : "light");
  mountDrafts();
}

function goLatest() {
  mode = "edit";
  focusId = live().id;
  render();
  focusLive();
}

function browseTo(id: string) {
  const liveRev = live();
  if (id === liveRev.id && mode !== "banked") {
    goLatest();
    return;
  }
  if (mode === "edit") mode = "browse";
  focusId = id;
  (document.activeElement as HTMLElement | null)?.blur();
  render();
}

/**
 * Return commits the live line and starts the next one preloaded with the same
 * words, caret at the start, so the next pass is an edit rather than a retype.
 * ⌘↵ starts the next one blank instead.
 */
function commit(blank = false) {
  const liveRev = live();
  const els = rows.get(liveRev.id)!;
  liveRev.text = (els.sentence.textContent ?? "").trim();
  liveRev.note = (els.note.textContent ?? "").trim();
  if (!liveRev.text) {
    placeCaretAtEnd(els.sentence);
    return;
  }
  const prev = doc.revs[doc.revs.length - 2];
  if (prev && prev.text === liveRev.text && !liveRev.banked && !liveRev.note) {
    if (blank) {
      liveRev.text = "";
      els.sentence.textContent = "";
      markDirty();
      render();
    }
    focusLive(blank ? "end" : "start");
    return;
  }
  els.sentence.textContent = liveRev.text;
  doc.revs.push(newRev(blank ? "" : liveRev.text));
  focusId = live().id;
  mode = "edit";
  markDirty();
  render();
  focusLive(blank ? "end" : "start");
}

function restore() {
  const src = revById(focusId);
  const liveRev = live();
  if (liveRev.text.trim() === "" && liveRev.id !== src.id) {
    liveRev.text = src.text;
    const els = rows.get(liveRev.id)!;
    els.sentence.textContent = src.text;
  } else if (liveRev.id !== src.id) {
    doc.revs.push(newRev(src.text));
  }
  mode = "edit";
  focusId = live().id;
  markDirty();
  render();
  focusLive("start");
}

function toggleBank(id = focusId) {
  const rev = revById(id);
  if (!rev.text.trim()) return;
  rev.banked = !rev.banked;
  markDirty();
  if (mode === "banked" && !rev.banked) {
    const remaining = doc.revs.filter((r) => r.banked);
    if (!remaining.length) {
      mode = "edit";
      focusId = live().id;
    } else {
      const idx = revIndex(id);
      const next = remaining.find((r) => revIndex(r.id) > idx) ?? remaining[remaining.length - 1];
      focusId = next.id;
    }
  }
  render();
}

function toggleBankedOnly() {
  if (mode === "banked") {
    mode = focusId === live().id ? "edit" : "browse";
    render();
    if (mode === "edit") focusLive();
    return;
  }
  const banked = doc.revs.filter((r) => r.banked);
  if (!banked.length) return;
  mode = "banked";
  if (!revById(focusId).banked) focusId = banked[banked.length - 1].id;
  (document.activeElement as HTMLElement | null)?.blur();
  render();
}

function step(delta: 1 | -1) {
  const visible = visibleRevs();
  const pos = visible.findIndex((r) => r.id === focusId);
  const next = visible[pos + delta];
  if (!next) return;
  if (next.id === live().id && mode === "browse") {
    goLatest();
    return;
  }
  if (mode === "edit") mode = "browse";
  focusId = next.id;
  (document.activeElement as HTMLElement | null)?.blur();
  render();
}

function focusNote(id = focusId) {
  const els = rows.get(id)!;
  placeCaretAtEnd(els.note);
}

/** Where the caret sits inside a wrapped editable: first/last visual line or both. */
function caretEdge(el: HTMLElement): { first: boolean; last: boolean } {
  const sel = window.getSelection();
  if (!el.textContent) return { first: true, last: true };
  if (!sel || !sel.rangeCount) return { first: true, last: true };
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(true);
  let rect = r.getClientRects()[0];
  if (!rect || rect.height === 0) {
    const probe = document.createRange();
    probe.selectNodeContents(el);
    probe.collapse(false);
    rect = probe.getClientRects()[0] ?? el.getBoundingClientRect();
  }
  const box = el.getBoundingClientRect();
  const lh = parseFloat(getComputedStyle(el).lineHeight) || rect.height;
  return { first: rect.top < box.top + lh * 0.9, last: rect.bottom > box.bottom - lh * 0.9 };
}

// ---------- editor keys ----------

function editorKeydown(e: KeyboardEvent) {
  const kind = activeKind();
  if (kind === "chrome") {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      (document.activeElement as HTMLElement).blur();
      focusLive();
    }
    return;
  }
  const meta = e.metaKey || e.ctrlKey;

  // ⌃⌥ ← → : jump the highlight to the first / last word
  if (e.ctrlKey && e.altKey && !e.metaKey && (e.key === "ArrowRight" || e.key === "ArrowLeft") && kind === "sentence") {
    e.preventDefault();
    hopWord(document.activeElement as HTMLElement, e.key === "ArrowRight" ? 1 : -1, true);
    return;
  }

  if (meta && (e.key === "b" || e.key === "B")) {
    e.preventDefault();
    if (e.shiftKey) toggleBankedOnly();
    else toggleBank();
    return;
  }
  if (meta && e.key === "Enter") {
    e.preventDefault();
    if (mode === "edit") commit(true);
    else restore();
    return;
  }
  if (meta && e.shiftKey && (e.key === "d" || e.key === "D")) {
    e.preventDefault();
    toggleTheme();
    return;
  }
  // ⌘↑ / ⌘↓ : jump to the very first or the very latest revision
  if (meta && !e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    const visible = visibleRevs();
    if (e.key === "ArrowUp") browseTo(visible[0].id);
    else if (mode === "banked") browseTo(visible[visible.length - 1].id);
    else goLatest();
    return;
  }
  if (e.altKey && !meta && !e.shiftKey && (e.key === "ArrowRight" || e.key === "ArrowLeft") && kind === "sentence") {
    e.preventDefault();
    hopWord(document.activeElement as HTMLElement, e.key === "ArrowRight" ? 1 : -1);
    return;
  }
  if (meta || e.altKey) return;

  switch (e.key) {
    case "Enter": {
      if (e.shiftKey) return;
      e.preventDefault();
      if (mode === "edit") commit();
      else restore();
      return;
    }
    case "Tab": {
      e.preventDefault();
      if (e.shiftKey || kind === "note") {
        if (mode === "edit" && focusId === live().id) focusLive();
        else (document.activeElement as HTMLElement | null)?.blur();
        renderChrome();
      } else {
        focusNote();
      }
      return;
    }
    case "Escape": {
      e.preventDefault();
      if (kind === "note") {
        const rev = revById(focusId);
        rev.note = (rows.get(rev.id)!.note.textContent ?? "").trim();
        if (mode === "edit") focusLive();
        else (document.activeElement as HTMLElement | null)?.blur();
        render();
      } else if (mode === "banked") {
        toggleBankedOnly();
      } else if (mode === "browse") {
        goLatest();
      } else {
        // nothing left to escape from: back to the drafts
        save();
        location.hash = "#/";
      }
      return;
    }
    case "ArrowUp":
    case "ArrowDown": {
      const dir: 1 | -1 = e.key === "ArrowUp" ? -1 : 1;
      if (kind === "sentence" || kind === "note") {
        // inside a note or sentence, only leave once the caret is on its first / last visual line
        const edge = caretEdge(document.activeElement as HTMLElement);
        if ((dir === -1 && !edge.first) || (dir === 1 && !edge.last)) return;
      }
      e.preventDefault();
      step(dir);
      return;
    }
  }

  if (kind === "none" && mode !== "edit") {
    if (e.key === "b" || e.key === "B") {
      e.preventDefault();
      toggleBank();
      return;
    }
    if (e.key.length === 1 && mode === "browse") {
      goLatest();
    }
  }
}

document.addEventListener("keydown", (e) => {
  if (isPaletteOpen()) return; // the bar's own input handles its keys
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === "k" || e.key === "K")) {
    e.preventDefault();
    openCommands();
    return;
  }
  if (view === "editor") editorKeydown(e);
  else draftsKeydown(e);
});

// ---------- command bar ----------
// Everything the keys can do, by name, so nothing in the app needs a mouse or a memory.

function openCommands() {
  const prev = document.activeElement as HTMLElement | null;
  const restore = () => {
    if (view === "editor" && prev && prev !== document.body && app.contains(prev)) prev.focus();
  };
  const commands = view === "editor" ? editorCommands() : draftsCommands();
  openPalette(commands, { placeholder: view === "editor" ? "Type a command…" : "Type a command or a draft name…", restore });
}

/** The opening words of a draft, so two "Untitled"s can be told apart. */
function draftNote(d: Doc): string {
  const { latest } = lastThree(d);
  const t = latest?.text.trim() ?? "";
  return t.length > 48 ? `${t.slice(0, 48)}…` : t;
}

function otherDrafts(exceptId?: string): Command[] {
  return [...loadStore().docs]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((d) => d.id !== exceptId)
    .map((d) => ({
      id: `open:${d.id}`,
      label: `Open ${d.title || "Untitled"}`,
      note: draftNote(d),
      run: () => {
        location.hash = `#/d/${d.id}`;
      },
    }));
}

function editorCommands(): Command[] {
  const focusRev = revById(focusId);
  const editing = mode === "edit";
  const dark = effectiveDark(doc);
  const list: Command[] = [];
  if (editing) {
    list.push(
      { id: "new", label: "New revision", key: "↵", keywords: "next commit", run: () => commit() },
      { id: "blank", label: "Blank revision", key: "⌘↵", keywords: "empty clear new", run: () => commit(true) },
    );
  } else {
    list.push(
      { id: "restore", label: mode === "banked" ? "Continue from here" : "Restore as latest", key: "↵", keywords: "copy", run: () => restore() },
      { id: "latest", label: "Back to latest", key: "Esc", run: () => goLatest() },
    );
  }
  list.push(
    { id: "bank", label: focusRev.banked ? "Unbank this revision" : "Bank this revision", key: editing ? "⌘B" : "B", keywords: "keep save star", run: () => toggleBank() },
    { id: "note", label: focusRev.note ? "Edit note" : "Add a note", key: "Tab", keywords: "margin comment", run: () => focusNote() },
    { id: "banked", label: mode === "banked" ? "Show all revisions" : "View banked only", key: "⌘⇧B", keywords: "filter hide show", run: () => toggleBankedOnly() },
    { id: "first", label: "Go to first revision", key: "⌘↑", run: () => browseTo(visibleRevs()[0].id) },
    { id: "last", label: "Go to latest revision", key: "⌘↓", run: () => goLatest() },
    { id: "theme", label: dark ? "Light mode for this draft" : "Dark mode for this draft", key: "⌘⇧D", keywords: "theme invert", run: () => toggleTheme() },
    { id: "rename", label: "Rename this draft", keywords: "title", run: () => placeCaret(titleEl, "end") },
    { id: "newdraft", label: "New draft", keywords: "create file", run: () => createDraft() },
    { id: "home", label: "Back to drafts", key: "Esc", keywords: "dashboard home", run: () => { save(); location.hash = "#/"; } },
    ...otherDrafts(doc.id),
    { id: "delete", label: "Delete this draft", danger: true, keywords: "remove", run: () => deleteDraft(doc.id, true) },
  );
  return list;
}

function draftsCommands(): Command[] {
  const all = tiles();
  const selectedId = all[draftsFocus]?.dataset.id;
  const selected = selectedId ? getDoc(selectedId) : undefined;
  const list: Command[] = [{ id: "newdraft", label: "New draft", key: "N", keywords: "create file", run: () => createDraft() }];
  if (selected) {
    list.push({ id: "open", label: `Open ${selected.title || "Untitled"}`, note: draftNote(selected), key: "↵", run: () => { location.hash = `#/d/${selected.id}`; } });
  }
  list.push(
    ...otherDrafts(selected?.id),
    { id: "theme", label: globalDark ? "Light mode for the app" : "Dark mode for the app", keywords: "theme invert", run: () => toggleGlobalTheme() },
  );
  if (selected) {
    list.push({ id: "delete", label: `Delete ${selected.title || "Untitled"}`, note: draftNote(selected), key: "⌫", danger: true, keywords: "remove", run: () => deleteDraft(selected.id) });
  }
  return list;
}

document.addEventListener("paste", (e) => {
  if (view !== "editor") return;
  const kind = activeKind();
  if (kind !== "sentence" && kind !== "note" && kind !== "chrome") return;
  e.preventDefault();
  const text = (e.clipboardData?.getData("text/plain") ?? "").replace(/\s+/g, " ");
  document.execCommand("insertText", false, text);
});

window.addEventListener("resize", () => {
  for (const els of rows.values()) els.sig = "";
  scheduleLayout();
});
document.fonts?.ready.then(() => {
  if (view !== "editor") return;
  for (const els of rows.values()) els.sig = "";
  render({ instant: true });
});

const vv = window.visualViewport;
if (vv && touch) {
  const fit = () => {
    app.style.height = `${Math.round(vv.height)}px`;
    app.style.transform = `translateY(${Math.round(vv.offsetTop)}px)`;
    scheduleLayout();
  };
  vv.addEventListener("resize", fit);
  vv.addEventListener("scroll", fit);
  fit();
}

// ======================================================================
// Drafts dashboard
// ======================================================================

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Latest written sentence and the two before it, skipping an empty live line. */
function lastThree(d: Doc): { latest?: Rev; prev?: Rev; older?: Rev } {
  const written = d.revs.filter((r) => r.text.trim());
  const n = written.length;
  return { latest: written[n - 1], prev: written[n - 2], older: written[n - 3] };
}

function tileHtml(d: Doc): string {
  const { latest, prev, older } = lastThree(d);
  const banked = d.revs.filter((r) => r.banked).length;
  const count = d.revs.filter((r) => r.text.trim()).length;
  const prevLine = (r: Rev | undefined, cls: string) =>
    r ? `<div class="mini-prev ${cls}${r.banked ? " is-banked" : ""}">${escapeHtml(r.text)}</div>` : "";
  const latestHtml = latest
    ? `<div class="mini-live${latest.banked ? " is-banked" : ""}">${escapeHtml(latest.text)}</div>`
    : `<div class="mini-live is-empty">Write.</div>`;
  const parts = [`${count} ${count === 1 ? "revision" : "revisions"}`];
  if (banked) parts.push(`${banked} banked`);
  parts.push(ago(d.updatedAt));
  return `
    <a class="tile ${effectiveDark(d) ? "is-dark" : "is-light"}" href="#/d/${d.id}" data-id="${d.id}">
      <div class="mini">
        <div class="mini-stream">${prevLine(older, "is-older")}${prevLine(prev, "")}${latestHtml}</div>
      </div>
      <div class="tile-meta">
        <div class="tile-row">
          <span class="tile-title">${escapeHtml(d.title || "Untitled")}</span>
          <button type="button" class="tile-delete" data-delete="${d.id}" title="Delete draft (⌫)">Delete</button>
        </div>
        <span class="tile-sub">${parts.join(" · ")}</span>
      </div>
    </a>`;
}

function mountDrafts() {
  view = "drafts";
  app.dataset.theme = globalDark ? "dark" : "light";
  const docs = [...loadStore().docs].sort((a, b) => b.updatedAt - a.updatedAt);
  app.innerHTML = `
    <header class="topbar">
      <div class="crumbs"><span class="project"><img class="mark" src="${MARK}" alt="" />Revisions</span></div>
      <div class="counter">
        <span>${docs.length} ${docs.length === 1 ? "draft" : "drafts"}</span>
        <button type="button" class="theme-toggle" title="Dark or light for the whole app">${globalDark ? "Light" : "Dark"}</button>
        <button type="button" class="act new-draft">New draft</button>
      </div>
    </header>
    <main class="drafts">
      ${
        docs.length
          ? `<div class="tiles">${docs.map(tileHtml).join("")}</div>`
          : `<div class="drafts-empty"><div class="mini-live is-empty">Write.</div><p>Nothing here yet. Start a draft and rewrite one sentence until it sings.</p></div>`
      }
    </main>
    <footer class="footer"><div class="hints">${
      touch ? `<button type="button" class="act drafts-commands">Commands</button>` : `<div class="hint"><kbd>← ↑ ↓ →</kbd><span>Choose</span></div><div class="hint"><kbd>↵</kbd><span>Open</span></div><div class="hint"><kbd>⌫</kbd><span>Delete</span></div><div class="hint"><kbd>N</kbd><span>New draft</span></div><div class="hint"><kbd>⌘K</kbd><span>Commands</span></div>`
    }</div></footer>
  `;
  app.querySelector(".new-draft")!.addEventListener("click", createDraft);
  app.querySelector(".theme-toggle")!.addEventListener("click", toggleGlobalTheme);
  app.querySelector(".drafts-commands")?.addEventListener("click", openCommands);
  app.querySelectorAll<HTMLButtonElement>(".tile-delete").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteDraft(b.dataset.delete!);
    });
  });
  // hovering moves the keyboard selection too, so the two never disagree
  app.querySelectorAll<HTMLElement>(".tile").forEach((t, i) => {
    t.addEventListener("mouseenter", () => selectTile(i));
  });
  selectTile(Math.min(draftsFocus, docs.length - 1));
}

function deleteDraft(id: string, fromEditor = false) {
  const d = getDoc(id);
  if (!d) return;
  const { latest } = lastThree(d);
  const label = latest ? `“${latest.text.slice(0, 60)}${latest.text.length > 60 ? "…" : ""}”` : d.title;
  if (window.confirm(`Delete ${label}? This can't be undone.`)) {
    removeDoc(d.id);
    if (fromEditor) {
      dirty = false; // nothing left to save
      location.hash = "#/";
    } else mountDrafts();
  }
}

// ---------- keyboard selection of tiles ----------

let draftsFocus = 0;

function tiles(): HTMLElement[] {
  return Array.from(app.querySelectorAll<HTMLElement>(".tile"));
}

function selectTile(i: number) {
  const all = tiles();
  if (!all.length) return;
  draftsFocus = Math.max(0, Math.min(i, all.length - 1));
  all.forEach((t, k) => t.classList.toggle("is-selected", k === draftsFocus));
  all[draftsFocus].scrollIntoView({ block: "nearest" });
}

/** Tiles per row, read from the layout so it stays right at any width. */
function tileColumns(): number {
  const all = tiles();
  if (all.length < 2) return 1;
  const top = all[0].offsetTop;
  let n = 1;
  while (n < all.length && all[n].offsetTop === top) n++;
  return n;
}

function createDraft() {
  const d = newDoc();
  addDoc(d);
  location.hash = `#/d/${d.id}`;
}

function draftsKeydown(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const all = tiles();
  const cols = tileColumns();
  switch (e.key) {
    case "n":
    case "N":
      e.preventDefault();
      createDraft();
      return;
    case "ArrowRight":
      e.preventDefault();
      selectTile(draftsFocus + 1);
      return;
    case "ArrowLeft":
      e.preventDefault();
      selectTile(draftsFocus - 1);
      return;
    case "ArrowDown":
      e.preventDefault();
      if (draftsFocus + cols < all.length) selectTile(draftsFocus + cols);
      return;
    case "ArrowUp":
      e.preventDefault();
      if (draftsFocus - cols >= 0) selectTile(draftsFocus - cols);
      return;
    case "Enter": {
      const t = all[draftsFocus];
      if (t) {
        e.preventDefault();
        location.hash = `#/d/${t.dataset.id}`;
      }
      return;
    }
    case "Backspace":
    case "Delete": {
      const t = all[draftsFocus];
      if (t) {
        e.preventDefault();
        deleteDraft(t.dataset.id!);
      }
      return;
    }
  }
}

// ======================================================================
// Router
// ======================================================================

function route() {
  closePalette(false);
  if (view === "editor") save();
  const m = location.hash.match(/^#\/d\/([a-z0-9]+)/i);
  if (m) {
    const d = getDoc(m[1]);
    if (d) {
      mountEditor(d);
      return;
    }
  }
  mountDrafts();
}

window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", () => {
  if (view === "editor" && dirty) save();
});

// first run: no drafts at all → straight into a fresh one
const boot = loadStore();
if (!location.hash && boot.docs.length === 0) {
  const d = newDoc();
  addDoc(d);
  location.replace(`#/d/${d.id}`);
}
route();
