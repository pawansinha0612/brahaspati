const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/business-admin/lib.js');

const TODAY = '2026-11-08';
const inv = (o) => Object.assign({ kind: 'invoice', status: 'sent', payments: [], discount: { type: 'pct', value: 0 }, gst: true, lines: [] }, o);

test('totals: discount before GST, rounding to cents', () => {
  const t = L.totals({ lines: [{ qty: 3, price: 33.33 }, { qty: 1, price: 0.015 }], discount: { type: 'pct', value: 10 }, gst: true });
  assert.deepStrictEqual(t, { subtotal: 100.01, discount: 10, net: 90.01, gst: 9, total: 99.01 });
  const a = L.totals({ lines: [{ qty: 2, price: 450 }], discount: { type: 'amt', value: 100 }, gst: false });
  assert.deepStrictEqual(a, { subtotal: 900, discount: 100, net: 800, gst: 0, total: 800 });
  // a fixed discount can never exceed the subtotal
  assert.strictEqual(L.totals({ lines: [{ qty: 1, price: 50 }], discount: { type: 'amt', value: 80 } }).total, 0);
});

test('status: draft, sent, overdue, paid (full or by payments), quote expiry', () => {
  const lines = [{ qty: 1, price: 100 }];
  assert.strictEqual(L.status(inv({ lines, status: 'draft', due: '2026-01-01' }), TODAY), 'draft');
  assert.strictEqual(L.status(inv({ lines, due: '2026-11-08' }), TODAY), 'sent'); // due today is not overdue yet
  assert.strictEqual(L.status(inv({ lines, due: '2026-11-07' }), TODAY), 'overdue');
  assert.strictEqual(L.status(inv({ lines, due: '2026-11-01', payments: [{ amount: 60 }, { amount: 50 }] }), TODAY), 'paid');
  assert.strictEqual(L.status(inv({ lines, due: '2026-11-01', payments: [{ amount: 60 }] }), TODAY), 'overdue');
  assert.strictEqual(L.status({ kind: 'quote', status: 'sent', due: '2026-11-01' }, TODAY), 'expired');
  assert.strictEqual(L.status({ kind: 'quote', status: 'accepted', due: '2026-11-01' }, TODAY), 'accepted');
});

test('nextNumber continues the highest number per kind and prefix', () => {
  const docs = [{ kind: 'invoice', number: 'INV-0009' }, { kind: 'invoice', number: 'INV-0010' }, { kind: 'quote', number: 'Q-0003' }, { kind: 'invoice', number: 'OLD-77' }];
  assert.strictEqual(L.nextNumber(docs, 'invoice', 'INV-'), 'INV-0011');
  assert.strictEqual(L.nextNumber(docs, 'quote', 'Q-'), 'Q-0004');
  assert.strictEqual(L.nextNumber([], 'invoice', 'INV-'), 'INV-0001');
  assert.strictEqual(L.nextNumber([{ kind: 'invoice', number: 'INV-99999' }], 'invoice', 'INV-'), 'INV-100000');
});

test('quoteToInvoice copies lines (deep), discount, GST and links back to the quote', () => {
  const q = { kind: 'quote', number: 'Q-0001', customerId: 'c4', lines: [{ desc: 'Site', qty: 1, price: 3800 }], discount: { type: 'pct', value: 5 }, gst: true, notes: 'Deposit 50%' };
  const docs = [{ kind: 'invoice', number: 'INV-0007' }, q];
  const i = L.quoteToInvoice(q, docs, { termsDays: 14 }, TODAY, 'x1');
  assert.strictEqual(i.number, 'INV-0008');
  assert.strictEqual(i.kind, 'invoice');
  assert.strictEqual(i.fromQuote, 'Q-0001');
  assert.strictEqual(i.due, '2026-11-22');
  assert.strictEqual(L.totals(i).total, L.totals(q).total);
  i.lines[0].price = 1;
  assert.strictEqual(q.lines[0].price, 3800);
});

