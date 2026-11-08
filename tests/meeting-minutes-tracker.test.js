const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/meeting-minutes/lib.js');

const M1 = ['2026-10-14', 'Relaunch kick-off', 'Priya Shah: We agreed to go with Stripe for payments.\nPriya Shah: Sam, can you send the signed contract to finance by Friday?\nSam Lee: Sure.\nAlex Chen: I will update the pricing page by next Monday.\nMia Wong: I will book the user testing sessions by 20/10.'];
const M2 = ['2026-10-21', 'Relaunch sync', 'Priya Shah: Sam, can you send the signed contract to finance? It is still not done.\nAlex Chen: I will update the pricing page this week, sorry it slipped.\nPriya Shah: Decision: we will launch on 2 November.\nSam Lee: One risk is legal has not reviewed the terms.\nAlex Chen: Who owns the help centre articles?'];
const M3 = ['2026-10-28', 'Relaunch sync', 'Priya Shah: Sam, please send the signed contract to finance today.\nAlex Chen: I will write the launch email by next Tuesday.'];
function libOf(list) { let lib = []; list.forEach(([d, t, x]) => { lib = L.upsertMeeting(lib, L.toEntry(L.extract(x, d), { title: t, date: d, transcript: x })); }); return lib; }
const lib = libOf([M3, M1, M2]); // saved out of order on purpose
const TODAY = '2026-11-08';

