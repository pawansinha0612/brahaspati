const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/site-health/lib.js');
const SAMPLE = require('../apps/site-health/sample.js');

const r = L.transform(SAMPLE.psi);

test('normaliseUrl adds https and rejects private or invalid addresses', () => {
  assert.strictEqual(L.normaliseUrl('example.com.au').url, 'https://example.com.au/');
  assert.strictEqual(L.normaliseUrl(' http://shop.example/path?q=1 ').url, 'http://shop.example/path?q=1');
  assert.match(L.normaliseUrl('localhost:3000').error, /public/);
  assert.match(L.normaliseUrl('http://192.168.1.10/').error, /public/);
  assert.match(L.normaliseUrl('ftp://example.com').error, /http/);
  assert.ok(L.normaliseUrl('').error);
});

test('psiUrl asks for all four categories, the strategy and an optional key', () => {
  const u = L.psiUrl('https://example.com/', 'desktop', 'AIza x');
  assert.ok(u.startsWith('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https%3A%2F%2Fexample.com%2F'));
  for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) assert.ok(u.includes('&category=' + c));
  assert.ok(u.includes('&strategy=desktop') && u.endsWith('&key=AIza%20x'));
  assert.ok(L.psiUrl('https://example.com/', 'x').includes('strategy=mobile') && !L.psiUrl('https://example.com/').includes('key='));
});

test('transform: category scores with ratings', () => {
  assert.deepStrictEqual(r.scores.map((s) => [s.id, s.score, s.rating]), [
    ['performance', 38, 'poor'], ['accessibility', 79, 'needs-work'], ['best-practices', 78, 'needs-work'], ['seo', 83, 'needs-work']]);
  assert.strictEqual(r.url, 'https://www.harbourcafe.example/');
  assert.strictEqual(r.strategy, 'mobile');
});

test('transform: Core Web Vitals from lab and field data with thresholds', () => {
  const v = Object.fromEntries(r.vitals.map((x) => [x.key, x]));
  assert.strictEqual(v.LCP.labText, '7.1 s'); assert.strictEqual(v.LCP.labRating, 'poor');
  assert.strictEqual(v.LCP.fieldText, '3.6 s'); assert.strictEqual(v.LCP.fieldRating, 'needs-work');
  assert.strictEqual(v.CLS.lab, 0.162); assert.strictEqual(v.CLS.labRating, 'needs-work');
  assert.strictEqual(v.CLS.field, 0.14); // CrUX reports CLS x 100
  assert.strictEqual(v.INP.lab, null); assert.strictEqual(v.INP.fieldText, '168 ms'); assert.strictEqual(v.INP.fieldRating, 'good');
  assert.strictEqual(v.TBT.labRating, 'needs-work');
  assert.strictEqual(v.FCP.labRating, 'poor');
  assert.strictEqual(r.field.scope, 'This page');
  assert.strictEqual(r.field.overall, 'AVERAGE');
});

test('transform: failed audits per category, sorted by impact, skipping metrics, passes and n/a', () => {
  const perf = r.failed.performance.map((f) => f.id);
  assert.strictEqual(perf[0], 'image-delivery-insight'); // biggest LCP saving
  assert.ok(perf.includes('render-blocking-insight') && perf.includes('unused-javascript') && perf.includes('cls-culprits-insight'));
  assert.ok(!perf.includes('largest-contentful-paint'), 'metrics are shown as vitals, not failures');
  assert.ok(!perf.includes('font-display-insight') && !perf.includes('third-parties-insight') && !perf.includes('interactive'));
  assert.strictEqual(r.failed.performance.find((f) => f.id === 'cache-insight').impact, 'low');
  assert.deepStrictEqual(r.failed.accessibility.map((f) => f.id), ['image-alt', 'color-contrast', 'link-name', 'target-size', 'heading-order']);
  assert.strictEqual(r.failed.accessibility[0].impact, 'high');
  assert.deepStrictEqual(r.failed.seo.map((f) => f.id).sort(), ['image-alt', 'link-text', 'meta-description']);
  assert.strictEqual(r.failed.seo[0].impact, 'medium');
  assert.strictEqual(r.failed['best-practices'][0].impact, 'low');
  assert.ok(!r.failed.seo.some((f) => f.id === 'hreflang' || f.id === 'structured-data'));
  assert.strictEqual(r.failedCount, 7 + 5 + 2 + 3);
});

test('transform: plain-English fixes, including -insight ids and description fallback', () => {
  const img = r.failed.performance.find((f) => f.id === 'image-delivery-insight');
  assert.match(img.fix, /WebP/);
  assert.match(r.failed.seo.find((f) => f.id === 'meta-description').fix, /120–155 characters/);
  assert.strictEqual(L.fixFor({ id: 'something-new', description: 'Do [this thing](https://x.y) with `code`.' }), 'Do this thing with code.');
  assert.strictEqual(r.top.length, 5);
  assert.ok(r.top.every((t) => t.impact === 'high'), JSON.stringify(r.top.map((t) => t.id + ':' + t.impact)));
});

test('transform: SEO checklist includes passes, hides n/a and manual checks', () => {
  const seo = r.checklists.seo;
  assert.strictEqual(seo[0].passed, false);
  assert.ok(seo.some((c) => c.id === 'canonical' && c.passed === true));
  assert.ok(!seo.some((c) => c.id === 'hreflang' || c.id === 'structured-data'));
});

