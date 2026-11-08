const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/process-mapper/lib.js');
const B = require('../assets/core.js');

test('rawSteps: numbered lines, inline arrows and "else" continuation lines', () => {
  assert.deepStrictEqual(L.rawSteps('1. Customer emails order\n2. Admin checks stock\n- Warehouse ships'), ['Customer emails order', 'Admin checks stock', 'Warehouse ships']);
  assert.deepStrictEqual(L.rawSteps('1. Customer emails order → 2. Admin checks stock → Warehouse ships'), ['Customer emails order', 'Admin checks stock', 'Warehouse ships']);
  assert.deepStrictEqual(L.rawSteps('Admin checks the form. If incomplete, email the client\notherwise file it'), ['Admin checks the form. If incomplete, email the client, otherwise file it']);
});

test('roles: "Role:" prefix, "(Role)" suffix, "by the X" and leading role words; later steps inherit', () => {
  const m = L.parseSteps('Admin: checks stock\nPacks the goods by the warehouse\nCustomer pays the invoice\nSends a receipt (Accounts)\nFiles the paperwork');
  assert.deepStrictEqual(m.steps.map(s => s.role), ['Admin', 'Warehouse', 'Customer', 'Accounts', 'Accounts']);
  assert.strictEqual(m.steps[4].inferredRole, true);
  assert.strictEqual(m.steps[1].label, 'Packs the goods');
  assert.deepStrictEqual(m.roles, ['Admin', 'Warehouse', 'Customer', 'Accounts']);
});

test('decisions: if / else, otherwise, numbers with commas, goto loops and explicit end', () => {
  const m = L.parseSteps([
    '1. Admin: checks stock',
    '2. If out of stock, notify customer, else create invoice in Xero',
    '3. If the order is over $2,000, manager approves',
    '4. Manager reviews the quote; when it is wrong, go back to step 1',
    '5. Ship the order'
  ].join('\n'));
  const d = m.steps[1];
  assert.strictEqual(d.kind, 'decision');
  assert.strictEqual(d.question, 'Out of stock?');
  assert.strictEqual(d.yes.text, 'Notify customer');
  assert.strictEqual(d.yes.end, true, 'with an else branch the "yes" side ends unless told to continue');
  assert.strictEqual(d.no.text, 'Create invoice in Xero');
  assert.deepStrictEqual(d.systems, ['Xero']);
  assert.strictEqual(m.steps[2].question, 'The order is over $2,000?');
  assert.strictEqual(m.steps[2].yes.end, false, 'no else -> rejoins the flow');
  assert.strictEqual(m.steps[2].flags.approval, true);
  assert.strictEqual(m.steps[3].kind, 'decision');
  assert.strictEqual(m.steps[3].yes.goto, 1);
});

test('durations, systems, inputs/outputs and flags (wait, approval, re-keying)', () => {
  assert.strictEqual(L.parseDuration('(10 min)'), 10);
  assert.strictEqual(L.parseDuration('2 hours'), 120);
  assert.strictEqual(L.parseDuration('1.5 days'), 720);
  assert.strictEqual(L.fmtMinutes(90), '1.5 h');
  const m = L.parseSteps('Admin: copies the order details into the Shopify portal (8 min)\nWarehouse waits for the courier (4 hours)\nAccounts: sends the invoice from MYOB');
  assert.strictEqual(m.steps[0].minutes, 8);
  assert.strictEqual(m.steps[0].flags.rekey, true);
  assert.ok(m.steps[0].systems.includes('Shopify'));
  assert.strictEqual(m.steps[1].flags.wait, true);
  assert.strictEqual(m.steps[1].minutes, 240);
  assert.deepStrictEqual(m.steps[2].outputs, ['invoice']);
  assert.ok(m.steps[2].systems.includes('MYOB'));
  assert.strictEqual(L.totalMinutes(m), 248);
});

