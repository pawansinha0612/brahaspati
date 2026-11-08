const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/vendor-compare/lib.js');

const QUOTE_A = `BrightSpark Cleaning Pty Ltd
Set-up and initial deep clean: $1,200 one-off
Regular cleaning: $1,850 per month
Window cleaning: $480 per quarter
Sanitary and bin service: $2.40 per bin
All prices exclude GST.
Minimum contract term: 24 months. The agreement renews automatically for a further 12 months unless 60 days written notice is given.
Prices increase by 4% per annum on each anniversary.
Payment terms: 14 days from invoice.
Response time: within 4 hours for urgent requests.
Includes:
- Vacuuming and mopping
- Kitchen and bathrooms
Excludes:
- Carpet steam cleaning
- After-hours call-outs.`;

const QUOTE_B = `Harbour Facility Services
Monthly fee $2,090 inc GST. One-off onboarding fee $550 inc GST.
No lock-in contract, month to month. Thirty days notice to cancel.
99.5% availability guarantee. Net 30.`;

const QUOTE_C = `Green Leaf Commercial Cleaning
Fixed price $21,000 per year plus GST, paid annually in advance.
Contract term of 3 years. 3 months notice required.
Price reviewed each year in line with CPI. 2 year warranty on dispensers.`;

test('extract: prices are classified as one-off, monthly, quarterly→annual and per unit', () => {
  const v = L.extract(QUOTE_A);
  assert.strictEqual(v.name, 'BrightSpark Cleaning Pty Ltd');
  assert.strictEqual(v.oneOff, 1200);
  assert.strictEqual(v.monthly, 1850);
  assert.strictEqual(v.annual, 1920); // $480 a quarter × 4
  assert.strictEqual(v.perUnit, 2.4);
  assert.strictEqual(v.unitLabel, 'bin');
  assert.strictEqual(v.gst, 'ex');
});

test('extract: contract terms, notice, payment, SLA, auto-renewal and escalation', () => {
  const v = L.extract(QUOTE_A);
  assert.strictEqual(v.contractMonths, 24);
  assert.strictEqual(v.noticeDays, 60);
  assert.strictEqual(v.paymentTerms, '14 days');
  assert.strictEqual(v.responseHours, 4);
  assert.strictEqual(v.autoRenew, true);
  assert.strictEqual(v.escalationPct, 4);
  assert.deepStrictEqual(v.inclusions, ['Vacuuming and mopping', 'Kitchen and bathrooms']);
  assert.deepStrictEqual(v.exclusions, ['Carpet steam cleaning', 'After-hours call-outs']);
});

test('extract: GST inclusive, month-to-month, word numbers, uptime and Net 30', () => {
  const v = L.extract(QUOTE_B);
  assert.strictEqual(v.gst, 'inc');
  assert.strictEqual(v.monthly, 2090);
  assert.strictEqual(v.oneOff, 550);
  assert.strictEqual(v.contractMonths, 0);
  assert.strictEqual(v.noticeDays, 30);
  assert.strictEqual(v.uptime, 99.5);
  assert.strictEqual(v.paymentTerms, '30 days');
  assert.strictEqual(v.autoRenew, false);
});

test('extract: years → months, months notice → days, CPI escalation assumed at 3%, payment in advance', () => {
  const v = L.extract(QUOTE_C);
  assert.strictEqual(v.annual, 21000);
  assert.strictEqual(v.gst, 'ex');
  assert.strictEqual(v.contractMonths, 36);
  assert.strictEqual(v.noticeDays, 90);
  assert.strictEqual(v.warrantyMonths, 24);
  assert.strictEqual(v.escalationPct, 3);
  assert.match(v.escalationNote, /CPI/);
  assert.match(v.paymentTerms, /In advance/);
});

test('extract: totals and discounts are not counted as prices', () => {
  const v = L.extract('Item A $100 per month\nItem B $50 per month\nTotal $150 per month\nDiscount $20');
  assert.strictEqual(v.monthly, 150);
  assert.strictEqual(v.oneOff, '');
});

test('tco: GST-normalised, escalation compounds yearly, usage uses volume', () => {
  const v = { oneOff: 1100, monthly: 110, annual: 0, perUnit: 1.1, gst: 'inc', escalationPct: 10 };
  const t = L.tco(v, { years: 2, volume: 100 });
  // ex GST: one-off 1000, monthly 100 (1200/yr), unit 1 × 100 × 12 = 1200/yr; year 2 ×1.1
  assert.strictEqual(t.oneOff, 1000);
  assert.strictEqual(t.recurring, 1200 + 1320);
  assert.strictEqual(t.usage, 1200 + 1320);
  assert.strictEqual(t.total, 1000 + 2520 + 2520);
  assert.deepStrictEqual(t.perYear, [3400, 2640]);
  const inc = L.tco(v, { years: 2, volume: 100, basis: 'inc' });
  assert.strictEqual(inc.total, 6644); // 6040 × 1.1
  const exQuote = L.tco({ monthly: 100, gst: 'ex' }, { years: 1, basis: 'inc' });
  assert.strictEqual(exQuote.total, 1320);
  assert.strictEqual(L.tco({ monthly: 100, gst: 'unknown' }, { years: 1 }).gstAssumed, true);
});

test('priceScores: cheapest 5, dearest 1, linear between; unpriced is null', () => {
  assert.deepStrictEqual(L.priceScores([100, 200, 150, 0]), [5, 1, 3, null]);
  assert.deepStrictEqual(L.priceScores([80, 80]), [5, 5]);
});

const vendors = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Bravo' }];
const criteria = [{ id: 'price', name: 'Price', weight: 50 }, { id: 'svc', name: 'Service', weight: 50 }];

