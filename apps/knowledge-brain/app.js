/* Knowledge Brain — DOM wiring. Logic lives in lib.js (KnowledgeLib). */
(function () {
  'use strict';
  var K = window.KnowledgeLib, $ = B.$;
  var docs = [], chunks = [], index = K.buildIndex([]), lastQuery = '';

  // ---------- tiny IndexedDB wrapper with in-memory fallback ----------
  var db = (function () {
    var mem = {}, conn = null, ok = false;
    function req(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
    function open() {
      return new Promise(function (res) {
        try {
          var r = indexedDB.open('brahaspati-knowledge', 1);
          r.onupgradeneeded = function () { r.result.createObjectStore('docs', { keyPath: 'id' }); };
          r.onsuccess = function () { conn = r.result; ok = true; res(true); };
          r.onerror = function () { res(false); };
          r.onblocked = function () { res(false); };
        } catch (e) { res(false); }
      });
    }
    function store(mode) { return conn.transaction('docs', mode).objectStore('docs'); }
    return {
      open: open,
      persistent: function () { return ok; },
      all: function () { return ok ? req(store('readonly').getAll()) : Promise.resolve(Object.keys(mem).map(function (k) { return mem[k]; })); },
      put: function (d) { if (!ok) { mem[d.id] = d; return Promise.resolve(); } return req(store('readwrite').put(d)); },
      del: function (id) { if (!ok) { delete mem[id]; return Promise.resolve(); } return req(store('readwrite').delete(id)); },
      clear: function () { if (!ok) { mem = {}; return Promise.resolve(); } return req(store('readwrite').clear()); }
    };
  })();

  function rebuild() {
    docs.sort(function (a, b) { return String(b.added).localeCompare(String(a.added)); });
    chunks = []; docs.forEach(function (d) { chunks = chunks.concat(K.chunkDocument(d)); });
    index = K.buildIndex(chunks);
    renderDocs(); renderFilter();
  }
  function addDoc(d) {
    var i = docs.findIndex(function (x) { return x.id === d.id; }); if (i >= 0) docs.splice(i, 1);
    docs.push(d); return db.put(d);
  }

  // ---------- reading files ----------
  function ext(name) { var m = /\.([a-z0-9]+)$/i.exec(name); return m ? m[1].toLowerCase() : ''; }
  function readPdf(file) {
    return Promise.all([B.lib.pdfjs(), B.readFile(file, 'buffer')]).then(function (r) {
      return r[0].getDocument({ data: r[1] }).promise.then(function (pdf) {
        var pages = [], p = Promise.resolve();
        for (var n = 1; n <= pdf.numPages; n++) (function (n) {
          p = p.then(function () { progress('Reading ' + file.name + ' — page ' + n + ' of ' + pdf.numPages); return pdf.getPage(n); })
            .then(function (pg) { return pg.getTextContent(); })
            .then(function (tc) {
              var lines = [], lastY = null;
              tc.items.forEach(function (it) {
                var y = it.transform ? Math.round(it.transform[5]) : null;
                if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) lines.push('\n'); else if (lines.length) lines.push(' ');
                lines.push(it.str); if (it.hasEOL) lines.push('\n'); lastY = y;
              });
              pages.push({ page: n, text: lines.join('').replace(/ +\n/g, '\n').replace(/[ ]{2,}/g, ' ').trim() });
            });
        })(n);
        return p.then(function () { return pages; });
      });
    });
  }
  function readFileDoc(file) {
    var e = ext(file.name);
    var base = { id: B.uid(), name: file.name, type: e || 'text', added: new Date().toISOString() };
    var done = function (pages) { base.pages = pages.filter(function (p) { return p.text && p.text.trim(); }); return base; };
    if (e === 'pdf') return readPdf(file).then(done);
    if (e === 'docx') return Promise.all([B.lib.mammoth(), B.readFile(file, 'buffer')]).then(function (r) {
      return r[0].extractRawText({ arrayBuffer: r[1] }).then(function (out) { return done([{ page: 1, text: out.value }]); });
    });
    if (/^(xlsx|xlsm|xls|ods)$/.test(e)) return Promise.all([B.lib.xlsx(), B.readFile(file, 'buffer')]).then(function (r) {
      var wb = r[0].read(r[1], { type: 'array', cellDates: true });
      return done(wb.SheetNames.map(function (n) { return { page: 'Sheet ' + n, text: sheetText(r[0].utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' })) }; }));
    });
    return B.readFile(file).then(function (text) {
      if (e === 'html' || e === 'htm') text = K.htmlToText(text);
      else if (e === 'json') { try { text = JSON.stringify(JSON.parse(text), null, 1); } catch (er) { /* keep raw */ } }
      else if (e === 'csv' || e === 'tsv') text = sheetText(B.csv.parse(text, e === 'tsv' ? '\t' : null));
      return done([{ page: 1, text: text }]);
    });
  }
  // Rows -> "Header: value; Header: value." lines, so each row reads as a sentence.
  function sheetText(rows) {
    if (!rows.length) return '';
    var h = rows[0].map(function (x, i) { return String(x || ('Column ' + (i + 1))).trim(); });
    return rows.slice(1).filter(function (r) { return r.some(function (c) { return String(c).trim(); }); }).map(function (r) {
      return h.map(function (k, i) { return r[i] !== '' && r[i] != null ? k + ': ' + r[i] : null; }).filter(Boolean).join('; ') + '.';
    }).join('\n');
  }
  function progress(t) { $('#kb-progress').textContent = t; }

  function addFiles(files) {
    var p = Promise.resolve(), added = 0, failed = [];
    files.forEach(function (f) {
      p = p.then(function () { progress('Reading ' + f.name + '…'); return readFileDoc(f); }).then(function (d) {
        if (!d.pages.length) { failed.push(f.name + ' (no text found — scanned or empty?)'); return; }
        added++; return addDoc(d);
      }).catch(function (err) { failed.push(f.name + ' (' + (err && err.message || 'could not read') + ')'); });
    });
    return p.then(function () {
      rebuild();
      progress((added ? 'Added ' + added + ' document' + (added === 1 ? '' : 's') + '. ' : '') + (failed.length ? 'Skipped: ' + failed.join('; ') : ''));
    });
  }

  // ---------- library list ----------
  function docChunks(id) { return chunks.filter(function (c) { return c.docId === id; }); }
  function docText(d) { return d.pages.map(function (p) { return p.text; }).join('\n\n'); }
  function renderDocs() {
    var box = $('#kb-docs');
    $('#kb-count').textContent = docs.length ? docs.length + ' document' + (docs.length === 1 ? '' : 's') + ' · ' + chunks.length + ' passages' : '';
    if (!docs.length) { box.innerHTML = '<p class="muted">Nothing here yet. Add a file, write a note or try the samples.</p>'; return; }
    box.innerHTML = '';
    docs.forEach(function (d) {
      var words = docText(d).split(/\s+/).length;
      box.appendChild(B.h('div', { class: 'kb-doc' }, [
        B.h('div', {}, [B.h('div', { class: 'name', text: d.name }), B.h('div', { class: 'small muted', text: d.type.toUpperCase() + ' · ' + d.pages.length + (d.pages.length === 1 ? ' part' : ' parts') + ' · ' + B.fmt.num(words, 0) + ' words · added ' + B.fmt.date(d.added) })]),
        B.h('div', { class: 'row' }, [
          B.h('button', { class: 'btn small', type: 'button', text: 'Summary & facts', onclick: function () { showDetail(d); } }),
          B.h('button', { class: 'btn small', type: 'button', text: 'View', onclick: function () { view(d, d.pages[0].page, ''); } }),
          B.h('button', { class: 'btn small', type: 'button', text: 'Delete', 'aria-label': 'Delete ' + d.name, onclick: function () {
            if (!confirm('Delete “' + d.name + '” from your library?')) return;
            db.del(d.id).then(function () { docs = docs.filter(function (x) { return x.id !== d.id; }); rebuild(); var det = $('#kb-detail'); if (det.dataset.id === d.id) det.hidden = true; B.toast('Deleted'); });
          } })
        ])
      ]));
    });
  }

  function showDetail(d) {
    var det = $('#kb-detail'), text = docText(d), sum = K.summarise(text, 5), f = K.keyFacts(text);
    det.hidden = false; det.dataset.id = d.id; det.innerHTML = '';
    det.appendChild(B.h('h2', { style: 'margin-top:0', text: d.name }));
    det.appendChild(B.h('h3', { text: 'Summary (key sentences)' }));
    var sumBox = B.h('div', { html: sum.length ? '<ul>' + sum.map(function (s) { return '<li>' + B.esc(s) + '</li>'; }).join('') + '</ul>' : '<p class="muted">Too short to summarise.</p>' });
    det.appendChild(sumBox);
    det.appendChild(B.h('p', { class: 'small muted', text: 'Picked by scoring how strongly each sentence connects to the rest of the document. No AI used.' }));
    var aiRow = B.h('div', { class: 'row' }); det.appendChild(aiRow);
    B.ai.button(aiRow, 'Write an AI summary', function () {
      return 'Summarise this document in 5 short bullet points in plain Australian English. Only use facts from the text.\n\nDOCUMENT: ' + d.name + '\n' + text.slice(0, 9000);
    }, function (ans) { aiOut.hidden = false; aiOut.innerHTML = '<h3>AI summary</h3><div style="white-space:pre-wrap">' + B.esc(ans) + '</div><p class="small muted">Written by the AI helper from the first part of the document — check it against the original.</p>'; });
    var aiOut = B.h('div', { hidden: true }); det.appendChild(aiOut);
    det.appendChild(B.h('h3', { text: 'Key facts' }));
    var groups = [['Dates', f.dates], ['Amounts', f.amounts], ['Emails', f.emails], ['Phone numbers', f.phones], ['Links', f.urls], ['Names & organisations (guessed)', f.names]];
    var any = groups.some(function (g) { return g[1].length; });
    det.appendChild(B.h('dl', { class: 'kb-facts', html: any ? groups.filter(function (g) { return g[1].length; }).map(function (g) {
      return '<dt>' + g[0] + '</dt><dd>' + g[1].slice(0, 25).map(B.esc).join(' · ') + '</dd>';
    }).join('') : '<p class="muted">No dates, amounts or contacts found.</p>' }));
    det.appendChild(B.h('div', { class: 'row' }, [B.h('button', { class: 'btn small', type: 'button', text: 'Copy facts', onclick: function () {
      B.copy(groups.filter(function (g) { return g[1].length; }).map(function (g) { return g[0] + ': ' + g[1].join(', '); }).join('\n'));
    } })]));
    det.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function view(d, page, query) {
    var p = d.pages.find(function (x) { return String(x.page) === String(page); }) || d.pages[0];
    $('#kb-dialog-title').textContent = d.name + (d.pages.length > 1 || typeof p.page !== 'number' ? ' — ' + (typeof p.page === 'number' ? 'page ' + p.page : p.page) : '');
    var body = $('#kb-dialog-body');
    body.innerHTML = query ? K.highlight(p.text, query, 1e9) : B.esc(p.text);
    var dlg = $('#kb-dialog'); if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    var mk = body.querySelector('mark'); if (mk) mk.scrollIntoView({ block: 'center' });
  }
  $('#kb-dialog-close').addEventListener('click', function () { var d = $('#kb-dialog'); if (d.close) d.close(); else d.removeAttribute('open'); });

  // ---------- search ----------
  function renderFilter() {
    var sel = $('#kb-filter'), cur = sel.value;
    sel.innerHTML = '<option value="">All documents</option>' + docs.map(function (d) { return '<option value="' + B.esc(d.id) + '">' + B.esc(d.name) + '</option>'; }).join('');
    if (docs.some(function (d) { return d.id === cur; })) sel.value = cur;
  }
  function filterIds() { var v = $('#kb-filter').value; return v ? [v] : null; }
  function srcLabel(c) { return c.docName + (typeof c.page === 'number' ? ' · page ' + c.page : c.page ? ' · ' + c.page : ''); }
  function srcButton(c, query, prefix) {
    return B.h('button', { class: 'kb-src', type: 'button', text: (prefix || '') + srcLabel(c), onclick: function () {
      var d = docs.find(function (x) { return x.id === c.docId; }); if (d) view(d, c.page, query);
    } });
  }
  function runSearch() {
    var q = $('#kb-q').value.trim(), out = $('#kb-results'); lastQuery = q;
    if (!q) { out.innerHTML = ''; return; }
    if (!chunks.length) { out.innerHTML = '<p class="muted">Your library is empty. Add documents first.</p>'; return; }
    var res = K.search(index, chunks, q, { limit: 25, docIds: filterIds() });
    out.innerHTML = '<p class="small muted">' + (res.length ? res.length + ' matching passage' + (res.length === 1 ? '' : 's') + ', best first.' : 'No matches. Try other words — search looks for the words themselves, not their meaning.') + '</p>';
    res.forEach(function (r) {
      var hit = B.h('div', { class: 'kb-hit' }, [srcButton(r.chunk, q), B.h('p', { html: K.highlight(r.chunk.text, q, 280) })]);
      out.appendChild(hit);
    });
  }
  $('#kb-go').addEventListener('click', runSearch);
  $('#kb-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') runSearch(); });
  $('#kb-filter').addEventListener('change', function () { if ($('#kb-q').value.trim()) runSearch(); });

  // ---------- ask ----------
  function sourcesList(list, q) {
    var ol = B.h('ol', { class: 'small' });
    list.forEach(function (c) { ol.appendChild(B.h('li', {}, [srcButton(c, q)])); });
    return ol;
  }
  function answer() {
    var q = $('#kb-question').value.trim(), out = $('#kb-answer'); out.innerHTML = '';
    if (!q) return;
    if (!chunks.length) { out.innerHTML = '<p class="muted">Your library is empty. Add documents first.</p>'; return; }
    var res = K.search(index, chunks, q, { limit: 8, docIds: filterIds() });
    var a = K.extractiveAnswer(q, res, { max: 3 });
    if (!a.sentences.length) { out.innerHTML = '<p>Nothing in your documents seems to answer that. Try different words, or check the filter on the Search tab.</p>'; return; }
    out.appendChild(B.h('h3', { text: 'From your documents' }));
    a.sentences.forEach(function (s) { out.appendChild(B.h('p', { html: '“' + K.highlight(s.text, q, 1e9) + '” <span class="kb-cite">[' + s.cite + ']</span>' })); });
    out.appendChild(B.h('p', { class: 'small muted', text: 'These are the best-matching sentences, quoted exactly. They are not rewritten, so read them in context if unsure.' }));
    out.appendChild(B.h('h3', { text: 'Sources' })); out.appendChild(sourcesList(a.sources, q));
  }
  $('#kb-ask').addEventListener('click', answer);
  $('#kb-question').addEventListener('keydown', function (e) { if (e.key === 'Enter') answer(); });
  var aiSources = [];
  B.ai.button($('#kb-ai-slot'), 'Ask AI (with sources)', function () {
    var q = $('#kb-question').value.trim(); if (!q) { B.toast('Type a question first'); return null; }
    var res = K.search(index, chunks, q, { limit: 5, docIds: filterIds() });
    if (!res.length) { B.toast('No matching passages to give the AI'); return null; }
    aiSources = res; return K.ragPrompt(q, res);
  }, function (ans) {
    var q = $('#kb-question').value.trim(), out = $('#kb-answer'); out.innerHTML = '';
    out.appendChild(B.h('h3', { text: 'AI answer' }));
    out.appendChild(B.h('div', { style: 'white-space:pre-wrap', text: ans }));
    out.appendChild(B.h('p', { class: 'small muted', text: 'Written by the AI helper using only the passages below. Numbers in [brackets] refer to them — check them before relying on the answer.' }));
    out.appendChild(B.h('h3', { text: 'Passages given to the AI' })); out.appendChild(sourcesList(aiSources.map(function (r) { return r.chunk; }), q));
  }, { system: 'You answer questions about the user\'s own documents. Use only the provided sources and cite them.', temperature: 0.2 });
  B.ai.note($('#kb-ai-note'));

  // ---------- notes, samples ----------
  $('#kb-note-save').addEventListener('click', function () {
    var t = $('#kb-note-title').value.trim() || 'Note', body = $('#kb-note-body').value.trim();
    if (!body) { B.toast('Write something first'); return; }
    addDoc({ id: B.uid(), name: t, type: 'note', added: new Date().toISOString(), pages: [{ page: 1, text: body }] }).then(function () {
      $('#kb-note-title').value = ''; $('#kb-note-body').value = ''; rebuild(); B.toast('Note saved');
    });
  });
  var SAMPLES = [
    { name: 'Sample — Rental lease.txt', type: 'txt', pages: [
      { page: 1, text: 'Residential Tenancy Agreement between Harbour Property Group and Sam Taylor for 12 Wattle Street, Newtown NSW 2042. The lease starts on 1 February 2026 and ends on 31 January 2027. The weekly rent is $620, paid every second Monday into the agent’s trust account. The bond is $2,480, equal to four weeks of rent, lodged with NSW Fair Trading.' },
      { page: 2, text: 'Pets are allowed only with written approval from the landlord. The tenant must keep the garden tidy and report repairs within 7 days. Urgent repairs can be reported to the agent on 02 9555 0123 or repairs@harbourproperty.com.au. A routine inspection happens every six months. Notice to end the lease must be given in writing at least 21 days before the end date.' }
    ] },
    { name: 'Sample — Car service notes.txt', type: 'txt', pages: [
      { page: 1, text: 'Toyota Corolla service history. Last service on 14 August 2026 at Inner West Auto, cost $389.50. Brake pads were replaced and the oil was changed. The next service is due in February 2027 or at 75,000 km, whichever comes first. Registration renews on 3 May 2027. Tyres were replaced in March 2025 and should last about 40,000 km.' }
    ] },
    { name: 'Sample — Team meeting.txt', type: 'txt', pages: [
      { page: 1, text: 'Weekly meeting, 4 November 2026. Priya Nair will send the client proposal to Northwind Traders by Friday. The website launch moves to 20 November 2026 because testing found two payment bugs. Budget for the launch campaign is $5,000. Tom Becker asked whether the help centre can go live at the same time; the team agreed it will follow a week later. Questions go to hello@example.com.' }
    ] }
  ];
  $('#kb-sample').addEventListener('click', function () {
    Promise.all(SAMPLES.map(function (s, i) {
      return addDoc({ id: 'sample-' + i, name: s.name, type: s.type, added: new Date(Date.now() - i * 1000).toISOString(), pages: s.pages });
    })).then(function () {
      rebuild(); progress('Added 3 sample documents. Try asking “How much is the bond?” or searching “service”.');
      if (!$('#kb-question').value) $('#kb-question').value = 'How much is the bond?';
    });
  });
  B.dropZone($('#kb-drop'), addFiles, { multiple: true, accept: '.pdf,.docx,.xlsx,.xlsm,.xls,.ods,.csv,.tsv,.txt,.md,.markdown,.json,.html,.htm,.log' });

  // ---------- backup ----------
  $('#kb-export').addEventListener('click', function () {
    if (!docs.length) { B.toast('Nothing to export yet'); return; }
    B.download('knowledge-brain-' + B.fmt.date(new Date()) + '.json', K.exportLibrary(docs), 'application/json');
  });
  $('#kb-import-btn').addEventListener('click', function () { $('#kb-import').click(); });
  $('#kb-import').addEventListener('change', function () {
    var f = this.files[0]; this.value = ''; if (!f) return;
    B.readFile(f).then(function (t) {
      var list = K.importLibrary(t);
      return Promise.all(list.map(addDoc)).then(function () { rebuild(); B.toast('Imported ' + list.length + ' document' + (list.length === 1 ? '' : 's')); });
    }).catch(function (e) { B.toast(e.message || 'Could not import that file', 4000); });
  });
  $('#kb-clear').addEventListener('click', function () {
    if (!docs.length || !confirm('Delete every document in your library? Export first if you want a copy.')) return;
    db.clear().then(function () { docs = []; rebuild(); $('#kb-detail').hidden = true; B.toast('Library cleared'); });
  });

  // ---------- start ----------
  B.tabs($('[data-tabs="kb"]'));
  db.open().then(function (ok) {
    if (!ok) {
      var w = $('#kb-storage-warn'); w.hidden = false;
      w.innerHTML = '<strong>Heads up:</strong> this browser is not letting the page save data (private window or storage blocked), so your library will only last until you close the tab. Use Backup → Export to keep a copy.';
    }
    return db.all();
  }).then(function (list) { docs = list || []; rebuild(); });
})();
