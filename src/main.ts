import { App, ItemView, MarkdownRenderer, Notice, Plugin, PluginSettingTab, Scope, Setting, SettingDefinitionItem, TFile, ViewStateResult, WorkspaceLeaf, debounce, parseFrontMatterAliases, setIcon } from "obsidian";
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY, SimulationNodeDatum } from "d3-force";
import { splitNote, hash, pairs, matches } from "./parse";

const VIEW = "floating-graph";
const HUES = 8;   // quantas classes .fg-hue-N existem no styles.css

interface Node extends SimulationNodeDatum {
  file: TFile; nb: Set<Node>; out: Node[]; z: number; phase: number; r: number; idx: number; names: string[];
  x: number; y: number; sx: number; sy: number; sr: number;
}

interface Settings { slashSearch: boolean; showAllLinks: boolean }
const DEFAULTS: Settings = { slashSearch: true, showAllLinks: false };

export default class FloatingGraphPlugin extends Plugin {
  settings: Settings = { ...DEFAULTS };

  async onload() {
    this.settings = { ...DEFAULTS, ...((await this.loadData()) as Partial<Settings> | null) };
    this.registerView(VIEW, (leaf) => new FloatingGraphView(leaf, this));
    this.addRibbonIcon("orbit", "Open floating graph", () => this.open());
    this.addCommand({ id: "open", name: "Open graph", callback: () => this.open() });
    // Sem atalho padrão (diretrizes): o usuário escolhe em Settings → Hotkeys, que já avisa conflitos
    this.addCommand({
      id: "search", name: "Search notes in graph",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(FloatingGraphView);
        if (!view) return false;
        if (!checking) view.openSearch();
        return true;
      },
    });
    this.addSettingTab(new FloatingGraphSettings(this.app, this));
  }
  async open() {
    const leaf = this.app.workspace.getLeavesOfType(VIEW)[0] ?? this.app.workspace.getLeaf("tab");
    // active: true já traz a aba para a frente (revealLeaf só devolve Promise a partir da 1.7.2)
    await leaf.setViewState({ type: VIEW, active: true });
  }
}

// Cada opção aparece uma vez aqui; a tela antiga e a busca do Obsidian 1.13+ leem desta lista
const TOGGLES: { key: keyof Settings; name: string; desc: string; aliases: string[] }[] = [
  { key: "slashSearch", name: "Press / to search", aliases: ["hotkey", "shortcut", "slash"],
    desc: "While the graph tab is active, / opens the search. Turn this off if you use / for something else. "
      + "To use another key, set a hotkey for \"Search notes in graph\" in Settings → Hotkeys." },
  { key: "showAllLinks", name: "Show all links", aliases: ["edges", "lines", "connections"],
    desc: "Draw every link between notes, like Obsidian's graph view. Hovering or opening a note still shows only that note's links." },
];

class FloatingGraphSettings extends PluginSettingTab {
  constructor(app: App, private plugin: FloatingGraphPlugin) { super(app, plugin); }
  // Obsidian 1.13+: deixa as opções aparecerem na busca das configurações
  getSettingDefinitions(): SettingDefinitionItem[] {
    return TOGGLES.map((t) => ({ name: t.name, desc: t.desc, aliases: t.aliases, control: { type: "toggle", key: t.key, defaultValue: DEFAULTS[t.key] } }));
  }
  // Versões anteriores à 1.13 não conhecem as definições acima e usam esta tela
  display() {
    this.containerEl.empty();
    for (const t of TOGGLES) {
      new Setting(this.containerEl).setName(t.name).setDesc(t.desc)
        .addToggle((c) => c.setValue(this.plugin.settings[t.key]).onChange(async (v) => {
          this.plugin.settings[t.key] = v;
          await this.plugin.saveData(this.plugin.settings);
        }));
    }
  }
}

class FloatingGraphView extends ItemView {
  nodes: Node[] = [];          // na ordem de navegação (pasta, depois nome)
  byPath = new Map<string, Node>();
  links: { source: Node; target: Node }[] = [];
  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  panel!: HTMLElement;
  content!: HTMLElement;
  search!: HTMLInputElement;
  count!: HTMLElement;
  colorBtn!: HTMLElement;
  W = 0; H = 0; dpr = 1;
  cam = { x: 0, y: 0, k: 0.9 }; goal = { x: 0, y: 0, k: 0.9 };
  selected: Node | null = null; hovered: Node | null = null;
  hits: Set<Node> | null = null;   // resultado da busca; null = sem busca
  colors = false;
  frame = 0;

