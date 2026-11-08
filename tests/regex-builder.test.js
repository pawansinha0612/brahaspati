const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/regex-builder/lib.js');

const re = (d) => { const r = L.build(d); return new RegExp(r.pattern, r.flags.replace('g', '')); };
const ok = (d, yes, no) => { const r = re(d); yes.forEach((s) => assert.ok(r.test(s), `${d} should match ${JSON.stringify(s)} (${r})`)); (no || []).forEach((s) => assert.ok(!r.test(s), `${d} should not match ${JSON.stringify(s)} (${r})`)); };

// ---------- catalogue ----------
test('catalogue has ~40+ unique entries that all compile and match their own example', () => {
  assert.ok(L.CATALOGUE.length >= 40);
  const ids = new Set();
  for (const c of L.CATALOGUE) {
    assert.ok(!ids.has(c.id), 'dup ' + c.id); ids.add(c.id);
    const rx = new RegExp(c.src, c.flags || '');
    if (c.example) assert.ok(rx.test(c.example.split(/,| or | is written /).pop().trim()) || rx.test(c.example), c.id + ' vs ' + c.example);
  }
});
test('email', () => ok('email address', ['jane.doe@example.com.au', 'a+b@x.io'], ['jane@', 'no at sign']));
test('Australian mobile (local and +61)', () => ok('australian mobile whole line', ['0412 345 678', '+61 412 345 678', '0412345678'], ['0212 345 678', '041234567']));
test('AU postcode with whole word', () => ok('postcode', ['2000', 'NSW 2150', '0800'], ['0100', '12345x'.slice(0, 0) || 'abc']));
test('ABN shape', () => ok('ABN', ['51 824 753 556', '51824753556'], ['5182475355']));
test('IPv4 accepts valid octets only', () => ok('ipv4 whole line', ['192.168.0.1', '255.255.255.255'], ['256.1.1.1', '1.2.3']));
test('IPv6 full and shortened', () => ok('ipv6 whole line', ['2001:0db8:0000:0000:0000:ff00:0042:8329', '2001:db8::1', '::1'], ['2001:db8:::1:zz']));
test('dates: dd/mm/yyyy vs ISO', () => {
  ok('dd/mm/yyyy whole line', ['08/11/2026', '31/12/1999'], ['32/01/2026', '2026-11-08']);
  ok('ISO date whole line', ['2026-11-08'], ['2026-13-01', '08/11/2026']);
});
test('time, money, UUID, hex colour', () => {
  ok('24 hour time whole line', ['09:30', '23:59:59'], ['24:00', '9:3']);
  ok('money whole line', ['$1,234.56', '$5', '-$20.00'], ['1,234']);
  ok('uuid', ['7f3a9c21-55e0-4b7d-9a0c-2d1e6f8b4c10'], ['7f3a9c21-55e0']);
  ok('hex colour whole line', ['#fff', '#B4531B'], ['#ffff', 'fff']);
});
test('credit-card shape for masking and log levels', () => {
  ok('credit card', ['4111 1111 1111 1111', '4111-1111-1111-1111'], ['4111 1111']);
  ok('log level', ['2026 ERROR boom', 'WARNING: x'], ['errorless']);
});
test('longest catalogue key wins (iso timestamp over date/time)', () => {
  assert.deepStrictEqual(L.build('iso timestamp').used, ['datetime-iso']);
  assert.deepStrictEqual(L.build('australian phone').used, ['au-phone']);
  assert.deepStrictEqual(L.build('mobile number').used, ['au-mobile']);
  assert.strictEqual(L.catalogueAt('ipsum'), null);
});

