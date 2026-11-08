const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/continuity-planner/lib.js');

const TODAY = '2026-11-08';
const sample = () => L.samplePlan(TODAY);

test('normalize fills defaults and drops junk from imported files', () => {
  const p = L.normalize({ activities: [null, { name: 'A' }, 'x'], business: { name: 'X' }, risks: 'bad' });
  assert.strictEqual(p.activities.length, 1);
  assert.strictEqual(p.business.name, 'X');
  assert.strictEqual(p.business.version, '1.0');
  assert.deepStrictEqual(p.risks, {});
  assert.deepStrictEqual(L.normalize(null).people, []);
});

test('hours formatting, priority bands and risk rating thresholds', () => {
  assert.strictEqual(L.hours(0.5), '30 min');
  assert.strictEqual(L.hours(8), '8 h');
  assert.strictEqual(L.hours(72), '3 days');
  assert.strictEqual(L.hours(720), '4.3 weeks');
  assert.strictEqual(L.hours(''), '—');
  assert.deepStrictEqual([4, 24, 72, 168, ''].map(L.priority), ['Critical', 'High', 'Medium', 'Low', 'Not set']);
  assert.deepStrictEqual([4, 5, 9, 10, 15, 16].map(L.rating), ['Low', 'Medium', 'Medium', 'High', 'High', 'Extreme']);
});

test('risk register adjusts scores from answers and honours overrides', () => {
  const reg = L.riskRegister(sample());
  assert.strictEqual(reg.length, 7);
  const by = k => reg.find(r => r.key === k);
  assert.deepStrictEqual([by('dataloss').likelihood, by('dataloss').impact], [5, 4]); // no backup + onsite only; RPO 4 h
  assert.ok(by('dataloss').gaps.some(g => /Phone system/.test(g)));
  assert.ok(by('keyperson').gaps.some(g => /Sam Patel/.test(g)));
  assert.ok(by('supplier').gaps.some(g => /Cliniko/.test(g)));
  assert.strictEqual(by('fire').impact, 4, 'alternative site lowers fire impact');
  assert.ok(reg[0].score >= reg[reg.length - 1].score, 'sorted by score');
  const p = sample(); p.risks.fire = { likelihood: 4, impact: 5 };
  const f = L.riskRegister(p).find(r => r.key === 'fire');
  assert.deepStrictEqual([f.score, f.rating, f.overridden], [20, 'Extreme', true]);
  // a well-prepared business scores lower
  const good = sample();
  good.systems.forEach(s => { s.backup = 'automatic'; s.offsite = true; s.backupEvery = 1; s.lastTested = '2026-10-01'; });
  good.people.forEach(x => { if (x.critical) x.deputy = x.deputy || 'Someone'; });
  good.suppliers.forEach(x => { x.alternative = x.alternative || 'Backup Co'; });
  good.premises.remoteWork = true;
  const sum = r => r.reduce((s, x) => s + x.score, 0);
  assert.ok(sum(L.riskRegister(good)) < sum(reg));
});

test('business impact analysis: sorted by RTO, flags RTO > downtime, backup frequency vs RPO, no deputy', () => {
  const p = sample();
  p.activities.push({ id: 'x', name: 'Website orders', mtpd: 24, rto: 48, rpo: 1, dependsOn: 'Website' });
  const b = L.bia(p);
  assert.strictEqual(b[0].name, 'Taking bookings and phone calls'); // RTO 4 h
  assert.strictEqual(b[0].priority, 'Critical');
  const appts = b.find(a => a.name.startsWith('Patient'));
  assert.ok(appts.issues.some(i => /Cliniko is backed up every 24 h but this activity can only lose 4 h/.test(i)));
  assert.ok(appts.issues.some(i => /Sam Patel has no deputy/.test(i)));
  assert.ok(b.find(a => a.name === 'Website orders').issues.some(i => /longer than the business can tolerate/.test(i)));
  assert.deepStrictEqual(b.find(a => a.name === 'Payroll').issues, []);
});

test('systems check: RPO needed per system, offsite, untested and stale restores', () => {
  const s = L.systemsCheck(sample(), TODAY);
  const by = n => s.find(x => x.name === n);
  assert.strictEqual(by('Cliniko').rpoNeeded, 4);
  assert.ok(by('Cliniko').issues.includes('Backup every 24 h but needs 4 h'));
  assert.ok(by('Cliniko').issues.includes('Restore never tested'));
  assert.deepStrictEqual(by('Phone system').issues, ['No backup']);
  assert.ok(by('Office PC shared folder').issues.some(i => /offsite/.test(i)));
  assert.ok(!by('Xero').issues.some(i => /tested/.test(i)), 'tested 2 months ago is fine');
  const p = sample(); p.systems[1].lastTested = '2026-01-01';
  assert.ok(L.systemsCheck(p, TODAY)[1].issues.includes('Restore last tested over 6 months ago'));
});

