const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/onboarding/lib.js');

const START = '2026-11-16'; // a Monday

test('templates: every role has tasks in every phase, training and equipment', () => {
  Object.keys(L.TEMPLATES).forEach((role) => {
    const tasks = L.templateTasks(role);
    L.PHASES.forEach((ph) => assert.ok(tasks.some((t) => t.phase === ph.id), role + ' has ' + ph.id));
    tasks.forEach((t) => assert.ok(L.OWNERS.includes(t.owner), role + ': owner ' + t.owner));
    assert.ok(L.TEMPLATES[role].training.length >= 3);
    assert.ok(L.TEMPLATES[role].equipment.length >= 3);
  });
  assert.deepStrictEqual(Object.keys(L.TEMPLATES), ['office', 'warehouse', 'retail', 'remote', 'trade']);
});

test('dueDate: offsets from start, weekends move to Friday before / Monday after', () => {
  assert.strictEqual(L.dueDate(START, 0), '2026-11-16');
  assert.strictEqual(L.dueDate(START, -7), '2026-11-09');
  assert.strictEqual(L.dueDate(START, -2), '2026-11-13'); // Sat 14 → Fri 13
  assert.strictEqual(L.dueDate(START, -1), '2026-11-13'); // Sun 15 → Fri 13
  assert.strictEqual(L.dueDate(START, 5), '2026-11-23'); // Sat 21 → Mon 23
  assert.strictEqual(L.dueDate(START, 4), '2026-11-20');
});

test('newPerson: builds tasks with due dates, documents by employment type and role', () => {
  const p = L.newPerson({ name: 'Jess', role: 'warehouse', type: 'casual', start: START, manager: 'Marco' });
  const ids = p.docs.map((d) => d.id);
  assert.ok(ids.includes('casual') && !ids.includes('fixed'));
  assert.ok(ids.includes('licences'));
  ['contract', 'fwis', 'tfn', 'super', 'bank', 'policies'].forEach((x) => assert.ok(ids.includes(x), x));
  const office = L.newPerson({ name: 'Liam', role: 'office', type: 'fixed-term', start: START });
  const oids = office.docs.map((d) => d.id);
  assert.ok(oids.includes('fixed') && !oids.includes('casual') && !oids.includes('licences'));
  const induct = p.tasks.find((t) => /Site-specific induction/.test(t.title));
  assert.strictEqual(induct.due, START);
  assert.ok(p.tasks.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.due)));
  assert.ok(p.training.some((m) => /Forklift/.test(m.name) && m.validMonths === 12));
  assert.strictEqual(L.newPerson({ name: 'X', role: 'nonsense', start: START }).role, 'office');
});

test('documents never hold numbers: only received yes/no and a date', () => {
  const p = L.newPerson({ name: 'A', role: 'office', start: START });
  p.docs.forEach((d) => assert.deepStrictEqual(Object.keys(d).sort(), ['date', 'id', 'name', 'optional', 'received', 'when', 'who'].sort()));
});

test('reschedule: moving the start date shifts template tasks but keeps hand-set dates and done flags', () => {
  const p = L.newPerson({ name: 'A', role: 'office', start: START });
  p.tasks[0].done = true;
  p.tasks.push({ id: 'custom', phase: 'week1', owner: 'HR', offset: null, title: 'Custom', due: '2026-11-19', done: false });
  L.reschedule(p, '2026-11-23');
  assert.strictEqual(p.tasks.find((t) => t.offset === 0).due, '2026-11-23');
  assert.strictEqual(p.tasks[0].done, true);
  assert.strictEqual(p.tasks.find((t) => t.id === 'custom').due, '2026-11-19');
});

test('training: expiry from completion + months (end-of-month safe) and status bands', () => {
  assert.strictEqual(L.trainingExpiry({ completed: '2025-01-31', validMonths: 1 }), '2025-02-28');
  assert.strictEqual(L.trainingExpiry({ completed: '2024-11-20', validMonths: 36 }), '2027-11-20');
  assert.strictEqual(L.trainingExpiry({ completed: '2024-11-20', validMonths: null }), '');
  const T = '2026-11-08';
  assert.strictEqual(L.trainingStatus({ completed: '' }, T), 'not done');
  assert.strictEqual(L.trainingStatus({ completed: '2026-01-01', validMonths: null }, T), 'complete');
  assert.strictEqual(L.trainingStatus({ completed: '2025-11-20', validMonths: 12 }, T), 'expiring');
  assert.strictEqual(L.trainingStatus({ completed: '2025-11-01', validMonths: 12 }, T), 'expired');
  assert.strictEqual(L.trainingStatus({ completed: '2026-06-01', validMonths: 12 }, T), 'valid');
});

