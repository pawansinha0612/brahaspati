/* Inventory Forecasting — page wiring. Maths lives in lib.js (InventoryLib). */
(function () {
  'use strict';
  var L = window.InventoryLib, $ = B.$;
  var KEY = 'inv:data', SKEY = 'inv:settings';
  var data = B.store.get(KEY, null);          // {name, headers, rows, map}
  var settings = Object.assign({ serviceLevel: 0.95, leadDays: 14, coverWeeks: 4, horizon: 12, metric: 'mae', useEOQ: false, orderCost: 50, holdingPct: 25, costPct: 50, stockOverrides: {} }, B.store.get(SKEY, {}) || {});
  var agg = null, plan = [];

  function saveData() { if (!B.store.set(KEY, data)) B.toast('File is too big to remember after a refresh, but it works for now.', 3500); }
  function saveSettings() { B.store.set(SKEY, settings); }
  function money(v) { return B.fmt.money(v); }
  function num(v, d) { return B.fmt.num(v, d == null ? 0 : d); }

  // ---------- import ----------
  B.dropZone($('#drop'), function (files) {
    B.readTable(files[0]).then(function (t) {
      if (!t.headers.length || !t.rows.length) throw new Error('no rows found');
      data = { name: files[0].name, headers: t.headers, rows: t.rows, map: L.detectColumns(t.headers) };
      settings.stockOverrides = {}; saveSettings(); saveData(); showMapping(); B.toast('Loaded ' + files[0].name);
    }).catch(function (e) { B.toast('Could not read that file: ' + e.message, 4000); });
  }, { accept: '.csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods,.json' });

  function showMapping() {
    if (!data) { $('#mapPanel').hidden = true; $('#fileInfo').textContent = ''; return; }
    $('#fileInfo').textContent = data.name + ' · ' + num(data.rows.length) + ' rows · ' + data.headers.length + ' columns';
    $('#mapPanel').hidden = false;
    var g = $('#mapGrid'); g.innerHTML = '';
    L.FIELDS.forEach(function (f) {
      var id = 'map-' + f.key, sel = B.h('select', { id: id });
      sel.appendChild(B.h('option', { value: '', text: f.required ? '— choose —' : '— not in my file —' }));
      data.headers.forEach(function (h) { sel.appendChild(B.h('option', { value: h, text: h, selected: data.map[f.key] === h ? true : null })); });
      sel.addEventListener('change', function () { data.map[f.key] = sel.value; saveData(); });
      g.appendChild(B.h('div', {}, [B.h('label', { for: id, text: f.label + (f.required ? ' *' : '') }), sel]));
    });
  }
  $('#build').addEventListener('click', function () { if (build(true)) showTab('plan'); });

  function build(loud) {
    if (!data) return false;
    var miss = L.FIELDS.filter(function (f) { return f.required && !data.map[f.key]; });
    if (miss.length) { $('#buildMsg').textContent = 'Choose a column for: ' + miss.map(function (f) { return f.label; }).join(', '); return false; }
    agg = L.aggregate(data.rows, data.map);
    if (!agg.weeks.length) { $('#buildMsg').textContent = 'No usable rows — check the date and quantity columns.'; return false; }
    $('#buildMsg').textContent = num(Object.keys(agg.skus).length) + ' products, ' + agg.weeks.length + ' weeks' + (agg.skipped ? ', ' + agg.skipped + ' rows skipped (missing date, SKU or quantity)' : '') + '.';
    runPlan(); if (loud) B.toast('Forecast ready'); return true;
  }

  // ---------- settings ----------
  function bindSettings() {
    $('#sl').value = String(settings.serviceLevel); $('#lead').value = settings.leadDays; $('#cover').value = settings.coverWeeks; $('#horizon').value = settings.horizon;
    $('#metric').value = settings.metric; $('#useEOQ').checked = !!settings.useEOQ; $('#orderCost').value = settings.orderCost; $('#holdingPct').value = settings.holdingPct; $('#costPct').value = settings.costPct;
    $('#eoqOpts').hidden = !settings.useEOQ;
    ['sl', 'lead', 'cover', 'horizon', 'metric', 'useEOQ', 'orderCost', 'holdingPct', 'costPct'].forEach(function (id) {
      $('#' + id).addEventListener('change', function () {
        settings.serviceLevel = +$('#sl').value; settings.leadDays = Math.max(0, +$('#lead').value || 0); settings.coverWeeks = Math.max(1, +$('#cover').value || 4);
        settings.horizon = Math.min(26, Math.max(4, +$('#horizon').value || 12)); settings.metric = $('#metric').value; settings.useEOQ = $('#useEOQ').checked;
        settings.orderCost = +$('#orderCost').value || 0; settings.holdingPct = +$('#holdingPct').value || 0; settings.costPct = +$('#costPct').value || 50;
        $('#eoqOpts').hidden = !settings.useEOQ; saveSettings(); if (agg) runPlan();
      });
    });
  }
  function libSettings() {
    return { serviceLevel: settings.serviceLevel, leadDays: settings.leadDays, coverWeeks: settings.coverWeeks, horizon: settings.horizon, metric: settings.metric,
      useEOQ: settings.useEOQ, orderCost: settings.orderCost, holdingPct: settings.holdingPct / 100, costPct: settings.costPct / 100, stockOverrides: settings.stockOverrides };
  }

  // ---------- plan ----------
  var STATUS = { urgent: '<span class="pill-bad">Order now — below safety stock</span>', order: '<span class="pill-warn">Order now</span>', ok: '<span class="pill-ok">OK</span>', unknown: '<span class="small muted">Enter stock</span>' };
  function runPlan() {
    plan = L.plan(agg, libSettings());
    renderPlan(); renderSkuSelect(); renderSku(); renderAbc();
  }
  function renderPlan() {
    var out = $('#planOut'); if (!plan.length) { out.innerHTML = '<p class="muted">Import your sales (or load the sample) to see the plan.</p>'; return; }
    var toOrder = plan.filter(function (r) { return r.status === 'order' || r.status === 'urgent'; });
    var urgent = plan.filter(function (r) { return r.status === 'urgent'; });
    var deadVal = plan.reduce(function (s, r) { return s + r.deadValue; }, 0);
    var orderVal = toOrder.reduce(function (s, r) { return s + (r.orderQty || 0) * (r.price ? r.price * settings.costPct / 100 : 0); }, 0);
    var stats = '<div class="stat-row">' +
      stat(plan.length, 'Products') + stat(toOrder.length, 'To order now') + stat(urgent.length, 'Below safety stock') +
      stat(orderVal ? money(orderVal) : '–', 'Order value (at cost)') + stat(deadVal ? money(deadVal) : '$0', 'Dead stock (at cost)') + '</div>';
    var cols = [
      { key: 'sku', label: 'SKU', fmt: function (v, r) { return '<b>' + B.esc(v) + '</b>' + (r.name ? '<br><span class="small muted">' + B.esc(r.name) + '</span>' : ''); } },
      { key: 'abc', label: 'Class' },
      { key: 'avgWeekly', label: 'Forecast / week', fmt: function (v) { return '<span class="num">' + num(v, 1) + '</span>'; } },
      { key: 'stock', label: 'Stock on hand', fmt: function (v, r) { return '<input class="stock" type="number" min="0" data-sku="' + B.esc(r.sku) + '" aria-label="Stock on hand for ' + B.esc(r.sku) + '" value="' + (v == null ? '' : v) + '">'; } },
      { key: 'leadDays', label: 'Lead (days)', fmt: function (v) { return num(v); } },
      { key: 'safetyStock', label: 'Safety stock', fmt: function (v) { return num(Math.ceil(v)); } },
      { key: 'reorderPoint', label: 'Reorder point', fmt: function (v) { return num(Math.ceil(v)); } },
      { key: 'orderQty', label: 'Order qty', fmt: function (v) { return v == null ? '–' : v ? '<b>' + num(v) + '</b>' : '0'; } },
      { key: 'status', label: 'Status', fmt: function (v, r) { return STATUS[v] + (v === 'ok' && r.orderInWeeks != null && r.orderInWeeks < 8 ? '<br><span class="small muted">order in ~' + Math.max(1, Math.round(r.orderInWeeks)) + ' wk</span>' : ''); } },
      { key: 'daysCover', label: 'Days of cover', fmt: function (v) { return v == null ? '–' : v === Infinity ? 'no sales' : num(v); } },
      { key: 'risk', label: 'Stock-out risk', fmt: function (v) { var l = L.riskLabel(v); return v == null ? '–' : '<span class="' + (l === 'High' ? 'pill-bad' : l === 'Medium' ? 'pill-warn' : 'pill-ok') + '">' + l + ' ' + Math.round(v * 100) + '%</span>'; } },
      { key: 'methodLabel', label: 'Method', fmt: function (v, r) { return '<span class="small">' + B.esc(v) + '</span>' + (r.note ? ' <span class="small muted" title="' + B.esc(r.note) + '">ⓘ</span>' : ''); } }
    ];
    var sorted = plan.slice().sort(function (a, b) { var o = { urgent: 0, order: 1, unknown: 2, ok: 3 }; return o[a.status] - o[b.status] || (b.risk || 0) - (a.risk || 0); });
    out.innerHTML = stats +
      '<div class="row no-print" style="margin:12px 0"><button class="btn primary" id="dlPlan" type="button">Download purchase plan (CSV)</button><button class="btn" id="printPlan" type="button">Printable report</button><button class="btn" id="dlReport" type="button">Download report (HTML)</button></div>' +
      '<p class="small muted">Stock-out risk is the chance demand during the lead time is more than what you have now. Type your current stock to update the plan.</p>' +
      B.table(sorted, cols, { limit: 1000 });
    B.$$('input.stock', out).forEach(function (inp) {
      inp.addEventListener('change', function () {
        var v = inp.value.trim(); if (v === '') delete settings.stockOverrides[inp.dataset.sku]; else settings.stockOverrides[inp.dataset.sku] = Math.max(0, +v);
        saveSettings(); runPlan();
      });
    });
    $('#dlPlan').addEventListener('click', function () {
      var rows = L.purchaseCsvRows(sorted); B.download('purchase-plan.csv', B.csv.stringify(rows, Object.keys(rows[0])), 'text/csv;charset=utf-8');
    });
    $('#printPlan').addEventListener('click', function () { printHtml(reportHtml()); });
    $('#dlReport').addEventListener('click', function () { B.download('inventory-report.html', reportHtml(), 'text/html;charset=utf-8'); });
  }
  function stat(v, k) { return '<div class="stat"><div class="v">' + v + '</div><div class="k">' + B.esc(k) + '</div></div>'; }

  // ---------- one product ----------
  function renderSkuSelect() {
    var sel = $('#skuSel'), cur = sel.value; sel.innerHTML = '';
    plan.forEach(function (r) { sel.appendChild(B.h('option', { value: r.sku, text: r.sku + (r.name ? ' — ' + r.name : '') })); });
    if (cur && plan.some(function (r) { return r.sku === cur; })) sel.value = cur;
  }
  $('#skuSel').addEventListener('change', renderSku);
  function renderSku() {
    var out = $('#skuOut'), r = plan.filter(function (x) { return x.sku === $('#skuSel').value; })[0];
    if (!r) { out.innerHTML = '<p class="muted">Import your sales first.</p>'; return; }
    var weeks = agg.weeks, show = Math.min(78, r.history.length);
    var hist = r.history.slice(-show), fit = r.fitted.slice(-show), fc = r.forecast;
    var labels = weeks.slice(-show);
    var last = Date.parse(weeks[weeks.length - 1]);
    fc.forEach(function (_, i) { labels.push(new Date(last + (i + 1) * 7 * 86400000).toISOString().slice(0, 10)); });
    var svg = lineChart(labels, [
      { values: hist, style: 'stroke:var(--ink);stroke-width:1.5' },
      { values: fit, style: 'stroke:var(--accent);stroke-width:1.2;stroke-dasharray:4 3' },
      { values: new Array(show - 1).fill(null).concat([hist[show - 1]], fc.map(function (f) { return f.mean; })), style: 'stroke:var(--brand);stroke-width:2.2' }
    ], { start: show, lo: fc.map(function (f) { return f.lo; }), hi: fc.map(function (f) { return f.hi; }) }, null);
    var cand = r.candidates.slice().sort(function (a, b) { return a.mae - b.mae; });
    out.innerHTML = '<h3>' + B.esc(r.sku) + (r.name ? ' — ' + B.esc(r.name) : '') + '</h3>' +
      '<div class="stat-row">' + stat(num(r.avgWeekly, 1), 'Forecast / week (next 4)') + stat(num(Math.ceil(r.safetyStock)), 'Safety stock') + stat(num(Math.ceil(r.reorderPoint)), 'Reorder point') +
      stat(r.stock == null ? '–' : num(r.stock), 'Stock on hand') + stat(r.orderQty == null ? '–' : num(r.orderQty), 'Order now') + '</div>' +
      '<div class="legend" style="margin-top:12px"><span><i style="background:var(--ink)"></i>Actual sales</span><span><i style="background:var(--accent)"></i>Model fit</span><span><i style="background:var(--brand)"></i>Forecast</span><span><i style="background:color-mix(in srgb,var(--brand) 25%,transparent);height:8px"></i>90% range</span></div>' +
      svg +
      '<p><b>Method:</b> ' + B.esc(r.methodLabel) + (r.mae != null ? ' — on the last weeks it was hidden from, it was off by ' + num(r.mae, 1) + ' units a week on average' + (r.mape != null ? ' (' + Math.round(r.mape * 100) + '%)' : '') + '.' : '.') + '</p>' +
      (r.note ? '<p class="small muted">' + B.esc(r.note) + '</p>' : '') +
      (cand.length ? '<h3>Methods compared (hidden weeks)</h3>' + B.table(cand, [{ key: 'label', label: 'Method', fmt: function (v, c) { return B.esc(v) + (c.method === r.method ? ' <span class="pill-ok">chosen</span>' : ''); } },
        { key: 'mae', label: 'Avg error (units)', fmt: function (v) { return num(v, 2); } }, { key: 'mape', label: 'Avg % error', fmt: function (v) { return v == null ? '–' : Math.round(v * 100) + '%'; } }]) : '') +
      '<h3>Next ' + fc.length + ' weeks</h3>' + B.table(fc.map(function (f, i) { return { week: labels[show + i], mean: f.mean, lo: f.lo, hi: f.hi }; }),
        [{ key: 'week', label: 'Week starting' }, { key: 'mean', label: 'Forecast', fmt: function (v) { return num(v, 1); } }, { key: 'lo', label: 'Low', fmt: function (v) { return num(v, 1); } }, { key: 'hi', label: 'High', fmt: function (v) { return num(v, 1); } }]);
  }
  // Simple responsive SVG line chart. series: [{values, style}], band: {start, lo, hi}
  function lineChart(labels, series, band, refLine) {
    var W = 640, H = 230, pl = 40, pr = 10, pt = 10, pb = 26, n = labels.length;
    var all = []; series.forEach(function (s) { s.values.forEach(function (v) { if (v != null) all.push(v); }); }); band.hi.forEach(function (v) { all.push(v); }); if (refLine != null) all.push(refLine);
    var max = Math.max.apply(null, all.concat([1])) * 1.08;
    var x = function (i) { return pl + (W - pl - pr) * (n > 1 ? i / (n - 1) : 0); }, y = function (v) { return pt + (H - pt - pb) * (1 - v / max); };
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Weekly sales and forecast chart">';
    for (var g = 0; g <= 4; g++) { var gv = max * g / 4; s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(gv) + '" y2="' + y(gv) + '" style="stroke:var(--line)"/><text x="' + (pl - 4) + '" y="' + (y(gv) + 4) + '" text-anchor="end">' + Math.round(gv) + '</text>'; }
    var step = Math.max(1, Math.ceil(n / 6));
    for (var i = 0; i < n; i += step) s += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + labels[i].slice(2, 7) + '</text>';
    if (band.lo.length) {
      var top = band.hi.map(function (v, i) { return x(band.start + i) + ',' + y(v); }), bot = band.lo.map(function (v, i) { return x(band.start + i) + ',' + y(v); }).reverse();
      s += '<polygon points="' + top.concat(bot).join(' ') + '" style="fill:color-mix(in srgb,var(--brand) 22%,transparent);stroke:none"/>';
    }
    if (refLine != null) s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(refLine) + '" y2="' + y(refLine) + '" style="stroke:var(--bad);stroke-dasharray:6 4"/>';
    series.forEach(function (sr) {
      var d = '', pen = false; sr.values.forEach(function (v, i) { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); pen = true; });
      s += '<path d="' + d + '" style="fill:none;' + sr.style + '"/>';
    });
    return s + '</svg>';
  }

  // ---------- ABC & slow ----------
  function renderAbc() {
    var out = $('#abcOut'); if (!plan.length) { out.innerHTML = '<p class="muted">Import your sales first.</p>'; return; }
    var total = plan.reduce(function (s, r) { return s + r.revenue52; }, 0), hasPrice = plan.some(function (r) { return r.price; });
    var groups = ['A', 'B', 'C'].map(function (c) { var rs = plan.filter(function (r) { return r.abc === c; }); var v = rs.reduce(function (s, r) { return s + r.revenue52; }, 0); return { c: c, n: rs.length, v: v, share: total ? v / total : 0 }; });
    var slow = plan.filter(function (r) { return r.movement !== 'normal'; }).sort(function (a, b) { return (b.deadValue || 0) - (a.deadValue || 0); });
    out.innerHTML = '<div class="panel"><h3 style="margin-top:0">ABC classes (last 52 weeks' + (hasPrice ? ' sales value' : ' units — add a price column for value') + ')</h3>' +
      B.table(groups, [{ key: 'c', label: 'Class' }, { key: 'n', label: 'Products' }, { key: 'v', label: hasPrice ? 'Sales' : 'Units', fmt: function (v) { return hasPrice ? money(v) : num(v); } }, { key: 'share', label: 'Share', fmt: function (v) { return B.fmt.pct(v, 0); } }]) +
      '<p class="small">Keep A items in stock at all costs (use 98–99% service level), review B items monthly, and keep C items lean — order them only when needed.</p></div>' +
      '<div class="panel"><h3 style="margin-top:0">Slow movers and dead stock</h3>' +
      (slow.length ? B.table(slow, [{ key: 'sku', label: 'SKU', fmt: function (v, r) { return '<b>' + B.esc(v) + '</b>' + (r.name ? '<br><span class="small muted">' + B.esc(r.name) + '</span>' : ''); } },
        { key: 'movement', label: 'Type', fmt: function (v) { return v === 'dead' ? '<span class="pill-bad">Dead — no sales 13+ weeks</span>' : '<span class="pill-warn">Slow</span>'; } },
        { key: 'weeksSinceSale', label: 'Weeks since last sale', fmt: function (v) { return v == null ? 'never' : num(v); } },
        { key: 'stock', label: 'Stock', fmt: function (v) { return v == null ? '–' : num(v); } },
        { key: 'deadValue', label: 'Tied-up value (cost)', fmt: function (v) { return v ? money(v) : '–'; } }]) +
        '<p class="small">Ideas: bundle slow items with best-sellers, mark down before the season ends, return to the supplier if allowed, and stop reordering them.</p>'
        : '<p>No slow or dead stock found. </p>') + '</div>';
  }

  // ---------- report ----------
  function reportHtml() {
    var rows = L.purchaseCsvRows(plan.slice().sort(function (a, b) { return (b.orderQty || 0) - (a.orderQty || 0); }));
    var head = Object.keys(rows[0] || {});
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Inventory plan</title><style>body{font:13px system-ui,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f1ede4}h1{font-size:20px}</style></head><body>' +
      '<h1>Inventory reorder plan</h1><p>Generated ' + new Date().toLocaleDateString('en-AU') + ' from ' + B.esc(data.name) + ' · service level ' + Math.round(settings.serviceLevel * 100) + '% · ' + agg.weeks.length + ' weeks of sales (' + agg.weeks[0] + ' to ' + agg.weeks[agg.weeks.length - 1] + ').</p>' +
      '<table><thead><tr>' + head.map(function (h) { return '<th>' + B.esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + head.map(function (h) { return '<td>' + B.esc(r[h]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' +
      '<p style="font-size:11px;color:#555">Safety stock = z × weekly forecast error × √lead time (weeks). Reorder point = lead-time demand + safety stock. Forecasts are estimates; check them against what you know about promotions and new products.</p></body></html>';
  }
  function printHtml(html) {
    var f = B.h('iframe', { style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0', title: 'print' }); document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(function () { f.remove(); }, 1000); }, 200);
  }

  // ---------- sample, backup ----------
  var showTab;
  $('#sample').addEventListener('click', function () {
    if (data && !confirm('Replace your imported sales with the sample data?')) return;
    var s = L.sampleData(); data = { name: 'sample-garden-shop-weekly-sales.csv', headers: s.headers, rows: s.rows, map: L.detectColumns(s.headers) };
    settings.stockOverrides = {}; saveSettings(); saveData(); showMapping(); build(false); showTab('plan'); B.toast('Sample data loaded — a made-up garden shop');
  });
  $('#backup').addEventListener('click', function () {
    if (!data) { B.toast('Nothing to back up yet'); return; }
    B.download('inventory-forecast-backup.json', JSON.stringify({ app: 'inventory-forecast', version: 1, data: data, settings: settings }), 'application/json');
  });
  $('#restore').addEventListener('click', function () {
    var inp = B.h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', function () {
      if (!inp.files[0]) return;
      B.readFile(inp.files[0]).then(function (t) {
        var j = JSON.parse(t); if (!j || j.app !== 'inventory-forecast' || !j.data) throw new Error('not an Inventory Forecasting backup');
        data = j.data; settings = Object.assign(settings, j.settings || {}); saveData(); saveSettings(); bindSettingsValues(); showMapping(); build(false); B.toast('Backup restored');
      }).catch(function (e) { B.toast('Could not restore: ' + e.message, 4000); });
    });
    inp.click();
  });
  function bindSettingsValues() { $('#sl').value = String(settings.serviceLevel); $('#lead').value = settings.leadDays; $('#cover').value = settings.coverWeeks; $('#horizon').value = settings.horizon; $('#metric').value = settings.metric; $('#useEOQ').checked = !!settings.useEOQ; $('#eoqOpts').hidden = !settings.useEOQ; }
  $('#clearAll').addEventListener('click', function () {
    if (!confirm('Delete the imported sales and settings from this browser?')) return;
    B.store.remove(KEY); B.store.remove(SKEY); data = null; agg = null; plan = []; settings.stockOverrides = {};
    showMapping(); renderPlan(); renderSkuSelect(); renderSku(); renderAbc(); B.toast('Cleared');
  });

  // ---------- start ----------
  bindSettings();
  showTab = B.tabs($('.tabs'), function (id) { if (id === 'sku') renderSku(); });
  showMapping();
  if (data) build(false); else { renderSku(); }
})();
