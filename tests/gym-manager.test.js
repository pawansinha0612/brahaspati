const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/gym-manager/lib.js');

const TODAY = '2026-11-08'; // Sunday
const monthly = { id: 'mo', billing: 'Monthly', price: 79, termMonths: 0 };
const fortnightly12 = { id: 'f12', billing: 'Fortnightly', price: 34, termMonths: 12 };
const annual = { id: 'an', billing: 'Annual', price: 799 };
const pack = { id: 'pk', billing: 'Class pack', price: 220, classCount: 10, validDays: 90 };
const weekly = { id: 'wk', billing: 'Weekly', price: 19 };
const yoga = { id: 'y', name: 'Yoga', weekday: 'Mon', time: '06:00', minutes: 60, capacity: 2 };
const bk = (id, member, status, extra) => Object.assign({ id, member, class: 'y', date: '2026-11-09', status, queuedAt: '2026-11-01T08:0' + id.slice(-1) }, extra);

test('holdDays counts inclusive days and merges overlapping holds', () => {
  assert.strictEqual(L.holdDays([{ from: '2026-01-01', to: '2026-01-14' }]), 14);
  assert.strictEqual(L.holdDays([{ from: '2026-01-01', to: '2026-01-10' }, { from: '2026-01-05', to: '2026-01-14' }, { from: '2026-02-01', to: '2026-02-01' }]), 15);
  assert.strictEqual(L.holdDays([{ from: '2026-01-01', to: '2026-01-10' }, { from: '2026-01-11', to: '2026-01-12' }]), 12, 'back-to-back holds join');
  assert.strictEqual(L.holdDays([{ from: '2026-01-10', to: '2026-01-01' }, { from: '2026-01-01' }]), 0, 'invalid holds ignored');
  assert.strictEqual(L.holdDays([{ from: '2026-01-01', to: '2026-01-14' }, { from: '2026-03-01', to: '2026-03-07' }], '2026-02-01'), 14, 'only holds starting before a date');
});

test('endDate: annual, minimum term, class pack and ongoing; holds extend it', () => {
  const m = { start: '2026-01-15' };
  assert.strictEqual(L.endDate(m, annual, []), '2027-01-14');
  assert.strictEqual(L.endDate(m, fortnightly12, []), '2027-01-14');
  assert.strictEqual(L.endDate(m, pack, []), '2026-04-14');
  assert.strictEqual(L.endDate(m, monthly, []), '', 'no lock-in = no end');
  assert.strictEqual(L.endDate(m, annual, [{ from: '2026-06-01', to: '2026-06-14' }]), '2027-01-28', '14 hold days push the end out');
  assert.strictEqual(L.endDate({ start: '2026-01-31' }, { billing: 'Monthly', termMonths: 1 }, []), '2026-02-27', 'month-end start clamps');
});

test('nextBilling steps by cycle and is pushed back by holds', () => {
  assert.strictEqual(L.nextBilling({ start: '2026-10-20' }, weekly, [], TODAY), '2026-11-10');
  assert.strictEqual(L.nextBilling({ start: '2026-10-20' }, { billing: 'Fortnightly' }, [], TODAY), '2026-11-17');
  assert.strictEqual(L.nextBilling({ start: '2026-08-15' }, monthly, [], TODAY), '2026-11-15');
  assert.strictEqual(L.nextBilling({ start: '2026-08-15' }, monthly, [{ from: '2026-09-01', to: '2026-09-10' }], TODAY), '2026-11-25');
  assert.strictEqual(L.nextBilling({ start: '2026-01-15' }, annual, [], TODAY), '2027-01-15', 'annual renews the day after it ends');
  assert.strictEqual(L.nextBilling({ start: '2026-10-01' }, pack, [], TODAY), '');
  assert.strictEqual(L.nextBilling({ start: '2026-11-08' }, weekly, [], TODAY), '2026-11-15');
});

test('state: active, on hold, expired, cancelled and not started', () => {
  assert.strictEqual(L.state({ start: '2026-01-01', status: 'Active' }, monthly, [], TODAY), 'Active');
  assert.strictEqual(L.state({ start: '2026-01-01' }, monthly, [{ from: '2026-11-01', to: '2026-11-20' }], TODAY), 'On hold');
  assert.strictEqual(L.state({ start: '2025-06-01' }, annual, [], TODAY), 'Expired');
  assert.strictEqual(L.state({ start: '2025-06-01' }, annual, [{ from: '2025-07-01', to: '2025-12-31' }], TODAY), 'Active', 'hold days kept it alive');
  assert.strictEqual(L.state({ start: '2026-01-01', status: 'Cancelled' }, monthly, [], TODAY), 'Cancelled');
  assert.strictEqual(L.state({ start: '2026-12-01' }, monthly, [], TODAY), 'Not started');
});

