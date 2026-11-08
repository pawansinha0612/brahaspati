const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/sql-assistant/lib.js');

const ids = (sql, d) => L.lint(sql, d).map((i) => i.id);
const flat = (bullets) => bullets.flatMap((b) => [b.text].concat(b.children ? flat(b.children) : []));
const explainText = (sql) => L.explain(sql).flatMap((s) => flat(s.bullets)).join('\n');

// ---------- tokenizer ----------
test('tokenizer: strings with escaped quotes, quoted identifiers, comments, numbers, params, operators', () => {
  const t = L.tokenize("SELECT 'it''s', \"my col\", `x`, [y z], 1.5e3, :id, $1, @p -- note\n/* block */ a<>b").filter((x) => x.type !== 'ws');
  const types = t.map((x) => x.type + ':' + x.value);
  assert.ok(types.includes("string:'it''s'"));
  assert.ok(types.includes('qident:"my col"'));
  assert.ok(types.includes('qident:`x`'));
  assert.ok(types.includes('qident:[y z]'));
  assert.ok(types.includes('number:1.5e3'));
  assert.ok(types.includes('param::id') && types.includes('param:$1') && types.includes('param:@p'));
  assert.ok(types.includes('comment:-- note') && types.includes('comment:/* block */'));
  assert.ok(types.includes('op:<>'));
});
test('tokenizer: keywords inside strings and comments are not keywords; dollar quotes', () => {
  const t = L.tokenize("select 'from where' -- select\n, $$ select $$").filter((x) => x.type === 'keyword');
  assert.deepStrictEqual(t.map((x) => x.value), ['select']);
  assert.ok(L.tokenize('$$ a ; b $$').some((x) => x.type === 'string'));
});
test('multi-word keywords merge, unknown words followed by ( become calls', () => {
  const t = L.sigTokens('select a from t left outer join u on 1=1 group by a order by a union all select my_fn(1)');
  const v = t.filter((x) => x.type === 'keyword').map((x) => x.value);
  assert.ok(v.includes('LEFT OUTER JOIN') && v.includes('GROUP BY') && v.includes('ORDER BY') && v.includes('UNION ALL'));
  assert.ok(t.find((x) => x.value === 'my_fn').call);
});

// ---------- formatter ----------
test('format: uppercase keywords, clauses on new lines, list items indented', () => {
  assert.strictEqual(L.format('select id, name from customers where active = 1 and age > 18 order by name'),
    'SELECT\n  id,\n  name\nFROM customers\nWHERE active = 1\n  AND age > 18\nORDER BY name');
});
test('format: joins with ON, subquery indented, BETWEEN keeps its AND', () => {
  const out = L.format('select c.id from customers c join orders o on o.cid = c.id where o.total between 10 and 20 and c.id in (select id from vip)');
  assert.strictEqual(out, 'SELECT c.id\nFROM customers c\nJOIN orders o\n  ON o.cid = c.id\nWHERE o.total BETWEEN 10 AND 20\n  AND c.id IN (\n    SELECT id\n    FROM vip\n  )');
});
test('format: CASE indents WHEN/ELSE and END, function calls have no space before (', () => {
  const out = L.format("select count(*), case when x > 1 then 'a' else 'b' end as k from t");
  assert.strictEqual(out, "SELECT\n  COUNT(*),\n  CASE\n    WHEN x > 1 THEN 'a'\n    ELSE 'b'\n  END AS k\nFROM t");
});
test('format: keeps comments, strings and quoted identifiers untouched', () => {
  const out = L.format("-- top\nselect \"Order\", 'select from' /* hi */ from t");
  assert.ok(out.startsWith('-- top\nSELECT'));
  assert.ok(out.includes('"Order"') && out.includes("'select from'") && out.includes('/* hi */'));
});
test('format: CTEs, multiple statements and window functions stay inline inside OVER()', () => {
  const out = L.format('with a as (select 1 as x), b as (select 2 as y) select row_number() over (partition by x order by y) as rn from a, b; delete from t where id = 1');
  assert.match(out, /^WITH a AS \(\n  SELECT 1 AS x\n\),\nb AS \(\n  SELECT 2 AS y\n\)\nSELECT ROW_NUMBER\(\) OVER \(PARTITION BY x ORDER BY y\) AS rn\nFROM a, b;\n\nDELETE FROM t\nWHERE id = 1$/);
});
test('format: SELECT DISTINCT / TOP stay on the SELECT line; INSERT keeps space before column list', () => {
  assert.strictEqual(L.format('select distinct a, b from t'), 'SELECT DISTINCT\n  a,\n  b\nFROM t');
  assert.strictEqual(L.format('select top (5) a, b from t'), 'SELECT TOP (5)\n  a,\n  b\nFROM t');
  assert.strictEqual(L.format('insert into t (a, b) values (1, -2), (3, 4)'), 'INSERT INTO t (a, b)\nVALUES\n  (1, -2),\n  (3, 4)');
});
test('format is idempotent and lowercase option keeps original case', () => {
  const once = L.format('select a, b from t where x = 1 or y = 2');
  assert.strictEqual(L.format(once), once);
  assert.match(L.format('select a from t', { uppercase: false }), /^select a\nfrom t$/);
});

