/* Aplicación: une crawler, pestañas, tabla, paneles y menús */
const App = {
  crawler: new Crawler(),
  tabIdx: 0, filterIdx: 0, search: '', btab: 'details', rtab: 'overview',
  selected: null, overviewOpen: new Set(['Internal', 'Response Codes']), issueOpen: null,

  init() {
    try { const s = localStorage.getItem('ospider.cfg'); if (s) Object.assign(this.crawler.cfg, JSON.parse(s)); } catch {}
    try { const t = localStorage.getItem('ospider.theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
    this.crawler.cfg.mode = 'spider';
    this.grid = new Grid(U.$('#grid'), {
      crawler: this.crawler, statusColor: this.statusColor,
      onSelect: r => { this.selected = r; this.renderBottom(); },
      onOpen: r => window.open(r.url, '_blank', 'noopener'),
      onContext: (r, e) => this.contextMenu(r, e),
    });
    this.buildMenus();
    this.bindToolbar();
    this.bindSplitters();
    this.renderTabs();
    this.renderBottomTabs();
    this.renderRightTabs();
    this.refresh(true);

    const c = this.crawler;
    const throttled = this.throttle(() => this.refresh(), 700);
    c.addEventListener('progress', throttled);
    c.addEventListener('start', () => { this.updateButtons(); this.refresh(true); });
    c.addEventListener('pause', () => this.updateButtons());
    c.addEventListener('resume', () => this.updateButtons());
    c.addEventListener('reset', () => { this.selected = null; });
    c.addEventListener('loaded', () => { this.renderTabs(); this.updateButtons(); this.refresh(true); this.renderBottom(); });
    c.addEventListener('done', () => {
      this.updateButtons();
      if (c.cfg.autoAnalysis && c.urls.length) this.crawlAnalysis(true);
      else this.refresh(true);
    });
    fetch('api.php?action=ping').then(r => r.json()).then(j => { if (!j.ok) throw 0; }).catch(() =>
      U.toast('⚠️ No se puede contactar con api.php. Sirve la app desde un servidor con PHP + cURL (p. ej. http://localhost/openspider/).', 8000));
  },

  throttle(fn, ms) {
    let last = 0, t = null;
    return () => {
      const now = Date.now();
      if (now - last > ms) { last = now; fn(); }
      else if (!t) t = setTimeout(() => { t = null; last = Date.now(); fn(); }, ms - (now - last));
    };
  },

  statusColor(v) {
    if (v === '' || v == null) return '';
    const d = String(v)[0];
    return 's' + (v === 0 ? '0' : d);
  },

  get tabs() { return allTabs(this.crawler.cfg); },
  get tab() { return this.tabs[this.tabIdx] || this.tabs[0]; },

  /* ---------- Toolbar ---------- */
  bindToolbar() {
    const c = this.crawler;
    U.$('#btnStart').onclick = () => this.start();
    U.$('#startUrl').addEventListener('keydown', e => { if (e.key === 'Enter') this.start(); });
    U.$('#btnPause').onclick = () => { if (c.paused) c.resume(); else c.pause(); };
    U.$('#btnClear').onclick = () => { if (c.running && !c.paused) return U.toast('Pausa el rastreo antes de limpiar'); if (c.urls.length && !confirm('¿Borrar los datos del rastreo actual?')) return; c.reset(); this.refresh(true); this.renderBottom(); this.updateButtons(); };
    U.$('#btnTree').onclick = () => WebTree.open('crawl');
    U.$('#btnList').onclick = () => this.listDialog();
    U.$('#btnExport').onclick = () => this.grid.exportCSV(`${this.tab.id}-${this.tab.filters[this.filterIdx].name.replace(/\W+/g, '_').toLowerCase()}-${Reports.stamp()}.csv`);
    U.$('#filterSel').onchange = e => { this.filterIdx = +e.target.value; this.refresh(true); };
    U.$('#search').addEventListener('input', U.debounce(e => { this.search = e.target.value; this.refresh(true); }, 250));
    U.$('#fileOpen').onchange = e => this.openFile(e.target.files[0]);
    U.$('#fileList').onchange = async e => { const f = e.target.files[0]; if (f) { this.listText = await f.text(); this.listDialog(); } };
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); this.saveFile(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') { e.preventDefault(); U.$('#fileOpen').click(); }
    });
    document.addEventListener('click', () => { U.$('#ctxmenu').hidden = true; U.$$('.menu.open').forEach(m => m.classList.remove('open')); });
  },

  async start() {
    const c = this.crawler;
    if (c.running && !c.paused) return;
    try {
      if (c.cfg.mode === 'list') {
        if (!this.listText) return this.listDialog();
        await c.start(this.listText);
      } else {
        const v = U.$('#startUrl').value.trim();
        if (!v) return U.toast('Introduce una URL');
        if (c.urls.length && !confirm('Se borrará el rastreo actual. ¿Continuar?')) return;
        await c.start(v);
      }
    } catch (e) { U.toast(e.message); }
    this.updateButtons();
  },

  updateButtons() {
    const c = this.crawler;
    const crawling = c.running && !c.paused;
    U.$('#btnStart').disabled = crawling;
    U.$('#btnPause').disabled = !(crawling || (c.paused && c.qHead < c.queue.length));
    U.$('#btnPause').textContent = c.paused && c.qHead < c.queue.length ? 'Resume' : 'Pause';
    const list = c.cfg.mode === 'list';
    U.$('#modeBadge').textContent = list ? 'List' : 'Spider';
    U.$('#sbMode').textContent = 'Modo: ' + (list ? 'List' : 'Spider');
    U.$('#startUrl').hidden = list;
    U.$('#btnList').hidden = !list;
    if (c.startUrl && !list && !U.$('#startUrl').value) U.$('#startUrl').value = c.startUrl;
  },

  listDialog() {
    const ta = U.el('textarea', { style: 'width:100%;height:340px', spellcheck: 'false', placeholder: 'https://www.ejemplo.com/\nhttps://www.ejemplo.com/pagina-1\n…' });
    ta.value = this.listText || '';
    const body = U.el('div', { class: 'cfg-pane form' }, U.el('div', { class: 'hint' }, 'Pega una URL por línea (o sube un .txt/.csv). En modo lista solo se rastrean estas URLs (profundidad 0) y sus recursos/redirecciones.'), ta);
    Modal.open('Modo lista — URLs', body, [
      { label: 'Desde archivo…', onclick: () => { Modal.close(); U.$('#fileList').click(); } },
      { label: 'Cancelar', onclick: () => Modal.close() },
      { label: 'OK — Rastrear', cls: 'primary', onclick: () => { this.listText = ta.value; Modal.close(); this.crawler.cfg.mode = 'list'; this.start(); } },
    ]);
  },

  setMode(mode) {
    const c = this.crawler;
    if (c.running && !c.paused) return U.toast('Pausa el rastreo antes de cambiar de modo');
    c.cfg.mode = mode;
    this.updateButtons();
    this.buildMenus();
    if (mode === 'list') this.listDialog();
  },

  /* ---------- Menús ---------- */
  buildMenus() {
    const c = this.crawler, mode = c.cfg.mode;
    const menus = [
      ['File', [
        ['Nuevo rastreo', () => U.$('#btnClear').click()],
        ['Abrir rastreo…', () => U.$('#fileOpen').click(), '⌘O'],
        ['Guardar rastreo', () => this.saveFile(), '⌘S'],
        '-',
        ['Exportar pestaña actual (CSV)', () => U.$('#btnExport').click()],
        ['Exportar todos los datos internos (CSV)', () => this.exportAllInternal()],
        '-',
        ['Tema claro / oscuro', () => this.toggleTheme()],
      ]],
      ['Mode', [
        [(mode === 'spider' ? '✓ ' : '   ') + 'Spider', () => this.setMode('spider')],
        [(mode === 'list' ? '✓ ' : '   ') + 'List', () => this.setMode('list')],
      ]],
      ['Configuration', CONFIG_SECTIONS.map((s, i) => [s.name, () => openConfig(c, i, () => this.onConfigSaved())])],
      ['Bulk Export', [
        ['All Inlinks', () => Reports.bulk('allInlinks')],
        ['All Outlinks', () => Reports.bulk('allOutlinks')],
        ['All Anchor Text', () => Reports.bulk('allAnchors')],
        ['All Images', () => Reports.bulk('allImages')],
        '-',
        ['Response Codes › Redirection (3xx) Inlinks', () => Reports.bulk('r3xx')],
        ['Response Codes › Client Error (4xx) Inlinks', () => Reports.bulk('r4xx')],
        ['Response Codes › Server Error (5xx) Inlinks', () => Reports.bulk('r5xx')],
        ['Response Codes › No Response Inlinks', () => Reports.bulk('noResp')],
        ['Response Codes › Blocked by Robots.txt Inlinks', () => Reports.bulk('blocked')],
        '-',
        ['Images › Missing Alt Text Inlinks', () => Reports.bulk('imgMissingAlt')],
        ['Security › Mixed Content', () => Reports.bulk('mixed')],
        ['Links › Internal Nofollow', () => Reports.bulk('nofollowInt')],
        ['Canonicals', () => Reports.bulk('canonicals')],
        ['Hreflang', () => Reports.bulk('hreflang')],
        ['Structured Data (JSON-LD)', () => Reports.exportStructured()],
      ]],
      ['Reports', [
        ['Crawl Overview', () => Reports.crawlOverview()],
        ['Redirect Chains', () => Reports.redirectChains()],
        ['Canonical Chains', () => Reports.canonicalChains()],
        ['SERP Summary', () => Reports.serpSummary()],
        ['Orphan Pages', () => Reports.orphans()],
        ['Response Times', () => Reports.responseTimes()],
        ['robots.txt', () => Reports.robotsView()],
      ]],
      ['Sitemaps', [
        ['XML Sitemap', () => Reports.sitemapDialog(false)],
        ['Images Sitemap', () => Reports.sitemapDialog(true)],
      ]],
      ['Visualisations', [
        ['Árbol web — Crawl Tree Graph', () => WebTree.open('crawl')],
        ['Árbol web — Directory Tree Graph', () => WebTree.open('dir')],
        '-',
        ['Force-Directed Crawl Diagram', () => Viz.open('crawl')],
        ['Force-Directed Directory Tree Diagram', () => Viz.open('dir')],
      ]],
      ['Crawl Analysis', [
        ['Start', () => this.crawlAnalysis(false)],
      ]],
      ['Help', [
        ['Acerca de OpenSpider', () => this.about()],
      ]],
    ];
    const bar = U.$('#menubar');
    bar.innerHTML = '';
    for (const [name, items] of menus) {
      const dd = U.el('div', { class: 'dd' });
      for (const it of items) {
        if (it === '-') { dd.append(U.el('div', { class: 'sep' })); continue; }
        dd.append(U.el('div', { class: 'it', onclick: e => { e.stopPropagation(); U.$$('.menu.open').forEach(m => m.classList.remove('open')); it[1](); } }, it[0], it[2] ? U.el('kbd', {}, it[2]) : null));
      }
      const m = U.el('div', { class: 'menu' }, U.el('span', {}, name), dd);
      m.addEventListener('click', e => { e.stopPropagation(); const was = m.classList.contains('open'); U.$$('.menu.open').forEach(x => x.classList.remove('open')); if (!was) m.classList.add('open'); });
      m.addEventListener('mouseenter', () => { if (U.$('.menu.open') && !m.classList.contains('open')) { U.$$('.menu.open').forEach(x => x.classList.remove('open')); m.classList.add('open'); } });
      bar.append(m);
    }
  },

  onConfigSaved() {
    if (this.tabIdx >= this.tabs.length) this.tabIdx = 0;
    this.crawler.touch();
    this.renderTabs();
    this.buildMenus();
    this.refresh(true);
  },

  toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('ospider.theme', root.dataset.theme); } catch {}
  },

  about() {
    Modal.open('Acerca de OpenSpider SEO', U.el('div', { class: 'report', html: `
      <p><b>OpenSpider SEO</b> — rastreador SEO web de código abierto.</p>
      <p>Frontend HTML/JS (parseo con DOMParser) + proxy PHP/cURL (<code>api.php</code>) para evitar las restricciones CORS.</p>
      <ul><li>Modos Spider y List</li><li>${TABS.length} pestañas con ${TABS.reduce((s, t) => s + t.filters.length, 0)} filtros</li><li>Incidencias priorizadas, informes, exportaciones masivas, sitemaps XML, visualizaciones</li><li>Búsqueda y extracción personalizadas (CSS, XPath, Regex)</li><li>robots.txt, sitemaps, redirecciones, canonicals, hreflang, paginación, datos estructurados</li><li>Link Score (PageRank interno) y casi duplicados (MinHash)</li></ul>
      <p>Atajos: ⌘/Ctrl+S guardar · ⌘/Ctrl+O abrir · ↑/↓ navegar · doble clic abrir URL · clic derecho menú.</p>` }),
    [{ label: 'Cerrar', cls: 'primary', onclick: () => Modal.close() }]);
  },

  /* ---------- Guardar / abrir ---------- */
  saveFile() {
    const c = this.crawler;
    if (!c.urls.length) return U.toast('No hay nada que guardar');
    const host = c.startHost || 'crawl';
    U.download(`${host}-${Reports.stamp()}.ospider.json`, c.serialize(), 'application/json');
  },
  async openFile(f) {
    if (!f) return;
    try {
      this.crawler.load(await f.text());
      U.$('#startUrl').value = this.crawler.startUrl || '';
      if (this.crawler.cfg.autoAnalysis) this.crawlAnalysis(true);
      U.toast(`Rastreo cargado: ${this.crawler.urls.length} URLs`);
    } catch (e) { U.toast('Error al abrir: ' + e.message); }
    U.$('#fileOpen').value = '';
  },
  exportAllInternal() {
    const c = this.crawler, a = Analysis.get(c), t = TABS[0];
    const cols = t.cols.map(col => ({ label: col.label, get: r => col.get(r, a, c) }));
    U.download(`internal_all-${Reports.stamp()}.csv`, U.toCSV(cols, c.urls.filter(r => r.internal && !r.hidden)), 'text/csv');
  },

  crawlAnalysis(silent) {
    const c = this.crawler;
    c.analysedFull = true;
    c.touch();
    const t0 = performance.now();
    Analysis.get(c);
    this.refresh(true);
    if (!silent) U.toast(`Análisis de rastreo completado en ${Math.round(performance.now() - t0)} ms`);
  },

  /* ---------- Pestañas y filtros ---------- */
  renderTabs() {
    const el = U.$('#tabs');
    el.innerHTML = '';
    this.tabs.forEach((t, i) => el.append(U.el('div', { class: 'tab' + (i === this.tabIdx ? ' active' : ''), onclick: () => this.selectTab(i, 0) }, t.name)));
  },
  selectTab(i, f = 0) {
    this.tabIdx = i; this.filterIdx = f;
    U.$$('#tabs .tab').forEach((x, j) => x.classList.toggle('active', j === i));
    U.$$('#tabs .tab')[i]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.refresh(true);
  },
  goToUrl(rec) {
    const ti = rec.internal ? 0 : 1;
    this.selectTab(ti, 0);
    const idx = this.grid.view.indexOf(rec);
    if (idx >= 0) this.grid.select(idx, true);
  },

  filtered(tab, filter, a) {
    const c = this.crawler;
    let rows = c.urls.filter(r => !r.hidden && r.state !== 'queued' && tab.rows(r));
    if (tab.id === 'internal' || tab.id === 'external') rows = c.urls.filter(r => !r.hidden && tab.rows(r) && (r.state === 'done' || filter.name === 'All'));
    rows = rows.filter(r => { try { return filter.test(r, a, c); } catch { return false; } });
    if (this.search) {
      let re;
      try { re = new RegExp(this.search, 'i'); } catch { re = null; }
      const s = this.search.toLowerCase();
      rows = rows.filter(r => re ? re.test(r.url) || re.test(r.titles?.[0] || '') : r.url.toLowerCase().includes(s));
    }
    return rows;
  },

  refresh(force) {
    const c = this.crawler, a = Analysis.get(c), tab = this.tab;
    if (this.filterIdx >= tab.filters.length) this.filterIdx = 0;
    const filter = tab.filters[this.filterIdx];
    // selector de filtros con recuento
    const sel = U.$('#filterSel');
    const base = c.urls.filter(r => !r.hidden && r.state === 'done' && tab.rows(r));
    sel.innerHTML = '';
    tab.filters.forEach((f, i) => {
      let n = 0;
      for (const r of base) { try { if (f.test(r, a, c)) n++; } catch {} }
      sel.append(U.el('option', { value: i }, `${f.name} (${n})`));
    });
    sel.value = this.filterIdx;
    const rows = this.filtered(tab, filter, a);
    this.grid.setColumns(tab.cols, tab.id);
    this.grid.setRows(rows, a);
    U.$('#rowCount').textContent = `${rows.length} filas`;
    this.renderStatus();
    if (this.rtab === 'overview' || this.rtab === 'issues' || force || !c.running) this.renderRight(a);
  },

  renderStatus() {
    const c = this.crawler;
    const total = c.urls.length, done = c.doneCount || c.urls.filter(r => r.state === 'done').length, rem = c.remaining;
    const pct = total ? Math.round(done / Math.max(1, done + rem) * 100) : 0;
    U.$('#progressBar').style.width = pct + '%';
    U.$('#progressText').textContent = (c.running && !c.paused ? 'Crawl ' : c.paused && rem ? 'Paused ' : '') + pct + '%';
    const avg = c.startedAt ? done / Math.max(1, ((c.finishedAt || Date.now()) - c.startedAt) / 1000) : 0;
    U.$('#sbRate').textContent = `Media: ${avg.toFixed(2)} URL/s · Actual: ${c.running ? c.rate.toFixed(2) : '0.00'} URL/s`;
    U.$('#sbDone').textContent = `Completado ${done} de ${done + rem} (${pct}%) · Pendientes ${rem}`;
  },

  /* ---------- Panel derecho ---------- */
  renderRightTabs() {
    const el = U.$('#rtabs');
    el.innerHTML = '';
    [['overview', 'Overview'], ['issues', 'Issues'], ['structure', 'Site Structure'], ['times', 'Response Times']].forEach(([k, n]) =>
      el.append(U.el('div', { class: 'tab' + (k === this.rtab ? ' active' : ''), onclick: () => { this.rtab = k; this.renderRightTabs(); this.renderRight(Analysis.get(this.crawler)); } }, n)));
  },

  overviewCounts(a) {
    const c = this.crawler;
    if (this._ovCache && this._ovCache.v === c.version) return this._ovCache.data;
    const data = this.tabs.map((t, ti) => {
      const base = c.urls.filter(r => !r.hidden && r.state === 'done' && t.rows(r));
      return { t, ti, total: base.length, filters: t.filters.map((f, fi) => { let n = 0; for (const r of base) { try { if (f.test(r, a, c)) n++; } catch {} } return { f, fi, n }; }) };
    });
    this._ovCache = { v: c.version, data };
    return data;
  },

  renderRight(a) {
    const el = U.$('#rcontent'), c = this.crawler;
    const scroll = el.scrollTop;
    el.innerHTML = '';
    if (this.rtab === 'overview') {
      const internal = c.urls.filter(r => r.internal && !r.hidden).length;
      el.append(U.el('div', { class: 'ov-sum', html: `<b>Summary</b><br>Total URLs encontradas: ${c.urls.filter(r => !r.hidden).length} · Internas: ${internal} · Externas: ${c.urls.filter(r => !r.internal && !r.hidden).length}<br>Indexables: ${c.urls.filter(r => r.internal && r.type === 'HTML' && r.indexability === 'Indexable').length} · No indexables: ${c.urls.filter(r => r.internal && r.indexability === 'Non-Indexable').length}${c.analysedFull ? '' : '<br><i>Ejecuta Crawl Analysis para Link Score y casi duplicados.</i>'}` }));
      for (const g of this.overviewCounts(a)) {
        const open = this.overviewOpen.has(g.t.name);
        const grp = U.el('div', { class: 'ov-group' + (open ? ' open' : '') });
        const h = U.el('div', { class: 'ov-h', onclick: () => { if (open) this.overviewOpen.delete(g.t.name); else this.overviewOpen.add(g.t.name); this.renderRight(a); } },
          U.el('span', { class: 'lbl' }, g.t.name), U.el('span', { class: 'n' }, 'URLs'), U.el('span', { class: 'p' }, '% Total'));
        const items = U.el('div', { class: 'ov-items' });
        for (const f of g.filters) {
          const iss = f.f.issue;
          const dot = iss ? U.el('span', { class: 'dot', style: `background:${iss.type === 'Issue' ? 'var(--bad)' : iss.type === 'Warning' ? 'var(--warn)' : 'var(--info)'}` }) : null;
          items.append(U.el('div', { class: 'ov-row' + (f.n ? '' : ' zero') + (g.ti === this.tabIdx && f.fi === this.filterIdx ? ' active' : ''), onclick: () => this.selectTab(g.ti, f.fi) },
            U.el('span', {}, dot, f.f.name), U.el('span', { class: 'n' }, f.n), U.el('span', { class: 'p' }, U.pct(f.n, g.total))));
        }
        grp.append(h, items);
        el.append(grp);
      }
    } else if (this.rtab === 'issues') {
      const order = { Issue: 0, Warning: 1, Opportunity: 2 }, po = { High: 0, Medium: 1, Low: 2 };
      const list = [];
      for (const g of this.overviewCounts(a)) for (const f of g.filters) if (f.f.issue && f.n) list.push({ g, f, ...f.f.issue });
      list.sort((x, y) => order[x.type] - order[y.type] || po[x.prio] - po[y.prio] || y.f.n - x.f.n);
      const cnt = t => list.filter(x => x.type === t).length;
      el.append(U.el('div', { class: 'ov-sum', html: `<span class="tag Issue">Issues ${cnt('Issue')}</span> <span class="tag Warning">Warnings ${cnt('Warning')}</span> <span class="tag Opportunity">Opportunities ${cnt('Opportunity')}</span>` }));
      el.append(U.el('div', { class: 'issues-head' }, U.el('span', {}, 'Issue Name'), U.el('span', {}, 'Type'), U.el('span', {}, 'Priority'), U.el('span', { class: 'r' }, 'URLs')));
      if (!list.length) el.append(U.el('div', { class: 'placeholder' }, c.urls.length ? '¡Sin incidencias detectadas!' : 'Rastrea una web para ver incidencias'));
      for (const it of list) {
        const key = it.g.t.name + ': ' + it.f.f.name;
        el.append(U.el('div', { class: 'issue-row', onclick: () => { this.issueOpen = this.issueOpen === key ? null : key; this.selectTab(it.g.ti, it.f.fi); } },
          U.el('span', {}, key), U.el('span', {}, U.el('span', { class: 'tag ' + it.type }, it.type)), U.el('span', { class: 'prio-' + it.prio }, it.prio), U.el('span', { class: 'r' }, it.f.n)));
        if (this.issueOpen === key) el.append(U.el('div', { class: 'issue-detail', html: `<b>Descripción:</b> ${U.esc(it.desc)}<br><b>Cómo solucionarlo:</b> ${U.esc(it.fix)}<br><b>% del total:</b> ${U.pct(it.f.n, it.g.total)}` }));
      }
      el.append(U.el('div', { style: 'padding:8px' }, U.el('button', { class: 'btn small', onclick: () => {
        U.download(`issues-overview-${Reports.stamp()}.csv`, U.toCSV(['Issue Name', 'Issue Type', 'Issue Priority', 'URLs', '% of Total', 'Description', 'How To Fix'].map(k => ({ key: k, label: k })),
          list.map(it => ({ 'Issue Name': it.g.t.name + ': ' + it.f.f.name, 'Issue Type': it.type, 'Issue Priority': it.prio, URLs: it.f.n, '% of Total': U.pct(it.f.n, it.g.total), Description: it.desc, 'How To Fix': it.fix }))), 'text/csv');
      } }, '⇩ Exportar informe de incidencias')));
    } else if (this.rtab === 'structure') {
      const pages = c.urls.filter(r => r.internal && r.type === 'HTML' && r.state === 'done' && !r.hidden);
      const depth = new Map();
      for (const r of pages) depth.set(r.depth, (depth.get(r.depth) || 0) + 1);
      const maxD = Math.max(1, ...depth.values());
      const ch = U.el('div', { class: 'chart' }, U.el('h4', {}, 'Crawl Depth'));
      [...depth.keys()].sort((x, y) => x - y).forEach(d => ch.append(U.el('div', { class: 'bar' }, U.el('span', {}, d === 0 ? 'Start' : d + (d === 1 ? ' clic' : ' clics')), U.el('div', { class: 'b', style: `width:${depth.get(d) / maxD * 100}%` }), U.el('span', { class: 'n' }, depth.get(d)))));
      el.append(ch);
      // árbol de directorios
      const root = { n: 0, ch: new Map(), idx: 0 };
      for (const r of pages) {
        let node = root; root.n++;
        if (r.indexability === 'Indexable') root.idx++;
        for (const s of new URL(r.url).pathname.split('/').filter(Boolean).slice(0, -1)) {
          if (!node.ch.has(s)) node.ch.set(s, { n: 0, ch: new Map(), idx: 0 });
          node = node.ch.get(s); node.n++;
          if (r.indexability === 'Indexable') node.idx++;
        }
      }
      const tree = U.el('div', { class: 'tree' }, U.el('h4', {}, 'Directorios (URLs · indexables)'));
      const draw = (node, name, path, lvl) => {
        const d = U.el('details', lvl < 1 ? { open: true } : {});
        d.append(U.el('summary', {}, name, U.el('span', {}, `${node.n} · ${node.idx}`)));
        [...node.ch.entries()].sort((x, y) => y[1].n - x[1].n).slice(0, 200).forEach(([k, v]) => d.append(draw(v, k + '/', path + k + '/', lvl + 1)));
        return d;
      };
      tree.append(draw(root, c.startHost ? c.startHost + '/' : '/', '/', 0));
      el.append(tree);
    } else if (this.rtab === 'times') {
      const rs = c.urls.filter(r => r.internal && r.responseTime != null && r.status);
      const buckets = [[0, 1, '0 - 1 s'], [1, 2, '1 - 2 s'], [2, 3, '2 - 3 s'], [3, 4, '3 - 4 s'], [4, 5, '4 - 5 s'], [5, 6, '5 - 6 s'], [6, 7, '6 - 7 s'], [7, 8, '7 - 8 s'], [8, 9, '8 - 9 s'], [9, 10, '9 - 10 s'], [10, 1e9, '10+ s']];
      const counts = buckets.map(([lo, hi]) => rs.filter(r => r.responseTime >= lo && r.responseTime < hi).length);
      const max = Math.max(1, ...counts);
      const ch = U.el('div', { class: 'chart' }, U.el('h4', {}, `Tiempos de respuesta (${rs.length} URLs internas)`));
      buckets.forEach((b, i) => ch.append(U.el('div', { class: 'bar' }, U.el('span', {}, b[2]), U.el('div', { class: 'b', style: `width:${counts[i] / max * 100}%` }), U.el('span', { class: 'n' }, `${counts[i]} · ${U.pct(counts[i], rs.length)}`))));
      const avg = rs.length ? rs.reduce((s, r) => s + r.responseTime, 0) / rs.length : 0;
      ch.append(U.el('p', {}, `Media: ${avg.toFixed(3)} s`));
      const codes = new Map();
      for (const r of c.urls.filter(x => x.status != null)) { const k = r.status ? Math.floor(r.status / 100) + 'xx' : 'Sin respuesta / bloqueada'; codes.set(k, (codes.get(k) || 0) + 1); }
      const cmax = Math.max(1, ...codes.values());
      ch.append(U.el('h4', {}, 'Códigos de respuesta'));
      [...codes.entries()].sort().forEach(([k, v]) => ch.append(U.el('div', { class: 'bar' }, U.el('span', {}, k), U.el('div', { class: 'b', style: `width:${v / cmax * 100}%;background:${k[0] === '2' ? 'var(--accent)' : k[0] === '3' ? 'var(--info)' : 'var(--bad)'}` }), U.el('span', { class: 'n' }, v))));
      el.append(ch);
    }
    el.scrollTop = scroll;
  },

  /* ---------- Panel inferior ---------- */
  BTABS: [['details', 'URL Details'], ['inlinks', 'Inlinks'], ['outlinks', 'Outlinks'], ['images', 'Image Details'], ['resources', 'Resources'], ['serp', 'SERP Snippet'], ['rendered', 'Rendered Page'], ['source', 'View Source'], ['headers', 'HTTP Headers'], ['cookies', 'Cookies'], ['dupes', 'Duplicate Details'], ['structured', 'Structured Data Details']],
  renderBottomTabs() {
    const el = U.$('#btabs');
    el.innerHTML = '';
    for (const [k, n] of this.BTABS) el.append(U.el('div', { class: 'tab' + (k === this.btab ? ' active' : ''), onclick: () => { this.btab = k; this.renderBottomTabs(); this.renderBottom(); } }, n));
  },

  renderBottom() {
    const el = U.$('#bcontent'), r = this.selected, c = this.crawler, a = Analysis.get(c);
    el.innerHTML = '';
    if (!r) { el.append(U.el('div', { class: 'placeholder' }, 'Selecciona una URL para ver los detalles')); return; }
    const kv = pairs => {
      const t = U.el('table', { class: 'kv' });
      for (const [k, v] of pairs) if (v !== undefined) t.append(U.el('tr', {}, U.el('th', {}, k), U.el('td', {}, v == null ? '' : String(v))));
      return t;
    };
    const linkGrid = (edges, dir) => {
      const holder = U.el('div', { style: 'position:absolute;inset:0' });
      el.append(holder);
      const g = new Grid(holder, { crawler: c, statusColor: this.statusColor, onOpen: e => { const t = c.byUrl.get(dir === 'in' ? c.urls[e.from].url : e.url); if (t) this.goToUrl(t); } });
      g.setColumns([
        { label: 'Type', w: 90, get: e => e.type },
        { label: 'From', w: 320, get: e => c.urls[e.from]?.url },
        { label: 'To', w: 320, get: e => e.url },
        { label: 'Anchor Text', w: 200, get: e => e.anchor },
        { label: 'Alt Text', w: 150, get: e => e.alt ?? '' },
        { label: 'Follow', w: 60, get: e => e.follow ? 'True' : 'False' },
        { label: 'Target', w: 70, get: e => e.target },
        { label: 'Rel', w: 90, get: e => e.rel },
        { label: 'Status Code', w: 85, num: true, get: e => e.to >= 0 ? c.urls[e.to].status ?? '' : '' },
        { label: 'Status', w: 120, get: e => e.to >= 0 ? c.urls[e.to].statusText : '' },
        { label: 'Link Position', w: 100, get: e => e.pos },
      ], 'links-' + dir);
      g.setRows(edges, null);
    };
    switch (this.btab) {
      case 'details': {
        const pairs = [['Address', r.url]];
        for (const col of TABS[0].cols.slice(1)) { const v = col.get(r, a, c); if (v !== '' && v != null) pairs.push([col.label, v]); }
        for (let i = 1; i < (r.titles || []).length; i++) pairs.push([`Title ${i + 1}`, r.titles[i]]);
        for (let i = 1; i < (r.h1s || []).length; i++) pairs.push([`H1-${i + 1}`, r.h1s[i]]);
        for (let i = 2; i < Math.min(10, (r.h2s || []).length); i++) pairs.push([`H2-${i + 1}`, r.h2s[i]]);
        if (r.og) for (const [k, v] of Object.entries(r.og)) pairs.push([k, v]);
        if (r.twitter) for (const [k, v] of Object.entries(r.twitter)) pairs.push([k, v]);
        if (r.viewport) pairs.push(['Viewport', r.viewport]);
        if (r.amp) pairs.push(['amphtml', r.amp]);
        if (c.sitemapUrls.has(r.url)) pairs.push(['Sitemaps', c.sitemapUrls.get(r.url).join(', ')]);
        for (const [k, v] of Object.entries(r.customSearch || {})) pairs.push(['Custom Search: ' + k, v]);
        for (const [k, v] of Object.entries(r.customExtract || {})) pairs.push(['Custom Extraction: ' + k, v.join(' | ')]);
        pairs.push(['Found Via', [...(r.foundVia || [])].join(', ')], ['IP', r.ip]);
        el.append(kv(pairs));
        break;
      }
      case 'inlinks': linkGrid(a.inlinkEdges.get(r.id) || [], 'in'); break;
      case 'outlinks': linkGrid(a.outlinkEdges.get(r.id) || [], 'out'); break;
      case 'images': linkGrid((a.outlinkEdges.get(r.id) || []).filter(e => e.type === 'Image').concat(r.type === 'Image' ? a.inlinkEdges.get(r.id) || [] : []), 'img'); break;
      case 'resources': linkGrid((a.outlinkEdges.get(r.id) || []).filter(e => ['CSS', 'JavaScript', 'Iframe'].includes(e.type)), 'res'); break;
      case 'serp': el.append(this.serpPanel(r)); break;
      case 'rendered':
      case 'source': {
        if (r.type !== 'HTML' || !r.status) { el.append(U.el('div', { class: 'placeholder' }, 'Solo disponible para páginas HTML')); break; }
        el.append(U.el('div', { class: 'placeholder' }, 'Descargando…'));
        const tab = this.btab;
        c.fetchRaw(r.url, 1).then(res => {
          if (this.selected !== r || this.btab !== tab) return;
          el.innerHTML = '';
          if (!res.body) { el.append(U.el('div', { class: 'placeholder' }, 'Sin contenido')); return; }
          if (tab === 'source') el.append(U.el('pre', { class: 'src', html: this.highlight(res.body) }));
          else {
            const html = res.body.replace(/<head([^>]*)>/i, `<head$1><base href="${U.esc(r.url)}">`);
            el.append(U.el('iframe', { sandbox: '', srcdoc: html, style: 'border:0;width:100%;height:100%;background:#fff' }));
          }
        }).catch(e => { el.innerHTML = ''; el.append(U.el('div', { class: 'placeholder' }, 'Error: ' + e.message)); });
        break;
      }
      case 'headers':
        el.append(U.el('pre', { class: 'src' }, r.rawHeaders || '(sin cabeceras)'));
        break;
      case 'cookies':
        el.append(kv((r.headers?.['set-cookie'] || []).map((ck, i) => [`Cookie ${i + 1}`, ck])));
        if (!(r.headers?.['set-cookie'] || []).length) el.append(U.el('div', { class: 'placeholder' }, 'Sin cookies'));
        break;
      case 'dupes': {
        const pairs = [];
        const exact = r.contentHash ? c.urls.filter(x => x !== r && x.contentHash === r.contentHash && x.status === 200) : [];
        for (const x of exact) pairs.push(['Exact duplicate (100%)', x.url]);
        for (const d of (a.nearDup.get(r.id) || []).sort((x, y) => y.sim - x.sim)) pairs.push([`Near duplicate (${Math.round(d.sim * 100)}%)`, c.urls[d.id].url]);
        if (!pairs.length) el.append(U.el('div', { class: 'placeholder' }, c.analysedFull ? 'Sin duplicados' : 'Ejecuta Crawl Analysis para calcular casi duplicados'));
        else el.append(kv(pairs));
        break;
      }
      case 'structured': {
        if (!r.structured?.raw.length) { el.append(U.el('div', { class: 'placeholder' }, 'Sin JSON-LD')); break; }
        el.append(U.el('div', { style: 'padding:6px 8px' }, U.el('a', { href: 'https://validator.schema.org/#url=' + encodeURIComponent(r.url), target: '_blank', rel: 'noopener' }, 'Validar en validator.schema.org ↗'), ' · ',
          U.el('a', { href: 'https://search.google.com/test/rich-results?url=' + encodeURIComponent(r.url), target: '_blank', rel: 'noopener' }, 'Rich Results Test ↗')));
        el.append(U.el('pre', { class: 'src' }, JSON.stringify(r.structured.raw, null, 2)));
        if (r.structured.microdata.length) el.append(kv([['Microdata', r.structured.microdata.join(', ')]]));
        break;
      }
    }
  },

  highlight(html) {
    return U.esc(html)
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="c">$1</span>')
      .replace(/(&lt;\/?)([\w:-]+)/g, '$1<span class="t">$2</span>')
      .replace(/([\w:-]+)=(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="a">$1</span>=<span class="v">$2</span>');
  },

  serpPanel(r) {
    const c = this.crawler;
    let title = r.titles?.[0] || '', desc = r.metaDescs?.[0] || '';
    const box = U.el('div', { class: 'serp-box' });
    const ed = U.el('div', { class: 'serp-edit' });
    const draw = () => {
      const u = new URL(r.url);
      box.innerHTML = '';
      box.append(U.el('div', { class: 'serp-url' }, U.el('span', { class: 'fav' }, u.hostname[0].toUpperCase()), U.el('div', {}, u.hostname.replace(/^www\./, ''), U.el('small', {}, u.origin + (u.pathname !== '/' ? ' › ' + u.pathname.split('/').filter(Boolean).join(' › ') : '')))));
      box.append(U.el('div', { class: 'serp-title' }, title || '(sin título)'));
      box.append(U.el('div', { class: 'serp-desc' }, desc || '(sin meta description: Google generará un fragmento del contenido)'));
      const tp = U.titlePx(title), dp = U.descPx(desc);
      U.$('#serpTm', ed).innerHTML = `<i class="${tp > c.cfg.titleMaxPx ? 'over' : ''}" style="width:${Math.min(100, tp / c.cfg.titleMaxPx * 100)}%"></i>`;
      U.$('#serpDm', ed).innerHTML = `<i class="${dp > c.cfg.descMaxPx ? 'over' : ''}" style="width:${Math.min(100, dp / c.cfg.descMaxPx * 100)}%"></i>`;
      U.$('#serpTl', ed).textContent = `${title.length} caracteres · ${tp}px de ${c.cfg.titleMaxPx}px`;
      U.$('#serpDl', ed).textContent = `${desc.length} caracteres · ${dp}px de ${c.cfg.descMaxPx}px`;
    };
    const ti = U.el('input', { type: 'text' }); ti.value = title; ti.oninput = () => { title = ti.value; draw(); };
    const di = U.el('textarea', { rows: 3 }); di.value = desc; di.oninput = () => { desc = di.value; draw(); };
    ed.append(U.el('label', {}, 'Title'), ti, U.el('div', { class: 'meter', id: 'serpTm' }), U.el('small', { id: 'serpTl' }),
      U.el('label', {}, 'Meta Description'), di, U.el('div', { class: 'meter', id: 'serpDm' }), U.el('small', { id: 'serpDl' }));
    const wrap = U.el('div', { class: 'serp' }, box, ed);
    setTimeout(draw);
    return wrap;
  },

  /* ---------- Menú contextual ---------- */
  contextMenu(r, e) {
    const m = U.$('#ctxmenu'), c = this.crawler;
    const enc = encodeURIComponent(r.url);
    const items = [
      ['Abrir URL en el navegador', () => window.open(r.url, '_blank', 'noopener')],
      ['Copiar URL', () => navigator.clipboard?.writeText(r.url).then(() => U.toast('URL copiada'))],
      '-',
      ['Re-Spider', () => { c.respider(r); this.updateButtons(); }],
      ['Ver Inlinks', () => { this.btab = 'inlinks'; this.renderBottomTabs(); this.renderBottom(); }],
      ['Ver Outlinks', () => { this.btab = 'outlinks'; this.renderBottomTabs(); this.renderBottom(); }],
      '-',
      ['Check Index (site:)', () => window.open('https://www.google.com/search?q=site:' + enc, '_blank', 'noopener')],
      ['PageSpeed Insights', () => window.open('https://pagespeed.web.dev/analysis?url=' + enc, '_blank', 'noopener')],
      ['Rich Results Test', () => window.open('https://search.google.com/test/rich-results?url=' + enc, '_blank', 'noopener')],
      ['Schema Validator', () => window.open('https://validator.schema.org/#url=' + enc, '_blank', 'noopener')],
      ['Wayback Machine', () => window.open('https://web.archive.org/web/*/' + r.url, '_blank', 'noopener')],
      ['W3C HTML Validator', () => window.open('https://validator.w3.org/nu/?doc=' + enc, '_blank', 'noopener')],
    ];
    m.innerHTML = '';
    for (const it of items) {
      if (it === '-') { m.append(U.el('div', { class: 'sep' })); continue; }
      m.append(U.el('div', { class: 'it', onclick: () => { m.hidden = true; it[1](); } }, it[0]));
    }
    m.hidden = false;
    m.style.left = Math.min(e.clientX, innerWidth - 240) + 'px';
    m.style.top = Math.min(e.clientY, innerHeight - m.offsetHeight - 10) + 'px';
  },

  /* ---------- Splitters ---------- */
  bindSplitters() {
    const drag = (el, onMove) => el.addEventListener('mousedown', e => {
      e.preventDefault();
      const mv = ev => onMove(ev);
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); document.body.style.cursor = ''; };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
    drag(U.$('#splitH'), ev => { const left = U.$('#left').getBoundingClientRect(); U.$('#bottom').style.height = Math.max(60, Math.min(left.height - 150, left.bottom - ev.clientY)) + 'px'; });
    drag(U.$('#splitV'), ev => { U.$('#right').style.width = Math.max(200, Math.min(innerWidth - 400, innerWidth - ev.clientX)) + 'px'; });
  },
};

App.init();