test('packRemaining counts booked, attended and no-shows since the start, not cancellations', () => {
  const m = { member: 'a', start: '2026-10-01' };
  const list = [bk('1', 'a', 'Attended', { date: '2026-10-05' }), bk('2', 'a', 'No-show', { date: '2026-10-12' }), bk('3', 'a', 'Cancelled', { date: '2026-10-19' }),
    bk('4', 'a', 'Booked', { date: '2026-11-09' }), bk('5', 'a', 'Attended', { date: '2026-09-20' }), bk('6', 'b', 'Attended', { date: '2026-10-05' })];
  assert.strictEqual(L.packRemaining(m, pack, list), 7);
  assert.strictEqual(L.packRemaining(m, monthly, list), null);
});

test('requestBooking books until full, then waitlists; checks day and duplicates', () => {
  const list = [bk('1', 'a', 'Booked')];
  assert.deepStrictEqual(L.requestBooking(list, yoga, '2026-11-09', 'b'), { ok: true, status: 'Booked' });
  list.push(bk('2', 'b', 'Booked'));
  assert.deepStrictEqual(L.requestBooking(list, yoga, '2026-11-09', 'c'), { ok: true, status: 'Waitlisted', position: 1 });
  list.push(bk('3', 'c', 'Waitlisted'));
  assert.deepStrictEqual(L.requestBooking(list, yoga, '2026-11-09', 'd'), { ok: true, status: 'Waitlisted', position: 2 });
  assert.deepStrictEqual(L.requestBooking(list, yoga, '2026-11-09', 'c'), { ok: false, reason: 'Already waitlisted for this class' });
  assert.deepStrictEqual(L.requestBooking(list, yoga, '2026-11-10', 'z'), { ok: false, reason: 'Yoga runs on Mons' });
  assert.deepStrictEqual(L.requestBooking(list, yoga, '2026-11-16', 'c'), { ok: true, status: 'Booked' }, 'next week is a different class');
});

test('promote moves the earliest waitlisted members into freed spots', () => {
  const list = [bk('1', 'a', 'Cancelled'), bk('2', 'b', 'Booked'), bk('5', 'e', 'Waitlisted', { queuedAt: '2026-11-02T09:00' }), bk('4', 'd', 'Waitlisted', { queuedAt: '2026-11-02T08:00' }), bk('6', 'f', 'Waitlisted', { queuedAt: '2026-11-03T08:00' })];
  assert.deepStrictEqual(L.waitlist(list, 'y', '2026-11-09').map((b) => b.id), ['4', '5', '6']);
  assert.deepStrictEqual(L.promote(list, yoga, '2026-11-09'), ['4'], 'one spot free → first in line');
  list[1].status = 'Cancelled';
  assert.deepStrictEqual(L.promote(list, yoga, '2026-11-09'), ['4', '5'], 'two spots free');
  assert.deepStrictEqual(L.promote(list, Object.assign({}, yoga, { capacity: 0 }), '2026-11-09'), []);
  assert.strictEqual(L.occupancy(list, 'y', '2026-11-09'), 0);
});

test('occurrences expand the weekly timetable over dates', () => {
  const classes = [yoga, { id: 'h', name: 'HIIT', weekday: 'Mon', time: '05:30' }, { id: 'w', name: 'Spin', weekday: 'Wed', time: '06:00' }, { id: 'off', name: 'Old', weekday: 'Mon', time: '07:00', active: false }];
  const occ = L.occurrences(classes, '2026-11-09', '2026-11-15');
  assert.deepStrictEqual(occ.map((o) => o.cls.id + '@' + o.date), ['h@2026-11-09', 'y@2026-11-09', 'w@2026-11-11']);
});

test('timetable clashes by trainer and room, and weekly trainer hours', () => {
  const classes = [
    { id: 'a', name: 'Boxing', weekday: 'Wed', time: '17:30', minutes: 60, trainer: 't', room: 'Main floor' },
    { id: 'b', name: 'Strength', weekday: 'Wed', time: '18:00', minutes: 60, trainer: 't', room: 'main floor' },
    { id: 'c', name: 'Yoga', weekday: 'Wed', time: '18:30', minutes: 60, trainer: 'u', room: 'Studio' },
    { id: 'd', name: 'Spin', weekday: 'Thu', time: '17:30', minutes: 45, trainer: 't', room: 'Main floor' }
  ];
  assert.deepStrictEqual(L.timetableClashes(classes), [{ a: 'a', b: 'b', why: 'trainer' }, { a: 'a', b: 'b', why: 'room' }]);
  assert.deepStrictEqual(L.trainerHours(classes, [{ id: 't', name: 'Marcus', maxHours: 2.5 }, { id: 'u', name: 'Ava' }]).map((r) => [r.name, r.hours, r.classes, r.over]), [['Marcus', 2.75, 3, true], ['Ava', 1, 1, false]]);
});

