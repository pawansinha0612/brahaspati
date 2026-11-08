/* Subscription Leak Detector — page wiring. Logic in lib.js (SubsLib) on top of ../finance/lib.js (FinanceLib). */
(function () {
  'use strict';
  var L = window.SubsLib, F = window.FinanceLib, K = window.VaultKit, $ = B.$, esc = B.esc, money = K.money;
  var KEY = 'subleak:data';
  var data = load(), subs = [], pending = null, showTab;

  function load() { var d = B.store.get(KEY, null) || {}; return { txs: d.txs || [], decisions: d.decisions || {}, trials: d.trials || [] }; }
  function save() { if (!B.store.set(KEY, data)) B.toast('Could not save — browser storage may be full.', 4000); }
  function today() { return K.today(); }
  function stat(v, k, cls) { return '<div class="stat"><div class="v ' + (cls || '') + '">' + esc(v) + '</div><div class="k">' + esc(k) + '</div></div>'; }
  function dec(k) { return data.decisions[k] || {}; }

  function compute() { subs = L.findRecurring(data.txs, today()); }

  // ---------- found ----------
  function renderStats() {
    var s = L.summary(subs, data.decisions);
    $('#stats').innerHTML = stat(String(s.count), 'Active recurring charges') + stat(money(s.yearly), 'Per year (' + money(s.monthly) + ' a month)') +
      stat(money(s.leak), 'Possible leak a year (cancel + review)', s.leak ? 'warn' : '') + stat(String(s.unansweredCount), 'Still to decide', s.unansweredCount ? 'warn' : 'ok') +
      stat(String(s.increases), 'Price rises found', s.increases ? 'bad' : '') + stat(money(s.saved), 'Saved a year (cancelled)', s.saved ? 'ok' : '');
  }
  function renderList() {
    var show = $('#show').value;
    if (!data.txs.length) { $('#list').innerHTML = '<p>No statement yet. <button class="btn small" type="button" data-go="import">Import a statement</button> or press <b>Load sample data</b>.</p>'; return; }
    var list = subs.filter(function (s) {
      var d = dec(s.key).decision;
      if (show === 'stopped') return s.status === 'stopped';
      if (s.status === 'stopped') return false;
      if (show === 'none') return !d; if (show === 'up') return s.priceChange && s.priceChange.up;
      if (show === 'all') return true; return d === show;
    });
    if (!subs.length) { $('#list').innerHTML = '<p>No repeating charges found yet. Try importing a longer period (3–12 months).</p>'; return; }
    $('#list').innerHTML = list.map(function (s) {
      var d = dec(s.key), pc = s.priceChange;
      var btn = function (v, label) { return '<button class="btn small" type="button" aria-pressed="' + (d.decision === v) + '" data-dec="' + esc(s.key) + '|' + v + '">' + label + '</button>'; };
      return '<div class="panel sub"><div><h3>' + esc(s.name) + '</h3><span class="small muted">' + esc(s.sample) + '</span></div>' +
        '<div class="amt"><b>' + money(s.amount) + '</b><br><span class="small muted">' + esc(s.cadence.toLowerCase()) + ' · ' + money(s.yearly) + '/yr</span></div>' +
        '<div class="meta small">' + s.count + ' charges · first ' + K.niceDate(s.first) + ' · last ' + K.niceDate(s.last) +
        (s.status === 'stopped' ? ' · <span class="pill-ok">Seems to have stopped</span> (expected ' + K.niceDate(s.next) + ')' : ' · next about <b>' + K.niceDate(s.next) + '</b>') +
        (pc ? ' · <span class="' + (pc.up ? 'pill-bad' : 'pill-ok') + '">' + (pc.up ? 'Price up ' : 'Price down ') + Math.abs(pc.pct * 100).toFixed(0) + '%: ' + money(pc.from) + ' → ' + money(pc.to) + ' since ' + K.niceDate(pc.since) + '</span>' : '') + '</div>' +
        (s.status === 'stopped' ? '' : '<div class="choice">' + btn('keep', 'Keep') + btn('cancel', 'Cancel') + btn('review', 'Review') +
          (d.decision === 'cancel' ? '<label class="check small"><input type="checkbox" data-done="' + esc(s.key) + '"' + (d.cancelled ? ' checked' : '') + '> I’ve cancelled it</label>' : '') + '</div>') + '</div>';
    }).join('') || '<p class="muted">Nothing in this view.</p>';
  }

  // ---------- cancel plan ----------
  function planItems() { return subs.filter(function (s) { var d = dec(s.key).decision; return s.status === 'active' && (d === 'cancel' || d === 'review'); }); }
  function renderPlan() {
    var items = planItems();
    $('#plan').innerHTML = items.length ? items.map(function (s) {
      var c = L.cancelSteps(s), d = dec(s.key);
      return '<details class="panel"' + (d.cancelled ? '' : ' open') + '><summary><b>' + esc(s.name) + '</b> — ' + money(s.yearly) + ' a year · ' + (d.decision === 'cancel' ? (d.cancelled ? '<span class="pill-ok">cancelled</span>' : '<span class="pill-warn">to cancel</span>') : '<span class="pill-warn">to review</span>') + '</summary>' +
        (c.tip ? '<p class="small"><b>Tip:</b> ' + esc(c.tip) + '</p>' : '') +
        '<ol class="steps small">' + c.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
        '<p class="small"><a href="' + esc(c.search) + '" target="_blank" rel="noopener">Search the web: how to cancel ' + esc(s.name) + '</a></p></details>';
    }).join('') : '<p>Mark charges as <b>Cancel</b> or <b>Review</b> on the Recurring charges tab and they’ll appear here with steps.</p>';
  }
  function planHTML() {
    var items = planItems();
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Cancel plan</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:24px;max-width:760px;color:#000}h2{font-size:16px;margin:18px 0 4px}li{margin:3px 0}</style></head><body>' +
      '<h1>Subscriptions to cancel or review</h1><p>Prepared ' + K.niceDate(today()) + '. Total ' + money(items.reduce(function (a, s) { return a + s.yearly; }, 0)) + ' a year.</p>' +
      items.map(function (s) { var c = L.cancelSteps(s); return '<h2>☐ ' + esc(s.name) + ' — ' + money(s.amount) + ' ' + esc(s.cadence.toLowerCase()) + ' (' + money(s.yearly) + '/yr), next ' + K.niceDate(s.next) + '</h2>' + (c.tip ? '<p>' + esc(c.tip) + '</p>' : '') + '<ol>' + c.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>'; }).join('') + '</body></html>';
  }

  // ---------- trials ----------
  function renderTrials() {
    var t = today(), P = { ended: ['pill-bad', 'ended'], urgent: ['pill-bad', 'ends in ≤3 days'], soon: ['pill-warn', 'ends this week'], ok: ['pill-ok', 'running'] };
    var list = data.trials.slice().sort(function (a, b) { return a.ends < b.ends ? -1 : 1; });
    $('#trials').innerHTML = list.length ? B.table(list.map(function (x) { return { id: x.id, name: x.name, ends: K.niceDate(x.ends), st: L.trialStatus(x, t), then: x.price ? money(x.price) + ' ' + x.cadence.toLowerCase() : '' }; }),
      [{ key: 'name', label: 'Service' }, { key: 'ends', label: 'Trial ends' }, { key: 'st', label: '', fmt: function (s) { return '<span class="' + P[s][0] + '">' + P[s][1] + '</span>'; } }, { key: 'then', label: 'Then' },
        { key: 'id', label: '', fmt: function (id) { return '<button class="btn small" type="button" data-trial-del="' + esc(id) + '">Remove</button>'; } }]) : '<p class="muted">No trials added.</p>';
  }

  // ---------- import ----------
  function startImport(rows, label) {
    if (!rows.length) return B.toast('That file looks empty');
    var det = F.detectColumns(rows);
    pending = { rows: rows, det: det, label: label };
    $('#mapPanel').hidden = false;
    $('#mapMsg').innerHTML = det.confident ? 'Columns found automatically in <b>' + esc(label) + '</b>. Check the preview, then import.' : '<span class="warn">Please check the columns for <b>' + esc(label) + '</b>.</span> ' + esc(det.reasons.join(' '));
    $('#mapHeader').checked = det.hasHeader; $('#mapFlip').checked = false;
    var opt = function (sel) { return '<option value="-1">(none)</option>' + det.headers.map(function (h, i) { return '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + esc(h) + '</option>'; }).join(''); };
    $('#mapSelects').innerHTML = [['date', 'Date'], ['description', 'Description'], ['amount', 'Amount (+/-)'], ['debit', 'Money out'], ['credit', 'Money in']].map(function (f) {
      return '<div><label for="map-' + f[0] + '">' + f[1] + '</label><select id="map-' + f[0] + '" data-map="' + f[0] + '">' + opt(det.map[f[0]]) + '</select></div>';
    }).join('');
    preview(); $('#mapPanel').scrollIntoView({ behavior: 'smooth' });
  }
  function currentDet() {
    var det = JSON.parse(JSON.stringify(pending.det)); det.hasHeader = $('#mapHeader').checked;
    B.$$('[data-map]').forEach(function (s) { det.map[s.dataset.map] = +s.value; });
    return det;
  }
  function preview() {
    var r = L.readStatement(pending.rows, { det: currentDet(), flipSign: $('#mapFlip').checked });
    $('#mapPreview').innerHTML = '<p class="small">' + r.transactions.length + ' transactions read' + (r.skipped ? ', ' + r.skipped + ' rows skipped (no date or amount)' : '') + '.</p>' +
      (r.transactions.length ? B.table(r.transactions.slice(0, 6), [{ key: 'date', label: 'Date' }, { key: 'desc', label: 'Description' }, { key: 'amount', label: 'Amount', fmt: function (v) { return money(v); } }]) : '');
  }
  function readFile(file) {
    if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
      return Promise.all([B.lib.xlsx(), B.readFile(file, 'buffer')]).then(function (r) {
        var wb = r[0].read(r[1], { type: 'array' }); return B.csv.parse(r[0].utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { rawNumbers: true }), ',');
      });
    }
    return B.readFile(file).then(function (t) { return B.csv.parse(t); });
  }
  function doImport() {
    var r = L.readStatement(pending.rows, { det: currentDet(), flipSign: $('#mapFlip').checked });
    if (!r.transactions.length) return B.toast('No transactions found — check the columns');
    var m = L.merge(data.txs, r.transactions);
    data.txs = m.all; save(); pending = null; $('#mapPanel').hidden = true;
    compute(); renderAll(); showTab('found');
    B.toast(m.added.length + ' transactions added' + (m.duplicates ? ', ' + m.duplicates + ' already here' : ''), 3500);
  }
  function renderData() {
    var d = data.txs.map(function (t) { return t.date; }).sort();
    $('#dataInfo').textContent = data.txs.length ? data.txs.length + ' transactions from ' + K.niceDate(d[0]) + ' to ' + K.niceDate(d[d.length - 1]) + ' are saved in this browser.' : 'No transactions saved.';
  }

  function renderAll() { renderStats(); renderList(); renderPlan(); renderTrials(); renderData(); }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-dec],[data-go],[data-trial-del]'); if (!t) return;
    if (t.dataset.go) return showTab(t.dataset.go);
    if (t.dataset.trialDel) { data.trials = data.trials.filter(function (x) { return x.id !== t.dataset.trialDel; }); save(); return renderTrials(); }
    var p = t.dataset.dec.split('|'), cur = dec(p[0]);
    data.decisions[p[0]] = cur.decision === p[1] ? {} : { decision: p[1], cancelled: false, on: today() };
    save(); renderAll();
  });
  document.addEventListener('change', function (e) {
    var c = e.target.closest('[data-done]'); if (!c) return;
    data.decisions[c.dataset.done].cancelled = c.checked; save(); renderAll();
  });
  $('#show').addEventListener('change', renderList);
  $('#goImport').addEventListener('click', function () { showTab('import'); });
  B.dropZone($('#drop'), function (files) {
    readFile(files[0]).then(function (rows) { startImport(rows, files[0].name); }).catch(function (err) { B.toast('Could not read that file: ' + err.message, 4000); });
  }, { accept: '.csv,.txt,.tsv,.xlsx,.xls,.ods' });
  $('#pasteGo').addEventListener('click', function () { startImport(B.csv.parse($('#paste').value), 'pasted text'); });
  $('#mapSelects').addEventListener('change', preview);
  $('#mapHeader').addEventListener('change', preview); $('#mapFlip').addEventListener('change', preview);
  $('#mapGo').addEventListener('click', doImport);
  $('#mapCancel').addEventListener('click', function () { pending = null; $('#mapPanel').hidden = true; });
  $('#trialForm').addEventListener('submit', function (e) {
    e.preventDefault();
    data.trials.push({ id: B.uid(), name: $('#t-name').value.trim(), ends: $('#t-ends').value, price: Number($('#t-price').value) || 0, cadence: $('#t-cad').value });
    save(); this.reset(); renderTrials();
  });
  $('#trialIcs').addEventListener('click', function () { K.downloadICS('free-trials.ics', L.trialEvents(data.trials.filter(function (t) { return t.ends >= today(); })), 'Subscriptions'); });
  $('#reviewIcs').addEventListener('click', function () { K.downloadICS('subscription-reminders.ics', L.reviewEvents(subs, data.decisions), 'Subscriptions'); });
  $('#printPlan').addEventListener('click', function () { if (!planItems().length) return B.toast('Nothing in your plan yet'); K.printHTML(planHTML()); });
  $('#backup').addEventListener('click', function () { B.download('subscriptions-backup-' + today() + '.json', JSON.stringify(K.makeBackup('subscription-detector', data)), 'application/json'); });
  $('#restore').addEventListener('change', function () {
    var f = this.files[0]; this.value = ''; if (!f) return;
    B.readFile(f).then(function (text) {
      var o = K.readBackup(text, 'subscription-detector');
      if (!confirm('Replace your current data with this backup?')) return;
      data = { txs: o.data.txs || [], decisions: o.data.decisions || {}, trials: o.data.trials || [] }; save(); compute(); renderAll(); B.toast('Backup restored');
    }).catch(function (err) { B.toast(err.message, 5000); });
  });
  $('#wipe').addEventListener('click', function () {
    if (!confirm('Delete all imported transactions, decisions and trials from this browser?')) return;
    data = { txs: [], decisions: {}, trials: [] }; save(); compute(); renderAll();
  });
  $('#sample').addEventListener('click', function () {
    if (data.txs.length && !confirm('Replace your data with a made-up sample statement?')) return;
    var r = L.readStatement(B.csv.parse(L.sampleCSV(today())));
    data = { txs: r.transactions, decisions: {}, trials: [{ id: 'trial1', name: 'Streaming trial (example)', ends: K.addDays(today(), 5), price: 12.99, cadence: 'Monthly' }] };
    save(); compute(); renderAll(); showTab('found'); B.toast('Sample statement loaded — all made up');
  });

  showTab = B.tabs($('.tabs'));
  compute(); renderAll();
})();
