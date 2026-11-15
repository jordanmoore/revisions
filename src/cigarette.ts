// A cigarette, first person. An Easter egg for when the sentence will not come.
//
// Light one from the command bar and a hand comes up from the bottom right of
// the page, the way a 1996 shooter would draw it: a digitised hand, four frames
// on a sprite sheet (public/cig.png, cut from art/cig-sheet-light.png by
// art/slice.py). A Zippo comes up, the flame catches, the lighter drops away.
// Take a drag (⌘⇧S, or click the hand) and the hand lifts it to your mouth, the
// ember flares, the hand drops back, and a slow breath of smoke rolls up over
// the page from below. It burns down on its own in a few minutes, the paper
// shortening and ash dropping off, then goes out and the hand falls away. Esc,
// or the command bar, stubs it out sooner. Nothing is saved; the whole thing
// lives in this file and one block of style.css.

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  grow: number;
  life: number; // seconds left
  span: number; // seconds total
  alpha: number;
  wobble: number;
  phase: number;
  kind: "smoke" | "ash";
};

const BURN_SECONDS = 240; // a whole cigarette, left alone
const DRAG_COST = 8; // seconds burned by one drag

// the sheet: four frames side by side, each FW×FH sprite pixels, drawn at an integer scale
// picked from the size of the page: the hand should take about a third of its height
const SHEET = `${import.meta.env.BASE_URL}cig.png`;
const FW = 155;
const FH = 83;
let scale = 2;
const FRAME = { rest: 0, lighter: 1, flame: 2, caught: 3 } as const;
// where the lit end sits in the rest frame, and the first row of the hand across the stick
const TIP = { x: 84, y: 18 };
const FINGER = 40;
// the columns the cigarette (and its glow) lives in; this band slides down as it burns
const BAND = { x0: 70, x1: 98 };
const BURN_PX = 13; // rows of paper gone by the end: a stub of five or so is left

let root: HTMLElement | null = null;
let hand: HTMLElement | null = null;
let sprite: HTMLCanvasElement | null = null;
let sctx: CanvasRenderingContext2D | null = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let stage: HTMLElement | null = null;
let sheet: HTMLImageElement | null = null;

let lit = false; // from the moment it is lit until it is stubbed out
let burning = false; // once the flame has caught: smoke, burn-down, drags
let dragging = false;
let frame: number = FRAME.rest;
let burn = 0; // sprite rows of paper gone
let burnt = 0; // seconds of cigarette gone
let ash = 0; // ash hanging off the end, in no particular unit
let lastTick = 0;
let raf = 0;
let particles: Particle[] = [];
let exhale: { left: number; acc: number; x: number; y: number; k: number; kh: number } | null = null;
let blobs: Record<string, HTMLCanvasElement> = {};
let timers: number[] = [];

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const isLit = () => lit;

/** The sheet, loaded once. Resolves either way so a missing file never traps the hand below the page. */
function loadSheet(): Promise<void> {
  if (sheet?.complete) return Promise.resolve();
  if (!sheet) {
    sheet = new Image();
    sheet.src = SHEET;
  }
  const img = sheet;
  return new Promise((done) => {
    if (img.complete) return done();
    img.addEventListener("load", () => done(), { once: true });
    img.addEventListener("error", () => done(), { once: true });
  });
}

/** Light one. `host` is the editor's stage; the hand and the smoke are drawn inside it. */
export function light(host: HTMLElement) {
  if (lit) return;
  stage = host;
  lit = true;
  burning = false;
  dragging = false;
  burn = 0;
  burnt = 0;
  ash = 0;
  particles = [];
  exhale = null;

  canvas = document.createElement("canvas");
  canvas.className = "smoke";
  ctx = canvas.getContext("2d");
  host.appendChild(canvas);

  root = document.createElement("div");
  root.className = "cig";
  root.innerHTML = `
    <div class="cig-hand" role="img" aria-label="A cigarette, held between two fingers" title="Take a drag (⌘⇧S)">
      <canvas class="cig-sprite"></canvas>
      <div class="cig-glow"></div>
    </div>`;
  host.appendChild(root);
  hand = root.querySelector<HTMLElement>(".cig-hand");
  hand?.addEventListener("click", () => drag());
  sprite = root.querySelector<HTMLCanvasElement>(".cig-sprite");
  sctx = sprite?.getContext("2d") ?? null;

  layout();
  window.addEventListener("resize", layout);

  loadSheet().then(() => {
    if (!lit || !root) return;
    // the hand comes up with the lighter already out; the flame follows once it is in place
    frame = FRAME.lighter;
    draw();
    requestAnimationFrame(() => root?.classList.add("is-lit"));
    const rise = reduced() ? 0 : 800;
    const beat = reduced() ? 0 : 500;
    timers.push(
      window.setTimeout(() => show(FRAME.flame), rise + 150),
      window.setTimeout(() => show(FRAME.caught), rise + 150 + beat),
      window.setTimeout(() => {
        show(FRAME.rest);
        burning = true;
        root?.classList.add("is-burning");
        lastTick = performance.now();
      }, rise + 150 + beat * 2),
    );
  });
  lastTick = performance.now();
  raf = requestAnimationFrame(tick);
}

