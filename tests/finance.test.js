const test = require('node:test');
const assert = require('node:assert');
const B = require('../assets/core.js');
const L = require('../apps/finance/lib.js');

function load(csv) {
  const rows = B.csv.parse(csv);
  const det = L.detectColumns(rows);
  const res = L.toTransactions(rows, det);
  res.transactions.forEach((t) => { t.category = L.categorise(t, L.DEFAULT_RULES); });
  return { det, txs: res.transactions, skipped: res.skipped };
}

test('parses Australian bank date and amount formats', () => {
  assert.strictEqual(L.parseDate('08/11/2026'), '2026-11-08');
  assert.strictEqual(L.parseDate('8/1/26'), '2026-01-08');
  assert.strictEqual(L.parseDate('08 Nov 2026'), '2026-11-08');
  assert.strictEqual(L.parseDate('2026-11-08'), '2026-11-08');
  assert.strictEqual(L.parseDate('20261108'), '2026-11-08');
  assert.strictEqual(L.parseDate('31/02/2026'), null);
  assert.strictEqual(L.parseAmount('-$1,234.50'), -1234.5);
  assert.strictEqual(L.parseAmount('+3,150.00'), 3150);
  assert.strictEqual(L.parseAmount('45.00 DR'), -45);
  assert.ok(isNaN(L.parseAmount('')));
});

test('CommBank no-header export: finds date, amount, description and running balance', () => {
  const csv = [
    '05/11/2026,-12.50,"WOOLWORTHS 1234 SYDNEY NS AUS Card xx1234",+1987.50',
    '04/11/2026,+2000.00,"Salary ACME PTY LTD",+2000.00',
    '06/11/2026,-22.99,"NETFLIX.COM MELBOURNE AUS",+1964.51',
    '07/11/2026,-4.80,"TRANSPORTFORNSW OPAL SYDNEY",+1959.71'
  ].join('\n');
  const { det, txs } = load(csv);
  assert.strictEqual(det.hasHeader, false);
  assert.deepStrictEqual([det.map.date, det.map.amount, det.map.description, det.map.balance], [0, 1, 2, 3]);
  assert.strictEqual(txs.length, 4);
  assert.deepStrictEqual(txs.map((t) => t.category), ['Groceries', 'Income', 'Subscriptions', 'Transport']);
});

test('Westpac-style header with separate debit and credit columns', () => {
  const csv = 'Bank Account,Date,Narrative,Debit Amount,Credit Amount,Balance,Categories,Serial\n' +
    '732-000 123456,05/11/2026,"DEBIT CARD PURCHASE COLES 0789 NORTH SYDNEY",54.20,,1200.00,OTHER,\n' +
    '732-000 123456,06/11/2026,"DEPOSIT PAY FROM EMPLOYER",,2500.00,3700.00,PAYMENT,\n' +
    '732-000 123456,07/11/2026,"AGL SALES PTY LTD",310.45,,3389.55,OTHER,\n';
  const { det, txs } = load(csv);
  assert.strictEqual(det.hasHeader, true);
  assert.strictEqual(det.map.date, 1);
  assert.strictEqual(det.map.description, 2);
  assert.strictEqual(det.map.debit, 3);
  assert.strictEqual(det.map.credit, 4);
  assert.strictEqual(det.map.balance, 5);
  assert.deepStrictEqual(txs.map((t) => t.amount), [-54.2, 2500, -310.45]);
  assert.deepStrictEqual(txs.map((t) => t.category), ['Groceries', 'Income', 'Utilities']);
});

test('NAB / ING style headers with a single signed Amount column', () => {
  const nab = 'Date,Amount,Account Number,,Transaction Type,Transaction Details,Balance,Category,Merchant Name\n' +
    '06 Nov 26,-65.95,083-123,,DEBIT,ANYTIME FITNESS CROWS NEST,1500.00,,\n';
  let r = load(nab);
  assert.strictEqual(r.det.map.amount, 1);
  assert.strictEqual(r.det.map.description, 5);
  assert.strictEqual(r.txs[0].date, '2026-11-06');
  assert.strictEqual(r.txs[0].category, 'Health');
  const ing = 'Date,Description,Credit,Debit,Balance\n07/11/2026,Visa Purchase - Receipt 123 ALDI STORES 45,,-38.10,900.00\n';
  r = load(ing);
  assert.strictEqual(r.txs[0].amount, -38.1);
  assert.strictEqual(r.txs[0].category, 'Groceries');
});

