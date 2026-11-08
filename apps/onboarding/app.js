/* Employee Onboarding — page wiring. Logic lives in lib.js (OnboardLib). */
(function () {
  'use strict';
  var L = window.OnboardLib, $ = B.$, esc = B.esc;
  var KEY = 'onboarding:data';
  var st = load(), showTab;

  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function defaults() { return { people: [], company: { name: '', startTime: '', address: '', bring: '', welcome: '', contacts: '' }, selected: '' }; }
  function load() { var d = B.store.get(KEY, null) || {}; var o = defaults(); o.people = d.people || []; o.company = Object.assign(o.company, d.company || {}); o.selected = d.selected || ''; return o; }
  function save() { if (!B.store.set(KEY, st)) B.toast('Could not save — browser storage may be full. Download a backup.', 4000); }
  function person(id) { return st.people.filter(function (p) { return p.id === id; })[0]; }
  function current() { return person(st.selected) || st.people[0]; }
  function stat(v, k, cls) { return '<div class="stat"><div class="v ' + (cls || '') + '">' + esc(v) + '</div><div class="k">' + esc(k) + '</div></div>'; }
  function bar(pct) { return '<div class="prog" title="' + pct + '%"><i style="width:' + pct + '%"></i></div>'; }
  function d(s) { return s ? esc(L.niceDate(s).replace(/^\w+, /, '')) : ''; }
  var TSTATUS = { 'not done': 'pill-mute', complete: 'pill-ok', valid: 'pill-ok', expiring: 'pill-warn', expired: 'pill-bad' };
  function csv(name, rows) { if (!rows.length) return B.toast('Nothing to export'); B.download(name, '﻿' + B.csv.stringify(rows, Object.keys(rows[0])), 'text/csv;charset=utf-8'); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'starter'; }
  // Don't let TFNs, bank details etc. into browser storage.
  function guard(text) {
    var s = L.sensitive(text); if (!s.length) return true;
    return confirm('This looks like it contains ' + s.join(' and ') + '.\n\nDon’t store sensitive personal data in a browser — keep it in your payroll system. Save anyway?');
  }

  // ---------- people list ----------
  function renderPeople() {
    var t = today(), all = st.people, over = L.overdueTasks(all, t), soon = L.dueSoon(all, t, 7), refr = L.refreshers(all, t, 60);
    var active = all.filter(function (p) { var g = L.progress(p, t); return g.phase !== 'done'; }).length;
    $('#peopleStats').innerHTML = all.length ? stat(all.length, 'New starters') + stat(active, 'Still onboarding') + stat(over.length, 'Overdue tasks', over.length ? 'bad' : 'ok') + stat(soon.length, 'Due in 7 days') + stat(refr.length, 'Training to renew', refr.length ? 'warn' : '') : '';
    var el = $('#peopleList');
    if (!all.length) { el.innerHTML = '<p class="muted">No new starters yet. Add one above or load the sample data.</p>'; return; }
    var rows = all.slice().sort(function (a, b) { return a.start < b.start ? 1 : -1; }).map(function (p) { var g = L.progress(p, t); return { p: p, g: g }; });
    el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Start</th><th>Stage</th><th>Progress</th><th>Overdue</th><th class="no-print">Actions</th></tr></thead><tbody>' + rows.map(function (r) {
      var p = r.p, g = r.g;
      return '<tr><td><b>' + esc(p.name) + '</b><br><span class="small muted">' + esc(p.position || L.TEMPLATES[p.role].name) + '</span></td><td>' + d(p.start) + '</td>' +
        '<td>' + (g.phase === 'done' ? '<span class="pill-ok">Complete period</span>' : esc(L.phaseName(g.phase))) + (g.day != null && g.day >= 0 && g.phase !== 'done' ? '<br><span class="small muted">day ' + (g.day + 1) + '</span>' : '') + '</td>' +
        '<td>' + bar(g.pct) + '<span class="small muted">' + g.pct + '% · ' + g.tasksDone + '/' + g.tasks + ' tasks · ' + g.docsIn + '/' + g.docs + ' docs</span></td>' +
        '<td>' + (g.overdue ? '<span class="pill-bad">' + g.overdue + '</span>' : '<span class="pill-ok">0</span>') + '</td>' +
        '<td class="no-print"><div class="row"><button class="btn small" type="button" data-open="' + p.id + '">Open</button><button class="btn small" type="button" data-pack="' + p.id + '">Welcome pack</button>' +
        '<button class="btn small" type="button" data-ics="' + p.id + '">.ics</button><button class="btn small" type="button" data-delp="' + p.id + '">Delete</button></div></td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  // ---------- one person's checklist ----------
  function renderPick() {
    var sel = $('#pick'), cur = current();
    sel.innerHTML = st.people.map(function (p) { return '<option value="' + p.id + '"' + (cur && cur.id === p.id ? ' selected' : '') + '>' + esc(p.name) + ' — ' + d(p.start) + '</option>'; }).join('') || '<option>No new starters yet</option>';
  }
  function ownerSelect(t) { return '<select aria-label="Owner" data-tf="owner">' + L.OWNERS.map(function (o) { return '<option' + (o === t.owner ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>'; }
  function renderPerson() {
    var p = current(), el = $('#personOut'); renderPick();
    if (!p) { el.innerHTML = '<p class="muted">Add a new starter first.</p>'; return; }
    var t = today(), g = L.progress(p, t);
    var h = '<div class="panel"><div class="ph-head"><h3 style="margin-top:0">' + esc(p.name) + (p.position ? ' · ' + esc(p.position) : '') + '</h3><span class="small muted">' + esc(L.TEMPLATES[p.role].name) + ' template · ' + esc(p.type) + '</span></div>' +
      '<div class="form-grid" data-pf="1"><div><label for="p-name">Name</label><input type="text" id="p-name" data-pf="name" value="' + esc(p.name) + '"></div>' +
      '<div><label for="p-position">Position</label><input type="text" id="p-position" data-pf="position" value="' + esc(p.position) + '"></div>' +
      '<div><label for="p-start">Start date (moves all due dates)</label><input type="date" id="p-start" data-pf="start" value="' + esc(p.start) + '"></div>' +
      '<div><label for="p-manager">Manager / buddy</label><input type="text" id="p-manager" data-pf="manager" value="' + esc(p.manager) + '"></div>' +
      '<div><label for="p-prob">Probation (months)</label><input type="number" min="0" max="12" id="p-prob" data-pf="probationMonths" value="' + esc(p.probationMonths) + '"></div></div>' +
      '<div style="margin-top:12px">' + bar(g.pct) + '<p class="small muted">' + g.pct + '% complete · ' + g.tasksDone + '/' + g.tasks + ' tasks · ' + g.docsIn + '/' + g.docs + ' documents · ' + g.trainingDone + '/' + g.training + ' training' + (g.overdue ? ' · <span class="bad">' + g.overdue + ' overdue</span>' : '') + '</p></div>' +
      '<div class="row no-print"><button class="btn small" type="button" data-pack="' + p.id + '">Print welcome pack</button><button class="btn small" type="button" data-packdl="' + p.id + '">Download welcome pack (HTML)</button><button class="btn small" type="button" data-ics="' + p.id + '">Key dates (.ics)</button></div></div>';

    // tasks by phase
    h += '<div class="panel"><h3 style="margin-top:0">Tasks</h3>';
    L.PHASES.forEach(function (ph) {
      var ts = p.tasks.filter(function (x) { return x.phase === ph.id; }).sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; }); if (!ts.length) return;
      h += '<h3>' + esc(ph.name) + ' <span class="small muted">' + ts.filter(function (x) { return x.done; }).length + '/' + ts.length + '</span></h3>' + ts.map(function (x) {
        var late = !x.done && x.due < t;
        return '<div class="task' + (x.done ? ' done' : '') + '" data-t="' + x.id + '"><input type="checkbox" aria-label="Done" data-tf="done"' + (x.done ? ' checked' : '') + '>' +
          '<span class="t-title">' + esc(x.title) + (x.key ? ' <span class="pill-mute">key date</span>' : '') + (late ? ' <span class="pill-bad">overdue</span>' : '') + '</span>' +
          ownerSelect(x) + '<input type="date" aria-label="Due date" data-tf="due" value="' + esc(x.due) + '"><button class="btn small" type="button" data-tdel="' + x.id + '" aria-label="Remove task">✕</button></div>';
      }).join('');
    });
    h += '<form class="form-grid" id="addTask" style="margin-top:12px"><div class="full"><label for="nt-title">Add a task</label><input type="text" id="nt-title" required></div>' +
      '<div><label for="nt-phase">Phase</label><select id="nt-phase">' + L.PHASES.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="nt-owner">Owner</label><select id="nt-owner">' + L.OWNERS.map(function (o) { return '<option>' + o + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="nt-due">Due</label><input type="date" id="nt-due" value="' + esc(p.start) + '"></div>' +
      '<div><label>&nbsp;</label><button class="btn" type="submit">Add task</button></div></form></div>';

    // documents
    h += '<div class="panel warnbox"><h3 style="margin-top:0">Documents</h3><p class="small muted">General guidance for Australian employers, not legal advice — check <a href="https://www.fairwork.gov.au/" rel="noopener">Fair Work</a> and the <a href="https://www.ato.gov.au/" rel="noopener">ATO</a> for your situation. Only tick that a form was received: <b>don’t record TFNs, bank or ID numbers here.</b></p>' +
      '<div class="table-wrap"><table><thead><tr><th>Done</th><th>Document</th><th>When</th><th>Date</th></tr></thead><tbody>' + p.docs.map(function (x) {
        return '<tr data-d="' + x.id + '"><td><input type="checkbox" aria-label="Received" data-df="received"' + (x.received ? ' checked' : '') + '></td><td>' + esc(x.name) + (x.optional ? ' <span class="pill-mute">if needed</span>' : '') + '<br><span class="small muted">' + (x.who === 'give' ? 'You give this to them' : 'You collect this from them') + '</span></td><td class="small">' + esc(x.when) + '</td>' +
          '<td><input type="date" aria-label="Date" data-df="date" value="' + esc(x.date) + '"></td></tr>';
      }).join('') + '</tbody></table></div></div>';

    // training
    h += '<div class="panel"><h3 style="margin-top:0">Training</h3><div class="table-wrap"><table><thead><tr><th>Module</th><th>Completed on</th><th>Valid for (months)</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody>' + p.training.map(function (m) {
      var s = L.trainingStatus(m, t);
      return '<tr data-m="' + m.id + '"><td><input type="text" aria-label="Module" data-mf="name" value="' + esc(m.name) + '"></td><td><input type="date" aria-label="Completed" data-mf="completed" value="' + esc(m.completed) + '"></td>' +
        '<td><input type="number" min="0" aria-label="Valid for months" data-mf="validMonths" value="' + esc(m.validMonths == null ? '' : m.validMonths) + '" placeholder="no expiry"></td><td>' + d(L.trainingExpiry(m)) + '</td>' +
        '<td><span class="' + TSTATUS[s] + '">' + esc(s) + '</span></td><td><button class="btn small" type="button" data-mdel="' + m.id + '" aria-label="Remove module">✕</button></td></tr>';
    }).join('') + '</tbody></table></div><div class="row" style="margin-top:8px"><button class="btn small" type="button" id="addModule">Add training module</button></div></div>';

    // equipment
    h += '<div class="panel"><h3 style="margin-top:0">Equipment issued</h3><div class="table-wrap"><table><thead><tr><th>Issued</th><th>Item</th><th>Asset tag / serial</th><th>Date</th><th>Returned</th><th></th></tr></thead><tbody>' + p.equipment.map(function (e) {
      return '<tr data-e="' + e.id + '"><td><input type="checkbox" aria-label="Issued" data-ef="issued"' + (e.issued ? ' checked' : '') + '></td><td><input type="text" aria-label="Item" data-ef="item" value="' + esc(e.item) + '"></td>' +
        '<td><input type="text" aria-label="Asset tag" data-ef="serial" value="' + esc(e.serial) + '"></td><td><input type="date" aria-label="Date issued" data-ef="date" value="' + esc(e.date) + '"></td>' +
        '<td><input type="checkbox" aria-label="Returned" data-ef="returned"' + (e.returned ? ' checked' : '') + '></td><td><button class="btn small" type="button" data-edel="' + e.id + '" aria-label="Remove item">✕</button></td></tr>';
    }).join('') + '</tbody></table></div><div class="row" style="margin-top:8px"><button class="btn small" type="button" id="addEquip">Add item</button></div></div>';

    h += '<div class="panel"><label for="p-notes" style="margin-top:0">Notes (no tax file, bank or ID numbers)</label><textarea id="p-notes" class="prose" data-pf="notes" style="min-height:80px">' + esc(p.notes || '') + '</textarea></div>';
    el.innerHTML = h;
  }

  // ---------- overdue / due soon ----------
  function renderDue() {
    var t = today(), own = $('#ownerFilter').value, days = Math.max(1, +$('#soonDays').value || 7);
    var f = function (x) { return !own || x.owner === own; };
    var over = L.overdueTasks(st.people, t).filter(f), soon = L.dueSoon(st.people, t, days).filter(f);
    function list(items, late) {
      if (!items.length) return '<p class="muted">' + (late ? 'Nothing overdue. ' : 'Nothing due in that time.') + '</p>';
      return '<div class="table-wrap"><table><thead><tr><th>Done</th><th>Person</th><th>Task</th><th>Owner</th><th>Due</th></tr></thead><tbody>' + items.map(function (x) {
        return '<tr><td><input type="checkbox" aria-label="Mark done" data-quick="' + x.personId + '|' + x.taskId + '"></td><td>' + esc(x.person) + '</td><td>' + esc(x.title) + '</td><td>' + esc(x.owner) + '</td><td>' + d(x.due) + (late ? ' <span class="pill-bad">' + x.daysLate + ' day' + (x.daysLate > 1 ? 's' : '') + ' late</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    }
    $('#dueOut').innerHTML = '<h3>Overdue (' + over.length + ')</h3>' + list(over, true) + '<h3>Due in the next ' + days + ' days (' + soon.length + ')</h3>' + list(soon, false);
  }

  // ---------- training register ----------
  function renderTraining() {
    var t = today(), r = L.refreshers(st.people, t, 60), rows = L.trainingRows(st.people, t);
    $('#trainingOut').innerHTML = '<h3>Needs renewing</h3>' + (r.length ? B.table(r, [{ key: 'person', label: 'Person' }, { key: 'module', label: 'Training' }, { key: 'expiry', label: 'Expires', fmt: function (x) { return d(x); } },
      { key: 'status', label: 'Status', fmt: function (x, row) { return '<span class="' + TSTATUS[x] + '">' + (x === 'expired' ? 'expired ' + Math.abs(row.days) + ' days ago' : 'in ' + row.days + ' days') + '</span>'; } }]) : '<p class="muted">Nothing expires in the next 60 days.</p>') +
      '<h3>Register</h3>' + (rows.length ? B.table(rows, [{ key: 'Person', label: 'Person' }, { key: 'Module', label: 'Training' }, { key: 'Completed', label: 'Completed', fmt: function (x) { return x ? d(x) : '<span class="muted">–</span>'; } },
        { key: 'Expires', label: 'Expires', fmt: function (x) { return x ? d(x) : '<span class="muted">–</span>'; } }, { key: 'Status', label: 'Status', fmt: function (x) { return '<span class="' + TSTATUS[x] + '">' + esc(x) + '</span>'; } }]) : '<p class="muted">No training recorded yet.</p>');
  }

  // ---------- templates ----------
  function renderTemplates() {
    var id = $('#tplPick').value || 'office', t = L.TEMPLATES[id], tasks = L.templateTasks(id);
    $('#tplOut').innerHTML = L.PHASES.map(function (ph) {
      var ts = tasks.filter(function (x) { return x.phase === ph.id; }); if (!ts.length) return '';
      return '<h3>' + esc(ph.name) + '</h3><ul>' + ts.map(function (x) { return '<li>' + esc(x.title) + ' <span class="small muted">— ' + esc(x.owner) + ', ' + (x.offset < 0 ? Math.abs(x.offset) + ' days before start' : x.offset === 0 ? 'day 1' : 'day ' + (x.offset + 1)) + '</span></li>'; }).join('') + '</ul>';
    }).join('') + '<h3>Training</h3><ul>' + t.training.map(function (m) { return '<li>' + esc(m[0]) + (m[1] ? ' <span class="small muted">(renew every ' + m[1] + ' months)</span>' : '') + '</li>'; }).join('') + '</ul>' +
      '<h3>Equipment</h3><ul>' + t.equipment.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' +
      '<p class="small muted">Refresher periods are common practice, not legal requirements — set them to match your industry, licence or insurer.</p>';
  }

  // ---------- welcome pack ----------
  function packDoc(p) {
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Welcome pack — ' + esc(p.name) + '</title><style>body{font:15px/1.55 system-ui,sans-serif;color:#111;max-width:760px;margin:24px auto;padding:0 16px}h1{font-size:26px}h2{font-size:18px;margin-top:22px;border-bottom:1px solid #ddd;padding-bottom:4px}h3{font-size:15px}small{color:#555}</style></head><body>' + L.welcomePack(p, st.company) + '</body></html>';
  }
  function printHTML(html) {
    var f = B.h('iframe', { title: 'Print preview', style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0' });
    f.addEventListener('load', function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { B.toast('Printing was blocked. Use Download instead.'); } setTimeout(function () { f.remove(); }, 60000); });
    f.srcdoc = html; document.body.appendChild(f);
  }

  function renderAll() { renderPeople(); renderPerson(); renderDue(); renderTraining(); }

  // ---------- sample ----------
  function loadSample() {
    if (st.people.length && !confirm('Replace your current data with the sample?')) return;
    var t = today();
    st = defaults();
    st.company = { name: 'Riverbend Supplies', startTime: '8:30am', address: '14 Wharf Rd, Riverbend — use the side door next to reception', bring: 'Photo ID, lunch, enclosed shoes', welcome: 'Welcome aboard! We’re a small team, so you’ll get to know everyone quickly.', contacts: 'Priya (office manager) — priya@example.com\nMarco (warehouse lead) — 0400 000 000' };
    var a = L.newPerson({ name: 'Jess Nguyen', position: 'Warehouse storeperson', role: 'warehouse', type: 'casual', start: L.addDays(t, -10), manager: 'Marco', probationMonths: 3 });
    var b = L.newPerson({ name: 'Liam O’Connor', position: 'Accounts officer', role: 'office', type: 'full-time', start: L.addDays(t, 5), manager: 'Priya', probationMonths: 6 });
    var c = L.newPerson({ name: 'Aisha Rahman', position: 'Customer support (remote)', role: 'remote', type: 'part-time', start: L.addDays(t, -50), manager: 'Priya', probationMonths: 3 });
    a.tasks.forEach(function (x, i) { if (x.due < t && i % 3) { x.done = true; x.doneDate = x.due; } });
    a.docs.forEach(function (x) { if (/contract|fwis|casual|tfn|emergency/.test(x.id)) { x.received = true; x.date = a.start; } });
    a.training[0].completed = a.start; a.training[1].completed = L.addDays(t, -720); a.training[4].completed = L.addDays(t, -1080); a.training[5].completed = L.addDays(t, -350);
    a.equipment.slice(0, 3).forEach(function (e) { e.issued = true; e.date = a.start; });
    b.tasks.forEach(function (x) { if (x.due < t) { x.done = true; x.doneDate = x.due; } });
    b.docs.forEach(function (x) { if (/contract|fwis/.test(x.id)) { x.received = true; x.date = L.addDays(t, -3); } });
    c.tasks.forEach(function (x) { if (x.due < L.addDays(t, -5)) { x.done = true; x.doneDate = x.due; } });
    c.docs.forEach(function (x) { if (!x.optional) { x.received = true; x.date = c.start; } });
    c.training.forEach(function (m, i) { if (i < 3) m.completed = L.addDays(c.start, 3); });
    c.equipment.forEach(function (e, i) { e.issued = i < 4; e.date = i < 4 ? L.addDays(c.start, -3) : ''; e.serial = i === 0 ? 'LT-0042' : ''; });
    st.people = [a, b, c]; st.selected = a.id;
    save(); syncCompany(); renderAll(); B.toast('Sample loaded — made-up people');
  }

  function syncCompany() { Object.keys(st.company).forEach(function (k) { var el = $('#co-' + k); if (el) el.value = st.company[k] || ''; }); }

  // ---------- events ----------
  $('#a-role').innerHTML = Object.keys(L.TEMPLATES).map(function (k) { return '<option value="' + k + '">' + esc(L.TEMPLATES[k].name) + '</option>'; }).join('');
  $('#tplPick').innerHTML = $('#a-role').innerHTML;
  $('#ownerFilter').innerHTML += L.OWNERS.map(function (o) { return '<option>' + o + '</option>'; }).join('');
  $('#a-start').value = L.addDays(today(), 7);
  $('#addForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var p = L.newPerson({ name: $('#a-name').value.trim(), position: $('#a-position').value.trim(), role: $('#a-role').value, type: $('#a-type').value, start: $('#a-start').value, manager: $('#a-manager').value.trim(), probationMonths: Math.max(0, +$('#a-prob').value || 0) });
    if (!guard(p.name + ' ' + p.position + ' ' + p.manager)) return;
    st.people.push(p); st.selected = p.id; save(); e.target.reset(); $('#a-start').value = L.addDays(today(), 7); $('#a-prob').value = 3;
    renderAll(); showTab('person'); B.toast('Checklist built for ' + p.name);
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var ds = b.dataset;
    if (ds.open) { st.selected = ds.open; save(); renderPerson(); showTab('person'); }
    else if (ds.pack) printHTML(packDoc(person(ds.pack)));
    else if (ds.packdl) { var pp = person(ds.packdl); B.download('welcome-pack-' + slug(pp.name) + '.html', packDoc(pp), 'text/html;charset=utf-8'); }
    else if (ds.ics) { var pi = person(ds.ics); B.download('onboarding-' + slug(pi.name) + '.ics', L.toICS(pi), 'text/calendar;charset=utf-8'); }
    else if (ds.delp) { var pd = person(ds.delp); if (pd && confirm('Delete ' + pd.name + ' and their checklist?')) { st.people = st.people.filter(function (x) { return x.id !== pd.id; }); save(); renderAll(); } }
  });
  $('#pick').addEventListener('change', function (e) { st.selected = e.target.value; save(); renderPerson(); });
  var PO = $('#personOut');
  PO.addEventListener('change', function (e) {
    var p = current(); if (!p) return; var el = e.target, ds = el.dataset, row;
    if (ds.pf) {
      if (ds.pf === 'start') { if (!el.value) return; L.reschedule(p, el.value); }
      else if (ds.pf === 'probationMonths') p.probationMonths = Math.max(0, +el.value || 0);
      else { if (!guard(el.value)) { el.value = p[ds.pf] || ''; return; } p[ds.pf] = el.value; }
    } else if (ds.tf && (row = el.closest('[data-t]'))) {
      var t = p.tasks.filter(function (x) { return x.id === row.dataset.t; })[0];
      if (ds.tf === 'done') { t.done = el.checked; t.doneDate = el.checked ? today() : ''; } else if (ds.tf === 'due') { t.due = el.value; t.offset = null; } else t[ds.tf] = el.value;
    } else if (ds.df && (row = el.closest('[data-d]'))) {
      var dd = p.docs.filter(function (x) { return x.id === row.dataset.d; })[0];
      if (ds.df === 'received') { dd.received = el.checked; if (el.checked && !dd.date) dd.date = today(); } else dd.date = el.value;
    } else if (ds.mf && (row = el.closest('[data-m]'))) {
      var m = p.training.filter(function (x) { return x.id === row.dataset.m; })[0];
      m[ds.mf] = ds.mf === 'validMonths' ? (el.value === '' ? null : Math.max(0, +el.value)) : el.value;
    } else if (ds.ef && (row = el.closest('[data-e]'))) {
      var q = p.equipment.filter(function (x) { return x.id === row.dataset.e; })[0];
      q[ds.ef] = el.type === 'checkbox' ? el.checked : el.value; if (ds.ef === 'issued' && el.checked && !q.date) q.date = today();
    } else return;
    save(); renderAll();
  });
  PO.addEventListener('click', function (e) {
    var p = current(); if (!p) return; var ds = e.target.dataset;
    if (ds.tdel) p.tasks = p.tasks.filter(function (x) { return x.id !== ds.tdel; });
    else if (ds.mdel) p.training = p.training.filter(function (x) { return x.id !== ds.mdel; });
    else if (ds.edel) p.equipment = p.equipment.filter(function (x) { return x.id !== ds.edel; });
    else if (e.target.id === 'addModule') p.training.push({ id: B.uid(), name: 'New training module', validMonths: null, completed: '', required: true });
    else if (e.target.id === 'addEquip') p.equipment.push({ id: B.uid(), item: 'New item', issued: false, serial: '', date: '', returned: false });
    else return;
    save(); renderAll();
  });
  PO.addEventListener('submit', function (e) {
    if (e.target.id !== 'addTask') return; e.preventDefault();
    var p = current(), title = $('#nt-title').value.trim(); if (!title || !guard(title)) return;
    p.tasks.push({ id: B.uid(), phase: $('#nt-phase').value, owner: $('#nt-owner').value, offset: null, title: title, key: false, due: $('#nt-due').value || p.start, done: false, doneDate: '' });
    save(); renderAll();
  });
  $('#dueOut').addEventListener('change', function (e) {
    var q = e.target.dataset.quick; if (!q) return; var ids = q.split('|'), p = person(ids[0]);
    var t = p && p.tasks.filter(function (x) { return x.id === ids[1]; })[0]; if (!t) return;
    t.done = true; t.doneDate = today(); save(); renderAll(); B.toast('Marked done');
  });
  $('#ownerFilter').addEventListener('change', renderDue);
  $('#soonDays').addEventListener('change', renderDue);
  $('#tplPick').addEventListener('change', renderTemplates);
  $('#csvTasks').addEventListener('click', function () { csv('onboarding-tasks.csv', L.taskRows(st.people, today())); });
  $('#csvSummary').addEventListener('click', function () { csv('onboarding-progress.csv', L.summaryRows(st.people, today())); });
  $('#csvTraining').addEventListener('click', function () { csv('training-register.csv', L.trainingRows(st.people, today())); });
  $('#icsAll').addEventListener('click', function () { if (!st.people.length) return B.toast('Nothing to export'); B.download('onboarding-key-dates.ics', L.toICS(st.people), 'text/calendar;charset=utf-8'); });
  $('#icsTraining').addEventListener('click', function () {
    var only = st.people.map(function (p) { return Object.assign({}, p, { tasks: [], probationMonths: 0, start: '' }); });
    var ics = L.toICS(only); if (!/BEGIN:VEVENT/.test(ics)) return B.toast('No training with an expiry date yet');
    B.download('training-expiry-reminders.ics', ics, 'text/calendar;charset=utf-8');
  });
  $('#coForm').addEventListener('submit', function (e) {
    e.preventDefault(); var all = '';
    Object.keys(st.company).forEach(function (k) { var el = $('#co-' + k); if (el) { st.company[k] = el.value.trim(); all += ' ' + el.value; } });
    if (!guard(all)) return; save(); B.toast('Saved');
  });
  $('#sample').addEventListener('click', loadSample);
  $('#backup').addEventListener('click', function () { B.download('onboarding-backup.json', JSON.stringify({ app: 'onboarding', version: 1, data: st }, null, 2), 'application/json'); });
  $('#restore').addEventListener('click', function () {
    var inp = B.h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', function () {
      if (!inp.files[0]) return;
      B.readFile(inp.files[0]).then(function (t) {
        var j = JSON.parse(t), dd = j.data || j; if (!Array.isArray(dd.people)) throw new Error('bad');
        st = defaults(); st.people = dd.people; Object.assign(st.company, dd.company || {}); st.selected = dd.selected || '';
        save(); syncCompany(); renderAll(); B.toast('Backup restored');
      }).catch(function () { B.toast('That file is not an Employee Onboarding backup'); });
    });
    inp.click();
  });
  $('#wipe').addEventListener('click', function () { if (!confirm('Delete every new starter and setting in this tool?')) return; st = defaults(); save(); syncCompany(); renderAll(); });

  if (B.ai) {
    B.ai.note($('#aiNote'));
    B.ai.button($('#coActions'), 'Write a welcome message', function () {
      return 'Write a warm, short welcome message (60–90 words, Australian spelling, plain English) for new starters joining a small business' + ($('#co-name').value ? ' called ' + $('#co-name').value : '') + '. No placeholders, no names, no promises about pay or conditions.';
    }, function (ans) { $('#co-welcome').value = ans.trim(); B.toast('Check the message, then Save'); });
  }

  syncCompany();
  showTab = B.tabs(B.$('.tabs'));
  renderAll(); renderTemplates();
})();
