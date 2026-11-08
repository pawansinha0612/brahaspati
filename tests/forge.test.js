const test = require('node:test');
const assert = require('node:assert');
const C = require('../forge/forge-core.js');
const B = require('../assets/core.js');

const cfg = {
  id: 'demo',
  entities: {
    owners: { title: 'name', fields: [{ key: 'name', type: 'text', required: true }, { key: 'email', type: 'email' }, { key: 'phone', type: 'phone' }] },
    pets: {
      title: 'name', board: 'status', calendar: ['vaccinated'], recurring: 'visit',
      fields: [
        { key: 'name', label: 'Pet name', type: 'text', required: true },
        { key: 'owner', label: 'Owner', type: 'link', entity: 'owners' },
        { key: 'status', type: 'select', options: ['Booked', { value: 'In', label: 'Checked in', tone: 'ok' }, 'Out'] },
        { key: 'weight', type: 'number', min: 0, max: 120 },
        { key: 'fee', type: 'money' },
        { key: 'vaccinated', type: 'date' },
        { key: 'visit', type: 'datetime' },
        { key: 'tags', type: 'multiselect', options: ['Senior', 'Anxious', 'Diet'] },
        { key: 'desexed', type: 'checkbox' },
        { key: 'jobs', type: 'checklist', items: ['Wash', 'Nails'] },
        { key: 'photos', type: 'photos' },
        { key: 'feeGst', label: 'Fee incl GST', type: 'money', compute: (r) => C.r2((r.fee || 0) * 1.1) }
      ]
    }
  },
  reminders: [{ entity: 'pets', date: 'vaccinated', offsetMonths: 12, warnDays: 30, label: 'Vaccination due' }]
};

test('validateSchema accepts a good config and explains bad ones', () => {
  assert.deepStrictEqual(C.validateSchema(cfg), []);
  const bad = { id: 'Bad Id', entities: { a: { title: 'nope', board: 'x', calendar: 'n', fields: [{ key: 'n', type: 'text' }, { key: 'n', type: 'select' }, { key: 'l', type: 'link', entity: 'zzz' }, { key: 'q', type: 'colour' }] } }, reminders: [{ entity: 'b', date: 'x' }] };
  const errs = C.validateSchema(bad).join('\n');
  for (const s of ['App id', 'duplicate', 'select needs options', 'unknown entity "zzz"', 'unknown type "colour"', 'title field "nope"', 'board field', 'calendar field "n"', 'reminder #1']) assert.ok(errs.includes(s), 'missing: ' + s + '\n' + errs);
});

test('coerce turns form and CSV text into typed values', () => {
  const f = (type, extra) => Object.assign({ key: 'x', type }, extra);
  assert.strictEqual(C.coerce(f('money'), '$1,250.50'), 1250.5);
  assert.strictEqual(C.coerce(f('number'), ''), null);
  assert.strictEqual(C.coerce(f('checkbox'), 'Yes'), true);
  assert.strictEqual(C.coerce(f('checkbox'), 'no'), false);
  assert.strictEqual(C.coerce(f('date'), '08/11/2026'), '2026-11-08');
  assert.strictEqual(C.coerce(f('datetime'), '2026-11-08 7:30'), '2026-11-08T07:30');
  assert.strictEqual(C.coerce(f('datetime'), '9/12/2026'), '2026-12-09T09:00');
  assert.deepStrictEqual(C.coerce(f('multiselect'), 'Senior; Diet'), ['Senior', 'Diet']);
  assert.strictEqual(C.coerce(f('time'), '7:05 am'), '07:05');
});

test('validateRecord checks required, types, ranges, choices, links and custom rules', () => {
  const ctx = { exists: (ek, id) => ek === 'owners' && id === 'o1' };
  const e = cfg.entities.pets;
  assert.deepStrictEqual(C.validateRecord(e, { name: 'Rex', owner: 'o1', status: 'In', weight: 30, tags: ['Senior'], vaccinated: '2026-01-01' }, ctx), {});
  const errs = C.validateRecord(e, { name: '', owner: 'o9', status: 'Gone', weight: 400, tags: ['Purple'], vaccinated: 'soon' }, ctx);
  assert.deepStrictEqual(Object.keys(errs).sort(), ['name', 'owner', 'status', 'tags', 'vaccinated', 'weight']);
  assert.match(errs.weight, /at most 120/);
  const o = cfg.entities.owners;
  assert.match(C.validateRecord(o, { name: 'A', email: 'not-an-email' }).email, /email/);
  assert.match(C.validateRecord(o, { name: 'A', phone: 'call me' }).phone, /phone/);
  assert.deepStrictEqual(C.validateRecord(o, { name: 'A', email: 'a@b.com.au', phone: '+61 412 555 101' }), {});
  const custom = { fields: [{ key: 'abn', type: 'text', validate: (v) => v.replace(/\s/g, '').length === 11 ? '' : 'ABN has 11 digits' }] };
  assert.strictEqual(C.validateRecord(custom, { abn: '12 345' }).abn, 'ABN has 11 digits');
});