test('re-importing the same statement adds nothing, but genuine repeat charges in one file are kept', () => {
  const day = { date: '2026-11-03', desc: 'TRANSPORTFORNSW OPAL', amount: -3.2 };
  const first = L.mergeTransactions([], [day, Object.assign({}, day), { date: '2026-11-04', desc: 'COLES', amount: -20 }]);
  assert.strictEqual(first.added.length, 3); // two identical Opal taps the same day are real
  const again = L.mergeTransactions(first.all, [day, Object.assign({}, day), { date: '2026-11-04', desc: 'COLES', amount: -20 }, { date: '2026-11-05', desc: 'COLES', amount: -9 }]);
  assert.strictEqual(again.added.length, 1);
  assert.strictEqual(again.duplicates, 3);
});

test('keyword rules respect word starts and learned rules win', () => {
  assert.strictEqual(L.categorise({ desc: 'PAKISTAN CONSULATE FEE', amount: -50 }, L.DEFAULT_RULES), 'Uncategorised');
  assert.strictEqual(L.categorise({ desc: 'STAN.COM.AU SYDNEY', amount: -12 }, L.DEFAULT_RULES), 'Subscriptions');
  assert.strictEqual(L.categorise({ desc: 'CURRENT AFFAIRS MAGAZINE', amount: -5 }, L.DEFAULT_RULES), 'Uncategorised');
  assert.strictEqual(L.categorise({ desc: 'Transfer to Goal Saver', amount: -500 }, L.DEFAULT_RULES), 'Savings');
  const rules = L.learnRule(L.DEFAULT_RULES, 'COLES EXPRESS 1234 MOSMAN', 'Fuel');
  assert.strictEqual(L.categorise({ desc: 'COLES EXPRESS 9999 MOSMAN', amount: -70 }, rules), 'Fuel');
  assert.strictEqual(L.categorise({ desc: 'COLES 0789 NORTH SYDNEY', amount: -40 }, rules), 'Groceries');
});

test('applyRules leaves hand-set categories alone', () => {
  const txs = [{ desc: 'WOOLWORTHS 1', amount: -10, category: 'Gifts & donations', manualCat: true }, { desc: 'WOOLWORTHS 2', amount: -10, category: 'Uncategorised' }];
  const out = L.applyRules(txs, L.DEFAULT_RULES);
  assert.deepStrictEqual(out.map((t) => t.category), ['Gifts & donations', 'Groceries']);
});

test('monthly summary: transfers ignored, savings counted separately, refunds reduce spend', () => {
  const txs = [
    { date: '2026-10-02', amount: 4000, category: 'Income' },
    { date: '2026-10-03', amount: -1000, category: 'Rent & mortgage' },
    { date: '2026-10-04', amount: -200, category: 'Shopping' },
    { date: '2026-10-05', amount: 50, category: 'Shopping' },
    { date: '2026-10-06', amount: -500, category: 'Savings' },
    { date: '2026-10-07', amount: -300, category: 'Transfers' }
  ];
  const [m] = L.monthlySummary(txs);
  assert.strictEqual(m.income, 4000);
  assert.strictEqual(m.spend, 1150);
  assert.strictEqual(m.saved, 500);
  assert.strictEqual(m.net, 2850);
  assert.ok(Math.abs(m.savingsRate - 0.7125) < 1e-9);
  assert.deepStrictEqual(L.spendByCategory(txs, '2026-10'), [{ category: 'Rent & mortgage', spent: 1000 }, { category: 'Shopping', spent: 150 }]);
});

