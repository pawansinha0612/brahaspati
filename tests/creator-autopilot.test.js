const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/creator-autopilot/lib.js');

const kamla = { id: 'k', name: 'Kamla', age: '68', look: 'silver hair in a bun, round glasses', outfit: 'green cotton saree', voice: 'soft Hindi', traits: 'proud' };
const raju = { id: 'r', name: 'Raju', age: '24', look: 'messy black hair', outfit: 'blue delivery jacket' };

test('concepts are repeatable for the same shuffle code and differ for another', () => {
  const a = L.concepts('series-1234', 6), b = L.concepts('series-1234', 6), c = L.concepts('series-9999', 6);
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a.map(x => x.logline), c.map(x => x.logline));
  assert.strictEqual(a.length, 6);
  assert.ok(a.every(x => x.logline.includes(' — until ') && x.logline.endsWith('.')));
});

test('concept filters pin genre and emotion', () => {
  const list = L.concepts('x', 5, { genre: 'mystery', emotion: 'regret' });
  assert.ok(list.every(c => c.genre === 'mystery' && c.emotion === 'regret'));
  // the other ingredients still vary
  assert.ok(new Set(list.map(c => c.setting)).size > 1);
});

test('consistency block carries every bible field and an instruction', () => {
  const block = L.consistencyBlock(kamla);
  for (const part of ['Kamla', '68 years old', 'silver hair', 'wearing green cotton saree', 'personality: proud', 'voice: soft Hindi', 'identical in every shot']) {
    assert.ok(block.includes(part), 'missing ' + part);
  }
  assert.strictEqual(L.consistencyBlock({}), '');
});

test('scene breakdown fills the target length exactly with a 0–3 s hook', () => {
  for (const len of [15, 30, 60, 90]) {
    const s = L.breakdown(len, { emotion: 'hope' }, [kamla]);
    assert.deepStrictEqual(s.map(x => x.beat), ['hook', 'setup', 'conflict', 'turn', 'payoff', 'cta']);
    assert.strictEqual(s[0].start, 0); assert.strictEqual(s[0].end, 3);
    assert.strictEqual(s[s.length - 1].end, len, 'ends at ' + len);
    assert.strictEqual(s.reduce((t, x) => t + x.dur, 0), len);
    assert.ok(s.every(x => x.dur >= 1));
    for (let i = 1; i < s.length; i++) assert.strictEqual(s[i].start, s[i - 1].end, 'contiguous');
  }
});

test('image and video prompts include the matching character, style and aspect ratio', () => {
  const scene = { beat: 'conflict', dur: 8, text: 'Raju walks in late; Kamla turns away.' };
  const img = L.imagePrompt(scene, [kamla, raju], 'noir', 'shorts');
  assert.ok(img.includes('9:16') && img.includes('neon') && img.includes('Raju, 24 years old') && img.includes('Kamla, 68'));
  const vid = L.videoPrompt({ beat: 'hook', dur: 3, text: 'A cold plate of rotis.' }, [kamla, raju], 'warm', 'youtube');
  // no name in the text -> falls back to the lead character
  assert.ok(vid.startsWith('3 second shot') && vid.includes('Kamla') && !vid.includes('Raju') && vid.includes('16:9 widescreen'));
});

test('ten title formulas, filled with no leftover placeholders', () => {
  const t = L.titles({ protagonist: 'a widowed mother', emotion: 'regret' }, { who: 'Kamla' });
  assert.strictEqual(t.length, 10);
  assert.ok(t.every(x => !/\{\w+\}/.test(x.title)));
  assert.ok(t.some(x => x.title === 'When Kamla found out the truth'));
  assert.ok(t.some(x => x.title.startsWith('My mother kept')));
  assert.ok(t.some(x => x.title.startsWith('Regret in one minute')));
});

test('hashtags respect platform limits and keep custom tags first', () => {
  const yt = L.hashtags(['emotional', 'family', 'hindi', 'ai', 'mystery', 'romance'], 'shorts', { all: true, custom: ['My Channel!'] });
  assert.ok(yt.tags.length <= 15); assert.strictEqual(yt.limit, 15);
  assert.strictEqual(yt.tags[0], '#MyChannel');
  assert.ok(yt.dropped > 0);
  const reel = L.hashtags(['emotional', 'family'], 'reels');
  assert.strictEqual(reel.tags.length, 5);
  assert.ok(reel.tags.includes('#emotional') && reel.tags.includes('#family'), 'round-robin includes both topics');
  assert.strictEqual(new Set(yt.tags).size, yt.tags.length, 'no duplicates');
});

test('caption stays within the platform limit', () => {
  const c = L.caption({ emotion: 'hope', protagonist: 'a street vendor', want: 'is saving every coin', twist: 'it was for a stranger' }, 'reels', 1);
  assert.ok(c.includes('A street vendor is saving every coin… until it was for a stranger.'));
  assert.ok(c.length <= L.PLATFORMS.reels.captionMax);
});

test('month grid starts on Monday and covers every day', () => {
  const g = L.monthGrid(2026, 10); // November 2026 starts on a Sunday
  assert.strictEqual(g[0].filter(Boolean)[0], '2026-11-01');
  assert.strictEqual(g[0].indexOf('2026-11-01'), 6);
  assert.strictEqual(g.flat().filter(Boolean).length, 30);
  assert.ok(g.every(w => w.length === 7));
  const by = L.postsByDay([{ date: '2026-11-03' }, { date: '2026-11-03' }, { date: null }]);
  assert.strictEqual(by['2026-11-03'].length, 2);
});

test('performance summary computes engagement and per-platform averages', () => {
  const r = L.perf([
    { id: 1, title: 'A', platform: 'reels', views: 1000, likes: 80, shares: 15, comments: 5, watch: 12 },
    { id: 2, title: 'B', platform: 'reels', views: 3000, likes: 100, shares: 50, comments: 50, watch: 20 },
    { id: 3, title: 'C', platform: 'shorts', views: '2000', likes: 20 },
    { id: 4, title: 'Not posted', platform: 'shorts' }
  ]);
  assert.strictEqual(r.posts, 3);
  assert.strictEqual(r.rows[0].title, 'B');
  assert.strictEqual(r.totals.views, 6000);
  assert.ok(Math.abs(r.engagement - 320 / 6000) < 1e-9);
  assert.ok(Math.abs(r.rows.find(x => x.title === 'A').engagement - 0.1) < 1e-9);
  const reels = r.byPlatform.find(b => b.platform === 'reels');
  assert.strictEqual(reels.avgViews, 2000);
});

test('backup round-trips and rejects foreign files', () => {
  const s = L.emptyState(); s.characters.push(kamla); s.series.name = 'Test';
  const back = L.importBackup(L.exportBackup(s));
  assert.deepStrictEqual(back, s);
  assert.throws(() => L.importBackup('{"app":"other","data":{}}'), /not a Creator Autopilot backup/);
  assert.deepStrictEqual(L.normaliseState({ characters: 'bad' }).characters, []);
});
