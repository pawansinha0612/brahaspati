const test = require('node:test');
const assert = require('node:assert');
const B = require('../assets/core.js');
test('csv parse handles quotes, newlines and semicolons', () => {
  assert.deepStrictEqual(B.csv.parse('a,b\n"x, y","say ""hi"""\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
  assert.deepStrictEqual(B.csv.parse('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
  assert.deepStrictEqual(B.csv.toObjects('n,v\n1,"a\nb"').rows, [{ n: '1', v: 'a\nb' }]);
});
test('csv stringify round-trips', () => {
  const rows = [{ a: 'x,y', b: 'q"' }];
  assert.deepStrictEqual(B.csv.toObjects(B.csv.stringify(rows, ['a', 'b'])).rows, rows);
});
test('toNumber parses money formats', () => {
  assert.strictEqual(B.toNumber('$1,234.50'), 1234.5);
  assert.strictEqual(B.toNumber('(12.00)'), -12);
  assert.strictEqual(B.toNumber('1.234,5'), 1234.5);
  assert.ok(isNaN(B.toNumber('')));
});
test('toDate reads AU day-first dates', () => {
  assert.strictEqual(B.toDate('08/11/2026').toISOString().slice(0, 10), '2026-11-08');
  assert.strictEqual(B.toDate('2026-11-08').toISOString().slice(0, 10), '2026-11-08');
});
test('apps.json is valid and every local app has a page', () => {
  const fs = require('fs'), path = require('path');
  const apps = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps.json'), 'utf8'));
  const slugs = new Set();
  for (const a of apps) {
    assert.ok(a.slug && a.name && a.cat && a.desc, 'missing field in ' + JSON.stringify(a));
    assert.ok(!slugs.has(a.slug), 'duplicate ' + a.slug); slugs.add(a.slug);
    assert.ok(['business', 'industry', 'ecommerce', 'creators', 'personal', 'utilities', 'developers'].includes(a.cat));
    if (!a.url) assert.ok(fs.existsSync(path.join(__dirname, '..', 'apps', a.slug, 'index.html')), 'no page for ' + a.slug);
  }
});
