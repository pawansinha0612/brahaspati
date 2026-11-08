const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/job-copilot/lib.js');

const names = (list) => list.map((s) => s.name);

test('skills dictionary is large and has no duplicate names', () => {
  assert.ok(L.SKILLS.length >= 300, 'expected 300+ skills, got ' + L.SKILLS.length);
  const seen = new Set();
  for (const s of L.SKILLS) { assert.ok(!seen.has(s.name), 'duplicate ' + s.name); seen.add(s.name); }
});

test('extracts skills through aliases and special characters', () => {
  const found = names(L.extractSkills('We use Node.js, C#, .NET Core, k8s, GitHub Actions, CI/CD pipelines, reactjs and Postgres. Grafana k6 for load tests.'));
  for (const s of ['Node.js', 'C#', '.NET', 'Kubernetes', 'GitHub Actions', 'CI/CD', 'React', 'PostgreSQL', 'k6']) assert.ok(found.includes(s), 'missing ' + s + ' in ' + found);
  assert.ok(!found.includes('GitHub'), 'GitHub Actions should not also count as GitHub');
  assert.ok(!found.includes('Java'), 'JavaScript-like words must not match Java');
});

test('common English words are not mistaken for skills', () => {
  const found = names(L.extractSkills('You will go live with the rest of the team. Solid communication and a swift turnaround; we go to market fast.'));
  assert.ok(!found.includes('REST'));
  assert.ok(!found.includes('SOLID'));
  assert.ok(!found.includes('Go'));
  assert.ok(!found.includes('Swift'));
  assert.ok(found.includes('Communication'));
  assert.ok(names(L.extractSkills('Backend in Go and Swift for iOS; REST APIs')).includes('Go'));
});

test('keyword extraction keeps repeated domain phrases and drops job-ad filler', () => {
  const jd = 'You will own the claims platform. Claims processing experience is key. Claims processing rules change often. Strong team player with great experience in a fast paced environment. Underwriting knowledge, underwriting rules.';
  const kws = L.extractKeywords(jd).map((k) => k.term);
  assert.ok(kws.includes('claims processing'), kws.join(','));
  assert.ok(kws.includes('underwriting'), kws.join(','));
  for (const filler of ['experience', 'team', 'strong', 'great']) assert.ok(!kws.includes(filler), 'filler kept: ' + filler);
});

test('match score rewards a resume that covers the ad and lists missing skills by weight', () => {
  const weak = L.matchResume(L.SAMPLE_RESUME, L.SAMPLE_JD);
  const strongResume = L.SAMPLE_RESUME + '\nAlso: Playwright with TypeScript and JavaScript, k6 performance testing and load testing, GitHub Actions, REST microservices, Docker, Cypress, Pact contract testing, test strategy, database testing, communication and stakeholder management, payments.';
  const strong = L.matchResume(strongResume, L.SAMPLE_JD);
  assert.ok(strong.score > weak.score + 30, `strong ${strong.score} vs weak ${weak.score}`);
  assert.ok(names(weak.matched).includes('JMeter'));
  const top = names(weak.missing).slice(0, 6);
  assert.ok(top.includes('Playwright') && top.includes('k6') && top.includes('TypeScript'), top.join(','));
  assert.ok(weak.missing.find((s) => s.name === 'Playwright').required);
});

test('requirement lines: years compared with the resume, "or" lists, eligibility and nice-to-haves', () => {
  const jd = 'What you bring\n• 5+ years in test automation\n• Experience with Playwright or Cypress\n• Australian citizenship required (baseline clearance)\n\nNice to have\n• AWS certification';
  const r = L.detectRequirements(jd, 'Test engineer since 2023. Cypress, Selenium.');
  const years = r.find((x) => x.type === 'years');
  assert.strictEqual(years.years, 5);
  assert.strictEqual(years.status, 'gap');
  assert.strictEqual(r.find((x) => /Playwright or Cypress/.test(x.line)).status, 'met');
  assert.strictEqual(r.find((x) => /citizenship/.test(x.line)).type, 'eligibility');
  assert.ok(r.find((x) => /AWS/.test(x.line)).nice);
  assert.strictEqual(L.detectRequirements(jd, '8 years of experience in test automation')[0].status, 'met');
});

test('suggestions include bullet templates for missing skills and flag weak phrasing', () => {
  const m = L.matchResume('Responsible for testing.\nWorked on releases.\nHelped the team.\nDid manual testing.\nWrote reports.\nAttended stand-ups.\nReviewed tickets.\nTested features.\nLogged bugs.', 'Must have Playwright and JMeter experience. Playwright, JMeter.');
  const bullets = m.suggestions.filter((s) => s.kind === 'bullet').map((s) => s.skill);
  assert.ok(bullets.includes('Playwright') && bullets.includes('JMeter'));
  assert.ok(m.suggestions.some((s) => s.kind === 'tip' && /weak phrases/.test(s.text)));
  assert.ok(m.suggestions.some((s) => s.kind === 'tip' && /numbers/.test(s.text)));
});

