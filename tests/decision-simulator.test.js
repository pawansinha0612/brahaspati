const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/decision-simulator/lib.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` expected ${b} ± ${tol}, got ${a}`);
const opt = (o) => Object.assign({ id: 'x', name: 'X', oneOff: { low: 0, likely: 0, high: 0 }, delay: { low: 0, likely: 0, high: 0 }, ramp: 0, lines: [], risks: [], scores: {} }, o);

test('seeded RNG is repeatable and uniform-ish', () => {
  const a = L.rng(7), b = L.rng(7), c = L.rng(8);
  const xs = Array.from({ length: 5 }, a), ys = Array.from({ length: 5 }, b);
  assert.deepStrictEqual(xs, ys);
  assert.notDeepStrictEqual(xs, Array.from({ length: 5 }, c));
  const r = L.rng(1); let s = 0; for (let i = 0; i < 20000; i++) { const v = r(); assert.ok(v >= 0 && v < 1); s += v; }
  near(s / 20000, 0.5, 0.01, 'mean of uniforms');
});

test('triangular draws stay in range and average (low+likely+high)/3', () => {
  const r = L.rng(3), rg = { low: 100, likely: 200, high: 600 }; let s = 0;
  for (let i = 0; i < 40000; i++) { const v = L.triangular(r(), rg); assert.ok(v >= 100 && v <= 600); s += v; }
  near(s / 40000, 300, 4);
  assert.strictEqual(L.triangular(0.3, { low: 5, likely: 5, high: 5 }), 5);
  assert.strictEqual(L.triangular(0, rg), 100);
  assert.strictEqual(L.triangular(1, rg), 600);
  // muddled input is sorted; blank low/high fall back to likely
  assert.deepStrictEqual(L.range({ low: 900, likely: 500, high: 100 }), { low: 100, likely: 500, high: 900 });
  assert.deepStrictEqual(L.range({ low: '', likely: 40, high: '' }), { low: 40, likely: 40, high: 40 });
});

test('NPV: zero rate = plain sum; 12% a year discounts a month-12 payment by 12%', () => {
  assert.strictEqual(L.npv([-1000, 500, 600], 0), 100);
  const f = new Array(13).fill(0); f[12] = 1120;
  near(L.npv(f, 12), 1000, 1e-6);
  near(L.monthlyRate(12), 0.009489, 1e-6);
});

test('payback: first month the running total is back above zero for good', () => {
  assert.strictEqual(L.payback([-300, 100, 100, 100, 100]), 3);
  assert.strictEqual(L.payback([-300, 100, 100]), null);
  assert.strictEqual(L.payback([0, 50, 50]), 0);
  // dips back below zero later (a risk hit) -> payback is the later recovery
  assert.strictEqual(L.payback([-100, 150, -100, 100]), 3);
});

test('cash flows: one-off at month 0, costs from month 1, benefits after the delay with a ramp', () => {
  const o = opt({ oneOff: { likely: 1000 }, delay: { likely: 2 }, ramp: 2, lines: [{ kind: 'cost', likely: 100 }, { kind: 'benefit', likely: 400 }] });
  const b = L.baseCase(o, { horizon: 6, discountRate: 0 });
  // month: 0 -1000 | 1 -100 | 2 -100 | 3 -100+400*0.5 | 4 -100+400 | 5,6 +300
  assert.deepStrictEqual(b.flows, [-1000, -100, -100, 100, 300, 300, 300]);
  assert.strictEqual(b.total, -200);
  assert.strictEqual(b.payback, null);
  assert.deepStrictEqual(b.years, [800]); // month 0 is reported separately as up-front
});

test('base case counts each risk at its expected cost half-way through', () => {
  const o = opt({ risks: [{ label: 'Flood', prob: 25, impact: { low: 0, likely: 4000, high: 8000 } }] });
  const b = L.baseCase(o, { horizon: 12, discountRate: 0 });
  assert.strictEqual(b.flows[6], -1000);
  assert.strictEqual(b.total, -1000);
});

test('simulation is repeatable with the same seed and P10 <= P50 <= P90', () => {
  const d = L.fromTemplate('hireVsAutomate');
  const a = L.simulate(d, { runs: 2000, seed: 11 }), b = L.simulate(d, { runs: 2000, seed: 11 }), c = L.simulate(d, { runs: 2000, seed: 12 });
  assert.deepStrictEqual(a.options.map(o => o.p50), b.options.map(o => o.p50));
  assert.notDeepStrictEqual(a.options.map(o => o.p50), c.options.map(o => o.p50));
  a.options.forEach(o => { assert.ok(o.p10 <= o.p50 && o.p50 <= o.p90); assert.ok(o.min <= o.p10 && o.p90 <= o.max); });
  near(a.options.reduce((s, o) => s + o.probBest, 0), 1, 1e-9, 'probabilities of being best add to 1');
  assert.strictEqual(a.options[0].histogram.reduce((s, h) => s + h.count, 0), 2000);
});

test('simulation of a certain option has no spread; a clearly better option wins every run', () => {
  const sure = opt({ id: 'a', name: 'Sure thing', lines: [{ kind: 'benefit', likely: 1000 }] });
  const worse = opt({ id: 'b', name: 'Worse', lines: [{ kind: 'benefit', low: 100, likely: 300, high: 900 }] });
  const s = L.simulate({ horizon: 12, discountRate: 0, options: [sure, worse] }, { runs: 1000, seed: 5 });
  assert.strictEqual(s.options[0].p10, 12000);
  assert.strictEqual(s.options[0].p90, 12000);
  assert.strictEqual(s.options[0].probBest, 1);
  assert.strictEqual(s.options[1].probLoss, 0);
});

