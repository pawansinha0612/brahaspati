/* Contract Risk Scanner — page wiring. Logic lives in lib.js (ContractLib). */
(function () {
  'use strict';
  var L = window.ContractLib, S = window.ContractSamples, $ = B.$, esc = B.esc;
  var KEY = 'contracts:saved';
  var saved = B.store.get(KEY, []) || [];
  var res = null, showTab, currentId = null;
  var SEV_PILL = { high: 'pill-bad', medium: 'pill-warn', low: 'pill-ok', info: 'pill-mute', missing: 'pill-warn' };
  var SEV_WORD = { high: 'High', medium: 'Check', low: 'Note', info: 'Info', missing: 'Missing' };

  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function pill(sev) { return '<span class="' + (SEV_PILL[sev] || 'pill-mute') + '">' + esc(SEV_WORD[sev] || sev) + '</span>'; }
  function status(t) { $('#status').textContent = t || ''; }
  function name() { return $('#name').value.trim() || 'Contract'; }
  function fileBase() { return 'contract-review-' + name().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50); }

  // ---------- reading files ----------
  function readPdf(file) {
    return Promise.all([B.lib.pdfjs(), B.readFile(file, 'buffer')]).then(function (r) {
      return r[0].getDocument({ data: r[1] }).promise.then(function (pdf) {
        var pages = [];
        for (var i = 1; i <= pdf.numPages; i++) pages.push(i);
        return pages.reduce(function (p, n) {
          return p.then(function (acc) {
            status('Reading page ' + n + ' of ' + pdf.numPages + '…');
            return pdf.getPage(n).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
              var out = '', lastY = null;
              tc.items.forEach(function (it) {
                var y = it.transform ? Math.round(it.transform[5]) : null;
                if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && !/\n$/.test(out)) out += '\n';
                out += it.str; if (it.hasEOL) { out += '\n'; lastY = null; } else lastY = y;
              });
              return acc + out + '\n\n';
            });
          });
        }, Promise.resolve(''));
      });
    });
  }
  function readDocx(file) {
    return Promise.all([B.lib.mammoth(), B.readFile(file, 'buffer')]).then(function (r) { return r[0].extractRawText({ arrayBuffer: r[1] }); }).then(function (x) { return x.value; });
  }
  function handleFile(file) {
    var n = file.name.toLowerCase(), p;
    status('Reading ' + file.name + '…');
    if (/\.pdf$/.test(n)) p = readPdf(file);
    else if (/\.docx$/.test(n)) p = readDocx(file);
    else if (/\.doc$/.test(n)) return status('Old .doc files cannot be read here. Open it in Word or Google Docs and save as .docx or PDF.');
    else p = B.readFile(file);
    p.then(function (text) {
      if (!text || text.replace(/\s/g, '').length < 50) { status('Found almost no text in ' + file.name + '. If it is a scanned PDF, convert it with the Screenshot Reader app (OCR) first.'); return; }
      $('#text').value = text.replace(/[ \t]+\n/g, '\n');
      if (!$('#name').value) $('#name').value = file.name.replace(/\.[^.]+$/, '');
      currentId = null; run();
    }).catch(function (e) { status('Could not read the file: ' + e.message); });
  }

  // ---------- render ----------
  function run() {
    var text = $('#text').value;
    if (text.trim().length < 40) { status('Paste or upload a contract first.'); return; }
    res = L.scan(text, { type: $('#type').value || null });
    status('Found ' + res.clauses.length + ' clauses and ' + res.summary.length + ' clause types to look at' + ($('#type').value ? '.' : ' · looks like a ' + res.typeLabel.toLowerCase() + ' (change the type above if not).'));
    $('#out').hidden = false; render(); showTab('summary');
  }
  function render() {
    var s = res.score, col = s.level === 'High' ? 'var(--bad)' : s.level === 'Medium' ? 'var(--warn)' : 'var(--ok)';
    var important = res.summary.filter(function (x) { return x.severity !== 'info'; }), info = res.summary.filter(function (x) { return x.severity === 'info'; });
    var h = '<div class="cols-2" style="margin-top:14px"><div class="panel"><div class="k small muted">RISK SCORE</div><div class="score" style="color:' + col + '">' + s.score + '<span class="small muted">/100</span></div>' +
      '<div class="meter"><span style="width:' + s.score + '%;background:' + col + '"></span></div><b>' + esc(s.level) + '</b> <span class="small muted">— based on ' + res.summary.length + ' clause types found and ' + res.missing.length + ' usually-expected clause(s) missing in a ' + esc(res.typeLabel.toLowerCase()) + '.</span>' +
      '<details style="margin-top:8px"><summary class="small">Why this score</summary><ul class="small">' + s.reasons.map(function (r) { return '<li>' + esc(r.text) + ' <span class="muted">+' + r.points + '</span></li>'; }).join('') + '</ul></details></div>';
    h += '<div class="panel"><h3 style="margin-top:0">Key dates</h3>' + (res.keyDates.items.length ? '<ul style="padding-left:18px;margin:0">' + res.keyDates.items.map(function (k) { return '<li><b>' + esc(B.fmt.date(k.date)) + '</b> — ' + esc(k.label) + '<br><span class="small muted">' + esc(k.source) + '</span></li>'; }).join('') + '</ul>' : '<p class="small muted">No start or end date found. Look for the term in a schedule or cover letter.</p>') + '</div></div>';
    h += '<h2>Things to check (' + important.length + ')</h2><div class="panel">' + (important.length ? important.map(function (x) {
      return '<div class="find">' + pill(x.severity) + '<div><b>' + esc(x.label) + '</b><span class="muted">' + esc(L.detailText(x.id, x.details)) + '</span>' +
        '<p class="muted small">Clause ' + esc(x.clauses.filter(Boolean).join(', ')) + '</p><p>' + esc(x.explain) + '</p></div></div>';
    }).join('') : '<p>No risky clause types matched. That does not mean the contract is safe — read it in full.</p>') + '</div>';
    if (res.missing.length) h += '<h2>Usually in a ' + esc(res.typeLabel.toLowerCase()) + ', not found here (' + res.missing.length + ')</h2><div class="panel">' + res.missing.map(function (m) { return '<div class="find">' + pill('missing') + '<div><b>' + esc(m.label) + '</b><p>' + esc(m.why) + '</p></div></div>'; }).join('') + '</div>';
    if (info.length) h += '<h2>Also present (normal, worth a read)</h2><div class="panel">' + info.map(function (x) { return '<div class="find">' + pill('info') + '<div><b>' + esc(x.label) + '</b><span class="muted">' + esc(L.detailText(x.id, x.details)) + '</span><p class="small muted">Clause ' + esc(x.clauses.filter(Boolean).join(', ')) + '</p></div></div>'; }).join('') + '</div>';
    $('#summary').innerHTML = h;
    renderClauses(); renderQuestions(); renderDetails();
  }
  function renderClauses() {
    var only = $('#onlyFlagged').checked, by = {};
    res.flags.forEach(function (f) { (by[f.clause] = by[f.clause] || []).push(f); });
    var list = res.clauses.filter(function (c) { return !only || (by[c.index] || []).some(function (f) { return f.severity !== 'info'; }); });
    $('#clauses').innerHTML = list.length ? list.map(function (c) {
      var fl = (by[c.index] || []).slice().sort(function (a, b) { return L.SEV_ORDER[b.severity] - L.SEV_ORDER[a.severity]; }), worst = fl[0] ? fl[0].severity : '';
      return '<div class="panel clause sev-' + worst + '"><h3>' + (c.num ? esc(c.num) + ' · ' : '') + esc(c.heading) + '</h3><div class="body">' + L.highlight(c.text, fl.map(function (f) { return f.match; })) + '</div>' +
        fl.map(function (f) { return '<p class="flag">' + pill(f.severity) + ' <b>' + esc(f.label) + '</b><span class="muted">' + esc(L.detailText(f.id, f.details)) + '</span><br><span class="small">' + esc(f.explain) + '</span></p>'; }).join('') + '</div>';
    }).join('') : '<p class="muted">No clauses with flags. Untick the box to see every clause.</p>';
  }
  function questionsText() { return res.questions.map(function (q, i) { return (i + 1) + '. ' + q.q; }).join('\n'); }
  function renderQuestions() {
    $('#questions').innerHTML = '<p class="muted" style="margin-top:14px">Questions you could send to the other party (or your lawyer). Edit them to suit — you are asking, not demanding.</p>' +
      (res.questions.length ? '<div class="panel"><ol class="qs">' + res.questions.map(function (q) { return '<li>' + esc(q.q) + ' <span class="small muted">(' + esc(q.topic) + ')</span></li>'; }).join('') + '</ol></div>' +
        '<div class="row"><button class="btn" type="button" id="copyQs">Copy questions</button><button class="btn" type="button" id="copyEmail">Copy as an email</button></div>' : '<p>No questions generated.</p>');
    var cq = $('#copyQs'); if (cq) cq.addEventListener('click', function () { B.copy(questionsText()); });
    var ce = $('#copyEmail'); if (ce) ce.addEventListener('click', function () {
      B.copy('Hi,\n\nThanks for sending through the ' + name() + '. Before we sign, could you help with a few questions?\n\n' + questionsText() + '\n\nHappy to talk any of these through.\n\nKind regards,\n');
    });
  }
  function renderDetails() {
    var h = '<h2>Parties</h2>' + (res.parties.length ? B.table(res.parties, [{ key: 'name', label: 'Name' }, { key: 'role', label: 'Called' }, { key: 'abn', label: 'ABN / ACN' }]) : '<p class="muted">No parties found in the opening lines.</p>');
    h += '<h2>All dates mentioned</h2>' + (res.dates.length ? B.table(res.dates.map(function (d) { return { date: d.date, raw: d.raw, ctx: '…' + d.before.slice(-60).replace(/\s+/g, ' ') + d.raw + d.after.replace(/\s+/g, ' ') + '…' }; }), [{ key: 'date', label: 'Date' }, { key: 'raw', label: 'As written' }, { key: 'ctx', label: 'Context' }]) : '<p class="muted">No dates found.</p>');
    h += '<h2>Money amounts</h2>' + (res.money.length ? B.table(res.money, [{ key: 'raw', label: 'Amount', fmt: function (v, r) { return esc(v) + (r.gst ? ' <span class="small muted">' + esc(r.gst) + '</span>' : ''); } }, { key: 'context', label: 'Context' }]) : '<p class="muted">No dollar amounts found.</p>');
    $('#details').innerHTML = h;
  }

  // ---------- saved scans ----------
  function persist() { if (!B.store.set(KEY, saved)) B.toast('Could not save — browser storage may be full. Export and delete old scans.', 4000); }
  function renderSaved() {
    if (!saved.length) { $('#saved').innerHTML = '<p class="muted">No saved scans yet.</p>'; return; }
    $('#saved').innerHTML = B.table(saved.map(function (s) { return s; }), [
      { key: 'name', label: 'Contract' }, { key: 'date', label: 'Saved' }, { key: 'score', label: 'Score', fmt: function (v, r) { return esc(v) + '/100 ' + esc(r.level || ''); } },
      { key: 'id', label: '', fmt: function (id) { return '<button class="btn small" type="button" data-open="' + esc(id) + '">Open</button> <button class="btn small" type="button" data-del="' + esc(id) + '">Delete</button>'; } }
    ]);
  }
  $('#saved').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var id = b.dataset.open || b.dataset.del, s = saved.filter(function (x) { return x.id === id; })[0]; if (!s) return;
    if (b.dataset.del) { if (!confirm('Delete the saved scan "' + s.name + '"?')) return; saved = saved.filter(function (x) { return x.id !== id; }); persist(); renderSaved(); return; }
    $('#text').value = s.text; $('#name').value = s.name; $('#type').value = s.type || ''; currentId = s.id; run(); window.scrollTo({ top: $('#out').offsetTop - 20, behavior: 'smooth' });
  });
  $('#save').addEventListener('click', function () {
    if (!res) return;
    var rec = { id: currentId || B.uid(), name: name(), date: today(), type: $('#type').value, text: $('#text').value, score: res.score.score, level: res.score.level };
    var i = saved.findIndex(function (x) { return x.id === rec.id; }); if (i >= 0) saved[i] = rec; else saved.unshift(rec);
    currentId = rec.id; persist(); renderSaved(); B.toast('Saved in this browser');
  });
  $('#export').addEventListener('click', function () { if (!saved.length) return B.toast('Nothing saved yet'); B.download('contract-scans-' + today() + '.json', JSON.stringify({ app: 'contract-scanner', version: 1, exported: new Date().toISOString(), scans: saved }, null, 2), 'application/json'); });
  var imp = B.h('input', { type: 'file', accept: '.json,application/json', hidden: true }); document.body.appendChild(imp);
  $('#import').addEventListener('click', function () { imp.click(); });
  imp.addEventListener('change', function () {
    var f = imp.files[0]; imp.value = ''; if (!f) return;
    B.readFile(f).then(function (t) {
      var j = JSON.parse(t), list = (Array.isArray(j) ? j : j.scans || []).filter(function (s) { return s && typeof s.text === 'string'; }), n = 0;
      list.forEach(function (s) { if (!s.id || saved.some(function (x) { return x.id === s.id; })) s.id = B.uid(); saved.unshift({ id: s.id, name: String(s.name || 'Imported contract'), date: String(s.date || today()), type: s.type || '', text: s.text, score: s.score, level: s.level }); n++; });
      persist(); renderSaved(); B.toast('Imported ' + n + ' scan(s)');
    }).catch(function (e) { B.toast('Could not import: ' + e.message, 4000); });
  });

  // ---------- outputs ----------
  function report() { return L.reportHtml(res, name(), today()); }
  $('#print').addEventListener('click', function () {
    if (!res) return;
    var f = B.h('iframe', { title: 'Print', style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0' });
    f.addEventListener('load', function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { B.toast('Printing was blocked. Use Download instead.'); } setTimeout(function () { f.remove(); }, 60000); });
    f.srcdoc = report(); document.body.appendChild(f);
  });
  $('#dlReport').addEventListener('click', function () { if (res) B.download(fileBase() + '.html', report(), 'text/html;charset=utf-8'); });
  $('#ics').addEventListener('click', function () {
    if (!res) return; if (!res.keyDates.items.length) return B.toast('No key dates found to add', 3000);
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    B.download(fileBase() + '-dates.ics', L.ics(res.keyDates.items, name(), stamp), 'text/calendar;charset=utf-8');
  });

  // ---------- inputs ----------
  B.dropZone($('#drop'), function (files) { handleFile(files[0]); }, { accept: '.pdf,.docx,.txt,.md,.rtf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  var types = $('#type'); Object.keys(L.TYPES).forEach(function (k) { types.appendChild(B.h('option', { value: k, text: L.TYPES[k].label })); });
  types.addEventListener('change', function () { if (res) run(); });
  var sk = $('#sampleKind'); Object.keys(S).forEach(function (k) { sk.appendChild(B.h('option', { value: k, text: S[k].name })); });
  $('#sample').addEventListener('click', function () { var s = S[sk.value]; $('#text').value = s.text; $('#name').value = s.name; $('#type').value = ''; currentId = null; run(); });
  $('#scan').addEventListener('click', run);
  $('#clear').addEventListener('click', function () { $('#text').value = ''; $('#name').value = ''; res = null; currentId = null; $('#out').hidden = true; status(''); });
  $('#onlyFlagged').addEventListener('change', function () { if (res) renderClauses(); });

  if (B.ai) {
    B.ai.button($('#aiBox'), 'Explain the riskiest clauses in plain English', function () {
      if (!res) return null;
      var by = {}; res.flags.filter(function (f) { return f.severity === 'high' || f.severity === 'medium'; }).forEach(function (f) { by[f.clause] = 1; });
      var txt = res.clauses.filter(function (c) { return by[c.index]; }).slice(0, 12).map(function (c) { return (c.num ? c.num + ' ' : '') + c.text; }).join('\n\n').slice(0, 9000);
      if (!txt) { B.toast('No higher-risk clauses to explain'); return null; }
      return 'These clauses come from a ' + res.typeLabel.toLowerCase() + ' an Australian small business owner has been asked to sign. For each clause, explain in 2–3 plain-English sentences what it means for them in practice and one fair change they could ask for. Do not give legal advice or say whether it is enforceable; suggest a lawyer for anything significant.\n\n' + txt;
    }, function (ans) { $('#aiOut').innerHTML = '<div class="panel"><h3 style="margin-top:0">AI explanation (can be wrong — not legal advice)</h3><div style="white-space:pre-wrap">' + esc(ans) + '</div></div>'; });
  }

  showTab = B.tabs($('.tabs'));
  renderSaved();
})();