test('skill gaps aggregate across saved ads and mark what the resume already has', () => {
  const ads = [
    { label: 'A', text: 'Playwright, TypeScript, AWS' },
    { label: 'B', text: 'Playwright and Java, AWS Lambda' },
    { label: 'C', text: 'Cypress, TypeScript, Playwright' }
  ];
  const gaps = L.skillGaps(ads, 'I know TypeScript and Cypress');
  assert.strictEqual(gaps[0].name, 'Playwright');
  assert.strictEqual(gaps[0].ads, 3);
  assert.deepStrictEqual(gaps[0].from, ['A', 'B', 'C']);
  assert.strictEqual(gaps.find((g) => g.name === 'TypeScript').inResume, true);
  assert.strictEqual(gaps.find((g) => g.name === 'AWS').inResume, false);
});

test('interview questions come from the skills in the ad, with behavioural questions and STAR', () => {
  const q = L.interviewQuestions('Performance tester: JMeter, k6, Kubernetes. Excellent communication.');
  const skills = new Set(q.technical.map((x) => x.skill));
  assert.ok(skills.has('JMeter') && skills.has('k6') && skills.has('Kubernetes'));
  assert.ok(q.technical.every((x) => x.q.endsWith('?') || x.q.endsWith('.')));
  assert.strictEqual(q.behavioural[0].theme, 'Communication');
  assert.ok(q.behavioural.length >= 8);
  assert.ok(/Situation/.test(q.star) && /Result/.test(q.star));
  // unknown-to-the-bank skills still get a templated question
  assert.ok(L.interviewQuestions('Snowflake data warehouse').technical.some((x) => x.skill === 'Snowflake'));
});

test('tracker stats: response, interview and offer rates, overdue and stale follow-ups', () => {
  let apps = [
    { id: 1, status: 'saved', history: [] },
    { id: 2, status: 'applied', applied: '2026-10-01', history: [{ status: 'applied', date: '2026-10-01' }] },
    { id: 3, status: 'rejected', applied: '2026-10-01', history: [{ status: 'applied', date: '2026-10-01' }, { status: 'screen', date: '2026-10-05' }, { status: 'rejected', date: '2026-10-10' }] },
    { id: 4, status: 'interview', applied: '2026-10-20', nextDate: '2026-11-01', next: 'Send portfolio', history: [{ status: 'applied', date: '2026-10-20' }, { status: 'interview', date: '2026-10-29' }] },
    { id: 5, status: 'applied', applied: '2026-10-10', history: [{ status: 'applied', date: '2026-10-10' }] }
  ];
  apps[4] = L.setStatus(apps[4], 'offer', '2026-11-02');
  const s = L.trackerStats(apps, '2026-11-08');
  assert.strictEqual(s.total, 5);
  assert.strictEqual(s.sent, 4);
  assert.strictEqual(s.responseRate, 3 / 4);
  assert.strictEqual(s.interviewRate, 2 / 4); // 4 interviewed, 5 jumped to offer
  assert.strictEqual(s.offerRate, 1 / 4);
  assert.deepStrictEqual(s.overdue.map((a) => a.id), [4]);
  assert.deepStrictEqual(s.stale.map((a) => a.id), [2]);
  assert.strictEqual(s.avgDaysToReply, Math.round((4 + 9 + 23) / 3));
});

test('salary: super-inclusive packages are compared fairly and tax estimate is sensible', () => {
  const r = L.compareSalary({ expected: 140000, offered: 156800, offeredIncludesSuper: true });
  assert.strictEqual(r.offered.base, 140000);
  assert.strictEqual(r.offered.superAmt, 16800);
  assert.strictEqual(r.diff, 0);
  assert.ok(/meets or beats/.test(r.verdict));
  const low = L.compareSalary({ expected: 150000, offered: 130000 });
  assert.ok(/Below/.test(low.verdict));
  assert.strictEqual(L.incomeTax(18000), 360); // only Medicare levy below the tax-free threshold
  const t = L.incomeTax(100000);
  assert.ok(t > 20000 && t < 25000, 'tax on 100k ' + t);
  assert.deepStrictEqual(L.parseSalaryRange('$120,000 – 140k + super'), { min: 120000, max: 140000 });
  assert.strictEqual(L.parseSalaryRange('competitive'), null);
});
