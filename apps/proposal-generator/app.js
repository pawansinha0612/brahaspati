/* Proposal Generator — page wiring. Logic lives in lib.js (ProposalLib). */
(function () {
  'use strict';
  var L = window.ProposalLib, $ = B.$, esc = B.esc, money = L.money;
  var KEY = 'proposals:data';
  var data = load(), cur = null, ex = null, showTab, saveTimer;

  function load() {
    var d = B.store.get(KEY, null) || {};
    return { profile: Object.assign({}, L.DEFAULT_PROFILE, d.profile || {}), proposals: d.proposals || [], current: d.current || null, brief: d.brief || '' };
  }
  function save() { if (!B.store.set(KEY, data)) B.toast('Could not save — browser storage may be full. Download a backup.', 4000); }
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(function () { save(); renderPicker(); }, 400); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function find(id) { return data.proposals.filter(function (p) { return p.id === id; })[0]; }
  function select(id) { cur = find(id) || data.proposals[0] || null; data.current = cur ? cur.id : null; save(); renderPicker(); renderEditor(); if (B.store.get('tab:' + location.pathname + 'prop') === 'preview') renderPreview(); }
  function fileBase() { return 'proposal-' + (cur.ref || '') + '-' + (cur.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }
  function rolesOptions(sel) { return (data.profile.rates || []).map(function (r) { return '<option' + (r.role === sel ? ' selected' : '') + '>' + esc(r.role) + '</option>'; }).join('') + (sel && !(data.profile.rates || []).some(function (r) { return r.role === sel; }) ? '<option selected>' + esc(sel) + '</option>' : ''); }

  // ---------- picker ----------
  function renderPicker() {
    $('#pick').innerHTML = data.proposals.length ? data.proposals.map(function (p) { return '<option value="' + esc(p.id) + '"' + (cur && p.id === cur.id ? ' selected' : '') + '>' + esc(p.ref + ' · ' + (p.client.company || p.client.name || 'Client') + ' — ' + p.title) + '</option>'; }).join('') : '<option value="">No proposals yet</option>';
  }

  // ---------- brief ----------
  function readBrief() {
    var t = $('#brief').value; data.brief = t; save();
    if (t.trim().length < 20) { $('#extracted').innerHTML = '<p class="muted">Paste a brief first.</p>'; return null; }
    ex = L.extract(t);
    var PR = { Must: 'pill-bad', Should: 'pill-warn', Could: 'pill-mute' };
    var h = '<div class="cols-2"><div class="panel"><h3 style="margin-top:0">Requirements found (' + ex.requirements.length + ')</h3>' +
      (ex.requirements.length ? '<ul class="ex">' + ex.requirements.map(function (r) { return '<li><span class="' + PR[r.priority] + '">' + r.priority + '</span> ' + esc(r.text) + '</li>'; }).join('') + '</ul>' : '<p class="muted">None found. Add them in the editor after building.</p>') + '</div>';
    h += '<div class="panel"><h3 style="margin-top:0">Client</h3><p>' + esc([ex.client.name, ex.client.company, ex.client.email, ex.client.phone].filter(Boolean).join(' · ') || 'Not found') + '</p>' +
      '<h3>Budget</h3><p>' + (ex.budget ? esc(ex.budget.text) : '<span class="muted">No budget mentioned.</span>') + '</p>' +
      '<h3>Timing</h3>' + (ex.dates.length ? '<ul class="ex">' + ex.dates.map(function (d) { return '<li><b>' + esc(d.text) + '</b></li>'; }).join('') + '</ul>' : '<p class="muted">No dates or timeframes found.</p>') +
      (ex.targetWeeks ? '<p class="small">Target length: about ' + ex.targetWeeks + ' weeks — the timeline will be fitted to this.</p>' : '') + '</div></div>';
    if (ex.constraints.length) h += '<div class="panel"><h3 style="margin-top:0">Constraints</h3><ul class="ex">' + ex.constraints.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></div>';
    if (ex.deliverables.length) h += '<div class="panel"><h3 style="margin-top:0">Likely deliverables</h3><ul class="ex">' + ex.deliverables.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></div>';
    $('#extracted').innerHTML = h;
    return ex;
  }
  function buildFromBrief() {
    var e = readBrief(); if (!e) return;
    var seq = data.proposals.filter(function (p) { return p.date === today(); }).length + 1;
    var p = L.build(e, data.profile, { id: B.uid(), date: today(), seq: seq, brief: $('#brief').value });
    data.proposals.unshift(p); select(p.id); showTab('edit'); B.toast('Proposal drafted — check and edit each section');
  }

  // ---------- editor ----------
  function getPath(o, path) { return path.split('.').reduce(function (x, k) { return x == null ? x : x[k]; }, o); }
  function setPath(o, path, v) { var ks = path.split('.'); for (var i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = v; }
  function f(path, label, type, extra) { var v = getPath(cur, path); return '<div' + (extra && extra.full ? ' class="full"' : '') + '><label>' + esc(label) + '</label><input type="' + (type || 'text') + '" data-k="' + path + '" value="' + esc(v == null ? '' : v) + '"' + (extra && extra.attrs || '') + '></div>'; }
  function list(path, label, hint, h) { return '<label>' + esc(label) + '</label>' + (hint ? '<p class="small muted" style="margin:0 0 4px">' + esc(hint) + '</p>' : '') + '<textarea class="prose" data-list="' + path + '" style="min-height:' + (h || 110) + 'px">' + esc((getPath(cur, path) || []).join('\n')) + '</textarea>'; }
  function renderEditor() {
    var ed = $('#editor');
    if (!cur) { ed.innerHTML = '<div class="panel"><p>No proposal yet. Paste a brief on the <b>Brief</b> tab and press <b>Build proposal</b>, or press <b>Load sample data</b>.</p></div>'; return; }
    var p = cur, tiers = ['good', 'better', 'best'];
    var h = '<div class="panel"><h3 style="margin-top:0">Cover</h3><div class="form-grid">' + f('title', 'Proposal title', 'text', { full: true }) + f('client.name', 'Client contact') + f('client.company', 'Client business') + f('client.email', 'Client email', 'email') +
      f('ref', 'Reference') + f('date', 'Date', 'date') + '<div><label>Status</label><select data-k="status">' + ['draft', 'sent', 'accepted', 'declined'].map(function (s) { return '<option' + (p.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div></div></div>';
    h += '<div class="panel"><h3 style="margin-top:0">Your needs (our understanding)</h3><textarea class="prose" data-k="understanding" style="min-height:140px">' + esc(p.understanding) + '</textarea><div id="aiBox" class="row" style="margin-top:8px"></div><div id="aiOut"></div>' +
      '<h3>Requirements</h3><div class="rows" id="reqRows">' + p.requirements.map(function (r, i) {
        return '<div class="r req"><select data-k="requirements.' + i + '.priority" aria-label="Priority">' + ['Must', 'Should', 'Could'].map(function (x) { return '<option' + (r.priority === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>' +
          '<input type="text" data-k="requirements.' + i + '.text" aria-label="Requirement" value="' + esc(r.text) + '"><button class="btn small" type="button" data-rm="requirements:' + i + '" aria-label="Remove requirement">✕</button></div>';
      }).join('') + '</div><button class="btn small" type="button" data-add="requirements">+ Add requirement</button> <button class="btn small" type="button" id="syncTiers">Update scope and options from requirements</button></div>';
    h += '<div class="panel"><h3 style="margin-top:0">Scope and deliverables</h3><div class="cols-2"><div>' + list('scopeIn', 'In scope', 'One item per line') + '</div><div>' + list('scopeOut', 'Not in scope', 'Saying what is excluded prevents arguments later') + '</div></div>' + list('deliverables', 'Deliverables', 'What the client receives') + '</div>';
    h += '<div class="panel"><h3 style="margin-top:0">Approach and timeline</h3><div class="rows"><div class="r ph head"><span>Phase</span><span>Weeks</span><span>Hours</span><span>Role</span><span>Overlap</span><span></span></div>' + p.phases.map(function (ph, i) {
      var q = 'phases.' + i;
      return '<div class="r ph"><input type="text" data-k="' + q + '.name" aria-label="Phase name" value="' + esc(ph.name) + '"><label class="ml"><span>Weeks</span><input type="number" min="0" step="1" data-k="' + q + '.weeks" aria-label="Weeks" value="' + esc(ph.weeks) + '"></label><label class="ml"><span>Hours</span><input type="number" min="0" step="1" data-k="' + q + '.hours" aria-label="Hours" value="' + esc(ph.hours) + '"></label>' +
        '<label class="ml"><span>Role</span><select data-k="' + q + '.role" aria-label="Role">' + rolesOptions(ph.role) + '</select></label><label class="check" title="Runs alongside the previous phase"><input type="checkbox" data-k="' + q + '.parallel"' + (ph.parallel ? ' checked' : '') + (i === 0 ? ' disabled' : '') + '> with previous</label>' +
        '<button class="btn small" type="button" data-rm="phases:' + i + '" aria-label="Remove phase">✕</button><input class="desc" type="text" data-k="' + q + '.desc" aria-label="What happens in this phase" placeholder="What happens in this phase" value="' + esc(ph.desc || '') + '"></div>';
    }).join('') + '</div><button class="btn small" type="button" data-add="phases">+ Add phase</button><div id="gantt" style="margin-top:12px"></div></div>';
    h += '<div class="panel"><h3 style="margin-top:0">Team and roles</h3><div class="rows"><div class="r tm head"><span>Role</span><span>Who</span><span>Responsibility</span><span></span></div>' + p.team.map(function (t, i) {
      return '<div class="r tm"><input type="text" data-k="team.' + i + '.role" aria-label="Role" value="' + esc(t.role) + '"><input type="text" data-k="team.' + i + '.who" aria-label="Who" value="' + esc(t.who || '') + '"><input type="text" data-k="team.' + i + '.responsibility" aria-label="Responsibility" value="' + esc(t.responsibility || '') + '"><button class="btn small" type="button" data-rm="team:' + i + '" aria-label="Remove">✕</button></div>';
    }).join('') + '</div><button class="btn small" type="button" data-add="team">+ Add person</button></div>';
    h += '<div class="panel"><h3 style="margin-top:0">Assumptions and risks</h3>' + list('assumptions', 'Assumptions', 'One per line', 130) +
      '<label>Risks</label><p class="small muted" style="margin:0 0 4px">One per line: risk — how you manage it</p><textarea class="prose" id="risksBox" style="min-height:110px">' + esc(p.risks.map(function (r) { return r.risk + (r.mitigation ? ' — ' + r.mitigation : ''); }).join('\n')) + '</textarea></div>';
    h += '<div class="panel"><h3 style="margin-top:0">Pricing</h3><div class="row">' + ['tiers', 'fixed', 'milestones', 'tm'].map(function (k) { return '<label class="check"><input type="checkbox" data-k="pricing.show.' + k + '"' + (p.pricing.show[k] ? ' checked' : '') + '> ' + { tiers: 'Good / better / best options', fixed: 'Fixed price', milestones: 'Milestone payments', tm: 'Time and materials' }[k] + '</label>'; }).join('') + '</div>' +
      '<div class="form-grid">' + f('pricing.contingency', 'Contingency (%)', 'number', { attrs: ' min="0" max="100"' }) + f('pricing.deposit', 'Deposit (%)', 'number', { attrs: ' min="0" max="100"' }) +
      '<div><label>Recommended option</label><select data-k="pricing.recommended">' + tiers.map(function (k) { return '<option value="' + k + '"' + (p.pricing.recommended === k ? ' selected' : '') + '>' + esc(p.tiers[k].name) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="tiers" style="margin-top:10px">' + tiers.map(function (k) {
        return '<div><div class="form-grid" style="grid-template-columns:1fr 90px">' + f('tiers.' + k + '.name', 'Option name') + f('pricing.tierFactors.' + k, '× price', 'number', { attrs: ' min="0" step="0.05"' }) + '</div>' + list('tiers.' + k + '.items', 'Includes', '', 120) + '</div>';
      }).join('') + '</div><p class="small muted">Option prices are the fixed price × the multiplier, rounded to $50. Rates come from <b>Your business</b>.</p>' +
      '<label>Terms (one per line)</label><textarea class="prose" data-k="terms" style="min-height:120px">' + esc(p.terms) + '</textarea>' +
      '<div class="sticky-sum" id="sum"></div></div>';
    ed.innerHTML = h;
    renderLive();
    if (B.ai) B.ai.button($('#aiBox'), 'Polish wording', function () {
      return 'Rewrite this proposal section for a small-business client in clear, warm, confident Australian English. Keep every fact, number and requirement; do not add promises, prices or features. Two short paragraphs at most. Return only the text.\n\n' + cur.understanding;
    }, function (ans) {
      var box = $('#aiOut'); box.innerHTML = '<div class="panel"><p class="small muted">AI suggestion — check it before using:</p><div style="white-space:pre-wrap">' + esc(ans.trim()) + '</div><div class="row" style="margin-top:8px"><button class="btn small primary" type="button" id="useAi">Use this</button><button class="btn small" type="button" id="dropAi">Discard</button></div></div>';
      $('#useAi').addEventListener('click', function () { cur.understanding = ans.trim(); save(); renderEditor(); });
      $('#dropAi').addEventListener('click', function () { box.innerHTML = ''; });
    });
  }
  function renderLive() {
    if (!cur || !$('#sum')) return;
    var g = L.gantt(cur.phases), pr = L.pricing(cur, data.profile), gw = pr.gstRate ? ' + GST' : '';
    $('#gantt').innerHTML = '<div class="gantt">' + g.bars.map(function (b) { return '<span>' + esc(b.name) + ' <span class="muted">wk ' + (b.start + 1) + (b.weeks > 1 ? '–' + b.end : '') + '</span></span><div class="track"><div class="bar" style="left:' + (b.start / (g.totalWeeks || 1) * 100) + '%;width:' + (b.weeks / (g.totalWeeks || 1) * 100) + '%"></div></div>'; }).join('') + '</div><p class="small muted">Total: ' + g.totalWeeks + ' weeks' + (cur.targetWeeks ? ' (client asked for about ' + cur.targetWeeks + ')' : '') + '.</p>';
    var rec = pr.tiers.filter(function (t) { return t.key === cur.pricing.recommended; })[0], warn = '';
    if (cur.budget && rec) {
      var top = cur.budget.max || cur.budget.min;
      if (top && rec.price > top * 1.0001) warn = ' <span class="pill-warn">' + esc(rec.name) + ' is ' + money(rec.price - top) + ' over their budget (' + money(top) + ')</span>';
      else if (top) warn = ' <span class="pill-ok">within their budget</span>';
    }
    if (cur.targetWeeks && g.totalWeeks > cur.targetWeeks) warn += ' <span class="pill-warn">' + g.totalWeeks + ' weeks — longer than the ' + cur.targetWeeks + ' they asked for</span>';
    $('#sum').innerHTML = '<b>' + pr.hours + ' h</b> estimated · cost at rates ' + money(pr.base) + ' · fixed price <b>' + money(pr.fixed) + gw + '</b> · options ' + pr.tiers.map(function (t) { return esc(t.name) + ' ' + money(t.price); }).join(' / ') + warn;
  }

  // editor events (delegated)
  $('#editor').addEventListener('input', function (e) {
    var t = e.target; if (!cur) return;
    if (t.dataset.k) { var v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? (t.value === '' ? 0 : +t.value) : t.value; setPath(cur, t.dataset.k, v); }
    else if (t.dataset.list) setPath(cur, t.dataset.list, t.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean));
    else if (t.id === 'risksBox') cur.risks = t.value.split('\n').map(function (l) { var m = l.split(/\s+[—–-]\s+/); return { risk: m[0].trim(), mitigation: m.slice(1).join(' — ').trim() }; }).filter(function (r) { return r.risk; });
    else return;
    renderLive(); saveSoon();
  });
  $('#editor').addEventListener('change', function (e) { var t = e.target; if (t.dataset.k && (t.tagName === 'SELECT' || t.type === 'checkbox')) { setPath(cur, t.dataset.k, t.type === 'checkbox' ? t.checked : t.value); renderLive(); saveSoon(); if (/pricing\.recommended|tiers\..*\.name/.test(t.dataset.k)) renderEditor(); } });
  $('#editor').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !cur) return;
    if (b.dataset.rm) { var x = b.dataset.rm.split(':'); cur[x[0]].splice(+x[1], 1); }
    else if (b.dataset.add === 'requirements') cur.requirements.push({ text: '', priority: 'Must' });
    else if (b.dataset.add === 'phases') { var r0 = (data.profile.rates[0] || {}).role || 'Specialist'; cur.phases.push({ name: 'New phase', weeks: 1, hours: data.profile.hoursPerWeek || 20, role: r0, desc: '', parallel: false }); }
    else if (b.dataset.add === 'team') cur.team.push({ role: '', who: '', responsibility: '' });
    else if (b.id === 'syncTiers') {
      var rq = cur.requirements.filter(function (r) { return r.text.trim(); }), by = function (ps) { return rq.filter(function (r) { return ps.indexOf(r.priority) >= 0; }).map(function (r) { return r.text; }); };
      cur.scopeIn = by(['Must', 'Should']); cur.tiers.good.items = by(['Must']); cur.tiers.better.items = by(['Must', 'Should']);
      var extra = cur.tiers.best.items.filter(function (i) { return !rq.some(function (r) { return r.text === i; }); });
      cur.tiers.best.items = rq.map(function (r) { return r.text; }).concat(extra.filter(function (i) { return /support/i.test(i); }));
      B.toast('Scope and options updated');
    } else return;
    save(); renderEditor();
  });

  // ---------- preview ----------
  function html() { return L.toHtml(cur, data.profile, { startDate: $('#startDate').value || null }); }
  function renderPreview() { $('#frame').srcdoc = cur ? html() : '<p style="font-family:sans-serif;padding:20px">No proposal yet.</p>'; }
  $('#startDate').addEventListener('change', renderPreview);
  $('#print').addEventListener('click', function () {
    if (!cur) return;
    var fr = B.h('iframe', { title: 'Print', style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0' });
    fr.addEventListener('load', function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { B.toast('Printing was blocked. Use Download instead.'); } setTimeout(function () { fr.remove(); }, 60000); });
    fr.srcdoc = html(); document.body.appendChild(fr);
  });
  $('#dlHtml').addEventListener('click', function () { if (cur) B.download(fileBase() + '.html', html(), 'text/html;charset=utf-8'); });
  $('#dlMd').addEventListener('click', function () { if (cur) B.download(fileBase() + '.md', L.toMarkdown(cur, data.profile), 'text/markdown;charset=utf-8'); });
  $('#copyMd').addEventListener('click', function () { if (cur) B.copy(L.toMarkdown(cur, data.profile)); });
  $('#copyEmail').addEventListener('click', function () { if (cur) B.copy(L.toEmail(cur, data.profile)); });

  // ---------- profile ----------
  function renderProfile() {
    B.$$('[data-pf]').forEach(function (el) { var v = data.profile[el.dataset.pf]; if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : v; });
    $('#logoPrev').innerHTML = data.profile.logo ? '<img class="logo-prev" src="' + esc(data.profile.logo) + '" alt="Logo preview"><button class="btn small" type="button" id="rmLogo">Remove logo</button>' : '';
    var rm = $('#rmLogo'); if (rm) rm.addEventListener('click', function () { data.profile.logo = ''; save(); renderProfile(); });
    $('#rates').innerHTML = '<div class="r rate head"><span>Role</span><span>Rate per hour</span><span></span></div>' + data.profile.rates.map(function (r, i) {
      return '<div class="r rate"><input type="text" data-rate="' + i + '.role" aria-label="Role" value="' + esc(r.role) + '"><input type="number" min="0" step="1" data-rate="' + i + '.rate" aria-label="Rate per hour" value="' + esc(r.rate) + '"><button class="btn small" type="button" data-rmrate="' + i + '" aria-label="Remove role">✕</button></div>';
    }).join('');
  }
  $('#profileForm').addEventListener('input', function (e) { var t = e.target, k = t.dataset.pf; if (!k) return; data.profile[k] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? +t.value : t.value; saveSoon(); });
  $('#profileForm').addEventListener('change', function (e) { var t = e.target; if (t.dataset.pf && t.type === 'checkbox') { data.profile[t.dataset.pf] = t.checked; save(); } });
  $('#rates').addEventListener('input', function (e) { var k = e.target.dataset.rate; if (!k) return; var x = k.split('.'); data.profile.rates[+x[0]][x[1]] = x[1] === 'rate' ? +e.target.value : e.target.value; saveSoon(); });
  $('#rates').addEventListener('click', function (e) { var b = e.target.closest('[data-rmrate]'); if (!b) return; if (data.profile.rates.length <= 1) return B.toast('Keep at least one role'); data.profile.rates.splice(+b.dataset.rmrate, 1); save(); renderProfile(); });
  $('#addRate').addEventListener('click', function () { data.profile.rates.push({ role: 'New role', rate: 100 }); save(); renderProfile(); });
  $('#logoFile').addEventListener('change', function () {
    var file = this.files[0]; this.value = ''; if (!file) return;
    B.readFile(file, 'dataurl').then(function (url) {
      var img = new Image(); img.onload = function () {
        var s = Math.min(1, 400 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        data.profile.logo = /png|svg|gif/i.test(file.type) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85); save(); renderProfile(); B.toast('Logo saved');
      }; img.onerror = function () { B.toast('Could not read that image'); }; img.src = url;
    });
  });

  // ---------- global actions ----------
  $('#sample').addEventListener('click', function () {
    if (!data.profile.name) data.profile = Object.assign({}, L.DEFAULT_PROFILE, L.SAMPLE_PROFILE);
    $('#brief').value = L.SAMPLE_BRIEF; buildFromBrief(); renderProfile(); B.toast('Sample brief loaded (made-up client)');
  });
  $('#newBrief').addEventListener('click', function () { $('#brief').value = ''; $('#extracted').innerHTML = ''; showTab('brief'); $('#brief').focus(); });
  $('#read').addEventListener('click', readBrief);
  $('#buildBtn').addEventListener('click', buildFromBrief);
  $('#brief').addEventListener('input', function () { data.brief = this.value; saveSoon(); });
  $('#pick').addEventListener('change', function () { select(this.value); });
  $('#dup').addEventListener('click', function () { if (!cur) return; var c = JSON.parse(JSON.stringify(cur)); c.id = B.uid(); c.ref = c.ref + '-copy'; c.status = 'draft'; data.proposals.unshift(c); select(c.id); });
  $('#del').addEventListener('click', function () {
    if (!cur || !confirm('Delete proposal ' + cur.ref + '? Export first if you might want it back.')) return;
    data.proposals = data.proposals.filter(function (p) { return p.id !== cur.id; }); select(data.proposals[0] && data.proposals[0].id);
  });
  function dlJson(name, obj) { B.download(name, JSON.stringify(obj, null, 2), 'application/json'); }
  $('#export').addEventListener('click', function () { if (!data.proposals.length) return B.toast('Nothing to export'); dlJson('proposals-' + today() + '.json', { app: 'proposal-generator', version: 1, exported: new Date().toISOString(), proposals: data.proposals }); });
  $('#backup').addEventListener('click', function () { dlJson('proposal-generator-backup-' + today() + '.json', { app: 'proposal-generator', version: 1, exported: new Date().toISOString(), profile: data.profile, proposals: data.proposals }); });
  var imp = B.h('input', { type: 'file', accept: '.json,application/json', hidden: true }); document.body.appendChild(imp);
  var restoreMode = false;
  $('#import').addEventListener('click', function () { restoreMode = false; imp.click(); });
  $('#restore').addEventListener('click', function () { restoreMode = true; imp.click(); });
  imp.addEventListener('change', function () {
    var file = imp.files[0]; imp.value = ''; if (!file) return;
    B.readFile(file).then(function (t) {
      var j = JSON.parse(t), err = L.validateFile(j); if (err) throw new Error(err);
      var list = Array.isArray(j) ? j : j.proposals;
      if (restoreMode) {
        if (!confirm('Replace everything here with this backup (' + list.length + ' proposals' + (j.profile ? ' and your business details' : '') + ')?')) return;
        data.proposals = list; if (j.profile) data.profile = Object.assign({}, L.DEFAULT_PROFILE, j.profile);
      } else list.forEach(function (p) { if (!p.id || find(p.id)) p.id = B.uid(); data.proposals.unshift(p); });
      save(); renderProfile(); select(list[0] && list[0].id); B.toast((restoreMode ? 'Restored ' : 'Imported ') + list.length + ' proposal(s)');
    }).catch(function (e) { B.toast('Could not import: ' + e.message, 4000); });
  });

  showTab = B.tabs($('.tabs'), function (id) { if (id === 'preview') renderPreview(); if (id === 'edit') renderLive(); });
  $('#brief').value = data.brief || '';
  renderProfile();
  select(data.current);
})();
