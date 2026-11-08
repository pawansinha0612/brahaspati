const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/property-inspection/lib.js');

const TODAY = '2026-11-08';
let n = 0; const mk = (o) => Object.assign({ id: 'i' + (++n), done: false, notes: '', photos: [] }, o);

test('roomType recognises common Australian room names', () => {
  assert.strictEqual(L.roomType('Ensuite'), 'bathroom');
  assert.strictEqual(L.roomType('Main bedroom'), 'bedroom');
  assert.strictEqual(L.roomType('Entry / hallway'), 'entry');
  assert.strictEqual(L.roomType('Double garage'), 'outdoor');
  assert.strictEqual(L.roomType('Family room'), 'living');
});

test('buildChecklist makes room-grouped items with empty ratings', () => {
  const items = L.buildChecklist('Kitchen\n\n Bathroom \n', mk);
  assert.strictEqual(items.length, L.ROOM_ITEMS.kitchen.length + L.ROOM_ITEMS.bathroom.length);
  assert.deepStrictEqual([...new Set(items.map((i) => i.group))], ['Kitchen', 'Bathroom']);
  assert.ok(items.some((i) => i.group === 'Kitchen' && i.text === 'Oven'));
  assert.ok(items.every((i) => i.clean === '' && i.undamaged === '' && i.working === ''));
  assert.ok(L.buildChecklist('', mk).length > 40, 'blank rooms fall back to a default house');
});

test('summary counts rated items and problems per room', () => {
  const items = [mk({ group: 'Kitchen', text: 'Oven', clean: 'N', undamaged: 'Y', working: 'Y' }), mk({ group: 'Kitchen', text: 'Sink', clean: 'Y' }), mk({ group: 'Lounge', text: 'Walls' })];
  const s = L.summary(items);
  assert.strictEqual(s.total, 3); assert.strictEqual(s.rated, 2); assert.strictEqual(s.issues, 1); assert.strictEqual(s.okPct, 0.5);
  assert.deepStrictEqual(s.rooms, [{ room: 'Kitchen', items: 2, rated: 2, issues: 1 }, { room: 'Lounge', items: 1, rated: 0, issues: 0 }]);
});

test('compare flags items that got worse, notes improvements and new problem items', () => {
  const entry = [mk({ group: 'Lounge', text: 'Walls', clean: 'Y', undamaged: 'Y', working: 'N/A' }), mk({ group: 'Kitchen', text: 'Oven', clean: 'N', undamaged: 'Y', working: 'Y' }), mk({ group: 'Bathroom', text: 'Toilet', clean: 'Y', undamaged: 'Y', working: 'Y' })];
  const exit = [mk({ group: 'lounge ', text: 'walls', clean: 'Y', undamaged: 'N', working: 'N/A', notes: 'Holes', photos: ['p1'] }), mk({ group: 'Kitchen', text: 'Oven', clean: 'Y', undamaged: 'Y', working: 'Y' }), mk({ group: 'Garage', text: 'Door', clean: 'Y', undamaged: 'N', working: 'Y' })];
  const r = L.compare(entry, exit);
  assert.deepStrictEqual(r.worse.map((x) => [x.room, x.item, x.changes]), [['Lounge', 'Walls', ['damaged']], ['Garage', 'Door', ['new item with issues']]]);
  const oven = r.rows.find((x) => x.item === 'Oven');
  assert.deepStrictEqual(oven.improved, ['clean']); assert.strictEqual(oven.worse, false);
  assert.strictEqual(r.rows.find((x) => x.item === 'Toilet').exit, 'not inspected');
  assert.deepStrictEqual(r.worse[0].exitPhotos, ['p1']);
  assert.strictEqual(r.worse[0].entry, 'Y/Y/N/A');
});

test('an item already bad at entry is not blamed on the tenant at exit', () => {
  const r = L.compare([mk({ group: 'Kitchen', text: 'Oven', clean: 'N' })], [mk({ group: 'Kitchen', text: 'Oven', clean: 'N' })]);
  assert.strictEqual(r.worse.length, 0);
});

