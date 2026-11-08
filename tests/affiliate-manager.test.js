const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync, spawn } = require('child_process');
const L = require('../apps/affiliate-manager/lib.js');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ' expected ' + b + ' got ' + a);
const DATA = {
  programs: [{ id: 'p1', name: 'Shop A', payoutThreshold: 100 }, { id: 'p2', name: 'Shop B', payoutThreshold: 0 }],
  links: [{ id: 'a', programId: 'p1', shortName: 'mic', product: 'Mic', affiliateUrl: 'https://a.com/mic?tag=x' }, { id: 'b', programId: 'p1', shortName: 'light', product: 'Light' }, { id: 'c', programId: 'p2', shortName: 'course', product: 'Course' }],
  content: [{ id: 'k1', title: 'Gear post', linkIds: ['a', 'b'], type: 'post', disclosed: true }, { id: 'k2', title: 'Course video', linkIds: ['c', 'a'], type: 'video' }],
  stats: [
    { linkId: 'a', month: '2026-09', clicks: 100, conversions: 5, sales: 500, commission: 20, status: 'paid' },
    { linkId: 'a', month: '2026-10', clicks: 200, conversions: 10, sales: 1000, commission: 40, status: 'approved' },
    { linkId: 'b', month: '2026-10', clicks: 50, conversions: 0, sales: 0, commission: 0, status: 'pending' },
    { linkId: 'c', month: '2026-10', clicks: 40, conversions: 4, sales: 400, commission: 120, status: 'approved' },
    { linkId: 'c', month: '2026-11', clicks: 30, conversions: 1, sales: 100, commission: 30, status: 'rejected' },
    { linkId: 'zzz', month: '2026-11', clicks: 999, commission: 999 }
  ]
};

test('month normalises the usual date formats', () => {
  assert.deepStrictEqual(['2026-11', '2026-11-08', '08/11/2026', '11/2026', 'Nov 2026', 'November 2026', 'junk'].map(L.month), ['2026-11', '2026-11', '2026-11', '2026-11', '2026-11', '2026-11', '']);
  assert.strictEqual(L.addMonths('2026-11', 3), '2027-02');
  assert.strictEqual(L.addMonths('2026-01', -1), '2025-12');
});

test('buildUtm adds, replaces and slugs UTM tags while keeping other params and the #hash', () => {
  assert.strictEqual(L.buildUtm('https://shop.com/p?id=7&utm_source=old#reviews', { source: 'My Blog', medium: 'affiliate', campaign: 'Black Friday 2026' }),
    'https://shop.com/p?id=7&utm_source=my-blog&utm_medium=affiliate&utm_campaign=black-friday-2026#reviews');
  assert.strictEqual(L.buildUtm('https://shop.com/', {}), 'https://shop.com/');
  assert.strictEqual(L.buildUtm('not a url', { source: 'x' }), 'not a url');
  assert.strictEqual(L.hostOf('https://www.Amazon.com.au/dp/1'), 'amazon.com.au');
});

test('report: totals per link with EPC and conversion rate; rejected commission excluded; unknown links ignored', () => {
  const r = L.report(DATA);
  const a = r.links.find((x) => x.link.id === 'a');
  assert.deepStrictEqual([a.clicks, a.conversions, a.commission, a.paid, a.approved], [300, 15, 60, 20, 40]);
  near(a.epc, 0.2); near(a.cr, 0.05);
  const c = r.links.find((x) => x.link.id === 'c');
  assert.deepStrictEqual([c.commission, c.rejected, c.unpaid], [120, 30, 120]);
  assert.deepStrictEqual([r.total.clicks, r.total.commission, r.total.pending, r.total.approved, r.total.paid], [420, 180, 0, 160, 20]);
  assert.ok(isNaN(L.report({ links: [{ id: 'x' }] }).links[0].epc), 'no clicks -> no EPC');
});

test('report: date range filter and monthly series', () => {
  const r = L.report(DATA, '2026-10', '2026-10');
  assert.strictEqual(r.total.clicks, 290);
  assert.deepStrictEqual(r.months.map((m) => m.month), ['2026-10']);
  assert.deepStrictEqual(L.report(DATA).months.map((m) => [m.month, m.commission]), [['2026-09', 20], ['2026-10', 160], ['2026-11', 0]]);
});

