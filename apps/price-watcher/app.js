/* Competitor Price Watcher — page wiring. Logic lives in lib.js (PriceWatchLib). */
(function () {
  'use strict';
  var L = window.PriceWatchLib, $ = B.$, $$ = B.$$, esc = B.esc;
  var KEY = 'pricewatch:cfg', FILES = { wf: '.github/workflows/price-watcher.yml', js: 'watcher/watch.js', json: 'watcher/products.json' };
  var saved = B.store.get(KEY, null), current = {}, loadedRows = B.store.get('pricewatch:rows', null), groupFilter = '';
  var blank = function () { return { name: '', url: '', group: '', mine: false, selector: '', useBrowser: false }; };
  var prods = saved && saved.products && saved.products.length ? saved.products : [blank()];
  var tzName = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop().replace(/_/g, ' ') + ' time'; } catch (e) { return 'your time'; } })();
  var m = function (v) { return B.fmt.money(v); };

  // ---------- products ----------
  function renderProds() {
    $('#prods').innerHTML = prods.map(function (p, i) {
      return '<div class="prod-row" data-i="' + i + '">' +
        '<div><label for="pn' + i + '">Name</label><input type="text" id="pn' + i + '" data-k="name" placeholder="ToolBarn drill" value="' + esc(p.name) + '"></div>' +
        '<div><label for="pu' + i + '">Product page address</label><input type="url" id="pu' + i + '" data-k="url" placeholder="https://…" value="' + esc(p.url) + '"></div>' +
        '<div><label for="pg' + i + '">Group</label><input type="text" id="pg' + i + '" data-k="group" placeholder="18V drill kit" value="' + esc(p.group) + '"></div>' +
        '<div><label for="ps' + i + '">Price selector (optional)</label><input type="text" id="ps' + i + '" data-k="selector" placeholder="auto-detect" value="' + esc(p.selector || '') + '"></div>' +
        '<div><button class="btn small" type="button" data-del="' + i + '" aria-label="Remove product ' + (i + 1) + '">Remove</button></div>' +
        '<div class="checks"><label><input type="checkbox" data-k="mine"' + (p.mine ? ' checked' : '') + '> This is mine</label><label><input type="checkbox" data-k="useBrowser"' + (p.useBrowser ? ' checked' : '') + '> Needs a real browser (slower)</label></div></div>';
    }).join('');
  }
  $('#prods').addEventListener('input', function (e) { var r = e.target.closest('[data-i]'), k = e.target.dataset.k; if (!r || !k) return; prods[+r.dataset.i][k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; update(); });
  $('#prods').addEventListener('change', function (e) { if (e.target.type === 'checkbox') { var r = e.target.closest('[data-i]'); prods[+r.dataset.i][e.target.dataset.k] = e.target.checked; update(); } });
  $('#prods').addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (!b) return; prods.splice(+b.dataset.del, 1); if (!prods.length) prods.push(blank()); renderProds(); update(); });
  $('#addProd').addEventListener('click', function () { prods.push(blank()); renderProds(); update(); var u = $$('#prods input[data-k=url]'); u[u.length - 1].focus(); });

  if (saved) ['schedule', 'weekday', 'time', 'threshold', 'contact'].forEach(function (k) { if (saved[k] != null) $('#' + k).value = saved[k]; });
  function cfg() {
    var t = ($('#time').value || '07:23').split(':');
    return { products: prods, threshold: $('#threshold').value, schedule: $('#schedule').value, weekday: +$('#weekday').value, hour: +t[0], minute: +t[1], tzOffset: -new Date().getTimezoneOffset(), tzName: tzName, contact: $('#contact').value };
  }
  function fileBlock(key, content) {
    return '<div class="row" style="justify-content:space-between;margin-top:10px"><span class="path">' + esc(FILES[key]) + '</span><span class="row" style="gap:6px">' +
      '<button class="btn small" type="button" data-copy="' + key + '">Copy</button><button class="btn small" type="button" data-dl="' + key + '">Download</button></span></div><pre>' + esc(content) + '</pre>';
  }
  function update() {
    var c = cfg(), n = L.normalise(c), cr = L.cron(c);
    $('#dayWrap').hidden = c.schedule !== 'weekly';
    var bad = prods.filter(function (p) { return String(p.url || '').trim() && !L.validUrl(p.url); }).length;
    var mineCount = n.products.filter(function (p) { return p.mine; }).length;
    $('#cronNote').innerHTML = 'Runs ' + esc(cr.text) + ' — in GitHub’s UTC clock that’s <code>' + esc(cr.cron) + '</code>. ' + n.products.length + ' product page' + (n.products.length === 1 ? '' : 's') + ' ready.' +
      (bad ? ' <span class="warn">' + bad + ' address' + (bad === 1 ? ' doesn’t' : 'es don’t') + ' start with https:// and will be left out.</span>' : '') +
      (!n.products.length ? ' <span class="warn">Add at least one product page.</span>' : '') +
      (n.products.length && !mineCount ? ' <span class="muted">Tip: add your own product page too and tick “This is mine” to get undercut alerts.</span>' : '');
    current = { wf: L.genWorkflow(c), js: L.genWatchJs(), json: L.genProductsJson(c) };
    Object.keys(current).forEach(function (k) { $('[data-panel="' + k + '"]').innerHTML = fileBlock(k, current[k]); });
    B.store.set(KEY, { products: prods, schedule: c.schedule, weekday: $('#weekday').value, time: $('#time').value, threshold: $('#threshold').value, contact: c.contact });
  }
  ['schedule', 'weekday', 'time', 'threshold', 'contact'].forEach(function (k) { $('#' + k).addEventListener('input', update); $('#' + k).addEventListener('change', update); });
  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-copy]'), d = e.target.closest('[data-dl]');
    if (c) B.copy(current[c.dataset.copy]);
    if (d) B.download(FILES[d.dataset.dl].split('/').pop(), current[d.dataset.dl], d.dataset.dl === 'json' ? 'application/json' : 'text/plain;charset=utf-8');
  });
  $('#dlAll').addEventListener('click', function () {
    ['wf', 'js', 'json'].forEach(function (k, i) { setTimeout(function () { B.download(FILES[k].split('/').pop(), current[k]); }, i * 400); });
    B.toast('Downloading 3 files — keep the folder names when you upload them', 3500);
  });

  // ---------- test a page ----------
  function testIt() {
    var html = $('#testHtml').value, sel = $('#testSel').value.trim(), out = $('#testOut');
    if (!html.trim()) { out.innerHTML = '<p class="warn">Paste the page source first.</p>'; return; }
    var lines = [];
    try {
      if (sel) { var t = L.selectText(html, sel); lines.push(t == null ? '<span class="pill-bad">Selector found nothing</span>' : '<span class="' + (isNaN(L.parsePrice(t)) ? 'pill-warn' : 'pill-ok') + '">Selector found</span> “' + esc(String(t).slice(0, 120)) + '” → ' + (isNaN(L.parsePrice(t)) ? 'no number in it' : '<b>' + L.parsePrice(t) + '</b>')); }
    } catch (err) { lines.push('<span class="pill-bad">' + esc(err.message) + '</span>'); }
    var j = L.findJsonLdPrice(html), me = L.findMetaPrice(html);
    lines.push(j ? '<span class="pill-ok">Structured data (JSON-LD)</span> price <b>' + j.price + '</b> ' + esc(j.currency) : '<span class="muted">No JSON-LD product price.</span>');
    lines.push(me ? '<span class="pill-ok">Meta tags</span> price <b>' + me.price + '</b> ' + esc(me.currency) : '<span class="muted">No meta-tag price.</span>');
    var final = null; try { final = L.extractPrice(html, sel); } catch (e2) { final = null; }
    lines.push(final ? '<b class="ok">The tracker will record ' + final.price + (final.currency ? ' ' + esc(final.currency) : '') + ' (from ' + esc(final.method) + ').</b>' + (sel ? '' : ' You can leave the selector empty for this page.') :
      '<b class="bad">The tracker would not find a price.</b> Try a CSS selector, or tick “Needs a real browser” if the price is added by JavaScript.');
    out.innerHTML = lines.map(function (l) { return '<p style="margin:4px 0">' + l + '</p>'; }).join('');
  }
  $('#testBtn').addEventListener('click', testIt);
  $('#testSample').addEventListener('click', function () {
    $('#testHtml').value = '<!doctype html>\n<html><head><title>18V Drill Kit | ToolBarn (example)</title>\n<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"18V Drill Kit","offers":{"@type":"Offer","price":"179.00","priceCurrency":"AUD"}}</script>\n</head><body>\n<div class="product-price"><span class="was">$209.00</span> <span class="amount">$179.00</span></div>\n</body></html>';
    $('#testSel').value = '.product-price .amount'; testIt();
  });

  // ---------- analyse ----------
  function loadCsvText(text, source) {
    var t = B.csv.toObjects(text);
    if (!t.headers.length || t.headers.indexOf('price') < 0 || t.headers.indexOf('product') < 0) { B.toast('That file doesn’t look like prices.csv (needs product and price columns)', 4000); return; }
    loadedRows = t.rows; try { B.store.set('pricewatch:rows', loadedRows.length < 20000 ? loadedRows : null); } catch (e) {}
    groupFilter = ''; renderAnalysis(); B.toast('Loaded ' + t.rows.length + ' rows' + (source ? ' from ' + source : ''));
  }
  B.dropZone($('#csvDrop'), function (files) { B.readFile(files[0]).then(function (t) { loadCsvText(t, files[0].name); }); }, { accept: '.csv,.txt' });
  $('#csvFetch').addEventListener('click', function () {
    var u = L.rawUrl($('#csvUrl').value); if (!/^https:\/\//.test(u)) return B.toast('Paste an https:// address');
    $('#csvFetch').disabled = true;
    fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status === 404 ? 'Not found (404) — private repository, or wrong address?' : 'HTTP ' + r.status); return r.text(); })
      .then(function (t) { loadCsvText(t, 'GitHub'); }, function (err) { B.toast('Could not load: ' + err.message, 5000); })
      .then(function () { $('#csvFetch').disabled = false; });
  });

  function chart(series) {
    var W = 720, H = 300, P = { l: 52, r: 12, t: 12, b: 28 }, pts = [];
    series.forEach(function (s) { s.points.forEach(function (p) { pts.push(p); }); });
    if (!pts.length) return '';
    var days = pts.map(function (p) { return p.t; }).sort(), t0 = Date.parse(days[0]), t1 = Date.parse(days[days.length - 1]) || t0;
    var ys = pts.map(function (p) { return p.price; }), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), pad = (y1 - y0) * 0.1 || y1 * 0.05 || 1; y0 -= pad; y1 += pad;
    function X(t) { return P.l + (t1 === t0 ? 0.5 : (Date.parse(t) - t0) / (t1 - t0)) * (W - P.l - P.r); }
    function Y(v) { return P.t + (1 - (v - y0) / (y1 - y0)) * (H - P.t - P.b); }
    var grid = '';
    for (var i = 0; i <= 4; i++) { var v = y0 + (y1 - y0) * i / 4; grid += '<line class="grid" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text x="' + (P.l - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + esc(v.toFixed(v < 100 ? 2 : 0)) + '</text>'; }
    grid += '<text x="' + P.l + '" y="' + (H - 8) + '">' + esc(days[0]) + '</text><text x="' + (W - P.r) + '" y="' + (H - 8) + '" text-anchor="end">' + esc(days[days.length - 1]) + '</text>';
    var lines = series.map(function (s, k) {
      var d = '', prev = null;
      s.points.forEach(function (p) { var x = X(p.t), y = Y(p.price); d += (prev == null ? 'M' : 'H' + x.toFixed(1) + 'V') + (prev == null ? x.toFixed(1) + ' ' + y.toFixed(1) : y.toFixed(1)); prev = y; });
      return '<path class="c' + (k % 6) + '" d="' + d + '" fill="none" stroke-width="' + (s.mine ? 3.5 : 2) + '"' + (s.mine ? '' : ' stroke-dasharray="' + (k % 2 ? '6 3' : '0') + '"') + '><title>' + esc(s.name) + '</title></path>';
    }).join('');
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Price history chart">' + grid + lines + '</svg>' +
      '<div class="legend">' + series.map(function (s, k) { return '<span><i class="c' + (k % 6) + '"></i>' + esc(s.name) + (s.mine ? ' <b>(yours)</b>' : '') + '</span>'; }).join('') + '</div>';
  }
  function renderAnalysis() {
    var box = $('#analysis');
    if (!loadedRows || !loadedRows.length) { box.innerHTML = '<p class="muted">Load a prices.csv, or press <b>Load sample data</b> to see how it looks.</p>'; return; }
    var a = L.analyse(loadedRows), groups = a.compare.map(function (c) { return c.group; });
    var html = '';
    if (a.undercuts.length) html += '<div class="panel alert"><h2 style="margin-top:0">Undercut alerts</h2><ul>' + a.undercuts.map(function (u) { return '<li><b>' + esc(u.competitor) + '</b> sells “' + esc(u.group) + '” for ' + m(u.theirs) + ' — ' + m(u.diff) + ' (' + B.fmt.pct(u.pct) + ') below your ' + m(u.yours) + '.</li>'; }).join('') + '</ul></div>';
    else if (a.compare.some(function (c) { return c.mine; })) html += '<div class="panel"><p class="ok" style="margin:0">No competitor is currently cheaper than you.</p></div>';
    if (a.compare.length) html += '<h2>Your price vs competitors (latest)</h2>' + B.table(a.compare, [{ key: 'group', label: 'Group' },
      { key: 'mine', label: 'Yours', fmt: function (v) { return v ? m(v.latest) : '<span class="muted">not tracked</span>'; } },
      { key: 'cheapest', label: 'Cheapest competitor', fmt: function (v) { return v ? esc(v.name) + ' ' + m(v.latest) : '–'; } },
      { key: 'compAvg', label: 'Competitor average', fmt: function (v) { return m(v); } },
      { key: 'position', label: 'Your rank (1 = cheapest)', fmt: function (v, r) { return v ? v + ' of ' + r.of : '–'; } }]);
    var shown = a.products.filter(function (p) { return !groupFilter || p.group === groupFilter; });
    html += '<h2>Price history</h2><div class="row"><label for="gf" style="margin:0">Show</label><select id="gf" style="max-width:260px"><option value="">All products</option>' + groups.map(function (g) { return '<option' + (g === groupFilter ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('') + '</select></div>' +
      (shown.length > 6 ? '<p class="small muted">Showing the first 6 lines — pick a group to compare fewer.</p>' : '') + chart(L.chartSeries(shown.slice(0, 6)));
    html += '<h2>Summary</h2>' + B.table(shown, [{ key: 'name', label: 'Product', fmt: function (v, r) { return esc(v) + (r.mine ? ' <span class="pill-ok">yours</span>' : ''); } }, { key: 'group', label: 'Group' },
      { key: 'latest', label: 'Latest', fmt: function (v) { return m(v); } }, { key: 'min', label: 'Min', fmt: function (v) { return m(v); } }, { key: 'avg', label: 'Avg', fmt: function (v) { return m(v); } }, { key: 'max', label: 'Max', fmt: function (v) { return m(v); } },
      { key: 'changePct', label: 'Since first check', fmt: function (v) { return isNaN(v) ? '–' : '<span class="' + (v < 0 ? 'ok' : v > 0 ? 'bad' : '') + '">' + (v > 0 ? '+' : '') + B.fmt.pct(v) + '</span>'; } },
      { key: 'changes', label: 'Changes' }, { key: 'errors', label: 'Failed checks', fmt: function (v) { return v ? '<span class="warn">' + v + '</span>' : '0'; } }]) +
      '<div class="row" style="margin-top:8px"><button class="btn small" id="expSummary" type="button">Download summary CSV</button></div>';
    var ch = a.changes.filter(function (c) { return !groupFilter || c.group === groupFilter; });
    html += '<h2>Change log</h2>' + (ch.length ? B.table(ch, [{ key: 't', label: 'When', fmt: function (v) { return esc(String(v).slice(0, 16).replace('T', ' ')); } }, { key: 'product', label: 'Product' },
      { key: 'from', label: 'From', fmt: function (v) { return m(v); } }, { key: 'to', label: 'To', fmt: function (v) { return m(v); } },
      { key: 'pct', label: 'Change', fmt: function (v) { return '<span class="' + (v < 0 ? 'ok' : 'bad') + '">' + (v > 0 ? '+' : '') + B.fmt.pct(v) + '</span>'; } }], { limit: 200 }) : '<p class="muted">No price changes yet.</p>');
    box.innerHTML = html;
    $('#gf').addEventListener('change', function () { groupFilter = this.value; renderAnalysis(); });
    $('#expSummary').addEventListener('click', function () {
      var rows = shown.map(function (p) { return { product: p.name, group: p.group, mine: p.mine ? 'yes' : '', latest: p.latest, min: p.min, avg: Math.round(p.avg * 100) / 100, max: p.max, change_since_first_pct: isNaN(p.changePct) ? '' : Math.round(p.changePct * 10000) / 100, changes: p.changes, failed_checks: p.errors }; });
      B.download('price-summary.csv', '﻿' + B.csv.stringify(rows, Object.keys(rows[0])), 'text/csv;charset=utf-8');
    });
  }

  // ---------- sample ----------
  $('#sample').addEventListener('click', function () {
    var s = L.sample();
    prods = s.cfg.products.map(function (p) { return Object.assign(blank(), p); });
    $('#threshold').value = s.cfg.threshold; $('#schedule').value = 'daily'; $('#time').value = '07:23';
    renderProds(); update(); loadedRows = s.rows; groupFilter = ''; renderAnalysis();
    B.toast('Sample loaded — made-up shops and prices on example.com addresses');
  });

  B.tabs($('[data-tabs="files"]'));
  B.tabs($('[data-tabs="pw"]'));
  renderProds(); update(); renderAnalysis();
})();
