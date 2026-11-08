const test = require('node:test');
const assert = require('node:assert');
const B = require('../assets/core.js');
const L = require('../apps/no-show-predictor/lib.js');

const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= (eps || 1e-9), 'expected ' + b + ' got ' + a);
const TODAY = Date.parse('2026-11-08T00:00:00Z');

test('detectColumns maps Cliniko / Fresha style exports', () => {
  const m = L.detectColumns(['Appointment Date', 'Start Time', 'Patient ID', 'Appointment Type', 'Practitioner', 'Booked On', 'Source', 'SMS reminder', 'Attendance']);
  assert.strictEqual(m.date, 'Appointment Date');
  assert.strictEqual(m.time, 'Start Time');
  assert.strictEqual(m.customer, 'Patient ID');
  assert.strictEqual(m.service, 'Appointment Type');
  assert.strictEqual(m.staff, 'Practitioner');
  assert.strictEqual(m.booked, 'Booked On');
  assert.strictEqual(m.channel, 'Source');
  assert.strictEqual(m.reminder, 'SMS reminder');
  assert.strictEqual(m.status, 'Attendance');
});

test('status words are classified', () => {
  assert.strictEqual(L.status('Completed'), 'attended');
  assert.strictEqual(L.status('Arrived'), 'attended');
  assert.strictEqual(L.status('DNA'), 'noshow');
  assert.strictEqual(L.status('Did not arrive'), 'noshow');
  assert.strictEqual(L.status('No Show'), 'noshow');
  assert.strictEqual(L.status('Cancelled (late)'), 'late');
  assert.strictEqual(L.status('Late cancellation'), 'late');
  assert.strictEqual(L.status('Cancelled'), 'cancelled');
  assert.strictEqual(L.status('Confirmed'), 'open');
  assert.strictEqual(L.status(''), 'open');
  assert.strictEqual(L.yesNo('SMS sent'), true);
  assert.strictEqual(L.yesNo('No'), false);
});

test('parseDateTime handles separate and combined date/time, am/pm and day-first dates', () => {
  const a = L.parseDateTime('2026-03-04', '2:30 pm');
  assert.strictEqual(new Date(a.t).toISOString(), '2026-03-04T14:30:00.000Z');
  const b = L.parseDateTime('04/03/2026 09:15');
  assert.strictEqual(new Date(b.t).toISOString(), '2026-03-04T09:15:00.000Z');
  assert.ok(b.hasTime);
  const c = L.parseDateTime('2026-03-04T08:05:00');
  assert.strictEqual(new Date(c.t).getUTCHours(), 8);
  const d = L.parseDateTime('Wed, 4 Mar 2026 12:00 am');
  assert.strictEqual(new Date(d.t).toISOString(), '2026-03-04T00:00:00.000Z');
  assert.strictEqual(L.parseDateTime('2026-03-04').hasTime, false);
});

test('prepare: drops cancellations, counts late cancels as missed, builds history without peeking ahead', () => {
  const t = B.csv.toObjects(`Date,Time,Client,Status,Booked
2026-10-01,9:00,C1,No-show,2026-09-20
2026-10-08,9:00,C1,Completed,2026-10-02
2026-10-09,10:00,C2,Cancelled,2026-10-01
2026-10-15,9:00,C1,Cancelled late,2026-10-14
2026-10-20,11:00,C2,Attended,2026-10-20
2026-11-10,9:00,C1,Booked,2026-11-01`);
  const info = L.prepare(t.rows, L.detectColumns(t.headers), { today: TODAY });
  assert.strictEqual(info.past.length, 4);
  assert.strictEqual(info.upcoming.length, 1);
  assert.strictEqual(info.cancelled, 1);
  assert.strictEqual(info.noShows, 2);
  assert.strictEqual(info.past[0].leadDays, 11);
  assert.strictEqual(info.past[0].priorCount, 0);
  assert.strictEqual(info.past[2].priorCount, 2); // C1's third: two earlier visits, one missed
  assert.strictEqual(info.past[2].priorNoShows, 1);
  assert.strictEqual(info.upcoming[0].priorNoShows, 2);
  assert.strictEqual(info.past[0].isNew, true); // derived from history when no column
  const strict = L.prepare(t.rows, L.detectColumns(t.headers), { today: TODAY, lateAsNoShow: false });
  assert.strictEqual(strict.noShows, 1);
});

test('AUC: perfect, reversed, random-with-ties (hand computed)', () => {
  assert.strictEqual(L.auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1]), 1);
  assert.strictEqual(L.auc([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1]), 0);
  // pos {0.5, 0.3}, neg {0.5, 0.1}: pairs (0.5>0.1)=1, (0.5=0.5)=0.5, (0.3>0.1)=1, (0.3<0.5)=0 -> 2.5/4
  assert.strictEqual(L.auc([0.5, 0.3, 0.5, 0.1], [1, 1, 0, 0]), 0.625);
  assert.strictEqual(L.auc([0.2, 0.3], [0, 0]), null);
});

test('calibration bins average predictions and outcomes', () => {
  const c = L.calibration([0.1, 0.2, 0.3, 0.4], [0, 0, 1, 1], 2);
  assert.strictEqual(c.length, 2);
  near(c[0].predicted, 0.15); near(c[0].actual, 0);
  near(c[1].predicted, 0.35); near(c[1].actual, 1);
});

