/* Tabla virtualizada con ordenación, columnas redimensionables y selección */
class Grid {
  constructor(root, opts = {}) {
    this.root = root;
    this.opts = opts;
    this.rowH = 22;
    this.columns = [];
    this.rows = [];
    this.view = [];
    this.sort = null; // {i, dir}
    this.selected = -1;
    this.ctx = null;
    root.classList.add('grid');
    root.innerHTML = '<div class="g-head"><div class="g-head-in"></div></div><div class="g-body"><div class="g-spacer"></div><div class="g-rows"></div></div><div class="g-empty">Sin datos</div>';
    this.head = root.querySelector('.g-head-in');
    this.body = root.querySelector('.g-body');
    this.spacer = root.querySelector('.g-spacer');
    this.rowsEl = root.querySelector('.g-rows');
    this.empty = root.querySelector('.g-empty');
    this.body.addEventListener('scroll', () => { this.head.style.transform = `translateX(${-this.body.scrollLeft}px)`; this.paint(); });
    this.rowsEl.addEventListener('click', e => {
      const tr = e.target.closest('.g-row'); if (!tr) return;
      this.select(+tr.dataset.i);
    });
    this.rowsEl.addEventListener('dblclick', e => {
      const tr = e.target.closest('.g-row'); if (!tr) return;
      opts.onOpen && opts.onOpen(this.view[+tr.dataset.i]);
    });
    this.rowsEl.addEventListener('contextmenu', e => {
      const tr = e.target.closest('.g-row'); if (!tr) return;
      e.preventDefault();
      this.select(+tr.dataset.i);
      opts.onContext && opts.onContext(this.view[+tr.dataset.i], e);
    });
    root.tabIndex = 0;
    root.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.select(Math.min(this.view.length - 1, this.selected + 1), true); }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.select(Math.max(0, this.selected - 1), true); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && this.view[this.selected]) {
        navigator.clipboard?.writeText(this.columns[0].get(this.view[this.selected], this.ctx, this.opts.crawler));
      }
    });
    new ResizeObserver(() => this.paint()).observe(this.body);
  }

  setColumns(cols, key) {
    if (this.colKey !== key) { this.sort = null; this.colKey = key; }
    this.columns = cols.map((c, i) => ({ ...c, w: (this.widths?.[key]?.[i]) || c.w || 120, i }));
    this.renderHead();
  }

  renderHead() {
    this.head.innerHTML = '';
    const total = 50 + this.columns.reduce((s, c) => s + c.w, 0);
    this.head.style.width = total + 'px';
    this.head.append(U.el('div', { class: 'g-cell g-num' }, ''));
    this.columns.forEach((c, i) => {
      const arrow = this.sort && this.sort.i === i ? (this.sort.dir > 0 ? ' ▲' : ' ▼') : '';
      const cell = U.el('div', { class: 'g-cell', style: `width:${c.w}px`, title: c.label }, c.label + arrow);
      const rz = U.el('span', { class: 'g-resize' });
      rz.addEventListener('mousedown', e => {
        e.stopPropagation(); e.preventDefault();
        const x0 = e.clientX, w0 = c.w;
        const mv = ev => { c.w = Math.max(40, w0 + ev.clientX - x0); cell.style.width = c.w + 'px'; this.head.style.width = 50 + this.columns.reduce((s, k) => s + k.w, 0) + 'px'; this.paint(true); };
        const up = () => {
          document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
          this.widths = this.widths || {}; this.widths[this.colKey] = this.columns.map(k => k.w);
        };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      });
      cell.append(rz);
      cell.addEventListener('click', () => {
        this.sort = this.sort && this.sort.i === i ? (this.sort.dir > 0 ? { i, dir: -1 } : null) : { i, dir: 1 };
        this.renderHead(); this.applySort(); this.paint(true);
      });
      this.head.append(cell);
    });
  }

  setRows(rows, ctx) {
    const selRec = this.view[this.selected];
    this.rows = rows;
    this.ctx = ctx;
    this.applySort();
    if (selRec) {
      const ni = this.view.indexOf(selRec);
      this.selected = ni;
    }
    this.paint(true);
  }

  applySort() {
    this.view = this.rows.slice();
    if (!this.sort) return;
    const c = this.columns[this.sort.i], d = this.sort.dir, cx = this.ctx, cr = this.opts.crawler;
    const vals = new Map(this.view.map(r => [r, c.get(r, cx, cr)]));
    this.view.sort((a, b) => {
      let x = vals.get(a), y = vals.get(b);
      if (c.num) { x = x === '' ? -Infinity : +x; y = y === '' ? -Infinity : +y; return (x - y) * d; }
      return String(x).localeCompare(String(y)) * d;
    });
  }

  paint(force) {
    const n = this.view.length;
    this.empty.style.display = n ? 'none' : 'flex';
    const total = 50 + this.columns.reduce((s, c) => s + c.w, 0);
    this.spacer.style.height = n * this.rowH + 'px';
    this.spacer.style.width = total + 'px';
    const top = this.body.scrollTop, h = this.body.clientHeight;
    const first = Math.max(0, Math.floor(top / this.rowH) - 5);
    const last = Math.min(n, Math.ceil((top + h) / this.rowH) + 5);
    if (!force && this._range && this._range[0] === first && this._range[1] === last) return;
    this._range = [first, last];
    let html = '';
    const cx = this.ctx, cr = this.opts.crawler, statusColor = this.opts.statusColor;
    for (let i = first; i < last; i++) {
      const r = this.view[i];
      let cls = 'g-row' + (i === this.selected ? ' sel' : '') + (i % 2 ? ' odd' : '');
      html += `<div class="${cls}" data-i="${i}" style="top:${i * this.rowH}px;width:${total}px"><div class="g-cell g-num">${i + 1}</div>`;
      for (const c of this.columns) {
        let v = c.get(r, cx, cr);
        if (v == null) v = '';
        let extra = '';
        if (c.label === 'Status Code' && statusColor) extra = ' ' + statusColor(v);
        if (c.label === 'Indexability') extra = v === 'Non-Indexable' ? ' bad' : v === 'Indexable' ? ' good' : '';
        html += `<div class="g-cell${c.num ? ' r' : ''}${extra}" style="width:${c.w}px" title="${U.esc(v)}">${U.esc(v)}</div>`;
      }
      html += '</div>';
    }
    this.rowsEl.innerHTML = html;
  }

  select(i, scroll) {
    if (i < 0 || i >= this.view.length) return;
    this.selected = i;
    if (scroll) {
      const y = i * this.rowH;
      if (y < this.body.scrollTop) this.body.scrollTop = y;
      else if (y + this.rowH > this.body.scrollTop + this.body.clientHeight) this.body.scrollTop = y + this.rowH - this.body.clientHeight;
    }
    this.paint(true);
    this.opts.onSelect && this.opts.onSelect(this.view[i]);
  }

  get current() { return this.view[this.selected]; }

  exportCSV(name) {
    const cx = this.ctx, cr = this.opts.crawler;
    const cols = this.columns.map(c => ({ label: c.label, get: r => c.get(r, cx, cr) }));
    U.download(name, U.toCSV(cols, this.view), 'text/csv');
  }
}
