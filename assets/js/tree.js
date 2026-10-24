/* Árbol web: Crawl Tree (ruta de rastreo más corta) y Directory Tree (estructura de carpetas).
   Árbol horizontal plegable en SVG con zoom, búsqueda y exportación. */
const WebTree = {
  CHUNK: 30,
  open(kind = 'crawl') {
    this.kind = kind;
    this.labelMode = this.labelMode || 'path';
    this.colorMode = this.colorMode || 'status';
    const c = App.crawler;
    if (!c.urls.some(r => r.internal && r.type === 'HTML')) { U.toast('No hay páginas HTML para construir el árbol'); return; }

    const bar = U.el('div', { class: 'tree-bar form' });
    const sel = (opts, val, on) => { const s = U.el('select', {}, opts.map(([v, l]) => U.el('option', { value: v }, l))); s.value = val; s.onchange = () => on(s.value); return s; };
    bar.append(
      sel([['crawl', 'Crawl Tree (ruta de rastreo)'], ['dir', 'Directory Tree (carpetas)']], kind, v => { this.kind = v; this.build(); this.render(true); }),
      U.el('label', {}, 'Etiqueta'), sel([['path', 'Ruta'], ['title', 'Título'], ['url', 'URL completa']], this.labelMode, v => { this.labelMode = v; this.render(); }),
      U.el('label', {}, 'Color'), sel([['status', 'Código de estado'], ['index', 'Indexabilidad'], ['depth', 'Profundidad'], ['score', 'Link Score / inlinks'], ['time', 'Tiempo de respuesta']], this.colorMode, v => { this.colorMode = v; this.render(); }),
      U.el('button', { class: 'btn small', onclick: () => { this.setOpen(this.root, () => true); this.setLimit(this.root, 1e9); this.render(true); } }, 'Expandir todo'),
      U.el('button', { class: 'btn small', onclick: () => { this.autoExpand(); this.render(true); } }, 'Contraer'),
      U.el('button', { class: 'btn small', onclick: () => this.fit() }, 'Ajustar'),
      U.el('input', { type: 'search', placeholder: 'Buscar en el árbol…', class: 'tree-search', oninput: U.debounce(e => this.search(e.target.value), 250) }),
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn small', onclick: () => this.exportSVG() }, '⇩ SVG'),
      U.el('button', { class: 'btn small', onclick: () => this.exportCSV() }, '⇩ CSV'),
    );
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'tree-svg');
    this.g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.svg.append(this.g);
    this.info = U.el('div', { class: 'viz-info' });
    this.legend = U.el('div', { class: 'viz-legend' });
    const stage = U.el('div', { class: 'viz-wrap' }, this.svg, this.info, this.legend);
    const body = U.el('div', { style: 'display:flex;flex-direction:column;flex:1;min-height:0' }, bar, stage);
    Modal.open('Árbol web', body, [], 'wide');
    this.bindZoom();
    this.build();
    this.render(true);
  },

  /* ---------- Construcción ---------- */
  build() {
    const c = App.crawler, a = Analysis.get(c);
    this.a = a;
    const pages = c.urls.filter(r => r.internal && !r.hidden && (r.type === 'HTML' || r.redirectUrl || (r.status >= 400) || r.blockedRobots) && r.state === 'done');
    let root;
    if (this.kind === 'crawl') {
      const byId = new Map();
      const mk = (r) => ({ r, name: '', children: [], open: false, level: 0 });
      for (const r of pages) byId.set(r.id, mk(r));
      const start = c.byUrl.get(c.startUrl) || pages.find(r => r.depth === 0) || pages[0];
      root = byId.get(start.id) || mk(start);
      const orphans = [];
      for (const r of pages) {
        if (r === start) continue;
        const inl = a.inlinkEdges.get(r.id) || [];
        // padre = página con menor profundidad que enlaza / redirige aquí (ruta más corta)
        let best = null;
        for (const e of inl) {
          if (!['Hyperlink', 'Redirect', 'Canonical', 'Next', 'Prev', 'Hreflang'].includes(e.type)) continue;
          const p = byId.get(e.from);
          if (!p || e.from === r.id) continue;
          if (!best || p.r.depth < best.r.depth) best = p;
          if (p.r.depth === r.depth - 1) { best = p; break; }
        }
        if (best) { best.children.push(byId.get(r.id)); byId.get(r.id).via = inl.find(e => e.from === best.r.id)?.type; }
        else orphans.push(byId.get(r.id));
      }
      if (orphans.length) root.children.push({ r: null, name: `Sin ruta de enlace (${orphans.length})`, children: orphans, open: false, virtual: true });
      // evitar ciclos (por si acaso)
      const seen = new Set();
      const prune = n => { seen.add(n); n.children = n.children.filter(ch => !seen.has(ch)); n.children.forEach(prune); };
      prune(root);
    } else {
      root = { r: null, name: (c.startHost || 'sitio') + '/', children: [], open: true, map: new Map(), folder: true };
      for (const r of pages) {
        let u; try { u = new URL(r.url); } catch { continue; }
        const segs = u.pathname.split('/').filter(Boolean);
        const trailing = u.pathname.endsWith('/');
        let node = root;
        if (u.hostname !== c.startHost) {
          if (!node.map.has('@' + u.hostname)) { const h = { r: null, name: u.hostname + '/', children: [], map: new Map(), folder: true }; node.map.set('@' + u.hostname, h); node.children.push(h); }
          node = node.map.get('@' + u.hostname);
        }
        const folders = trailing ? segs : segs.slice(0, -1);
        for (const s of folders) {
          if (!node.map.has(s)) { const f = { r: null, name: decodeURIComponent(s) + '/', children: [], map: new Map(), folder: true }; node.map.set(s, f); node.children.push(f); }
          node = node.map.get(s);
        }
        const leafName = (trailing || !segs.length ? '' : decodeURIComponent(segs[segs.length - 1])) + u.search;
        if (!leafName) { node.r = node.r || r; if (node.r !== r) node.children.push({ r, name: u.search || '(duplicado)', children: [] }); }
        else node.children.push({ r, name: leafName, children: [], map: new Map() });
      }
      const sortRec = n => { n.children.sort((x, y) => (y.children.length > 0) - (x.children.length > 0) || x.name.localeCompare(y.name)); n.children.forEach(sortRec); };
      sortRec(root);
      // compacta carpetas cuyo único contenido es una página (p. ej. libro_1/index.html)
      const compact = n => {
        n.children = n.children.map(ch => {
          compact(ch);
          if (ch.folder && !ch.r && ch.children.length === 1 && !ch.children[0].children.length) {
            const leaf = ch.children[0];
            return { r: leaf.r, name: ch.name + leaf.name, children: [] };
          }
          return ch;
        });
      };
      compact(root);
    }
    // niveles, totales y estado inicial
    const walk = (n, lvl, parent) => {
      n.level = lvl; n.parent = parent;
      n.limit = this.CHUNK;
      n.total = 1;
      for (const ch of n.children) n.total += walk(ch, lvl + 1, n);
      n.open = false;
      return n.total;
    };
    walk(root, 0, null);
    this.root = root;
    this.autoExpand();
  },

  /* Despliega por niveles (BFS) mientras el número de nodos visibles sea legible */
  autoExpand(budget = 90) {
    this.setOpen(this.root, () => false);
    this.setLimit(this.root, this.CHUNK);
    let visible = 1;
    const queue = [this.root];
    while (queue.length) {
      const n = queue.shift();
      if (!n.children.length) continue;
      if (n !== this.root && visible + Math.min(n.children.length, n.limit) > budget) continue;
      n.open = true;
      visible += Math.min(n.children.length, n.limit) + (n.children.length > n.limit ? 1 : 0);
      queue.push(...n.children.slice(0, n.limit));
    }
  },

  setLimit(n, v) { n.limit = v; n.children.forEach(ch => this.setLimit(ch, v)); },

  setOpen(n, fn) { n.open = fn(n); n.children.forEach(ch => this.setOpen(ch, fn)); },

  label(n) {
    if (!n.r || n.virtual) return n.name;
    if (this.labelMode === 'title') return n.r.titles?.[0] || n.name || n.r.url;
    if (this.labelMode === 'url') return n.r.url;
    if (this.kind === 'dir') return n.name || n.r.url;
    try { const u = new URL(n.r.url); return (u.pathname + u.search) || '/'; } catch { return n.r.url; }
  },

  color(n) {
    const r = n.r;
    if (!r) return n.folder ? '#9aa0a6' : '#bbb';
    const a = this.a;
    switch (this.colorMode) {
      case 'index': return r.indexability === 'Indexable' ? '#67b346' : '#f0a020';
      case 'depth': { const h = [140, 100, 60, 35, 15, 0][Math.min(5, r.depth)]; return `hsl(${h},65%,48%)`; }
      case 'score': {
        const v = a.linkScore.get(r.id) ?? Math.min(100, (a.uniqueInlinks.get(r.id) || 0) * 5);
        return `hsl(210,70%,${85 - v * 0.5}%)`;
      }
      case 'time': { const t = r.responseTime || 0; return t < 0.5 ? '#67b346' : t < 1 ? '#a8c43a' : t < 2 ? '#f0a020' : '#e05050'; }
      default:
        if (r.blockedRobots) return '#8e6bbf';
        if (!r.status || r.status >= 400) return '#e05050';
        if (r.status >= 300) return '#4a90e2';
        return r.indexability === 'Indexable' ? '#67b346' : '#f0a020';
    }
  },

  legendHtml() {
    const it = (c, t) => `<div><i style="background:${c}"></i>${t}</div>`;
    switch (this.colorMode) {
      case 'index': return it('#67b346', 'Indexable') + it('#f0a020', 'Non-Indexable') + it('#9aa0a6', 'Carpeta');
      case 'depth': return [0, 1, 2, 3, 4, 5].map(d => it(`hsl(${[140, 100, 60, 35, 15, 0][d]},65%,48%)`, d === 5 ? '5+ clics' : d + ' clics')).join('');
      case 'score': return it('hsl(210,70%,82%)', 'Bajo') + it('hsl(210,70%,58%)', 'Medio') + it('hsl(210,70%,35%)', 'Alto');
      case 'time': return it('#67b346', '< 0,5 s') + it('#a8c43a', '0,5 - 1 s') + it('#f0a020', '1 - 2 s') + it('#e05050', '> 2 s');
      default: return it('#67b346', '2xx Indexable') + it('#f0a020', '2xx Non-Indexable') + it('#4a90e2', '3xx Redirección') + it('#e05050', '4xx / 5xx / sin respuesta') + it('#8e6bbf', 'Bloqueada robots.txt') + it('#9aa0a6', 'Carpeta (sin URL)');
    }
  },

  /* ---------- Layout y pintado ---------- */
  layout() {
    const rowH = 22;
    let leaf = 0;
    const vis = [];
    const place = n => {
      vis.push(n);
      let kids = n.open ? n.children.slice(0, n.limit) : [];
      if (n.open && n.children.length > n.limit) {
        n._more = n._more || { more: true, parent: n, children: [], total: 1 };
        n._more.level = n.level + 1;
        n._more.name = `… ${n.children.length - n.limit} más (clic para cargar)`;
        kids = kids.concat(n._more);
      }
      if (!kids.length) { n.y = leaf++ * rowH; return; }
      for (const ch of kids) place(ch);
      n.y = (kids[0].y + kids[kids.length - 1].y) / 2;
    };
    place(this.root);
    // ancho de cada columna según la etiqueta más larga de ese nivel
    const widths = [];
    for (const n of vis) {
      const len = Math.min(50, (n.more ? n.name : this.label(n)).length + (n.children.length && !n.open ? 8 : 0));
      widths[n.level] = Math.max(widths[n.level] || 0, len * 6.6 + 50);
    }
    const xs = [0];
    for (let i = 1; i < widths.length; i++) xs[i] = xs[i - 1] + Math.max(120, widths[i - 1]);
    for (const n of vis) n.x = xs[n.level];
    this.vis = vis;
    this.size = { w: xs[xs.length - 1] + (widths[widths.length - 1] || 200) + 40, h: leaf * rowH };
  },

  render(fit) {
    this.layout();
    const NS = 'http://www.w3.org/2000/svg';
    const g = this.g;
    g.innerHTML = '';
    const links = document.createElementNS(NS, 'g'), nodes = document.createElementNS(NS, 'g');
    let d = '';
    for (const n of this.vis) {
      if (!n.parent) continue;
      const p = n.parent, mx = (p.x + n.x) / 2;
      d += `M${p.x},${p.y}C${mx},${p.y} ${mx},${n.y} ${n.x},${n.y}`;
    }
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d); path.setAttribute('class', 'tree-link');
    links.append(path);
    const q = (this.query || '').toLowerCase();
    for (const n of this.vis) {
      const gn = document.createElementNS(NS, 'g');
      if (n.more) {
        gn.setAttribute('transform', `translate(${n.x},${n.y})`);
        gn.setAttribute('class', 'tree-node more');
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', 0); t.setAttribute('dy', '0.32em');
        t.textContent = n.name;
        t.addEventListener('click', e => { e.stopPropagation(); n.parent.limit += 50; this.render(); });
        gn.append(t);
        nodes.append(gn);
        continue;
      }
      gn.setAttribute('transform', `translate(${n.x},${n.y})`);
      gn.setAttribute('class', 'tree-node' + (q && this.matches(n, q) ? ' hit' : ''));
      const hasKids = n.children.length > 0;
      const circ = document.createElementNS(NS, 'circle');
      circ.setAttribute('r', hasKids ? 6 : 4.5);
      circ.setAttribute('fill', hasKids && !n.open ? this.color(n) : (hasKids ? 'var(--panel)' : this.color(n)));
      circ.setAttribute('stroke', this.color(n));
      circ.setAttribute('stroke-width', 2);
      circ.addEventListener('click', e => { e.stopPropagation(); if (hasKids) { n.open = !n.open; this.render(); } });
      const txt = document.createElementNS(NS, 'text');
      txt.setAttribute('x', 10); txt.setAttribute('dy', '0.32em');
      let lbl = this.label(n);
      if (lbl.length > 48) lbl = lbl.slice(0, 46) + '…';
      txt.textContent = lbl + (hasKids && !n.open ? `  (+${n.total - 1})` : '');
      if (n.r) txt.addEventListener('click', e => { e.stopPropagation(); Modal.close(); App.goToUrl(n.r); });
      txt.addEventListener('mouseenter', () => this.showInfo(n));
      circ.addEventListener('mouseenter', () => this.showInfo(n));
      gn.append(circ, txt);
      nodes.append(gn);
    }
    g.append(links, nodes);
    this.legend.innerHTML = this.legendHtml();
    const total = this.root.total;
    this.info.innerHTML = `${this.vis.length} de ${total} nodos visibles · clic en ● = plegar/desplegar · clic en texto = ir a la URL · rueda = zoom · arrastrar = mover`;
    if (fit) this.fit();
  },

  showInfo(n) {
    const r = n.r, a = this.a;
    if (!r) { this.info.innerHTML = `<b>${U.esc(n.name)}</b><br>${n.total - 1} elementos dentro`; return; }
    this.info.innerHTML = `<b>${U.esc(r.url)}</b><br>${U.esc(r.titles?.[0] || '')}<br>` +
      `Status: ${r.status} ${U.esc(r.statusText || '')} · ${r.indexability || ''} ${r.indexabilityStatus ? '(' + r.indexabilityStatus + ')' : ''}<br>` +
      `Profundidad: ${r.depth} · Inlinks únicos: ${a.uniqueInlinks.get(r.id) || 0} · Link Score: ${a.linkScore.get(r.id) ?? '—'} · ${r.responseTime ?? '—'} s` +
      (n.via && n.via !== 'Hyperlink' ? `<br>Llega vía: ${n.via}` : '') + (n.children.length ? `<br>Hijos: ${n.children.length} · Descendientes: ${n.total - 1}` : '');
  },

  matches(n, q) { return (n.r && (n.r.url.toLowerCase().includes(q) || (n.r.titles?.[0] || '').toLowerCase().includes(q))) || n.name.toLowerCase().includes(q); },

  search(q) {
    this.query = q;
    if (q) {
      const ql = q.toLowerCase();
      const mark = n => {
        let hit = this.matches(n, ql);
        n.children.forEach((ch, i) => { if (mark(ch)) { hit = true; n.open = true; if (i >= n.limit) n.limit = i + 1; } });
        return hit;
      };
      mark(this.root);
    }
    this.render();
    const first = this.g.querySelector('.hit');
    if (first) {
      const n = this.vis.find(v => v.parent && this.matches(v, q.toLowerCase()));
      if (n) this.centerOn(n);
    }
  },

  /* ---------- Zoom / pan ---------- */
  bindZoom() {
    this.view = { x: 40, y: 40, k: 1 };
    let pan = null;
    this.svg.addEventListener('mousedown', e => { pan = [e.clientX - this.view.x, e.clientY - this.view.y]; this.svg.style.cursor = 'grabbing'; });
    window.addEventListener('mousemove', e => { if (pan) { this.view.x = e.clientX - pan[0]; this.view.y = e.clientY - pan[1]; this.apply(); } });
    window.addEventListener('mouseup', () => { pan = null; if (this.svg) this.svg.style.cursor = ''; });
    this.svg.addEventListener('wheel', e => {
      e.preventDefault();
      const b = this.svg.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top;
      const f = Math.exp(-e.deltaY * 0.0015), k = Math.max(0.05, Math.min(4, this.view.k * f)), ff = k / this.view.k;
      this.view.x = mx - (mx - this.view.x) * ff; this.view.y = my - (my - this.view.y) * ff; this.view.k = k;
      this.apply();
    }, { passive: false });
  },
  apply() { this.g.setAttribute('transform', `translate(${this.view.x},${this.view.y}) scale(${this.view.k})`); },
  fit() {
    const W = this.svg.clientWidth || 1000, H = this.svg.clientHeight || 700;
    // nunca por debajo de 0,8 para que el texto se lea; si no cabe, se centra en la raíz
    const k = Math.max(0.8, Math.min(1.1, (W - 80) / this.size.w, (H - 60) / Math.max(1, this.size.h)));
    const y = this.size.h * k <= H - 60 ? (H - this.size.h * k) / 2 : H / 2 - this.root.y * k;
    this.view = { k, x: 40, y };
    this.apply();
  },
  centerOn(n) {
    const W = this.svg.clientWidth, H = this.svg.clientHeight;
    this.view.k = Math.max(this.view.k, 0.8);
    this.view.x = W / 2 - n.x * this.view.k; this.view.y = H / 2 - n.y * this.view.k;
    this.apply();
  },

  /* ---------- Exportar ---------- */
  exportSVG() {
    const clone = this.svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.querySelector('g').setAttribute('transform', 'translate(20,20)');
    clone.setAttribute('width', this.size.w + 40); clone.setAttribute('height', this.size.h + 40);
    const st = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    st.textContent = '.tree-link{fill:none;stroke:#bbb;stroke-width:1.2}text{font:12px Arial,sans-serif;fill:#222}';
    clone.prepend(st);
    clone.innerHTML = clone.innerHTML.replace(/var\(--panel\)/g, '#fff');
    U.download(`arbol-web-${this.kind}-${Reports.stamp()}.svg`, new XMLSerializer().serializeToString(clone), 'image/svg+xml');
  },
  exportCSV() {
    const rows = [];
    const walk = (n, path) => {
      const p = [...path, this.label(n)];
      rows.push({ Level: n.level, Path: p.join(' > '), Address: n.r?.url || '', Title: n.r?.titles?.[0] || '', 'Status Code': n.r?.status ?? '', Indexability: n.r?.indexability || '', Children: n.children.length, Descendants: n.total - 1 });
      n.children.forEach(ch => walk(ch, p));
    };
    walk(this.root, []);
    U.download(`arbol-web-${this.kind}-${Reports.stamp()}.csv`, U.toCSV(Object.keys(rows[0]).map(k => ({ key: k, label: k })), rows), 'text/csv');
  },
};
