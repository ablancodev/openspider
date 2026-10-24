/* Ventanas modales y diálogo de configuración */
const Modal = {
  open(title, body, buttons = [], cls = '') {
    const bg = U.$('#modalBg'), m = U.$('#modal');
    m.className = 'modal ' + cls;
    m.innerHTML = '';
    const h = U.el('div', { class: 'modal-h' }, title, U.el('span', { class: 'x', onclick: () => Modal.close() }, '×'));
    const b = U.el('div', { class: 'modal-b' });
    b.append(body);
    m.append(h, b);
    if (buttons.length) {
      const f = U.el('div', { class: 'modal-f' });
      for (const bt of buttons) f.append(U.el('button', { class: 'btn ' + (bt.cls || ''), onclick: bt.onclick }, bt.label));
      m.append(f);
    }
    bg.hidden = false;
    Modal.onclose = null;
    return m;
  },
  close() {
    U.$('#modalBg').hidden = true;
    U.$('#modal').innerHTML = '';
    if (Modal.onclose) { const f = Modal.onclose; Modal.onclose = null; f(); }
  },
};
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !U.$('#modalBg').hidden) Modal.close(); });

const CONFIG_SECTIONS = [
  { name: 'Spider · Crawl', fields: [
    { h: 'Recursos' },
    { k: 'crawlImages', label: 'Comprobar imágenes', t: 'bool' },
    { k: 'crawlCSS', label: 'Comprobar CSS', t: 'bool' },
    { k: 'crawlJS', label: 'Comprobar JavaScript', t: 'bool' },
    { k: 'checkExternal', label: 'Comprobar enlaces externos', t: 'bool' },
    { h: 'Seguimiento de enlaces' },
    { k: 'followInternalNofollow', label: 'Seguir enlaces internos "nofollow"', t: 'bool' },
    { k: 'followExternalNofollow', label: 'Seguir enlaces externos "nofollow"', t: 'bool' },
    { k: 'crawlSubdomains', label: 'Rastrear todos los subdominios', t: 'bool' },
    { k: 'crawlOutsideFolder', label: 'Rastrear fuera de la carpeta de inicio', t: 'bool' },
    { k: 'crawlCanonicals', label: 'Rastrear canonicals', t: 'bool' },
    { k: 'crawlPagination', label: 'Rastrear paginación (rel next/prev)', t: 'bool' },
    { k: 'crawlHreflang', label: 'Rastrear hreflang', t: 'bool' },
    { k: 'followRedirects', label: 'Seguir redirecciones', t: 'bool' },
    { k: 'respectNoindex', label: 'Respetar noindex (no seguir sus enlaces)', t: 'bool' },
    { k: 'respectCanonical', label: 'Respetar canonical (no seguir enlaces de canonicalizadas)', t: 'bool' },
    { h: 'Análisis' },
    { k: 'autoAnalysis', label: 'Análisis de rastreo automático al terminar (Link Score, casi duplicados)', t: 'bool' },
    { k: 'nearDupThreshold', label: 'Umbral casi duplicados (%)', t: 'num' },
  ] },
  { name: 'Spider · Limits', fields: [
    { k: 'maxUrls', label: 'Límite total de URLs', t: 'num' },
    { k: 'maxDepth', label: 'Profundidad máxima de rastreo (-1 = sin límite)', t: 'num' },
    { k: 'maxFolderDepth', label: 'Profundidad máxima de carpetas (-1)', t: 'num' },
    { k: 'maxQueryStrings', label: 'Máx. parámetros de query (-1)', t: 'num' },
    { k: 'timeout', label: 'Timeout de respuesta (segundos)', t: 'num' },
  ] },
  { name: 'Spider · Preferences', fields: [
    { h: 'Page Title' },
    { k: 'titleMaxChars', label: 'Longitud máxima (caracteres)', t: 'num' },
    { k: 'titleMinChars', label: 'Longitud mínima (caracteres)', t: 'num' },
    { k: 'titleMaxPx', label: 'Ancho máximo (píxeles)', t: 'num' },
    { k: 'titleMinPx', label: 'Ancho mínimo (píxeles)', t: 'num' },
    { h: 'Meta Description' },
    { k: 'descMaxChars', label: 'Longitud máxima (caracteres)', t: 'num' },
    { k: 'descMinChars', label: 'Longitud mínima (caracteres)', t: 'num' },
    { k: 'descMaxPx', label: 'Ancho máximo (píxeles)', t: 'num' },
    { k: 'descMinPx', label: 'Ancho mínimo (píxeles)', t: 'num' },
    { h: 'Otros' },
    { k: 'urlMaxChars', label: 'Longitud máxima de URL', t: 'num' },
    { k: 'h1MaxChars', label: 'Longitud máxima H1', t: 'num' },
    { k: 'h2MaxChars', label: 'Longitud máxima H2', t: 'num' },
    { k: 'imgMaxKB', label: 'Tamaño máximo de imagen (KB)', t: 'num' },
    { k: 'altMaxChars', label: 'Longitud máxima de alt', t: 'num' },
    { k: 'lowContentWords', label: 'Contenido pobre (palabras)', t: 'num' },
    { k: 'highInternalOutlinks', label: 'Muchos enlaces internos salientes', t: 'num' },
    { k: 'highExternalOutlinks', label: 'Muchos enlaces externos salientes', t: 'num' },
    { k: 'highCrawlDepth', label: 'Profundidad de rastreo alta', t: 'num' },
  ] },
  { name: 'Robots.txt', fields: [
    { k: 'respectRobots', label: 'Respetar robots.txt', t: 'bool' },
    { k: 'showBlockedInternal', label: 'Mostrar URLs internas bloqueadas', t: 'bool' },
    { k: 'showBlockedExternal', label: 'Mostrar URLs externas bloqueadas', t: 'bool' },
    { k: 'robotsName', label: 'Nombre de meta robots específica', t: 'text' },
    { hint: 'Se usa la semántica de Google: la regla más larga gana, admite * y $. El user-agent configurado decide el grupo aplicable.' },
  ] },
  { name: 'Include', fields: [
    { hint: 'Solo se rastrearán las URLs que coincidan con alguna de estas expresiones regulares (una por línea). Ej.: <code>https://www.ejemplo.com/blog/.*</code>' },
    { k: 'include', t: 'textarea' },
  ] },
  { name: 'Exclude', fields: [
    { hint: 'Las URLs que coincidan no se rastrearán ni se guardarán (una regex por línea). Ej.: <code>.*\\?.*</code>, <code>.*/wp-admin/.*</code>' },
    { k: 'exclude', t: 'textarea' },
  ] },
  { name: 'URL Rewriting', fields: [
    { k: 'ignoreParams', label: 'Eliminar todos los parámetros', t: 'bool' },
    { k: 'removeParams', label: 'Eliminar parámetros (separados por coma)', t: 'text' },
    { k: 'lowercase', label: 'Convertir URLs a minúsculas', t: 'bool' },
  ] },
  { name: 'Speed', fields: [
    { k: 'threads', label: 'Hilos concurrentes', t: 'num' },
    { k: 'delay', label: 'Retardo entre peticiones por hilo (ms)', t: 'num' },
    { hint: 'Cada hilo hace una petición al proxy PHP local. Valores altos pueden saturar el servidor rastreado.' },
  ] },
  { name: 'User-Agent', fields: [
    { k: 'uaPreset', label: 'Preset', t: 'select', options: Object.keys(UA_PRESETS), onchange: (cfg, v, form) => { cfg.userAgent = UA_PRESETS[v]; form.querySelector('[data-k=userAgent]').value = cfg.userAgent; } },
    { k: 'userAgent', label: 'User-Agent', t: 'text' },
  ] },
  { name: 'HTTP Header', fields: [
    { hint: 'Cabeceras adicionales, una por línea (p. ej. <code>Cookie: sesion=123</code> o <code>Accept-Language: en</code>).' },
    { k: 'extraHeaders', t: 'textarea' },
  ] },
  { name: 'Authentication', fields: [
    { hint: 'Autenticación HTTP Basic/Digest para entornos de staging.' },
    { k: 'authUser', label: 'Usuario', t: 'text' },
    { k: 'authPass', label: 'Contraseña', t: 'password' },
  ] },
  { name: 'XML Sitemaps', fields: [
    { k: 'autoDiscoverSitemaps', label: 'Detectar sitemaps en robots.txt (o /sitemap.xml)', t: 'bool' },
    { k: 'crawlSitemaps', label: 'Rastrear las URLs de los sitemaps', t: 'bool' },
    { k: 'sitemapUrls', label: 'Sitemaps adicionales (una URL por línea)', t: 'textarea' },
  ] },
  { name: 'Custom Search', custom: 'search' },
  { name: 'Custom Extraction', custom: 'extract' },
];

