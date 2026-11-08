const test = require('node:test');
const assert = require('node:assert');
const B = require('../assets/core.js');
const L = require('../apps/subscription-detector/lib.js');

const TODAY = '2026-11-08';
const tx = (date, amount, desc) => ({ date, amount, desc, category: '' });
const monthly = (desc, amounts, startMonth, day) => amounts.map((a, i) => {
  const m = startMonth + i, y = 2026 + Math.floor((m - 1) / 12), mm = ((m - 1) % 12) + 1;
  return tx(y + '-' + String(mm).padStart(2, '0') + '-' + String(day).padStart(2, '0'), -a, desc);
});

test('reads a CommBank-style statement through the Money app reader', () => {
  const rows = B.csv.parse(L.sampleCSV(TODAY));
  const r = L.readStatement(rows);
  assert.strictEqual(r.skipped, 0);
  assert.ok(r.transactions.length > 200);
  assert.ok(r.transactions.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date)));
  assert.ok(r.transactions.some((t) => t.category === 'Subscriptions'));
});

test('reads a header + debit/credit statement', () => {
  const rows = B.csv.parse('Date,Description,Debit,Credit,Balance\n01/11/2026,YOUTUBE PREMIUM,16.99,,100\n01/10/2026,PAY FROM ACME,,2000,117');
  const r = L.readStatement(rows);
  assert.deepStrictEqual(r.transactions.map((t) => t.amount), [-16.99, 2000]);
});

test('finds steady monthly subscriptions with yearly cost and next charge', () => {
  const txs = monthly('SPOTIFY P1234 SYDNEY AUS', [13.99, 13.99, 13.99, 13.99, 13.99], 6, 7);
  const s = L.findRecurring(txs, TODAY);
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].name, 'Spotify');
  assert.strictEqual(s[0].cadence, 'Monthly');
  assert.strictEqual(s[0].yearly, 167.88);
  assert.strictEqual(s[0].last, '2026-10-07');
  assert.strictEqual(s[0].next, '2026-11-07');
  assert.strictEqual(s[0].status, 'active');
  assert.strictEqual(s[0].priceChange, null);
});

test('a price rise of more than 15% is still found (the Money app alone would miss it) and flagged', () => {
  const txs = monthly('NETFLIX.COM MELBOURNE AUS', [18.99, 18.99, 18.99, 22.99, 22.99, 22.99, 22.99], 4, 4);
  const s = L.findRecurring(txs, TODAY);
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].amount, 22.99);
  assert.strictEqual(s[0].yearly, 275.88); // yearly uses the current price, not the average
  assert.deepStrictEqual({ from: s[0].priceChange.from, to: s[0].priceChange.to, since: s[0].priceChange.since, up: s[0].priceChange.up }, { from: 18.99, to: 22.99, since: '2026-07-04', up: true });
});

test('small price rise inside tolerance is flagged too; one odd charge is ignored', () => {
  const s = L.findRecurring(monthly('ADOBE CREATIVE CLOUD', [32.99, 32.99, 32.99, 35.99, 35.99], 6, 19), TODAY)[0];
  assert.strictEqual(s.priceChange.to, 35.99);
  assert.ok(Math.abs(s.priceChange.pct - 0.0909) < 0.001);
  const runs = L.priceRuns(monthly('X', [10, 10, 12.5, 10, 10], 1, 1));
  assert.strictEqual(runs.length, 3);
  assert.strictEqual(L.priceChange(monthly('X', [10, 10, 12.5, 10, 10], 1, 1)), null);
});

test('charges that stopped are marked stopped, not counted', () => {
  const txs = monthly('STAN.COM.AU SYDNEY', [12, 12, 12, 12], 3, 11).concat(monthly('KAYO SPORTS', [25, 25, 25, 25, 25], 6, 16));
  const s = L.findRecurring(txs, TODAY);
  const stan = s.find((x) => x.key.startsWith('STAN'));
  assert.strictEqual(stan.status, 'stopped');
  assert.strictEqual(s[s.length - 1], stan, 'stopped ones sort last');
  const sum = L.summary(s, {});
  assert.strictEqual(sum.count, 1);
  assert.strictEqual(sum.stopped, 1);
  assert.strictEqual(sum.yearly, 300);
});

