const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync, spawn } = require('child_process');
const L = require('../apps/price-watcher/lib.js');

// ---- saved HTML fixtures (trimmed versions of real-world page shapes) ----
const JSONLD = `<!doctype html><html><head><title>Drill</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"ToolBarn"},
 {"@type":"Product","name":"18V Drill Kit","sku":"D18","offers":{"@type":"Offer","price":"179.00","priceCurrency":"AUD","availability":"https://schema.org/InStock"}}]}
</script></head><body><div class="price">$999</div></body></html>`;
const JSONLD_AGG = `<script type='application/ld+json'>[{"@type":["Product"],"name":"Apron","offers":[{"@type":"AggregateOffer","lowPrice":62.5,"highPrice":70,"priceCurrency":"AUD"}]}]</script>`;
const JSONLD_SPEC = `<script type="application/ld+json">{"@type":"Product","offers":{"@type":"Offer","priceSpecification":{"@type":"UnitPriceSpecification","price":"1.299,95","priceCurrency":"EUR"}}}</script>`;
const META = `<html><head><meta property="product:price:amount" content="49.95"><meta property="product:price:currency" content="AUD"></head><body></body></html>`;
const ITEMPROP = `<div itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">Mug</h1><span itemprop="price">$24.<sup>50</sup></span><meta itemprop="priceCurrency" content="NZD"></div>`;
const SELECTOR = `<html><body>
<div class="product-card related"><span class="amount">$12.00</span></div>
<!-- <div class="product-price"><span class="amount">$1.00</span></div> -->
<div class="product-price main"><p>Now <span class="amount sale">$1,099.00</span> <s class="amount">$1,299.00</s></p></div>
<div id="price" data-price="62.00">Sixty-two dollars</div>
<input type="hidden" name="cost" value="77.70">
<script>var x = '<div class="product-price"><span class="amount">$5</span></div>';</script>
</body></html>`;

test('parsePrice handles currency symbols, thousands marks, European decimals and entities', () => {
  assert.strictEqual(L.parsePrice('$1,299.00'), 1299);
  assert.strictEqual(L.parsePrice('AU$ 49.95'), 49.95);
  assert.strictEqual(L.parsePrice('1.299,00 €'), 1299);
  assert.strictEqual(L.parsePrice('49,9'), 49.9);
  assert.strictEqual(L.parsePrice('Now $39 was $59'), 39);
  assert.strictEqual(L.parsePrice('&#36;19.95'), 19.95);
  assert.strictEqual(L.parsePrice(15), 15);
  assert.strictEqual(L.parsePrice("1'250.50 CHF"), 1250.5);
  assert.ok(isNaN(L.parsePrice('Call for price')));
});

test('JSON-LD: finds Product offers inside @graph, arrays, AggregateOffer and priceSpecification; skips broken JSON', () => {
  assert.deepStrictEqual(L.findJsonLdPrice(JSONLD), { price: 179, currency: 'AUD', method: 'json-ld' });
  assert.deepStrictEqual(L.findJsonLdPrice(JSONLD_AGG), { price: 62.5, currency: 'AUD', method: 'json-ld' });
  assert.deepStrictEqual(L.findJsonLdPrice(JSONLD_SPEC), { price: 1299.95, currency: 'EUR', method: 'json-ld' });
  assert.strictEqual(L.findJsonLdPrice('<script type="application/ld+json">{broken</script>'), null);
  assert.strictEqual(L.findJsonLdPrice('<p>no data</p>'), null);
});

test('meta / itemprop: Open Graph product price, and itemprop text with nested markup', () => {
  assert.deepStrictEqual(L.findMetaPrice(META), { price: 49.95, currency: 'AUD', method: 'meta' });
  const r = L.findMetaPrice(ITEMPROP);
  assert.strictEqual(r.currency, 'NZD');
  assert.strictEqual(r.price, 24.5);
});