/** Lift it to the mouth, pull, drop the hand, breathe out. Ignored mid-drag or while lighting. */
export function drag() {
  if (!lit || !burning || dragging || !root) return;
  dragging = true;
  root.classList.add("is-dragging");
  const rise = reduced() ? 0 : 900;
  const hold = 1000;
  const fall = reduced() ? 0 : 900;
  timers.push(
    window.setTimeout(() => root?.classList.add("is-pulling"), rise),
    window.setTimeout(() => {
      root?.classList.remove("is-pulling", "is-dragging");
      burnt += DRAG_COST;
      ash += 6;
    }, rise + hold),
    window.setTimeout(() => {
      dragging = false;
      if (!stage || reduced()) return;
      const r = stage.getBoundingClientRect();
      // from the mouth, just inside the bottom edge, the middle of the page. The cloud is sized
      // to the page: about two thirds of its width, rising to hang around the middle
      exhale = { left: 2.8, acc: 0, x: r.width * 0.5, y: r.height - 24, k: r.width / 900, kh: Math.max(0.8, r.height / 1200) };
    }, rise + hold + fall * 0.4),
  );
}

/** Put it out. The hand drops away; everything is cleaned up once it has gone. */
export function stubOut(immediate = false) {
  if (!lit) return;
  lit = false;
  burning = false;
  dragging = false;
  timers.forEach(clearTimeout);
  timers = [];
  root?.classList.remove("is-lit", "is-dragging", "is-pulling", "is-burning");
  root?.classList.add("is-out");
  const linger = immediate || reduced() ? 0 : 900;
  timers.push(
    window.setTimeout(() => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", layout);
      root?.remove();
      canvas?.remove();
      root = hand = sprite = sctx = canvas = ctx = stage = null;
      particles = [];
      exhale = null;
    }, linger + (immediate ? 0 : 4000)), // the last of the smoke clears first
  );
  if (!immediate) {
    // the canvas stays a few seconds for the smoke already in the air
    timers.push(window.setTimeout(() => root?.remove(), linger));
  }
}

// ---------- the hand ----------

/** Size the hand to the page and put it a little right of centre, as a right hand would hold it. */
function layout() {
  sizeCanvas();
  if (!root || !sprite || !stage) return;
  const r = stage.getBoundingClientRect();
  scale = Math.max(2, Math.min(5, Math.floor(r.height / 230), Math.floor((r.width * 0.7) / FW)));
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  sprite.width = Math.round(FW * scale * dpr);
  sprite.height = Math.round(FH * scale * dpr);
  sprite.style.width = `${FW * scale}px`;
  sprite.style.height = `${FH * scale}px`;
  sctx?.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  root.style.left = `${Math.round(Math.min(r.width * 0.6 - TIP.x * scale, r.width - FW * scale))}px`;
  placeGlow();
  draw();
}

function show(f: number) {
  frame = f;
  draw();
}

/** Stamp the current frame. In the rest frame the cigarette's band is drawn lower as it burns. */
function draw() {
  if (!sctx || !sheet?.complete || !sheet.naturalWidth) return;
  const g = sctx;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, FW, FH);
  const sx = frame * FW;
  if (burn === 0 || frame !== FRAME.rest) {
    g.drawImage(sheet, sx, 0, FW, FH, 0, 0, FW, FH);
    return;
  }
  const bw = BAND.x1 - BAND.x0;
  // either side of the cigarette, untouched
  g.drawImage(sheet, sx, 0, BAND.x0, FH, 0, 0, BAND.x0, FH);
  g.drawImage(sheet, sx + BAND.x1, 0, FW - BAND.x1, FH, BAND.x1, 0, FW - BAND.x1, FH);
  // the hand across the stick, untouched
  g.drawImage(sheet, sx + BAND.x0, FINGER, bw, FH - FINGER, BAND.x0, FINGER, bw, FH - FINGER);
  // the stick above the fingers, minus the paper that has burned, moved down to meet them
  g.drawImage(sheet, sx + BAND.x0, 0, bw, FINGER - burn, BAND.x0, burn, bw, FINGER - burn);
}

function placeGlow() {
  const glow = root?.querySelector<HTMLElement>(".cig-glow");
  if (!glow) return;
  const d = 7 * scale;
  glow.style.width = glow.style.height = `${d}px`;
  glow.style.margin = `${-d / 2}px 0 0 ${-d / 2}px`;
  glow.style.left = `${TIP.x * scale}px`;
  glow.style.top = `${(TIP.y + burn) * scale}px`;
}

/** The ember's position on the page, for the wisp of smoke that comes off it. */
function tipOnPage(): { x: number; y: number } | null {
  if (!root || !stage) return null;
  const g = root.querySelector<HTMLElement>(".cig-glow");
  if (!g) return null;
  const r = g.getBoundingClientRect();
  const s = stage.getBoundingClientRect();
  return { x: r.left + r.width / 2 - s.left, y: r.top + r.height / 2 - s.top };
}

// ---------- the smoke ----------

