/* Returns Intelligence — page wiring. Logic lives in lib.js (ReturnsLib). */
(function () {
  'use strict';
  var L = window.ReturnsLib, $ = B.$;
  var KEY = 'ri:data', SKEY = 'ri:settings';
  var data = B.store.get(KEY, null) || { orders: null, returns: null };   // each {name, headers, rows, map}
  var settings = Object.assign({ handling: 8, costPct: 45, dim: 'category' }, B.store.get(SKEY, {}) || {});
  var d = null, T = null;

  function save() { if (!B.store.set(KEY, data)) B.toast('Files are too big to remember after a refresh, but they work for now.', 3500); }
  function saveSettings() { B.store.set(SKEY, settings); }
  function money(v) { return B.fmt.money(v).replace(/\.\d\d$/, ''); }
  function pct(v) { return v == null ? '–' : B.fmt.pct(v, 1); }
  function stat(v, k) { return '<div class="stat"><div class="v">' + v + '</div><div class="k">' + B.esc(k) + '</div></div>'; }

  // ---------- import ----------
  function slot(which, dropSel, infoSel, mapSel, fields, detect) {
    B.dropZone($(dropSel), function (files) {
      B.readTable(files[0]).then(function (t) {
        if (!t.headers.length || !t.rows.length) throw new Error('no rows found');
        data[which] = { name: files[0].name, headers: t.headers, rows: t.rows, map: detect(t.headers) }; save(); renderMap(which, infoSel, mapSel, fields); B.toast('Loaded ' + files[0].name);
      }).catch(function (e) { B.toast('Could not read that file: ' + e.message, 4000); });
    }, { accept: '.csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods,.json' });
  }
  function renderMap(which, infoSel, mapSel, fields) {
    var t = data[which], box = $(mapSel); box.innerHTML = '';
    if (!t) { $(infoSel).textContent = ''; return; }
    $(infoSel).innerHTML = B.esc(t.name) + ' · ' + B.fmt.num(t.rows.length, 0) + ' rows · <button class="btn small" type="button" id="rm-' + which + '">Remove</button>';
    $('#rm-' + which).addEventListener('click', function (e) { e.stopPropagation(); data[which] = null; save(); renderMap(which, infoSel, mapSel, fields); });
    var g = B.h('div', { class: 'map-grid' });
    fields.forEach(function (f) {
      var id = 'map-' + which + '-' + f.key, sel = B.h('select', { id: id });
      sel.appendChild(B.h('option', { value: '', text: f.required ? '— choose —' : '— not in my file —' }));
      t.headers.forEach(function (h) { sel.appendChild(B.h('option', { value: h, text: h, selected: t.map[f.key] === h ? true : null })); });
      sel.addEventListener('change', function () { t.map[f.key] = sel.value; save(); });
      g.appendChild(B.h('div', {}, [B.h('label', { for: id, text: f.label + (f.required ? ' *' : '') }), sel]));
    });
    box.appendChild(B.h('p', { class: 'small muted', text: 'Check the columns we matched:' })); box.appendChild(g);
  }
  slot('orders', '#dropO', '#infoO', '#mapO', L.ORDER_FIELDS, L.detectOrderColumns);
  slot('returns', '#dropR', '#infoR', '#mapR', L.RETURN_FIELDS, L.detectReturnColumns);
  $('#handling').value = settings.handling; $('#costPct').value = settings.costPct;
  ['handling', 'costPct'].forEach(function (id) { $('#' + id).addEventListener('change', function () { settings.handling = Math.max(0, +$('#handling').value || 0); settings.costPct = Math.min(100, Math.max(1, +$('#costPct').value || 45)); saveSettings(); if (d) analyse(false); }); });
  $('#analyse').addEventListener('click', function () { if (analyse(true)) showTab('overview'); });

  function analyse(loud) {
    var R = data.returns, O = data.orders;
    if (!R) { $('#msg').textContent = 'Add a returns file first.'; return false; }
    if (!R.map.orderId && !R.map.sku && !R.map.product) { $('#msg').textContent = 'Choose the order ID (or SKU/product) column in the returns file.'; return false; }
    if (O && !O.map.orderId) { $('#msg').textContent = 'Choose the order ID column in the orders file.'; return false; }
    d = L.prepare(O ? { rows: O.rows, map: O.map } : null, { rows: R.rows, map: R.map }, { handling: settings.handling, costPct: settings.costPct / 100 });
    if (!d.returns.length) { $('#msg').textContent = 'No returns found — check the columns.'; return false; }
    T = L.totals(d);
    $('#msg').textContent = d.returns.length + ' returns' + (d.hasOrders ? ' across ' + B.fmt.num(T.orders, 0) + ' orders' : ' (no orders file, so no return rates)') + (d.unmatched ? ' · ' + d.unmatched + ' returns did not match an order' : '') + '.';
    renderOverview(); renderProducts(); renderDims(); renderBreakdown(); renderCustomers();
    if (loud) B.toast('Analysis ready'); return true;
  }

  // ---------- overview ----------
  function renderOverview() {
    var reasons = L.reasonBreakdown(d), recs = L.recommendations(d);
    var html = '<div class="stat-row">' + (d.hasOrders ? stat(pct(T.rate), 'Return rate (units)') : '') + stat(B.fmt.num(T.returned, 0), 'Items returned') +
      stat(money(T.cost), 'Total cost of returns') + stat(money(T.refund), 'Refunded') + stat(money(T.processing), 'Shipping, handling, write-off') +
      (d.hasOrders && T.revenue ? stat(pct(T.refund / T.revenue), 'Of sales refunded') : '') + '</div>';
    html += '<div class="panel"><h3 style="margin-top:0">Why things come back</h3>' + B.barChart(reasons.map(function (r) { return { label: r.name, value: r.share }; }), { fmt: function (v) { return pct(v); } }) +
      '<p class="small muted">Share of returned items. Cost of each theme is on the Breakdown tab.</p></div>';
    if (recs.length) html += '<h2>What to do</h2>' + recs.map(function (r) { return '<div class="panel rec"><h3>' + B.esc(r.title) + '</h3><p>' + B.esc(r.text) + '</p></div>'; }).join('');
    html += '<div class="row no-print" style="margin-top:12px"><button class="btn primary" id="printR" type="button">Printable report</button><button class="btn" id="dlR" type="button">Download report (HTML)</button><button class="btn" id="dlP" type="button">Products (CSV)</button><button class="btn" id="dlRet" type="button">Classified returns (CSV)</button></div>';
    $('#ovOut').innerHTML = html;
    $('#printR').addEventListener('click', function () { printHtml(reportHtml()); });
    $('#dlR').addEventListener('click', function () { B.download('returns-report.html', reportHtml(), 'text/html;charset=utf-8'); });
    $('#dlP').addEventListener('click', function () {
      var rows = L.productActions(d).map(function (p) { return { Product: p.key, Sold: p.sold, Returned: p.returned, 'Return rate': p.rate == null ? '' : Math.round(p.rate * 1000) / 10 + '%', 'Total cost': Math.round(p.cost), 'Main reason': L.reasonName(p.topReason), Size: p.size || '', Action: p.action, Suggestion: p.fix }; });
      B.download('returns-by-product.csv', B.csv.stringify(rows, Object.keys(rows[0])), 'text/csv;charset=utf-8');
    });
    $('#dlRet').addEventListener('click', function () {
      var rows = d.returns.map(function (r) { return { 'Order ID': r.orderId, SKU: r.sku, Product: r.product, Variant: r.variant, Channel: r.channel, 'Reason code': r.reasonCode, Comment: r.reasonText, Theme: L.reasonName(r.reason), Refund: r.refund, Shipping: r.shipping, Handling: r.handling, 'Write-off': Math.round(r.writeOff * 100) / 100, 'Total cost': Math.round(r.cost * 100) / 100 }; });
      B.download('classified-returns.csv', B.csv.stringify(rows, Object.keys(rows[0])), 'text/csv;charset=utf-8');
    });
  }

  // ---------- products ----------
  var ACTION = { delist: '<span class="pill-bad">Consider delisting</span>', fix: '<span class="pill-warn">Fix</span>', watch: '<span class="pill-ok">Watch</span>' };
  function renderProducts() {
    var acts = L.productActions(d), sizes = L.sizeSignals(d);
    var html = '<p class="small muted">Ranked by total cost of returns. ' + (d.hasOrders ? 'Store average return rate: ' + pct(T.rate) + '.' : 'Add an orders file to see return rates.') + '</p>' +
      B.table(acts, [
        { key: 'key', label: 'Product', fmt: function (v, p) { return '<b>' + B.esc(v) + '</b>' + (p.size ? '<br><span class="small ' + (p.size === 'mixed fit' ? 'muted' : 'bad') + '">' + p.size + '</span>' : ''); } },
        { key: 'sold', label: 'Sold', fmt: function (v) { return d.hasOrders ? B.fmt.num(v, 0) : '–'; } }, { key: 'returned', label: 'Returned' },
        { key: 'rate', label: 'Return rate', fmt: function (v) { return v == null ? '–' : '<span class="' + (v >= T.rate * 1.5 ? 'pill-bad' : v >= T.rate ? 'pill-warn' : 'pill-ok') + '">' + pct(v) + '</span>'; } },
        { key: 'cost', label: 'Cost', fmt: function (v) { return money(v); } },
        { key: 'topReason', label: 'Main reason', fmt: function (v, p) { return B.esc(L.reasonName(v)) + ' <span class="small muted">(' + Math.round(p.topReasonShare * 100) + '%)</span>'; } },
        { key: 'action', label: 'Action', fmt: function (v) { return ACTION[v]; } },
        { key: 'fix', label: 'Suggestion', fmt: function (v) { return '<span class="small">' + B.esc(v) + '</span>'; } }
      ]);
    if (sizes.length) html += '<h3>Size signals</h3>' + B.table(sizes, [{ key: 'product', label: 'Product' }, { key: 'small', label: 'Say too small' }, { key: 'large', label: 'Say too large' }, { key: 'unspecified', label: 'Fit, no direction' }, { key: 'verdict', label: 'Verdict', fmt: function (v) { return v === 'mixed fit' ? 'Mixed — check the size chart overall' : '<b>' + v + '</b>'; } }]);
    $('#prOut').innerHTML = html;
  }

  // ---------- breakdown ----------
  var DIM_OPTS = [['category', 'Category'], ['variant', 'Size / variant'], ['product-variant', 'Product × size'], ['channel', 'Sales channel'], ['month', 'Order month'], ['reason', 'Return reason'], ['sku', 'SKU']];
  function renderDims() { var s = $('#dim'); if (s.options.length) return; DIM_OPTS.forEach(function (o) { s.appendChild(B.h('option', { value: o[0], text: o[1] })); }); s.value = settings.dim; }
  $('#dim').addEventListener('change', function () { settings.dim = $('#dim').value; saveSettings(); renderBreakdown(); });
  function renderBreakdown() {
    var dim = settings.dim, out = $('#bdOut');
    if (dim === 'reason') {
      out.innerHTML = B.table(L.reasonBreakdown(d), [{ key: 'name', label: 'Reason' }, { key: 'returned', label: 'Items' }, { key: 'share', label: 'Share', fmt: pct }, { key: 'cost', label: 'Cost', fmt: function (v) { return money(v); } },
        { key: 'examples', label: 'Customer words', fmt: function (v) { return '<span class="small">' + v.map(function (x) { return '“' + B.esc(x) + '”'; }).join(' ') + '</span>'; } }]);
      return;
    }
    var fn = dim === 'product-variant' ? function (x) { return (x.product || x.sku) + (x.variant ? ' · ' + x.variant : ''); } : L.DIMS[dim].fn;
    var g = L.group(d, fn); if (dim === 'month') g.sort(function (a, b) { return a.key < b.key ? -1 : 1; });
    var html = '';
    if (d.hasOrders) {
      var chartRows = (dim === 'month' ? g : g.filter(function (x) { return x.sold >= 20; }).sort(function (a, b) { return b.rate - a.rate; })).slice(0, 15);
      if (chartRows.length) html += '<div class="panel"><h3 style="margin-top:0">Return rate' + (dim === 'month' ? ' by month ordered' : ' (20+ sold)') + '</h3>' + B.barChart(chartRows.map(function (x) { return { label: x.key, value: x.rate || 0, color: x.rate > T.rate * 1.3 ? 'var(--bad)' : null }; }), { fmt: pct }) + '</div>';
    }
    html += B.table(g, [{ key: 'key', label: DIM_OPTS.filter(function (o) { return o[0] === dim; })[0][1] }, { key: 'sold', label: 'Sold', fmt: function (v) { return d.hasOrders ? B.fmt.num(v, 0) : '–'; } }, { key: 'returned', label: 'Returned' },
      { key: 'rate', label: 'Rate', fmt: pct }, { key: 'cost', label: 'Cost', fmt: function (v) { return money(v); } }, { key: 'topReason', label: 'Main reason', fmt: function (v) { return v ? B.esc(L.reasonName(v)) : '–'; } }]);
    out.innerHTML = html;
  }

  // ---------- customers ----------
  function renderCustomers() {
    var list = L.frequentReturners(d), out = $('#cuOut');
    if (!d.returns.some(function (r) { return r.customer; })) { out.innerHTML = '<div class="panel"><p>No customer column found. Map a customer ID or email column in the orders file to see this.</p></div>'; return; }
    out.innerHTML = '<div class="panel"><p><b>Please read before acting:</b> most people who return a lot are genuine — they order two sizes to find the right one ("bracketing"), received faulty items, or are your best customers. Use this list to start a conversation, offer fit help or adjust the policy, not to accuse anyone. Faulty items must be remedied under Australian Consumer Law.</p></div>' +
      (list.length ? B.table(list.slice(0, 100), [{ key: 'customer', label: 'Customer' }, { key: 'orderCount', label: 'Orders' }, { key: 'units', label: 'Items bought' }, { key: 'returned', label: 'Returned' }, { key: 'rate', label: 'Rate', fmt: pct },
        { key: 'refund', label: 'Refunded', fmt: function (v) { return money(v); } }, { key: 'bracketing', label: 'Orders with 2+ sizes', fmt: function (v) { return v ? v + ' <span class="small muted">(bracketing)</span>' : '0'; } }, { key: 'faulty', label: 'Faulty / wrong item' }]) +
        '<p class="small muted">Shown: customers with 3+ returned items and at least half of what they bought sent back.</p>'
        : '<p>No customers return unusually often. 👍</p>');
  }

  // ---------- report ----------
  function reportHtml() {
    var e = B.esc, acts = L.productActions(d), reasons = L.reasonBreakdown(d), recs = L.recommendations(d);
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Returns report</title><style>body{font:13px/1.5 system-ui,sans-serif;margin:26px;color:#111;max-width:980px}h1{font-size:21px}h2{font-size:16px;margin-top:22px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f1ede4}</style></head><body>' +
      '<h1>Returns report</h1><p>Generated ' + new Date().toLocaleDateString('en-AU') + '. ' + T.returned + ' items returned' + (d.hasOrders ? ' of ' + T.sold + ' sold (' + pct(T.rate) + ')' : '') + '. Total cost ' + money(T.cost) + ' (refunds ' + money(T.refund) + ', shipping ' + money(T.shipping) + ', handling ' + money(T.handling) + ', write-off ' + money(T.writeOff) + ').</p>' +
      '<h2>What to do</h2><ul>' + recs.map(function (r) { return '<li><b>' + e(r.title) + '.</b> ' + e(r.text) + '</li>'; }).join('') + '</ul>' +
      '<h2>Reasons</h2><table><thead><tr><th>Reason</th><th>Items</th><th>Share</th><th>Cost</th></tr></thead><tbody>' + reasons.map(function (r) { return '<tr><td>' + e(r.name) + '</td><td>' + r.returned + '</td><td>' + pct(r.share) + '</td><td>' + money(r.cost) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<h2>Products to fix</h2><table><thead><tr><th>Product</th><th>Sold</th><th>Returned</th><th>Rate</th><th>Cost</th><th>Main reason</th><th>Action</th><th>Suggestion</th></tr></thead><tbody>' +
      acts.map(function (p) { return '<tr><td>' + e(p.key) + (p.size ? ' (' + p.size + ')' : '') + '</td><td>' + (d.hasOrders ? p.sold : '') + '</td><td>' + p.returned + '</td><td>' + pct(p.rate) + '</td><td>' + money(p.cost) + '</td><td>' + e(L.reasonName(p.topReason)) + '</td><td>' + p.action + '</td><td>' + e(p.fix) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<p style="font-size:11px;color:#555">Cost = refund + return shipping + handling + write-off of items that cannot be resold. Reason themes come from reason codes and customer comments.</p></body></html>';
  }
  function printHtml(html) {
    var f = B.h('iframe', { style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0', title: 'print' }); document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(function () { f.remove(); }, 1000); }, 200);
  }

  // ---------- sample, backup ----------
  var showTab;
  function renderMaps() { renderMap('orders', '#infoO', '#mapO', L.ORDER_FIELDS); renderMap('returns', '#infoR', '#mapR', L.RETURN_FIELDS); }
  $('#sample').addEventListener('click', function () {
    if ((data.orders || data.returns) && !confirm('Replace your files with the sample data?')) return;
    var s = L.sampleData();
    data = { orders: { name: 'sample-orders.csv', headers: s.orders.headers, rows: s.orders.rows, map: L.detectOrderColumns(s.orders.headers) },
      returns: { name: 'sample-returns.csv', headers: s.returns.headers, rows: s.returns.rows, map: L.detectReturnColumns(s.returns.headers) } };
    save(); renderMaps(); analyse(false); showTab('overview'); B.toast('Sample loaded — a made-up fashion & homewares store');
  });
  $('#backup').addEventListener('click', function () {
    if (!data.returns) { B.toast('Nothing to back up yet'); return; }
    B.download('returns-intelligence-backup.json', JSON.stringify({ app: 'returns-intelligence', version: 1, data: data, settings: settings }), 'application/json');
  });
  $('#restore').addEventListener('click', function () {
    var inp = B.h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', function () {
      if (!inp.files[0]) return;
      B.readFile(inp.files[0]).then(function (t) {
        var j = JSON.parse(t); if (!j || j.app !== 'returns-intelligence' || !j.data) throw new Error('not a Returns Intelligence backup');
        data = j.data; settings = Object.assign(settings, j.settings || {}); save(); saveSettings();
        $('#handling').value = settings.handling; $('#costPct').value = settings.costPct; $('#dim').value = settings.dim; renderMaps(); analyse(false); B.toast('Backup restored');
      }).catch(function (e) { B.toast('Could not restore: ' + e.message, 4000); });
    });
    inp.click();
  });
  $('#clearAll').addEventListener('click', function () {
    if (!confirm('Delete the orders, returns and settings saved in this browser?')) return;
    B.store.remove(KEY); B.store.remove(SKEY); data = { orders: null, returns: null }; d = null;
    renderMaps(); ['#ovOut', '#prOut', '#bdOut', '#cuOut'].forEach(function (s) { $(s).innerHTML = '<p class="muted">Import returns first.</p>'; }); $('#msg').textContent = ''; B.toast('Cleared');
  });

  renderDims();
  showTab = B.tabs($('.tabs'));
  renderMaps();
  if (data.returns) analyse(false);
})();