test('compute fills computed fields; blankRecord applies defaults and checklist items', () => {
  const r = C.compute(cfg.entities.pets, { fee: 85 });
  assert.strictEqual(r.feeGst, 93.5);
  const b = C.blankRecord(cfg.entities.pets, () => 'id1', '2026-11-08');
  assert.strictEqual(b.id, 'id1');
  assert.deepStrictEqual(b.jobs.map((i) => [i.text, i.done]), [['Wash', false], ['Nails', false]]);
  assert.deepStrictEqual(b.tags, []);
  assert.strictEqual(b.desexed, false);
  const withToday = C.blankRecord({ fields: [{ key: 'd', type: 'date', default: 'today' }, { key: 's', type: 'select', required: true, options: ['A', 'B'] }] }, () => 'x', '2026-11-08');
  assert.strictEqual(withToday.d, '2026-11-08');
  assert.strictEqual(withToday.s, 'A');
});

test('query: search across fields incl. link labels, filter and sort with empties last', () => {
  const e = cfg.entities.pets, ctx = { linkLabel: (ek, id) => ({ o1: 'Mia Nguyen', o2: 'Jack Wilson' })[id] || '' };
  const recs = [{ id: 1, name: 'Rex', owner: 'o1', status: 'In', weight: 30 }, { id: 2, name: 'Bella', owner: 'o2', status: 'Booked', weight: 8 }, { id: 3, name: 'Max', owner: 'o1', status: 'Out' }];
  assert.deepStrictEqual(C.query(e, recs, { q: 'mia' }, ctx).map((r) => r.id), [1, 3]);
  assert.deepStrictEqual(C.query(e, recs, { q: 'checked in' }, ctx).map((r) => r.id), [1]);
  assert.deepStrictEqual(C.query(e, recs, { filters: { status: 'Booked' } }, ctx).map((r) => r.id), [2]);
  assert.deepStrictEqual(C.query(e, recs, { sort: 'weight', dir: 'desc' }, ctx).map((r) => r.id), [1, 2, 3]);
  assert.deepStrictEqual(C.query(e, recs, { sort: 'weight', dir: 'asc' }, ctx).map((r) => r.id), [2, 1, 3]);
  assert.deepStrictEqual(C.query(e, recs, { sort: 'status' }, ctx).map((r) => r.id), [2, 1, 3]); // option order, not alphabetical
  assert.deepStrictEqual(C.query(e, recs, { sort: 'owner' }, ctx).map((r) => r.id), [2, 1, 3]);
});

test('board groups by status in option order and collects records without one', () => {
  const cols = C.board(cfg.entities.pets, [{ id: 1, status: 'Out' }, { id: 2 }, { id: 3, status: 'Booked' }]);
  assert.deepStrictEqual(cols.map((c) => [c.label, c.records.length]), [['No status', 1], ['Booked', 1], ['Checked in', 0], ['Out', 1]]);
});

