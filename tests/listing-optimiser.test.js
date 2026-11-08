const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/listing-optimiser/lib.js');
const B = require('../assets/core.js');

const msgs = (r, area) => r.issues.filter((i) => !area || i.area === area).map((i) => i.level + ': ' + i.msg).join('\n');

test('rules: every marketplace has title limits, images guidance and a title order', () => {
  for (const k of ['amazon', 'ebay', 'etsy', 'google']) {
    const R = L.RULES[k];
    assert.ok(R.titleMax >= R.titleIdeal && R.titleIdeal > 0, k);
    assert.ok(R.images.length > 20 && R.titleOrder.includes('product'), k);
  }
  assert.strictEqual(L.RULES.ebay.titleMax, 80);
  assert.strictEqual(L.RULES.etsy.tags, 13);
  assert.strictEqual(L.RULES.amazon.bullets, 5);
});

test('title length: over the limit is must-fix, over the phone length is a tip', () => {
  const long = 'Acme ' + 'Widget '.repeat(15);
  assert.match(msgs(L.check({ title: long }, 'ebay'), 'Title'), /bad: Title is \d+ characters — over the eBay limit of 80/);
  const mid = 'Acme Insulated Water Bottle, Stainless Steel, 750 ml, Leak-Proof Lid, Sage Green, for Gym and Office';
  assert.match(msgs(L.check({ title: mid }, 'amazon'), 'Title'), /info: Title is \d+ characters; only about the first 80/);
});

test('structure: brand position, product type and attributes in the title', () => {
  const r = L.check({ title: 'Insulated Water Bottle by Coastline', brand: 'Coastline', product: 'water bottle', colour: 'Sage', size: '750 ml' }, 'amazon');
  const m = msgs(r, 'Title');
  assert.match(m, /Brand isn’t at the start/);
  assert.match(m, /None of the key attributes \(size, colour\)/);
  assert.doesNotMatch(m, /product type/);
  assert.match(msgs(L.check({ title: 'Coastline Flask 750 ml', brand: 'Coastline', product: 'water bottle' }, 'amazon')), /product type “water bottle” isn’t in the title/);
});

test('duplicate words respect each marketplace limit (Amazon 2, eBay 1) and ignore small words', () => {
  const t = 'Coastline Water Bottle for Kids and Water Bottle for Adults';
  assert.doesNotMatch(msgs(L.check({ title: t }, 'amazon')), /Repeated/);
  assert.match(msgs(L.check({ title: t }, 'ebay')), /Repeated words: “water” ×2, “bottle” ×2/);
  assert.match(msgs(L.check({ title: t + ' Water' }, 'amazon')), /bad: Repeated word: “water” ×3/);
});

test('claims: medical, promotional, superlative and guarantee wording is flagged; 100% cotton is allowed', () => {
  const r = L.check({ title: 'Lavender Pillow Spray Cures Insomnia – Best Sleep, Free Shipping', description: 'Guaranteed results. 100% effective.' }, 'google');
  const m = msgs(r, 'Claims');
  assert.match(m, /bad: “cures” — Medical claim/);
  assert.match(m, /bad: “insomnia” — Mentions a disease/);
  assert.match(m, /bad: “free shipping” — Promotional/);
  assert.match(m, /warn: “best” — Superlative/);
  assert.match(m, /warn: “guaranteed”/);
  assert.match(m, /warn: “100%”/);
  assert.strictEqual(msgs(L.check({ title: 'Linen Co Tea Towel, 100% Linen, Natural' }, 'etsy'), 'Claims'), '');
});

test('ALL CAPS and special characters, with acronyms and caps brands allowed', () => {
  assert.match(msgs(L.check({ title: 'LAVENDER SOY CANDLE 300G HAND POURED' }, 'amazon')), /whole title is in CAPITALS/);
  const r = L.check({ title: 'IKON USB-C LED Desk Lamp – AMAZING Brightness!!', brand: 'IKON' }, 'amazon');
  assert.match(msgs(r), /Words in ALL CAPS: AMAZING\./);
  assert.match(msgs(r), /discourages in titles: !/);
  assert.match(msgs(L.check({ title: 'Cute Mug ☕ for Mum' }, 'etsy')), /emoji/);
});

test('keyword coverage counts phrases per section, flags missing main keyword and stuffing', () => {
  const r = L.check({ title: 'Coastline Stainless Steel Bottle 750 ml', bullets: ['Insulated water bottle keeps drinks cold so you stay fresh'], description: 'An insulated water bottle. Insulated water bottle for the gym. Insulated-water-bottle!', keywords: 'insulated water bottle, stainless steel, kids bottle' }, 'amazon');
  const k = Object.fromEntries(r.keywords.map((x) => [x.keyword, x]));
  assert.deepStrictEqual([k['insulated water bottle'].title, k['insulated water bottle'].bullets, k['insulated water bottle'].description], [0, 1, 3]);
  assert.strictEqual(k['stainless steel'].title, 1);
  assert.strictEqual(k['kids bottle'].total, 0);
  assert.match(msgs(r, 'Keywords'), /main keyword “insulated water bottle” is not in the title/);
  assert.match(msgs(r, 'Keywords'), /Not used anywhere: “kids bottle”/);
  assert.match(msgs(r, 'Keywords'), /Keyword stuffing: “insulated water bottle”/);
  assert.ok(k['insulated water bottle'].density > 0.04);
});