test('toMermaid: swimlane subgraphs, decision diamond, yes/no edges, end node and safe labels', () => {
  const m = L.parseSteps('Customer: emails "urgent" order <today>\nAdmin: checks stock\nIf out of stock, notify customer, else create invoice\nWarehouse: ships it');
  const code = L.toMermaid(m);
  assert.match(code, /^flowchart TD/);
  assert.match(code, /subgraph lane0\["Customer"\]/);
  assert.match(code, /subgraph lane1\["Admin"\]/);
  assert.match(code, /S3\{"Out of stock\?"\}/);
  assert.match(code, /S3 -->\|Yes\| S3Y/);
  assert.match(code, /S3Y --> END/);
  assert.match(code, /S3N --> S4/);
  assert.match(code, /S4 --> END/);
  assert.ok(code.includes('#quot;urgent#quot;') && code.includes('#lt;today#gt;'), 'quotes and angle brackets escaped');
  assert.ok(!L.toMermaid(m, { swimlanes: false }).includes('subgraph'));
  assert.match(L.toMermaid(m, { direction: 'LR' }), /^flowchart LR/);
});

test('transcripts: WEBVTT and SRT cues cleaned, filler removed, action sentences kept', () => {
  const vtt = L.transcriptToSteps(L.SAMPLE_VTT).split('\n');
  assert.strictEqual(vtt.length, 5);
  assert.strictEqual(vtt[0], '1. The customer fills in the booking form on our website');
  assert.ok(vtt[2].startsWith('3. Sam: Type the job into ServiceM8'));
  assert.ok(!/um\b|you know/.test(vtt.join(' ')));
  const srt = '1\n00:00:01,000 --> 00:00:04,000\nOkay so first we receive the purchase order by email.\n\n2\n00:00:04,500 --> 00:00:08,000\nThen the manager approves it.\n\n3\n00:00:09,000 --> 00:00:10,000\nHow are you?';
  assert.deepStrictEqual(L.transcriptToSteps(srt).split('\n'), ['1. Receive the purchase order by email', '2. The manager approves it']);
});

test('speechToSteps splits dictated speech on sequence words', () => {
  const s = L.speechToSteps(['first the customer rings us then the admin books the job', 'after that the technician goes to site']).split('\n');
  assert.deepStrictEqual(s, ['1. The customer rings us', '2. The admin books the job', '3. The technician goes to site']);
});

test('event log: column guessing and day-first / ISO timestamps', () => {
  assert.deepStrictEqual(L.guessColumns(['Case ID', 'Activity', 'Timestamp', 'Resource']), { caseId: 'Case ID', activity: 'Activity', time: 'Timestamp', role: 'Resource' });
  assert.strictEqual(L.parseTime('2026-03-02 09:15'), Date.UTC(2026, 2, 2, 9, 15));
  assert.strictEqual(L.parseTime('02/03/2026 9:15 pm'), Date.UTC(2026, 2, 2, 21, 15));
  assert.strictEqual(L.parseTime('02/03/2026 12:05 am'), Date.UTC(2026, 2, 2, 0, 5));
  assert.ok(isNaN(L.parseTime('soon')));
  const p = L.parseEventLog([{ c: '1', a: 'A', t: '2026-01-01 09:00' }, { c: '', a: 'B', t: '2026-01-01 10:00' }, { c: '1', a: 'B', t: 'bad' }], { caseId: 'c', activity: 'a', time: 't' });
  assert.strictEqual(p.events.length, 1);
  assert.strictEqual(p.skipped, 2);
});