test('risk probability shows up in the simulated chance of loss', () => {
  // Earns 100 a month for 12 months, but a 30% risk costs 5,000 -> loss in about 30% of runs
  const o = opt({ lines: [{ kind: 'benefit', likely: 100 }], risks: [{ label: 'Big fine', prob: 30, impact: { likely: 5000 } }] });
  const s = L.simulate({ horizon: 12, discountRate: 0, options: [o] }, { runs: 5000, seed: 9 });
  near(s.options[0].probLoss, 0.30, 0.03);
});

test('tornado ranks the widest input first and reports both ends', () => {
  const o = opt({ oneOff: { low: 9000, likely: 10000, high: 11000 }, lines: [{ label: 'Sales', kind: 'benefit', low: 500, likely: 1000, high: 2000 }, { label: 'Rent', kind: 'cost', likely: 300 }],
    risks: [{ label: 'Lawsuit', prob: 10, impact: { likely: 3000 } }] });
  const t = L.tornado(o, { horizon: 24, discountRate: 0 });
  assert.strictEqual(t.items[0].label, 'Sales (benefit / month)');
  assert.strictEqual(t.items[0].swing, 1500 * 24);
  assert.strictEqual(t.items[1].label, 'Risk: Lawsuit');
  assert.strictEqual(t.items[1].swing, 3000);
  assert.strictEqual(t.items[2].label, 'One-off cost');
  assert.ok(!t.items.some(i => /Rent/.test(i.label)), 'fixed inputs (low = high) are left out');
  assert.strictEqual(t.base, -10000 + 700 * 24 - 300);
});

test('criteria: weighted score out of 100 ignores zero-weight factors', () => {
  const d = { criteria: [{ id: 'a', name: 'Quality', weight: 3 }, { id: 'b', name: 'Speed', weight: 1 }, { id: 'c', name: 'Ignored', weight: 0 }],
    options: [{ id: 1, name: 'A', scores: { a: 10, b: 0, c: 0 } }, { id: 2, name: 'B', scores: { a: 5, b: 10, c: 10 } }] };
  const s = L.criteriaScores(d);
  assert.strictEqual(s[0].score, 75);
  assert.strictEqual(s[1].score, 62.5);
  assert.strictEqual(L.criteriaScores({ criteria: [], options: [{ id: 1, name: 'A' }] })[0].score, null);
});

test('recommendation names the winner, states assumptions and flags when criteria disagree', () => {
  const d = L.fromTemplate('hireVsAutomate');
  const r = L.analyse(d, { runs: 3000, seed: 42 });
  const top = r.sim.options.slice().sort((a, b) => b.p50 - a.p50)[0];
  assert.match(r.recommendation.headline, new RegExp(top.name));
  assert.ok(r.recommendation.assumptions.some(a => /Discount rate: 8%/.test(a)));
  assert.ok(r.recommendation.assumptions.some(a => /seed 42/.test(a)));
  assert.ok(r.recommendation.points.some(p => /simulated futures/.test(p)));
  const crit = r.criteria.slice().sort((a, b) => b.score - a.score)[0];
  if (crit.name !== top.name) assert.ok(r.recommendation.caveats.some(c => /non-money criteria/.test(c)));
});

test('all templates analyse cleanly and the paper contains every section', () => {
  Object.keys(L.TEMPLATES).forEach(k => {
    const d = L.fromTemplate(k);
    assert.ok(d.options.length >= 2 && d.options.every(o => o.id));
    const r = L.analyse(d, { runs: 500 });
    r.sim.options.forEach(o => assert.ok(isFinite(o.p50)));
    const html = L.paperHtml(d, r, '2026-11-08');
    ['Recommendation', 'Outcomes from', 'Cash view', 'What moves the result most', 'Assumptions', 'Inputs'].forEach(s => assert.ok(html.includes(s), k + ' paper missing ' + s));
    assert.ok(!/undefined|NaN/.test(html), k + ' paper has undefined/NaN');
  });
});

test('import accepts an export file, a single decision or an array and rejects junk', () => {
  const d = L.fromTemplate('leaseVsBuy');
  assert.strictEqual(L.importFile(JSON.stringify({ app: 'decision-simulator', decisions: [d, d] })).decisions.length, 2);
  assert.strictEqual(L.importFile(JSON.stringify(d)).decisions.length, 1);
  const bad = L.importFile(JSON.stringify([{ title: 'No options' }, d]));
  assert.strictEqual(bad.decisions.length, 1);
  assert.match(bad.errors[0], /no options/);
  assert.throws(() => L.importFile('not json'));
  const six = Object.assign({}, d, { options: new Array(6).fill(d.options[0]) });
  assert.match(L.validate(six).join(' '), /At most 5/);
});

test('cash table splits by year and paper escapes user text', () => {
  const d = { title: '<script>x</script>', horizon: 24, discountRate: 0, options: [opt({ name: 'A & B', oneOff: { likely: 500 }, lines: [{ label: 'Fee', kind: 'benefit', likely: 100 }] })] };
  const r = L.analyse(d, { runs: 200 });
  const t = L.cashTable(d, r)[0];
  assert.strictEqual(t.upfront, -500); assert.strictEqual(t.y1, 1200); assert.strictEqual(t.y2, 1200); assert.strictEqual(t.total, 1900);
  const html = L.paperHtml(d, r, '2026-11-08');
  assert.ok(!html.includes('<script>x'));
  assert.ok(html.includes('A &amp; B'));
});
