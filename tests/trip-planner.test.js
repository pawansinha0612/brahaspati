const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/trip-planner/lib.js');

const TODAY = '2026-11-08';
const trip = (o) => Object.assign(L.defaultTrip(TODAY), { start: '2026-12-07', end: '2026-12-09', lunch: false }, o); // Mon–Wed
const act = (o) => L.normaliseActivity(Object.assign({ id: o.name, duration: 120, open: '09:00', close: '17:00', area: 'Centre' }, o));
const placed = (s) => s.days.map((d) => d.items.filter((x) => x.type === 'activity').map((x) => x.act.name));

test('party and costs: under 3 free, 3–15 child, 16+ adult', () => {
  const t = trip({ travellers: [{ age: 40 }, { age: 16 }, { age: 9 }, { age: 2 }] });
  assert.deepStrictEqual(L.party(t), { adults: 2, children: 1, infants: 1, youngest: 2, count: 4 });
  assert.strictEqual(L.costOf(act({ name: 'Zoo', costAdult: 50, costChild: 30.5 }), t), 130.5);
});

test('every activity is placed inside opening hours and the day window, without overlaps', () => {
  const t = trip({ dayStart: '08:00', dayEnd: '19:00', pace: 'packed' });
  const acts = [act({ name: 'Early market', open: '07:00', close: '11:00', duration: 90 }), act({ name: 'Museum', open: '10:00', close: '17:00', duration: 180 }),
    act({ name: 'Sunset cruise', open: '17:00', close: '19:00', duration: 120, area: 'Harbour' }), act({ name: 'Gallery', duration: 90 })];
  const s = L.schedule(t, acts);
  assert.strictEqual(s.unscheduled.length, 0);
  s.days.forEach((d) => {
    let last = -1;
    d.items.filter((x) => x.type !== 'block').forEach((x) => { assert.ok(x.start >= last, 'no overlap on ' + d.date); last = x.end; });
    d.items.filter((x) => x.type === 'activity').forEach((x) => {
      assert.ok(x.start >= L.toMin(x.act.open) && x.end <= L.toMin(x.act.close), x.act.name + ' in hours');
      assert.ok(x.start >= 480 && x.end <= 1140);
    });
  });
});

test('same-area activities are grouped on one day and get short travel', () => {
  const t = trip({ pace: 'normal' });
  const acts = [act({ name: 'A1', area: 'North' }), act({ name: 'B1', area: 'South' }), act({ name: 'A2', area: 'North' }), act({ name: 'B2', area: 'South' })];
  const s = L.schedule(t, acts);
  const byDay = placed(s).filter((d) => d.length);
  assert.strictEqual(byDay.length, 2);
  byDay.forEach((d) => assert.strictEqual(new Set(d.map((n) => n[0])).size, 1, 'one area per day: ' + d));
  const hop = s.days.flatMap((d) => d.items).find((x) => x.type === 'travel' && x.label === 'Walk / short hop');
  assert.strictEqual(hop.end - hop.start, L.TRAVEL.car.same);
});

test('pace limits the number of activities per day', () => {
  const acts = [1, 2, 3, 4, 5, 6].map((i) => act({ name: 'Thing ' + i, duration: 60, area: 'Area ' + i }));
  const relaxed = L.schedule(trip({ pace: 'relaxed' }), acts);
  placed(relaxed).forEach((d) => assert.ok(d.length <= 2));
  assert.strictEqual(relaxed.unscheduled.length, 0);
  const oneDay = L.schedule(trip({ end: '2026-12-07', pace: 'relaxed' }), acts);
  assert.strictEqual(oneDay.unscheduled.length, 4);
  assert.match(oneDay.unscheduled[0].reason, /pace/);
});

test('must-dos win over lower priorities when time is short', () => {
  const t = trip({ end: '2026-12-07', dayStart: '09:00', dayEnd: '13:00' });
  const s = L.schedule(t, [act({ name: 'Nice', priority: 'maybe', duration: 180 }), act({ name: 'Key', priority: 'must', duration: 180 })]);
  assert.deepStrictEqual(placed(s), [['Key']]);
  assert.strictEqual(s.unscheduled[0].act.name, 'Nice');
});

test('nap and lunch are protected; long outings absorb them', () => {
  const t = trip({ end: '2026-12-07', lunch: true, napMins: 90, napStart: '13:00', travellers: [{ age: 35 }, { age: 2 }], dayEnd: '18:00' });
  const s = L.schedule(t, [act({ name: 'Playground', duration: 60, open: '12:30', close: '18:00' })]);
  const pg = s.days[0].items.find((x) => x.type === 'activity');
  assert.ok(pg.start - 30 >= L.toMin('14:30'), 'starts after the nap ends (with travel): ' + L.hhmm(pg.start));
  const blocks = s.days[0].items.filter((x) => x.type === 'block').map((x) => x.label);
  assert.deepStrictEqual(blocks, ['Lunch', 'Nap / quiet time']);
  const park = L.schedule(t, [act({ name: 'Theme park', duration: 360, open: '09:30', close: '17:00' })]);
  assert.strictEqual(park.unscheduled.length, 0);
  assert.ok(park.days[0].items.some((x) => x.type === 'block' && /during Theme park/.test(x.label) && /pram/.test(x.label)));
  // without a child under 5 no nap is added
  assert.strictEqual(L.blocks(trip({ napMins: 90, travellers: [{ age: 30 }, { age: 8 }] })).length, 0);
});

