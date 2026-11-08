const test = require('node:test');
const assert = require('node:assert');
const C = require('../apps/file-converter/lib.js');

const T = { headers: ['name', 'note'], rows: [{ name: 'Ann', note: 'says "hi", ok' }, { name: 'Bo|b', note: 'line1\nline2' }] };

test('CSV round-trips quotes, commas and newlines; duplicate headers get suffixes', () => {
  assert.deepStrictEqual(C.fromCsv(C.toCsv(T)), T);
  assert.deepStrictEqual(C.fromCsv('a,a,\n1,2,3').headers, ['a', 'a (2)', 'Column 3']);
});

test('TSV writes tabs and reads back', () => {
  const tsv = C.toTsv({ headers: ['a', 'b'], rows: [{ a: 'x\ty', b: '1' }] });
  assert.strictEqual(tsv, 'a\tb\n"x\ty"\t1');
  assert.deepStrictEqual(C.fromCsv(tsv, '\t').rows, [{ a: 'x\ty', b: '1' }]);
});

test('flatten and unflatten nested objects and arrays with dot paths', () => {
  const obj = { id: 1, user: { name: 'Ann', tags: ['a', 'b'] }, empty: {} };
  const flat = C.flatten(obj);
  assert.deepStrictEqual(flat, { id: 1, 'user.name': 'Ann', 'user.tags.0': 'a', 'user.tags.1': 'b', empty: {} });
  assert.deepStrictEqual(C.unflatten(flat), obj);
});

test('fromJson finds the records array, flattens and unions headers', () => {
  const t = C.fromJson('{"data":[{"a":1,"b":{"c":2}},{"a":3,"d":true}],"meta":{"n":2}}');
  assert.deepStrictEqual(t.headers, ['a', 'b.c', 'd']);
  assert.strictEqual(t.rows[1].d, true);
  assert.deepStrictEqual(C.fromJson('[1,2]').rows, [{ value: 1 }, { value: 2 }]);
});

test('toJson guesses numbers/booleans and can unflatten', () => {
  const j = JSON.parse(C.toJson({ headers: ['id', 'user.name', 'ok', 'zip'], rows: [{ id: '7', 'user.name': 'Ann', ok: 'true', zip: '0800' }] }, { unflatten: true }));
  assert.deepStrictEqual(j, [{ id: 7, user: { name: 'Ann' }, ok: true, zip: '0800' }]);
});

test('Markdown table writes escaped pipes and reads back', () => {
  const md = C.toMarkdown(T);
  assert.ok(md.includes('Bo\\|b'));
  assert.ok(md.split('\n')[1].startsWith('| ---'));
  const back = C.fromMarkdown(md);
  assert.strictEqual(back.rows[1].name, 'Bo|b');
  assert.strictEqual(back.rows[1].note, 'line1<br>line2');
});

test('HTML table writer escapes and reader decodes entities', () => {
  const html = C.toHtml({ headers: ['x'], rows: [{ x: '<b>&' }] });
  assert.ok(html.includes('<td>&lt;b&gt;&amp;</td>'));
  assert.deepStrictEqual(C.fromHtml(html).rows, [{ x: '<b>&' }]);
  const t = C.fromHtml('<p>x</p><table><tr><th>A</th><th>B</th></tr><tr><td><b>1</b></td><td>a&nbsp;b</td></tr></table>');
  assert.deepStrictEqual(t, { headers: ['A', 'B'], rows: [{ A: '1', B: 'a b' }] });
  assert.ok(C.toHtml(T, { page: true, title: 'T' }).startsWith('<!doctype html>'));
});

test('SQL INSERT quotes identifiers and strings, leaves numbers, handles NULL', () => {
  const t = { headers: ['id', "o'name", 'amt'], rows: [{ id: '1', "o'name": "O'Brien", amt: '' }] };
  assert.strictEqual(C.toSql(t, { table: 'people' }), `INSERT INTO "people" ("id", "o'name", "amt") VALUES (1, 'O''Brien', '');`);
  assert.ok(C.toSql(t, { emptyAsNull: true }).endsWith('NULL);'));
  const multi = C.toSql({ headers: ['a'], rows: [{ a: 'x' }, { a: 'y' }, { a: 'z' }] }, { batch: 2, create: true });
  assert.ok(multi.startsWith('CREATE TABLE "my_table" (\n  "a" TEXT\n);'));
  assert.strictEqual((multi.match(/INSERT INTO/g) || []).length, 2);
  assert.strictEqual(C.sqlValue('007', {}), "'007'");
});

test('htmlToMarkdown converts headings, lists, links, emphasis and tables', () => {
  const md = C.htmlToMarkdown('<h1>Title</h1><p>Hello <strong>bold</strong> and <em>it</em> <a href="https://x.com">link</a> &amp; more</p><ul><li>One</li><li>Two</li></ul><ol><li>A</li></ol><table><tr><td>h</td></tr><tr><td>v</td></tr></table>');
  assert.strictEqual(md, '# Title\n\nHello **bold** and _it_ [link](https://x.com) & more\n\n- One\n- Two\n\n1. A\n\n| h |\n| --- |\n| v |\n');
});

test('detectFormat and formatFromName pick the right reader', () => {
  assert.strictEqual(C.detectFormat('[{"a":1}]'), 'json');
  assert.strictEqual(C.detectFormat('| a |\n|---|\n| 1 |'), 'markdown');
  assert.strictEqual(C.detectFormat('<table><tr><td>1</td></tr></table>'), 'html');
  assert.strictEqual(C.detectFormat('a\tb\n1\t2'), 'tsv');
  assert.strictEqual(C.detectFormat('a,b\n1,2'), 'csv');
  assert.strictEqual(C.formatFromName('Report.XLSX'), 'xlsx');
  assert.strictEqual(C.formatFromName('x.docx'), 'docx');
});

test('parse/write pipeline converts CSV to every output', () => {
  const t = C.parse('id,name\n1,Ann', 'csv');
  ['csv', 'tsv', 'json', 'markdown', 'html', 'sql'].forEach(f => assert.ok(C.write(t, f).length > 10, f));
  assert.throws(() => C.write(t, 'yaml'), /Unknown format/);
});
