const test = require('node:test');
const assert = require('node:assert');
const B = require('../assets/core.js');
const L = require('../apps/csv-intelligence/lib.js');

const t = (text) => B.csv.toObjects(text);

const customersA = t(`Customer ID,Name,Email,Balance,Last order
C001,Harbour Cafe,orders@harbourcafe.com.au,"1,250.00",03/10/2026
C002,Bondi Plumbing,admin@bondiplumbing.com.au,0,2026-09-14
C003,Westside Florist,hello@westsideflorist.au,310.5,12/09/2026
C004,Northern Tiles,accounts@ntiles.com.au,89.99,01/08/2026`);
const customersB = t(`customer id,Name,Email,Balance,Last order
c001,Harbour Cafe,orders@harbourcafe.com.au,1250,2026-10-03
C002,Bondi Plumbing Pty Ltd,admin@bondiplumbing.com.au,0,2026-09-14
C003,Westside Florist,hello@westsideflorist.au,310.52,12/09/2026
C005,Eastern Bakery,eat@easternbakery.au,42,05/11/2026`);

test('suggestKeys ranks the ID column first', () => {
  const s = L.suggestKeys(customersA.headers, customersA.rows);
  assert.strictEqual(s[0].col, 'Customer ID');
  assert.ok(s.find((x) => x.col === 'Balance').score < s[0].score);
});

test('isNum accepts money but not invoice codes', () => {
  assert.ok(L.isNum('$1,250.00'));
  assert.ok(L.isNum('(12.00)'));
  assert.ok(!L.isNum('INV-1002'));
  assert.ok(!L.isNum('C001'));
});

test('compare finds only-in-A, only-in-B and cell changes, ignoring format-only differences', () => {
  const r = L.compare(customersA, customersB, ['Customer ID'], ['customer id'], { tolerance: 0 });
  assert.deepStrictEqual(r.onlyA.map((x) => x['Customer ID']), ['C004']);
  assert.deepStrictEqual(r.onlyB.map((x) => x['customer id']), ['C005']);
  // C001: "1,250.00" vs 1250 and 03/10/2026 vs 2026-10-03 are the same value
  const keys = r.changed.map((c) => c.key).sort();
  assert.deepStrictEqual(keys, ['C002', 'C003']);
  const c3 = r.changed.find((c) => c.key === 'C003');
  assert.deepStrictEqual(c3.diffs.map((d) => d.col), ['Balance']);
  assert.strictEqual(r.same, 1);
});

test('compare numeric tolerance absorbs rounding differences', () => {
  const r = L.compare(customersA, customersB, ['Customer ID'], ['customer id'], { tolerance: 0.05 });
  assert.deepStrictEqual(r.changed.map((c) => c.key), ['C002']);
  assert.strictEqual(r.same, 2);
});

test('compare reports duplicate keys within a file', () => {
  const a = t('id,v\n1,a\n2,b\n1,c');
  const r = L.compare(a, t('id,v\n1,a\n2,b'), ['id']);
  assert.deepStrictEqual(r.dupA, [{ key: '1', row: 4 }]);
});

test('duplicates: exact vs fuzzy vs similar', () => {
  const rows = t(`Name,Email
Harbour Cafe,a@x.com
harbour  cafe ,a@x.com
Harbour Café Pty Ltd,b@x.com
Bondi Plumbing,c@x.com
Bondi Plumbng,d@x.com
Westside Florist,e@x.com`).rows;
  assert.strictEqual(L.duplicates(rows, ['Name'], 'exact').length, 1);
  const fz = L.duplicates(rows, ['Name'], 'fuzzy');
  assert.strictEqual(fz.length, 1);
  assert.deepStrictEqual(fz[0].rows.map((r) => r.line), [2, 3, 4]); // accents and "Pty Ltd" ignored
  const sim = L.duplicates(rows, ['Name'], 'similar');
  const lines = sim.map((g) => g.rows.map((r) => r.line));
  assert.ok(lines.some((l) => l.join() === '2,3,4'), JSON.stringify(lines));
  assert.ok(lines.some((l) => l.join() === '5,6'));
  assert.ok(!lines.some((l) => l.includes(7)));
});

test('reconcile: reference match, partial payment, amount+date match and unmatched', () => {
  const inv = t(`Invoice No,Date,Total
INV-1001,01/10/2026,"$1,100.00"
INV-1002,05/10/2026,550.00
INV-1003,10/10/2026,220.00
INV-1004,20/10/2026,880.00
INV-1005,25/10/2026,99.00`);
  const pay = t(`Date,Description,Amount
03/10/2026,DIRECT CREDIT INV1001 HARBOUR CAFE,1100.00
12/10/2026,Payment ref 1002,300.00
19/10/2026,Payment ref INV-1002 balance,250.00
14/10/2026,BPAY WESTSIDE,220.00
30/10/2026,Unknown deposit,75.00
`);
  const r = L.reconcile({ rows: inv.rows, ref: 'Invoice No', amount: 'Total', date: 'Date' }, { rows: pay.rows, ref: 'Description', amount: 'Amount', date: 'Date' }, { days: 7 });
  const by = Object.fromEntries(r.invoices.map((x) => [x.ref, x]));
  assert.strictEqual(by['INV-1001'].status, 'Paid');
  assert.strictEqual(by['INV-1002'].status, 'Paid');
  assert.strictEqual(by['INV-1002'].payments.length, 2);
  assert.strictEqual(by['INV-1003'].status, 'Paid');
  assert.match(by['INV-1003'].payments[0].how, /Amount \+ date \(4 days\)/);
  assert.strictEqual(by['INV-1004'].status, 'Unpaid');
  assert.strictEqual(r.unmatchedPayments.length, 1);
  assert.strictEqual(r.unmatchedPayments[0].amount, 75);
  assert.strictEqual(r.totals.invoiced, 2849);
  assert.strictEqual(r.totals.outstanding, 979);
  assert.strictEqual(r.totals.unapplied, 75);
});