test('rent, groceries and transfers are not reported as subscriptions', () => {
  const r = L.readStatement(B.csv.parse(L.sampleCSV(TODAY)));
  const names = L.findRecurring(r.transactions, TODAY).map((s) => s.name.toLowerCase());
  assert.ok(!names.some((n) => /rent|belle|woolworths|aldi|cafe/.test(n)), names.join(','));
  ['netflix', 'spotify', 'kayo sports', 'snap fitness', 'audible'].forEach((n) => assert.ok(names.includes(n), n));
  const snap = L.findRecurring(r.transactions, TODAY).find((s) => s.name === 'Snap Fitness');
  assert.strictEqual(snap.cadence, 'Fortnightly');
  assert.strictEqual(snap.yearly, 829.4);
});

test('summary: leak = cancel (not yet cancelled) + review; saved counts cancelled', () => {
  const subs = [{ key: 'A', yearly: 100, status: 'active' }, { key: 'B', yearly: 200, status: 'active', priceChange: { up: true } }, { key: 'C', yearly: 50, status: 'active' }, { key: 'D', yearly: 30, status: 'active' }];
  const s = L.summary(subs, { A: { decision: 'cancel', cancelled: true }, B: { decision: 'review' }, C: { decision: 'keep' } });
  assert.strictEqual(s.yearly, 380);
  assert.strictEqual(s.saved, 100);
  assert.strictEqual(s.leak, 200);
  assert.strictEqual(s.unanswered, 30);
  assert.strictEqual(s.unansweredCount, 1);
  assert.strictEqual(s.increases, 1);
});

test('cancel steps give generic help and a plain web search link', () => {
  const c = L.cancelSteps({ key: 'APPLE BILL', name: 'Apple', sample: 'APPLE.COM/BILL SYDNEY', next: '2026-11-13' });
  assert.match(c.tip, /Subscriptions/);
  assert.ok(c.search.startsWith('https://www.google.com/search?q='));
  assert.ok(c.steps.some((s) => s.includes('13 Nov 2026')));
  assert.strictEqual(L.cancelSteps({ key: 'KAYO', name: 'Kayo', next: '2026-11-16' }).tip, '');
});

test('trial reminders land two days before the trial ends', () => {
  const ev = L.trialEvents([{ id: 't', name: 'Paramount+', ends: '2026-12-01', price: 9.99, cadence: 'Monthly' }, { name: 'bad', ends: 'soon' }]);
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].date, '2026-11-29');
  assert.match(ev[0].description, /\$9\.99 monthly/);
  assert.strictEqual(L.trialStatus({ ends: '2026-11-10' }, TODAY), 'urgent');
  assert.strictEqual(L.trialStatus({ ends: '2026-11-01' }, TODAY), 'ended');
});

test('review reminders only for active review / uncancelled cancel items', () => {
  const subs = [{ key: 'A', name: 'A', status: 'active', next: '2026-11-20', amount: 10, yearly: 120, cadence: 'Monthly' }, { key: 'B', name: 'B', status: 'active', next: '2026-11-20', amount: 5, yearly: 60, cadence: 'Monthly' }];
  const ev = L.reviewEvents(subs, { A: { decision: 'review' }, B: { decision: 'cancel', cancelled: true } });
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].date, '2026-11-17');
});

test('merging the same statement twice adds nothing', () => {
  const r = L.readStatement(B.csv.parse(L.sampleCSV(TODAY)));
  const m = L.merge(r.transactions, r.transactions);
  assert.strictEqual(m.added.length, 0);
  assert.strictEqual(m.duplicates, r.transactions.length);
});