test('transform throws a readable error for PSI error bodies; friendlyError explains quotas', () => {
  assert.throws(() => L.transform({ error: { code: 500, message: 'Lighthouse returned error: NO_FCP' } }), /NO_FCP/);
  const daily = { error: { code: 429, message: "Quota exceeded for quota metric 'Queries' and limit 'Queries per day' of service 'pagespeedonline.googleapis.com'" } };
  assert.match(L.friendlyError(429, daily), /own free API key/);
  assert.match(L.friendlyError(429, { error: { message: 'Rate Limit Exceeded' } }), /busy/);
  assert.match(L.friendlyError(500, { error: { message: 'Lighthouse returned error: FAILED_DOCUMENT_REQUEST' } }), /could not load/);
});

test('parseHeaders keeps the last response after redirects; gradeHeaders grades each header', () => {
  const p = L.parseHeaders(SAMPLE.headers);
  assert.strictEqual(p.status, 200); assert.strictEqual(p.redirects, 1);
  assert.strictEqual(p.headers['x-frame-options'], 'SAMEORIGIN');
  const g = L.gradeHeaders(p);
  const by = Object.fromEntries(g.checks.map((c) => [c.name.split(' ')[0], c.status]));
  assert.strictEqual(by['Strict-Transport-Security'], 'warn'); // max-age 1 day
  assert.strictEqual(by['Content-Security-Policy'], 'warn'); // unsafe-inline
  assert.strictEqual(by['X-Content-Type-Options'], 'bad');
  assert.strictEqual(by['Clickjacking'], 'ok');
  assert.strictEqual(by['Referrer-Policy'], 'warn');
  assert.strictEqual(by['Permissions-Policy'], 'warn');
  assert.strictEqual(by['Version'], 'warn'); // Apache/2.4.41, PHP/7.4.3
  assert.strictEqual(g.grade, 'D');
});

test('gradeHeaders gives an A to a well-configured site and handles frame-ancestors', () => {
  const good = 'HTTP/2 200\r\nStrict-Transport-Security: max-age=63072000; includeSubDomains; preload\r\nContent-Security-Policy: default-src \'self\'; script-src \'self\' \'nonce-abc\' \'strict-dynamic\'; frame-ancestors \'none\'\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: strict-origin-when-cross-origin\r\nPermissions-Policy: camera=(), geolocation=()\r\nServer: cloudflare\r\n';
  const g = L.gradeHeaders(L.parseHeaders(good));
  assert.strictEqual(g.grade, 'A');
  assert.ok(g.checks.every((c) => c.status === 'ok'), JSON.stringify(g.checks));
  assert.ok(L.gradeHeaders(L.parseHeaders('')).empty);
  assert.strictEqual(L.gradeHeaders(L.parseHeaders('x-content-type-options: nosniff')).checks[0].status, 'bad');
});

test('extractLinks resolves relative links, de-duplicates and skips mailto/tel/javascript/#', () => {
  const links = L.extractLinks(SAMPLE.html, SAMPLE.url);
  const urls = links.map((l) => l.url);
  assert.ok(urls.includes('https://www.harbourcafe.example/menu/'));
  assert.ok(urls.includes('https://www.harbourcafe.example/catering'));
  assert.ok(urls.includes('https://www.harbourcafe.example/contact')); // #map removed
  assert.ok(urls.includes('https://www.harbourcafe.example/uploads/hero-latte.jpg'));
  assert.ok(urls.includes('https://www.harbourcafe.example/wp-content/themes/cafe/style.css'));
  assert.strictEqual(urls.filter((u) => u.endsWith('/menu/')).length, 1);
  assert.ok(!urls.some((u) => /mailto|tel:|javascript/.test(u)));
  assert.strictEqual(links.find((l) => l.url.includes('ubereats')).kind, 'external');
  assert.strictEqual(links.find((l) => l.url.endsWith('/menu/')).text, 'Menu');
  // links after an <img> are not swallowed
  assert.ok(L.extractLinks('<img src="a.png"><a href="/b">B</a></a>', 'https://x.example/').some((l) => l.url === 'https://x.example/b'));
});

test('URL list parsing, link-check script and report HTML', () => {
  assert.deepStrictEqual(L.parseUrlList('https://a.example/x, <https://b.example/y>\nnot a url\nhttps://a.example/x'), ['https://a.example/x', 'https://b.example/y']);
  const sh = L.linkCheckScript(["https://a.example/it's"]);
  assert.match(sh, /curl -s -o \/dev\/null -L/);
  assert.ok(sh.includes("'https://a.example/it'\\''s'"));
  assert.match(L.linkCheckWorkflow('https://a.example/'), /lycheeverse\/lychee-action@v2/);
  assert.strictEqual(L.curlHeadersCmd('https://a.example/'), "curl -sIL 'https://a.example/'");
  const html = L.reportHtml(r, { headers: L.gradeHeaders(L.parseHeaders(SAMPLE.headers)), links: L.extractLinks(SAMPLE.html, SAMPLE.url), sample: true });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.match(html, /Fix these first/);
  assert.match(html, /Security headers: grade D/);
  assert.match(html, /EXAMPLE DATA/);
  assert.ok(!/<img/.test(html.replace(/<img[^>]*src="data/g, '')), 'report must not embed remote images');
});

test('sample fixture stays small', () => {
  const size = require('fs').statSync(require('path').join(__dirname, '..', 'apps', 'site-health', 'sample.js')).size;
  assert.ok(size < 30 * 1024, size + ' bytes');
});
