/* Website Change Monitor — pure logic: config, cron, GitHub Actions workflow + monitor.js + urls.json generators, pixel diff. No DOM. */
(function (root) {
  'use strict';

  var VERSIONS = { playwright: '1.48.2', pixelmatch: '5.3.0', pngjs: '7.0.0', node: '20', checkout: 'v4', setupNode: 'v4', githubScript: 'v7' };
  var VIEWPORTS = { desktop: { width: 1366, height: 768, label: 'Desktop (1366×768)' }, laptop: { width: 1280, height: 800, label: 'Laptop (1280×800)' }, mobile: { width: 390, height: 844, label: 'Phone (390×844)' } };
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function slug(s) { return String(s || '').toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'page'; }
  function validUrl(u) { return /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(String(u || '').trim()); }

  // ---------- config ----------
  function normalise(cfg) {
    cfg = cfg || {};
    var vp = VIEWPORTS[cfg.viewport] || VIEWPORTS.desktop, used = {};
    var pages = (cfg.pages || []).filter(function (p) { return p && validUrl(p.url); }).map(function (p) {
      var name = String(p.name || '').trim() || String(p.url).replace(/^https?:\/\//, '').replace(/\/$/, '');
      var id = slug(name), n = 2; while (used[id]) id = slug(name) + '-' + n++; used[id] = 1;
      var ignore = (Array.isArray(p.ignore) ? p.ignore : String(p.ignore || '').split(/\n|,(?![^\[]*\])/)).map(function (s) { return s.trim(); }).filter(Boolean);
      var o = { id: id, name: name, url: String(p.url).trim(), ignore: ignore };
      if (p.threshold != null && p.threshold !== '' && !isNaN(p.threshold)) o.threshold = +p.threshold;
      return o;
    });
    var threshold = cfg.threshold == null || cfg.threshold === '' || isNaN(cfg.threshold) ? 1 : Math.max(0, Math.min(100, +cfg.threshold));
    return {
      pages: pages, viewport: { width: vp.width, height: vp.height }, viewportName: VIEWPORTS[cfg.viewport] ? cfg.viewport : 'desktop',
      fullPage: cfg.fullPage !== false, threshold: threshold, textAlert: cfg.textAlert !== false, waitMs: Math.max(0, Math.min(30000, +cfg.waitMs || 2000)),
      schedule: cfg.schedule || 'daily', hour: cfg.hour == null ? 9 : +cfg.hour, minute: cfg.minute == null ? 17 : +cfg.minute, weekday: cfg.weekday == null ? 1 : +cfg.weekday,
      tzOffset: cfg.tzOffset == null ? 0 : +cfg.tzOffset, tzName: cfg.tzName || 'UTC'
    };
  }

  // ---------- cron ----------
  // tzOffset = minutes the local zone is ahead of UTC (Sydney summer = 660). Returns {cron, text}
  function cron(c) {
    c = normalise(c);
    if (c.schedule === 'hourly') return { cron: c.minute + ' * * * *', text: 'every hour at ' + pad(c.minute) + ' past' };
    if (c.schedule === '6h') return { cron: c.minute + ' */6 * * *', text: 'every 6 hours' };
    if (c.schedule === '12h') return { cron: c.minute + ' */12 * * *', text: 'every 12 hours' };
    var local = c.hour * 60 + c.minute, utc = local - c.tzOffset, dayShift = 0;
    while (utc < 0) { utc += 1440; dayShift--; }
    while (utc >= 1440) { utc -= 1440; dayShift++; }
    var h = Math.floor(utc / 60), m = utc % 60, when = fmtTime(c.hour, c.minute) + ' ' + c.tzName;
    if (c.schedule === 'weekly') {
      var wd = ((c.weekday + dayShift) % 7 + 7) % 7;
      return { cron: m + ' ' + h + ' * * ' + wd, text: 'every ' + DAYS[c.weekday] + ' at ' + when };
    }
    if (c.schedule === 'weekdays') {
      var days = [1, 2, 3, 4, 5].map(function (d) { return ((d + dayShift) % 7 + 7) % 7; }).sort();
      return { cron: m + ' ' + h + ' * * ' + compactDays(days), text: 'every weekday at ' + when };
    }
    return { cron: m + ' ' + h + ' * * *', text: 'every day at ' + when };
  }
  function compactDays(d) { return d[d.length - 1] - d[0] === d.length - 1 ? d[0] + '-' + d[d.length - 1] : d.join(','); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(h, m) { var ap = h < 12 ? 'am' : 'pm', hh = h % 12 || 12; return hh + ':' + pad(m) + ' ' + ap; }

  // ---------- generators ----------
  function genUrlsJson(cfg) {
    var c = normalise(cfg);
    return JSON.stringify({
      _help: 'Edit this list to change what is watched. threshold = % of pixels that must change before you get an issue. ignore = CSS selectors to blank out (ads, dates, carousels).',
      settings: { viewport: c.viewport, fullPage: c.fullPage, threshold: c.threshold, alertOnTextChange: c.textAlert, waitMs: c.waitMs },
      pages: c.pages.map(function (p) { var o = { name: p.name, url: p.url, ignore: p.ignore }; if (p.threshold != null) o.threshold = p.threshold; return o; })
    }, null, 2) + '\n';
  }

  function genWorkflow(cfg) {
    var c = normalise(cfg), cr = cron(c), V = VERSIONS;
    return [
      '# Website change monitor — made with Brahaspati (free, runs on GitHub Actions).',
      '# Runs ' + cr.text + ' (GitHub uses UTC, and scheduled runs can start a few minutes late).',
      '# To change the pages, edit monitor/urls.json. To run it now: Actions tab → Page monitor → Run workflow.',
      'name: Page monitor',
      '',
      'on:',
      '  schedule:',
      "    - cron: '" + cr.cron + "'",
      '  workflow_dispatch:',
      '',
      'permissions:',
      '  contents: write',
      '  issues: write',
      '',
      'concurrency:',
      '  group: page-monitor',
      '  cancel-in-progress: false',
      '',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 30',
      '    steps:',
      '      - name: Check out this repository',
      '        uses: actions/checkout@' + V.checkout,
      '',
      '      - name: Set up Node.js',
      '        uses: actions/setup-node@' + V.setupNode,
      '        with:',
      "          node-version: '" + V.node + "'",
      '',
      '      - name: Install Playwright and image tools',
      '        run: |',
      '          npm install --no-save --no-package-lock --no-audit --no-fund playwright@' + V.playwright + ' pixelmatch@' + V.pixelmatch + ' pngjs@' + V.pngjs,
      '          npx playwright install --with-deps chromium',
      '',
      '      - name: Take screenshots and compare',
      '        id: check',
      '        run: node monitor/monitor.js',
      '',
      '      - name: Save screenshots to the repository',
      '        id: save',
      '        run: |',
      '          git config user.name "github-actions[bot]"',
      '          git config user.email "41898283+github-actions[bot]@users.noreply.github.com"',
      '          git add monitor/data',
      '          if git diff --cached --quiet; then',
      '            echo "Nothing new to save."',
      '          else',
      '            git commit -m "Page monitor: screenshots $(date -u +\'%Y-%m-%d %H:%M\') UTC"',
      '            git push',
      '          fi',
      '          echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"',
      '',
      '      - name: Open or update an issue when something changed',
      "        if: steps.check.outputs.changed == 'true'",
      '        uses: actions/github-script@' + V.githubScript,
      '        env:',
      '          COMMIT_SHA: ${{ steps.save.outputs.sha }}',
      '        with:',
      '          script: |',
      "            const fs = require('fs');",
      "            const repo = context.repo.owner + '/' + context.repo.repo;",
      "            const body = fs.readFileSync('monitor/data/report.md', 'utf8')",
      "              .split('__REPO__').join(repo)",
      "              .split('__COMMIT__').join(process.env.COMMIT_SHA || 'HEAD');",
      "            const label = 'page-monitor';",
      "            try { await github.rest.issues.createLabel({ ...context.repo, name: label, color: 'b4531b', description: 'Website change monitor' }); } catch (e) { /* label already exists */ }",
      "            const open = await github.rest.issues.listForRepo({ ...context.repo, state: 'open', labels: label, per_page: 1 });",
      '            if (open.data.length) {',
      '              await github.rest.issues.createComment({ ...context.repo, issue_number: open.data[0].number, body });',
      "              core.notice('Added a comment to issue #' + open.data[0].number);",
      '            } else {',
      "              const made = await github.rest.issues.create({ ...context.repo, title: 'Website change detected', body, labels: [label] });",
      "              core.notice('Opened issue #' + made.data.number);",
      '            }',
      ''
    ].join('\n');
  }

  // The Node script that runs inside GitHub Actions (also runs locally with the same three packages).
  function genMonitorJs() {
    var L = [];
    function w(s) { L.push(s); }
    w('// Website change monitor — made with Brahaspati. Runs inside GitHub Actions (see .github/workflows/page-monitor.yml).');
    w('// For each page in monitor/urls.json it takes a screenshot, compares it with the last run (pixels and visible text),');
    w('// saves the images in monitor/data/<page>/ and writes monitor/data/report.md. Needs: playwright, pixelmatch@5, pngjs.');
    w("'use strict';");
    w("const fs = require('fs');");
    w("const path = require('path');");
    w("const { chromium } = require('playwright');");
    w("const { PNG } = require('pngjs');");
    w("const pixelmatch = require('pixelmatch');");
    w('');
    w("const ROOT = __dirname;");
    w("const DATA = process.env.MONITOR_DATA || path.join(ROOT, 'data');");
    w("const CONFIG = JSON.parse(fs.readFileSync(process.env.MONITOR_CONFIG || path.join(ROOT, 'urls.json'), 'utf8'));");
    w('const S = Object.assign({ viewport: { width: 1366, height: 768 }, fullPage: true, threshold: 1, alertOnTextChange: true, waitMs: 2000 }, CONFIG.settings || {});');
    w('');
    w("function slug(s) { return String(s || '').toLowerCase().replace(/^https?:\\/\\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'page'; }");
    w('function readPng(file) { return PNG.sync.read(fs.readFileSync(file)); }');
    w('');
    w('// Put an image on a white canvas of the given size so two different-height screenshots can be compared.');
    w('function padTo(img, width, height) {');
    w('  if (img.width === width && img.height === height) return img;');
    w('  const out = new PNG({ width, height });');
    w('  out.data.fill(255);');
    w('  PNG.bitblt(img, out, 0, 0, img.width, img.height, 0, 0);');
    w('  return out;');
    w('}');
    w('');
    w('function textLines(t) { return String(t || \'\').split(\'\\n\').map((l) => l.replace(/\\s+/g, \' \').trim()).filter(Boolean); }');
    w('function lineDiff(before, after) {');
    w('  const count = (arr) => arr.reduce((m, l) => m.set(l, (m.get(l) || 0) + 1), new Map());');
    w('  const a = count(before), b = count(after), added = [], removed = [];');
    w('  for (const [l, n] of b) for (let i = 0; i < n - (a.get(l) || 0); i++) added.push(l);');
    w('  for (const [l, n] of a) for (let i = 0; i < n - (b.get(l) || 0); i++) removed.push(l);');
    w('  return { added, removed };');
    w('}');
    w('');
    w('async function capture(browser, page) {');
    w('  const context = await browser.newContext({ viewport: S.viewport, deviceScaleFactor: 1, reducedMotion: \'reduce\' });');
    w('  const tab = await context.newPage();');
    w('  try {');
    w("    try { await tab.goto(page.url, { waitUntil: 'networkidle', timeout: 45000 }); }");
    w("    catch (e) { await tab.goto(page.url, { waitUntil: 'load', timeout: 60000 }); }");
    w('    await tab.waitForTimeout(S.waitMs);');
    w('    const ignore = page.ignore || [];');
    w("    const png = await tab.screenshot({ fullPage: S.fullPage, animations: 'disabled', mask: ignore.map((sel) => tab.locator(sel)), maskColor: '#FF00FF' });");
    w('    const text = await tab.evaluate((sels) => {');
    w("      sels.forEach((s) => { try { document.querySelectorAll(s).forEach((el) => { el.style.display = 'none'; }); } catch (e) {} });");
    w("      return document.body ? document.body.innerText : '';");
    w('    }, ignore);');
    w('    return { png, text };');
    w('  } finally { await context.close(); }');
    w('}');
    w('');
    w('async function checkPage(browser, page) {');
    w('  const id = slug(page.name || page.url), dir = path.join(DATA, id);');
    w('  fs.mkdirSync(dir, { recursive: true });');
    w("  const cur = path.join(dir, 'current.png'), prev = path.join(dir, 'previous.png'), diffFile = path.join(dir, 'diff.png');");
    w("  const curTxt = path.join(dir, 'current.txt'), prevTxt = path.join(dir, 'previous.txt');");
    w('  const threshold = page.threshold != null ? page.threshold : S.threshold;');
    w('  const shot = await capture(browser, page);');
    w('  const first = !fs.existsSync(cur);');
    w('  if (!first) { fs.copyFileSync(cur, prev); if (fs.existsSync(curTxt)) fs.copyFileSync(curTxt, prevTxt); }');
    w('  fs.writeFileSync(cur, shot.png);');
    w("  fs.writeFileSync(curTxt, textLines(shot.text).join('\\n') + '\\n');");
    w("  if (first) return { id, name: page.name, url: page.url, status: 'baseline', changed: false };");
    w('  const a = readPng(prev), b = readPng(cur);');
    w('  const width = Math.max(a.width, b.width), height = Math.max(a.height, b.height);');
    w('  const diff = new PNG({ width, height });');
    w('  const pixels = pixelmatch(padTo(a, width, height).data, padTo(b, width, height).data, diff.data, width, height, { threshold: 0.1, alpha: 0.3, diffColor: [255, 0, 0] });');
    w('  fs.writeFileSync(diffFile, PNG.sync.write(diff));');
    w('  const percent = Math.round((pixels / (width * height)) * 10000) / 100;');
    w("  const td = lineDiff(textLines(fs.readFileSync(prevTxt, 'utf8')), textLines(shot.text));");
    w('  const textChanged = td.added.length + td.removed.length > 0;');
    w('  const changed = percent >= threshold || (S.alertOnTextChange && textChanged);');
    w('  return { id, name: page.name, url: page.url, status: changed ? \'changed\' : \'same\', changed, percent, threshold, pixels, heightBefore: a.height, heightAfter: b.height, added: td.added, removed: td.removed };');
    w('}');
    w('');
    w('function report(results) {');
    w("  const img = (id, f) => 'https://github.com/__REPO__/blob/__COMMIT__/monitor/data/' + id + '/' + f + '?raw=true';");
    w("  const out = ['## Website change monitor', '', 'Checked ' + results.length + ' page(s) on ' + new Date().toUTCString() + '.', ''];");
    w('  for (const r of results) {');
    w("    out.push('### ' + (r.changed ? '🔴 ' : r.status === 'error' ? '⚠️ ' : '🟢 ') + r.name, r.url, '');");
    w("    if (r.status === 'error') { out.push('Could not check this page: `' + r.error + '`', ''); continue; }");
    w("    if (r.status === 'baseline') { out.push('First run — saved this screenshot to compare against next time.', ''); continue; }");
    w("    out.push('- Pixels changed: **' + r.percent + '%** (alert at ' + r.threshold + '%)');");
    w("    if (r.heightBefore !== r.heightAfter) out.push('- Page height: ' + r.heightBefore + 'px → ' + r.heightAfter + 'px');");
    w("    out.push('- Text: ' + r.added.length + ' line(s) added, ' + r.removed.length + ' removed');");
    w("    const show = (arr, sign) => arr.slice(0, 15).map((l) => sign + ' ' + l.slice(0, 200)).join('\\n');");
    w("    if (r.added.length || r.removed.length) out.push('', '```diff', [show(r.removed, '-'), show(r.added, '+')].filter(Boolean).join('\\n'), '```');");
    w("    if (r.changed) out.push('', '| Before | After | Differences (red) |', '| --- | --- | --- |', '| ![before](' + img(r.id, 'previous.png') + ') | ![after](' + img(r.id, 'current.png') + ') | ![diff](' + img(r.id, 'diff.png') + ') |');");
    w("    out.push('');");
    w('  }');
    w("  return out.join('\\n');");
    w('}');
    w('');
    w('async function main() {');
    w('  const pages = (CONFIG.pages || []).filter((p) => p && /^https?:\\/\\//i.test(p.url || \'\'));');
    w("  if (!pages.length) throw new Error('No pages with an http(s) URL in monitor/urls.json');");
    w('  fs.mkdirSync(DATA, { recursive: true });');
    w('  const browser = await chromium.launch();');
    w('  const results = [];');
    w('  try {');
    w('    for (const page of pages) {');
    w("      try { const r = await checkPage(browser, page); results.push(r); console.log((r.changed ? 'CHANGED ' : r.status.toUpperCase() + ' ') + page.url + (r.percent != null ? ' (' + r.percent + '% pixels, ' + (r.added.length + r.removed.length) + ' text lines)' : '')); }");
    w("      catch (e) { results.push({ id: slug(page.name || page.url), name: page.name || page.url, url: page.url, status: 'error', changed: true, error: String(e.message || e).split('\\n')[0] }); console.log('ERROR ' + page.url + ': ' + e.message); }");
    w('    }');
    w('  } finally { await browser.close(); }');
    w('  const md = report(results);');
    w("  fs.writeFileSync(path.join(DATA, 'report.md'), md);");
    w("  fs.writeFileSync(path.join(DATA, 'results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));");
    w('  const changed = results.some((r) => r.changed);');
    w("  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'changed=' + changed + '\\n');");
    w("  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.split('__REPO__').join(process.env.GITHUB_REPOSITORY || '').split('__COMMIT__').join(process.env.GITHUB_SHA || 'HEAD') + '\\n');");
    w("  console.log(changed ? 'Changes found — an issue will be opened or updated.' : 'No changes above the threshold.');");
    w('}');
    w('');
    w('main().catch((e) => { console.error(e); process.exit(1); });');
    return L.join('\n') + '\n';
  }

  // ---------- pixel diff (browser compare tool) ----------
  // a, b: RGBA arrays (Uint8ClampedArray) of the same width/height. threshold 0..1 like pixelmatch.
  function blend(c, a) { return 255 + (c - 255) * a; }
  function colorDelta(a, b, i) {
    var a1 = a[i + 3] / 255, a2 = b[i + 3] / 255;
    var r1 = blend(a[i], a1), g1 = blend(a[i + 1], a1), b1 = blend(a[i + 2], a1);
    var r2 = blend(b[i], a2), g2 = blend(b[i + 1], a2), b2 = blend(b[i + 2], a2);
    var y = (r1 - r2) * 0.29889531 + (g1 - g2) * 0.58662247 + (b1 - b2) * 0.11448223;
    var ii = (r1 - r2) * 0.59597799 - (g1 - g2) * 0.2741761 - (b1 - b2) * 0.32180189;
    var q = (r1 - r2) * 0.21147017 - (g1 - g2) * 0.52261711 + (b1 - b2) * 0.31114694;
    return 0.5053 * y * y + 0.299 * ii * ii + 0.1957 * q * q;
  }
  function diffPixels(a, b, width, height, opts) {
    opts = opts || {}; var t = opts.threshold == null ? 0.1 : opts.threshold, max = 35215 * t * t;
    var n = width * height, mask = new Uint8Array(n), count = 0, minX = width, minY = height, maxX = -1, maxY = -1;
    for (var p = 0; p < n; p++) {
      var i = p * 4;
      if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3]) continue;
      if (colorDelta(a, b, i) > max) {
        mask[p] = 1; count++;
        var x = p % width, y = (p - x) / width;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return { count: count, total: n, percent: n ? Math.round(count / n * 10000) / 100 : 0, mask: mask, box: count ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null };
  }
  // Build an overlay image: unchanged pixels greyed and faded, changed pixels red.
  function overlay(after, mask, width, height) {
    var out = new (typeof Uint8ClampedArray !== 'undefined' ? Uint8ClampedArray : Array)(width * height * 4);
    for (var p = 0; p < width * height; p++) {
      var i = p * 4;
      if (mask[p]) { out[i] = 230; out[i + 1] = 30; out[i + 2] = 30; out[i + 3] = 255; }
      else { var g = 0.299 * after[i] + 0.587 * after[i + 1] + 0.114 * after[i + 2], v = 255 - (255 - g) * 0.25; out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255; }
    }
    return out;
  }

  var L = { VERSIONS: VERSIONS, VIEWPORTS: VIEWPORTS, normalise: normalise, cron: cron, slug: slug, validUrl: validUrl, genUrlsJson: genUrlsJson, genWorkflow: genWorkflow, genMonitorJs: genMonitorJs, diffPixels: diffPixels, overlay: overlay };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.MonitorLib = L;
})(this);
