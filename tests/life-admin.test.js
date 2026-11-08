const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/life-admin/lib.js');

const TODAY = '2026-11-08';
const doc = (o) => L.normaliseDoc(Object.assign({ id: 'd', type: 'licence' }, o));

test('only the last 4 characters of a number are kept by default', () => {
  const d = doc({ number: 'PA 123-4567' });
  assert.strictEqual(d.last4, '4567');
  assert.strictEqual(d.fullNumber, '');
  assert.strictEqual(L.masked(d), '•••• 4567');
  assert.ok(!JSON.stringify(d).includes('PA'), 'full number never stored');
});

test('full number is stored only when the user opts in', () => {
  const d = doc({ number: 'PA1234567', keepFull: true });
  assert.strictEqual(d.fullNumber, 'PA1234567');
  assert.strictEqual(d.last4, '4567');
  assert.strictEqual(L.masked(d), 'PA1234567');
  // re-normalising a saved doc keeps it
  assert.strictEqual(L.normaliseDoc(d).fullNumber, 'PA1234567');
  // editing without a new number keeps the old last 4
  assert.strictEqual(L.normaliseDoc({ type: 'licence', last4: '9876' }).last4, '9876');
});

test('lead time defaults from the document type and can be overridden', () => {
  assert.strictEqual(doc({ type: 'passport' }).leadDays, 270);
  assert.strictEqual(doc({ type: 'licence' }).leadDays, 45);
  assert.strictEqual(doc({ type: 'passport', leadDays: '60' }).leadDays, 60);
  assert.strictEqual(doc({ type: 'passport', leadDays: '' }).leadDays, 270);
  assert.strictEqual(doc({ type: 'nonsense' }).type, 'other');
});

test('status: expired, renew now, soon, ok, none', () => {
  assert.strictEqual(L.status(doc({ expiryDate: '2026-11-01' }), TODAY).state, 'expired');
  const renew = L.status(doc({ expiryDate: '2026-12-01' }), TODAY); // 23 days left, lead 45
  assert.deepStrictEqual(renew, { renewBy: '2026-10-17', daysToExpiry: 23, daysToRenew: -22, state: 'renew' });
  assert.strictEqual(L.status(doc({ expiryDate: '2027-01-10' }), TODAY).state, 'soon'); // renew by 26 Nov
  assert.strictEqual(L.status(doc({ expiryDate: '2028-01-10' }), TODAY).state, 'ok');
  assert.strictEqual(L.status(doc({ type: 'certificate' }), TODAY).state, 'none');
  // passport 9 months lead: a passport with 8 months left needs renewing now
  assert.strictEqual(L.status(doc({ type: 'passport', expiryDate: '2027-07-08' }), TODAY).state, 'renew');
});

test('passport 6-month rule for a trip', () => {
  const p = doc({ type: 'passport', expiryDate: '2027-03-01' });
  assert.strictEqual(L.travelCheck(p, '2026-12-10', '2027-01-05').ok, false);
  assert.match(L.travelCheck(p, '2026-12-10', '2027-01-05').msg, /5 Jul 2027/);
  assert.strictEqual(L.travelCheck(p, '2026-12-10', '2027-01-05', 0).ok, true);
  assert.match(L.travelCheck(doc({ type: 'passport', expiryDate: '2026-12-01' }), '2026-12-10').msg, /before you leave/);
  assert.strictEqual(L.travelCheck(doc({ type: 'passport', expiryDate: '2030-01-01' }), '2026-12-10', '2027-01-05').ok, true);
});

test('upcoming lists the next 90 days plus anything already in its renewal window', () => {
  const docs = [doc({ id: 'a', expiryDate: '2027-01-20' }), doc({ id: 'b', expiryDate: '2026-11-20' }), doc({ id: 'c', type: 'passport', expiryDate: '2027-06-01' }), doc({ id: 'd', expiryDate: '2029-01-01' }), doc({ id: 'e', type: 'certificate' })];
  assert.deepStrictEqual(L.upcoming(docs, TODAY, 90).map((x) => x.doc.id), ['b', 'a', 'c']);
});

test('calendar events: renew-by and expiry, none for expired or past renew dates', () => {
  const people = [{ id: 'p1', name: 'Priya' }];
  const ev = L.icsEvents([doc({ id: 'x', personId: 'p1', label: 'NSW licence', expiryDate: '2027-03-01', number: '12345678' }), doc({ id: 'y', expiryDate: '2026-01-01' }), doc({ id: 'z', expiryDate: '2026-12-01' })], people, TODAY);
  assert.deepStrictEqual(ev.map((e) => e.date), ['2026-12-01', '2027-01-15', '2027-03-01']);
  assert.match(ev[1].title, /Start renewing: NSW licence \(Priya\)/);
  assert.match(ev[2].description, /ending 5678/);
  assert.ok(!ev.some((e) => /12345678/.test(JSON.stringify(e))));
});

test('age handles birthdays not yet reached this year', () => {
  assert.strictEqual(L.age('2017-02-03', TODAY), 9);
  assert.strictEqual(L.age('2017-12-03', TODAY), 8);
  assert.strictEqual(L.age('', TODAY), null);
});

test('emergency summary masks numbers, escapes text, includes medical notes and household docs', () => {
  const s = L.sample(TODAY);
  const html = L.emergencyHTML(s.people, s.docs, { today: TODAY, extra: 'Key with <neighbour>' });
  assert.ok(html.includes('Allergic to penicillin'));
  assert.ok(html.includes('•••• 4567'));
  assert.ok(!html.includes('PA1234567'));
  assert.ok(html.includes('Key with &lt;neighbour&gt;'));
  assert.ok(html.includes('<h2>Household</h2>'));
  assert.ok(html.includes('Anika Sharma'));
});

test('sample data covers every status and has a visa with conditions', () => {
  const s = L.sample(TODAY);
  const states = new Set(s.docs.map((d) => L.status(d, TODAY).state));
  ['expired', 'renew', 'ok', 'none'].forEach((st) => assert.ok(states.has(st), st));
  assert.ok(s.docs.find((d) => d.type === 'visa').conditions.includes('8107'));
  assert.ok(s.docs.every((d) => !d.fullNumber));
});

test('every type has renewal steps', () => {
  L.TYPES.forEach((t) => { assert.ok(t.steps.length >= 2, t.key); assert.ok(t.lead >= 0); });
});
