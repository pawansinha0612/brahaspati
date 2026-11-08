const test = require('node:test');
const assert = require('node:assert');
const B = require('../assets/core.js');
const L = require('../apps/returns-intelligence/lib.js');

const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= (eps || 1e-9), 'expected ' + b + ' got ' + a);
const tbl = (text) => B.csv.toObjects(text);

test('detects Shopify order export and returns-app columns', () => {
  const o = L.detectOrderColumns(['Name', 'Created at', 'Lineitem name', 'Lineitem sku', 'Lineitem quantity', 'Lineitem price', 'Email', 'Source']);
  assert.strictEqual(o.orderId, 'Name'); assert.strictEqual(o.sku, 'Lineitem sku'); assert.strictEqual(o.product, 'Lineitem name');
  assert.strictEqual(o.qty, 'Lineitem quantity'); assert.strictEqual(o.price, 'Lineitem price'); assert.strictEqual(o.customer, 'Email');
  assert.strictEqual(o.date, 'Created at'); assert.strictEqual(o.channel, 'Source');
  const r = L.detectReturnColumns(['Order number', 'SKU', 'Return reason', 'Customer notes', 'Refunded', 'Return label cost', 'Received date', 'Resaleable']);
  assert.strictEqual(r.orderId, 'Order number'); assert.strictEqual(r.reasonCode, 'Return reason'); assert.strictEqual(r.reasonText, 'Customer notes');
  assert.strictEqual(r.refund, 'Refunded'); assert.strictEqual(r.shipping, 'Return label cost'); assert.strictEqual(r.condition, 'Resaleable');
});

test('classify reason codes and free text into themes', () => {
  assert.strictEqual(L.classify('APPAREL_TOO_SMALL', ''), 'small');
  assert.strictEqual(L.classify('Size / fit', 'runs small, need a size up'), 'small');
  assert.strictEqual(L.classify('Size / fit', 'too baggy'), 'large');
  assert.strictEqual(L.classify('DAMAGED_BY_CARRIER', ''), 'damaged');
  assert.strictEqual(L.classify('', 'arrived with a chipped rim'), 'damaged');
  assert.strictEqual(L.classify('NOT_AS_DESCRIBED', ''), 'described');
  assert.strictEqual(L.classify('', 'colour is different from the photo'), 'described');
  assert.strictEqual(L.classify('Quality not as expected', ''), 'quality');
  assert.strictEqual(L.classify('', 'started pilling after one wear'), 'quality');
  assert.strictEqual(L.classify('Changed mind', 'found it cheaper elsewhere'), 'mind');
  assert.strictEqual(L.classify('', 'Gift — not their style'), 'mind');
  assert.strictEqual(L.classify('ORDERED_WRONG_ITEM', ''), 'wrong');
  assert.strictEqual(L.classify('MISSED_ESTIMATED_DELIVERY', ''), 'late');
  assert.strictEqual(L.classify('', ''), 'other');
});

test('condition words: resaleable vs written off', () => {
  assert.strictEqual(L.unsellable('Not resaleable'), true);
  assert.strictEqual(L.unsellable('Resaleable'), false);
  assert.strictEqual(L.unsellable('Damaged'), true);
  assert.strictEqual(L.unsellable('As new'), false);
  assert.strictEqual(L.unsellable(''), null);
});

const orders = tbl(`Order,Date,SKU,Product,Category,Size,Qty,Price,Channel,Customer
1001,2026-09-01,TEE-S,Tee,Tops,S,1,40,Web,a@x.com
1001,2026-09-01,TEE-M,Tee,Tops,M,1,40,Web,a@x.com
1002,2026-09-03,MUG,Mug,Home,,2,20,Marketplace,b@x.com
1003,2026-10-05,TEE-M,Tee,Tops,M,1,40,Marketplace,c@x.com
1004,2026-10-06,MUG,Mug,Home,,1,20,Web,c@x.com`);
const returns = tbl(`Order,SKU,Reason,Comment,Refund,Return shipping,Return date,Condition
1001,TEE-S,Size,too small,40,10,2026-09-10,Resaleable
1002,MUG,Damaged,,40,12,2026-09-12,Not resaleable
1003,TEE-M,Changed mind,,40,0,2026-10-15,`);

test('prepare joins returns to order lines and costs each return (hand computed)', () => {
  const d = L.prepare({ rows: orders.rows, map: L.detectOrderColumns(orders.headers) }, { rows: returns.rows, map: L.detectReturnColumns(returns.headers) }, { handling: 5, costPct: 0.5 });
  assert.strictEqual(d.lines.length, 5);
  assert.strictEqual(d.returns.length, 3);
  assert.strictEqual(d.unmatched, 0);
  const [tee, mug, mind] = d.returns;
  assert.strictEqual(tee.reason, 'small'); assert.strictEqual(tee.category, 'Tops'); assert.strictEqual(tee.variant, 'S'); assert.strictEqual(tee.channel, 'Web');
  // resaleable -> no write-off: 40 + 10 + 5 = 55
  near(tee.cost, 55);
  // mug: qty 1 (no qty column in returns) not resaleable -> write-off 20 * 0.5 = 10 -> 40 + 12 + 5 + 10 = 67
  assert.strictEqual(mug.reason, 'damaged');
  near(mug.writeOff, 10); near(mug.cost, 67);
  // change of mind, no condition -> default write-off 5% of cost price: 40*0.5*0.05 = 1 -> 40 + 0 + 5 + 1 = 46
  near(mind.cost, 46);
  const t = L.totals(d);
  assert.strictEqual(t.sold, 6); assert.strictEqual(t.returned, 3); near(t.rate, 0.5); near(t.cost, 168); assert.strictEqual(t.orders, 4);
});

