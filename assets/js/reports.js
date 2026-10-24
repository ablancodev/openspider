/* Informes, exportaciones masivas y generador de sitemaps */
const Reports = {
  stamp() { return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'); },

  table(cols, rows, title, fname) {
    const holder = U.el('div', { style: 'flex:1;position:relative' });
    const m = Modal.open(title + ` (${rows.length})`, holder, [
      { label: '⇩ Exportar CSV', onclick: () => U.download(`${fname}-${Reports.stamp()}.csv`, U.toCSV(cols, rows), 'text/csv') },
      { label: 'Cerrar', cls: 'primary', onclick: () => Modal.close() },
    ], 'wide');
    const g = new Grid(holder, { crawler: App.crawler, statusColor: App.statusColor });
    g.setColumns(cols.map(c => ({ ...c, get: c.get || (r => r[c.key]) })), fname);
    g.setRows(rows, null);
    return m;
  },

  /* ---- Exportaciones masivas ---- */
  edges(filterEdge, filterTo) {
    const c = App.crawler, a = Analysis.get(c), out = [];
    for (const e of c.links) {
      if (filterEdge && !filterEdge(e)) continue;
      const to = e.to >= 0 ? c.urls[e.to] : null;
      if (filterTo && !filterTo(to, e)) continue;
      out.push({
        Type: e.type, Source: c.urls[e.from]?.url, Destination: e.url, 'Alt Text': e.type === 'Image' || e.alt ? (e.alt ?? '') : '',
        Anchor: e.anchor, 'Status Code': to?.status ?? '', Status: to?.statusText ?? '', Follow: e.follow ? 'True' : 'False',
        Target: e.target, Rel: e.rel, 'Link Position': e.pos,
      });
    }
    return out;
  },
  edgeCols: ['Type', 'Source', 'Destination', 'Alt Text', 'Anchor', 'Status Code', 'Status', 'Follow', 'Target', 'Rel', 'Link Position'].map(k => ({ key: k, label: k, w: k === 'Source' || k === 'Destination' ? 320 : 110, num: k === 'Status Code' })),

  bulk(kind) {
    const c = App.crawler;
    const map = {
      allInlinks: ['All Inlinks', () => this.edges(e => e.type === 'Hyperlink')],
      allOutlinks: ['All Outlinks', () => this.edges()],
      allAnchors: ['All Anchor Text', () => this.edges(e => e.type === 'Hyperlink' && c.urls[e.from]?.internal)],
      allImages: ['All Images', () => this.edges(e => e.type === 'Image')],
      imgMissingAlt: ['Images Missing Alt Text Inlinks', () => this.edges(e => e.type === 'Image' && !e.alt)],
      r3xx: ['Redirection (3xx) Inlinks', () => this.edges(e => e.type === 'Hyperlink', t => t && t.status >= 300 && t.status < 400)],
      r4xx: ['Client Error (4xx) Inlinks', () => this.edges(e => e.type === 'Hyperlink' || e.type === 'Image', t => t && t.status >= 400 && t.status < 500)],
      r5xx: ['Server Error (5xx) Inlinks', () => this.edges(null, t => t && t.status >= 500)],
      noResp: ['No Response Inlinks', () => this.edges(null, t => t && t.noResponse)],
      blocked: ['Blocked by Robots.txt Inlinks', () => this.edges(null, t => t && t.blockedRobots)],
      mixed: ['Mixed Content (Insecure) Inlinks', () => this.edges(e => e.type !== 'Hyperlink' && c.urls[e.from]?.url.startsWith('https:') && e.url.startsWith('http:'))],
      canonicals: ['Canonicals', () => this.edges(e => e.type === 'Canonical')],
      hreflang: ['Hreflang', () => this.edges(e => e.type === 'Hreflang')],
      nofollowInt: ['Internal Nofollow Links', () => this.edges(e => e.type === 'Hyperlink' && !e.follow, t => t && t.internal)],
    };
    const [title, fn] = map[kind];
    this.table(this.edgeCols, fn(), title, kind);
  },

  exportStructured() {
    const c = App.crawler, rows = [];
    for (const r of c.urls) if (r.structured?.raw.length) rows.push({ Address: r.url, Types: [...new Set(r.structured.jsonld)].join(', '), JSON: JSON.stringify(r.structured.raw) });
    U.download(`structured-data-${this.stamp()}.csv`, U.toCSV([{ key: 'Address', label: 'Address' }, { key: 'Types', label: 'Types' }, { key: 'JSON', label: 'JSON-LD' }], rows), 'text/csv');
  },

  /* ---- Informes ---- */
  crawlOverview() {
    const c = App.crawler, a = Analysis.get(c), rows = [];
    const all = c.urls.filter(r => !r.hidden);
    rows.push({ Section: 'Summary', Filter: 'Total URLs Encountered', URLs: all.length });
    rows.push({ Section: 'Summary', Filter: 'Total Internal URLs', URLs: all.filter(r => r.internal).length });
    rows.push({ Section: 'Summary', Filter: 'Total External URLs', URLs: all.filter(r => !r.internal).length });
    rows.push({ Section: 'Summary', Filter: 'Total Internal Indexable URLs', URLs: all.filter(r => r.internal && r.indexability === 'Indexable' && r.type === 'HTML').length });
    rows.push({ Section: 'Summary', Filter: 'Total Internal Non-Indexable URLs', URLs: all.filter(r => r.internal && r.indexability === 'Non-Indexable').length });
    for (const t of allTabs(c.cfg)) {
      const base = all.filter(t.rows);
      for (const f of t.filters) {
        let n = 0;
        for (const r of base) try { if (f.test(r, a, c)) n++; } catch {}
        rows.push({ Section: t.name, Filter: f.name, URLs: n, '% of Total': U.pct(n, base.length) });
      }
    }
    this.table([{ key: 'Section', label: 'Section', w: 160 }, { key: 'Filter', label: 'Filter', w: 320 }, { key: 'URLs', label: 'URLs', w: 90, num: true }, { key: '% of Total', label: '% of Total', w: 100 }], rows, 'Crawl Overview', 'crawl-overview');
  },

  redirectChains() {
    const c = App.crawler, a = Analysis.get(c), rows = [];
    const starts = c.urls.filter(r => r.redirectUrl && (a.inlinks.get(r.id) || r.depth === 0));
    for (const s of starts) {
      // solo inicios de cadena: nadie redirige a ella
      const chain = [s], seen = new Set([s.url]);
      let cur = s, loop = false;
      while (cur && cur.redirectUrl) {
        if (seen.has(cur.redirectUrl)) { loop = true; break; }
        seen.add(cur.redirectUrl);
        const nx = c.byUrl.get(cur.redirectUrl);
        if (!nx) { chain.push({ url: cur.redirectUrl, status: '', statusText: 'Not crawled' }); break; }
        chain.push(nx);
        cur = nx;
      }
      const fin = chain[chain.length - 1];
      const row = { Address: s.url, 'Number of Redirects': chain.length - 1, 'Chain Type': [...new Set(chain.slice(0, -1).map(x => x.redirectType))].join(' + '), Loop: loop ? 'True' : 'False', 'Final Address': fin.url, 'Final Status Code': fin.status ?? '', 'Final Indexability': fin.indexability || '' };
      chain.slice(1, 6).forEach((x, i) => { row[`Redirect ${i + 1}`] = x.url; row[`Status ${i + 1}`] = chain[i].status; });
      rows.push(row);
    }
    rows.sort((x, y) => y['Number of Redirects'] - x['Number of Redirects']);
    const cols = ['Address', 'Number of Redirects', 'Chain Type', 'Loop', 'Final Address', 'Final Status Code', 'Final Indexability', 'Status 1', 'Redirect 1', 'Status 2', 'Redirect 2', 'Status 3', 'Redirect 3'].map(k => ({ key: k, label: k, w: /Address|Redirect \d/.test(k) ? 300 : 110, num: /Number|Status/.test(k) }));
    this.table(cols, rows, 'Redirect Chains', 'redirect-chains');
  },

  canonicalChains() {
    const c = App.crawler, rows = [];
    for (const r of c.urls) {
      const can = r.canonicals?.[0];
      if (!can || can === r.url) continue;
      const t = c.byUrl.get(can);
      const next = t?.canonicals?.[0] && t.canonicals[0] !== t.url ? t.canonicals[0] : (t?.redirectUrl || '');
      rows.push({ Address: r.url, Canonical: can, 'Canonical Status': t?.status ?? 'Not crawled', 'Canonical Indexability': t?.indexability || '', 'Next Hop': next, Chain: next ? 'True' : 'False' });
    }
    this.table(['Address', 'Canonical', 'Canonical Status', 'Canonical Indexability', 'Next Hop', 'Chain'].map(k => ({ key: k, label: k, w: /Address|Canonical$|Next/.test(k) ? 320 : 130 })), rows, 'Canonical Chains', 'canonical-chains');
  },

  serpSummary() {
    const c = App.crawler, rows = c.urls.filter(r => r.internal && r.titles && r.status === 200).map(r => ({
      Address: r.url, Title: r.titles[0] || '', 'Title Length': (r.titles[0] || '').length, 'Title Pixel Width': U.titlePx(r.titles[0]),
      Description: r.metaDescs[0] || '', 'Description Length': (r.metaDescs[0] || '').length, 'Description Pixel Width': U.descPx(r.metaDescs[0]),
    }));
    this.table(Object.keys(rows[0] || { Address: 1 }).map(k => ({ key: k, label: k, w: /Address|Title$|Description$/.test(k) ? 300 : 120, num: /Length|Width/.test(k) })), rows, 'SERP Summary', 'serp-summary');
  },

  orphans() {
    const c = App.crawler, a = Analysis.get(c);
    const rows = [...c.sitemapUrls.keys()].filter(u => { const r = c.byUrl.get(u); return !r || !a.anchorLinked.has(r.id); })
      .map(u => { const r = c.byUrl.get(u); return { Address: u, Source: 'Sitemap', 'Status Code': r?.status ?? 'Not crawled', Indexability: r?.indexability || '', Sitemaps: c.sitemapUrls.get(u).join(' | ') }; });
    this.table(['Address', 'Source', 'Status Code', 'Indexability', 'Sitemaps'].map(k => ({ key: k, label: k, w: k === 'Address' || k === 'Sitemaps' ? 340 : 110 })), rows, 'Orphan Pages', 'orphan-pages');
  },

  responseTimes() {
    const c = App.crawler, rows = c.urls.filter(r => r.internal && r.responseTime != null).sort((x, y) => y.responseTime - x.responseTime)
      .map(r => ({ Address: r.url, 'Content Type': r.contentType, 'Status Code': r.status, 'Response Time': r.responseTime, TTFB: r.ttfb, Size: r.size }));
    this.table(['Address', 'Content Type', 'Status Code', 'Response Time', 'TTFB', 'Size'].map(k => ({ key: k, label: k, w: k === 'Address' ? 400 : 120, num: k !== 'Address' && k !== 'Content Type' })), rows, 'Response Times', 'response-times');
  },

  robotsView() {
    const c = App.crawler;
    Promise.all([...c.robots.values()]).then(list => {
      const body = U.el('div', { class: 'report' });
      if (!list.length) body.append('Aún no se ha descargado ningún robots.txt.');
      for (const rb of list) {
        body.append(U.el('h3', {}, `${rb.url || ''} — HTTP ${rb.status}`));
        body.append(U.el('pre', { class: 'src' }, rb.text || '(vacío)'));
        if (rb.sitemaps.length) body.append(U.el('div', {}, 'Sitemaps: ' + rb.sitemaps.join(', ')));
      }
      const tester = U.el('div', { class: 'form', style: 'margin-top:16px' },
        U.el('h3', {}, 'Probador de robots.txt'),
        U.el('div', { class: 'row' }, U.el('input', { type: 'text', id: 'rbTest', placeholder: 'https://…/ruta' }), U.el('button', { class: 'btn', onclick: async () => {
          const u = U.$('#rbTest').value.trim(); if (!u) return;
          const rb = await c.getRobots(u);
          const r = rb.check(u, c.cfg.userAgent.includes('Googlebot') ? 'googlebot' : c.cfg.userAgent);
          U.$('#rbRes').textContent = (r.allowed ? '✅ Permitida' : '⛔ Bloqueada') + (r.rule ? ` — regla: ${r.rule} (línea ${r.line})` : ' — sin regla coincidente');
        } }, 'Probar')),
        U.el('div', { id: 'rbRes' }));
      body.append(tester);
      Modal.open('robots.txt', body, [{ label: 'Cerrar', cls: 'primary', onclick: () => Modal.close() }], 'wide');
    });
  },

  /* ---- Sitemaps ---- */
  sitemapDialog(images = false) {
    const c = App.crawler;
    const form = U.el('div', { class: 'cfg-pane form' },
      U.el('h3', {}, images ? 'Generar sitemap de imágenes' : 'Generar sitemap XML'),
      U.el('div', { class: 'hint' }, 'Incluye las páginas HTML internas con respuesta 200 e indexables (sin noindex ni canonical a otra URL).'),
      U.el('div', { class: 'row chk' }, U.el('label', {}, U.el('input', { type: 'checkbox', id: 'smNoindex' }), 'Incluir páginas noindex')),
      U.el('div', { class: 'row chk' }, U.el('label', {}, U.el('input', { type: 'checkbox', id: 'smCanon' }), 'Incluir páginas canonicalizadas')),
      U.el('div', { class: 'row chk' }, U.el('label', {}, U.el('input', { type: 'checkbox', id: 'smPdf' }), 'Incluir PDFs')),
      U.el('div', { class: 'row chk' }, U.el('label', {}, U.el('input', { type: 'checkbox', id: 'smLastmod', checked: true }), 'Incluir <lastmod> (de la cabecera Last-Modified o fecha actual)')),
      U.el('div', { class: 'row chk' }, U.el('label', {}, U.el('input', { type: 'checkbox', id: 'smPrio', checked: true }), 'Incluir <priority> según profundidad')),
      U.el('div', { class: 'row' }, U.el('label', {}, 'changefreq'), U.el('select', { id: 'smFreq' }, ['', 'always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'].map(v => U.el('option', { value: v }, v || '(no incluir)')))),
    );
    Modal.open('Sitemaps', form, [
      { label: 'Cancelar', onclick: () => Modal.close() },
      { label: 'Generar y descargar', cls: 'primary', onclick: () => {
        const opt = { noindex: U.$('#smNoindex').checked, canon: U.$('#smCanon').checked, pdf: U.$('#smPdf').checked, lastmod: U.$('#smLastmod').checked, prio: U.$('#smPrio').checked, freq: U.$('#smFreq').value };
        const xml = this.buildSitemap(c, opt, images);
        Modal.close();
        U.download(images ? 'image-sitemap.xml' : 'sitemap.xml', xml, 'application/xml');
      } },
    ]);
  },

  buildSitemap(c, opt, images) {
    const a = Analysis.get(c);
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const pages = c.urls.filter(r => r.internal && r.status === 200 && (r.type === 'HTML' || (opt.pdf && r.type === 'PDF'))).filter(r => {
      if (r.indexabilityStatus === 'noindex' && !opt.noindex) return false;
      if (r.indexabilityStatus === 'Canonicalised' && !opt.canon) return false;
      return true;
    });
    const today = new Date().toISOString().slice(0, 10);
    let x = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"' + (images ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : '') + '>\n';
    for (const r of pages) {
      x += '  <url>\n    <loc>' + esc(r.url) + '</loc>\n';
      if (opt.lastmod) { const d = r.lastModified ? new Date(r.lastModified) : null; x += '    <lastmod>' + (d && !isNaN(d) ? d.toISOString().slice(0, 10) : today) + '</lastmod>\n'; }
      if (opt.freq) x += '    <changefreq>' + opt.freq + '</changefreq>\n';
      if (opt.prio) x += '    <priority>' + Math.max(0.1, 1 - r.depth * 0.2).toFixed(1) + '</priority>\n';
      if (images) {
        const imgs = new Set((a.outlinkEdges.get(r.id) || []).filter(e => e.type === 'Image' && c.isInternal(e.url)).map(e => e.url));
        for (const im of [...imgs].slice(0, 1000)) x += '    <image:image><image:loc>' + esc(im) + '</image:loc></image:image>\n';
      }
      x += '  </url>\n';
    }
    return x + '</urlset>\n';
  },
};
