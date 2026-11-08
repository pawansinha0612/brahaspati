(function () {
  'use strict';
  var L = window.MinutesLib, $ = B.$, esc = B.esc;
  var tx = $('#tx'), mdate = $('#mdate'), title = $('#title'), min = null;

  var SAMPLE = 'Priya Shah: Okay, thanks everyone. Quick one today — the website relaunch.\n' +
    'Sam Lee: We agreed last week to go with Stripe for payments, and legal is happy with that.\n' +
    'Priya Shah: Great. Sam, can you send the signed contract to finance by Friday?\n' +
    'Sam Lee: Sure, will do.\n' +
    'Alex Chen: I will update the pricing page by EOD tomorrow.\n' +
    'Alex Chen: What about the mobile app? Do we have a launch date for that?\n' +
    'Priya Shah: Not sure yet, I need to check with the agency.\n' +
    'Sam Lee: One risk is the payment API rate limit — we might slip a week if we hit it. Budget is $12,000 and current conversion is 3.4%.\n' +
    'Priya Shah: Let\'s keep the beta to 200 users. @Alex please share the test plan next week.\n' +
    'Alex Chen: Will do. Who owns the help centre articles?';

  (function () { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; mdate.value = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();

  function bullets(el, items, fmt) {
    el.innerHTML = items.length ? items.map(function (x) { return '<li>' + fmt(x) + '</li>'; }).join('') : '<li class="muted">None noted.</li>';
  }

  function render() {
    $('#out').hidden = false;
    var fmtName = { vtt: 'WebVTT captions', srt: 'SRT captions', speakers: 'speaker transcript', plain: 'plain notes (no speaker names found)' }[min.format];
    $('#fmt').textContent = 'Read as ' + fmtName + ' · ' + min.utterances.length + ' lines.';
    $('#stats').innerHTML = [['Attendees', min.attendees.length], ['Decisions', min.decisions.length], ['Actions', min.actions.length], ['Open questions', min.questions.length], ['Risks', min.risks.length]]
      .concat(min.duration ? [['Length', L.fmtDuration(min.duration)]] : [])
      .map(function (s) { return '<div class="stat"><div class="k">' + s[0] + '</div><div class="v">' + esc(s[1]) + '</div></div>'; }).join('');
    renderActs();
    var who = function (x) { return x.speaker ? ' <span class="who">— ' + esc(x.speaker) + '</span>' : ''; };
    bullets($('#decisions'), min.decisions, function (d) { return esc(d.text) + who(d); });
    bullets($('#questions'), min.questions, function (q) { return esc(q.text) + who(q); });
    bullets($('#risks'), min.risks, function (r) { return esc(r.text) + who(r); });
    bullets($('#numbers'), min.numbers, function (n) { return '<strong>' + esc(n.value) + '</strong> — ' + esc(n.context); });
    var talk = min.talk.filter(function (t) { return t.speaker !== '(no speaker)'; });
    $('#talk').innerHTML = talk.length ? B.barChart(talk.map(function (t) { return { label: t.speaker, value: Math.round(t.share * 1000) / 10 }; }), { fmt: function (v) { return v + '%'; } }) +
      B.table(talk.map(function (t) { return { Speaker: t.speaker, Turns: t.turns, Words: t.words, 'Share of words': B.fmt.pct(t.share), Time: t.seconds ? L.fmtDuration(t.seconds) : '—' }; }), ['Speaker', 'Turns', 'Words', 'Share of words', 'Time'])
      : '<p class="muted">No speaker names found, so talk-time isn’t available.</p>';
    outputs();
  }

  function renderActs() {
    $('#acts').innerHTML = min.actions.length ? min.actions.map(function (a, i) {
      return '<tr data-i="' + i + '"><td><input type="text" data-k="owner" aria-label="Owner" value="' + esc(a.owner) + '"></td>' +
        '<td><input type="text" data-k="task" aria-label="Action" value="' + esc(a.task) + '">' + (a.dueText ? '<div class="small muted">heard “' + esc(a.dueText) + '”</div>' : '') + '</td>' +
        '<td><input type="date" data-k="due" aria-label="Due date" value="' + esc(a.due) + '"></td></tr>';
    }).join('') : '<tr><td colspan="3" class="muted">No action items found. Add one below.</td></tr>';
  }

  function outputs() {
    var acts = min.actions.filter(function (a) { return a.task.trim(); });
    var m = Object.assign({}, min, { actions: acts, meetingDate: mdate.value });
    $('#md').value = L.toMarkdown(m, title.value.trim() || 'Meeting minutes');
    var em = L.toEmail(m, title.value.trim() || 'Meeting minutes');
    $('#subj').value = em.subject; $('#email').value = em.body;
    syncMailto();
  }
  function syncMailto() { $('#mailto').href = 'mailto:?subject=' + encodeURIComponent($('#subj').value) + '&body=' + encodeURIComponent($('#email').value.slice(0, 1800)); }

  function run() {
    if (!tx.value.trim()) { B.toast('Paste a transcript first'); return; }
    min = L.extract(tx.value, mdate.value);
    render();
  }

  $('#acts').addEventListener('input', function (e) {
    var tr = e.target.closest('tr'); if (!tr || !e.target.dataset.k) return;
    min.actions[+tr.dataset.i][e.target.dataset.k] = e.target.value; outputs();
  });
  $('#addAct').addEventListener('click', function () { if (!min) return; min.actions.push({ owner: 'Unassigned', task: '', due: '', dueText: '' }); renderActs(); var ins = B.$$('#acts input[data-k=task]'); if (ins.length) ins[ins.length - 1].focus(); });
  $('#ics').addEventListener('click', function () {
    var acts = min.actions.filter(function (a) { return a.task.trim() && a.due; });
    if (!acts.length) { B.toast('No action items have a due date yet'); return; }
    B.download((title.value.trim() || 'meeting').replace(/[^\w-]+/g, '-').toLowerCase() + '-actions.ics', L.toICS(acts, title.value.trim()), 'text/calendar;charset=utf-8');
  });
  $('#go').addEventListener('click', run);
  $('#sample').addEventListener('click', function () { tx.value = SAMPLE; title.value = 'Website relaunch sync'; run(); });
  mdate.addEventListener('change', function () { if (min) run(); });
  title.addEventListener('input', function () { if (min) outputs(); });
  $('#subj').addEventListener('input', syncMailto); $('#email').addEventListener('input', syncMailto);
  $('#copyEmail').addEventListener('click', function () { B.copy('Subject: ' + $('#subj').value + '\n\n' + $('#email').value); });
  $('#copyMd').addEventListener('click', function () { B.copy($('#md').value); });
  $('#dlMd').addEventListener('click', function () { B.download((title.value.trim() || 'minutes').replace(/[^\w-]+/g, '-').toLowerCase() + '.md', $('#md').value, 'text/markdown;charset=utf-8'); });
  B.dropZone($('#drop'), function (files) {
    B.readFile(files[0]).then(function (t) { tx.value = t; if (/\.(vtt|srt)$/i.test(files[0].name) && title.value === 'Meeting minutes') title.value = files[0].name.replace(/\.[^.]+$/, ''); run(); });
  }, { accept: '.vtt,.srt,.txt,.md,text/plain,text/vtt' });
  B.tabs($('[data-tabs="mm"]'));

  B.ai.button($('#aiBox'), 'AI: polished summary', function () {
    if (!tx.value.trim()) return null;
    return 'Write polished meeting minutes in Australian English from this transcript. Start with a 2–3 sentence summary, then Decisions, Action items (owner — action — due date, using meeting date ' + mdate.value + ' to turn words like “Friday” into dates), Open questions and Risks. Do not invent anything that is not in the transcript.\n\n---\n' + tx.value.slice(0, 15000);
  }, function (ans) {
    $('#aiOut').innerHTML = '<div class="panel" style="background:var(--soft)"><p class="small muted" style="margin:0 0 6px">AI summary — check names and dates; AI can be wrong.</p><div style="white-space:pre-wrap;overflow-wrap:anywhere">' + esc(ans) + '</div><div class="row" style="margin-top:8px"><button class="btn small" type="button" id="copyAi">Copy</button></div></div>';
    $('#copyAi').addEventListener('click', function () { B.copy(ans); });
  });
  B.ai.note($('#aiNote'));

  // ---------- decision & action tracker (saved meetings) ----------
  var library = B.store.get('minutes:library', []) || [];
  function todayIso() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function isoPlus(n) { var d = new Date(); d.setDate(d.getDate() + n); var p = function (x) { return (x < 10 ? '0' : '') + x; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function saveLib() { if (!B.store.set('minutes:library', library)) B.toast('Browser storage is full — download a backup and remove old meetings'); renderTracker(); }
  var items = [];
  $('#saveLib').addEventListener('click', function () {
    if (!min) return;
    var entry = L.toEntry(Object.assign({}, min, { actions: min.actions.filter(function (a) { return a.task.trim(); }) }), { title: title.value.trim() || 'Meeting', date: mdate.value || todayIso(), transcript: tx.value });
    var existed = library.some(function (m) { return m.title.toLowerCase() === entry.title.toLowerCase() && m.date === entry.date; });
    library = L.upsertMeeting(library, entry); saveLib();
    var carried = items.filter(function (it) { return it.carried && it.lastSeen === entry.date && it.meetings.some(function (x) { return x.id === entry.id; }); }).length;
    $('#saveNote').textContent = (existed ? 'Updated in' : 'Saved to') + ' the tracker' + (carried ? ' — ' + carried + ' action' + (carried === 1 ? '' : 's') + ' carried over from earlier meetings' : '') + '.';
    B.toast(existed ? 'Meeting updated' : 'Saved to tracker');
  });
  function statusSelect(it) { return '<select data-k="status" aria-label="Status">' + L.STATUSES.map(function (s) { return '<option value="' + s + '"' + (it.status === s ? ' selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>'; }).join('') + '</select>'; }
  function pills(it) {
    return (it.overdue ? ' <span class="pill-bad">' + it.daysOverdue + 'd overdue</span>' : '') + (it.carried ? ' <span class="pill-warn" title="' + esc(it.meetings.map(function (m) { return L.niceDate(m.date) + ' ' + m.title; }).join('\n')) + '">carried over ×' + it.carried + '</span>' : '') + (it.status === 'blocked' ? ' <span class="pill-bad">blocked</span>' : '');
  }
  function filtered() {
    var st = $('#trStatus').value, ow = $('#trOwner').value, q = $('#trSearch').value.toLowerCase().trim();
    return items.filter(function (it) {
      if (st === 'active' && !(it.status === 'open' || it.status === 'blocked')) return false;
      if (st === 'overdue' && !it.overdue) return false;
      if (st === 'carried' && !it.carried) return false;
      if ((st === 'done' || st === 'dropped') && it.status !== st) return false;
      if (ow && it.owner !== ow) return false;
      return !q || (it.task + ' ' + it.owner).toLowerCase().indexOf(q) >= 0;
    });
  }
  function renderTracker() {
    items = L.buildTracker(library, todayIso());
    var open = items.filter(function (it) { return it.status === 'open' || it.status === 'blocked'; });
    $('#trStats').innerHTML = [['Meetings', library.length, ''], ['Open actions', open.length, ''], ['Overdue', items.filter(function (i) { return i.overdue; }).length, 'bad'], ['Carried over', open.filter(function (i) { return i.carried; }).length, 'warn'], ['Done', items.filter(function (i) { return i.status === 'done'; }).length, 'ok'], ['Decisions', L.decisionLog(library).length, '']]
      .map(function (s) { return '<div class="stat"><div class="k">' + s[0] + '</div><div class="v ' + s[2] + '">' + s[1] + '</div></div>'; }).join('');
    var owners = items.map(function (i) { return i.owner; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).sort(), ow = $('#trOwner').value;
    $('#trOwner').innerHTML = '<option value="">Everyone</option>' + owners.map(function (o) { return '<option' + (o === ow ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('');
    if (owners.indexOf(ow) >= 0) $('#trOwner').value = ow;
    renderActList(); renderPeople(); renderDecisions(); renderMeetings(); renderAgenda();
  }
  function renderActList() {
    var list = filtered();
    $('#trList').innerHTML = !library.length ? '<p class="muted">No meetings saved yet. Make minutes above and press “Save to tracker”, or load the sample meetings.</p>' : !list.length ? '<p class="muted">Nothing matches.</p>' :
      '<div class="table-wrap tr"><table><thead><tr><th>Owner</th><th>Action</th><th>Due</th><th>Status</th><th>Raised</th></tr></thead><tbody>' + list.map(function (it) {
        return '<tr data-key="' + esc(it.key) + '"' + (it.overdue ? ' class="overdue"' : '') + '><td>' + esc(it.owner) + '</td><td>' + esc(it.task) + pills(it) + '</td><td><input type="date" data-k="due" aria-label="Due date" value="' + esc(it.due) + '"></td><td>' + statusSelect(it) + '</td><td class="small">' + esc(L.niceDate(it.firstSeen)) + (it.carried ? '<br>last ' + esc(L.niceDate(it.lastSeen)) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function renderPeople() {
    var ppl = L.byPerson(items.filter(function (i) { return i.status !== 'dropped'; }));
    $('#trPeople').innerHTML = ppl.length ? ppl.map(function (p) {
      var act = p.items.filter(function (i) { return i.status === 'open' || i.status === 'blocked'; });
      return '<div class="panel person"><h3 style="margin:0 0 4px">' + esc(p.owner) + '</h3><p class="small muted" style="margin:0 0 6px">' + p.open + ' open · ' + p.blocked + ' blocked · <span class="' + (p.overdue ? 'bad' : '') + '">' + p.overdue + ' overdue</span> · ' + p.done + ' done</p>' +
        (act.length ? '<ul class="list">' + act.map(function (i) { return '<li>' + esc(i.task) + (i.due ? ' <span class="who">— due ' + esc(L.niceDate(i.due)) + '</span>' : '') + pills(i) + '</li>'; }).join('') + '</ul>' : '<p class="small muted">Nothing open. 🎉</p>') + '</div>';
    }).join('') : '<p class="muted">No actions yet.</p>';
  }
  function renderDecisions() {
    var d = L.decisionLog(library, $('#decSearch').value);
    $('#decList').innerHTML = d.length ? d.map(function (x) { return '<li><strong>' + esc(L.niceDate(x.date)) + '</strong> · <span class="who">' + esc(x.meeting) + (x.speaker ? ' — ' + esc(x.speaker) : '') + '</span><br>' + esc(x.text) + '</li>'; }).join('') : '<li class="muted">No decisions' + ($('#decSearch').value ? ' match' : ' saved yet') + '.</li>';
  }
  function renderMeetings() {
    $('#mtgList').innerHTML = library.length ? library.slice().reverse().map(function (m) {
      return '<div class="mtg" data-id="' + esc(m.id) + '"><div><strong>' + esc(m.title) + '</strong><div class="small muted">' + esc(L.niceDate(m.date)) + ' · ' + m.actions.length + ' actions · ' + m.decisions.length + ' decisions' + (m.attendees.length ? ' · ' + esc(m.attendees.join(', ')) : '') + '</div></div>' +
        '<div class="row"><button class="btn small" type="button" data-m="open"' + (m.transcript ? '' : ' disabled') + '>Open transcript</button><button class="btn small" type="button" data-m="del">Delete</button></div></div>';
    }).join('') : '<p class="muted">No meetings saved yet.</p>';
  }
  function renderAgenda() {
    if (!$('#agDate').value) $('#agDate').value = isoPlus(7);
    $('#agenda').value = L.agenda(L.buildTracker(library, $('#agDate').value), library, { title: $('#agTitle').value.trim() || 'Agenda', date: $('#agDate').value });
    $('#agMail').href = 'mailto:?subject=' + encodeURIComponent('Agenda: ' + ($('#agTitle').value.trim() || 'next meeting') + ' — ' + L.niceDate($('#agDate').value)) + '&body=' + encodeURIComponent($('#agenda').value.slice(0, 1800));
  }
  function itemFor(el) { var tr = el.closest('tr[data-key]'); return tr && items.filter(function (i) { return i.key === tr.dataset.key; })[0]; }
  $('#trList').addEventListener('change', function (e) {
    var it = itemFor(e.target); if (!it) return;
    if (e.target.dataset.k === 'status') { library = L.setStatus(library, it, e.target.value); B.toast('Marked ' + e.target.value); }
    else if (e.target.dataset.k === 'due') library = L.updateAction(library, it, { due: e.target.value });
    saveLib();
  });
  ['#trStatus', '#trOwner'].forEach(function (s) { $(s).addEventListener('change', renderActList); });
  $('#trSearch').addEventListener('input', renderActList);
  $('#decSearch').addEventListener('input', renderDecisions);
  $('#agTitle').addEventListener('input', renderAgenda); $('#agDate').addEventListener('change', renderAgenda);
  $('#mtgList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-m]'); if (!b) return;
    var m = library.filter(function (x) { return x.id === b.closest('.mtg').dataset.id; })[0]; if (!m) return;
    if (b.dataset.m === 'del') { if (!confirm('Delete “' + m.title + '” (' + L.niceDate(m.date) + ') and its actions from the tracker?')) return; library = library.filter(function (x) { return x.id !== m.id; }); saveLib(); return; }
    tx.value = m.transcript; title.value = m.title; mdate.value = m.date; run(); window.scrollTo(0, 0);
  });
  function slugName(s) { return String(s || 'tracker').replace(/[^\w-]+/g, '-').toLowerCase(); }
  $('#trCsv').addEventListener('click', function () { if (!items.length) { B.toast('Nothing to export yet'); return; } B.download('actions-tracker.csv', L.trackerCSV(filtered().length ? filtered() : items), 'text/csv;charset=utf-8'); });
  $('#trMd').addEventListener('click', function () { if (!items.length) { B.toast('Nothing to export yet'); return; } B.download('actions-and-decisions.md', L.trackerMarkdown(filtered().length ? filtered() : items, L.decisionLog(library), todayIso()), 'text/markdown;charset=utf-8'); });
  $('#trIcs').addEventListener('click', function () {
    var acts = items.filter(function (i) { return (i.status === 'open' || i.status === 'blocked') && i.due; }).map(function (i) { return { owner: i.owner, task: i.task, due: i.due }; });
    if (!acts.length) { B.toast('No open actions with a due date'); return; }
    B.download('open-actions.ics', L.toICS(acts, 'Action tracker'), 'text/calendar;charset=utf-8');
  });
  $('#decCsv').addEventListener('click', function () { var d = L.decisionLog(library, $('#decSearch').value); if (!d.length) { B.toast('No decisions yet'); return; } B.download('decision-log.csv', L.decisionsCSV(d), 'text/csv;charset=utf-8'); });
  $('#agCopy').addEventListener('click', function () { B.copy($('#agenda').value); });
  $('#agDl').addEventListener('click', function () { B.download('agenda-' + slugName($('#agTitle').value) + '-' + $('#agDate').value + '.md', $('#agenda').value, 'text/markdown;charset=utf-8'); });
  $('#trBackup').addEventListener('click', function () { if (!library.length) { B.toast('Nothing saved yet'); return; } B.download('meeting-tracker-backup.json', JSON.stringify({ app: 'meeting-minutes', version: 1, library: library }, null, 1), 'application/json'); });
  $('#trRestoreBtn').addEventListener('click', function () { $('#trRestore').click(); });
  $('#trRestore').addEventListener('change', function () {
    var f = $('#trRestore').files[0]; if (!f) return;
    B.readFile(f).then(function (t) {
      var j = JSON.parse(t); if (!j || !Array.isArray(j.library)) throw new Error('not a tracker backup');
      j.library.forEach(function (m) { if (m && m.id && m.date && Array.isArray(m.actions)) { library = library.filter(function (x) { return x.id !== m.id; }); library.push(m); } });
      library.sort(function (a, b) { return a.date.localeCompare(b.date); }); saveLib(); B.toast('Restored');
    }).catch(function (e) { B.toast('Could not restore: ' + e.message); });
    $('#trRestore').value = '';
  });
  $('#trClear').addEventListener('click', function () { if (!library.length || !confirm('Remove all ' + library.length + ' saved meetings from this browser?')) return; library = []; saveLib(); });
  $('#trSample').addEventListener('click', function () {
    if (library.some(function (m) { return /^Sample: /.test(m.title); })) { B.toast('Sample meetings are already loaded'); return; }
    var S = [
      [-21, 'Sample: Website relaunch kick-off', 'Priya Shah: Thanks all. We agreed to go with Stripe for payments.\nPriya Shah: Sam, can you send the signed contract to finance by Friday?\nSam Lee: Sure, will do.\nAlex Chen: I will update the pricing page by next Monday.\nPriya Shah: Mia, can you book the user testing sessions for next week?\nMia Wong: Yep, on it.\nAlex Chen: What hosting plan are we on?', { book: 'done' }],
      [-14, 'Sample: Website relaunch sync', 'Priya Shah: Sam, can you send the signed contract to finance? It is still not done.\nSam Lee: Yes, I will send it by Wednesday.\nAlex Chen: I will update the pricing page this week, sorry it slipped.\nPriya Shah: Decision: we will launch on the first Monday of next month.\nMia Wong: I will share the testing results by Friday.\nSam Lee: One risk is legal has not reviewed the terms yet.', { results: 'blocked' }],
      [-7, 'Sample: Website relaunch sync', 'Priya Shah: Sam, can you send the signed contract to finance? Legal is waiting.\nSam Lee: I will send it today.\nPriya Shah: Let\'s keep the beta to 200 users.\nAlex Chen: I will write the launch email by next Tuesday.\nPriya Shah: Who owns the help centre articles?', {}]
    ];
    S.forEach(function (x) {
      var date = isoPlus(x[0]), e = L.toEntry(L.extract(x[2], date), { title: x[1], date: date, transcript: x[2] });
      e.actions.forEach(function (a) { Object.keys(x[3]).forEach(function (k) { if (new RegExp(k, 'i').test(a.task)) a.status = x[3][k]; }); });
      library = L.upsertMeeting(library, e);
    });
    saveLib(); B.toast('Loaded 3 sample meetings');
  });
  B.tabs($('[data-tabs="tr"]'));
  renderTracker();
})();
