const test = require('node:test');
const assert = require('node:assert');
const K = require('../apps/knowledge-graph/lib.js');

const D1 = { id: 'd1', name: 'board.txt', text: `Board meeting — 14 March 2026

Present: Dr Priya Shah, Tom Nguyen, Marcus Webb.

The board approved the Project Atlas budget of $1.2m on 14 March 2026. Priya Shah will sponsor Project Atlas and Tom Nguyen will lead delivery with Bluegum Software Pty Ltd.

Tom said the customer portal migration is behind schedule. The customer portal migration depends on the identity service. Sarah O'Brien will review the data retention policy with the Department of Health.` };
const D2 = { id: 'd2', name: 'email.txt', text: `From: Jane Smith <jane.smith@bluegum.com.au>
Subject: Atlas

Hi Tom,

J. Smith here again. Marcus Webb raised the data retention policy. We decided to pause the PHOENIX rollout until 1 May 2026.

Please email tom.nguyen@harbourside.org.au or sarah.obrien@harbourside.org.au.

Regards,
Dr Shah` };

const ex = [K.extract(D1), K.extract(D2)];
const g = K.build([D1, D2], ex);
const node = (label) => g.nodes.find((n) => n.label === label);

test('sentences: abbreviations like Dr. and Pty. do not split, bullets and short lines do', () => {
  assert.deepStrictEqual(K.splitSentences('Dr. Shah met Acme Pty. Ltd. today. Then lunch.'), ['Dr. Shah met Acme Pty. Ltd. today.', 'Then lunch.']);
  const p = K.structure('Agenda\n- Budget\n- Hiring plan\n\nSecond paragraph here.');
  assert.strictEqual(p.length, 2);
  assert.deepStrictEqual(p[0].sentences, ['Agenda', 'Budget', 'Hiring plan']);
});
test('dates: ISO, dd/mm/yyyy (AU), "14 March 2026", "March 14, 2026", "May 2026"', () => {
  const d = K.findDates('On 2026-03-14, then 05/04/2026, 14 March 2026, March 15, 2026 and in May 2026.').map((x) => x.iso);
  assert.deepStrictEqual(d, ['2026-03-14', '2026-04-05', '2026-03-14', '2026-03-15', '2026-05']);
});
test('people: honorifics, attendee lists, title-case names, O\'Brien', () => {
  ['Priya Shah', 'Tom Nguyen', 'Marcus Webb', "Sarah O'Brien", 'Jane Smith'].forEach((n) => assert.ok(node(n) && node(n).type === 'person', n));
  assert.ok(!g.nodes.some((n) => n.type === 'person' && /Board|Department|Project/.test(n.label)));
});
test('organisations and projects (Project X, CODE NAMES)', () => {
  assert.strictEqual(node('Bluegum Software Pty Ltd').type, 'organisation');
  assert.strictEqual(node('Department of Health').type, 'organisation');
  assert.strictEqual(node('Atlas').type, 'project');
  assert.strictEqual(node('Phoenix').type, 'project');
  assert.ok(!g.nodes.some((n) => n.type === 'project' && /^(Note|Api|Gst)$/i.test(n.label)));
});
test('aliases: initial + surname, surname after Dr, first name alone, email ↔ name', () => {
  const jane = node('Jane Smith');
  assert.ok(jane.aliases.includes('J. Smith'));
  assert.ok(jane.emails.includes('jane.smith@bluegum.com.au'));
  assert.ok(node('Priya Shah').aliases.includes('Shah'));
  assert.ok(node('Tom Nguyen').aliases.includes('Tom'));
  assert.ok(node('Tom Nguyen').emails.includes('tom.nguyen@harbourside.org.au'));
  assert.ok(node("Sarah O'Brien").emails.includes('sarah.obrien@harbourside.org.au'));
  assert.ok(!g.nodes.some((n) => n.type === 'email' && /tom\.nguyen/.test(n.label)));
});
test('topics: RAKE keyphrases repeated in a document, or seen in two documents', () => {
  assert.ok(node('customer portal migration'), 'repeated in one doc');
  assert.ok(node('data retention policy'), 'once in each of two docs');
  assert.strictEqual(node('data retention policy').docCount, 2);
  const k = K.keyphrases(K.structure('The rate limit hit us. The rate limit was raised. Coffee was fine.'), 5).map((x) => x.label);
  assert.deepStrictEqual(k, ['rate limit']);
});
test('decisions with dates, sorted on a timeline, linked to entities', () => {
  assert.deepStrictEqual(g.decisions.map((d) => d.date), ['2026-03-14', '2026-05-01']);
  assert.ok(g.decisions[0].entities.includes('project|atlas'));
  assert.match(g.decisions[1].text, /PHOENIX/);
});
test('edges: same sentence weighs 3, same paragraph 1, same document 0.5', () => {
  const e = g.edges.find((x) => x.source === 'person|priya shah' && x.target === 'person|tom nguyen');
  assert.ok(e.sentence >= 1 && e.weight >= 3);
  const one = K.build([{ id: 'a', name: 'a' }], [K.extract({ id: 'a', text: 'Priya Shah met Tom Nguyen.\n\nPriya Shah left. Tom Nguyen stayed.\n\nAlso Ravi Kumar.' })]);
  const pt = one.edges.find((x) => x.source === 'person|priya shah' && x.target === 'person|tom nguyen');
  assert.strictEqual(pt.sentence, 1); assert.strictEqual(pt.paragraph, 2); assert.strictEqual(pt.document, 1);
  assert.strictEqual(pt.weight, 3 + 2 + 0.5);
});
test('filter by type, min weight, document and search (keeps neighbours)', () => {
  const people = K.filter(g, { types: { person: true } });
  assert.ok(people.nodes.every((n) => n.type === 'person'));
  const strong = K.filter(g, { types: { person: true, project: true, organisation: true, concept: true }, minWeight: 4 });
  assert.ok(strong.edges.every((e) => e.weight >= 4));
  const d2 = K.filter(g, { docId: 'd2', types: { person: true, project: true, organisation: true, concept: true } });
  assert.ok(d2.nodes.every((n) => n.docIds.includes('d2')));
  const s = K.filter(g, { search: 'phoenix', types: { person: true, project: true, organisation: true, concept: true, date: true } });
  assert.ok(s.nodes.find((n) => n.label === 'Phoenix').hit);
  assert.ok(s.nodes.length > 1);
});
test('lists: top people and who works with whom', () => {
  assert.strictEqual(K.top(g, 'person', 1)[0].label, 'Tom Nguyen');
  const pairs = K.collaborators(g, 5);
  assert.ok(pairs.length > 0 && pairs[0].weight >= pairs[pairs.length - 1].weight);
});
test('force layout keeps nodes inside the box and pulls linked nodes closer', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  K.layout(nodes, [{ source: 'a', target: 'b', weight: 5 }], 400, 300, 300, 3);
  nodes.forEach((n) => assert.ok(n.x >= 10 && n.x <= 390 && n.y >= 10 && n.y <= 290));
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  assert.ok(dist(nodes[0], nodes[1]) < dist(nodes[2], nodes[3]));
});
test('exports: CSV quoting, GraphML escaping, JSON shape', () => {
  const csv = K.nodesCSV(g).split('\n');
  assert.strictEqual(csv[0], 'id,label,type,mentions,documents,degree,aliases,emails');
  assert.ok(csv.some((l) => l.startsWith('"person|sarah o\'brien"') || l.includes("Sarah O'Brien")));
  assert.match(K.edgesCSV(g).split('\n')[0], /^source,target,source_label/);
  const gml = K.toGraphML(g);
  assert.match(gml, /^<\?xml/); assert.ok(gml.includes('O&apos;Brien'));
  assert.strictEqual((gml.match(/<node /g) || []).length, g.nodes.length);
  const j = JSON.parse(K.toJSON(g));
  assert.strictEqual(j.nodes.length, g.nodes.length); assert.strictEqual(j.documents.length, 2);
});
test('AI extras become mentions with snippets; unknown names are flagged', () => {
  const m = K.mentionsFromAI({ people: ['Marcus Webb', 'Nobody Here'], projects: ['Atlas'] }, D1.text);
  assert.ok(m.find((x) => x.n === 'Marcus Webb' && x.s >= 0 && x.ai));
  assert.strictEqual(m.find((x) => x.n === 'Nobody Here').s, -1);
});
test('300 documents build in reasonable time', () => {
  const docs = [], exs = [];
  for (let i = 0; i < 300; i++) { const d = { id: 'x' + i, name: 'doc' + i, text: `Priya Shah met Tom Nguyen about Project Atlas on ${1 + i % 28} March 2026. The data retention policy came up again.\n\nRavi Kumar ${i % 2 ? 'agreed' : 'asked'} to update the identity service.` }; docs.push(d); exs.push(K.extract(d)); }
  const t = Date.now(); const big = K.build(docs, exs);
  assert.ok(Date.now() - t < 3000);
  assert.strictEqual(big.nodes.find((n) => n.label === 'Priya Shah').docCount, 300);
});
