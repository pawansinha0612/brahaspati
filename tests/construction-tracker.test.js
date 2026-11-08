const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/construction-tracker/lib.js');

const TODAY = '2026-11-08';

test('progress is weighted by stage length; milestones count one day', () => {
  const stages = [{ start: '2026-11-01', end: '2026-11-10', pct: 100 }, { start: '2026-11-11', end: '2026-11-30', pct: 50 }, { start: '2026-12-01', end: '2026-12-01', pct: 0, milestone: true }];
  // 10 days done + 20 * 0.5 = 20 of 31
  assert.strictEqual(Math.round(L.progress(stages) * 1000) / 1000, Math.round(20 / 31 * 1000) / 1000);
  assert.strictEqual(L.progress([]), 0);
  assert.strictEqual(L.progress([{ start: '2026-11-01', end: '2026-11-02', pct: 150 }]), 1, 'clamped at 100%');
});

test('plannedProgress assumes even work through each stage up to today', () => {
  const stages = [{ start: '2026-11-01', end: '2026-11-10' }, { start: '2026-11-11', end: '2026-11-20' }];
  assert.strictEqual(L.plannedProgress(stages, '2026-11-05'), 5 / 20);
  assert.strictEqual(L.plannedProgress(stages, '2026-11-25'), 1);
  assert.strictEqual(L.plannedProgress(stages, '2026-10-01'), 0);
});

test('gantt positions bars as % of the full range, marks late stages and today', () => {
  const g = L.gantt([
    { id: 'b', name: 'Frame', start: '2026-11-11', end: '2026-11-20', pct: 40 },
    { id: 'a', name: 'Slab', start: '2026-11-01', end: '2026-11-10', pct: 100 },
    { id: 'c', name: 'Undated', start: '' }
  ], '2026-11-06');
  assert.strictEqual(g.from, '2026-11-01'); assert.strictEqual(g.to, '2026-11-20'); assert.strictEqual(g.days, 20);
  assert.deepStrictEqual(g.rows.map((r) => [r.id, r.left, r.width]), [['a', 0, 50], ['b', 50, 50]]);
  assert.strictEqual(g.todayPct, 25);
  const late = L.gantt([{ id: 'x', start: '2026-11-01', end: '2026-11-05', pct: 80 }], TODAY);
  assert.strictEqual(late.rows[0].late, true);
  assert.strictEqual(late.todayPct, null, 'today outside the range');
  assert.deepStrictEqual(L.gantt([], TODAY).rows, []);
});

test('budgetReport: actual from costs, committed from open orders, variance and flags', () => {
  const r = L.budgetReport(
    [{ code: '04 Concrete', amount: 26000 }, { code: '05 Framing', amount: 52000 }, { code: '07 Plumbing', amount: 24000 }],
    [{ code: '04 Concrete', amount: 24750 }, { code: '05 Framing', amount: 31800 }, { code: '05 Framing', amount: 22600 }, { code: '', amount: 300 }],
    [{ code: '07 Plumbing', cost: 6400, status: 'Ordered' }, { code: '05 Framing', cost: 31800, status: 'Invoiced' }, { code: '07 Plumbing', cost: 999, status: 'Cancelled' }]
  );
  const by = Object.fromEntries(r.rows.map((x) => [x.code, x]));
  assert.deepStrictEqual([by['04 Concrete'].variance, by['04 Concrete'].flag], [1250, 'close']);
  assert.deepStrictEqual([by['05 Framing'].actual, by['05 Framing'].variance, by['05 Framing'].flag], [54400, -2400, 'over']);
  assert.deepStrictEqual([by['07 Plumbing'].committed, by['07 Plumbing'].variance, by['07 Plumbing'].flag], [6400, 17600, 'ok']);
  assert.strictEqual(by.Uncoded.actual, 300);
  assert.strictEqual(by.Uncoded.variancePct, null);
  assert.deepStrictEqual(r.total, { budget: 102000, actual: 79450, committed: 6400, forecast: 85850, variance: 16150 });
});