test('mine: directly-follows counts, waits, variants, bottleneck and rework', () => {
  const rows = B.csv.toObjects([
    'case,activity,time,role',
    'A,Receive,2026-01-05 09:00,Sales', 'A,Check,2026-01-05 09:30,Admin', 'A,Ship,2026-01-05 13:30,Warehouse',
    'B,Receive,2026-01-06 09:00,Sales', 'B,Check,2026-01-06 10:00,Admin', 'B,Ship,2026-01-06 16:00,Warehouse',
    'C,Receive,2026-01-07 09:00,Sales', 'C,Check,2026-01-07 09:10,Admin', 'C,Fix,2026-01-07 09:20,Admin', 'C,Check,2026-01-07 09:40,Admin', 'C,Ship,2026-01-07 10:00,Warehouse'
  ].join('\n')).rows;
  const m = L.mine(L.parseEventLog(rows, { caseId: 'case', activity: 'activity', time: 'time', role: 'role' }).events);
  assert.strictEqual(m.caseCount, 3);
  assert.strictEqual(m.variants[0].key, 'Receive → Check → Ship');
  assert.strictEqual(m.variants[0].count, 2);
  const rc = m.edges.find(e => e.from === 'Receive' && e.to === 'Check');
  assert.strictEqual(rc.count, 3);
  assert.strictEqual(Math.round(rc.avgMinutes), 33); // (30 + 60 + 10) / 3
  assert.strictEqual(m.bottlenecks[0].from, 'Check');
  assert.strictEqual(m.bottlenecks[0].to, 'Ship');
  assert.strictEqual(m.activities.find(a => a.name === 'Check').reworkCases, 1);
  assert.strictEqual(m.activities.find(a => a.name === 'Ship').role, 'Warehouse');
  assert.ok(m.loops.length >= 1, 'Check <-> Fix loop detected');
  assert.strictEqual(m.starts.Receive, 3);
  assert.strictEqual(L.minedToSteps(m).split('\n')[0], '1. Sales: Receive');
  const code = L.minedToMermaid(m);
  assert.match(code, /subgraph lane\d\["Warehouse"\]/);
  assert.match(code, /==>/, 'bottleneck drawn thick');
  assert.ok(!L.minedToMermaid(m, { minCount: 2 }).includes('Fix ('), 'rare activities hidden');
});

test('improvements: handoffs, waits, re-keying, approvals and loops', () => {
  const m = L.parseSteps(L.SAMPLE_STEPS);
  const imp = L.improvements(m);
  assert.strictEqual(imp.handoffs, 4);
  assert.strictEqual(imp.waits, 1);
  assert.strictEqual(imp.rekey, 1);
  assert.strictEqual(imp.approvals, 1);
  assert.ok(imp.hints.some(h => h.key === 'rekey' && h.level === 'bad'));
  const loop = L.improvements(L.parseSteps('Staff: submits leave form\nManager approves the form\nPayroll approves it; if details missing, go back to step 1'));
  assert.ok(loop.hints.some(h => h.key === 'loops'));
  assert.ok(loop.hints.some(h => h.key === 'approvals' && h.count === 2));
});

test('SOP: RACI, procedure, controls, KPIs, revision history in Markdown and escaped HTML', () => {
  const m = L.parseSteps(L.SAMPLE_STEPS);
  const meta = { title: 'Order to delivery', owner: 'Jo', ownerRole: 'Admin', version: '1.2', date: '2026-11-08' };
  const raci = L.raci(m, meta);
  assert.strictEqual(raci[0].Customer, 'R');
  assert.strictEqual(raci[0].Admin, 'A');
  assert.strictEqual(raci[1].Admin, 'R/A');
  const md = L.sopMarkdown(m, meta, null, 'flowchart TD\n A-->B');
  ['# Order to delivery', '## 1. Purpose', '## 3. Roles and responsibilities (RACI)', '## 4. Procedure', '## 5. Decision points and controls', '## 6. Measures (KPIs)', '```mermaid', 'Revision history', '| 1.2 | 2026-11-08 | Jo | First version |']
    .forEach(s => assert.ok(md.includes(s), 'missing ' + s));
  assert.ok(md.includes('3. **Admin:** Decide: Out of stock? If yes: Notify the customer by email (process ends). If no: Create the invoice in Xero.'));
  const html = L.sopHtml(L.parseSteps('Admin: checks <script>alert(1)</script> form'), { title: 'T & <b>' }, null, '');
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('T &amp; &lt;b&gt;'));
});
