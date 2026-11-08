const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/email-assistant/lib.js');

const ME = 'alex@mybiz.com.au';
const TODAY = '2026-11-06'; // a Friday
const PILE = `From: Jane Smith <jane@acme.com.au>
To: alex@mybiz.com.au
Subject: Website quote
Date: Mon, 2 Nov 2026 09:10

Hi Alex,

Could you send the revised quote? Also, does it include hosting for the first year?

Thanks
Jane
From: Alex Chen <alex@mybiz.com.au>
To: jane@acme.com.au
Subject: RE: Website quote
Date: Mon, 2 Nov 2026 11:30

Hi Jane,

Hosting for the first year is included. I'll send the revised quote by Thursday.

Cheers,
Alex
From: Alex Chen <alex@mybiz.com.au>
To: sam@printco.com
Subject: Brochure proof
Date: Tue, 3 Nov 2026 10:00

Hi Sam, could you confirm the paper stock? When can you deliver the brochures?

Thanks, Alex
From: Sam Wu <sam@printco.com>
To: alex@mybiz.com.au
Subject: Re: Brochure proof
Date: Tue, 3 Nov 2026 15:00

Hi Alex, the paper stock is 150gsm silk. Let me check with the studio and get back to you tomorrow.

Sam
From: Alex Chen <alex@mybiz.com.au>
To: lee@landlord.com.au
Subject: Lease renewal
Date: 4/11/2026 16:20

Hi Lee, could you please send the renewal paperwork so I can sign it?

Thanks, Alex
From: Raj Patel <raj@shop.com>
To: alex@mybiz.com.au
Subject: Invoice question
Date: Wed, 4 Nov 2026

Hi Alex, why was the invoice higher than last month? I will pay it by end of the week once I hear back.`;

const emails = L.split(PILE);
const I = L.intelligence(emails, ME, TODAY);

