/* Appointment No-show Predictor — page wiring. Logic lives in lib.js (NoShowLib). */
(function () {
  'use strict';
  var L = window.NoShowLib, $ = B.$;
  var KEY = 'ns:data', SKEY = 'ns:settings', MKEY = 'ns:manual';
  var data = B.store.get(KEY, null);             // {name, headers, rows, map}
  var settings = Object.assign({ lateAsNoShow: true, value: 90, confidence: 0.8, filter: 'hm' }, B.store.get(SKEY, {}) || {});
  var manual = B.store.get(MKEY, []) || [];      // canonical upcoming appointments added by hand
  var info = null, model = null, scored = [];

  function save() { if (data && !B.store.set(KEY, data)) B.toast('File is too big to remember after a refresh, but it works for now.', 3500); }
  function saveSettings() { B.store.set(SKEY, settings); }
  function pct(x, d) { return B.fmt.pct(x, d == null ? 1 : d); }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function todayNaive() { return Date.parse(todayIso() + 'T00:00:00Z'); }
  function stat(v, k) { return '<div class="stat"><div class="v">' + v + '</div><div class="k">' + B.esc(k) + '</div></div>'; }
  function fmtTime(a) { var d = new Date(a.t); return a.hasTime ? ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2) : ''; }

  // ---------- import ----------
  B.dropZone($('#drop'), function (files) {
    B.readTable(files[0]).then(function (t) {
      if (!t.headers.length || !t.rows.length) throw new Error('no rows found');
      data = { name: files[0].name, headers: t.headers, rows: t.rows, map: L.detectColumns(t.headers) };
      save(); showMapping(); B.toast('Loaded ' + files[0].name + ' — check the columns, then Analyse');
    }).catch(function (e) { B.toast('Could not read that file: ' + e.message, 4000); });
  }, { accept: '.csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods,.json' });

  function showMapping() {
    $('#lateNs').checked = settings.lateAsNoShow; $('#value').value = settings.value; $('#conf').value = String(settings.confidence);
    if (!data) { $('#mapPanel').hidden = true; $('#fileInfo').textContent = ''; return; }
    $('#fileInfo').textContent = data.name + ' · ' + B.fmt.num(data.rows.length, 0) + ' rows · ' + data.headers.length + ' columns';
    $('#mapPanel').hidden = false;
    var g = $('#mapGrid'); g.innerHTML = '';
    L.FIELDS.forEach(function (f) {
      var id = 'map-' + f.key, sel = B.h('select', { id: id });
      sel.appendChild(B.h('option', { value: '', text: f.required ? '— choose —' : '— not in my file —' }));
      data.headers.forEach(function (h) { sel.appendChild(B.h('option', { value: h, text: h, selected: data.map[f.key] === h ? true : null })); });
      sel.addEventListener('change', function () { data.map[f.key] = sel.value; save(); });
      g.appendChild(B.h('div', {}, [B.h('label', { for: id, text: f.label + (f.required ? ' *' : '') }), sel]));
    });
  }
  ['lateNs', 'value', 'conf'].forEach(function (id) {
    $('#' + id).addEventListener('change', function () {
      settings.lateAsNoShow = $('#lateNs').checked; settings.value = Math.max(0, +$('#value').value || 0); settings.confidence = +$('#conf').value; saveSettings();
      if (info) analyse(false);
    });
  });
  $('#analyse').addEventListener('click', function () { if (analyse(true)) showTab('patterns'); });

  function analyse(loud) {
    if (!data) return false;
    var miss = L.FIELDS.filter(function (f) { return f.required && !data.map[f.key]; });
    if (miss.length) { $('#msg').textContent = 'Choose a column for: ' + miss.map(function (f) { return f.label; }).join(', '); return false; }
    info = L.prepare(data.rows, data.map, { lateAsNoShow: settings.lateAsNoShow, today: todayNaive(), extra: manual });
    if (!info.past.length && !info.upcoming.length) { $('#msg').textContent = 'No usable rows — check the date and status columns.'; return false; }
    model = L.buildModel(info);
    scored = info.upcoming.map(function (a) { var r = model.score(a); return { appt: a, p: r.p, reasons: r.reasons, level: L.riskLevel(r.p, info.baseRate) }; });
    $('#msg').textContent = B.fmt.num(info.past.length, 0) + ' past and ' + info.upcoming.length + ' upcoming appointments' +
      (info.cancelled ? ', ' + info.cancelled + ' cancellations left out' : '') + (info.skipped ? ', ' + info.skipped + ' rows with no readable date' : '') + (info.unknown ? ', ' + info.unknown + ' with an unclear status' : '') + '.';
    renderPatterns(); renderUpcoming(); renderRecs(); renderModel(); fillLists();
    if (loud) B.toast('Analysis ready'); return true;
  }

  // ---------- patterns ----------
  function dimAvailable(d) {
    return { weekday: true, hour: info.hasTime, lead: info.hasLead, service: info.hasService, staff: info.hasStaff, isNew: info.hasNew, reminder: info.hasReminder, channel: info.hasChannel, history: info.hasCustomer }[d];
  }
  function bars(groups) {
    var max = Math.max.apply(null, groups.map(function (g) { return g.rate; }).concat([0.01]));
    return groups.map(function (g) {
      var hot = g.rate > info.baseRate * 1.3 && !g.small;
      return '<div style="display:grid;grid-template-columns:minmax(80px,38%) 1fr auto;gap:8px;align-items:center;font-size:13px;margin:4px 0">' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + B.esc(g.key) + '">' + B.esc(g.key) + '</span>' +
        '<div style="background:var(--soft);border-radius:4px"><div class="bar-h" style="width:' + (g.rate / max * 100).toFixed(1) + '%;background:' + (hot ? 'var(--bad)' : 'var(--brand)') + '"></div></div>' +
        '<span style="white-space:nowrap">' + pct(g.rate) + ' <span class="muted">of ' + g.n + '</span>' + (g.small ? ' <span class="tag" title="Fewer than 30 appointments — not reliable on its own">few</span>' : '') + '</span></div>';
    }).join('');
  }
  function renderPatterns() {
    var out = $('#patOut');
    if (!info || !info.past.length) { out.innerHTML = '<p class="muted">No past appointments with an outcome yet.</p>'; return; }
    var span = info.past.length ? (info.past[info.past.length - 1].t - info.past[0].t) / 86400000 : 0;
    var html = '<div class="stat-row">' + stat(B.fmt.num(info.past.length, 0), 'Past appointments') + stat(B.fmt.num(info.noShows, 0), 'Missed') + stat(pct(info.baseRate), 'No-show rate') +
      stat(info.upcoming.length, 'Upcoming') + stat(settings.value ? B.fmt.money(info.noShows * settings.value / Math.max(1, span / 30.44)).replace(/\.\d+$/, '') : '–', 'Lost per month (approx)') + '</div>';
    html += '<p class="small muted">Red bars are well above your overall rate (' + pct(info.baseRate) + '). The thin "few" tag means too few appointments to trust that number on its own.</p><div class="dims">';
    Object.keys(L.DIMS).forEach(function (d) {
      if (!dimAvailable(d)) return;
      var g = L.rateBy(info.past, d); if (g.length < 2) return;
      html += '<div class="panel"><h3>' + B.esc(L.DIMS[d].label) + '</h3>' + bars(g.slice(0, 14)) + '</div>';
    });
    out.innerHTML = html + '</div>';
  }

  // ---------- upcoming ----------
  var LEVEL = { High: 'pill-bad', Medium: 'pill-warn', Low: 'pill-ok' };
  function renderUpcoming() {
    var out = $('#upOut');
    if (!info) { out.innerHTML = '<p class="muted">Import your bookings first.</p>'; return; }
    if (!scored.length) { out.innerHTML = '<div class="panel"><p>No upcoming appointments found. Include future bookings in your export (status "Booked" or blank), or add one by hand below.</p></div>'; return; }
    var hi = scored.filter(function (s) { return s.level === 'High'; }), med = scored.filter(function (s) { return s.level === 'Medium'; });
    var exp = scored.reduce(function (s, x) { return s + x.p; }, 0);
    var rows = scored.filter(function (s) { return settings.filter === 'all' || (settings.filter === 'hm' ? s.level !== 'Low' : s.level === 'High'); })
      .sort(function (a, b) { return a.appt.t - b.appt.t; });
    var days = L.byDay(scored, settings.confidence);
    out.innerHTML = (model.warnings || []).map(function (w) { return '<p class="panel small"><b>Note:</b> ' + B.esc(w) + '</p>'; }).join('') +
      '<div class="stat-row">' + stat(scored.length, 'Upcoming') + stat(hi.length, 'High risk') + stat(med.length, 'Medium risk') + stat(B.fmt.num(exp, 1), 'Expected no-shows') + '</div>' +
      '<div class="row no-print" style="margin:12px 0">' +
      '<select id="filter" style="width:auto" aria-label="Show"><option value="all">Show all</option><option value="hm">High and medium only</option><option value="h">High only</option></select>' +
      '<button class="btn" id="dlUp" type="button">Download list (CSV)</button><button class="btn" id="dlIcs" type="button">Reminder-call tasks (.ics)</button><button class="btn" id="printUp" type="button">Printable report</button></div>' +
      B.table(rows, [
        { key: 'appt', label: 'When', fmt: function (a) { return B.esc(a.weekday.slice(0, 3) + ' ' + a.date) + (a.hasTime ? '<br>' + fmtTime(a) : ''); } },
        { key: 'appt', label: 'Customer', fmt: function (a) { return B.esc(a.customer || '–') + (a.manual ? ' <span class="tag">added</span>' : ''); } },
        { key: 'appt', label: 'Service', fmt: function (a) { return B.esc(a.service || '–'); } },
        { key: 'p', label: 'Risk', fmt: function (p, s) { return '<span class="' + LEVEL[s.level] + '">' + s.level + '</span> ' + Math.round(p * 100) + '%'; } },
        { key: 'reasons', label: 'Why', fmt: function (r) { return '<span class="reasons">' + (r.length ? r.map(B.esc).join('; ') : '—') + '</span>'; } },
        { key: 'level', label: 'Suggested action', fmt: function (l, s) { return l === 'High' ? (s.appt.reminder === false ? 'Send reminder now + call day before' : 'Second reminder 2–3 h before; ask to confirm') : l === 'Medium' ? (s.appt.reminder === false ? 'Send reminder' : 'Standard reminder') : (s.appt.reminder === false ? 'Standard reminder' : '—'); } },
        { key: 'appt', label: '', fmt: function (a) { return a.manual ? '<button class="btn small" type="button" data-del="' + B.esc(a.id) + '">Remove</button>' : ''; } }
      ], { limit: 1000 }) +
      '<h3>Day planner</h3><p class="small muted">Expected no-shows add up each booking\'s risk. "Safe extra bookings" keeps the chance that everyone turns up anyway (and someone waits) under ' + Math.round((1 - settings.confidence) * 100) + '%.</p>' +
      B.table(days, [{ key: 'date', label: 'Date', fmt: function (v, d) { return B.esc(d.weekday.slice(0, 3) + ' ' + v); } }, { key: 'n', label: 'Bookings' },
        { key: 'expected', label: 'Expected no-shows', fmt: function (v) { return B.fmt.num(v, 1); } }, { key: 'high', label: 'High risk' },
        { key: 'overbook', label: 'Safe extra bookings', fmt: function (v) { return v ? '<b>' + v + '</b>' : '0'; } },
        { key: 'clashRisk', label: 'Clash chance', fmt: function (v, d) { return d.overbook ? pct(v, 0) : '–'; } }]);
    $('#filter').value = settings.filter;
    $('#filter').addEventListener('change', function () { settings.filter = $('#filter').value; saveSettings(); renderUpcoming(); });
    B.$$('[data-del]', out).forEach(function (b) { b.addEventListener('click', function () { manual = manual.filter(function (m) { return m.id !== b.dataset.del; }); B.store.set(MKEY, manual); analyse(false); }); });
    $('#dlUp').addEventListener('click', function () {
      var list = rows.map(function (s) { return { Date: s.appt.date, Time: fmtTime(s.appt), Customer: s.appt.customer, Service: s.appt.service, Channel: s.appt.channel, 'Risk %': Math.round(s.p * 100), Level: s.level, Reasons: s.reasons.join('; ') }; });
      B.download('upcoming-no-show-risk.csv', B.csv.stringify(list, ['Date', 'Time', 'Customer', 'Service', 'Channel', 'Risk %', 'Level', 'Reasons']), 'text/csv;charset=utf-8');
    });
    $('#dlIcs').addEventListener('click', function () {
      var ev = scored.filter(function (s) { return s.level === 'High'; }).map(function (s) {
        var d = new Date(s.appt.t), dayBefore = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1, 10, 0);
        return { t: dayBefore, summary: 'Confirm ' + (s.appt.customer || 'customer') + ' for ' + s.appt.date + ' ' + fmtTime(s.appt), description: (s.appt.service ? s.appt.service + '. ' : '') + 'No-show risk ' + Math.round(s.p * 100) + '%. ' + s.reasons.join('; ') };
      });
      if (!ev.length) { B.toast('No high-risk bookings to remind about'); return; }
      B.download('no-show-reminder-calls.ics', L.ics(ev), 'text/calendar;charset=utf-8');
    });
    $('#printUp').addEventListener('click', function () { printHtml(reportHtml(rows, days)); });
  }

  // ---------- manual add ----------
  function fillLists() {
    var sv = {}, ch = {}; (info ? info.past : []).forEach(function (a) { if (a.service) sv[a.service] = 1; if (a.channel) ch[a.channel] = 1; });
    $('#svcList').innerHTML = Object.keys(sv).map(function (s) { return '<option value="' + B.esc(s) + '">'; }).join('');
    $('#chanList').innerHTML = Object.keys(ch).map(function (s) { return '<option value="' + B.esc(s) + '">'; }).join('');
  }
  $('#mAdd').addEventListener('click', function () {
    if (!info) { B.toast('Import your history first so the risk can be worked out'); return; }
    var d = $('#mDate').value; if (!d) { B.toast('Choose a date'); return; }
    if (Date.parse(d + 'T00:00:00Z') < todayNaive()) { B.toast('That date is in the past'); return; }
    manual.push({ id: B.uid(), date: d, time: $('#mTime').value, customer: $('#mCust').value.trim(), service: $('#mSvc').value.trim(), channel: $('#mChan').value.trim(), booked: $('#mBooked').value || todayIso(), reminder: $('#mRem').value, isNew: $('#mNew').value, status: 'Booked' });
    B.store.set(MKEY, manual); analyse(false); B.toast('Added and scored');
    ['mTime', 'mCust', 'mSvc', 'mChan'].forEach(function (id) { $('#' + id).value = ''; });
  });

  // ---------- recommendations ----------
  function renderRecs() {
    var out = $('#recOut'); if (!info || !info.past.length) { out.innerHTML = '<p class="muted">Import your bookings first.</p>'; return; }
    var recs = L.recommendations(info, { value: settings.value });
    if (!recs.length) { out.innerHTML = '<div class="panel"><p>No strong patterns stand out — your no-shows look fairly random. Keep sending reminders to everyone, and use the day planner for overbooking.</p></div>'; return; }
    out.innerHTML = recs.map(function (r) {
      return '<div class="panel rec"><h3>' + B.esc(r.title) + '</h3><p>' + B.esc(r.text) + '</p>' +
        (r.customers ? B.table(r.customers, [{ key: 'customer', label: 'Customer' }, { key: 'n', label: 'Bookings' }, { key: 'ns', label: 'Missed' }, { key: 'ns', label: 'Rate', fmt: function (v, c) { return pct(v / c.n, 0); } }]) : '') + '</div>';
    }).join('');
  }

  // ---------- model check ----------
  function renderModel() {
    var out = $('#modelOut'); if (!info || !model) { out.innerHTML = '<p class="muted">Import your bookings first.</p>'; return; }
    var html = (model.warnings || []).map(function (w) { return '<p class="panel small"><b>Note:</b> ' + B.esc(w) + '</p>'; }).join('');
    if (model.type === 'none') { out.innerHTML = html; return; }
    var a = model.test.auc, verdict = a == null ? 'not measurable (no no-shows in the test period)' : a >= 0.75 ? 'good' : a >= 0.65 ? 'useful' : a >= 0.6 ? 'weak but better than chance' : 'close to guessing';
    html += '<div class="panel"><h3 style="margin-top:0">' + (model.type === 'logistic' ? 'Trained model (logistic regression)' : 'Simple rate-based score') + '</h3>' +
      '<p>Tested on your newest ' + model.test.n + ' appointments, which it did not learn from. AUC = <b>' + (a == null ? '–' : a.toFixed(2)) + '</b> — ' + verdict + '. ' +
      (a != null ? 'If you pick one appointment that was missed and one that was kept, the missed one gets the higher score ' + Math.round(a * 100) + '% of the time.' : '') + '</p>' +
      '<h3>Calibration: does "20% risk" really mean 1 in 5?</h3>' +
      B.table(model.test.calibration, [{ key: 'bin', label: 'Group (low → high risk)' }, { key: 'n', label: 'Appointments' }, { key: 'predicted', label: 'Predicted', fmt: function (v) { return pct(v); } }, { key: 'actual', label: 'Actually missed', fmt: function (v) { return pct(v); } }]) +
      '<p class="small muted">Good calibration means the two columns are close. Small groups bounce around.</p></div>';
    if (model.weights) {
      var NAMES = { lead: 'Booked further ahead', new: 'New customer', norem: 'No reminder sent', prior: 'Customer\'s past no-show rate', visits: 'Number of past visits' };
      var w = model.weights.slice(0, 12).map(function (x) {
        var nm = NAMES[x.id] || x.id.replace(/^wd:/, 'Day: ').replace(/^tb:/, 'Time: ').replace(/^sv:/, 'Service: ').replace(/^ch:/, 'Channel: ');
        return { name: nm, w: x.w };
      });
      html += '<div class="panel"><h3 style="margin-top:0">What drives the score</h3>' + B.table(w, [{ key: 'name', label: 'Factor' }, { key: 'w', label: 'Effect', fmt: function (v) { return v > 0 ? '<span class="bad">raises risk</span>' : '<span class="ok">lowers risk</span>'; } }, { key: 'w', label: 'Strength', fmt: function (v) { return '<span style="display:inline-block;height:8px;border-radius:4px;background:' + (v > 0 ? 'var(--bad)' : 'var(--ok)') + ';width:' + Math.min(120, Math.round(Math.abs(v) * 200)) + 'px"></span>'; } }]) +
        '<p class="small muted">Compared with your most common day, service and channel. Strength is per typical difference (standardised), so factors can be compared.</p></div>';
    }
    out.innerHTML = html;
  }

  // ---------- report ----------
  function reportHtml(rows, days) {
    var esc = B.esc;
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>No-show risk report</title><style>body{font:13px system-ui,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;width:100%;margin:8px 0 18px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f1ede4}h1{font-size:20px}h2{font-size:16px}</style></head><body>' +
      '<h1>Appointment no-show risk</h1><p>Generated ' + new Date().toLocaleDateString('en-AU') + '. History: ' + info.past.length + ' appointments, overall no-show rate ' + pct(info.baseRate) + '.</p>' +
      '<h2>What to do</h2><ul>' + L.recommendations(info, { value: settings.value }).map(function (r) { return '<li><b>' + esc(r.title) + '.</b> ' + esc(r.text) + '</li>'; }).join('') + '</ul>' +
      '<h2>Upcoming appointments</h2><table><thead><tr><th>Date</th><th>Time</th><th>Customer</th><th>Service</th><th>Risk</th><th>Why</th></tr></thead><tbody>' +
      rows.map(function (s) { return '<tr><td>' + esc(s.appt.date) + '</td><td>' + fmtTime(s.appt) + '</td><td>' + esc(s.appt.customer) + '</td><td>' + esc(s.appt.service) + '</td><td>' + s.level + ' ' + Math.round(s.p * 100) + '%</td><td>' + esc(s.reasons.join('; ')) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<h2>Day planner</h2><table><thead><tr><th>Date</th><th>Bookings</th><th>Expected no-shows</th><th>Safe extra bookings</th></tr></thead><tbody>' +
      days.map(function (d) { return '<tr><td>' + esc(d.weekday + ' ' + d.date) + '</td><td>' + d.n + '</td><td>' + d.expected.toFixed(1) + '</td><td>' + d.overbook + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<p style="font-size:11px;color:#555">Scores are likelihoods based on past patterns, not certainties. Use them for extra reminders and deposits, never to refuse service.</p></body></html>';
  }
  function printHtml(html) {
    var f = B.h('iframe', { style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0', title: 'print' }); document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(function () { f.remove(); }, 1000); }, 200);
  }

  // ---------- sample, backup ----------
  var showTab;
  $('#sample').addEventListener('click', function () {
    if (data && !confirm('Replace your imported bookings with the sample data?')) return;
    var s = L.sampleData(todayIso());
    data = { name: 'sample-physio-clinic-appointments.csv', headers: s.headers, rows: s.rows, map: L.detectColumns(s.headers) };
    manual = []; B.store.set(MKEY, manual); save(); showMapping(); analyse(false); showTab('patterns'); B.toast('Sample loaded — a made-up physio clinic');
  });
  $('#backup').addEventListener('click', function () {
    if (!data) { B.toast('Nothing to back up yet'); return; }
    B.download('no-show-predictor-backup.json', JSON.stringify({ app: 'no-show-predictor', version: 1, data: data, settings: settings, manual: manual }), 'application/json');
  });
  $('#restore').addEventListener('click', function () {
    var inp = B.h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', function () {
      if (!inp.files[0]) return;
      B.readFile(inp.files[0]).then(function (t) {
        var j = JSON.parse(t); if (!j || j.app !== 'no-show-predictor' || !j.data) throw new Error('not a No-show Predictor backup');
        data = j.data; settings = Object.assign(settings, j.settings || {}); manual = j.manual || [];
        save(); saveSettings(); B.store.set(MKEY, manual); showMapping(); analyse(false); B.toast('Backup restored');
      }).catch(function (e) { B.toast('Could not restore: ' + e.message, 4000); });
    });
    inp.click();
  });
  $('#clearAll').addEventListener('click', function () {
    if (!confirm('Delete the imported bookings and settings from this browser?')) return;
    [KEY, SKEY, MKEY].forEach(B.store.remove); data = null; info = null; model = null; scored = []; manual = [];
    showMapping(); ['#patOut', '#upOut', '#recOut', '#modelOut'].forEach(function (s) { $(s).innerHTML = '<p class="muted">Import your bookings first.</p>'; }); B.toast('Cleared');
  });

  showTab = B.tabs($('.tabs'));
  showMapping();
  if (data) analyse(false);
})();
