// Command bar (⌘K). Same bones as the Possible Forms palette: a panel a little way
// down the page over a scrim, one input, a list of rows with a key chip on the
// right, and a hints footer. Revisions' own colours, via the CSS variables.
//
// Two extras on top of a flat list: a row can carry `children` (Tab or → drills
// into them, Backspace on an empty box or Esc climbs back out), and a row can
// carry a `prompt`, which turns the box into a one-line text field (Return
// saves, Esc backs out) so a draft can be renamed without leaving the bar.

import { ChevronRight, createElement, type IconNode } from "lucide";

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
  /** Runs on Return. Rows with a `prompt` instead collect text first. */
  run?: () => void;
  /** A sub-list reached with Tab or →; the crumb (or the label) sits above the box. */
  children?: () => Command[];
  crumb?: string;
  /** Turn the box into a text field; `submit` runs with the trimmed text on Return. */
  prompt?: { placeholder?: string; value?: string; submit: (text: string) => void };
};

type Options = {
  placeholder?: string;
  /** Called after the bar closes, whether or not a command ran. */
  restore?: () => void;
};

type Level = { commands: Command[]; crumb?: string; placeholder: string; prompt?: Command["prompt"]; query?: string };

let root: HTMLElement | null = null;
let levels: Level[] = [];
let shown: Command[] = [];
let sel = 0;
let restore: (() => void) | undefined;

export const isPaletteOpen = () => root !== null;

export function openPalette(commands: Command[], opts: Options = {}) {
  closePalette(false);
  levels = [{ commands, placeholder: opts.placeholder ?? "Type a command…" }];
  restore = opts.restore;

  root = document.createElement("div");
  root.className = "palette-backdrop";
  root.innerHTML = `
    <div class="palette" role="dialog" aria-label="Commands">
      <div class="palette-head">
        <span class="palette-crumb" hidden></span>
        <input class="palette-input" type="text" spellcheck="false" autocomplete="off" />
      </div>
      <ol class="palette-results"></ol>
      <footer class="palette-hints"></footer>
    </div>`;
  document.body.appendChild(root);

  const crumb = root.querySelector<HTMLElement>(".palette-crumb")!;
  const input = root.querySelector<HTMLInputElement>(".palette-input")!;
  const list = root.querySelector<HTMLOListElement>(".palette-results")!;
  const hints = root.querySelector<HTMLElement>(".palette-hints")!;

  const top = () => levels[levels.length - 1];

  const renderHints = () => {
    const l = top();
    const h: string[] = [];
    if (l.prompt) {
      h.push("<span><kbd>↩</kbd> save</span>", "<span><kbd>esc</kbd> back</span>");
    } else {
      h.push("<span><kbd>↑↓</kbd> choose</span>", "<span><kbd>↩</kbd> run</span>");
      if (shown[sel]?.children) h.push("<span><kbd>⇥</kbd> actions</span>");
      if (levels.length > 1) h.push("<span><kbd>⌫</kbd> back</span>");
      h.push(`<span><kbd>esc</kbd> ${levels.length > 1 ? "back" : "close"}</span>`);
    }
    hints.innerHTML = h.join("");
  };

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
          ${c.children ? `<span class="palette-more">${createElement(ChevronRight, { width: 14, height: 14, "stroke-width": 1.75 }).outerHTML}</span>` : ""}
        </button>
      </li>`,
      )
      .join("");
    const active = list.querySelectorAll<HTMLElement>(".palette-item")[sel];
    active?.scrollIntoView({ block: "nearest" });
    renderHints();
  };

  const filter = () => {
    const q = input.value.trim().toLowerCase();
    const all = top().commands;
    shown = q ? all.filter((c) => score(c, q) > 0).sort((a, b) => score(b, q) - score(a, q)) : all;
    sel = 0;
    render();
  };

  /** Show the top level: crumb, placeholder, and either the list or the text field. */
  const show = () => {
    const l = top();
    crumb.textContent = l.crumb ?? "";
    crumb.hidden = !l.crumb;
    input.placeholder = l.placeholder;
    list.hidden = !!l.prompt;
    if (l.prompt) {
      input.value = l.prompt.value ?? "";
      input.select();
      shown = [];
      renderHints();
    } else {
      input.value = l.query ?? "";
      filter();
    }
    input.focus();
  };

  const push = (l: Level) => {
    top().query = input.value; // so backing out lands where you were
    levels.push(l);
    show();
  };

  const pop = () => {
    if (levels.length <= 1) {
      closePalette(true);
      return;
    }
    levels.pop();
    show();
  };

  const run = (c: Command | undefined) => {
    if (!c) return;
    if (c.prompt) {
      push({ commands: [], crumb: c.label, placeholder: c.prompt.placeholder ?? "", prompt: c.prompt });
      return;
    }
    if (c.run) {
      closePalette(true);
      c.run();
    } else if (c.children) drill(c);
  };

  const drill = (c: Command | undefined) => {
    if (!c?.children) return;
    push({ commands: c.children(), crumb: c.crumb ?? c.label, placeholder: "Type an action…" });
  };

  input.addEventListener("input", () => {
    if (!top().prompt) filter();
  });
  input.addEventListener("keydown", (e) => {
    const l = top();
    if (l.prompt) {
      if (e.key === "Enter") {
        e.preventDefault();
        const text = input.value.trim();
        const submit = l.prompt.submit;
        closePalette(true);
        submit(text);
      } else if (e.key === "Escape") {
        e.preventDefault();
        pop();
      }
      e.stopPropagation();
      return;
    }
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
    } else if (e.key === "Tab" || (e.key === "ArrowRight" && !input.value)) {
      e.preventDefault();
      drill(shown[sel]);
    } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && !input.value && levels.length > 1) {
      e.preventDefault();
      pop();
    } else if (e.key === "Escape") {
      e.preventDefault();
      pop();
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
    if (!b) return;
    const c = shown[Number(b.dataset.i)];
    // the chevron drills in; the rest of the row runs
    if ((e.target as HTMLElement).closest(".palette-more")) drill(c);
    else run(c);
  });
  root.addEventListener("mousedown", (e) => {
    if (e.target === root) {
      e.preventDefault();
      closePalette(true);
    }
  });

  show();
}

export function closePalette(giveBack = true) {
  if (!root) return;
  root.remove();
  root = null;
  levels = [];
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
