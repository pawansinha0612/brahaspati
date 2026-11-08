(function () {
  'use strict';
  var L = window.EmailLib, $ = B.$, $$ = B.$$, esc = B.esc;
  var TONES = ['Warm', 'Neutral', 'Formal'];
  var showTab = B.tabs($('[data-tabs="em"]'));
  var values = B.store.get('email:values', {});

  // sample dates relative to today so the Today view always has something in it
  function SD(n) { var d = new Date(); d.setDate(d.getDate() + n); return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ', ' + d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + d.getFullYear(); }
  var SAMPLE_PILE = 'From: Jane Smith <jane@acme.com.au>\nSubject: Invoice INV-2041 overdue\n\nHi, invoice INV-2041 for $1,250.00 was due on 20/10. Can you please arrange payment by Friday? This is our final notice.\n\nThanks\nJane\n' +
    'From: Weekly Digest <news@tools.io>\nSubject: Your weekly roundup\n\nView this email in your browser. 20% off all plans this week! Unsubscribe here.\n' +
    'From: Tom Lee <tom@client.com>\nSubject: Catch up next week?\n\nHey, are you available for a call next Tuesday at 2pm to talk about the website? Let me know.\n' +
    'From: Raj Patel <raj@shop.com>\nSubject: URGENT - checkout is down\n\nThe checkout is broken and not working since this morning. This is unacceptable, we are losing sales. Please fix it today!!\n' +
    'From: Mia Wong <mia@partner.org>\nSubject: Quick question about the proposal\n\nHi, what start date did you have in mind for phase two? And does the quote include GST?\n' +
    'From: Jane Smith <jane@acme.com.au>\nTo: alex@mybiz.com.au\nSubject: Website quote\nDate: ' + SD(-4) + ' 09:10\n\nHi Alex,\n\nCould you send the revised quote? Also, does it include hosting for the first year?\n\nThanks\nJane\n' +
    'From: Alex Chen <alex@mybiz.com.au>\nTo: jane@acme.com.au\nSubject: RE: Website quote\nDate: ' + SD(-4) + ' 11:30\n\nHi Jane,\n\nHosting for the first year is included. I\'ll send the revised quote by tomorrow.\n\nCheers,\nAlex\n' +
    'From: Alex Chen <alex@mybiz.com.au>\nTo: sam@printco.com\nSubject: Brochure proof\nDate: ' + SD(-3) + ' 10:00\n\nHi Sam, could you confirm the paper stock? When can you deliver the brochures?\n\nThanks, Alex\n' +
    'From: Sam Wu <sam@printco.com>\nTo: alex@mybiz.com.au\nSubject: Re: Brochure proof\nDate: ' + SD(-3) + ' 15:00\n\nHi Alex, the paper stock is 150gsm silk. Let me check with the studio and get back to you tomorrow.\n\nSam\n' +
    'From: Alex Chen <alex@mybiz.com.au>\nTo: lee@landlord.com.au\nSubject: Lease renewal\nDate: ' + SD(-2) + ' 16:20\n\nHi Lee, could you please send the renewal paperwork so I can sign it this week?\n\nThanks, Alex\n' +
    'From: Priya Shah <priya@clientco.com.au>\nTo: alex@mybiz.com.au\nSubject: Logo files\nDate: ' + SD(0) + ' 08:05\n\nHi Alex, can you send the logo files in SVG? I will approve the final design by Friday once I have them.\n\nPriya';
  var SAMPLE_ME = 'alex@mybiz.com.au';
  var SAMPLE_TONE = 'Hi Sam,\n\nAs per my last email, you need to send the signed contract ASAP!!! We are STILL WAITING and obviously this is holding everything up. Why haven\'t you replied?\n\nRegards';

  // ---------- sort ----------
  var sortedList = [];
  function prioClass(p) { return p >= 70 ? 'pill-bad' : p >= 45 ? 'pill-warn' : 'pill-ok'; }
  function sortEmails() {
    var list = L.split($('#pile').value);
    if (!list.length) { B.toast('Paste some emails first'); return; }
    sortedList = L.prioritise(list);
    runIntel(list);
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
  $('#sampleSort').addEventListener('click', function () { $('#pile').value = SAMPLE_PILE; if (!$('#myself').value.trim()) { $('#myself').value = SAMPLE_ME; B.store.set('email:myself', SAMPLE_ME); } sortEmails(); });

  // ---------- inbox intelligence: promises, questions, follow-ups ----------
  var intel = null, followups = B.store.get('email:followups', {}) || {};
  function todayIso() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function niceDay(iso) { var d = B.toDate(iso); if (!d) return iso; var t = todayIso(); if (iso === t) return 'today'; var diff = Math.round((d - B.toDate(t)) / 86400000); if (diff === 1) return 'tomorrow'; if (diff === -1) return 'yesterday'; return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  $('#myself').value = B.store.get('email:myself', '');
  $('#myself').addEventListener('change', function () { B.store.set('email:myself', $('#myself').value.trim()); if ($('#pile').value.trim() && sortedList.length) runIntel(L.split($('#pile').value)); });
  function saveFu() { B.store.set('email:followups', followups); }
  function runIntel(list) {
    var me = $('#myself').value.trim();
    if (!me) { var g = L.guessMe(list); if (g) { me = g; $('#myself').value = g; B.store.set('email:myself', g); } }
    intel = L.intelligence(list, me, todayIso());
    followups = L.mergeFollowups(followups, L.reminders(intel, {}), todayIso()); saveFu();
    var mineCount = list.filter(function (e) { return L.isMe(e, me); }).length;
    $('#intelNote').textContent = (me ? mineCount + ' of these emails are from you (' + me + '). ' : 'Add your email address above so it can tell your emails from theirs. ') +
      intel.promises.length + ' promises, ' + intel.questions.length + ' unanswered questions — see Today, Promises & questions and Follow-ups.';
    renderIntel(); renderFu(); renderToday();
  }
  function fuCard(r, compact) {
    var pill = r.status === 'overdue' ? '<span class="pill-bad">Overdue</span>' : r.status === 'today' ? '<span class="pill-warn">Today</span>' : r.status === 'done' ? '<span class="pill-ok">Done</span>' : '';
    return '<div class="fu ' + r.status + '" data-id="' + esc(r.id) + '"><p class="meta">' + esc(L.KIND_LABEL[r.kind] || '') + ' · ' + (r.done ? 'done' : 'follow up ' + esc(niceDay(r.when))) + (r.snooze ? ' (snoozed)' : r.guessed && !r.done ? ' (no date given — suggested)' : '') + ' ' + pill + '</p>' +
      '<p>' + esc(r.title) + '</p>' + (r.subject ? '<p class="meta">Email: ' + esc(r.subject) + '</p>' : '') +
      '<div class="row"><label class="chk"><input type="checkbox" data-act="done"' + (r.done ? ' checked' : '') + '> Done</label>' +
      (r.done ? '' : '<select data-act="snooze" aria-label="Snooze"><option value="">Snooze…</option><option value="tomorrow">Tomorrow</option><option value="3days">3 business days</option><option value="monday">Next Monday</option><option value="week">In a week</option></select><input type="date" data-act="date" aria-label="Follow-up date" value="' + esc(r.when) + '">') +
      (compact ? '' : (/you-owe|you-promised/.test(r.kind) ? '<button class="btn small" type="button" data-act="reply">Draft reply</button>' : '<button class="btn small" type="button" data-act="chase">Draft a nudge</button>') + '<button class="btn small" type="button" data-act="del" aria-label="Delete follow-up">Delete</button>') + '</div></div>';
  }
  function list(items, empty, compact) { return items.length ? items.map(function (r) { return fuCard(r, compact); }).join('') : '<p class="muted small">' + empty + '</p>'; }
  function renderFu() { $('#fuList').innerHTML = list(L.followupList(followups, todayIso(), $('#fuFilter').value), $('#fuFilter').value === 'done' ? 'Nothing ticked off yet.' : 'No follow-ups. Sort some emails (or try the sample) and promises and unanswered questions will appear here.'); }
  function renderToday() {
    var t = todayIso(), all = L.followupList(followups, t), d = L.dashboard(all, sortedList, t);
    $('#todayDate').textContent = 'Today is ' + new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '.';
    $('#todayStats').innerHTML = [['Overdue', d.overdue.length, 'bad'], ['Due today', d.today.length, 'warn'], ['Next 7 days', d.soon.length, ''], ['Urgent emails', d.urgent.length, d.urgent.length ? 'bad' : ''], ['You owe', d.owe, ''], ['Waiting on others', d.waiting, '']]
      .map(function (x) { return '<div class="stat"><div class="k">' + x[0] + '</div><div class="v ' + x[2] + '">' + x[1] + '</div></div>'; }).join('');
    $('#todayLists').innerHTML = '<div class="panel"><h2 style="margin-top:0">Overdue</h2>' + list(d.overdue, 'Nothing overdue. 🎉') + '</div>' +
      '<div class="panel"><h2 style="margin-top:0">Due today</h2>' + list(d.today, 'Nothing due today.') + '</div>' +
      (d.urgent.length ? '<div class="panel"><h2 style="margin-top:0">Urgent emails</h2><ul class="ilist">' + d.urgent.map(function (e) { return '<li><strong>' + esc(e.subject || '(no subject)') + '</strong> — ' + esc(e.fromName || e.fromEmail || '') + '</li>'; }).join('') + '</ul></div>' : '') +
      '<div class="panel"><h2 style="margin-top:0">Coming up (next 7 days)</h2>' + list(d.soon, 'Nothing else this week.', true) + '</div>';
  }
  function renderIntel() {
    if (!intel) return;
    var byId = {}; L.followupList(followups, todayIso()).forEach(function (r) { byId[r.id] = r; });
    var cards = function (arr, empty) { var rs = arr.map(function (x) { return byId[x.id]; }).filter(Boolean); return list(rs, empty); };
    $('#pMine').innerHTML = cards(intel.promises.filter(function (p) { return p.mine; }), 'No promises from you found.');
    $('#pTheirs').innerHTML = cards(intel.promises.filter(function (p) { return !p.mine; }), 'Nobody promised you anything in these emails.');
    $('#qOwe').innerHTML = cards(intel.questions.filter(function (q) { return !q.mine; }), 'Every question to you has a reply.');
    $('#waiting').innerHTML = cards(intel.questions.filter(function (q) { return q.mine; }).concat(intel.noReply), 'You’re not waiting on anyone.');
    $('#threadList').innerHTML = B.table(intel.threads.map(function (t) {
      var emails = L.split($('#pile').value), last = emails[t.last] || {};
      return { Conversation: t.subject, Emails: t.items.length, 'Last from': (L.isMe(last, intel.me) ? 'You' : last.fromName || last.fromEmail || '?'), People: t.people.join(', ') };
    }), ['Conversation', 'Emails', 'Last from', 'People']);
  }
  document.addEventListener('change', function (ev) {
    var card = ev.target.closest('.fu'); if (!card || !followups[card.dataset.id]) return;
    var f = followups[card.dataset.id], act = ev.target.dataset.act;
    if (act === 'done') { f.done = ev.target.checked; B.toast(f.done ? 'Ticked off' : 'Back on the list'); }
    else if (act === 'snooze' && ev.target.value) { f.snooze = L.snooze(ev.target.value, todayIso()); B.toast('Snoozed to ' + niceDay(f.snooze)); }
    else if (act === 'date' && ev.target.value) { f.snooze = ev.target.value; }
    else return;
    saveFu(); renderFu(); renderToday(); renderIntel();
  });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('.fu [data-act]'); if (!b || b.tagName !== 'BUTTON') return;
    var f = followups[b.closest('.fu').dataset.id]; if (!f) return;
    if (b.dataset.act === 'del') { if (!confirm('Delete this follow-up?')) return; delete followups[f.id]; saveFu(); renderFu(); renderToday(); renderIntel(); return; }
    var quote = (f.title.match(/“(.*)”/) || [, ''])[1], first = String(f.person || '').split(/[ @]/)[0];
    $('#tpl').value = b.dataset.act === 'reply' ? (f.kind === 'you-promised' ? 'confirm-done' : 'answer-question') : 'follow-up';
    values = Object.assign({}, values, { name: first, topic: f.subject || quote, task: quote.replace(/^I(?:'ll| will)\s+/i, '').replace(/\.$/, ''), answer: f.kind === 'you-owe-answer' ? 'About your question — “' + quote + '” — ' : values.answer });
    $('#to').value = /@/.test(f.person) ? f.person : '';
    renderFields(); draft(); if (f.subject) $('#dSubj').value = 'Re: ' + f.subject;
    syncMail(); showTab('draft'); window.scrollTo(0, $('[data-tabs="em"]').offsetTop - 10);
  });
  $('#fuFilter').addEventListener('change', renderFu);
  $('#fuIcs').addEventListener('click', function () {
    var open = L.followupList(followups, todayIso(), 'open'); if (!open.length) { B.toast('No open follow-ups'); return; }
    B.download('follow-ups.ics', L.remindersICS(open), 'text/calendar;charset=utf-8');
  });
  $('#fuCsv').addEventListener('click', function () {
    var all = L.followupList(followups, todayIso(), 'all'); if (!all.length) { B.toast('No follow-ups yet'); return; }
    B.download('follow-ups.csv', B.csv.stringify(all.map(function (r) { return { Type: L.KIND_LABEL[r.kind], 'Follow up on': r.when, Status: r.status, Person: r.person, What: r.title, Email: r.subject }; }), ['Type', 'Follow up on', 'Status', 'Person', 'What', 'Email']), 'text/csv;charset=utf-8');
  });
  $('#fuClearDone').addEventListener('click', function () { Object.keys(followups).forEach(function (k) { if (followups[k].done) delete followups[k]; }); saveFu(); renderFu(); renderToday(); renderIntel(); });
  $('#fuClearAll').addEventListener('click', function () { if (!Object.keys(followups).length || !confirm('Remove every follow-up from this browser?')) return; followups = {}; saveFu(); renderFu(); renderToday(); renderIntel(); });
  renderFu(); renderToday();

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
