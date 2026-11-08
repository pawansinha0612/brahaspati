/* Excel & CSV Intelligence — page wiring. Logic lives in lib.js (CsvIntelLib). */
(function () {
  'use strict';
  var L = window.CsvIntelLib, $ = B.$;
  var STORE = 'csvi:tables', SETTINGS = 'csvi:settings';
  var tables = B.store.get(STORE, {}) || {};       // {A, B, INV, PAY}: {name, headers, rows}
  var settings = B.store.get(SETTINGS, {}) || {};  // {keys, rules, recon}
  var results = {};                                 // last run of each check

  var SLOT_LABEL = { A: 'File A', B: 'File B', INV: 'Invoices', PAY: 'Payments / bank statement' };

  function saveTables() {
    if (!B.store.set(STORE, tables)) B.toast('Files are too big to remember after a refresh, but they work for now.', 3500);
  }
  function saveSettings() { B.store.set(SETTINGS, settings); }

  // ---------- file slots ----------
  function slot(id, hint) {
    var el = B.h('div', { class: 'panel slot' });
    function render() {
      var t = tables[id];
      el.innerHTML = '';
      el.appendChild(B.h('h3', { text: SLOT_LABEL[id] }));
      var drop = B.h('div', { class: 'drop', html: t ? '<b>' + B.esc(t.name) + '</b><br><span class="small">Drop another file to replace</span>' : 'Drop a CSV, Excel or JSON file here, or click to choose<br><span class="small">' + B.esc(hint) + '</span>' });
      el.appendChild(drop);
      B.dropZone(drop, function (files) { loadFile(id, files[0]); }, { accept: '.csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods,.json' });
      if (t) {
        var meta = B.h('div', { class: 'row meta small' });
        meta.appendChild(B.h('span', { class: 'muted', text: B.fmt.num(t.rows.length, 0) + ' rows · ' + t.headers.length + ' columns' }));
        if (t.sheets && t.sheets.length > 1) {
          var sel = B.h('select', { 'aria-label': 'Sheet', style: 'width:auto' });
          t.sheets.forEach(function (s) { sel.appendChild(B.h('option', { value: s.name, text: 'Sheet: ' + s.name, selected: s.name === t.sheet ? true : null })); });
          sel.addEventListener('change', function () { pickSheet(id, sel.value); });
          meta.appendChild(sel);
        }
        meta.appendChild(B.h('button', { class: 'btn small', type: 'button', text: 'Remove', onclick: function () { delete tables[id]; saveTables(); refreshAll(); } }));
        el.appendChild(meta);
      }
    }
    el.render = render; render();
    return el;
  }
  var slotEls = {};
  function mountSlots() {
    slotEls.A = slot('A', 'e.g. customer list from your CRM'); slotEls.B = slot('B', 'e.g. the same list from Xero or MYOB');
    slotEls.INV = slot('INV', 'invoice number, date and amount'); slotEls.PAY = slot('PAY', 'bank CSV or payments report');
    $('#slotsAB').append(slotEls.A, slotEls.B); $('#slotsIP').append(slotEls.INV, slotEls.PAY);
  }
  function loadFile(id, file) {
    B.readTable(file).then(function (t) {
      var entry = { name: file.name, headers: t.headers, rows: t.rows };
      if (t.sheets && t.sheets.length > 1) { entry.sheets = t.sheets; entry.sheet = t.sheets[0].name; }
      if (!entry.headers.length) throw new Error('No columns found in that file.');
      tables[id] = entry; saveTables(); refreshAll(); B.toast('Loaded ' + file.name);
    }).catch(function (e) { B.toast('Could not read that file: ' + e.message, 4000); });
  }
  function pickSheet(id, name) {
    var t = tables[id], s = t.sheets.filter(function (x) { return x.name === name; })[0];
    var o = B.csv.toObjects(s.csv, ','); t.headers = o.headers; t.rows = o.rows; t.sheet = name;
    saveTables(); refreshAll();
  }

  function options(headers, selected, blank) {
    return (blank ? '<option value="">' + B.esc(blank) + '</option>' : '') + headers.map(function (h) { return '<option' + (h === selected ? ' selected' : '') + ' value="' + B.esc(h) + '">' + B.esc(h) + '</option>'; }).join('');
  }

  // ---------- compare ----------
  function findHeader(headers, name) { var n = String(name || '').trim().toLowerCase(); return headers.filter(function (h) { return h.trim().toLowerCase() === n; })[0] || ''; }
  function renderKeys() {
    var A = tables.A, Bt = tables.B, box = $('#keys'); box.innerHTML = '';
    if (!A || !Bt) { box.innerHTML = '<p class="small muted">Load File A and File B first.</p>'; return; }
    var keys = (settings.keys || []).filter(function (k) { return A.headers.indexOf(k.a) >= 0 && Bt.headers.indexOf(k.b) >= 0; });
    if (!keys.length) {
      var best = L.suggestKeys(A.headers, A.rows)[0].col;
      keys = [{ a: best, b: findHeader(Bt.headers, best) || L.suggestKeys(Bt.headers, Bt.rows)[0].col }];
    }
    settings.keys = keys;
    var sug = L.suggestKeys(A.headers, A.rows).slice(0, 3).map(function (s) { return s.col; });
    box.appendChild(B.h('p', { class: 'small muted', text: 'Likely ID columns in File A: ' + sug.join(', ') }));
    keys.forEach(function (k, i) {
      var row = B.h('div', { class: 'keyrow' });
      var sa = B.h('select', { 'aria-label': 'Key column in File A', html: options(A.headers, k.a) });
      var sb = B.h('select', { 'aria-label': 'Key column in File B', html: options(Bt.headers, k.b) });
      sa.addEventListener('change', function () { k.a = sa.value; var m = findHeader(Bt.headers, sa.value); if (m) { k.b = m; sb.value = m; } saveSettings(); });
      sb.addEventListener('change', function () { k.b = sb.value; saveSettings(); });
      row.append(sa, sb);
      row.appendChild(i ? B.h('button', { class: 'btn small', type: 'button', text: 'Remove', onclick: function () { keys.splice(i, 1); saveSettings(); renderKeys(); } }) : B.h('span'));
      box.appendChild(row);
    });
  }
  function runCompare() {
    var A = tables.A, Bt = tables.B; if (!A || !Bt) return B.toast('Load File A and File B first');
    var keys = settings.keys || [];
    var opts = { tolerance: +$('#tol').value || 0, ignoreCase: $('#ignoreCase').checked, trim: $('#trimSpaces').checked };
    var r = L.compare(A, Bt, keys.map(function (k) { return k.a; }), keys.map(function (k) { return k.b; }), opts);
    results.compare = { result: r, nameA: A.name, nameB: Bt.name, headersA: A.headers, headersB: Bt.headers };
    var out = $('#compareOut');
    var html = '<div class="stat-row">' + stat(r.same, 'Identical rows', 'ok') + stat(r.changed.length, 'Changed rows', r.changed.length ? 'warn' : 'ok') +
      stat(r.onlyA.length, 'Only in File A', r.onlyA.length ? 'bad' : 'ok') + stat(r.onlyB.length, 'Only in File B', r.onlyB.length ? 'bad' : 'ok') + '</div>';
    if (r.columns.onlyA.length || r.columns.onlyB.length) html += '<p class="small muted">Columns not compared because they are only in one file: ' + B.esc(r.columns.onlyA.concat(r.columns.onlyB).join(', ')) + '</p>';
    if (r.dupA.length || r.dupB.length) html += '<p class="small warn">Some keys appear more than once (' + (r.dupA.length + r.dupB.length) + ' extra rows were skipped). Check the Duplicates tab, or add another key column.</p>';
    html += '<h3>Changed rows</h3>';
    if (r.changed.length) {
      var cols = r.compared.filter(function (c) { return r.changed.some(function (x) { return x.diffs.some(function (d) { return d.col === c; }); }); });
      html += '<div class="table-wrap"><table><thead><tr><th>Key</th><th>Rows (A / B)</th>' + cols.map(function (c) { return '<th>' + B.esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        r.changed.slice(0, 500).map(function (x) {
          var dm = {}; x.diffs.forEach(function (d) { dm[d.col] = d; });
          return '<tr><td><b>' + B.esc(x.key) + '</b></td><td class="small muted">' + x.lineA + ' / ' + x.lineB + '</td>' + cols.map(function (c) {
            var d = dm[c]; return d ? '<td class="diff"><del>' + B.esc(d.a || '(blank)') + '</del><span class="arrow">→</span><ins>' + B.esc(d.b || '(blank)') + '</ins></td>' : '<td class="muted">' + B.esc(x.a[c]) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>';
    } else html += '<p class="muted">No differences in matched rows.</p>';
    html += '<h3>Only in File A (' + r.onlyA.length + ')</h3>' + (r.onlyA.length ? B.table(r.onlyA, A.headers) : '<p class="muted">None.</p>');
    html += '<h3>Only in File B (' + r.onlyB.length + ')</h3>' + (r.onlyB.length ? B.table(r.onlyB, Bt.headers) : '<p class="muted">None.</p>');
    out.innerHTML = html; refreshReport();
  }
  function stat(v, k, cls) { return '<div class="stat"><div class="v ' + (cls || '') + '">' + B.esc(typeof v === 'number' ? B.fmt.num(v, 0) : v) + '</div><div class="k">' + B.esc(k) + '</div></div>'; }

  // ---------- duplicates ----------
  function renderDupCols() {
    var t = tables[$('#dupFile').value], box = $('#dupCols'); box.innerHTML = '';
    if (!t) { box.innerHTML = '<p class="small muted">Load a file in the Compare tab first (or load the sample data).</p>'; return; }
    var chosen = (settings.dupCols || []).filter(function (c) { return t.headers.indexOf(c) >= 0; });
    if (!chosen.length) chosen = [t.headers.filter(function (h) { return /name|email/i.test(h); })[0] || L.suggestKeys(t.headers, t.rows)[0].col];
    t.headers.forEach(function (h) {
      var cb = B.h('input', { type: 'checkbox', value: h, checked: chosen.indexOf(h) >= 0 ? true : null });
      box.appendChild(B.h('label', {}, [cb, h]));
    });
  }
  function runDups() {
    var which = $('#dupFile').value, t = tables[which]; if (!t) return B.toast('Load a file first');
    var cols = B.$$('#dupCols input:checked').map(function (c) { return c.value; });
    if (!cols.length) return B.toast('Tick at least one column');
    settings.dupCols = cols; saveSettings();
    var groups = L.duplicates(t.rows, cols, $('#dupMode').value);
    results.dups = { groups: groups, cols: cols, file: t.name };
    var extra = groups.reduce(function (s, g) { return s + g.rows.length - 1; }, 0);
    var html = '<div class="stat-row">' + stat(groups.length, 'Duplicate groups', groups.length ? 'warn' : 'ok') + stat(extra, 'Extra rows', extra ? 'warn' : 'ok') + stat(t.rows.length, 'Rows checked') + '</div>';
    if (groups.length) {
      html += '<div class="table-wrap"><table><thead><tr><th>Group</th><th>Row</th>' + t.headers.map(function (h) { return '<th>' + B.esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        groups.slice(0, 300).map(function (g, gi) {
          return g.rows.map(function (x, i) { return '<tr' + (i === 0 ? ' class="group-sep"' : '') + '><td>' + (i ? '' : gi + 1) + '</td><td>' + x.line + '</td>' + t.headers.map(function (h) { return '<td>' + B.esc(x.row[h]) + '</td>'; }).join('') + '</tr>'; }).join('');
        }).join('') + '</tbody></table></div><p class="small muted">Row numbers match Excel (the header is row 1).</p>';
    } else html += '<p class="ok">No duplicates found on ' + B.esc(cols.join(' + ')) + '.</p>';
    $('#dupsOut').innerHTML = html; refreshReport();
  }

  // ---------- reconciliation ----------
  function mapper(box, t, saved, kind) {
    box.innerHTML = '';
    if (!t) { box.innerHTML = '<p class="small muted">Load the ' + kind + ' file above.</p>'; return; }
    var g = L.guessColumns(t.headers); saved = saved || {};
    [['ref', kind === 'invoices' ? 'Invoice number' : 'Reference / description'], ['amount', 'Amount'], ['date', 'Date']].forEach(function (f) {
      var val = t.headers.indexOf(saved[f[0]]) >= 0 ? saved[f[0]] : g[f[0]];
      var id = kind + '-' + f[0];
      box.appendChild(B.h('label', { for: id, text: f[1] }));
      box.appendChild(B.h('select', { id: id, html: options(t.headers, val, f[0] === 'amount' ? null : '(none)') }));
    });
  }
  function renderRecon() {
    var r = settings.recon || {};
    mapper($('#invMap'), tables.INV, r.inv, 'invoices'); mapper($('#payMap'), tables.PAY, r.pay, 'payments');
    if (r.days != null) $('#days').value = r.days;
  }
  function pill(status) { var c = { Paid: 'pill-ok', 'Part paid': 'pill-warn', Overpaid: 'pill-warn', Unpaid: 'pill-bad' }[status] || 'pill-warn'; return '<span class="' + c + '">' + B.esc(status) + '</span>'; }
  function runRecon() {
    if (!tables.INV || !tables.PAY) return B.toast('Load both the invoices and the payments file');
    var get = function (id) { var el = $('#' + id); return el ? el.value : ''; };
    var inv = { ref: get('invoices-ref'), amount: get('invoices-amount'), date: get('invoices-date') };
    var pay = { ref: get('payments-ref'), amount: get('payments-amount'), date: get('payments-date') };
    settings.recon = { inv: inv, pay: pay, days: +$('#days').value }; saveSettings();
    var r = L.reconcile(Object.assign({ rows: tables.INV.rows }, inv), Object.assign({ rows: tables.PAY.rows }, pay), { days: +$('#days').value || 0, tolerance: +$('#rtol').value || 0 });
    results.recon = { result: r };
    var t = r.totals, m = B.fmt.money;
    var html = '<div class="stat-row">' + stat(m(t.invoiced), 'Invoiced (' + t.invoiceCount + ')') + stat(m(t.received), 'Received (' + t.paymentCount + ')') +
      stat(m(t.outstanding), 'Still owed', t.outstanding ? 'bad' : 'ok') + stat(m(t.unapplied), 'Payments not matched', t.unapplied ? 'warn' : 'ok') + '</div>';
    html += '<p class="small muted">' + r.paid.length + ' paid · ' + r.partial.length + ' part paid · ' + r.overpaid.length + ' overpaid · ' + r.unpaid.length + ' unpaid</p>';
    html += '<h3>Invoices</h3><div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th>Matched by</th></tr></thead><tbody>' +
      r.invoices.map(function (x) {
        return '<tr><td>' + B.esc(x.ref) + '</td><td>' + B.esc(x.date ? B.fmt.date(x.date) : '') + '</td><td>' + m(x.amount) + '</td><td>' + m(x.paid) + '</td><td>' + m(x.balance) + '</td><td>' + pill(x.status) + '</td><td class="small">' +
          x.payments.map(function (p) { return B.esc(m(p.amount) + ' · ' + p.how + (p.ref ? ' · "' + p.ref + '"' : '')); }).join('<br>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    html += '<h3>Payments not matched to an invoice (' + r.unmatchedPayments.length + ')</h3>' + (r.unmatchedPayments.length ? B.table(r.unmatchedPayments.map(function (p) { return p.row; }), tables.PAY.headers) : '<p class="ok">Every payment was matched.</p>');
    $('#reconOut').innerHTML = html; refreshReport();
  }

  // ---------- validation ----------
  var TYPES = [['required', 'Required'], ['number', 'Number'], ['date', 'Date'], ['email', 'Email'], ['unique', 'Unique'], ['min', 'Minimum'], ['max', 'Maximum'], ['regex', 'Pattern (regex)'], ['oneOf', 'One of (comma list)']];
  function renderRules() {
    var t = tables[$('#valFile').value], box = $('#rules'); box.innerHTML = '';
    if (!t) { box.innerHTML = '<p class="small muted">Load a file in the Compare tab first (or load the sample data).</p>'; return; }
    var rules = settings.rules || (settings.rules = L.suggestRules(t.headers, t.rows));
    rules.forEach(function (r, i) {
      var row = B.h('div', { class: 'rulerow' });
      var col = B.h('select', { 'aria-label': 'Column', html: options(t.headers.indexOf(r.col) >= 0 ? t.headers : [r.col].concat(t.headers), r.col) });
      var type = B.h('select', { 'aria-label': 'Rule', html: TYPES.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === r.type ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') });
      var val = B.h('input', { type: 'text', 'aria-label': 'Rule value', placeholder: 'value', value: r.value || '' });
      var sync = function () { val.style.visibility = /min|max|regex|oneOf/.test(type.value) ? 'visible' : 'hidden'; };
      col.addEventListener('change', function () { r.col = col.value; saveSettings(); });
      type.addEventListener('change', function () { r.type = type.value; sync(); saveSettings(); });
      val.addEventListener('input', function () { r.value = val.value; saveSettings(); });
      sync();
      row.append(col, type, val, B.h('button', { class: 'btn small', type: 'button', text: 'Remove', onclick: function () { rules.splice(i, 1); saveSettings(); renderRules(); } }));
      box.appendChild(row);
    });
  }
  function runValidate() {
    var t = tables[$('#valFile').value]; if (!t) return B.toast('Load a file first');
    var rules = (settings.rules || []).filter(function (r) { return r.col; });
    if (!rules.length) return B.toast('Add at least one rule');
    var v = L.validate(t.rows, rules);
    results.validation = { result: v, file: t.name };
    var label = function (type) { return (TYPES.filter(function (x) { return x[0] === type; })[0] || [0, type])[1]; };
    var html = '<div class="stat-row">' + stat(v.failures.length, 'Problems', v.failures.length ? 'bad' : 'ok') + stat(v.badRows, 'Rows affected', v.badRows ? 'warn' : 'ok') + stat(t.rows.length - v.badRows, 'Clean rows', 'ok') + '</div>';
    html += '<h3>By rule</h3>' + B.table(v.byRule.map(function (b) { return { Column: b.col, Rule: label(b.type) + (b.value ? ' ' + b.value : ''), Failures: b.count }; }), [{ key: 'Column', label: 'Column' }, { key: 'Rule', label: 'Rule' }, { key: 'Failures', label: 'Failures', fmt: function (n) { return n ? '<span class="pill-bad">' + n + '</span>' : '<span class="pill-ok">0</span>'; } }]);
    html += '<h3>Failing cells</h3>' + (v.failures.length ? B.table(v.failures.map(function (f) { return { Row: f.line || '–', Column: f.col, Value: f.value || '(blank)', Problem: f.message }; }), ['Row', 'Column', 'Value', 'Problem'], { limit: 1000 }) : '<p class="ok">Every row passed.</p>');
    $('#valOut').innerHTML = html; refreshReport();
  }

  // ---------- report & export ----------
  var PART_LABEL = { compare: 'File comparison', recon: 'Invoice reconciliation', dups: 'Duplicates', validation: 'Data checks' };
  function chosenParts() {
    var p = {};
    B.$$('#reportParts input:checked').forEach(function (cb) { if (results[cb.value]) p[cb.value] = results[cb.value]; });
    return p;
  }
  function refreshReport() {
    var box = $('#reportParts'), keys = Object.keys(results);
    box.innerHTML = keys.length ? '' : '<p class="small muted">Run a comparison, duplicate search, reconciliation or data check first. Or press "Load sample data".</p>';
    keys.forEach(function (k) { box.appendChild(B.h('label', {}, [B.h('input', { type: 'checkbox', value: k, checked: true }), PART_LABEL[k]])); });
    var links = $('#csvLinks'); links.innerHTML = '';
    L.exportSets(results).forEach(function (s) {
      links.appendChild(B.h('button', { class: 'btn small', type: 'button', text: s.name + ' (' + s.rows.length + ')', onclick: function () { downloadCsv(s); } }));
    });
  }
  function headersOf(rows) { var h = []; rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (h.indexOf(k) < 0) h.push(k); }); }); return h; }
  function downloadCsv(s) { B.download(s.name.toLowerCase().replace(/\W+/g, '-') + '.csv', '﻿' + B.csv.stringify(s.rows, headersOf(s.rows)), 'text/csv;charset=utf-8'); }
  function reportHtml() {
    var p = chosenParts(); if (!Object.keys(p).length) { B.toast('Nothing to report yet'); return null; }
    p.title = $('#reportTitle').value || 'Reconciliation report';
    return L.reportHtml(p);
  }
  function dlXlsx() {
    var sets = L.exportSets(chosenParts()); if (!sets.length) return B.toast('Nothing to export yet');
    B.lib.xlsx().then(function (XLSX) {
      var wb = XLSX.utils.book_new(), used = {};
      sets.forEach(function (s) {
        var name = s.name.replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31); while (used[name]) name = name.slice(0, 29) + '_' + Math.floor(Math.random() * 9); used[name] = 1;
        XLSX.utils.book_append_sheet(wb, s.rows.length ? XLSX.utils.json_to_sheet(s.rows, { header: headersOf(s.rows) }) : XLSX.utils.aoa_to_sheet([['No rows']]), name);
      });
      var out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      B.download('reconciliation-results.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    }).catch(function (e) { B.toast('Could not load the Excel library: ' + e.message, 4000); });
  }

  // ---------- sample data ----------
  var SAMPLE = {
    A: { name: 'crm-customers.csv', csv: 'Customer ID,Name,Email,Phone,State,Balance,Last order\nC001,Harbour Cafe,orders@harbourcafe.com.au,0412 555 101,NSW,"1,250.00",03/10/2026\nC002,Bondi Plumbing,admin@bondiplumbing.com.au,0412 555 102,NSW,0,14/09/2026\nC003,Westside Florist,hello@westsideflorist.au,0412 555 103,VIC,310.50,12/09/2026\nC004,Northern Tiles,accounts@ntiles,0412 555 104,QLD,89.99,01/08/2026\nC005,Harbour Café Pty Ltd,orders@harbourcafe.com.au,0412 555 101,NSW,0,03/10/2026\nC006,Sunrise Physio,,0412 555 106,WA,-40,31/02/2026\nC007,Eastern Bakery,eat@easternbakery.au,0412 555 107,Tasmania,42,05/11/2026\nC008,Coastal Signs,info@coastalsigns.com.au,0412 555 108,NSW,1200,22/10/2026' },
    B: { name: 'xero-contacts.csv', csv: 'customer id,Name,Email,Phone,State,Balance,Last order\nC001,Harbour Cafe,orders@harbourcafe.com.au,0412 555 101,NSW,1250,2026-10-03\nC002,Bondi Plumbing Pty Ltd,admin@bondiplumbing.com.au,0412 555 102,NSW,0,2026-09-14\nC003,Westside Florist,hello@westsideflorist.au,0412 555 103,VIC,310.52,2026-09-12\nC004,Northern Tiles,accounts@ntiles.com.au,0412 555 104,QLD,89.99,2026-08-01\nC007,Eastern Bakery,eat@easternbakery.au,0412 555 107,TAS,42,2026-11-05\nC008,Coastal Signs,info@coastalsigns.com.au,0412 555 108,NSW,950,2026-10-22\nC009,Gumtree Landscaping,jobs@gumtreeland.au,0412 555 109,SA,0,2026-10-30' },
    INV: { name: 'invoices.csv', csv: 'Invoice No,Customer,Date,Total\nINV-1001,Harbour Cafe,01/10/2026,"$1,100.00"\nINV-1002,Bondi Plumbing,05/10/2026,550.00\nINV-1003,Westside Florist,10/10/2026,220.00\nINV-1004,Northern Tiles,20/10/2026,880.00\nINV-1005,Eastern Bakery,25/10/2026,99.00\nINV-1006,Coastal Signs,28/10/2026,"1,650.00"\nINV-1007,Sunrise Physio,01/11/2026,330.00' },
    PAY: { name: 'bank-statement.csv', csv: 'Date,Description,Amount\n03/10/2026,DIRECT CREDIT INV1001 HARBOUR CAFE,1100.00\n12/10/2026,BONDI PLUMBING PMT 1002,300.00\n19/10/2026,BONDI PLUMBING INV-1002 BAL,250.00\n14/10/2026,BPAY WESTSIDE FLORIST,220.00\n26/10/2026,EASTERN BAKERY,99.00\n30/10/2026,Unknown deposit,75.00\n04/11/2026,COASTAL SIGNS PART PAYMENT INV 1006,800.00' }
  };
  function loadSample() {
    Object.keys(SAMPLE).forEach(function (k) { var o = B.csv.toObjects(SAMPLE[k].csv); tables[k] = { name: SAMPLE[k].name, headers: o.headers, rows: o.rows }; });
    settings = { dupCols: ['Name'], rules: [
      { col: 'Customer ID', type: 'unique' }, { col: 'Email', type: 'required' }, { col: 'Email', type: 'email' }, { col: 'Phone', type: 'regex', value: '^04\\d{2} ?\\d{3} ?\\d{3}$' },
      { col: 'State', type: 'oneOf', value: 'NSW,VIC,QLD,SA,WA,TAS,NT,ACT' }, { col: 'Balance', type: 'number' }, { col: 'Balance', type: 'min', value: '0' }, { col: 'Last order', type: 'date' }] }; saveSettings(); saveTables();
    refreshAll();
    $('#tol').value = '0'; $('#days').value = '14'; $('#dupFile').value = 'A'; $('#valFile').value = 'A';
    runCompare(); runDups(); runRecon(); runValidate();
    B.toast('Sample data loaded and every check run. Look through the tabs.', 3200);
  }

  function refreshAll() {
    Object.keys(slotEls).forEach(function (k) { slotEls[k].render(); });
    renderKeys(); renderDupCols(); renderRecon(); renderRules();
  }

  // ---------- wiring ----------
  mountSlots();
  B.tabs($('.tabs'));
  $('#addKey').addEventListener('click', function () {
    if (!tables.A || !tables.B) return B.toast('Load both files first');
    settings.keys = (settings.keys || []).concat([{ a: tables.A.headers[0], b: tables.B.headers[0] }]); saveSettings(); renderKeys();
  });
  $('#runCompare').addEventListener('click', runCompare);
  $('#dupFile').addEventListener('change', renderDupCols);
  $('#runDups').addEventListener('click', runDups);
  $('#runRecon').addEventListener('click', runRecon);
  $('#valFile').addEventListener('change', function () { settings.rules = null; renderRules(); });
  $('#addRule').addEventListener('click', function () {
    var t = tables[$('#valFile').value]; if (!t) return B.toast('Load a file first');
    (settings.rules = settings.rules || []).push({ col: t.headers[0], type: 'required' }); saveSettings(); renderRules();
  });
  $('#suggestRules').addEventListener('click', function () {
    var t = tables[$('#valFile').value]; if (!t) return B.toast('Load a file first');
    settings.rules = L.suggestRules(t.headers, t.rows); saveSettings(); renderRules(); B.toast(settings.rules.length + ' rules suggested');
  });
  $('#exportRules').addEventListener('click', function () { B.download('data-check-rules.json', JSON.stringify({ app: 'csv-intelligence', rules: settings.rules || [], keys: settings.keys || [], recon: settings.recon || null }, null, 2), 'application/json'); });
  var ruleInput = B.h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  document.body.appendChild(ruleInput);
  $('#importRules').addEventListener('click', function () { ruleInput.click(); });
  ruleInput.addEventListener('change', function () {
    var f = ruleInput.files[0]; ruleInput.value = ''; if (!f) return;
    B.readFile(f).then(function (txt) {
      var j = JSON.parse(txt); if (!Array.isArray(j.rules)) throw new Error('No rules in that file');
      settings.rules = j.rules; if (j.keys) settings.keys = j.keys; if (j.recon) settings.recon = j.recon; saveSettings(); refreshAll(); B.toast('Rules loaded');
    }).catch(function (e) { B.toast('Could not load rules: ' + e.message, 3500); });
  });
  $('#dlReport').addEventListener('click', function () { var h = reportHtml(); if (h) B.download('reconciliation-report.html', h, 'text/html;charset=utf-8'); });
  $('#printReport').addEventListener('click', function () {
    var h = reportHtml(); if (!h) return;
    var w = window.open(URL.createObjectURL(new Blob([h], { type: 'text/html' })), '_blank');
    if (!w) B.toast('Your browser blocked the new window. Use "Download report" instead.', 3500);
  });
  $('#dlXlsx').addEventListener('click', dlXlsx);
  $('#sample').addEventListener('click', loadSample);
  $('#clearAll').addEventListener('click', function () {
    if (!confirm('Remove all loaded files, rules and results from this browser?')) return;
    tables = {}; settings = {}; results = {}; B.store.remove(STORE); B.store.remove(SETTINGS);
    ['#compareOut', '#dupsOut', '#reconOut', '#valOut', '#aiOut'].forEach(function (s) { $(s).innerHTML = ''; });
    refreshAll(); refreshReport();
  });

  // Optional AI: plain-English summary of the numbers already on screen (the rule-based results stay the source of truth).
  B.ai.note($('#aiBox'));
  B.ai.button($('#aiBox'), 'Write a summary for my bookkeeper', function () {
    var p = chosenParts(); if (!Object.keys(p).length) { B.toast('Run a check first'); return null; }
    var facts = [];
    if (p.compare) { var c = p.compare.result; facts.push('Comparison of ' + p.compare.nameA + ' and ' + p.compare.nameB + ': ' + c.same + ' identical, ' + c.changed.length + ' changed, ' + c.onlyA.length + ' only in first, ' + c.onlyB.length + ' only in second. Changed columns: ' + c.changed.slice(0, 20).map(function (x) { return x.key + ' (' + x.diffs.map(function (d) { return d.col + ': ' + d.a + ' -> ' + d.b; }).join('; ') + ')'; }).join(', ')); }
    if (p.recon) { var t = p.recon.result.totals; facts.push('Reconciliation: invoiced ' + t.invoiced + ', received ' + t.received + ', outstanding ' + t.outstanding + ', unmatched payments ' + t.unapplied + '. Unpaid invoices: ' + p.recon.result.unpaid.map(function (x) { return x.ref; }).join(', ') + '. Part paid: ' + p.recon.result.partial.map(function (x) { return x.ref + ' (' + x.balance + ' left)'; }).join(', ')); }
    if (p.dups) facts.push('Duplicates: ' + p.dups.groups.length + ' groups on ' + p.dups.cols.join(', ') + ': ' + p.dups.groups.slice(0, 10).map(function (g) { return g.key; }).join('; '));
    if (p.validation) facts.push('Data checks: ' + p.validation.result.failures.length + ' problems in ' + p.validation.result.badRows + ' rows. ' + p.validation.result.byRule.filter(function (b) { return b.count; }).map(function (b) { return b.col + ' ' + b.type + ': ' + b.count; }).join(', '));
    return 'Write a short, plain-English summary (Australian spelling, under 180 words, bullet points) for a small-business bookkeeper of these spreadsheet check results, then list the three most important things to fix. Use only these facts:\n' + facts.join('\n');
  }, function (ans) { $('#aiOut').innerHTML = '<div class="panel"><p class="small muted">AI summary — check it against the numbers above.</p><div style="white-space:pre-wrap">' + B.esc(ans) + '</div></div>'; });

  refreshAll(); refreshReport();
})();
