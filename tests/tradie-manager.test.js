const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/tradie-manager/lib.js');
const C = require('../forge/forge-core.js');

const TODAY = '2026-11-08';
const q = { labourHours: 3, labourRate: 110, materials: [{ desc: 'Double GPO', qty: 2, price: 14.5 }, { desc: 'TPS cable (m)', qty: 20, price: 2.1 }], markupPct: 20, calloutFee: 80, gst: true };

test('quoteTotals: labour + marked-up materials + call-out, then GST', () => {
  const t = L.quoteTotals(q);
  // materials at cost 29 + 42 = 71; +20% = 85.20 ; labour 330 ; call-out 80 -> 495.20 net, GST 49.52
  assert.deepStrictEqual(t, { labour: 330, materialsCost: 71, materials: 85.2, markup: 14.2, callout: 80, net: 495.2, gst: 49.52, total: 544.72 });
  assert.strictEqual(L.quoteTotals(Object.assign({}, q, { gst: false })).total, 495.2);
});

test('priceLines add up exactly to the quote total, even with awkward markups', () => {
  const odd = { labourHours: 1.25, labourRate: 97.5, materials: [{ desc: 'Fitting', qty: 3, price: 3.33 }, { desc: '', qty: 0, price: 0 }], markupPct: 17.5, calloutFee: 0, gst: true };
  const lines = L.priceLines(odd);
  assert.deepStrictEqual(lines.map((l) => l.desc), ['Labour', 'Fitting']); // blank line dropped, no zero call-out line
  assert.strictEqual(lines[1].price, 3.91);
  const t = L.quoteTotals(odd);
  assert.strictEqual(C.totals(lines, { gst: true }).total, t.total);
});

test('paymentStatus: unpaid, part paid, overdue, paid', () => {
  const inv = Object.assign({}, q, { due: '2026-11-20', amountPaid: 0 });
  assert.strictEqual(L.paymentStatus(inv, TODAY), 'Unpaid');
  assert.strictEqual(L.paymentStatus(Object.assign({}, inv, { amountPaid: 100 }), TODAY), 'Part paid');
  assert.strictEqual(L.paymentStatus(Object.assign({}, inv, { due: '2026-11-07', amountPaid: 100 }), TODAY), 'Overdue');
  assert.strictEqual(L.paymentStatus(Object.assign({}, inv, { due: '2026-11-07', amountPaid: 544.72 }), TODAY), 'Paid');
  assert.strictEqual(L.balance(Object.assign({}, inv, { amountPaid: 500 })), 44.72);
});

test('invoiceFromQuote copies pricing (deep), numbers sequentially and sets terms', () => {
  const quote = Object.assign({ id: 'q9', job: 'j3', notes: 'Includes testing' }, q);
  const inv = L.invoiceFromQuote(quote, [{ number: 'INV-0007' }, { number: 'INV-0012' }], TODAY, 7, 'i1');
  assert.strictEqual(inv.number, 'INV-0013');
  assert.strictEqual(inv.due, '2026-11-15');
  assert.strictEqual(inv.quote, 'q9'); assert.strictEqual(inv.job, 'j3');
  assert.strictEqual(L.quoteTotals(inv).total, L.quoteTotals(quote).total);
  inv.materials[0].price = 999;
  assert.strictEqual(quote.materials[0].price, 14.5, 'quote materials not shared with invoice');
});

test('jobHours and jobProfit use logged time and materials at cost', () => {
  const time = [{ job: 'j1', hours: 3 }, { job: 'j1', hours: 1.5 }, { job: 'j2', hours: 8 }];
  assert.strictEqual(L.jobHours(time, 'j1'), 4.5);
  const p = L.jobProfit(Object.assign({ job: 'j1' }, q), time, 45);
  assert.deepStrictEqual(p, { revenue: 495.2, materials: 71, wages: 202.5, profit: 221.7 });
});

test('runSheet lists the day in time order with site access and skips cancelled', () => {
  const jobs = [
    { id: 'a', title: 'Afternoon', start: '2026-11-08T13:00', customer: 'c1', site: 's1', status: 'Scheduled' },
    { id: 'b', title: 'Early', start: '2026-11-08T06:30', customer: 'c2', status: 'Scheduled' },
    { id: 'c', title: 'Tomorrow', start: '2026-11-09T08:00', status: 'Scheduled' },
    { id: 'd', title: 'Cancelled', start: '2026-11-08T09:00', status: 'Cancelled' }
  ];
  const rows = L.runSheet(jobs, TODAY, [{ id: 'c1', name: 'Mia', phone: '0412' }, { id: 'c2', name: 'Cafe', address: '12 Wharf St' }], [{ id: 's1', address: '14 Banksia St', access: 'Side gate' }]);
  assert.deepStrictEqual(rows.map((r) => [r.time, r.job, r.address, r.access]), [['06:30', 'Early', '12 Wharf St', ''], ['13:00', 'Afternoon', '14 Banksia St', 'Side gate']]);
});

test('clashes finds overlapping bookings for the same worker only', () => {
  const jobs = [
    { id: 'a', worker: 'Dan', start: '2026-11-08T09:00', hours: 2 },
    { id: 'b', worker: 'Dan', start: '2026-11-08T10:30', hours: 1 },
    { id: 'c', worker: 'Priya', start: '2026-11-08T10:30', hours: 1 },
    { id: 'd', worker: 'Dan', start: '2026-11-08T11:00', hours: 1 }, // starts exactly when a ends (11:00) -> but b runs 10:30-11:30 -> clash with b
    { id: 'e', worker: 'Dan', start: '2026-11-09T09:00', hours: 2 }
  ];
  assert.deepStrictEqual(L.clashes(jobs), [['a', 'b'], ['b', 'd']]);
});

test('sample data is internally consistent', () => {
  const s = L.sample(TODAY);
  const ids = (k) => new Set(s[k].map((r) => r.id));
  const cust = ids('customers'), sites = ids('sites'), jobs = ids('jobs');
  s.jobs.forEach((j) => { assert.ok(cust.has(j.customer)); assert.ok(sites.has(j.site)); });
  s.quotes.concat(s.invoices).concat(s.time).forEach((r) => assert.ok(jobs.has(r.job)));
  assert.strictEqual(L.paymentStatus(s.invoices[0], TODAY), 'Paid');
  assert.strictEqual(L.paymentStatus(s.invoices[1], TODAY), 'Overdue');
  assert.strictEqual(L.runSheet(s.jobs, TODAY, s.customers, s.sites).length, 2);
});

test('materials-only quote with no labour, no markup and no GST', () => {
  const t = L.quoteTotals({ materials: [{ desc: 'Downpipe', qty: 2, price: 38.5 }], gst: false });
  assert.deepStrictEqual(t, { labour: 0, materialsCost: 77, materials: 77, markup: 0, callout: 0, net: 77, gst: 0, total: 77 });
  assert.deepStrictEqual(L.priceLines({ materials: [] }), []);
});

test('jobs without a time are never treated as clashing', () => {
  assert.deepStrictEqual(L.clashes([{ id: 'a', worker: 'Dan', start: '2026-11-08' }, { id: 'b', worker: 'Dan', start: '2026-11-08' }]), []);
  assert.deepStrictEqual(L.clashes([{ id: 'a', worker: 'Dan', start: '2026-11-08T09:00', hours: 1, status: 'Cancelled' }, { id: 'b', worker: 'Dan', start: '2026-11-08T09:00', hours: 1 }]), []);
});
