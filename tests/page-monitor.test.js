const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const L = require('../apps/page-monitor/lib.js');

const CFG = { pages: [{ name: 'Home', url: 'https://example.com' }, { name: 'Prices', url: 'https://example.com/prices', ignore: '.ad, #clock\n.banner', threshold: 2 }, { name: 'bad', url: 'not a url' }], viewport: 'mobile', threshold: 0.5, schedule: 'daily', hour: 9, minute: 17, tzOffset: 660, tzName: 'Sydney time' };

test('normalise drops invalid URLs, splits ignore selectors, makes unique ids and clamps settings', () => {
  const c = L.normalise(CFG);
  assert.strictEqual(c.pages.length, 2);
  assert.deepStrictEqual(c.pages[1].ignore, ['.ad', '#clock', '.banner']);
  assert.strictEqual(c.pages[1].threshold, 2);
  assert.deepStrictEqual(c.viewport, { width: 390, height: 844 });
  const dup = L.normalise({ pages: [{ name: 'A', url: 'https://a.com' }, { name: 'A', url: 'https://b.com' }] });
  assert.deepStrictEqual(dup.pages.map((p) => p.id), ['a', 'a-2']);
  assert.strictEqual(L.normalise({ threshold: 500 }).threshold, 100);
  assert.strictEqual(L.normalise({}).threshold, 1);
  assert.strictEqual(L.normalise({ pages: [{ url: 'https://shop.com.au/' }] }).pages[0].name, 'shop.com.au');
});

test('cron converts local time to UTC, including day rollover for weekly/weekday schedules', () => {
  assert.deepStrictEqual(L.cron(CFG), { cron: '17 22 * * *', text: 'every day at 9:17 am Sydney time' });
  assert.strictEqual(L.cron({ schedule: 'weekly', weekday: 1, hour: 9, minute: 0, tzOffset: 600 }).cron, '0 23 * * 0'); // Mon 9am AEST = Sun 23:00 UTC
  assert.strictEqual(L.cron({ schedule: 'weekdays', hour: 8, minute: 30, tzOffset: 600 }).cron, '30 22 * * 0-4');
  assert.strictEqual(L.cron({ schedule: 'daily', hour: 18, minute: 0, tzOffset: -300 }).cron, '0 23 * * *');
  assert.strictEqual(L.cron({ schedule: 'daily', hour: 22, minute: 0, tzOffset: -300 }).cron, '0 3 * * *');
  assert.strictEqual(L.cron({ schedule: '6h', minute: 5 }).cron, '5 */6 * * *');
  assert.strictEqual(L.cron({ schedule: 'hourly', minute: 17 }).cron, '17 * * * *');
});

test('urls.json is valid JSON with settings and pages', () => {
  const j = JSON.parse(L.genUrlsJson(CFG));
  assert.deepStrictEqual(j.settings, { viewport: { width: 390, height: 844 }, fullPage: true, threshold: 0.5, alertOnTextChange: true, waitMs: 2000 });
  assert.deepStrictEqual(j.pages[1], { name: 'Prices', url: 'https://example.com/prices', ignore: ['.ad', '#clock', '.banner'], threshold: 2 });
});

test('workflow YAML has the expected keys, permissions, pinned versions and steps', () => {
  const y = L.genWorkflow(CFG);
  assert.ok(!/\t/.test(y), 'no tabs in YAML');
  y.split('\n').forEach((l) => assert.strictEqual((l.match(/^ */)[0].length) % 2, 0, 'odd indent: ' + l));
  ['name: Page monitor', 'on:', '  schedule:', "    - cron: '17 22 * * *'", '  workflow_dispatch:', 'permissions:', '  contents: write', '  issues: write', 'jobs:', '  check:', '    runs-on: ubuntu-latest', '    steps:']
    .forEach((k) => assert.ok(y.split('\n').includes(k), 'missing line: ' + k));
  assert.match(y, /uses: actions\/checkout@v4/);
  assert.match(y, /uses: actions\/setup-node@v4/);
  assert.match(y, /playwright@1\.48\.2 pixelmatch@5\.3\.0 pngjs@7\.0\.0/);
  assert.match(y, /npx playwright install --with-deps chromium/);
  assert.match(y, /run: node monitor\/monitor\.js/);
  assert.match(y, /if: steps\.check\.outputs\.changed == 'true'/);
  assert.match(y, /uses: actions\/github-script@v7/);
  assert.match(y, /git add monitor\/data/);
  assert.ok(!/secrets\./.test(y), 'only the built-in token is needed');
});

