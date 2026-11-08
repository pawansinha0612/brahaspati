const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const L = require('../apps/store-builder/lib.js');

test('crc32 matches the standard check values', () => {
  assert.strictEqual(L.crc32(L.utf8('The quick brown fox jumps over the lazy dog')), 0x414FA339);
  assert.strictEqual(L.crc32(L.utf8('123456789')), 0xCBF43926);
  assert.strictEqual(L.crc32(new Uint8Array(0)), 0);
});

test('base64 and data URLs decode to the original bytes', () => {
  const bytes = Uint8Array.from([0, 1, 2, 250, 255, 128, 64]);
  const b64 = Buffer.from(bytes).toString('base64');
  assert.deepStrictEqual(Array.from(L.b64ToBytes(b64)), Array.from(bytes));
  for (const s of ['a', 'ab', 'abc', 'abcd', 'hello world!']) assert.strictEqual(Buffer.from(L.b64ToBytes(Buffer.from(s).toString('base64'))).toString(), s);
  const d = L.dataUrlToBytes('data:image/png;base64,' + b64);
  assert.deepStrictEqual([d.mime, d.ext, d.bytes.length], ['image/png', 'png', 7]);
  assert.strictEqual(Buffer.from(L.dataUrlToBytes('data:text/plain,hi%20there').bytes).toString(), 'hi there');
  assert.strictEqual(L.dataUrlToBytes('https://x'), null);
});

