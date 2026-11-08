/* Tender Response Assistant — page wiring. Logic lives in lib.js (TenderLib). */
(function () {
  'use strict';
  var L = window.TenderLib, $ = B.$, esc = B.esc;
  var KEY = 'tender:data', WORDS_PER_PAGE = 450;
  var st = load(), showTab, openSugg = {}, libEditing = null;

  function defaults() {
    return { title: '', text: '', analysed: false, requirements: [], criteria: [], submission: null, dates: [], checklist: [], library: [], gonogo: {}, gngNotes: '',
      plan: { total: '', unit: 'pages', exclude: {} }, drafts: {}, org: '' };
  }
  function load() { var d = B.store.get(KEY, null); return Object.assign(defaults(), d || {}); }
  function save() { if (!B.store.set(KEY, st)) B.toast('Could not save — browser storage may be full. Download a backup.', 4000); }
  function stat(v, k, cls) { return '<div class="stat"><div class="v ' + (cls || '') + '">' + esc(v) + '</div><div class="k">' + esc(k) + '</div></div>'; }
  function slug(s) { return String(s || 'tender').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'tender'; }
  function niceDate(s) { var p = String(s).split('-'); if (p.length !== 3) return s; return new Date(Date.UTC(+p[0], p[1] - 1, +p[2])).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  function daysTo(s) { var p = String(s).split('-'); if (p.length !== 3) return null; var t = new Date(); return Math.round((Date.UTC(+p[0], p[1] - 1, +p[2]) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5); }
  function wc(s) { return (String(s || '').match(/\S+/g) || []).length; }

  function fileToText(f) {
    var name = f.name.toLowerCase();
    if (/\.docx$/.test(name)) return Promise.all([B.lib.mammoth(), B.readFile(f, 'buffer')]).then(function (r) { return r[0].extractRawText({ arrayBuffer: r[1] }); }).then(function (r) { return r.value; });
    if (/\.pdf$/.test(name)) return Promise.all([B.lib.pdfjs(), B.readFile(f, 'buffer')]).then(function (r) {
      return r[0].getDocument({ data: r[1] }).promise.then(function (pdf) {
        var pages = []; for (var i = 1; i <= pdf.numPages; i++) pages.push(pdf.getPage(i).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
          var out = '', lastY = null; tc.items.forEach(function (it) { var y = it.transform[5]; if (lastY != null && Math.abs(y - lastY) > 2) out += '\n'; else if (out) out += ' '; out += it.str; lastY = y; }); return out;
        }));
        return Promise.all(pages).then(function (t) { return t.join('\n'); });
      });
    });
    if (/\.doc$/.test(name)) return Promise.reject(new Error('Old .doc files can’t be read here — save it as .docx or PDF first.'));
    return B.readFile(f);
  }

  // ---------- 1. tender ----------
  function analyse() {
    var text = $('#tText').value.trim(); if (!text) { B.toast('Paste the tender text or drop a file first'); return; }
    if (st.requirements.length && !confirm('Re-reading the tender replaces the compliance matrix, criteria, dates and checklist (your library and go/no-go scores are kept). Continue?')) return;
    var a = L.analyse(text);
    st.text = text; st.title = $('#tTitle').value.trim() || st.title; st.analysed = true;
    st.requirements = a.requirements; st.criteria = a.criteria; st.submission = a.submission; st.dates = a.dates; st.checklist = a.checklist; st.drafts = {};
    var pl = a.submission.pageLimits[0], wl = a.submission.wordLimits[0];
    st.plan = { total: pl ? pl.pages : wl ? wl.words : '', unit: pl ? 'pages' : wl ? 'words' : 'pages', exclude: {} };
    st.criteria.forEach(function (c) { if (/\b(price|pricing|cost)\b/i.test(c.name)) st.plan.exclude[c.id] = true; });
    save(); renderAll();
    $('#docStatus').textContent = 'Found ' + a.requirements.length + ' requirements, ' + a.criteria.length + ' criteria and ' + a.dates.length + ' dates.';
  }
  function renderDoc() {
    var el = $('#docSummary'); $('#tTitle').value = st.title; if (!$('#tText').value) $('#tText').value = st.text;
    if (!st.analysed) { el.innerHTML = '<p class="muted">Nothing read yet. Drop a file or paste the text, then press the button — or load the sample tender.</p>'; return; }
    var s = st.submission || {}, mand = st.requirements.filter(function (r) { return r.mandatory; }).length;
    var close = st.dates.filter(function (d) { return d.label === 'Tender closes'; }).slice(-1)[0], left = close ? daysTo(close.date) : null;
    var h = '<div class="stat-row" style="margin-top:12px">' + stat(st.requirements.length, 'Requirements') + stat(mand, 'Mandatory') + stat(st.criteria.length, 'Criteria') +
      (close ? stat(left < 0 ? 'Closed' : left + ' days', 'Until closing', left < 0 ? 'bad' : left <= 7 ? 'warn' : '') : stat('?', 'Closing date not found', 'warn')) + '</div>';
    h += '<div class="panel"><h3 style="margin-top:0">Submission instructions</h3><dl class="sub">' +
      '<dt>Closes</dt><dd>' + (close ? '<b>' + esc(niceDate(close.date)) + (close.time ? ' at ' + esc(close.time) : '') + (close.tz ? ' ' + esc(close.tz) : '') + '</b>' : '<span class="warn">Not found — check the tender</span>') + '</dd>' +
      '<dt>Format</dt><dd>' + (s.formats && s.formats.length ? esc(s.formats.join(', ')) : '–') + '</dd>' +
      '<dt>Page limits</dt><dd>' + (s.pageLimits && s.pageLimits.length ? s.pageLimits.map(function (p) { return '<b>' + p.pages + ' pages</b> — ' + esc(p.context); }).join('<br>') : '–') + '</dd>' +
      '<dt>Word limits</dt><dd>' + (s.wordLimits && s.wordLimits.length ? s.wordLimits.map(function (p) { return '<b>' + p.words + ' words</b> — ' + esc(p.context); }).join('<br>') : '–') + '</dd>' +
      (s.fonts ? '<dt>Font</dt><dd>' + esc(s.fonts) + '</dd>' : '') + (s.copies ? '<dt>Copies</dt><dd>' + esc(s.copies) + '</dd>' : '') +
      '<dt>Portal</dt><dd>' + (s.portals && s.portals.length ? esc(s.portals.join(', ')) : '–') + '</dd>' +
      '<dt>How to lodge</dt><dd>' + (s.lodgement && s.lodgement.length ? s.lodgement.map(esc).join('<br>') : '–') + '</dd>' +
      '<dt>Contacts</dt><dd>' + esc([].concat(s.contacts || [], s.emails || [], s.phones || []).join(' · ') || '–') + '</dd>' +
      (s.urls && s.urls.length ? '<dt>Links</dt><dd>' + s.urls.map(esc).join('<br>') + '</dd>' : '') + '</dl></div>';
    h += '<div class="panel"><h3 style="margin-top:0">Key dates</h3><p class="small muted">Check each one against the tender. Edit or add rows, then download them to your calendar (the closing date gets reminders 2 days and 4 hours before).</p>' +
      '<div class="table-wrap"><table><thead><tr><th>What</th><th>Date</th><th>Time</th><th>Time zone</th><th></th></tr></thead><tbody>' + st.dates.map(function (d, i) {
        return '<tr data-di="' + i + '"><td><input type="text" aria-label="What" data-dk="label" value="' + esc(d.label) + '"></td><td><input type="date" aria-label="Date" data-dk="date" value="' + esc(d.date) + '"></td>' +
          '<td><input type="text" aria-label="Time (24h)" data-dk="time" placeholder="14:00" value="' + esc(d.time) + '" style="min-width:70px"></td>' +
          '<td><select aria-label="Time zone" data-dk="tz">' + ['', 'AEST', 'AEDT', 'ACST', 'ACDT', 'AWST', 'Australia/Sydney', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Perth', 'local'].map(function (z) { return '<option' + (z === d.tz ? ' selected' : '') + ' value="' + z + '">' + (z || '–') + '</option>'; }).join('') + '</select></td>' +
          '<td><button class="btn small" type="button" data-ddel="' + i + '" aria-label="Remove date">✕</button></td></tr>';
      }).join('') + '</tbody></table></div><div class="row" style="margin-top:8px"><button class="btn small" type="button" id="addDate">Add date</button><button class="btn small" type="button" id="icsDates">Download dates (.ics)</button></div></div>';
    el.innerHTML = h;
  }

  // ---------- 2. matrix ----------
  function critOptions(sel) { return '<option value="">–</option>' + st.criteria.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join(''); }
  function renderMatrix() {
    var s = L.matrixSummary(st.requirements);
    $('#matrixStats').innerHTML = stat(s.total, 'Requirements') + stat(s.mandatory, 'Mandatory') + stat(s.pct + '%', 'Complete', s.pct === 100 ? 'ok' : '') + stat(s.mandatoryOpen, 'Mandatory still open', s.mandatoryOpen ? 'warn' : 'ok') + stat(s.unassigned, 'No owner') + (s.wontComply ? stat(s.wontComply, 'Mandatory won’t comply', 'bad') : '');
    var f = $('#mFilter').value, q = $('#mSearch').value.trim().toLowerCase();
    var rows = st.requirements.filter(function (r) {
      if (f === 'mand' && !r.mandatory) return false;
      if (f === 'open' && (r.status === 'Complete' || r.status === 'Not applicable')) return false;
      if (f === 'noowner' && r.owner) return false;
      return !q || (r.text + ' ' + r.ref + ' ' + r.id + ' ' + r.owner + ' ' + r.evidence).toLowerCase().indexOf(q) >= 0;
    });
    var el = $('#matrixOut');
    if (!st.requirements.length) { el.innerHTML = '<p class="muted">No requirements yet. Read a tender in step 1, or add them by hand.</p>'; return; }
    el.innerHTML = '<div class="table-wrap"><table class="matrix"><thead><tr><th>ID</th><th>Requirement</th><th>Mandatory</th><th>Criterion</th><th>Status</th><th>Owner</th><th>Evidence / reference</th><th>Page</th><th></th></tr></thead><tbody>' + rows.map(function (r) {
      var sug = openSugg[r.id] ? L.suggest(r.text, st.library, 3) : null;
      return '<tr data-r="' + esc(r.id) + '"><td>' + esc(r.id) + (r.ref ? '<br><span class="small muted">cl. ' + esc(r.ref) + '</span>' : '') + '</td>' +
        '<td class="req">' + esc(r.text) + (r.section ? '<br><span class="small muted">' + esc(r.section) + '</span>' : '') +
        '<div class="no-print"><button class="btn small" type="button" data-sugg="' + esc(r.id) + '" style="margin-top:4px">' + (sug ? 'Hide' : 'Suggest') + ' library items</button></div>' +
        (sug ? '<div class="sugg">' + (sug.length ? '<ul>' + sug.map(function (x) { return '<li><b>' + esc(x.item.title) + '</b> <span class="muted">(' + esc(x.item.type) + ', match ' + Math.round(x.score * 100) + '% — ' + esc(x.matched.join(', ')) + ')</span> <button class="btn small" type="button" data-use="' + esc(r.id) + '|' + esc(x.item.id) + '">Use as evidence</button></li>'; }).join('') + '</ul>' : 'No close matches in your library.' + (st.library.length ? '' : ' Add items in step 4.')) + '</div>' : '') + '</td>' +
        '<td><label class="check"><input type="checkbox" data-rk="mandatory"' + (r.mandatory ? ' checked' : '') + '> <span class="' + (r.mandatory ? 'pill-bad' : 'pill-mute') + '">' + (r.mandatory ? 'Must' : 'Should') + '</span></label></td>' +
        '<td><select aria-label="Criterion" data-rk="criterion">' + critOptions(r.criterion) + '</select></td>' +
        '<td><select aria-label="Status" data-rk="status">' + L.STATUSES.map(function (x) { return '<option' + (x === r.status ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></td>' +
        '<td><input type="text" aria-label="Owner" data-rk="owner" value="' + esc(r.owner) + '"></td><td><input type="text" aria-label="Evidence" data-rk="evidence" value="' + esc(r.evidence) + '"></td>' +
        '<td><input type="text" class="pg" aria-label="Page" data-rk="page" value="' + esc(r.page) + '"></td><td><button class="btn small" type="button" data-rdel="' + esc(r.id) + '" aria-label="Remove requirement">✕</button></td></tr>';
    }).join('') + '</tbody></table></div>' + (rows.length < st.requirements.length ? '<p class="small muted">Showing ' + rows.length + ' of ' + st.requirements.length + '.</p>' : '');
  }
  function req(id) { return st.requirements.filter(function (r) { return r.id === id; })[0]; }
  function nextReqId() { var n = st.requirements.reduce(function (m, r) { var k = +String(r.id).replace(/\D/g, ''); return Math.max(m, k || 0); }, 0) + 1; return 'R' + (n < 10 ? '00' : n < 100 ? '0' : '') + n; }

  // ---------- 3. plan ----------
  function writtenCriteria() { return st.criteria.filter(function (c) { return !st.plan.exclude[c.id]; }); }
  function budgets() {
    var wc0 = writtenCriteria(), total = +st.plan.total || 0, step = st.plan.unit === 'pages' ? 0.5 : 10;
    var b = L.budget(wc0, total, step), map = {}; wc0.forEach(function (c, i) { map[c.id] = b[i]; }); return map;
  }
  function renderPlan() {
    $('#critList').innerHTML = st.criteria.length ? st.criteria.map(function (c, i) {
      return '<div class="crit-row" data-c="' + i + '"><input type="text" aria-label="Criterion" data-ck="name" value="' + esc(c.name) + '"><input type="number" min="0" step="any" aria-label="Weighting %" data-ck="weight" value="' + esc(c.weight) + '">' +
        '<label class="check"><input type="checkbox" data-ck="written"' + (st.plan.exclude[c.id] ? '' : ' checked') + '> written</label><button class="btn small" type="button" data-cdel="' + i + '" aria-label="Remove criterion">✕</button></div>';
    }).join('') : '<p class="muted">No weighted criteria found. Add them from the tender’s evaluation section.</p>';
    $('#budgetTotal').value = st.plan.total; $('#budgetUnit').value = st.plan.unit; $('#org').value = st.org;
    var sum = st.criteria.reduce(function (a, c) { return a + (+c.weight || 0); }, 0), bud = budgets(), unit = st.plan.unit;
    $('#budgetOut').innerHTML = (st.criteria.length ? '<p class="small ' + (Math.abs(sum - 100) > 0.5 ? 'warn' : 'muted') + '">Weightings add up to ' + B.fmt.num(sum) + '%.</p>' : '') +
      (+st.plan.total ? B.barChart(writtenCriteria().map(function (c) { return { label: c.name, value: bud[c.id] }; }), { fmt: function (x) { return B.fmt.num(x, 1) + ' ' + unit; } }) : '');
    // sections
    var el = $('#sections');
    if (!st.criteria.length) { el.innerHTML = ''; return; }
    el.innerHTML = st.criteria.map(function (c) {
      var reqs = st.requirements.filter(function (r) { return r.criterion === c.id; }), b = bud[c.id], words = b ? Math.round(unit === 'pages' ? b * WORDS_PER_PAGE : b) : 0, draft = st.drafts[c.id] || '', n = wc(draft);
      var meter = words ? '<span class="meter ' + (n > words ? 'bad' : n > words * 0.9 ? 'warn' : 'muted') + '">' + n + ' / ~' + words + ' words' + (unit === 'pages' ? ' (' + B.fmt.num(b, 1) + ' pages)' : '') + '</span>' : '<span class="meter muted">' + n + ' words</span>';
      return '<div class="panel sec" data-sec="' + esc(c.id) + '"><h3>' + esc(c.name) + ' <span class="small muted">' + esc(c.weight) + '%' + (st.plan.exclude[c.id] ? ' · answered in a separate form' : '') + '</span></h3>' +
        '<p class="small muted">' + reqs.length + ' linked requirement' + (reqs.length === 1 ? '' : 's') + (reqs.length ? ': ' + reqs.map(function (r) { return esc(r.id); }).join(', ') : ' — link them in the compliance matrix') + '</p>' +
        '<textarea class="prose" aria-label="Draft for ' + esc(c.name) + '" data-draft="' + esc(c.id) + '" placeholder="Your response for this criterion…">' + esc(draft) + '</textarea>' +
        '<div class="row" data-actions="' + esc(c.id) + '" style="margin-top:8px">' + meter + '<button class="btn small" type="button" data-build="' + esc(c.id) + '">Build draft from library</button><button class="btn small" type="button" data-copyd="' + esc(c.id) + '">Copy</button></div></div>';
    }).join('') + '<div class="row no-print"><button class="btn" type="button" id="dlDrafts">Download all drafts (.txt)</button></div>';
    if (B.ai) st.criteria.forEach(function (c) {
      var host = el.querySelector('[data-actions="' + c.id + '"]'); if (!host) return;
      B.ai.button(host, 'Draft with AI', function () {
        var reqs = st.requirements.filter(function (r) { return r.criterion === c.id; }).map(function (r) { return '- ' + r.text; }).join('\n');
        var lib = L.suggest(c.name + ' ' + reqs, st.library, 3, 0.03).map(function (x) { return '[' + x.item.title + '] ' + x.item.text; }).join('\n\n');
        var b = budgets()[c.id], words = b ? Math.round(st.plan.unit === 'pages' ? b * WORDS_PER_PAGE : b) : 400;
        return 'You are helping an Australian small business write a tender response. Write the response section for the evaluation criterion "' + c.name + '" in about ' + words + ' words, plain English, Australian spelling. ' +
          'Address these requirements:\n' + (reqs || '(none listed)') + '\n\nUse ONLY facts from this content library; where a fact is missing write [ADD EVIDENCE] instead of inventing it:\n' + (lib || '(library is empty)') + '\n\nBusiness name: ' + (st.org || '[Your business]');
      }, function (ans) { st.drafts[c.id] = ans.trim(); save(); renderPlan(); B.toast('Draft added — check every fact before you submit'); });
    });
  }

  // ---------- 4. library ----------
  function renderLibrary() {
    var q = $('#libSearch').value.trim().toLowerCase(), items = st.library.filter(function (x) { return !q || (x.title + ' ' + x.tags + ' ' + x.text + ' ' + x.type).toLowerCase().indexOf(q) >= 0; });
    $('#libList').innerHTML = items.length ? items.map(function (x) {
      return '<div class="panel lib-item"><h3>' + esc(x.title) + '</h3><p class="small"><span class="tag">' + esc(x.type) + '</span>' + (x.tags ? '<span class="muted">' + esc(x.tags) + '</span>' : '') + '</p>' +
        '<p class="small">' + esc(x.text.length > 320 ? x.text.slice(0, 320) + '…' : x.text) + '</p><div class="row"><button class="btn small" type="button" data-ledit="' + esc(x.id) + '">Edit</button><button class="btn small" type="button" data-ldel="' + esc(x.id) + '">Delete</button></div></div>';
    }).join('') : '<p class="muted">' + (st.library.length ? 'No matches.' : 'Your library is empty. Add your best past answers, case studies, CVs and policies.') + '</p>';
  }

  // ---------- 5. go / no-go ----------
  function renderGng() {
    $('#gngList').innerHTML = L.GONOGO.map(function (f) {
      var v = st.gonogo[f.id]; v = v == null ? '' : String(v);
      return '<div class="gng-row"><span>' + esc(f.name) + (f.knockout ? ' <b title="A 1 here means no bid">*</b>' : '') + '</span><select aria-label="' + esc(f.name) + '" data-g="' + f.id + '"><option value="">–</option>' +
        [1, 2, 3, 4, 5].map(function (n) { return '<option' + (v === String(n) ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div>';
    }).join('');
    var g = L.goNoGo(st.gonogo), cls = g.verdict === 'Bid' ? 'ok' : g.verdict === 'No bid' ? 'bad' : 'warn';
    $('#gngOut').innerHTML = '<div class="verdict ' + cls + '">' + esc(g.verdict) + ' <span class="small muted">' + g.pct + '% · ' + g.answered + '/' + g.total + ' answered</span></div>' +
      (g.knockouts.length ? '<p class="bad">Deal-breaker: ' + g.knockouts.map(esc).join('; ') + '.</p>' : '') +
      '<p class="small muted">70% or more: bid. 50–69%: bid only if you can fix the weak spots. Under 50%: usually better to pass and keep the relationship warm.</p>';
    $('#gngNotes').value = st.gngNotes || '';
  }

  // ---------- 6. checklist ----------
  function renderChecklist() {
    $('#chkList').innerHTML = st.checklist.length ? st.checklist.map(function (c, i) {
      return '<div class="chk"><input type="checkbox" id="ck' + i + '" data-ck="' + i + '"' + (c.done ? ' checked' : '') + '><label for="ck' + i + '" style="margin:0;font-weight:400;flex:1">' + esc(c.text) + (c.fromTender ? ' <span class="pill-warn">from tender</span>' : '') + '</label><button class="btn small" type="button" data-ckdel="' + i + '" aria-label="Remove check">✕</button></div>';
    }).join('') : '<p class="muted">Read a tender first (step 1) to build the checklist.</p>';
  }
  function printHTML(html) {
    var f = B.h('iframe', { title: 'Print preview', style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0' });
    f.addEventListener('load', function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { B.toast('Printing was blocked.'); } setTimeout(function () { f.remove(); }, 60000); });
    f.srcdoc = html; document.body.appendChild(f);
  }

  function renderAll() { renderDoc(); renderMatrix(); renderPlan(); renderLibrary(); renderGng(); renderChecklist(); }

  // ---------- sample ----------
  function loadSample() {
    if ((st.requirements.length || st.library.length) && !confirm('Replace your current tender and library with the sample?')) return;
    st = defaults(); st.title = 'RFT 2026-114 Grounds maintenance (sample)'; st.org = 'Greenway Grounds Pty Ltd';
    st.library = JSON.parse(JSON.stringify(window.TenderSample.LIBRARY));
    $('#tText').value = window.TenderSample.RFT; $('#tTitle').value = st.title;
    var a = L.analyse(window.TenderSample.RFT);
    st.text = window.TenderSample.RFT; st.analysed = true; st.requirements = a.requirements; st.criteria = a.criteria; st.submission = a.submission; st.dates = a.dates; st.checklist = a.checklist;
    st.plan = { total: 20, unit: 'pages', exclude: {} }; st.criteria.forEach(function (c) { if (/price/i.test(c.name)) st.plan.exclude[c.id] = true; });
    st.requirements.slice(0, 6).forEach(function (r) { r.owner = 'Bid manager'; r.status = 'Complete'; r.evidence = 'Returnable schedules'; });
    st.requirements.slice(6, 10).forEach(function (r) { r.owner = 'Operations'; r.status = 'Drafting'; });
    st.gonogo = { mandatory: 5, capability: 4, capacity: 3, relationship: 2, fit: 4, competition: 3, price: 3, terms: 4, time: 3 };
    save(); renderAll(); B.toast('Sample loaded — a made-up tender');
  }

  // ---------- events ----------
  B.dropZone($('#drop'), function (files) {
    $('#docStatus').textContent = 'Reading ' + files.length + ' file' + (files.length > 1 ? 's' : '') + '…';
    Promise.all(files.map(fileToText)).then(function (texts) {
      var text = texts.join('\n\n'); if (text.replace(/\s/g, '').length < 50) { $('#docStatus').textContent = 'No text found — it may be a scanned image.'; return; }
      $('#tText').value = ($('#tText').value ? $('#tText').value + '\n\n' : '') + text;
      if (!$('#tTitle').value) $('#tTitle').value = files[0].name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
      $('#docStatus').textContent = 'Read ' + files.map(function (f) { return f.name; }).join(', ') + '. Now press the button.';
    }, function (err) { $('#docStatus').textContent = err.message || 'Could not read that file.'; });
  }, { accept: '.pdf,.docx,.txt,.md,.doc', multiple: true });
  $('#analyse').addEventListener('click', analyse);
  $('#tTitle').addEventListener('change', function (e) { st.title = e.target.value.trim(); save(); });
  var DS = $('#docSummary');
  DS.addEventListener('change', function (e) { var row = e.target.closest('[data-di]'), k = e.target.dataset.dk; if (!row || !k) return; st.dates[+row.dataset.di][k] = e.target.value.trim(); save(); });
  DS.addEventListener('click', function (e) {
    if (e.target.dataset.ddel != null) { st.dates.splice(+e.target.dataset.ddel, 1); save(); renderDoc(); }
    else if (e.target.id === 'addDate') { st.dates.push({ label: 'New date', date: '', time: '', tz: '', source: '' }); save(); renderDoc(); }
    else if (e.target.id === 'icsDates') {
      var ok = st.dates.filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d.date); }); if (!ok.length) return B.toast('No dates to export');
      B.download(slug(st.title) + '-dates.ics', L.toICS(ok, st.title), 'text/calendar;charset=utf-8');
    }
  });
  var MO = $('#matrixOut');
  MO.addEventListener('change', function (e) {
    var row = e.target.closest('[data-r]'), k = e.target.dataset.rk; if (!row || !k) return; var r = req(row.dataset.r); if (!r) return;
    r[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; save(); renderMatrix(); if (k === 'criterion') renderPlan();
  });
  MO.addEventListener('click', function (e) {
    var ds = e.target.dataset;
    if (ds.sugg) { openSugg[ds.sugg] = !openSugg[ds.sugg]; renderMatrix(); }
    else if (ds.use) { var p = ds.use.split('|'), r = req(p[0]), it = st.library.filter(function (x) { return x.id === p[1]; })[0]; if (r && it) { r.evidence = r.evidence ? r.evidence + '; ' + it.title : it.title; if (r.status === 'Not started') r.status = 'Drafting'; save(); renderMatrix(); } }
    else if (ds.rdel) { if (confirm('Remove ' + ds.rdel + ' from the matrix?')) { st.requirements = st.requirements.filter(function (r) { return r.id !== ds.rdel; }); save(); renderMatrix(); renderPlan(); } }
  });
  $('#mFilter').addEventListener('change', renderMatrix);
  $('#mSearch').addEventListener('input', renderMatrix);
  $('#addReq').addEventListener('click', function () {
    var t = prompt('Requirement text'); if (!t || !t.trim()) return;
    st.requirements.push({ id: nextReqId(), ref: '', section: '', text: t.trim(), mandatory: L.level(t) !== 'desirable', level: L.level(t) || 'mandatory', status: 'Not started', owner: '', evidence: '', page: '', criterion: '' });
    save(); renderMatrix();
  });
  function matrixData() { return L.matrixRows(st.requirements, st.criteria); }
  $('#csvMatrix').addEventListener('click', function () {
    var rows = matrixData(); if (!rows.length) return B.toast('Nothing to export');
    B.download(slug(st.title) + '-compliance-matrix.csv', '﻿' + B.csv.stringify(rows, L.MATRIX_COLS), 'text/csv;charset=utf-8');
  });
  $('#xlsxMatrix').addEventListener('click', function () {
    var rows = matrixData(); if (!rows.length) return B.toast('Nothing to export');
    B.lib.xlsx().then(function (X) {
      var ws = X.utils.json_to_sheet(rows, { header: L.MATRIX_COLS });
      ws['!cols'] = [{ wch: 7 }, { wch: 8 }, { wch: 70 }, { wch: 10 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 6 }];
      ws['!autofilter'] = { ref: 'A1:I' + (rows.length + 1) };
      var wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Compliance matrix');
      if (st.criteria.length) X.utils.book_append_sheet(wb, X.utils.json_to_sheet(st.criteria.map(function (c) { return { Criterion: c.name, 'Weighting %': +c.weight }; })), 'Criteria');
      if (st.dates.length) X.utils.book_append_sheet(wb, X.utils.json_to_sheet(st.dates.map(function (d) { return { What: d.label, Date: d.date, Time: d.time, 'Time zone': d.tz }; })), 'Key dates');
      var out = X.write(wb, { bookType: 'xlsx', type: 'array' });
      B.download(slug(st.title) + '-compliance-matrix.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    }, function () { B.toast('Could not load the Excel library — check your connection, or use CSV'); });
  });
  $('#critList').addEventListener('change', function (e) {
    var row = e.target.closest('[data-c]'), k = e.target.dataset.ck; if (!row || !k) return; var c = st.criteria[+row.dataset.c];
    if (k === 'written') { if (e.target.checked) delete st.plan.exclude[c.id]; else st.plan.exclude[c.id] = true; }
    else c[k] = k === 'weight' ? Math.max(0, +e.target.value || 0) : e.target.value;
    save(); renderPlan(); renderMatrix();
  });
  $('#critList').addEventListener('click', function (e) {
    var i = e.target.dataset.cdel; if (i == null) return; var c = st.criteria[+i];
    st.criteria.splice(+i, 1); st.requirements.forEach(function (r) { if (r.criterion === c.id) r.criterion = ''; }); delete st.drafts[c.id];
    save(); renderPlan(); renderMatrix();
  });
  $('#addCrit').addEventListener('click', function () { st.criteria.push({ id: 'C' + B.uid(), name: 'New criterion', weight: 10 }); save(); renderPlan(); renderMatrix(); });
  $('#budgetTotal').addEventListener('change', function (e) { st.plan.total = e.target.value; save(); renderPlan(); });
  $('#budgetUnit').addEventListener('change', function (e) { st.plan.unit = e.target.value; save(); renderPlan(); });
  $('#org').addEventListener('change', function (e) { st.org = e.target.value.trim(); save(); });
  var SE = $('#sections');
  SE.addEventListener('input', function (e) { var id = e.target.dataset.draft; if (!id) return; st.drafts[id] = e.target.value; save(); });
  SE.addEventListener('change', function (e) { if (e.target.dataset.draft) renderPlan(); });
  SE.addEventListener('click', function (e) {
    var ds = e.target.dataset;
    if (ds.build) {
      var c = st.criteria.filter(function (x) { return x.id === ds.build; })[0], b = budgets()[c.id];
      if (st.drafts[c.id] && !confirm('Replace the current draft for ' + c.name + '?')) return;
      st.drafts[c.id] = L.draftSection(c, st.requirements, st.library, { org: st.org, words: b ? Math.round(st.plan.unit === 'pages' ? b * WORDS_PER_PAGE : b) : 0 });
      save(); renderPlan();
    } else if (ds.copyd) B.copy(st.drafts[ds.copyd] || '');
    else if (e.target.id === 'dlDrafts') {
      var txt = st.criteria.map(function (c) { return '## ' + c.name + '\n\n' + (st.drafts[c.id] || '[no draft yet]'); }).join('\n\n\n');
      B.download(slug(st.title) + '-drafts.txt', (st.title ? st.title + '\n\n' : '') + txt, 'text/plain;charset=utf-8');
    }
  });
  B.dropZone($('#libDrop'), function (files) {
    fileToText(files[0]).then(function (t) { $('#l-text').value = t.trim(); if (!$('#l-title').value) $('#l-title').value = files[0].name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '); }, function (err) { B.toast(err.message || 'Could not read that file'); });
  }, { accept: '.pdf,.docx,.txt,.md' });
  function resetLib() { libEditing = null; $('#libForm').reset(); $('#libFormTitle').textContent = 'Add to your content library'; $('#libCancel').hidden = true; }
  $('#libForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var item = { id: libEditing || B.uid(), title: $('#l-title').value.trim(), type: $('#l-type').value, tags: $('#l-tags').value.trim(), text: $('#l-text').value.trim() };
    if (!item.title || !item.text) return;
    if (libEditing) st.library = st.library.map(function (x) { return x.id === libEditing ? item : x; }); else st.library.push(item);
    save(); resetLib(); renderLibrary(); renderMatrix(); B.toast('Saved to library');
  });
  $('#libCancel').addEventListener('click', resetLib);
  $('#libSearch').addEventListener('input', renderLibrary);
  $('#libList').addEventListener('click', function (e) {
    var ds = e.target.dataset;
    if (ds.ldel) { if (confirm('Delete this library item?')) { st.library = st.library.filter(function (x) { return x.id !== ds.ldel; }); save(); renderLibrary(); } }
    else if (ds.ledit) {
      var x = st.library.filter(function (y) { return y.id === ds.ledit; })[0]; if (!x) return; libEditing = x.id;
      $('#l-title').value = x.title; $('#l-type').value = x.type; $('#l-tags').value = x.tags || ''; $('#l-text').value = x.text;
      $('#libFormTitle').textContent = 'Edit library item'; $('#libCancel').hidden = false; $('#libForm').scrollIntoView({ behavior: 'smooth' });
    }
  });
  $('#gngList').addEventListener('change', function (e) { var k = e.target.dataset.g; if (!k) return; st.gonogo[k] = e.target.value; save(); renderGng(); });
  $('#gngNotes').addEventListener('change', function (e) { st.gngNotes = e.target.value; save(); });
  $('#chkList').addEventListener('change', function (e) { var i = e.target.dataset.ck; if (i == null) return; st.checklist[+i].done = e.target.checked; save(); });
  $('#chkList').addEventListener('click', function (e) { var i = e.target.dataset.ckdel; if (i == null) return; st.checklist.splice(+i, 1); save(); renderChecklist(); });
  $('#chkForm').addEventListener('submit', function (e) { e.preventDefault(); var t = $('#chkNew').value.trim(); if (!t) return; st.checklist.push({ text: t, done: false, fromTender: false }); $('#chkNew').value = ''; save(); renderChecklist(); });
  $('#printChk').addEventListener('click', function () {
    var close = st.dates.filter(function (d) { return d.label === 'Tender closes'; }).slice(-1)[0];
    printHTML('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Final checklist</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px}li{list-style:none;margin:4px 0}</style></head><body><h1>Final checklist' + (st.title ? ' — ' + esc(st.title) : '') + '</h1>' +
      (close ? '<p><b>Closes:</b> ' + esc(niceDate(close.date)) + ' ' + esc(close.time) + ' ' + esc(close.tz) + '</p>' : '') + '<ul>' + st.checklist.map(function (c) { return '<li>' + (c.done ? '☑' : '☐') + ' ' + esc(c.text) + '</li>'; }).join('') + '</ul></body></html>');
  });
  $('#sample').addEventListener('click', loadSample);
  $('#backup').addEventListener('click', function () { B.download(slug(st.title) + '-backup.json', JSON.stringify({ app: 'tender-assistant', version: 1, data: st }, null, 2), 'application/json'); });
  $('#restore').addEventListener('click', function () {
    var inp = B.h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', function () {
      if (!inp.files[0]) return;
      B.readFile(inp.files[0]).then(function (t) {
        var j = JSON.parse(t), d = j.data || j; if (!Array.isArray(d.requirements) || !Array.isArray(d.library)) throw new Error('bad');
        st = Object.assign(defaults(), d); $('#tText').value = st.text || ''; save(); renderAll(); B.toast('Backup restored');
      }).catch(function () { B.toast('That file is not a Tender Response Assistant backup'); });
    });
    inp.click();
  });
  $('#wipe').addEventListener('click', function () {
    if (!confirm('Delete the tender, matrix, drafts and your content library from this browser?')) return;
    st = defaults(); $('#tText').value = ''; $('#tTitle').value = ''; save(); renderAll();
  });

  if (B.ai) B.ai.note($('#aiNote'));
  showTab = B.tabs(B.$('.tabs'));
  renderAll();
})();
