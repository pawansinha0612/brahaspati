/* Competitor Price Watcher — pure logic: HTML price extraction (JSON-LD, meta/itemprop, tiny CSS selector engine), robots.txt check,
   generators for a free GitHub Actions setup (products.json + watch.js + workflow), and the prices.csv analyser. No DOM.
   The extraction functions below are copied verbatim into the generated watch.js (via Function.prototype.toString), so the
   tests here cover exactly the code that runs on GitHub. Keep them self-contained: no references outside their own bodies
   except to each other. */
(function (root) {
  'use strict';

  var VERSIONS = { node: '20', checkout: 'v4', setupNode: 'v4', githubScript: 'v7', playwright: '1.48.2' };
  var TOOL_UA = 'BrahaspatiPriceWatcher/1.0 (+https://pawansinha0612.github.io/brahaspati/apps/price-watcher/; polite daily price check)';

  // ---------- extraction (embedded in watch.js) ----------
  function decodeEntities(s) {
    var named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', pound: '£', euro: '€', yen: '¥', cent: '¢' };
    return String(s == null ? '' : s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
      if (e[0] === '#') { var n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isNaN(n) ? m : String.fromCharCode(n); }
      var k = e.toLowerCase(); return Object.prototype.hasOwnProperty.call(named, k) ? named[k] : m;
    });
  }

  // "$1,299.00" -> 1299, "AU$ 49.95" -> 49.95, "1.299,00 €" -> 1299, "Now $39 was $59" -> 39 (first number). NaN if none.
  function parsePrice(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var s = decodeEntities(String(v == null ? '' : v)).replace(/\s+/g, ' ');
    var m = s.match(/\d[\d.,' ]*\d|\d/); if (!m) return NaN;
    var n = m[0].replace(/[' ]/g, '');
    var lastDot = n.lastIndexOf('.'), lastComma = n.lastIndexOf(',');
    if (lastComma > lastDot) {
      // comma is the decimal mark when followed by 1-2 digits at the end ("1.299,00", "49,9"); otherwise a thousands mark
      n = /,\d{1,2}$/.test(n) ? n.replace(/\./g, '').replace(',', '.') : n.replace(/,/g, '');
    } else {
      n = n.replace(/,/g, '');
      if ((n.match(/\./g) || []).length > 1) n = n.replace(/\.(?=.*\.)/g, '');
    }
    var x = parseFloat(n); return isNaN(x) ? NaN : x;
  }

  function parseAttrs(s) {
    var out = {}, re = /([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g, m;
    while ((m = re.exec(s || ''))) out[m[1].toLowerCase()] = decodeEntities(m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : '');
    return out;
  }

  // JSON-LD Product offers -> {price, currency, method}
  function findJsonLdPrice(html) {
    var re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi, m, found = null;
    function isType(o, t) { var x = o && o['@type']; return Array.isArray(x) ? x.indexOf(t) >= 0 : x === t; }
    function fromOffer(o) {
      if (!o || typeof o !== 'object') return null;
      if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) { var r = fromOffer(o[i]); if (r) return r; } return null; }
      var p = o.price != null ? o.price : o.lowPrice != null ? o.lowPrice : (o.priceSpecification && (Array.isArray(o.priceSpecification) ? o.priceSpecification[0] : o.priceSpecification) || {}).price;
      var cur = o.priceCurrency || (o.priceSpecification && (Array.isArray(o.priceSpecification) ? o.priceSpecification[0] : o.priceSpecification) || {}).priceCurrency || '';
      var n = parsePrice(p); if (!isNaN(n)) return { price: n, currency: cur };
      if (o.offers) return fromOffer(o.offers);
      return null;
    }
    function walk(o, depth) {
      if (found || !o || typeof o !== 'object' || depth > 12) return;
      if (Array.isArray(o)) { o.forEach(function (x) { walk(x, depth + 1); }); return; }
      if ((isType(o, 'Product') || isType(o, 'ProductGroup') || isType(o, 'IndividualProduct')) && o.offers) { var r = fromOffer(o.offers); if (r) { found = r; return; } }
      if (o.hasVariant) walk(o.hasVariant, depth + 1);
      Object.keys(o).forEach(function (k) { if (k !== 'offers') walk(o[k], depth + 1); });
    }
    while ((m = re.exec(html)) && !found) {
      var txt = m[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '').replace(/^\s*<!--|-->\s*$/g, '').trim();
      try { walk(JSON.parse(txt), 0); } catch (e) { /* broken JSON-LD: skip this block */ }
    }
    return found ? { price: found.price, currency: found.currency || '', method: 'json-ld' } : null;
  }

  // <meta itemprop="price" content>, <meta property="product:price:amount">, any element with itemprop="price" (content attr or text)
  function findMetaPrice(html) {
    var re = /<([a-zA-Z][\w:-]*)\b([^>]*)>/g, m, price = null, currency = '';
    while ((m = re.exec(html))) {
      var a = parseAttrs(m[2]), prop = (a.itemprop || a.property || a.name || '').toLowerCase();
      if (!currency && (prop === 'pricecurrency' || prop === 'product:price:currency' || prop === 'og:price:currency')) currency = a.content || '';
      if (price == null && (prop === 'price' || prop === 'product:price:amount' || prop === 'og:price:amount')) {
        var v = a.content != null && a.content !== '' ? a.content : null;
        if (v == null && prop === 'price' && m[1].toLowerCase() !== 'meta') { var rest = html.slice(re.lastIndex), end = rest.search(/<\//); v = rest.slice(0, end < 0 ? 200 : end).replace(/<[^>]*>/g, ' '); }
        var n = parsePrice(v); if (!isNaN(n)) price = n;
      }
    }
    return price == null ? null : { price: price, currency: currency, method: 'meta' };
  }

  // Tiny CSS selector support: tag, #id, .class, [attr], [attr=value], [attr*=value], combined (span.price.now) and
  // descendant chains (div.product .price). Add "@attr" at the end to read an attribute instead of the text (".price@data-amount").
  function parseSelector(sel) {
    var attr = null, s = String(sel || '').trim(), at = s.match(/@([\w:-]+)$/);
    if (at) { attr = at[1].toLowerCase(); s = s.slice(0, -at[0].length).trim(); }
    var parts = s.replace(/\s*>\s*/g, ' ').split(/\s+/).filter(Boolean).map(function (p) {
      var c = { tag: null, id: null, classes: [], attrs: [] }, m = p.match(/^([a-zA-Z][\w-]*|\*)/), rest = p;
      if (m) { if (m[1] !== '*') c.tag = m[1].toLowerCase(); rest = p.slice(m[1].length); }
      var re = /#([\w-]+)|\.([\w-]+)|\[\s*([\w:-]+)\s*(?:([*^$]?=)\s*["']?([^"'\]]*)["']?)?\s*\]/g, x, used = 0;
      while ((x = re.exec(rest))) {
        used += x[0].length;
        if (x[1]) c.id = x[1]; else if (x[2]) c.classes.push(x[2]); else c.attrs.push({ name: x[3].toLowerCase(), op: x[4] || '', value: x[5] == null ? '' : x[5] });
      }
      if (used !== rest.length) throw new Error('Unsupported selector part: ' + p);
      return c;
    });
    if (!parts.length) throw new Error('Empty selector');
    return { parts: parts, attr: attr };
  }
  function matchCompound(c, el) {
    if (c.tag && c.tag !== el.tag) return false;
    if (c.id && el.attrs.id !== c.id) return false;
    var cls = (' ' + (el.attrs['class'] || '').replace(/\s+/g, ' ') + ' ');
    for (var i = 0; i < c.classes.length; i++) if (cls.indexOf(' ' + c.classes[i] + ' ') < 0) return false;
    for (var j = 0; j < c.attrs.length; j++) {
      var a = c.attrs[j], v = el.attrs[a.name];
      if (v == null) return false;
      if (a.op === '=' && v !== a.value) return false;
      if (a.op === '*=' && v.indexOf(a.value) < 0) return false;
      if (a.op === '^=' && v.indexOf(a.value) !== 0) return false;
      if (a.op === '$=' && v.slice(-a.value.length) !== a.value) return false;
    }
    return true;
  }
  // Returns the text (or attribute) of the first element matching the selector, or null.
  function selectText(html, selector) {
    var q = parseSelector(selector), parts = q.parts, last = parts[parts.length - 1];
    var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 };
    var re = /<!--[\s\S]*?-->|<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>|<(\/?)([a-zA-Z][\w:-]*)([^>]*)>/gi, m, stack = [], cap = null;
    function ancestorsMatch(stk) {
      var i = parts.length - 2, k = stk.length - 1;
      while (i >= 0 && k >= 0) { if (matchCompound(parts[i], stk[k])) i--; k--; }
      return i < 0;
    }
    function textOf(s) { return decodeEntities(s.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); }
    while ((m = re.exec(html))) {
      if (!m[3]) continue;
      var tag = m[3].toLowerCase();
      if (m[2] === '/') {
        var idx = -1; for (var i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { idx = i; break; }
        if (idx < 0) continue;
        if (cap && idx <= cap.depth) return textOf(html.slice(cap.start, m.index));
        stack.length = idx;
        continue;
      }
      var el = { tag: tag, attrs: parseAttrs(m[4]) };
      if (!cap && matchCompound(last, el) && ancestorsMatch(stack)) {
        if (q.attr) return el.attrs[q.attr] != null ? el.attrs[q.attr] : null;
        if (VOID[tag] || /\/\s*$/.test(m[4])) { if (el.attrs.content != null) return el.attrs.content; if (el.attrs.value != null) return el.attrs.value; continue; }
        cap = { start: re.lastIndex, depth: stack.length };
      }
      if (!VOID[tag] && !/\/\s*$/.test(m[4])) stack.push(el);
    }
    return cap ? textOf(html.slice(cap.start)) : null;
  }

  // Try the selector first (if given), then JSON-LD, then meta/itemprop.
  function extractPrice(html, selector) {
    if (selector) {
      var t = selectText(html, selector);
      if (t != null) { var n = parsePrice(t); if (!isNaN(n)) return { price: n, currency: '', method: 'selector', text: String(t).slice(0, 80) }; }
    }
    return findJsonLdPrice(html) || findMetaPrice(html) || null;
  }

  // robots.txt: is `path` allowed for our user agent? Longest matching rule wins; Allow wins ties. Supports * and $.
  function robotsAllowed(robotsTxt, path, agentToken) {
    var groups = [], cur = null, lastWasAgent = false;
    String(robotsTxt || '').split(/\r?\n/).forEach(function (line) {
      var l = line.replace(/#.*/, '').trim(), m = l.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) return;
      var k = m[1].toLowerCase(), v = m[2].trim();
      if (k === 'user-agent') { if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; return; }
      lastWasAgent = false;
      if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push({ allow: k === 'allow', path: v });
    });
    var token = String(agentToken || '').toLowerCase();
    var mine = groups.filter(function (g) { return g.agents.some(function (a) { return a !== '*' && token.indexOf(a) >= 0; }); });
    if (!mine.length) mine = groups.filter(function (g) { return g.agents.indexOf('*') >= 0; });
    var best = null;
    mine.forEach(function (g) {
      g.rules.forEach(function (r) {
        if (!r.path) return;
        var re = new RegExp('^' + r.path.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$|\$$/, '$'));
        if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
      });
    });
    return best ? best.allow : true;
  }

  var EMBED = [decodeEntities, parsePrice, parseAttrs, findJsonLdPrice, findMetaPrice, parseSelector, matchCompound, selectText, extractPrice, robotsAllowed];

  // ---------- config + generators ----------
  function validUrl(u) { return /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(String(u || '').trim()); }
  function normalise(cfg) {
    cfg = cfg || {};
    var products = (cfg.products || []).filter(function (p) { return p && validUrl(p.url); }).map(function (p) {
      var o = { name: String(p.name || '').trim() || String(p.url).replace(/^https?:\/\/(www\.)?/, '').slice(0, 60), url: String(p.url).trim(), group: String(p.group || '').trim(), mine: !!p.mine };
      if (p.selector && String(p.selector).trim()) o.selector = String(p.selector).trim();
      if (p.useBrowser) o.useBrowser = true;
      return o;
    });
    var thr = cfg.threshold == null || cfg.threshold === '' || isNaN(cfg.threshold) ? 1 : Math.max(0, Math.min(100, +cfg.threshold));
    return { products: products, threshold: thr, hour: cfg.hour == null ? 7 : +cfg.hour, minute: cfg.minute == null ? 23 : +cfg.minute, tzOffset: +cfg.tzOffset || 0, tzName: cfg.tzName || 'UTC',
      schedule: cfg.schedule === 'twice' || cfg.schedule === 'weekly' ? cfg.schedule : 'daily', weekday: cfg.weekday == null ? 1 : +cfg.weekday, contact: String(cfg.contact || '').trim() };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function cron(cfg) {
    var c = normalise(cfg), utc = c.hour * 60 + c.minute - c.tzOffset, shift = 0;
    while (utc < 0) { utc += 1440; shift--; } while (utc >= 1440) { utc -= 1440; shift++; }
    var h = Math.floor(utc / 60), m = utc % 60, when = (c.hour % 12 || 12) + ':' + pad(c.minute) + (c.hour < 12 ? ' am ' : ' pm ') + c.tzName;
    if (c.schedule === 'twice') return { cron: m + ' ' + h + ',' + ((h + 12) % 24) + ' * * *', text: 'twice a day, at ' + when + ' and 12 hours later' };
    if (c.schedule === 'weekly') { var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; return { cron: m + ' ' + h + ' * * ' + (((c.weekday + shift) % 7) + 7) % 7, text: 'every ' + DAYS[c.weekday] + ' at ' + when }; }
    return { cron: m + ' ' + h + ' * * *', text: 'every day at ' + when };
  }
  function needsBrowser(c) { return c.products.some(function (p) { return p.useBrowser; }); }

  function genProductsJson(cfg) {
    var c = normalise(cfg);
    return JSON.stringify({
      _help: 'One entry per product page. selector is optional: leave it out and the price is read from the page\'s structured data (JSON-LD or meta tags). group links your product to competitors selling the same thing; set mine: true on yours. threshold = % change that opens an issue.',
      settings: { threshold: c.threshold, contact: c.contact },
      products: c.products
    }, null, 2) + '\n';
  }

  function genWorkflow(cfg) {
    var c = normalise(cfg), cr = cron(c), V = VERSIONS, br = needsBrowser(c);
    return [
      '# Competitor price watcher — made with Brahaspati (free, runs on GitHub Actions).',
      '# Runs ' + cr.text + ' (GitHub uses UTC; scheduled runs can start a few minutes late).',
      '# Edit watcher/products.json to change what is watched. Run now: Actions tab → Price watcher → Run workflow.',
      'name: Price watcher',
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
      '  group: price-watcher',
      '  cancel-in-progress: false',
      '',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 20',
      '    steps:',
      '      - name: Check out this repository',
      '        uses: actions/checkout@' + V.checkout,
      '',
      '      - name: Set up Node.js',
      '        uses: actions/setup-node@' + V.setupNode,
      '        with:',
      "          node-version: '" + V.node + "'",
      ''
    ].concat(br ? [
      '      - name: Install a headless browser (only because some products have "useBrowser": true)',
      '        run: |',
      '          npm install --no-save --no-package-lock --no-audit --no-fund playwright@' + V.playwright,
      '          npx playwright install --with-deps chromium',
      ''
    ] : []).concat([
      '      - name: Check prices',
      '        id: check',
      '        run: node watcher/watch.js',
      '',
      '      - name: Save prices.csv to the repository',
      '        run: |',
      '          git config user.name "github-actions[bot]"',
      '          git config user.email "41898283+github-actions[bot]@users.noreply.github.com"',
      '          git add watcher/prices.csv',
      '          if git diff --cached --quiet; then',
      '            echo "Nothing new to save."',
      '          else',
      '            git commit -m "Price watcher: $(date -u +\'%Y-%m-%d %H:%M\') UTC"',
      '            git push',
      '          fi',
      '',
      '      - name: Open or update an issue when a price moved',
      "        if: steps.check.outputs.changed == 'true'",
      '        uses: actions/github-script@' + V.githubScript,
      '        with:',
      '          script: |',
      "            const fs = require('fs');",
      "            const body = fs.readFileSync('watcher/report.md', 'utf8');",
      "            const label = 'price-watch';",
      "            try { await github.rest.issues.createLabel({ ...context.repo, name: label, color: '1f7a46', description: 'Competitor price watcher' }); } catch (e) { /* label already exists */ }",
      "            const open = await github.rest.issues.listForRepo({ ...context.repo, state: 'open', labels: label, per_page: 1 });",
      '            if (open.data.length) {',
      '              await github.rest.issues.createComment({ ...context.repo, issue_number: open.data[0].number, body });',
      "              core.notice('Added a comment to issue #' + open.data[0].number);",
      '            } else {',
      "              const made = await github.rest.issues.create({ ...context.repo, title: 'Competitor price change', body, labels: [label] });",
      "              core.notice('Opened issue #' + made.data.number);",
      '            }',
      ''
    ]).join('\n');
  }

  function genWatchJs() {
    var L = [];
    function w(s) { L.push(s); }
    w('// Competitor price watcher — made with Brahaspati. Runs inside GitHub Actions (see .github/workflows/price-watcher.yml),');
    w('// or locally with Node 18+: node watcher/watch.js. No packages needed (Playwright only for products with "useBrowser": true).');
    w('// For each product in watcher/products.json it fetches the page politely (one at a time, a few seconds apart, honest');
    w('// user agent, respects robots.txt), reads the price, appends a row to watcher/prices.csv and writes watcher/report.md.');
    w("'use strict';");
    w("const fs = require('fs');");
    w("const path = require('path');");
    w('');
    w("const DIR = process.env.WATCHER_DIR || __dirname;");
    w("const CONFIG_FILE = path.join(DIR, 'products.json');");
    w("const CONFIG = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : null;");
    w("const CSV = path.join(DIR, 'prices.csv');");
    w("const DELAY_MS = process.env.WATCHER_DELAY_MS != null ? +process.env.WATCHER_DELAY_MS : 4000;");
    w("const S = Object.assign({ threshold: 1, contact: '' }, (CONFIG && CONFIG.settings) || {});");
    w("const UA = " + JSON.stringify(TOOL_UA) + " + (S.contact ? ' contact: ' + S.contact : '');");
    w("const HEADER = 'checked_at,product,group,mine,url,price,currency,method,status,note';");
    w('');
    w('// ---- price extraction (same code as the Brahaspati page, tested there) ----');
    EMBED.forEach(function (fn) { w(fn.toString()); w(''); });
    w('// ---- CSV ----');
    w("function cell(v) { v = v == null ? '' : String(v); return /[\",\\n\\r]/.test(v) ? '\"' + v.replace(/\"/g, '\"\"') + '\"' : v; }");
    w('function parseCsv(text) {');
    w("  const rows = []; let row = [], f = '', q = false;");
    w('  for (let i = 0; i < text.length; i++) {');
    w('    const c = text[i];');
    w("    if (q) { if (c === '\"') { if (text[i + 1] === '\"') { f += '\"'; i++; } else q = false; } else f += c; }");
    w("    else if (c === '\"') q = true; else if (c === ',') { row.push(f); f = ''; }");
    w("    else if (c === '\\n' || c === '\\r') { if (c === '\\r' && text[i + 1] === '\\n') i++; row.push(f); rows.push(row); row = []; f = ''; }");
    w('    else f += c;');
    w('  }');
    w("  if (f !== '' || row.length) { row.push(f); rows.push(row); }");
    w("  return rows.filter((r) => !(r.length === 1 && r[0] === ''));");
    w('}');
    w('function lastPrices() {');
    w("  if (!fs.existsSync(CSV)) return {};");
    w("  const rows = parseCsv(fs.readFileSync(CSV, 'utf8')), head = rows.shift() || [], out = {};");
    w("  const iP = head.indexOf('product'), iPrice = head.indexOf('price'), iS = head.indexOf('status'), iU = head.indexOf('url');");
    w("  for (const r of rows) if (r[iS] === 'ok' && r[iPrice] !== '') out[r[iP] + '|' + r[iU]] = +r[iPrice];");
    w('  return out;');
    w('}');
    w('');
    w('// ---- fetching ----');
    w('const sleep = (ms) => new Promise((r) => setTimeout(r, ms));');
    w('const robotsCache = {};');
    w('async function get(url, accept) {');
    w('  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 30000);');
    w("  try { return await fetch(url, { headers: { 'User-Agent': UA, Accept: accept || 'text/html,application/xhtml+xml', 'Accept-Language': 'en-AU,en;q=0.8' }, redirect: 'follow', signal: ctrl.signal }); }");
    w('  finally { clearTimeout(t); }');
    w('}');
    w('async function allowed(url) {');
    w('  const u = new URL(url);');
    w('  if (!(u.origin in robotsCache)) {');
    w("    try { const r = await get(u.origin + '/robots.txt', 'text/plain'); robotsCache[u.origin] = r.ok ? await r.text() : ''; } catch (e) { robotsCache[u.origin] = ''; }");
    w('  }');
    w("  return robotsAllowed(robotsCache[u.origin], u.pathname + u.search, 'BrahaspatiPriceWatcher');");
    w('}');
    w('async function pageHtml(p) {');
    w('  if (p.useBrowser) {');
    w("    let chromium; try { ({ chromium } = require('playwright')); } catch (e) { throw new Error('This product needs \"useBrowser\" but Playwright is not installed'); }");
    w('    const browser = await chromium.launch();');
    w("    try { const page = await browser.newPage({ userAgent: UA }); await page.goto(p.url, { waitUntil: 'networkidle', timeout: 45000 }); return await page.content(); }");
    w('    finally { await browser.close(); }');
    w('  }');
    w('  const res = await get(p.url);');
    w("  if (!res.ok) throw new Error('HTTP ' + res.status);");
    w('  return await res.text();');
    w('}');
    w('');
    w('async function main() {');
    w("  if (!CONFIG) throw new Error('watcher/products.json not found next to watch.js');");
    w("  const products = (CONFIG.products || []).filter((p) => p && /^https?:\\/\\//i.test(p.url || ''));");
    w("  if (!products.length) throw new Error('No products with an http(s) URL in products.json');");
    w('  const before = lastPrices(), now = new Date().toISOString(), rows = [], changes = [], problems = [];');
    w('  let lastHost = null;');
    w('  for (const p of products) {');
    w('    const host = new URL(p.url).host;');
    w('    if (lastHost === host && DELAY_MS) await sleep(DELAY_MS);');
    w('    lastHost = host;');
    w("    const row = { checked_at: now, product: p.name, group: p.group || '', mine: p.mine ? 'yes' : '', url: p.url, price: '', currency: '', method: '', status: 'ok', note: '' };");
    w('    try {');
    w("      if (!(await allowed(p.url))) { row.status = 'skipped'; row.note = 'robots.txt asks tools not to fetch this page'; }");
    w('      else {');
    w('        const r = extractPrice(await pageHtml(p), p.selector);');
    w("        if (!r) { row.status = 'not-found'; row.note = p.selector ? 'selector matched no price; no structured data either' : 'no JSON-LD/meta price; add a CSS selector'; }");
    w('        else { row.price = r.price; row.currency = r.currency; row.method = r.method; }');
    w('      }');
    w("    } catch (e) { row.status = 'error'; row.note = String(e.message || e).split('\\n')[0].slice(0, 160); }");
    w('    rows.push(row);');
    w("    const prev = before[p.name + '|' + p.url];");
    w("    if (row.status === 'ok' && prev != null && prev !== row.price) {");
    w('      const pct = prev ? ((row.price - prev) / prev) * 100 : 100;');
    w('      if (Math.abs(pct) >= S.threshold) changes.push({ p, prev, price: row.price, pct });');
    w('    }');
    w("    if (row.status !== 'ok') problems.push(row);");
    w("    console.log((row.status === 'ok' ? 'OK      ' : row.status.toUpperCase().padEnd(8)) + p.name + ': ' + (row.price !== '' ? row.price + ' ' + row.currency + ' via ' + row.method : row.note));");
    w('  }');
    w('  const keys = HEADER.split(\',\');');
    w("  if (!fs.existsSync(CSV)) fs.writeFileSync(CSV, HEADER + '\\n');");
    w("  fs.appendFileSync(CSV, rows.map((r) => keys.map((k) => cell(r[k])).join(',')).join('\\n') + '\\n');");
    w('');
    w("  const money = (n) => (Math.round(n * 100) / 100).toFixed(2);");
    w("  const md = ['## Price watcher — ' + now.slice(0, 10), ''];");
    w("  if (changes.length) { md.push('| Product | Was | Now | Change |', '| --- | ---: | ---: | ---: |'); for (const c of changes) md.push('| [' + c.p.name + '](' + c.p.url + ')' + (c.p.mine ? ' (yours)' : '') + ' | ' + money(c.prev) + ' | ' + money(c.price) + ' | ' + (c.pct > 0 ? '🔺 +' : '🔻 ') + c.pct.toFixed(1) + '% |'); md.push(''); }");
    w('  // undercut check per group: competitors now cheaper than your product');
    w('  const groups = {};');
    w("  for (const r of rows) if (r.status === 'ok' && r.group) (groups[r.group] = groups[r.group] || []).push(r);");
    w('  for (const g of Object.keys(groups)) {');
    w("    const mine = groups[g].find((r) => r.mine === 'yes'); if (!mine) continue;");
    w("    const cheaper = groups[g].filter((r) => r.mine !== 'yes' && r.price < mine.price);");
    w("    if (cheaper.length) md.push('**' + g + ':** your price ' + money(mine.price) + ' is undercut by ' + cheaper.map((r) => r.product + ' (' + money(r.price) + ')').join(', ') + '.', '');");
    w('  }');
    w("  if (problems.length) md.push('<details><summary>' + problems.length + ' page(s) could not be read</summary>', '', ...problems.map((r) => '- ' + r.product + ': ' + r.status + ' — ' + r.note), '', '</details>');");
    w("  md.push('', 'Full history: `watcher/prices.csv` — load it in the Brahaspati Price Watcher page for charts.');");
    w("  fs.writeFileSync(path.join(DIR, 'report.md'), md.join('\\n') + '\\n');");
    w('  const changed = changes.length > 0;');
    w("  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'changed=' + changed + '\\n');");
    w("  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\\n') + '\\n');");
    w("  console.log(changed ? changes.length + ' price change(s) — an issue will be opened or updated.' : 'No price changes above ' + S.threshold + '%.');");
    w('}');
    w('');
    w('if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });');
    w('module.exports = { extractPrice, parsePrice, selectText, robotsAllowed };');
    return L.join('\n') + '\n';
  }

  // ---------- analyser (prices.csv) ----------
  // rows: array of objects with checked_at, product, group, mine, url, price, currency, status
  function analyse(rows, opts) {
    opts = opts || {};
    var by = {};
    (rows || []).forEach(function (r) {
      var name = String(r.product || '').trim(); if (!name) return;
      var p = by[name] || (by[name] = { name: name, group: '', mine: false, url: r.url || '', currency: '', series: [], errors: 0 });
      if (r.group) p.group = String(r.group).trim();
      if (/^(yes|true|1|y)$/i.test(String(r.mine || '').trim())) p.mine = true;
      if (r.currency) p.currency = r.currency;
      var ok = !r.status || r.status === 'ok', price = parsePrice(r.price);
      if (!ok || isNaN(price)) { p.errors++; return; }
      p.series.push({ t: String(r.checked_at || r.date || ''), price: price });
    });
    var products = Object.keys(by).map(function (k) { return by[k]; }), changes = [];
    products.forEach(function (p) {
      p.series.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
      var prices = p.series.map(function (s) { return s.price; });
      p.count = prices.length;
      if (!prices.length) { p.min = p.max = p.avg = p.latest = p.first = NaN; return; }
      p.min = Math.min.apply(null, prices); p.max = Math.max.apply(null, prices);
      p.avg = prices.reduce(function (s, x) { return s + x; }, 0) / prices.length;
      p.first = prices[0]; p.latest = prices[prices.length - 1]; p.latestAt = p.series[p.series.length - 1].t;
      p.changePct = p.first ? (p.latest - p.first) / p.first : 0;
      p.changes = 0;
      for (var i = 1; i < p.series.length; i++) {
        var a = p.series[i - 1].price, b = p.series[i].price;
        if (a !== b) { p.changes++; changes.push({ t: p.series[i].t, product: p.name, group: p.group, mine: p.mine, from: a, to: b, diff: b - a, pct: a ? (b - a) / a : 0 }); }
      }
      p.lastChange = changes.filter(function (c) { return c.product === p.name; }).pop() || null;
    });
    changes.sort(function (a, b) { return a.t < b.t ? 1 : a.t > b.t ? -1 : 0; });
    // your price vs competitors (latest)
    var groups = {}, undercuts = [];
    products.forEach(function (p) { if (p.group) (groups[p.group] = groups[p.group] || []).push(p); });
    var compare = Object.keys(groups).map(function (g) {
      var list = groups[g].filter(function (p) { return !isNaN(p.latest); }), mine = list.filter(function (p) { return p.mine; })[0] || null;
      var comps = list.filter(function (p) { return !p.mine; }), cheapest = comps.slice().sort(function (a, b) { return a.latest - b.latest; })[0] || null;
      if (mine) comps.forEach(function (c) { if (c.latest < mine.latest) undercuts.push({ group: g, competitor: c.name, theirs: c.latest, yours: mine.latest, diff: mine.latest - c.latest, pct: (mine.latest - c.latest) / mine.latest }); });
      var avg = comps.length ? comps.reduce(function (s, c) { return s + c.latest; }, 0) / comps.length : NaN;
      return { group: g, mine: mine, competitors: comps, cheapest: cheapest, compAvg: avg, position: mine ? 1 + comps.filter(function (c) { return c.latest < mine.latest; }).length : null, of: list.length };
    });
    undercuts.sort(function (a, b) { return b.pct - a.pct; });
    return { products: products, changes: changes, compare: compare, undercuts: undercuts };
  }
  // Daily series for a chart: [{name, points:[{t, price}]}] keeping the last reading per product per day.
  function chartSeries(products) {
    return products.map(function (p) {
      var day = {}; p.series.forEach(function (s) { day[s.t.slice(0, 10)] = s.price; });
      return { name: p.name, mine: p.mine, group: p.group, points: Object.keys(day).sort().map(function (d) { return { t: d, price: day[d] }; }) };
    });
  }
  // Convert a GitHub file page URL to its raw URL (https://github.com/u/r/blob/main/watcher/prices.csv -> raw.githubusercontent.com/u/r/main/watcher/prices.csv)
  function rawUrl(u) {
    u = String(u || '').trim();
    var m = u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/);
    if (m) return 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3].replace(/\?.*$/, '');
    return u;
  }

  function sample() {
    var cfg = {
      products: [
        { name: 'Our 18V drill kit', url: 'https://www.example.com/products/drill-kit', group: '18V drill kit', mine: true },
        { name: 'ToolBarn drill kit', url: 'https://www.example.org/p/18v-drill', group: '18V drill kit', selector: '.product-price .amount' },
        { name: 'HardwareHub drill kit', url: 'https://shop.example.net/drill-18v', group: '18V drill kit' },
        { name: 'Our linen apron', url: 'https://www.example.com/products/apron', group: 'Linen apron', mine: true },
        { name: 'Studio Goods apron', url: 'https://example.org/apron', group: 'Linen apron', selector: '#price@data-price' }
      ], threshold: 2, hour: 7, minute: 23, tzOffset: 600, tzName: 'Brisbane time'
    };
    var rows = [], start = Date.UTC(2026, 8, 1);
    var plan = {
      'Our 18V drill kit': function (d) { return d < 40 ? 199 : 189; },
      'ToolBarn drill kit': function (d) { return d < 20 ? 209 : d < 45 ? 195 : 179; },
      'HardwareHub drill kit': function (d) { return d % 30 < 7 ? 189 : 205; },
      'Our linen apron': function () { return 59; },
      'Studio Goods apron': function (d) { return d < 50 ? 65 : 62; }
    };
    for (var d = 0; d < 68; d++) {
      var t = new Date(start + d * 86400000 + 21 * 3600000 + 23 * 60000).toISOString();
      cfg.products.forEach(function (p) {
        var fail = p.name === 'HardwareHub drill kit' && d === 33;
        rows.push({ checked_at: t, product: p.name, group: p.group, mine: p.mine ? 'yes' : '', url: p.url, price: fail ? '' : plan[p.name](d).toFixed(2), currency: 'AUD', method: p.selector ? 'selector' : 'json-ld', status: fail ? 'error' : 'ok', note: fail ? 'HTTP 503' : '' });
      });
    }
    return { cfg: cfg, rows: rows };
  }

  var L = { VERSIONS: VERSIONS, TOOL_UA: TOOL_UA, decodeEntities: decodeEntities, parsePrice: parsePrice, parseAttrs: parseAttrs, findJsonLdPrice: findJsonLdPrice, findMetaPrice: findMetaPrice,
    parseSelector: parseSelector, selectText: selectText, extractPrice: extractPrice, robotsAllowed: robotsAllowed, validUrl: validUrl, normalise: normalise, cron: cron,
    genProductsJson: genProductsJson, genWorkflow: genWorkflow, genWatchJs: genWatchJs, analyse: analyse, chartSeries: chartSeries, rawUrl: rawUrl, sample: sample };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.PriceWatchLib = L;
})(this);