test('contractValue adds approved variations (credits too), reports pending separately', () => {
  const v = [{ project: 'p1', amount: 7800, status: 'Approved' }, { project: 'p1', amount: -2200, status: 'Approved' }, { project: 'p1', amount: 3450, status: 'Pending' }, { project: 'p1', amount: 500, status: 'Rejected' }, { project: 'p2', amount: 9999, status: 'Approved' }];
  assert.deepStrictEqual(L.contractValue({ id: 'p1', contract: 285000 }, v), { original: 285000, approved: 5600, pending: 3450, current: 290600 });
});

test('delaySummary totals days by cause, biggest first', () => {
  const s = L.delaySummary([{ cause: 'Weather', days: 3 }, { cause: 'Materials late', days: 2 }, { cause: 'Weather', days: 1.5 }, { days: 1 }]);
  assert.strictEqual(s.total, 7.5);
  assert.deepStrictEqual(s.byCause, [{ label: 'Weather', value: 4.5 }, { label: 'Materials late', value: 2 }, { label: 'Other', value: 1 }]);
});

test('orderStatus spots late deliveries', () => {
  assert.strictEqual(L.orderStatus({ status: 'Ordered', expected: '2026-11-07' }, TODAY), 'Late');
  assert.strictEqual(L.orderStatus({ status: 'Ordered', expected: '2026-11-08' }, TODAY), 'Ordered');
  assert.strictEqual(L.orderStatus({ status: 'Ordered', expected: '2026-11-01', delivered: '2026-11-02' }, TODAY), 'Delivered');
  assert.strictEqual(L.orderStatus({ status: 'Cancelled', expected: '2026-11-01' }, TODAY), 'Cancelled');
});

test('compliance: expired beats expiring beats missing', () => {
  assert.strictEqual(L.compliance({ licenceExpiry: '2026-11-07', insuranceExpiry: '2026-11-20', workersCompExpiry: '2027-06-01' }, TODAY).status, 'expired');
  const s = L.compliance({ licenceExpiry: '2027-06-01', insuranceExpiry: '2026-11-20', workersCompExpiry: '2027-06-01' }, TODAY);
  assert.strictEqual(s.status, 'expiring');
  assert.deepStrictEqual(s.docs.find((d) => d.status === 'expiring'), { doc: 'Public liability insurance', expiry: '2026-11-20', days: 12, status: 'expiring' });
  const m = L.compliance({ licenceExpiry: '2027-06-01', insuranceExpiry: '2027-06-01' }, TODAY);
  assert.strictEqual(m.status, 'missing'); assert.deepStrictEqual(m.missing, ["Workers' compensation"]);
  assert.strictEqual(L.compliance({ licenceExpiry: '2027-06-01', insuranceExpiry: '2027-06-01', workersCompExpiry: '2027-06-01' }, TODAY).status, 'ok');
});

test('projectReport on sample data hangs together', () => {
  const s = L.sample(TODAY), p = s.projects[0];
  const r = L.projectReport(p, s, TODAY);
  assert.strictEqual(r.contract.current, 290600);
  assert.strictEqual(r.delays.total, 7);
  assert.deepStrictEqual(r.lateOrders.map((o) => o.id), ['o2']);
  assert.ok(r.progress > 0.4 && r.progress < 0.7, 'progress ' + r.progress);
  assert.strictEqual(r.diary[0].date, TODAY);
  assert.ok(r.budget.rows.some((b) => b.flag === 'over'));
  assert.strictEqual(L.compliance(s.contractors[1], TODAY).status, 'expired');
});

test('sample records all point at real projects', () => {
  const s = L.sample(TODAY), ids = new Set(s.projects.map((p) => p.id));
  ['stages', 'orders', 'budget', 'costs', 'delays', 'variations', 'diary'].forEach((k) => s[k].forEach((r) => assert.ok(ids.has(r.project), k + ' ' + r.id)));
  s.costs.concat(s.orders).forEach((r) => assert.ok(L.COST_CODES.includes(r.code), r.code));
});
