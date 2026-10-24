/* Visualizaciones: diagrama de rastreo (ruta más corta) y árbol de directorios, con layout de fuerzas en canvas */
const Viz = {
  open(kind) {
    const c = App.crawler, a = Analysis.get(c);
    const { nodes, edges } = kind === 'dir' ? this.dirGraph(c) : this.crawlGraph(c, a);
    if (!nodes.length) { U.toast('No hay páginas HTML para visualizar'); return; }
    const wrap = U.el('div', { class: 'viz-wrap' });
    const canvas = U.el('canvas');
    const info = U.el('div', { class: 'viz-info' }, `${nodes.length} nodos · rueda = zoom · arrastrar = mover · clic = seleccionar URL`);
    const legend = U.el('div', { class: 'viz-legend', html:
      '<div><i style="background:#67b346"></i>Indexable</div><div><i style="background:#f0a020"></i>Non-Indexable</div><div><i style="background:#e05050"></i>Error 4xx/5xx</div><div><i style="background:#4a90e2"></i>Redirección</div><div><i style="background:#999"></i>Carpeta / otro</div>' });
    wrap.append(canvas, info, legend);
    Modal.open(kind === 'dir' ? 'Directory Tree Force-Directed Diagram' : 'Force-Directed Crawl Diagram', wrap, [], 'wide');
    this.run(canvas, nodes, edges, info);
  },

  color(r) {
    if (!r) return '#999';
    if (r.status >= 400 || r.status === 0) return '#e05050';
    if (r.status >= 300) return '#4a90e2';
    return r.indexability === 'Indexable' ? '#67b346' : '#f0a020';
  },

  crawlGraph(c, a) {
    const pages = c.urls.filter(r => r.internal && r.type === 'HTML' && !r.hidden).slice(0, 3000);
    const idx = new Map(pages.map((r, i) => [r.id, i]));
    const nodes = pages.map(r => ({ r, label: r.url, size: 3 + Math.sqrt(a.linkScore.get(r.id) || a.uniqueInlinks.get(r.id) || 1) * 1.2, color: this.color(r) }));
    const edges = [];
    for (const r of pages) {
      if (r.depth === 0) continue;
      // padre = primera página de profundidad-1 que enlaza o redirige aquí
      const inl = a.inlinkEdges.get(r.id) || [];
      const p = inl.find(e => (e.type === 'Hyperlink' || e.type === 'Redirect') && c.urls[e.from]?.depth === r.depth - 1 && idx.has(e.from));
      if (p) edges.push([idx.get(p.from), idx.get(r.id)]);
    }
    return { nodes, edges };
  },

  dirGraph(c) {
    const pages = c.urls.filter(r => r.internal && r.type === 'HTML' && !r.hidden).slice(0, 3000);
    const nodes = [], edges = [], byPath = new Map();
    const ensure = (key, label, r) => {
      if (byPath.has(key)) { const n = nodes[byPath.get(key)]; if (r) { n.r = r; n.color = this.color(r); } return byPath.get(key); }
      nodes.push({ r, label, size: r ? 4 : 5, color: r ? this.color(r) : '#999' });
      byPath.set(key, nodes.length - 1);
      return nodes.length - 1;
    };
    for (const r of pages) {
      const u = new URL(r.url);
      const segs = u.pathname.split('/').filter(Boolean);
      let key = u.host, parent = ensure(key, u.host + '/', null);
      segs.forEach((s, i) => {
        key += '/' + s;
        const isLast = i === segs.length - 1;
        const id = ensure(key, key, isLast ? r : null);
        if (!edges.some(e => e[0] === parent && e[1] === id)) edges.push([parent, id]);
        parent = id;
      });
      if (!segs.length) ensure(u.host, u.host + '/', r);
    }
    return { nodes, edges };
  },

  run(canvas, nodes, edges, info) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let W, H;
    const resize = () => { W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; };
    resize();
    const N = nodes.length;
    nodes.forEach((n, i) => { const ang = i * 2.399, rad = 8 * Math.sqrt(i); n.x = Math.cos(ang) * rad; n.y = Math.sin(ang) * rad; n.vx = 0; n.vy = 0; });
    let view = { x: W / 2, y: H / 2, k: 1 }, alpha = 1, hover = null, drag = null, raf;
    const cell = 60;

    const tick = () => {
      // repulsión con rejilla espacial
      const grid = new Map();
      for (let i = 0; i < N; i++) { const n = nodes[i], k = Math.floor(n.x / cell) + ',' + Math.floor(n.y / cell); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
      for (let i = 0; i < N; i++) {
        const n = nodes[i], gx = Math.floor(n.x / cell), gy = Math.floor(n.y / cell);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const l = grid.get((gx + dx) + ',' + (gy + dy)); if (!l) continue;
          for (const j of l) {
            if (j <= i) continue;
            const m = nodes[j]; let x = n.x - m.x, y = n.y - m.y, d2 = x * x + y * y || 0.01;
            if (d2 > cell * cell) continue;
            const f = 120 / d2 * alpha; n.vx += x * f; n.vy += y * f; m.vx -= x * f; m.vy -= y * f;
          }
        }
      }
      for (const [s, t] of edges) {
        const a = nodes[s], b = nodes[t]; const x = b.x - a.x, y = b.y - a.y, d = Math.sqrt(x * x + y * y) || 1;
        const f = (d - 30) * 0.05 * alpha; const fx = x / d * f, fy = y / d * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
      for (const n of nodes) {
        if (n === drag) continue;
        n.vx -= n.x * 0.002 * alpha; n.vy -= n.y * 0.002 * alpha;
        n.vx *= 0.6; n.vy *= 0.6; n.x += n.vx; n.y += n.vy;
      }
      alpha = Math.max(0.02, alpha * 0.995);
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.translate(view.x, view.y); ctx.scale(view.k, view.k);
      ctx.strokeStyle = 'rgba(128,128,128,.35)'; ctx.lineWidth = 1 / view.k;
      ctx.beginPath();
      for (const [s, t] of edges) { ctx.moveTo(nodes[s].x, nodes[s].y); ctx.lineTo(nodes[t].x, nodes[t].y); }
      ctx.stroke();
      for (const n of nodes) {
        ctx.fillStyle = n.color; ctx.beginPath(); ctx.arc(n.x, n.y, n.size, 0, 6.283); ctx.fill();
        if (n === hover) { ctx.strokeStyle = '#000'; ctx.lineWidth = 2 / view.k; ctx.stroke(); }
      }
      if (view.k > 2.2) {
        ctx.fillStyle = getComputedStyle(document.body).color; ctx.font = `${10 / view.k * 1.5}px sans-serif`;
        for (const n of nodes) ctx.fillText(n.label.replace(/^https?:\/\/[^/]+/, '') || '/', n.x + n.size + 2, n.y + 3);
      }
    };
    const loop = () => { if (!canvas.isConnected) return cancelAnimationFrame(raf); tick(); draw(); raf = requestAnimationFrame(loop); };
    loop();

    const toWorld = (e) => { const b = canvas.getBoundingClientRect(); return [(e.clientX - b.left - view.x) / view.k, (e.clientY - b.top - view.y) / view.k]; };
    const pick = (e) => { const [x, y] = toWorld(e); let best = null, bd = 1e9; for (const n of nodes) { const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd && d < (n.size + 4 / view.k) ** 2) { bd = d; best = n; } } return best; };
    let pan = null, moved = false;
    canvas.addEventListener('mousedown', e => { moved = false; const n = pick(e); if (n) { drag = n; alpha = Math.max(alpha, 0.3); } else pan = [e.clientX - view.x, e.clientY - view.y]; });
    canvas.addEventListener('mousemove', e => {
      if (drag) { const [x, y] = toWorld(e); drag.x = x; drag.y = y; moved = true; return; }
      if (pan) { view.x = e.clientX - pan[0]; view.y = e.clientY - pan[1]; moved = true; return; }
      hover = pick(e);
      canvas.style.cursor = hover ? 'pointer' : 'grab';
      if (hover) info.innerHTML = `<b>${U.esc(hover.label)}</b>` + (hover.r ? `<br>Status: ${hover.r.status} · ${hover.r.indexability} · Depth ${hover.r.depth}` : '');
    });
    window.addEventListener('mouseup', e => {
      if (drag && !moved && drag.r) { Modal.close(); App.goToUrl(drag.r); }
      drag = null; pan = null;
    });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const b = canvas.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top;
      const f = Math.exp(-e.deltaY * 0.0015);
      view.x = mx - (mx - view.x) * f; view.y = my - (my - view.y) * f; view.k *= f;
    }, { passive: false });
    new ResizeObserver(resize).observe(canvas);
  },
};
