/* Parser de robots.txt con la semántica de Google (coincidencia más larga, * y $) */
class Robots {
  constructor(text = '', status = 200) {
    this.text = text;
    this.status = status;
    this.groups = []; // {agents:[], rules:[{allow, path, re, len, line}]}
    this.sitemaps = [];
    this.parse(text);
  }

  parse(text) {
    let cur = null, lastWasAgent = false;
    text.split(/\r?\n/).forEach((raw, i) => {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) return;
      const m = line.match(/^([\w-]+)\s*:\s*(.*)$/);
      if (!m) return;
      const key = m[1].toLowerCase(), val = m[2].trim();
      if (key === 'user-agent') {
        if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; this.groups.push(cur); }
        cur.agents.push(val.toLowerCase());
        lastWasAgent = true;
        return;
      }
      lastWasAgent = false;
      if (key === 'sitemap') { this.sitemaps.push(val); return; }
      if (!cur) return;
      if (key === 'allow' || key === 'disallow') {
        if (key === 'disallow' && val === '') return; // Disallow vacío = permitir todo
        cur.rules.push({ allow: key === 'allow', path: val, re: Robots.toRe(val), len: val.length, line: i + 1, raw: raw.trim() });
      }
    });
  }

  static toRe(path) {
    let s = '';
    for (const ch of path) {
      if (ch === '*') s += '.*';
      else if (ch === '$') s += '$';
      else s += ch.replace(/[.+?^{}()|[\]\\\/]/g, '\\$&');
    }
    return new RegExp('^' + s);
  }

  groupFor(ua) {
    ua = (ua || '').toLowerCase();
    let best = null, bestLen = -1, star = null;
    for (const g of this.groups) {
      for (const a of g.agents) {
        if (a === '*') { star = star || g; continue; }
        if (ua.includes(a) && a.length > bestLen) { best = g; bestLen = a.length; }
      }
    }
    return best || star;
  }

  /* Devuelve {allowed, rule} */
  check(url, ua) {
    if (this.status >= 500) return { allowed: false, rule: 'robots.txt devolvió ' + this.status };
    if (this.status >= 400 || this.status === 0) return { allowed: true, rule: null };
    const g = this.groupFor(ua);
    if (!g) return { allowed: true, rule: null };
    let path;
    try { const u = new URL(url); path = u.pathname + u.search; } catch { return { allowed: true, rule: null }; }
    if (path === '/robots.txt') return { allowed: true, rule: null };
    let match = null;
    for (const r of g.rules) {
      if (r.re.test(path)) {
        if (!match || r.len > match.len || (r.len === match.len && r.allow && !match.allow)) match = r;
      }
    }
    if (!match) return { allowed: true, rule: null };
    return { allowed: match.allow, rule: match.raw, line: match.line };
  }
}
