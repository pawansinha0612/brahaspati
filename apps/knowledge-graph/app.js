/* Knowledge Graph Builder — DOM wiring. Logic lives in lib.js (KnowledgeGraphLib). */
(function () {
  'use strict';
  var K = window.KnowledgeGraphLib, $ = B.$, esc = B.esc;
  var TYPES = [
    { id: 'person', label: 'People', tok: '--accent', on: true },
    { id: 'organisation', label: 'Organisations', tok: '--ok', on: true },
    { id: 'project', label: 'Projects', tok: '--brand', on: true },
    { id: 'concept', label: 'Topics', tok: '--warn', on: true },
    { id: 'date', label: 'Dates', tok: '--muted', on: false },
    { id: 'email', label: 'Email addresses', tok: '--bad', on: false }
  ];
  var TYPE = {}; TYPES.forEach(function (t) { TYPE[t.id] = t; });
  var docs = [], graph = K.build([], []), view = { nodes: [], edges: [] }, selected = null;
  var typesOn = B.store.get('kg:types', null) || TYPES.reduce(function (o, t) { o[t.id] = t.on; return o; }, {});

  // ---------- IndexedDB (promise wrapper, memory fallback) ----------
  var db = (function () {
    var mem = {}, conn = null, ok = false;
    function req(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
    function open() {
      return new Promise(function (res) {
        try {
          var r = indexedDB.open('brahaspati-knowledge-graph', 1);
          r.onupgradeneeded = function () { r.result.createObjectStore('docs', { keyPath: 'id' }); };
          r.onsuccess = function () { conn = r.result; ok = true; res(true); };
          r.onerror = function () { res(false); }; r.onblocked = function () { res(false); };
        } catch (e) { res(false); }
      });
    }
    function st(mode) { return conn.transaction('docs', mode).objectStore('docs'); }
    return {
      open: open, persistent: function () { return ok; },
      all: function () { return ok ? req(st('readonly').getAll()) : Promise.resolve(Object.keys(mem).map(function (k) { return mem[k]; })); },
      put: function (d) { if (!ok) { mem[d.id] = d; return Promise.resolve(); } return req(st('readwrite').put(d)); },
      del: function (id) { if (!ok) { delete mem[id]; return Promise.resolve(); } return req(st('readwrite').delete(id)); },
      clear: function () { if (!ok) { mem = {}; return Promise.resolve(); } return req(st('readwrite').clear()); }
    };
  })();

  // ---------- reading files ----------
  function ext(name) { var m = /\.([a-z0-9]+)$/i.exec(name); return m ? m[1].toLowerCase() : ''; }
  function rowsToText(rows) {
    if (!rows.length) return '';
    var h = rows[0].map(function (x, i) { return String(x || ('Column ' + (i + 1))).trim(); });
    // each row becomes its own paragraph so links come from the same row
    return rows.slice(1).filter(function (r) { return r.some(function (c) { return String(c).trim(); }); })
      .map(function (r) { return h.map(function (k, i) { return r[i] !== '' && r[i] != null ? k + ': ' + r[i] : null; }).filter(Boolean).join('; ') + '.'; }).join('\n\n');
  }
  function readPdf(file) {
    return Promise.all([B.lib.pdfjs(), B.readFile(file, 'buffer')]).then(function (r) {
      return r[0].getDocument({ data: r[1] }).promise.then(function (pdf) {
        var parts = [], p = Promise.resolve();
        for (var n = 1; n <= pdf.numPages; n++) (function (n) {
          p = p.then(function () { return pdf.getPage(n); }).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
            var out = [], lastY = null;
            tc.items.forEach(function (it) { var y = it.transform ? Math.round(it.transform[5]) : null; if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) out.push('\n'); else if (out.length) out.push(' '); out.push(it.str); lastY = y; });
            parts.push(out.join('').replace(/[ ]{2,}/g, ' '));
          });
        })(n);
        return p.then(function () { return parts.join('\n\n'); });
      });
    });
  }
  function readText(file) {
    var e = ext(file.name);
    if (e === 'pdf') return readPdf(file);
    if (e === 'docx') return Promise.all([B.lib.mammoth(), B.readFile(file, 'buffer')]).then(function (r) { return r[0].extractRawText({ arrayBuffer: r[1] }).then(function (o) { return o.value; }); });
    if (/^(xlsx|xlsm|xls|ods|csv|tsv)$/.test(e)) return B.readTable(file).then(function (t) {
      if (t.sheets) return t.sheets.map(function (s) { return rowsToText(B.csv.parse(s.csv, ',')); }).join('\n\n');
      return rowsToText([t.headers].concat(t.rows.map(function (o) { return t.headers.map(function (h) { return o[h]; }); })));
    });
    if (e === 'doc') return Promise.reject(new Error('old .doc format — save it as .docx'));
    return B.readFile(file).then(function (t) { return /^html?$/.test(e) ? t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ') : t; });
  }

  // ---------- processing (chunked, with progress) ----------
  var busy = false;
  function progress(msg, frac) {
    $('#progress').textContent = msg || '';
    $('#progBar').hidden = frac == null; if (frac != null) $('#progBar div').style.width = Math.round(frac * 100) + '%';
  }
  function yieldUI() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function makeDoc(name, type, text) {
    var d = { id: B.uid(), name: name, type: type, added: new Date().toISOString(), text: text, chars: text.length };
    d.ex = K.extract(d); return d;
  }
  function addItems(items) { // items: [{file}] or [{name,text,type}]
    if (busy) { B.toast('Still working on the last batch…'); return Promise.resolve(); }
    busy = true; var added = 0, failed = [], total = items.length, p = Promise.resolve();
    items.forEach(function (it, i) {
      p = p.then(function () {
        progress('Reading ' + (i + 1) + ' of ' + total + ': ' + (it.file ? it.file.name : it.name), i / total);
        return (it.file ? readText(it.file) : Promise.resolve(it.text)).then(function (text) {
          if (!text || !text.trim()) { failed.push((it.file ? it.file.name : it.name) + ' (no text — scanned or empty?)'); return; }
          var d = makeDoc(it.file ? it.file.name : it.name, it.file ? (ext(it.file.name) || 'text') : (it.type || 'text'), text);
          docs.push(d); added++; return db.put(d);
        }).catch(function (err) { failed.push((it.file ? it.file.name : it.name) + ' (' + (err && err.message || 'could not read') + ')'); }).then(yieldUI);
      });
    });
    return p.then(function () {
      progress('Linking ' + docs.length + ' documents…', 0.99); return yieldUI();
    }).then(function () {
      rebuild(true);
      progress((added ? 'Added ' + added + ' document' + (added === 1 ? '' : 's') + '. ' : '') + (failed.length ? 'Skipped: ' + failed.join('; ') : ''));
    }).then(function () { busy = false; }, function (e) { busy = false; progress('Something went wrong: ' + e.message); });
  }

  // ---------- rebuild + render ----------
  function rebuild(relayout) {
    docs.sort(function (a, b) { return String(a.added).localeCompare(String(b.added)); });
    var old = {}; view.nodes.forEach(function (n) { old[n.id] = n; });
    graph = K.build(docs, docs.map(function (d) { return d.ex; }));
    graph.nodes.forEach(function (n) { var o = old[n.id]; if (o && !relayout) { n.x = o.x; n.y = o.y; n.fixed = o.fixed; } });
    if (selected && !graph.nodes.some(function (n) { return n.id === selected; })) selected = null;
    renderStats(); renderDocs(); renderLists(); renderDocFilter(); applyFilter(true);
    if (selected) showDetail(selected); else $('#detail').innerHTML = '';
  }
  function renderStats() {
    var c = function (t) { return graph.nodes.filter(function (n) { return n.type === t; }).length; };
    var words = docs.reduce(function (s, d) { return s + d.chars; }, 0);
    $('#count').textContent = docs.length ? docs.length + ' document' + (docs.length === 1 ? '' : 's') + ' · ' + B.fmt.num(words / 1024, 0) + ' KB of text' + (db.persistent() ? '' : ' · not saved (private browsing?)') : '';
    $('#stats').innerHTML = [['Documents', docs.length], ['People', c('person')], ['Organisations', c('organisation')], ['Projects', c('project')], ['Topics', c('concept')], ['Links', graph.edges.length], ['Decisions', graph.decisions.length]]
      .map(function (s) { return '<div class="stat"><div class="k">' + s[0] + '</div><div class="v">' + B.fmt.num(s[1], 0) + '</div></div>'; }).join('');
  }
  function renderDocFilter() {
    var sel = $('#docFilter'), v = sel.value;
    sel.innerHTML = '<option value="">All documents</option>' + docs.map(function (d) { return '<option value="' + esc(d.id) + '">' + esc(d.name) + '</option>'; }).join('');
    if (docs.some(function (d) { return d.id === v; })) sel.value = v;
  }
  function renderDocs() {
    var box = $('#docList');
    if (!docs.length) { box.innerHTML = '<p class="muted">No documents yet. Drop some files above or load the sample.</p>'; renderAiPicker(); return; }
    box.innerHTML = '';
    docs.slice().reverse().forEach(function (d) {
      var cnt = {}; d.ex.mentions.forEach(function (m) { cnt[m.t] = cnt[m.t] || {}; cnt[m.t][K.keyFor(m.t, m.n)] = 1; });
      var n = function (t) { return Object.keys(cnt[t] || {}).length; };
      box.appendChild(B.h('div', { class: 'kg-doc' }, [
        B.h('div', {}, [B.h('div', { class: 'name', text: d.name }), B.h('div', { class: 'small muted', text: d.type.toUpperCase() + ' · ' + B.fmt.num(d.chars, 0) + ' characters · ' + n('person') + ' people, ' + n('organisation') + ' organisations, ' + n('project') + ' projects' + (d.ai ? ' · AI-checked' : '') })]),
        B.h('div', { class: 'row' }, [
          B.h('button', { class: 'btn small', type: 'button', text: 'Show in graph', onclick: function () { $('#docFilter').value = d.id; applyFilter(true); showTab('graph'); } }),
          B.h('button', { class: 'btn small', type: 'button', text: 'Delete', 'aria-label': 'Delete ' + d.name, onclick: function () {
            if (!confirm('Delete “' + d.name + '”?')) return;
            db.del(d.id).then(function () { docs = docs.filter(function (x) { return x.id !== d.id; }); rebuild(false); B.toast('Deleted'); });
          } })
        ])
      ]));
    });
    renderAiPicker();
  }
  function bars(list) {
    if (!list.length) return '<p class="muted small">None found yet.</p>';
    return B.barChart(list.map(function (n) { return { label: n.label, value: n.mentions }; }), { fmt: function (v) { return v + '×'; } }) +
      '<div class="chips" style="margin-top:6px">' + list.slice(0, 6).map(function (n) { return '<button class="btn small" type="button" data-node="' + esc(n.id) + '">' + esc(n.label) + '</button>'; }).join('') + '</div>';
  }
  function renderLists() {
    $('#topPeople').innerHTML = bars(K.top(graph, 'person', 10));
    $('#topProjects').innerHTML = bars(K.top(graph, 'project', 10));
    $('#topOrgs').innerHTML = bars(K.top(graph, 'organisation', 10));
    $('#topTopics').innerHTML = bars(K.top(graph, 'concept', 10));
    var pairs = K.collaborators(graph, 25);
    $('#pairs').innerHTML = pairs.length ? B.table(pairs.map(function (p) { return { People: p.a + ' + ' + p.b, Weight: p.weight, 'Same sentence': p.sentences, Documents: p.documents }; }), ['People', 'Weight', 'Same sentence', 'Documents']) : '<p class="muted small">No two people mentioned together yet.</p>';
    var label = {}; graph.nodes.forEach(function (n) { label[n.id] = n; });
    $('#decisions').innerHTML = graph.decisions.length ? '<ul class="timeline">' + graph.decisions.slice(0, 200).map(function (d) {
      var who = d.entities.map(function (id) { return label[id]; }).filter(function (n) { return n && n.type !== 'date'; });
      return '<li><strong>' + esc(d.date || 'No date') + '</strong> · <span class="small muted">' + esc(d.doc) + '</span><br>' + esc(d.text) +
        (who.length ? '<div class="chips" style="margin-top:4px">' + who.map(function (n) { return '<button class="btn small" type="button" data-node="' + esc(n.id) + '">' + esc(n.label) + '</button>'; }).join('') + '</div>' : '') + '</li>';
    }).join('') + '</ul>' : '<p class="muted small">No decisions found yet.</p>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-node]'); if (!b) return;
    var id = b.dataset.node, n = graph.nodes.filter(function (x) { return x.id === id; })[0]; if (!n) return;
    if (!typesOn[n.type]) { typesOn[n.type] = true; renderTypes(); }
    if (!view.nodes.some(function (x) { return x.id === id; })) { $('#search').value = ''; $('#docFilter').value = ''; $('#minW').value = 0; $('#minWv').textContent = '0'; applyFilter(false); }
    select(id, true); showTab('graph'); $('#box').scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  // ---------- filters ----------
  function renderTypes() {
    $('#types').innerHTML = TYPES.map(function (t) { return '<label><input type="checkbox" data-type="' + t.id + '"' + (typesOn[t.id] ? ' checked' : '') + '><span class="dot" style="background:var(' + t.tok + ')"></span>' + t.label + '</label>'; }).join('');
    $('#legend').innerHTML = TYPES.filter(function (t) { return typesOn[t.id]; }).map(function (t) { return '<span><span class="dot" style="background:var(' + t.tok + ')"></span>' + t.label + '</span>'; }).join('');
  }
  $('#types').addEventListener('change', function (e) { var t = e.target.dataset.type; if (!t) return; typesOn[t] = e.target.checked; B.store.set('kg:types', typesOn); renderTypes(); applyFilter(true); });
  var searchTimer;
  $('#search').addEventListener('input', function () { clearTimeout(searchTimer); searchTimer = setTimeout(function () { applyFilter(true); }, 200); });
  $('#minW').addEventListener('input', function () { $('#minWv').textContent = $('#minW').value; applyFilter(false); });
  $('#docFilter').addEventListener('change', function () { applyFilter(true); });
  $('#maxN').addEventListener('change', function () { applyFilter(true); });

  function applyFilter(reheat) {
    var old = {}; view.nodes.forEach(function (n) { old[n.id] = n; });
    view = K.filter(graph, { types: typesOn, minWeight: +$('#minW').value, docId: $('#docFilter').value, search: $('#search').value, maxNodes: +$('#maxN').value });
    view.nodes = view.nodes.map(function (n) { var o = old[n.id]; return Object.assign({}, n, o ? { x: o.x, y: o.y, fixed: o.fixed } : { x: null, y: null }); });
    var byId = {}; view.nodes.forEach(function (n) { byId[n.id] = n; }); view.byId = byId;
    var maxW = Math.max.apply(null, view.edges.map(function (e) { return e.weight; }).concat([1]));
    $('#minW').max = Math.max(5, Math.ceil(Math.min(maxW, 60)));
    $('#pick').innerHTML = '<option value="">— pick an entity —</option>' + view.nodes.slice().sort(function (a, b) { return a.label.localeCompare(b.label); }).map(function (n) { return '<option value="' + esc(n.id) + '"' + (n.id === selected ? ' selected' : '') + '>' + esc(n.label) + ' (' + esc(TYPE[n.type].label.toLowerCase()) + ')</option>'; }).join('');
    startSim(reheat);
  }
  $('#pick').addEventListener('change', function () { if ($('#pick').value) select($('#pick').value, true); });

  // ---------- canvas graph ----------
  var cv = $('#cv'), ctx = cv.getContext('2d'), W = 800, H = 520, dpr = 1, cam = { x: 0, y: 0, k: 1 }, sim = null, raf = 0, colors = {};
  function readColors() { var cs = getComputedStyle(document.documentElement); ['--accent', '--ok', '--brand', '--warn', '--muted', '--bad', '--ink', '--line', '--panel', '--bg'].forEach(function (t) { colors[t] = cs.getPropertyValue(t).trim() || '#888'; }); }
  function size() {
    var r = cv.getBoundingClientRect(); dpr = window.devicePixelRatio || 1; W = Math.max(200, r.width); H = Math.max(200, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); draw();
  }
  function radius(n) { return Math.min(22, 4 + Math.sqrt(n.mentions) * 2.2); }
  function startSim(reheat) {
    sim = K.createSim(view.nodes, view.edges, W, H, 11);
    if (!reheat) sim.heat(4);
    cancelAnimationFrame(raf); var frames = 0, autoFit = reheat;
    (function loop() {
      for (var i = 0; i < 3; i++) sim.tick();
      frames++; if (autoFit && frames === 60) fit();
      draw();
      if (sim.temperature() > 0.6 && frames < 400) raf = requestAnimationFrame(loop); else if (autoFit && frames < 60) fit();
    })();
  }
  function toScreen(n) { return { x: (n.x - cam.x) * cam.k + W / 2, y: (n.y - cam.y) * cam.k + H / 2 }; }
  function toWorld(px, py) { return { x: (px - W / 2) / cam.k + cam.x, y: (py - H / 2) / cam.k + cam.y }; }
  function fit() {
    if (!view.nodes.length) { cam = { x: W / 2, y: H / 2, k: 1 }; draw(); return; }
    var xs = view.nodes.map(function (n) { return n.x; }), ys = view.nodes.map(function (n) { return n.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    cam.x = (x0 + x1) / 2; cam.y = (y0 + y1) / 2; cam.k = Math.max(0.2, Math.min(2.5, Math.min((W - 60) / Math.max(1, x1 - x0), (H - 60) / Math.max(1, y1 - y0)))); draw();
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (!view.nodes.length) { ctx.fillStyle = colors['--muted']; ctx.font = '14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(docs.length ? 'Nothing matches these filters.' : 'Add documents or load the sample to see the graph.', W / 2, H / 2); return; }
    var maxW = Math.max.apply(null, view.edges.map(function (e) { return e.weight; }).concat([1]));
    var nb = {}; if (selected) view.edges.forEach(function (e) { if (e.source === selected) nb[e.target] = 1; if (e.target === selected) nb[e.source] = 1; });
    ctx.lineCap = 'round';
    view.edges.forEach(function (e) {
      var a = view.byId[e.source], b = view.byId[e.target]; if (!a || !b) return;
      var pa = toScreen(a), pb = toScreen(b), hot = selected && (e.source === selected || e.target === selected);
      ctx.globalAlpha = selected ? (hot ? 0.9 : 0.08) : 0.35; ctx.strokeStyle = hot ? colors['--ink'] : colors['--muted'];
      ctx.lineWidth = Math.max(0.6, 4 * e.weight / maxW) * Math.min(1.5, cam.k);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    });
    ctx.globalAlpha = 1;
    var labelled = view.nodes.slice().sort(function (a, b) { return b.mentions - a.mentions; }).slice(0, Math.round(18 * cam.k * cam.k + 6)).reduce(function (o, n) { o[n.id] = 1; return o; }, {});
    view.nodes.forEach(function (n) {
      var p = toScreen(n), r = radius(n) * Math.min(1.6, Math.max(0.6, cam.k)), dim = selected && n.id !== selected && !nb[n.id];
      ctx.globalAlpha = dim ? 0.25 : 1;
      ctx.fillStyle = colors[TYPE[n.type].tok]; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = n.id === selected || n.hit ? 3 : 1.2; ctx.strokeStyle = n.id === selected || n.hit ? colors['--ink'] : colors['--panel']; ctx.stroke();
      if (n.fixed) { ctx.fillStyle = colors['--panel']; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill(); }
    });
    ctx.font = '12px system-ui, -apple-system, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    view.nodes.forEach(function (n) {
      if (!(labelled[n.id] || n.id === selected || nb[n.id] || n.hit || n.id === hoverId)) return;
      var dim = selected && n.id !== selected && !nb[n.id]; if (dim) return;
      var p = toScreen(n), r = radius(n) * Math.min(1.6, Math.max(0.6, cam.k)), t = n.label.length > 28 ? n.label.slice(0, 27) + '…' : n.label;
      ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.strokeStyle = colors['--panel']; ctx.strokeText(t, p.x + r + 3, p.y); ctx.fillStyle = colors['--ink']; ctx.fillText(t, p.x + r + 3, p.y);
    });
    ctx.globalAlpha = 1;
  }
  function hit(px, py) {
    for (var i = view.nodes.length - 1; i >= 0; i--) { var n = view.nodes[i], p = toScreen(n), r = radius(n) * Math.min(1.6, Math.max(0.6, cam.k)) + 4; if ((p.x - px) * (p.x - px) + (p.y - py) * (p.y - py) <= r * r) return n; }
    return null;
  }
  // pointer handling: pan, drag nodes, pinch zoom, click to select
  var pointers = {}, drag = null, hoverId = null, pinch = null;
  function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  cv.addEventListener('pointerdown', function (e) {
    cv.setPointerCapture(e.pointerId); var p = pos(e); pointers[e.pointerId] = p;
    var ids = Object.keys(pointers);
    if (ids.length === 2) { var a = pointers[ids[0]], b = pointers[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: cam.k }; drag = null; return; }
    var n = hit(p.x, p.y);
    drag = { node: n, start: p, cam: { x: cam.x, y: cam.y }, moved: false };
    cv.style.cursor = 'grabbing';
  });
  cv.addEventListener('pointermove', function (e) {
    var p = pos(e);
    if (pointers[e.pointerId]) pointers[e.pointerId] = p;
    if (pinch) { var ids = Object.keys(pointers); if (ids.length === 2) { var a = pointers[ids[0]], b = pointers[ids[1]]; cam.k = Math.max(0.15, Math.min(6, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / (pinch.d || 1))); draw(); } return; }
    if (!drag) { var h = hit(p.x, p.y), id = h ? h.id : null; if (id !== hoverId) { hoverId = id; cv.style.cursor = h ? 'pointer' : 'grab'; draw(); } return; }
    if (Math.abs(p.x - drag.start.x) + Math.abs(p.y - drag.start.y) > 4) drag.moved = true;
    if (!drag.moved) return;
    if (drag.node) { var w = toWorld(p.x, p.y); drag.node.x = w.x; drag.node.y = w.y; drag.node.fixed = true; if (sim && sim.temperature() < 1) { sim.heat(3); startSim(false); } else draw(); }
    else { cam.x = drag.cam.x - (p.x - drag.start.x) / cam.k; cam.y = drag.cam.y - (p.y - drag.start.y) / cam.k; draw(); }
  });
  function up(e) {
    delete pointers[e.pointerId]; if (pinch) { if (!Object.keys(pointers).length) pinch = null; return; }
    if (drag && !drag.moved) { if (drag.node) select(drag.node.id, false); else { selected = null; $('#detail').innerHTML = ''; $('#pick').value = ''; draw(); } }
    drag = null; cv.style.cursor = 'grab';
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('dblclick', function (e) { var p = pos(e), n = hit(p.x, p.y); if (n && n.fixed) { n.fixed = false; startSim(false); } });
  cv.addEventListener('wheel', function (e) {
    e.preventDefault(); var p = pos(e), before = toWorld(p.x, p.y);
    cam.k = Math.max(0.15, Math.min(6, cam.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    var after = toWorld(p.x, p.y); cam.x += before.x - after.x; cam.y += before.y - after.y; draw();
  }, { passive: false });
  $('#zin').addEventListener('click', function () { cam.k = Math.min(6, cam.k * 1.3); draw(); });
  $('#zout').addEventListener('click', function () { cam.k = Math.max(0.15, cam.k / 1.3); draw(); });
  $('#fit').addEventListener('click', fit);
  $('#relayout').addEventListener('click', function () { view.nodes.forEach(function (n) { n.fixed = false; n.x = null; n.y = null; }); startSim(true); });
  window.addEventListener('resize', function () { size(); });
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { readColors(); draw(); }); } catch (e) { /* old browsers */ }

  // ---------- node detail ----------
  function select(id, centre) {
    selected = id; var n = view.byId && view.byId[id];
    if (n && centre) { cam.x = n.x; cam.y = n.y; cam.k = Math.max(cam.k, 1); }
    $('#pick').value = view.byId && view.byId[id] ? id : '';
    draw(); showDetail(id);
  }
  function highlight(text, words) {
    var t = esc(text);
    words.filter(function (w) { return w && w.length > 1; }).sort(function (a, b) { return b.length - a.length; }).forEach(function (w) {
      t = t.replace(new RegExp('(' + esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
    });
    return t;
  }
  function showDetail(id) {
    var n = graph.nodes.filter(function (x) { return x.id === id; })[0]; if (!n) { $('#detail').innerHTML = ''; return; }
    var nbs = K.neighbours(graph, id).sort(function (a, b) { return b.weight - a.weight; }).slice(0, 24);
    var words = [n.label].concat(n.aliases, n.emails);
    $('#detail').innerHTML = '<div class="panel"><p class="small muted" style="margin:0"><span class="dot" style="background:var(' + TYPE[n.type].tok + ')"></span> ' + esc(TYPE[n.type].label.replace(/s$/, '')) + '</p>' +
      '<h2 style="margin:4px 0 6px;overflow-wrap:anywhere">' + esc(n.label) + '</h2>' +
      '<p class="small" style="margin:0 0 8px">Mentioned ' + n.mentions + '× in ' + n.docCount + ' document' + (n.docCount === 1 ? '' : 's') + '. ' +
      (n.aliases.length ? 'Also written as: ' + n.aliases.map(esc).join(', ') + '. ' : '') + (n.emails.length ? 'Email: ' + n.emails.map(esc).join(', ') + '.' : '') + '</p>' +
      (nbs.length ? '<h3>Connected to</h3><div class="chips">' + nbs.map(function (x) { return '<button class="btn small" type="button" data-node="' + esc(x.node.id) + '"><span class="dot" style="background:var(' + TYPE[x.node.type].tok + ')"></span> ' + esc(x.node.label) + ' <span class="muted">' + x.weight + '</span></button>'; }).join('') + '</div>' : '') +
      '<h3>Mentions</h3>' + n.snippets.slice(0, 25).map(function (s) { return '<div class="snip">' + highlight(s.text, words) + '<div class="src">' + esc(s.doc) + (s.ai ? ' · found by AI' : '') + '</div></div>'; }).join('') +
      (n.snippets.length > 25 ? '<p class="small muted">Showing 25 of ' + n.snippets.length + ' places.</p>' : '') + '</div>';
  }

  // ---------- AI (optional): better entities for one document ----------
  function renderAiPicker() {
    var box = $('#aiBox'); if (!box.dataset.ready) {
      box.dataset.ready = '1';
      box.innerHTML = '<div class="ai-only-wrap"><label for="aiDoc">Check one document with AI</label><div class="row"><select id="aiDoc" style="max-width:320px"></select><span id="aiBtn"></span></div><p class="small muted" style="margin:4px 0 0">Sends that document’s text (first 12,000 characters) to the AI you chose and adds any names it finds that the patterns missed.</p></div>';
      B.ai.button($('#aiBtn'), 'AI: find more names', function () {
        var d = docs.filter(function (x) { return x.id === $('#aiDoc').value; })[0]; if (!d) { B.toast('Pick a document'); return null; }
        return 'List the named entities in this document. Reply with JSON only: {"people":[],"organisations":[],"projects":[],"topics":[]}. Use names exactly as written. Topics are 1–3 word subjects. Do not invent anything.\n\n---\n' + d.text.slice(0, 12000);
      }, function (ans) {
        var d = docs.filter(function (x) { return x.id === $('#aiDoc').value; })[0], j = B.ai.parseJSON(ans);
        if (!d || !j) { B.toast('The AI reply could not be read'); return; }
        var extra = K.mentionsFromAI(j, d.text);
        d.ex.mentions = d.ex.mentions.filter(function (m) { return !m.ai; }).concat(extra); d.ai = true;
        db.put(d).then(function () { rebuild(false); B.toast('Added ' + extra.length + ' AI mentions'); });
      }, { json: true, temperature: 0.1 });
      var sync = function () { box.firstChild.style.display = B.ai.enabled() ? '' : 'none'; };
      document.addEventListener('bh-ai-change', sync); sync();
    }
    var sel = $('#aiDoc'), v = sel.value;
    sel.innerHTML = docs.map(function (d) { return '<option value="' + esc(d.id) + '">' + esc(d.name) + '</option>'; }).join('');
    if (v) sel.value = v;
  }

  // ---------- exports ----------
  function need() { if (!graph.nodes.length) { B.toast('Add some documents first'); return false; } return true; }
  $('#exJson').addEventListener('click', function () { if (need()) B.download('knowledge-graph.json', K.toJSON(graph), 'application/json'); });
  $('#exNodes').addEventListener('click', function () { if (need()) B.download('knowledge-graph-nodes.csv', K.nodesCSV(graph), 'text/csv;charset=utf-8'); });
  $('#exEdges').addEventListener('click', function () { if (need()) B.download('knowledge-graph-links.csv', K.edgesCSV(graph), 'text/csv;charset=utf-8'); });
  $('#exGraphml').addEventListener('click', function () { if (need()) B.download('knowledge-graph.graphml', K.toGraphML(graph), 'application/xml'); });
  $('#exPng').addEventListener('click', function () {
    if (!need()) return;
    var c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; var x = c.getContext('2d');
    x.fillStyle = colors['--panel']; x.fillRect(0, 0, c.width, c.height); x.drawImage(cv, 0, 0);
    c.toBlob(function (b) { B.download('knowledge-graph.png', b); });
  });
  $('#backup').addEventListener('click', function () {
    if (!docs.length) { B.toast('Nothing to back up yet'); return; }
    B.download('knowledge-graph-backup.json', JSON.stringify({ app: 'knowledge-graph', version: 1, docs: docs }), 'application/json');
  });
  $('#restoreBtn').addEventListener('click', function () { $('#restore').click(); });
  $('#restore').addEventListener('change', function () {
    var f = $('#restore').files[0]; if (!f) return;
    B.readFile(f).then(function (t) {
      var j = JSON.parse(t); if (!j || !Array.isArray(j.docs)) throw new Error('not a Knowledge Graph backup');
      var p = Promise.resolve();
      j.docs.forEach(function (d) { if (!d.id || typeof d.text !== 'string') return; if (!d.ex) d.ex = K.extract(d); docs = docs.filter(function (x) { return x.id !== d.id; }); docs.push(d); p = p.then(function () { return db.put(d); }); });
      return p.then(function () { rebuild(true); B.toast('Restored ' + j.docs.length + ' documents'); });
    }).catch(function (e) { B.toast('Could not restore: ' + e.message); });
    $('#restore').value = '';
  });

  // ---------- inputs ----------
  B.dropZone($('#drop'), function (files) { addItems(files.map(function (f) { return { file: f }; })); }, { multiple: true, accept: '.pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.xlsx,.xls,.ods,.html,.htm,.json,text/plain' });
  $('#addPaste').addEventListener('click', function () {
    var t = $('#pasteText').value; if (!t.trim()) { B.toast('Paste some text first'); return; }
    addItems([{ name: $('#pasteName').value.trim() || 'Pasted text ' + (docs.length + 1), text: t, type: 'paste' }]).then(function () { $('#pasteText').value = ''; $('#pasteName').value = ''; });
  });
  $('#clearAll').addEventListener('click', function () {
    if (!docs.length || !confirm('Delete all ' + docs.length + ' documents from this browser?')) return;
    db.clear().then(function () { docs = []; selected = null; rebuild(true); progress(''); B.toast('Cleared'); });
  });
  $('#sample').addEventListener('click', function () {
    if (docs.some(function (d) { return /^Sample — /.test(d.name); })) { B.toast('Sample documents are already loaded'); return; }
    addItems(SAMPLE.map(function (s) { return { name: 'Sample — ' + s[0], text: s[1], type: 'sample' }; }));
  });

  var SAMPLE = [
    ['Board minutes March.txt', 'Harbourside Community Health — Board meeting minutes, 14 March 2026\n\nPresent: Dr Priya Shah (Chair), Tom Nguyen, Sarah O\'Brien, Marcus Webb.\n\nThe board approved the Project Atlas budget of $1.2m on 14 March 2026. Priya Shah will sponsor Project Atlas and Tom Nguyen will lead delivery with Bluegum Software Pty Ltd as the build partner.\n\nSarah O\'Brien reported that the patient booking portal is behind schedule. The patient booking portal depends on the new identity service. Marcus Webb raised the data retention policy and the board agreed that Sarah will review the data retention policy with the Department of Health before June.\n\nThe board decided to defer the HELIX telehealth pilot until 1 July 2026.'],
    ['Email from Bluegum.txt', 'From: Jane Smith <jane.smith@bluegum.com.au>\nTo: Tom Nguyen <tom.nguyen@harbourside.org.au>\nSubject: Atlas sprint 3\n\nHi Tom,\n\nSprint 3 of Project Atlas is done. The patient booking portal now talks to the identity service in test. J. Smith from our side will run the security review with Ravi Kumar next week.\n\nWe agreed on a go-live date of 18 May 2026 for the patient booking portal, pending sign-off from Dr Shah.\n\nCheers,\nJane'],
    ['Steering committee April.md', '# Atlas steering committee — 9 April 2026\n\nAttendees: Priya Shah, Tom Nguyen, Jane Smith (Bluegum Software), Ravi Kumar\n\n- Ravi Kumar confirmed the security review of the identity service is complete.\n- Tom Nguyen flagged that the data retention policy blocks the reporting dashboard.\n- Priya Shah approved two extra sprints for the reporting dashboard on 9 April 2026.\n- Jane Smith will share the Atlas test plan with Marcus Webb.\n\nRisks: the identity service vendor, Kestrel Identity Inc, has not signed the support contract.'],
    ['Telehealth pilot brief.txt', 'HELIX telehealth pilot — brief\n\nThe HELIX initiative tests video consults for regional clinics run by Westcoast Regional Council. Marcus Webb is the clinical lead and Aisha Rahman manages the pilot.\n\nAisha Rahman will work with Kestrel Identity Inc on patient log-in so the pilot can reuse the identity service from Project Atlas. Video consults will start at two regional clinics.\n\nThe pilot was approved in principle by the board, then deferred to 1 July 2026. Video consults need the data retention policy settled first.'],
    ['Finance notes.csv', 'Date,Project,Owner,Amount,Note\n2026-03-14,Project Atlas,Tom Nguyen,1200000,Budget approved by the board\n2026-04-09,Project Atlas,Priya Shah,180000,Two extra sprints for the reporting dashboard\n2026-04-20,HELIX telehealth pilot,Aisha Rahman,45000,Regional clinics video consult kits\n2026-05-02,Project Atlas,Jane Smith,60000,Bluegum Software Pty Ltd security fixes'],
    ['Weekly update May.txt', 'Weekly update — 5 May 2026\n\nTom Nguyen: the patient booking portal passed user testing. Ravi Kumar fixed the last identity service issue.\n\nSarah O\'Brien sent the revised data retention policy to the Department of Health. Once it is approved the reporting dashboard can go ahead.\n\nAisha Rahman met Westcoast Regional Council about the regional clinics. Marcus Webb and Aisha Rahman agreed to start video consults with one clinic first.\n\nPlease email sarah.obrien@harbourside.org.au with any comments.']
  ];

  // ---------- start ----------
  var showTab = B.tabs($('[data-tabs="kg"]'), function (id) { if (id === 'graph') setTimeout(function () { size(); fit(); }, 0); });
  readColors(); renderTypes(); size();
  db.open().then(function () { return db.all(); }).then(function (all) {
    docs = (all || []).filter(function (d) { return d && d.ex; });
    rebuild(true);
  });
  B.ai.note($('#aiNote'));
})();