test('workflow YAML parses with a real YAML parser when Python + PyYAML are available', (t) => {
  const file = path.join(os.tmpdir(), 'bh-page-monitor-' + process.pid + '.yml');
  fs.writeFileSync(file, L.genWorkflow(CFG));
  let out;
  try { out = execFileSync('python3', ['-c', 'import yaml,sys,json; d=yaml.safe_load(open(sys.argv[1])); print(json.dumps({"on": d[True], "perm": d["permissions"], "steps": len(d["jobs"]["check"]["steps"])}))', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { t.skip('python3 with PyYAML not available'); return; } finally { fs.unlinkSync(file); }
  const d = JSON.parse(out);
  assert.deepStrictEqual(d.on.schedule, [{ cron: '17 22 * * *' }]);
  assert.deepStrictEqual(d.perm, { contents: 'write', issues: 'write' });
  assert.strictEqual(d.steps, 6);
});

test('generated monitor.js passes node --check and uses the expected APIs', () => {
  const js = L.genMonitorJs();
  const file = path.join(os.tmpdir(), 'bh-monitor-' + process.pid + '.js');
  fs.writeFileSync(file, js);
  try { execFileSync(process.execPath, ['--check', file]); } finally { fs.unlinkSync(file); }
  ['require(\'playwright\')', 'require(\'pngjs\')', 'require(\'pixelmatch\')', 'urls.json', 'GITHUB_OUTPUT', 'report.md', 'previous.png', 'current.png', 'diff.png', 'mask:', '__REPO__', '__COMMIT__']
    .forEach((k) => assert.ok(js.includes(k), 'missing ' + k));
});

test('the monitor\'s text line diff logic (extracted) counts added and removed lines', () => {
  const js = L.genMonitorJs();
  const src = js.slice(js.indexOf('function textLines'), js.indexOf('async function capture'));
  const fn = new Function(src + '; return { textLines, lineDiff };')();
  assert.deepStrictEqual(fn.textLines('  a  b \n\n c '), ['a b', 'c']);
  assert.deepStrictEqual(fn.lineDiff(['x', 'y', 'y'], ['y', 'z']), { added: ['z'], removed: ['x', 'y'] });
});

test('diffPixels finds changed pixels, percent and bounding box; tiny colour noise is ignored', () => {
  const w = 10, h = 10, a = new Uint8ClampedArray(w * h * 4).fill(255), b = new Uint8ClampedArray(a);
  for (let y = 2; y < 4; y++) for (let x = 5; x < 9; x++) { const i = (y * w + x) * 4; b[i] = 0; b[i + 1] = 0; b[i + 2] = 0; }
  b[0] = 253; // near-identical colour
  const r = L.diffPixels(a, b, w, h);
  assert.strictEqual(r.count, 8);
  assert.strictEqual(r.percent, 8);
  assert.deepStrictEqual(r.box, { x: 5, y: 2, w: 4, h: 2 });
  assert.strictEqual(L.diffPixels(a, a, w, h).count, 0);
  assert.strictEqual(L.diffPixels(a, a, w, h).box, null);
  assert.strictEqual(L.diffPixels(a, b, w, h, { threshold: 1 }).count, 0);
});

test('overlay marks changed pixels red and fades the rest', () => {
  const after = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]);
  const o = L.overlay(after, new Uint8Array([1, 0]), 2, 1);
  assert.deepStrictEqual(Array.from(o.slice(0, 4)), [230, 30, 30, 255]);
  assert.ok(o[4] > 180 && o[4] === o[5]);
});

test('slug and URL validation', () => {
  assert.strictEqual(L.slug('https://Shop.com.au/Sale Page!'), 'shop-com-au-sale-page');
  assert.ok(L.validUrl('https://a.com/x?y=1'));
  assert.ok(!L.validUrl('ftp://a.com') && !L.validUrl('a.com') && !L.validUrl(''));
});
