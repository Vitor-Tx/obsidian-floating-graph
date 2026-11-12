import { ItemView, MarkdownRenderer, Plugin, TFile, debounce } from "obsidian";
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY, SimulationNodeDatum } from "d3-force";
import { splitNote, hash } from "./parse";

const VIEW = "floating-graph";

interface Node extends SimulationNodeDatum {
  file: TFile; nb: Set<Node>; out: Node[]; z: number; phase: number; r: number;
  x: number; y: number; sx: number; sy: number; sr: number;
}

export default class FloatingGraphPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW, (leaf) => new FloatingGraphView(leaf));
    this.addRibbonIcon("orbit", "Open floating graph", () => this.open());
    this.addCommand({ id: "open", name: "Open graph", callback: () => this.open() });
  }
  async open() {
    const leaf = this.app.workspace.getLeavesOfType(VIEW)[0] ?? this.app.workspace.getLeaf("tab");
    // active: true já traz a aba para a frente (revealLeaf só devolve Promise a partir da 1.7.2)
    await leaf.setViewState({ type: VIEW, active: true });
  }
}

class FloatingGraphView extends ItemView {
  nodes: Node[] = [];
  byPath = new Map<string, Node>();
  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  panel!: HTMLElement;
  content!: HTMLElement;
  W = 0; H = 0; dpr = 1;
  cam = { x: 0, y: 0, k: 0.9 }; goal = { x: 0, y: 0, k: 0.9 };
  selected: Node | null = null; hovered: Node | null = null;
  frame = 0;

  getViewType() { return VIEW; }
  getDisplayText() { return "Floating graph"; }
  getIcon() { return "orbit"; }