test('lastSeen and atRisk use check-ins and attended classes, skipping holds and cancellations', () => {
  const members = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
  const ctx = {
    plans: [monthly],
    memberships: [{ id: 'ma', member: 'a', plan: 'mo', start: '2026-01-01' }, { id: 'mb', member: 'b', plan: 'mo', start: '2026-01-01' }, { id: 'mc', member: 'c', plan: 'mo', start: '2026-01-01' },
      { id: 'md', member: 'd', plan: 'mo', start: '2026-01-01', status: 'Cancelled' }, { id: 'me', member: 'e', plan: 'mo', start: '2026-10-01' }],
    holds: [{ membership: 'mc', from: '2026-11-01', to: '2026-11-30' }],
    checkins: [{ member: 'a', at: '2026-11-06T07:00' }, { member: 'b', at: '2026-10-01T07:00' }],
    bookings: [{ member: 'b', date: '2026-10-10', status: 'Attended' }, { member: 'b', date: '2026-10-20', status: 'No-show' }]
  };
  assert.strictEqual(L.lastSeen('b', ctx.checkins, ctx.bookings), '2026-10-10');
  assert.deepStrictEqual(L.atRisk(members, ctx, TODAY, 14), [{ member: 'e', lastSeen: '', days: 38 }, { member: 'b', lastSeen: '2026-10-10', days: 29 }]);
  assert.deepStrictEqual(L.atRisk(members, ctx, TODAY, 30).map((r) => r.member), ['e']);
});

test('monthlyMovement and fillRates for the retention dashboard', () => {
  const ms = [{ start: '2026-11-02' }, { start: '2026-10-15' }, { start: '2026-10-20', status: 'Cancelled', cancelledOn: '2026-11-01' }, { start: '2026-05-01', status: 'Cancelled', cancelledOn: '2026-10-03' }];
  assert.deepStrictEqual(L.monthlyMovement(ms, 3, TODAY), [{ month: '2026-09', joined: 0, cancelled: 0, net: 0 }, { month: '2026-10', joined: 2, cancelled: 1, net: 1 }, { month: '2026-11', joined: 1, cancelled: 1, net: 0 }]);
  const bks = [bk('1', 'a', 'Attended', { date: '2026-11-02' }), bk('2', 'b', 'No-show', { date: '2026-11-02' }), bk('3', 'a', 'Attended', { date: '2026-10-26' }), bk('4', 'b', 'Cancelled', { date: '2026-10-26' })];
  assert.deepStrictEqual(L.fillRates([yoga], bks, '2026-10-26', '2026-11-08'), [{ class: 'y', name: 'Yoga', sessions: 2, taken: 3, attended: 2, fill: 0.75 }]);
});

test('sample data: valid links, a full class with a waitlist, a hold, a clash and someone at risk', () => {
  const s = L.sample(TODAY);
  const has = (k) => new Set(s[k].map((x) => x.id));
  const mem = has('members'), pl = has('plans'), cl = has('classes'), tr = has('trainers'), ms = has('memberships');
  s.memberships.forEach((m) => { assert.ok(mem.has(m.member)); assert.ok(pl.has(m.plan)); });
  s.bookings.forEach((b) => { assert.ok(mem.has(b.member)); assert.ok(cl.has(b.class)); });
  s.classes.forEach((c) => assert.ok(tr.has(c.trainer)));
  s.holds.forEach((h) => assert.ok(ms.has(h.membership)));
  const yogaToday = s.classes.find((c) => c.id === 'c1');
  assert.strictEqual(L.occupancy(s.bookings, 'c1', TODAY), yogaToday.capacity);
  assert.strictEqual(L.waitlist(s.bookings, 'c1', TODAY).length, 2);
  assert.ok(L.timetableClashes(s.classes).length >= 1);
  const ctx = { memberships: s.memberships, plans: s.plans, holds: s.holds, checkins: s.checkins, bookings: s.bookings };
  assert.ok(L.atRisk(s.members, ctx, TODAY, 14).some((r) => r.member === 'm4'), 'Oliver has not been in for 27 days');
  assert.ok(!L.atRisk(s.members, ctx, TODAY, 14).some((r) => r.member === 'm5'), 'Priya is on hold');
  // every booking date matches its class weekday
  s.bookings.forEach((b) => assert.strictEqual(L.occurrences([s.classes.find((c) => c.id === b.class)], b.date, b.date).length, 1, b.id));
});
