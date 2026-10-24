/* Extracción de datos SEO de un documento HTML (en el navegador con DOMParser) */
const Parser = {
  parse(html, pageUrl, headers, cfg) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const head = doc.head;
    const out = {
      titles: [], titleOutsideHead: false,
      metaDescs: [], descOutsideHead: false,
      metaKeywords: [],
      h1s: [], h2s: [], h1Alt: false, headingSeq: [], nonSeqH1: false, nonSeqH2: false,
      metaRobots: [], metaRobotsOutsideHead: false,
      metaRefresh: null, metaRefreshUrl: null,
      canonicals: [], canonicalRelative: false, canonicalOutsideHead: false,
      relNext: null, relPrev: null, relNextHttp: null, relPrevHttp: null,
      hreflang: [], hreflangOutsideHead: false, hreflangHttp: [],
      lang: '', viewport: '', charset: '',
      og: {}, twitter: {},
      wordCount: 0, sentenceCount: 0, flesch: null, textRatio: 0,
      hash: '', minhash: null, soft404: false, lorem: false,
      structured: { jsonld: [], microdata: [], rdfa: [], raw: [], errors: 0 },
      links: [], forms: 0, insecureForms: 0,
      customSearch: {}, customExtract: {},
      amp: null, base: null,
    };

    let base = pageUrl;
    const baseEl = doc.querySelector('base[href]');
    if (baseEl) { base = U.normalize(baseEl.getAttribute('href'), pageUrl) || pageUrl; out.base = base; }
    const inHead = el => head && head.contains(el);
    const abs = h => U.normalize((h || '').trim(), base);

    // Título
    doc.querySelectorAll('title').forEach(t => {
      if (t.closest('svg')) return;
      out.titles.push(t.textContent.replace(/\s+/g, ' ').trim());
      if (!inHead(t)) out.titleOutsideHead = true;
    });

    // Meta
    doc.querySelectorAll('meta').forEach(m => {
      const name = (m.getAttribute('name') || m.getAttribute('property') || '').toLowerCase().trim();
      const he = (m.getAttribute('http-equiv') || '').toLowerCase();
      const content = (m.getAttribute('content') || '').replace(/\s+/g, ' ').trim();
      if (m.hasAttribute('charset')) out.charset = m.getAttribute('charset');
      if (name === 'description') { out.metaDescs.push(content); if (!inHead(m)) out.descOutsideHead = true; }
      else if (name === 'keywords') out.metaKeywords.push(content);
      else if (name === 'robots' || name === (cfg.robotsName || 'googlebot')) {
        out.metaRobots.push(content.toLowerCase()); if (!inHead(m)) out.metaRobotsOutsideHead = true;
      }
      else if (name === 'viewport') out.viewport = content;
      else if (name.startsWith('og:')) out.og[name] = content;
      else if (name.startsWith('twitter:')) out.twitter[name] = content;
      if (he === 'refresh') {
        out.metaRefresh = content;
        const mm = content.match(/url\s*=\s*['"]?([^'";]+)/i);
        if (mm) out.metaRefreshUrl = abs(mm[1]);
      }
    });
    out.lang = doc.documentElement.getAttribute('lang') || '';

    // <link>
    doc.querySelectorAll('link[rel]').forEach(l => {
      const rel = l.getAttribute('rel').toLowerCase().split(/\s+/);
      const href = l.getAttribute('href');
      const a = abs(href);
      if (!a) return;
      if (rel.includes('canonical')) {
        out.canonicals.push(a);
        if (!/^https?:\/\//i.test(href.trim())) out.canonicalRelative = true;
        if (!inHead(l)) out.canonicalOutsideHead = true;
        out.links.push({ type: 'Canonical', url: a, follow: true, pos: 'Head' });
      }
      if (rel.includes('next')) { out.relNext = a; out.links.push({ type: 'Next', url: a, follow: true, pos: 'Head' }); }
      if (rel.includes('prev') || rel.includes('previous')) { out.relPrev = a; out.links.push({ type: 'Prev', url: a, follow: true, pos: 'Head' }); }
      if (rel.includes('alternate') && l.hasAttribute('hreflang')) {
        out.hreflang.push({ lang: l.getAttribute('hreflang').trim(), url: a });
        if (!inHead(l)) out.hreflangOutsideHead = true;
        out.links.push({ type: 'Hreflang', url: a, follow: true, pos: 'Head', anchor: l.getAttribute('hreflang') });
      }
      if (rel.includes('amphtml')) out.amp = a;
      if (rel.includes('stylesheet')) out.links.push({ type: 'CSS', url: a, follow: true, pos: inHead(l) ? 'Head' : 'Content' });
      if (rel.includes('icon') || rel.includes('apple-touch-icon')) out.links.push({ type: 'Image', url: a, follow: true, pos: 'Head', alt: '', favicon: true });
    });

    // Cabecera HTTP Link (canonical, next/prev, hreflang)
    for (const lh of (headers['link'] || [])) {
      for (const part of lh.split(/,(?=\s*<)/)) {
        const m = part.match(/<([^>]+)>\s*;(.*)$/);
        if (!m) continue;
        const a = U.normalize(m[1], pageUrl);
        const relM = m[2].match(/rel\s*=\s*"?([^";]+)"?/i);
        const rel = relM ? relM[1].toLowerCase() : '';
        if (rel === 'canonical') out.canonicalHttp = a;
        if (rel === 'next') out.relNextHttp = a;
        if (rel === 'prev') out.relPrevHttp = a;
        const hl = m[2].match(/hreflang\s*=\s*"?([^";]+)"?/i);
        if (rel === 'alternate' && hl) out.hreflangHttp.push({ lang: hl[1], url: a });
      }
    }

    // Encabezados
    const heads = doc.querySelectorAll('h1,h2,h3,h4,h5,h6');
    let prev = 0;
    heads.forEach(h => {
      const lvl = +h.tagName[1];
      const txt = h.textContent.replace(/\s+/g, ' ').trim();
      if (lvl === 1) {
        let t = txt;
        if (!t) { const img = h.querySelector('img[alt]'); if (img) { t = img.getAttribute('alt').trim(); out.h1Alt = true; } }
        out.h1s.push(t);
      }
      if (lvl === 2) out.h2s.push(txt);
      if (prev === 0 && lvl !== 1) { if (lvl === 2) out.nonSeqH2 = true; out.nonSeqH1 = true; }
      if (prev && lvl > prev + 1 && lvl === 2) out.nonSeqH2 = true;
      out.headingSeq.push(lvl);
      prev = lvl;
    });
    if (out.headingSeq.length && out.headingSeq[0] !== 1) out.nonSeqH1 = true;

    // Datos estructurados
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try {
        const j = JSON.parse(s.textContent);
        out.structured.raw.push(j);
        const collect = o => {
          if (Array.isArray(o)) return o.forEach(collect);
          if (o && typeof o === 'object') {
            if (o['@type']) [].concat(o['@type']).forEach(t => out.structured.jsonld.push(String(t)));
            if (o['@graph']) collect(o['@graph']);
          }
        };
        collect(j);
      } catch { out.structured.errors++; out.structured.raw.push({ error: 'JSON-LD no válido', source: s.textContent.slice(0, 500) }); }
    });
    doc.querySelectorAll('[itemtype]').forEach(e => out.structured.microdata.push(e.getAttribute('itemtype').replace(/^https?:\/\/schema\.org\//, '')));
    doc.querySelectorAll('[typeof]').forEach(e => out.structured.rdfa.push(e.getAttribute('typeof')));

    // Enlaces y recursos del body
    const position = el => {
      for (let p = el; p && p !== doc.body; p = p.parentElement) {
        const tag = p.tagName;
        if (tag === 'NAV') return 'Navigation';
        if (tag === 'HEADER') return 'Header';
        if (tag === 'FOOTER') return 'Footer';
        if (tag === 'ASIDE') return 'Sidebar';
        const idc = ((p.id || '') + ' ' + (typeof p.className === 'string' ? p.className : '')).toLowerCase();
        if (/\b(nav|menu)\b/.test(idc)) return 'Navigation';
        if (/\bfooter\b/.test(idc)) return 'Footer';
        if (/\bsidebar\b/.test(idc)) return 'Sidebar';
        if (/\bheader\b/.test(idc)) return 'Header';
      }
      return 'Content';
    };

    const metaNofollow = out.metaRobots.some(r => /nofollow|none/.test(r));
    doc.querySelectorAll('a[href], area[href]').forEach(a => {
      const href = a.getAttribute('href').trim();
      if (/^(javascript:|mailto:|tel:|data:|#)/i.test(href) || href === '') {
        if (href.startsWith('#') && href.length > 1) out.links.push({ type: 'Bookmark', url: pageUrl, frag: href.slice(1), follow: true, pos: position(a) });
        return;
      }
      const url = abs(href);
      if (!url) return;
      const rel = (a.getAttribute('rel') || '').toLowerCase();
      const img = a.querySelector('img');
      const frag = href.includes('#') ? href.split('#')[1] : '';
      out.links.push({
        type: 'Hyperlink', url,
        anchor: a.textContent.replace(/\s+/g, ' ').trim().slice(0, 300),
        alt: img ? (img.getAttribute('alt') || '') : '',
        follow: !(rel.includes('nofollow') || metaNofollow),
        rel, target: a.getAttribute('target') || '', pos: position(a), frag,
      });
    });
    doc.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src') || img.getAttribute('data-src') || (img.getAttribute('srcset') || '').split(/[\s,]+/)[0];
      const url = abs(src);
      if (!url) return;
      out.links.push({
        type: 'Image', url, follow: true, pos: position(img),
        alt: img.getAttribute('alt'), // null = sin atributo
        hasAlt: img.hasAttribute('alt'),
        hasSize: img.hasAttribute('width') && img.hasAttribute('height'),
        lazy: img.getAttribute('loading') === 'lazy',
      });
    });
    doc.querySelectorAll('script[src]').forEach(s => {
      const url = abs(s.getAttribute('src'));
      if (url) out.links.push({ type: 'JavaScript', url, follow: true, pos: inHead(s) ? 'Head' : 'Content' });
    });
    doc.querySelectorAll('iframe[src]').forEach(f => {
      const url = abs(f.getAttribute('src'));
      if (url) out.links.push({ type: 'Iframe', url, follow: true, pos: position(f) });
    });
    if (out.metaRefreshUrl) out.links.push({ type: 'Meta Refresh', url: out.metaRefreshUrl, follow: true, pos: 'Head' });

    // Formularios
    const isHttps = pageUrl.startsWith('https:');
    doc.querySelectorAll('form').forEach(f => {
      out.forms++;
      const act = abs(f.getAttribute('action') || pageUrl);
      if (isHttps && act && act.startsWith('http:')) out.insecureForms++;
    });

    // IDs de la página (para marcadores rotos)
    out.ids = [...doc.querySelectorAll('[id],a[name]')].map(e => e.id || e.getAttribute('name')).slice(0, 2000);

    // Contenido
    const bodyClone = doc.body ? doc.body.cloneNode(true) : null;
    let text = '';
    if (bodyClone) {
      bodyClone.querySelectorAll('script,style,noscript,template,svg').forEach(e => e.remove());
      // el área de contenido excluye navegación, cabecera y pie
      const content = bodyClone.cloneNode(true);
      content.querySelectorAll('nav,header,footer').forEach(e => e.remove());
      text = (content.textContent || '').replace(/\s+/g, ' ').trim();
      const full = (bodyClone.textContent || '').replace(/\s+/g, ' ').trim();
      out.textRatio = html.length ? +(full.length / html.length * 100).toFixed(2) : 0;
    }
    const words = text ? text.split(' ').filter(w => /[\p{L}\p{N}]/u.test(w)) : [];
    out.wordCount = words.length;
    const sentences = text.split(/[.!?¡¿]+\s/).filter(s => s.trim().split(' ').length > 2);
    out.sentenceCount = sentences.length;
    if (words.length > 30 && sentences.length) {
      const syl = words.reduce((s, w) => s + U.syllables(w), 0);
      out.flesch = +(206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syl / words.length)).toFixed(1);
    }
    out.avgWordsPerSentence = sentences.length ? +(words.length / sentences.length).toFixed(1) : 0;
    out.hash = U.hash(html.replace(/\s+/g, ' '));
    out.contentHash = U.hash(text);
    out.minhash = U.minhash(text);
    const t0 = (out.titles[0] || '') + ' ' + (out.h1s[0] || '');
    out.soft404 = /\b(404|not found|no encontrad[ao]|page not found|página no existe)\b/i.test(t0) || (/\b(404|not found)\b/i.test(text.slice(0, 500)) && out.wordCount < 150);
    out.lorem = /lorem ipsum/i.test(text);

    // Búsqueda personalizada
    for (const cs of (cfg.customSearch || [])) {
      if (!cs.name || !cs.value) continue;
      const hay = cs.scope === 'text' ? text : html;
      let count = 0;
      try {
        if (cs.regex) count = (hay.match(new RegExp(cs.value, 'gi')) || []).length;
        else { const v = cs.value.toLowerCase(), h = hay.toLowerCase(); let i = 0; while ((i = h.indexOf(v, i)) !== -1) { count++; i += v.length; } }
      } catch { count = 0; }
      out.customSearch[cs.name] = cs.mode === 'not' ? (count === 0 ? 1 : 0) : count;
    }
    // Extracción personalizada
    for (const ce of (cfg.customExtract || [])) {
      if (!ce.name || !ce.expr) continue;
      const vals = [];
      try {
        if (ce.type === 'xpath') {
          const r = doc.evaluate(ce.expr, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          for (let i = 0; i < r.snapshotLength && i < 50; i++) vals.push(Parser.extractVal(r.snapshotItem(i), ce));
        } else if (ce.type === 'regex') {
          const re = new RegExp(ce.expr, 'gi'); let m, n = 0;
          while ((m = re.exec(html)) && n++ < 50) { vals.push(m[1] ?? m[0]); if (!m[0]) re.lastIndex++; }
        } else {
          doc.querySelectorAll(ce.expr).forEach((n, i) => { if (i < 50) vals.push(Parser.extractVal(n, ce)); });
        }
      } catch (e) { vals.push('ERROR: ' + e.message); }
      out.customExtract[ce.name] = vals;
    }
    return out;
  },

  extractVal(node, ce) {
    if (node.nodeType !== 1) return (node.textContent || '').trim();
    if (ce.attr) return node.getAttribute(ce.attr) || '';
    if (ce.what === 'html') return node.innerHTML.trim();
    if (ce.what === 'outer') return node.outerHTML.trim();
    return node.textContent.replace(/\s+/g, ' ').trim();
  },

  /* Analiza directivas meta robots + X-Robots-Tag */
  directives(metaRobots, xRobots) {
    const all = [...metaRobots, ...xRobots].join(',').toLowerCase();
    const has = d => new RegExp('(^|[\\s,:])' + d + '($|[\\s,:])').test(all);
    return {
      noindex: has('noindex') || has('none'),
      nofollow: has('nofollow') || has('none'),
      none: has('none'), index: has('index'), follow: has('follow'),
      noarchive: has('noarchive'), nosnippet: has('nosnippet'), noodp: has('noodp'), noydir: has('noydir'),
      noimageindex: has('noimageindex'), notranslate: has('notranslate'),
      maxSnippet: /max-snippet/.test(all), maxImage: /max-image-preview/.test(all), maxVideo: /max-video-preview/.test(all),
      unavailableAfter: /unavailable_after/.test(all),
    };
  },
};