test('guessTrade and guessPriority use simple keyword rules', () => {
  assert.strictEqual(L.guessTrade('Smoke alarm', { working: 'N' }), 'Electrician');
  assert.strictEqual(L.guessTrade('Vanity and taps', { working: 'N' }), 'Plumber');
  assert.strictEqual(L.guessTrade('Garage door', { working: 'N' }), 'Garage door technician');
  assert.strictEqual(L.guessTrade('Walls', { undamaged: 'N' }), 'Painter');
  assert.strictEqual(L.guessTrade('Oven', { clean: 'N', undamaged: 'Y', working: 'Y' }), 'Cleaner');
  assert.strictEqual(L.guessPriority('Smoke alarm', { working: 'N' }), 'Urgent');
  assert.strictEqual(L.guessPriority('Front door and lock', { undamaged: 'N' }), 'Urgent');
  assert.strictEqual(L.guessPriority('Dishwasher', { working: 'N' }), 'High');
  assert.strictEqual(L.guessPriority('Walls', { undamaged: 'N' }), 'Medium');
  assert.strictEqual(L.guessPriority('Oven', { clean: 'N' }), 'Low');
  assert.strictEqual(L.dueFor('Urgent', TODAY), '2026-11-09');
  assert.strictEqual(L.dueFor('Low', TODAY), '2026-12-08');
});

test('maintenanceFrom raises one item per problem and skips ones already raised', () => {
  const insp = { id: 'ins1', property: 'p1', checklist: [
    mk({ group: 'Bathroom', text: 'Vanity and taps', working: 'N', notes: 'Drips', photos: ['ph1'] }),
    mk({ group: 'Kitchen', text: 'Oven', clean: 'N', undamaged: 'N' }),
    mk({ group: 'Lounge', text: 'Walls', clean: 'Y' })
  ] };
  let k = 0; const idFn = () => 'm' + (++k);
  const m = L.maintenanceFrom(insp, [], TODAY, idFn);
  assert.deepStrictEqual(m.map((x) => [x.title, x.priority, x.trade, x.due]), [
    ['Bathroom: Vanity and taps — not working', 'High', 'Plumber', '2026-11-15'],
    ['Kitchen: Oven — not clean, damaged', 'Medium', 'Electrician', '2026-11-22']
  ]);
  assert.deepStrictEqual(m[0].photos, ['ph1']); assert.strictEqual(m[0].notes, 'Drips'); assert.strictEqual(m[0].property, 'p1');
  assert.strictEqual(L.maintenanceFrom(insp, m, TODAY, idFn).length, 0);
});

test('nextRoutine adds months but stops at lease end', () => {
  assert.strictEqual(L.nextRoutine('2026-08-31', 6), '2027-02-28');
  assert.strictEqual(L.nextRoutine('2026-11-08', 3, '2027-01-31'), '');
  assert.strictEqual(L.nextRoutine('', 6), '');
});

test('sample data: exit vs entry shows the three planted problems', () => {
  const s = L.sample(TODAY);
  const entry = s.inspections.find((i) => i.type === 'Entry' && i.property === 'p1');
  const exit = s.inspections.find((i) => i.type === 'Exit');
  const r = L.compare(entry.checklist, exit.checklist);
  assert.deepStrictEqual(r.worse.map((x) => x.room + ': ' + x.item).sort(), ['Bedroom 1: Floor / carpet', 'Kitchen: Oven', 'Lounge: Walls']);
  assert.ok(s.maintenance.some((m) => /Smoke alarm/.test(m.title) && m.priority === 'Urgent' && m.trade === 'Electrician'));
  const ids = new Set(s.properties.map((p) => p.id));
  s.inspections.concat(s.maintenance, s.tasks).forEach((r) => assert.ok(ids.has(r.property)));
});

test('ratingText shows dashes for unrated columns', () => {
  assert.strictEqual(L.ratingText({ clean: 'Y' }), 'Y/–/–');
  assert.strictEqual(L.hasIssue({ working: 'N' }), true);
  assert.strictEqual(L.hasIssue({ clean: 'N/A' }), false);
});
