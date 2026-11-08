/* Brahaspati core helpers. Loaded by every app page with <script src="../../assets/core.js"></script>.
   Pure helpers (csv, fmt, uid) also work in Node: require('../assets/core.js'). */
(function (root) {
  'use strict';
  var B = {};

  // ---------- storage (never throws; works without localStorage) ----------
  var mem = {};
  B.store = {
    get: function (key, fallback) {
      try { var v = localStorage.getItem('bh:' + key); if (v != null) return JSON.parse(v); } catch (e) { if (key in mem) return mem[key]; }
      return fallback;
    },
    set: function (key, value) {
      mem[key] = value;
      try { localStorage.setItem('bh:' + key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    remove: function (key) { delete mem[key]; try { localStorage.removeItem('bh:' + key); } catch (e) {} }
  };

  // ---------- ids, formatting ----------
  B.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };
  B.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  B.fmt = {
    num: function (n, d) { if (n == null || isNaN(n)) return '–'; return Number(n).toLocaleString('en-AU', { maximumFractionDigits: d == null ? 2 : d }); },
    money: function (n, cur) { if (n == null || isNaN(n)) return '–'; return Number(n).toLocaleString('en-AU', { style: 'currency', currency: cur || 'AUD' }); },
    pct: function (n, d) { if (n == null || isNaN(n)) return '–'; return (n * 100).toFixed(d == null ? 1 : d) + '%'; },
    // Dates from B.toDate are UTC midnight -> keep their day; any other moment -> the visitor's local day.
    date: function (d) {
      if (!d) return ''; var x = d instanceof Date ? d : new Date(d); if (isNaN(x)) return String(d);
      if (x.getUTCHours() === 0 && x.getUTCMinutes() === 0 && x.getUTCSeconds() === 0 && x.getUTCMilliseconds() === 0) return x.toISOString().slice(0, 10);
      var p = function (n) { return (n < 10 ? '0' : '') + n; };
      return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
    }
  };

  // ---------- CSV (RFC 4180, auto-detects , ; \t) ----------
  B.csv = {
    detect: function (text) {
      var first = text.split(/\r?\n/, 1)[0] || '';
      var best = ',', n = -1;
      [',', ';', '\t', '|'].forEach(function (d) { var c = first.split(d).length; if (c > n) { n = c; best = d; } });
      return best;
    },
    parse: function (text, delim) {
      text = String(text || '').replace(/^﻿/, '');
      delim = delim || B.csv.detect(text);
      var rows = [], row = [], f = '', q = false, i = 0, c;
      for (; i < text.length; i++) {
        c = text[i];
        if (q) {
          if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
          else f += c;
        } else if (c === '"') q = true;
        else if (c === delim) { row.push(f); f = ''; }
        else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
        else f += c;
      }
      if (f !== '' || row.length) { row.push(f); rows.push(row); }
      return rows.filter(function (r) { return !(r.length === 1 && r[0] === ''); });
    },
    // -> {headers:[...], rows:[{h:v}]}
    toObjects: function (text, delim) {
      var rows = B.csv.parse(text, delim); if (!rows.length) return { headers: [], rows: [] };
      var h = rows[0].map(function (x, i) { return String(x).trim() || ('Column ' + (i + 1)); });
      return { headers: h, rows: rows.slice(1).map(function (r) { var o = {}; h.forEach(function (k, i) { o[k] = r[i] == null ? '' : r[i]; }); return o; }) };
    },
    stringify: function (rows, headers) {
      var cell = function (v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      if (headers) return [headers.map(cell).join(',')].concat(rows.map(function (o) { return headers.map(function (h) { return cell(o[h]); }).join(','); })).join('\n');
      return rows.map(function (r) { return r.map(cell).join(','); }).join('\n');
    }
  };

  // Parse a number from messy text: "$1,234.50", "(12.00)", "1.234,5" (eu)
  B.toNumber = function (v) {
    if (typeof v === 'number') return v;
    var s = String(v == null ? '' : v).trim(); if (!s) return NaN;
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s) || /\bDR\b/i.test(s);
    s = s.replace(/[^0-9.,]/g, '');
    if (/,\d{1,2}$/.test(s) && s.indexOf('.') !== -1 && s.lastIndexOf('.') < s.lastIndexOf(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    var n = parseFloat(s); return isNaN(n) ? NaN : (neg ? -n : n);
  };

  // Parse dates like 2026-11-08, 08/11/2026 (AU day-first), 8 Nov 2026
  B.toDate = function (v) {
    if (v instanceof Date) return v;
    var s = String(v == null ? '' : v).trim(); var m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return new Date(Date.UTC(+m[1], m[2] - 1, +m[3]));
    if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/))) { var y = +m[3]; if (y < 100) y += 2000; return new Date(Date.UTC(y, m[2] - 1, +m[1])); }
    var d = new Date(s); return isNaN(d) ? null : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = B; return; }

  // ---------- browser-only helpers ----------
  B.$ = function (sel, el) { return (el || document).querySelector(sel); };
  B.$$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  B.h = function (tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v; else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v);
    });
    [].concat(children || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  };
  B.toast = function (msg, ms) {
    var t = B.h('div', { class: 'toast', role: 'status', text: msg }); document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 2200);
  };
  B.download = function (name, content, type) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  B.copy = function (text) {
    return (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { B.toast('Copied'); }, function () {
      var ta = B.h('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); B.toast('Copied'); } catch (e) { B.toast('Copy failed'); } ta.remove();
    });
  };
  B.readFile = function (file, as) {
    return new Promise(function (res, rej) {
      var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej;
      if (as === 'buffer') r.readAsArrayBuffer(file); else if (as === 'dataurl') r.readAsDataURL(file); else r.readAsText(file);
    });
  };
  // Make an element a drop zone + click-to-pick. onFiles(FileList-array)
  B.dropZone = function (el, onFiles, opts) {
    opts = opts || {};
    var input = B.h('input', { type: 'file', hidden: true, accept: opts.accept || null, multiple: opts.multiple ? true : null });
    el.appendChild(input);
    el.addEventListener('click', function (e) { if (e.target.tagName !== 'A' && e.target.tagName !== 'BUTTON') input.click(); });
    input.addEventListener('change', function () { if (input.files.length) onFiles([].slice.call(input.files)); input.value = ''; });
    el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', function () { el.classList.remove('over'); });
    el.addEventListener('drop', function (e) { e.preventDefault(); el.classList.remove('over'); if (e.dataTransfer.files.length) onFiles([].slice.call(e.dataTransfer.files)); });
    el.tabIndex = 0; el.setAttribute('role', 'button');
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  };
  // Tabs: <div class="tabs" data-tabs="name"><button data-tab="a">..</button></div> + <section class="tab-panel" data-panel="a">
  B.tabs = function (container, onChange) {
    var btns = B.$$('[data-tab]', container), key = 'tab:' + location.pathname + (container.dataset.tabs || '');
    function show(id) {
      btns.forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === id)); });
      B.$$('[data-panel]').forEach(function (p) { if (btns.some(function (b) { return b.dataset.tab === p.dataset.panel; })) p.hidden = p.dataset.panel !== id; });
      B.store.set(key, id); if (onChange) onChange(id);
    }
    container.setAttribute('role', 'tablist');
    btns.forEach(function (b) { b.setAttribute('role', 'tab'); b.addEventListener('click', function () { show(b.dataset.tab); }); });
    var start = B.store.get(key); show(btns.some(function (b) { return b.dataset.tab === start; }) ? start : btns[0].dataset.tab);
    return show;
  };
  // Render array of objects as a table (escapes everything). cols: [{key,label,fmt}] or header strings
  B.table = function (rows, cols, opts) {
    opts = opts || {};
    cols = (cols || Object.keys(rows[0] || {})).map(function (c) { return typeof c === 'string' ? { key: c, label: c } : c; });
    var lim = opts.limit || 500, body = rows.slice(0, lim).map(function (r) {
      return '<tr>' + cols.map(function (c) { var v = c.fmt ? c.fmt(r[c.key], r) : B.esc(r[c.key]); return '<td>' + v + '</td>'; }).join('') + '</tr>';
    }).join('');
    var more = rows.length > lim ? '<p class="small muted">Showing ' + lim + ' of ' + rows.length + ' rows.</p>' : '';
    return '<div class="table-wrap"><table><thead><tr>' + cols.map(function (c) { return '<th>' + B.esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' + body + '</tbody></table></div>' + more;
  };
  // Load a CDN script once. Returns a promise.
  var loaded = {};
  B.loadScript = function (src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { delete loaded[src]; rej(new Error('Could not load ' + src)); }; document.head.appendChild(s); });
    return loaded[src];
  };
  // Pinned CDN libraries (load only when needed)
  B.lib = {
    xlsx: function () { return B.loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js').then(function () { return root.XLSX; }); },
    pdfjs: function () {
      return B.loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js').then(function () {
        root.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; return root.pdfjsLib;
      });
    },
    mammoth: function () { return B.loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js').then(function () { return root.mammoth; }); },
    tesseract: function () { return B.loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js').then(function () { return root.Tesseract; }); },
    echarts: function () { return B.loadScript('https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js').then(function () { return root.echarts; }); }
  };
  // Read a spreadsheet-ish file (csv/tsv/txt/xlsx/xls/json) -> {headers, rows, sheets?}
  B.readTable = function (file) {
    var name = file.name.toLowerCase();
    if (/\.(xlsx|xlsm|xls|ods)$/.test(name)) {
      return Promise.all([B.lib.xlsx(), B.readFile(file, 'buffer')]).then(function (r) {
        var XLSX = r[0], wb = XLSX.read(r[1], { type: 'array', cellDates: true });
        var sheets = wb.SheetNames.map(function (n) { return { name: n, csv: XLSX.utils.sheet_to_csv(wb.Sheets[n]) }; });
        var t = B.csv.toObjects(sheets[0].csv, ','); t.sheets = sheets; return t;
      });
    }
    return B.readFile(file).then(function (text) {
      if (/\.json$/.test(name)) {
        var data = JSON.parse(text); if (!Array.isArray(data)) data = data.rows || data.data || [data];
        var headers = []; data.forEach(function (o) { Object.keys(o || {}).forEach(function (k) { if (headers.indexOf(k) < 0) headers.push(k); }); });
        return { headers: headers, rows: data };
      }
      return B.csv.toObjects(text);
    });
  };
  // Simple SVG bar chart (no library). items: [{label, value}]
  B.barChart = function (items, opts) {
    opts = opts || {}; var max = Math.max.apply(null, items.map(function (i) { return Math.abs(i.value); }).concat([1]));
    return '<div class="bars">' + items.map(function (i) {
      return '<div style="display:grid;grid-template-columns:minmax(90px,32%) 1fr auto;gap:8px;align-items:center;font-size:13px;margin:3px 0">' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + B.esc(i.label) + '">' + B.esc(i.label) + '</span>' +
        '<div style="background:var(--soft);border-radius:4px"><div class="bar-h" style="width:' + (Math.abs(i.value) / max * 100).toFixed(1) + '%;' + (i.color ? 'background:' + i.color : '') + '"></div></div>' +
        '<span>' + B.esc(opts.fmt ? opts.fmt(i.value) : B.fmt.num(i.value)) + '</span></div>';
    }).join('') + '</div>';
  };

  // ---------- shared header / footer ----------
  B.base = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/assets\/core\.js.*$/, '') : '/'; })();
  B.chrome = function () {
    if (document.querySelector('.site-head')) return;
    var head = B.h('header', { class: 'site-head' }, [B.h('div', { class: 'wrap', html:
      '<a class="logo" href="' + B.base + '"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="var(--brand)"/></svg><span>Brah<b>aspati</b></span></a>' +
      '<nav aria-label="Main"><a href="' + B.base + '#business">Business</a><a href="' + B.base + '#creators">Creators</a><a href="' + B.base + '#personal">Personal</a><a href="' + B.base + '#utilities">Utilities</a><a href="' + B.base + 'ai/">AI settings</a></nav>' })]);
    document.body.insertBefore(head, document.body.firstChild);
    var foot = B.h('footer', { class: 'site-foot' }, [B.h('div', { class: 'wrap', html:
      'Brahaspati — free tools that run in your browser. Your files and data stay on your device unless you turn on an AI helper. ' +
      'Made by <a href="https://pawansinha.com.au/">Pawan Sinha</a> · <a href="https://github.com/pawansinha0612/brahaspati">Source</a>' })]);
    document.body.appendChild(foot);
  };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', B.chrome); else B.chrome();
  }
  root.B = B;
})(typeof window !== 'undefined' ? window : this);
