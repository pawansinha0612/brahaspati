const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/pet-business/lib.js');

const TODAY = '2026-11-08';
const bk = (id, start, hours, extra) => Object.assign({ id, start, hours, status: 'Booked', staff: 't1' }, extra);

test('sizeFor uses weight bands and defaults to Medium', () => {
  assert.deepStrictEqual([3, 9.9, 10, 24.9, 25, 44.9, 45, 70].map(L.sizeFor), ['Small', 'Small', 'Medium', 'Medium', 'Large', 'Large', 'Giant', 'Giant']);
  assert.strictEqual(L.sizeFor(''), 'Medium');
  assert.strictEqual(L.sizeFor(null), 'Medium');
});

test('age from date of birth in years and months', () => {
  assert.deepStrictEqual(L.age('2023-07-08', TODAY), { years: 3, months: 4, text: '3 yrs 4 mths' });
  assert.strictEqual(L.age('2026-02-09', TODAY).text, '8 mths', 'one day short of 9 months');
  assert.strictEqual(L.age('2025-11-08', TODAY).text, '1 yr');
  assert.strictEqual(L.age('2027-01-01', TODAY).text, '', 'future DOB gives nothing');
});

test('vaccineDue uses the usual interval; certificate date wins', () => {
  assert.strictEqual(L.vaccineDue('C3 (distemper, hepatitis, parvo)', '2025-03-01'), '2028-03-01');
  assert.strictEqual(L.vaccineDue('C5 (C3 + kennel cough)', '2025-03-01'), '2026-03-01');
  assert.strictEqual(L.vaccineDue('Something new', '2025-03-01'), '2026-03-01');
  assert.strictEqual(L.dueOf({ type: 'C5 (C3 + kennel cough)', given: '2025-03-01', due: '2026-05-01' }), '2026-05-01');
});

test('vaxIssues only looks at the newest record per vaccine and the booking day', () => {
  const v = [
    { id: 'a', pet: 'p', type: 'C5 (C3 + kennel cough)', given: '2024-10-01', due: '2025-10-01' },
    { id: 'b', pet: 'p', type: 'C5 (C3 + kennel cough)', given: '2025-10-20', due: '2026-10-20' },
    { id: 'c', pet: 'p', type: 'Leptospirosis', given: '2025-11-01', due: '2026-11-10' },
    { id: 'd', pet: 'other', type: 'Leptospirosis', given: '2020-01-01', due: '2021-01-01' }
  ];
  assert.deepStrictEqual(L.vaxIssues('p', v, TODAY), [{ type: 'C5 (C3 + kennel cough)', due: '2026-10-20', id: 'b' }]);
  assert.deepStrictEqual(L.vaxIssues('p', v, '2026-11-12').map((x) => x.id), ['b', 'c'], 'a booking next week also hits leptospirosis');
  assert.deepStrictEqual(L.vaxIssues('p', v, '2026-10-01'), []);
  assert.deepStrictEqual(L.replacedIds(v, v[1]), ['a']);
  assert.deepStrictEqual(L.replacedIds(v, v[0]), [], 'an older record does not replace a newer one');
});

test('priceFor picks the size price and minutes, falling back to medium', () => {
  const s = { priceSmall: 85, priceMedium: 105, priceLarge: 130, priceGiant: '', minsSmall: 90, minsMedium: 120, minsLarge: 150 };
  assert.deepStrictEqual(L.priceFor(s, 'Small'), { price: 85, minutes: 90 });
  assert.deepStrictEqual(L.priceFor(s, 'Giant'), { price: 105, minutes: 120 });
  assert.deepStrictEqual(L.priceFor(s, 'Weird'), { price: 105, minutes: 120 });
  assert.deepStrictEqual(L.priceFor(null, 'Small'), { price: 0, minutes: 60 });
});

