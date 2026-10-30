// Command bar (⌘K). Same bones as the Possible Forms palette: a panel a little way
// down the page over a scrim, one input, a list of rows with a key chip on the
// right, and a hints footer. Revisions' own colours, via the CSS variables.

import { createElement, type IconNode } from "lucide";

export type Command = {
  id: string;
  label: string;
  /** Lucide icon node, drawn in the slot before the label. */
  icon?: IconNode;
  /** Shortcut shown as a key chip on the right, e.g. "⌘B". */
  key?: string;
  /** Small grey text on the right, e.g. the opening words of a draft. */
  note?: string;
  /** Extra words that should match in search but are not shown. */
  keywords?: string;
  danger?: boolean;
  run: () => void;
};

type Options = {
  placeholder?: string;
  /** Called after the bar closes, whether or not a command ran. */
  restore?: () => void;
};

let root: HTMLElement | null = null;
let all: Command[] = [];
let shown: Command[] = [];
let sel = 0;
let restore: (() => void) | undefined;

export const isPaletteOpen = () => root !== null;

export function openPalette(commands: Command[], opts: Options = {}) {
  closePalette(false);
  all = commands;
  restore = opts.restore;

  root = document.createElement("div");
  root.className = "palette-backdrop";
  root.innerHTML = `
    <div class="palette" role="dialog" aria-label="Commands">
      <input class="palette-input" type="text" spellcheck="false" autocomplete="off" placeholder="${opts.placeholder ?? "Type a command…"}" />
      <ol class="palette-results"></ol>
      <footer class="palette-hints">
        <span><kbd>↑↓</kbd> choose</span>
        <span><kbd>↩</kbd> run</span>
        <span><kbd>esc</kbd> close</span>
      </footer>
    </div>`;
  document.body.appendChild(root);

  const input = root.querySelector<HTMLInputElement>(".palette-input")!;
  const list = root.querySelector<HTMLOListElement>(".palette-results")!;

  const render = () => {
    list.innerHTML = shown
      .map(
        (c, i) => `
      <li>
        <button type="button" class="palette-item${i === sel ? " -selected" : ""}${c.danger ? " -danger" : ""}" data-i="${i}">
          <span class="palette-kind">${c.icon ? createElement(c.icon, { width: 16, height: 16, "stroke-width": 1.75 }).outerHTML : ""}</span>
          <span class="palette-label">${escape(c.label)}</span>
          ${c.note ? `<span class="palette-note">${escape(c.note)}</span>` : ""}
          ${c.key ? `<kbd>${escape(c.key)}</kbd>` : ""}
        </button>
      </li>`,
      )
      .join("");
    const active = list.querySelectorAll<HTMLElement>(".palette-item")[sel];
    active?.scrollIntoView({ block: "nearest" });
  };

  const filter = () => {
    const q = input.value.trim().toLowerCase();
    shown = q ? all.filter((c) => score(c, q) > 0).sort((a, b) => score(b, q) - score(a, q)) : all;
    sel = 0;
    render();
  };

  const run = (c: Command | undefined) => {
    if (!c) return;
    closePalette(true);
    c.run();
  };

  input.addEventListener("input", filter);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      sel = Math.min(sel + 1, shown.length - 1);
      render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      sel = Math.max(sel - 1, 0);
      render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(shown[sel]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePalette(true);
    }
    e.stopPropagation();
  });
  list.addEventListener("mousemove", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>(".palette-item");
    if (b && Number(b.dataset.i) !== sel) {
      sel = Number(b.dataset.i);
      render();
    }
  });
  list.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>(".palette-item");
    if (b) run(shown[Number(b.dataset.i)]);
  });
  root.addEventListener("mousedown", (e) => {
    if (e.target === root) {
      e.preventDefault();
      closePalette(true);
    }
  });

  filter();
  input.focus();
}

export function closePalette(giveBack = true) {
  if (!root) return;
  root.remove();
  root = null;
  const r = restore;
  restore = undefined;
  if (giveBack) r?.();
}

/** Starts-with beats contains; keywords count a little less than the label. */
function score(c: Command, q: string): number {
  const label = c.label.toLowerCase();
  if (label.startsWith(q)) return 3;
  if (label.includes(q)) return 2;
  if (c.keywords?.toLowerCase().includes(q) || c.note?.toLowerCase().includes(q)) return 1;
  return 0;
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
