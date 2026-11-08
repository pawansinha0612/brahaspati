const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/family-timeline/lib.js');

const TODAY = '2026-11-08';
const mem = (o) => L.normalise(Object.assign({ id: o.title }, o));

test('dates: exact, month-only and year-only, with "About" for approximate', () => {
  assert.strictEqual(L.cleanDate('2019-3'), '2019-03');
  assert.strictEqual(L.cleanDate('2019-3-7'), '2019-03-07');
  assert.strictEqual(L.cleanDate('1974'), '1974');
  assert.strictEqual(L.cleanDate('last spring'), '');
  assert.strictEqual(L.dateLabel(mem({ title: 'a', date: '2019-03-07' })), '7 Mar 2019');
  assert.strictEqual(L.dateLabel(mem({ title: 'a', date: '2019-03' })), 'March 2019');
  assert.strictEqual(L.dateLabel(mem({ title: 'a', date: '1974', approx: true })), 'About 1974');
  assert.strictEqual(L.dateLabel(mem({ title: 'a' })), 'Date unknown');
});

test('tags are parsed, trimmed, lower-cased and de-duplicated', () => {
  assert.deepStrictEqual(L.parseTags('Beach, #holiday, beach ,  Grand  Parents'), ['beach', 'holiday', 'grand parents']);
});

test('timeline groups newest first by year and month; year-only goes under "Sometime in"', () => {
  const g = L.group([mem({ title: 'A', date: '2020-05-01' }), mem({ title: 'B', date: '2021-01-02' }), mem({ title: 'C', date: '2020' }), mem({ title: 'D', date: '2020-05-20' }), mem({ title: 'E', date: '2020-02' })]);
  assert.deepStrictEqual(g.map((y) => y.year), ['2021', '2020']);
  assert.deepStrictEqual(g[1].months.map((m) => m.label), ['May', 'February', 'Sometime in 2020']);
  assert.deepStrictEqual(g[1].months[0].items.map((m) => m.title), ['D', 'A']);
  assert.strictEqual(g[1].count, 4);
});

test('filters by person, tag, milestone, media kind and words', () => {
  const ms = [mem({ title: 'Beach day', date: '2024-01-01', people: ['p1'], tags: ['beach'], media: [{ id: 'x', kind: 'photo' }] }),
    mem({ title: 'First steps', date: '2023-01-01', people: ['p2'], milestone: 'First steps', media: [{ id: 'y', kind: 'audio' }], story: 'towards the dog' })];
  assert.deepStrictEqual(L.filter(ms, { person: 'p2' }).map((m) => m.title), ['First steps']);
  assert.deepStrictEqual(L.filter(ms, { tag: 'beach' }).map((m) => m.title), ['Beach day']);
  assert.deepStrictEqual(L.filter(ms, { milestones: true }).map((m) => m.title), ['First steps']);
  assert.deepStrictEqual(L.filter(ms, { media: 'voice' }).map((m) => m.title), ['First steps']);
  assert.deepStrictEqual(L.filter(ms, { media: 'photo' }).map((m) => m.title), ['Beach day']);
  assert.deepStrictEqual(L.filter(ms, { q: 'DOG steps' }).map((m) => m.title), ['First steps']);
});

test('on this day: same day in earlier years, exact dates only', () => {
  const ms = [mem({ title: 'A', date: '2024-11-08' }), mem({ title: 'B', date: '2020-11-08' }), mem({ title: 'C', date: '2020-11' }), mem({ title: 'D', date: '2026-11-08' }), mem({ title: 'E', date: '2019-11-08', approx: true })];
  assert.deepStrictEqual(L.onThisDay(ms, TODAY).map((x) => [x.memory.title, x.yearsAgo]), [['A', 2], ['B', 6]]);
});

test('ageAt gives friendly ages', () => {
  assert.strictEqual(L.ageAt('2020-01-09', '2020-01-21'), '12 days');
  assert.strictEqual(L.ageAt('2020-01-09', '2020-03-02'), '1 month');
  assert.strictEqual(L.ageAt('2020-01-09', '2021-03-20'), '1 year 2 months');
  assert.strictEqual(L.ageAt('2020-01-09', '2026-11-08'), '6 years');
  assert.strictEqual(L.ageAt('2020-01-09', '2019-05-01'), 'before birth');
  assert.strictEqual(L.ageAt('', '2020-01-01'), '');
});

