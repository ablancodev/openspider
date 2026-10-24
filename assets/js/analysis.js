/* Análisis del rastreo: contadores, duplicados, Link Score, casi duplicados, hreflang, sitemaps */
const Analysis = {
  cache: null,
  get(crawler) {
    if (this.cache && this.cache.version === crawler.version) return this.cache;
    this.cache = this.compute(crawler);
    return this.cache;
  },

  compute(c) {
    const urls = c.urls;
    const a = {
      version: c.version,
      inlinks: new Map(), uniqueInlinks: new Map(), outlinks: new Map(), uniqueOutlinks: new Map(),
      extOutlinks: new Map(), uniqueExtOutlinks: new Map(), inlinkEdges: new Map(), outlinkEdges: new Map(),
      imgInlinks: new Map(), linkedUrls: new Set(), anchorLinked: new Set(),
      counts: { title: new Map(), desc: new Map(), kw: new Map(), h1: new Map(), h2: new Map(), hash: new Map(), contentHash: new Map() },
      mixed: new Set(), unsafeCross: new Set(), hreflangIssues: new Map(), brokenBookmark: new Set(),
      internalNofollowOut: new Set(), noAnchorOut: new Set(), nonDescAnchor: new Set(),
      imgNoAlt: new Set(), imgNoAltAttr: new Set(), imgNoSize: new Set(), imgLongAlt: new Set(),
      pagesWithImgNoAlt: new Set(), nearDup: new Map(), linkScore: new Map(), total: 0,
    };
    const get = (m, k) => m.get(k) || 0;
    const add = (m, k, v = 1) => m.set(k, get(m, k) + v);
    const pushTo = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
    const nonDesc = /^(click here|here|read more|more|learn more|this|link|aquí|aqui|haz clic aquí|pincha aquí|leer más|ver más|más|mas|saber más|más información|go|continue|seguir leyendo)$/i;

    const uniqIn = new Map(), uniqOut = new Map(), uniqExt = new Map();
    for (const e of c.links) {
      const to = c.byUrl.get(e.url);
      e.to = to ? to.id : -1;
      const from = urls[e.from];
      if (!from) continue;
      pushTo(a.outlinkEdges, e.from, e);
      if (to) pushTo(a.inlinkEdges, to.id, e);
      if (e.type === 'Hyperlink') {
        const internal = to ? to.internal : c.isInternal(e.url);
        if (internal) {
          add(a.outlinks, e.from);
          if (!uniqOut.has(e.from)) uniqOut.set(e.from, new Set());
          uniqOut.get(e.from).add(e.url);
          if (!e.follow) a.internalNofollowOut.add(e.from);
          if (!e.anchor && !e.alt) a.noAnchorOut.add(e.from);
          if (e.anchor && nonDesc.test(e.anchor.trim())) a.nonDescAnchor.add(e.from);
        } else {
          add(a.extOutlinks, e.from);
          if (!uniqExt.has(e.from)) uniqExt.set(e.from, new Set());
          uniqExt.get(e.from).add(e.url);
          if (e.target === '_blank' && !/noopener|noreferrer/.test(e.rel)) a.unsafeCross.add(e.from);
        }
        if (to) {
          add(a.inlinks, to.id);
          if (!uniqIn.has(to.id)) uniqIn.set(to.id, new Set());
          uniqIn.get(to.id).add(e.from);
          a.anchorLinked.add(to.id);
        }
        if (e.frag && to && to.ids && !to.ids.includes(e.frag)) a.brokenBookmark.add(e.from);
      }
      if (to) a.linkedUrls.add(to.id);
      if (e.type === 'Image') {
        if (to) add(a.imgInlinks, to.id);
        if (from.url.startsWith('https:') && e.url.startsWith('http:')) a.mixed.add(e.from);
        if (to && e.hasAlt === false) { a.imgNoAltAttr.add(to.id); a.pagesWithImgNoAlt.add(e.from); }
        if (to && e.hasAlt && !e.alt) { a.imgNoAlt.add(to.id); a.pagesWithImgNoAlt.add(e.from); }
        if (to && e.alt && e.alt.length > c.cfg.altMaxChars) a.imgLongAlt.add(to.id);
        if (to && e.hasSize === false) a.imgNoSize.add(to.id);
      }
      if ((e.type === 'JavaScript' || e.type === 'CSS' || e.type === 'Iframe') && from.url.startsWith('https:') && e.url.startsWith('http:')) a.mixed.add(e.from);
    }
    for (const [k, s] of uniqIn) a.uniqueInlinks.set(k, s.size);
    for (const [k, s] of uniqOut) a.uniqueOutlinks.set(k, s.size);
    for (const [k, s] of uniqExt) a.uniqueExtOutlinks.set(k, s.size);

    // Duplicados (solo HTML indexable con 200)
    const pages = urls.filter(r => r.internal && r.type === 'HTML' && r.status === 200);
    a.total = urls.filter(r => r.internal && !r.hidden).length;
    for (const r of pages) {
      if (r.indexability !== 'Indexable') continue;
      if (r.titles?.[0]) add(a.counts.title, r.titles[0].toLowerCase());
      if (r.metaDescs?.[0]) add(a.counts.desc, r.metaDescs[0].toLowerCase());
      if (r.metaKeywords?.[0]) add(a.counts.kw, r.metaKeywords[0].toLowerCase());
      if (r.h1s?.[0]) add(a.counts.h1, r.h1s[0].toLowerCase());
      if (r.h2s?.[0]) add(a.counts.h2, r.h2s[0].toLowerCase());
      if (r.contentHash) add(a.counts.contentHash, r.contentHash);
    }

    // Casi duplicados (MinHash). Solo si el análisis está activo y el tamaño es razonable.
    const mh = pages.filter(r => r.minhash && r.indexability === 'Indexable');
    if (c.analysedFull && mh.length <= 6000) {
      const th = c.cfg.nearDupThreshold / 100;
      // LSH por bandas para no comparar todo con todo
      const bands = 16, rows = U.MH_N / bands, buckets = new Map();
      for (const r of mh) {
        for (let b = 0; b < bands; b++) {
          const key = b + ':' + r.minhash.slice(b * rows, b * rows + rows).join(',');
          pushTo(buckets, key, r);
        }
      }
      const seen = new Set();
      for (const list of buckets.values()) {
        if (list.length < 2 || list.length > 500) continue;
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const x = list[i], y = list[j], k = x.id < y.id ? x.id + '-' + y.id : y.id + '-' + x.id;
          if (seen.has(k)) continue;
          seen.add(k);
          if (x.contentHash === y.contentHash) continue;
          const s = U.mhSim(x.minhash, y.minhash);
          if (s >= th) { pushTo(a.nearDup, x.id, { id: y.id, sim: s }); pushTo(a.nearDup, y.id, { id: x.id, sim: s }); }
        }
      }
    }

    // Link Score (PageRank interno, escala logarítmica 0-100)
    if (c.analysedFull) {
      const nodes = pages.map(r => r.id), idx = new Map(nodes.map((id, i) => [id, i]));
      const out = nodes.map(() => []);
      for (const e of c.links) {
        if (e.type !== 'Hyperlink' || !e.follow || e.to < 0) continue;
        const fi = idx.get(e.from), ti = idx.get(e.to);
        if (fi != null && ti != null && fi !== ti) out[fi].push(ti);
      }
      const n = nodes.length;
      if (n) {
        let pr = new Float64Array(n).fill(1 / n);
        for (let it = 0; it < 25; it++) {
          const nx = new Float64Array(n).fill(0.15 / n);
          let dangling = 0;
          for (let i = 0; i < n; i++) {
            if (!out[i].length) { dangling += pr[i]; continue; }
            const share = 0.85 * pr[i] / out[i].length;
            for (const t of out[i]) nx[t] += share;
          }
          for (let i = 0; i < n; i++) nx[i] += 0.85 * dangling / n;
          pr = nx;
        }
        let max = 0, min = Infinity;
        for (const v of pr) { max = Math.max(max, v); min = Math.min(min, v); }
        const lmax = Math.log(max / min || 1) || 1;
        nodes.forEach((id, i) => a.linkScore.set(id, Math.round(1 + 99 * Math.log(pr[i] / min) / lmax)));
      }
    }

    // Hreflang: enlaces de retorno
    const hrefByUrl = new Map();
    for (const r of pages) if (r.hreflang?.length) hrefByUrl.set(r.url, r.hreflang);
    const validLang = /^(x-default|[a-z]{2,3}(-([A-Za-z]{4}))?(-([A-Za-z]{2}|\d{3}))?)$/i;
    for (const r of pages) {
      const hl = r.hreflang || [];
      if (!hl.length) continue;
      const iss = { missingReturn: [], non200: [], incorrectCodes: [], noSelf: true, noXDefault: true, multiple: false, unlinked: [], nonCanonical: [], noindexReturn: [], inconsistent: [] };
      const langs = new Set();
      for (const h of hl) {
        if (h.url === r.url) iss.noSelf = false;
        if (h.lang.toLowerCase() === 'x-default') iss.noXDefault = false;
        if (!validLang.test(h.lang)) iss.incorrectCodes.push(h.lang);
        if (langs.has(h.lang.toLowerCase())) iss.multiple = true;
        langs.add(h.lang.toLowerCase());
        const t = c.byUrl.get(h.url);
        if (t && t.status != null && t.status !== 200) iss.non200.push(h.url);
        if (t && !a.anchorLinked.has(t.id)) iss.unlinked.push(h.url);
        if (t && t.indexabilityStatus === 'Canonicalised') iss.nonCanonical.push(h.url);
        if (t && t.indexabilityStatus === 'noindex') iss.noindexReturn.push(h.url);
        if (h.url !== r.url && hrefByUrl.has(h.url)) {
          const back = hrefByUrl.get(h.url).find(x => x.url === r.url);
          if (!back) iss.missingReturn.push(h.url);
          else {
            const mine = hl.find(x => x.url === r.url);
            if (mine && mine.lang.toLowerCase() !== back.lang.toLowerCase()) iss.inconsistent.push(h.url);
          }
        }
      }
      a.hreflangIssues.set(r.id, iss);
    }
    return a;
  },
};
