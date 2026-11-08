const test = require('node:test');
const assert = require('node:assert');
const P = require('../apps/pdf-tools/lib.js');

const it = (str, x, y, w) => ({ str, x, y, w: w == null ? str.length * 5 : w });

test('normItem reads position from the pdf.js transform', () => {
  assert.deepStrictEqual(P.normItem({ str: 'Hi', transform: [10, 0, 0, 10, 72, 700], width: 12, height: 10 }), { str: 'Hi', x: 72, y: 700, w: 12, h: 10 });
});

test('itemsToLines orders rows top to bottom and joins with spaces', () => {
  const lines = P.itemsToLines([it('world', 110, 700), it('Second', 50, 680), it('Hello', 50, 701)]);
  assert.deepStrictEqual(lines, ['Hello world', 'Second']);
});

test('extractTable finds columns, including right-aligned numbers', () => {
  const items = [
    it('Report title spanning the page', 50, 760, 200),
    it('Item', 50, 720), it('Qty', 200, 720), it('Price', 300, 720),
    it('Apples', 50, 700), it('3', 210, 700), it('$4.50', 300, 700),
    it('Green', 50, 680, 25), it('pears', 78, 680, 25), it('12', 205, 680), it('$10.00', 300, 680)
  ];
  const t = P.extractTable(items);
  assert.strictEqual(t.columns, 3);
  assert.deepStrictEqual(t.rows, [['Item', 'Qty', 'Price'], ['Apples', '3', '$4.50'], ['Green pears', '12', '$10.00']]);
  const all = P.extractTable(items, { onlyTableRows: false });
  assert.strictEqual(all.rows.length, 4);
});

test('extractTable leaves an empty cell where a column is missing', () => {
  const t = P.extractTable([it('A', 50, 700), it('B', 150, 700), it('C', 250, 700), it('x', 50, 680), it('z', 250, 680)]);
  assert.deepStrictEqual(t.rows[1], ['x', '', 'z']);
});

test('toCsv quotes commas and quotes', () => {
  assert.strictEqual(P.toCsv([['a,b', 'say "hi"'], ['1', '']]), '"a,b","say ""hi"""\n1,');
});

test('diffLines marks added and removed lines in order', () => {
  const d = P.diffLines(['a', 'b', 'c', 'd'], ['a', 'c', 'x', 'd']);
  assert.deepStrictEqual(d, [{ op: 'same', text: 'a' }, { op: 'del', text: 'b' }, { op: 'same', text: 'c' }, { op: 'add', text: 'x' }, { op: 'same', text: 'd' }]);
});

test('compare works per page, counts changes and flags extra pages', () => {
  const r = P.compare(['Title\nRent  $500', 'Page two'], ['Title\nRent $550']);
  assert.strictEqual(r.pages.length, 2);
  assert.strictEqual(r.pages[0].added, 1); assert.strictEqual(r.pages[0].removed, 1);
  assert.strictEqual(r.pages[1].onlyIn, 'A');
  assert.strictEqual(r.identical, false);
  assert.strictEqual(P.compare(['a  b'], ['a b']).identical, true); // whitespace ignored by default
  assert.strictEqual(P.compare(['x\ny'], ['y', 'x'], { byPage: false }).pages[0].page, 'All');
});

test('stats counts pages, words and reading time', () => {
  const s = P.stats(['one two three', '', 'four']);
  assert.deepStrictEqual([s.pages, s.words, s.emptyPages, s.readingMinutes], [3, 4, 1, 1]);
});

test('search finds matches per page and line, plain or regex', () => {
  const r = P.search(['Rent is due\nNo pets', 'Rent review yearly'], 'rent');
  assert.deepStrictEqual(r.map(x => [x.page, x.line]), [[1, 1], [2, 1]]);
  assert.deepStrictEqual(P.search(['a.b axb'], '.', {}).length, 1);
  assert.deepStrictEqual(P.search(['a.b axb'], 'a.b', { regex: true })[0].hits.length, 2);
  assert.throws(() => P.search(['x'], '(', { regex: true }), /not valid/);
});

test('summarise picks n sentences in document order', () => {
  const text = 'The lease covers rent and bond for the property. Rent is paid weekly by the tenant into the account. The bond is four weeks of rent for the property. Birds sing in the morning near the park. The tenant must report repairs to the agent quickly.';
  const s = P.summarise(text, 2);
  assert.strictEqual(s.length, 2);
  assert.ok(text.indexOf(s[0]) < text.indexOf(s[1]));
  assert.ok(!s.some(x => /Birds/.test(x)));
});

test('makePdf writes a well-formed PDF with a correct xref offset', () => {
  const pdf = P.makePdf(P.textPages([['Hello (world)', 'Line 2'], ['Page 2']]));
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.ok(pdf.includes('/Count 2'));
  assert.ok(pdf.includes('(Hello \\(world\\)) Tj'));
  const x = +pdf.match(/startxref\n(\d+)/)[1];
  assert.strictEqual(pdf.slice(x, x + 4), 'xref');
  const first = +pdf.match(/0000000000 65535 f \n(\d{10})/)[1];
  assert.strictEqual(pdf.slice(first, first + 7), '1 0 obj');
});
