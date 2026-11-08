const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/logistics-tower/lib.js');

const TODAY = '2026-11-09'; // Monday
const con = (id, extra) => Object.assign({ id, number: id, date: TODAY, status: 'Booked', weight: 0, pallets: 0 }, extra);
const gary = { id: 'g', name: 'Gary', licenceClass: 'HR', licenceExpiry: '2028-01-01', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] };
const nina = { id: 'n', name: 'Nina', licenceClass: 'MR', licenceExpiry: '2027-01-01', days: ['Mon', 'Tue'] };
const kate = { id: 'k', name: 'Kate', licenceClass: 'C', licenceExpiry: '2027-06-01' };
const heavy = { id: 'hr', rego: 'HR1', licenceClass: 'HR', maxKg: 9000, maxPallets: 12, maxCubic: 45 };
const medium = { id: 'mr', rego: 'MR1', licenceClass: 'MR', maxKg: 6000, maxPallets: 8 };
const van = { id: 'van', rego: 'VAN1', licenceClass: 'C', maxKg: 1100, maxPallets: 2 };

test('licence classes: higher covers lower', () => {
  assert.strictEqual(L.classOk('HR', 'MR'), true);
  assert.strictEqual(L.classOk('MR', 'HR'), false);
  assert.strictEqual(L.classOk('C', 'C'), true);
  assert.strictEqual(L.classOk('MC', 'HC'), true);
  assert.strictEqual(L.classOk('', 'C'), false);
  assert.strictEqual(L.classOk('LR', undefined), true, 'no vehicle class means car');
});

test('load and runSpan add up a run', () => {
  assert.deepStrictEqual(L.load([{ weight: 1200.5, pallets: 2, cubic: 4.2, items: 10 }, { weight: 300, pallets: 1, items: 2 }]), { kg: 1500.5, pallets: 3, cubic: 4.2, items: 12 });
  assert.deepStrictEqual(L.runSpan([{ windowFrom: '08:00', windowTo: '10:00' }, { windowFrom: '06:30', windowTo: '09:00' }]), { from: 390, to: 600 });
  assert.deepStrictEqual(L.runSpan([{ windowFrom: '08:00' }]), { from: 480, to: 1440 });
});

test('driverAvailability: days, leave and inactive', () => {
  assert.strictEqual(L.driverAvailability(nina, '2026-11-11'), 'Nina does not work Wed');
  assert.strictEqual(L.driverAvailability(Object.assign({}, gary, { leaveFrom: '2026-11-09', leaveTo: '2026-11-13' }), '2026-11-12'), 'Gary is on leave');
  assert.strictEqual(L.driverAvailability(Object.assign({}, gary, { active: false }), TODAY), 'Gary is not active');
  assert.strictEqual(L.driverAvailability(kate, '2026-11-15'), '', 'no days set = any day');
});

test('checkAllocation catches licence class, expiry, rego and capacity', () => {
  const c = con('a', { driver: 'k', vehicle: 'mr', weight: 500 });
  assert.match(L.checkAllocation(c, [c], [kate], [medium]).errors.join(), /Kate holds class C — MR1 needs MR/);
  const exp = con('b', { driver: 'n', vehicle: 'mr' });
  assert.match(L.checkAllocation(exp, [], [Object.assign({}, nina, { licenceExpiry: '2026-11-01' })], [medium]).errors.join(), /licence expired 2026-11-01/);
  assert.match(L.checkAllocation(exp, [], [nina], [Object.assign({}, medium, { regoExpiry: '2026-11-08' })]).errors.join(), /registration expired/);
  // capacity counts everything on the vehicle that day
  const x = con('x', { driver: 'g', vehicle: 'van', weight: 700, pallets: 1 }), y = con('y', { driver: 'g', vehicle: 'van', weight: 600, pallets: 1, date: TODAY });
  const r = L.checkAllocation(y, [x, y], [gary], [van]);
  assert.deepStrictEqual(r.errors, ['VAN1 over weight: 1300 kg of 1100 kg']);
  const other = con('z', { driver: 'g', vehicle: 'van', weight: 700, date: '2026-11-10' });
  assert.deepStrictEqual(L.checkAllocation(y, [other, y], [gary], [van]).errors, [], 'another day does not count');
});