test('group gives return rate and cost by category, channel and month', () => {
  const d = L.prepare({ rows: orders.rows, map: L.detectOrderColumns(orders.headers) }, { rows: returns.rows, map: L.detectReturnColumns(returns.headers) }, { handling: 5, costPct: 0.5 });
  const cat = Object.fromEntries(L.group(d, L.DIMS.category.fn).map((g) => [g.key, g]));
  near(cat.Tops.rate, 2 / 3); near(cat.Home.rate, 1 / 3);
  const ch = Object.fromEntries(L.group(d, L.DIMS.channel.fn).map((g) => [g.key, g]));
  near(ch.Marketplace.rate, 2 / 3); near(ch.Web.rate, 1 / 3);
  const mo = Object.fromEntries(L.group(d, L.DIMS.month.fn).map((g) => [g.key, g]));
  near(mo['2026-09'].rate, 2 / 4); near(mo['2026-10'].rate, 1 / 2);
});

test('returns without an orders file still give costs and reasons (no rates)', () => {
  const d = L.prepare(null, { rows: returns.rows, map: L.detectReturnColumns(returns.headers) });
  assert.strictEqual(d.hasOrders, false);
  assert.strictEqual(L.totals(d).rate, null);
  const r = L.reasonBreakdown(d);
  assert.strictEqual(r.length, 3);
  near(r[0].share, 1 / 3);
});

test('size signal: runs small needs enough size-specific fit returns', () => {
  const mk = (n, reason) => Array.from({ length: n }, () => ({ product: 'Shirt', reason, qty: 1 }));
  assert.deepStrictEqual(L.sizeSignals({ returns: mk(7, 'small').concat(mk(2, 'large')) }).map((s) => s.verdict), ['runs small']);
  assert.deepStrictEqual(L.sizeSignals({ returns: mk(4, 'small') }), []);
  assert.deepStrictEqual(L.sizeSignals({ returns: mk(4, 'small').concat(mk(4, 'large')) }).map((s) => s.verdict), ['mixed fit']);
});

test('sample data: planted patterns are found', () => {
  const s = L.sampleData();
  const d = L.prepare({ rows: s.orders.rows, map: L.detectOrderColumns(s.orders.headers) }, { rows: s.returns.rows, map: L.detectReturnColumns(s.returns.headers) });
  assert.strictEqual(d.unmatched, 0);
  const sizes = Object.fromEntries(L.sizeSignals(d).map((x) => [x.product, x.verdict]));
  assert.strictEqual(sizes['Linen Shirt'], 'runs small');
  assert.strictEqual(sizes['High-rise Jeans'], 'mixed fit');
  const acts = Object.fromEntries(L.productActions(d).map((p) => [p.key, p]));
  assert.strictEqual(acts['Rattan Table Lamp'].action, 'delist');
  assert.strictEqual(acts['Ceramic Mug Set (4)'].topReason, 'damaged');
  assert.match(acts['Ceramic Mug Set (4)'].fix, /packaging/);
  assert.match(acts['Linen Shirt'].fix, /size up/);
  assert.strictEqual(acts['Wrap Dress'].topReason, 'described');
  const ch = Object.fromEntries(L.group(d, L.DIMS.channel.fn).map((g) => [g.key, g.rate]));
  assert.ok(ch.Marketplace > ch.Website * 1.2);
  const freq = L.frequentReturners(d).slice(0, 3).map((c) => c.customer).sort();
  assert.deepStrictEqual(freq, ['cust10007@example.com', 'cust10042@example.com', 'cust10311@example.com']);
  assert.ok(L.frequentReturners(d)[0].bracketing > 3);
  const recs = L.recommendations(d).map((r) => r.title).join(' | ');
  assert.match(recs, /sizing/); assert.match(recs, /damage/); assert.match(recs, /Marketplace/); assert.match(recs, /delisting Rattan Table Lamp/);
});

test('frequent returners respects thresholds', () => {
  const d = { lines: [], returns: [{ customer: 'x', qty: 1, refund: 10, reason: 'mind' }, { customer: 'x', qty: 1, refund: 10, reason: 'mind' }] };
  assert.strictEqual(L.frequentReturners(d).length, 0);
  assert.strictEqual(L.frequentReturners(d, { minReturns: 2 }).length, 1);
});

test('returns match by order id alone when the order has one line, and unknown orders are counted', () => {
  const o = tbl('Order,Product,Price\nA1,Lamp,100\nA2,Vase,50\nA2,Bowl,30');
  const r = tbl('Order,Reason,Refund\nA1,Broken on arrival,100\nA2,Changed mind,30\nZZ,Too small,10');
  const d = L.prepare({ rows: o.rows, map: L.detectOrderColumns(o.headers) }, { rows: r.rows, map: L.detectReturnColumns(r.headers) });
  assert.strictEqual(d.returns[0].product, 'Lamp');
  assert.strictEqual(d.returns[0].reason, 'damaged');
  assert.strictEqual(d.returns[1].matched, false); // A2 has two lines and no SKU to tell them apart
  assert.strictEqual(d.unmatched, 2);
});
