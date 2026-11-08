const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/meeting-minutes/lib.js');

const MEETING = '2026-11-11'; // a Wednesday
const due = (s) => (L.resolveDue(s, MEETING) || {}).date;

const TRANSCRIPT = `Priya Shah: Okay, thanks everyone.
Sam Lee: We agreed to go with Stripe for payments.
Priya Shah: Great. Sam, can you send the contract to legal by Friday?
Sam Lee: Sure, will do.
Alex: I will update the pricing page by EOD.
Alex: What about the mobile app?
Priya Shah: Not sure yet, I need to check with the vendor.
Sam Lee: One risk is the API rate limit, we might slip a week. Budget is $12,000 and conversion is 3.4%.
Priya Shah: Let's keep the beta to 200 users. @Alex please share the test plan next week.
Alex: Where are the build logs kept?
Sam Lee: In the shared drive under releases.`;

test('due dates: weekdays, EOD, tomorrow, next week, next <day>, end of week/month', () => {
  assert.strictEqual(due('by Friday'), '2026-11-13');
  assert.strictEqual(due('by Wednesday'), '2026-11-18'); // same weekday = next week
  assert.strictEqual(due('EOD'), '2026-11-11');
  assert.strictEqual(due('end of day today'), '2026-11-11');
  assert.strictEqual(due('tomorrow'), '2026-11-12');
  assert.strictEqual(due('next week'), '2026-11-20');
  assert.strictEqual(due('next Monday'), '2026-11-16');
  assert.strictEqual(due('by end of week'), '2026-11-13');
  assert.strictEqual(due('by end of the month'), '2026-11-30');
  assert.strictEqual(due('in 2 weeks'), '2026-11-25');
});
test('due dates: dd/mm, dd/mm/yyyy, "3rd of December", "Jan 5" roll into next year when past', () => {
  assert.strictEqual(due('by 14/11'), '2026-11-14');
  assert.strictEqual(due('on 02/01/2027'), '2027-01-02');
  assert.strictEqual(due('by 01/03'), '2027-03-01');
  assert.strictEqual(due('by the 3rd of December'), '2026-12-03');
  assert.strictEqual(due('Jan 5'), '2027-01-05');
  assert.strictEqual(L.resolveDue('no date here', MEETING), null);
  assert.strictEqual(L.resolveDue('we sat down', MEETING), null);
});
test('speaker transcript: attendees and format', () => {
  const m = L.extract(TRANSCRIPT, MEETING);
  assert.strictEqual(m.format, 'speakers');
  assert.deepStrictEqual(m.attendees, ['Priya Shah', 'Sam Lee', 'Alex']);
});
test('actions: "Name, can you" → that person; "I will" → speaker; @mention; due dates resolved', () => {
  const a = L.extract(TRANSCRIPT, MEETING).actions;
  const sam = a.find((x) => /contract/.test(x.task));
  assert.strictEqual(sam.owner, 'Sam Lee'); assert.strictEqual(sam.due, '2026-11-13');
  const alex = a.find((x) => /pricing page/.test(x.task));
  assert.strictEqual(alex.owner, 'Alex'); assert.strictEqual(alex.due, '2026-11-11');
  const plan = a.find((x) => /test plan/.test(x.task));
  assert.strictEqual(plan.owner, 'Alex'); assert.strictEqual(plan.due, '2026-11-20');
  assert.strictEqual(a.find((x) => /vendor/.test(x.task)).owner, 'Priya Shah');
});
test('"can you" with no name goes to whoever says yes next', () => {
  const m = L.extract('Jo: Can you book the room for Thursday?\nKim: Yep, on it.', MEETING);
  assert.strictEqual(m.actions[0].owner, 'Kim');
  assert.strictEqual(m.actions[0].due, '2026-11-12');
});
test('decisions, risks and key numbers', () => {
  const m = L.extract(TRANSCRIPT, MEETING);
  assert.ok(m.decisions.some((d) => /Stripe/.test(d.text)));
  assert.ok(m.decisions.some((d) => /200 users/.test(d.text)));
  assert.ok(m.risks.some((r) => /rate limit/.test(r.text)));
  assert.deepStrictEqual(m.numbers.map((n) => n.value), ['$12,000', '3.4%', '200 users']);
});
test('open questions: unanswered kept, answered dropped, "can you" asks are actions not questions', () => {
  const q = L.extract(TRANSCRIPT, MEETING).questions.map((x) => x.text);
  assert.ok(q.includes('What about the mobile app?')); // answer was "not sure"
  assert.ok(!q.some((x) => /build logs/.test(x))); // answered
  assert.ok(!q.some((x) => /contract/.test(x)));
});
test('WebVTT with <v> voice tags: speakers, merged cues, talk time and duration', () => {
  const vtt = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:05.000\n<v Jane Doe>Hi all, we decided to ship on Monday.</v>\n\n2\n00:00:05.500 --> 00:00:09.000\n<v Tom>I will write the release notes tomorrow.</v>\n\n3\n00:00:09.200 --> 00:00:12.000\n<v Tom>And I will tag the build.</v>\n';
  const m = L.extract(vtt, MEETING);
  assert.strictEqual(m.format, 'vtt');
  assert.deepStrictEqual(m.attendees, ['Jane Doe', 'Tom']);
  assert.strictEqual(m.utterances.length, 2); // Tom's two cues merged
  assert.strictEqual(m.duration, 11);
  assert.strictEqual(m.talk.find((t) => t.speaker === 'Tom').seconds, 6.5);
  assert.strictEqual(m.actions[0].due, '2026-11-12');
});
test('SRT with "Name: text" and Otter-style "Name  0:05" headers', () => {
  const srt = '1\n00:00:01,000 --> 00:00:03,000\nAmy: Let\'s go with option B.\n\n2\n00:00:03,500 --> 00:00:06,000\nBen: I\'ll draft the brief by 20/11.\n';
  const s = L.extract(srt, MEETING);
  assert.strictEqual(s.format, 'srt'); assert.deepStrictEqual(s.attendees, ['Amy', 'Ben']);
  assert.strictEqual(s.actions[0].owner, 'Ben'); assert.strictEqual(s.actions[0].due, '2026-11-20');
  const otter = L.extract('Jane Doe  0:05\nWe need to fix the login bug.\n\nTom  1:10\nI can take that, done by Friday.', MEETING);
  assert.deepStrictEqual(otter.attendees, ['Jane Doe', 'Tom']);
  assert.strictEqual(otter.utterances[1].start, 70);
  assert.strictEqual(otter.actions.find((x) => /take that/.test(x.task)).owner, 'Tom');
});
test('plain notes with Attendees/Decision/Action labels', () => {
  const m = L.extract('Attendees: Mia, Raj and Lee\n- Decision: move launch to March\n- Action: Raj to update the roadmap by next Monday\n- Risk: vendor contract not signed', MEETING);
  assert.strictEqual(m.format, 'plain');
  assert.deepStrictEqual(m.attendees, ['Mia', 'Raj', 'Lee']);
  assert.deepStrictEqual(m.decisions.map((d) => d.text), ['Move launch to March']);
  assert.strictEqual(m.actions[0].owner, 'Raj'); assert.strictEqual(m.actions[0].due, '2026-11-16');
  assert.ok(m.risks.length === 1);
});
test('Markdown and email outputs contain the sections and dates', () => {
  const m = L.extract(TRANSCRIPT, MEETING);
  const md = L.toMarkdown(m, 'Weekly sync');
  assert.match(md, /^# Weekly sync/);
  assert.match(md, /\*\*Date:\*\* Wed 11 Nov 2026/);
  assert.match(md, /\| Sam Lee \| .*contract.* \| Fri 13 Nov 2026 \|/);
  ['## Decisions', '## Action items', '## Open questions', '## Risks and blockers', '## Key numbers'].forEach((h) => assert.ok(md.includes(h), h));
  const em = L.toEmail(m, 'Weekly sync');
  assert.strictEqual(em.subject, 'Weekly sync — Wed 11 Nov 2026');
  assert.match(em.body, /ACTION ITEMS\n1\. /);
});
test('.ics: one all-day event per dated action, escaped text, CRLF and folded lines', () => {
  const ics = L.toICS([{ owner: 'Sam', task: 'Send contract, to legal; ' + 'x'.repeat(100), due: '2026-11-13' }, { owner: 'Al', task: 'No date', due: '' }], 'Sync', '20261108T000000Z');
  assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261113\r\nDTEND;VALUE=DATE:20261114'));
  assert.ok(ics.includes('Send contract\\, to legal\\;'));
  ics.split('\r\n').forEach((l) => assert.ok(l.length <= 75, 'line too long: ' + l));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
});
