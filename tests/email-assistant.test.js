const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/email-assistant/lib.js');

const PILE = `From: Jane Smith <jane@acme.com.au>
Subject: Invoice INV-2041 overdue
Date: Mon, 3 Nov 2026

Hi, invoice INV-2041 for $1,250.00 was due on 20/10. Can you please arrange payment by Friday? This is the final notice.

Thanks
Jane

On Mon, 1 Nov 2026 at 9:00, Accounts wrote:
> old quoted text please ignore
From: Weekly Digest <news@tools.io>
Subject: Your weekly roundup

View this email in your browser. 20% off all plans this week! Unsubscribe here.
From: Tom Lee <tom@client.com>
Subject: Catch up next week?

Hey, are you available for a call next Tuesday at 2pm to talk about the website? Let me know.
From: Raj <raj@shop.com>
Subject: URGENT - site is down

The checkout is broken and not working since this morning. This is unacceptable. Please fix ASAP!!`;

test('split on From: blocks, parse headers, names and strip quoted history', () => {
  const e = L.split(PILE);
  assert.strictEqual(e.length, 4);
  assert.strictEqual(e[0].fromName, 'Jane Smith');
  assert.strictEqual(e[0].fromEmail, 'jane@acme.com.au');
  assert.strictEqual(e[0].subject, 'Invoice INV-2041 overdue');
  assert.strictEqual(e[0].date, 'Mon, 3 Nov 2026');
  assert.ok(!/quoted text/.test(e[0].body));
});
test('split on --- separators and emails without headers', () => {
  const e = L.split('Can you send the report?\n---\nThanks for lunch!\n\nCheers,\nMia Wong');
  assert.strictEqual(e.length, 2);
  assert.strictEqual(e[1].fromName, 'Mia Wong');
  assert.strictEqual(e[0].hasHeaders, false);
  assert.deepStrictEqual(L.split('   '), []);
});
test('classify: invoice, newsletter, meeting, complaint+urgent', () => {
  const [inv, news, meet, comp] = L.split(PILE).map(L.classify);
  assert.strictEqual(inv.primary, 'invoice');
  assert.ok(inv.categories.some((c) => c.id === 'urgent'));
  assert.strictEqual(news.primary, 'fyi');
  assert.strictEqual(meet.primary, 'meeting');
  assert.strictEqual(comp.primary, 'complaint');
  assert.ok(comp.urgent);
});
test('extract asks, dates, amounts and references', () => {
  const x = L.classify(L.split(PILE)[0]).extract;
  assert.deepStrictEqual(x.asks, ['Can you please arrange payment by Friday?']);
  assert.ok(x.dates.includes('20/10') && x.dates.includes('friday'));
  assert.deepStrictEqual(x.amounts, ['$1,250.00']);
  assert.deepStrictEqual(x.refs, ['INV-2041']);
});
test('prioritise: urgent complaint first, newsletter last, with suggested templates', () => {
  const p = L.prioritise(L.split(PILE));
  assert.strictEqual(p[0].fromName, 'Raj');
  assert.strictEqual(p[p.length - 1].fromName, 'Weekly Digest');
  assert.ok(p[0].analysis.priority > p[2].analysis.priority);
  assert.ok(p.find((e) => e.fromName === 'Jane Smith').suggested.includes('chase-payment'));
  assert.ok(p.find((e) => e.fromName === 'Tom Lee').suggested.includes('accept-meeting'));
});
test('there are at least 25 templates and every one fills without leftover {placeholders}', () => {
  assert.ok(L.TEMPLATES.length >= 25);
  for (const t of L.TEMPLATES) for (const tone of [0, 1, 2]) {
    const r = L.fill(t.id, { name: 'Sam', me: 'Alex' }, tone);
    assert.ok(!/[{}]/.test(r.body + r.subject), t.id + ' tone ' + tone + ': ' + r.body);
    t.fields.forEach((f) => assert.ok(L.FIELD_LABELS[f], 'label for ' + f));
  }
});
test('tone slider swaps phrase sets (warm / neutral / formal)', () => {
  const v = { name: 'Jane', invoice: 'INV-1', amount: '$50', due: '1 Nov', me: 'Alex' };
  const warm = L.fill('chase-payment', v, 0).body, neutral = L.fill('chase-payment', v, 1).body, formal = L.fill('chase-payment', v, 2).body;
  assert.match(warm, /^Hi Jane,/); assert.match(warm, /Just checking in on/); assert.match(warm, /Cheers,\nAlex$/);
  assert.match(neutral, /Kind regards,/);
  assert.match(formal, /^Dear Jane,/); assert.match(formal, /I am writing to follow up on/); assert.match(formal, /Yours sincerely,/);
  assert.deepStrictEqual(L.fill('chase-payment', { name: 'Jane' }, 1).missing, ['invoice', 'amount', 'due', 'me']);
  assert.match(L.fill('complaint-reply', { name: 'Raj' }, 0).body, /and I’m really sorry/); // "I" stays capital
});
test('tone check flags passive-aggressive phrases, caps, !!! and long sentences', () => {
  const r = L.toneCheck('As per my last email, you need to send it ASAP!!! THIS IS NOT OK. ' + 'word '.repeat(40) + '.');
  const types = r.issues.map((i) => i.type);
  ['phrase', 'caps', 'exclaim', 'long'].forEach((t) => assert.ok(types.includes(t), t));
  assert.strictEqual(r.issues.filter((i) => /per my last email/i.test(i.text)).length, 1);
  assert.ok(r.score < 60);
});
test('tone check: polite email scores well; acronyms are not shouting', () => {
  const r = L.toneCheck('Hi Sam,\n\nCould you send the PDF and the ABN by Friday? Thanks so much for your help.\n\nCheers,\nAlex');
  assert.strictEqual(r.issues.length, 0);
  assert.strictEqual(r.verdict, 'Friendly and clear');
});
test('soften rewrites blunt phrases, extra punctuation and caps runs', () => {
  const s = L.soften('As per my last email, you need to send it!!! THIS IS NOT OK??');
  assert.strictEqual(s, 'As I mentioned earlier, could you please send it! This is not ok?');
});
test('subject suggestions depend on the kind of email', () => {
  const inv = L.subjectSuggestions('Invoice INV-77 for $300 is overdue, please pay by Friday.');
  assert.ok(inv.some((s) => /INV-77/.test(s)));
  const meet = L.subjectSuggestions('Are you available for a meeting on Tuesday at 2pm about the website budget?');
  assert.ok(meet.some((s) => /^Meeting request/.test(s)));
  assert.ok(meet.every((s) => s.length <= 78));
});
test('mailto encodes subject and body but keeps @', () => {
  assert.strictEqual(L.mailto('a@b.com', 'Hi & bye', 'Line 1\nLine 2'), 'mailto:a@b.com?subject=Hi%20%26%20bye&body=Line%201%0ALine%202');
});
