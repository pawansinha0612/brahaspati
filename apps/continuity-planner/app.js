/* Business Continuity Planner — page wiring. Logic lives in lib.js (ContinuityLib). */
(function () {
  'use strict';
  var L = window.ContinuityLib, $ = B.$, esc = B.esc;
  var KEY = 'continuity-planner:data';
  var plan = L.normalize(B.store.get(KEY, null)), showTab, timer = null;
  var ORDER = ['business', 'activities', 'people', 'suppliers', 'systems', 'premises', 'results', 'plan'];

  var HOURS = [['', 'Choose…'], [1, '1 hour'], [4, '4 hours'], [8, '1 working day (8 h)'], [24, '24 hours'], [48, '2 days'], [72, '3 days'], [120, '5 days'], [168, '1 week'], [336, '2 weeks'], [720, '1 month']];
  var FORMS = {
    business: [['name', 'Business name'], ['owner', 'Plan owner'], ['coordinator', 'Incident coordinator (name)'], ['phone', 'Main business phone'], ['address', 'Address', 'full'], ['industry', 'Industry'], ['version', 'Plan version'], ['reviewed', 'Last reviewed', '', 'date']],
    premises: [['address', 'Premises address', 'full'], ['assembly', 'Evacuation assembly point'], ['alternative', 'Alternative site if the premises cannot be used'], ['remoteWork', 'Critical work can be done from home', '', 'checkbox'],
      ['insurance', 'Insured, including business interruption', '', 'checkbox'], ['insurer', 'Insurer'], ['policy', 'Policy number']],
    comms: [['staff', 'Emergency channel for staff (e.g. group text)'], ['customers', 'How to reach customers'], ['suppliers', 'How to reach suppliers'], ['website', 'Website'], ['social', 'Social media'],
      ['spokesperson', 'Spokesperson'], ['statement', 'Holding statement (leave blank for a suggested one)', 'full', 'textarea']]
  };
  var LISTS = {
    activities: { label: 'critical activity', title: function (x) { return x.name || 'New activity'; }, fields: [
      ['name', 'Activity', 'full'], ['mtpd', 'Maximum tolerable downtime', '', 'hours'], ['rto', 'Recovery time objective (RTO)', '', 'hours'], ['rpo', 'Data you could lose (RPO)', '', 'hours'],
      ['impact', 'Impact if stopped', '', 'select', [['', 'Choose…'], [1, '1 — minor'], [2, '2 — some'], [3, '3 — serious'], [4, '4 — major'], [5, '5 — business-threatening']]],
      ['dependsOn', 'Depends on (people, systems, suppliers — comma separated)', 'full'], ['workaround', 'Manual workaround while it is down', 'full']] },
    people: { label: 'person', title: function (x) { return (x.name || 'New person') + (x.critical ? ' ★' : ''); }, fields: [
      ['name', 'Name'], ['role', 'Role'], ['phone', 'Mobile'], ['email', 'Email'], ['critical', 'Key person (hard to replace)', '', 'checkbox'], ['deputy', 'Deputy (name)'], ['deputyPhone', 'Deputy mobile']] },
    suppliers: { label: 'supplier', title: function (x) { return (x.name || 'New supplier') + (x.critical ? ' ★' : ''); }, fields: [
      ['name', 'Supplier'], ['provides', 'What they provide'], ['phone', 'Phone / support'], ['critical', 'Critical supplier', '', 'checkbox'], ['alternative', 'Alternative supplier'], ['altPhone', 'Alternative phone']] },
    systems: { label: 'system', title: function (x) { return x.name || 'New system'; }, fields: [
      ['name', 'System'], ['data', 'Data it holds'], ['backup', 'Backup', '', 'select', [['none', 'No backup'], ['manual', 'Manual backup'], ['automatic', 'Automatic backup']]],
      ['backupEvery', 'Backed up every', '', 'hours'], ['offsite', 'A copy is offsite or in the cloud', '', 'checkbox'], ['lastTested', 'Restore last tested', '', 'date'], ['owner', 'Who looks after it']] }
  };

  function save() { if (!B.store.set(KEY, plan)) B.toast('Could not save — browser storage may be full. Download a backup.', 4000); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function changed() { save(); clearTimeout(timer); timer = setTimeout(renderResults, 250); }

  // ---------- generic field rendering ----------
  function field(id, f, val) {
    var key = f[0], label = f[1], cls = f[2] || '', type = f[3] || 'text', opts = f[4];
    if (type === 'checkbox') return '<div class="' + cls + '"><label class="check"><input type="checkbox" id="' + id + '" data-f="' + key + '"' + (val ? ' checked' : '') + '> ' + esc(label) + '</label></div>';
    var input;
    if (type === 'textarea') input = '<textarea class="prose" style="min-height:70px" id="' + id + '" data-f="' + key + '">' + esc(val || '') + '</textarea>';
    else if (type === 'hours' || type === 'select') {
      var list = type === 'hours' ? HOURS : opts, has = list.some(function (o) { return String(o[0]) === String(val == null ? '' : val); });
      if (!has && val !== '' && val != null) list = list.concat([[val, L.hours(val)]]);
      input = '<select id="' + id + '" data-f="' + key + '" data-num="' + (type === 'hours' || key === 'impact' ? 1 : 0) + '">' + list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val == null ? '' : val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    } else input = '<input type="' + (type === 'date' ? 'date' : 'text') + '" id="' + id + '" data-f="' + key + '" value="' + esc(val == null ? '' : val) + '">';
    return '<div class="' + cls + '"><label for="' + id + '">' + esc(label) + '</label>' + input + '</div>';
  }
  function readVal(el) { if (el.type === 'checkbox') return el.checked; if (el.dataset.num === '1') return el.value === '' ? '' : +el.value; return el.value; }

  function renderForm(name) {
    var obj = plan[name];
    $('#f-' + name).innerHTML = FORMS[name].map(function (f) { return field(name + '-' + f[0], f, obj[f[0]]); }).join('');
  }
  function renderList(name) {
    var cfg = LISTS[name], items = plan[name];
    $('#l-' + name).innerHTML = items.map(function (x, i) {
      return '<div class="entry" data-i="' + i + '"><div class="entry-head"><b>' + esc(cfg.title(x)) + '</b><button class="btn small" type="button" data-remove="' + i + '" aria-label="Remove ' + esc(cfg.label) + '">Remove</button></div>' +
        '<div class="form-grid">' + cfg.fields.map(function (f) { return field(name + '-' + i + '-' + f[0], f, x[f[0]]); }).join('') + '</div></div>';
    }).join('') + (items.length ? '' : '<p class="muted">None yet.</p>') + '<button class="btn" type="button" data-add="1">+ Add ' + esc(cfg.label) + '</button>' + stepNav(name);
  }
  function stepNav(name) {
    var i = ORDER.indexOf(name);
    return '<div class="stepnav">' + (i > 0 ? '<button class="btn" type="button" data-go="' + ORDER[i - 1] + '">‹ Back</button>' : '<span></span>') + '<button class="btn primary" type="button" data-go="' + ORDER[i + 1] + '">Next ›</button></div>';
  }
  function bindList(name) {
    var box = $('#l-' + name);
    var upd = function (e) {
      var el = e.target, ent = el.closest('.entry'); if (!el.dataset.f || !ent) return;
      var item = plan[name][+ent.dataset.i]; item[el.dataset.f] = readVal(el);
      if (el.dataset.f === 'name' || el.dataset.f === 'critical') $('.entry-head b', ent).textContent = LISTS[name].title(item);
      changed();
    };
    box.addEventListener('input', upd); box.addEventListener('change', upd);
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.add) { plan[name].push({ id: B.uid() }); save(); renderList(name); var last = B.$$('.entry', box).pop(); if (last) $('input,select', last).focus(); renderResults(); }
      else if (b.dataset.remove != null) { var it = plan[name][+b.dataset.remove]; if (confirm('Remove ' + (it.name || 'this ' + LISTS[name].label) + '?')) { plan[name].splice(+b.dataset.remove, 1); save(); renderList(name); renderResults(); } }
    });
  }
  function bindForm(name) {
    var box = $('#f-' + name), upd = function (e) { var el = e.target; if (!el.dataset.f) return; plan[name][el.dataset.f] = readVal(el); changed(); };
    box.addEventListener('input', upd); box.addEventListener('change', upd);
  }

  // ---------- results ----------
  function renderResults() {
    var t = today(), r = L.readiness(plan, t), reg = L.riskRegister(plan), bia = L.bia(plan), sys = L.systemsCheck(plan, t), tree = L.contactTree(plan), sched = L.testSchedule(plan, t);
    var h = '<div class="cols-2" style="margin-top:16px"><div class="panel" style="margin:0"><div class="small muted">READINESS SCORE</div><div class="score ' + (r.score >= 80 ? 'ok' : r.score >= 50 ? 'warn' : 'bad') + '">' + r.score + '<span style="font-size:20px">/100</span></div>' +
      '<div class="meter"><div style="width:' + r.score + '%"></div></div><b>' + esc(r.level) + '</b><p class="small muted">Based on ' + r.items.length + ' checks: targets, deputies, alternatives, backups, testing and communications.</p></div>' +
      '<div class="panel" style="margin:0"><b>Top gaps to fix</b>' + (r.gaps.length ? r.gaps.slice(0, 5).map(function (g) { return '<div class="gap' + (g.weight * (1 - g.ok) >= 5 ? ' big' : '') + '"><b>' + esc(g.label) + '</b><br><span class="small">' + esc(g.fix) + '</span></div>'; }).join('') : '<p class="ok">No gaps — keep testing.</p>') + '</div></div>';
    // heat map
    h += '<h2>Risk register</h2><p class="help">Scores are suggested from your answers. Change likelihood or impact if you know better — your choice is kept.</p><div class="heat" aria-label="Risk heat map">';
    for (var li = 5; li >= 1; li--) {
      h += '<div class="ax">' + li + '</div>';
      for (var im = 1; im <= 5; im++) {
        var here = reg.filter(function (x) { return x.likelihood === li && x.impact === im; }), sc = li * im;
        h += '<div class="c-' + L.rating(sc).toLowerCase() + '" title="Likelihood ' + li + ', impact ' + im + '">' + here.map(function (x) { return esc(x.short); }).join(', ') + '</div>';
      }
    }
    h += '<div class="ax"></div>' + [1, 2, 3, 4, 5].map(function (i) { return '<div class="ax">' + i + '</div>'; }).join('') + '</div><p class="small muted">Up = more likely, right = bigger impact.</p>';
    var opts = function (key, k, v) { return '<select data-risk="' + key + '" data-k="' + k + '" aria-label="' + k + '">' + [1, 2, 3, 4, 5].map(function (n) { return '<option' + (n === v ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select>'; };
    var pillFor = function (rt) { return '<span class="' + (rt === 'Low' ? 'pill-ok' : rt === 'Medium' ? 'pill-warn' : 'pill-bad') + '">' + esc(rt) + '</span>'; };
    h += '<div class="table-wrap"><table><thead><tr><th>Scenario</th><th>Likelihood</th><th>Impact</th><th>Score</th><th>Controls in place</th><th>Gaps</th></tr></thead><tbody>' + reg.map(function (x) {
      return '<tr><td>' + esc(x.name) + (x.overridden ? ' <button class="btn small" type="button" data-reset="' + x.key + '">reset</button>' : '') + '</td><td>' + opts(x.key, 'likelihood', x.likelihood) + '</td><td>' + opts(x.key, 'impact', x.impact) + '</td><td>' + x.score + ' ' + pillFor(x.rating) + '</td><td>' + esc(x.controls.join('; ')) + '</td><td>' + esc(x.gaps.join('; ')) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
    // BIA
    h += '<h2>Business impact analysis</h2>' + (bia.length ? B.table(bia.map(function (a) { return a; }), [
      { key: 'priority', label: 'Priority', fmt: function (v) { return '<span class="' + (v === 'Critical' ? 'pill-bad' : v === 'High' ? 'pill-warn' : 'pill-ok') + '">' + esc(v) + '</span>'; } },
      { key: 'name', label: 'Activity' }, { key: 'mtpd', label: 'Max downtime', fmt: function (v) { return esc(L.hours(v)); } }, { key: 'rto', label: 'RTO', fmt: function (v) { return esc(L.hours(v)); } },
      { key: 'rpo', label: 'RPO', fmt: function (v) { return esc(L.hours(v)); } }, { key: 'dependsOn', label: 'Depends on', fmt: function (v) { return esc(v.join(', ')); } },
      { key: 'issues', label: 'Issues', fmt: function (v) { return v.length ? '<span class="warn">' + esc(v.join('; ')) + '</span>' : '<span class="ok">OK</span>'; } }]) : '<p class="muted">Add critical activities in step 2.</p>');
    h += '<h2>Systems and backups</h2>' + (sys.length ? B.table(sys, [{ key: 'name', label: 'System' }, { key: 'backup', label: 'Backup' }, { key: 'every', label: 'Every', fmt: function (v) { return esc(v == null ? '—' : L.hours(v)); } },
      { key: 'rpoNeeded', label: 'Needed (RPO)', fmt: function (v) { return esc(v == null ? '—' : L.hours(v)); } }, { key: 'offsite', label: 'Offsite', fmt: function (v) { return v ? 'Yes' : '<span class="bad">No</span>'; } },
      { key: 'issues', label: 'Issues', fmt: function (v) { return v.length ? '<span class="warn">' + esc(v.join('; ')) + '</span>' : '<span class="ok">OK</span>'; } }]) : '<p class="muted">Add systems in step 5.</p>');
    // contact tree
    h += '<h2>Contact tree</h2>' + (tree ? '<div class="panel tree">' + L.treeLines(tree).map(function (l) { return '<div style="padding-left:' + (l.depth * 20) + 'px">' + (l.depth ? '↳ ' : '☎ ') + esc(l.text) + '</div>'; }).join('') +
      (tree.suppliers.length ? '<p class="small" style="margin-bottom:0"><b>Coordinator also calls critical suppliers:</b> ' + esc(tree.suppliers.map(function (s) { return s.name + (s.phone ? ' (' + s.phone + ')' : ''); }).join(', ')) + '</p>' : '') + '</div>' : '<p class="muted">Add people in step 3.</p>');
    // checklists
    h += '<h2>Incident response checklists</h2><div class="row"><label for="ckSel" style="margin:0">Scenario</label><select id="ckSel" style="width:auto">' + reg.map(function (x) { return '<option value="' + x.key + '">' + esc(x.name) + '</option>'; }).join('') + '</select>' +
      '<button class="btn small" type="button" id="ckPrint">Print this checklist</button></div><div id="ck"></div>';
    // tests
    h += '<h2>Testing schedule</h2>' + B.table(sched, [{ key: 'what', label: 'Test' }, { key: 'how', label: 'How' }, { key: 'every', label: 'Every', fmt: function (v) { return esc(v + ' months'); } }, { key: 'next', label: 'Next due' }]) +
      '<div class="row" style="margin-top:8px"><button class="btn small" type="button" id="icsTests">Add test dates to calendar (.ics)</button></div>';
    h += '<h3>Test log</h3>' + (plan.tests.length ? B.table(plan.tests.map(function (t, i) { return { date: t.date, what: t.what, result: t.result, i: i }; }), [{ key: 'date', label: 'Date' }, { key: 'what', label: 'Test' }, { key: 'result', label: 'Result / lessons' },
      { key: 'i', label: '', fmt: function (v) { return '<button class="btn small" type="button" data-deltest="' + v + '">Remove</button>'; } }]) : '<p class="muted">No tests logged yet.</p>') +
      '<div class="form-grid"><div><label for="t-date">Date</label><input type="date" id="t-date" value="' + today() + '"></div><div><label for="t-what">Test</label><select id="t-what">' + sched.map(function (s) { return '<option>' + esc(s.what) + '</option>'; }).join('') + '</select></div>' +
      '<div class="full"><label for="t-result">Result / lessons</label><input type="text" id="t-result" placeholder="e.g. Restored Xero file in 10 min; two phone numbers were wrong"></div></div><button class="btn small" type="button" id="addTest" style="margin-top:8px">Log test</button>';
    $('#results').innerHTML = h;
    var sel = $('#ckSel'); if (renderResults.ck) sel.value = renderResults.ck; renderChecklist();
    sel.addEventListener('change', function () { renderResults.ck = sel.value; renderChecklist(); });
    renderPlan();
  }
  function checklistHtml(key) {
    var c = L.checklist(key, plan);
    return '<h3>' + esc(c.name) + '</h3>' + c.phases.map(function (p) { return '<div class="phase"><b>' + esc(p.title) + '</b><ol>' + p.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></div>'; }).join('');
  }
  function renderChecklist() { $('#ck').innerHTML = '<div class="panel">' + checklistHtml($('#ckSel').value) + '</div>'; }
  function printHtml(html) {
    var f = B.h('iframe', { title: 'Print', style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0' });
    f.addEventListener('load', function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { B.toast('Printing was blocked. Use Download HTML instead.'); } setTimeout(function () { f.remove(); }, 60000); });
    f.srcdoc = html; document.body.appendChild(f);
  }
  function onResultsEvent(e) {
    var el = e.target;
    if (e.type === 'change' && el.dataset.risk) { var o = plan.risks[el.dataset.risk] = plan.risks[el.dataset.risk] || {}; o[el.dataset.k] = +el.value; save(); renderResults(); return; }
    if (e.type !== 'click') return;
    var b = el.closest('button'); if (!b) return;
    if (b.dataset.reset) { delete plan.risks[b.dataset.reset]; save(); renderResults(); }
    else if (b.id === 'ckPrint') printHtml('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Checklist</title><style>body{font:15px/1.5 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px}li{margin:6px 0}</style></head><body><p>' + esc(plan.business.name || '') + ' — incident checklist</p>' + checklistHtml($('#ckSel').value) + '</body></html>');
    else if (b.id === 'addTest') { plan.tests.push({ id: B.uid(), date: $('#t-date').value || today(), what: $('#t-what').value, result: $('#t-result').value.trim() }); plan.tests.sort(function (a, c) { return a.date < c.date ? -1 : 1; }); save(); renderResults(); B.toast('Test logged'); }
    else if (b.dataset.deltest != null) { plan.tests.splice(+b.dataset.deltest, 1); save(); renderResults(); }
    else if (b.id === 'icsTests') {
      B.download('continuity-tests.ics', L.testsICS(plan, today()), 'text/calendar;charset=utf-8');
    }
  }

  // ---------- plan document ----------
  function renderPlan() {
    var box = $('#planPreview'), f = box.querySelector('iframe');
    if (!f) { f = B.h('iframe', { title: 'Plan preview', style: 'width:100%;border:1px solid var(--line);border-radius:8px;min-height:500px;background:#fff' }); box.appendChild(f); f.addEventListener('load', function () { try { f.style.height = (f.contentDocument.documentElement.scrollHeight + 20) + 'px'; } catch (e) {} }); }
    f.srcdoc = L.planHtml(plan, today());
  }
  function fileBase() { return 'continuity-plan-' + ((plan.business.name || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'business'); }

  function renderAll() { renderForm('business'); renderForm('premises'); renderForm('comms'); Object.keys(LISTS).forEach(renderList); renderResults(); }

  function init() {
    // step nav for the form panels
    ['business', 'premises'].forEach(function (n) { $('[data-panel="' + n + '"]').insertAdjacentHTML('beforeend', '<div id="nav-' + n + '">' + stepNav(n) + '</div>'); });
    showTab = B.tabs($('.tabs'), function (id) { if (id === 'plan') renderPlan(); });
    renderAll();
    bindForm('business'); bindForm('premises'); bindForm('comms'); Object.keys(LISTS).forEach(bindList);
    document.addEventListener('click', function (e) { var b = e.target.closest('[data-go]'); if (b) { showTab(b.dataset.go); window.scrollTo(0, $('.tabs').offsetTop - 10); } });
    $('#results').addEventListener('change', onResultsEvent); $('#results').addEventListener('click', onResultsEvent);
    $('#sample').addEventListener('click', function () {
      if ((plan.activities.length || plan.people.length) && !confirm('Replace your answers with the sample plan?')) return;
      plan = L.samplePlan(today()); save(); renderAll(); showTab('results'); B.toast('Sample loaded (made-up clinic)');
    });
    $('#clearAll').addEventListener('click', function () { if (!confirm('Delete all answers in this browser and start again?')) return; B.store.remove(KEY); plan = L.normalize(null); renderAll(); showTab('business'); });
    $('#exportJson').addEventListener('click', function () { B.download(fileBase() + '-backup.json', JSON.stringify({ app: 'continuity-planner', version: 1, data: plan }, null, 2), 'application/json'); });
    $('#importJson').addEventListener('change', function () {
      var f = this.files[0]; this.value = ''; if (!f) return;
      B.readFile(f).then(function (t) {
        var j = JSON.parse(t); if (!j || j.app !== 'continuity-planner' || !j.data) throw new Error('not a Continuity Planner backup');
        plan = L.normalize(j.data); save(); renderAll(); B.toast('Backup imported');
      }).catch(function (e) { B.toast('Could not import: ' + e.message, 4000); });
    });
    $('#planPrint').addEventListener('click', function () { printHtml(L.planHtml(plan, today())); });
    $('#planHtml').addEventListener('click', function () { B.download(fileBase() + '.html', L.planHtml(plan, today()), 'text/html;charset=utf-8'); });
    $('#planMd').addEventListener('click', function () { B.download(fileBase() + '.md', L.planMarkdown(plan, today()), 'text/markdown;charset=utf-8'); });
    $('#planCopy').addEventListener('click', function () { B.copy(L.planMarkdown(plan, today())); });
    $('#markReviewed').addEventListener('click', function () { plan.business.reviewed = today(); save(); renderForm('business'); renderResults(); B.toast('Marked reviewed'); });
  }
  init();
})();
