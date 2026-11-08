/* Affiliate Content Manager — pure logic: UTM builder, per-link / per-program / per-content metrics (EPC, conversion rate),
   commission status and payout thresholds, recheck reminders, CSV import mapping, disclosure text, .ics reminder, and a
   generated GitHub Actions link checker (links.json + check-links.js + workflow). No DOM. */
(function (root) {
  'use strict';

  function num(v) { if (typeof v === 'number') return isFinite(v) ? v : 0; var s = String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''); var n = parseFloat(s); return isNaN(n) ? 0 : n; }
  function r2(n) { return Math.round((+n + Number.EPSILON) * 100) / 100; }
  function month(d) { var s = String(d || '').trim(), m; if ((m = s.match(/^(\d{4})-(\d{1,2})/))) return m[1] + '-' + ('0' + m[2]).slice(-2); if ((m = s.match(/^(\d{1,2})[\/.-](\d{4})$/))) return m[2] + '-' + ('0' + m[1]).slice(-2); if ((m = s.match(/^\d{1,2}[\/.-](\d{1,2})[\/.-](\d{4})/))) return m[2] + '-' + ('0' + m[1]).slice(-2);
    var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }; if ((m = s.toLowerCase().match(/^([a-z]{3})[a-z]*[\s\-]+(\d{4})$/)) && MON[m[1]]) return m[2] + '-' + ('0' + MON[m[1]]).slice(-2); return ''; }
  function addMonths(ym, n) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + ('0' + (m + 1)).slice(-2); }
  function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }

  // ---------- UTM ----------
  function slugify(s) { return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function buildUtm(url, utm) {
    url = String(url || '').trim(); utm = utm || {};
    if (!/^https?:\/\//i.test(url)) return url;
    var hash = '', h = url.indexOf('#'); if (h >= 0) { hash = url.slice(h); url = url.slice(0, h); }
    var q = url.indexOf('?'), base = q >= 0 ? url.slice(0, q) : url, params = q >= 0 ? url.slice(q + 1).split('&').filter(Boolean) : [];
    var keys = ['source', 'medium', 'campaign', 'content', 'term'], set = {};
    keys.forEach(function (k) { if (utm[k] != null && String(utm[k]).trim()) set['utm_' + k] = slugify(utm[k]); });
    params = params.filter(function (p) { return !Object.prototype.hasOwnProperty.call(set, decodeURIComponent(p.split('=')[0])); });
    keys.forEach(function (k) { if (set['utm_' + k]) params.push('utm_' + k + '=' + encodeURIComponent(set['utm_' + k])); });
    return base + (params.length ? '?' + params.join('&') : '') + hash;
  }
  function hostOf(u) { var m = String(u || '').match(/^https?:\/\/([^/?#:]+)/i); return m ? m[1].toLowerCase().replace(/^www\./, '') : ''; }

  // ---------- metrics ----------
  function blank() { return { clicks: 0, conversions: 0, sales: 0, commission: 0, pending: 0, approved: 0, paid: 0, rejected: 0 }; }
  function addStat(t, s) {
    var c = num(s.commission), st = s.status || 'pending';
    t.clicks += num(s.clicks); t.conversions += num(s.conversions); t.sales += num(s.sales);
    if (st === 'rejected') { t.rejected += c; return; }
    t.commission += c; t[st === 'paid' ? 'paid' : st === 'approved' ? 'approved' : 'pending'] += c;
  }
  function finish(t) { t.epc = t.clicks ? t.commission / t.clicks : NaN; t.cr = t.clicks ? t.conversions / t.clicks : NaN; t.unpaid = t.pending + t.approved; return t; }
  function inRange(m, from, to) { return (!from || m >= from) && (!to || m <= to); }

  // data: {programs, links, content, stats}. Returns totals per link, per program, per content, per month.
  function report(data, from, to) {
    var P = {}, Lk = {}, total = blank(), byMonth = {};
    (data.programs || []).forEach(function (p) { P[p.id] = Object.assign({ program: p, links: 0 }, blank()); });
    (data.links || []).forEach(function (l) { Lk[l.id] = Object.assign({ link: l, months: 0 }, blank()); if (P[l.programId]) P[l.programId].links++; });
    (data.stats || []).forEach(function (s) {
      var m = month(s.month); if (!inRange(m, from, to)) return;
      var l = Lk[s.linkId]; if (!l) return;
      addStat(l, s); l.months++; addStat(total, s);
      var pr = P[l.link.programId]; if (pr) addStat(pr, s);
      var bm = byMonth[m] || (byMonth[m] = blank()); addStat(bm, s);
    });
    var links = Object.keys(Lk).map(function (k) { return finish(Lk[k]); });
    var programs = Object.keys(P).map(function (k) {
      var p = finish(P[k]), thr = num(p.program.payoutThreshold);
      // all-time approved-but-unpaid decides payout eligibility, regardless of the date filter
      var allApproved = (data.stats || []).filter(function (s) { var l = Lk[s.linkId]; return l && l.link.programId === k && s.status === 'approved'; }).reduce(function (a, s) { return a + num(s.commission); }, 0);
      p.approvedAllTime = allApproved; p.toThreshold = thr ? Math.max(0, thr - allApproved) : 0; p.payoutDue = thr ? allApproved >= thr : allApproved > 0;
      return p;
    });
    var content = (data.content || []).map(function (c) {
      var t = blank(), ids = c.linkIds || [];
      ids.forEach(function (id) { var l = Lk[id]; if (!l) return; ['clicks', 'conversions', 'sales', 'commission', 'pending', 'approved', 'paid', 'rejected'].forEach(function (k) { t[k] += l[k]; }); });
      t.content = c; t.linkCount = ids.length; return finish(t);
    });
    var months = Object.keys(byMonth).sort().map(function (m) { return Object.assign({ month: m }, finish(byMonth[m])); });
    return { total: finish(total), links: links, programs: programs, content: content, months: months };
  }
  // Best performers: by commission, and by EPC among links with enough clicks to be meaningful.
  function best(links, minClicks) {
    minClicks = minClicks == null ? 20 : minClicks;
    var byCommission = links.filter(function (l) { return l.commission > 0; }).sort(function (a, b) { return b.commission - a.commission; });
    var byEpc = links.filter(function (l) { return l.clicks >= minClicks; }).sort(function (a, b) { return b.epc - a.epc; });
    var dead = links.filter(function (l) { return l.clicks >= minClicks && l.conversions === 0; });
    return { byCommission: byCommission, byEpc: byEpc, noSales: dead };
  }

  // ---------- reminders ----------
  // Links to recheck: never checked, checked more than `days` ago, marked broken; content older than a year that uses links.
  function recheck(data, today, days) {
    days = days || 90; var out = [];
    (data.links || []).forEach(function (l) {
      if (l.status === 'broken') out.push({ kind: 'link', id: l.id, name: l.shortName || l.product, why: 'Marked as broken — replace or remove it everywhere it’s used.', level: 'bad' });
      else if (!l.lastChecked) out.push({ kind: 'link', id: l.id, name: l.shortName || l.product, why: 'Never checked.', level: 'warn' });
      else if (daysBetween(l.lastChecked, today) > days) out.push({ kind: 'link', id: l.id, name: l.shortName || l.product, why: 'Last checked ' + daysBetween(l.lastChecked, today) + ' days ago.', level: 'warn' });
    });
    var used = {}; (data.content || []).forEach(function (c) { (c.linkIds || []).forEach(function (id) { used[id] = (used[id] || 0) + 1; }); });
    (data.links || []).forEach(function (l) { if (!used[l.id]) out.push({ kind: 'link', id: l.id, name: l.shortName || l.product, why: 'Not used in any content yet.', level: 'info' }); });
    (data.content || []).forEach(function (c) {
      if (c.publishDate && daysBetween(c.publishDate, today) > 365 && (c.linkIds || []).length) out.push({ kind: 'content', id: c.id, name: c.title, why: 'Published over a year ago — check prices, links and that the products still exist.', level: 'info' });
      if (c.type !== 'email' && !c.disclosed && (c.linkIds || []).length) out.push({ kind: 'content', id: c.id, name: c.title, why: 'No affiliate disclosure ticked for this piece.', level: 'warn' });
    });
    var order = { bad: 0, warn: 1, info: 2 }; out.sort(function (a, b) { return order[a.level] - order[b.level]; });
    return out;
  }

  // ---------- CSV import ----------
  // rows: objects with link (short name / affiliate URL / product), month or date, clicks, conversions (orders/sales count), revenue/sales, commission/earnings, status
  function importStats(rows, links, existing) {
    var stats = (existing || []).slice(), added = 0, updated = 0, unmatched = [];
    function norm(r) { var o = {}; Object.keys(r || {}).forEach(function (k) { o[String(k).toLowerCase().replace(/[^a-z]/g, '')] = r[k]; }); return o; }
    function key(s) { return String(s || '').trim().toLowerCase(); }
    rows.forEach(function (row) {
      var g = norm(row), ref = key(g.link || g.shortname || g.name || g.trackingid || g.subid || g.url || g.affiliateurl || g.product);
      var l = links.filter(function (x) { return key(x.shortName) === ref || key(x.affiliateUrl) === ref || key(x.product) === ref || key(x.id) === ref; })[0];
      var m = month(g.month || g.date || g.period);
      if (!l || !m) { unmatched.push(ref || '(blank)'); return; }
      var st = key(g.status); st = /paid/.test(st) ? 'paid' : /approv|lock|confirm|cleared/.test(st) ? 'approved' : /reject|declin|reversed|void|cancel/.test(st) ? 'rejected' : 'pending';
      var rec = { linkId: l.id, month: m, clicks: num(g.clicks), conversions: num(g.conversions || g.orders || g.salescount || g.items || g.ordereditems), sales: num(g.revenue || g.sales || g.salesamount || g.orderamount), commission: num(g.commission || g.earnings || g.payout || g.adfees), status: st };
      var ex = stats.filter(function (s) { return s.linkId === l.id && s.month === m; })[0];
      if (ex) { Object.assign(ex, rec); updated++; } else { rec.id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); stats.push(rec); added++; }
    });
    return { stats: stats, added: added, updated: updated, unmatched: unmatched };
  }

  // ---------- disclosure ----------
  var DISCLOSURE = {
    post: 'This post contains affiliate links. If you buy through them, I may earn a small commission at no extra cost to you. I only recommend products I’ve used or genuinely rate.',
    video: 'Some links in this description are affiliate links — if you buy through them I may earn a commission, at no extra cost to you. Say it out loud near the start of the video too.',
    email: 'This email contains affiliate links. I may earn a commission if you buy through them, at no extra cost to you.',
    social: '#ad Affiliate link — I earn a commission if you buy through it.',
    short: '(affiliate link)'
  };
  function disclosure(type) { return DISCLOSURE[type] || DISCLOSURE.post; }

  // ---------- .ics reminder ----------
  function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) { var out = [], s = line; while (s.length > 75) { out.push(s.slice(0, 75)); s = ' ' + s.slice(75); } out.push(s); return out.join('\r\n'); }
  // Recurring (monthly) all-day reminder to recheck links.
  function ics(opts) {
    opts = opts || {}; var d = String(opts.date || '').replace(/-/g, ''), stamp = String(opts.stamp || '20260101T000000Z');
    var end = (function () { var x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8) + 1)); return x.toISOString().slice(0, 10).replace(/-/g, ''); })();
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Brahaspati//Affiliate Content Manager//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + (opts.uid || 'affiliate-recheck-' + d) + '@brahaspati', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + end,
      opts.monthly ? 'RRULE:FREQ=MONTHLY' : '', 'SUMMARY:' + icsEscape(opts.title || 'Recheck affiliate links'), 'DESCRIPTION:' + icsEscape(opts.description || ''),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(opts.title || 'Recheck affiliate links'), 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
    return lines.filter(Boolean).map(fold).join('\r\n') + '\r\n';
  }

  // ---------- link checker for GitHub Actions ----------
  function genLinksJson(links) {
    return JSON.stringify({ _help: 'Links to check. Generated by Brahaspati Affiliate Content Manager. Edit freely.', links: (links || []).filter(function (l) { return /^https?:\/\//i.test(l.affiliateUrl || l.originalUrl || ''); }).map(function (l) { return { name: l.shortName || l.product, url: l.affiliateUrl || l.originalUrl, expectHost: hostOf(l.originalUrl) }; }) }, null, 2) + '\n';
  }
  function genCheckerJs() {
    return [
      '// Affiliate link checker — made with Brahaspati. Runs in GitHub Actions (Node 20, no packages).',
      '// Follows each link\'s redirects, and reports links that fail, return an error, or land somewhere unexpected',
      '// (e.g. the shop\'s home page instead of the product, which usually means the product is gone).',
      "'use strict';",
      "const fs = require('fs');",
      "const path = require('path');",
      "const DIR = process.env.CHECKER_DIR || __dirname;",
      "const UA = 'BrahaspatiLinkChecker/1.0 (+https://pawansinha0612.github.io/brahaspati/apps/affiliate-manager/)';",
      "const DELAY = process.env.CHECKER_DELAY_MS != null ? +process.env.CHECKER_DELAY_MS : 1500;",
      'const sleep = (ms) => new Promise((r) => setTimeout(r, ms));',
      '',
      'async function check(link) {',
      '  let url = link.url, hops = 0, res;',
      '  while (hops < 10) {',
      '    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 20000);',
      "    try { res = await fetch(url, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: ctrl.signal }); }",
      '    finally { clearTimeout(t); }',
      "    const loc = res.headers.get('location');",
      '    if (res.status >= 300 && res.status < 400 && loc) { url = new URL(loc, url).href; hops++; continue; }',
      '    break;',
      '  }',
      "  const final = new URL(url), host = final.hostname.replace(/^www\\./, '');",
      '  const problems = [];',
      "  if (res.status >= 400) problems.push('HTTP ' + res.status);",
      "  if (hops >= 10) problems.push('too many redirects');",
      "  if (link.expectHost && host !== link.expectHost && !host.endsWith('.' + link.expectHost)) problems.push('ended on ' + host + ', expected ' + link.expectHost);",
      "  if (link.expectHost && host.endsWith(link.expectHost) && (final.pathname === '/' || final.pathname === '')) problems.push('landed on the home page — product may be gone');",
      '  return { name: link.name, url: link.url, final: url, status: res.status, hops, problems };',
      '}',
      '',
      'async function main() {',
      "  const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'links.json'), 'utf8'));",
      '  const results = [];',
      '  for (const l of cfg.links || []) {',
      "    try { results.push(await check(l)); } catch (e) { results.push({ name: l.name, url: l.url, status: 0, problems: [String(e.message || e).slice(0, 120)] }); }",
      "    const r = results[results.length - 1]; console.log((r.problems.length ? 'PROBLEM ' : 'OK      ') + l.name + (r.problems.length ? ': ' + r.problems.join('; ') : ''));",
      '    if (DELAY) await sleep(DELAY);',
      '  }',
      '  const bad = results.filter((r) => r.problems.length);',
      "  const md = ['## Affiliate link check — ' + new Date().toISOString().slice(0, 10), '', bad.length ? bad.length + ' of ' + results.length + ' links need attention:' : 'All ' + results.length + ' links work.', ''];",
      "  for (const r of bad) md.push('- **' + r.name + '** — ' + r.problems.join('; ') + ' ([link](' + r.url + '))');",
      "  fs.writeFileSync(path.join(DIR, 'link-report.md'), md.join('\\n') + '\\n');",
      "  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'broken=' + (bad.length > 0) + '\\n');",
      "  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\\n') + '\\n');",
      '}',
      'main().catch((e) => { console.error(e); process.exit(1); });',
      ''
    ].join('\n');
  }
  function genCheckerWorkflow() {
    return [
      '# Affiliate link checker — made with Brahaspati. Runs every Monday (UTC) and when you press Run workflow.',
      'name: Affiliate link check',
      '',
      'on:',
      '  schedule:',
      "    - cron: '17 21 * * 0'",
      '  workflow_dispatch:',
      '',
      'permissions:',
      '  contents: read',
      '  issues: write',
      '',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 15',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-node@v4',
      '        with:',
      "          node-version: '20'",
      '      - name: Check links',
      '        id: check',
      '        run: node links/check-links.js',
      '      - name: Open an issue if any link is broken',
      "        if: steps.check.outputs.broken == 'true'",
      '        uses: actions/github-script@v7',
      '        with:',
      '          script: |',
      "            const body = require('fs').readFileSync('links/link-report.md', 'utf8');",
      "            await github.rest.issues.create({ ...context.repo, title: 'Affiliate links need attention', body });",
      ''
    ].join('\n');
  }

  function sample(today) {
    today = today || '2026-11-08';
    var thisM = month(today);
    var programs = [
      { id: 'amz', name: 'Amazon Associates AU', network: 'Amazon', commissionPct: 4, cookieDays: 1, payoutThreshold: 100, currency: 'AUD', notes: 'Rates vary by category.' },
      { id: 'ck', name: 'Canva Affiliate', network: 'Impact', commissionPct: 0, commissionFlat: 36, cookieDays: 30, payoutThreshold: 10, currency: 'AUD', notes: 'Flat bounty per Pro sign-up (sample figure, converted to AUD).' },
      { id: 'ws', name: 'Web host partner', network: 'CJ', commissionPct: 0, commissionFlat: 65, cookieDays: 60, payoutThreshold: 50, currency: 'AUD', notes: '' },
      { id: 'cam', name: 'CameraHouse (sample)', network: 'Commission Factory', commissionPct: 6, cookieDays: 30, payoutThreshold: 50, currency: 'AUD', notes: '' }
    ];
    var links = [
      { id: 'l1', programId: 'amz', product: 'Rode wireless mic', shortName: 'rode-mic', originalUrl: 'https://www.amazon.com.au/dp/B0EXAMPLE1', affiliateUrl: 'https://www.amazon.com.au/dp/B0EXAMPLE1?tag=mysite-22', lastChecked: '2026-10-20', status: 'ok' },
      { id: 'l2', programId: 'amz', product: 'Ring light 18"', shortName: 'ring-light', originalUrl: 'https://www.amazon.com.au/dp/B0EXAMPLE2', affiliateUrl: 'https://www.amazon.com.au/dp/B0EXAMPLE2?tag=mysite-22', lastChecked: '2026-05-02', status: 'ok' },
      { id: 'l3', programId: 'ck', product: 'Canva Pro', shortName: 'canva', originalUrl: 'https://www.canva.com/pro/', affiliateUrl: 'https://partner.canva.com/c/0000/EXAMPLE', lastChecked: '2026-11-01', status: 'ok' },
      { id: 'l4', programId: 'ws', product: 'Starter hosting plan', shortName: 'hosting', originalUrl: 'https://www.example-host.com/starter', affiliateUrl: 'https://www.anrdoezrs.net/click-000-111?url=https%3A%2F%2Fwww.example-host.com%2Fstarter', lastChecked: '', status: 'unknown' },
      { id: 'l5', programId: 'cam', product: 'Mirrorless camera kit', shortName: 'camera-kit', originalUrl: 'https://www.example-camera.com.au/kit', affiliateUrl: 'https://t.cfjump.com/0000/t/111?Url=https%3A%2F%2Fwww.example-camera.com.au%2Fkit', lastChecked: '2026-09-15', status: 'broken' }
    ];
    var content = [
      { id: 'c1', type: 'post', title: 'Best budget YouTube setup for beginners', url: 'https://example.com/blog/youtube-setup', platform: 'Blog', publishDate: '2025-08-14', linkIds: ['l1', 'l2', 'l5'], disclosed: true },
      { id: 'c2', type: 'video', title: 'How I design thumbnails in 10 minutes', url: 'https://youtube.com/watch?v=EXAMPLE', platform: 'YouTube', publishDate: '2026-06-03', linkIds: ['l3'], disclosed: true },
      { id: 'c3', type: 'email', title: 'Newsletter #42 — tools I use', url: '', platform: 'Newsletter', publishDate: '2026-10-01', linkIds: ['l3', 'l4'], disclosed: true },
      { id: 'c4', type: 'post', title: 'Start a website in a weekend', url: 'https://example.com/blog/website-weekend', platform: 'Blog', publishDate: '2026-09-10', linkIds: ['l4'], disclosed: false }
    ];
    var stats = [], plan = { l1: [180, 0.05, 389, 0.04], l2: [90, 0.03, 79, 0.04], l3: [140, 0.06, 0, 36], l4: [60, 0.04, 0, 65], l5: [40, 0.025, 1299, 0.06] };
    for (var i = 5; i >= 0; i--) {
      var m = addMonths(thisM, -i);
      Object.keys(plan).forEach(function (id, k) {
        var p = plan[id], clicks = Math.round(p[0] * (0.8 + ((i * 7 + k * 3) % 5) / 10)), conv = Math.round(clicks * p[1]), sales = r2(conv * p[2]), comm = r2(p[2] ? sales * p[3] : conv * p[3]);
        var status = i >= 3 ? 'paid' : i >= 1 ? 'approved' : 'pending';
        stats.push({ id: 's' + id + m, linkId: id, month: m, clicks: clicks, conversions: conv, sales: sales, commission: comm, status: status });
      });
    }
    return { programs: programs, links: links, content: content, stats: stats };
  }

  var L = { num: num, r2: r2, month: month, addMonths: addMonths, daysBetween: daysBetween, buildUtm: buildUtm, hostOf: hostOf, slugify: slugify, report: report, best: best, recheck: recheck,
    importStats: importStats, DISCLOSURE: DISCLOSURE, disclosure: disclosure, ics: ics, genLinksJson: genLinksJson, genCheckerJs: genCheckerJs, genCheckerWorkflow: genCheckerWorkflow, sample: sample };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.AffiliateLib = L;
})(this);