test('reconcile: amount match respects the date window and flags part payments', () => {
  const inv = { rows: [{ n: 'A-500', d: '2026-01-01', a: '400' }, { n: 'A-501', d: '2026-03-01', a: '1000' }], ref: 'n', amount: 'a', date: 'd' };
  const pay = { rows: [{ d: '2026-02-20', a: '400', r: '' }, { d: '2026-03-02', a: '600', r: 'A501' }], ref: 'r', amount: 'a', date: 'd' };
  const r = L.reconcile(inv, pay, { days: 10 });
  assert.strictEqual(r.invoices[0].status, 'Unpaid'); // 50 days apart
  assert.strictEqual(r.invoices[1].status, 'Part paid');
  assert.strictEqual(r.invoices[1].balance, 400);
  const r2 = L.reconcile(inv, pay, { days: 60 });
  assert.strictEqual(r2.invoices[0].status, 'Paid');
});

test('validate checks required, email, number, date, unique, regex and min/max', () => {
  const d = t(`ID,Email,Amount,Date,Postcode,State
1,ok@shop.com.au,10,01/02/2026,2000,NSW
2,not-an-email,abc,31/02/x,20000,QLD
2,,-5,2026-13-45,3000,Tas
4,me@x.io,"1,200",15/06/2026,,XYZ`);
  const v = L.validate(d.rows, [
    { col: 'Email', type: 'required' }, { col: 'Email', type: 'email' }, { col: 'Amount', type: 'number' },
    { col: 'Amount', type: 'min', value: '0' }, { col: 'Amount', type: 'max', value: '1000' }, { col: 'Date', type: 'date' },
    { col: 'ID', type: 'unique' }, { col: 'Postcode', type: 'regex', value: '^\\d{4}$' }, { col: 'State', type: 'oneOf', value: 'NSW,VIC,QLD,TAS,SA,WA,NT,ACT' }
  ]);
  const count = (col, type) => v.byRule.find((b) => b.col === col && b.type === type).count;
  assert.strictEqual(count('Email', 'required'), 1);
  assert.strictEqual(count('Email', 'email'), 1);
  assert.strictEqual(count('Amount', 'number'), 1);
  assert.strictEqual(count('Amount', 'min'), 2); // -5 and abc
  assert.strictEqual(count('Amount', 'max'), 2); // 1,200 and abc
  assert.strictEqual(count('Date', 'date'), 2);
  assert.strictEqual(count('ID', 'unique'), 2);
  assert.strictEqual(count('Postcode', 'regex'), 1);
  assert.strictEqual(count('State', 'oneOf'), 1);
  assert.strictEqual(v.failures[0].line, 3); // row numbers match Excel (header = row 1)
});

test('validate reports a broken regex instead of throwing', () => {
  const v = L.validate([{ a: 'x' }], [{ col: 'a', type: 'regex', value: '([' }]);
  assert.match(v.failures[0].message, /not valid/);
});

test('suggestRules spots email, date, number and unique ID columns', () => {
  const s = L.suggestRules(customersA.headers, customersA.rows);
  const has = (col, type) => s.some((r) => r.col === col && r.type === type);
  assert.ok(has('Email', 'email'));
  assert.ok(has('Last order', 'date'));
  assert.ok(has('Balance', 'number'));
  assert.ok(has('Customer ID', 'unique'));
});

test('report HTML escapes values and includes every section; export sets flatten results', () => {
  const cmp = L.compare(customersA, t('Customer ID,Name\nC001,<script>x</script>'), ['Customer ID']);
  const html = L.reportHtml({ title: 'Test', when: '2026-11-08', compare: { result: cmp, nameA: 'A.csv', nameB: 'B.csv', headersA: customersA.headers, headersB: ['Customer ID', 'Name'] },
    validation: { result: L.validate(customersA.rows, [{ col: 'Email', type: 'email' }]) }, dups: { groups: [], cols: ['Name'] } });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!html.includes('<script>x'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Data checks') && html.includes('Duplicates on Name'));
  const sets = L.exportSets({ compare: { result: cmp } });
  assert.deepStrictEqual(sets.map((s) => s.name), ['Changed', 'Only in A', 'Only in B']);
  assert.strictEqual(sets[0].rows[0].Column, 'Name');
});
