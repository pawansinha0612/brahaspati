const test = require('node:test');
const assert = require('node:assert');
const B = require('../assets/core.js');
const L = require('../apps/inventory-forecast/lib.js');

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps || 1e-6), (msg || '') + ' expected ' + b + ' got ' + a);

test('detectColumns maps common POS / Shopify export headers', () => {
  const m = L.detectColumns(['Day', 'Variant SKU', 'Product title', 'Net quantity', 'Price', 'Inventory on hand', 'Lead time']);
  assert.strictEqual(m.date, 'Day');
  assert.strictEqual(m.sku, 'Variant SKU');
  assert.strictEqual(m.qty, 'Net quantity');
  assert.strictEqual(m.name, 'Product title');
  assert.strictEqual(m.price, 'Price');
  assert.strictEqual(m.stock, 'Inventory on hand');
  assert.strictEqual(m.lead, 'Lead time');
});

test('parseDate handles AU day-first, US month-first (auto-detected), ISO, text and Excel serials', () => {
  assert.strictEqual(L.parseDate('08/11/2026').toISOString().slice(0, 10), '2026-11-08');
  assert.strictEqual(L.detectDateOrder(['11/8/26', '12/25/26']), 'mdy');
  assert.strictEqual(L.parseDate('12/25/26', 'mdy').toISOString().slice(0, 10), '2026-12-25');
  assert.strictEqual(L.parseDate('3 Feb 2026').toISOString().slice(0, 10), '2026-02-03');
  assert.strictEqual(L.parseDate('46000').toISOString().slice(0, 10), '2025-12-09');
  assert.strictEqual(L.parseDate('not a date'), null);
});

test('aggregate sums daily rows into Monday weeks and fills empty weeks with zero', () => {
  const t = B.csv.toObjects(`Date,SKU,Qty,Price,Stock
2026-10-05,A1,3,10,
2026-10-07,A1,2,10,
2026-10-11,A1,1,12,
2026-10-20,A1,4,10,20
2026-10-06,B2,5,2.5,
bad,B2,5,2.5,`);
  const a = L.aggregate(t.rows, L.detectColumns(t.headers));
  assert.deepStrictEqual(a.weeks, ['2026-10-05', '2026-10-12', '2026-10-19']);
  assert.deepStrictEqual(a.skus.A1.qty, [6, 0, 4]);
  assert.deepStrictEqual(a.skus.A1.revenue, [62, 0, 40]);
  near(a.skus.A1.price, 102 / 10);
  assert.strictEqual(a.skus.A1.stock, 20);
  assert.strictEqual(a.skipped, 1);
});

test('moving average: one-step fitted values and flat forecast (hand computed)', () => {
  const f = L.movingAverage([10, 20, 30, 40, 50], 2);
  assert.deepStrictEqual(f.fitted, [null, null, 15, 25, 35]);
  assert.deepStrictEqual(f.forecast(2), [45, 45]);
});

test('simple exponential smoothing (alpha 0.5) — hand computed', () => {
  // L0=10; t1: pred 10, L=11; t2: pred 11, L=11
  const f = L.ses([10, 12, 11], 0.5);
  assert.deepStrictEqual(f.fitted, [null, 10, 11]);
  assert.deepStrictEqual(f.forecast(3), [11, 11, 11]);
});

test('Holt linear trend (alpha 0.5, beta 0.5) — hand computed', () => {
  // L1=12, T1=2. t=2 (y=15): pred 14; L=0.5*15+0.5*14=14.5; T=0.5*2.5+0.5*2=2.25
  // t=3 (y=16): pred 16.75; L=0.5*16+0.5*16.75=16.375; T=0.5*1.875+0.5*2.25=2.0625
  const f = L.holt([10, 12, 15, 16], 0.5, 0.5);
  assert.deepStrictEqual(f.fitted, [null, null, 14, 16.75]);
  near(f.level, 16.375); near(f.trend, 2.0625);
  const fc = f.forecast(2); near(fc[0], 18.4375); near(fc[1], 20.5);
});

test('Holt-Winters additive with season 2 — hand computed', () => {
  // y = [10,20,12,22,14]; L=15, T=((12+22)/2-15)/2=1, S=[-5,5]
  // t=2: pred 15+1-5=11; alpha=beta=gamma=0.5 -> L=0.5*(12+5)+0.5*16=16.5, T=0.5*1.5+0.5*1=1.25, S2=0.5*(12-16.5)+0.5*-5=-4.75
  // t=3: pred 16.5+1.25+5=22.75; L=0.5*(22-5)+0.5*17.75=17.375, T=0.5*0.875+0.5*1.25=1.0625, S3=0.5*(22-17.375)+0.5*5=4.8125
  const f = L.holtWinters([10, 20, 12, 22, 14], 2, 0.5, 0.5, 0.5);
  assert.deepStrictEqual(f.fitted.slice(0, 4), [null, null, 11, 22.75]);
  // t=4: pred 17.375+1.0625-4.75=13.6875
  near(f.fitted[4], 13.6875);
});