  async onOpen() {
    const root = this.contentEl;
    root.empty(); root.addClass("fg-root");
    this.canvas = root.createEl("canvas");
    this.ctx = this.canvas.getContext("2d")!;
    this.panel = root.createDiv("fg-panel");
    const close = this.panel.createEl("button", { cls: "fg-close", text: "✕", attr: { "aria-label": "Close" } });
    close.onclick = () => this.closePanel();
    this.content = this.panel.createDiv();

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(root);
    this.register(() => ro.disconnect());
    this.resize();
    this.build();
    // Nota nova, apagada ou link mudou: refaz o grafo (o layout muda junto)
    this.registerEvent(this.app.metadataCache.on("resolved", debounce(() => this.build(), 1500, true)));
    this.bindInput();
    // Aba em segundo plano (escondida) não desenha, para não gastar CPU à toa
    const loop = (t: number) => { if (this.contentEl.isShown()) this.draw(t); this.frame = window.requestAnimationFrame(loop); };
    this.frame = window.requestAnimationFrame(loop);
  }
  async onClose() { window.cancelAnimationFrame(this.frame); }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    this.W = this.contentEl.clientWidth; this.H = this.contentEl.clientHeight;
    this.canvas.width = this.W * this.dpr; this.canvas.height = this.H * this.dpr;
  }

  build() {
    const files = this.app.vault.getMarkdownFiles();
    this.byPath = new Map();
    this.nodes = files.map((file) => {
      const n = { file, nb: new Set(), out: [], z: hash(file.path) * 2 - 1, phase: hash(file.path + "~") * Math.PI * 2 } as unknown as Node;
      this.byPath.set(file.path, n);
      return n;
    });
    const links: { source: Node; target: Node }[] = [];
    for (const [from, targets] of Object.entries(this.app.metadataCache.resolvedLinks)) {
      const a = this.byPath.get(from);
      for (const to of Object.keys(targets)) {
        const b = this.byPath.get(to);
        if (!a || !b || a === b) continue;
        a.out.push(b); a.nb.add(b); b.nb.add(a); links.push({ source: a, target: b });
      }
    }
    this.nodes.forEach((n) => (n.r = 9 + Math.sqrt(n.nb.size) * 2.2));
    // Layout calculado de uma vez antes de desenhar, para não "tremer" ao abrir
    forceSimulation(this.nodes)
      .force("link", forceLink(links).distance(110).strength(0.15))
      .force("charge", forceManyBody().strength(-560))
      .force("collide", forceCollide<Node>((d) => d.r * 1.8))
      .force("x", forceX(0).strength(0.04)).force("y", forceY(0).strength(0.04))
      .stop().tick(400);
    const mx = this.nodes.reduce((s, n) => s + n.x, 0) / (this.nodes.length || 1);
    const my = this.nodes.reduce((s, n) => s + n.y, 0) / (this.nodes.length || 1);
    this.nodes.forEach((n) => { n.x -= mx; n.y -= my; });
    if (this.selected) this.selected = this.byPath.get(this.selected.file.path) ?? null;
  }

  persp(z: number) { return 1 / (1 - z * 0.38); }
  panelOpen() { return this.contentEl.hasClass("fg-open"); }
  center() {
    if (!this.panelOpen()) return { cx: this.W / 2, cy: this.H / 2 };
    return this.W <= 640 ? { cx: this.W / 2, cy: this.H * 0.19 } : { cx: (this.W - Math.min(380, this.W)) / 2, cy: this.H / 2 };
  }

  draw(time: number) {
    const { ctx, cam, goal } = this, ease = 0.075;
    cam.x += (goal.x - cam.x) * ease; cam.y += (goal.y - cam.y) * ease; cam.k += (goal.k - cam.k) * ease;
    const dk = this.contentEl.doc.body.hasClass("theme-dark");
    const { cx, cy } = this.center();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    for (const n of this.nodes) {
      const wx = n.x + Math.sin(time * 0.00035 + n.phase) * 6, wy = n.y + Math.cos(time * 0.00029 + n.phase * 1.3) * 6;
      const p = this.persp(n.z + Math.sin(time * 0.0002 + n.phase) * 0.04);
      n.sx = cx + (wx - cam.x) * cam.k * p; n.sy = cy + (wy - cam.y) * cam.k * p; n.sr = n.r * cam.k * p;
    }
    const active = this.hovered ?? this.selected;
    const order = [...this.nodes].sort((a, b) => a.z - b.z);
    const ink = dk ? "240,240,236" : "20,20,20";

    // Linhas só do nó ativo, com pontinhos correndo nelas
    if (active) {
      ctx.lineWidth = 0.7;
      for (const b of active.nb) {
        ctx.strokeStyle = `rgba(${ink},.33)`;
        ctx.beginPath(); ctx.moveTo(active.sx, active.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
        ctx.fillStyle = `rgba(${ink},.75)`;
        for (let i = 0; i < 3; i++) {
          const f = (time * 0.00022 + i / 3 + hash(b.file.path)) % 1;
          ctx.beginPath(); ctx.arc(active.sx + (b.sx - active.sx) * f, active.sy + (b.sy - active.sy) * f, 1.3, 0, 7); ctx.fill();
        }
      }
    }
    // Perto = escuro e grande; longe = claro e pequeno
    for (const n of order) {
      const on = active && (n === active || active.nb.has(n));
      let g = 205 - ((n.z + 1) / 2) * 150;
      if (active && !on) g += (232 - g) * 0.55;
      if (dk) g = 265 - g;
      ctx.fillStyle = n === this.selected ? `rgb(${ink})` : `rgb(${g},${g},${g})`;
      ctx.beginPath(); ctx.arc(n.sx, n.sy, n.sr, 0, 7); ctx.fill();
      if (n === this.selected || n === this.hovered) {
        ctx.strokeStyle = `rgb(${ink})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(n.sx, n.sy, n.sr + 4, 0, 7); ctx.stroke();
      }
    }
    ctx.textAlign = "center";
    const mono = getComputedStyle(this.contentEl.doc.body).getPropertyValue("--font-monospace").trim() || "monospace";
    for (const n of order) {
      const on = active && (n === active || active.nb.has(n));
      if (!on && n.sr < 7) continue;
      const a = on ? 0.95 : active ? 0.12 : 0.15 + ((n.z + 1) / 2) * 0.55;
      const size = Math.max(8, Math.min(16, 9 * Math.sqrt(cam.k * this.persp(n.z))));
      ctx.font = `${n === active ? 600 : 400} ${size}px ${mono}`;
      ctx.fillStyle = `rgba(${ink},${a})`;
      ctx.fillText(n.file.basename.toUpperCase(), n.sx, n.sy - n.sr - 7);
    }
  }

  pick(x: number, y: number) {
    return [...this.nodes].sort((a, b) => b.z - a.z).find((n) => Math.hypot(n.sx - x, n.sy - y) < n.sr + 4) ?? null;
  }

  bindInput() {
    const c = this.canvas;
    let drag: { x: number; y: number; moved: boolean } | null = null;
    const local = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    this.registerDomEvent(c, "pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; c.setPointerCapture(e.pointerId); });
    this.registerDomEvent(c, "pointermove", (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        for (const o of [this.goal, this.cam]) { o.x -= dx / this.cam.k; o.y -= dy / this.cam.k; }
        drag.x = e.clientX; drag.y = e.clientY;
      } else {
        const { x, y } = local(e);
        this.hovered = this.pick(x, y);
        c.toggleClass("fg-hover", !!this.hovered);
      }
    });
    this.registerDomEvent(c, "pointerup", (e) => {
      const moved = drag?.moved; drag = null;
      if (moved) return;
      const { x, y } = local(e), n = this.pick(x, y);
      if (n) void this.select(n);
      else this.closePanel();
    });
    this.registerDomEvent(c, "pointerleave", () => (this.hovered = null));
    this.registerDomEvent(c, "wheel", (e) => {
      e.preventDefault();
      this.goal.k = Math.max(0.2, Math.min(3, this.goal.k * Math.exp(-e.deltaY * 0.0012)));
    }, { passive: false });
    this.registerDomEvent(this.contentEl, "keydown", (e) => { if (e.key === "Escape") this.closePanel(); });
  }

  closePanel() {
    this.selected = null; this.contentEl.removeClass("fg-open"); this.goal.k = 0.9;
  }

  async select(n: Node) {
    this.selected = n;
    this.contentEl.addClass("fg-open");
    this.goal.k = 1.5 / this.persp(n.z); this.goal.x = n.x; this.goal.y = n.y;
    const file = n.file, el = this.content;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const parts = splitNote(await this.app.vault.cachedRead(file));
    if (this.selected !== n) return;   // outro clique chegou enquanto lia o arquivo
    el.empty();
    const kicker = el.createDiv("fg-kicker fg-mono");
    kicker.createSpan({ text: file.parent?.isRoot() ? "/" : file.parent?.name ?? "" });
    kicker.createEl("b", { text: `${n.nb.size}` }); kicker.createEl("small", { text: "links" });
    // Diretrizes: nada de <h1>/<h2> (estilo inconsistente entre plugins); o papel de título fica no ARIA
    el.createDiv({ cls: "fg-title", text: file.basename, attr: { role: "heading", "aria-level": "1" } });
    if (fm.description) el.createEl("p", { cls: "fg-desc", text: String(fm.description) });
    const tags = [fm.tags ?? []].flat().filter(Boolean);
    if (tags.length) el.createDiv("fg-tags").setText(tags.map((t: string) => "#" + t).join("  "));
    const open = el.createEl("button", { cls: "fg-chip fg-open-note", text: "Open note ↗" });
    open.onclick = () => this.app.workspace.getLeaf("split").openFile(file);

    const section = (label: string) => { const s = el.createEl("section"); s.createDiv({ cls: "fg-heading fg-mono", text: label, attr: { role: "heading", "aria-level": "2" } }); return s; };
    const md = (text: string, into: HTMLElement) => MarkdownRenderer.render(this.app, text, into, file.path, this);
    if (parts.quotes.length) {
      const s = section("Heard in the wild");
      parts.quotes.forEach((q, i) => void md(q, s.createDiv(`fg-bubble${i % 2 ? " me" : ""}`)));
    }
    if (parts.avoid.length) {
      const s = section("Avoid");
      parts.avoid.forEach((a) => void md(a, s.createDiv("fg-avoid")));
    }
    if (n.out.length) {
      const chips = section("Connects to").createDiv("fg-chips");
      for (const b of n.out) chips.createEl("button", { cls: "fg-chip", text: b.file.basename }).onclick = () => void this.select(b);
    }
    await md(parts.body, section(parts.quotes.length ? "Definition" : "Note").createDiv("fg-body"));
    // Links da nota renderizada navegam pelo grafo em vez de abrir a nota
    el.querySelectorAll<HTMLAnchorElement>("a.internal-link").forEach((a) => a.addEventListener("click", (e) => {
      const target = this.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(a.getAttribute("data-href") ?? ""), file.path);
      const b = target && this.byPath.get(target.path);
      if (b) { e.preventDefault(); e.stopPropagation(); void this.select(b); }
    }, true));
    this.panel.scrollTop = 0;
  }
}
