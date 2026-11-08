const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/proposal-generator/lib.js');

const ex = L.extract(L.SAMPLE_BRIEF);
const P = () => L.build(L.extract(L.SAMPLE_BRIEF), L.SAMPLE_PROFILE, { id: 'p1', date: '2026-11-08' });

test('requirements: bullets and need/must/should/want sentences, with MoSCoW-style priority', () => {
  const texts = ex.requirements.map(r => r.priority + ': ' + r.text);
  assert.ok(texts.includes('Must: Work well on mobile phones'));
  assert.ok(texts.includes('Must: Able to edit the text and photos ourselves'));
  assert.ok(texts.includes('Should: Meet accessibility guidelines (WCAG 2.2 AA) because many of our patients are older'));
  assert.ok(texts.includes('Could: A blog for exercise tips'));
  assert.ok(texts.includes('Could: An online shop for resistance bands and heat packs'));
  assert.ok(texts.includes('Could: A short training session so our reception team can update the site'));
  assert.ok(!texts.some(t => /budget|Could you send/i.test(t)), 'budget line and the sign-off question are not requirements');
});

test('priority and tidy-up rules', () => {
  assert.strictEqual(L.priorityOf('We must have SSO'), 'Must');
  assert.strictEqual(L.priorityOf('It should load fast'), 'Should');
  assert.strictEqual(L.priorityOf("We'd love a chatbot"), 'Could');
  assert.strictEqual(L.tidyReq('We need a new logo.'), 'A new logo');
  assert.strictEqual(L.tidyReq('We would also like to have monthly reports!'), 'Monthly reports');
  assert.strictEqual(L.tidyReq('It must integrate with Xero.'), 'Integrate with Xero');
});

test('client, budget, dates and target duration are extracted', () => {
  assert.deepStrictEqual(ex.client, { name: 'Priya Nair', company: 'Harbour Street Physio', email: 'priya@harbourstreetphysio.com.au', phone: '02 9555 0142' });
  assert.strictEqual(ex.budget.min, 8000); assert.strictEqual(ex.budget.max, 12000);
  assert.strictEqual(ex.targetWeeks, 8);
  assert.ok(ex.dates.some(d => d.text === 'before the end of February 2027'));
  assert.strictEqual(ex.subject, 'Quote request - new website with online booking');
  assert.ok(ex.constraints.some(c => /hosted in Australia/.test(c)));
  assert.ok(ex.mentions.integration && ex.mentions.accessibility && ex.mentions.training);
});

test('budget phrasing: up to, ranges, k and thousands', () => {
  assert.deepStrictEqual(L.budgetOf('Our budget is up to $15k.'), { text: 'Our budget is up to $15k.', min: null, max: 15000 });
  const b = L.budgetOf('We can spend between $20,000 and $30,000.');
  assert.strictEqual(b.min, 20000); assert.strictEqual(b.max, 30000);
  assert.strictEqual(L.budgetOf('No money talk here.'), null);
  assert.strictEqual(L.moneyValue('$2.5m'), 2500000);
  assert.strictEqual(L.targetWeeks('go live in 3 months'), 13);
});

test('client from sign-off when there is no From: line, company from email domain', () => {
  const c = L.clientOf('Hi,\nCan you quote for a logo?\n\nCheers,\nTom Baker\ntom@bakerplumbing.com.au');
  assert.strictEqual(c.name, 'Tom Baker');
  assert.strictEqual(c.email, 'tom@bakerplumbing.com.au');
  assert.strictEqual(c.company, 'Bakerplumbing');
});

test('build: title from subject, understanding, scope in/out, tiers by priority', () => {
  const p = P();
  assert.strictEqual(p.title, 'New website with online booking');
  assert.strictEqual(p.ref, 'P-20261108-1');
  assert.match(p.understanding, /must-haves are: .*work well on mobile phones/);
  assert.match(p.understanding, /budget of \$8,000–\$12,000/);
  assert.strictEqual(p.tiers.good.items.length, ex.requirements.filter(r => r.priority === 'Must').length);
  assert.strictEqual(p.tiers.better.items.length, ex.requirements.filter(r => r.priority !== 'Could').length);
  assert.ok(p.tiers.best.items.includes('A blog for exercise tips'));
  assert.ok(p.scopeOut.some(s => /Nice-to-haves not in the base price/.test(s)));
  assert.ok(!p.scopeOut.some(s => /^Writing content/.test(s)), 'brief mentions photos/content, so no content exclusion line');
  assert.ok(p.assumptions.some(a => /API keys/.test(a)), 'integration assumption');
  assert.ok(p.assumptions.some(a => /Constraint noted: The site must be hosted in Australia/.test(a)));
  assert.ok(p.deliverables.length >= 3);
});

test('phases are fitted to the client\'s 8-week target', () => {
  const p = P(), g = L.gantt(p.phases);
  assert.strictEqual(g.totalWeeks, 8);
  assert.ok(p.phases.every(ph => ph.weeks >= 1));
  assert.ok(p.phases.every(ph => ph.hours === ph.weeks * 12), 'hours = weeks × hours per week from the profile');
  // without a target, a bigger brief gets a longer build
  const big = L.extract(Array.from({ length: 12 }, (_, i) => '- Must have feature ' + (i + 1)).join('\n'));
  assert.ok(L.gantt(L.phaseTemplate(big, L.DEFAULT_PROFILE)).totalWeeks > 8);
});