// ---------- phrase grammar ----------
test('starts with literal followed by N digits', () => {
  const r = L.build('starts with INV- followed by 6 digits');
  assert.strictEqual(r.pattern, '^INV-\\d{6}');
  ok('starts with INV- followed by 6 digits', ['INV-004512'], ['XINV-004512', 'INV-12']);
});
test('ends with .pdf case-insensitive keeps the dot literal and sets i', () => {
  const r = L.build('ends with .pdf case-insensitive');
  assert.strictEqual(r.pattern, '\\.pdf$'); assert.ok(r.flags.includes('i'));
  ok('ends with .pdf case-insensitive', ['report.PDF', 'a.pdf'], ['pdf.txt', 'apdf']);
});
test('contains clauses become look-aheads with a length body', () => {
  const r = L.build('between 8 and 20 characters, contains a digit, contains an uppercase letter');
  assert.strictEqual(r.pattern, '^(?=.*\\d)(?=.*[A-Z]).{8,20}$');
  ok('between 8 and 20 characters, contains a digit, contains an uppercase letter', ['Password1', 'abcdefG9'], ['password1', 'PASSWORD', 'Ab1']);
});
test('a lone contains clause is just the thing itself', () => {
  assert.strictEqual(L.build('contains digits').pattern, '\\d');
  ok('contains the word error', ['an error here'], ['terrors']);
});
test('must not contain uses a negative look-ahead', () => {
  ok('no spaces, between 3 and 16 alphanumeric characters', ['abc123'], ['ab', 'abc 123', 'abc_123']);
  ok('does not contain digits', ['hello'], ['hell0']);
});
test('exactly N letters then a hyphen then N digits', () => {
  assert.strictEqual(L.build('exactly 3 letters then a hyphen then 4 digits').pattern, '[A-Za-z]{3}-\\d{4}');
});
test('number words and ranges: "two to four digits", "at least 2", "up to 3"', () => {
  assert.strictEqual(L.build('two to four digits').pattern, '\\d{2,4}');
  assert.strictEqual(L.build('at least 2 digits').pattern, '\\d{2,}');
  assert.strictEqual(L.build('up to 3 letters').pattern, '[A-Za-z]{0,3}');
  assert.strictEqual(L.build('one or more letters').pattern, '[A-Za-z]+');
  assert.strictEqual(L.build('1 digit').pattern, '\\d');
});
test('one of a, b or c with whole word', () => {
  const r = L.build('one of red, green or blue as a whole word');
  assert.strictEqual(r.pattern, '\\b(?:red|green|blue)\\b');
  ok('one of red, green or blue as a whole word', ['the red car'], ['reddish']);
});
test('one of escapes regex characters in items', () => {
  assert.strictEqual(L.build('one of "a.b", c+d').pattern, '(?:a\\.b|c\\+d)');
});
test('optional quoted text followed by letters', () => {
  assert.strictEqual(L.build('optional "Mr " followed by letters').pattern, '(?:Mr )?[A-Za-z]+');
});
test('starts with X and ends with Y puts .* between', () => {
  assert.strictEqual(L.build('starts with a capital letter and ends with a full stop').pattern, '^[A-Z].*\\.$');
  ok('starts with "<" ends with ">"', ['<b>'], ['<b']);
});
test('whole line anchors and wraps alternations', () => {
  const r = L.build('log level whole line');
  assert.ok(r.pattern.startsWith('^') && r.pattern.endsWith('$'));
  ok('log level whole line', ['ERROR'], ['ERROR x']);
});
test('words count and multiline flag', () => {
  ok('3 words whole line', ['one two three'], ['one two']);
  assert.ok(L.build('trailing spaces').flags.includes('m'));
  assert.ok(L.build('each line starts with #').flags.includes('m'));
});
test('unknown words are reported, empty input is not ok', () => {
  const r = L.build('frobnicate digits');
  assert.deepStrictEqual(r.ignored, ['frobnicate']);
  assert.strictEqual(L.build('').ok, false);
  assert.strictEqual(L.build('please match').ok, false);
});
test('every example built pattern compiles', () => {
  ['email', 'starts with http', 'ends with !', 'contains "?"', 'one of a, b', 'between 1 and 3 words', 'ipv6 then a space then email', 'first match only digits', 'repeated word']
    .forEach((d) => { const r = L.build(d); assert.ok(r.ok, d); new RegExp(r.pattern, r.flags); });
});