function sizeCanvas() {
  if (!canvas || !stage) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = stage.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  canvas.style.width = `${r.width}px`;
  canvas.style.height = `${r.height}px`;
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** One soft blob, drawn once per colour and stamped for every particle. */
function blob(color: string): HTMLCanvasElement {
  if (blobs[color]) return blobs[color];
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, `rgb(${color} / 0.55)`);
  grad.addColorStop(0.4, `rgb(${color} / 0.22)`);
  grad.addColorStop(1, `rgb(${color} / 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  blobs[color] = c;
  return c;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** `k` scales a breath's size and spread with the page's width, `kh` its rise with the height. */
function spawnSmoke(x: number, y: number, n: number, big: boolean, k = 1, kh = 1) {
  for (let i = 0; i < n; i++) {
    const span = big ? rnd(11, 17) : rnd(3, 5);
    particles.push({
      x: x + rnd(-14, 14) * k,
      y: y + rnd(-4, 4),
      vx: big ? rnd(-90, 90) * k : rnd(-4, 4),
      // a breath out: fast off the lips, then it hangs and keeps climbing
      vy: big ? rnd(-320, -200) * kh : rnd(-30, -18),
      r: big ? rnd(22, 44) * k : rnd(5, 9),
      grow: big ? rnd(10, 18) * k : rnd(4, 7),
      life: span,
      span,
      alpha: big ? rnd(0.2, 0.32) : rnd(0.2, 0.35),
      wobble: big ? rnd(20, 44) * k : rnd(8, 22),
      phase: rnd(0, Math.PI * 2),
      kind: "smoke",
    });
  }
}

function dropAsh() {
  const tip = tipOnPage();
  if (!tip) return;
  for (let i = 0; i < 4; i++) {
    particles.push({
      x: tip.x + rnd(-3, 3),
      y: tip.y,
      vx: rnd(-6, 6),
      vy: rnd(10, 30),
      r: rnd(1.5, 3),
      grow: 0,
      life: 1.4,
      span: 1.4,
      alpha: 0.7,
      wobble: 4,
      phase: rnd(0, Math.PI * 2),
      kind: "ash",
    });
  }
}

function tick(now: number) {
  raf = requestAnimationFrame(tick);
  const dt = Math.max(0, Math.min(0.05, (now - lastTick) / 1000));
  lastTick = now;

  if (burning) {
    burnt += dt;
    // a thin wisp off the ember, thicker while pulling on it
    if (!reduced()) {
      const tip = tipOnPage();
      const pulling = root?.classList.contains("is-pulling");
      if (tip && Math.random() < (pulling ? 0.5 : 0.12)) spawnSmoke(tip.x, tip.y - 4, 1, false);
    }
    // ash builds and falls
    ash += dt * 0.5;
    if (ash > 16) {
      ash = 1;
      if (!reduced()) dropAsh();
    }
    // the paper shortens a row at a time
    const b = Math.min(BURN_PX, Math.floor((burnt / BURN_SECONDS) * BURN_PX));
    if (b !== burn) {
      burn = b;
      draw();
      placeGlow();
    }
    if (burnt >= BURN_SECONDS) stubOut();
  }

  if (exhale && stage) {
    exhale.left -= dt;
    // a slow breath: thick at first, trailing off
    const rate = exhale.left > 1.8 ? 64 : exhale.left > 0.8 ? 30 : 8;
    exhale.acc += rate * dt;
    const n = Math.floor(exhale.acc);
    exhale.acc -= n;
    if (n) spawnSmoke(exhale.x + rnd(-50, 50) * exhale.k, exhale.y, n, true, exhale.k, exhale.kh);
    if (exhale.left <= 0) exhale = null;
  }

  // move and draw
  if (!ctx || !canvas || !stage) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  const dark = stage.closest<HTMLElement>("#app")?.dataset.theme === "dark";
  const smokeColor = dark ? "235 235 235" : "90 90 90";
  const ashColor = dark ? "180 180 176" : "120 120 116";
  const t = now / 1000;
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.life -= dt;
    const age = 1 - p.life / p.span;
    if (p.kind === "smoke") {
      // rises, slows, drifts sideways on its own wobble and a little wind
      p.vy *= 1 - 0.55 * dt;
      p.vx *= 1 - 0.5 * dt;
      p.x += (p.vx + Math.sin(t * 0.8 + p.phase) * p.wobble + 6) * dt;
      p.y += (p.vy - 30) * dt; // never quite stops rising
      p.r += p.grow * dt;
      const fade = age < 0.12 ? age / 0.12 : 1 - (age - 0.12) / 0.88;
      const a = p.alpha * fade * (dark ? 0.55 : 0.5);
      ctx.globalAlpha = Math.max(0, a);
      const s = blob(smokeColor);
      ctx.drawImage(s, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    } else {
      p.vy += 40 * dt;
      p.x += (p.vx + Math.sin(t * 6 + p.phase) * p.wobble) * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = p.alpha * (1 - age);
      ctx.fillStyle = `rgb(${ashColor})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  if (!lit && !particles.length && !exhale) cancelAnimationFrame(raf);
}
