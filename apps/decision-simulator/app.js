/* Decision Simulator — page wiring. Logic lives in lib.js (DecisionLib). */
(function () {
  'use strict';
  var L = window.DecisionLib, $ = B.$, esc = B.esc, money = L.money;
  var KEY = 'decisions:data';
  var COLORS = ['var(--brand)', 'var(--accent)', 'var(--ok)', 'var(--warn)', 'var(--muted)'];
  var store = B.store.get(KEY, null) || { decisions: [], current: null };
  var cur = null, result = null, showTab, saveTimer = null, tornadoPick = 0;

  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function save() { if (!B.store.set(KEY, store)) B.toast('Could not save — browser storage may be full. Export a copy.', 4000); }
  function saveSoon() { result = null; clearTimeout(saveTimer); saveTimer = setTimeout(function () { save(); renderPicker(); }, 400); }
  function find(id) { return store.decisions.filter(function (d) { return d.id === id; })[0]; }
  function select(id) { cur = find(id) || store.decisions[0] || null; store.current = cur ? cur.id : null; result = null; save(); renderAll(); }
  function add(d) { store.decisions.unshift(d); select(d.id); }
  function color(i) { return COLORS[i % COLORS.length]; }

  // ---------- decision picker ----------
  function renderPicker() {
    var p = $('#pick');
    p.innerHTML = store.decisions.length ? store.decisions.map(function (d) { return '<option value="' + esc(d.id) + '"' + (cur && d.id === cur.id ? ' selected' : '') + '>' + esc(d.title || 'Untitled decision') + '</option>'; }).join('') : '<option value="">No decisions yet</option>';
  }

  // ---------- setup: options editor ----------
  function setPath(obj, path, val) {
    var ks = path.split('.'), o = obj;
    for (var i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = val;
  }
  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj); }
  function inp(path, type, label, extra) {
    var v = getPath(cur, path); if (v == null) v = '';
    return '<input type="' + (type || 'number') + '" data-k="' + path + '" aria-label="' + esc(label) + '" value="' + esc(v) + '"' + (extra || '') + '>';
  }
  function rngRow(title, base, hint) {
    return '<div class="rng"><div><label>' + esc(title) + '</label><span class="small muted">' + esc(hint || '') + '</span></div>' +
      ['low', 'likely', 'high'].map(function (k) { return '<div><label>' + (k === 'low' ? 'Low' : k === 'likely' ? 'Likely' : 'High') + '</label>' + inp(base + '.' + k, 'number', title + ' ' + k, ' step="any"') + '</div>'; }).join('') + '</div>';
  }
  function renderOptions() {
    var box = $('#options');
    if (!cur) { box.innerHTML = '<div class="panel"><p>No decision yet. Press <b>Load sample data</b>, pick a template, or start a blank decision.</p></div>'; return; }
    box.innerHTML = cur.options.map(function (o, i) {
      var p = 'options.' + i;
      return '<div class="panel opt" style="--c:' + color(i) + '">' +
        '<div class="row" style="justify-content:space-between"><h3><span class="sw"></span>Option ' + (i + 1) + '</h3>' +
        (cur.options.length > 1 ? '<button class="btn small" type="button" data-rm-opt="' + i + '">Remove option</button>' : '') + '</div>' +
        '<label>Name</label>' + inp(p + '.name', 'text', 'Option name') +
        rngRow('One-off cost (AUD)', p + '.oneOff', 'set-up, purchase, fit-out') +
        rngRow('Months until benefits start', p + '.delay', 'e.g. hiring or build time') +
        '<div class="rng"><div><label>Months to reach full benefit</label><span class="small muted">0 = full benefit straight away</span></div><div>' + inp(p + '.ramp', 'number', 'Ramp-up months', ' min="0" step="1"') + '</div></div>' +
        '<h3>Monthly costs and benefits (AUD per month)</h3>' +
        '<div class="ln ln-head"><span>What</span><span>Type</span><span>Low</span><span>Likely</span><span>High</span><span></span></div>' +
        (o.lines || []).map(function (l, j) {
          var q = p + '.lines.' + j;
          return '<div class="ln">' + inp(q + '.label', 'text', 'Line description', ' placeholder="e.g. Wages, extra sales"') +
            '<select data-k="' + q + '.kind" aria-label="Cost or benefit"><option value="cost"' + (l.kind !== 'benefit' ? ' selected' : '') + '>Cost</option><option value="benefit"' + (l.kind === 'benefit' ? ' selected' : '') + '>Benefit</option></select>' +
            inp(q + '.low', 'number', 'Low', ' step="any" placeholder="Low"') + inp(q + '.likely', 'number', 'Likely', ' step="any" placeholder="Likely"') + inp(q + '.high', 'number', 'High', ' step="any" placeholder="High"') +
            '<button class="btn small" type="button" data-rm-line="' + i + ':' + j + '" aria-label="Remove line">✕</button></div>';
        }).join('') +
        '<button class="btn small" type="button" data-add-line="' + i + '">+ Add a monthly line</button>' +
        '<h3>Risks (one-off hits if they happen)</h3>' +
        ((o.risks || []).length ? '<div class="rk ln-head"><span>Risk</span><span>Chance %</span><span>Cost low</span><span>Likely</span><span>High</span><span></span></div>' : '<p class="small muted">No risks yet. Add what could go wrong and roughly what it would cost.</p>') +
        (o.risks || []).map(function (r, j) {
          var q = p + '.risks.' + j;
          return '<div class="rk">' + inp(q + '.label', 'text', 'Risk description', ' placeholder="What could go wrong"') + inp(q + '.prob', 'number', 'Chance in percent', ' min="0" max="100" step="1"') +
            inp(q + '.impact.low', 'number', 'Cost if it happens, low', ' step="any"') + inp(q + '.impact.likely', 'number', 'Cost if it happens, likely', ' step="any"') + inp(q + '.impact.high', 'number', 'Cost if it happens, high', ' step="any"') +
            '<button class="btn small" type="button" data-rm-risk="' + i + ':' + j + '" aria-label="Remove risk">✕</button></div>';
        }).join('') +
        '<button class="btn small" type="button" data-add-risk="' + i + '">+ Add a risk</button>' +
        (o.note ? '<p class="small muted">' + esc(o.note) + '</p>' : '') +
        '</div>';
    }).join('');
    $('#addOption').disabled = cur.options.length >= 5;
  }
  function renderHead() {
    B.$$('[data-k]', $('[data-panel="setup"] .panel')).forEach(function (el) { var v = cur ? cur[el.dataset.k] : ''; el.value = v == null ? '' : v; el.disabled = !cur; });
  }

  // ---------- criteria ----------
  function renderCriteria() {
    if (!cur) { $('#critList').innerHTML = ''; $('#scoreGrid').innerHTML = ''; return; }
    cur.criteria = cur.criteria || [];
    $('#critList').innerHTML = cur.criteria.length ? '<div class="crit-row ln-head"><span>Factor</span><span>Weight 0–5</span><span></span></div>' + cur.criteria.map(function (c, i) {
      return '<div class="crit-row">' + inp('criteria.' + i + '.name', 'text', 'Factor name') + inp('criteria.' + i + '.weight', 'number', 'Weight', ' min="0" max="5" step="1"') +
        '<button class="btn small" type="button" data-rm-crit="' + i + '" aria-label="Remove factor">✕</button></div>';
    }).join('') : '<p class="small muted">No factors yet.</p>';
    if (!cur.criteria.length) { $('#scoreGrid').innerHTML = ''; return; }
    $('#scoreGrid').innerHTML = '<div class="panel"><h3 style="margin-top:0">Score each option (0 = poor, 10 = excellent)</h3><div class="table-wrap scores"><table><thead><tr><th>Factor</th>' +
      cur.options.map(function (o, i) { return '<th><span class="sw" style="--c:' + color(i) + '"></span>' + esc(o.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      cur.criteria.map(function (c) {
        return '<tr><td>' + esc(c.name) + '</td>' + cur.options.map(function (o, i) {
          return '<td><input type="number" min="0" max="10" step="1" data-k="options.' + i + '.scores.' + esc(c.id) + '" aria-label="' + esc(o.name + ' — ' + c.name) + '" value="' + esc((o.scores || {})[c.id] == null ? '' : o.scores[c.id]) + '"></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  // ---------- results ----------
  function analyse() {
    if (!cur) return null;
    var t0 = performance.now();
    result = L.analyse(cur);
    $('#runInfo').textContent = result.sim.runs.toLocaleString('en-AU') + ' runs in ' + Math.round(performance.now() - t0) + ' ms · seed ' + result.sim.seed;
    return result;
  }
  function niceTicks(lo, hi, n) {
    var span = hi - lo || 1, step = Math.pow(10, Math.floor(Math.log10(span / n))), err = span / n / step;
    step *= err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    var out = []; for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v); return out;
  }
  function chartW() { var w = ($('#results') && $('#results').clientWidth) || 640; return Math.max(300, Math.min(900, w - 34)); } // draw at real size so labels stay readable
  function short(n) { var a = Math.abs(n); return (n < 0 ? '−' : '') + '$' + (a >= 1e6 ? (a / 1e6).toFixed(1) + 'm' : a >= 1e3 ? Math.round(a / 1e3) + 'k' : Math.round(a)); }
  function cashChart(res) {
    var W = chartW(), Hh = W < 500 ? 220 : 260, P = { l: 52, r: 12, t: 12, b: 28 }, H = res.base[0].cumulative.length - 1;
    var all = []; res.base.forEach(function (b) { all = all.concat(b.cumulative); });
    var lo = Math.min(0, Math.min.apply(null, all)), hi = Math.max(0, Math.max.apply(null, all)); if (hi === lo) hi = lo + 1;
    var x = function (t) { return P.l + t / H * (W - P.l - P.r); }, y = function (v) { return P.t + (hi - v) / (hi - lo) * (Hh - P.t - P.b); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Running cash total for each option, likely case">';
    niceTicks(lo, hi, W < 500 ? 3 : 5).forEach(function (v) { s += '<line class="axis" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"' + (v === 0 ? ' style="stroke:var(--muted)"' : '') + '/><text x="' + (P.l - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + short(v) + '</text>'; });
    for (var t = 0; t <= H; t += (H > 60 && W < 500 ? 24 : 12)) s += '<text x="' + x(t) + '" y="' + (Hh - 8) + '" text-anchor="middle">' + (t === 0 ? 'Start' : 'Yr ' + t / 12) + '</text>';
    res.base.forEach(function (b, i) {
      s += '<polyline fill="none" stroke-width="2.5" style="stroke:' + color(i) + '" points="' + b.cumulative.map(function (v, t) { return x(t).toFixed(1) + ',' + y(v).toFixed(1); }).join(' ') + '"/>';
    });
    return s + '</svg>';
  }
  function rangeChart(res) {
    var W = chartW(), row = 34, P = { l: 12, r: 12, t: 8, b: 26 }, os = res.sim.options, Hh = P.t + P.b + row * os.length;
    var lo = Math.min(0, Math.min.apply(null, os.map(function (o) { return o.p10; }))), hi = Math.max(0, Math.max.apply(null, os.map(function (o) { return o.p90; }))); if (hi === lo) hi = lo + 1;
    var x = function (v) { return P.l + (v - lo) / (hi - lo) * (W - P.l - P.r); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Range of outcomes for each option (P10 to P90, with the middle P50)">';
    niceTicks(lo, hi, W < 500 ? 3 : 5).forEach(function (v) { s += '<line class="axis" x1="' + x(v) + '" x2="' + x(v) + '" y1="' + P.t + '" y2="' + (Hh - P.b) + '"' + (v === 0 ? ' style="stroke:var(--muted)"' : '') + '/><text x="' + x(v) + '" y="' + (Hh - 8) + '" text-anchor="middle">' + short(v) + '</text>'; });
    os.forEach(function (o, i) {
      var yy = P.t + i * row + row / 2;
      s += '<rect x="' + x(o.p10) + '" y="' + (yy - 7) + '" width="' + Math.max(2, x(o.p90) - x(o.p10)) + '" height="14" rx="4" style="fill:' + color(i) + ';opacity:.35"/>' +
        '<rect x="' + (x(o.p50) - 2) + '" y="' + (yy - 11) + '" width="4" height="22" style="fill:' + color(i) + '"/>';
    });
    return s + '</svg>';
  }
  function tornadoHtml(t) {
    if (!t.items.length) return '<p class="small muted">All inputs for this option are single numbers (low = likely = high), so nothing to compare.</p>';
    var items = t.items.slice(0, 8), lo = t.base, hi = t.base;
    items.forEach(function (it) { lo = Math.min(lo, it.npvAtLow, it.npvAtHigh); hi = Math.max(hi, it.npvAtLow, it.npvAtHigh); });
    var span = hi - lo || 1, pos = function (v) { return (v - lo) / span * 100; };
    return '<p class="small muted">Likely-case NPV: <b>' + money(t.base) + '</b>. Each bar shows NPV when that one input is at its low end and its high end (risks: does or doesn\'t happen). <span style="color:var(--bad)">■</span> lowers the result, <span style="color:var(--ok)">■</span> raises it.</p><div class="torn">' +
      items.map(function (it) {
        var a = Math.min(it.npvAtLow, it.npvAtHigh), b = Math.max(it.npvAtLow, it.npvAtHigh);
        return '<span title="' + esc(it.label) + '">' + esc(it.label) + '<br><span class="muted">' + money(it.npvAtLow) + ' ↔ ' + money(it.npvAtHigh) + '</span></span><div class="bar">' +
          '<span class="lo" style="left:' + pos(a) + '%;width:' + Math.max(0, pos(t.base) - pos(a)) + '%"></span>' +
          '<span class="hi" style="left:' + pos(t.base) + '%;width:' + Math.max(0, pos(b) - pos(t.base)) + '%"></span>' +
          '<i class="mid" style="left:' + pos(t.base) + '%"></i></div>';
      }).join('') + '</div>';
  }
  function renderResults() {
    var box = $('#results');
    if (!cur) { box.innerHTML = '<div class="panel"><p>No decision yet.</p></div>'; return; }
    if (cur.options.length < 1) { box.innerHTML = '<div class="panel"><p>Add at least one option.</p></div>'; return; }
    var res = result || analyse(), rec = res.recommendation, H = res.base[0].flows.length - 1, Y = Math.ceil(H / 12);
    var legend = '<div class="legend">' + cur.options.map(function (o, i) { return '<span><span class="sw" style="--c:' + color(i) + '"></span>' + esc(o.name) + '</span>'; }).join('') + '</div>';
    var h = '<div class="panel rec"><p class="headline">' + esc(rec.headline) + '</p><ul>' + rec.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' +
      (rec.caveats.length ? '<p class="warn" style="margin-bottom:4px"><b>Watch out</b></p><ul>' + rec.caveats.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '') +
      '<details><summary class="small">Assumptions behind this</summary><ul class="small">' + rec.assumptions.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></details></div>';
    h += '<h2>Range of outcomes (net present value)</h2><p class="small muted">Shaded bar: 8 in 10 simulated outcomes (P10 to P90). Solid mark: the middle outcome (P50).</p>' + legend + '<div class="panel chart">' + rangeChart(res) + '</div>';
    h += B.table(res.sim.options.map(function (o) { return o; }), [
      { key: 'name', label: 'Option' },
      { key: 'p10', label: 'Pessimistic P10', fmt: function (v) { return '<span class="' + (v < 0 ? 'bad' : '') + '">' + money(v) + '</span>'; } },
      { key: 'p50', label: 'Middle P50', fmt: function (v) { return '<b>' + money(v) + '</b>'; } },
      { key: 'p90', label: 'Optimistic P90', fmt: function (v) { return money(v); } },
      { key: 'probBest', label: 'Chance best', fmt: function (v) { return Math.round(v * 100) + '%'; } },
      { key: 'probLoss', label: 'Chance of loss', fmt: function (v) { return '<span class="' + (v > 0.25 ? 'bad' : v > 0.1 ? 'warn' : '') + '">' + Math.round(v * 100) + '%</span>'; } }
    ]);
    if (cur.options.length > 1) h += '<h3>Chance each option comes out best</h3>' + B.barChart(res.sim.options.map(function (o, i) { return { label: o.name, value: o.probBest * 100, color: color(i) }; }), { fmt: function (v) { return Math.round(v) + '%'; } });
    h += '<h2>Cash over time (likely case)</h2><p class="small muted">Running total of money in minus money out, not discounted. Where a line crosses zero is the payback month.</p>' + legend + '<div class="panel chart">' + cashChart(res) + '</div>';
    var rows = L.cashTable(cur, res), cols = [{ key: 'name', label: 'Option' }, { key: 'upfront', label: 'Up-front', fmt: function (v) { return money(v); } }];
    for (var y = 1; y <= Y; y++) cols.push({ key: 'y' + y, label: 'Year ' + y, fmt: function (v) { return money(v); } });
    cols.push({ key: 'total', label: 'Total', fmt: function (v) { return '<b>' + money(v) + '</b>'; } }, { key: 'npv', label: 'NPV', fmt: function (v) { return money(v); } }, { key: 'payback', label: 'Payback', fmt: function (v) { return esc(v === null ? 'not within period' : v === 0 ? 'never negative' : 'month ' + v); } });
    h += B.table(rows, cols);
    if (tornadoPick >= cur.options.length) tornadoPick = 0;
    h += '<h2>What moves the result most</h2><div class="row"><label for="tornPick" style="margin:0">Option</label><select id="tornPick" style="width:auto;max-width:100%">' + cur.options.map(function (o, i) { return '<option value="' + i + '"' + (i === tornadoPick ? ' selected' : '') + '>' + esc(o.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="panel" id="tornBox">' + tornadoHtml(res.tornado[tornadoPick]) + '</div>';
    var cs = res.criteria.filter(function (c) { return c.score != null; });
    if (cs.length) h += '<h2>Other factors (weighted score out of 100)</h2>' + B.barChart(cs.map(function (c) { var i = res.criteria.indexOf(c); return { label: c.name, value: c.score, color: color(i) }; }), { fmt: function (v) { return Math.round(v) + '/100'; } });
    box.innerHTML = h;
    $('#tornPick').addEventListener('change', function () { tornadoPick = +this.value; $('#tornBox').innerHTML = tornadoHtml(res.tornado[tornadoPick]); });
  }

  // ---------- paper ----------
  function paper() { var res = result || analyse(); return L.paperHtml(cur, res, today()); }
  function renderPaper() {
    if (!cur) { $('#paperFrame').srcdoc = '<p style="font-family:sans-serif;padding:20px">No decision yet.</p>'; return; }
    $('#paperFrame').srcdoc = paper();
  }
  function fileBase() { return 'decision-' + (cur.title || 'paper').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50); }

  function renderAll() { renderPicker(); renderHead(); renderOptions(); renderCriteria(); var id = B.store.get('tab:' + location.pathname + 'dec'); if (id === 'results') renderResults(); if (id === 'paper') renderPaper(); }

  // ---------- events ----------
  document.addEventListener('input', function (e) {
    var k = e.target.dataset && e.target.dataset.k; if (!k || !cur) return;
    var v = e.target.type === 'number' ? (e.target.value === '' ? '' : +e.target.value) : e.target.value;
    setPath(cur, k, v);
    if (k === 'title' || /\.name$/.test(k)) { /* labels elsewhere refresh on next render */ }
    saveSoon();
  });
  document.addEventListener('change', function (e) { if (e.target.dataset && e.target.dataset.k && e.target.tagName === 'SELECT') { setPath(cur, e.target.dataset.k, e.target.value); saveSoon(); } });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t || !cur) return;
    var d = t.dataset, ij;
    if (d.rmOpt != null) { if (!confirm('Remove "' + cur.options[+d.rmOpt].name + '"?')) return; cur.options.splice(+d.rmOpt, 1); }
    else if (d.addLine != null) cur.options[+d.addLine].lines.push({ label: '', kind: 'cost', low: 0, likely: 0, high: 0 });
    else if (d.rmLine != null) { ij = d.rmLine.split(':'); cur.options[+ij[0]].lines.splice(+ij[1], 1); }
    else if (d.addRisk != null) { var o = cur.options[+d.addRisk]; o.risks = o.risks || []; o.risks.push({ label: '', prob: 10, impact: { low: 0, likely: 0, high: 0 } }); }
    else if (d.rmRisk != null) { ij = d.rmRisk.split(':'); cur.options[+ij[0]].risks.splice(+ij[1], 1); }
    else if (d.rmCrit != null) { cur.criteria.splice(+d.rmCrit, 1); renderCriteria(); saveSoon(); return; }
    else return;
    renderOptions(); saveSoon();
  });
  $('#addOption').addEventListener('click', function () {
    if (!cur) return; if (cur.options.length >= 5) return B.toast('Up to 5 options');
    cur.options.push(L.blankOption(B.uid, cur.options.length + 1)); renderOptions(); saveSoon();
  });
  $('#addCrit').addEventListener('click', function () { if (!cur) return; cur.criteria = cur.criteria || []; cur.criteria.push({ id: B.uid(), name: 'New factor', weight: 2 }); renderCriteria(); saveSoon(); });
  // keep score grid labels in sync when factor names change
  $('#critList').addEventListener('change', function () { renderCriteria(); });

  var tpl = $('#template');
  tpl.innerHTML = Object.keys(L.TEMPLATE_NAMES).map(function (k) { return '<option value="' + k + '">' + esc(L.TEMPLATE_NAMES[k]) + '</option>'; }).join('');
  $('#useTemplate').addEventListener('click', function () { add(L.fromTemplate(tpl.value, B.uid)); showTab('setup'); B.toast('Template added — change the numbers to yours'); });
  $('#sample').addEventListener('click', function () { add(L.fromTemplate('hireVsAutomate', B.uid)); showTab('results'); B.toast('Sample decision loaded (made-up numbers)'); });
  $('#blank').addEventListener('click', function () {
    var d = { id: B.uid(), title: 'New decision', horizon: 36, discountRate: 8, runs: 5000, seed: 42, notes: '', criteria: [], options: [L.blankOption(B.uid, 1), L.blankOption(B.uid, 2)] };
    add(d); showTab('setup');
  });
  $('#pick').addEventListener('change', function () { select(this.value); });
  $('#dup').addEventListener('click', function () { if (!cur) return; var c = JSON.parse(JSON.stringify(cur)); c.id = B.uid(); c.title = (c.title || 'Decision') + ' (copy)'; add(c); });
  $('#del').addEventListener('click', function () {
    if (!cur || !confirm('Delete "' + (cur.title || 'this decision') + '"? Export it first if you might want it back.')) return;
    store.decisions = store.decisions.filter(function (d) { return d.id !== cur.id; }); select(store.decisions[0] && store.decisions[0].id);
  });
  function exportJson(list, name) { B.download(name, JSON.stringify({ app: 'decision-simulator', version: 1, exported: new Date().toISOString(), decisions: list }, null, 2), 'application/json'); }
  $('#exportOne').addEventListener('click', function () { if (cur) exportJson([cur], fileBase() + '.json'); });
  $('#exportAll').addEventListener('click', function () { if (!store.decisions.length) return B.toast('Nothing to export'); exportJson(store.decisions, 'decisions-' + today() + '.json'); });
  var imp = B.h('input', { type: 'file', accept: '.json,application/json', hidden: true }); document.body.appendChild(imp);
  $('#import').addEventListener('click', function () { imp.click(); });
  imp.addEventListener('change', function () {
    var f = imp.files[0]; imp.value = ''; if (!f) return;
    B.readFile(f).then(function (text) {
      var r = L.importFile(text);
      r.decisions.forEach(function (d) { if (!d.id || find(d.id)) d.id = B.uid(); store.decisions.unshift(d); });
      if (r.decisions.length) select(r.decisions[0].id);
      B.toast('Imported ' + r.decisions.length + ' decision(s)' + (r.errors.length ? ' — skipped: ' + r.errors.join(' ') : ''), 4000);
    }).catch(function (e) { B.toast('Could not import: ' + e.message, 4000); });
  });
  $('#run').addEventListener('click', function () { result = null; renderResults(); B.toast('Simulation finished'); });
  $('#print').addEventListener('click', function () {
    if (!cur) return;
    var f = B.h('iframe', { title: 'Print', style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0' });
    f.addEventListener('load', function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { B.toast('Printing was blocked. Use Download HTML instead.'); } setTimeout(function () { f.remove(); }, 60000); });
    f.srcdoc = paper(); document.body.appendChild(f);
  });
  $('#dlPaper').addEventListener('click', function () { if (cur) B.download(fileBase() + '.html', paper(), 'text/html;charset=utf-8'); });
  $('#dlCsv').addEventListener('click', function () {
    if (!cur) return; var res = result || analyse(), rows = [];
    res.base[0].flows.forEach(function (_, t) { var r = { month: t }; res.base.forEach(function (b) { r[b.name + ' (net)'] = Math.round(b.flows[t]); r[b.name + ' (running total)'] = Math.round(b.cumulative[t]); }); rows.push(r); });
    B.download(fileBase() + '-cashflows.csv', '﻿' + B.csv.stringify(rows, Object.keys(rows[0])), 'text/csv;charset=utf-8');
  });
  function summaryText() {
    var res = result || analyse(), r = res.recommendation;
    return (cur.title || 'Decision') + '\n\n' + r.headline + '\n\n' + r.points.map(function (p) { return '• ' + p; }).join('\n') + (r.caveats.length ? '\n\nWatch out:\n' + r.caveats.map(function (p) { return '• ' + p; }).join('\n') : '') + '\n\nAssumptions:\n' + r.assumptions.map(function (p) { return '• ' + p; }).join('\n');
  }
  $('#copySummary').addEventListener('click', function () { if (cur) B.copy(summaryText()); });

  if (B.ai) {
    B.ai.button($('#aiBox'), 'Challenge my assumptions', function () {
      if (!cur) return null;
      var o = cur.options.map(function (op) {
        return op.name + ': one-off ' + JSON.stringify(op.oneOff) + '; start after ' + JSON.stringify(op.delay) + ' months; monthly lines ' + (op.lines || []).map(function (l) { return l.label + ' (' + l.kind + ') ' + l.low + '/' + l.likely + '/' + l.high; }).join('; ') +
          '; risks ' + (op.risks || []).map(function (r) { return r.label + ' ' + r.prob + '% cost ' + JSON.stringify(r.impact); }).join('; ');
      }).join('\n');
      return 'A small Australian business owner is deciding: "' + cur.title + '". Their options and estimates (AUD, low/likely/high):\n' + o + '\n\nResult summary:\n' + summaryText() +
        '\n\nIn plain English, list up to 6 things they may have missed or estimated optimistically (costs, risks, timing), and 3 questions to answer before deciding. Be concrete and brief. Do not invent facts about their business.';
    }, function (ans) { $('#aiOut').innerHTML = '<div class="panel"><h3 style="margin-top:0">AI suggestions (check them — the AI can be wrong)</h3><div style="white-space:pre-wrap">' + esc(ans) + '</div></div>'; });
  }

  showTab = B.tabs($('.tabs'), function (id) { if (!cur) return; if (id === 'results') renderResults(); if (id === 'paper') renderPaper(); if (id === 'criteria') renderCriteria(); });
  select(store.current);
})();