  constructor(leaf: WorkspaceLeaf, private plugin: FloatingGraphPlugin) { super(leaf); }

  getViewType() { return VIEW; }
  getDisplayText() { return "Floating graph"; }
  getIcon() { return "orbit"; }

  // O Obsidian guarda isto no layout: ao reabrir, volta na mesma nota e com o mesmo modo de cor
  getState() { return { ...super.getState(), file: this.selected?.file.path ?? null, colors: this.colors }; }
  async setState(state: { file?: string | null; colors?: boolean }, result: ViewStateResult) {
    this.setColors(!!state?.colors);
    const n = state?.file ? this.byPath.get(state.file) : undefined;
    if (n) await this.select(n);
    await super.setState(state, result);
  }

  async onOpen() {
    const root = this.contentEl;
    root.empty(); root.addClass("fg-root");
    this.canvas = root.createEl("canvas");
    this.ctx = this.canvas.getContext("2d")!;

    const bar = root.createDiv("fg-search");
    const searchBtn = bar.createEl("button", { cls: "fg-round", attr: { "aria-label": "Search notes" } });
    setIcon(searchBtn, "search");
    this.search = bar.createEl("input", { type: "search", attr: { placeholder: "Search notes…", "aria-label": "Search notes" } });
    this.count = bar.createSpan("fg-count fg-mono");
    searchBtn.onclick = () => this.openSearch();
    this.registerDomEvent(this.search, "input", () => this.filter(this.search.value));
    this.registerDomEvent(this.search, "keydown", (e) => {
      if (e.key === "Enter") { const first = this.firstHit(); if (first) void this.select(first); }
      if (e.key === "Escape") { e.preventDefault(); this.clearSearch(); }
    });

    this.colorBtn = root.createEl("button", { cls: "fg-round fg-color-toggle" });
    setIcon(this.colorBtn, "palette");
    this.colorBtn.onclick = () => { this.setColors(!this.colors); this.app.workspace.requestSaveLayout(); };
    this.setColors(false);

    this.panel = root.createDiv("fg-panel");
    const close = this.panel.createEl("button", { cls: "fg-close", text: "✕", attr: { "aria-label": "Close" } });
    close.onclick = () => this.closePanel();
    this.content = this.panel.createDiv();

    // Atalhos valem enquanto a aba do grafo está ativa
    this.scope = new Scope(this.app.scope);
    const typing = () => this.contentEl.doc.activeElement === this.search;
    this.scope.register([], "/", () => {
      if (typing() || !this.plugin.settings.slashSearch) return true;   // deixa o "/" seguir para o Obsidian
      this.openSearch(); return false;
    });
    this.scope.register([], "Escape", () => { if (!typing()) this.closePanel(); return true; });
    this.scope.register([], "ArrowLeft", () => (typing() || !this.step(-1)));
    this.scope.register([], "ArrowRight", () => (typing() || !this.step(1)));

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
    const files = this.app.vault.getMarkdownFiles()
      .sort((a, b) => (a.parent?.path ?? "").localeCompare(b.parent?.path ?? "") || a.basename.localeCompare(b.basename));
    this.byPath = new Map();
    this.nodes = files.map((file, idx) => {
      const aliases = parseFrontMatterAliases(this.app.metadataCache.getFileCache(file)?.frontmatter ?? null) ?? [];
      const n = { file, idx, names: [file.basename, ...aliases], nb: new Set(), out: [],
        z: hash(file.path) * 2 - 1, phase: hash(file.path + "~") * Math.PI * 2 } as unknown as Node;
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
    this.links = links;
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
    if (this.search?.value) this.filter(this.search.value);
    // Os nós foram recriados: aponta para o nó novo sem refazer o painel (não perde a rolagem de quem lê)
    const again = this.selected && this.byPath.get(this.selected.file.path);
    if (again) { this.selected = again; this.goal.x = again.x; this.goal.y = again.y; }
    else if (this.selected) this.closePanel();
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
    // No modo de cor da pasta, o fundo é colorido e o grafo vira branco
    const tinted = this.colors && !!this.selected;
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
    const ink = tinted ? "255,255,255" : dk ? "240,240,236" : "20,20,20";
    const hidden = (n: Node) => this.hits !== null && !this.hits.has(n);

    // Opção "Show all links": sem nota ativa, todas as ligações bem claras (um traço só, sem pontinhos)
    if (!active && this.plugin.settings.showAllLinks) {
      ctx.lineWidth = 0.6; ctx.strokeStyle = `rgba(${ink},.14)`;
      ctx.beginPath();
      for (const { source: a, target: b } of this.links) {
        if (hidden(a) || hidden(b)) continue;
        ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
      }
      ctx.stroke();
    }
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
    // Perto = escuro e grande; longe = claro e pequeno (no modo de cor: perto = mais opaco)
    for (const n of order) {
      const on = active && (n === active || active.nb.has(n));
      const depth = (n.z + 1) / 2;
      if (tinted) {
        let a = 0.25 + depth * 0.6;
        if ((active && !on) || hidden(n)) a *= 0.35;
        ctx.fillStyle = n === this.selected ? `rgb(${ink})` : `rgba(${ink},${a})`;
      } else {
        let g = 205 - depth * 150;
        if ((active && !on) || hidden(n)) g += (232 - g) * (hidden(n) ? 0.85 : 0.55);
        if (dk) g = 265 - g;
        ctx.fillStyle = n === this.selected ? `rgb(${ink})` : `rgb(${g},${g},${g})`;
      }
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
      const hit = this.hits?.has(n);
      if (hidden(n) && !on) continue;
      if (!on && !hit && n.sr < 7) continue;
      const a = on || hit ? 0.95 : active ? 0.12 : 0.15 + ((n.z + 1) / 2) * 0.55;
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
  }

  // ---- Busca ----
  openSearch() { this.contentEl.addClass("fg-searching"); this.search.focus(); this.search.select(); }
  filter(query: string) {
    this.hits = query.trim() ? new Set(this.nodes.filter((n) => matches(query, n.names))) : null;
    this.count.setText(this.hits === null ? "" : this.hits.size ? `${this.hits.size} notes` : "no matches");
  }
  firstHit() {
    if (!this.hits) return null;
    const q = this.search.value.trim().toLowerCase();
    const hits = this.nodes.filter((n) => this.hits!.has(n));
    return hits.find((n) => n.names.some((x) => x.toLowerCase().startsWith(q))) ?? hits[0] ?? null;
  }
  clearSearch() {
    this.search.value = ""; this.filter(""); this.search.blur(); this.contentEl.removeClass("fg-searching");
  }

  // ---- Cor da pasta ----
  setColors(on: boolean) {
    this.colors = on;
    this.contentEl.toggleClass("fg-colored", on);
    this.colorBtn.setAttr("aria-label", on ? "Switch to grayscale" : "Switch to folder colors");
    this.tint();
  }
  tint() {
    for (let i = 0; i < HUES; i++) this.contentEl.removeClass(`fg-hue-${i}`);
    const folder = this.selected?.file.parent?.path;
    if (folder !== undefined) this.contentEl.addClass(`fg-hue-${Math.floor(hash(folder) * HUES) % HUES}`);
  }

  // ---- Painel ----
  step(dir: number) {
    if (!this.selected || !this.nodes.length) return false;
    void this.select(this.nodes[(this.selected.idx + dir + this.nodes.length) % this.nodes.length]);
    return true;
  }

  closePanel() {
    this.selected = null; this.contentEl.removeClass("fg-open"); this.goal.k = 0.9;
    this.tint();
    this.app.workspace.requestSaveLayout();
  }

  async select(target: Node) {
    // Botões do painel podem guardar um nó de antes do último build(): usa sempre o atual
    const n = this.byPath.get(target.file.path);
    if (!n) return;
    this.selected = n;
    this.contentEl.addClass("fg-open");
    this.tint();
    this.goal.k = 1.5 / this.persp(n.z); this.goal.x = n.x; this.goal.y = n.y;
    const file = n.file, el = this.content, total = this.nodes.length;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const raw = await this.app.vault.cachedRead(file);
    if (this.selected !== n) return;   // outro clique chegou enquanto lia o arquivo
    const parts = splitNote(raw);
    this.app.workspace.requestSaveLayout();
    el.empty();

    const kicker = el.createDiv("fg-kicker fg-mono");
    kicker.createSpan({ text: file.parent?.isRoot() ? "/" : file.parent?.name ?? "" });
    kicker.createEl("b", { text: `${n.idx + 1}` }); kicker.createEl("small", { text: `/ ${total}` });
    // Diretrizes: nada de <h1>/<h2> (estilo inconsistente entre plugins); o papel de título fica no ARIA
    el.createDiv({ cls: "fg-title", text: file.basename, attr: { role: "heading", "aria-level": "1" } });
    if (n.names.length > 1) el.createDiv({ cls: "fg-aliases", text: n.names.slice(1).join(" · ") });
    if (fm.description) el.createEl("p", { cls: "fg-desc", text: String(fm.description) });
    const tags = [fm.tags ?? []].flat().filter(Boolean);
    if (tags.length) el.createDiv("fg-tags").setText(tags.map((t: string) => "#" + t).join("  "));

    const actions = el.createDiv("fg-chips fg-actions");
    actions.createEl("button", { cls: "fg-chip", text: "Open note ↗" }).onclick = () => void this.app.workspace.getLeaf("split").openFile(file);
    actions.createEl("button", { cls: "fg-chip", text: "Copy markdown" }).onclick = () => void this.copy(raw, "Markdown copied");
    const link = `obsidian://open?vault=${encodeURIComponent(this.app.vault.getName())}&file=${encodeURIComponent(file.path)}`;
    actions.createEl("button", { cls: "fg-chip", text: "Copy link" }).onclick = () => void this.copy(link, "Link copied");

    const section = (label: string) => { const s = el.createEl("section"); s.createDiv({ cls: "fg-heading fg-mono", text: label, attr: { role: "heading", "aria-level": "2" } }); return s; };
    const md = (text: string, into: HTMLElement) => MarkdownRenderer.render(this.app, text, into, file.path, this);

    const talks = pairs(parts.quotes);
    if (talks.length) {
      const s = section("Heard in the wild");
      const slide = s.createDiv();
      let i = 0;
      const show = () => {
        slide.empty();
        talks[i].forEach((q, j) => void md(q, slide.createDiv(`fg-bubble${j % 2 ? " me" : ""}`)));
      };
      if (talks.length > 1) {
        const nav = s.createDiv("fg-carousel fg-mono");
        const prev = nav.createEl("button", { cls: "fg-chip", text: "←", attr: { "aria-label": "Previous example" } });
        const pos = nav.createSpan();
        const next = nav.createEl("button", { cls: "fg-chip", text: "→", attr: { "aria-label": "Next example" } });
        const go = (d: number) => { i = (i + d + talks.length) % talks.length; pos.setText(`${i + 1} / ${talks.length}`); show(); };
        prev.onclick = () => go(-1); next.onclick = () => go(1);
        pos.setText(`1 / ${talks.length}`);
      }
      show();
    }
    if (parts.avoid.length) {
      const s = section("Avoid");
      parts.avoid.forEach((a) => void md(a, s.createDiv("fg-avoid")));
    }
    if (n.out.length) {
      const chips = section("Connects to").createDiv("fg-chips");
      for (const b of n.out) chips.createEl("button", { cls: "fg-chip", text: b.file.basename }).onclick = () => void this.select(b);
    }
    const defSection = section(parts.quotes.length ? "Full definition" : "Note");
    const body = defSection.createDiv("fg-body fg-collapsed");
    await md(parts.body, body);
    if (this.selected !== n) return;
    // "Read more" só quando o texto passa do limite recolhido
    if (body.scrollHeight > body.clientHeight + 4) {
      const more = defSection.createEl("button", { cls: "fg-chip fg-more", text: "Read more" });
      more.onclick = () => {
        body.toggleClass("fg-collapsed", !body.hasClass("fg-collapsed"));
        more.setText(body.hasClass("fg-collapsed") ? "Read more" : "Show less");
      };
    } else body.removeClass("fg-collapsed");

    // Links da nota renderizada navegam pelo grafo em vez de abrir a nota
    el.querySelectorAll<HTMLAnchorElement>("a.internal-link").forEach((a) => a.addEventListener("click", (e) => {
      const target = this.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(a.getAttribute("data-href") ?? ""), file.path);
      const b = target && this.byPath.get(target.path);
      if (b) { e.preventDefault(); e.stopPropagation(); void this.select(b); }
    }, true));

    const foot = el.createDiv("fg-foot");
    const prev = this.nodes[(n.idx - 1 + total) % total], next = this.nodes[(n.idx + 1) % total];
    const nav = (label: string, to: Node, cls: string) => {
      const b = foot.createEl("button", { cls: `fg-step ${cls}`, attr: { "aria-label": `${label}: ${to.file.basename}` } });
      b.createDiv({ cls: "fg-mono", text: label }); b.createDiv({ text: to.file.basename });
      b.onclick = () => void this.select(to);
    };
    nav("Prev", prev, "fg-prev"); nav("Next", next, "fg-next");
    this.panel.scrollTop = 0;
  }

  async copy(text: string, done: string) {
    try { await navigator.clipboard.writeText(text); new Notice(done); }
    catch { new Notice("Could not copy"); }
  }
}