test('readiness score: empty plan is 0, sample is partly ready, fixing gaps raises it', () => {
  const empty = L.readiness(L.emptyPlan(), TODAY);
  assert.strictEqual(empty.score, 0);
  assert.strictEqual(empty.level, 'Not ready');
  const r = L.readiness(sample(), TODAY);
  assert.ok(r.score > 50 && r.score < 80, 'sample score ' + r.score);
  assert.strictEqual(r.level, 'Partly ready');
  assert.ok(r.gaps.some(g => g.key === 'tested'), 'test 14 months ago does not count');
  assert.ok(r.gaps[0].weight * (1 - r.gaps[0].ok) >= r.gaps[r.gaps.length - 1].weight * (1 - r.gaps[r.gaps.length - 1].ok), 'biggest gaps first');
  const p = sample();
  p.tests.push({ date: '2026-10-01', what: 'Tabletop', result: 'ok' });
  p.business.reviewed = TODAY;
  p.systems.forEach(s => { s.backup = 'automatic'; s.offsite = true; s.backupEvery = 1; s.lastTested = '2026-10-01'; });
  p.people.forEach(x => { if (x.critical && !x.deputy) x.deputy = 'Ava Nguyen'; });
  p.suppliers.forEach(x => { x.alternative = x.alternative || 'Alt'; });
  p.comms.statement = 'We are on it.';
  const better = L.readiness(p, TODAY);
  assert.ok(better.score >= 95, 'improved score ' + better.score);
  assert.strictEqual(better.level, 'Good');
});

test('contact tree: coordinator first, key people next, deputies as backups, fan-out limit', () => {
  const t = L.contactTree(sample(), 2);
  assert.strictEqual(t.root.name, 'Dana Reid');
  assert.strictEqual(t.root.calls.length, 2);
  assert.deepStrictEqual(t.root.calls.map(c => c.name), ['Sam Patel', 'Mia Wong']);
  const all = L.treeLines(t);
  assert.strictEqual(all.length, 5, 'everyone is reached once');
  assert.ok(all[0].text.includes('if unreachable: Sam Patel (0400 000 222)'));
  assert.deepStrictEqual(t.suppliers.map(s => s.name), ['Cliniko', 'MedSupply Co', 'NBN provider']);
  assert.strictEqual(L.contactTree(L.emptyPlan()), null);
});

test('incident checklists are personalised with systems, deputies, suppliers and RTOs', () => {
  const p = sample();
  const d = L.checklist('dataloss', p);
  assert.strictEqual(d.phases.length, 4);
  assert.ok(d.phases[0].steps.some(s => s.startsWith('Dana Reid takes charge')));
  assert.ok(d.phases[1].steps.includes('Restore Xero from its automatic backup (owner: Dana Reid).'));
  assert.ok(d.phases[2].steps[0].startsWith('Restore "Taking bookings and phone calls" within 4 h'));
  assert.ok(L.checklist('keyperson', p).phases[1].steps.some(s => s === 'If Mia Wong is out: Leo Brown covers Practice manager (0400 000 444).'));
  assert.ok(L.checklist('cyber', p).phases[1].steps.some(s => /1300 292 371/.test(s)));
  assert.strictEqual(L.checklist('nope', p), null);
});

test('testing schedule and recurring .ics', () => {
  const s = L.testSchedule(sample(), TODAY);
  assert.ok(s.find(t => t.what === 'Backup restore test' && t.every === 3 && t.next === '2026-12-08'));
  assert.strictEqual(s.filter(t => /^Tabletop/.test(t.what)).length, 2);
  assert.strictEqual(s[s.length - 1].next, '2027-11-08');
  const ics = L.testsICS(sample(), TODAY, '2026-11-08T01:02:03.000Z');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('RRULE:FREQ=MONTHLY;INTERVAL=3'));
  assert.ok(ics.includes('DTSTAMP:20261108T010203Z'));
  ics.split('\r\n').forEach(l => assert.ok(Buffer.byteLength(l) <= 75));
});

test('plan document: all sections in Markdown, escaped HTML, default holding statement', () => {
  const p = sample();
  const md = L.planMarkdown(p, TODAY);
  ['# Business continuity plan — Coastal Physio Clinic', '## 2. Business impact analysis', '## 3. Risk register', 'Recovery strategies', 'Contact tree', 'Systems, data and backups', 'Communications plan',
    'Incident response checklists', '- [ ] ', 'Testing and maintenance schedule', 'Gaps to fix'].forEach(x => assert.ok(md.includes(x), 'missing ' + x));
  assert.ok(md.includes('Holding statement: "We are dealing with an unexpected disruption at Coastal Physio Clinic (made-up)'));
  p.business.name = '<script>x</script> & Co';
  p.activities[0].name = 'A | B';
  const html = L.planHtml(p, TODAY);
  assert.ok(!html.includes('<script>x'));
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt; &amp; Co'));
  assert.ok(L.planMarkdown(p, TODAY).includes('A \\| B'), 'pipes escaped in Markdown tables');
});