test('gantt: sequential bars, and "with previous" phases overlap', () => {
  const g = L.gantt([{ name: 'A', weeks: 2 }, { name: 'B', weeks: 3 }, { name: 'C', weeks: 1, parallel: true }, { name: 'D', weeks: 2 }]);
  assert.deepStrictEqual(g.bars.map(b => [b.start, b.end]), [[0, 2], [2, 5], [2, 3], [5, 7]]);
  assert.strictEqual(g.totalWeeks, 7);
});

test('pricing: fixed = hours × rate + contingency (rounded to $50); T&M range; GST', () => {
  const p = L.build({ requirements: [], deliverables: [], constraints: [], dates: [], budget: null, client: {}, subject: 'Audit', targetWeeks: null, mentions: {} }, { rates: [{ role: 'Lead', rate: 100 }], hoursPerWeek: 10, contingency: 10, gst: true }, { date: '2026-11-08' });
  p.phases = [{ name: 'Do it', weeks: 1, hours: 33, role: 'Lead' }];
  const pr = L.pricing(p, { rates: [{ role: 'Lead', rate: 100 }], gst: true });
  assert.strictEqual(pr.base, 3300);
  assert.strictEqual(pr.fixed, 3650); // 3630 rounded to nearest 50
  assert.strictEqual(pr.fixedGst, 365);
  assert.strictEqual(pr.fixedTotal, 4015);
  assert.deepStrictEqual([pr.tm.low, pr.tm.high], [2800, 4150]);
  const noGst = L.pricing(p, { rates: [{ role: 'Lead', rate: 100 }], gst: false });
  assert.strictEqual(noGst.fixedGst, 0);
});

test('milestones add up to 100% and exactly the fixed price', () => {
  const p = P(), pr = L.pricing(p, L.SAMPLE_PROFILE);
  assert.strictEqual(pr.milestones.reduce((s, m) => s + m.pct, 0), 100);
  assert.strictEqual(Math.round(pr.milestones.reduce((s, m) => s + m.amount, 0) * 100) / 100, pr.fixed);
  assert.strictEqual(pr.milestones[0].label, 'Deposit on acceptance');
  assert.strictEqual(pr.milestones[0].pct, 30);
  const t = pr.tiers;
  assert.ok(t[0].price < t[1].price && t[1].price < t[2].price);
  assert.strictEqual(t[1].price, pr.fixed);
});

test('unknown roles fall back to the first rate; missing hours count as zero', () => {
  const p = P(); p.phases = [{ name: 'X', weeks: 1, hours: 10, role: 'Ghost' }, { name: 'Y', weeks: 1, hours: '', role: 'Designer' }];
  const pr = L.pricing(p, L.SAMPLE_PROFILE);
  assert.strictEqual(pr.lines[0].rate, 140);
  assert.strictEqual(pr.lines[1].cost, 0);
});

test('HTML proposal has every section, escapes text and respects pricing toggles', () => {
  const p = P(); p.client.name = '<Priya>';
  const html = L.toHtml(p, L.SAMPLE_PROFILE, { startDate: '2027-01-04' });
  ['Your needs', 'Scope', 'Not included', 'Deliverables', 'Approach and timeline', 'Team and roles', 'Investment', 'Payment milestones', 'time and materials', 'Assumptions', 'Risks', 'Terms', 'Acceptance', 'ABN 53 004 085 616'].forEach(s => assert.ok(html.includes(s), 'missing ' + s));
  assert.ok(html.includes('&lt;Priya&gt;') && !html.includes('<Priya>'));
  assert.ok(html.includes('finishing around 2027-03-01'));
  assert.ok(!/undefined|NaN/.test(html));
  p.pricing.show = { fixed: true, tm: false, milestones: false, tiers: false };
  const h2 = L.toHtml(p, L.SAMPLE_PROFILE);
  assert.ok(!h2.includes('Payment milestones') && !h2.includes('time and materials') && h2.includes('Fixed price'));
});

test('Markdown and email outputs', () => {
  const p = P();
  const md = L.toMarkdown(p, L.SAMPLE_PROFILE);
  assert.ok(md.startsWith('# New website with online booking'));
  assert.ok(md.includes('| Requirement | Priority |'));
  assert.ok(md.includes('Recommended (recommended)'));
  assert.ok(!/undefined|NaN/.test(md));
  const em = L.toEmail(p, L.SAMPLE_PROFILE);
  assert.ok(em.startsWith('Subject: Proposal — New website with online booking'));
  assert.ok(em.includes('Hi Priya,'));
  assert.match(em, /Timeline: about 8 weeks/);
  assert.ok(em.includes('+ GST'));
});

test('import validation', () => {
  assert.strictEqual(L.validateFile({ proposals: [P()] }), null);
  assert.strictEqual(L.validateFile([P()]), null);
  assert.match(L.validateFile({ foo: 1 }), /No proposals/);
  assert.match(L.validateFile({ proposals: [{ title: 'x' }] }), /malformed/);
});
