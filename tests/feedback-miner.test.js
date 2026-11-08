const test = require('node:test');
const assert = require('node:assert');
const B = require('../assets/core.js');
const L = require('../apps/feedback-miner/lib.js');

test('detectColumns maps Google, Shopify (Judge.me) and Trustpilot style exports', () => {
  const g = L.detectColumns(['Reviewer', 'Star Rating', 'Comment', 'Create Time']);
  assert.strictEqual(g.text, 'Comment'); assert.strictEqual(g.rating, 'Star Rating'); assert.strictEqual(g.date, 'Create Time'); assert.strictEqual(g.author, 'Reviewer');
  const j = L.detectColumns(['title', 'body', 'rating', 'review_date', 'reviewer_name', 'product_handle']);
  assert.strictEqual(j.text, 'body'); assert.strictEqual(j.title, 'title'); assert.strictEqual(j.product, 'product_handle'); assert.strictEqual(j.author, 'reviewer_name');
  const t = L.detectColumns(['Review Title', 'Review Content', 'Review Stars', 'Review Date', 'Location']);
  assert.strictEqual(t.text, 'Review Content'); assert.strictEqual(t.rating, 'Review Stars'); assert.strictEqual(t.title, 'Review Title');
});

test('sentiment: lexicon, negation, intensifiers and "but" clauses', () => {
  assert.ok(L.sentiment('Great service, lovely staff').score > 0.5);
  assert.ok(L.sentiment('Terrible, rude and dirty').score < -0.5);
  assert.ok(L.sentiment('not good').score < 0, 'negation flips');
  assert.ok(L.sentiment('not bad at all').score > 0, 'not bad is mildly positive');
  assert.ok(L.sentiment('very good').sum > L.sentiment('good').sum, 'intensifier');
  assert.ok(L.sentiment('slightly disappointing').sum > L.sentiment('disappointing').sum, 'diminisher');
  // the clause after "but" carries more weight
  assert.ok(L.sentiment('The staff were friendly but the wait was terrible').score < 0);
  assert.ok(L.sentiment('The wait was terrible but the staff were amazing').score > 0);
  assert.ok(L.sentiment('I would not recommend this').score < 0);
  assert.ok(L.sentiment('Highly recommend!').score > 0.5);
  assert.strictEqual(L.sentiment('The parcel came on Tuesday').sum, 0);
});

test('parseRating handles numbers, stars and x/y', () => {
  assert.strictEqual(L.parseRating('4'), 4);
  assert.strictEqual(L.parseRating('★★★☆☆'), 3);
  assert.strictEqual(L.parseRating('8/10'), 4);
  assert.strictEqual(L.parseRating('5 out of 5'), 5);
  assert.strictEqual(L.parseRating(''), null);
});

test('fromTable normalises 10-point scores to 1–5 and skips empty rows', () => {
  const t = B.csv.toObjects('Score,Feedback\n10,Loved it\n0,Awful\n5,Okay\n7,\n');
  const r = L.fromTable(t.rows, L.detectColumns(t.headers));
  assert.strictEqual(r.length, 3);
  assert.strictEqual(r[0].rating, 5);
  assert.strictEqual(r[1].rating, 1);
  assert.strictEqual(r[2].rating, 3);
});

test('fromPaste splits paragraphs and picks up star prefixes', () => {
  const r = L.fromPaste('★★★★★ Fantastic, will be back\n\n2/5 - waited ages and nobody said sorry\n\nGood coffee 4 stars');
  assert.strictEqual(r.length, 3);
  assert.deepStrictEqual(r.map((x) => x.rating), [5, 2, 4]);
  assert.strictEqual(r[1].text, 'waited ages and nobody said sorry');
  assert.strictEqual(L.fromPaste('one\ntwo').length, 2);
});

test('scoreReview finds themes with per-sentence polarity (service mode)', () => {
  const r = L.scoreReview({ text: 'The stylist was lovely and friendly. But I waited 40 minutes past my appointment and nobody told me.', rating: 3 }, 'service');
  const wait = r.mentions.find((m) => m.theme === 'wait'), staff = r.mentions.find((m) => m.theme === 'staff');
  assert.strictEqual(wait.polarity, 'neg');
  assert.strictEqual(staff.polarity, 'pos');
  // the wait complaint mentions "appointment" but must not also count as a booking complaint
  const booking = r.mentions.find((m) => m.theme === 'booking');
  assert.ok(!booking || booking.polarity !== 'neg');
});

