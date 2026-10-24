/* Motor de rastreo: cola BFS, hilos concurrentes, robots.txt, sitemaps, redirecciones */
const DEFAULT_CONFIG = {
  mode: 'spider',            // spider | list
  threads: 5,
  delay: 0,                  // ms entre peticiones por hilo
  maxUrls: 10000,
  maxDepth: -1,              // -1 = sin límite
  maxFolderDepth: -1,
  maxQueryStrings: -1,
  timeout: 20,
  userAgent: 'Mozilla/5.0 (compatible; OpenSpider/1.0; +http://localhost/)',
  uaPreset: 'openspider',
  robotsName: 'googlebot',
  respectRobots: true,
  showBlockedInternal: true,
  showBlockedExternal: true,
  crawlImages: true, crawlCSS: true, crawlJS: true, crawlSWF: false,
  checkExternal: true,
  crawlSubdomains: false,
  crawlOutsideFolder: false,
  followInternalNofollow: false,
  followExternalNofollow: false,
  crawlCanonicals: true,
  crawlHreflang: false,
  crawlPagination: true,
  followRedirects: true,
  crawlSitemaps: false,
  autoDiscoverSitemaps: true,
  sitemapUrls: '',
  respectNoindex: false,
  respectCanonical: false,
  include: '',
  exclude: '',
  ignoreParams: false,
  removeParams: '',
  lowercase: false,
  extraHeaders: '',
  authUser: '', authPass: '',
  customSearch: [],          // {name, value, regex, mode:'contains'|'not', scope:'html'|'text'}
  customExtract: [],         // {name, type:'css'|'xpath'|'regex', expr, what:'text'|'html'|'outer', attr}
  // umbrales (Configuración > Spider > Preferencias)
  titleMaxChars: 60, titleMinChars: 30, titleMaxPx: 561, titleMinPx: 200,
  descMaxChars: 155, descMinChars: 70, descMaxPx: 985, descMinPx: 400,
  urlMaxChars: 115, h1MaxChars: 70, h2MaxChars: 70, imgMaxKB: 100, altMaxChars: 100,
  lowContentWords: 200, nearDupThreshold: 90, highInternalOutlinks: 1000, highExternalOutlinks: 100, highCrawlDepth: 4,
  autoAnalysis: true,
};