test('reminders: due-soon and three escalation levels, most overdue first, paid/draft excluded', () => {
  const customers = [{ id: 'c1', name: 'Harbour Cafe', contact: 'Mia Nguyen', email: 'a@b.com' }];
  const lines = [{ qty: 1, price: 100 }];
  const docs = [
    inv({ id: 1, number: 'INV-1', customerId: 'c1', lines, due: '2026-11-12' }), // due in 4 days -> level 0
    inv({ id: 2, number: 'INV-2', customerId: 'c1', lines, due: '2026-11-01' }), // 7 overdue -> 1
    inv({ id: 3, number: 'INV-3', customerId: 'c1', lines, due: '2026-10-15' }), // 24 -> 2
    inv({ id: 4, number: 'INV-4', customerId: 'c1', lines, due: '2026-08-01' }), // 99 -> 3
    inv({ id: 5, number: 'INV-5', customerId: 'c1', lines, due: '2026-08-01', payments: [{ amount: 110 }] }),
    inv({ id: 6, number: 'INV-6', customerId: 'c1', lines, due: '2026-08-01', status: 'draft' }),
    inv({ id: 7, number: 'INV-7', customerId: 'c1', lines, due: '2026-12-30' }) // too far ahead
  ];
  const r = L.reminders(docs, customers, TODAY, 7);
  assert.deepStrictEqual(r.map((x) => x.doc.number), ['INV-4', 'INV-3', 'INV-2', 'INV-1']);
  assert.deepStrictEqual(r.map((x) => x.level), [3, 2, 1, 0]);
  assert.strictEqual(r[0].balance, 110);
});

test('reminderEmail escalates tone and mailto encodes safely', () => {
  const doc = inv({ number: 'INV-0042', due: '2026-09-01', lines: [{ qty: 1, price: 1000 }], payments: [{ amount: 100 }] });
  const cust = { name: 'Bondi Plumbing', contact: 'Jack Wilson', email: 'jack@bondi.example' };
  const s = { name: 'Sinha Digital', payDetails: 'BSB 062-000 Acc 1234' };
  const l1 = L.reminderEmail(doc, cust, s, 1, TODAY);
  assert.match(l1.subject, /Friendly reminder/);
  assert.match(l1.body, /^Hi Jack,/);
  assert.match(l1.body, /\$1,000\.00/); // balance 1100 - 100
  assert.match(l1.body, /BSB 062-000/);
  const l3 = L.reminderEmail(doc, cust, s, 3, TODAY);
  assert.match(l3.subject, /Final notice.*68 days overdue/);
  assert.match(l3.body, /by 2026-11-15/);
  const m = L.mailto(cust.email, l1.subject, 'a & b\nc');
  assert.ok(m.startsWith('mailto:jack@bondi.example?subject=Friendly%20reminder'));
  assert.ok(m.endsWith('&body=a%20%26%20b%0Ac'));
});

test('GST from GST-inclusive amounts and BAS quarters', () => {
  assert.strictEqual(L.gstFromInclusive(110), 10);
  assert.strictEqual(L.gstFromInclusive(87.99), 8);
  assert.deepStrictEqual(L.quarterOf('2026-08-15'), { key: '2026-07', label: 'Jul–Sep 2026', start: '2026-07-01', end: '2026-09-30' });
  assert.strictEqual(L.quarterOf('2027-02-28').label, 'Jan–Mar 2027');
});

test('gstSummary: accrual vs cash basis', () => {
  const docs = [
    inv({ date: '2026-09-20', lines: [{ qty: 1, price: 1000 }], payments: [{ date: '2026-10-05', amount: 550 }] }),
    inv({ date: '2026-10-02', lines: [{ qty: 1, price: 200 }], gst: true }),
    inv({ date: '2026-10-02', lines: [{ qty: 1, price: 999 }], status: 'draft' })
  ];
  const exp = [{ date: '2026-10-10', amount: 330, gst: 30 }, { date: '2026-08-01', amount: 110, gst: 10 }];
  const acc = L.gstSummary(docs, exp, 'accrual');
  assert.deepStrictEqual(acc.map((q) => [q.label, q.collected, q.paid, q.net]), [['Oct–Dec 2026', 20, 30, -10], ['Jul–Sep 2026', 100, 10, 90]]);
  const cash = L.gstSummary(docs, exp, 'cash');
  assert.deepStrictEqual(cash.map((q) => [q.label, q.collected, q.paid]), [['Oct–Dec 2026', 50, 30], ['Jul–Sep 2026', 0, 10]]);
});