test('budget progress flags over and close-to-limit categories', () => {
  const txs = [
    { date: '2026-11-01', amount: -620, category: 'Groceries' },
    { date: '2026-11-02', amount: -270, category: 'Eating out' },
    { date: '2026-11-03', amount: -20, category: 'Transport' }
  ];
  const bp = L.budgetProgress(txs, { Groceries: 600, 'Eating out': 300, Transport: 150, Shopping: 0 }, '2026-11');
  const by = Object.fromEntries(bp.map((b) => [b.category, b]));
  assert.strictEqual(by.Groceries.status, 'over');
  assert.strictEqual(by.Groceries.left, -20);
  assert.strictEqual(by['Eating out'].status, 'close');
  assert.strictEqual(by.Transport.status, 'ok');
  assert.ok(!by.Shopping);
});

test('subscription detector finds monthly and yearly charges, not supermarket shopping', () => {
  const txs = [];
  ['2026-06-03', '2026-07-03', '2026-08-04', '2026-09-03', '2026-10-03'].forEach((d) => txs.push({ date: d, desc: 'NETFLIX.COM MELBOURNE AUS', amount: -22.99 }));
  ['2025-02-10', '2026-02-11'].forEach((d) => txs.push({ date: d, desc: 'AMAZON PRIME AU', amount: -79 }));
  ['2026-06-06', '2026-06-13', '2026-06-20', '2026-06-27', '2026-07-04', '2026-07-11'].forEach((d, i) => txs.push({ date: d, desc: 'WOOLWORTHS 1234', amount: -(60 + i * 23) }));
  ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'].forEach((d) => txs.push({ date: d, desc: 'SQ *KIDS SWIM SCHOOL', amount: -24 }));
  const subs = L.detectSubscriptions(txs);
  const names = subs.map((s) => s.merchant);
  assert.ok(names.includes('NETFLIX MELBOURNE'));
  assert.ok(!names.some((n) => n.startsWith('WOOLWORTHS')));
  const nf = subs.find((s) => s.merchant === 'NETFLIX MELBOURNE');
  assert.strictEqual(nf.cadence, 'Monthly');
  assert.strictEqual(nf.yearly, 275.88);
  assert.strictEqual(nf.nextDue, '2026-11-02');
  const prime = subs.find((s) => s.merchant.startsWith('AMAZON PRIME'));
  assert.strictEqual(prime.cadence, 'Yearly');
  const swim = subs.find((s) => /SWIM/.test(s.merchant));
  assert.strictEqual(swim.cadence, 'Weekly');
  assert.strictEqual(swim.yearly, 1248);
});

test('goal plan works out the monthly amount and flags stretch goals', () => {
  const p = L.goalPlan({ name: 'Car', target: 12000, saved: 3000, date: '2027-11-08' }, '2026-11-08', 500);
  assert.strictEqual(p.remaining, 9000);
  assert.strictEqual(p.monthlyNeeded, 750);
  assert.strictEqual(p.status, 'risk');
  const ok = L.goalPlan({ name: 'Car', target: 12000, saved: 3000, date: '2027-11-08' }, '2026-11-08', 1000);
  assert.strictEqual(ok.status, 'ok');
  assert.strictEqual(L.goalPlan({ target: 100, saved: 120 }, '2026-11-08').status, 'done');
  assert.strictEqual(L.goalPlan({ target: 100, saved: 0, date: '2026-01-01' }, '2026-11-08').status, 'late');
});

test('sample statement round-trips through detection and categorisation', () => {
  const { det, txs } = load(L.sampleCSV('2026-11-07'));
  assert.ok(det.confident);
  assert.ok(txs.length > 100);
  const unc = txs.filter((t) => t.category === 'Uncategorised').length;
  assert.ok(unc / txs.length < 0.1, 'most sample rows should categorise');
  const subs = L.detectSubscriptions(txs).map((s) => s.merchant);
  assert.ok(subs.includes('NETFLIX MELBOURNE') && subs.includes('SPOTIFY SYDNEY'));
});