// ---------- explainer ----------
test('explain SELECT: columns, aggregates, joins, where, group, having, order, limit', () => {
  const e = explainText('select c.name, count(*) as orders from customers c left join orders o on o.customer_id = c.id where c.active = 1 group by c.name having count(*) > 5 order by orders desc limit 10');
  assert.match(e, /Returns 2 columns: c\.name, orders = COUNT\(\*\)/);
  assert.match(e, /Calculates COUNT/);
  assert.match(e, /Reads from customers \(as c\)/);
  assert.match(e, /LEFT JOIN orders \(as o\) — keeps every row/);
  assert.match(e, /matching on o\.customer_id = c\.id/);
  assert.match(e, /Keeps only rows where c\.active = 1/);
  assert.match(e, /Groups rows by c\.name/);
  assert.match(e, /After grouping, keeps only groups where COUNT\(\*\) > 5/);
  assert.match(e, /Sorts by orders \(highest\/latest first\)/);
  assert.match(e, /Returns at most 10 rows/);
});
test('explain: CTE, subquery, UNION parts, TOP, OFFSET/FETCH and BETWEEN', () => {
  const e = explainText('with big as (select id from orders where total > 100) select * from big where id in (select id from vip) union all select top 5 id from old order by id offset 10 rows fetch next 5 rows only');
  assert.match(e, /temporary result called “big”/);
  assert.match(e, /Subquery: SELECT id FROM vip/);
  assert.match(e, /Part 2 — combined with UNION ALL/);
  assert.match(e, /first 5 rows \(TOP\)/);
  assert.match(e, /Skips the first 10 rows/);
  assert.match(e, /at most 5 rows \(FETCH/);
  assert.match(explainText('select a from t where d between 1 and 5 and x = 2'), /d BETWEEN 1 AND 5; x = 2/);
});
test('explain INSERT, UPDATE, DELETE incl. missing WHERE warning', () => {
  assert.match(explainText('insert into t (a, b) values (1, 2), (3, 4)'), /Adds rows to t \(columns: a, b\)[\s\S]*2 rows of values/);
  assert.match(explainText('insert into t select * from s'), /new rows come from this query/);
  const u = explainText("update t set a = 1, b = 'x' where id = 3");
  assert.match(u, /Changes rows in t/); assert.match(u, /Sets a = 1, b = 'x'/); assert.match(u, /Only rows where id = 3/);
  assert.match(explainText('delete from logs'), /EVERY row/);
  assert.strictEqual(L.explain('select 1; select 2').length, 2);
});

// ---------- linter ----------
test('lint: UPDATE/DELETE without WHERE are dangers and sort first', () => {
  const l = L.lint("select * from t order by a; update t set a = 1");
  assert.strictEqual(l[0].id, 'update-no-where'); assert.strictEqual(l[0].severity, 'danger');
  assert.ok(ids('delete from t').includes('delete-no-where'));
  assert.ok(!ids('delete from t where id = 1').includes('delete-no-where'));
  assert.ok(ids('delete from t where 1=1').includes('where-always-true'));
});
test('lint: SELECT * (but not inside EXISTS), leading wildcard LIKE', () => {
  assert.ok(ids('select * from t').includes('select-star'));
  assert.ok(ids('select t.* from t').includes('select-star'));
  assert.ok(!ids('select a from t where exists (select * from u where u.id = t.id)').includes('select-star'));
  assert.ok(ids("select a from t where name like '%smith'").includes('leading-wildcard'));
  assert.ok(!ids("select a from t where name like 'smith%'").includes('leading-wildcard'));
});
test('lint: functions on columns and non-sargable date casts', () => {
  assert.ok(ids("select a from t where lower(email) = 'x'").includes('function-on-column'));
  assert.ok(ids("select a from t where cast(created_at as date) = '2026-01-01'").includes('non-sargable-date'));
  assert.ok(ids('select a from t where year(created_at) = 2025').includes('non-sargable-date'));
  assert.ok(ids("select a from t where date_trunc('day', created_at) = now()").includes('non-sargable-date'));
  assert.ok(!ids("select a from t where created_at >= '2026-01-01'").includes('non-sargable-date'));
});
test('lint: OR across columns vs same column', () => {
  assert.ok(ids('select a from t where x = 1 or y = 2').includes('or-columns'));
  const same = ids("select a from t where s = 'a' or s = 'b'");
  assert.ok(same.includes('or-same-column') && !same.includes('or-columns'));
});
test('lint: NOT IN subquery, COUNT(*) > 0, = NULL', () => {
  assert.ok(ids('select a from t where id not in (select tid from u)').includes('not-in-null'));
  assert.ok(ids('select a from t where (select count(*) from u where u.t = t.id) > 0').includes('count-vs-exists'));
  assert.ok(ids('select a from t where b = null').includes('eq-null'));
  assert.ok(!ids('select a from t where b is null').includes('eq-null'));
});
test('lint: comma joins with and without linking condition, JOIN without ON', () => {
  assert.ok(ids('select a from t, u').includes('implicit-cross-join'));
  const linked = ids('select a from t, u where t.id = u.tid');
  assert.ok(linked.includes('comma-join') && !linked.includes('implicit-cross-join'));
  assert.ok(ids('select a from t join u where t.x = 1').includes('join-no-on'));
  assert.ok(!ids('select a from t cross join u').includes('join-no-on'));
});
test('lint: ORDER BY without limit, DISTINCT + JOIN, OFFSET paging, UNION', () => {
  assert.ok(ids('select a from t order by a').includes('order-no-limit'));
  assert.ok(!ids('select a from t order by a limit 5').includes('order-no-limit'));
  assert.ok(!ids('select top 5 a from t order by a', 'sqlserver').includes('order-no-limit'));
  assert.ok(ids('select distinct a from t join u on u.id = t.id').includes('distinct-join'));
  const off = L.lint('select a from t order by a limit 20 offset 5000').find((i) => i.id === 'offset-pagination');
  assert.strictEqual(off.severity, 'warn');
  assert.strictEqual(L.lint('select a from t limit 20 offset 20').find((i) => i.id === 'offset-pagination').severity, 'info');
  assert.ok(ids('select a from t limit 10000, 20', 'mysql').includes('offset-pagination'));
  assert.ok(ids('select a from t union select a from u').includes('union-distinct'));
  assert.ok(!ids('select a from t union all select a from u').includes('union-distinct'));
});
test('lint: dialect differences for LIMIT/TOP/FETCH/ILIKE and quoting; fixes follow dialect', () => {
  assert.ok(ids('select a from t limit 5', 'sqlserver').includes('dialect-limit'));
  assert.ok(ids('select a from t limit 5', 'oracle').includes('dialect-limit'));
  assert.ok(!ids('select a from t limit 5', 'postgres').includes('dialect-limit'));
  assert.ok(ids('select top 5 a from t', 'mysql').includes('dialect-top'));
  assert.ok(ids('select a from t fetch first 5 rows only', 'mysql').includes('dialect-fetch'));
  assert.ok(ids("select a from t where a ilike 'x'", 'mysql').includes('dialect-ilike'));
  assert.ok(ids('select `a` from t', 'postgres').includes('dialect-backtick'));
  assert.match(L.lint('select a from t order by a', 'sqlserver')[0].fix, /TOP \(50\)/);
  assert.match(L.lint('select a from t order by a', 'oracle')[0].fix, /FETCH FIRST 50 ROWS ONLY/);
  assert.match(L.limitSnippet('mysql', 10), /LIMIT 10/);
});
test('lint: a clean query has no warnings; every issue has severity, title, detail and fix', () => {
  assert.deepStrictEqual(L.lint("select id, name from customers where id = 42"), []);
  L.lint("select * from a, b where lower(x) = 'y' or z like '%q' order by 1").forEach((i) => {
    assert.ok(['danger', 'warn', 'info'].includes(i.severity));
    assert.ok(i.title && i.detail && i.fix, i.id);
  });
});