test('clashes find double bookings for the same staff; group walks may overlap', () => {
  const list = [
    bk('a', '2026-11-09T09:00', 3), bk('b', '2026-11-09T11:00', 1), bk('c', '2026-11-09T12:00', 1),
    bk('d', '2026-11-09T09:00', 1, { staff: 't2' }), bk('e', '2026-11-09T10:00', 1, { status: 'Cancelled' }),
    bk('w1', '2026-11-10T08:00', 1, { staff: 't2', groupOk: true }), bk('w2', '2026-11-10T08:00', 1, { staff: 't2', groupOk: true }),
    bk('w3', '2026-11-10T08:30', 1, { staff: 't2' })
  ];
  assert.deepStrictEqual(L.clashes(list), [['a', 'b'], ['w1', 'w3'], ['w2', 'w3']]);
  assert.deepStrictEqual(L.clashFor(bk('new', '2026-11-09T11:30', 0.5), list).map((x) => x.id), ['a', 'b']);
  assert.deepStrictEqual(L.clashFor(bk('new', '2026-11-09T13:00', 1), list), [], 'back-to-back is fine');
  assert.deepStrictEqual(L.clashFor(bk('new', '2026-11-09T11:30', 1, { staff: '' }), list), [], 'no staff, no clash');
});

test('packageUse counts linked bookings except cancelled ones', () => {
  const k = { id: 'k', visits: 3, expires: '2026-11-01' };
  const list = [bk('1', '', 1, { package: 'k', status: 'Done' }), bk('2', '', 1, { package: 'k', status: 'No-show' }), bk('3', '', 1, { package: 'k', status: 'Cancelled' }),
    bk('4', '', 1, { package: 'k' }), bk('5', '', 1, { package: 'k' }), bk('6', '', 1, { package: 'x' })];
  assert.deepStrictEqual(L.packageUse(k, list, TODAY), { used: 4, remaining: 0, over: 1, expired: true });
  assert.strictEqual(L.packageUse({ id: 'k', visits: 10 }, list).remaining, 6);
});

test('lastGroom and nextGroom follow finished groom bookings only', () => {
  const services = [{ id: 'g', kind: 'Groom' }, { id: 'w', kind: 'Walk' }];
  const list = [bk('1', '2026-09-01T09:00', 2, { pet: 'p', service: 'g', status: 'Done' }), bk('2', '2026-10-20T09:00', 1, { pet: 'p', service: 'w', status: 'Done' }),
    bk('3', '2026-10-01T09:00', 2, { pet: 'p', service: 'g', status: 'Cancelled' }), bk('4', '2026-11-20T09:00', 2, { pet: 'p', service: 'g' })];
  assert.strictEqual(L.lastGroom('p', list, services), '2026-09-01');
  assert.strictEqual(L.nextGroom('2026-09-01', 6), '2026-10-13');
  assert.strictEqual(L.nextGroom('2026-09-01', 8), '2026-10-27');
  assert.strictEqual(L.nextGroom('', 6), '');
});

test('invoiceTotals treat prices as GST-inclusive (1/11) and status follows payments', () => {
  const lines = [{ desc: 'Full groom', qty: 1, price: 105 }, { desc: 'Walk', qty: 4, price: 30 }];
  assert.deepStrictEqual(L.invoiceTotals(lines, true), { subtotal: 204.55, markup: 0, discount: 0, net: 204.55, gst: 20.45, total: 225 });
  assert.strictEqual(L.invoiceTotals(lines, false).gst, 0);
  assert.strictEqual(L.invoiceStatus({ lines, gst: true, amountPaid: 225 }, TODAY), 'Paid');
  assert.strictEqual(L.invoiceStatus({ lines, gst: true, amountPaid: 100, due: '2026-11-20' }, TODAY), 'Part paid');
  assert.strictEqual(L.invoiceStatus({ lines, gst: true, amountPaid: 0, due: '2026-11-01' }, TODAY), 'Overdue');
});

