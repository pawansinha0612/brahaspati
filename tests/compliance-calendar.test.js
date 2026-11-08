const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/compliance-calendar/lib.js');

const dues = (rule, from, to, opts) => L.occurrences(rule, from, to, opts).map(x => x.due);

test('date helpers: month-end clamping, leap years, weekend shift, business days', () => {
  assert.strictEqual(L.addMonths('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(L.addMonths('2028-01-31', 1), '2028-02-29');
  assert.strictEqual(L.addMonths('2026-11-15', 3), '2027-02-15');
  assert.strictEqual(L.make(2027, 2, 31), '2027-02-28');
  assert.strictEqual(L.shiftToBusinessDay('2027-02-28'), '2027-03-01'); // Sunday -> Monday
  assert.strictEqual(L.shiftToBusinessDay('2026-11-28'), '2026-11-30'); // Saturday -> Monday
  assert.strictEqual(L.shiftToBusinessDay('2026-10-28'), '2026-10-28'); // Wednesday stays
  assert.strictEqual(L.shiftToBusinessDay('2026-12-26', ['2026-12-28']), '2026-12-29'); // holiday list honoured
  assert.strictEqual(L.addBusinessDays('2026-07-03', 7), '2026-07-14'); // ATO example: paid Fri 3 Jul -> Tue 14 Jul
  assert.strictEqual(L.diffDays('2026-12-30', '2027-01-02'), 3);
});

test('quarterly BAS (self-lodger): 28 Oct, 28 Feb, 28 Apr, 28 Jul across the year boundary', () => {
  const r = { type: 'dates', dates: L.BAS_QUARTERLY_SELF };
  assert.deepStrictEqual(dues(r, '2026-08-01', '2027-06-30'), ['2026-10-28', '2027-02-28', '2027-04-28']);
  assert.deepStrictEqual(dues(r, '2026-07-01', '2027-07-31'), ['2026-07-28', '2026-10-28', '2027-02-28', '2027-04-28', '2027-07-28']);
  const n = L.nextDue(r, '2026-11-08', { shift: true });
  assert.deepStrictEqual(n, { date: '2027-02-28', due: '2027-03-01', label: 'Oct–Dec quarter' });
  assert.strictEqual(L.nextDue(r, '2026-10-28').due, '2026-10-28', 'due today counts as next');
});

test('monthly BAS: 21st of next month, December due 21 February, nothing on 21 January', () => {
  const r = { type: 'dates', dates: L.BAS_MONTHLY };
  const d = L.occurrences(r, '2026-12-01', '2027-03-31');
  assert.deepStrictEqual(d.map(x => x.date + ' ' + x.label), ['2026-12-21 November', '2027-02-21 January', '2027-02-21 December', '2027-03-21 February']);
  assert.strictEqual(L.BAS_MONTHLY.length, 12);
});

test('super guarantee quarterly dates and the switch to Payday Super from 1 July 2026', () => {
  assert.deepStrictEqual(dues({ type: 'dates', dates: L.SUPER_QUARTERLY }, '2026-01-01', '2026-12-31'), ['2026-01-28', '2026-04-28', '2026-07-28', '2026-10-28']);
  const obs = L.generate({ employees: true, superMode: 'payday', payFrequency: 'fortnightly', firstPayday: '2026-06-19' });
  const ps = obs.find(o => o.key === 'super-payday');
  // first payday on/after 1 July is 3 July -> due 14 July; paydays before 1 July are excluded
  assert.deepStrictEqual(dues(ps.rule, '2026-06-01', '2026-07-31'), ['2026-07-14', '2026-07-28']);
  assert.ok(obs.find(o => o.key === 'super-q-last'));
  assert.match(ps.notes, /7 business days/);
  const q = L.generate({ employees: true, superMode: 'quarterly' });
  assert.ok(q.find(o => o.key === 'super') && !q.find(o => o.key === 'super-payday'));
});

test('every-N rules: ASIC annual review + fee two months later, 3-year business name, until', () => {
  const obs = L.generate({ structure: 'company', asicReviewDate: '2025-03-15', businessNameRenewal: '2024-05-01', businessNameTerm: 3 });
  const rev = obs.find(o => o.key === 'asic-review'), fee = obs.find(o => o.key === 'asic-fee'), bn = obs.find(o => o.key === 'bn');
  assert.strictEqual(L.nextDue(rev.rule, '2026-11-08').due, '2027-03-15');
  assert.strictEqual(L.nextDue(fee.rule, '2026-11-08').due, '2027-05-15');
  assert.strictEqual(L.nextDue(bn.rule, '2026-11-08').due, '2027-05-01');
  assert.deepStrictEqual(dues({ type: 'every', start: '2026-01-31', months: 1, until: '2026-04-30' }, '2026-01-01', '2026-12-31'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepStrictEqual(dues({ type: 'monthly', d: 31 }, '2027-01-15', '2027-03-15'), ['2027-01-31', '2027-02-28']);
  assert.strictEqual(L.nextDue({ type: 'once', date: '2026-01-01' }, '2026-11-08'), null);
});

test('generate: structure, GST, lodger and option combinations', () => {
  const keys = p => L.generate(p).map(o => o.key);
  const sole = keys({ structure: 'sole', gst: false });
  assert.deepStrictEqual(sole, ['itr']);
  assert.strictEqual(L.generate({ structure: 'sole', gst: false })[0].rule.m, 10); // 31 Oct
  const co = L.generate({ structure: 'company', gst: true, fbt: true, tpar: true });
  assert.deepStrictEqual(co.find(o => o.key === 'itr').rule, { type: 'yearly', m: 2, d: 28 });
  assert.deepStrictEqual(co.find(o => o.key === 'fbt').rule, { type: 'yearly', m: 5, d: 21 });
  assert.ok(co.find(o => o.key === 'tpar') && co.find(o => o.key === 'asic-review'));
  const agent = L.generate({ lodger: 'agent', gst: true, incomeTaxDate: '2027-06-05' });
  assert.strictEqual(agent.find(o => o.key === 'bas').rule.dates[0].m, 11); // 25 Nov
  assert.deepStrictEqual(agent.find(o => o.key === 'itr').rule, { type: 'yearly', m: 6, d: 5 });
  const emp = keys({ gst: false, employees: true, superMode: 'quarterly' });
  assert.ok(emp.includes('paygw') && emp.includes('stp-final') && emp.includes('workers-comp'));
  assert.ok(!keys({ gst: true, basCycle: 'quarterly', employees: true }).includes('paygw'), 'PAYGW goes on the quarterly BAS');
  assert.ok(keys({ structure: 'trust' }).includes('trust-res'));
});

test('items: statuses (done, overdue, due-soon, upcoming), start date and lead time', () => {
  const obs = [{ id: 'bas', title: 'BAS', category: 'Tax', leadDays: 14, rule: { type: 'dates', dates: L.BAS_QUARTERLY_SELF } }];
  const today = '2027-04-20';
  const list = L.items(obs, { 'bas|2027-02-28': { done: true, doneOn: '2027-02-25', evidence: 'receipt 1' } }, today, { from: '2026-07-01', to: '2027-07-31', shift: true, startDate: '2026-11-01' });
  assert.deepStrictEqual(list.map(x => x.due + ':' + x.status), ['2027-03-01:done', '2027-04-28:due-soon', '2027-07-28:upcoming']);
  assert.strictEqual(list[0].shifted, true);
  assert.strictEqual(list[0].evidence, 'receipt 1');
  assert.strictEqual(list[1].remind, '2027-04-14');
  const noStart = L.items(obs, {}, today, { from: '2026-07-01', to: '2027-04-30' });
  assert.deepStrictEqual(noStart.map(x => x.status), ['overdue', 'overdue', 'overdue', 'due-soon']);
  assert.deepStrictEqual(L.summary(noStart), { overdue: 3, dueSoon: 1, upcoming: 0, done: 0 });
  assert.strictEqual(L.items([Object.assign({}, obs[0], { enabled: false })], {}, today).length, 0);
  assert.strictEqual(L.nextFor(obs[0], {}, '2027-05-01', { startDate: '2027-04-29' }).due, '2027-07-28');
  assert.strictEqual(L.nextFor(obs[0], {}, '2027-05-01', { startDate: '2027-04-01' }).status, 'overdue');
});

test('month grid starts on Monday and places items on their due day', () => {
  const g = L.monthGrid(2027, 3, [{ due: '2027-03-01', title: 'BAS' }]);
  assert.strictEqual(g[0][0].date, '2027-03-01'); // 1 March 2027 is a Monday
  assert.strictEqual(g[0][0].items.length, 1);
  assert.ok(g.length >= 5 && g.every(w => w.length === 7));
  assert.strictEqual(L.monthGrid(2026, 11, [])[0][0].date, '2026-10-26');
});

test('ICS export: RFC 5545 CRLF, all-day dates, escaping, folding and alarms', () => {
  const ics = L.toICS([{ key: 'o1|2027-02-28', title: 'BAS; GST, PAYG', label: 'Oct–Dec quarter', category: 'Tax', date: '2027-02-28', due: '2027-03-01', shifted: true, remind: '2027-02-15', notes: 'Line one\nLine two ' + 'x'.repeat(120) }], { now: '2026-11-08T10:20:30.000Z' });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'every newline is CRLF');
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20270301\r\nDTEND;VALUE=DATE:20270302'));
  assert.ok(ics.includes('DTSTAMP:20261108T102030Z'));
  assert.ok(ics.includes('SUMMARY:Due: BAS\\; GST\\, PAYG (Oct–Dec quarter)'));
  assert.ok(ics.includes('TRIGGER:-P14D'));
  ics.split('\r\n').forEach(l => assert.ok(Buffer.byteLength(l) <= 75, 'line too long: ' + l));
  assert.ok(ics.includes('Line one\\nLine two'));
  assert.strictEqual(L.icsEscape('a\\b'), 'a\\\\b');
});

test('rule editing round-trip and day-month list parsing', () => {
  assert.deepStrictEqual(L.parseDayMonthList('28 Oct, 28/2, 5 July; 31 Foo').dates, [{ m: 10, d: 28 }, { m: 2, d: 28 }, { m: 7, d: 5 }]);
  assert.deepStrictEqual(L.parseDayMonthList('31 Foo, 40 Jan').bad, ['31 Foo', '40 Jan']);
  [{ type: 'yearly', m: 5, d: 21 }, { type: 'monthly', d: 21 }, { type: 'every', start: '2026-03-15', months: 12 }, { type: 'every', start: '2026-07-03', days: 14, offsetBusinessDays: 7 }, { type: 'once', date: '2027-01-01' }]
    .forEach(r => assert.deepStrictEqual(L.formToRule(L.ruleToForm(r), r).rule, r));
  const kept = L.formToRule(L.ruleToForm({ type: 'dates', dates: L.BAS_QUARTERLY_SELF }), { type: 'dates', dates: L.BAS_QUARTERLY_SELF }).rule;
  assert.strictEqual(kept.dates[0].label, 'Jul–Sep quarter');
  assert.match(L.formToRule({ kind: 'dates', list: 'soon' }).error, /Could not read/);
  assert.match(L.formToRule({ kind: 'every', date: '', n: 1 }).error, /first due date/);
  assert.strictEqual(L.describeRule({ type: 'every', start: '2024-05-01', months: 36 }), 'Every 3 years from 1 May 2024');
});

test('financial year and printable plan (escaped, grouped by month)', () => {
  assert.deepStrictEqual(L.financialYear('2026-11-08'), { from: '2026-07-01', to: '2027-06-30', label: 'FY2026–27' });
  assert.deepStrictEqual(L.financialYear('2027-03-01').label, 'FY2026–27');
  const html = L.planHtml([{ title: '<b>BAS</b>', label: 'Q1', category: 'Tax', due: '2026-10-28', date: '2026-10-28', done: true, evidence: 'ok' }], { title: 'Plan & co' });
  assert.ok(html.includes('&lt;b&gt;BAS&lt;/b&gt;') && html.includes('Plan &amp; co') && html.includes('Oct 2026') && html.includes('General information only'));
  const rows = L.toCSVRows([{ title: 'BAS', label: 'Q1', category: 'Tax', due: '2026-10-28', date: '2026-10-28', remind: '2026-10-14', status: 'done', doneOn: '2026-10-20', evidence: 'r', attachment: 'a.pdf' }]);
  assert.strictEqual(rows[0]['Due date'], '2026-10-28');
  assert.strictEqual(L.normalize(null).profile.shiftWeekend, true);
});