test('date helpers: Monday-first weeks and month grids, month maths clamps', () => {
  assert.strictEqual(C.weekday('2026-11-09'), 0); // Monday
  assert.strictEqual(C.weekStart('2026-11-08'), '2026-11-02'); // Sunday belongs to the week starting Mon 2 Nov
  const g = C.monthGrid(2026, 10); // November 2026
  assert.strictEqual(g[0][0], '2026-10-26');
  assert.strictEqual(g[g.length - 1][6], '2026-12-06');
  assert.ok(g.every((w) => w.length === 7));
  const feb = C.monthGrid(2027, 1); // Feb 2027 starts on a Monday
  assert.strictEqual(feb[0][0], '2027-02-01');
  assert.strictEqual(feb.length, 4);
  assert.strictEqual(C.addMonths('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(C.addMonths('2028-01-31', 1), '2028-02-29');
  assert.strictEqual(C.daysBetween('2026-11-08', '2027-01-01'), 54);
});

test('recurrence: weekly, fortnightly, monthly (keeps day 31 where possible), until and count', () => {
  assert.deepStrictEqual(C.expandRecurrence({ freq: 'weekly', start: '2026-11-03', until: '2026-11-24' }), ['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24']);
  assert.deepStrictEqual(C.expandRecurrence({ freq: 'fortnightly', start: '2026-12-21', count: 3 }), ['2026-12-21', '2027-01-04', '2027-01-18']);
  assert.deepStrictEqual(C.expandRecurrence({ freq: 'monthly', start: '2027-01-31', count: 4 }), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  assert.strictEqual(C.expandRecurrence({ freq: 'weekly', start: '2026-01-01', until: '2030-01-01' }, 50).length, 50);
});

test('generateSeries copies a record, shifts dates keeping times, resets and skips existing', () => {
  let n = 0; const idFn = () => 'n' + (++n);
  const job = { id: 'j1', title: 'Office clean', start: '2026-11-10T18:30', end: '2026-11-10', status: 'Done', notes: 'x' };
  const copies = C.generateSeries(job, 'start', { freq: 'weekly', until: '2026-12-01' }, { idFn, shift: ['end'], reset: { status: 'Scheduled' }, clear: ['notes'] });
  assert.deepStrictEqual(copies.map((c) => c.start), ['2026-11-17T18:30', '2026-11-24T18:30', '2026-12-01T18:30']);
  assert.strictEqual(copies[0].end, '2026-11-17');
  assert.strictEqual(copies[0].status, 'Scheduled');
  assert.ok(!('notes' in copies[0]));
  assert.ok(copies.every((c) => c.seriesId === copies[0].seriesId && c.id !== 'j1'));
  const again = C.generateSeries(Object.assign({}, job, { seriesId: copies[0].seriesId }), 'start', { freq: 'weekly', until: '2026-12-08' }, { idFn, existing: copies });
  assert.deepStrictEqual(again.map((c) => c.start), ['2026-12-08T18:30']);
});

test('reminders: offset months, warning window, overdue first, filters with when()', () => {
  const data = { pets: [
    { id: 'a', name: 'Rex', vaccinated: '2025-11-01' }, // due 2026-11-01 -> 7 days overdue
    { id: 'b', name: 'Bella', vaccinated: '2025-12-01' }, // due 2026-12-01 -> in 23 days
    { id: 'c', name: 'Max', vaccinated: '2026-06-01' }, // due 2027-06-01 -> too far ahead
    { id: 'd', name: 'Old', vaccinated: '' }
  ] };
  const r = C.reminders(cfg, data, '2026-11-08');
  assert.deepStrictEqual(r.map((x) => [x.title, x.due, x.days, x.status]), [['Rex', '2026-11-01', -7, 'overdue'], ['Bella', '2026-12-01', 23, 'soon']]);
  assert.strictEqual(r[0].label, 'Vaccination due');
  const c2 = Object.assign({}, cfg, { reminders: [{ entity: 'pets', date: 'vaccinated', offsetMonths: 12, warnDays: 30, label: (p) => 'Jab for ' + p.name, when: (p) => p.name !== 'Rex' }] });
  assert.deepStrictEqual(C.reminders(c2, data, '2026-11-08').map((x) => x.label), ['Jab for Bella']);
});

test('calendarEvents pulls dated records in range with times', () => {
  const data = { pets: [{ id: 'a', name: 'Rex', vaccinated: '2026-11-20' }, { id: 'b', name: 'Bella', vaccinated: '2026-12-20' }] };
  const ev = C.calendarEvents(cfg, data, '2026-11-01', '2026-11-30');
  assert.deepStrictEqual(ev.map((e) => [e.title, e.day, e.entity]), [['Rex', '2026-11-20', 'pets']]);
});

test('buildICS: CRLF, escaping, folding, all-day and timed events, alarms', () => {
  const ics = C.buildICS([
    { uid: 'a1', title: 'Clean, Smith; level 2', day: '2026-11-10', time: '23:30', hours: 1.5, description: 'Keys at desk\nCode 1234', location: '12 Wharf St' },
    { uid: 'b2', title: 'Licence expires', day: '2026-12-01', alarmDays: 7 },
    { uid: 'c3', title: 'x'.repeat(200), day: '2026-12-02' }
  ], { now: new Date(Date.UTC(2026, 10, 8, 1, 2, 3)), name: 'Demo' });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'every newline is CRLF');
  assert.ok(ics.includes('SUMMARY:Clean\\, Smith\\; level 2'));
  assert.ok(ics.includes('DESCRIPTION:Keys at desk\\nCode 1234'));
  assert.ok(ics.includes('DTSTART:20261110T233000') && ics.includes('DTEND:20261111T010000'), 'end rolls over midnight');
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261201') && ics.includes('DTEND;VALUE=DATE:20261202'));
  assert.ok(ics.includes('TRIGGER:-P7D'));
  assert.ok(ics.includes('DTSTAMP:20261108T010203Z'));
  ics.split('\r\n').forEach((l) => assert.ok(Buffer.byteLength(l) <= 75, 'line too long: ' + l.length));
  assert.ok(ics.includes('\r\n x'), 'long lines are folded with a leading space');
});

test('CSV: export uses labels and readable values; import maps labels, links, selects and reports errors', () => {
  const e = cfg.entities.pets, ctx = { linkLabel: (ek, id) => (id === 'o1' ? 'Mia Nguyen' : ''), findLink: (ek, t) => (t.toLowerCase() === 'mia nguyen' ? 'o1' : null) };
  const t = C.toCSV(e, [{ id: 'p1', name: 'Rex', owner: 'o1', status: 'In', fee: 85, tags: ['Senior', 'Diet'], desexed: true, jobs: [{ text: 'Wash', done: true, group: 'Bath' }, { text: 'Nails', done: false }], photos: ['x'] }], ctx);
  assert.ok(!t.headers.includes('photos'));
  assert.deepStrictEqual(t.headers.slice(0, 4), ['ID', 'Pet name', 'Owner', 'status']);
  const row = t.rows[0];
  assert.strictEqual(row.Owner, 'Mia Nguyen');
  assert.strictEqual(row.status, 'Checked in');
  assert.strictEqual(row.tags, 'Senior; Diet');
  assert.strictEqual(row.jobs, '[x] Bath: Wash | [ ] Nails');
  // round trip through real CSV text
  const text = B.csv.stringify(t.rows, t.headers);
  const back = C.fromCSV(e, B.csv.toObjects(text).rows, Object.assign({ exists: () => true }, ctx));
  assert.deepStrictEqual(back.errors, []);
  const r = back.records[0];
  assert.strictEqual(r.id, 'p1'); assert.strictEqual(r.owner, 'o1'); assert.strictEqual(r.status, 'In'); assert.strictEqual(r.fee, 85);
  assert.deepStrictEqual(r.tags, ['Senior', 'Diet']); assert.strictEqual(r.desexed, true);
  assert.deepStrictEqual(r.jobs.map((i) => [i.group, i.text, i.done]), [['Bath', 'Wash', true], ['', 'Nails', false]]);
  const bad = C.fromCSV(e, [{ 'pet name': '', weight: 'heavy' }, { 'Pet name': 'Ok', status: 'booked' }, { 'Pet name': '' }], { idFn: () => 'z' });
  assert.strictEqual(bad.records.length, 2); // fully empty row ignored
  assert.strictEqual(bad.errors.length, 1); assert.strictEqual(bad.errors[0].row, 2);
  assert.strictEqual(bad.records[1].status, 'Booked'); // case-insensitive select
});

test('totals: markup on lines, extras (call-out), discount, GST; GST-inclusive split', () => {
  const t = C.totals([{ qty: 3, price: 45.5 }, { qty: 1, price: 120 }], { markupPct: 20, extras: [{ label: 'Call-out', amount: 90 }], gst: true });
  assert.deepStrictEqual(t, { subtotal: 256.5, markup: 51.3, extras: 90, discount: 0, net: 397.8, gst: 39.78, total: 437.58 });
  assert.strictEqual(C.totals([{ qty: 1, price: 100 }], { gst: false, discount: 500 }).total, 0);
  assert.strictEqual(C.gstFromInclusive(110), 10);
  assert.strictEqual(C.r2(0.1 + 0.2), 0.3);
  assert.strictEqual(C.r2(1.005), 1.01);
});

test('dashboard tiles and groupBy', () => {
  const data = { pets: [{ id: 1, fee: 50, status: 'In', vaccinated: '2026-11-01' }, { id: 2, fee: 70.255, status: 'In' }, { id: 3, fee: 20, status: 'Out', vaccinated: '2026-12-01' }] };
  assert.strictEqual(C.tile({ label: 'Pets', entity: 'pets', kind: 'count' }, data, '2026-11-08').value, 3);
  assert.strictEqual(C.tile({ label: 'Fees', entity: 'pets', kind: 'sum', field: 'fee', where: (r) => r.status === 'In' }, data).value, 120.26);
  const od = C.tile({ label: 'Overdue', entity: 'pets', kind: 'overdue', date: 'vaccinated' }, data, '2026-11-08');
  assert.strictEqual(od.value, 1); assert.strictEqual(od.tone, 'bad');
  assert.deepStrictEqual(C.groupBy(data.pets, 'status', 'fee'), [{ label: 'In', value: 120.26 }, { label: 'Out', value: 20 }]);
  assert.deepStrictEqual(C.groupBy(data.pets, (r) => r.status), [{ label: 'In', value: 2 }, { label: 'Out', value: 1 }]);
});

test('backup round trip and guards against other apps or broken files', () => {
  const data = { owners: [{ id: 'o1', name: 'Mia' }], pets: [{ id: 'p1', name: 'Rex', photos: ['ph1'], jobs: [{ text: 'Wash', photos: ['ph2'] }] }] };
  const bk = JSON.stringify(C.makeBackup('demo', data, { ph1: 'data:x' }, new Date(0)));
  const r = C.readBackup(bk, 'demo', cfg);
  assert.deepStrictEqual(r.data.owners, data.owners);
  assert.deepStrictEqual(r.photos, { ph1: 'data:x' });
  assert.throws(() => C.readBackup(bk, 'other', cfg), /different app/);
  assert.throws(() => C.readBackup('{"a":1}', 'demo', cfg), /not a backup/);
  assert.throws(() => C.readBackup({ kind: 'forge-backup', app: 'demo', data: { pets: 'x' } }, 'demo', cfg), /should be a list/);
  assert.deepStrictEqual(C.allPhotoIds(cfg, data).sort(), ['ph1', 'ph2']);
});

test('docHTML escapes content, shows totals, checklist groups, photos and signatures', () => {
  const spec = {
    title: 'Tax invoice', number: 'INV-0003', date: '2026-11-08', meta: [['Due', '2026-11-22'], ['Empty', '']],
    to: { heading: 'Bill to', lines: ['<Harbour> Cafe', '12 Wharf St'] },
    lines: [{ desc: 'Labour', qty: 2, price: 95 }], totals: C.totals([{ qty: 2, price: 95 }], { extras: [{ label: 'Call-out', amount: 80 }] }), extras: [{ label: 'Call-out', amount: 80 }],
    sections: [{ heading: 'Checklist', checklist: [{ text: 'Walls', group: 'Kitchen', done: true, clean: 'Y', photos: ['p1'] }], columns: [{ key: 'clean', label: 'Clean' }] }],
    signatures: [{ label: 'Tenant', image: 'data:image/png;base64,AAA', name: 'Sam' }, { label: 'Agent' }]
  };
  const h = C.docHTML(spec, { name: 'Bright Sparks', abn: '12 345 678 901', payDetails: 'BSB 000-000' }, { p1: 'data:image/jpeg;base64,BBB' });
  assert.ok(h.includes('&lt;Harbour&gt; Cafe'));
  assert.ok(!h.includes('Empty:'));
  assert.ok(h.includes('Call-out') && h.includes('$297.00'), 'total = (190 labour + 80 call-out) + 10% GST');
  assert.ok(h.includes('<h3 style="margin:14px 0 2px">Kitchen</h3>'));
  assert.ok(h.includes('src="data:image/jpeg;base64,BBB"'));
  assert.ok(h.includes('alt="Signature"') && h.includes('Tenant: Sam') && h.includes('class="line"'));
  assert.ok(h.includes('How to pay') && h.includes('INV-0003 as the reference'));
  assert.deepStrictEqual(C.docPhotoIds(spec), ['p1']);
});

test('nextNumber continues the highest number with a prefix', () => {
  assert.strictEqual(C.nextNumber(['Q-0009', 'Q-0010', 'INV-0100', 'Q-x'], 'Q-'), 'Q-0011');
  assert.strictEqual(C.nextNumber([], 'INV-'), 'INV-0001');
});