test('kids: non-kid-friendly skipped, rest break after long outings', () => {
  const t = trip({ travellers: [{ age: 35 }, { age: 6 }], pace: 'packed' });
  const s = L.schedule(t, [act({ name: 'Wine tour', kidFriendly: false }), act({ name: 'Zoo', duration: 180, open: '09:00' }), act({ name: 'Pool', duration: 60, open: '09:00', close: '18:00' })]);
  assert.match(s.unscheduled.find((u) => u.act.name === 'Wine tour').reason, /kid-friendly/);
  assert.ok(s.days.some((d) => d.items.some((x) => x.type === 'rest')));
});

test('closed days, fixed dates and rainy days are respected', () => {
  const t = trip({ rainDays: ['2026-12-08'] });
  // 2026-12-07 is a Monday
  const s = L.schedule(t, [act({ name: 'Gallery', closedDays: [1], setting: 'indoor', priority: 'must' }), act({ name: 'Concert', date: '2026-12-09', setting: 'indoor' }),
    act({ name: 'Hike', setting: 'outdoor', date: '2026-12-08' })]);
  const where = {}; s.days.forEach((d) => d.items.forEach((x) => { if (x.act) where[x.act.name] = d.date; }));
  assert.notStrictEqual(where.Gallery, '2026-12-07');
  assert.strictEqual(where.Concert, '2026-12-09');
  assert.strictEqual(where.Hike, undefined);
  assert.match(s.unscheduled[0].reason, /rainy/);
});

test('budget: activities budget is what is left after fixed costs; over-budget extras skipped, must-dos warned', () => {
  const t = trip({ budget: 1000, costs: [{ label: 'Hotel', planned: 900 }], travellers: [{ age: 30 }] });
  assert.strictEqual(L.activityBudget(t), 100);
  const s = L.schedule(t, [act({ name: 'Cheap', costAdult: 60, priority: 'must' }), act({ name: 'Pricey', costAdult: 80, priority: 'want' }), act({ name: 'Big must', costAdult: 70, priority: 'must' })]);
  assert.ok(!placed(s).flat().includes('Pricey'));
  assert.match(s.unscheduled.find((u) => u.act.name === 'Pricey').reason, /budget/);
  assert.strictEqual(s.cost, 130);
  assert.ok(s.warnings.some((w) => /over/.test(w)));
  const b = L.budgetSummary(Object.assign(t, { spends: [{ category: 'Hotel', amount: 300 }, { category: 'Activities', amount: 60 }, { category: 'Snacks', amount: 12 }] }), s);
  assert.deepStrictEqual(b.rows.map((r) => [r.label, r.planned, r.spent]), [['Hotel', 900, 300], ['Activities (from itinerary)', 130, 60], ['Other', 0, 12]]);
  assert.strictEqual(b.over, true);
  assert.strictEqual(b.left, 628);
});

test('packing list adapts to ages, weather, trip type and transport', () => {
  const g = L.packingList(trip({ travellers: [{ age: 35 }, { age: 1 }, { age: 6 }], weather: 'hot', tripType: 'beach', transport: 'car' }));
  const names = g.map((x) => x.group);
  ['Baby (under 2)', 'Kids (5–12)', 'Beach', 'Car'].forEach((n) => assert.ok(names.includes(n), n));
  assert.ok(!names.includes('Toddler (2–4)'));
  assert.ok(g.find((x) => x.group === 'Sun and weather').items.includes('Sunscreen SPF 50+'));
  const cold = L.packingList(trip({ weather: 'cold', transport: 'flights' }));
  assert.ok(cold.find((x) => x.group === 'Clothes (each person)').items.some((i) => /Thermal/.test(i)));
  assert.ok(cold.find((x) => x.group === 'Flights').items.some((i) => /100 ml/.test(i)));
});

test('calendar and printable itinerary', () => {
  const s = L.sample(TODAY);
  const sch = L.schedule(s.trip, s.activities);
  const ev = L.icsEvents(s.trip, sch);
  assert.ok(ev.length >= 4);
  assert.match(ev[0].start, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  const html = L.itineraryHTML(s.trip, sch);
  assert.ok(html.includes('Day 1') && html.includes('Gold Coast (sample)'));
  assert.ok(html.includes('check opening hours'));
});

test('templates are generic and all schedulable', () => {
  Object.values(L.TEMPLATES).forEach((tp) => tp.items.forEach((a) => { assert.ok(a.template); assert.ok(L.toMin(a.close) > L.toMin(a.open)); }));
  const s = L.schedule(trip({ end: '2026-12-13', pace: 'normal' }), L.TEMPLATES.city.items.map((a, i) => Object.assign({ id: 'c' + i }, a)));
  assert.strictEqual(s.unscheduled.length, 0);
});

test('bad dates give a warning, not a crash', () => {
  assert.deepStrictEqual(L.schedule(trip({ end: '2026-12-01' }), [act({ name: 'X' })]).warnings, ['Set the trip start and end dates.']);
});
