const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/home-inventory/lib.js');
const K = require('../apps/home-inventory/vault-kit.js');

const TODAY = '2026-11-08';
const item = (o) => L.normalise(Object.assign({ id: 'x', name: 'Thing', room: 'Kitchen', category: 'Appliances', price: 100 }, o));

test('vault-kit: addMonths clamps to the end of shorter months and crosses years', () => {
  assert.strictEqual(K.addMonths('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(K.addMonths('2028-01-31', 1), '2028-02-29');
  assert.strictEqual(K.addMonths('2025-11-15', 24), '2027-11-15');
  assert.strictEqual(K.addMonths('2026-03-10', -3), '2025-12-10');
  assert.strictEqual(K.daysBetween('2026-11-08', '2027-01-07'), 60);
  assert.strictEqual(K.addDays('2026-12-31', 1), '2027-01-01');
});

test('vault-kit: base64 round-trips every byte value and odd lengths', () => {
  const all = new Uint8Array(256).map((_, i) => i);
  for (const n of [0, 1, 2, 3, 4, 5, 255, 256]) {
    const u = all.slice(0, n);
    const b = K.b64FromBytes(u);
    assert.strictEqual(b, Buffer.from(u).toString('base64'));
    assert.deepStrictEqual(Array.from(K.bytesFromB64(b)), Array.from(u));
  }
});

test('vault-kit: .ics uses CRLF, escapes text, folds long lines and adds alarms', () => {
  const s = K.ics([{ uid: 'a1', date: '2026-12-01', title: 'Warranty ends: TV, 65"; lounge', description: 'Line one\nLine two ' + 'x'.repeat(120), alarmDays: 30 }], { now: new Date(Date.UTC(2026, 10, 8, 1, 2, 3)) });
  assert.ok(s.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(s.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(s), 'every newline is CRLF');
  assert.ok(s.includes('DTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261202'));
  assert.ok(s.includes('SUMMARY:Warranty ends: TV\\, 65"\\; lounge'));
  assert.ok(s.includes('DESCRIPTION:Line one\\nLine two'));
  assert.ok(s.includes('TRIGGER:-P30D'));
  assert.ok(s.includes('DTSTAMP:20261108T010203Z'));
  s.split('\r\n').forEach((line) => assert.ok(Buffer.byteLength(line) <= 75, 'line too long: ' + line));
  const timed = K.ics([{ start: '2026-12-01T09:30', end: '2026-12-01T11:00', title: 'Zoo', alarmMinutes: 60 }]);
  assert.ok(timed.includes('DTSTART:20261201T093000\r\nDTEND:20261201T110000'));
  assert.ok(timed.includes('TRIGGER:-PT60M'));
});

test('vault-kit: backup format is validated', () => {
  const b = K.makeBackup('home-inventory', { items: [] }, [{ id: 'm1', type: 'image/jpeg', b64: 'AAEC' }]);
  const back = K.readBackup(JSON.stringify(b), 'home-inventory');
  assert.strictEqual(back.media.length, 1);
  assert.throws(() => K.readBackup('{"x":1}', 'home-inventory'), /not a Brahaspati backup/);
  assert.throws(() => K.readBackup('nope', 'home-inventory'), /not valid JSON/);
  assert.throws(() => K.readBackup(JSON.stringify(b), 'life-admin'), /different app/);
  assert.deepStrictEqual(K.scaleDims(4000, 3000, 1600), { w: 1600, h: 1200 });
  assert.deepStrictEqual(K.scaleDims(800, 600, 1600), { w: 800, h: 600 });
  assert.strictEqual(K.formatBytes(1536), '1.5 KB');
  assert.strictEqual(K.formatBytes(5 * 1048576), '5.0 MB');
});

test('normalise cleans form values', () => {
  const it = L.normalise({ name: '  TV ', price: '$2,199.50', qty: '0', warrantyMonths: '24', purchaseDate: 'not a date' });
  assert.strictEqual(it.name, 'TV');
  assert.strictEqual(it.price, 2199.5);
  assert.strictEqual(it.qty, 1);
  assert.strictEqual(it.warrantyMonths, 24);
  assert.strictEqual(it.purchaseDate, '');
  assert.strictEqual(it.room, 'Other');
});

test('warranty expiry and status: none, ok, soon, expired', () => {
  assert.strictEqual(L.warrantyStatus(item({ purchaseDate: '2025-01-01', warrantyMonths: 0 }), TODAY).status, 'none');
  assert.strictEqual(L.warrantyStatus(item({ warrantyMonths: 12 }), TODAY).status, 'none'); // no purchase date
  const soon = L.warrantyStatus(item({ purchaseDate: '2024-12-20', warrantyMonths: 24 }), TODAY);
  assert.deepStrictEqual(soon, { expiry: '2026-12-20', daysLeft: 42, status: 'soon' });
  assert.strictEqual(L.warrantyStatus(item({ purchaseDate: '2026-01-01', warrantyMonths: 24 }), TODAY).status, 'ok');
  assert.strictEqual(L.warrantyStatus(item({ purchaseDate: '2024-01-01', warrantyMonths: 12 }), TODAY).status, 'expired');
  assert.strictEqual(L.warrantyStatus(item({ purchaseDate: '2024-12-20', warrantyMonths: 24 }), TODAY, 30).status, 'ok');
});

test('expiringSoon sorts by days left', () => {
  const items = [item({ id: 'a', purchaseDate: '2025-01-30', warrantyMonths: 24 }), item({ id: 'b', purchaseDate: '2024-11-20', warrantyMonths: 24 }), item({ id: 'c', purchaseDate: '2020-01-01', warrantyMonths: 12 })];
  assert.deepStrictEqual(L.expiringSoon(items, TODAY, 90).map((x) => x.item.id), ['b', 'a']);
});

test('totals by room and category use price × quantity', () => {
  const items = [item({ room: 'Kitchen', category: 'Appliances', price: 800 }), item({ room: 'Kitchen', category: 'Kitchenware', price: 25, qty: 8 }), item({ room: 'Garage', category: 'Tools', price: 1200.5 })];
  assert.deepStrictEqual(L.totalsBy(items, 'room'), [{ key: 'Garage', count: 1, value: 1200.5 }, { key: 'Kitchen', count: 9, value: 1000 }]);
  assert.strictEqual(L.grandTotal(items), 2200.5);
  assert.strictEqual(L.totalsBy(items, 'category')[2].key, 'Kitchenware');
});

test('search needs every word, across brand, serial and room', () => {
  const items = L.sample(TODAY);
  assert.deepStrictEqual(L.search(items, 'samsung living').map((i) => i.name), ['Samsung 65" QLED TV']);
  assert.deepStrictEqual(L.search(items, 'c02xk1').map((i) => i.brand), ['Apple']);
  assert.strictEqual(L.search(items, 'samsung garage').length, 0);
  assert.strictEqual(L.search(items, '  ').length, items.length);
});

test('gaps flag missing proof, serial only for valuable electronics/tools', () => {
  assert.deepStrictEqual(L.gaps(item({ category: 'Electronics', price: 1500, purchaseDate: '2026-01-01' })), ['photo', 'receipt', 'serial number']);
  assert.deepStrictEqual(L.gaps(item({ category: 'Furniture', price: 1500, purchaseDate: '2026-01-01', photos: [{ id: 'p' }], receipts: [{ id: 'r' }] })), []);
});

test('warranty calendar events only for live warranties, with a 30-day alert', () => {
  const ev = L.warrantyEvents([item({ id: 'tv', name: 'TV', purchaseDate: '2025-06-01', warrantyMonths: 24, serial: 'S1' }), item({ purchaseDate: '2020-01-01', warrantyMonths: 12 })], TODAY);
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].date, '2027-06-01');
  assert.strictEqual(ev[0].alarmDays, 30);
  assert.match(ev[0].description, /Serial S1/);
});

test('claim pack HTML escapes text, totals the selection and embeds photos', () => {
  const items = [item({ name: '<b>TV</b>', price: 1000, photos: [{ id: 'p1', type: 'image/jpeg' }] }), item({ name: 'Bike', price: 500.25 })];
  const html = L.claimPackHTML(items, { photoSrc: { p1: 'data:image/jpeg;base64,AAA' }, today: TODAY, reason: 'Break-in & theft' });
  assert.ok(html.includes('&lt;b&gt;TV&lt;/b&gt;'));
  assert.ok(html.includes('$1,500.25'));
  assert.ok(html.includes('src="data:image/jpeg;base64,AAA"'));
  assert.ok(html.includes('Break-in &amp; theft'));
});

test('CSV rows include warranty end and value; sample data is varied', () => {
  const s = L.sample(TODAY);
  const rows = L.csvRows(s, TODAY);
  assert.strictEqual(rows.length, 10);
  assert.ok(rows[0]['Warranty ends']);
  const statuses = new Set(s.map((i) => L.warrantyStatus(i, TODAY).status));
  ['none', 'soon', 'ok', 'expired'].forEach((st) => assert.ok(statuses.has(st), 'sample has ' + st));
});