test('refreshers: lists expired and soon-to-expire training across people, soonest first', () => {
  const a = L.newPerson({ name: 'Ann', role: 'trade', start: '2024-01-08' });
  const b = L.newPerson({ name: 'Ben', role: 'retail', start: '2024-01-08' });
  a.training.find((m) => /CPR/.test(m.name)).completed = '2025-10-01'; // expired 2026-10-01
  b.training.find((m) => /RSA/.test(m.name)).completed = '2021-12-01'; // expires 2026-12-01
  const r = L.refreshers([a, b], '2026-11-08', 60);
  assert.deepStrictEqual(r.map((x) => [x.person, x.status]), [['Ann', 'expired'], ['Ben', 'expiring']]);
  assert.strictEqual(r[0].days, -38);
});

test('progress and overdue: counts tasks, required docs and training; phase by day', () => {
  const p = L.newPerson({ name: 'Cleo', role: 'office', start: START });
  const T = '2026-11-20';
  let g = L.progress(p, T);
  assert.strictEqual(g.phase, 'week1');
  assert.strictEqual(g.day, 4);
  const expectedOverdue = p.tasks.filter((t) => t.due < T).length;
  assert.strictEqual(g.overdue, expectedOverdue);
  assert.strictEqual(g.docs, p.docs.filter((d) => !d.optional).length); // optional WWCC not counted
  p.tasks.forEach((t) => { t.done = true; });
  p.docs.forEach((d) => { d.received = true; });
  p.training.forEach((m) => { m.completed = '2026-11-16'; });
  g = L.progress(p, T);
  assert.strictEqual(g.pct, 100);
  assert.strictEqual(g.overdue, 0);
  assert.strictEqual(L.progress(p, '2026-11-01').phase, 'before');
  assert.strictEqual(L.progress(p, '2027-06-01').phase, 'done');
  const q = L.newPerson({ name: 'Dee', role: 'office', start: START });
  const over = L.overdueTasks([q], '2026-11-18');
  assert.ok(over.length > 0 && over[0].daysLate >= over[over.length - 1].daysLate);
  const soon = L.dueSoon([q], '2026-11-18', 7);
  assert.ok(soon.every((s) => s.due >= '2026-11-18' && s.due <= '2026-11-25'));
});

test('sensitive: catches TFNs (checksum), BSB/account, card numbers; ignores ordinary text', () => {
  assert.strictEqual(L.tfnValid('123456782'), true);
  assert.strictEqual(L.tfnValid('123456789'), false);
  assert.deepStrictEqual(L.sensitive('her number is 123 456 782'), ['a tax file number']);
  assert.deepStrictEqual(L.sensitive('TFN: 876 543 210'), ['a tax file number']);
  assert.ok(L.sensitive('BSB 062-000 account 12345678').includes('bank details (BSB / account)'));
  assert.ok(L.sensitive('Acct no. 98765432').includes('bank details (BSB / account)'));
  assert.ok(L.sensitive('card 4111 1111 1111 1111').includes('a card number'));
  assert.deepStrictEqual(L.sensitive('Starts Monday 16 Nov, desk 12, mobile 0412 345 678, asset LT-0042'), []);
});

test('toICS: CRLF, all-day key dates, probation end, training expiry reminders, escaped text', () => {
  const p = L.newPerson({ name: 'Sam, Jr; "S"', role: 'trade', start: START, probationMonths: 6 });
  p.training.find((m) => /CPR/.test(m.name)).completed = '2026-11-16';
  const ics = L.toICS(p, '20261108T000000Z');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics));
  assert.match(ics, /DTSTART;VALUE=DATE:20261116\r\nDTEND;VALUE=DATE:20261117/);
  assert.match(ics, /end of probation \(6 months\)/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270516/); // probation end
  assert.match(ics, /DTSTART;VALUE=DATE:20271116/); // CPR expires
  assert.match(ics, /book CPR \(HLTAID009\) refresher/);
  assert.match(ics, /Sam\\, Jr\\; "S"/);
  const events = ics.match(/BEGIN:VEVENT/g).length;
  assert.strictEqual(events, ics.match(/END:VEVENT/g).length);
});

test('CSV rows and welcome pack: statuses, escaping and starter-facing content', () => {
  const p = L.newPerson({ name: 'Ana <script>', position: 'Retail assistant', role: 'retail', start: START, manager: 'Kim' });
  const rows = L.taskRows([p], '2026-11-18');
  assert.ok(rows.some((r) => r.Status === 'Overdue') && rows.some((r) => r.Status === 'To do'));
  assert.deepStrictEqual(Object.keys(rows[0]), ['Person', 'Position', 'Start', 'Phase', 'Task', 'Owner', 'Due', 'Status', 'Completed']);
  assert.strictEqual(L.summaryRows([p], '2026-11-18')[0].Template, 'Retail / hospitality');
  const html = L.welcomePack(p, { name: 'Corner Store', startTime: '9am', bring: 'ID' });
  assert.match(html, /Welcome to Corner Store, Ana!/);
  assert.match(html, /Monday 16 November 2026/);
  assert.match(html, /Responsible Service of Alcohol/);
  assert.match(html, /don’t email bank or tax file numbers/);
  assert.ok(!/<script>/.test(html));
  assert.ok(!/Before day 1<\/h3>/.test(html)); // internal pre-start tasks are not shown to the starter
});