test('programs: payout threshold uses all approved-but-unpaid commission', () => {
  const r = L.report(DATA, '2026-11', '2026-11');
  const p1 = r.programs.find((p) => p.program.id === 'p1'), p2 = r.programs.find((p) => p.program.id === 'p2');
  assert.deepStrictEqual([p1.approvedAllTime, p1.toThreshold, p1.payoutDue, p1.links], [40, 60, false, 2]);
  assert.deepStrictEqual([p2.approvedAllTime, p2.payoutDue], [120, true]);
});

test('content pieces add up the links they use', () => {
  const r = L.report(DATA);
  const post = r.content.find((c) => c.content.id === 'k1');
  assert.deepStrictEqual([post.clicks, post.commission, post.linkCount], [350, 60, 2]);
  near(post.epc, 60 / 350);
});

test('best performers by commission and by EPC (with a minimum click count), and links with clicks but no sales', () => {
  const b = L.best(L.report(DATA).links, 45);
  assert.deepStrictEqual(b.byCommission.map((l) => l.link.id), ['c', 'a']);
  assert.deepStrictEqual(b.byEpc.map((l) => l.link.id), ['c', 'a', 'b']);
  assert.deepStrictEqual(L.best(L.report(DATA).links, 100).byEpc.map((l) => l.link.id), ['a'], 'c (70 clicks) and b (50) are below 100 clicks');
  assert.deepStrictEqual(b.noSales.map((l) => l.link.id), ['b']);
});

test('recheck reminders: broken, never/long-ago checked, unused links, old content, missing disclosure', () => {
  const d = { links: [{ id: '1', shortName: 'old', lastChecked: '2026-01-01' }, { id: '2', shortName: 'new', lastChecked: '2026-11-01' }, { id: '3', shortName: 'never' }, { id: '4', shortName: 'dead', status: 'broken', lastChecked: '2026-11-01' }],
    content: [{ id: 'c', title: 'Old post', publishDate: '2025-01-01', linkIds: ['1', '2', '4'], type: 'post', disclosed: false }, { id: 'e', title: 'Email', type: 'email', linkIds: ['3'] }] };
  const r = L.recheck(d, '2026-11-08', 90);
  const s = r.map((x) => x.level + ':' + x.name + ':' + x.why).join('\n');
  assert.match(r[0].level + r[0].name, /baddead/);
  assert.match(s, /warn:old:Last checked 311 days ago/);
  assert.match(s, /warn:never:Never checked/);
  assert.doesNotMatch(s, /:new:/);
  assert.match(s, /warn:Old post:No affiliate disclosure/);
  assert.match(s, /info:Old post:Published over a year ago/);
  assert.doesNotMatch(s, /Email:No affiliate disclosure/, 'emails carry their own disclosure line');
});

test('importStats matches links by short name / URL / product, maps statuses, and updates the same month', () => {
  const rows = [
    { Link: 'MIC', Date: '2026-10-31', Clicks: '210', Orders: '11', Revenue: '$1,100.00', Earnings: '44.00', Status: 'Approved' },
    { 'Short name': 'course', Month: 'Nov 2026', Clicks: 10, Conversions: 2, Commission: 60, Status: 'Locked' },
    { Product: 'Light', Month: '2026-11', Clicks: 5, Commission: 0, Status: 'Reversed' },
    { Link: 'unknown-thing', Month: '2026-11', Clicks: 1 }
  ];
  const r = L.importStats(rows, DATA.links, DATA.stats.slice(0, 2).map((s) => Object.assign({}, s)));
  assert.deepStrictEqual([r.added, r.updated, r.unmatched], [2, 1, ['unknown-thing']]);
  const oct = r.stats.find((s) => s.linkId === 'a' && s.month === '2026-10');
  assert.deepStrictEqual([oct.clicks, oct.conversions, oct.sales, oct.commission, oct.status], [210, 11, 1100, 44, 'approved']);
  assert.strictEqual(r.stats.find((s) => s.linkId === 'c').status, 'approved');
  assert.strictEqual(r.stats.find((s) => s.linkId === 'b').status, 'rejected');
});

