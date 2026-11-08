const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/english-practice/lib.js');

const fix = (t) => L.checkGrammar(t).corrected;
const rules = (t) => L.checkGrammar(t).issues.map((i) => i.rule);

test('content library has enough material and well-formed entries', () => {
  assert.ok(L.EXPRESSIONS.length >= 120, 'expressions: ' + L.EXPRESSIONS.length);
  const phrases = new Set();
  for (const e of L.EXPRESSIONS) {
    assert.ok(e.phrase && e.meaning && e.example, JSON.stringify(e));
    assert.ok(['neutral', 'polite', 'casual', 'slang', 'avoid'].includes(e.formality), e.phrase);
    assert.ok(!phrases.has(e.phrase), 'duplicate ' + e.phrase); phrases.add(e.phrase);
  }
  for (const p of ['Arvo', 'No worries', 'Reckon', 'Heaps', 'Fair dinkum']) assert.ok(phrases.has(p), 'missing ' + p);
  assert.ok([...phrases].some((p) => /How ya going/.test(p)));
  for (const g of L.GRAMMAR) assert.ok(g.answer >= 0 && g.answer < g.options.length && g.why, g.q);
});

test('every role-play scenario is a valid branching script that ends', () => {
  assert.strictEqual(L.SCENARIOS.length, 7);
  for (const s of L.SCENARIOS) {
    const seen = new Set(), stack = [s.start];
    while (stack.length) {
      const id = stack.pop(); if (id === 'end' || seen.has(id)) continue; seen.add(id);
      const n = s.nodes[id]; assert.ok(n, s.id + ' missing node ' + id);
      assert.ok(n.choices.length >= 2, s.id + '/' + id + ' needs choices');
      assert.ok(n.choices.some((c) => c.score === 2), s.id + '/' + id + ' needs a best answer');
      n.choices.forEach((c) => { assert.ok(c.feedback); stack.push(c.next); });
    }
    assert.strictEqual(seen.size, Object.keys(s.nodes).length, s.id + ' has unreachable nodes');
  }
  const r = L.scenarioResult(L.SCENARIOS[0], [{ score: 2 }, { score: 2 }, { score: 1 }, { score: 2 }]);
  assert.strictEqual(r.pct, 88);
});