test('milestones per person, oldest first, with ages', () => {
  const s = L.sample(TODAY);
  const mia = L.milestones(s.memories, s.people).find((x) => x.person.name === 'Mia');
  assert.deepStrictEqual(mia.items.map((i) => i.memory.milestone).slice(0, 3), ['New baby', 'First smile', 'First steps']);
  assert.strictEqual(mia.items[1].age, '1 month');
  const june = L.milestones(s.memories, s.people).find((x) => x.person.name === 'Grandma June');
  assert.strictEqual(june.items[0].memory.milestone, 'Wedding');
});

test('slides run oldest to newest and include videos', () => {
  const ms = [mem({ title: 'new', date: '2025-01-01', media: [{ id: 'b', kind: 'photo' }, { id: 'v', kind: 'video' }, { id: 'a', kind: 'audio' }] }), mem({ title: 'old', date: '2001', media: [{ id: 'a1', kind: 'photo' }] })];
  assert.deepStrictEqual(L.slides(ms).map((s) => s.mediaId), ['a1', 'b', 'v']);
});

test('encryption: vault round-trip, wrong passcode rejected, ciphertext hides the text', async () => {
  const data = { memories: [{ title: 'Secret family recipe', story: 'Nana’s pavlova 🍓' }] };
  const { vault, key } = await L.createVault('correct horse', data, 2000);
  assert.strictEqual(vault.cipher, 'AES-256-GCM');
  assert.ok(!JSON.stringify(vault).includes('pavlova'));
  const opened = await L.openVault('correct horse', vault);
  assert.deepStrictEqual(opened.data, data);
  await assert.rejects(L.openVault('wrong horse', vault), /Wrong passcode/);
  // resealing with the open key changes the IV and still opens with the passcode
  const v2 = await L.sealVault(key, vault, { memories: [] });
  assert.notStrictEqual(v2.iv, vault.iv);
  assert.strictEqual(v2.salt, vault.salt);
  assert.deepStrictEqual((await L.openVault('correct horse', v2)).data, { memories: [] });
  await assert.rejects(L.createVault('short', data, 2000), /6 characters/);
});

test('encryption: media bytes round-trip; tampering is detected', async () => {
  const { key } = await L.createVault('abcdef', {}, 2000);
  const bytes = new Uint8Array(5000).map((_, i) => (i * 7) % 256);
  const c = L.mediaCipher(key);
  const r = await c.encrypt(bytes);
  assert.strictEqual(r.data.length, bytes.length + 16); // GCM tag
  assert.deepStrictEqual(Array.from(await c.decrypt(r.data, r.iv)), Array.from(bytes));
  r.data[10] ^= 1;
  await assert.rejects(c.decrypt(r.data, r.iv), /Wrong passcode|damaged/);
});

test('memory book escapes text, shows ages and embeds photos', () => {
  const people = [{ id: 'p', name: 'Mia <3', dob: '2020-01-09' }];
  const html = L.bookHTML([mem({ title: 'Zoo & lions', date: '2022-01-09', people: ['p'], story: 'Line 1\nLine 2', media: [{ id: 'i', kind: 'photo' }, { id: 'v', kind: 'audio' }] })], people, { i: 'data:image/jpeg;base64,AA' }, { title: 'Our book' });
  assert.ok(html.includes('Zoo &amp; lions'));
  assert.ok(html.includes('Mia &lt;3 (2 years)'));
  assert.ok(html.includes('Line 1<br>Line 2'));
  assert.ok(html.includes('src="data:image/jpeg;base64,AA"'));
  assert.ok(html.includes('voice note or video'));
});

test('sample data has an "on this day" memory and nothing dated in the future', () => {
  const s = L.sample(TODAY);
  assert.ok(L.onThisDay(s.memories, TODAY).length >= 1);
  assert.ok(s.memories.every((m) => L.sortKey(m) <= TODAY));
});