test('similarity: same action in different words matches, different actions do not', () => {
  assert.ok(L.similarity('Sam, can you send the signed contract to finance by Friday.', 'Sam, please send the signed contract to finance today.') >= 0.5);
  assert.ok(L.similarity('I will update the pricing page by next Monday.', 'I will update the pricing page this week, sorry it slipped.') >= 0.5);
  assert.ok(L.similarity('Update the pricing page.', 'Write the launch email.') < 0.3);
  assert.strictEqual(L.similarity('', 'anything'), 0);
});
test('library entries: sorted by date, actions open by default, transcript kept', () => {
  assert.deepStrictEqual(lib.map((m) => m.date), ['2026-10-14', '2026-10-21', '2026-10-28']);
  assert.ok(lib[0].actions.every((a) => a.status === 'open' && a.id));
  assert.ok(lib[1].decisions.some((d) => /launch on 2 November/.test(d.text)));
  assert.match(lib[0].transcript, /Stripe/);
  assert.deepStrictEqual(lib[1].questions, ['Who owns the help centre articles?']);
});
test('saving the same meeting again replaces it and keeps statuses', () => {
  let l2 = L.setStatus(lib, L.buildTracker(lib, TODAY).find((i) => /launch email/.test(i.task)), 'done');
  l2 = L.upsertMeeting(l2, L.toEntry(L.extract(M3[2], M3[0]), { title: 'relaunch sync', date: M3[0] }));
  assert.strictEqual(l2.length, 3);
  assert.strictEqual(l2[2].actions.find((a) => /launch email/.test(a.task)).status, 'done');
});
test('carried over: the contract action shows up in three meetings as one tracked item', () => {
  const items = L.buildTracker(lib, TODAY);
  const contract = items.filter((i) => /contract/.test(i.task));
  assert.strictEqual(contract.length, 1);
  assert.strictEqual(contract[0].carried, 2);
  assert.deepStrictEqual(contract[0].meetings.map((m) => m.date), ['2026-10-14', '2026-10-21', '2026-10-28']);
  assert.strictEqual(contract[0].owner, 'Sam Lee');
  assert.strictEqual(contract[0].due, '2026-10-28', 'latest due date wins');
  assert.strictEqual(items.find((i) => /pricing/.test(i.task)).carried, 1);
});
test('overdue: open/blocked past due are flagged and sorted first; done is not overdue', () => {
  const items = L.buildTracker(lib, TODAY);
  assert.ok(items[0].overdue);
  const contract = items.find((i) => /contract/.test(i.task));
  assert.strictEqual(contract.daysOverdue, 11);
  const done = L.buildTracker(L.setStatus(lib, contract, 'done'), TODAY).find((i) => /contract/.test(i.task));
  assert.strictEqual(done.status, 'done'); assert.strictEqual(done.overdue, false);
  const blocked = L.buildTracker(L.setStatus(lib, contract, 'blocked'), TODAY).find((i) => /contract/.test(i.task));
  assert.ok(blocked.overdue);
  assert.strictEqual(L.setStatus(lib, contract, 'nonsense'), lib);
});
test('setStatus and updateAction change every meeting the item appears in, without mutating', () => {
  const items = L.buildTracker(lib, TODAY), c = items.find((i) => /contract/.test(i.task));
  const l2 = L.updateAction(L.setStatus(lib, c, 'dropped'), c, { due: '2026-12-01' });
  const hits = l2.flatMap((m) => m.actions).filter((a) => c.refs.some((r) => r.actionId === a.id));
  assert.strictEqual(hits.length, 3);
  assert.ok(hits.every((a) => a.status === 'dropped' && a.due === '2026-12-01'));
  assert.ok(lib.flatMap((m) => m.actions).every((a) => a.status === 'open'));
});
test('per-person view counts open, blocked, overdue and done', () => {
  const people = L.byPerson(L.buildTracker(lib, TODAY));
  const sam = people.find((p) => p.owner === 'Sam Lee');
  assert.ok(sam.open >= 1 && sam.overdue >= 1);
  assert.ok(people.some((p) => p.owner === 'Alex Chen'));
});
test('decision log: newest first, searchable by words', () => {
  const all = L.decisionLog(lib);
  assert.ok(all.length >= 2);
  assert.ok(all[0].date >= all[all.length - 1].date);
  const s = L.decisionLog(lib, 'stripe payments');
  assert.strictEqual(s.length, 1); assert.strictEqual(s[0].meeting, 'Relaunch kick-off');
  assert.strictEqual(L.decisionLog(lib, 'zebra').length, 0);
});
test('exports: CSV with quoting and CRLF, Markdown tables, decisions CSV', () => {
  const items = L.buildTracker(lib, TODAY);
  const csv = L.trackerCSV(items);
  assert.ok(csv.startsWith('Owner,Action,Due,Status,Overdue,Times raised'));
  assert.ok(csv.includes('\r\n'));
  assert.ok(/"Sam, please send the signed contract/.test(csv));
  const md = L.trackerMarkdown(items, L.decisionLog(lib), TODAY);
  assert.match(md, /\| Sam Lee \| .*contract.* \| .*overdue \| open \| 3× \(carried over\) \|/);
  assert.match(md, /## Decisions/);
  assert.ok(L.decisionsCSV(L.decisionLog(lib)).startsWith('Date,Meeting,Decision,Said by\r\n'));
});
test('agenda: overdue, blocked, carried-over and open sections plus last meeting questions', () => {
  const l2 = L.setStatus(lib, L.buildTracker(lib, TODAY).find((i) => /testing/.test(i.task)), 'blocked');
  const items = L.buildTracker(l2, '2026-11-04');
  const a = L.agenda(items, l2, { title: 'Relaunch sync', date: '2026-11-04' });
  assert.match(a, /^# Relaunch sync\n\n\*\*Date:\*\* Wed 4 Nov 2026/);
  assert.match(a, /## 1\. Overdue actions/);
  assert.match(a, /Sam Lee — .*contract.* — 7 days late/);
  assert.match(a, /Blocked/);
  assert.match(a, /## \d\. New business/);
  const none = L.agenda([], [], { date: '2026-11-04' });
  assert.ok(!/Overdue/.test(none) && /New business/.test(none));
});
test('"Name, please …" now gives the action an owner (old outputs unchanged)', () => {
  const m = L.extract('Priya: Sam, please send the contract today.', '2026-11-11');
  assert.strictEqual(m.actions[0].owner, 'Sam'); assert.strictEqual(m.actions[0].due, '2026-11-11');
});
