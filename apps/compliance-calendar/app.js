/* Compliance Calendar — page wiring. Date rules live in lib.js (ComplianceLib). */
(function () {
  'use strict';
  var L = window.ComplianceLib, $ = B.$, esc = B.esc;
  var KEY = 'compliance-calendar:data';
  var data = L.normalize(B.store.get(KEY, null));
  var showTab, month = null, openDone = null, editingId = null, adding = null;
  var CATS = ['Tax', 'Payroll', 'ASIC', 'Insurance', 'Licences', 'Premises', 'WHS', 'Vehicles', 'Other'];
  var STATUS = { overdue: ['pill-bad', 'Overdue'], 'due-soon': ['pill-warn', 'Due soon'], upcoming: ['pill-mute', 'Upcoming'], done: ['pill-ok', 'Done'] };

  function save() { if (!B.store.set(KEY, data)) B.toast('Could not save — browser storage may be full. Download a backup.', 4000); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function opts(extra) { return Object.assign({ shift: data.profile.shiftWeekend, startDate: data.profile.startDate }, extra || {}); }
  function ob(id) { return data.obligations.filter(function (o) { return o.id === id; })[0]; }
  function all(from, to) { return L.items(data.obligations, data.records, today(), opts({ from: from, to: to })); }
  function pill(s) { var p = STATUS[s] || STATUS.upcoming; return '<span class="' + p[0] + '">' + p[1] + '</span>'; }
  function when(x) { var d = x.daysLeft; return d === 0 ? 'today' : d === 1 ? 'tomorrow' : d > 0 ? 'in ' + d + ' days' : (-d) + ' day' + (d === -1 ? '' : 's') + ' ago'; }
  function stat(v, k, cls) { return '<div class="stat"><div class="v ' + (cls || '') + '">' + esc(String(v)) + '</div><div class="k">' + esc(k) + '</div></div>'; }
  function slug(s) { return String(s || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }

  // ---------- upcoming ----------
  function renderUpcoming() {
    var t = today(), list = all(L.addMonths(t, -12), L.addMonths(t, 12)), s = L.summary(list.filter(function (x) { return x.due <= L.addDays(t, 90) || x.status === 'overdue'; }));
    var nextDays = list.filter(function (x) { return x.status !== 'done' && x.due >= t; })[0];
    $('#stats').innerHTML = stat(s.overdue, 'Overdue', s.overdue ? 'bad' : 'ok') + stat(s.dueSoon, 'Reminder period started', s.dueSoon ? 'warn' : '') +
      stat(list.filter(function (x) { return x.status !== 'done' && x.due >= t && x.due <= L.addDays(t, 90); }).length, 'Due in next 90 days') +
      stat(nextDays ? L.fmtDate(nextDays.due) : '–', 'Next due date') + stat(data.obligations.length, 'Obligations tracked');
    var cats = ['all'].concat(CATS.filter(function (c) { return data.obligations.some(function (o) { return o.category === c; }); }));
    var cf = $('#catFilter'), cur = cf.value || 'all';
    cf.innerHTML = cats.map(function (c) { return '<option value="' + esc(c) + '"' + (c === cur ? ' selected' : '') + '>' + (c === 'all' ? 'All categories' : esc(c)) + '</option>'; }).join('');
    var v = $('#view').value, rows;
    if (v === 'overdue') rows = list.filter(function (x) { return x.status === 'overdue'; });
    else if (v === 'year') rows = list.filter(function (x) { return x.due >= t || x.status === 'overdue'; });
    else if (v === 'done') rows = list.filter(function (x) { return x.status === 'done'; }).reverse();
    else rows = list.filter(function (x) { return x.status === 'overdue' || (x.due >= t && x.due <= L.addDays(t, 90)); });
    if (cf.value !== 'all') rows = rows.filter(function (x) { return x.category === cf.value; });
    if (!data.obligations.length) { $('#list').innerHTML = '<div class="panel"><p>Nothing to track yet. Go to <b>Setup</b> and answer a few questions, or press <b>Load sample data</b> to look around first.</p></div>'; return; }
    if (!rows.length) { $('#list').innerHTML = '<p class="ok" style="margin-top:14px">Nothing in this view.</p>'; return; }
    $('#list').innerHTML = rows.map(function (x) {
      var html = '<div class="item" id="it-' + esc(x.key.replace(/[^A-Za-z0-9-]/g, '_')) + '"><div><div class="when">' + esc(L.fmtDate(x.due)) + '</div><div class="small muted">' + esc(when(x)) + '</div></div>' +
        '<div><b>' + esc(x.title) + '</b>' + (x.label ? ' <span class="small muted">· ' + esc(x.label) + '</span>' : '') + '<div class="small">' + pill(x.status) + ' <span class="muted">' + esc(x.category) +
        (x.shifted ? ' · moved from ' + esc(L.fmtDate(x.date)) + ' (weekend)' : '') + (x.status !== 'done' ? ' · reminder from ' + esc(L.fmtDate(x.remind)) : '') + '</span></div>' +
        (x.done ? '<div class="small">Done ' + esc(x.doneOn ? L.fmtDate(x.doneOn) : '') + (x.evidence ? ' — ' + esc(x.evidence) : '') + (x.attachment ? ' · 📎 ' + esc(x.attachment) : '') + '</div>' : '') + '</div>' +
        '<div class="acts">' + (x.done ? '<button class="btn small" type="button" data-undo="' + esc(x.key) + '">Undo</button>' : '<button class="btn small primary" type="button" data-done="' + esc(x.key) + '">Mark done</button>') +
        '<button class="btn small" type="button" data-ics="' + esc(x.key) + '">.ics</button><button class="btn small" type="button" data-edit="' + esc(x.id) + '">Edit</button></div>';
      if (openDone === x.key) {
        html += '<div class="donebox"><div class="form-grid"><div><label for="d-on">Done on</label><input type="date" id="d-on" value="' + esc(t) + '"></div>' +
          '<div><label for="d-ev">Evidence note (receipt no., lodgment reference)</label><input type="text" id="d-ev" placeholder="e.g. ATO receipt 12345678"></div>' +
          '<div><label for="d-att">Attachment (only the file name is saved)</label><input type="file" id="d-att"></div></div>' +
          '<div class="row" style="margin-top:8px"><button class="btn primary small" type="button" data-savedone="' + esc(x.key) + '">Save</button><button class="btn small" type="button" data-canceldone="1">Cancel</button></div></div>';
      }
      return html + '</div>';
    }).join('');
  }
  function itemByKey(key) { var t = today(); return all(L.addMonths(t, -14), L.addMonths(t, 26)).filter(function (x) { return x.key === key; })[0]; }
  function onListClick(e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.done) { openDone = b.dataset.done; renderUpcoming(); var f = $('#d-ev'); if (f) f.focus(); }
    else if (b.dataset.canceldone) { openDone = null; renderUpcoming(); }
    else if (b.dataset.savedone) {
      var att = $('#d-att').files[0];
      data.records[b.dataset.savedone] = { done: true, doneOn: $('#d-on').value || today(), evidence: $('#d-ev').value.trim(), attachment: att ? att.name : '' };
      openDone = null; save(); renderAllViews(); B.toast('Marked done');
    } else if (b.dataset.undo) { delete data.records[b.dataset.undo]; save(); renderAllViews(); }
    else if (b.dataset.ics) { var x = itemByKey(b.dataset.ics); if (x) B.download(slug(x.title) + '-' + x.due + '.ics', L.toICS([x], { name: x.title }), 'text/calendar;charset=utf-8'); }
    else if (b.dataset.edit) { editingId = b.dataset.edit; adding = null; showTab('obligations'); renderObligations(); var el = document.getElementById('ob-' + editingId); if (el) el.scrollIntoView({ block: 'start' }); }
  }

  // ---------- calendar ----------
  function renderCalendar() {
    if (!month) { var t = today(); month = { y: +t.slice(0, 4), m: +t.slice(5, 7) }; }
    var from = L.make(month.y, month.m, 1), list = all(L.addDays(from, -7), L.addDays(L.addMonths(from, 1), 7)), grid = L.monthGrid(month.y, month.m, list), t = today();
    $('#monthTitle').textContent = L.MONTHS[month.m - 1] + ' ' + month.y;
    $('#cal').innerHTML = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (d) { return '<div class="dow">' + d + '</div>'; }).join('') +
      grid.map(function (w) {
        return w.map(function (d) {
          return '<div class="day' + (d.inMonth ? '' : ' out') + (d.date === t ? ' today' : '') + '"><div class="num">' + (+d.date.slice(8)) + '</div>' +
            d.items.map(function (x) { return '<button type="button" class="ev ' + esc(x.status) + '" data-key="' + esc(x.key) + '" title="' + esc(x.title + (x.label ? ' — ' + x.label : '')) + '">' + esc(x.title) + '</button>'; }).join('') + '</div>';
        }).join('');
      }).join('');
  }
  function moveMonth(n) { var m = month.m - 1 + n; month = { y: month.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 + 1 }; renderCalendar(); }

  // ---------- obligations ----------
  function editForm(o, isNew) {
    var f = L.ruleToForm(o.rule), sh = o.shift == null ? 'inherit' : o.shift ? 'yes' : 'no';
    var sel = function (id, vals, cur) { return '<select id="' + id + '">' + vals.map(function (v) { return '<option value="' + esc(v[0]) + '"' + (String(v[0]) === String(cur) ? ' selected' : '') + '>' + esc(v[1]) + '</option>'; }).join('') + '</select>'; };
    return '<div class="ob-edit" data-form="' + esc(o.id || 'new') + '"><div class="form-grid">' +
      '<div class="full"><label for="e-title">Title</label><input type="text" id="e-title" value="' + esc(o.title || '') + '"></div>' +
      '<div><label for="e-category">Category</label>' + sel('e-category', CATS.map(function (c) { return [c, c]; }), o.category || 'Other') + '</div>' +
      '<div><label for="e-kind">Repeats</label>' + sel('e-kind', [['yearly', 'Every year on a date'], ['dates', 'Several dates every year'], ['monthly', 'Every month on a day'], ['every', 'Every N months or days from a date'], ['once', 'Once']], f.kind) + '</div>' +
      '<div data-k="yearly once every"><label for="e-date">Date (first due date)</label><input type="date" id="e-date" value="' + esc(f.date) + '"></div>' +
      '<div data-k="every"><label for="e-n">Repeat every</label><div class="row" style="flex-wrap:nowrap"><input type="number" id="e-n" min="1" value="' + esc(f.n) + '" style="width:90px">' + sel('e-unit', [['months', 'months'], ['days', 'days']], f.unit) + '</div></div>' +
      '<div data-k="monthly"><label for="e-day">Day of month</label><input type="number" id="e-day" min="1" max="31" value="' + esc(f.day) + '"></div>' +
      '<div data-k="dates"><label for="e-list">Dates (day month)</label><input type="text" id="e-list" value="' + esc(f.list) + '" placeholder="28 Oct, 28 Feb, 28 Apr, 28 Jul"></div>' +
      '<div data-k="every"><label for="e-offset">Then add business days</label><input type="number" id="e-offset" min="0" value="' + esc(f.offset) + '"></div>' +
      '<div><label for="e-until">Stop after (optional)</label><input type="date" id="e-until" value="' + esc(f.until) + '"></div>' +
      '<div><label for="e-lead">Remind me (days before)</label><input type="number" id="e-lead" min="0" value="' + esc(o.leadDays == null ? 14 : o.leadDays) + '"></div>' +
      '<div><label for="e-shift">Weekend due dates</label>' + sel('e-shift', [['inherit', 'Use the Setup choice'], ['yes', 'Move to Monday'], ['no', 'Keep the date']], sh) + '</div>' +
      '<div class="full"><label for="e-notes">Notes</label><textarea id="e-notes" class="prose" style="min-height:60px">' + esc(o.notes || '') + '</textarea></div>' +
      '<div class="full"><label for="e-link">Link (optional)</label><input type="url" id="e-link" value="' + esc(o.link || '') + '"></div></div>' +
      '<p class="bad small" id="e-err"></p><div class="row"><button class="btn primary small" type="button" data-saveob="' + esc(o.id || 'new') + '">' + (isNew ? 'Add' : 'Save') + '</button><button class="btn small" type="button" data-cancelob="1">Cancel</button></div></div>';
  }
  function syncKind(root) {
    var k = $('#e-kind', root).value;
    B.$$('[data-k]', root).forEach(function (el) { el.hidden = el.dataset.k.split(' ').indexOf(k) < 0; });
  }
  function readForm(root, base) {
    var r = L.formToRule({ kind: $('#e-kind', root).value, date: $('#e-date', root).value, n: $('#e-n', root).value, unit: $('#e-unit', root).value, day: $('#e-day', root).value,
      list: $('#e-list', root).value, offset: $('#e-offset', root).value, until: $('#e-until', root).value, from: base.rule && base.rule.from }, base.rule);
    if (r.error) return r;
    var title = $('#e-title', root).value.trim(); if (!title) return { error: 'Add a title' };
    var sh = $('#e-shift', root).value;
    return { ob: Object.assign({}, base, { title: title, category: $('#e-category', root).value, rule: r.rule, leadDays: Math.max(0, +$('#e-lead', root).value || 0), notes: $('#e-notes', root).value, link: $('#e-link', root).value.trim(), shift: sh === 'inherit' ? null : sh === 'yes' }) };
  }
  function renderObligations() {
    var t = today(), groups = {};
    data.obligations.forEach(function (o) { (groups[o.category] = groups[o.category] || []).push(o); });
    $('#newOb').innerHTML = adding ? '<div class="panel" id="ob-new"><h3 style="margin-top:0">New obligation</h3>' + editForm(adding, true) + '</div>' : '';
    if (adding) syncKind($('#ob-new'));
    if (!data.obligations.length) { $('#obList').innerHTML = '<p class="muted" style="margin-top:14px">No obligations yet. Use Setup, or add your own.</p>'; return; }
    $('#obList').innerHTML = CATS.filter(function (c) { return groups[c]; }).concat(Object.keys(groups).filter(function (c) { return CATS.indexOf(c) < 0; })).map(function (c) {
      return '<h2>' + esc(c) + '</h2>' + groups[c].map(function (o) {
        var n = L.nextFor(o, data.records, t, opts());
        return '<div class="ob-row" id="ob-' + esc(o.id) + '"><h3>' + esc(o.title) + (o.enabled === false ? ' <span class="pill-mute">paused</span>' : '') + (o.source === 'custom' ? ' <span class="pill-mute">custom</span>' : o.edited ? ' <span class="pill-mute">edited</span>' : '') + '</h3>' +
          '<div class="small muted">' + esc(L.describeRule(o.rule)) + ' · remind ' + esc(o.leadDays) + ' days before</div>' +
          '<div class="small">' + (n ? 'Next: <b>' + esc(L.fmtDate(n.due)) + '</b> ' + pill(n.status) + (n.label ? ' · ' + esc(n.label) : '') : '<span class="muted">No upcoming date</span>') + '</div>' +
          (o.notes ? '<p class="small" style="margin:4px 0">' + esc(o.notes) + '</p>' : '') + (o.link ? '<a class="small" href="' + esc(o.link) + '" target="_blank" rel="noopener">More information</a>' : '') +
          '<div class="row" style="margin-top:6px"><button class="btn small" type="button" data-editob="' + esc(o.id) + '">Edit</button><button class="btn small" type="button" data-toggle="' + esc(o.id) + '">' + (o.enabled === false ? 'Resume' : 'Pause') + '</button><button class="btn small" type="button" data-del="' + esc(o.id) + '">Delete</button></div>' +
          (editingId === o.id ? editForm(o, false) : '') + '</div>';
      }).join('');
    }).join('');
    if (editingId && $('#ob-' + editingId + ' .ob-edit')) syncKind($('#ob-' + editingId));
  }
  function onObClick(e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.editob) { editingId = b.dataset.editob; adding = null; renderObligations(); }
    else if (b.dataset.cancelob) { editingId = null; adding = null; renderObligations(); }
    else if (b.dataset.toggle) { var o = ob(b.dataset.toggle); o.enabled = o.enabled === false; save(); renderAllViews(); }
    else if (b.dataset.del) { var d = ob(b.dataset.del); if (d && confirm('Delete "' + d.title + '"? Its done records are kept in backups only.')) { data.obligations = data.obligations.filter(function (x) { return x !== d; }); save(); renderAllViews(); } }
    else if (b.dataset.saveob) {
      var root = b.closest('.ob-edit'), isNew = b.dataset.saveob === 'new', base = isNew ? adding : ob(b.dataset.saveob), r = readForm(root, base);
      if (r.error) { $('#e-err', root).textContent = r.error; return; }
      if (isNew) { r.ob.id = B.uid(); r.ob.source = 'custom'; data.obligations.push(r.ob); adding = null; }
      else { r.ob.edited = r.ob.source === 'auto' ? true : r.ob.edited; data.obligations = data.obligations.map(function (x) { return x.id === r.ob.id ? r.ob : x; }); editingId = null; }
      save(); renderAllViews(); B.toast(isNew ? 'Added' : 'Saved');
    }
  }
  function startCustom(idea) {
    var t = today();
    adding = { title: idea ? idea.title : '', category: idea ? idea.category : 'Other', leadDays: 30, notes: '', source: 'custom',
      rule: idea && idea.months ? { type: 'every', start: L.addMonths(t, 1), months: idea.months } : { type: 'once', date: L.addMonths(t, 1) } };
    editingId = null; renderObligations(); $('#e-title').focus();
  }

  // ---------- setup ----------
  var PF = ['businessName', 'structure', 'lodger', 'startDate', 'gst', 'basCycle', 'paygInstalments', 'employees', 'paygwCycle', 'superMode', 'payFrequency', 'firstPayday', 'workersCompRenewal',
    'incomeTaxDate', 'fbt', 'tpar', 'asicReviewDate', 'businessNameRenewal', 'businessNameTerm', 'publicLiabilityRenewal', 'professionalIndemnityRenewal', 'shiftWeekend'];
  function renderSetup() {
    var p = data.profile;
    PF.forEach(function (k) { var el = $('#s-' + k); if (el.type === 'checkbox') el.checked = !!p[k]; else el.value = p[k] == null ? '' : p[k]; });
    $('#s-agentDates').value = (p.agentBasDates || []).map(function (x) { return x.d + ' ' + L.MONTHS[x.m - 1]; }).join(', ');
    syncSetup();
  }
  function syncSetup() {
    var agent = $('#s-lodger').value === 'agent', emp = $('#s-employees').checked, gst = $('#s-gst').checked;
    $('#agentDatesWrap').hidden = !(agent && gst && $('#s-basCycle').value === 'quarterly');
    $('#s-basCycle').disabled = !gst;
    ['paygwCycle', 'superMode', 'payFrequency', 'firstPayday', 'workersCompRenewal'].forEach(function (k) { $('#s-' + k).disabled = !emp; });
    $('#asicWrap').hidden = $('#s-structure').value !== 'company';
  }
  function readSetup() {
    var p = Object.assign({}, data.profile);
    PF.forEach(function (k) { var el = $('#s-' + k); p[k] = el.type === 'checkbox' ? el.checked : el.value; });
    p.businessNameTerm = +p.businessNameTerm || 3;
    var ad = L.parseDayMonthList($('#s-agentDates').value);
    if (ad.bad.length) { B.toast('Could not read agent dates: ' + ad.bad.join(', '), 4000); return null; }
    if (ad.dates.length) p.agentBasDates = ad.dates.map(function (x, i) { var lbl = L.BAS_QUARTERLY_AGENT[i]; return { m: x.m, d: x.d, label: lbl ? lbl.label : '' }; });
    if (!p.startDate) p.startDate = today();
    return p;
  }
  function applyProfile(p) {
    data.profile = p;
    var gen = L.generate(p), keep = data.obligations.filter(function (o) { return o.source !== 'auto' || o.edited; });
    gen.forEach(function (g) {
      if (keep.some(function (o) { return o.key === g.key && o.source === 'auto'; })) return; // user-edited version wins
      var old = data.obligations.filter(function (o) { return o.key === g.key && o.source === 'auto'; })[0];
      g.id = old ? old.id : B.uid(); if (old && old.enabled === false) g.enabled = false; keep.push(g);
    });
    data.obligations = keep; data.setupDone = true; save();
  }

  // ---------- export ----------
  function fyOptions() {
    var t = today(), cur = L.financialYear(t), prev = L.financialYear(L.addMonths(cur.from, -1)), next = L.financialYear(L.addMonths(cur.to, 1));
    $('#fy').innerHTML = [prev, cur, next].map(function (f) { return '<option value="' + f.from + '"' + (f === cur ? ' selected' : '') + '>' + f.label + ' (Jul–Jun)</option>'; }).join('');
  }
  function planList() { var f = L.financialYear($('#fy').value); return { fy: f, list: all(f.from, f.to) }; }
  function planDoc() {
    var p = planList(), name = data.profile.businessName || 'My business';
    return L.planHtml(p.list, { title: 'Compliance plan ' + p.fy.label + ' — ' + name, subtitle: 'Generated ' + L.fmtDate(today()) + ' with Brahaspati Compliance Calendar' });
  }

  // ---------- sample ----------
  function loadSample() {
    var t = today();
    data = L.normalize({});
    applyProfile(Object.assign(L.defaultProfile(), {
      businessName: 'Harbour Lane Cafe Pty Ltd (made-up)', structure: 'company', gst: true, basCycle: 'quarterly', lodger: 'self', employees: true, superMode: 'payday', payFrequency: 'fortnightly',
      firstPayday: '2026-07-02', workersCompRenewal: '2027-06-30', asicReviewDate: '2025-03-15', businessNameRenewal: '2027-05-01', businessNameTerm: 3,
      publicLiabilityRenewal: '2027-02-01', startDate: L.addMonths(t, -2), shiftWeekend: true
    }));
    var lic = { id: B.uid(), source: 'custom', title: 'Food business licence renewal (council)', category: 'Licences', leadDays: 30, notes: 'Renew online through the council portal.', rule: { type: 'yearly', m: 12, d: 1 } };
    var fire = { id: B.uid(), source: 'custom', title: 'Fire extinguisher inspection', category: 'WHS', leadDays: 14, notes: '', rule: { type: 'every', start: '2026-09-15', months: 6 } };
    var lease = { id: B.uid(), source: 'custom', title: 'Lease option — give notice to renew', category: 'Premises', leadDays: 60, notes: 'Option must be exercised in writing 3–6 months before the lease ends.', rule: { type: 'once', date: '2027-03-31' } };
    data.obligations.push(lic, fire, lease);
    // mark the most recent past BAS done with evidence
    all(L.addMonths(t, -2), t).filter(function (x) { return x.title.indexOf('BAS') === 0; }).forEach(function (x) { data.records[x.key] = { done: true, doneOn: L.addDays(x.due, -3), evidence: 'Lodged online, receipt 7741-2209 (sample)', attachment: 'BAS-receipt.pdf' }; });
    var supers = all(L.addMonths(t, -2), L.addDays(t, -1)).filter(function (x) { return x.title.indexOf('Payday Super') === 0; });
    supers.slice(0, -1).forEach(function (x) { data.records[x.key] = { done: true, doneOn: x.due, evidence: 'Clearing house batch (sample)' }; });
    save(); renderSetup(); renderAllViews(); B.toast('Sample loaded (made-up business)');
  }

  function renderAllViews() { renderUpcoming(); renderCalendar(); renderObligations(); }

  function init() {
    showTab = B.tabs($('.tabs'), function (id) { if (id === 'calendar') renderCalendar(); });
    renderSetup(); fyOptions(); renderAllViews();
    var ideas = $('#idea'); L.CUSTOM_IDEAS.forEach(function (x, i) { ideas.appendChild(B.h('option', { value: String(i), text: x.title })); });
    ideas.addEventListener('change', function () { if (this.value !== '') startCustom(L.CUSTOM_IDEAS[+this.value]); this.value = ''; });
    $('#addCustom').addEventListener('click', function () { startCustom(null); });
    $('#sample').addEventListener('click', function () { if (data.obligations.length && !confirm('Replace your current calendar with the sample?')) return; loadSample(); showTab('upcoming'); });
    $('#goSetup').addEventListener('click', function () { showTab('setup'); });
    $('#view').addEventListener('change', renderUpcoming); $('#catFilter').addEventListener('change', renderUpcoming);
    $('#list').addEventListener('click', onListClick);
    $('#cal').addEventListener('click', function (e) {
      var b = e.target.closest('.ev'); if (!b) return;
      $('#view').value = 'year'; $('#catFilter').value = 'all'; showTab('upcoming'); renderUpcoming();
      var el = document.getElementById('it-' + b.dataset.key.replace(/[^A-Za-z0-9-]/g, '_')); if (el) { el.scrollIntoView({ block: 'center' }); el.style.outline = '2px solid var(--brand)'; setTimeout(function () { el.style.outline = ''; }, 2000); }
    });
    $('#prevM').addEventListener('click', function () { moveMonth(-1); }); $('#nextM').addEventListener('click', function () { moveMonth(1); });
    $('#todayM').addEventListener('click', function () { month = null; renderCalendar(); });
    $('#obList').addEventListener('click', onObClick); $('#newOb').addEventListener('click', onObClick);
    document.addEventListener('change', function (e) { if (e.target.id === 'e-kind') syncKind(e.target.closest('.ob-edit')); });
    $('#setup').addEventListener('change', syncSetup);
    $('#setup').addEventListener('submit', function (e) {
      e.preventDefault(); var p = readSetup(); if (!p) return;
      applyProfile(p); renderSetup(); renderAllViews(); showTab('upcoming'); B.toast('Calendar created — ' + data.obligations.length + ' obligations');
    });
    $('#icsAll').addEventListener('click', function () {
      var t = today(), list = all(t, L.addMonths(t, 12)).filter(function (x) { return !x.done; });
      if (!list.length) return B.toast('Nothing due in the next 12 months');
      B.download('compliance-calendar.ics', L.toICS(list, { name: (data.profile.businessName || 'Business') + ' compliance' }), 'text/calendar;charset=utf-8');
    });
    $('#csv').addEventListener('click', function () {
      var rows = L.toCSVRows(planList().list); if (!rows.length) return B.toast('Nothing to export');
      B.download('compliance-' + planList().fy.label + '.csv', '﻿' + B.csv.stringify(rows, Object.keys(rows[0])), 'text/csv;charset=utf-8');
    });
    $('#planHtml').addEventListener('click', function () { B.download('compliance-plan-' + planList().fy.label + '.html', planDoc(), 'text/html;charset=utf-8'); });
    $('#planPrint').addEventListener('click', function () {
      var f = B.h('iframe', { title: 'Print', style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0' });
      f.addEventListener('load', function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (err) { B.toast('Printing was blocked. Use Download HTML instead.'); } setTimeout(function () { f.remove(); }, 60000); });
      f.srcdoc = planDoc(); document.body.appendChild(f);
    });
    $('#exportJson').addEventListener('click', function () { B.download('compliance-calendar-backup.json', JSON.stringify({ app: 'compliance-calendar', version: 1, data: data }, null, 2), 'application/json'); });
    $('#importJson').addEventListener('change', function () {
      var f = this.files[0]; this.value = ''; if (!f) return;
      B.readFile(f).then(function (t) {
        var j = JSON.parse(t); if (!j || j.app !== 'compliance-calendar' || !j.data) throw new Error('not a Compliance Calendar backup');
        data = L.normalize(j.data); save(); renderSetup(); renderAllViews(); B.toast('Backup imported');
      }).catch(function (e) { B.toast('Could not import: ' + e.message, 4000); });
    });
    $('#clearAll').addEventListener('click', function () { if (!confirm('Delete every obligation and record in this browser?')) return; B.store.remove(KEY); data = L.normalize({}); renderSetup(); renderAllViews(); });
  }
  init();
})();