test('zip writer: our reader and Python\'s zipfile both read it back byte for byte (UTF-8 names, binary data, folders)', (t) => {
  const bin = new Uint8Array(70000); for (let i = 0; i < bin.length; i++) bin[i] = (i * 31) & 255;
  const files = [{ name: 'index.html', data: '<h1>Café ☕</h1>' }, { name: 'images/photo.jpg', data: bin }, { name: 'README.txt', data: '' }, { name: 'notes/über.txt', data: 'ü' }];
  const z = L.zip(files, new Date(2026, 10, 8, 14, 30, 10));
  assert.strictEqual(z[0], 0x50); assert.strictEqual(z[1], 0x4b);
  const back = L.unzip(z);
  assert.deepStrictEqual(back.map((f) => f.name), files.map((f) => f.name));
  assert.strictEqual(Buffer.from(back[0].data).toString(), '<h1>Café ☕</h1>');
  assert.deepStrictEqual(Buffer.compare(Buffer.from(back[1].data), Buffer.from(bin)), 0);
  const file = path.join(os.tmpdir(), 'bh-store-' + process.pid + '.zip');
  fs.writeFileSync(file, z);
  let out;
  try { out = execFileSync('python3', ['-c', 'import sys,zipfile,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps([[i.filename,i.file_size,i.compress_type,list(i.date_time)] for i in z.infolist()]+[z.read("index.html").decode()]))', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { if (/No such file|ENOENT/.test(String(e))) { t.skip('python3 not available'); return; } throw e; } finally { fs.rmSync(file, { force: true }); }
  const j = JSON.parse(out);
  assert.deepStrictEqual(j[0], ['index.html', Buffer.byteLength('<h1>Café ☕</h1>'), 0, [2026, 11, 8, 14, 30, 10]]);
  assert.deepStrictEqual(j[1].slice(0, 2), ['images/photo.jpg', 70000]);
  assert.strictEqual(j[3][0], 'notes/über.txt');
  assert.strictEqual(j[4], '<h1>Café ☕</h1>');
});

test('the system unzip tool accepts the archive when available', (t) => {
  const file = path.join(os.tmpdir(), 'bh-store-u-' + process.pid + '.zip');
  fs.writeFileSync(file, L.zip([{ name: 'a.txt', data: 'hello' }, { name: 'dir/b.bin', data: new Uint8Array([1, 2, 3]) }]));
  try { const out = execFileSync('unzip', ['-t', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); assert.match(out, /No errors detected/); }
  catch (e) { if (e.code === 'ENOENT') t.skip('unzip not installed'); else throw e; } finally { fs.rmSync(file, { force: true }); }
});

test('safeUrl allows only http(s) and mailto; colours are validated and button text keeps contrast', () => {
  assert.strictEqual(L.safeUrl('javascript:alert(1)'), '');
  assert.strictEqual(L.safeUrl(' https://gum.co/x '), 'https://gum.co/x');
  assert.strictEqual(L.safeUrl('mailto:a@b.com'), 'mailto:a@b.com');
  assert.strictEqual(L.hex('#ABC', '#000000'), '#aabbcc');
  assert.strictEqual(L.hex('red', '#000000'), '#000000');
  assert.strictEqual(L.inkFor('#ffeb3b'), '#111111');
  assert.strictEqual(L.inkFor('#1f6f5c'), '#ffffff');
  assert.ok(L.contrast('#000000', '#ffffff') > 20);
  assert.deepStrictEqual(['https://x.gumroad.com/l/a', 'https://shop.lemonsqueezy.com/checkout/buy/1', 'https://buy.stripe.com/abc', 'https://paypal.me/me', 'https://example.com'].map(L.provider), ['Gumroad', 'Lemon Squeezy', 'Stripe', 'PayPal', '']);
});

test('buildHtml: escapes everything, drops unsafe links, includes SEO meta and valid Product JSON-LD', () => {
  const store = L.sample();
  store.products.push({ title: '<script>alert(1)</script> Hack', description: '"quotes" & <b>', price: 5, buyLink: 'javascript:alert(1)' });
  const html = L.buildHtml(store);
  assert.ok(!/<script>alert/.test(html), 'title escaped');
  assert.ok(!/javascript:/.test(html), 'unsafe link removed');
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; Hack/);
  assert.match(html, /<title>Tidy Desk Templates — spreadsheets and planners for sole traders<\/title>/);
  assert.match(html, /<meta name="description" content="Invoice trackers, BAS checklists/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.github\.io\/tidy-desk\/">/);
  assert.match(html, /<meta property="og:title"/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.strictEqual(ld['@type'], 'ItemList');
  const first = ld.itemListElement[0].item;
  assert.deepStrictEqual([first['@type'], first.name, first.offers.price, first.offers.priceCurrency, first.offers.availability], ['Product', 'Invoice & Payment Tracker', '19.00', 'AUD', 'https://schema.org/InStock']);
  assert.strictEqual(first.url, 'https://example.github.io/tidy-desk/#invoice-payment-tracker');
  assert.ok(!('image' in first), 'data URL images are not put in JSON-LD');
  assert.match(html, /Get it free/);
  assert.match(html, /Secure checkout via Gumroad/);
  assert.match(html, /<span class="was">\$29\.00<\/span>/);
  assert.match(html, /data-cat="Guides"/);
  assert.match(html, /<details><summary>How do I get my files\?<\/summary>/);
});

test('JSON-LD cannot break out of its script tag', () => {
  const html = L.buildHtml({ name: '</script><script>x()</script>', products: [{ title: 'A</script>', price: 1, buyLink: 'https://a.com' }] });
  const blocks = html.match(/<script[\s\S]*?<\/script>/g);
  assert.strictEqual(blocks.length, 1);
  assert.match(blocks[0], /\\u003c\/script>/);
});

test('templates change the CSS but not the content', () => {
  const s = L.sample();
  const html = {}; for (const t of Object.keys(L.TEMPLATES)) html[t] = L.buildHtml(Object.assign({}, s, { template: t }));
  assert.match(html.bold, /header\.top\{background:var\(--p\)/);
  assert.match(html.catalogue, /\.grid\{grid-template-columns:1fr/);
  assert.doesNotMatch(html.minimal, /grid-template-columns:1fr;gap:12px/);
  const strip = (h) => h.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<p style="margin-top:18px"><a class="btn" href="#products">Browse the shop<\/a><\/p>/, '');
  assert.strictEqual(strip(html.minimal), strip(html.catalogue));
  assert.match(html.minimal, /--pi:#ffffff/);
});

test('buildPackage zip: images become files with unique names, HTML points at them, README included', () => {
  const s = L.sample();
  s.products[1].image = s.products[0].image; // the same picture twice -> stored once
  s.logo = 'data:image/png;base64,' + Buffer.from([137, 80, 78, 71]).toString('base64');
  const pkg = L.buildPackage(s, 'zip');
  const names = pkg.files.map((f) => f.name);
  assert.deepStrictEqual(names, ['index.html', 'images/logo.png', 'images/invoice-payment-tracker.svg', 'images/90-day-content-planner.svg', 'images/pricing-your-services-guide.svg', 'README.txt']);
  assert.ok(!/src="data:/.test(pkg.html));
  assert.match(pkg.html, /<img class="logo" src="images\/logo\.png"/);
  assert.strictEqual((pkg.html.match(/images\/invoice-payment-tracker\.svg/g) || []).length, 2);
  const back = L.unzip(pkg.zip);
  assert.strictEqual(back.length, 6);
  assert.match(Buffer.from(back[5].data).toString(), /Netlify Drop/);
  const single = L.buildPackage(s, 'html');
  assert.match(single.html, /src="data:image\/svg\+xml;base64,/);
});

test('checks warn about missing links, prices, images and unreadable colours', () => {
  const w = L.checks({ name: 'X', primary: '#ffffff', background: '#ffffff', text: '#eeeeee', products: [{ title: 'Guide', buyLink: 'ftp://x' }] });
  const m = w.map((x) => x.level + ' ' + x.msg).join('\n');
  assert.match(m, /bad “Guide” has no buy link/);
  assert.match(m, /warn “Guide” has no price/);
  assert.match(m, /warn “Guide” has no image/);
  assert.match(m, /bad Text colour and background are too similar/);
  assert.strictEqual(L.checks(L.sample()).filter((x) => x.level !== 'info').length, 0);
});