test('bullets: count, benefit vs feature, caps; Etsy tags: count, length, duplicates', () => {
  const r = L.check({ title: 'Coastline Water Bottle 750 ml Stainless Steel Sage', bullets: 'Double-wall vacuum insulation\nLEAK PROOF LID WITH A CARRY LOOP\nWide mouth so you can add ice easily' }, 'amazon');
  const m = msgs(r, 'Bullets');
  assert.match(m, /Only 3 of 5 bullet points/);
  assert.match(m, /2 bullet\(s\) list a feature but not why it matters/);
  assert.match(m, /1 bullet\(s\) written entirely in capitals/);
  const e = L.check({ title: 'Linen Tea Towel Set of 3, Natural Stonewashed Linen Kitchen Towel', tags: 'linen, linen, a very long tag that is too long, kitchen towel' }, 'etsy');
  const t = msgs(e, 'Tags');
  assert.match(t, /4 of 13 tags used/);
  assert.match(t, /Tags over 20 characters/);
  assert.match(t, /Duplicate tags: linen/);
});

test('readability gives higher scores to short plain sentences', () => {
  const easy = L.readability('This bottle keeps drinks cold. It fits in a bag. Wash it by hand.');
  const hard = L.readability('Constructed utilising sophisticated double-walled vacuum-insulation technology, this extraordinarily versatile hydration accessory accommodates considerable temperature differentials whilst maintaining exceptional structural characteristics.');
  assert.ok(easy.score > 70, 'easy ' + easy.score);
  assert.ok(hard.score < 30, 'hard ' + hard.score);
  assert.strictEqual(easy.sentences, 3);
  assert.strictEqual(L.syllables('bottle'), 2);
});

test('score: a clean generated listing scores well, a spammy one scores badly', () => {
  const s = L.sample();
  const bad = L.check(s.listing, 'amazon');
  assert.ok(bad.score < 30, 'spammy ' + bad.score);
  const a = s.attrs;
  const good = L.check({ title: L.genTitle(a, 'amazon'), bullets: L.genBullets(a, 'amazon'), description: L.genDescription(a), keywords: 'insulated water bottle, leak-proof', brand: a.brand, product: 'water bottle', size: a.size, colour: a.colour, material: a.material, dimensions: a.dimensions, care: a.care }, 'amazon');
  assert.ok(good.score >= 85, 'generated ' + good.score + '\n' + msgs(good));
});

test('fixTitle removes promo text, bad characters, shouting and repeats without touching acronyms or brand', () => {
  assert.strictEqual(L.fixTitle('BEST Insulated Water Bottle Stainless Steel Water Bottle - Cold 24 Hours!! FREE SHIPPING water bottle', 'amazon'), 'Insulated Water Bottle Stainless Steel Water Bottle - Cold 24 Hours');
  assert.strictEqual(L.fixTitle('Wireless Headphones Bluetooth Headphones Over Ear L@@K', 'ebay'), 'Wireless Headphones Bluetooth Over Ear');
  assert.strictEqual(L.fixTitle('IKON USB LED Lamp – AMAZING', 'google', 'IKON'), 'IKON USB LED Lamp – Amazing');
});

test('genTitle follows each marketplace order and fits the limit by dropping low-priority parts', () => {
  const a = L.sample().attrs;
  assert.match(L.genTitle(a, 'amazon'), /^Coastline Insulated Water Bottle – Keeps Drinks Cold 24 Hours, 18\/8 Stainless Steel, 750 ml, Sage Green$/);
  const eb = L.genTitle(a, 'ebay');
  assert.ok(eb.length <= 80, eb);
  assert.match(eb, /^Coastline Insulated Water Bottle/);
  assert.match(L.genTitle(a, 'etsy'), /^Insulated Water Bottle, /);
  const bullets = L.genBullets(a, 'amazon');
  assert.strictEqual(bullets.length, 5);
  assert.ok(bullets.every((b) => /so you|without|easy|you can/i.test(b)), bullets.join('\n'));
  const tags = L.genTags(a);
  assert.ok(tags.length <= 13 && tags.every((t) => t.length <= 20));
});

test('bulk: maps CSV columns (bullet1.., colour/color, marketplace names) and returns rows ready for export', () => {
  const rows = B.csv.toObjects(L.sample().csv).rows;
  const res = L.bulk(rows, 'amazon');
  assert.strictEqual(res.length, 4);
  assert.deepStrictEqual(res.map((r) => r.mk), ['amazon', 'etsy', 'google', 'ebay']);
  assert.strictEqual(res[0].listing.bullets.length, 3);
  const candle = res[2];
  assert.ok(candle.score < 40 && /CAPITALS|Medical/.test(candle.top));
  const out = L.bulkCsvRows(res);
  assert.deepStrictEqual(Object.keys(out[0]), ['row', 'sku', 'marketplace', 'score', 'grade', 'problems', 'title', 'suggested_title', 'title_length', 'top_issues']);
  assert.strictEqual(L.fromRow({ Color: 'Red', 'Bullets': 'a | b' }).colour, 'Red');
  assert.deepStrictEqual(L.fromRow({ Bullets: 'a | b' }).bullets, ['a', 'b']);
  assert.strictEqual(L.mkKey('Shopify'), 'google');
});

test('byteLen counts UTF-8 bytes for Amazon search terms', () => {
  assert.strictEqual(L.byteLen('abc'), 3);
  assert.strictEqual(L.byteLen('café'), 5);
  assert.strictEqual(L.byteLen('☕'), 3);
  assert.match(msgs(L.check({ title: 'x', searchTerms: 'word '.repeat(60) }, 'amazon')), /Backend search terms are \d+ bytes/);
});
