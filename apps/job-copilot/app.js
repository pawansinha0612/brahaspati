/* Job Application Copilot — page wiring */
(function () {
  'use strict';
  var L = window.JobLib, $ = B.$, esc = B.esc;
  var KEY = 'job-copilot:v1';
  var state = load(), editing = null, view = B.store.get('job-copilot:view', 'board'), lastPrep = null;

  function blank() { return { apps: [], resume: '' }; }
  function load() { var s = B.store.get(KEY, null) || blank(); if (!Array.isArray(s.apps)) s.apps = []; if (typeof s.resume !== 'string') s.resume = ''; return s; }
  function save() { if (!B.store.set(KEY, state)) B.toast('Could not save — browser storage may be full or blocked'); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function shift(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function byId(id) { return state.apps.filter(function (a) { return a.id === id; })[0]; }
  function label(a) { return a.company + ' — ' + a.role; }
  function statusOptions(sel) { return L.STATUSES.map(function (s) { return '<option value="' + s + '"' + (s === sel ? ' selected' : '') + '>' + L.STATUS_LABEL[s] + '</option>'; }).join(''); }
  function appOptions(sel, first) { return (first ? '<option value="">' + esc(first) + '</option>' : '') + state.apps.map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === sel ? ' selected' : '') + '>' + esc(label(a)) + '</option>'; }).join(''); }
  function pct(v) { return v == null ? '–' : Math.round(v * 100) + '%'; }

  // ---------- tracker ----------
  function renderTracker() {
    var st = L.trackerStats(state.apps, today());
    $('#stats').innerHTML = [['Applications', st.total], ['Active', st.active], ['Response rate', pct(st.responseRate)], ['Interview rate', pct(st.interviewRate)], ['Offers', st.byStatus.offer], ['Avg days to reply', st.avgDaysToReply == null ? '–' : st.avgDaysToReply]]
      .map(function (s) { return '<div class="stat"><div class="k">' + s[0] + '</div><div class="v">' + esc(s[1]) + '</div></div>'; }).join('');
    var al = [];
    st.overdue.forEach(function (a) { al.push('<li><span class="pill-bad">Overdue</span> ' + esc(a.next || 'Next action') + ' — <a href="#" data-edit="' + esc(a.id) + '">' + esc(label(a)) + '</a> (was due ' + esc(a.nextDate) + ')</li>'); });
    st.stale.forEach(function (a) { al.push('<li><span class="pill-warn">No reply</span> ' + esc(label(a)) + ' — applied ' + L.daysBetween(a.applied, today()) + ' days ago. A short, polite follow-up is fine now.</li>'); });
    $('#alerts').innerHTML = al.length ? '<div class="panel"><ul style="margin:0;padding-left:18px">' + al.join('') + '</ul></div>' : '';
    B.$$('[data-view]').forEach(function (b) { b.classList.toggle('primary', b.dataset.view === view); });
    var q = $('#search').value.trim().toLowerCase();
    var apps = state.apps.filter(function (a) { return !q || label(a).toLowerCase().indexOf(q) >= 0; });
    if (!state.apps.length) { $('#board').innerHTML = '<div class="panel"><p>No applications yet. Add one, or load the sample data to look around.</p></div>'; return; }
    if (view === 'board') {
      $('#board').innerHTML = '<div class="jc-board">' + L.STATUSES.map(function (s) {
        var list = apps.filter(function (a) { return a.status === s; });
        return '<div class="jc-col"><h3><span>' + L.STATUS_LABEL[s] + '</span><span class="muted">' + list.length + '</span></h3>' + list.map(card).join('') + '</div>';
      }).join('') + '</div>';
    } else {
      $('#board').innerHTML = '<div style="margin-top:12px">' + B.table(apps.slice().sort(function (a, b) { return (b.applied || '').localeCompare(a.applied || ''); }), [
        { key: 'company', label: 'Company', fmt: function (v, r) { return '<a href="#" data-edit="' + esc(r.id) + '">' + esc(v) + '</a>'; } },
        { key: 'role', label: 'Role', fmt: function (v, r) { return r.link ? '<a href="' + esc(r.link) + '" target="_blank" rel="noopener">' + esc(v) + '</a>' : esc(v); } },
        { key: 'status', label: 'Status', fmt: function (v, r) { return '<select data-move="' + esc(r.id) + '" aria-label="Status">' + statusOptions(v) + '</select>'; } },
        { key: 'applied', label: 'Applied' },
        { key: 'salary', label: 'Salary' },
        { key: 'next', label: 'Next action', fmt: function (v, r) { return esc(v || '') + (r.nextDate ? ' <span class="small muted">' + esc(r.nextDate) + '</span>' : ''); } }
      ]) + '</div>';
    }
  }
  function card(a) {
    var od = a.nextDate && a.nextDate < today() && a.status !== 'offer' && a.status !== 'rejected';
    return '<div class="jc-card"><strong>' + esc(a.company) + '</strong>' + esc(a.role) +
      (a.next ? '<div class="jc-next ' + (od ? 'bad' : 'muted') + '">→ ' + esc(a.next) + (a.nextDate ? ' (' + esc(a.nextDate) + ')' : '') + '</div>' : '') +
      '<div class="row" style="gap:6px;margin-top:4px"><select data-move="' + esc(a.id) + '" aria-label="Move ' + esc(a.company) + '">' + statusOptions(a.status) + '</select>' +
      '<button class="btn small" type="button" data-edit="' + esc(a.id) + '">Edit</button></div></div>';
  }
  $('#board').addEventListener('change', function (e) {
    var id = e.target.getAttribute('data-move'); if (!id) return;
    state.apps = state.apps.map(function (a) { return a.id === id ? L.setStatus(a, e.target.value, today()) : a; }); save(); renderTracker();
  });
  document.addEventListener('click', function (e) { var id = e.target.getAttribute && e.target.getAttribute('data-edit'); if (id) { e.preventDefault(); openDialog(byId(id)); } });
  B.$$('[data-view]').forEach(function (b) { b.addEventListener('click', function () { view = b.dataset.view; B.store.set('job-copilot:view', view); renderTracker(); }); });
  $('#search').addEventListener('input', renderTracker);

  var F = { company: '#fCompany', role: '#fRole', status: '#fStatus', applied: '#fApplied', link: '#fLink', salary: '#fSalary', source: '#fSource', next: '#fNext', nextDate: '#fNextDate', contact: '#fContact', notes: '#fNotes', jd: '#fJd' };
  $('#fStatus').innerHTML = statusOptions('saved');
  function openDialog(a) {
    editing = a || null;
    $('#dlgTitle').textContent = a ? 'Edit application' : 'New application';
    Object.keys(F).forEach(function (k) { $(F[k]).value = a ? (a[k] || '') : ''; });
    if (!a) { $('#fStatus').value = 'applied'; $('#fApplied').value = today(); }
    $('#dlgDelete').hidden = !a;
    var d = $('#dlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }
  function closeDialog() { var d = $('#dlg'); if (d.close) d.close(); else d.removeAttribute('open'); }
  $('#addApp').addEventListener('click', function () { openDialog(null); });
  $('#dlgCancel').addEventListener('click', closeDialog);
  $('#dlgDelete').addEventListener('click', function () {
    if (!editing || !confirm('Delete ' + label(editing) + '?')) return;
    state.apps = state.apps.filter(function (a) { return a.id !== editing.id; }); save(); closeDialog(); renderAll();
  });
  $('#appForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = {}; Object.keys(F).forEach(function (k) { v[k] = $(F[k]).value.trim(); });
    if (!v.company || !v.role) return;
    if (editing) {
      var a = L.setStatus(editing, v.status, today()); Object.assign(a, v);
      state.apps = state.apps.map(function (x) { return x.id === a.id ? a : x; });
    } else {
      var n = Object.assign({ id: B.uid(), history: [], feedback: [], created: today() }, v);
      if (v.status !== 'saved') n.history.push({ status: v.status, date: v.applied || today() });
      state.apps.push(n);
    }
    save(); closeDialog(); renderAll(); B.toast('Saved');
  });

  // ---------- resume match ----------
  $('#resume').value = state.resume;
  $('#resume').addEventListener('input', function () { state.resume = $('#resume').value; save(); });
  B.dropZone($('#resumeDrop'), function (files) {
    var f = files[0], name = f.name.toLowerCase(), p;
    if (/\.docx$/.test(name)) p = Promise.all([B.lib.mammoth(), B.readFile(f, 'buffer')]).then(function (r) { return r[0].extractRawText({ arrayBuffer: r[1] }); }).then(function (r) { return r.value; });
    else if (/\.pdf$/.test(name)) p = Promise.all([B.lib.pdfjs(), B.readFile(f, 'buffer')]).then(function (r) {
      return r[0].getDocument({ data: r[1] }).promise.then(function (pdf) {
        var pages = []; for (var i = 1; i <= pdf.numPages; i++) pages.push(pdf.getPage(i).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
          var out = '', lastY = null; tc.items.forEach(function (it) { var y = it.transform[5]; if (lastY != null && Math.abs(y - lastY) > 2) out += '\n'; else if (out) out += ' '; out += it.str; lastY = y; }); return out;
        }));
        return Promise.all(pages).then(function (t) { return t.join('\n'); });
      });
    });
    else p = B.readFile(f);
    p.then(function (text) { $('#resume').value = text.trim(); state.resume = $('#resume').value; save(); B.toast('Resume text loaded — check it looks right'); }, function (err) { B.toast('Could not read the file: ' + err.message, 4000); });
  }, { accept: '.docx,.pdf,.txt,.md' });
  $('#jdPick').addEventListener('change', function () { var a = byId($('#jdPick').value); if (a) $('#jd').value = a.jd || ''; if (a && !a.jd) B.toast('That application has no job ad saved yet — paste it below'); });
  $('#saveJd').addEventListener('click', function () {
    var a = byId($('#jdPick').value), jd = $('#jd').value.trim();
    if (!jd) { B.toast('Paste a job ad first'); return; }
    if (!a) { openDialog(null); $('#fJd').value = jd; return; }
    a.jd = jd; save(); B.toast('Saved to ' + label(a));
  });
  function chip(s, cls) { return '<span class="jc-chip ' + cls + (s.required ? ' req' : '') + '" title="' + esc((L.CAT_LABEL[s.cat] || '') + (s.count ? ' · mentioned ' + s.count + '×' : '')) + '">' + esc(s.name) + '</span>'; }
  function renderMatch() {
    var resume = $('#resume').value, jd = $('#jd').value;
    if (!resume.trim() || !jd.trim()) { $('#matchOut').innerHTML = '<div class="panel"><p>Paste both your resume and the job ad, then press “Check the match”.</p></div>'; return; }
    var m = L.matchResume(resume, jd), cls = m.score >= 70 ? 'ok' : m.score >= 45 ? 'warn' : 'bad';
    var reqRows = m.requirements.map(function (r) {
      var p = r.status === 'met' ? '<span class="pill-ok">Looks met</span>' : r.status === 'gap' ? '<span class="pill-bad">Gap</span>' : '<span class="pill-warn">Check</span>';
      return '<tr><td>' + p + (r.nice ? ' <span class="tag">nice to have</span>' : '') + '</td><td>' + esc(r.line) + (r.note ? '<br><span class="small muted">' + esc(r.note) + '</span>' : '') + '</td></tr>';
    }).join('');
    var sug = m.suggestions.map(function (s) {
      return '<li>' + (s.kind === 'bullet' ? '<strong>' + esc(s.skill) + ':</strong> “' + esc(s.text) + '” <span class="small muted">' + esc(s.why) + '</span>' : esc(s.text) + (s.example ? '<br><span class="small muted">e.g. “' + esc(s.example) + '”</span>' : '')) + '</li>';
    }).join('');
    $('#matchOut').innerHTML =
      '<div class="panel"><div class="row" style="gap:20px"><div><div class="jc-score ' + cls + '">' + m.score + '%</div><div class="small muted">overall match</div></div>' +
      '<div class="small">Skills: <strong>' + (m.skillScore == null ? '–' : m.skillScore + '%') + '</strong> (weighted by how often the ad mentions each one; ★ = listed as a requirement)<br>Repeated ad wording: <strong>' + (m.keywordScore == null ? '–' : m.keywordScore + '%') + '</strong></div></div>' +
      '<p class="small muted">This is a word match, not a judgement of you. A score around 60–75% with the key requirements met is usually strong enough to apply.</p></div>' +
      '<div class="cols-2"><div class="panel"><h3 style="margin-top:0">In your resume (' + m.matched.length + ')</h3><div class="jc-chips">' + (m.matched.map(function (s) { return chip(s, 'have'); }).join('') || '<span class="muted">None yet</span>') + '</div></div>' +
      '<div class="panel"><h3 style="margin-top:0">Missing (' + m.missing.length + ')</h3><div class="jc-chips">' + (m.missing.map(function (s) { return chip(s, 'miss'); }).join('') || '<span class="ok">Nothing missing</span>') + '</div></div></div>' +
      (m.keywords.length ? '<div class="panel"><h3 style="margin-top:0">Words the ad repeats</h3><div class="jc-chips">' + m.keywords.map(function (k) { return '<span class="jc-chip ' + (k.inResume ? 'have' : 'miss') + '">' + esc(k.term) + '</span>'; }).join('') + '</div></div>' : '') +
      (reqRows ? '<div class="panel"><h3 style="margin-top:0">Requirements in the ad</h3><div class="table-wrap"><table><tbody>' + reqRows + '</tbody></table></div></div>' : '') +
      '<div class="panel" id="sugPanel"><h3 style="margin-top:0">Suggestions</h3><ul>' + (sug || '<li>Your resume already covers this ad well.</li>') + '</ul>' +
      '<p class="small muted">Only add a skill if you genuinely have it. Fill the [brackets] with real details from your work.</p></div>';
    B.ai.button($('#sugPanel'), 'Draft tailored resume bullets', function () {
      return 'Job ad:\n' + jd.slice(0, 6000) + '\n\nResume:\n' + resume.slice(0, 6000) + '\n\nSkills the ad wants that the resume does not show: ' + m.missing.slice(0, 8).map(function (s) { return s.name; }).join(', ') +
        '.\nRewrite up to 5 existing resume bullets so they use the ad\'s wording where truthful, start with strong verbs and include a measurable result. Do not invent experience; where a number is unknown put [X]. Australian English. Return plain bullet points only.';
    }, function (ans) { var box = B.$('#aiBullets') || B.h('div', { id: 'aiBullets' }); box.innerHTML = '<p class="small muted">AI draft — check every claim is true before using it.</p><pre style="white-space:pre-wrap">' + esc(ans) + '</pre>'; $('#sugPanel').appendChild(box); });
  }
  $('#analyse').addEventListener('click', function () { state.resume = $('#resume').value; save(); renderMatch(); });

  // ---------- skill gaps ----------
  function renderGaps() {
    var ads = state.apps.filter(function (a) { return a.jd && a.jd.trim(); }).map(function (a) { return { text: a.jd, label: a.company }; });
    if (!ads.length) { $('#gapOut').innerHTML = '<p class="muted">Save job ad text in at least one application (Edit → Job ad text) to see this.</p>'; return; }
    var gaps = L.skillGaps(ads, state.resume), missing = gaps.filter(function (g) { return !g.inResume; });
    var resumeNote = state.resume.trim() ? '' : '<p class="pill-warn" style="display:inline-block">Add your resume on the Resume match tab to see which of these you are missing.</p>';
    $('#gapOut').innerHTML = resumeNote + '<p>' + ads.length + ' job ads analysed. ' + (state.resume.trim() ? missing.length + ' skills asked for that your resume does not mention.' : '') + '</p>' +
      '<h3>Top gaps</h3>' + (state.resume.trim() ? (missing.length ? B.barChart(missing.slice(0, 15).map(function (g) { return { label: g.name, value: g.ads, color: 'var(--bad)' }; }), { fmt: function (v) { return v + ' of ' + ads.length + ' ads'; } }) : '<p class="ok">None — your resume covers every skill in your saved ads.</p>') : '') +
      '<h3>All skills across your ads</h3>' + B.table(gaps, [
        { key: 'name', label: 'Skill' }, { key: 'cat', label: 'Type', fmt: function (v) { return esc(L.CAT_LABEL[v] || v); } },
        { key: 'ads', label: 'Ads', fmt: function (v) { return v + ' / ' + ads.length; } }, { key: 'mentions', label: 'Mentions' },
        { key: 'inResume', label: 'In resume', fmt: function (v) { return state.resume.trim() ? (v ? '<span class="pill-ok">Yes</span>' : '<span class="pill-bad">No</span>') : '–'; } },
        { key: 'from', label: 'Seen in', fmt: function (v) { return esc(v.join(', ')); } }
      ]);
  }

  // ---------- interview prep ----------
  function renderPrepPick() { var cur = $('#prepPick').value; $('#prepPick').innerHTML = appOptions(cur, 'Pick an application with a saved job ad…'); }
  $('#prepGo').addEventListener('click', function () {
    var a = byId($('#prepPick').value), jd = $('#prepJd').value.trim() || (a && a.jd) || '';
    if (!jd) { B.toast('Pick an application with a job ad, or paste one'); return; }
    var q = L.interviewQuestions(jd, { perSkill: 2, maxSkills: 10, behavioural: 8 }); lastPrep = { q: q, title: a ? label(a) : 'Pasted job ad' };
    var notes = (a && a.prepNotes) || {};
    function item(text, sub, i) { return '<div class="jc-q"><strong>' + esc(text) + '</strong>' + (sub ? '<div class="small muted">' + esc(sub) + '</div>' : '') + '<textarea data-note="' + i + '" placeholder="Your answer notes (STAR)…" aria-label="Answer notes">' + esc(notes[i] || '') + '</textarea></div>'; }
    $('#prepOut').innerHTML = '<div class="panel"><h2 style="margin-top:0">' + esc(lastPrep.title) + '</h2>' +
      '<h3>How to answer: STAR</h3><pre style="white-space:pre-wrap">' + esc(q.star) + '</pre>' +
      '<h3>Technical questions (from the skills in the ad)</h3>' + q.technical.map(function (x, i) { return item(x.q, x.skill, 't' + i); }).join('') +
      '<h3>Behavioural questions</h3>' + q.behavioural.map(function (x, i) { return item(x.q, x.theme, 'b' + i); }).join('') +
      '<h3>Questions to ask them</h3><ul>' + q.askThem.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      (a ? '<p class="small muted">Your notes are saved with this application.</p>' : '<p class="small muted">Pick a saved application to keep your notes.</p>') + '</div>';
    $('#prepOut').oninput = function (e) { var k = e.target.getAttribute('data-note'); if (!k || !a) return; a.prepNotes = a.prepNotes || {}; a.prepNotes[k] = e.target.value; save(); };
  });
  $('#prepCopy').addEventListener('click', function () {
    if (!lastPrep) { B.toast('Make a question list first'); return; }
    var q = lastPrep.q, t = 'Interview prep: ' + lastPrep.title + '\n\nSTAR\n' + q.star + '\n\nTechnical\n' + q.technical.map(function (x) { return '- [' + x.skill + '] ' + x.q; }).join('\n') +
      '\n\nBehavioural\n' + q.behavioural.map(function (x) { return '- ' + x.q; }).join('\n') + '\n\nAsk them\n' + q.askThem.map(function (x) { return '- ' + x; }).join('\n');
    B.copy(t);
  });
  $('#prepPrint').addEventListener('click', function () { window.print(); });

  // ---------- feedback ----------
  function renderFeedback() {
    var cur = $('#fbApp').value; $('#fbApp').innerHTML = appOptions(cur, state.apps.length ? '' : 'Add an application first');
    if (!$('#fbDate').value) $('#fbDate').value = today();
    var all = []; state.apps.forEach(function (a) { (a.feedback || []).forEach(function (f) { all.push({ a: a, f: f }); }); });
    all.sort(function (x, y) { return y.f.date.localeCompare(x.f.date); });
    $('#fbList').innerHTML = all.length ? '<div class="panel"><h2 style="margin-top:0">Interview history</h2>' + all.map(function (x) {
      var f = x.f;
      return '<div class="jc-fb"><strong>' + esc(label(x.a)) + '</strong> · ' + esc(f.round) + ' · ' + esc(f.date) + ' · ' + '★'.repeat(+f.rating || 0) + '<span class="muted">' + '★'.repeat(5 - (+f.rating || 0)) + '</span>' +
        (f.who ? '<div class="small muted">With ' + esc(f.who) + '</div>' : '') +
        (f.asked ? '<p><strong>Asked:</strong> ' + esc(f.asked) + '</p>' : '') + (f.well ? '<p><strong>Went well:</strong> ' + esc(f.well) + '</p>' : '') +
        (f.better ? '<p><strong>Do better:</strong> ' + esc(f.better) + '</p>' : '') + (f.follow ? '<p><strong>Follow-up:</strong> ' + esc(f.follow) + '</p>' : '') +
        '<button class="btn small" type="button" data-fbdel="' + esc(x.a.id) + '|' + esc(f.id) + '">Delete</button></div>';
    }).join('') + '</div>' : '';
  }
  $('#fbForm').addEventListener('submit', function (e) {
    e.preventDefault(); var a = byId($('#fbApp').value); if (!a) { B.toast('Add an application first'); return; }
    a.feedback = a.feedback || [];
    a.feedback.push({ id: B.uid(), date: $('#fbDate').value, round: $('#fbRound').value, who: $('#fbWho').value.trim(), asked: $('#fbAsked').value.trim(), well: $('#fbWell').value.trim(), better: $('#fbBetter').value.trim(), rating: $('#fbRating').value, follow: $('#fbFollow').value.trim() });
    if (L.highestStage(a) < 2) { var s = /recruiter|phone/i.test($('#fbRound').value) ? 'screen' : 'interview'; var na = L.setStatus(a, s, $('#fbDate').value); Object.assign(a, na); }
    save(); ['#fbWho', '#fbAsked', '#fbWell', '#fbBetter', '#fbFollow'].forEach(function (s) { $(s).value = ''; }); renderAll(); B.toast('Interview notes saved');
  });
  $('#fbList').addEventListener('click', function (e) {
    var k = e.target.getAttribute('data-fbdel'); if (!k || !confirm('Delete these notes?')) return;
    var p = k.split('|'), a = byId(p[0]); a.feedback = a.feedback.filter(function (f) { return f.id !== p[1]; }); save(); renderFeedback();
  });

  // ---------- salary ----------
  $('#superPct').textContent = Math.round(L.SUPER_RATE * 100) + '% (the Superannuation Guarantee rate from 1 July 2025)';
  function money(n) { return B.fmt.money(n).replace(/\.00$/, ''); }
  function renderSalaryForm() {
    var cur = $('#sApp').value; $('#sApp').innerHTML = appOptions(cur, 'None — just compare');
  }
  $('#sApp').addEventListener('change', function () {
    var a = byId($('#sApp').value); if (!a) return;
    var adv = L.parseSalaryRange(a.salary);
    $('#sExp').value = a.expected || (adv ? adv.max : ''); $('#sOff').value = a.offered || '';
    $('#sExpSuper').value = a.expectedIncludesSuper ? '1' : '0'; $('#sOffSuper').value = a.offeredIncludesSuper ? '1' : '0';
    compare();
  });
  function compare() {
    var r = L.compareSalary({ expected: +$('#sExp').value, offered: +$('#sOff').value, expectedIncludesSuper: $('#sExpSuper').value === '1', offeredIncludesSuper: $('#sOffSuper').value === '1' });
    if (!r.expected && !r.offered) { $('#sOut').innerHTML = ''; return r; }
    function col(n, x) { return x ? '<td>' + money(x[n]) + '</td>' : '<td>–</td>'; }
    $('#sOut').innerHTML = '<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th></th><th>Expected</th><th>Offer</th></tr></thead><tbody>' +
      [['Base salary', 'base'], ['Super', 'superAmt'], ['Total package', 'package'], ['Take-home a year (est.)', 'takeHome']].map(function (row) { return '<tr><td>' + row[0] + '</td>' + col(row[1], r.expected) + col(row[1], r.offered) + '</tr>'; }).join('') +
      (r.offered ? '<tr><td>Take-home a fortnight (est.)</td><td>' + (r.expected ? money(r.expected.takeHome / 26) : '–') + '</td><td>' + money(r.offered.takeHome / 26) + '</td></tr>' : '') +
      '</tbody></table></div>' + (r.verdict ? '<p><strong>' + (r.diff >= 0 ? '<span class="ok">' : '<span class="warn">') + (r.diff >= 0 ? '+' : '') + money(r.diff) + ' base (' + (r.diffPct >= 0 ? '+' : '') + Math.round(r.diffPct * 1000) / 10 + '%)</span></strong> — ' + esc(r.verdict) + '</p>' : '');
    return r;
  }
  ['#sExp', '#sOff', '#sExpSuper', '#sOffSuper'].forEach(function (s) { $(s).addEventListener('input', compare); });
  $('#sSave').addEventListener('click', function () {
    compare(); var a = byId($('#sApp').value); if (!a) return;
    a.expected = +$('#sExp').value || ''; a.offered = +$('#sOff').value || ''; a.expectedIncludesSuper = $('#sExpSuper').value === '1'; a.offeredIncludesSuper = $('#sOffSuper').value === '1';
    save(); renderSalaryTable(); B.toast('Saved to ' + label(a));
  });
  function renderSalaryTable() {
    var rows = state.apps.filter(function (a) { return a.salary || a.expected || a.offered; });
    $('#sTable').innerHTML = rows.length ? B.table(rows, [
      { key: 'company', label: 'Company' }, { key: 'role', label: 'Role' }, { key: 'status', label: 'Status', fmt: function (v) { return esc(L.STATUS_LABEL[v]); } },
      { key: 'salary', label: 'Advertised' },
      { key: 'expected', label: 'Expected', fmt: function (v, r) { return v ? money(v) + (r.expectedIncludesSuper ? ' pkg' : ' + super') : '–'; } },
      { key: 'offered', label: 'Offered', fmt: function (v, r) { return v ? '<strong>' + money(v) + '</strong>' + (r.offeredIncludesSuper ? ' pkg' : ' + super') : '–'; } }
    ]) : '<p class="muted">Add an advertised salary to an application, or compare and save above.</p>';
  }

  // ---------- backup ----------
  $('#exportJson').addEventListener('click', function () { B.download('job-copilot-' + today() + '.json', JSON.stringify({ app: 'job-copilot', version: 1, data: state }, null, 2), 'application/json'); });
  $('#exportCsv').addEventListener('click', function () { B.download('applications-' + today() + '.csv', B.csv.stringify(state.apps, ['company', 'role', 'status', 'applied', 'link', 'salary', 'source', 'contact', 'next', 'nextDate', 'expected', 'offered', 'notes']), 'text/csv'); });
  $('#importJson').addEventListener('click', function () {
    var inp = B.h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', function () {
      if (!inp.files[0]) return;
      B.readFile(inp.files[0]).then(function (t) {
        var j = JSON.parse(t), d = j && j.data; if (!d || !Array.isArray(d.apps)) throw new Error('This is not a Job Copilot backup');
        if (!confirm('Replace your current data with this backup (' + d.apps.length + ' applications)?')) return;
        state = { apps: d.apps, resume: d.resume || '' }; save(); $('#resume').value = state.resume; renderAll(); B.toast('Backup restored');
      }).catch(function (err) { B.toast(err.message, 4000); });
    });
    inp.click();
  });
  $('#clearAll').addEventListener('click', function () { if (!confirm('Delete all applications, notes and your saved resume from this browser?')) return; state = blank(); save(); $('#resume').value = ''; renderAll(); B.toast('All data deleted'); });

  // ---------- sample ----------
  $('#sample').addEventListener('click', function () {
    if (state.apps.length && !confirm('Add the sample applications to your existing ones?')) return;
    L.SAMPLE_APPS.forEach(function (s) {
      state.apps.push({
        id: B.uid(), company: s.company, role: s.role, status: s.status, link: s.link, salary: s.salary, applied: s.status === 'saved' ? '' : shift(-s.daysAgo), next: s.next, nextDate: s.next ? shift(s.nextIn) : '',
        jd: s.jd || '', source: 'Seek', contact: '', notes: '', history: s.history.map(function (h) { return { status: h[0], date: shift(-h[1]) }; }),
        feedback: s.company === 'PayRight' ? [{ id: B.uid(), date: shift(-4), round: 'Hiring manager', who: 'Alex (QA Manager)', asked: 'How would you introduce Playwright to a team using Selenium? Tell me about a flaky test you fixed.', well: 'Good rapport, clear STAR story about cutting regression time.', better: 'Be more concrete about API contract testing; read up on Pact.', rating: '4', follow: 'Thank-you email sent' }] : [],
        expected: s.company === 'PayRight' ? 140000 : '', offered: ''
      });
    });
    if (!state.resume.trim()) { state.resume = L.SAMPLE_RESUME; $('#resume').value = state.resume; }
    if (!$('#jd').value.trim()) $('#jd').value = L.SAMPLE_JD;
    save(); renderAll(); B.toast('Sample data loaded');
  });

  function renderAll() {
    renderTracker(); renderGaps(); renderPrepPick(); renderFeedback(); renderSalaryForm(); renderSalaryTable();
    var cur = $('#jdPick').value; $('#jdPick').innerHTML = appOptions(cur, 'Paste below, or pick a saved application…');
  }
  B.tabs($('[data-tabs="jc"]'), function (id) { if (id === 'gaps') renderGaps(); if (id === 'match' && $('#jd').value.trim() && $('#resume').value.trim() && !$('#matchOut').innerHTML) renderMatch(); });
  renderAll();
  B.ai.note($('#matchOut').parentNode);
})();
