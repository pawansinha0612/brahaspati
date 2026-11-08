const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/cleaning-os/lib.js');

const TODAY = '2026-11-08'; // Sunday
// Week of Mon 2026-11-09
const job = (id, start, hours, extra) => Object.assign({ id, start, hours, status: 'Scheduled', cleaner: '' }, extra);
const maria = { id: 'm', name: 'Maria', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], from: '06:00', to: '15:00', maxHours: 10 };
const ken = { id: 'k', name: 'Ken', days: ['Mon', 'Wed', 'Fri'], from: '16:00', to: '23:00', maxHours: 20 };
const grace = { id: 'g', name: 'Grace', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], from: '07:00', to: '22:00', maxHours: 6 };

test('checklistFor builds grouped items per site type; unknown types fall back to Office', () => {
  const home = L.checklistFor('Home');
  assert.deepStrictEqual([...new Set(home.map((i) => i.group))], ['Kitchen', 'Bathrooms', 'Living and bedrooms']);
  assert.ok(home.every((i) => !i.done && i.id));
  assert.strictEqual(L.checklistFor('Spaceship').length, L.checklistFor('Office').length);
  const fresh = L.freshChecklist([{ id: 'a', text: 'Mop', group: 'Floors', done: true, notes: 'x' }]);
  assert.deepStrictEqual([fresh[0].text, fresh[0].group, fresh[0].done, fresh[0].notes], ['Mop', 'Floors', false, '']);
  assert.notStrictEqual(fresh[0].id, 'a');
});

test('overlaps respects the travel gap and different days', () => {
  const a = job('a', '2026-11-09T09:00', 2), b = job('b', '2026-11-09T11:00', 1), c = job('c', '2026-11-10T09:00', 2);
  assert.strictEqual(L.overlaps(a, b, 0), false, 'back-to-back is fine with no gap');
  assert.strictEqual(L.overlaps(a, b, 30), true, 'but not with 30 min travel');
  assert.strictEqual(L.overlaps(a, c, 30), false);
});

test('availability explains why a cleaner cannot take a job', () => {
  assert.strictEqual(L.availability(maria, job('x', '2026-11-14T09:00', 2)), 'does not work Sat');
  assert.strictEqual(L.availability(maria, job('x', '2026-11-09T05:30', 2)), 'starts at 06:00');
  assert.strictEqual(L.availability(maria, job('x', '2026-11-09T14:00', 2)), 'finishes at 15:00');
  assert.strictEqual(L.availability(maria, job('x', '2026-11-09T13:00', 2)), '');
  assert.strictEqual(L.availability(Object.assign({}, maria, { active: false }), job('x', '2026-11-09T09:00', 1)), 'not active');
});

test('autoAllocate respects availability and never double-books', () => {
  const jobs = [job('a', '2026-11-09T09:00', 3), job('b', '2026-11-09T10:00', 2), job('c', '2026-11-09T18:00', 3)];
  const res = L.autoAllocate(jobs, [maria, ken, grace], { gapMin: 30 });
  const by = Object.fromEntries(res.assignments.map((x) => [x.job, x.cleaner]));
  assert.strictEqual(by.c, 'k', 'evening job goes to the evening cleaner with fewest hours');
  assert.notStrictEqual(by.a, by.b, 'overlapping jobs go to different people');
  assert.ok(['m', 'g'].includes(by.a) && ['m', 'g'].includes(by.b));
  assert.deepStrictEqual(res.unassigned, []);
  assert.strictEqual(jobs[0].cleaner, '', 'input not mutated');
});

test('autoAllocate balances hours across the week', () => {
  const both = [{ id: 'p', name: 'Pat', maxHours: 40 }, { id: 'q', name: 'Quinn', maxHours: 40 }];
  const jobs = ['09', '10', '11', '12', '13'].map((d, i) => job('j' + i, '2026-11-' + d + 'T09:00', 2));
  const res = L.autoAllocate(jobs, both, {});
  const count = (id) => res.assignments.filter((a) => a.cleaner === id).length;
  assert.deepStrictEqual([count('p'), count('q')].sort(), [2, 3]);
});

test('autoAllocate keeps under weekly max hours, counting already-assigned jobs', () => {
  const jobs = [job('done', '2026-11-09T09:00', 5, { cleaner: 'g' }), job('new', '2026-11-10T09:00', 2)];
  const res = L.autoAllocate(jobs, [grace], {});
  assert.deepStrictEqual(res.assignments, []);
  assert.match(res.unassigned[0].reason, /Grace: would go over 6 h this week/);
  // a job in the next week does not count towards this week's hours
  const ok = L.autoAllocate([jobs[0], job('nextweek', '2026-11-16T09:00', 2)], [grace], {});
  assert.deepStrictEqual(ok.assignments, [{ job: 'nextweek', cleaner: 'g' }]);
});

