/* Product Listing Optimiser — page wiring. Logic lives in lib.js (ListingLib). */
(function () {
  'use strict';
  var L = window.ListingLib, $ = B.$, esc = B.esc;
  var KEY = 'listing:data';
  var FIELDS = ['title', 'bullets', 'description', 'tags', 'searchTerms', 'keywords', 'brand', 'product', 'size', 'colour', 'material', 'dimensions', 'care', 'quantity'];
  var GFIELDS = ['brand', 'product', 'keyFeature', 'material', 'size', 'colour', 'quantity', 'audience', 'dimensions', 'care', 'useCase', 'inBox', 'keywords', 'features'];
  var data = B.store.get(KEY, null) || { saved: [], draft: null, mk: 'amazon', gen: null };
  data.saved = data.saved || [];
  var currentId = null, bulkResults = [], timer;

  function save() { B.store.set(KEY, data); }
  function read() { var o = {}; FIELDS.forEach(function (f) { o[f] = $('#' + f).value; }); return o; }
  function fill(o) { FIELDS.forEach(function (f) { var v = o && o[f]; $('#' + f).value = Array.isArray(v) ? v.join(f === 'bullets' ? '\n' : ', ') : (v || ''); }); }
  function csvDownload(name, rows) { if (!rows.length) return B.toast('Nothing to export'); B.download(name, '﻿' + B.csv.stringify(rows, Object.keys(rows[0])), 'text/csv;charset=utf-8'); }
  var LEVEL = { bad: 'Must fix', warn: 'Should fix', info: 'Tip' };

  // ---------- check ----------
  function counters(R) {
    var t = $('#title').value.trim().length;
    $('#titleCount').innerHTML = '<span class="' + (t > R.titleMax ? 'bad' : t > R.titleIdeal ? 'warn' : '') + '">' + t + ' / ' + R.titleMax + '</span>';
    var bl = $('#bullets').value.split('\n').filter(function (x) { return x.trim(); });
    $('#bulletCount').textContent = bl.length + ' / ' + R.bullets + (bl.length ? ' · longest ' + Math.max.apply(null, bl.map(function (b) { return b.trim().length; })) + ' chars' : '');
    $('#descCount').textContent = $('#description').value.length + (R.descMax ? ' / ' + R.descMax : '') + ' chars';
    var tg = $('#tags').value.split(',').filter(function (x) { return x.trim(); }).length;
    $('#tagCount').textContent = tg + ' / ' + R.tags;
    var st = L.byteLen($('#searchTerms').value.trim());
    $('#stCount').innerHTML = '<span class="' + (st > 249 ? 'bad' : '') + '">' + st + ' / 249 bytes</span>';
    $('#bulletsWrap').hidden = !R.bullets; $('#tagsWrap').hidden = !R.tags; $('#stWrap').hidden = $('#mk').value !== 'amazon';
  }
  function run() {
    var mk = $('#mk').value, l = read(), R = L.RULES[mk]; counters(R);
    data.draft = l; data.mk = mk; save();
    if (!FIELDS.some(function (f) { return String(l[f] || '').trim(); })) { $('#result').innerHTML = '<div class="panel"><p class="muted" style="margin:0">Paste a listing on the left (or press <b>Load sample data</b>) and the check runs as you type.</p></div>'; return; }
    var r = L.check(l, mk), cls = r.score >= 85 ? 'ok' : r.score >= 65 ? 'warn' : 'bad';
    var html = '<div class="panel"><div class="row" style="align-items:flex-end"><div class="score ' + cls + '">' + r.score + '</div><div><b>' + esc(r.grade) + '</b><div class="small muted">' + esc(R.name) + ' · ' + r.issues.filter(function (i) { return i.level === 'bad'; }).length + ' must-fix, ' + r.issues.filter(function (i) { return i.level === 'warn'; }).length + ' should-fix</div></div></div>' +
      '<p class="small muted" style="margin:8px 0 0">' + esc(R.titleNote) + '</p></div>';
    html += r.issues.map(function (i) { return '<div class="issue ' + i.level + '"><span class="area">' + esc(LEVEL[i.level] + ' · ' + i.area) + '</span><p>' + esc(i.msg) + '</p>' + (i.fix ? '<p class="fix">' + esc(i.fix) + '</p>' : '') + '</div>'; }).join('');
    if (r.good.length) html += '<div class="panel"><h3 style="margin-top:0">Looks good</h3><ul class="small">' + r.good.map(function (g) { return '<li class="ok">' + esc(g) + '</li>'; }).join('') + '</ul></div>';
    if (r.keywords.length) html += '<h3>Keyword coverage</h3>' + B.table(r.keywords, [{ key: 'keyword', label: 'Keyword' }, { key: 'title', label: 'Title', fmt: tick }, { key: 'bullets', label: 'Bullets', fmt: tick }, { key: 'description', label: 'Desc.', fmt: tick }, { key: 'tags', label: 'Tags/terms', fmt: tick },
      { key: 'density', label: 'Density', fmt: function (v) { return '<span class="' + (v > 0.04 ? 'warn' : '') + '">' + (v * 100).toFixed(1) + '%</span>'; } }]);
    if (!isNaN(r.readability.score)) html += '<p class="small">Readability of bullets + description: <b>' + r.readability.score + '/100</b> (' + esc(r.readability.label) + '), ' + r.readability.words + ' words, average sentence ' + r.readability.avgSentence + ' words.</p>';
    html += '<details class="small"><summary>' + esc(R.name) + ' image guidance and notes</summary><p>' + esc(R.images) + '</p><ul>' + R.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></details>';
    $('#result').innerHTML = html;
  }
  function tick(v) { return v ? '<span class="ok">✓ ' + v + '</span>' : '<span class="muted">–</span>'; }
  FIELDS.concat(['mk']).forEach(function (f) { $('#' + f).addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 150); }); });
  $('#mk').addEventListener('change', run);
  $('#fixTitle').addEventListener('click', function () {
    var before = $('#title').value, after = L.fixTitle(before, $('#mk').value, $('#brand').value);
    if (after === before.trim()) return B.toast('Nothing to fix automatically');
    $('#title').value = after; run(); B.toast('Removed promo words, odd characters, shouting caps and repeats — check it still reads well', 4000);
  });

  // saved listings
  function renderSaved() {
    $('#saved').innerHTML = '<option value="">' + (data.saved.length ? 'Choose…' : 'None yet') + '</option>' + data.saved.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === currentId ? ' selected' : '') + '>' + esc((s.listing.title || 'Untitled').slice(0, 60)) + '</option>'; }).join('');
  }
  $('#saved').addEventListener('change', function () { var s = data.saved.filter(function (x) { return x.id === $('#saved').value; })[0]; if (!s) return; currentId = s.id; fill(s.listing); $('#mk').value = s.mk; run(); });
  $('#saveListing').addEventListener('click', function () {
    var l = read(); if (!l.title.trim()) return B.toast('Add a title first');
    var s = data.saved.filter(function (x) { return x.id === currentId; })[0];
    if (s) { s.listing = l; s.mk = $('#mk').value; s.updated = new Date().toISOString(); } else { s = { id: B.uid(), listing: l, mk: $('#mk').value, updated: new Date().toISOString() }; data.saved.push(s); currentId = s.id; }
    save(); renderSaved(); B.toast('Saved');
  });
  $('#newListing').addEventListener('click', function () { currentId = null; fill({}); renderSaved(); run(); });
  $('#delListing').addEventListener('click', function () { if (!currentId) return B.toast('Choose a saved listing first'); if (!confirm('Delete this saved listing?')) return; data.saved = data.saved.filter(function (x) { return x.id !== currentId; }); currentId = null; save(); renderSaved(); });

  // AI rewrite (only visible when the visitor has turned AI on)
  B.ai.button($('#aiWrap'), 'AI rewrite', function () {
    var l = read(), mk = $('#mk').value, R = L.RULES[mk], r = L.check(l, mk);
    if (!l.title.trim()) { B.toast('Add a title first'); return null; }
    return 'Rewrite this ' + R.name + ' product listing. Rules: title max ' + R.titleMax + ' characters (aim for ' + R.titleIdeal + '), start with the brand, then product type, key feature, material, size, colour. ' +
      (R.bullets ? 'Write exactly ' + R.bullets + ' bullets, each under ' + R.bulletIdeal + ' characters, each stating a feature AND the benefit to the buyer. ' : '') +
      (R.tags ? 'Give ' + R.tags + ' tags, each 20 characters or less. ' : '') +
      'Use these keywords naturally: ' + l.keywords + '. No promotional words, no "best", no medical or health claims, no guarantees, no ALL CAPS, no emoji. Only use facts present in the listing — do not invent specifications. Australian spelling.\n' +
      'Problems found: ' + r.issues.slice(0, 8).map(function (i) { return i.msg; }).join(' ') + '\n\nListing:\n' + JSON.stringify(l) +
      '\n\nReply as JSON: {"title": "...", "bullets": ["..."], "description": "...", "tags": ["..."]}';
  }, function (ans) {
    var j = B.ai.parseJSON(ans); if (!j || !j.title) { $('#aiOut').innerHTML = '<p class="small warn">The AI reply could not be read. Try again.</p>'; return; }
    var mk = $('#mk').value, cand = Object.assign(read(), { title: j.title, bullets: j.bullets || [], description: j.description || $('#description').value, tags: (j.tags || []).join(', ') || $('#tags').value }), r = L.check(cand, mk);
    $('#aiOut').innerHTML = '<div class="panel"><h3 style="margin-top:0">AI suggestion — scores ' + r.score + '</h3><p class="small muted">Check every fact before using it; AI can get details wrong.</p><pre style="white-space:pre-wrap">' +
      esc(cand.title + '\n\n' + [].concat(cand.bullets).map(function (b) { return '• ' + b; }).join('\n') + '\n\n' + cand.description + (cand.tags ? '\n\nTags: ' + cand.tags : '')) + '</pre><button class="btn small" type="button" id="aiUse">Use this</button></div>';
    $('#aiUse').addEventListener('click', function () { fill(cand); $('#aiOut').innerHTML = ''; run(); });
  }, { json: true });

  // ---------- generate ----------
  function readGen() {
    var o = {}; GFIELDS.forEach(function (f) { o[f] = $('#g-' + f).value; });
    o.features = o.features.split('\n').map(function (line) { var p = line.split(/\s+[—–-]\s+|\s*:\s+/); return { feature: (p[0] || '').trim(), benefit: p.slice(1).join(' — ').trim() }; }).filter(function (f) { return f.feature; });
    return o;
  }
  function fillGen(a) { GFIELDS.forEach(function (f) { $('#g-' + f).value = f === 'features' ? (a.features || []).map(function (x) { return x.feature + (x.benefit ? ' — ' + x.benefit : ''); }).join('\n') : (a[f] || ''); }); }
  function generate() {
    var a = readGen(); data.gen = a; save();
    if (!a.product.trim()) { $('#genOut').innerHTML = '<p class="warn">Enter at least the product type.</p>'; return; }
    var mks = ['amazon', 'ebay', 'etsy', 'google'], out = {};
    mks.forEach(function (mk) {
      out[mk] = { title: L.genTitle(a, mk), bullets: L.RULES[mk].bullets ? L.genBullets(a, mk) : [], description: L.genDescription(a), tags: L.RULES[mk].tags ? L.genTags(a) : [] };
      out[mk].score = L.check(Object.assign({}, a, out[mk], { keywords: a.keywords }), mk).score;
    });
    $('#genOut').innerHTML = mks.map(function (mk) {
      var o = out[mk], text = o.title + (o.bullets.length ? '\n\n' + o.bullets.map(function (b) { return '• ' + b; }).join('\n') : '') + '\n\n' + o.description + (o.tags.length ? '\n\nTags: ' + o.tags.join(', ') : '');
      return '<div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">' + esc(L.RULES[mk].name) + ' <span class="small muted">score ' + o.score + ' · title ' + o.title.length + '/' + L.RULES[mk].titleMax + '</span></h3>' +
        '<span class="row" style="gap:6px"><button class="btn small" type="button" data-gcopy="' + mk + '">Copy</button><button class="btn small" type="button" data-gcheck="' + mk + '">Open in checker</button></span></div><pre>' + esc(text) + '</pre></div>';
    }).join('');
    $('#genOut').onclick = function (e) {
      var c = e.target.closest('[data-gcopy]'), k = e.target.closest('[data-gcheck]');
      if (c) { var o = out[c.dataset.gcopy]; B.copy(o.title + '\n\n' + o.bullets.join('\n') + '\n\n' + o.description + (o.tags.length ? '\n\n' + o.tags.join(', ') : '')); }
      if (k) { var g = out[k.dataset.gcheck]; currentId = null; fill(Object.assign({}, a, { title: g.title, bullets: g.bullets, description: g.description, tags: g.tags.join(', '), keywords: a.keywords, product: a.product })); $('#mk').value = k.dataset.gcheck; renderSaved(); showTab('check'); run(); }
    };
  }
  $('#genBtn').addEventListener('click', generate);

  // ---------- bulk ----------
  function runBulk(rows) {
    bulkResults = L.bulk(rows, $('#bulkMk').value);
    if (!bulkResults.length) { $('#bulkOut').innerHTML = '<p class="warn">No rows found.</p>'; return; }
    var avg = Math.round(bulkResults.reduce(function (s, r) { return s + r.score; }, 0) / bulkResults.length), weak = bulkResults.filter(function (r) { return r.score < 65; }).length;
    $('#bulkOut').innerHTML = '<div class="stat-row" style="margin-top:12px"><div class="stat"><div class="v">' + bulkResults.length + '</div><div class="k">Listings</div></div><div class="stat"><div class="v">' + avg + '</div><div class="k">Average score</div></div><div class="stat"><div class="v ' + (weak ? 'warn' : 'ok') + '">' + weak + '</div><div class="k">Need work (&lt; 65)</div></div></div>' +
      '<div class="row" style="margin:10px 0"><button class="btn" id="bulkCsv" type="button">Download results CSV</button></div>' +
      B.table(bulkResults.slice().sort(function (a, b) { return a.score - b.score; }), [{ key: 'row', label: '#' }, { key: 'sku', label: 'SKU' }, { key: 'marketplace', label: 'Where' },
        { key: 'score', label: 'Score', fmt: function (v) { return '<span class="' + (v >= 85 ? 'pill-ok' : v >= 65 ? 'pill-warn' : 'pill-bad') + '">' + v + '</span>'; } },
        { key: 'title', label: 'Title', fmt: function (v, r) { return esc(v) + (r.fixedTitle !== v.trim() ? '<div class="small muted">Suggested: ' + esc(r.fixedTitle) + '</div>' : ''); } },
        { key: 'top', label: 'Top issues', fmt: function (v) { return '<span class="small">' + esc(v) + '</span>'; } },
        { key: 'row', label: '', fmt: function (v) { return '<button class="btn small" type="button" data-open-row="' + v + '">Open</button>'; } }]);
    $('#bulkCsv').addEventListener('click', function () { csvDownload('listing-check-results.csv', L.bulkCsvRows(bulkResults)); });
  }
  $('#bulkOut').addEventListener('click', function (e) {
    var b = e.target.closest('[data-open-row]'); if (!b) return;
    var r = bulkResults.filter(function (x) { return x.row === +b.dataset.openRow; })[0]; currentId = null; fill(r.listing); $('#mk').value = r.mk; renderSaved(); showTab('check'); run();
  });
  B.dropZone($('#bulkDrop'), function (files) { B.readTable(files[0]).then(function (t) { runBulk(t.rows); }).catch(function (err) { B.toast('Could not read that file: ' + err.message, 4000); }); }, { accept: '.csv,.tsv,.txt,.xlsx,.xls,.json' });
  $('#bulkSample').addEventListener('click', function () { runBulk(B.csv.toObjects(L.sample().csv).rows); });
  $('#bulkTemplate').addEventListener('click', function () { B.download('listing-template.csv', '﻿sku,marketplace,title,brand,product,colour,size,material,dimensions,care,quantity,bullet1,bullet2,bullet3,bullet4,bullet5,description,tags,keywords,searchTerms\n', 'text/csv;charset=utf-8'); });
  $('#bulkMk').addEventListener('change', function () { if (bulkResults.length) runBulk(bulkResults.map(function (r) { return r.listing; })); });

  // ---------- rules ----------
  $('#rulesOut').innerHTML = B.table(Object.keys(L.RULES).map(function (k) { var R = L.RULES[k]; return { name: R.name, title: R.titleMax + ' max · ~' + R.titleIdeal + ' shown', bullets: R.bullets ? R.bullets + ' (≤' + R.bulletMax + ' chars)' : '–', tags: R.tags ? R.tags + ' (≤' + R.tagMax + ' chars)' : '–', desc: R.descMax ? R.descMax.toLocaleString('en-AU') + ' chars' : 'no fixed limit', images: R.images, notes: R.notes.join(' ') }; }),
    [{ key: 'name', label: 'Marketplace' }, { key: 'title', label: 'Title' }, { key: 'bullets', label: 'Bullets' }, { key: 'tags', label: 'Tags' }, { key: 'desc', label: 'Description' }, { key: 'images', label: 'Images' }, { key: 'notes', label: 'Notes' }]) +
    '<h3>Claims this tool flags</h3><ul class="small">' + L.CLAIMS.map(function (c) { return '<li>' + esc(c.why) + '</li>'; }).join('') + '</ul>';

  // ---------- sample + start ----------
  $('#sample').addEventListener('click', function () {
    var s = L.sample(); currentId = null; fill(s.listing); $('#mk').value = s.marketplace; fillGen(s.attrs); renderSaved(); run(); generate(); runBulk(B.csv.toObjects(s.csv).rows); showTab('check'); B.toast('Sample listing loaded — made-up product');
  });
  var showTab = B.tabs($('[data-tabs="lo"]'));
  B.ai.note($('#aiWrap').parentNode);
  if (data.draft) fill(data.draft); if (data.mk) $('#mk').value = data.mk; if (data.gen) fillGen(data.gen);
  renderSaved(); run();
})();