test('checkAllocation warns on availability and blocks a vehicle shared at overlapping times', () => {
  const wed = con('a', { date: '2026-11-11', driver: 'n', vehicle: 'mr' });
  const r = L.checkAllocation(wed, [wed], [nina], [Object.assign({}, medium, { serviceDue: '2026-11-01' })]);
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.warnings, ['Nina does not work Wed', 'MR1 service overdue (2026-11-01)']);
  const g1 = con('g1', { driver: 'g', vehicle: 'mr', windowFrom: '08:00', windowTo: '12:00' });
  const n1 = con('n1', { driver: 'n', vehicle: 'mr', windowFrom: '10:00', windowTo: '14:00' });
  assert.match(L.checkAllocation(n1, [g1, n1], [gary, nina], [medium]).errors.join(), /already on another driver's run/);
  const n2 = Object.assign({}, n1, { windowFrom: '13:00', windowTo: '16:00' });
  assert.deepStrictEqual(L.checkAllocation(n2, [g1, n2], [gary, nina], [medium]).errors, [], 'afternoon shift on the same truck is fine');
});

test('autoAllocate respects licence classes and capacity, heaviest first', () => {
  const cons = [con('big', { weight: 7800, pallets: 10 }), con('mid', { weight: 2000, pallets: 4 }), con('small', { weight: 400, pallets: 1 })];
  const res = L.autoAllocate(cons, [gary, nina, kate], [heavy, medium, van], TODAY);
  const by = Object.fromEntries(res.assignments.map((a) => [a.id, a]));
  assert.deepStrictEqual([by.big.driver, by.big.vehicle], ['g', 'hr'], 'only Gary can drive the HR truck that fits 7.8 t');
  assert.deepStrictEqual([by.mid.driver, by.mid.vehicle], ['n', 'mr'], '7.8 + 2.0 t is over 9 t, so the medium rigid goes out (the van is too small)');
  assert.deepStrictEqual([by.small.driver, by.small.vehicle], ['n', 'mr'], 'joins a truck already going out — the smaller one — instead of sending the van');
  assert.deepStrictEqual(res.unassigned, []);
  assert.strictEqual(cons[0].driver, undefined, 'input not mutated');
});

test('autoAllocate opens a second truck when the first is full and reports what it cannot place', () => {
  const cons = [con('a', { weight: 8500, pallets: 11 }), con('b', { weight: 3000, pallets: 5 }), con('c', { weight: 20000 })];
  const res = L.autoAllocate(cons, [gary, nina, kate], [heavy, medium, van], TODAY);
  const by = Object.fromEntries(res.assignments.map((a) => [a.id, a]));
  assert.deepStrictEqual([by.a.driver, by.a.vehicle], ['g', 'hr']);
  assert.deepStrictEqual([by.b.driver, by.b.vehicle], ['n', 'mr'], 'Nina takes the medium rigid');
  assert.deepStrictEqual(res.unassigned.map((u) => u.id), ['c']);
  assert.match(res.unassigned[0].reason, /over weight/);
});

test('autoAllocate skips drivers on leave and consignments already allocated or on other days', () => {
  const cons = [con('a', { weight: 300 }), con('done', { weight: 100, driver: 'g', vehicle: 'van', status: 'Allocated' }), con('tue', { date: '2026-11-10', weight: 100 })];
  const onLeave = Object.assign({}, kate, { leaveFrom: TODAY });
  const res = L.autoAllocate(cons, [onLeave, gary], [van], TODAY);
  assert.deepStrictEqual(res.assignments, [{ id: 'a', driver: 'g', vehicle: 'van' }], 'Gary already has the van today; Kate is on leave');
});