const UA_PRESETS = {
  openspider: 'Mozilla/5.0 (compatible; OpenSpider/1.0; +http://localhost/)',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  googlebotSmartphone: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

class Crawler extends EventTarget {
  constructor() {
    super();
    this.cfg = structuredClone(DEFAULT_CONFIG);
    this.reset();
  }

  reset() {
    this.urls = [];            // registros
    this.byUrl = new Map();
    this.links = [];           // aristas
    this.queue = [];
    this.qHead = 0;
    this.robots = new Map();   // origin -> Promise<Robots>
    this.sitemapUrls = new Map(); // url -> [sitemaps]
    this.sitemapsFetched = [];
    this.running = false;
    this.paused = false;
    this.active = 0;
    this.startUrl = null;
    this.startHost = '';
    this.startRoot = '';
    this.startFolder = '/';
    this.startedAt = 0;
    this.finishedAt = 0;
    this.doneCount = 0;
    this.version = 0;
    this.rateWindow = [];
    this.analysed = false;
    this.emit('reset');
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  touch() { this.version++; this.analysed = false; }

  /* ---------- Clasificación ---------- */
  isInternal(url) {
    const h = U.host(url);
    if (!h) return false;
    if (h === this.startHost) return true;
    const strip = x => x.replace(/^www\./, '');
    if (strip(h) === strip(this.startHost)) return true; // www y sin www
    if (this.cfg.crawlSubdomains && (h === this.startRoot || h.endsWith('.' + this.startRoot))) return true;
    if (this.cfg.mode === 'list') return this.listHosts && this.listHosts.has(h);
    return false;
  }

  guessType(url, via) {
    if (via === 'Image') return 'Image';
    if (via === 'CSS') return 'CSS';
    if (via === 'JavaScript') return 'JavaScript';
    const p = url.split('?')[0].toLowerCase();
    if (/\.(jpe?g|png|gif|webp|svg|avif|ico|bmp)$/.test(p)) return 'Image';
    if (/\.css$/.test(p)) return 'CSS';
    if (/\.m?js$/.test(p)) return 'JavaScript';
    if (/\.pdf$/.test(p)) return 'PDF';
    if (/\.(woff2?|ttf|otf|eot)$/.test(p)) return 'Font';
    if (/\.(mp4|webm|mov|mp3|wav|ogg)$/.test(p)) return 'Media';
    if (/\.(zip|rar|gz|exe|dmg|docx?|xlsx?|pptx?)$/.test(p)) return 'Other';
    return 'HTML';
  }

  typeFromContentType(ct, fallback) {
    ct = (ct || '').toLowerCase();
    if (!ct) return fallback;
    if (/html/.test(ct)) return 'HTML';
    if (/javascript|ecmascript/.test(ct)) return 'JavaScript';
    if (/text\/css/.test(ct)) return 'CSS';
    if (/^image\//.test(ct)) return 'Image';
    if (/pdf/.test(ct)) return 'PDF';
    if (/font/.test(ct)) return 'Font';
    if (/video|audio/.test(ct)) return 'Media';
    if (/xml/.test(ct)) return 'XML';
    return 'Other';
  }

  rewrite(url) {
    if (!url) return url;
    try {
      const u = new URL(url);
      if (this.cfg.ignoreParams) u.search = '';
      else if (this.cfg.removeParams.trim()) {
        for (const p of this.cfg.removeParams.split(/[\s,]+/).filter(Boolean)) u.searchParams.delete(p);
      }
      let s = u.href;
      if (this.cfg.lowercase) s = s.toLowerCase();
      return s;
    } catch { return url; }
  }

  regexList(src) {
    return src.split(/\n/).map(s => s.trim()).filter(Boolean).map(s => { try { return new RegExp(s, 'i'); } catch { return null; } }).filter(Boolean);
  }

  /* ---------- Descubrimiento ---------- */
  discover(url, depth, via, from, follow) {
    url = this.rewrite(url);
    if (!url) return null;
    let rec = this.byUrl.get(url);
    if (rec) {
      if (depth < rec.depth && rec.state === 'done') rec.depth = depth;
      if (via) rec.foundVia.add(via);
      return rec;
    }
    const cfg = this.cfg;
    const internal = this.isInternal(url);
    const type = this.guessType(url, via);
    const isResource = ['Image', 'CSS', 'JavaScript'].includes(via);

    if (!internal && !cfg.checkExternal) return null;
    if (internal && type === 'Image' && !cfg.crawlImages) return null;
    if (internal && type === 'CSS' && !cfg.crawlCSS) return null;
    if (internal && type === 'JavaScript' && !cfg.crawlJS) return null;
    if (via === 'Hyperlink' && !follow) {
      if (internal && !cfg.followInternalNofollow) return null;
      if (!internal && !cfg.followExternalNofollow) return null;
    }
    if (via === 'Canonical' && !cfg.crawlCanonicals) return null;
    if (via === 'Hreflang' && !cfg.crawlHreflang) return null;
    if ((via === 'Next' || via === 'Prev') && !cfg.crawlPagination) return null;
    if (via === 'Redirect' && !cfg.followRedirects) return null;

    if (internal) {
      if (this._exclude.some(r => r.test(url))) return null;
      if (!isResource && this._include.length && depth > 0 && !this._include.some(r => r.test(url))) return null;
      if (cfg.mode === 'spider' && cfg.maxDepth >= 0 && depth > cfg.maxDepth && via !== 'Redirect') return null;
      if (cfg.maxFolderDepth >= 0) {
        const fd = new URL(url).pathname.split('/').filter(Boolean).length;
        if (fd > cfg.maxFolderDepth) return null;
      }
      if (cfg.maxQueryStrings >= 0 && [...new URL(url).searchParams.keys()].length > cfg.maxQueryStrings) return null;
    }
    if (this.urls.length >= cfg.maxUrls) return null;

    // Fuera de la carpeta de inicio: se comprueba pero no se sigue
    let noFollowOut = !internal;
    if (internal && cfg.mode === 'spider' && !cfg.crawlOutsideFolder && this.startFolder !== '/' && !isResource) {
      if (!new URL(url).pathname.startsWith(this.startFolder)) noFollowOut = true;
    }
    if (cfg.mode === 'list' && depth > 0 && via !== 'Redirect' && !isResource) noFollowOut = true;

    rec = {
      id: this.urls.length, url, internal, type, depth, state: 'queued',
      foundVia: new Set(via ? [via] : []), noFollowOut,
      status: null, statusText: '', contentType: '',
    };
    this.urls.push(rec);
    this.byUrl.set(url, rec);
    this.queue.push(rec);
    this.touch();
    return rec;
  }

  addLink(from, l) {
    const edge = {
      from: from.id, url: this.rewrite(l.url), type: l.type, anchor: l.anchor || '',
      alt: l.alt ?? '', hasAlt: l.hasAlt, hasSize: l.hasSize, follow: l.follow !== false,
      rel: l.rel || '', target: l.target || '', pos: l.pos || '', frag: l.frag || '',
    };
    this.links.push(edge);
    return edge;
  }

  /* ---------- robots.txt ---------- */
  getRobots(url) {
    const origin = new URL(url).origin;
    if (!this.robots.has(origin)) {
      this.robots.set(origin, this.fetchRaw(origin + '/robots.txt', 1).then(r => {
        const rb = new Robots(r.ok && r.status === 200 ? (r.body || '') : '', r.ok ? r.status : 0);
        rb.url = origin + '/robots.txt';
        return rb;
      }).catch(() => new Robots('', 0)));
    }
    return this.robots.get(origin);
  }

  /* ---------- Red ---------- */
  async fetchRaw(url, body = 'html', method = 'GET') {
    const headers = this.cfg.extraHeaders.split('\n').map(s => s.trim()).filter(s => s.includes(':'));
    const res = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'fetch', url, body, method, ua: this.cfg.userAgent, timeout: this.cfg.timeout, headers,
        auth: this.cfg.authUser ? this.cfg.authUser + ':' + this.cfg.authPass : '',
      }),
    });
    if (!res.ok) throw new Error('Proxy HTTP ' + res.status);
    return res.json();
  }

  /* ---------- Sitemaps ---------- */
  async loadSitemap(url, depth = 0) {
    if (depth > 3 || this.sitemapsFetched.includes(url)) return;
    this.sitemapsFetched.push(url);
    let r;
    try { r = await this.fetchRaw(url, 1); } catch { return; }
    if (!r.ok || r.status !== 200 || !r.body) return;
    const xml = new DOMParser().parseFromString(r.body, 'application/xml');
    const locs = sel => [...xml.getElementsByTagNameNS('*', sel)];
    for (const sm of locs('sitemap')) {
      const loc = sm.getElementsByTagNameNS('*', 'loc')[0];
      if (loc) await this.loadSitemap(loc.textContent.trim(), depth + 1);
    }
    for (const u of locs('url')) {
      const loc = u.getElementsByTagNameNS('*', 'loc')[0];
      if (!loc) continue;
      const n = U.normalize(loc.textContent.trim());
      if (!n) continue;
      const k = this.rewrite(n);
      if (!this.sitemapUrls.has(k)) this.sitemapUrls.set(k, []);
      this.sitemapUrls.get(k).push(url);
    }
    this.emit('log', `Sitemap ${url}: ${this.sitemapUrls.size} URLs acumuladas`);
  }

  /* ---------- Control ---------- */
  async start(input) {
    this.reset();
    const cfg = this.cfg;
    this._include = this.regexList(cfg.include);
    this._exclude = this.regexList(cfg.exclude);
    this.startedAt = Date.now();
    let seeds = [];
    if (cfg.mode === 'list') {
      seeds = input.split(/[\s,]+/).map(s => s.trim()).filter(Boolean).map(s => U.normalize(/^https?:/i.test(s) ? s : 'https://' + s)).filter(Boolean);
      seeds = [...new Set(seeds)];
      if (!seeds.length) throw new Error('No hay URLs válidas en la lista');
      this.listHosts = new Set(seeds.map(U.host));
      this.startUrl = seeds[0];
    } else {
      let s = input.trim();
      if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
      this.startUrl = U.normalize(s);
      if (!this.startUrl) throw new Error('URL no válida');
      seeds = [this.startUrl];
    }
    const su = new URL(this.startUrl);
    this.startHost = su.hostname;
    this.startRoot = U.rootDomain(su.hostname);
    this.startFolder = su.pathname.replace(/[^/]*$/, '') || '/';
    this.running = true;
    this.paused = false;
    this.emit('start');

    // Sitemaps
    const sms = cfg.sitemapUrls.split(/\s+/).filter(Boolean);
    if (cfg.mode === 'spider' && (cfg.crawlSitemaps || cfg.autoDiscoverSitemaps)) {
      try {
        const rb = await this.getRobots(this.startUrl);
        if (cfg.autoDiscoverSitemaps) sms.push(...rb.sitemaps);
        if (!sms.length && cfg.autoDiscoverSitemaps) sms.push(su.origin + '/sitemap.xml');
      } catch { /* sin robots */ }
    }
    for (const s of [...new Set(sms)]) await this.loadSitemap(s);

    for (const s of seeds) this.discover(s, 0, null, null, true);
    if (cfg.crawlSitemaps) for (const u of this.sitemapUrls.keys()) this.discover(u, 1, 'Sitemap', null, true);
    this.pump();
  }

  pause() { this.paused = true; this.emit('pause'); }
  resume() {
    if (!this.startUrl) return;
    this.paused = false;
    this.running = true;
    this.emit('resume');
    this.pump();
  }
  stop() { this.paused = true; this.running = false; this.queue.length = this.qHead; this.emit('done'); }

  pump() {
    while (!this.paused && this.active < this.cfg.threads && this.qHead < this.queue.length) {
      const rec = this.queue[this.qHead++];
      this.active++;
      this.process(rec).catch(e => {
        rec.state = 'done'; rec.status = 0; rec.statusText = 'Error: ' + e.message; this.markIndexability(rec);
      }).finally(async () => {
        this.doneCount++;
        this.rateWindow.push(Date.now());
        this.touch();
        this.emit('progress');
        if (this.cfg.delay) await U.sleep(this.cfg.delay);
        this.active--;
        this.pump();
      });
    }
    if (this.active === 0 && this.qHead >= this.queue.length && this.running && !this.paused) {
      this.running = false;
      this.finishedAt = Date.now();
      this.queue = []; this.qHead = 0;
      this.emit('done');
    }
  }

  get remaining() { return this.queue.length - this.qHead + this.active; }
  get rate() {
    const now = Date.now();
    this.rateWindow = this.rateWindow.filter(t => now - t < 5000);
    return this.rateWindow.length / 5;
  }

  async process(rec) {
    rec.state = 'fetching';
    const cfg = this.cfg;
    rec.crawledAt = new Date().toISOString();
    // robots.txt
    if (cfg.respectRobots) {
      const rb = await this.getRobots(rec.url);
      const chk = rb.check(rec.url, cfg.userAgent.includes('Googlebot') ? 'googlebot' : cfg.userAgent);
      rec.robotsLine = chk.rule;
      if (!chk.allowed) {
        rec.state = 'done'; rec.status = 0; rec.statusText = 'Blocked by Robots.txt'; rec.blockedRobots = true;
        this.markIndexability(rec);
        if ((rec.internal && !cfg.showBlockedInternal) || (!rec.internal && !cfg.showBlockedExternal)) rec.hidden = true;
        return;
      }
    }
    const wantBody = rec.internal && !['Image', 'CSS', 'JavaScript', 'PDF', 'Font', 'Media'].includes(rec.type) ? 'html' : 0;
    const r = await this.fetchRaw(rec.url, wantBody);
    rec.state = 'done';
    rec.responseTime = r.responseTime;
    rec.ttfb = r.ttfb;
    if (!r.ok) {
      rec.status = 0; rec.statusText = r.error || 'No Response'; rec.noResponse = true;
      this.markIndexability(rec);
      return;
    }
    const h = r.headers || {};
    rec.status = r.status;
    rec.statusText = r.statusText || U.statusText(r.status);
    rec.httpVersion = r.httpVersion;
    rec.headers = h;
    rec.rawHeaders = r.rawHeaders;
    rec.contentType = r.contentType || '';
    rec.type = this.typeFromContentType(rec.contentType, rec.type);
    rec.size = r.size;
    rec.transferred = r.transferred;
    rec.ip = r.ip;
    rec.lastModified = (h['last-modified'] || [])[0] || '';
    rec.xRobots = (h['x-robots-tag'] || []).map(s => s.toLowerCase());
    rec.cookies = (h['set-cookie'] || []).map(c => c.split(';')[0]);
    rec.hsts = !!h['strict-transport-security'];
    rec.csp = !!h['content-security-policy'];
    rec.xcto = !!h['x-content-type-options'];
    rec.xfo = !!h['x-frame-options'] || /frame-ancestors/i.test((h['content-security-policy'] || [''])[0]);
    rec.referrer = (h['referrer-policy'] || [''])[0];

    if (r.status >= 300 && r.status < 400 && r.location) {
      rec.redirectUrl = this.rewrite(r.location);
      rec.redirectType = 'HTTP Redirect';
      this.addLink(rec, { type: 'Redirect', url: r.location, follow: true, pos: 'HTTP' });
      this.discover(r.location, rec.depth + 1, 'Redirect', rec, true);
    }

    if (rec.type === 'HTML' && r.body && rec.internal && r.status >= 200 && r.status < 300) {
      const p = Parser.parse(r.body, rec.url, h, cfg);
      Object.assign(rec, p);
      rec.links = undefined;
      rec.htmlSize = r.body.length;
      const dir = Parser.directives(p.metaRobots, rec.xRobots);
      rec.dir = dir;
      if (p.metaRefreshUrl && p.metaRefreshUrl !== rec.url) {
        rec.redirectUrl = p.metaRefreshUrl; rec.redirectType = 'Meta Refresh';
      }
      const skipFollow = rec.noFollowOut || (cfg.respectNoindex && dir.noindex);
      for (const l of p.links) {
        this.addLink(rec, l);
        if (l.type === 'Bookmark') continue;
        if (skipFollow && !['Image', 'CSS', 'JavaScript', 'Canonical'].includes(l.type)) continue;
        if (cfg.respectCanonical && l.type === 'Hyperlink' && p.canonicals[0] && p.canonicals[0] !== rec.url) continue;
        const via = l.type === 'Iframe' || l.type === 'Meta Refresh' ? 'Hyperlink' : l.type;
        const isRes = ['Image', 'CSS', 'JavaScript'].includes(l.type);
        this.discover(l.url, isRes ? rec.depth + 1 : rec.depth + 1, via, rec, l.follow && !dir.nofollow);
      }
    }
    this.markIndexability(rec);
  }

  /* Vuelve a rastrear una URL concreta */
  respider(rec) {
    this.links = this.links.filter(e => e.from !== rec.id);
    for (const k of Object.keys(rec)) if (!['id', 'url', 'internal', 'type', 'depth', 'foundVia', 'noFollowOut'].includes(k)) delete rec[k];
    Object.assign(rec, { state: 'queued', status: null, statusText: '', contentType: '' });
    if (!this._include) { this._include = this.regexList(this.cfg.include); this._exclude = this.regexList(this.cfg.exclude); }
    this.queue.push(rec);
    this.touch();
    this.paused = false;
    this.running = true;
    this.pump();
  }

  markIndexability(rec) {
    let s = '';
    if (rec.blockedRobots) s = 'Blocked by Robots.txt';
    else if (!rec.status) s = 'No Response';
    else if (rec.status >= 300 && rec.status < 400) s = 'Redirected';
    else if (rec.status >= 400 && rec.status < 500) s = 'Client Error';
    else if (rec.status >= 500) s = 'Server Error';
    else if (rec.redirectType === 'Meta Refresh') s = 'Redirected';
    else if (rec.dir && rec.dir.noindex) s = 'noindex';
    else if (rec.canonicals && rec.canonicals[0] && rec.canonicals[0] !== rec.url) s = 'Canonicalised';
    else if (rec.canonicalHttp && rec.canonicalHttp !== rec.url) s = 'Canonicalised';
    rec.indexability = s ? 'Non-Indexable' : 'Indexable';
    rec.indexabilityStatus = s;
  }

  /* ---------- Persistencia ---------- */
  serialize() {
    return JSON.stringify({
      app: 'OpenSpider', v: 1, cfg: this.cfg, startUrl: this.startUrl, startHost: this.startHost,
      startRoot: this.startRoot, startFolder: this.startFolder, startedAt: this.startedAt, finishedAt: this.finishedAt,
      sitemapUrls: [...this.sitemapUrls], sitemapsFetched: this.sitemapsFetched,
      robots: [...this._robotsResolved || []],
      urls: this.urls.map(r => ({ ...r, foundVia: [...r.foundVia] })),
      links: this.links,
      pending: this.queue.slice(this.qHead).map(r => r.id),
    });
  }

  load(json) {
    const d = typeof json === 'string' ? JSON.parse(json) : json;
    if (d.app !== 'OpenSpider') throw new Error('Archivo no reconocido');
    this.reset();
    this.cfg = Object.assign(structuredClone(DEFAULT_CONFIG), d.cfg);
    this._include = this.regexList(this.cfg.include);
    this._exclude = this.regexList(this.cfg.exclude);
    Object.assign(this, { startUrl: d.startUrl, startHost: d.startHost, startRoot: d.startRoot, startFolder: d.startFolder, startedAt: d.startedAt, finishedAt: d.finishedAt });
    this.sitemapUrls = new Map(d.sitemapUrls || []);
    this.sitemapsFetched = d.sitemapsFetched || [];
    this.urls = d.urls.map(r => ({ ...r, foundVia: new Set(r.foundVia || []) }));
    for (const r of this.urls) {
      this.byUrl.set(r.url, r);
      if (r.state === 'fetching') r.state = 'queued';
    }
    this.links = d.links || [];
    this.queue = this.urls.filter(r => r.state === 'queued');
    this.qHead = 0;
    this.paused = true;
    this.touch();
    this.emit('loaded');
  }
}