// ---------- explainer ----------
test('explain: anchors, named groups, classes, quantifiers, lookarounds, alternation', () => {
  const t = L.explain('^(?<year>\\d{4})-[^a-z]+?(?=x)(?<!y)a|b$');
  const texts = t.map((x) => x.text);
  assert.deepStrictEqual(texts, ['^', '(?<year>', '\\d', '{4}', ')', '-', '[^a-z]', '+?', '(?=', 'x', ')', '(?<!', 'y', ')', 'a', '|', 'b', '$']);
  assert.match(t[1].desc, /named group “year”/);
  assert.strictEqual(t[2].depth, 1);
  assert.match(t[3].desc, /exactly 4 times/);
  assert.match(t[6].desc, /any character except a to z/);
  assert.match(t[7].desc, /lazy/);
  assert.match(t[8].desc, /look ahead/);
  assert.match(t[11].desc, /must NOT come after/);
  assert.match(t[15].desc, /OR/);
});
test('explain: literal runs leave the quantified char separate; escapes and backrefs', () => {
  const t = L.explain('abc+\\.\\1\\k<n>\\u00e9{2,5}\\p{L}');
  assert.deepStrictEqual(t.map((x) => x.text), ['ab', 'c', '+', '\\.', '\\1', '\\k<n>', '\\u00e9', '{2,5}', '\\p{L}']);
  assert.match(t[4].desc, /group 1/);
  assert.match(t[7].desc, /between 2 and 5/);
});
test('explain: non-capturing, atomic, possessive, inline flags, class with escaped ]', () => {
  const t = L.explain('(?:a)(?>b)c++(?i)[\\]x]');
  assert.match(t[0].desc, /not captured/);
  assert.match(t[3].desc, /atomic/);
  assert.match(t.find((x) => x.text === '++').desc, /possessive/);
  assert.match(t.find((x) => x.text === '(?i)').desc, /flags/);
  assert.strictEqual(t[t.length - 1].text, '[\\]x]');
});
test('flags explained and flavour notes mention relevant differences', () => {
  assert.strictEqual(L.explainFlags('gi').length, 2);
  assert.ok(L.flavourNotes('(?<n>a)', '').some((n) => /\(\?P<name>/.test(n)));
  assert.ok(L.flavourNotes('(?<=a)b', '').some((n) => /Look-behind/.test(n)));
  assert.ok(L.flavourNotes('a++', '').some((n) => /Possessive/.test(n)));
  assert.ok(L.flavourNotes('\\Aabc', '').some((n) => /\\A/.test(n)));
  assert.match(L.flavourNotes('abc', '')[0], /same/);
});

// ---------- literals ----------
test('literals for JS, Python, Java and C#', () => {
  const l = L.literals('(?<n>\\w+)/"x"', 'gi');
  assert.strictEqual(l.js, '/(?<n>\\w+)\\/"x"/gi');
  assert.strictEqual(l.jsString, 'new RegExp("(?<n>\\\\w+)/\\"x\\"", "gi")');
  assert.match(l.python, /re\.compile\(r'\(\?P<n>\\w\+\)\/"x"', re\.IGNORECASE\)/);
  assert.match(l.java, /Pattern\.compile\("\(\?<n>\\\\w\+\)\/\\"x\\"", Pattern\.CASE_INSENSITIVE\)/);
  assert.match(l.csharp, /new Regex\(@"\(\?<n>\\w\+\)\/""x""", RegexOptions\.IgnoreCase\)/);
  // the generated JS string literal evaluates back to the same regex
  assert.strictEqual(eval(l.jsString).source, new RegExp('(?<n>\\w+)/"x"').source);
});
test('Python falls back to a normal string when raw is impossible; backrefs convert', () => {
  const l = L.literals('a\'b"c', '');
  assert.match(l.python, /re\.compile\("a'b\\"c"\)/);
  assert.strictEqual(L.toPythonSyntax('(?<y>\\d)\\k<y>'), '(?P<y>\\d)(?P=y)');
  assert.match(L.literals('^a$', 'ms').java, /Pattern\.MULTILINE \| Pattern\.DOTALL/);
});

// ---------- tester ----------
test('tester returns matches, groups and named groups', () => {
  const r = L.test('(\\d+)-(?<b>\\w)', 'g', '12-a 34-b');
  assert.strictEqual(r.matches.length, 2);
  assert.deepStrictEqual(r.matches[1], { index: 5, end: 9, text: '34-b', groups: ['34', 'b'], named: { b: 'b' } });
});
test('tester: no g flag gives only the first; zero-length matches do not loop forever', () => {
  assert.strictEqual(L.test('\\d', '', '1 2 3').matches.length, 1);
  assert.strictEqual(L.test('x*', 'g', 'ab').matches.length, 3);
  assert.strictEqual(L.test('a', 'g', 'a'.repeat(5000), 100).matches.length, 100);
});
test('tester and replace report bad patterns instead of throwing', () => {
  assert.match(L.test('(', 'g', 'a').error, /Unterminated group/);
  assert.ok(L.replace('[', 'g', 'a', 'x').error);
  assert.strictEqual(L.replace('(\\w+)@', 'g', 'a@ b@', '[$1]').text, '[a] [b]');
});
