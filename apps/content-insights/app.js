/* Content Insights — page wiring. Analysis lives in lib.js (InsightsLib). */
(function () {
  'use strict';
  var L = window.InsightsLib, $ = B.$, KEY = 'content-insights';
  var S = B.store.get(KEY, null) || { datasets: [], metric: 'views', perDay: false, platform: '' };
  var posts = [], pending = null;

  function save() { if (!B.store.set(KEY, S)) B.toast('Browser storage is full — the data works now but will not be remembered.'); }
  function fmtV(v) { return L.fmtM(v, S.metric); }
  function mLabel() { return L.METRICS[S.metric].label + (S.perDay && !/engagement|avgPct|avgViewSec/.test(S.metric) ? ' per day' : ''); }
  var PF_NAME = { facebook: 'Facebook', youtube: 'YouTube', other: 'Other' };

  // ---------- importing ----------
  function addDataset(name, table) {
    var platform = L.detectPlatform(table.headers), map = L.detectColumns(table.headers);
    var ds = { id: B.uid(), name: name, platform: platform, headers: table.headers, rows: table.rows, map: map };
    if (!map.title || !(map.views || map.reach)) { pending = ds; renderMapping(); B.toast('Please match the columns below'); return; }
    S.datasets = S.datasets.filter(function (d) { return d.name !== name; }).concat([ds]); save(); pending = null; renderMapping(); refresh();
    B.toast('Loaded ' + table.rows.length + ' rows from ' + name);
  }
  B.dropZone($('#drop'), function (files) {
    files.forEach(function (f) {
      B.readTable(f).then(function (t) { if (!t.rows.length) throw new Error('No rows found in ' + f.name); addDataset(f.name, t); })
        .catch(function (e) { B.toast(e.message || 'Could not read ' + f.name, 4000); });
    });
  }, { accept: '.csv,.tsv,.txt,.xlsx,.xls,.json', multiple: true });
  $('#sampleYt').onclick = function () { addDataset('Sample — YouTube Studio.csv', B.csv.toObjects(window.InsightsSample.youtube())); };
  $('#sampleFb').onclick = function () { addDataset('Sample — Meta Business Suite.csv', B.csv.toObjects(window.InsightsSample.facebook())); };

  function renderDatasets() {
    var box = $('#datasets'); box.innerHTML = '';
    if (!S.datasets.length) return;
    box.appendChild(B.h('h3', { text: 'Loaded files' }));
    S.datasets.forEach(function (d) {
      box.appendChild(B.h('div', { class: 'ds' }, [
        B.h('b', { text: d.name }), B.h('span', { class: 'tag', text: PF_NAME[d.platform] || d.platform }), B.h('span', { class: 'small muted', text: d.rows.length + ' rows' }),
        B.h('button', { class: 'btn small', text: 'Columns', onclick: function () { pending = d; renderMapping(); } }),
        B.h('button', { class: 'btn small', text: 'Remove', onclick: function () { S.datasets = S.datasets.filter(function (x) { return x !== d; }); save(); refresh(); } })
      ]));
    });
  }
  // Generic column-mapping form for when auto-detect misses (or to check it).
  function renderMapping() {
    var box = $('#mapping'); box.innerHTML = '';
    if (!pending) return;
    var d = pending, grid = B.h('div', { class: 'map-grid' });
    L.FIELDS.forEach(function (f) {
      var sel = B.h('select', { id: 'map-' + f.key, html: '<option value="">— not in this file —</option>' + d.headers.map(function (h) { return '<option' + (d.map[f.key] === h ? ' selected' : '') + '>' + B.esc(h) + '</option>'; }).join('') });
      grid.appendChild(B.h('div', {}, [B.h('label', { for: 'map-' + f.key, text: f.label }), sel]));
    });
    var pf = B.h('select', { id: 'map-platform', html: ['facebook', 'youtube', 'other'].map(function (p) { return '<option value="' + p + '"' + (d.platform === p ? ' selected' : '') + '>' + PF_NAME[p] + '</option>'; }).join('') });
    grid.appendChild(B.h('div', {}, [B.h('label', { for: 'map-platform', text: 'Platform' }), pf]));
    box.appendChild(B.h('div', { class: 'panel', style: 'background:var(--soft)' }, [
      B.h('h3', { style: 'margin-top:0', text: 'Match the columns in ' + d.name }),
      B.h('p', { class: 'small muted', text: 'We need at least a title (or description) and views (or reach). Everything else is optional and unlocks more charts.' }),
      grid,
      B.h('div', { class: 'row', style: 'margin-top:12px' }, [
        B.h('button', { class: 'btn primary', text: 'Use these columns', onclick: function () {
          var map = {}; L.FIELDS.forEach(function (f) { var v = $('#map-' + f.key).value; if (v) map[f.key] = v; });
          if (!(map.title || map.description) || !(map.views || map.reach)) { B.toast('Pick a title and a views column first'); return; }
          d.map = map; d.platform = pf.value;
          if (S.datasets.indexOf(d) < 0) S.datasets = S.datasets.filter(function (x) { return x.name !== d.name; }).concat([d]);
          pending = null; save(); renderMapping(); refresh();
        } }),
        B.h('button', { class: 'btn', text: 'Cancel', onclick: function () { pending = null; renderMapping(); } })
      ])
    ]));
  }

  // ---------- analysis ----------
  function build() {
    posts = [];
    S.datasets.forEach(function (d) {
      if (S.platform && d.platform !== S.platform) return;
      posts = posts.concat(L.normalise(d.rows, d.map, { platform: d.platform }).posts);
    });
  }
  function refresh() {
    renderDatasets(); build();
    var avail = posts.length ? L.available(posts) : ['views'];
    if (avail.indexOf(S.metric) < 0) S.metric = avail[0] || 'views';
    $('#metric').innerHTML = avail.map(function (k) { return '<option value="' + k + '"' + (k === S.metric ? ' selected' : '') + '>' + L.METRICS[k].label + '</option>'; }).join('');
    $('#pf').value = S.platform; $('#perDay').checked = !!S.perDay;
    var empty = '<p class="muted">Load an export or a sample file to see results.</p>';
    if (!posts.length) {
      ['#stats', '#top', '#bottom', '#all', '#hookChart', '#hookTable', '#firstWords', '#durChart', '#dayChart', '#hourChart', '#kw', '#recs', '#estOut'].forEach(function (s) { $(s).innerHTML = ''; });
      $('#stats').innerHTML = empty; $('#recs').innerHTML = '<li>' + empty + '</li>'; return;
    }
    overview(); hooks(); timing(); topics(); recs();
  }
  function postCols(withVal) {
    var c = [{ key: 'title', label: 'Title', fmt: function (v) { return '<span class="t">' + B.esc(v) + '</span>'; } },
      { key: 'platform', label: 'Platform', fmt: function (v) { return B.esc(PF_NAME[v] || v); } },
      { key: 'pub', label: 'Published' }];
    if (withVal) c.push({ key: 'value', label: mLabel(), fmt: fmtV });
    return c;
  }
  function asRows(list) { return list.map(function (x) { var p = x.post; return { title: p.title, platform: p.platform, pub: p.published ? p.published.toISOString().slice(0, 10) : '', value: x.value }; }); }
  function overview() {
    var s = L.summary(posts);
    var stats = [['Posts', B.fmt.num(s.posts, 0)], ['Total views', L.fmtN(s.totalViews)], ['Median views', L.fmtN(s.medianViews)],
      ['Avg engagement', isFinite(s.avgEngagement) ? (s.avgEngagement * 100).toFixed(1) + '%' : '–'], ['Avg % viewed', isFinite(s.avgPct) ? s.avgPct.toFixed(0) + '%' : '–'],
      ['Avg length', isFinite(s.avgDuration) ? Math.round(s.avgDuration) + ' s' : '–']];
    $('#stats').innerHTML = stats.map(function (x) { return '<div class="stat"><div class="k">' + x[0] + '</div><div class="v">' + x[1] + '</div></div>'; }).join('');
    var r = L.rank(posts, S.metric, S.perDay, 5);
    $('#top').innerHTML = B.table(asRows(r.top), [postCols(true)[0], postCols(true)[3]]);
    $('#bottom').innerHTML = r.bottom.length ? B.table(asRows(r.bottom), [postCols(true)[0], postCols(true)[3]]) : '<p class="muted">Not enough posts.</p>';
    var all = posts.map(function (p) {
      return { title: p.title, platform: p.platform, pub: p.published ? p.published.toISOString().slice(0, 10) : '', views: p.views, eng: p.engagement, dur: p.duration, pct: p.avgPct, value: L.metric(p, S.metric, S.perDay) };
    }).sort(function (a, b) { return (isFinite(b.value) ? b.value : -1) - (isFinite(a.value) ? a.value : -1); });
    $('#all').innerHTML = B.table(all, postCols(false).concat([
      { key: 'views', label: 'Views', fmt: L.fmtN }, { key: 'eng', label: 'Engagement', fmt: function (v) { return isFinite(v) ? (v * 100).toFixed(1) + '%' : '–'; } },
      { key: 'dur', label: 'Length', fmt: function (v) { return isFinite(v) ? Math.round(v) + ' s' : '–'; } }, { key: 'pct', label: '% viewed', fmt: function (v) { return isFinite(v) ? v.toFixed(0) + '%' : '–'; } }]), { limit: 300 });
  }
  function liftFmt(v) { if (!isFinite(v)) return '–'; var c = v >= 1.15 ? 'pill-ok' : v <= 0.85 ? 'pill-bad' : 'tag'; return '<span class="' + c + '">' + v.toFixed(2) + '×</span>'; }
  function hooks() {
    var h = L.hooks(posts, S.metric, S.perDay);
    $('#hookChart').innerHTML = '<h3 style="margin-top:0">Average ' + B.esc(mLabel().toLowerCase()) + ' by hook pattern</h3>' +
      B.barChart(h.patterns.map(function (r) { return { label: r.label + ' (' + r.count + ')', value: r.avg }; }), { fmt: fmtV });
    $('#hookTable').innerHTML = B.table(h.patterns, [{ key: 'label', label: 'Pattern' }, { key: 'count', label: 'Posts' }, { key: 'avg', label: 'Average', fmt: fmtV }, { key: 'lift', label: 'Lift', fmt: liftFmt }]) +
      '<p class="small muted">' + h.plain + ' titles matched no pattern. Patterns used by only one or two posts are not reliable.</p>';
    $('#firstWords').innerHTML = h.firstWords.length ? B.table(h.firstWords.slice(0, 15), [{ key: 'key', label: 'First word' }, { key: 'count', label: 'Posts' }, { key: 'avg', label: 'Average', fmt: fmtV }, { key: 'lift', label: 'Lift', fmt: liftFmt }]) : '<p class="muted">No first word is repeated yet.</p>';
  }
  function chart(rows) { return rows.length ? B.barChart(rows.map(function (r) { return { label: r.key + ' (' + r.count + ')', value: r.avg }; }), { fmt: fmtV }) : '<p class="muted small">Not enough data for this view.</p>'; }
  function timing() {
    $('#durChart').innerHTML = chart(L.byDuration(posts, S.metric, S.perDay));
    $('#dayChart').innerHTML = chart(L.byDay(posts, S.metric, S.perDay));
    var hr = L.byHour(posts, S.metric, S.perDay);
    $('#hourChart').innerHTML = hr.length ? chart(hr) : '<p class="muted small">This export has dates but no times (YouTube Studio exports only the day). Facebook exports include the time.</p>';
  }
  function topics() {
    var k = L.keywords(posts, S.metric, S.perDay).slice(0, 30);
    $('#kw').innerHTML = k.length ? B.table(k, [{ key: 'word', label: 'Word' }, { key: 'count', label: 'Posts' }, { key: 'avg', label: 'Average', fmt: fmtV }, { key: 'lift', label: 'Lift', fmt: liftFmt }]) : '<p class="muted">Not enough repeated words yet.</p>';
  }
  function recs() {
    var r = L.recommendations(posts, S.metric, S.perDay);
    $('#recs').innerHTML = r.length ? r.map(function (x) { return '<li><span class="' + (x.level === 'warn' ? 'pill-warn' : 'pill-ok') + '">' + (x.level === 'warn' ? 'Watch' : 'Do') + '</span> ' + B.esc(x.text) + '</li>'; }).join('')
      : '<li class="muted">Not enough variety in the data for confident advice yet.</li>';
  }

  // ---------- estimate ----------
  $('#estimate').onclick = function () {
    var title = $('#idea').value.trim(); if (!title) { B.toast('Type a planned title first'); return; }
    if (!posts.length) { $('#estOut').innerHTML = '<p class="muted">Load your data first.</p>'; return; }
    var m = L.METRICS[S.metric] ? S.metric : 'views';
    var e = L.estimate({ title: title, duration: $('#ideaDur').value }, posts, { metric: m });
    var name = L.METRICS[m].label.toLowerCase();
    var conf = e.confidence === 'medium' ? '<span class="pill-warn">medium confidence</span>' : '<span class="pill-bad">low confidence</span>';
    $('#estOut').innerHTML =
      '<p style="font-size:18px"><b>Likely ' + B.esc(name) + ': ' + L.fmtM(e.low, m) + ' – ' + L.fmtM(e.high, m) + '</b> (middle guess ' + L.fmtM(e.mid, m) + ') ' + conf + '</p>' +
      '<p class="small muted">Your median across all ' + e.sample + ' posts is ' + L.fmtM(e.overallMedian, m) + '. Based on the ' + e.neighbours.length + ' most similar posts. ' +
      (e.sample < 30 ? 'With fewer than 30 posts this is a very rough guide. ' : '') + 'Results depend on the video itself, the algorithm and timing — treat it as a comparison, not a forecast.</p>' +
      '<p class="small">Length band: <b>' + B.esc(e.bucket || 'unknown') + '</b> · Hook patterns: ' + (e.patterns.length ? e.patterns.map(function (p) { return '<span class="tag">' + B.esc(L.PATTERNS.filter(function (x) { return x.id === p; })[0].label) + '</span>'; }).join('') : 'none') + '</p>' +
      B.table(e.neighbours.map(function (n) { return { title: n.post.title, len: n.post.duration, sim: n.score, value: n.value }; }),
        [{ key: 'title', label: 'Similar past post' }, { key: 'len', label: 'Length', fmt: function (v) { return isFinite(v) ? Math.round(v) + ' s' : '–'; } },
          { key: 'sim', label: 'Similarity', fmt: function (v) { return v.toFixed(1); } }, { key: 'value', label: L.METRICS[m].label, fmt: function (v) { return L.fmtM(v, m); } }]);
  };

  // ---------- controls ----------
  $('#metric').onchange = function () { S.metric = this.value; save(); refresh(); };
  $('#pf').onchange = function () { S.platform = this.value; save(); refresh(); };
  $('#perDay').onchange = function () { S.perDay = this.checked; save(); refresh(); };
  $('#export').onclick = function () { B.download('content-insights-backup.json', JSON.stringify({ app: 'content-insights', version: 1, data: S }), 'application/json'); };
  $('#import').onclick = function () {
    var inp = B.h('input', { type: 'file', accept: '.json,application/json' });
    inp.onchange = function () {
      if (!inp.files[0]) return;
      B.readFile(inp.files[0]).then(function (t) {
        var j = JSON.parse(t); if (!j || j.app !== 'content-insights' || !j.data || !Array.isArray(j.data.datasets)) throw new Error('This is not a Content Insights backup.');
        S = j.data; save(); refresh(); B.toast('Backup restored');
      }).catch(function (e) { B.toast(e.message || 'Could not read that file'); });
    };
    inp.click();
  };
  $('#clear').onclick = function () { if (!confirm('Remove all loaded files from this browser?')) return; S.datasets = []; pending = null; save(); renderMapping(); refresh(); };

  // ---------- optional AI ----------
  B.ai.note($('#aiNote'));
  B.ai.button($('#aiRecs'), 'Suggest 5 video ideas from these numbers', function () {
    if (!posts.length) { B.toast('Load data first'); return null; }
    var top = L.rank(posts, S.metric, S.perDay, 8).top.map(function (x) { return '- ' + x.post.title + ' (' + fmtV(x.value) + ')'; }).join('\n');
    var r = L.recommendations(posts, S.metric, S.perDay).map(function (x) { return '- ' + x.text; }).join('\n');
    return 'I make short emotional story videos. My best posts by ' + mLabel() + ':\n' + top + '\n\nFindings from my analytics:\n' + r +
      '\n\nSuggest 5 new ORIGINAL short-video story ideas (title + one-line premise + ideal length) that follow these patterns. Do not copy existing shows. Plain text list.';
  }, function (ans) { $('#aiRecsOut').innerHTML = ''; $('#aiRecsOut').appendChild(B.h('pre', { style: 'white-space:pre-wrap', text: ans })); }, { temperature: 0.8 });

  B.tabs(B.$('[data-tabs="ci"]'));
  refresh();
})();