test('weighted: proportional weights, missing scores count as zero', () => {
  const scores = { a: { price: { score: 5 }, svc: { score: 3 } }, b: { price: { score: 4 } } };
  const r = L.weighted(vendors, criteria, scores);
  assert.strictEqual(r[0].score, 4);
  assert.strictEqual(r[0].pct, 80);
  assert.strictEqual(r[1].score, 2);
  assert.strictEqual(r[1].missing, 1);
  assert.strictEqual(L.winner(r).name, 'Alpha');
  // auto scores override manual ones for that criterion
  const r2 = L.weighted(vendors, criteria, scores, { price: { a: 1, b: 5 } });
  assert.strictEqual(r2[1].score, 2.5);
});

test('sensitivity: detects a close call that flips, and a robust result that does not', () => {
  const close = { a: { price: { score: 5 }, svc: { score: 2 } }, b: { price: { score: 2 }, svc: { score: 4.8 } } };
  // base: A 3.5, B 3.4. Service +20% → B wins.
  const s = L.sensitivity(vendors, criteria, close, null, 0.2, 200, 7);
  assert.strictEqual(s.winner.name, 'Alpha');
  assert.strictEqual(s.stable, false);
  assert.ok(s.flips.some((f) => f.criterion === 'Service' && f.change === '+20%' && f.winner === 'Bravo'));
  assert.ok(s.share[0].share > 0 && s.share[1].share > 0);
  const clear = { a: { price: { score: 5 }, svc: { score: 5 } }, b: { price: { score: 2 }, svc: { score: 2 } } };
  const s2 = L.sensitivity(vendors, criteria, clear, null, 0.2, 100, 7);
  assert.strictEqual(s2.stable, true);
  assert.strictEqual(s2.share[0].share, 1);
  assert.strictEqual(s2.margin, 3);
});

test('redFlags: missing SLA, auto-renewal, escalation, long lock-in, GST unclear', () => {
  const f = L.redFlags(L.extract(QUOTE_A), { lockInMonths: 12, years: 1, volume: 0 });
  const text = f.map((x) => x.text).join(' | ');
  assert.match(text, /renews automatically/);
  assert.match(text, /Prices rise 4%/);
  assert.match(text, /Long lock-in: 24 months/);
  assert.match(text, /longer than your 1-year/);
  assert.match(text, /no expected volume/);
  const g = L.redFlags({ gst: 'unknown', monthly: 100 }, {});
  const gt = g.map((x) => x.text).join(' | ');
  assert.match(gt, /No service level/);
  assert.match(gt, /include GST/);
  assert.match(gt, /Contract length not stated/);
  assert.ok(g.some((x) => x.level === 'bad'));
});

test('questions: asks for what is missing and challenges risky terms', () => {
  const q = L.questions({ gst: 'unknown', autoRenew: true, escalationPct: 5, contractMonths: 36, perUnit: 2, unitLabel: 'user', exclusions: [] });
  const all = q.join(' ');
  assert.match(all, /inclusive or exclusive of GST/);
  assert.ok(!/full price breakdown/.test(all)); // priced via perUnit → no breakdown question
  assert.match(all, /automatic renewal/);
  assert.match(all, /price increases/);
  assert.match(all, /per-user rate/);
  assert.match(all, /shorter initial term/);
  assert.match(all, /notice is needed to cancel/);
  assert.match(all, /service levels/);
});

test('bestIndex and rows: lowest cost, highest uptime, ties and too few values', () => {
  assert.deepStrictEqual(L.bestIndex([300, 200, 200], 'low'), [1, 2]);
  assert.deepStrictEqual(L.bestIndex([99.5, '', 99.9], 'high'), [2]);
  assert.deepStrictEqual(L.bestIndex([5, 5], 'low'), []);
  assert.deepStrictEqual(L.bestIndex([5, ''], 'low'), []);
  const vs = [L.extract(QUOTE_A), L.extract(QUOTE_B)]; vs[0].id = 'a'; vs[1].id = 'b';
  const tc = vs.map((v) => L.tco(v, { years: 3 }));
  const rows = L.rows(vs, tc);
  const tco = rows.find((r) => r.label === 'Total cost of ownership');
  assert.deepStrictEqual(tco.best, [tc[0].total < tc[1].total ? 0 : 1]);
  assert.deepStrictEqual(rows.find((r) => r.label === 'Contract (months)').best, [1]);
});

test('memoHTML: names the winner, escapes vendor names and lists flags', () => {
  const vs = [Object.assign(L.extract(QUOTE_A), { id: 'a', name: 'A <b>&</b> Co' }), Object.assign(L.extract(QUOTE_B), { id: 'b' })];
  const crit = [{ id: 'price', name: 'Total cost', weight: 60, auto: true }, { id: 'q', name: 'Quality', weight: 40 }];
  const tcos = vs.map((v) => L.tco(v, { years: 3 }));
  const ps = L.priceScores(tcos.map((t) => t.total)); const auto = { price: { a: ps[0], b: ps[1] } };
  const scores = { a: { q: { score: 3 } }, b: { q: { score: 4 } } };
  const calc = { tcos, results: L.weighted(vs, crit, scores, auto), sensitivity: L.sensitivity(vs, crit, scores, auto, 0.2, 50, 1), flags: vs.map((v) => L.redFlags(v, {})) };
  const html = L.memoHTML({ title: 'Cleaning', date: '2026-11-08', vendors: vs, criteria: crit, years: 3, basis: 'ex', sensPct: 0.2 }, calc);
  assert.match(html, /We recommend <b>Harbour Facility Services<\/b>/);
  assert.match(html, /A &lt;b&gt;&amp;&lt;\/b&gt; Co/);
  assert.ok(!/<b>&<\/b>/.test(html));
  assert.match(html, /renews automatically/);
});