test('selector engine: class chains, descendants, ids, attributes, @attr, ignores comments and scripts', () => {
  assert.strictEqual(L.selectText(SELECTOR, '.product-price .amount'), '$1,099.00');
  assert.strictEqual(L.selectText(SELECTOR, 'div.product-price.main s.amount'), '$1,299.00');
  assert.strictEqual(L.selectText(SELECTOR, '.product-card .amount'), '$12.00');
  assert.strictEqual(L.selectText(SELECTOR, '#price@data-price'), '62.00');
  assert.strictEqual(L.selectText(SELECTOR, '#price'), 'Sixty-two dollars');
  assert.strictEqual(L.selectText(SELECTOR, 'input[name=cost]'), '77.70');
  assert.strictEqual(L.selectText(SELECTOR, '[class*=card] span'), '$12.00');
  assert.strictEqual(L.selectText(SELECTOR, 'div > p > .sale'), '$1,099.00');
  assert.strictEqual(L.selectText(SELECTOR, '.nothing-here'), null);
  assert.throws(() => L.parseSelector('a:hover'), /Unsupported selector/);
});

test('extractPrice: selector first, then JSON-LD, then meta; null when nothing found', () => {
  assert.deepStrictEqual(L.extractPrice(SELECTOR, '.product-price .amount'), { price: 1099, currency: '', method: 'selector', text: '$1,099.00' });
  assert.strictEqual(L.extractPrice(JSONLD, '.missing').method, 'json-ld'); // selector misses -> structured data
  assert.strictEqual(L.extractPrice(JSONLD).price, 179); // JSON-LD beats the misleading .price text
  assert.strictEqual(L.extractPrice(META).method, 'meta');
  assert.strictEqual(L.extractPrice('<p>Sold out</p>'), null);
});

test('robots.txt: agent-specific groups, longest match wins, wildcards and $', () => {
  const robots = `User-agent: *\nDisallow: /checkout\nDisallow: /*?sort=\nAllow: /checkout/help$\n\nUser-agent: BadBot\nUser-agent: OtherBot\nDisallow: /\n`;
  assert.strictEqual(L.robotsAllowed(robots, '/products/drill', 'BrahaspatiPriceWatcher'), true);
  assert.strictEqual(L.robotsAllowed(robots, '/checkout/cart', 'BrahaspatiPriceWatcher'), false);
  assert.strictEqual(L.robotsAllowed(robots, '/checkout/help', 'BrahaspatiPriceWatcher'), true);
  assert.strictEqual(L.robotsAllowed(robots, '/c/drills?sort=price', 'BrahaspatiPriceWatcher'), false);
  assert.strictEqual(L.robotsAllowed(robots, '/products', 'OtherBot/2.0'), false);
  assert.strictEqual(L.robotsAllowed('User-agent: brahaspatipricewatcher\nDisallow: /\n', '/x', 'BrahaspatiPriceWatcher'), false);
  assert.strictEqual(L.robotsAllowed('', '/anything', 'x'), true);
});

test('config + workflow: valid products only, daily cron in UTC, permissions, no secrets, browser step only when needed', () => {
  const s = L.sample();
  const j = JSON.parse(L.genProductsJson(s.cfg));
  assert.strictEqual(j.products.length, 5);
  assert.strictEqual(j.settings.threshold, 2);
  assert.strictEqual(j.products[1].selector, '.product-price .amount');
  assert.strictEqual(L.normalise({ products: [{ url: 'nope' }] }).products.length, 0);
  const y = L.genWorkflow(s.cfg);
  assert.ok(!/\t/.test(y));
  y.split('\n').forEach((l) => assert.strictEqual(l.match(/^ */)[0].length % 2, 0, 'odd indent: ' + l));
  for (const k of ["    - cron: '23 21 * * *'", '  workflow_dispatch:', '  contents: write', '  issues: write', '        run: node watcher/watch.js', '          git add watcher/prices.csv'])
    assert.ok(y.split('\n').includes(k), 'missing ' + k);
  assert.ok(!/secrets\./.test(y));
  assert.ok(!/playwright/.test(y));
  assert.match(L.genWorkflow({ products: [{ url: 'https://a.com', useBrowser: true }] }), /playwright@1\.48\.2/);
  assert.strictEqual(L.cron({ schedule: 'twice', hour: 7, minute: 0, tzOffset: 600 }).cron, '0 21,9 * * *');
  assert.strictEqual(L.cron({ schedule: 'weekly', weekday: 1, hour: 7, minute: 0, tzOffset: 600 }).cron, '0 21 * * 0');
});