test('unbilled skips package visits, invoiced visits, other owners and unfinished bookings', () => {
  const pets = [{ id: 'p1', owner: 'o1' }, { id: 'p2', owner: 'o1' }, { id: 'p3', owner: 'o2' }];
  const list = [
    bk('a', '2026-11-02T09:00', 1, { pet: 'p1', status: 'Done', price: 85 }), bk('b', '2026-11-01T09:00', 1, { pet: 'p2', status: 'Done', price: 32 }),
    bk('c', '2026-11-03T09:00', 1, { pet: 'p1', status: 'Done', price: 30, package: 'k' }), bk('d', '2026-11-03T09:00', 1, { pet: 'p1', status: 'Done', price: 85, invoice: 'i1' }),
    bk('e', '2026-11-04T09:00', 1, { pet: 'p3', status: 'Done', price: 50 }), bk('f', '2026-11-10T09:00', 1, { pet: 'p1', price: 85 })
  ];
  const u = L.unbilled('o1', pets, list);
  assert.deepStrictEqual(u.map((b) => b.id), ['b', 'a']);
  const lines = L.invoiceLines(u, (id) => ({ p1: 'Biscuit', p2: 'Luna' })[id], () => 'Groom');
  assert.deepStrictEqual(lines[0], { desc: 'Groom — Luna (2026-11-01)', qty: 1, price: 32 });
});

test('ownerHistory totals visits, spend (incl. packages) and next grooms', () => {
  const pets = [{ id: 'p1', owner: 'o1', name: 'Biscuit', groomWeeks: 6 }];
  const services = [{ id: 'g', kind: 'Groom' }];
  const list = [bk('a', '2026-10-01T09:00', 1, { pet: 'p1', service: 'g', status: 'Done', price: 85 }), bk('b', '2026-10-15T09:00', 1, { pet: 'p1', service: 'w', status: 'Done', price: 0, package: 'k' }),
    bk('c', '2026-11-20T09:00', 1, { pet: 'p1', service: 'g', price: 85 }), bk('d', '2026-10-20T09:00', 1, { pet: 'p1', status: 'No-show', price: 30 })];
  const h = L.ownerHistory('o1', pets, list, [{ owner: 'o1', price: 320 }], services, TODAY);
  assert.deepStrictEqual([h.visits, h.spend, h.last, h.upcoming, h.noShows], [2, 405, '2026-10-15', 1, 1]);
  assert.deepStrictEqual(h.pets[0], { id: 'p1', name: 'Biscuit', visits: 2, lastGroom: '2026-10-01', nextGroom: '2026-11-12' });
});

test('checklists by service kind and the pupdate text', () => {
  assert.ok(L.checklistFor('Walk').some((i) => /Poo/.test(i.text)));
  assert.strictEqual(L.checklistFor('Unknown').length, L.CHECKLISTS.Other.length);
  const b = { start: '2026-11-08T08:00', mood: 'Happy', report: 'Great walk.', checklist: [{ text: 'Wee', done: true }, { text: 'Poo', done: false }] };
  const t = L.pupdateText(b, { name: 'Max' }, 'Pack walk', 'Liam', 'Happy Paws');
  assert.match(t, /^Pupdate for Max — 2026-11-08 08:00/);
  assert.match(t, /Pack walk with Liam/);
  assert.match(t, /✓ Wee/);
  assert.doesNotMatch(t, /Poo/);
  assert.match(t, /Thanks from Happy Paws!$/);
});

test('sample data: valid links, a double booking and an overdue-vaccination booking to show', () => {
  const s = L.sample(TODAY);
  const ids = (k) => new Set(s[k].map((x) => x.id));
  const owners = ids('owners'), pets = ids('pets'), services = ids('services'), staff = ids('staff'), packages = ids('packages'), invoices = ids('invoices');
  s.pets.forEach((p) => assert.ok(owners.has(p.owner)));
  s.vaccinations.forEach((v) => assert.ok(pets.has(v.pet)));
  s.bookings.forEach((b) => { assert.ok(pets.has(b.pet)); assert.ok(services.has(b.service)); assert.ok(staff.has(b.staff)); if (b.package) assert.ok(packages.has(b.package)); if (b.invoice) assert.ok(invoices.has(b.invoice)); });
  const future = s.bookings.filter((b) => b.start.slice(0, 10) >= TODAY);
  assert.ok(L.clashes(future).length >= 1, 'shows a double booking');
  assert.ok(future.some((b) => L.vaxIssues(b.pet, s.vaccinations, b.start.slice(0, 10)).length), 'shows an overdue vaccination');
  assert.strictEqual(L.packageUse(s.packages[0], s.bookings, TODAY).remaining, 6);
  assert.strictEqual(s.pets.find((p) => p.id === 'p1').lastGroom, '2026-09-25');
});