test('runSheet orders a driver\'s day by delivery window, no window last', () => {
  const cons = [con('late', { driver: 'g', windowFrom: '13:00', windowTo: '15:00' }), con('none', { driver: 'g' }), con('early', { driver: 'g', windowFrom: '05:00', windowTo: '07:00' }),
    con('tight', { driver: 'g', windowFrom: '13:00', windowTo: '14:00' }), con('x', { driver: 'n', windowFrom: '04:00' }), con('cx', { driver: 'g', status: 'Cancelled', windowFrom: '01:00' })];
  assert.deepStrictEqual(L.runSheet(cons, 'g', TODAY).map((c) => c.id), ['early', 'tight', 'late', 'none']);
});

test('onTime / inFull / otif and exception rate', () => {
  const ex = [{ consignment: 'b', type: 'Damaged' }, { consignment: 'c', type: 'Late' }, { consignment: 'e', type: 'Failed delivery' }];
  const cons = [
    con('a', { status: 'Delivered', windowTo: '10:00', deliveredAt: TODAY + 'T09:50' }),
    con('b', { status: 'Delivered', windowTo: '10:00', deliveredAt: TODAY + 'T09:00' }),
    con('c', { status: 'Delivered', windowTo: '10:00', deliveredAt: TODAY + 'T10:20' }),
    con('d', { status: 'Delivered', deliveredAt: '2026-11-10T07:00' }),
    con('e', { status: 'Exception' }),
    con('f', { status: 'Cancelled' })
  ];
  assert.deepStrictEqual(cons.map((c) => L.onTime(c)), [true, true, false, false, null, null]);
  assert.deepStrictEqual(cons.map((c) => L.inFull(c, ex)), [true, false, true, true, null, null]);
  assert.strictEqual(L.inFull(Object.assign({}, cons[0], { inFull: false }), ex), false);
  const o = L.otif(cons, ex, TODAY, TODAY);
  assert.deepStrictEqual([o.due, o.delivered, o.onTime, o.inFull, o.otif, o.otifPct, o.exceptions, o.exceptionRate], [5, 4, 2, 3, 1, 0.25, 3, 0.6]);
  assert.deepStrictEqual(L.otif([], [], TODAY, TODAY).otifPct, 0);
});

test('runningLate flags open consignments past the window', () => {
  const c = con('a', { status: 'In transit', windowTo: '10:00' });
  assert.strictEqual(L.runningLate(c, TODAY, '10:30'), true);
  assert.strictEqual(L.runningLate(c, TODAY, '09:30'), false);
  assert.strictEqual(L.runningLate(Object.assign({}, c, { date: '2026-11-08' }), TODAY, '06:00'), true);
  assert.strictEqual(L.runningLate(Object.assign({}, c, { status: 'Delivered' }), TODAY, '23:00'), false);
});

test('sample data: valid links, work to auto-allocate today and tomorrow, sensible OTIF', () => {
  const s = L.sample(TODAY);
  const has = (k) => new Set(s[k].map((x) => x.id));
  const cu = has('customers'), dr = has('drivers'), ve = has('vehicles'), co = has('consignments');
  s.consignments.forEach((c) => { assert.ok(cu.has(c.customer)); if (c.driver) assert.ok(dr.has(c.driver)); if (c.vehicle) assert.ok(ve.has(c.vehicle)); });
  s.exceptions.forEach((x) => assert.ok(co.has(x.consignment)));
  const today = L.autoAllocate(s.consignments, s.drivers, s.vehicles, TODAY);
  assert.strictEqual(today.assignments.length, 2, JSON.stringify(today.unassigned));
  const tomorrow = L.autoAllocate(s.consignments, s.drivers, s.vehicles, '2026-11-10');
  assert.strictEqual(tomorrow.assignments.length, 3, JSON.stringify(tomorrow.unassigned));
  // existing allocations pass the hard checks
  s.consignments.filter((c) => c.driver && c.date >= TODAY).forEach((c) => assert.deepStrictEqual(L.checkAllocation(c, s.consignments, s.drivers, s.vehicles).errors, [], c.id));
  const o = L.otif(s.consignments, s.exceptions, '2026-10-01', TODAY);
  assert.ok(o.otifPct > 0 && o.otifPct < 1, String(o.otifPct));
});