test('dates: email Date headers in several formats', () => {
  assert.deepStrictEqual(L.parseDate('Mon, 2 Nov 2026 09:10'), { date: '2026-11-02', time: '09:10', ts: Date.UTC(2026, 10, 2, 9, 10) });
  assert.strictEqual(L.parseDate('4/11/2026 4:20 PM').time, '16:20');
  assert.strictEqual(L.parseDate('November 3, 2026').date, '2026-11-03');
  assert.strictEqual(L.parseDate('2026-11-05T08:00:00Z').date, '2026-11-05');
  assert.strictEqual(L.parseDate('sometime'), null);
});
test('relative date phrases resolve from the email date', () => {
  const r = (s, b) => (L.resolveDate(s, b || '2026-11-02') || {}).date; // Monday
  assert.strictEqual(r('by Thursday'), '2026-11-05');
  assert.strictEqual(r('tomorrow'), '2026-11-03');
  assert.strictEqual(r('end of the week'), '2026-11-06');
  assert.strictEqual(r('next week'), '2026-11-13');
  assert.strictEqual(r('early next week'), '2026-11-10');
  assert.strictEqual(r('in 3 business days', '2026-11-05'), '2026-11-10');
  assert.strictEqual(r('by 14/11'), '2026-11-14');
  assert.strictEqual(r('by the 1st of December'), '2026-12-01');
  assert.strictEqual(r('by end of month'), '2026-11-30');
  assert.strictEqual(L.resolveDate('no date here', '2026-11-02'), null);
});
test('subjects normalise Re:/Fwd:/[tags] and threads group by subject + people', () => {
  assert.strictEqual(L.normaliseSubject('RE: Fwd: re: [External] Website quote'), 'website quote');
  assert.deepStrictEqual(I.threads.map((t) => t.items), [[0, 1], [2, 3], [4], [5]]);
  const two = L.threads(L.split('From: a@x.com\nTo: me@y.com\nSubject: Hello\n\nHi\n---\nFrom: b@z.com\nTo: other@q.com\nSubject: Hello\n\nUnrelated'));
  assert.strictEqual(two.length, 2, 'same subject, no shared people -> separate threads');
});
test('who you are: by address, by name, or guessed from To: lines', () => {
  assert.ok(L.isMe(emails[1], ME)); assert.ok(!L.isMe(emails[0], ME));
  assert.ok(L.isMe(emails[1], 'Alex Chen'));
  assert.strictEqual(L.guessMe(emails), ME);
});
test('promises you made and promises made to you, with due dates', () => {
  const mine = I.promises.filter((p) => p.mine), theirs = I.promises.filter((p) => !p.mine);
  assert.deepStrictEqual(mine.map((p) => [p.text, p.due, p.person]), [["I'll send the revised quote by Thursday.", '2026-11-05', 'Jane Smith']]);
  assert.deepStrictEqual(theirs.map((p) => [p.person, p.due]), [['Sam Wu', '2026-11-04'], ['Raj Patel', '2026-11-06']]);
  assert.ok(!I.promises.some((p) => /I'll be honest/.test(p.text)));
});
test('a promise is marked done when the same person later sends it', () => {
  const pile = PILE + '\nFrom: Alex Chen <alex@mybiz.com.au>\nTo: jane@acme.com.au\nSubject: Re: Website quote\nDate: Thu, 5 Nov 2026 10:00\n\nHi Jane, please find the revised quote attached.';
  const x = L.intelligence(L.split(pile), ME, TODAY);
  assert.ok(x.promises.find((p) => /revised quote/.test(p.text)).done);
});
test('unanswered questions: answered ones dropped; owed vs waiting; greetings stripped', () => {
  const q = I.questions.map((x) => [x.mine, x.text]);
  assert.deepStrictEqual(q, [[true, 'When can you deliver the brochures?'], [true, 'Could you please send the renewal paperwork so I can sign it?'], [false, 'Why was the invoice higher than last month?']]);
  assert.ok(!I.questions.some((x) => /hosting|paper stock/.test(x.text)), 'answered by a later reply on the same topic');
});
test('reminders: kinds, statuses against today, done and snooze state', () => {
  const r = L.reminders(I, {});
  const kinds = r.map((x) => x.kind);
  ['you-promised', 'they-promised', 'waiting-answer', 'you-owe-answer'].forEach((k) => assert.ok(kinds.includes(k), k));
  assert.strictEqual(r.find((x) => x.kind === 'you-promised').status, 'overdue');
  const id = r.find((x) => x.kind === 'you-owe-answer').id;
  const r2 = L.reminders(I, { [id]: { snooze: '2026-11-09' } });
  assert.strictEqual(r2.find((x) => x.id === id).status, 'upcoming');
  assert.strictEqual(L.snooze('monday', TODAY), '2026-11-09');
  assert.strictEqual(L.snooze('3days', TODAY), '2026-11-11');
  assert.strictEqual(L.snooze('tomorrow', TODAY), '2026-11-07');
});
test('saved follow-ups: merging keeps your done/snooze, list filters and sorts', () => {
  const fresh = L.reminders(I, {});
  let saved = L.mergeFollowups({}, fresh, TODAY);
  const id = fresh[0].id; saved[id].done = true; saved[fresh[1].id].snooze = '2026-12-01';
  saved = L.mergeFollowups(saved, L.reminders(I, {}), TODAY); // analyse again
  assert.strictEqual(saved[id].done, true);
  assert.strictEqual(saved[fresh[1].id].snooze, '2026-12-01');
  const open = L.followupList(saved, TODAY, 'open');
  assert.ok(open.every((x) => !x.done));
  assert.strictEqual(open[open.length - 1].when, '2026-12-01');
  assert.strictEqual(L.followupList(saved, TODAY, 'done').length, 1);
});
test('today dashboard buckets', () => {
  const d = L.dashboard(L.followupList(L.mergeFollowups({}, L.reminders(I, {}), TODAY), TODAY), [{ analysis: { urgent: true } }], TODAY);
  assert.ok(d.overdue.length >= 2); assert.strictEqual(d.urgent.length, 1);
  assert.ok(d.owe >= 2 && d.waiting >= 3);
});
test('.ics follow-ups: CRLF, escaped text, all-day events with an alarm, folded lines', () => {
  const list = L.followupList(L.mergeFollowups({}, L.reminders(I, {}), TODAY), TODAY, 'open');
  const ics = L.remindersICS(list, '20261106T000000Z');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, list.length);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261105'));
  assert.ok(/BEGIN:VALARM/.test(ics));
  ics.split('\r\n').forEach((l) => assert.ok(l.length <= 75, l));
  assert.ok(ics.includes('Follow up: You promised — Website quote'));
});
test('old features still behave the same on the new sample', () => {
  const p = L.prioritise(emails);
  assert.strictEqual(p.length, 6);
  assert.ok(p.every((e) => e.analysis && e.suggested));
});
