/* Life Admin Vault — page wiring. Logic in lib.js (LifeAdminLib); photos in IndexedDB via vault-kit.js. */
(function () {
  'use strict';
  var L = window.LifeAdminLib, K = window.VaultKit, $ = B.$, esc = B.esc;
  var KEY = 'lifeadmin:data', db = K.db('life-admin');
  var data = load(), editing = null, newMedia = [], editPerson = null, showTab, drawStorage;

  function load() { var d = B.store.get(KEY, null) || {}; return { people: d.people || [], docs: (d.docs || []).map(L.normaliseDoc) }; }
  function save() { if (!B.store.set(KEY, data)) B.toast('Could not save — browser storage may be full. Download a backup.', 4000); }
  function today() { return K.today(); }
  function stat(v, k, cls) { return '<div class="stat"><div class="v ' + (cls || '') + '">' + esc(v) + '</div><div class="k">' + esc(k) + '</div></div>'; }
  var PILL = { expired: ['pill-bad', 'Expired'], renew: ['pill-bad', 'Renew now'], soon: ['pill-warn', 'Renew soon'], ok: ['pill-ok', 'OK'], none: ['pill-mute', 'No expiry'] };
  function pill(s) { var p = PILL[s.state]; return '<span class="' + p[0] + '">' + p[1] + '</span>'; }
  function when(s) {
    if (s.state === 'none') return '';
    if (s.daysToExpiry < 0) return 'expired ' + -s.daysToExpiry + ' days ago';
    return 'expires in ' + s.daysToExpiry + ' days' + (s.daysToRenew > 0 ? ' · start renewing by ' + K.niceDate(s.renewBy) : s.daysToExpiry >= 0 ? ' · renewal window open' : '');
  }
  function who(id) { return L.personName(data.people, id); }
  function fillImgs(scope) { B.$$('img[data-mid]', scope).forEach(function (img) { db.url(img.dataset.mid).then(function (u) { if (u) img.src = u; }).catch(function () {}); }); }

  // ---------- overview ----------
  function renderOverview() {
    var t = today(), up = L.upcoming(data.docs, t, 90);
    var c = function (st) { return data.docs.filter(function (d) { return L.status(d, t).state === st; }).length; };
    $('#stats').innerHTML = stat(String(data.docs.length), 'Documents') + stat(String(data.people.length), 'People') + stat(String(c('expired')), 'Expired', c('expired') ? 'bad' : 'ok') +
      stat(String(c('renew')), 'Renew now', c('renew') ? 'bad' : 'ok') + stat(String(up.length), 'Need action in 90 days', up.length ? 'warn' : 'ok');
    if (!data.docs.length) { $('#upcoming').innerHTML = '<p>Nothing yet. Add your family on the <b>People</b> tab, then add documents — or press <b>Load sample data</b>.</p>'; return; }
    $('#upcoming').innerHTML = up.length ? up.map(function (x) {
      return '<div class="up-row"><div><b>' + esc(L.docTitle(x.doc)) + '</b> <span class="muted">· ' + esc(who(x.doc.personId)) + '</span><br>' + pill(x.s) +
        ' <span class="small">Expires ' + K.niceDate(x.doc.expiryDate) + ' — ' + esc(when(x.s)) + '</span></div>' +
        '<button class="btn small" type="button" data-edit="' + esc(x.doc.id) + '">Open</button></div>';
    }).join('') : '<p class="ok">Nothing expires or needs renewing in the next 90 days.</p>';
  }

  // ---------- documents ----------
  function renderDocs() {
    var f = $('#fPerson').value, t = today();
    $('#fPerson').innerHTML = '<option value="*">Everyone</option><option value="">Household (shared)</option>' + data.people.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('');
    $('#fPerson').value = f && (f === '*' || f === '' || data.people.some(function (p) { return p.id === f; })) ? f : '*';
    f = $('#fPerson').value;
    var list = data.docs.filter(function (d) { return f === '*' || d.personId === f; }).sort(function (a, b) { return (a.expiryDate || '9999') < (b.expiryDate || '9999') ? -1 : 1; });
    $('#docList').innerHTML = list.length ? '<div class="grid">' + list.map(function (d) {
      var s = L.status(d, t);
      return '<div class="card doc"><h3>' + esc(L.docTitle(d)) + '</h3><p class="small muted">' + esc(who(d.personId)) + ' · ' + esc(L.type(d.type).name) + '</p>' +
        '<p>' + pill(s) + ' ' + (d.expiryDate ? '<span class="small">Expires ' + K.niceDate(d.expiryDate) + '</span>' : '') + '</p>' +
        (s.state !== 'none' ? '<p class="small muted">' + esc(when(s)) + '</p>' : '') +
        (L.masked(d) ? '<p class="small">No. ' + esc(L.masked(d)) + (d.fullNumber ? ' <span class="pill-warn">full number stored</span>' : '') + '</p>' : '') +
        (d.conditions ? '<p class="small"><b>Conditions:</b> ' + esc(d.conditions) + '</p>' : '') +
        (d.attachments.length ? '<p class="small">' + d.attachments.length + ' attachment(s)</p>' : '') +
        '<div class="row" style="margin-top:8px"><button class="btn small" type="button" data-edit="' + esc(d.id) + '">Open / edit</button><button class="btn small" type="button" data-del="' + esc(d.id) + '">Delete</button></div></div>';
    }).join('') + '</div>' : '<p class="muted">No documents here yet. <button class="btn small" type="button" data-new="1">Add a document</button></p>';
  }

  function startEdit(id) {
    var d = id ? data.docs.filter(function (x) { return x.id === id; })[0] : null;
    var f = $('#fPerson').value;
    editing = d ? JSON.parse(JSON.stringify(d)) : L.normaliseDoc({ id: B.uid(), type: 'passport', personId: f && f !== '*' ? f : (data.people[0] ? data.people[0].id : '') });
    editing._new = !d; newMedia = [];
    showTab('docs'); renderEditor(); $('#editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderEditor() {
    var e = editing, ed = $('#editor');
    if (!e) { ed.hidden = true; ed.innerHTML = ''; return; }
    ed.hidden = false;
    var inp = function (id, label, val, type, attrs, full) { return '<div' + (full ? ' class="full"' : '') + '><label for="' + id + '">' + label + '</label><input type="' + (type || 'text') + '" id="' + id + '" value="' + esc(val) + '" ' + (attrs || '') + '></div>'; };
    ed.innerHTML = '<h2 style="margin-top:0">' + (e._new ? 'Add a document' : 'Edit document') + '</h2><div class="form-grid">' +
      '<div><label for="d-person">Whose is it?</label><select id="d-person"><option value="">Household (shared)</option>' + data.people.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === e.personId ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="d-type">Type</label><select id="d-type">' + L.TYPES.map(function (t) { return '<option value="' + t.key + '"' + (t.key === e.type ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select></div>' +
      inp('d-label', 'Name on this list', e.label, 'text', 'placeholder="e.g. NSW driver licence"') + inp('d-issuer', 'Issued by', e.issuer) +
      '<div class="full panel notice" style="margin:12px 0 0"><label for="d-number" style="margin-top:0">Document number</label>' +
      '<input type="text" id="d-number" autocomplete="off" value="' + esc(e.fullNumber) + '" placeholder="' + (e.last4 ? 'Ending ' + esc(e.last4) + ' — leave blank to keep' : 'Only the last 4 characters are kept') + '">' +
      '<label class="check small" style="margin-top:6px"><input type="checkbox" id="d-keepFull"' + (e.fullNumber ? ' checked' : '') + '> Keep the full number on this device</label>' +
      '<p class="small muted" style="margin:6px 0 0">ID numbers can be used for identity theft. By default we keep only the last 4 characters — enough to tell documents apart. If you keep the full number, anyone using this browser (or holding your backup file) can see it. Nothing is encrypted.</p></div>' +
      inp('d-issue', 'Issue date', e.issueDate, 'date') + inp('d-expiry', 'Expiry date', e.expiryDate, 'date') +
      inp('d-lead', 'Start renewing (days before expiry)', e.leadDays, 'number', 'min="0" step="1"') +
      '<div><label>Renew by</label><p id="d-renewBy" style="margin:8px 0"></p></div>' +
      '<div class="full"><p class="small muted" id="d-typeNote"></p></div>' +
      '<div class="full"><label for="d-conditions">Conditions (e.g. visa conditions, licence restrictions)</label><textarea id="d-conditions" class="prose" style="min-height:50px">' + esc(e.conditions) + '</textarea></div>' +
      inp('d-location', 'Where the original is kept', e.location) +
      '<div class="full"><label for="d-notes">Notes</label><textarea id="d-notes" class="prose" style="min-height:50px">' + esc(e.notes) + '</textarea></div></div>' +
      '<h3>Attachments</h3><p class="small muted">Photos of the document or policy schedule (shrunk to save space) or a PDF up to 10 MB. A photo shows the full number — only add one if you’re comfortable with that.</p>' +
      '<div class="thumbs" id="d-files"></div><div class="row">' +
      '<span class="btn small file-btn">Take a photo<input type="file" accept="image/*" capture="environment" data-add="1"></span>' +
      '<span class="btn small file-btn">Choose files<input type="file" accept="image/*,application/pdf" multiple data-add="1"></span></div>' +
      '<div class="row" style="margin-top:14px"><button class="btn primary" type="button" id="d-save">Save</button><button class="btn" type="button" id="d-cancel">Cancel</button></div>';
    var leadTouched = !e._new;
    var upd = function () {
      var t = L.type($('#d-type').value);
      $('#d-typeNote').textContent = t.note;
      var exp = $('#d-expiry').value, lead = +$('#d-lead').value || 0;
      $('#d-renewBy').textContent = exp ? K.niceDate(K.addDays(exp, -lead)) : '—';
    };
    $('#d-type').addEventListener('change', function () { var t = L.type(this.value); if (!leadTouched) $('#d-lead').value = t.lead; if (!$('#d-label').value) $('#d-label').placeholder = t.name; upd(); });
    $('#d-lead').addEventListener('input', function () { leadTouched = true; upd(); });
    $('#d-expiry').addEventListener('input', upd); upd();
    renderFiles();
    B.$$('[data-add]', ed).forEach(function (i) {
      i.addEventListener('change', function () {
        var files = [].slice.call(i.files); i.value = ''; if (!files.length) return;
        K.addFiles(db, files, { accept: /^(image\/|application\/pdf)/, maxBytes: 10 * 1048576 }).then(function (added) { added.forEach(function (m) { editing.attachments.push(m); newMedia.push(m.id); }); renderFiles(); })
          .catch(function (err) { B.toast(err.message, 5000); });
      });
    });
    $('#d-save').addEventListener('click', saveDoc);
    $('#d-cancel').addEventListener('click', function () { newMedia.forEach(function (id) { db.del(id); }); editing = null; renderEditor(); });
  }
  function renderFiles() {
    var box = $('#d-files');
    box.innerHTML = editing.attachments.map(function (m, i) {
      return '<div class="thumb">' + (/^image\//.test(m.type) ? '<img data-mid="' + esc(m.id) + '" alt="">' : '<a href="#" data-open="' + esc(m.id) + '">PDF<br>' + esc(m.name.slice(0, 14)) + '</a>') + '<button type="button" aria-label="Remove" data-rm="' + i + '">×</button></div>';
    }).join('') || '<span class="small muted">None.</span>';
    fillImgs(box);
    B.$$('[data-rm]', box).forEach(function (b) { b.addEventListener('click', function () { var m = editing.attachments.splice(+b.dataset.rm, 1)[0]; if (newMedia.indexOf(m.id) >= 0) db.del(m.id); else (editing._drop = editing._drop || []).push(m.id); renderFiles(); }); });
    B.$$('[data-open]', box).forEach(function (a) { a.addEventListener('click', function (ev) { ev.preventDefault(); db.url(a.dataset.open).then(function (u) { window.open(u, '_blank'); }); }); });
  }
  function saveDoc() {
    var num = $('#d-number').value.trim(), keep = $('#d-keepFull').checked;
    var d = L.normaliseDoc({ id: editing.id, personId: $('#d-person').value, type: $('#d-type').value, label: $('#d-label').value, issuer: $('#d-issuer').value,
      number: num, keepFull: keep, last4: num ? undefined : editing.last4, issueDate: $('#d-issue').value, expiryDate: $('#d-expiry').value, leadDays: $('#d-lead').value,
      conditions: $('#d-conditions').value, location: $('#d-location').value, notes: $('#d-notes').value, attachments: editing.attachments });
    if (!d.label) d.label = L.type(d.type).name;
    if (!num && !keep) d.fullNumber = '';
    (editing._drop || []).forEach(function (id) { db.del(id); });
    var i = data.docs.findIndex(function (x) { return x.id === d.id; });
    if (i >= 0) data.docs[i] = d; else data.docs.push(d);
    save(); editing = null; renderEditor(); renderAll(); B.toast('Saved');
  }
  function del(id) {
    var d = data.docs.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    if (!confirm('Delete "' + L.docTitle(d) + '" and its attachments?')) return;
    d.attachments.forEach(function (m) { db.del(m.id); });
    data.docs = data.docs.filter(function (x) { return x.id !== id; }); save(); renderAll();
  }

  // ---------- people ----------
  var PF = ['name', 'dob', 'phone', 'blood', 'medical', 'medicines', 'doctor', 'emergency'];
  function renderPeople() {
    var t = today();
    $('#people').innerHTML = data.people.length ? data.people.map(function (p) {
      var mine = data.docs.filter(function (d) { return d.personId === p.id; });
      return '<div class="panel"><div class="row"><h2 style="margin:0">' + esc(p.name) + '</h2>' + (p.dob ? '<span class="muted">age ' + L.age(p.dob, t) + '</span>' : '') +
        '<button class="btn small" type="button" data-pedit="' + esc(p.id) + '">Edit</button><button class="btn small" type="button" data-pdel="' + esc(p.id) + '">Remove</button></div>' +
        (p.medical ? '<p class="small"><b>Medical:</b> ' + esc(p.medical) + '</p>' : '') +
        (mine.length ? B.table(mine.map(function (d) { return { id: d.id, doc: L.docTitle(d), exp: d.expiryDate ? K.niceDate(d.expiryDate) : '—', s: L.status(d, t) }; }),
          [{ key: 'doc', label: 'Document' }, { key: 'exp', label: 'Expires' }, { key: 's', label: 'Status', fmt: pill }, { key: 'id', label: '', fmt: function (id) { return '<button class="btn small" type="button" data-edit="' + esc(id) + '">Open</button>'; } }])
          : '<p class="small muted">No documents yet.</p>') + '</div>';
    }).join('') : '<p class="muted">No people added yet.</p>';
  }
  function fillPerson(p) {
    editPerson = p ? p.id : null; $('#pTitle').textContent = p ? 'Edit ' + p.name : 'Add a family member';
    PF.forEach(function (k) { $('#p-' + k).value = p ? p[k] || '' : ''; });
  }

  // ---------- travel ----------
  function renderTravel() {
    var dep = $('#tDepart').value, ret = $('#tReturn').value || dep, months = +$('#tMonths').value;
    var pass = data.docs.filter(function (d) { return d.type === 'passport'; });
    if (!dep) { $('#travel').innerHTML = '<p class="muted">Pick your travel dates.</p>'; return; }
    if (!pass.length) { $('#travel').innerHTML = '<p class="muted">No passports recorded yet.</p>'; return; }
    $('#travel').innerHTML = B.table(pass.map(function (d) { var c = L.travelCheck(d, dep, ret, months); return { who: who(d.personId), doc: L.docTitle(d), c: c }; }),
      [{ key: 'who', label: 'Who' }, { key: 'doc', label: 'Passport' }, { key: 'c', label: 'Result', fmt: function (c) { return '<span class="' + (c.ok ? 'pill-ok' : 'pill-bad') + '">' + (c.ok ? 'OK' : 'Problem') + '</span> ' + esc(c.msg); } }]);
  }

  function renderChecklists() {
    $('#checklists').innerHTML = L.TYPES.map(function (t) {
      return '<details><summary><b>' + esc(t.name) + '</b>' + (t.expires ? ' <span class="small muted">· start ' + t.lead + ' days before expiry by default</span>' : '') + '</summary>' +
        (t.note ? '<p class="small">' + esc(t.note) + '</p>' : '') + '<ol class="small">' + t.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></details>';
    }).join('');
  }

  function renderAll() { renderOverview(); renderDocs(); renderPeople(); renderTravel(); if (drawStorage) drawStorage(); }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-edit],[data-del],[data-new],[data-pedit],[data-pdel]'); if (!t) return;
    if (t.dataset.edit) startEdit(t.dataset.edit);
    else if (t.dataset.del) del(t.dataset.del);
    else if (t.dataset.new) startEdit(null);
    else if (t.dataset.pedit) { fillPerson(data.people.filter(function (p) { return p.id === t.dataset.pedit; })[0]); $('#pForm').scrollIntoView({ behavior: 'smooth' }); }
    else if (t.dataset.pdel) {
      var p = data.people.filter(function (x) { return x.id === t.dataset.pdel; })[0];
      if (!confirm('Remove ' + p.name + '? Their documents move to Household.')) return;
      data.people = data.people.filter(function (x) { return x.id !== p.id; });
      data.docs.forEach(function (d) { if (d.personId === p.id) d.personId = ''; }); save(); renderAll();
    }
  });
  $('#pForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var p = { id: editPerson || B.uid() }; PF.forEach(function (k) { p[k] = $('#p-' + k).value.trim(); });
    var i = data.people.findIndex(function (x) { return x.id === p.id; });
    if (i >= 0) data.people[i] = p; else data.people.push(p);
    save(); fillPerson(null); renderAll(); B.toast('Saved');
  });
  $('#pCancel').addEventListener('click', function () { fillPerson(null); });
  $('#addTop').addEventListener('click', function () { startEdit(null); });
  $('#fPerson').addEventListener('change', renderDocs);
  ['#tDepart', '#tReturn', '#tMonths'].forEach(function (s) { $(s).addEventListener('input', renderTravel); });
  $('#ics').addEventListener('click', function () { K.downloadICS('life-admin-reminders.ics', L.icsEvents(data.docs, data.people, today()), 'Life Admin'); });
  function summaryHTML() { return L.emergencyHTML(data.people, data.docs, { today: today(), extra: $('#sExtra').value.trim() }); }
  $('#sPrint').addEventListener('click', function () { K.printHTML(summaryHTML()); });
  $('#sDl').addEventListener('click', function () { B.download('emergency-summary.html', summaryHTML(), 'text/html;charset=utf-8'); });
  $('#csv').addEventListener('click', function () {
    if (!data.docs.length) return B.toast('Nothing to export');
    var rows = data.docs.map(function (d) { var s = L.status(d, today()); return { Person: who(d.personId), Document: L.docTitle(d), Type: L.type(d.type).name, Number: L.masked(d), Issuer: d.issuer, Issued: d.issueDate, Expires: d.expiryDate, 'Renew by': s.renewBy, Status: PILL[s.state][1], Conditions: d.conditions, 'Kept at': d.location, Notes: d.notes }; });
    B.download('life-admin-' + today() + '.csv', '﻿' + B.csv.stringify(rows, Object.keys(rows[0])), 'text/csv;charset=utf-8');
  });
  $('#backup').addEventListener('click', function () {
    $('#backupMsg').textContent = 'Preparing backup…';
    K.exportBackup(db, 'life-admin', data).then(function (r) { $('#backupMsg').textContent = 'Backup downloaded: ' + data.docs.length + ' documents, ' + r.files + ' attachments, ' + K.formatBytes(r.bytes) + '.'; })
      .catch(function (err) { $('#backupMsg').textContent = 'Backup failed: ' + err.message; });
  });
  $('#restore').addEventListener('change', function () {
    var f = this.files[0]; this.value = ''; if (!f) return;
    if (!confirm('Restore this backup? It replaces everything in Life Admin on this device.')) return;
    K.importBackup(db, f, 'life-admin').then(function (d) { data = { people: d.people || [], docs: (d.docs || []).map(L.normaliseDoc) }; save(); renderAll(); B.toast('Backup restored'); })
      .catch(function (err) { B.toast(err.message, 5000); });
  });
  $('#wipe').addEventListener('click', function () {
    if (!confirm('Delete every person, document and attachment from this device? This cannot be undone.')) return;
    db.clear().then(function () { data = { people: [], docs: [] }; save(); renderAll(); });
  });
  $('#sample').addEventListener('click', function () {
    if ((data.docs.length || data.people.length) && !confirm('Replace your data with a made-up sample family?')) return;
    data = L.sample(today()); save(); renderAll(); showTab('overview'); B.toast('Sample family loaded — all made up');
  });

  showTab = B.tabs($('.tabs'));
  drawStorage = K.storagePanel($('#storage'), db, { dataBytes: function () { return K.jsonBytes(data); } });
  renderChecklists(); renderAll();
})();
