/* Review & Feedback Miner — page wiring. Logic lives in lib.js (FeedbackLib). */
(function () {
  'use strict';
  var L = window.FeedbackLib, $ = B.$;
  var KEY = 'fm:data', SKEY = 'fm:settings';
  var data = B.store.get(KEY, null);   // {kind:'file', name, headers, rows, map} | {kind:'paste', text}
  var settings = Object.assign({ mode: 'service', business: '', contact: '', filter: 'all', theme: '', q: '' }, B.store.get(SKEY, {}) || {});
  var res = null;

  function save() { if (data && !B.store.set(KEY, data)) B.toast('Too big to remember after a refresh, but it works for now.', 3500); }
  function saveSettings() { B.store.set(SKEY, settings); }
  function pct(x) { return x == null ? '–' : B.fmt.pct(x, 0); }
  function stars(r) { return r == null ? '' : '<span title="' + (Math.round(r * 10) / 10) + ' of 5" aria-label="' + (Math.round(r * 10) / 10) + ' stars">' + '★★★★★'.slice(0, Math.round(r)) + '<span class="muted">' + '★★★★★'.slice(0, 5 - Math.round(r)) + '</span></span>'; }
  function stat(v, k) { return '<div class="stat"><div class="v">' + v + '</div><div class="k">' + B.esc(k) + '</div></div>'; }
  function fdate(t) { return t == null ? '' : new Date(t).toISOString().slice(0, 10); }
  function themeName(id) { var t = L.themesFor(res.mode).filter(function (x) { return x.id === id; })[0]; return t ? t.name : id; }
  var LABEL = { positive: '<span class="pill-ok">positive</span>', negative: '<span class="pill-bad">negative</span>', mixed: '<span class="pill-warn">mixed</span>' };

  // ---------- settings ----------
  B.$$('input[name=mode]').forEach(function (r) {
    r.checked = r.value === settings.mode;
    r.addEventListener('change', function () { settings.mode = r.value; saveSettings(); if (res) run(false); });
  });
  $('#biz').value = settings.business; $('#contact').value = settings.contact;
  ['biz', 'contact'].forEach(function (id) { $('#' + id).addEventListener('change', function () { settings.business = $('#biz').value.trim(); settings.contact = $('#contact').value.trim(); saveSettings(); if (res) renderReplies(); }); });

  // ---------- import ----------
  B.dropZone($('#drop'), function (files) {
    B.readTable(files[0]).then(function (t) {
      if (!t.headers.length || !t.rows.length) throw new Error('no rows found');
      data = { kind: 'file', name: files[0].name, headers: t.headers, rows: t.rows, map: L.detectColumns(t.headers) };
      save(); showMapping(); B.toast('Loaded ' + files[0].name + ' — check the columns, then Analyse');
    }).catch(function (e) { B.toast('Could not read that file: ' + e.message, 4000); });
  }, { accept: '.csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods,.json' });
  function showMapping() {
    if (!data || data.kind !== 'file') { $('#mapPanel').hidden = true; $('#fileInfo').textContent = ''; return; }
    $('#fileInfo').textContent = data.name + ' · ' + B.fmt.num(data.rows.length, 0) + ' rows';
    $('#mapPanel').hidden = false;
    var g = $('#mapGrid'); g.innerHTML = '';
    L.FIELDS.forEach(function (f) {
      var id = 'map-' + f.key, sel = B.h('select', { id: id });
      sel.appendChild(B.h('option', { value: '', text: f.required ? '— choose —' : '— not in my file —' }));
      data.headers.forEach(function (h) { sel.appendChild(B.h('option', { value: h, text: h, selected: data.map[f.key] === h ? true : null })); });
      sel.addEventListener('change', function () { data.map[f.key] = sel.value; save(); });
      g.appendChild(B.h('div', {}, [B.h('label', { for: id, text: f.label + (f.required ? ' *' : '') }), sel]));
    });
  }
  $('#analyseFile').addEventListener('click', function () {
    if (!data || data.kind !== 'file') return;
    if (!data.map.text) { $('#msg').textContent = 'Choose the column with the review text.'; return; }
    if (run(true)) showTab('overview');
  });
  $('#analysePaste').addEventListener('click', function () {
    var t = $('#paste').value; if (!L.fromPaste(t).length) { B.toast('Paste some reviews first'); return; }
    data = { kind: 'paste', text: t }; save(); showMapping(); if (run(true)) showTab('overview');
  });

  function reviews() { return data.kind === 'paste' ? L.fromPaste(data.text) : L.fromTable(data.rows, data.map); }
  function run(loud) {
    if (!data) return false;
    var list = reviews(); if (!list.length) { B.toast('No reviews with text found'); return false; }
    res = L.analyse(list, settings.mode);
    $('#msg').textContent = res.n + ' reviews analysed.';
    renderOverview(); renderThemes(); renderTrends(); renderProducts(); renderReplies(); renderReviews();
    if (loud) B.toast(res.n + ' reviews analysed'); return true;
  }

  // ---------- overview ----------
  function renderOverview() {
    var c = res.counts, top = res.complaints.slice(0, 3), praise = res.praise.slice(0, 3);
    var html = '<div class="stat-row">' + stat(B.fmt.num(res.n, 0), 'Reviews') + stat(res.avgRating == null ? '–' : res.avgRating.toFixed(2) + ' ★', 'Average rating') +
      stat(pct(c.positive / res.n), 'Positive') + stat(pct(c.mixed / res.n), 'Mixed / neutral') + stat(pct(c.negative / res.n), 'Negative') + '</div>';
    html += '<div class="cols-2"><div class="panel"><h3 style="margin-top:0">Top complaints</h3>' +
      (top.length ? '<ol>' + top.map(function (t) { return '<li><b>' + B.esc(t.name) + '</b> — ' + t.negative + ' review' + (t.negative === 1 ? '' : 's') + ' (' + pct(t.share) + ')</li>'; }).join('') + '</ol>' : '<p>No recurring complaints found.</p>') +
      '</div><div class="panel"><h3 style="margin-top:0">What customers love</h3>' +
      (praise.length ? '<ol>' + praise.map(function (t) { return '<li><b>' + B.esc(t.name) + '</b> — ' + t.positive + ' review' + (t.positive === 1 ? '' : 's') + '</li>'; }).join('') + '</ol>' : '<p>No clear praise themes yet.</p>') + '</div></div>';
    if (res.emerging.length) html += '<div class="panel"><h3 style="margin-top:0">⚠ Getting worse lately</h3><ul>' + res.emerging.map(function (e) {
      return '<li><b>' + B.esc(e.name) + '</b>: ' + pct(e.recentShare) + ' of reviews in ' + e.from + (e.to !== e.from ? ' to ' + e.to : '') + ' complain about it, up from ' + pct(e.priorShare) + ' in the four months before (' + e.recentCount + ' reviews).</li>';
    }).join('') + '</ul></div>';
    if (res.ideas.length) html += '<div class="panel"><h3 style="margin-top:0">Improvement ideas</h3><ul>' + res.ideas.slice(0, 6).map(function (i) {
      return '<li>' + (i.product ? '<b>' + B.esc(i.product) + '</b> · ' : '') + '<b>' + B.esc(i.theme) + '</b> (' + i.count + ' complaints): ' + B.esc(i.text) + '</li>';
    }).join('') + '</ul></div>';
    html += '<div class="row no-print"><button class="btn primary" id="dlReport" type="button">Download report (HTML)</button><button class="btn" id="printReport" type="button">Printable report</button><button class="btn" id="dlCsv" type="button">Scored reviews (CSV)</button></div><div id="aiBox" class="no-print" style="margin-top:10px"></div><div id="aiOut"></div>';
    html += '<p class="small muted">' + (data.kind === 'paste' ? 'Pasted reviews have no dates, so trends are not available.' : '') + '</p>';
    $('#ovOut').innerHTML = html;
    $('#dlReport').addEventListener('click', function () { B.download('review-insights.html', reportHtml(), 'text/html;charset=utf-8'); });
    $('#printReport').addEventListener('click', function () { printHtml(reportHtml()); });
    $('#dlCsv').addEventListener('click', downloadCsv);
    if (B.ai) {
      B.ai.note($('#aiBox'));
      B.ai.button($('#aiBox'), 'Write a short action plan', function () {
        return 'You are helping a small ' + (res.mode === 'product' ? 'online shop' : 'service business') + ' act on customer reviews. Findings (computed from ' + res.n + ' reviews):\n' +
          'Top complaints: ' + res.complaints.slice(0, 5).map(function (t) { return t.name + ' (' + t.negative + ' reviews; e.g. "' + (t.quotesNeg[0] ? t.quotesNeg[0].sentence : '') + '")'; }).join('; ') + '\n' +
          'Praise: ' + res.praise.slice(0, 3).map(function (t) { return t.name + ' (' + t.positive + ')'; }).join('; ') + '\n' +
          'Getting worse: ' + (res.emerging.map(function (e) { return e.name; }).join(', ') || 'none') + '\n' +
          'Write a 5-point action plan in plain Australian English, most impactful first, each point one or two sentences. Only use the findings given.';
      }, function (ans) { $('#aiOut').innerHTML = '<div class="panel"><h3 style="margin-top:0">AI action plan (check before using)</h3><div style="white-space:pre-wrap">' + B.esc(ans) + '</div></div>'; });
    }
  }

  // ---------- themes ----------
  function quote(m, cls) { return '<blockquote class="quote ' + cls + '">“' + B.esc(m.sentence) + '”<cite>' + stars(m.review.rating) + ' ' + B.esc(m.review.author || '') + (m.review.product ? ' · ' + B.esc(m.review.product) : '') + (m.review.date ? ' · ' + fdate(m.review.date) : '') + '</cite></blockquote>'; }
  function renderThemes() {
    var html = '<h2>Recurring complaints</h2><p class="small muted">Ranked by number of complaining reviews × how negative they are.</p>';
    html += res.complaints.length ? res.complaints.map(function (t) {
      return '<div class="panel theme"><h3>' + B.esc(t.name) + ' <span class="pill-bad">' + t.negative + ' complaints</span>' + (t.positive ? ' <span class="pill-ok">' + t.positive + ' praise</span>' : '') + '</h3>' +
        '<p class="small muted">' + pct(t.share) + ' of all reviews · negativity ' + t.negativity.toFixed(2) + '</p>' + t.quotesNeg.map(function (m) { return quote(m, 'neg'); }).join('') +
        '<p class="small"><b>Idea:</b> ' + B.esc(t.idea) + '</p></div>';
    }).join('') : '<p>No recurring complaints found.</p>';
    html += '<h2>Praise</h2>' + (res.praise.length ? res.praise.map(function (t) {
      return '<div class="panel theme"><h3>' + B.esc(t.name) + ' <span class="pill-ok">' + t.positive + ' reviews</span></h3>' + t.quotesPos.map(function (m) { return quote(m, 'pos'); }).join('') + '</div>';
    }).join('') : '<p>No clear praise themes yet.</p>');
    function phr(list) { return list.length ? '<p>' + list.map(function (p) { return '<span class="tag">' + B.esc(p.phrase) + ' · ' + p.count + '</span>'; }).join(' ') + '</p>' : '<p class="small muted">None repeated often enough.</p>'; }
    html += '<div class="cols-2"><div class="panel"><h3 style="margin-top:0">Phrases repeated in negative reviews</h3>' + phr(res.negPhrases) + '</div><div class="panel"><h3 style="margin-top:0">Phrases repeated in positive reviews</h3>' + phr(res.posPhrases) + '</div></div>';
    $('#thOut').innerHTML = html;
  }

  // ---------- trends ----------
  function renderTrends() {
    var out = $('#trOut');
    if (!res.months.length) { out.innerHTML = '<div class="panel"><p>No dates found, so trends can\'t be shown. Import a file with a date column.</p></div>'; return; }
    var ms = res.months.slice(-18), themes = L.themesFor(res.mode).filter(function (t) { return ms.some(function (m) { return m.themes[t.id]; }); });
    var maxCount = 1; ms.forEach(function (m) { themes.forEach(function (t) { maxCount = Math.max(maxCount, m.themes[t.id] || 0); }); });
    var html = '<div class="panel"><h3 style="margin-top:0">Reviews per month and share negative</h3>' + monthChart(ms) + '</div>';
    if (res.emerging.length) html += '<div class="panel"><h3 style="margin-top:0">Emerging issues</h3>' + B.table(res.emerging, [{ key: 'name', label: 'Theme' },
      { key: 'recentShare', label: 'Last 2 months', fmt: function (v, e) { return pct(v) + ' <span class="small muted">(' + e.recentCount + ')</span>'; } },
      { key: 'priorShare', label: '4 months before', fmt: function (v, e) { return pct(v) + ' <span class="small muted">(' + e.priorCount + ')</span>'; } },
      { key: 'growth', label: 'Change', fmt: function (v) { return v == null ? 'new' : '×' + v.toFixed(1); } }]) + '</div>';
    else html += '<p class="small muted">No complaint theme has grown sharply in the last two months.</p>';
    html += '<div class="panel"><h3 style="margin-top:0">Complaints by theme and month</h3><div class="table-wrap"><table class="heat"><thead><tr><th>Theme</th>' + ms.map(function (m) { return '<th class="c">' + m.month.slice(2) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      themes.map(function (t) { return '<tr><td>' + B.esc(t.name) + '</td>' + ms.map(function (m) { var v = m.themes[t.id] || 0; return '<td class="c" style="background:color-mix(in srgb,var(--bad) ' + Math.round(v / maxCount * 55) + '%,transparent)">' + (v || '') + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div><p class="small muted">Number of reviews complaining about each theme. Darker = more.</p></div>';
    out.innerHTML = html;
  }
  function monthChart(ms) {
    var W = 640, H = 200, pl = 34, pr = 34, pt = 10, pb = 26, n = ms.length, maxN = Math.max.apply(null, ms.map(function (m) { return m.n; }).concat([1]));
    var bw = (W - pl - pr) / n, s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto" role="img" aria-label="Reviews per month with share negative">';
    for (var g = 0; g <= 4; g++) { var y = pt + (H - pt - pb) * g / 4; s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '" style="stroke:var(--line)"/><text x="' + (pl - 4) + '" y="' + (y + 4) + '" text-anchor="end" style="font:11px var(--font);fill:var(--muted)">' + Math.round(maxN * (4 - g) / 4) + '</text><text x="' + (W - pr + 4) + '" y="' + (y + 4) + '" style="font:11px var(--font);fill:var(--bad)">' + (100 - g * 25) + '%</text>'; }
    var pts = [];
    ms.forEach(function (m, i) {
      var x = pl + i * bw, h = (H - pt - pb) * m.n / maxN;
      s += '<rect x="' + (x + bw * 0.15) + '" y="' + (H - pb - h) + '" width="' + (bw * 0.7) + '" height="' + h + '" rx="2" style="fill:color-mix(in srgb,var(--brand) 55%,transparent)"><title>' + m.month + ': ' + m.n + ' reviews</title></rect>';
      if (i % Math.ceil(n / 9) === 0) s += '<text x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" style="font:11px var(--font);fill:var(--muted)">' + m.month.slice(2) + '</text>';
      if (m.negShare != null) pts.push((x + bw / 2).toFixed(1) + ',' + (pt + (H - pt - pb) * (1 - m.negShare)).toFixed(1));
    });
    s += '<polyline points="' + pts.join(' ') + '" style="fill:none;stroke:var(--bad);stroke-width:2"/>';
    return s + '</svg><p class="small muted">Bars: number of reviews (left scale). Red line: share that are negative (right scale).</p>';
  }

  // ---------- products ----------
  function renderProducts() {
    var out = $('#prOut');
    if (!res.products.length) { out.innerHTML = '<div class="panel"><p>No product, SKU or location column was found. ' + (res.mode === 'product' ? 'Map a product column on the Import tab to see issues per product.' : 'If you have several locations or services, map that column as "Product / SKU / location" to compare them.') + '</p></div>'; return; }
    var html = '<div class="panel"><h3 style="margin-top:0">Issues by ' + (res.mode === 'product' ? 'product' : 'location / service') + '</h3>' +
      B.table(res.products, [{ key: 'product', label: res.mode === 'product' ? 'Product' : 'Location / service', fmt: function (v) { return '<b>' + B.esc(v) + '</b>'; } }, { key: 'n', label: 'Reviews' },
        { key: 'avgRating', label: 'Avg rating', fmt: function (v) { return v == null ? '–' : v.toFixed(1) + ' ★'; } },
        { key: 'negShare', label: 'Negative', fmt: function (v) { return '<span class="' + (v >= 0.3 ? 'pill-bad' : v >= 0.15 ? 'pill-warn' : 'pill-ok') + '">' + pct(v) + '</span>'; } },
        { key: 'topIssues', label: 'Main complaints', fmt: function (v) { return v.length ? v.map(function (i) { return B.esc(i.name) + ' (' + i.count + ')'; }).join(', ') : '—'; } },
        { key: 'small', label: 'Fit', fmt: function (v, p) { return v || p.large ? (v ? v + ' say small' : '') + (v && p.large ? ', ' : '') + (p.large ? p.large + ' say large' : '') : '–'; } }]) + '</div>';
    if (res.ideas.length) html += '<div class="panel"><h3 style="margin-top:0">Improvement ideas from the complaints</h3>' + B.table(res.ideas, [{ key: 'product', label: 'Product' }, { key: 'theme', label: 'Issue' }, { key: 'count', label: 'Complaints' }, { key: 'text', label: 'Suggested fix' }]) + '</div>';
    out.innerHTML = html;
  }

  // ---------- replies ----------
  function renderReplies() {
    if (!res) return;
    var neg = res.reviews.filter(function (r) { return r.label === 'negative'; }).sort(function (a, b) { return (b.date || 0) - (a.date || 0); });
    var out = $('#rpOut');
    if (!neg.length) { out.innerHTML = '<p>No negative reviews to reply to. 🎉</p>'; return; }
    out.innerHTML = '<p class="small muted">Drafts for the ' + Math.min(30, neg.length) + ' most recent negative reviews' + (neg.length > 30 ? ' (of ' + neg.length + ')' : '') + '. Set your business name and contact on the Import tab. Read and personalise every reply before posting — never paste one blindly.</p>';
    neg.slice(0, 30).forEach(function (r, i) {
      var box = B.h('div', { class: 'panel reply' }), id = 'rep' + i;
      box.innerHTML = '<p class="orig">' + stars(r.rating) + ' <b>' + B.esc(r.author || 'Anonymous') + '</b>' + (r.product ? ' · ' + B.esc(r.product) : '') + (r.date ? ' · ' + fdate(r.date) : '') + '<br>' + B.esc((r.title ? r.title + ' — ' : '') + r.text) + '</p>' +
        '<label for="' + id + '">Reply draft</label><textarea id="' + id + '"></textarea>';
      var ta = box.querySelector('textarea'); ta.value = L.replyDraft(r, res.mode, { business: settings.business, contact: settings.contact });
      var row = B.h('div', { class: 'row no-print', style: 'margin-top:6px' }, [B.h('button', { class: 'btn small', type: 'button', text: 'Copy', onclick: function () { B.copy(ta.value); } })]);
      box.appendChild(row);
      if (B.ai) B.ai.button(row, 'Make it more personal', function () {
        return 'Rewrite this reply to a customer review so it is warm, specific to what they said, under 90 words, plain Australian English, no excuses, no promises we cannot keep. Keep the contact details.\n\nReview: "' + r.text + '"\n\nDraft reply:\n' + ta.value;
      }, function (ans) { ta.value = ans.trim(); });
      out.appendChild(box);
    });
  }

  // ---------- all reviews ----------
  function renderReviews() {
    var out = $('#rvOut'), themes = L.themesFor(res.mode);
    out.innerHTML = '<div class="row no-print" style="margin:10px 0">' +
      '<select id="fLabel" style="width:auto" aria-label="Sentiment"><option value="all">All sentiment</option><option value="negative">Negative</option><option value="mixed">Mixed</option><option value="positive">Positive</option></select>' +
      '<select id="fTheme" style="width:auto" aria-label="Theme"><option value="">Any theme</option>' + themes.map(function (t) { return '<option value="' + t.id + '">' + B.esc(t.name) + '</option>'; }).join('') + '</select>' +
      '<input type="search" id="fQ" placeholder="Search words" style="width:auto;max-width:200px" aria-label="Search reviews">' +
      '<button class="btn" id="dlCsv2" type="button">Download CSV</button></div><div id="rvTable"></div>';
    $('#fLabel').value = settings.filter; $('#fTheme').value = settings.theme; $('#fQ').value = settings.q;
    function draw() {
      settings.filter = $('#fLabel').value; settings.theme = $('#fTheme').value; settings.q = $('#fQ').value.trim(); saveSettings();
      var q = settings.q.toLowerCase();
      var rows = res.reviews.filter(function (r) {
        return (settings.filter === 'all' || r.label === settings.filter) && (!settings.theme || r.mentions.some(function (m) { return m.theme === settings.theme; })) && (!q || (r.title + ' ' + r.text + ' ' + r.author + ' ' + r.product).toLowerCase().indexOf(q) >= 0);
      });
      $('#rvTable').innerHTML = '<p class="small muted">' + rows.length + ' reviews</p>' + B.table(rows, [
        { key: 'date', label: 'Date', fmt: function (v) { return fdate(v); } }, { key: 'rating', label: 'Rating', fmt: function (v) { return stars(v); } },
        { key: 'label', label: 'Sentiment', fmt: function (v) { return LABEL[v]; } },
        { key: 'text', label: 'Review', fmt: function (v, r) { return (r.product ? '<b>' + B.esc(r.product) + '</b>: ' : '') + B.esc((r.title ? r.title + ' — ' : '') + v) + (r.author ? ' <span class="small muted">— ' + B.esc(r.author) + '</span>' : ''); } },
        { key: 'mentions', label: 'Themes', fmt: function (v) { var seen = {}; return v.filter(function (m) { if (m.polarity === 'neutral' || seen[m.theme + m.polarity]) return false; seen[m.theme + m.polarity] = 1; return true; }).map(function (m) { return '<span class="' + (m.polarity === 'neg' ? 'pill-bad' : 'pill-ok') + '">' + B.esc(themeName(m.theme)) + '</span>'; }).join(' '); } }
      ], { limit: 300 });
    }
    ['fLabel', 'fTheme'].forEach(function (id) { $('#' + id).addEventListener('change', draw); }); $('#fQ').addEventListener('input', draw);
    $('#dlCsv2').addEventListener('click', downloadCsv);
    draw();
  }
  function downloadCsv() { var rows = L.reviewRows(res); B.download('scored-reviews.csv', B.csv.stringify(rows, Object.keys(rows[0])), 'text/csv;charset=utf-8'); }

  // ---------- report ----------
  function reportHtml() {
    var e = B.esc, c = res.counts;
    var h = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Review insights</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:28px;color:#111;max-width:900px}h1{font-size:22px}h2{font-size:17px;margin-top:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f1ede4}blockquote{border-left:3px solid #b42318;margin:4px 0;padding-left:10px;color:#333}</style></head><body>' +
      '<h1>' + e(settings.business || 'Review') + ' insights</h1><p>' + res.n + ' reviews' + (res.avgRating != null ? ' · average ' + res.avgRating.toFixed(2) + ' ★' : '') + ' · ' + pct(c.positive / res.n) + ' positive, ' + pct(c.negative / res.n) + ' negative · generated ' + new Date().toLocaleDateString('en-AU') + '</p>';
    h += '<h2>Recurring complaints</h2><table><thead><tr><th>Theme</th><th>Reviews</th><th>Share</th><th>Example</th><th>Idea</th></tr></thead><tbody>' + res.complaints.map(function (t) {
      return '<tr><td>' + e(t.name) + '</td><td>' + t.negative + '</td><td>' + pct(t.share) + '</td><td>' + (t.quotesNeg[0] ? '“' + e(t.quotesNeg[0].sentence) + '”' : '') + '</td><td>' + e(t.idea) + '</td></tr>';
    }).join('') + '</tbody></table>';
    if (res.emerging.length) h += '<h2>Getting worse lately</h2><ul>' + res.emerging.map(function (x) { return '<li>' + e(x.name) + ': ' + pct(x.recentShare) + ' of recent reviews vs ' + pct(x.priorShare) + ' before</li>'; }).join('') + '</ul>';
    h += '<h2>What customers love</h2><ul>' + res.praise.slice(0, 5).map(function (t) { return '<li>' + e(t.name) + ' (' + t.positive + ')' + (t.quotesPos[0] ? ' — “' + e(t.quotesPos[0].sentence) + '”' : '') + '</li>'; }).join('') + '</ul>';
    if (res.products.length) h += '<h2>By product / location</h2><table><thead><tr><th>Name</th><th>Reviews</th><th>Avg rating</th><th>Negative</th><th>Main complaints</th></tr></thead><tbody>' + res.products.map(function (p) {
      return '<tr><td>' + e(p.product) + '</td><td>' + p.n + '</td><td>' + (p.avgRating == null ? '' : p.avgRating.toFixed(1)) + '</td><td>' + pct(p.negShare) + '</td><td>' + e(p.topIssues.map(function (i) { return i.name + ' (' + i.count + ')'; }).join(', ')) + '</td></tr>';
    }).join('') + '</tbody></table>';
    if (res.ideas.length) h += '<h2>Improvement ideas</h2><ul>' + res.ideas.slice(0, 10).map(function (i) { return '<li>' + (i.product ? '<b>' + e(i.product) + '</b> · ' : '') + e(i.theme) + ': ' + e(i.text) + '</li>'; }).join('') + '</ul>';
    return h + '<p style="font-size:11px;color:#555">Sentiment and themes are worked out from word lists and patterns, so treat counts as a guide and read the quotes.</p></body></html>';
  }
  function printHtml(html) {
    var f = B.h('iframe', { style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0', title: 'print' }); document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(function () { f.remove(); }, 1000); }, 200);
  }

  // ---------- sample, backup ----------
  var showTab;
  $('#sample').addEventListener('click', function () {
    if (data && !confirm('Replace your reviews with sample data?')) return;
    var s = L.sampleData(settings.mode);
    data = { kind: 'file', name: settings.mode === 'product' ? 'sample-activewear-shop-reviews.csv' : 'sample-hair-salon-google-reviews.csv', headers: s.headers, rows: s.rows, map: L.detectColumns(s.headers) };
    save(); showMapping(); run(false); showTab('overview');
    B.toast('Sample loaded — made-up ' + (settings.mode === 'product' ? 'activewear shop' : 'hair salon') + ' reviews. Switch the business type for the other sample.', 3500);
  });
  $('#backup').addEventListener('click', function () {
    if (!data) { B.toast('Nothing to back up yet'); return; }
    B.download('feedback-miner-backup.json', JSON.stringify({ app: 'feedback-miner', version: 1, data: data, settings: settings }), 'application/json');
  });
  $('#restore').addEventListener('click', function () {
    var inp = B.h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', function () {
      if (!inp.files[0]) return;
      B.readFile(inp.files[0]).then(function (t) {
        var j = JSON.parse(t); if (!j || j.app !== 'feedback-miner' || !j.data) throw new Error('not a Feedback Miner backup');
        data = j.data; settings = Object.assign(settings, j.settings || {}); save(); saveSettings();
        B.$$('input[name=mode]').forEach(function (r) { r.checked = r.value === settings.mode; }); $('#biz').value = settings.business; $('#contact').value = settings.contact;
        if (data.kind === 'paste') $('#paste').value = data.text; showMapping(); run(false); B.toast('Backup restored');
      }).catch(function (e) { B.toast('Could not restore: ' + e.message, 4000); });
    });
    inp.click();
  });
  $('#clearAll').addEventListener('click', function () {
    if (!confirm('Delete the reviews and settings saved in this browser?')) return;
    B.store.remove(KEY); B.store.remove(SKEY); data = null; res = null; $('#paste').value = '';
    showMapping(); ['#ovOut', '#thOut', '#trOut', '#prOut', '#rpOut', '#rvOut'].forEach(function (s) { $(s).innerHTML = '<p class="muted">Import reviews first.</p>'; }); B.toast('Cleared');
  });

  showTab = B.tabs($('.tabs'));
  if (data && data.kind === 'paste') $('#paste').value = data.text;
  showMapping();
  if (data) run(false);
})();