test('disclosure text exists for each content type and says "affiliate"', () => {
  for (const k of ['post', 'video', 'email', 'social', 'short']) assert.match(L.disclosure(k), /affiliate/i);
  assert.match(L.disclosure('social'), /^#ad/);
});

test('.ics reminder is RFC 5545 shaped: CRLF, escaped text, all-day, monthly rule, lines folded', () => {
  const t = L.ics({ date: '2026-12-01', title: 'Recheck links; Shop A, Shop B', description: 'Line one\nLine two ' + 'x'.repeat(100), monthly: true, stamp: '20261108T000000Z' });
  assert.ok(t.endsWith('\r\n'));
  assert.ok(!/[^\r]\n/.test(t), 'only CRLF line endings');
  assert.match(t, /DTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261202/);
  assert.match(t, /RRULE:FREQ=MONTHLY/);
  assert.match(t, /SUMMARY:Recheck links\\; Shop A\\, Shop B/);
  assert.match(t, /Line one\\nLine two/);
  t.split('\r\n').forEach((l) => assert.ok(l.length <= 75, 'line too long: ' + l.length));
});

test('link checker: links.json, workflow and script are valid; script runs against a local server', async () => {
  const links = [{ shortName: 'ok', originalUrl: 'https://shop.test/p', affiliateUrl: 'https://aff.test/x' }, { shortName: 'nourl', affiliateUrl: '' }];
  const j = JSON.parse(L.genLinksJson(links));
  assert.deepStrictEqual(j.links, [{ name: 'ok', url: 'https://aff.test/x', expectHost: 'shop.test' }]);
  const y = L.genCheckerWorkflow();
  assert.ok(y.split('\n').includes('  issues: write'));
  y.split('\n').forEach((l) => assert.strictEqual(l.match(/^ */)[0].length % 2, 0, l));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-aff-'));
  fs.writeFileSync(path.join(dir, 'check-links.js'), L.genCheckerJs());
  execFileSync(process.execPath, ['--check', path.join(dir, 'check-links.js')]);
  const server = http.createServer((req, res) => {
    const base = 'http://127.0.0.1:' + server.address().port;
    if (req.url === '/go/good') { res.writeHead(302, { location: base + '/product/1' }); return res.end(); }
    if (req.url === '/go/gone') { res.writeHead(301, { location: '/' }); return res.end(); }
    if (req.url === '/product/1' || req.url === '/') return res.end('<h1>ok</h1>');
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  fs.writeFileSync(path.join(dir, 'links.json'), JSON.stringify({ links: [{ name: 'good', url: base + '/go/good', expectHost: '127.0.0.1' }, { name: 'gone', url: base + '/go/gone', expectHost: '127.0.0.1' }, { name: 'missing', url: base + '/nope' }] }));
  const out = await new Promise((resolve, reject) => {
    let o = ''; const p = spawn(process.execPath, [path.join(dir, 'check-links.js')], { env: Object.assign({}, process.env, { CHECKER_DELAY_MS: '0', GITHUB_OUTPUT: path.join(dir, 'gh') }) });
    p.stdout.on('data', (d) => (o += d)); p.stderr.on('data', (d) => (o += d)); p.on('exit', (c) => (c === 0 ? resolve(o) : reject(new Error(o))));
  });
  server.close();
  assert.match(out, /OK +good/);
  assert.match(out, /PROBLEM gone: landed on the home page/);
  assert.match(out, /PROBLEM missing: HTTP 404/);
  assert.match(fs.readFileSync(path.join(dir, 'gh'), 'utf8'), /broken=true/);
  assert.match(fs.readFileSync(path.join(dir, 'link-report.md'), 'utf8'), /2 of 3 links need attention/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('sample data is consistent: every stat points at a link, every link at a program', () => {
  const d = L.sample('2026-11-08');
  const ids = new Set(d.links.map((l) => l.id)), progs = new Set(d.programs.map((p) => p.id));
  assert.ok(d.stats.every((s) => ids.has(s.linkId)));
  assert.ok(d.links.every((l) => progs.has(l.programId)));
  assert.strictEqual(new Set(d.stats.map((s) => s.month)).size, 6);
  assert.ok(L.report(d).total.commission > 0);
});