function openConfig(crawler, startSection = 0, onSave) {
  const cfg = structuredClone(crawler.cfg);
  const nav = U.el('div', { class: 'cfg-nav' });
  const pane = U.el('div', { class: 'cfg-pane form' });
  const wrap = U.el('div', { style: 'display:flex;flex:1;min-height:0' }, nav, pane);
  let cur = startSection;

  const render = () => {
    nav.innerHTML = '';
    CONFIG_SECTIONS.forEach((s, i) => nav.append(U.el('div', { class: i === cur ? 'active' : '', onclick: () => { cur = i; render(); } }, s.name)));
    pane.innerHTML = '';
    const sec = CONFIG_SECTIONS[cur];
    pane.append(U.el('h3', {}, sec.name));
    if (sec.custom === 'search') return renderCustomSearch();
    if (sec.custom === 'extract') return renderCustomExtract();
    for (const f of sec.fields) {
      if (f.h) { pane.append(U.el('h3', {}, f.h)); continue; }
      if (f.hint) { pane.append(U.el('div', { class: 'hint', html: f.hint })); continue; }
      let input;
      if (f.t === 'bool') {
        input = U.el('input', { type: 'checkbox', 'data-k': f.k });
        input.checked = !!cfg[f.k];
        input.onchange = () => cfg[f.k] = input.checked;
        pane.append(U.el('div', { class: 'row chk' }, U.el('label', {}, input, f.label)));
        continue;
      }
      if (f.t === 'textarea') {
        input = U.el('textarea', { 'data-k': f.k, spellcheck: 'false' });
        input.value = cfg[f.k] || '';
        input.oninput = () => cfg[f.k] = input.value;
        if (f.label) pane.append(U.el('div', { class: 'row' }, U.el('label', {}, f.label)));
        pane.append(input);
        continue;
      }
      if (f.t === 'select') {
        input = U.el('select', { 'data-k': f.k }, f.options.map(o => U.el('option', { value: o }, o)));
        input.value = cfg[f.k];
        input.onchange = () => { cfg[f.k] = input.value; f.onchange && f.onchange(cfg, input.value, pane); };
      } else {
        input = U.el('input', { type: f.t === 'num' ? 'number' : f.t, 'data-k': f.k });
        input.value = cfg[f.k] ?? '';
        input.oninput = () => cfg[f.k] = f.t === 'num' ? +input.value : input.value;
      }
      pane.append(U.el('div', { class: 'row' }, U.el('label', {}, f.label), input));
    }
  };

  const listEditor = (arr, fields, blank) => {
    const tbl = U.el('table', { class: 'list' });
    const draw = () => {
      tbl.innerHTML = '';
      tbl.append(U.el('tr', {}, fields.map(f => U.el('th', {}, f.label)), U.el('th', {}, '')));
      arr.forEach((item, idx) => {
        const tr = U.el('tr');
        for (const f of fields) {
          let inp;
          if (f.options) { inp = U.el('select', {}, f.options.map(([v, l]) => U.el('option', { value: v }, l))); inp.value = item[f.k] ?? f.options[0][0]; inp.onchange = () => item[f.k] = inp.value; }
          else if (f.bool) { inp = U.el('input', { type: 'checkbox' }); inp.checked = !!item[f.k]; inp.onchange = () => item[f.k] = inp.checked; }
          else { inp = U.el('input', { type: 'text', placeholder: f.ph || '' }); inp.value = item[f.k] ?? ''; inp.oninput = () => item[f.k] = inp.value; }
          tr.append(U.el('td', { style: f.w ? `width:${f.w}` : '' }, inp));
        }
        tr.append(U.el('td', { style: 'width:30px' }, U.el('button', { class: 'btn small danger', onclick: () => { arr.splice(idx, 1); draw(); } }, '✕')));
        tbl.append(tr);
      });
    };
    draw();
    return [tbl, U.el('button', { class: 'btn small', onclick: () => { arr.push(structuredClone(blank)); draw(); } }, '+ Añadir')];
  };

  const renderCustomSearch = () => {
    pane.append(U.el('div', { class: 'hint', html: 'Busca texto o expresiones regulares en el HTML o en el texto visible de cada página. Los resultados aparecen en la pestaña <b>Custom Search</b>.' }));
    pane.append(...listEditor(cfg.customSearch, [
      { k: 'name', label: 'Nombre', ph: 'Filtro 1', w: '140px' },
      { k: 'mode', label: 'Modo', options: [['contains', 'Contiene'], ['not', 'No contiene']], w: '110px' },
      { k: 'value', label: 'Texto / Regex', ph: 'google-analytics.com' },
      { k: 'regex', label: 'Regex', bool: true, w: '50px' },
      { k: 'scope', label: 'Buscar en', options: [['html', 'HTML'], ['text', 'Texto']], w: '90px' },
    ], { name: '', mode: 'contains', value: '', regex: false, scope: 'html' }));
  };
  const renderCustomExtract = () => {
    pane.append(U.el('div', { class: 'hint', html: 'Extrae datos con selectores CSS, XPath o regex (con grupo de captura). Ej.: CSS <code>span.price</code>, XPath <code>//meta[@property="og:image"]/@content</code>, Regex <code>"sku":"(.*?)"</code>.' }));
    pane.append(...listEditor(cfg.customExtract, [
      { k: 'name', label: 'Nombre', ph: 'Precio', w: '130px' },
      { k: 'type', label: 'Tipo', options: [['css', 'CSS Path'], ['xpath', 'XPath'], ['regex', 'Regex']], w: '100px' },
      { k: 'expr', label: 'Expresión', ph: 'span.price' },
      { k: 'what', label: 'Extraer', options: [['text', 'Texto'], ['html', 'Inner HTML'], ['outer', 'HTML Element']], w: '120px' },
      { k: 'attr', label: 'Atributo', ph: '(opcional)', w: '100px' },
    ], { name: '', type: 'css', expr: '', what: 'text', attr: '' }));
  };

  render();
  Modal.open('Configuración', wrap, [
    { label: 'Restaurar valores por defecto', onclick: () => { Object.assign(cfg, structuredClone(DEFAULT_CONFIG), { mode: cfg.mode }); render(); } },
    { label: 'Cancelar', onclick: () => Modal.close() },
    { label: 'OK', cls: 'primary', onclick: () => {
      cfg.customSearch = cfg.customSearch.filter(s => s.name && s.value);
      cfg.customExtract = cfg.customExtract.filter(s => s.name && s.expr);
      cfg.threads = Math.max(1, Math.min(50, cfg.threads | 0));
      crawler.cfg = cfg;
      try { localStorage.setItem('ospider.cfg', JSON.stringify(cfg)); } catch {}
      Modal.close();
      onSave && onSave();
    } },
  ], 'wide');
}