test('forecastSeries picks a seasonal model for clearly seasonal data and a flat one for flat data', () => {
  const seasonal = [];
  for (let w = 0; w < 130; w++) seasonal.push(50 + 30 * Math.sin((2 * Math.PI * w) / 52) + (w % 3));
  const r = L.forecastSeries(seasonal, { horizon: 8 });
  assert.strictEqual(r.method, 'hw');
  assert.ok(r.mae < 5, 'holdout MAE small: ' + r.mae);
  const flat = Array.from({ length: 40 }, (_, i) => 20 + ((i * 7) % 5) - 2);
  const f = L.forecastSeries(flat, { horizon: 4 });
  assert.ok(['ma4', 'ma8', 'ma13', 'ses'].includes(f.method), f.method);
  f.forecast.forEach((p) => { assert.ok(p.mean > 17 && p.mean < 23); assert.ok(p.lo <= p.mean && p.hi >= p.mean); });
  // intervals widen with the horizon for smoothing methods
  const tr = L.forecastSeries(Array.from({ length: 30 }, (_, i) => 10 + i * 2 + (i % 2)), { horizon: 6 });
  assert.ok(tr.forecast[5].hi - tr.forecast[5].lo >= tr.forecast[0].hi - tr.forecast[0].lo);
  assert.ok(tr.forecast[5].mean > tr.forecast[0].mean, 'trend continues');
});

test('short history falls back to an average with a note', () => {
  const r = L.forecastSeries([4, 6, 5], { horizon: 3 });
  assert.strictEqual(r.method, 'avg');
  near(r.forecast[0].mean, 5);
  assert.match(r.note, /Only 3 weeks/);
});

test('normal distribution helpers', () => {
  near(L.normInv(0.95), 1.6449, 1e-4);
  near(L.normInv(0.5), 0, 1e-9);
  near(L.normInv(0.99), 2.3263, 1e-4);
  near(L.normCdf(1.6449), 0.95, 1e-4);
});

test('safety stock, reorder point and EOQ match hand-computed values', () => {
  // z(95%)=1.6449, sigma 10/week, lead 4 weeks -> 1.6449*10*2 = 32.90
  near(L.safetyStock(L.normInv(0.95), 10, 4), 32.897, 1e-2);
  // demand over 2.5 weeks of [10,20,30] = 10 + 20 + 0.5*30 = 45
  near(L.demandOver([10, 20, 30], 2.5), 45);
  // EOQ = sqrt(2*5200*50/2.5) = 456.07
  near(L.eoq(5200, 50, 2.5), 456.0702, 1e-3);
  assert.strictEqual(L.eoq(0, 50, 2.5), null);
  // stock 50 vs mean lead-time demand 50 -> 50% chance of running out
  near(L.stockoutRisk(50, 50, 10), 0.5, 1e-6);
  assert.ok(L.stockoutRisk(80, 50, 10) < 0.01);
});

test('ABC classification by revenue (80/15/5)', () => {
  const c = L.abc([{ key: 'a', value: 700 }, { key: 'b', value: 150 }, { key: 'c', value: 100 }, { key: 'd', value: 40 }, { key: 'e', value: 10 }, { key: 'z', value: 0 }]);
  assert.deepStrictEqual(c, { a: 'A', b: 'A', c: 'B', d: 'C', e: 'C', z: 'C' });
});

test('plan on sample data: seasonal SKUs get seasonal models, dead stock found, low stock flagged', () => {
  const s = L.sampleData();
  const agg = L.aggregate(s.rows, L.detectColumns(s.headers));
  assert.strictEqual(agg.weeks.length, 130);
  const p = L.plan(agg, { serviceLevel: 0.95 });
  const by = Object.fromEntries(p.map((r) => [r.sku, r]));
  assert.strictEqual(by['WIND-CHIME'].movement, 'dead');
  assert.ok(by['WIND-CHIME'].deadValue > 0);
  // Sunscreen: summer peak coming (Nov) and only 60 in stock -> must reorder
  assert.ok(['order', 'urgent'].includes(by['SUN-SPF50-200'].status));
  assert.ok(by['SUN-SPF50-200'].orderQty > 0);
  assert.strictEqual(by['SUN-SPF50-200'].abc, 'A');
  assert.strictEqual(by['TRELLIS-EXP'].abc, 'C');
  // reorder point = lead demand + safety stock
  p.forEach((r) => near(r.reorderPoint, r.leadDemand + r.safetyStock, 1e-9));
  const csv = L.purchaseCsvRows(p);
  assert.strictEqual(csv.length, 12);
  assert.ok('Reorder point' in csv[0]);
});

test('EOQ setting changes the order quantity for items that need ordering', () => {
  const s = L.sampleData();
  const agg = L.aggregate(s.rows, L.detectColumns(s.headers));
  const p = L.plan(agg, { useEOQ: true, orderCost: 80, holdingPct: 0.25, costPct: 0.5 });
  const sun = p.find((r) => r.sku === 'SUN-SPF50-200');
  assert.ok(sun.eoq > 0);
  assert.ok(sun.orderQty >= Math.floor(sun.eoq));
});