test('workflow YAML parses with a real YAML parser when Python + PyYAML are available', (t) => {
  const file = path.join(os.tmpdir(), 'bh-price-watcher-' + process.pid + '.yml');
  fs.writeFileSync(file, L.genWorkflow(L.sample().cfg));
  let out;
  try { out = execFileSync('python3', ['-c', 'import sys,yaml,json; d=yaml.safe_load(open(sys.argv[1])); print(json.dumps({"perm": d["permissions"], "steps": len(d["jobs"]["check"]["steps"]), "cron": d[True]["schedule"][0]["cron"]}))', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { t.skip('python3 with PyYAML not available'); return; } finally { fs.rmSync(file, { force: true }); }
  assert.deepStrictEqual(JSON.parse(out), { perm: { contents: 'write', issues: 'write' }, steps: 5, cron: '23 21 * * *' });
});

test('generated watch.js passes node --check and embeds the same parser', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-pw-'));
  const file = path.join(dir, 'watch.js');
  fs.writeFileSync(file, L.genWatchJs());
  execFileSync(process.execPath, ['--check', file]);
  const W = require(file);
  for (const [html, sel] of [[JSONLD], [META], [ITEMPROP], [SELECTOR, '.product-price .amount'], [SELECTOR, '#price@data-price']])
    assert.deepStrictEqual(W.extractPrice(html, sel), L.extractPrice(html, sel));
  assert.match(fs.readFileSync(file, 'utf8'), /BrahaspatiPriceWatcher\/1\.0 \(\+https:\/\/pawansinha0612\.github\.io/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('generated watch.js runs end to end against a local server: appends CSV, detects change, respects robots.txt', async () => {
  let drillPrice = '179.00', seenUA = '';
  const server = http.createServer((req, res) => {
    seenUA = req.headers['user-agent'] || seenUA;
    if (req.url === '/robots.txt') { res.end('User-agent: *\nDisallow: /private\n'); return; }
    if (req.url === '/drill') { res.setHeader('content-type', 'text/html'); res.end(JSONLD.replace('179.00', drillPrice)); return; }
    if (req.url === '/apron') { res.end(SELECTOR); return; }
    if (req.url === '/meta') { res.end(META); return; }
    if (req.url === '/private/x') { res.end(META); return; }
    if (req.url === '/empty') { res.end('<p>Sold out</p>'); return; }
    res.statusCode = 404; res.end('nope');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-pw-run-'));
  fs.writeFileSync(path.join(dir, 'watch.js'), L.genWatchJs());
  fs.writeFileSync(path.join(dir, 'products.json'), L.genProductsJson({ threshold: 1, products: [
    { name: 'Drill', url: base + '/drill', group: 'Drill', mine: true },
    { name: 'Apron, linen', url: base + '/apron', selector: '#price@data-price', group: 'Drill' },
    { name: 'Meta', url: base + '/meta' }, { name: 'Blocked', url: base + '/private/x' }, { name: 'Empty', url: base + '/empty' }, { name: 'Gone', url: base + '/404' }] }));
  const run = () => new Promise((resolve, reject) => {
    const out = fs.openSync(path.join(dir, 'out.txt'), 'w');
    const p = spawn(process.execPath, [path.join(dir, 'watch.js')], { env: Object.assign({}, process.env, { WATCHER_DELAY_MS: '0', GITHUB_OUTPUT: path.join(dir, 'gh-out') }), stdio: ['ignore', out, out] });
    p.on('exit', (code) => (code === 0 ? resolve(fs.readFileSync(path.join(dir, 'out.txt'), 'utf8')) : reject(new Error('exit ' + code + ': ' + fs.readFileSync(path.join(dir, 'out.txt'), 'utf8')))));
  });
  try {
    const log1 = await run();
    assert.match(log1, /OK +Drill: 179 AUD via json-ld/);
    assert.match(log1, /SKIPPED Blocked: robots\.txt/);
    assert.match(fs.readFileSync(path.join(dir, 'gh-out'), 'utf8'), /changed=false/);
    drillPrice = '159.00';
    const log2 = await run();
    assert.match(log2, /1 price change/);
    assert.match(fs.readFileSync(path.join(dir, 'gh-out'), 'utf8'), /changed=true/);
    const csv = fs.readFileSync(path.join(dir, 'prices.csv'), 'utf8').trim().split('\n');
    assert.strictEqual(csv[0], 'checked_at,product,group,mine,url,price,currency,method,status,note');
    assert.strictEqual(csv.length, 1 + 12);
    assert.ok(csv.some((l) => /,"Apron, linen",Drill,,.*,62,,selector,ok,/.test(l)), 'quoted name + selector row');
    assert.ok(csv.some((l) => /,Empty,.*,not-found,/.test(l)));
    assert.ok(csv.some((l) => /,Gone,.*,error,HTTP 404/.test(l)));
    const md = fs.readFileSync(path.join(dir, 'report.md'), 'utf8');
    assert.match(md, /\| \[Drill\]\(.*\) \(yours\) \| 179\.00 \| 159\.00 \| 🔻 -11\.2% \|/);
    assert.match(seenUA, /^BrahaspatiPriceWatcher\/1\.0/);
    // the browser analyser reads the same file
    const B = require('../assets/core.js');
    const a = L.analyse(B.csv.toObjects(fs.readFileSync(path.join(dir, 'prices.csv'), 'utf8')).rows);
    const drill = a.products.find((p) => p.name === 'Drill');
    assert.deepStrictEqual([drill.first, drill.latest, drill.mine, drill.changes], [179, 159, true, 1]);
  } finally { server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('analyse: min/avg/max, change log, your price vs competitors and undercut alerts', () => {
  const s = L.sample();
  const a = L.analyse(s.rows);
  const tb = a.products.find((p) => p.name === 'ToolBarn drill kit');
  assert.deepStrictEqual([tb.min, tb.max, tb.first, tb.latest, tb.changes], [179, 209, 209, 179, 2]);
  const hh = a.products.find((p) => p.name === 'HardwareHub drill kit');
  assert.strictEqual(hh.errors, 1);
  assert.strictEqual(hh.count, 67);
  const g = a.compare.find((c) => c.group === '18V drill kit');
  assert.strictEqual(g.mine.name, 'Our 18V drill kit');
  assert.strictEqual(g.cheapest.name, 'ToolBarn drill kit');
  assert.strictEqual(g.position, 2); // one competitor cheaper than us
  assert.deepStrictEqual(a.undercuts.map((u) => [u.competitor, u.diff]), [['ToolBarn drill kit', 10]]);
  assert.ok(a.changes[0].t >= a.changes[a.changes.length - 1].t, 'newest first');
  const series = L.chartSeries(a.products);
  assert.strictEqual(series.find((x) => x.name === 'Our linen apron').points.length, 68);
});

test('rawUrl converts GitHub file links to raw links', () => {
  assert.strictEqual(L.rawUrl('https://github.com/me/prices/blob/main/watcher/prices.csv'), 'https://raw.githubusercontent.com/me/prices/main/watcher/prices.csv');
  assert.strictEqual(L.rawUrl('https://raw.githubusercontent.com/me/p/main/x.csv'), 'https://raw.githubusercontent.com/me/p/main/x.csv');
});
