const test = require('node:test');
const assert = require('node:assert');
const B = require('../assets/core.js');
const L = require('../apps/content-insights/lib.js');
const S = require('../apps/content-insights/sample.js');

function load(csv) {
  const t = B.csv.toObjects(csv); const platform = L.detectPlatform(t.headers);
  return Object.assign({ platform, map: L.detectColumns(t.headers) }, L.normalise(t.rows, L.detectColumns(t.headers), { platform }));
}

test('detects YouTube Studio columns and skips the Total row', () => {
  const d = load(S.youtube());
  assert.strictEqual(d.platform, 'youtube');
  assert.strictEqual(d.map.title, 'Video title');
  assert.strictEqual(d.map.published, 'Video publish time');
  assert.strictEqual(d.map.comments, 'Comments added');
  assert.strictEqual(d.map.avgPct, 'Average percentage viewed (%)');
  assert.strictEqual(d.posts.length, 40);
  assert.ok(d.posts.every(p => p.title && p.views > 0 && p.published instanceof Date));
  assert.strictEqual(d.hasTime, false);
});

test('detects Meta Business Suite columns without confusing the combined column', () => {
  const d = load(S.facebook());
  assert.strictEqual(d.platform, 'facebook');
  assert.strictEqual(d.map.likes, 'Reactions');
  assert.strictEqual(d.map.shares, 'Shares');
  assert.strictEqual(d.map.comments, 'Comments');
  assert.strictEqual(d.map.avgViewSec, 'Average Seconds viewed');
  assert.strictEqual(d.map.duration, 'Duration (sec)');
  assert.strictEqual(d.dateOrder, 'mdy');
  assert.strictEqual(d.hasTime, true);
  const p = d.posts[0];
  assert.ok(Math.abs(p.avgPct - p.avgViewSec / p.duration * 100) < 1e-9, '% viewed derived from seconds');
});

test('flexible headers: odd casing, extra words, unknown columns', () => {
  const m = L.detectColumns(['POST TITLE', 'Publish Date', 'Total Views', 'Avg. view duration', 'Notes', 'Likes', 'Video Length']);
  assert.deepStrictEqual(m, { title: 'POST TITLE', published: 'Publish Date', views: 'Total Views', avgViewSec: 'Avg. view duration', likes: 'Likes', duration: 'Video Length' });
  assert.strictEqual(L.detectPlatform(['Name', 'Plays']), 'other');
});

test('parses durations, numbers and dates in export formats', () => {
  assert.strictEqual(L.toSeconds('0:00:35'), 35);
  assert.strictEqual(L.toSeconds('1:05'), 65);
  assert.strictEqual(L.toSeconds('1m 5s'), 65);
  assert.strictEqual(L.toSeconds('PT2M'), 120);
  assert.strictEqual(L.toSeconds('42'), 42);
  assert.strictEqual(L.toNum('1,234'), 1234);
  assert.strictEqual(L.toNum('12.5K'), 12500);
  assert.strictEqual(L.toNum('48.2%'), 48.2);
  assert.ok(isNaN(L.toNum('')));
  assert.strictEqual(L.dateOrder(['11/03/2026', '11/25/2026']), 'mdy');
  assert.strictEqual(L.dateOrder(['25/11/2026']), 'dmy');
  assert.strictEqual(L.toDateTime('Nov 3, 2026').toISOString(), '2026-11-03T00:00:00.000Z');
  assert.strictEqual(L.toDateTime('11/03/2026 7:30 pm', 'mdy').toISOString(), '2026-11-03T19:30:00.000Z');
  assert.strictEqual(L.toDateTime('03/11/2026', 'dmy').toISOString().slice(0, 10), '2026-11-03');
});

test('hook patterns are recognised in titles', () => {
  assert.deepStrictEqual(L.patternsOf('Why did the teacher cry?').sort(), ['emotional', 'question', 'short'].sort());
  const p = L.patternsOf('When my mother found 3 old letters… 💔');
  for (const id of ['when', 'number', 'emotional', 'ellipsis', 'emoji']) assert.ok(p.includes(id), id);
  assert.ok(L.patternsOf('माँ की चिट्ठी').includes('hindi'));
  assert.ok(!L.patternsOf('A quiet AI walk in the park today with friends').includes('caps'), 'AI is not shouting');
});

test('ranking supports per-day normalisation', () => {
  const posts = [
    { title: 'Old hit', views: 10000, days: 100 },
    { title: 'New post', views: 3000, days: 2 },
    { title: 'Flop', views: 200, days: 50 }
  ];
  assert.strictEqual(L.rank(posts, 'views', false, 1).top[0].post.title, 'Old hit');
  const r = L.rank(posts, 'views', true, 1);
  assert.strictEqual(r.top[0].post.title, 'New post');
  assert.strictEqual(r.top[0].value, 1500);
  assert.strictEqual(r.bottom[0].post.title, 'Flop');
});

test('duration buckets and day groups find the planted pattern in the sample', () => {
  const d = load(S.facebook());
  const dur = L.byDuration(d.posts, 'views', false).filter(r => r.count >= 3).sort((a, b) => b.avg - a.avg);
  assert.strictEqual(dur[0].key, '31–60 s');
  assert.strictEqual(L.bucketOf(15), '0–15 s'); assert.strictEqual(L.bucketOf(16), '16–30 s'); assert.strictEqual(L.bucketOf(60), '31–60 s');
  const hours = L.byHour(d.posts, 'views', false).filter(r => r.count >= 3).sort((a, b) => b.avg - a.avg);
  assert.strictEqual(hours[0].key, 'Evening (17–21)');
  const days = L.byDay(d.posts, 'views', false);
  assert.strictEqual(days.reduce((s, r) => s + r.count, 0), d.posts.length);
});

test('keywords surface repeated topic words and drop filler', () => {
  const d = load(S.youtube());
  const k = L.keywords(d.posts, 'views', false);
  const words = k.map(x => x.word);
  assert.ok(words.includes('letter') && words.includes('old'));
  assert.ok(!words.includes('the') && !words.includes('when'));
  assert.ok(k.every(x => x.count >= 2));
});

test('recommendations cite real numbers and warn on small samples', () => {
  const d = load(S.facebook());
  const r = L.recommendations(d.posts, 'views', false);
  assert.ok(r.length >= 5);
  assert.ok(r.some(x => /31–60 s do best/.test(x.text) && /\d+ posts/.test(x.text)));
  assert.ok(r.some(x => /strongest posting day/.test(x.text)));
  const small = L.recommendations(d.posts.slice(0, 3), 'views', false);
  assert.strictEqual(small[0].level, 'warn'); assert.ok(/Only 3 posts/.test(small[0].text));
});

test('estimate uses similar posts and is honest about confidence', () => {
  const d = load(S.facebook());
  const e = L.estimate({ title: 'When my father found the old letter', duration: 45 }, d.posts);
  assert.strictEqual(e.bucket, '31–60 s');
  assert.ok(e.low <= e.mid && e.mid <= e.high);
  assert.ok(e.neighbours.length >= 3 && e.neighbours.length <= 7);
  assert.ok(e.neighbours[0].score >= e.neighbours[e.neighbours.length - 1].score);
  assert.ok(['low', 'medium'].includes(e.confidence));
  const tiny = L.estimate({ title: 'Anything', duration: 20 }, d.posts.slice(0, 4));
  assert.strictEqual(tiny.confidence, 'low');
});
