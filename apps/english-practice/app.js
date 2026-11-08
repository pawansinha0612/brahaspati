/* Everyday English — page wiring */
(function () {
  'use strict';
  var L = window.EnglishLib, $ = B.$, esc = B.esc;
  var KEY = 'english-practice:v1';
  var state = load();
  var showTab;

  function load() { var s = B.store.get(KEY, null) || {}; var b = L.blankProgress(); Object.keys(b).forEach(function (k) { if (s[k] == null) s[k] = b[k]; }); if (!s.voice) s.voice = ''; if (!s.today) s.today = {}; return s; }
  function save() { if (!B.store.set(KEY, state)) B.toast('Could not save — browser storage may be full or blocked'); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function record(kind, extra) { L.recordActivity(state, today(), kind, extra); save(); }
  // per-day "done" flags for today's set so ticks survive a reload
  function doneToday(key) { return !!(state.today[today()] || {})[key]; }
  function markToday(key) { var t = state.today[today()] = state.today[today()] || {}; if (t[key]) return false; t[key] = true; save(); return true; }

  // ---------- speech synthesis ----------
  var synth = window.speechSynthesis, voices = [];
  function loadVoices() {
    if (!synth) { $('#voiceNote').textContent = 'This browser cannot read text aloud.'; return; }
    voices = synth.getVoices().filter(function (v) { return /^en/i.test(v.lang); });
    var rank = function (v) { return /en[-_]AU/i.test(v.lang) ? 0 : /en[-_](GB|NZ)/i.test(v.lang) ? 1 : 2; };
    voices.sort(function (a, b) { return rank(a) - rank(b) || a.name.localeCompare(b.name); });
    $('#spVoice').innerHTML = voices.map(function (v) { return '<option value="' + esc(v.name) + '">' + esc(v.name + ' (' + v.lang + ')') + '</option>'; }).join('') || '<option value="">Default voice</option>';
    if (state.voice && voices.some(function (v) { return v.name === state.voice; })) $('#spVoice').value = state.voice;
    var au = voices.some(function (v) { return /en[-_]AU/i.test(v.lang); });
    $('#voiceNote').textContent = voices.length ? (au ? 'Using an Australian voice where available.' : 'No Australian voice on this device — using the closest English voice.') : '';
  }
  if (synth) { loadVoices(); if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices); }
  $('#spVoice').addEventListener('change', function () { state.voice = $('#spVoice').value; save(); });
  function speak(text, rate) {
    if (!synth) { B.toast('Reading aloud is not supported in this browser'); return; }
    synth.cancel();
    var u = new SpeechSynthesisUtterance(text), v = voices.filter(function (x) { return x.name === ($('#spVoice').value || state.voice); })[0] || voices[0];
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-AU';
    u.rate = rate || +$('#spRate').value || 0.9; synth.speak(u);
  }
  function speakLines(lines) { if (!synth) { B.toast('Reading aloud is not supported in this browser'); return; } synth.cancel(); lines.forEach(function (l) { var u = new SpeechSynthesisUtterance(l); var v = voices.filter(function (x) { return x.name === ($('#spVoice').value || state.voice); })[0] || voices[0]; if (v) u.voice = v; u.lang = v ? v.lang : 'en-AU'; u.rate = +$('#spRate').value || 0.9; synth.speak(u); }); }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-say]'); if (t) { speak(t.getAttribute('data-say')); return; }
    var p = e.target.closest && e.target.closest('[data-practise]'); if (p) { $('#spTarget').value = p.getAttribute('data-practise'); showTab('speak'); $('#spResult').innerHTML = ''; window.scrollTo(0, $('#spTarget').getBoundingClientRect().top + window.scrollY - 80); }
  });

  // ---------- speech recognition ----------
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition, rec = null, listening = false;
  if (!SR) {
    $('#srNote').innerHTML = '<span class="pill-warn">Heads-up</span> Speech recognition works in Chrome and Edge (desktop and Android). In this browser you can still listen, and type what you said to get a score.';
    $('#spRec').disabled = true; $('#spTypeBox').open = true;
  }
  function startListening(target, onResult) {
    if (!SR) { B.toast('Speech recognition needs Chrome or Edge'); return; }
    if (listening && rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'en-AU'; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
    var finalText = '';
    rec.onresult = function (e) { var t = ''; for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; finalText = t; $('#spStatus').textContent = '“' + t + '”'; };
    rec.onerror = function (e) { $('#spStatus').textContent = e.error === 'not-allowed' ? 'Microphone permission was blocked. Allow it in the address bar and try again.' : e.error === 'no-speech' ? 'I didn’t hear anything — try again a bit louder.' : 'Speech recognition error: ' + e.error; };
    rec.onend = function () { listening = false; $('#spRec').textContent = '🎤 Say it'; if (finalText) onResult(finalText); };
    try { rec.start(); listening = true; $('#spRec').textContent = '⏹ Stop'; $('#spStatus').textContent = 'Listening… say the sentence now.'; } catch (err) { $('#spStatus').textContent = err.message; }
  }
  function scoreSpeech(target, said, box, quiet) {
    var r = L.compareSpeech(target, said), cls = r.score >= 85 ? 'ok' : r.score >= 60 ? 'warn' : 'bad';
    var diff = r.ops.map(function (o) {
      var title = { ok: 'Correct', close: 'Close — you said “' + (o.said || '') + '”', missed: 'Missed', extra: 'Extra word' }[o.status];
      return '<span class="' + o.status + '" title="' + esc(title) + '">' + esc(o.word) + (o.status === 'close' ? ' <small>(' + esc(o.said) + ')</small>' : '') + '</span>';
    }).join(' ');
    var tip = r.score >= 85 ? 'Excellent! Try it a little faster for natural rhythm.' : r.score >= 60 ? 'Good. Listen again and focus on the red and orange words.' : 'Listen at a slower speed, then say it in two halves.';
    box.innerHTML = '<div class="panel"><div class="row" style="gap:18px"><div><div class="ep-score ' + cls + '">' + r.score + '</div><div class="small muted">score</div></div><div class="small">I heard: “' + esc(said) + '”<br>' + tip + '</div></div>' +
      '<p class="ep-diff">' + diff + '</p><p class="small muted"><span class="ok">green</span> = right · <span class="warn">orange</span> = close · <span class="bad">red</span> = missed · <s>grey</s> = extra. Recognition isn’t perfect — accents are fine; aim for clear, not “perfect”.</p></div>';
    if (!quiet) record('speaking', { score: r.score, target: target });
    return r;
  }
  $('#spListen').addEventListener('click', function () { speak($('#spTarget').value); });
  $('#spRec').addEventListener('click', function () { var t = $('#spTarget').value.trim(); if (!t) { B.toast('Type or pick a sentence first'); return; } startListening(t, function (said) { scoreSpeech(t, said, $('#spResult')); }); });
  $('#spTypedGo').addEventListener('click', function () { var t = $('#spTarget').value.trim(), s = $('#spTyped').value.trim(); if (t && s) scoreSpeech(t, s, $('#spResult')); });
  $('#spList').innerHTML = L.SPEAKING.map(function (s) {
    return '<div class="ep-line"><span class="ep-who">' + esc(s.prompt) + '</span><span>' + esc(s.model) + '</span><span class="row" style="gap:4px"><button class="ep-icon" type="button" data-say="' + esc(s.model) + '" aria-label="Listen">🔊</button><button class="ep-icon" type="button" data-practise="' + esc(s.model) + '">Practise</button></span></div>';
  }).join('');

  // ---------- today ----------
  function tick(key) { return doneToday(key) ? ' <span class="ep-done">✓ done</span>' : ''; }
  function renderToday() {
    var set = L.dailySet(today()), c = set.conversation;
    $('#todayDate').textContent = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }) + ' — a new set every day.';
    $('#tConv').innerHTML = '<h2 style="margin-top:0">1. Conversation: ' + esc(c.title) + tick('conv') + '</h2><p class="small muted">' + esc(c.setting) + '</p>' +
      c.lines.map(function (l) { var you = l[0] === 'You'; return '<div class="ep-line' + (you ? ' you' : '') + '"><span class="ep-who">' + esc(l[0]) + '</span><span>' + esc(l[1]) + '</span><span class="row" style="gap:4px"><button class="ep-icon" type="button" data-say="' + esc(l[1]) + '" aria-label="Listen">🔊</button>' + (you ? '<button class="ep-icon" type="button" data-practise="' + esc(l[1]) + '">🎤</button>' : '') + '</span></div>'; }).join('') +
      '<p class="small"><strong>Tip:</strong> ' + esc(c.tip) + '</p><div class="row"><button class="btn" type="button" id="convAll">🔊 Play the whole conversation</button><button class="btn" type="button" data-mark="conv">Mark as done</button></div>';
    $('#tExpr').innerHTML = '<h2 style="margin-top:0">2. Three Aussie expressions' + tick('expr') + '</h2>' + set.expressions.map(exprCard).join('') + '<button class="btn" type="button" data-mark="expr">I’ve got these</button>';
    $('#tGram').innerHTML = '<h2 style="margin-top:0">3. Grammar drill' + tick('gram') + '</h2>' + set.grammar.map(function (g, i) {
      return '<div style="margin:10px 0"><p><strong>' + (i + 1) + '.</strong> ' + esc(g.q) + '</p><div class="ep-opts" data-q="' + i + '">' + g.options.map(function (o, j) { return '<button class="btn small" type="button" data-opt="' + j + '">' + esc(o) + '</button>'; }).join('') + '</div><p class="small" data-why="' + i + '"></p></div>';
    }).join('');
    var sp = set.speaking;
    $('#tSpeak').innerHTML = '<h2 style="margin-top:0">4. Speaking' + tick('speak') + '</h2><p><strong>' + esc(sp.prompt) + '</strong></p><p>Say this, then try your own version:</p><p class="ep-ex">“' + esc(sp.model) + '”</p>' +
      '<div class="row"><button class="btn" type="button" data-say="' + esc(sp.model) + '">🔊 Listen</button><button class="btn primary" type="button" id="todaySpeak">🎤 Say it</button><button class="btn" type="button" data-practise="' + esc(sp.model) + '">Open in Speak tab</button></div><div id="todaySpeakOut"></div>';
    $('#convAll').onclick = function () { speakLines(c.lines.map(function (l) { return l[1]; })); };
    $('#todaySpeak').onclick = function () {
      if (!SR) { $('#spTarget').value = sp.model; showTab('speak'); return; }
      startListening(sp.model, function (said) { scoreSpeech(sp.model, said, $('#todaySpeakOut')); if (markToday('speak')) renderToday(); });
    };
    var answered = 0, correct = 0;
    $('#tGram').onclick = function (e) {
      var b = e.target.closest('[data-opt]'); if (!b) return; var box = b.parentNode, i = +box.dataset.q, g = set.grammar[i];
      if (box.dataset.answered) return; box.dataset.answered = '1'; answered++;
      var pick = +b.dataset.opt; if (pick === g.answer) correct++;
      B.$$('[data-opt]', box).forEach(function (x) { if (+x.dataset.opt === g.answer) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); x.disabled = true; });
      B.$('[data-why="' + i + '"]').innerHTML = (pick === g.answer ? '<span class="ok">Correct.</span> ' : '<span class="bad">Not quite.</span> ') + esc(g.why);
      if (answered === set.grammar.length) { B.toast(correct + ' of ' + answered + ' right'); if (markToday('gram')) { record('grammar', { score: correct / answered }); } }
    };
  }
  function exprCard(e) {
    var learned = state.learned.indexOf(e.id) >= 0, pill = { neutral: 'pill-ok', polite: 'pill-ok', casual: 'pill-warn', slang: 'pill-warn', avoid: 'pill-bad' }[e.formality];
    return '<div class="ep-expr" style="margin:10px 0"><h3>' + esc(e.phrase) + ' <span class="' + pill + '">' + esc(e.formality) + '</span></h3><p>' + esc(e.meaning) + '</p><p class="ep-ex">' + esc(e.example) + '</p>' +
      '<div class="row" style="gap:6px"><button class="ep-icon" type="button" data-say="' + esc(e.example) + '">🔊 Listen</button>' + (e.formality !== 'avoid' ? '<button class="ep-icon" type="button" data-practise="' + esc(e.example) + '">🎤 Practise</button>' : '') +
      '<button class="ep-icon" type="button" data-learn="' + e.id + '">' + (learned ? '★ Learned' : '☆ Mark learned') + '</button></div></div>';
  }
  document.addEventListener('click', function (e) {
    var m = e.target.closest && e.target.closest('[data-mark]');
    if (m) { var k = m.getAttribute('data-mark'); if (markToday(k)) { record(k === 'conv' ? 'conversation' : 'expression'); if (k === 'expr') L.dailySet(today()).expressions.forEach(function (x) { if (state.learned.indexOf(x.id) < 0) state.learned.push(x.id); }); save(); B.toast('Nice work'); } renderToday(); return; }
    var l = e.target.closest && e.target.closest('[data-learn]');
    if (l) { var id = +l.getAttribute('data-learn'), i = state.learned.indexOf(id); if (i >= 0) state.learned.splice(i, 1); else state.learned.push(id); save(); l.textContent = i >= 0 ? '☆ Mark learned' : '★ Learned'; }
  });

  // ---------- expressions ----------
  function renderExpr() {
    var q = $('#exSearch').value.trim().toLowerCase(), lv = $('#exLevel').value;
    var list = L.EXPRESSIONS.filter(function (e) {
      if (lv === 'learned') { if (state.learned.indexOf(e.id) < 0) return false; } else if (lv && e.formality !== lv) return false;
      return !q || (e.phrase + ' ' + e.meaning + ' ' + e.example + ' ' + e.formality).toLowerCase().indexOf(q) >= 0;
    });
    $('#exCount').textContent = list.length + ' of ' + L.EXPRESSIONS.length + ' expressions · ' + state.learned.length + ' learned';
    $('#exList').innerHTML = list.map(function (e) { return '<div class="card">' + exprCard(e) + '</div>'; }).join('') || '<p class="muted">Nothing matches.</p>';
  }
  $('#exSearch').addEventListener('input', renderExpr); $('#exLevel').addEventListener('change', renderExpr);

  // ---------- grammar ----------
  function renderGrammar() {
    var text = $('#gText').value; if (!text.trim()) { $('#gOut').innerHTML = ''; return; }
    var r = L.checkGrammar(text); record('check');
    var marked = '', pos = 0;
    r.issues.filter(function (i) { return i.start >= 0; }).forEach(function (i, n) { marked += esc(text.slice(pos, i.start)) + '<mark class="' + (i.style ? 'style' : '') + '" title="' + esc(i.suggestion) + '">' + esc(i.text) + '</mark>'; pos = i.end; });
    marked += esc(text.slice(pos));
    var errs = r.issues.filter(function (i) { return !i.style; }).length, style = r.issues.length - errs;
    $('#gOut').innerHTML = '<div class="panel">' + (r.issues.length ? '<p><strong>' + errs + ' likely mistake' + (errs === 1 ? '' : 's') + '</strong>' + (style ? ' and <strong>' + style + ' phrase' + (style === 1 ? '' : 's') + '</strong> that may sound unusual in Australia' : '') + '.</p>' : '<p class="ok"><strong>No common mistakes found.</strong> Nice work.</p>') +
      '<div class="ep-marked">' + marked + '</div>' +
      (r.issues.length ? '<h3>What to change</h3>' + r.issues.map(function (i) {
        return '<div class="ep-issue"><span class="' + (i.style ? 'pill-warn' : 'pill-bad') + '">' + (i.style ? 'Sounds unusual' : 'Mistake') + '</span> <s>' + esc(i.text) + '</s> → <strong>' + esc(i.suggestion) + '</strong>' + (i.later ? ' <span class="small muted">(after the fixes above)</span>' : '') + '<div class="small muted">' + esc(i.why) + '</div></div>';
      }).join('') + '<h3>Corrected version</h3><div class="ep-marked" id="gFixed">' + esc(r.corrected) + '</div><div class="row" style="margin-top:8px"><button class="btn" type="button" id="gUse">Use corrected text</button><button class="btn" type="button" id="gCopy">Copy</button><button class="btn" type="button" id="gHear">🔊 Listen</button></div>' : '') + '</div>';
    if (r.issues.length) {
      $('#gUse').onclick = function () { $('#gText').value = r.corrected; renderGrammar(); };
      $('#gCopy').onclick = function () { B.copy(r.corrected); };
      $('#gHear').onclick = function () { speak(r.corrected); };
    }
    var panel = B.$('#gOut .panel');
    B.ai.button(panel, 'Make it sound natural (AI)', function () {
      return 'Rewrite this so it sounds natural and polite in Australian workplace English. Keep the meaning and roughly the same length. Then list up to 3 short notes on what you changed and why, for an English learner.\n\nText:\n' + $('#gText').value.slice(0, 4000);
    }, function (ans) { var box = B.$('#gAi') || B.h('div', { id: 'gAi' }); box.innerHTML = '<p class="small muted">AI suggestion — read it before using it.</p><pre style="white-space:pre-wrap">' + esc(ans) + '</pre>'; panel.appendChild(box); });
  }
  $('#gCheck').addEventListener('click', renderGrammar);
  $('#gExample').addEventListener('click', function () {
    $('#gText').value = 'Hi Sam,\n\nMyself Arun from the testing team. i am agree with your plan. I am working here since 3 years and we discussed about this issue before. Its a important change, so please prepone the meeting to Monday. I have a doubt about the test data — can you explain me how it works? I will revert back to you by Friday.\n\nThanks';
    renderGrammar();
  });

  // ---------- role-play ----------
  var play = null;
  function renderRoleList() {
    $('#rpList').innerHTML = L.SCENARIOS.map(function (s) {
      var best = state.scenarios[s.id];
      return '<div class="card"><h3>' + esc(s.title) + '</h3><p>' + esc(s.desc) + '</p><p class="small" style="margin-top:6px">' + (best != null ? 'Best: <strong>' + best + '%</strong>' : 'Not tried yet') + '</p><button class="btn small" type="button" data-play="' + s.id + '" style="margin-top:8px">Start</button></div>';
    }).join('');
  }
  $('#rpList').addEventListener('click', function (e) { var b = e.target.closest('[data-play]'); if (!b) return; startPlay(b.getAttribute('data-play')); });
  function startPlay(id) {
    var s = L.SCENARIOS.filter(function (x) { return x.id === id; })[0];
    play = { s: s, node: s.start, path: [], html: '' };
    renderPlay(); $('#rpPlay').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderPlay() {
    var s = play.s, node = s.nodes[play.node];
    var body = '<div class="panel"><div class="row" style="justify-content:space-between"><h2 style="margin:0">' + esc(s.title) + '</h2><button class="btn small" type="button" id="rpQuit">Close</button></div>' + play.html;
    if (play.node === 'end') {
      var res = L.scenarioResult(s, play.path);
      body += '<div class="panel"><div class="ep-score ' + (res.pct >= 85 ? 'ok' : res.pct >= 60 ? 'warn' : 'bad') + '">' + res.pct + '%</div><p>' + esc(res.verdict) + '</p><div class="row"><button class="btn primary" type="button" data-play="' + s.id + '">Try again</button></div></div>';
    } else {
      body += '<div class="ep-npc"><strong>' + esc(node.who) + ':</strong> ' + esc(node.say) + ' <button class="ep-icon" type="button" data-say="' + esc(node.say) + '" aria-label="Listen">🔊</button></div><p class="small muted">What do you say?</p><div class="ep-choices">' +
        node.choices.map(function (c, i) { return '<button class="btn" type="button" data-choice="' + i + '">' + esc(c.text) + '</button>'; }).join('') + '</div>';
    }
    $('#rpPlay').innerHTML = body + '</div>';
    $('#rpQuit').onclick = function () { play = null; $('#rpPlay').innerHTML = ''; };
  }
  $('#rpPlay').addEventListener('click', function (e) {
    var b = e.target.closest('[data-choice]'); if (b && play) {
      var node = play.s.nodes[play.node], c = node.choices[+b.dataset.choice];
      var pill = c.score === 2 ? '<span class="pill-ok">Great</span>' : c.score === 1 ? '<span class="pill-warn">OK</span>' : '<span class="pill-bad">Try again</span>';
      play.html += '<div class="ep-npc"><strong>' + esc(node.who) + ':</strong> ' + esc(node.say) + '</div><div class="ep-mine">' + esc(c.text) + '</div><div class="ep-fb">' + pill + ' ' + esc(c.feedback) + '</div>';
      play.path.push(c); play.node = c.next;
      if (play.node === 'end') { var res = L.scenarioResult(play.s, play.path); record('roleplay', { id: play.s.id, pct: res.pct }); renderRoleList(); }
      renderPlay(); return;
    }
    var p = e.target.closest('[data-play]'); if (p) startPlay(p.getAttribute('data-play'));
  });

  // ---------- progress ----------
  function renderProgress() {
    var st = L.streak(state, today()), days = state.days, total = 0; Object.keys(days).forEach(function (d) { total += days[d].count; });
    var trend = L.speechTrend(state, 14), avg = state.speech.length ? Math.round(state.speech.slice(-10).reduce(function (a, s) { return a + s.score; }, 0) / Math.min(10, state.speech.length)) : null;
    $('#pStats').innerHTML = [['Current streak', st.current + (st.current === 1 ? ' day' : ' days')], ['Best streak', st.best + ' days'], ['Days practised', st.activeDays], ['Exercises done', total], ['Speaking avg (last 10)', avg == null ? '–' : avg], ['Expressions learned', state.learned.length]]
      .map(function (s) { return '<div class="stat"><div class="k">' + s[0] + '</div><div class="v">' + esc(s[1]) + '</div></div>'; }).join('');
    $('#pSpeech').innerHTML = trend.length ? B.barChart(trend.map(function (t) { return { label: t.date.slice(5) + ' (' + t.n + ')', value: t.avg, color: t.avg >= 85 ? 'var(--ok)' : t.avg >= 60 ? 'var(--warn)' : 'var(--bad)' }; }), { fmt: function (v) { return v + '/100'; } }) : '<p class="muted">Say a sentence in the Speak tab to start tracking.</p>';
    var rows = []; for (var i = 13; i >= 0; i--) { var d = L.addDays(today(), -i); rows.push({ label: d.slice(5), value: days[d] ? days[d].count : 0 }); }
    $('#pDays').innerHTML = B.barChart(rows, { fmt: function (v) { return v ? v + ' done' : '–'; } });
    $('#pRole').innerHTML = B.table(L.SCENARIOS.map(function (s) { return { title: s.title, best: state.scenarios[s.id] }; }), [{ key: 'title', label: 'Scenario' }, { key: 'best', label: 'Best score', fmt: function (v) { return v == null ? '<span class="muted">Not tried</span>' : '<strong>' + v + '%</strong>'; } }]);
  }

  // ---------- backup ----------
  $('#exportJson').addEventListener('click', function () { B.download('everyday-english-' + today() + '.json', JSON.stringify({ app: 'english-practice', version: 1, data: state }, null, 2), 'application/json'); });
  $('#importJson').addEventListener('click', function () {
    var inp = B.h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', function () {
      if (!inp.files[0]) return;
      B.readFile(inp.files[0]).then(function (t) {
        var j = JSON.parse(t), d = j && j.data; if (!d || typeof d.days !== 'object') throw new Error('This is not an Everyday English backup');
        if (!confirm('Replace your current progress with this backup?')) return;
        B.store.set(KEY, d); state = load(); renderAll(); B.toast('Backup restored');
      }).catch(function (err) { B.toast(err.message, 4000); });
    });
    inp.click();
  });
  $('#clearAll').addEventListener('click', function () { if (!confirm('Reset all your progress, streaks and learned expressions?')) return; B.store.remove(KEY); state = load(); renderAll(); B.toast('Progress reset'); });

  // ---------- sample ----------
  $('#sample').addEventListener('click', function () {
    if (Object.keys(state.days).length && !confirm('Add sample practice history to your progress?')) return;
    var targets = L.SPEAKING.slice(0, 12);
    for (var i = 12; i >= 1; i--) {
      if (i === 5) continue; // a missed day, so the streak looks realistic
      var d = L.addDays(today(), -i);
      L.recordActivity(state, d, 'conversation'); L.recordActivity(state, d, 'expression'); L.recordActivity(state, d, 'grammar');
      var t = targets[i % targets.length]; L.recordActivity(state, d, 'speaking', { score: Math.min(98, 52 + (12 - i) * 4 + (i % 3) * 3), target: t.model });
    }
    L.recordActivity(state, L.addDays(today(), -3), 'roleplay', { id: 'cafe', pct: 75 });
    L.recordActivity(state, L.addDays(today(), -1), 'roleplay', { id: 'interview', pct: 88 });
    [0, 2, 5, 9, 12, 20, 27, 33].forEach(function (id) { if (state.learned.indexOf(id) < 0) state.learned.push(id); });
    if (!$('#gText').value.trim()) $('#gExample').click();
    save(); renderAll(); showTab('progress'); B.toast('Sample practice history loaded');
  });

  function renderAll() { renderToday(); renderExpr(); renderRoleList(); renderProgress(); }
  $('#goToday').addEventListener('click', function () { showTab('today'); });
  if (!$('#spTarget').value) $('#spTarget').value = L.dailySet(today()).speaking.model;
  renderAll();
  showTab = B.tabs($('[data-tabs="ep"]'), function (id) { if (id === 'progress') renderProgress(); });
  B.ai.note($('#gOut').parentNode);
})();