test('logistic regression learns a clear signal and L2 shrinks weights', () => {
  const X = [], y = [];
  const R = L.rng(7);
  for (let i = 0; i < 400; i++) { const x = R() * 4 - 2; X.push([x]); y.push(R() < L.sigmoid(2 * x - 1) ? 1 : 0); }
  const m = L.trainLogistic(X, y, { iters: 2000, lr: 0.5, lambda: 0 });
  assert.ok(m.w[0] > 1.4 && m.w[0] < 2.8, 'slope ' + m.w[0]);
  assert.ok(m.b < -0.4 && m.b > -1.6, 'bias ' + m.b);
  const s = L.trainLogistic(X, y, { iters: 2000, lr: 0.5, lambda: 1 });
  assert.ok(Math.abs(s.w[0]) < Math.abs(m.w[0]));
  near(L.predict({ w: [0], b: 0 }, [5]), 0.5);
});

test('miss distribution and overbooking (hand computed)', () => {
  // two appointments at 50%: P(0)=.25, P(1)=.5, P(2)=.25
  const d = L.missDistribution([0.5, 0.5]);
  d.forEach((v, i) => near(v, [0.25, 0.5, 0.25][i]));
  // P(>=1)=0.75 -> at 80% confidence overbook 0, at 70% overbook 1
  assert.strictEqual(L.overbook([0.5, 0.5], 0.8), 0);
  assert.strictEqual(L.overbook([0.5, 0.5], 0.7), 1);
  // 20 appointments at 20%: expected 4, P(>=2)=0.931, P(>=3)=0.794 -> overbook 2 at 80%
  assert.strictEqual(L.overbook(new Array(20).fill(0.2), 0.8), 2);
});

test('risk level is relative to the base rate with absolute floors', () => {
  assert.strictEqual(L.riskLevel(0.3, 0.08), 'High');
  assert.strictEqual(L.riskLevel(0.13, 0.08), 'Medium');
  assert.strictEqual(L.riskLevel(0.05, 0.08), 'Low');
  assert.strictEqual(L.riskLevel(0.3, 0.2), 'Medium');
  assert.strictEqual(L.riskLevel(0.22, 0.2), 'Low');
});

test('small data is handled honestly', () => {
  const t = B.csv.toObjects('Date,Status\n2026-10-01,Completed\n2026-10-02,No-show\n2026-10-03,Completed');
  const info = L.prepare(t.rows, L.detectColumns(t.headers), { today: TODAY });
  const m = L.buildModel(info);
  assert.strictEqual(m.type, 'none');
  assert.match(m.warnings[0], /not enough/);
});

test('sample data: model beats chance, rates show the planted patterns, recommendations follow', () => {
  const s = L.sampleData('2026-11-08');
  const info = L.prepare(s.rows, L.detectColumns(s.headers), { today: TODAY });
  assert.ok(info.past.length > 3000);
  assert.ok(info.upcoming.length > 100);
  assert.ok(info.baseRate > 0.05 && info.baseRate < 0.15, 'base ' + info.baseRate);
  const rem = Object.fromEntries(L.rateBy(info.past, 'reminder').map((g) => [g.key, g.rate]));
  assert.ok(rem['No reminder'] > 1.5 * rem['Reminder sent']);
  const nw = Object.fromEntries(L.rateBy(info.past, 'isNew').map((g) => [g.key, g.rate]));
  assert.ok(nw['New customer'] > nw['Returning customer']);
  const model = L.buildModel(info);
  assert.strictEqual(model.type, 'logistic');
  assert.ok(model.test.auc > 0.6, 'auc ' + model.test.auc);
  const scored = info.upcoming.map((a) => { const r = model.score(a); return { appt: a, p: r.p, reasons: r.reasons, level: L.riskLevel(r.p, info.baseRate) }; });
  assert.ok(scored.every((x) => x.p > 0 && x.p < 1));
  assert.ok(scored.some((x) => x.reasons.length > 0));
  const days = L.byDay(scored, 0.8);
  assert.ok(days.length >= 10);
  days.forEach((d) => { assert.ok(d.clashRisk <= 0.2 + 1e-9); });
  const recs = L.recommendations(info, { value: 90 }).map((r) => r.title).join(' | ');
  assert.match(recs, /Remind everyone/);
  assert.match(recs, /deposit/);
  assert.match(recs, /cost you/);
});

test('points model is used for small but usable histories', () => {
  const s = L.sampleData('2026-11-08');
  const info = L.prepare(s.rows.slice(0, 150), L.detectColumns(s.headers), { today: TODAY });
  const m = L.buildModel(info);
  assert.strictEqual(m.type, 'points');
  assert.match(m.warnings[0], /Small history/);
  const r = m.score(info.past[0]);
  assert.ok(r.p > 0 && r.p < 1);
});

test('ics output uses CRLF and escapes text', () => {
  const out = L.ics([{ t: Date.parse('2026-11-10T07:00:00Z'), summary: 'Call C1001, 9am', description: 'Risk; high' }]);
  assert.ok(out.includes('\r\nDTSTART:20261110T070000\r\n'));
  assert.ok(out.includes('SUMMARY:Call C1001\\, 9am'));
  assert.ok(out.includes('DESCRIPTION:Risk\\; high'));
  assert.ok(out.endsWith('END:VCALENDAR\r\n'));
});

test('manually added upcoming appointments are scored with the customer history from the file', () => {
  const t = B.csv.toObjects('Date,Client,Status\n2026-10-01,C9,No-show\n2026-10-08,C9,No-show\n2026-10-09,C8,Completed');
  const info = L.prepare(t.rows, L.detectColumns(t.headers), { today: TODAY, extra: [{ date: '2026-11-12', time: '9:30am', customer: 'C9', reminder: 'No', id: 'm1' }] });
  assert.strictEqual(info.upcoming.length, 1);
  const u = info.upcoming[0];
  assert.ok(u.manual);
  assert.strictEqual(u.id, 'm1');
  assert.strictEqual(u.hour, 9);
  assert.strictEqual(u.priorNoShows, 2);
  assert.strictEqual(u.reminder, false);
});
