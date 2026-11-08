/* Business Process Mapper — page wiring. Logic lives in lib.js (ProcessMapperLib). */
(function () {
  'use strict';
  var L = window.ProcessMapperLib, $ = B.$, esc = B.esc;
  var KEY = 'process-mapper:data';
  var MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
  var state = load(), model = null, mined = null, lastSvg = '', renderSeq = 0, showTab;

  function load() {
    var d = B.store.get(KEY, null) || {};
    return {
      steps: d.steps || '', transcript: d.transcript || '', mermaid: d.mermaid || '', edited: !!d.edited,
      lanes: d.lanes !== false, dir: d.dir || 'TD', fit: d.fit !== false, log: d.log || null,
      meta: Object.assign({ title: '', owner: '', ownerRole: '', version: '1.0', date: '', purpose: '', scope: '', revisions: [] }, d.meta || {})
    };
  }
  function save() { if (!B.store.set(KEY, state)) B.toast('Could not save — browser storage may be full.', 4000); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function slug() { return (state.meta.title || 'process').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'process'; }
  function dark() { var t = document.documentElement.dataset.theme; return t ? t === 'dark' : (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); }

  // ---------- model ----------
  function rebuildModel() {
    model = L.parseSteps(state.steps);
    if (!state.edited) state.mermaid = L.toMermaid(model, { swimlanes: state.lanes, direction: state.dir });
  }
  function renderParsed() {
    if (!model || !model.steps.length) { $('#parsed').innerHTML = '<p class="muted">Write or load some steps, then press <b>Build diagram and SOP</b>.</p>'; return; }
    var tm = L.totalMinutes(model), imp = L.improvements(model, mined);
    var html = '<div class="stat-row">' + stat(model.steps.length, 'Steps') + stat(model.roles.length || 0, 'Roles / lanes') +
      stat(model.steps.filter(function (s) { return s.kind === 'decision'; }).length, 'Decisions') + stat(imp.handoffs, 'Handoffs') +
      stat(tm ? L.fmtMinutes(tm) : '–', 'Hands-on time') + '</div>';
    html += B.table(model.steps.map(function (s) {
      var flags = [];
      if (s.kind === 'decision') flags.push('<span class="pill-warn">decision</span>');
      if (s.flags.approval) flags.push('<span class="pill-warn">approval</span>');
      if (s.flags.wait) flags.push('<span class="pill-bad">wait</span>');
      if (s.flags.rekey) flags.push('<span class="pill-bad">re-keying</span>');
      if (s.goto || (s.yes && s.yes.goto) || (s.no && s.no.goto)) flags.push('<span class="pill-warn">loop</span>');
      return { n: s.n, role: s.role ? esc(s.role) + (s.inferredRole ? ' <span class="small muted">(same as before)</span>' : '') : '<span class="muted">—</span>',
        what: esc(s.kind === 'decision' ? (s.label ? s.label + ' → ' : '') + s.question + ' Yes: ' + (s.yes ? s.yes.text : 'continue') + (s.no ? ' · No: ' + s.no.text : '') : s.label),
        sys: esc(s.systems.join(', ')), io: esc([].concat(s.inputs.map(function (x) { return 'in: ' + x; }), s.outputs.map(function (x) { return 'out: ' + x; })).join(', ')),
        time: esc(s.minutes ? L.fmtMinutes(s.minutes) : ''), flags: flags.join(' ') };
    }), [{ key: 'n', label: '#' }, { key: 'role', label: 'Role', fmt: raw }, { key: 'what', label: 'Step', fmt: raw }, { key: 'sys', label: 'Systems', fmt: raw },
      { key: 'io', label: 'Inputs / outputs', fmt: raw }, { key: 'time', label: 'Time', fmt: raw }, { key: 'flags', label: 'Flags', fmt: raw }]);
    html += '<p class="small muted">Wrong role or decision? Edit the wording above (e.g. <code>Role: action</code>) and build again.</p>';
    $('#parsed').innerHTML = html;
  }
  function raw(v) { return v; }
  function stat(v, k) { return '<div class="stat"><div class="v">' + esc(String(v)) + '</div><div class="k">' + esc(k) + '</div></div>'; }

  function buildAll(toTab) {
    state.steps = $('#stepsText').value; rebuildModel(); save();
    renderParsed(); renderMermaidText(); renderDiagram(); renderSop(); renderImprove(); renderOwnerRoles();
    if (toTab) showTab(toTab);
  }

  // ---------- diagram ----------
  function renderMermaidText() {
    $('#mmd').value = state.mermaid || '';
    $('#mmdState').textContent = state.edited ? 'Showing your edited code.' : 'Generated from the steps.';
  }
  var mermaidReady = null;
  function getMermaid() {
    if (!mermaidReady) {
      mermaidReady = B.loadScript(MERMAID).then(function () {
        window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark() ? 'dark' : 'default', flowchart: { htmlLabels: false, useMaxWidth: false } });
        return window.mermaid;
      }, function (e) { mermaidReady = null; throw e; });
    }
    return mermaidReady;
  }
  function renderDiagram() {
    var box = $('#diagram'), code = state.mermaid;
    box.classList.toggle('fit', state.fit);
    if (!code || (!state.edited && (!model || !model.steps.length))) { box.innerHTML = '<p class="muted">No diagram yet. Add steps on the Steps tab.</p>'; lastSvg = ''; renderSop(); return Promise.resolve(); }
    var seq = ++renderSeq;
    box.innerHTML = '<p class="muted">Drawing…</p>';
    return getMermaid().then(function (mm) {
      return mm.render('pm-svg-' + seq, code).then(function (r) {
        if (seq !== renderSeq) return;
        box.innerHTML = r.svg; lastSvg = r.svg; renderSop();
      });
    }).catch(function (e) {
      if (seq !== renderSeq) return;
      lastSvg = '';
      var bad = document.getElementById('dpm-svg-' + seq); if (bad) bad.remove();
      box.innerHTML = '<p class="bad">Could not draw the diagram: ' + esc((e && (e.message || e.str)) || e) + '</p><p class="small muted">If you are offline the drawing library cannot load — the Mermaid code below still works in mermaid.live or GitHub. If you edited the code, check the line mentioned above.</p>';
    });
  }
  function svgSize(svgText) {
    var m = svgText.match(/viewBox="([\d.\-]+)[ ,]+([\d.\-]+)[ ,]+([\d.]+)[ ,]+([\d.]+)"/);
    return m ? { w: Math.ceil(+m[3]), h: Math.ceil(+m[4]) } : { w: 1200, h: 800 };
  }
  function downloadPng() {
    if (!lastSvg) return B.toast('Draw the diagram first');
    var size = svgSize(lastSvg), scale = 2, svg;
    try {
      var doc = new DOMParser().parseFromString(lastSvg, 'image/svg+xml'), el = doc.documentElement;
      el.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); el.setAttribute('width', size.w); el.setAttribute('height', size.h); el.removeAttribute('style');
      svg = new XMLSerializer().serializeToString(el);
    } catch (e) { return B.toast('PNG export failed — use SVG'); }
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas'); c.width = size.w * scale; c.height = size.h * scale;
      var ctx = c.getContext('2d'); ctx.fillStyle = dark() ? '#1e2026' : '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
      try { c.toBlob(function (b) { if (b) B.download(slug() + '.png', b); else B.toast('PNG export is not supported here — use SVG'); }); } catch (e) { B.toast('PNG export is blocked in this browser — use SVG'); }
    };
    img.onerror = function () { B.toast('PNG export failed — use SVG'); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // ---------- SOP ----------
  function readMeta() {
    ['title', 'owner', 'ownerRole', 'version', 'date', 'purpose', 'scope'].forEach(function (k) { state.meta[k] = $('#m-' + k).value; });
  }
  function renderMeta() {
    ['title', 'owner', 'version', 'date', 'purpose', 'scope'].forEach(function (k) { $('#m-' + k).value = state.meta[k] || ''; });
    renderOwnerRoles(); renderRevs();
  }
  function renderOwnerRoles() {
    var roles = (model && model.roles) || [], cur = state.meta.ownerRole;
    $('#m-ownerRole').innerHTML = '<option value="">(none)</option>' + roles.map(function (r) { return '<option' + (r === cur ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('');
  }
  function renderRevs() {
    var revs = state.meta.revisions;
    $('#revs').innerHTML = revs.length ? revs.map(function (r, i) {
      return '<div class="rev"><input type="text" aria-label="Version" data-r="' + i + '" data-k="version" value="' + esc(r.version) + '"><input type="date" aria-label="Date" data-r="' + i + '" data-k="date" value="' + esc(r.date) + '">' +
        '<input type="text" aria-label="Author" placeholder="Author" data-r="' + i + '" data-k="author" value="' + esc(r.author) + '"><input type="text" aria-label="Change" placeholder="What changed" data-r="' + i + '" data-k="change" value="' + esc(r.change) + '">' +
        '<button class="btn small" type="button" data-del="' + i + '" aria-label="Remove revision">✕</button></div>';
    }).join('') : '<p class="small muted">No revisions yet — version 1.0 "First version" is used.</p>';
  }
  function sopMeta() { var m = Object.assign({}, state.meta); if (!m.date) m.date = today(); return m; }
  function sopHtmlDoc() { return L.sopHtml(model || L.parseSteps(''), sopMeta(), mined, lastSvg); }
  function renderSop() {
    var box = $('#sopPreview');
    if (!model || !model.steps.length) { box.innerHTML = '<p class="muted">Add steps first.</p>'; return; }
    var f = box.querySelector('iframe');
    if (!f) { box.innerHTML = ''; f = B.h('iframe', { title: 'SOP preview', style: 'width:100%;border:0;min-height:400px;background:#fff;border-radius:6px' }); box.appendChild(f); f.addEventListener('load', function () { try { f.style.height = (f.contentDocument.documentElement.scrollHeight + 20) + 'px'; } catch (e) {} }); }
    f.srcdoc = sopHtmlDoc();
  }
  function printSop() {
    if (!model || !model.steps.length) return B.toast('Add steps first');
    var f = B.h('iframe', { title: 'Print', style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0' });
    f.addEventListener('load', function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { B.toast('Printing was blocked. Use Download HTML instead.'); } setTimeout(function () { f.remove(); }, 60000); });
    f.srcdoc = sopHtmlDoc(); document.body.appendChild(f);
  }
  function sopMd() { return L.sopMarkdown(model, sopMeta(), mined, state.mermaid); }

  // ---------- improvements ----------
  function renderImprove() {
    if (!model || !model.steps.length) { $('#improve').innerHTML = '<p class="muted">Add steps first.</p>'; return; }
    var imp = L.improvements(model, mined);
    var html = '<div class="stat-row" style="margin-top:16px">' + stat(imp.handoffs, 'Handoffs') + stat(imp.waits, 'Waiting steps') + stat(imp.approvals, 'Approvals') + stat(imp.rekey, 'Re-keying steps') + stat(imp.loops, 'Loops') + '</div>';
    html += '<h2>What to look at</h2>' + imp.hints.map(function (h) { return '<div class="hint ' + esc(h.level) + '">' + esc(h.text) + '</div>'; }).join('');
    html += '<h2>General ideas that often help</h2><ul><li>Write the SOP with the people who do the work, then time one real case end to end.</li><li>Move checks to the start (a complete request form saves rework later).</li><li>Batch small approvals with a dollar limit instead of approving every case.</li><li>Replace "wait and chase" with an automatic reminder or a shared status board.</li></ul>';
    $('#improve').innerHTML = html;
  }

  // ---------- transcript ----------
  function convertTranscript() {
    state.transcript = $('#transcriptText').value;
    var steps = L.transcriptToSteps(state.transcript);
    if (!steps) return B.toast('No action sentences found — try plain notes like "First…, then…"');
    $('#stepsText').value = steps; buildAll('steps'); B.toast('Steps added — check and tidy them up');
  }

  // ---------- voice ----------
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition, rec = null, segs = [];
  function setupVoice() {
    if (!Rec) { $('#voiceStatus').textContent = 'Dictation works in Chrome and Edge.'; return; }
    $('#voice').hidden = false;
    $('#voice').addEventListener('click', function () {
      if (rec) { rec.stop(); return; }
      segs = []; rec = new Rec(); rec.lang = 'en-AU'; rec.continuous = true; rec.interimResults = true;
      rec.onresult = function (e) {
        var interim = '';
        for (var i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) segs.push(e.results[i][0].transcript); else interim += e.results[i][0].transcript; }
        $('#voiceStatus').innerHTML = '<span class="rec-dot"></span> ' + esc((segs.slice(-1)[0] || '') + ' ' + interim).slice(-120);
      };
      rec.onerror = function (e) { $('#voiceStatus').textContent = 'Microphone error: ' + (e.error || 'unknown') + '. Check the browser allowed the microphone.'; };
      rec.onend = function () {
        rec = null; $('#voice').textContent = 'Dictate the process';
        if (!segs.length) { if (!/error/.test($('#voiceStatus').textContent)) $('#voiceStatus').textContent = 'Nothing heard.'; return; }
        var steps = L.speechToSteps(segs), cur = $('#stepsText').value.trim();
        $('#stepsText').value = cur ? cur + '\n' + steps.split('\n').map(function (l) { return l.replace(/^\d+\.\s*/, ''); }).join('\n') : steps;
        $('#voiceStatus').textContent = 'Added ' + steps.split('\n').length + ' steps from your voice. Chrome sends speech to Google to turn it into text.';
        buildAll();
      };
      rec.start(); $('#voice').textContent = 'Stop dictating'; $('#voiceStatus').innerHTML = '<span class="rec-dot"></span> Listening… say "first…, then…, after that…"';
    });
  }

  // ---------- event log ----------
  var logTable = null;
  function loadLog(t, name) {
    logTable = t; var g = L.guessColumns(t.headers);
    state.log = { name: name, cols: g, minCount: 1 };
    renderLogMap();
  }
  function renderLogMap() {
    if (!logTable) { $('#lMap').innerHTML = ''; $('#lOut').innerHTML = ''; return; }
    var c = state.log.cols, opt = function (k, allowNone) {
      return '<select id="map-' + k + '">' + (allowNone ? '<option value="">(none)</option>' : '') + logTable.headers.map(function (h) { return '<option' + (h === c[k] ? ' selected' : '') + '>' + esc(h) + '</option>'; }).join('') + '</select>';
    };
    $('#lMap').innerHTML = '<div class="panel"><p style="margin-top:0"><b>' + esc(state.log.name) + '</b> — ' + logTable.rows.length + ' rows. Check the columns:</p><div class="form-grid">' +
      '<div><label for="map-caseId">Case id (order, ticket, job)</label>' + opt('caseId') + '</div><div><label for="map-activity">Activity</label>' + opt('activity') + '</div>' +
      '<div><label for="map-time">Timestamp</label>' + opt('time') + '</div><div><label for="map-role">Role / person (optional)</label>' + opt('role', true) + '</div></div>' +
      '<p class="small muted">Dates like 2026-03-02 09:15 or 02/03/2026 9:15 am (day first) are understood.</p></div>';
    ['caseId', 'activity', 'time', 'role'].forEach(function (k) { $('#map-' + k).addEventListener('change', function () { state.log.cols[k] = this.value; analyseLog(); }); });
    analyseLog();
  }
  function analyseLog() {
    var p = L.parseEventLog(logTable.rows, state.log.cols);
    if (!p.events.length) { mined = null; $('#lOut').innerHTML = '<p class="bad">No usable rows — check the column choices (every row needs a case id, an activity and a readable date).</p>'; return; }
    mined = L.mine(p.events); save();
    var m = mined, fm = L.fmtMinutes;
    var html = '<div class="stat-row">' + stat(m.caseCount, 'Cases') + stat(m.eventCount, 'Events') + stat(m.activities.length, 'Activities') + stat(m.variants.length, 'Different paths') +
      stat(fm(m.avgCaseMinutes) || '–', 'Average case time') + stat(fm(m.medianCaseMinutes) || '–', 'Median case time') + '</div>';
    if (p.skipped) html += '<p class="small warn">' + p.skipped + ' rows skipped (missing case, activity or date).</p>';
    html += '<h2>Process map (how work actually flows)</h2><div class="row"><label for="minCount" style="margin:0">Hide paths seen fewer than</label><input type="number" id="minCount" min="1" value="' + (state.log.minCount || 1) + '" style="width:80px"> <span class="small muted">times. The thick arrow is the biggest bottleneck.</span></div>' +
      '<div id="logDiagram" class="diagram fit" style="margin-top:8px"></div>';
    html += '<div class="row" style="margin-top:8px"><button class="btn primary" type="button" id="useMain">Use the most common path as my steps</button><button class="btn" type="button" id="useMap">Open this map in the diagram editor</button><button class="btn" type="button" id="dlLog">Download analysis CSV</button></div>';
    html += '<h2>Bottlenecks (where cases wait longest)</h2>' + (m.bottlenecks.length ? B.table(m.bottlenecks.map(function (b) { return { t: b.from + ' → ' + b.to, n: b.count, a: fm(b.avgMinutes), s: Math.round(b.shareOfWait * 100) + '%' }; }),
      [{ key: 't', label: 'Transition' }, { key: 'n', label: 'Times' }, { key: 'a', label: 'Average wait' }, { key: 's', label: 'Share of all waiting' }]) : '<p class="muted">No waiting time found.</p>');
    html += '<h2>Path variants</h2>' + B.table(m.variants.slice(0, 15).map(function (v) { return { p: v.key, n: v.count, s: Math.round(v.share * 100) + '%', a: fm(v.avgMinutes) }; }),
      [{ key: 'p', label: 'Path' }, { key: 'n', label: 'Cases' }, { key: 's', label: 'Share' }, { key: 'a', label: 'Average time' }]);
    html += '<h2>Activities</h2>' + B.table(m.activities.map(function (a) { return { n: a.name, r: a.role, c: a.count, cs: a.cases, w: fm(a.avgWaitBefore), rw: a.reworkCases || '' }; }),
      [{ key: 'n', label: 'Activity' }, { key: 'r', label: 'Usual role' }, { key: 'c', label: 'Times' }, { key: 'cs', label: 'Cases' }, { key: 'w', label: 'Avg wait before' }, { key: 'rw', label: 'Cases repeating it' }]);
    html += '<h2>Directly-follows (step → next step)</h2>' + B.table(m.edges.map(function (e) { return { f: e.from, t: e.to, n: e.count, a: fm(e.avgMinutes), md: fm(e.medianMinutes) }; }),
      [{ key: 'f', label: 'From' }, { key: 't', label: 'To' }, { key: 'n', label: 'Times' }, { key: 'a', label: 'Average gap' }, { key: 'md', label: 'Median gap' }]);
    $('#lOut').innerHTML = html;
    $('#minCount').addEventListener('change', function () { state.log.minCount = Math.max(1, +this.value || 1); save(); drawLog(); });
    $('#useMain').addEventListener('click', function () { $('#stepsText').value = L.minedToSteps(mined); state.edited = false; buildAll('steps'); B.toast('Most common path copied to Steps'); });
    $('#useMap').addEventListener('click', function () { state.mermaid = L.minedToMermaid(mined, { minCount: state.log.minCount }); state.edited = true; save(); renderMermaidText(); showTab('diagram'); renderDiagram(); });
    $('#dlLog').addEventListener('click', function () {
      var rows = m.edges.map(function (e) { return { from: e.from, to: e.to, count: e.count, avg_minutes: Math.round(e.avgMinutes * 10) / 10, median_minutes: Math.round(e.medianMinutes * 10) / 10 }; });
      B.download('process-transitions.csv', '﻿' + B.csv.stringify(rows, Object.keys(rows[0] || { from: '' })), 'text/csv;charset=utf-8');
    });
    drawLog(); renderImprove();
  }
  function drawLog() {
    var box = $('#logDiagram'); if (!box) return;
    var code = L.minedToMermaid(mined, { minCount: state.log.minCount || 1 });
    box.innerHTML = '<p class="muted">Drawing…</p>';
    getMermaid().then(function (mm) { return mm.render('pm-log-' + (++renderSeq), code); }).then(function (r) { box.innerHTML = r.svg; })
      .catch(function (e) { box.innerHTML = '<p class="bad">Could not draw: ' + esc((e && e.message) || e) + '</p><pre>' + esc(code) + '</pre>'; });
  }

  // ---------- wiring ----------
  function init() {
    $('#stepsText').value = state.steps; $('#transcriptText').value = state.transcript;
    $('#optLanes').checked = state.lanes; $('#optDir').value = state.dir; $('#optFit').checked = state.fit;
    showTab = B.tabs($('.tabs'), function (id) { if (id === 'diagram' && model && !$('#diagram svg')) renderDiagram(); });
    renderMeta();
    if (state.steps) { model = L.parseSteps(state.steps); if (!state.mermaid) rebuildModel(); renderParsed(); renderMermaidText(); renderSop(); renderImprove(); renderOwnerRoles(); renderDiagram(); }
    else { renderMermaidText(); renderSop(); renderImprove(); }

    $('#build').addEventListener('click', function () { buildAll('diagram'); });
    $('#sample').addEventListener('click', function () {
      $('#stepsText').value = L.SAMPLE_STEPS; state.edited = false;
      state.meta = Object.assign(state.meta, { title: 'Order to delivery', owner: 'Jo Citizen (made-up)', ownerRole: 'Admin', version: '1.0', date: today(), revisions: [{ version: '1.0', date: today(), author: 'Jo Citizen', change: 'First version' }] });
      renderMeta(); buildAll('steps'); B.toast('Sample loaded (made-up business)');
    });
    $('#clearAll').addEventListener('click', function () {
      if (!confirm('Clear the steps, transcript, diagram and SOP details?')) return;
      B.store.remove(KEY); state = load(); model = null; mined = null; logTable = null; lastSvg = '';
      $('#stepsText').value = ''; $('#transcriptText').value = ''; renderMeta(); renderParsed(); renderMermaidText(); renderDiagram(); renderSop(); renderImprove(); renderLogMap();
    });
    $('#exportJson').addEventListener('click', function () { readMeta(); state.steps = $('#stepsText').value; B.download('process-mapper-backup.json', JSON.stringify({ app: 'process-mapper', version: 1, data: state }, null, 2), 'application/json'); });
    $('#importJson').addEventListener('change', function () {
      var f = this.files[0]; this.value = ''; if (!f) return;
      B.readFile(f).then(function (t) {
        var j = JSON.parse(t), d = j && j.data; if (!d || typeof d.steps !== 'string') throw new Error('not a Process Mapper backup');
        B.store.set(KEY, d); state = load(); $('#stepsText').value = state.steps; $('#transcriptText').value = state.transcript; renderMeta();
        model = L.parseSteps(state.steps); if (!state.mermaid) rebuildModel(); renderParsed(); renderMermaidText(); renderDiagram(); renderSop(); renderImprove(); renderOwnerRoles();
        B.toast('Backup imported');
      }).catch(function (e) { B.toast('Could not import: ' + e.message, 4000); });
    });

    // transcript
    B.dropZone($('#tDrop'), function (files) { B.readFile(files[0]).then(function (t) { $('#transcriptText').value = t; state.transcript = t; save(); B.toast('Loaded ' + files[0].name); }); }, { accept: '.vtt,.srt,.txt,.md,text/plain' });
    $('#tConvert').addEventListener('click', convertTranscript);
    $('#tSample').addEventListener('click', function () { $('#transcriptText').value = L.SAMPLE_VTT; state.transcript = L.SAMPLE_VTT; save(); });

    // log
    B.dropZone($('#lDrop'), function (files) {
      B.readTable(files[0]).then(function (t) { if (!t.rows.length) throw new Error('no rows'); loadLog(t, files[0].name); }).catch(function (e) { B.toast('Could not read file: ' + e.message, 4000); });
    }, { accept: '.csv,.tsv,.txt,.xlsx,.xls,.json' });
    $('#lSample').addEventListener('click', function () { loadLog(B.csv.toObjects(L.SAMPLE_LOG), 'sample-event-log.csv (made-up)'); });

    // diagram
    $('#optLanes').addEventListener('change', function () { state.lanes = this.checked; if (!state.edited && model) { rebuildModel(); renderMermaidText(); renderDiagram(); } save(); });
    $('#optDir').addEventListener('change', function () {
      state.dir = this.value;
      if (state.edited) state.mermaid = state.mermaid.replace(/^(\s*flowchart\s+)(TD|TB|LR|RL|BT)/, '$1' + state.dir); else if (model) rebuildModel();
      renderMermaidText(); renderDiagram(); save();
    });
    $('#optFit').addEventListener('change', function () { state.fit = this.checked; $('#diagram').classList.toggle('fit', state.fit); save(); });
    $('#redraw').addEventListener('click', function () { state.mermaid = $('#mmd').value; state.edited = true; save(); renderMermaidText(); renderDiagram(); });
    $('#rebuild').addEventListener('click', function () { state.edited = false; state.steps = $('#stepsText').value; rebuildModel(); save(); renderMermaidText(); renderDiagram(); });
    $('#dlSvg').addEventListener('click', function () { if (!lastSvg) return B.toast('Draw the diagram first'); B.download(slug() + '.svg', lastSvg.indexOf('xmlns=') < 0 ? lastSvg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"') : lastSvg, 'image/svg+xml'); });
    $('#dlPng').addEventListener('click', downloadPng);
    $('#dlMmd').addEventListener('click', function () { if (!state.mermaid) return B.toast('Nothing to download'); B.download(slug() + '.mmd', state.mermaid, 'text/plain;charset=utf-8'); });
    $('#cpMmd').addEventListener('click', function () { if (state.mermaid) B.copy(state.mermaid); });

    // SOP
    ['title', 'owner', 'ownerRole', 'version', 'date', 'purpose', 'scope'].forEach(function (k) {
      $('#m-' + k).addEventListener('change', function () { readMeta(); save(); renderSop(); });
    });
    $('#revs').addEventListener('change', function (e) { var i = e.target.dataset.r; if (i == null) return; state.meta.revisions[+i][e.target.dataset.k] = e.target.value; save(); renderSop(); });
    $('#revs').addEventListener('click', function (e) { var i = e.target.dataset.del; if (i == null) return; state.meta.revisions.splice(+i, 1); save(); renderRevs(); renderSop(); });
    $('#addRev').addEventListener('click', function () {
      var r = state.meta.revisions, last = r[r.length - 1], v = last ? (Math.round((parseFloat(last.version) || 1) * 10 + 1) / 10).toFixed(1) : '1.0';
      r.push({ version: v, date: today(), author: state.meta.owner || '', change: '' }); state.meta.version = v; $('#m-version').value = v; save(); renderRevs(); renderSop();
    });
    $('#sopPrint').addEventListener('click', printSop);
    $('#sopMd').addEventListener('click', function () { if (!model || !model.steps.length) return B.toast('Add steps first'); B.download(slug() + '-sop.md', sopMd(), 'text/markdown;charset=utf-8'); });
    $('#sopHtml').addEventListener('click', function () { if (!model || !model.steps.length) return B.toast('Add steps first'); B.download(slug() + '-sop.html', sopHtmlDoc(), 'text/html;charset=utf-8'); });
    $('#sopCopy').addEventListener('click', function () { if (model && model.steps.length) B.copy(sopMd()); });

    setupVoice();
  }
  init();
})();