test('product mode detects size direction', () => {
  assert.strictEqual(L.scoreReview({ text: 'Runs small, had to size up', rating: 3 }, 'product').sizeDir, 'small');
  assert.strictEqual(L.scoreReview({ text: 'Way too big and baggy', rating: 2 }, 'product').sizeDir, 'large');
  assert.strictEqual(L.scoreReview({ text: 'Fits perfectly', rating: 5 }, 'product').sizeDir, null);
});

test('analyse ranks recurring complaints by frequency × negativity and builds monthly trends', () => {
  const rows = [];
  const add = (d, rating, text) => rows.push({ Date: d, Rating: rating, Review: text });
  for (let i = 0; i < 6; i++) add('2026-0' + (1 + (i % 6)) + '-10', 2, 'Waited 30 minutes past my booking time. Not happy.');
  for (let i = 0; i < 2; i++) add('2026-03-12', 2, 'Way overpriced for what you get.');
  for (let i = 0; i < 8; i++) add('2026-0' + (1 + (i % 6)) + '-15', 5, 'Lovely friendly staff, great result.');
  const t = { headers: ['Date', 'Rating', 'Review'], rows };
  const r = L.analyse(L.fromTable(t.rows, L.detectColumns(t.headers)), 'service');
  assert.strictEqual(r.n, 16);
  assert.strictEqual(r.complaints[0].id, 'wait');
  assert.strictEqual(r.complaints[0].negative, 6);
  assert.ok(r.complaints.find((c) => c.id === 'price').negative === 2);
  assert.strictEqual(r.praise[0].id, 'staff');
  assert.deepStrictEqual(r.months.map((m) => m.month), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
  assert.ok(r.complaints[0].quotesNeg.length >= 1);
});

test('emerging issues: a theme whose share jumps in the last two months is flagged', () => {
  const months = [];
  for (let i = 1; i <= 6; i++) months.push({ month: '2026-0' + i, n: 20, themes: i >= 5 ? { wait: 6, price: 1 } : { wait: 1, price: 1 } });
  const themes = L.themesFor('service');
  const e = L.emerging(months, themes, 2, 4);
  assert.strictEqual(e.length, 1);
  assert.strictEqual(e[0].id, 'wait');
  assert.strictEqual(e[0].recentCount, 12);
  assert.strictEqual(e[0].priorCount, 4);
});

test('product sample: leggings run small, bottle leaks are an emerging issue, ideas are specific', () => {
  const s = L.sampleData('product');
  const r = L.analyse(L.fromTable(s.rows, L.detectColumns(s.headers)), 'product');
  const leg = r.products.find((p) => p.product === 'Studio Leggings');
  assert.strictEqual(leg.topIssues[0].id, 'fit');
  assert.ok(leg.small > 10 && leg.large === 0);
  const idea = r.ideas.find((i) => i.product === 'Studio Leggings' && i.theme === 'Size & fit');
  assert.match(idea.text, /runs small/);
  assert.match(idea.text, /sizing up/);
  assert.ok(r.emerging.some((e) => e.id === 'quality'), 'leaks from the new bottle batch show as emerging');
  assert.strictEqual(r.products.find((p) => p.product === 'Sport Earbuds').topIssues[0].id, 'battery');
});

test('service sample: wait time is the top complaint and is growing', () => {
  const s = L.sampleData('service');
  const r = L.analyse(L.fromTable(s.rows, L.detectColumns(s.headers)), 'service');
  assert.strictEqual(r.complaints[0].id, 'wait');
  assert.ok(r.emerging.some((e) => e.id === 'wait'));
  assert.ok(r.praise.slice(0, 3).some((t) => t.id === 'staff'));
  assert.ok(r.avgRating > 3 && r.avgRating < 4.6);
});

test('reply drafts address the specific complaint and the reviewer', () => {
  const r = L.scoreReview({ text: 'Leggings run small and customer service never replied to my email.', rating: 1, author: 'Priya K', product: 'Studio Leggings' }, 'product');
  const d = L.replyDraft(r, 'product', { business: 'Coast Active', contact: 'help@example.com' });
  assert.match(d, /^Hi Priya,/);
  assert.match(d, /size guide/);
  assert.match(d, /help@example\.com/);
  assert.match(d, /Studio Leggings/);
  assert.match(d, /Coast Active$/);
  const anon = L.replyDraft(L.scoreReview({ text: 'Bad.', rating: 1, author: 'A Google user' }, 'service'), 'service');
  assert.match(anon, /^Hi there,/);
});

test('reviewRows exports one CSV row per review with complaints and praise', () => {
  const r = L.analyse([{ id: 'a', text: 'Rude receptionist. Great cut though.', rating: 3, date: Date.UTC(2026, 0, 5) }], 'service');
  const rows = L.reviewRows(r);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].Date, '2026-01-05');
  assert.match(rows[0].Complaints, /Staff attitude/);
});