test('daily set is stable for a date and changes between days', () => {
  const a = L.dailySet('2026-11-08'), b = L.dailySet('2026-11-08');
  assert.deepStrictEqual(a.expressions.map((e) => e.id), b.expressions.map((e) => e.id));
  assert.strictEqual(a.expressions.length, 3);
  assert.strictEqual(new Set(a.expressions.map((e) => e.id)).size, 3);
  assert.ok(a.expressions.every((e) => e.formality !== 'avoid'));
  assert.ok(a.conversation && a.speaking && a.grammar.length === 3);
  const week = new Set(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'].map((d) => L.dailySet(d).expressions.map((e) => e.id).join()));
  assert.ok(week.size >= 4, 'days should differ');
});

test('speech comparison: word-level diff, contractions, numbers and near-misses', () => {
  let r = L.compareSpeech('I’m running about ten minutes late.', 'I am running about 10 minutes late');
  assert.strictEqual(r.score, 100);
  r = L.compareSpeech('Could I please get a large flat white?', 'could I get a large flat white');
  assert.deepStrictEqual(r.ops.filter((o) => o.status === 'missed').map((o) => o.word), ['please']);
  assert.strictEqual(r.score, 88);
  r = L.compareSpeech('Thanks heaps for your help.', 'thanks heap for you help');
  assert.deepStrictEqual(r.ops.filter((o) => o.status === 'close').map((o) => [o.word, o.said]), [['heaps', 'heap'], ['your', 'you']]);
  r = L.compareSpeech('Is that for here or takeaway?', 'is that for here or take away');
  assert.strictEqual(r.score, 100);
  r = L.compareSpeech('Have a good one.', 'have a very very good one');
  assert.strictEqual(r.ops.filter((o) => o.status === 'extra').length, 2);
  assert.ok(r.score < 100);
  assert.strictEqual(L.compareSpeech('Hello there', '').score, 0);
});

test('grammar: classic learner errors from the brief', () => {
  assert.strictEqual(fix('I am agree with you.'), 'I agree with you.');
  assert.strictEqual(fix('She has worked here since 2 years.'), 'She has worked here for 2 years.');
  assert.strictEqual(fix('We discussed about the budget.'), 'We discussed the budget.');
  assert.strictEqual(fix('This one is more better.'), 'This one is better.');
  assert.strictEqual(fix('I don’t have nothing to add.'), 'I don’t have anything to add.');
  assert.strictEqual(fix('Yesterday i went home and i slept.'), 'Yesterday I went home and I slept.');
  assert.strictEqual(fix('Its a long weekend.'), 'It’s a long weekend.');
  assert.strictEqual(fix('The company changed it’s logo.'), 'The company changed its logo.');
  assert.strictEqual(fix('Your welcome!'), 'You’re welcome!');
  assert.strictEqual(fix('Is this you’re car?'), 'Is this your car?');
});

test('grammar: articles, agreement and verb forms', () => {
  assert.strictEqual(fix('She is engineer at a university and he is a honest man with an car.'), 'She is an engineer at a university and he is an honest man with a car.');
  assert.strictEqual(fix('He don’t like it and he go to work by train.'), 'He doesn’t like it and he goes to work by train.');
  assert.strictEqual(fix('They was late. I has a question.'), 'They were late. I have a question.');
  assert.strictEqual(fix('I have went there and she didn’t saw me.'), 'I have gone there and she didn’t see me.');
  assert.strictEqual(fix('I am living in Sydney since 2019.'), 'I have been living in Sydney since 2019.');
  assert.strictEqual(fix('I am having a car.'), 'I have a car.');
});

test('grammar: no false alarms on correct sentences', () => {
  const ok = [
    'I agree with you, and I have lived here since 2019.',
    'We are having lunch at the café on Friday.',
    'Let him go home early. Did she go to the doctor?',
    'He has to leave at five, but it’s fine.',
    'An hour ago a university student asked for an MBA brochure.',
    'Its owner said the dog loses its collar every week.',
    'You’re right, your report is great.',
    'Everyone is welcome. People are friendly here.'
  ];
  for (const s of ok) assert.deepStrictEqual(L.checkGrammar(s).issues, [], 'false alarm in: ' + s + ' → ' + rules(s));
});

test('grammar: Indian-English phrases flagged as style, with Australian alternatives', () => {
  const r = L.checkGrammar('Myself Priya. Please prepone the meeting. I will revert back to you. I have a doubt about the invoice.');
  assert.strictEqual(r.corrected, 'I’m Priya. Please bring forward the meeting. I will get back to you. I have a question about the invoice.');
  assert.ok(r.issues.filter((i) => i.rule !== 'myself-name').every((i) => i.style));
  assert.strictEqual(fix('Can you explain me the process? He said me to wait.'), 'Can you explain to me the process? He told me to wait.');
  assert.strictEqual(fix('Can I get some advices and many informations?'), 'Can I get some advice and a lot of information?');
});

test('grammar: overlapping fixes are resolved over several passes', () => {
  const r = L.checkGrammar('This is more better then before.');
  assert.strictEqual(r.corrected, 'This is better than before.');
  assert.ok(r.issues.some((i) => i.later && i.rule === 'than-then'));
  const first = r.issues.filter((i) => !i.later);
  for (const i of first) assert.strictEqual('This is more better then before.'.slice(i.start, i.end), i.text);
});

test('progress: streaks, missed days and speaking trend', () => {
  let p = L.blankProgress();
  ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-07'].forEach((d, i) => L.recordActivity(p, d, 'speaking', { score: 60 + i * 5, target: 'x' }));
  L.recordActivity(p, '2026-11-07', 'speaking', { score: 100 });
  L.recordActivity(p, '2026-11-07', 'roleplay', { id: 'cafe', pct: 50 });
  L.recordActivity(p, '2026-11-07', 'roleplay', { id: 'cafe', pct: 75 });
  // today (8th) not practised yet: streak still counts up to yesterday
  assert.deepStrictEqual(L.streak(p, '2026-11-08'), { current: 3, best: 3, activeDays: 6 });
  assert.strictEqual(L.streak(p, '2026-11-10').current, 0);
  const trend = L.speechTrend(p);
  assert.strictEqual(trend.length, 6);
  assert.deepStrictEqual(trend[5], { date: '2026-11-07', avg: 93, n: 2 });
  assert.strictEqual(p.scenarios.cafe, 75);
  assert.strictEqual(p.days['2026-11-07'].count, 4);
});
