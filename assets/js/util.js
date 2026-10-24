/* Utilidades generales */
const U = {
  $(sel, root = document) { return root.querySelector(sel); },
  $$(sel, root = document) { return [...root.querySelectorAll(sel)]; },
  el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  },
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  fmtBytes(n) {
    if (n == null || isNaN(n)) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  },
  pct(a, b) { return b ? (a / b * 100).toFixed(2) + '%' : '0%'; },
  download(name, content, type = 'text/plain') {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = U.el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  toCSV(columns, rows) {
    const q = v => {
      v = v == null ? '' : String(v);
      return /[",\n\r;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    const lines = [columns.map(c => q(c.label)).join(',')];
    for (const r of rows) lines.push(columns.map(c => q(c.get ? c.get(r) : r[c.key])).join(','));
    return '﻿' + lines.join('\r\n');
  },
  /* Normaliza una URL: quita el fragmento, minúsculas en host, puerto por defecto */
  normalize(href, base) {
    try {
      const u = new URL(href, base);
      if (!/^https?:$/.test(u.protocol)) return null;
      u.hash = '';
      if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) u.port = '';
      return u.href;
    } catch { return null; }
  },
  host(url) { try { return new URL(url).hostname; } catch { return ''; } },
  rootDomain(host) {
    const p = host.split('.');
    if (p.length <= 2) return host;
    const sld = p[p.length - 2];
    // heurística para ccTLD de 2 niveles (co.uk, com.es, com.mx...)
    if (['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'gob'].includes(sld) && p[p.length - 1].length === 2) return p.slice(-3).join('.');
    return p.slice(-2).join('.');
  },
  statusText(code) {
    return ({
      0: 'No Response', 200: 'OK', 201: 'Created', 204: 'No Content', 206: 'Partial Content',
      301: 'Moved Permanently', 302: 'Found', 303: 'See Other', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
      400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 406: 'Not Acceptable',
      408: 'Request Timeout', 410: 'Gone', 429: 'Too Many Requests', 451: 'Unavailable For Legal Reasons',
      500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
    })[code] || '';
  },
  /* Ancho en píxeles aproximado al de las SERP de Google (Arial) */
  _canvas: null,
  pixelWidth(text, font) {
    if (!text) return 0;
    U._canvas = U._canvas || document.createElement('canvas').getContext('2d');
    U._canvas.font = font;
    return Math.round(U._canvas.measureText(text).width);
  },
  _pxCache: new Map(),
  _px(t, font) {
    if (!t) return 0;
    const k = font[0] + t;
    let v = U._pxCache.get(k);
    if (v == null) { v = U.pixelWidth(t, font); if (U._pxCache.size > 50000) U._pxCache.clear(); U._pxCache.set(k, v); }
    return v;
  },
  titlePx(t) { return U._px(t, '20px Arial'); },
  descPx(t) { return U._px(t, '14px Arial'); },
  /* hash rápido de 32 bits (FNV-1a) en hex */
  hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
  },
  /* Firma MinHash para detectar casi duplicados (shingles de 4 palabras) */
  MH_N: 64,
  _mhSeeds: null,
  minhash(text) {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length < 8) return null;
    if (!U._mhSeeds) {
      U._mhSeeds = [];
      let s = 12345;
      for (let i = 0; i < U.MH_N; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; U._mhSeeds.push(s | 1); }
    }
    const sig = new Uint32Array(U.MH_N).fill(0xffffffff);
    for (let i = 0; i + 4 <= words.length; i++) {
      const sh = words[i] + ' ' + words[i + 1] + ' ' + words[i + 2] + ' ' + words[i + 3];
      let h = 0x811c9dc5;
      for (let j = 0; j < sh.length; j++) { h ^= sh.charCodeAt(j); h = Math.imul(h, 0x01000193); }
      for (let k = 0; k < U.MH_N; k++) {
        const v = (Math.imul(h ^ U._mhSeeds[k], 0x9e3779b1) >>> 0);
        if (v < sig[k]) sig[k] = v;
      }
    }
    return Array.from(sig);
  },
  mhSim(a, b) {
    let eq = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === b[i]) eq++;
    return eq / a.length;
  },
  /* Legibilidad Flesch (versión inglesa estándar) */
  syllables(word) {
    word = word.toLowerCase().replace(/[^a-záéíóúüñ]/g, '');
    if (!word) return 0;
    if (word.length <= 3) return 1;
    const m = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouyáéíóúü]{1,2}/g);
    return m ? m.length : 1;
  },
  debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  toast(msg, ms = 2500) {
    const t = U.el('div', { class: 'toast' }, msg);
    document.body.append(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
  },
};