test('autoAllocate only touches unassigned Scheduled jobs inside the date range, longest first', () => {
  const jobs = [job('done', '2026-11-09T09:00', 2, { status: 'Done' }), job('out', '2026-11-20T09:00', 2), job('short', '2026-11-09T09:00', 1), job('long', '2026-11-09T09:30', 4)];
  const res = L.autoAllocate(jobs, [{ id: 'solo', name: 'Solo', maxHours: 40 }], { from: '2026-11-09', to: '2026-11-15', gapMin: 0 });
  assert.deepStrictEqual(res.assignments, [{ job: 'long', cleaner: 'solo' }]);
  assert.deepStrictEqual(res.unassigned.map((u) => u.job), ['short']);
  assert.match(res.unassigned[0].reason, /already booked/);
});

test('doubleBookings finds overlaps already in the roster, ignoring cancelled jobs', () => {
  const jobs = [job('a', '2026-11-09T09:00', 2, { cleaner: 'm' }), job('b', '2026-11-09T10:00', 1, { cleaner: 'm' }), job('c', '2026-11-09T10:00', 1, { cleaner: 'k' }), job('d', '2026-11-09T09:30', 1, { cleaner: 'm', status: 'Cancelled' })];
  assert.deepStrictEqual(L.doubleBookings(jobs), [['a', 'b']]);
});

test('lateness, flags and worked hours', () => {
  const j = job('a', '2026-11-05T18:00', 3, { status: 'Done', arrived: '18:20', finished: '21:05' });
  assert.strictEqual(L.lateMinutes(j), 20);
  assert.strictEqual(L.jobFlag(j, TODAY), 'late');
  assert.strictEqual(L.jobFlag(Object.assign({}, j, { arrived: '18:10' }), TODAY), 'ok');
  assert.strictEqual(L.jobFlag(job('b', '2026-11-07T09:00', 2), TODAY), 'overdue');
  assert.strictEqual(L.jobFlag(job('b', '2026-11-09T09:00', 2), TODAY), 'upcoming');
  assert.strictEqual(L.jobFlag(job('b', '2026-11-07T09:00', 2, { status: 'Missed' }), TODAY), 'missed');
  assert.strictEqual(L.workedHours(j), 2.75);
  assert.strictEqual(L.workedHours(Object.assign({}, j, { actualHours: 3.5 })), 3.5);
  assert.strictEqual(L.workedHours(job('c', '2026-11-05T18:00', 2, { status: 'Done' })), 2);
});

test('hoursReport totals done hours per cleaner in range for payroll', () => {
  const jobs = [
    job('a', '2026-11-02T18:00', 3, { cleaner: 'k', status: 'Done', arrived: '18:00', finished: '21:30' }),
    job('b', '2026-11-04T18:00', 2, { cleaner: 'k', status: 'Done', arrived: '18:40', finished: '20:30' }),
    job('c', '2026-11-05T18:00', 2, { cleaner: 'k', status: 'Missed' }),
    job('d', '2026-11-03T09:00', 2, { cleaner: 'm', status: 'Done' }),
    job('e', '2026-10-30T09:00', 2, { cleaner: 'm', status: 'Done' })
  ];
  const r = L.hoursReport(jobs, [Object.assign({ rate: 34 }, ken), Object.assign({ rate: 32.5 }, maria)], '2026-11-02', '2026-11-08', TODAY);
  assert.deepStrictEqual(r.rows.map((x) => [x.name, x.jobs, x.hours, x.booked, x.late, x.missed, x.pay]), [['Ken', 2, 5.33, 5, 1, 1, 181.22], ['Maria', 1, 2, 2, 0, 0, 65]]);
  assert.deepStrictEqual(r.total, { jobs: 3, hours: 7.33, pay: 246.22 });
});

test('sample data: links are valid and the roster has work to allocate', () => {
  const s = L.sample(TODAY);
  const sites = new Set(s.sites.map((x) => x.id)), cl = new Set(s.cleaners.map((x) => x.id));
  s.jobs.forEach((j) => { assert.ok(sites.has(j.site)); if (j.cleaner) assert.ok(cl.has(j.cleaner)); assert.ok(j.checklist.length > 0); });
  const res = L.autoAllocate(s.jobs, s.cleaners, { from: TODAY });
  assert.ok(res.assignments.length >= 4, 'allocated ' + res.assignments.length);
  const after = s.jobs.map((j) => Object.assign({}, j, { cleaner: (res.assignments.find((a) => a.job === j.id) || {}).cleaner || j.cleaner }));
  assert.deepStrictEqual(L.doubleBookings(after), []);
});
