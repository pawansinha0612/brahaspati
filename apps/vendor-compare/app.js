/* Vendor Comparison — page wiring. Logic lives in lib.js (VendorLib). */
(function () {
  'use strict';
  var L = window.VendorLib, $ = B.$, esc = B.esc;
  function money(v) { return B.fmt.money(v); }
  var KEY = 'vendor:data', MAX = 8;
  var st = load(), calc = null, showTab;

  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function defaults() {
    return { vendors: [], criteria: JSON.parse(JSON.stringify(L.DEFAULT_CRITERIA)), scores: {}, years: 3, volume: 0, basis: 'ex', sensPct: 0.2,
      lockIn: 24, wantWarranty: false, title: 'Supplier recommendation', preparedBy: '', date: today(), memoNotes: '' };
  }
  function load() { var d = B.store.get(KEY, null); return Object.assign(defaults(), d || {}); }
  function save() { if (!B.store.set(KEY, st)) B.toast('Could not save — browser storage may be full. Download a backup.', 4000); }

  // ---------- reading files ----------
  function fileToText(f) {
    var name = f.name.toLowerCase();
    if (/\.docx$/.test(name)) return Promise.all([B.lib.mammoth(), B.readFile(f, 'buffer')]).then(function (r) { return r[0].extractRawText({ arrayBuffer: r[1] }); }).then(function (r) { return r.value; });
    if (/\.pdf$/.test(name)) return Promise.all([B.lib.pdfjs(), B.readFile(f, 'buffer')]).then(function (r) {
      return r[0].getDocument({ data: r[1] }).promise.then(function (pdf) {
        var pages = []; for (var i = 1; i <= pdf.numPages; i++) pages.push(pdf.getPage(i).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
          var out = '', lastY = null; tc.items.forEach(function (it) { var y = it.transform[5]; if (lastY != null && Math.abs(y - lastY) > 2) out += '\n'; else if (out) out += ' '; out += it.str; lastY = y; }); return out;
        }));
        return Promise.all(pages).then(function (t) { return t.join('\n'); });
      });
    });
    if (/\.doc$/.test(name)) return Promise.reject(new Error('Old .doc files can’t be read here — save it as .docx or PDF first.'));
    return B.readFile(f);
  }

  // ---------- calculations ----------
  function compute() {
    var opts = { years: st.years, volume: st.volume, basis: st.basis };
    var tcos = st.vendors.map(function (v) { return L.tco(v, opts); });
    var auto = {}, ps = L.priceScores(tcos.map(function (t) { return t.priced ? t.total : 0; }));
    st.criteria.forEach(function (c) { if (c.auto) { auto[c.id] = {}; st.vendors.forEach(function (v, i) { if (ps[i] != null) auto[c.id][v.id] = ps[i]; }); } });
    var results = L.weighted(st.vendors, st.criteria, st.scores, auto);
    var sens = L.sensitivity(st.vendors, st.criteria, st.scores, auto, +st.sensPct, 500, 2026);
    var flags = st.vendors.map(function (v) { return L.redFlags(v, { lockInMonths: +st.lockIn, years: +st.years, volume: st.volume, wantWarranty: st.wantWarranty }); });
    calc = { tcos: tcos, auto: auto, results: results, sensitivity: sens, flags: flags };
    return calc;
  }

  // ---------- vendors tab ----------
  var FIELDS = [
    ['oneOff', 'One-off costs ($)', 'number'], ['monthly', 'Monthly fee ($)', 'number'], ['annual', 'Annual fee ($)', 'number'],
    ['perUnit', 'Per-unit rate ($)', 'number'], ['unitLabel', 'Unit (e.g. user, bin)', 'text'],
    ['gst', 'Prices quoted', 'gst'], ['contractMonths', 'Minimum term (months)', 'number'], ['noticeDays', 'Notice to cancel (days)', 'number'],
    ['paymentTerms', 'Payment terms', 'text'], ['responseHours', 'Response time (hours)', 'number'], ['uptime', 'Uptime / availability %', 'number'],
    ['warrantyMonths', 'Warranty (months)', 'number'], ['escalationPct', 'Price rise % a year', 'number'], ['autoRenew', 'Renews automatically', 'check']
  ];
  function fieldHTML(v, f) {
    var id = 'f-' + v.id + '-' + f[0], val = v[f[0]];
    if (f[2] === 'check') return '<div><label class="check" style="margin-top:34px"><input type="checkbox" data-f="' + f[0] + '" id="' + id + '"' + (val ? ' checked' : '') + '> ' + f[1] + '</label></div>';
    if (f[2] === 'gst') return '<div><label for="' + id + '">' + f[1] + '</label><select data-f="gst" id="' + id + '">' +
      [['ex', 'Excluding GST'], ['inc', 'Including GST'], ['unknown', 'Not stated']].map(function (o) { return '<option value="' + o[0] + '"' + (val === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>';
    return '<div><label for="' + id + '">' + f[1] + '</label><input type="' + (f[2] === 'number' ? 'number" step="any" min="0' : 'text') + '" data-f="' + f[0] + '" id="' + id + '" value="' + esc(val == null ? '' : val) + '"></div>';
  }
  function renderVendors() {
    var el = $('#vendorList');
    if (!st.vendors.length) { el.innerHTML = '<p class="muted">No vendors yet. Add at least two proposals, or load the sample data to see how it works.</p>'; return; }
    el.innerHTML = (st.vendors.length < 2 ? '<p class="pill-warn" style="display:inline-block">Add one more vendor to compare.</p>' : '') + st.vendors.map(function (v) {
      var found = (v.prices || []).length ? '<details class="found"><summary>Prices found in the text (' + v.prices.length + ') — check these</summary><ul>' + v.prices.map(function (p) {
        return '<li><b>' + money(p.value) + '</b> as ' + ({ oneOff: 'one-off', monthly: 'monthly', annual: 'annual', perUnit: 'per unit' })[p.kind] + (p.guess ? ' <span class="pill-warn">guess</span>' : '') + ' — “' + esc(p.line) + '”</li>';
      }).join('') + '</ul></details>' : '';
      return '<div class="panel vcard" data-v="' + v.id + '"><div class="vhead"><input type="text" data-f="name" aria-label="Vendor name" value="' + esc(v.name) + '">' +
        '<button class="btn small" type="button" data-del="' + v.id + '">Remove</button></div>' +
        '<div class="form-grid">' + FIELDS.map(function (f) { return fieldHTML(v, f); }).join('') +
        '<div class="full"><label for="inc-' + v.id + '">Inclusions (one per line)</label><textarea class="prose" style="min-height:70px" data-f="inclusions" id="inc-' + v.id + '">' + esc((v.inclusions || []).join('\n')) + '</textarea></div>' +
        '<div class="full"><label for="exc-' + v.id + '">Exclusions (one per line)</label><textarea class="prose" style="min-height:70px" data-f="exclusions" id="exc-' + v.id + '">' + esc((v.exclusions || []).join('\n')) + '</textarea></div>' +
        '<div class="full"><label for="nt-' + v.id + '">Notes</label><input type="text" data-f="notes" id="nt-' + v.id + '" value="' + esc(v.notes || '') + '"></div></div>' + found + '</div>';
    }).join('');
  }
  function onVendorEdit(e) {
    var card = e.target.closest('[data-v]'), f = e.target.dataset.f; if (!card || !f) return;
    var v = st.vendors.filter(function (x) { return x.id === card.dataset.v; })[0]; if (!v) return;
    if (e.target.type === 'checkbox') v[f] = e.target.checked;
    else if (f === 'inclusions' || f === 'exclusions') v[f] = e.target.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    else v[f] = e.target.value;
    save(); renderAll(true);
  }
  function addVendor(v) {
    if (st.vendors.length >= MAX) { B.toast('Up to ' + MAX + ' vendors can be compared at once.'); return false; }
    v.id = B.uid(); if (!v.name) v.name = 'Vendor ' + (st.vendors.length + 1);
    st.vendors.push(v); st.scores[v.id] = st.scores[v.id] || {}; save(); renderAll(); return true;
  }

  // ---------- costs ----------
  function renderCosts() {
    var el = $('#costOut'); if (!st.vendors.length) { el.innerHTML = '<p class="muted">Add vendors first.</p>'; return; }
    var yrs = calc.tcos[0] ? calc.tcos[0].years : st.years, cols = [{ key: 'name', label: 'Vendor' }, { key: 'oneOff', label: 'One-off', fmt: money }, { key: 'recurring', label: 'Fees over ' + yrs + ' yrs', fmt: money },
      { key: 'usage', label: 'Usage', fmt: money }, { key: 'total', label: 'Total', fmt: function (x) { return '<b>' + money(x) + '</b>'; } }, { key: 'monthlyAverage', label: 'Avg / month', fmt: money }];
    for (var y = 0; y < yrs; y++) cols.push({ key: 'y' + y, label: 'Year ' + (y + 1), fmt: money });
    var rows = st.vendors.map(function (v, i) { var t = calc.tcos[i], r = { name: v.name + (t.gstAssumed ? ' *' : ''), oneOff: t.oneOff, recurring: t.recurring, usage: t.usage, total: t.total, monthlyAverage: t.monthlyAverage }; t.perYear.forEach(function (p, k) { r['y' + k] = p; }); return r; });
    var cheapest = rows.filter(function (r) { return r.total > 0; }).sort(function (a, b) { return a.total - b.total; })[0];
    el.innerHTML = '<h3>Total cost of ownership (' + (st.basis === 'inc' ? 'incl.' : 'excl.') + ' GST)</h3>' + B.table(rows, cols) +
      (calc.tcos.some(function (t) { return t.gstAssumed; }) ? '<p class="small muted">* GST basis not stated in the quote — treated as excluding GST.</p>' : '') +
      (cheapest ? '<p>Cheapest over ' + yrs + ' years: <b>' + esc(cheapest.name) + '</b> at ' + money(cheapest.total) + '.</p>' : '') +
      B.barChart(rows.map(function (r) { return { label: r.name, value: r.total }; }), { fmt: money });
  }

  // ---------- scoring ----------
  function renderCriteria() {
    $('#critList').innerHTML = st.criteria.map(function (c, i) {
      return '<div class="crit-row" data-c="' + i + '"><input type="text" aria-label="Criterion name" data-cf="name" value="' + esc(c.name) + '">' +
        '<input type="number" aria-label="Weight" min="0" step="any" data-cf="weight" value="' + esc(c.weight) + '">' +
        '<label class="check" style="margin:0"><input type="checkbox" data-cf="auto"' + (c.auto ? ' checked' : '') + '> from cost</label>' +
        '<button class="btn small" type="button" data-cdel="' + i + '" aria-label="Remove criterion">✕</button></div>';
    }).join('');
    var sum = st.criteria.reduce(function (a, c) { return a + (L.num(c.weight) || 0); }, 0);
    $('#weightSum').textContent = 'Total weight: ' + B.fmt.num(sum) + (Math.abs(sum - 100) > 0.01 ? ' (fine — weights are used in proportion)' : '');
  }
  function renderScores() {
    var el = $('#scoreGrid');
    if (!st.vendors.length || !st.criteria.length) { el.innerHTML = '<p class="muted">Add vendors and criteria first.</p>'; return; }
    var h = '<div class="table-wrap"><table><thead><tr><th>Criterion</th>' + st.vendors.map(function (v) { return '<th>' + esc(v.name) + '</th>'; }).join('') + '</tr></thead><tbody>';
    st.criteria.forEach(function (c) {
      h += '<tr><td>' + esc(c.name) + ' <span class="small muted">(' + esc(c.weight) + ')</span></td>' + st.vendors.map(function (v) {
        if (c.auto) { var a = calc.auto[c.id] && calc.auto[c.id][v.id]; return '<td class="num">' + (a != null ? a.toFixed(1) : '–') + ' <span class="small muted">auto</span></td>'; }
        var s = (st.scores[v.id] && st.scores[v.id][c.id]) || {};
        return '<td class="score-cell" data-sv="' + v.id + '" data-sc="' + c.id + '"><select aria-label="Score for ' + esc(v.name) + ' on ' + esc(c.name) + '" data-sf="score"><option value="">–</option>' +
          [1, 2, 3, 4, 5].map(function (n) { return '<option' + (String(s.score) === String(n) ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select>' +
          '<input type="text" placeholder="Note" aria-label="Note" data-sf="note" value="' + esc(s.note || '') + '"></td>';
      }).join('') + '</tr>';
    });
    el.innerHTML = h + '</tbody></table></div>';
  }
  function renderResult() {
    var el = $('#scoreResult'); if (!st.vendors.length) { el.innerHTML = ''; $('#sensOut').innerHTML = ''; return; }
    var ranked = L.rank(calc.results);
    el.innerHTML = B.table(ranked.map(function (r, i) { return { rank: i + 1, name: r.name, score: r.score, pct: r.pct, missing: r.missing }; }),
      [{ key: 'rank', label: '#' }, { key: 'name', label: 'Vendor' }, { key: 'score', label: 'Score / 5', fmt: function (x) { return x.toFixed(2); } }, { key: 'pct', label: '%', fmt: function (x) { return x.toFixed(0) + '%'; } },
        { key: 'missing', label: 'Unscored', fmt: function (x) { return x ? '<span class="pill-warn">' + x + ' missing</span>' : '<span class="pill-ok">complete</span>'; } }]) +
      B.barChart(ranked.map(function (r) { return { label: r.name, value: r.score }; }), { fmt: function (x) { return x.toFixed(2); } }) +
      '<p class="small muted">Unscored criteria count as zero, so fill in every score before deciding.</p>';
    var s = calc.sensitivity, pct = Math.round(st.sensPct * 100);
    var h = s.winner ? (s.stable ? '<p><span class="pill-ok">Robust</span> <b>' + esc(s.winner.name) + '</b> still wins when any single weight moves ±' + pct + '%.</p>'
      : '<p><span class="pill-warn">Sensitive</span> The winner changes when:</p><ul class="sens">' + s.flips.map(function (f) { return '<li>' + esc(f.criterion) + ' weight ' + f.change + ' → <b>' + esc(f.winner) + '</b> wins</li>'; }).join('') + '</ul>')
      : '<p><span class="pill-warn">Tie</span> The top vendors have the same score.</p>';
    h += '<p class="small muted">Shaking all weights at once by up to ±' + pct + '% (500 random tries), each vendor won:</p>' + B.barChart(s.share.map(function (x) { return { label: x.name, value: x.share * 100 }; }), { fmt: function (x) { return Math.round(x) + '%'; } });
    $('#sensOut').innerHTML = h;
  }

  // ---------- side by side ----------
  function fmtCell(label, v) {
    if (v === '' || v == null || (typeof v === 'number' && isNaN(v))) return '<span class="muted">–</span>';
    if (/cost|fee|one-off|rate|per month/i.test(label) && !isNaN(L.num(v))) return money(L.num(v));
    return esc(v);
  }
  function compareRows() { return L.rows(st.vendors, calc.tcos, calc.results); }
  function renderCompare() {
    var el = $('#compareOut'); if (st.vendors.length < 1) { el.innerHTML = '<p class="muted">Add vendors first.</p>'; return; }
    var rows = compareRows();
    var h = '<div class="table-wrap"><table><thead><tr><th></th>' + st.vendors.map(function (v) { return '<th>' + esc(v.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><th scope="row">' + esc(r.label) + '</th>' + r.values.map(function (v, i) { return '<td class="' + (r.best.indexOf(i) >= 0 ? 'best' : '') + '">' + fmtCell(r.label, v) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '<tr><th scope="row">What’s included</th>' + st.vendors.map(function (v) { return '<td class="small">' + ((v.inclusions || []).map(esc).join('<br>') || '<span class="muted">–</span>') + '</td>'; }).join('') + '</tr>' +
      '<tr><th scope="row">Not included</th>' + st.vendors.map(function (v) { return '<td class="small">' + ((v.exclusions || []).map(esc).join('<br>') || '<span class="muted">–</span>') + '</td>'; }).join('') + '</tr>' +
      '<tr><th scope="row">Red flags</th>' + st.vendors.map(function (v, i) { var n = calc.flags[i].filter(function (f) { return f.level === 'bad'; }).length; return '<td>' + (n ? '<span class="pill-bad">' + n + ' serious</span>' : '<span class="pill-ok">none serious</span>') + '</td>'; }).join('') + '</tr>' +
      '</tbody></table></div>';
    el.innerHTML = h;
  }

  // ---------- flags & questions ----------
  function questionEmail(v) {
    var q = L.questions(v, { wantWarranty: st.wantWarranty });
    return 'Subject: A few questions about your proposal\n\nHi ' + v.name + ' team,\n\nThanks for your proposal. Before we decide, could you please confirm the following:\n\n' +
      q.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n') + '\n\nWe are aiming to decide soon, so a reply within the next week would be appreciated.\n\nKind regards,\n' + (st.preparedBy || '');
  }
  function renderFlags() {
    var el = $('#flagsOut'); if (!st.vendors.length) { el.innerHTML = '<p class="muted">Add vendors first.</p>'; return; }
    el.innerHTML = st.vendors.map(function (v, i) {
      var fl = calc.flags[i], q = L.questions(v, { wantWarranty: st.wantWarranty });
      return '<div class="panel"><h3 style="margin-top:0">' + esc(v.name) + '</h3>' +
        (fl.length ? fl.map(function (f) { return '<p class="flag"><span class="pill-' + f.level + '">' + (f.level === 'bad' ? 'Red flag' : 'Check') + '</span> ' + esc(f.text) + '</p>'; }).join('') : '<p><span class="pill-ok">No red flags found</span></p>') +
        '<h3>Questions to send</h3><ol class="q">' + q.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
        '<div class="row no-print"><button class="btn small" type="button" data-copyq="' + i + '">Copy as email</button></div></div>';
    }).join('');
  }

  // ---------- memo ----------
  function memoBody() { return calc && st.vendors.length ? L.memoHTML(st, calc, money) : '<p class="muted">Add vendors and scores to build the memo.</p>'; }
  function memoDoc() {
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + esc(st.title) + '</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#111;max-width:780px;margin:24px auto;padding:0 16px}' +
      'table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #ccc;padding:5px 8px;text-align:left}th{background:#f2f2f2}h1{font-size:24px}h2{font-size:18px;margin-top:22px}h3{font-size:15px}</style></head><body>' + memoBody() + '</body></html>';
  }
  function printHTML(html) {
    var f = B.h('iframe', { title: 'Print preview', style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0' });
    f.addEventListener('load', function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { B.toast('Printing was blocked. Use Download instead.'); } setTimeout(function () { f.remove(); }, 60000); });
    f.srcdoc = html; document.body.appendChild(f);
  }
  function renderMemo() { $('#memoOut').innerHTML = memoBody(); }

  function syncInputs() {
    $('#years').value = st.years; $('#volume').value = st.volume; $('#basis').value = st.basis; $('#sensPct').value = String(st.sensPct);
    $('#lockIn').value = st.lockIn; $('#wantWarranty').checked = !!st.wantWarranty;
    $('#mTitle').value = st.title; $('#mBy').value = st.preparedBy; $('#mDate').value = st.date; $('#mNotes').value = st.memoNotes;
  }
  // keepVendors: don't redraw the vendor forms (keeps focus while typing)
  function renderAll(keepVendors) {
    compute();
    if (!keepVendors) renderVendors();
    renderCosts(); renderCriteria(); renderScores(); renderResult(); renderCompare(); renderFlags(); renderMemo();
  }

  // ---------- sample ----------
  var SAMPLES = [
    'BrightSpark Cleaning Pty Ltd\nQuote: office cleaning, Level 3, 88 King St\nSet-up and initial deep clean: $1,200 one-off\nRegular cleaning (5 nights a week): $1,850 per month\nWindow cleaning: $480 per quarter\nSanitary and bin service: $2.40 per bin\nAll prices exclude GST.\nMinimum contract term: 24 months. The agreement renews automatically for a further 12 months unless 60 days written notice is given.\nPrices increase by 4% per annum on each anniversary.\nPayment terms: 14 days from invoice.\nResponse time: within 4 hours for urgent requests.\nIncludes:\n- Vacuuming and mopping all floors\n- Kitchen and bathrooms\n- Bin emptying and recycling\nExcludes:\n- Carpet steam cleaning\n- After-hours call-outs',
    'Harbour Facility Services\nMonthly fee $2,090 inc GST (5 nights).\nOne-off onboarding fee $550 inc GST.\nNo lock-in contract, month to month. 30 days notice to cancel.\nResponse time 2 hours. 99.5% availability guarantee.\nPayment terms: 30 days.\nPrice includes: all consumables, windows (internal) monthly, carpet spot cleaning, quarterly steam clean.\nExcludes: external windows.',
    'Green Leaf Commercial Cleaning\nFixed price $21,000 per year plus GST, paid annually in advance.\nInstallation of dispensers $900 plus GST.\nContract term of 3 years. 90 days notice required.\nPrice reviewed each year in line with CPI.\n12 month warranty on supplied dispensers.\nIncludes:\n- Eco-certified products\n- Monthly quality audit\n- Dedicated account manager'
  ];
  var SAMPLE_SCORES = [{ quality: 4, service: 4, terms: 2, experience: 4, risk: 3 }, { quality: 4, service: 5, terms: 5, experience: 3, risk: 3 }, { quality: 5, service: 3, terms: 2, experience: 5, risk: 4 }];
  function loadSample() {
    if (st.vendors.length && !confirm('Replace your current comparison with the sample?')) return;
    st = defaults(); st.volume = 40; st.title = 'Office cleaning contract — recommendation'; st.preparedBy = 'Office manager';
    SAMPLES.forEach(function (t, i) {
      var v = L.extract(t); v.id = B.uid(); st.vendors.push(v); st.scores[v.id] = {};
      Object.keys(SAMPLE_SCORES[i]).forEach(function (k) { st.scores[v.id][k] = { score: SAMPLE_SCORES[i][k], note: '' }; });
    });
    st.scores[st.vendors[1].id].terms.note = 'Month to month, no exit fee';
    st.scores[st.vendors[0].id].terms.note = 'Auto-renews; 24-month lock-in';
    save(); syncInputs(); renderAll(); B.toast('Sample loaded — made-up vendors');
  }

  // ---------- events ----------

  var lastFile = '';
  B.dropZone($('#drop'), function (files) {
    var f = files[0]; $('#addStatus').textContent = 'Reading ' + f.name + '…';
    fileToText(f).then(function (text) {
      if (!text || text.replace(/\s/g, '').length < 20) { $('#addStatus').textContent = 'No text found — it may be a scanned image. Type the figures in instead.'; return; }
      $('#newText').value = text; $('#addStatus').textContent = 'Read ' + f.name + '. Check the text, then press “Read proposal and add vendor”.';
      lastFile = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    }, function (err) { $('#addStatus').textContent = err.message || 'Could not read that file.'; });
  }, { accept: '.pdf,.docx,.txt,.md,.doc' });
  $('#addVendor').addEventListener('click', function () {
    var text = $('#newText').value.trim(); if (!text) { B.toast('Paste the proposal text or drop a file first'); return; }
    var v = L.extract(text), nm = $('#newName').value.trim(); if (nm) v.name = nm; else if (!v.name && lastFile) v.name = lastFile;
    if (addVendor(v)) { $('#newText').value = ''; $('#newName').value = ''; lastFile = ''; $('#addStatus').textContent = 'Added ' + v.name + ' — check the figures below.'; }
  });
  $('#addBlank').addEventListener('click', function () { addVendor(L.blankVendor($('#newName').value.trim())); $('#newName').value = ''; });
  $('#vendorList').addEventListener('change', onVendorEdit);
  $('#vendorList').addEventListener('click', function (e) {
    var id = e.target.dataset.del; if (!id) return;
    var v = st.vendors.filter(function (x) { return x.id === id; })[0]; if (!v || !confirm('Remove ' + v.name + '?')) return;
    st.vendors = st.vendors.filter(function (x) { return x.id !== id; }); delete st.scores[id]; save(); renderAll();
  });
  [['years', 'years'], ['volume', 'volume'], ['basis', 'basis'], ['sensPct', 'sensPct'], ['lockIn', 'lockIn'], ['mTitle', 'title'], ['mBy', 'preparedBy'], ['mDate', 'date'], ['mNotes', 'memoNotes']].forEach(function (p) {
    $('#' + p[0]).addEventListener('change', function (e) {
      var val = e.target.value;
      if (p[1] === 'years') val = Math.max(1, Math.min(15, Math.round(+val || 3)));
      if (p[1] === 'volume' || p[1] === 'lockIn' || p[1] === 'sensPct') val = Math.max(0, +val || 0);
      st[p[1]] = val; save(); renderAll(true);
    });
  });
  $('#wantWarranty').addEventListener('change', function (e) { st.wantWarranty = e.target.checked; save(); renderAll(true); });
  $('#critList').addEventListener('change', function (e) {
    var row = e.target.closest('[data-c]'), f = e.target.dataset.cf; if (!row || !f) return;
    var c = st.criteria[+row.dataset.c]; c[f] = f === 'auto' ? e.target.checked : f === 'weight' ? Math.max(0, +e.target.value || 0) : e.target.value;
    save(); renderAll(true);
  });
  $('#critList').addEventListener('click', function (e) {
    var i = e.target.dataset.cdel; if (i == null) return;
    st.criteria.splice(+i, 1); save(); renderAll(true);
  });
  $('#addCrit').addEventListener('click', function () { st.criteria.push({ id: 'c' + B.uid(), name: 'New criterion', weight: 10 }); save(); renderAll(true); });
  $('#scoreGrid').addEventListener('change', function (e) {
    var cell = e.target.closest('[data-sv]'), f = e.target.dataset.sf; if (!cell || !f) return;
    var s = st.scores[cell.dataset.sv] = st.scores[cell.dataset.sv] || {}; var x = s[cell.dataset.sc] = s[cell.dataset.sc] || {};
    x[f] = e.target.value; save(); compute(); renderResult(); renderCompare(); renderMemo();
  });
  $('#flagsOut').addEventListener('click', function (e) { var i = e.target.dataset.copyq; if (i != null) B.copy(questionEmail(st.vendors[+i])); });
  $('#csvCompare').addEventListener('click', function () {
    if (!st.vendors.length) return B.toast('Nothing to export');
    var head = ['Item'].concat(st.vendors.map(function (v) { return v.name; }));
    var rows = compareRows().map(function (r) { return [r.label].concat(r.values.map(function (v) { return v == null ? '' : v; })); });
    rows.push(['Inclusions'].concat(st.vendors.map(function (v) { return (v.inclusions || []).join('; '); })));
    rows.push(['Exclusions'].concat(st.vendors.map(function (v) { return (v.exclusions || []).join('; '); })));
    B.download('vendor-comparison.csv', '﻿' + B.csv.stringify([head].concat(rows)), 'text/csv;charset=utf-8');
  });
  $('#printMemo').addEventListener('click', function () { printHTML(memoDoc()); });
  $('#dlMemo').addEventListener('click', function () { B.download('recommendation-memo.html', memoDoc(), 'text/html;charset=utf-8'); });
  $('#sample').addEventListener('click', loadSample);
  $('#backup').addEventListener('click', function () { B.download('vendor-comparison-backup.json', JSON.stringify({ app: 'vendor-compare', version: 1, data: st }, null, 2), 'application/json'); });
  $('#restore').addEventListener('click', function () {
    var inp = B.h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', function () {
      if (!inp.files[0]) return;
      B.readFile(inp.files[0]).then(function (t) {
        var j = JSON.parse(t), d = j.data || j; if (!Array.isArray(d.vendors)) throw new Error('bad');
        st = Object.assign(defaults(), d); save(); syncInputs(); renderAll(); B.toast('Backup restored');
      }).catch(function () { B.toast('That file is not a Vendor Comparison backup'); });
    });
    inp.click();
  });
  $('#wipe').addEventListener('click', function () { if (!confirm('Delete every vendor, score and setting in this tool?')) return; st = defaults(); save(); syncInputs(); renderAll(); });

  // optional AI: an executive summary drafted from the figures (only shown when AI is on)
  if (B.ai) {
    B.ai.note($('#aiNote'));
    B.ai.button($('#memoActions'), 'Draft a summary paragraph', function () {
      if (!st.vendors.length) { B.toast('Add vendors first'); return null; }
      var r = L.rank(calc.results).map(function (x) { var i = st.vendors.map(function (v) { return v.id; }).indexOf(x.id); return x.name + ': score ' + x.score + '/5, ' + st.years + '-year cost ' + money(calc.tcos[i].total) + ', flags: ' + calc.flags[i].map(function (f) { return f.text; }).join(' ') ; }).join('\n');
      return 'Write a short, plain-English recommendation paragraph (under 150 words, Australian spelling) for a small-business owner choosing a supplier. Use only these facts and do not invent any:\n' + r;
    }, function (ans) { st.memoNotes = (st.memoNotes ? st.memoNotes + '\n\n' : '') + ans.trim(); $('#mNotes').value = st.memoNotes; save(); renderMemo(); });
  }

  syncInputs(); compute();
  showTab = B.tabs(B.$('.tabs'));
  renderAll();
})();