test('monthly income vs expenses excludes GST and drafts', () => {
  const docs = [inv({ date: '2026-11-02', lines: [{ qty: 1, price: 500 }] }), inv({ date: '2026-10-02', lines: [{ qty: 2, price: 100 }], gst: false }), inv({ date: '2026-11-03', status: 'draft', lines: [{ qty: 1, price: 9999 }] })];
  const exp = [{ date: '2026-11-05', amount: 110, gst: 10 }];
  const m = L.monthly(docs, exp, TODAY, 3);
  assert.deepStrictEqual(m.map((x) => x.month), ['2026-09', '2026-10', '2026-11']);
  assert.deepStrictEqual(m[2], { month: '2026-11', income: 500, expenses: 100, profit: 400 });
  assert.strictEqual(m[1].income, 200);
});

test('aged receivables and top customers on the sample data', () => {
  const s = L.sample(TODAY);
  const a = L.aged(s.docs, s.customers, TODAY);
  // INV-0002 (86 days over) 61-90; INV-0003 (48) 31-60; INV-0004 (21) and INV-0005 (6) 0-30; INV-0006 not yet due
  assert.deepStrictEqual(a.totals.map((x) => x > 0), [true, true, true, true, false]);
  assert.strictEqual(a.totals[3], 1375); // (450 + 3 x 300 - 100) + 10% GST
  assert.strictEqual(a.total, L.r2(a.totals.reduce((s, x) => s + x, 0)));
  const top = L.topCustomers(s.docs, s.customers);
  assert.strictEqual(top[0].name, 'Harbour Cafe');
  assert.ok(top.every((c, i) => i === 0 || top[i - 1].invoiced >= c.invoiced));
});

test('docHtml prints a tax invoice with escaped content and balance', () => {
  const d = inv({ number: 'INV-0009', date: '2026-11-01', due: '2026-11-15', lines: [{ desc: 'Design <b>work</b>', qty: 2, price: 150 }], payments: [{ amount: 100 }], notes: 'Thanks' });
  const h = L.docHtml(d, { name: 'Harbour & Co' }, { name: 'Studio', abn: '12 345 678 901', payDetails: 'BSB 1' }, TODAY);
  assert.match(h, /TAX INVOICE/);
  assert.match(h, /ABN 12 345 678 901/);
  assert.match(h, /Harbour &amp; Co/);
  assert.ok(!h.includes('<b>work</b>'));
  assert.match(h, /GST \(10%\)<\/td><td class="n">\$30\.00/);
  assert.match(h, /Balance due.*\$230\.00/);
  assert.match(L.docHtml(Object.assign({}, d, { gst: false }), {}, {}, TODAY), /<h1>INVOICE<\/h1>/);
});

test('CSV rows and backup validation', () => {
  const s = L.sample(TODAY);
  const rows = L.docsCsvRows(s.docs, s.customers, TODAY);
  assert.strictEqual(rows.length, s.docs.length);
  assert.strictEqual(rows.find((r) => r.Number === 'INV-0002').Status, 'overdue');
  assert.strictEqual(L.expensesCsvRows(s.expenses)[0].GST, 8);
  assert.throws(() => L.validateBackup({ app: 'finance' }), /different app/);
  assert.throws(() => L.validateBackup({ customers: 'x' }), /should be a list/);
  assert.strictEqual(L.validateBackup(JSON.parse(JSON.stringify(Object.assign({ app: 'business-admin' }, s)))).docs.length, s.docs.length);
});
