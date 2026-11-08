const test = require('node:test');
const assert = require('node:assert');
const K = require('../apps/knowledge-brain/lib.js');

const longText = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} talks about topic ${i % 5} in some detail.`).join(' ');

test('chunk splits long text into overlapping pieces under the size', () => {
  const parts = K.chunk(longText, { size: 300, overlap: 60 });
  assert.ok(parts.length > 4);
  parts.forEach(p => assert.ok(p.text.length <= 300, 'chunk too long: ' + p.text.length));
  // overlap: the start of chunk 2 appears at the end of chunk 1
  const tail = parts[0].text.slice(-20);
  assert.ok(parts[1].text.includes(tail.trim().split(' ').pop()));
  // the whole text is covered
  assert.ok(parts[parts.length - 1].text.includes('Sentence number 39'));
});

test('chunk keeps short text as one chunk and ignores empty text', () => {
  assert.deepStrictEqual(K.chunk('Hello world.'), [{ text: 'Hello world.', start: 0 }]);
  assert.deepStrictEqual(K.chunk('   '), []);
});

test('chunkDocument keeps source name and page', () => {
  const c = K.chunkDocument({ id: 'd1', name: 'Lease.pdf', pages: [{ page: 1, text: 'Rent is due monthly.' }, { page: 2, text: 'Bond is four weeks.' }] });
  assert.strictEqual(c.length, 2);
  assert.deepStrictEqual([c[1].docId, c[1].docName, c[1].page], ['d1', 'Lease.pdf', 2]);
});

test('tokenize drops stop words and stems plurals', () => {
  assert.deepStrictEqual(K.tokenize('The invoices are paid'), ['invoice', 'paid']);
  assert.deepStrictEqual(K.tokenize('Policies'), ['policy']);
});

function lib() {
  const docs = [
    { id: 'a', name: 'Lease.pdf', pages: [{ page: 1, text: 'The weekly rent is $550 and is paid every Monday. The bond equals four weeks of rent.' }, { page: 2, text: 'Pets are allowed with written approval from the landlord.' }] },
    { id: 'b', name: 'Car.docx', pages: [{ page: 1, text: 'The car service is due in March 2027. Tyres were replaced in 2025.' }] }
  ];
  const chunks = docs.flatMap(d => K.chunkDocument(d));
  return { chunks, index: K.buildIndex(chunks) };
}

test('BM25 search ranks the relevant chunk first and filters by document', () => {
  const { chunks, index } = lib();
  const r = K.search(index, chunks, 'when is the car service due');
  assert.strictEqual(r[0].chunk.docName, 'Car.docx');
  const r2 = K.search(index, chunks, 'pets landlord');
  assert.strictEqual(r2[0].chunk.page, 2);
  assert.strictEqual(K.search(index, chunks, 'pets', { docIds: ['b'] }).length, 0);
  assert.deepStrictEqual(K.search(index, chunks, 'the and of'), []);
});

test('highlight escapes HTML and marks matching words', () => {
  const h = K.highlight('Rent <b>is</b> paid monthly by rents', 'rent');
  assert.ok(h.includes('<mark>Rent</mark>'));
  assert.ok(h.includes('<mark>rents</mark>'));
  assert.ok(h.includes('&lt;b&gt;'));
});

test('extractive answer picks matching sentences with citations', () => {
  const { chunks, index } = lib();
  const q = 'how much is the weekly rent';
  const ans = K.extractiveAnswer(q, K.search(index, chunks, q), { max: 2 });
  assert.ok(ans.sentences.length >= 1);
  assert.ok(/\$550/.test(ans.sentences[0].text));
  assert.strictEqual(ans.sentences[0].cite, 1);
  assert.strictEqual(ans.sources[0].docName, 'Lease.pdf');
});

test('summarise returns sentences in original order and respects n', () => {
  const s = K.summarise(longText + ' Topic 3 is the most important topic of all and topic 3 matters.', 3);
  assert.strictEqual(s.length, 3);
  const pos = s.map(x => (longText + ' Topic 3 is').indexOf(x.slice(0, 20)));
  assert.deepStrictEqual(pos.slice().sort((a, b) => a - b), pos);
});

test('keyFacts finds dates, money, emails, phones, urls and names', () => {
  const f = K.keyFacts('Contact Jane Citizen at jane@example.com or 0412 345 678 by 15 March 2027. Fee: $1,250.00 (10%). See https://example.com/terms. Meeting with Acme Holdings on 2026-12-01.');
  assert.ok(f.dates.includes('15 March 2027'));
  assert.ok(f.dates.includes('2026-12-01'));
  assert.ok(f.amounts.includes('$1,250.00'));
  assert.ok(f.amounts.includes('10%'));
  assert.deepStrictEqual(f.emails, ['jane@example.com']);
  assert.ok(f.phones.some(p => p.replace(/\D/g, '') === '0412345678'));
  assert.deepStrictEqual(f.urls, ['https://example.com/terms']);
  assert.ok(f.names.includes('Jane Citizen'));
  assert.ok(f.names.includes('Acme Holdings'));
});

test('RAG prompt numbers sources and includes the question', () => {
  const { chunks, index } = lib();
  const p = K.ragPrompt('bond?', K.search(index, chunks, 'bond'));
  assert.ok(p.includes('[1] Lease.pdf (page 1)'));
  assert.ok(p.includes('QUESTION: bond?'));
});

test('library export/import round-trips and rejects other JSON', () => {
  const docs = [{ id: 'x', name: 'Note', type: 'note', added: '2026-11-08', pages: [{ page: 1, text: 'hi' }], extra: 1 }];
  const back = K.importLibrary(K.exportLibrary(docs));
  assert.deepStrictEqual(back, [{ id: 'x', name: 'Note', type: 'note', added: '2026-11-08', pages: [{ page: 1, text: 'hi' }] }]);
  assert.throws(() => K.importLibrary('{"foo":1}'), /not a Knowledge Brain/);
});

test('htmlToText strips tags, scripts and entities', () => {
  assert.strictEqual(K.htmlToText('<h1>Hi</h1><script>x()</script><p>A &amp; B</p>'), 'Hi\nA & B');
});
