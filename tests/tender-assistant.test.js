const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/tender-assistant/lib.js');
const S = require('../apps/tender-assistant/sample.js');

test('requirements: must/shall/required are mandatory, should/desirable/preferred are desirable', () => {
  const reqs = L.extractRequirements(S.RFT);
  const find = (re) => reqs.find((r) => re.test(r.text));
  assert.strictEqual(find(/public liability/).mandatory, true);
  assert.strictEqual(find(/public liability/).ref, '4.1');
  assert.strictEqual(find(/WHS management plan/).mandatory, true); // shall
  assert.strictEqual(find(/ChemCert/).mandatory, true); // are required to
  assert.strictEqual(find(/minimise noise/).level, 'desirable'); // should
  assert.strictEqual(find(/battery-powered/).level, 'desirable'); // desirable
  assert.strictEqual(find(/local residents/).level, 'desirable'); // preference will be given
  assert.ok(reqs.every((r) => /^R\d{3}$/.test(r.id)));
  assert.ok(reqs.length >= 18);
});

test('requirements: ignores the buyer’s own rights, non-mandatory events and duplicates', () => {
  const reqs = L.extractRequirements(S.RFT);
  assert.ok(!reqs.some((r) => /may reject/.test(r.text)), 'Principal may reject is not a requirement');
  assert.ok(!reqs.some((r) => /non-mandatory site briefing/.test(r.text)));
  const dup = L.extractRequirements('1.1 The supplier must provide a WHS plan.\n\n2.1 The supplier must provide a WHS plan.');
  assert.strictEqual(dup.length, 1);
  assert.strictEqual(L.level('The contractor must not subcontract without approval.'), 'mandatory');
  assert.strictEqual(L.level('Background information about the council.'), null);
});

test('clauses: numbered clauses keep their numbers, (a)/(b) sub-clauses and bullets', () => {
  const c = L.clauses('5 Services\n5.1 The supplier must:\n(a) clean daily; and\n(b) report monthly.\n- Tenderers should attach photos.');
  assert.strictEqual(c[0].ref, '5.1');
  assert.strictEqual(c[0].section, 'Services');
  assert.strictEqual(c[1].ref, '5.1 (a)');
  assert.strictEqual(c[2].ref, '5.1 (b)');
  assert.strictEqual(c[3].text, 'Tenderers should attach photos.');
});

test('criteria: weighted list under an evaluation heading, ignoring other percentages', () => {
  const c = L.extractCriteria(S.RFT);
  assert.deepStrictEqual(c.map((x) => [x.name, x.weight]), [
    ['Price', 40], ['Experience and capability', 25], ['Methodology and work health and safety', 20], ['Environmental sustainability', 10], ['Local industry participation', 5]
  ]);
  const t = 'Evaluation criteria\nCriterion 1: Capability (30%)\nCriterion 2: Approach – 30%\nCriterion 3: Price | 40%\nA 10% retention will apply.';
  assert.deepStrictEqual(L.extractCriteria(t).map((x) => [x.name, x.weight]), [['Capability', 30], ['Approach', 30], ['Price', 40]]);
  assert.deepStrictEqual(L.extractCriteria('Liquidated damages 5%\nGST 10%'), []);
});

test('dates: several formats, times, time zones and labels', () => {
  assert.deepStrictEqual(L.findDates('Thursday, 3 December 2026').map((d) => d.date), ['2026-12-03']);
  assert.deepStrictEqual(L.findDates('December 3rd, 2026 and 04/12/2026 and 2026-12-05').map((d) => d.date), ['2026-12-03', '2026-12-04', '2026-12-05']);
  assert.strictEqual(L.findTime('at 2:00pm AEDT'), '14:00');
  assert.strictEqual(L.findTime('by 12 noon'), '12:00');
  assert.strictEqual(L.findTime('at 14:30 hrs'), '14:30');
  assert.strictEqual(L.findTZ('2pm Canberra time'), 'Australia/Sydney');
  const k = L.keyDates(S.RFT);
  const close = k.find((d) => d.label === 'Tender closes');
  assert.deepStrictEqual([close.date, close.time, close.tz], ['2026-12-03', '14:00', 'AEDT']);
  assert.ok(k.some((d) => d.label === 'Last day for questions' && d.date === '2026-11-24' && d.time === '17:00'));
  assert.ok(k.some((d) => d.label === 'Briefing / site visit' && d.date === '2026-11-17'));
  assert.ok(k.some((d) => d.label === 'Contract start' && d.date === '2027-03-01'));
});

test('utcFor and toICS: AEDT converted to UTC, all-day when no time, CRLF and reminders', () => {
  assert.strictEqual(L.utcFor('2026-12-03', '14:00', 'AEDT'), '20261203T030000Z');
  assert.strictEqual(L.utcFor('2026-07-01', '09:00', 'AWST'), '20260701T010000Z');
  assert.strictEqual(L.utcFor('2026-07-01', '09:00', 'ACST'), '20260630T233000Z');
  const ics = L.toICS([{ label: 'Tender closes', date: '2026-12-03', time: '14:00', tz: 'AEDT', source: 'Tenders close, sharp; on time' }, { label: 'Contract start', date: '2027-03-01', time: '', tz: '' },
    { label: 'Briefing', date: '2026-11-17', time: '10:00', tz: 'Australia/Sydney' }], 'RFT 1');
  assert.ok(!/[^\r]\n/.test(ics));
  assert.match(ics, /DTSTART:20261203T030000Z/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270301\r\nDTEND;VALUE=DATE:20270302/);
  assert.match(ics, /DTSTART;TZID=Australia\/Sydney:20261117T100000/);
  assert.match(ics, /TRIGGER:-P2D/);
  assert.match(ics, /Tenders close\\, sharp\\; on time/);
  assert.strictEqual(ics.match(/BEGIN:VEVENT/g).length, 3);
});

