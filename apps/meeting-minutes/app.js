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
})();
