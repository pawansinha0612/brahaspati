(function () {
  'use strict';
  var L = window.EmailLib, $ = B.$, $$ = B.$$, esc = B.esc;
  var TONES = ['Warm', 'Neutral', 'Formal'];
  var showTab = B.tabs($('[data-tabs="em"]'));
  var values = B.store.get('email:values', {});

  var SAMPLE_PILE = 'From: Jane Smith <jane@acme.com.au>\nSubject: Invoice INV-2041 overdue\n\nHi, invoice INV-2041 for $1,250.00 was due on 20/10. Can you please arrange payment by Friday? This is our final notice.\n\nThanks\nJane\n' +
    'From: Weekly Digest <news@tools.io>\nSubject: Your weekly roundup\n\nView this email in your browser. 20% off all plans this week! Unsubscribe here.\n' +
    'From: Tom Lee <tom@client.com>\nSubject: Catch up next week?\n\nHey, are you available for a call next Tuesday at 2pm to talk about the website? Let me know.\n' +
    'From: Raj Patel <raj@shop.com>\nSubject: URGENT - checkout is down\n\nThe checkout is broken and not working since this morning. This is unacceptable, we are losing sales. Please fix it today!!\n' +
    'From: Mia Wong <mia@partner.org>\nSubject: Quick question about the proposal\n\nHi, what start date did you have in mind for phase two? And does the quote include GST?';
  var SAMPLE_TONE = 'Hi Sam,\n\nAs per my last email, you need to send the signed contract ASAP!!! We are STILL WAITING and obviously this is holding everything up. Why haven\'t you replied?\n\nRegards';

  // ---------- sort ----------
  var sortedList = [];
  function prioClass(p) { return p >= 70 ? 'pill-bad' : p >= 45 ? 'pill-warn' : 'pill-ok'; }
  function sortEmails() {
    var list = L.split($('#pile').value);
    if (!list.length) { B.toast('Paste some emails first'); return; }
    sortedList = L.prioritise(list);
    var counts = {}; sortedList.forEach(function (e) { counts[e.analysis.primary] = (counts[e.analysis.primary] || 0) + 1; });
    $('#sortStats').innerHTML = '<div class="stat"><div class="k">Emails</div><div class="v">' + sortedList.length + '</div></div>' +
      '<div class="stat"><div class="k">Urgent</div><div class="v bad">' + sortedList.filter(function (e) { return e.analysis.urgent; }).length + '</div></div>' +
      Object.keys(counts).map(function (k) { return '<div class="stat"><div class="k">' + esc(L.CATS[k].label) + '</div><div class="v">' + counts[k] + '</div></div>'; }).join('');
    $('#sorted').innerHTML = sortedList.map(function (e, i) {
      var a = e.analysis, x = a.extract;
      var tags = a.categories.map(function (c) { return '<span class="tag">' + esc(c.label) + '</span>'; }).join('');
      var bits = [];
      if (x.asks.length) bits.push('<li><strong>Asks:</strong> ' + x.asks.map(esc).join(' · ') + '</li>');
      if (x.dates.length) bits.push('<li><strong>Dates/times:</strong> ' + x.dates.map(esc).join(', ') + '</li>');
      if (x.amounts.length) bits.push('<li><strong>Amounts:</strong> ' + x.amounts.map(esc).join(', ') + '</li>');
      if (x.refs.length) bits.push('<li><strong>References:</strong> ' + x.refs.map(esc).join(', ') + '</li>');
      var sugg = e.suggested.map(function (id) { var t = L.TEMPLATES.filter(function (t) { return t.id === id; })[0]; return '<button class="btn small" type="button" data-reply="' + i + '" data-tpl="' + id + '">' + esc(t.name) + '</button>'; }).join('');
      return '<div class="mail"><div class="row" style="gap:8px;align-items:baseline"><span class="prio ' + prioClass(a.priority) + '" title="Priority score out of 100">' + a.priority + '</span>' +
        '<h3>' + (i + 1) + '. ' + esc(e.subject || '(no subject)') + '</h3></div>' +
        '<div class="meta">' + esc(e.fromName || e.from || 'Unknown sender') + (e.fromEmail ? ' &lt;' + esc(e.fromEmail) + '&gt;' : '') + (e.date ? ' · ' + esc(e.date) : '') + '</div>' +
        '<div style="margin:6px 0">' + (a.urgent ? '<span class="pill-bad">Urgent</span> ' : '') + tags + '</div>' +
        (bits.length ? '<ul>' + bits.join('') + '</ul>' : '<p class="small muted" style="margin:4px 0">Nothing specific asked of you.</p>') +
        (sugg ? '<div class="row" style="gap:6px;margin-top:6px"><span class="small muted">Reply with:</span>' + sugg + '</div>' : '') + '</div>';
    }).join('');
  }
  $('#sorted').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-reply]'); if (!b) return;
    var e = sortedList[+b.dataset.reply], x = e.analysis.extract;
    $('#tpl').value = b.dataset.tpl; values = Object.assign({}, values, { name: (e.fromName || '').split(' ')[0], topic: e.subject.replace(/^(re|fw|fwd)\s*:\s*/i, ''), invoice: x.refs[0] || '', amount: x.amounts[0] || '', when: x.dates.join(' ') || '', issue: e.subject.replace(/^(re|fw|fwd)\s*:\s*/i, '').replace(/^urgent\W*/i, '') });
    $('#to').value = e.fromEmail || '';
    renderFields(); draft(); if (e.subject) $('#dSubj').value = 'Re: ' + e.subject.replace(/^(re)\s*:\s*/i, '');
    syncMail(); showTab('draft'); window.scrollTo(0, $('[data-tabs="em"]').offsetTop - 10);
  });
  $('#sortBtn').addEventListener('click', sortEmails);
  $('#sampleSort').addEventListener('click', function () { $('#pile').value = SAMPLE_PILE; sortEmails(); });

  // ---------- draft ----------
  $('#tpl').innerHTML = L.TEMPLATES.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('');
  $('#tpl').value = B.store.get('email:tpl', 'follow-up');
  $('#tone').value = B.store.get('email:tone', 1);
  $('#me').value = B.store.get('email:me', '');

  function tpl() { return L.TEMPLATES.filter(function (t) { return t.id === $('#tpl').value; })[0] || L.TEMPLATES[0]; }
  function renderFields() {
    $('#fields').innerHTML = tpl().fields.map(function (k) {
      return '<div><label for="f_' + k + '">' + esc(L.FIELD_LABELS[k] || k) + '</label><input type="text" id="f_' + k + '" data-k="' + k + '" value="' + esc(values[k] || '') + '"></div>';
    }).join('');
  }
  function draft() {
    var v = Object.assign({}, values, { me: $('#me').value });
    var tone = +$('#tone').value, r = L.fill(tpl().id, v, tone);
    $('#toneName').textContent = TONES[tone];
    $('#dSubj').value = r.subject; $('#dBody').value = r.body;
    $('#missing').textContent = r.missing.length ? 'Still to fill in: ' + r.missing.map(function (k) { return L.FIELD_LABELS[k] || k; }).join(', ') + '.' : '';
    B.store.set('email:tpl', tpl().id); B.store.set('email:tone', tone); B.store.set('email:values', values);
    syncMail();
  }
  function syncMail() { $('#mailDraft').href = L.mailto($('#to').value.trim(), $('#dSubj').value, $('#dBody').value); }
  $('#fields').addEventListener('input', function (e) { if (e.target.dataset.k) { values[e.target.dataset.k] = e.target.value; draft(); } });
  $('#tpl').addEventListener('change', function () { renderFields(); draft(); });
  $('#tone').addEventListener('input', draft);
  $('#me').addEventListener('input', function () { B.store.set('email:me', $('#me').value); draft(); });
  $('#to').addEventListener('input', syncMail); $('#dSubj').addEventListener('input', syncMail); $('#dBody').addEventListener('input', syncMail);
  $('#copyDraft').addEventListener('click', function () { B.copy('Subject: ' + $('#dSubj').value + '\n\n' + $('#dBody').value); });
  $('#checkDraft').addEventListener('click', function () { $('#mine').value = $('#dBody').value; checkTone(); showTab('tone'); });
  $('#sampleDraft').addEventListener('click', function () {
    $('#tpl').value = 'chase-payment'; values = Object.assign({}, values, { name: 'Jane', invoice: 'INV-2041', amount: '$1,250.00', due: '20 October' });
    if (!$('#me').value) $('#me').value = 'Alex'; $('#to').value = 'jane@example.com'; renderFields(); draft();
  });
  renderFields(); draft();

  // ---------- tone ----------
  function checkTone() {
    var t = $('#mine').value;
    if (!t.trim()) { B.toast('Paste your draft first'); return; }
    var r = L.toneCheck(t);
    var cls = r.score >= 85 ? 'pill-ok' : r.score >= 60 ? 'pill-warn' : 'pill-bad';
    $('#toneOut').innerHTML = '<div class="panel"><p style="margin:0 0 8px"><span class="' + cls + '">' + r.score + '/100</span> <strong>' + esc(r.verdict) + '</strong></p>' +
      (r.issues.length ? r.issues.map(function (i) {
        return '<div class="issue sev-' + i.severity + '"><p>' + (i.text ? '<strong>“' + esc(i.text) + '”</strong> — ' : '') + esc(i.why) + '</p><p class="small muted">Try: ' + esc(i.suggestion) + '</p></div>';
      }).join('') : '<p class="muted" style="margin:0">Nothing to soften — it reads well.</p>') + '</div>';
    var subs = L.subjectSuggestions(t);
    $('#subjects').innerHTML = subs.map(function (s) { return '<button class="btn small" type="button" data-subj="' + esc(s) + '">' + esc(s) + '</button>'; }).join('');
  }
  $('#subjects').addEventListener('click', function (e) { var b = e.target.closest('[data-subj]'); if (b) B.copy(b.dataset.subj); });
  $('#toneBtn').addEventListener('click', checkTone);
  $('#softenBtn').addEventListener('click', function () { if (!$('#mine').value.trim()) return; $('#mine').value = L.soften($('#mine').value); checkTone(); B.toast('Softened — read it through before sending'); });
  $('#sampleTone').addEventListener('click', function () { $('#mine').value = SAMPLE_TONE; checkTone(); });

  // ---------- optional AI ----------
  function showAi(ans, target) {
    $('#aiOut').innerHTML = '<div class="panel" style="background:var(--soft)"><p class="small muted" style="margin:0 0 6px">AI rewrite — read it before sending; AI can be wrong.</p><div style="white-space:pre-wrap;overflow-wrap:anywhere" id="aiText"></div><div class="row" style="margin-top:8px"><button class="btn small" type="button" id="useAi">Use this</button><button class="btn small" type="button" id="copyAi">Copy</button></div></div>';
    $('#aiText').textContent = ans;
    $('#copyAi').addEventListener('click', function () { B.copy(ans); });
    $('#useAi').addEventListener('click', function () { target.value = ans; if (target === $('#dBody')) syncMail(); B.toast('Replaced'); });
  }
  B.ai.button($('#aiDraftBox'), 'AI: rewrite in ' + 'this tone', function () {
    if (!$('#dBody').value.trim()) return null;
    return 'Rewrite this email in a ' + TONES[+$('#tone').value].toLowerCase() + ', clear, polite Australian English tone. Keep every fact, name, date and amount. Keep any [bracketed] placeholders. Reply with the email body only.\n\n' + $('#dBody').value;
  }, function (ans) { showAi(ans.trim(), $('#dBody')); });
  B.ai.button($('#aiToneBox'), 'AI: rewrite more kindly', function () {
    if (!$('#mine').value.trim()) return null;
    return 'Rewrite this email so it is friendly, clear and not passive-aggressive, in Australian English. Keep every fact, name, date and amount and keep it about the same length. Reply with the email only.\n\n' + $('#mine').value;
  }, function (ans) { showAi(ans.trim(), $('#mine')); });
  B.ai.note($('#aiNote'));
})();