test('submission: format, page and word limits, portal, contacts, phone, email, font', () => {
  const s = L.submission(S.RFT);
  assert.ok(s.formats.includes('Electronic lodgement') && s.formats.includes('Excel'));
  assert.ok(!s.formats.includes('Hard copy'), '"hard copy … will not be accepted" is not a format');
  assert.strictEqual(s.pageLimits[0].pages, 20);
  assert.deepStrictEqual(s.portals, ['VendorPanel']);
  assert.deepStrictEqual(s.contacts, ['Megan Walsh']);
  assert.deepStrictEqual(s.emails, ['procurement@riverbend.example.gov.au']);
  assert.deepStrictEqual(s.phones, ['(03) 5555 0123']);
  assert.match(s.fonts, /11 point/);
  const w = L.submission('Responses to each criterion must not exceed 1,500 words. Submit three (3) hard copies and a USB. Call 0412 345 678 or 1300 123 456.');
  assert.strictEqual(w.wordLimits[0].words, 1500);
  assert.ok(w.formats.includes('Hard copy') && w.formats.includes('USB'));
  assert.match(w.copies, /three \(3\) hard copies/);
  assert.deepStrictEqual(w.phones, ['0412 345 678', '1300 123 456']);
});

test('budget: proportional to weighting and always adds up to the total', () => {
  const crit = [{ weight: 25 }, { weight: 20 }, { weight: 10 }, { weight: 5 }];
  const b = L.budget(crit, 20);
  assert.strictEqual(b.reduce((a, x) => a + x, 0), 20);
  assert.deepStrictEqual(b, [8, 7, 3, 2]);
  const h = L.budget([{ weight: 1 }, { weight: 1 }, { weight: 1 }], 10, 0.5);
  assert.strictEqual(h.reduce((a, x) => a + x, 0), 10);
  assert.deepStrictEqual(L.budget([{ weight: 0 }], 10), [0]);
});

test('suggest: library items ranked by shared keywords; nothing for unrelated text', () => {
  const r = L.suggest('The tenderer shall provide a WHS management plan and Safe Work Method Statements for chemical spraying.', S.LIBRARY, 3);
  assert.strictEqual(r[0].item.id, 'lib1');
  assert.ok(r[0].matched.includes('swm') || r[0].matched.includes('whs'));
  const r2 = L.suggest('Preference will be given to tenderers who employ local residents and apprentices.', S.LIBRARY, 1);
  assert.strictEqual(r2[0].item.id, 'lib5');
  assert.deepStrictEqual(L.suggest('Quantum cryptography satellites', S.LIBRARY, 3), []);
  assert.deepStrictEqual(L.suggest('anything', [], 3), []);
});

test('assignCriteria and draftSection: requirements linked to criteria and drafted from the library', () => {
  const a = L.analyse(S.RFT);
  const byText = (re) => a.requirements.find((r) => re.test(r.text)).criterion;
  const name = (id) => a.criteria.find((c) => c.id === id).name;
  assert.match(name(byText(/case studies/)), /Experience/);
  assert.match(name(byText(/battery-powered/)), /Environmental/);
  assert.match(name(byText(/local residents/)), /Local/);
  const c = a.criteria.find((x) => /Environmental/.test(x.name));
  const d = L.draftSection(c, a.requirements, S.LIBRARY, { org: 'Greenway', words: 450 });
  assert.match(d, /^Environmental sustainability \(10% weighting, about 450 words\)/);
  assert.match(d, /Greenway understands/);
  assert.match(d, /Adapted from library: Environmental policy/);
  assert.match(d, /Evidence and attachments/);
});

test('matrix rows/summary, go/no-go verdicts and knockouts', () => {
  const reqs = L.extractRequirements(S.RFT);
  reqs[0].status = 'Complete'; reqs[1].status = 'Will not comply'; reqs[0].owner = 'Kim';
  const rows = L.matrixRows(reqs, []);
  assert.deepStrictEqual(Object.keys(rows[0]), L.MATRIX_COLS);
  assert.strictEqual(rows[0].Mandatory, 'Yes');
  const s = L.matrixSummary(reqs);
  assert.strictEqual(s.complete, 1);
  assert.strictEqual(s.wontComply, 1);
  assert.strictEqual(s.unassigned, reqs.length - 1);
  const all = (n) => Object.fromEntries(L.GONOGO.map((f) => [f.id, n]));
  assert.strictEqual(L.goNoGo(all(5)).verdict, 'Bid');
  assert.strictEqual(L.goNoGo(all(5)).pct, 100);
  assert.strictEqual(L.goNoGo(all(3)).verdict, 'Bid with caution');
  assert.strictEqual(L.goNoGo(all(2)).verdict, 'No bid');
  assert.strictEqual(L.goNoGo(Object.assign(all(5), { mandatory: 1 })).verdict, 'No bid');
  assert.strictEqual(L.goNoGo({ fit: 5 }).verdict, 'Incomplete');
});

test('checklist: standard items plus insurance amounts and documents found in the tender', () => {
  const c = L.checklist(S.RFT);
  const t = c.filter((x) => x.fromTender).map((x) => x.text);
  assert.ok(t.includes('Public liability insurance certificate — $20 million'));
  assert.ok(t.includes('Modern slavery statement / questionnaire'));
  assert.ok(t.includes('CVs of key personnel'));
  assert.ok(c.filter((x) => !x.fromTender).length >= 10);
  assert.ok(!L.checklist('Simple quote for cleaning.').some((x) => x.fromTender));
});
