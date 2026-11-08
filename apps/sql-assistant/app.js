(function () {
  'use strict';
  var L = window.SqlLib, $ = B.$, esc = B.esc;
  var sqlEl = $('#sql'), dialectEl = $('#dialect'), formatted = '';

  var SAMPLE = "-- Monthly report: big spenders\n" +
    "select distinct c.id, c.name, c.email, sum(o.total) as spend\n" +
    "from customers c join orders o on o.customer_id = c.id\n" +
    "where year(o.created_at) = 2026 and lower(c.email) like '%@gmail.com' or c.vip = 1\n" +
    "and c.id not in (select customer_id from blocked_customers)\n" +
    "group by c.id, c.name, c.email having sum(o.total) > 1000 order by spend desc;\n" +
    "update customers set tier = 'gold';";

  Object.keys(L.DIALECTS).forEach(function (k) { dialectEl.appendChild(B.h('option', { value: k, text: L.DIALECTS[k] })); });
  dialectEl.value = B.store.get('sql:dialect', 'generic');

  function highlight(sql) {
    return L.tokenize(sql).map(function (t) {
      var v = esc(t.value);
      if (t.type === 'keyword' || t.type === 'func') return '<span class="kw">' + v + '</span>';
      if (t.type === 'string') return '<span class="str">' + v + '</span>';
      if (t.type === 'comment') return '<span class="cm">' + v + '</span>';
      if (t.type === 'number') return '<span class="num">' + v + '</span>';
      return v;
    }).join('');
  }

  function bullets(list) {
    if (!list || !list.length) return '';
    return '<ul>' + list.map(function (b) { return '<li>' + esc(b.text) + bullets(b.children) + '</li>'; }).join('') + '</ul>';
  }

  var SEV = { danger: ['pill-bad', 'Danger'], warn: ['pill-warn', 'Slow / risky'], info: ['pill-ok', 'Tip'] };

  function run() {
    var sql = sqlEl.value, d = dialectEl.value;
    B.store.set('sql:dialect', d);
    if (!sql.trim()) {
      $('#issues').innerHTML = '<p class="muted">Paste a query above, or press “Try with sample”.</p>';
      $('#explain').innerHTML = ''; $('#formatted').textContent = ''; $('#stats').innerHTML = ''; formatted = ''; return;
    }
    formatted = L.format(sql, { uppercase: $('#upper').checked });
    $('#formatted').innerHTML = highlight(formatted);
    var issues = L.lint(sql, d);
    var counts = { danger: 0, warn: 0, info: 0 }; issues.forEach(function (i) { counts[i.severity]++; });
    var stmts = L.explain(sql);
    $('#stats').innerHTML = [['Statements', stmts.length, ''], ['Dangers', counts.danger, counts.danger ? 'bad' : 'ok'], ['Slow / risky', counts.warn, counts.warn ? 'warn' : 'ok'], ['Tips', counts.info, '']]
      .map(function (s) { return '<div class="stat"><div class="k">' + s[0] + '</div><div class="v ' + s[2] + '">' + s[1] + '</div></div>'; }).join('');
    $('#issues').innerHTML = issues.length ? issues.map(function (i) {
      return '<div class="issue"><h3><span class="' + SEV[i.severity][0] + '">' + SEV[i.severity][1] + '</span> ' + esc(i.title) + '</h3><p>' + esc(i.detail) + '</p><p class="small muted">Try instead:</p><pre>' + esc(i.fix) + '</pre></div>';
    }).join('') : '<div class="panel"><p style="margin:0"><span class="pill-ok">Looks fine</span> No common problems spotted for ' + esc(L.DIALECTS[d]) + '. The checks can’t see your indexes or table sizes — run EXPLAIN on the real database to be sure.</p></div>';
    $('#explain').innerHTML = stmts.map(function (s) { return '<h3 style="margin-top:6px">' + esc(s.title) + '</h3>' + bullets(s.bullets); }).join('');
  }

  $('#go').addEventListener('click', run);
  sqlEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); });
  dialectEl.addEventListener('change', run);
  $('#upper').addEventListener('change', run);
  $('#sample').addEventListener('click', function () { sqlEl.value = SAMPLE; run(); });
  $('#useFormatted').addEventListener('click', function () { if (formatted) { sqlEl.value = formatted; B.toast('Formatted SQL copied into the box'); } });
  $('#copyFmt').addEventListener('click', function () { if (formatted) B.copy(formatted); });
  $('#dlFmt').addEventListener('click', function () { if (formatted) B.download('query.sql', formatted + '\n', 'application/sql'); });
  B.tabs($('[data-tabs="sql"]'));

  B.ai.button($('#aiBox'), 'AI: explain and optimise', function () {
    if (!sqlEl.value.trim()) { B.toast('Paste a query first'); return null; }
    return 'You are a careful database engineer. For this ' + L.DIALECTS[dialectEl.value] + ' SQL, explain in plain English what it does (short bullet points), ' +
      'list any performance or correctness risks, and give an improved version in a ```sql block. Note any assumptions about indexes. Australian spelling.\n\n```sql\n' + sqlEl.value.slice(0, 12000) + '\n```';
  }, function (ans) {
    $('#aiOut').innerHTML = '<div class="panel" style="background:var(--soft)"><p class="small muted" style="margin:0 0 6px">AI answer — check it before running anything; AI can be wrong.</p><div style="white-space:pre-wrap;overflow-wrap:anywhere">' + esc(ans) + '</div></div>';
  });
  B.ai.note($('#aiNote'));
  run();
})();
