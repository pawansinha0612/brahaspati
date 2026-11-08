/* Website Health Checker — pure logic (no DOM). Browser: window.SiteHealthLib. Node: require('./lib.js').
   Turns a Google PageSpeed Insights v5 response into plain-English findings, grades pasted response headers,
   and pulls links out of pasted HTML. */
(function (root) {
  'use strict';
  var PSI = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
  var CATS = [['performance', 'Performance'], ['accessibility', 'Accessibility'], ['best-practices', 'Best practices'], ['seo', 'SEO']];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------- URL handling ----------
  function normaliseUrl(input) {
    var s = String(input || '').trim();
    if (!s) return { error: 'Type a website address, for example example.com.au' };
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
    var u; try { u = new URL(s); } catch (e) { return { error: 'That does not look like a web address.' }; }
    if (!/^https?:$/.test(u.protocol)) return { error: 'Only http:// and https:// addresses can be checked.' };
    var h = u.hostname;
    if (!/\./.test(h) || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[)/.test(h) || /\.(local|internal|lan)$/.test(h))
      return { error: 'Google can only test public websites. Local and private addresses cannot be reached from the internet.' };
    return { url: u.href };
  }
  function psiUrl(url, strategy, key) {
    var q = '?url=' + encodeURIComponent(url) + CATS.map(function (c) { return '&category=' + c[0]; }).join('') + '&strategy=' + (strategy === 'desktop' ? 'desktop' : 'mobile');
    return PSI + q + (key ? '&key=' + encodeURIComponent(key) : '');
  }
  function friendlyError(status, body) {
    var msg = (body && body.error && body.error.message) || '';
    if (/per day/i.test(msg) && /quota/i.test(msg)) return 'Google\'s shared daily limit for tests without a key is used up. Add your own free API key (see "Use your own free Google key" below) and try again. It takes about two minutes to get one.';
    if (status === 429 || /quota|rate limit/i.test(msg)) return 'Google\'s free test limit is busy right now. Wait a minute and try again, or add your own free API key below.';
    if (/FAILED_DOCUMENT_REQUEST|ERRORED_DOCUMENT_REQUEST|NO_FCP|DNS_FAILURE|unable to resolve/i.test(msg)) return 'Google could not load that page. Check the address works in a normal browser, and that the site is public (not behind a login or firewall).';
    if (/API key not valid|API_KEY_INVALID/i.test(msg)) return 'That API key was rejected by Google. Check it, or clear it to use the free shared limit.';
    if (status === 400) return 'Google rejected the request: ' + (msg || 'bad request') + '.';
    if (status >= 500) return 'Google\'s test service had a problem (error ' + status + '). Try again in a minute.';
    return msg || ('The test failed (error ' + status + ').');
  }

  // ---------- grading ----------
  function scoreRating(score) { return score == null ? 'na' : score >= 90 ? 'good' : score >= 50 ? 'needs-work' : 'poor'; }
  var VITALS = [
    { id: 'largest-contentful-paint', field: 'LARGEST_CONTENTFUL_PAINT_MS', key: 'LCP', label: 'Largest Contentful Paint', unit: 'ms', good: 2500, poor: 4000, core: true, what: 'How long until the main content (usually the biggest image or heading) appears.' },
    { id: null, field: 'INTERACTION_TO_NEXT_PAINT', key: 'INP', label: 'Interaction to Next Paint', unit: 'ms', good: 200, poor: 500, core: true, what: 'How quickly the page reacts when someone taps or clicks. Only measured from real visitors.' },
    { id: 'cumulative-layout-shift', field: 'CUMULATIVE_LAYOUT_SHIFT_SCORE', key: 'CLS', label: 'Cumulative Layout Shift', unit: '', good: 0.1, poor: 0.25, core: true, what: 'How much things jump around while the page loads.' },
    { id: 'total-blocking-time', field: null, key: 'TBT', label: 'Total Blocking Time', unit: 'ms', good: 200, poor: 600, what: 'Lab stand-in for INP: how long the page is too busy to respond.' },
    { id: 'first-contentful-paint', field: 'FIRST_CONTENTFUL_PAINT_MS', key: 'FCP', label: 'First Contentful Paint', unit: 'ms', good: 1800, poor: 3000, what: 'How long until anything at all appears.' },
    { id: 'speed-index', field: null, key: 'SI', label: 'Speed Index', unit: 'ms', good: 3400, poor: 5800, what: 'How quickly the visible part of the page fills in.' }
  ];
  function rate(v, good, poor) { return v == null || isNaN(v) ? 'na' : v <= good ? 'good' : v <= poor ? 'needs-work' : 'poor'; }
  function fmtMetric(v, unit) {
    if (v == null || isNaN(v)) return '–';
    if (unit === 'ms') return v >= 1000 ? (v / 1000).toFixed(1) + ' s' : Math.round(v) + ' ms';
    return (Math.round(v * 1000) / 1000).toString();
  }

  // ---------- plain-English fixes ----------
  var FIX = {
    'render-blocking-resources': 'Stylesheets or scripts in the page head stop it from drawing. Inline the small amount of CSS needed for the top of the page, and add "defer" to scripts.',
    'render-blocking': 'Stylesheets or scripts in the page head stop it from drawing. Inline the small amount of CSS needed for the top of the page, and add "defer" to scripts.',
    'unused-javascript': 'The page downloads JavaScript it never uses. Remove unused plugins and widgets, and load the rest only on pages that need it.',
    'unused-css-rules': 'Lots of CSS is downloaded but not used on this page. Remove unused theme or plugin styles.',
    'uses-optimized-images': 'Images are larger than they need to be. Compress them (for example with Squoosh or TinyPNG) before uploading.',
    'modern-image-formats': 'Save images as WebP or AVIF instead of JPEG/PNG. They are usually 25–50% smaller.',
    'image-delivery': 'Images are bigger than needed. Compress them, save as WebP/AVIF, and size them to how they are shown.',
    'uses-responsive-images': 'Big images are sent to small screens. Upload smaller versions and use srcset so phones get a phone-sized image.',
    'offscreen-images': 'Images below the fold load straight away. Add loading="lazy" to images further down the page.',
    'unminified-javascript': 'JavaScript files are not minified. Turn on minification in your build tool, CDN or caching plugin.',
    'unminified-css': 'CSS files are not minified. Turn on minification in your build tool, CDN or caching plugin.',
    'uses-text-compression': 'Text files are sent uncompressed. Turn on gzip or Brotli compression on your server or CDN.',
    'server-response-time': 'The server is slow to send the first byte. Use page caching, a CDN or better hosting.',
    'document-latency': 'The server is slow to send the page or uses redirects and no compression. Use page caching, a CDN and gzip/Brotli.',
    'redirects': 'The page goes through redirects before loading. Link straight to the final address.',
    'uses-long-cache-ttl': 'Files are not cached for long, so repeat visitors download them again. Set long cache lifetimes for images, CSS and JS.',
    'cache': 'Files are not cached for long, so repeat visitors download them again. Set long cache lifetimes for images, CSS and JS.',
    'total-byte-weight': 'The page is very heavy to download. Shrink images and video, and remove unneeded scripts.',
    'dom-size': 'The page has a very large number of HTML elements. Simplify the layout and remove hidden or duplicate sections.',
    'bootup-time': 'JavaScript takes a long time to run. Remove heavy plugins, chat widgets or trackers you do not need.',
    'mainthread-work-breakdown': 'The browser is kept busy for a long time. Cut down JavaScript, especially third-party scripts.',
    'font-display': 'Text stays invisible while web fonts load. Add font-display: swap to your @font-face rules.',
    'third-party-summary': 'Third-party scripts (ads, chat, analytics) slow the page down. Remove ones you do not use and load the rest later.',
    'third-parties': 'Third-party scripts (ads, chat, analytics) slow the page down. Remove ones you do not use and load the rest later.',
    'lcp-lazy-loaded': 'The main image is lazy-loaded, which delays it. Remove loading="lazy" from the first big image.',
    'prioritize-lcp-image': 'The main image is found late. Preload it or add fetchpriority="high" to it.',
    'lcp-discovery': 'The main image is found late. Make it a normal <img> in the HTML, not lazy-loaded, with fetchpriority="high".',
    'unsized-images': 'Images have no width and height, so the page jumps as they load. Add width and height attributes.',
    'layout-shifts': 'Parts of the page move while loading. Reserve space for images, ads and embeds.',
    'cls-culprits': 'Parts of the page move while loading. Give images, ads and embeds a fixed size and avoid inserting content above what is already shown.',
    'efficient-animated-content': 'Animated GIFs are huge. Replace them with short MP4 or WebM videos.',
    'duplicated-javascript': 'The same JavaScript library is loaded more than once. Remove the duplicate.',
    'legacy-javascript': 'Old-browser code is sent to modern browsers. Update your build settings to target modern browsers.',
    'uses-rel-preconnect': 'Connections to other domains start late. Add <link rel="preconnect"> for your font and CDN domains.',
    'network-dependency-tree': 'Files load one after another in a long chain. Preload key files and reduce how many are needed up front.',
    'forced-reflow': 'Scripts force the browser to recalculate layout repeatedly. A developer should batch DOM reads and writes.',
    'viewport': 'The page is not set up for mobile. Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
    'interactive': 'The page takes a long time to become usable. Reduce JavaScript.',
    'color-contrast': 'Some text is hard to read against its background. Darken the text or lighten the background (aim for 4.5:1 contrast).',
    'image-alt': 'Some images have no alt text. Add a short description to every meaningful image (and alt="" to decorative ones).',
    'label': 'Some form fields have no label. Add a visible <label> to each field so screen readers can announce it.',
    'link-name': 'Some links have no readable text (for example icon-only links). Add text or an aria-label.',
    'button-name': 'Some buttons have no readable name. Add text or an aria-label.',
    'html-has-lang': 'The page does not say what language it is in. Add lang="en" to the <html> tag.',
    'html-lang-valid': 'The page language code is not valid. Use something like lang="en-AU".',
    'document-title': 'The page has no <title>. Add a clear, unique title (about 50–60 characters).',
    'heading-order': 'Headings skip levels (for example H1 then H4). Use headings in order so the structure makes sense.',
    'meta-viewport': 'Zooming is disabled. Remove user-scalable=no and maximum-scale from the viewport tag.',
    'target-size': 'Buttons and links are too small or close together to tap easily. Make them at least 24×24 pixels with space around.',
    'tap-targets': 'Buttons and links are too small or close together to tap easily. Make them at least 48×48 pixels.',
    'list': 'Lists contain items that are not list items. Fix the HTML so <ul>/<ol> only contain <li>.',
    'listitem': 'List items are used outside a list. Wrap them in <ul> or <ol>.',
    'frame-title': 'Embedded frames have no title. Add a title attribute to each <iframe>.',
    'select-name': 'Drop-down menus have no label. Add a <label> for each one.',
    'landmark-one-main': 'The page has no <main> area. Wrap the main content in <main>.',
    'aria-allowed-attr': 'Some ARIA attributes are used on the wrong elements. A developer should remove or correct them.',
    'aria-hidden-focus': 'Hidden content can still be reached with the keyboard. Remove it from the tab order.',
    'duplicate-id-aria': 'Some IDs used by labels are duplicated. Make every id unique.',
    'link-in-text-block': 'Links in paragraphs only differ by colour. Underline them so they stand out for colour-blind visitors.',
    'is-on-https': 'Some content loads over insecure http://. Serve everything over https://.',
    'redirects-http': 'The http:// version does not redirect to https://. Add a permanent redirect.',
    'errors-in-console': 'The page logs errors in the browser console. Ask your developer to fix them; they can break features.',
    'deprecations': 'The page uses browser features that are being removed. Update the code or plugins that use them.',
    'inspector-issues': 'The browser flagged problems (cookies, mixed content or security). Ask your developer to check DevTools → Issues.',
    'third-party-cookies': 'Third-party cookies are used, which browsers are blocking. Check embedded tools still work without them.',
    'image-aspect-ratio': 'Some images are stretched or squashed. Keep their original proportions.',
    'image-size-responsive': 'Some images are too low-resolution for sharp screens. Upload larger versions and use srcset.',
    'doctype': 'The page has no <!DOCTYPE html>, so browsers use quirks mode. Add it at the very top.',
    'charset': 'The character set is not declared early. Add <meta charset="utf-8"> near the top of <head>.',
    'csp-xss': 'There is no strong Content Security Policy. See the security headers section below.',
    'valid-source-maps': 'Large scripts have no source maps. This only matters for debugging.',
    'geolocation-on-start': 'The page asks for location as soon as it loads. Only ask after the visitor chooses a location feature.',
    'notification-on-start': 'The page asks to send notifications straight away. Only ask after the visitor shows interest.',
    'paste-preventing-inputs': 'Some fields block pasting, which hurts password managers. Allow paste.',
    'meta-description': 'There is no meta description. Add one (about 120–155 characters) that sells the page in search results.',
    'http-status-code': 'The page returns an error status code, so Google may not index it. Make sure it returns 200.',
    'link-text': 'Some links say things like "click here". Use descriptive link text such as "View our pricing".',
    'crawlable-anchors': 'Some links cannot be followed by Google (for example javascript: links). Use normal <a href="..."> links.',
    'is-crawlable': 'The page tells search engines not to index it (noindex). Remove that unless it is intentional.',
    'robots-txt': 'robots.txt has errors. Fix it so search engines read it correctly.',
    'hreflang': 'Language alternate links (hreflang) are invalid. Use valid language codes and full URLs.',
    'canonical': 'The canonical link is invalid or points somewhere odd. Point it to the preferred URL of this page.',
    'font-size': 'Text is too small to read on phones. Use at least 16px for body text.',
    'structured-data': 'Check your structured data with Google\'s Rich Results Test.'
  };
  function cleanDesc(s) { return String(s || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`/g, '').replace(/\s+/g, ' ').trim(); }
  function fixFor(audit) { var id = audit.id || ''; return FIX[id] || FIX[id.replace(/-insight$/, '')] || cleanDesc(audit.description); }

  var SKIP_MODES = { notApplicable: 1, manual: 1, informative: 1, error: 1 };
  function savingsOf(a) {
    var ms = 0;
    if (a.details && a.details.overallSavingsMs) ms = a.details.overallSavingsMs;
    if (a.metricSavings) {
      var s = a.metricSavings;
      ms = Math.max(ms, Math.max(s.LCP || 0, s.FCP || 0) + (s.TBT || 0) + (s.INP || 0) + (s.CLS || 0) * 4000); // LCP and FCP savings overlap, so take the larger
    }
    return ms;
  }
  function impactOf(catId, a, ref) {
    if (catId === 'performance') {
      var ms = savingsOf(a), w = ref.weight || 0;
      if (ms >= 1000 || w >= 10) return { level: 'high', rank: 3000 + ms };
      if (ms >= 300 || w > 0) return { level: 'medium', rank: 2000 + ms + w };
      return { level: 'low', rank: 1000 + ms + (1 - (a.score || 0)) * 100 };
    }
    var weight = ref.weight || 0;
    // Lighthouse weights differ by category: SEO uses ~1 for most checks (4 for crawlability), best practices 1–5, accessibility 1–10.
    var t = catId === 'seo' ? [4, 1] : catId === 'best-practices' ? [5, 2] : [7, 3];
    var level = weight >= t[0] ? 'high' : weight >= t[1] ? 'medium' : 'low';
    return { level: level, rank: weight * 100 + (1 - (a.score || 0)) * 10 };
  }

  /* PSI v5 JSON -> findings. Throws when the response has no lighthouseResult. */
  function transform(psi) {
    var lr = psi && psi.lighthouseResult;
    if (!lr) throw new Error((psi && psi.error && psi.error.message) || 'The response did not contain a Lighthouse report.');
    var audits = lr.audits || {}, cats = lr.categories || {};
    var out = { url: lr.finalDisplayedUrl || lr.finalUrl || lr.requestedUrl || psi.id, requestedUrl: lr.requestedUrl || psi.id, fetchTime: lr.fetchTime || psi.analysisUTCTimestamp,
      strategy: (lr.configSettings && lr.configSettings.formFactor) || 'mobile', lighthouseVersion: lr.lighthouseVersion || '', scores: [], vitals: [], field: null, failed: {}, checklists: {}, warnings: lr.runWarnings || [] };
    CATS.forEach(function (c) {
      var cat = cats[c[0]]; var s = cat && cat.score != null ? Math.round(cat.score * 100) : null;
      out.scores.push({ id: c[0], label: c[1], score: s, rating: scoreRating(s) });
    });
    // field data (real Chrome users, CrUX) — page level, else origin level
    var le = (psi.loadingExperience && psi.loadingExperience.metrics) ? psi.loadingExperience : (psi.originLoadingExperience && psi.originLoadingExperience.metrics ? psi.originLoadingExperience : null);
    if (le) out.field = { scope: le === psi.loadingExperience && !/^origin:/.test(le.id || '') && !le.origin_fallback ? 'This page' : 'Whole site (origin)', overall: le.overall_category || null, metrics: [] };
    VITALS.forEach(function (v) {
      var a = v.id ? audits[v.id] : null, lab = a && typeof a.numericValue === 'number' ? a.numericValue : null;
      var fm = le && v.field ? le.metrics[v.field] : null, fieldVal = fm ? (v.key === 'CLS' ? fm.percentile / 100 : fm.percentile) : null;
      out.vitals.push({ key: v.key, label: v.label, core: !!v.core, what: v.what, unit: v.unit, good: v.good, poor: v.poor,
        lab: lab, labText: fmtMetric(lab, v.unit), labRating: rate(lab, v.good, v.poor),
        field: fieldVal, fieldText: fmtMetric(fieldVal, v.unit), fieldRating: fieldVal == null ? 'na' : rate(fieldVal, v.good, v.poor) });
      if (fm && out.field) out.field.metrics.push({ key: v.key, label: v.label, value: fieldVal, text: fmtMetric(fieldVal, v.unit), category: fm.category });
    });
    CATS.forEach(function (c) {
      var cat = cats[c[0]]; out.failed[c[0]] = []; out.checklists[c[0]] = [];
      if (!cat) return;
      (cat.auditRefs || []).forEach(function (ref) {
        var a = audits[ref.id]; if (!a) return;
        if (ref.group === 'metrics' || ref.group === 'hidden') return;
        var mode = a.scoreDisplayMode;
        var passed = a.score === null || a.score === undefined ? null : a.score >= 0.9;
        if (!SKIP_MODES[mode]) out.checklists[c[0]].push({ id: a.id, title: a.title, passed: passed, weight: ref.weight || 0 });
        if (SKIP_MODES[mode] || passed !== false) return;
        var imp = impactOf(c[0], a, ref), ms = savingsOf(a);
        var items = a.details && a.details.items ? a.details.items.length : 0;
        out.failed[c[0]].push({ id: a.id, title: a.title, score: a.score, displayValue: a.displayValue || '', impact: imp.level, rank: imp.rank, savingsMs: Math.round(ms), items: items, fix: fixFor(a) });
      });
      out.failed[c[0]].sort(function (x, y) { return y.rank - x.rank; });
      out.checklists[c[0]].sort(function (x, y) { return (x.passed === false ? 0 : 1) - (y.passed === false ? 0 : 1) || y.weight - x.weight; });
    });
    // top fixes across all categories
    var all = [];
    CATS.forEach(function (c) { out.failed[c[0]].forEach(function (f) { all.push(Object.assign({ category: c[1] }, f)); }); });
    var order = { high: 0, medium: 1, low: 2 };
    out.top = all.sort(function (x, y) { return order[x.impact] - order[y.impact] || y.rank - x.rank; }).slice(0, 5);
    out.failedCount = all.length;
    return out;
  }

  // ---------- security headers ----------
  /* Parse `curl -sI` / DevTools output. With redirects (-L), only the last response block counts. */
  function parseHeaders(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n'), blocks = [], cur = null;
    lines.forEach(function (ln) {
      var st = ln.match(/^HTTP\/[\d.]+\s+(\d{3})/i);
      if (st) { cur = { status: +st[1], headers: {} }; blocks.push(cur); return; }
      var m = ln.match(/^([A-Za-z0-9-]+)\s*:\s*(.*)$/);
      if (!m) return;
      if (!cur) { cur = { status: null, headers: {} }; blocks.push(cur); }
      var k = m[1].toLowerCase(), v = m[2].trim();
      cur.headers[k] = cur.headers[k] ? cur.headers[k] + ', ' + v : v;
    });
    var last = blocks[blocks.length - 1] || { status: null, headers: {} };
    return { status: last.status, headers: last.headers, redirects: Math.max(0, blocks.length - 1) };
  }
  function cspDirectives(csp) {
    var d = {}; String(csp || '').split(';').forEach(function (p) { var t = p.trim().split(/\s+/); if (t[0]) d[t[0].toLowerCase()] = t.slice(1); }); return d;
  }
  function gradeHeaders(parsed) {
    var h = parsed.headers || {}, checks = [];
    function add(name, status, value, advice) { checks.push({ name: name, status: status, value: value || '', advice: advice }); }
    var hsts = h['strict-transport-security'];
    if (!hsts) add('Strict-Transport-Security (HSTS)', 'bad', '', 'Missing. Add "Strict-Transport-Security: max-age=31536000; includeSubDomains" so browsers always use https.');
    else {
      var ma = +((hsts.match(/max-age=(\d+)/i) || [])[1] || 0);
      if (ma >= 15552000) add('Strict-Transport-Security (HSTS)', 'ok', hsts, 'Good: browsers will insist on https for ' + Math.round(ma / 86400) + ' days.' + (/includesubdomains/i.test(hsts) ? '' : ' Consider adding includeSubDomains.'));
      else add('Strict-Transport-Security (HSTS)', 'warn', hsts, 'max-age is short (' + Math.round(ma / 86400) + ' days). Use at least 180 days, ideally max-age=31536000.');
    }
    var csp = h['content-security-policy'], cspRO = h['content-security-policy-report-only'], dir = cspDirectives(csp);
    if (!csp) add('Content-Security-Policy', cspRO ? 'warn' : 'bad', cspRO ? '(report-only) ' + cspRO : '', cspRO ? 'Only in report-only mode, so nothing is blocked yet. Switch to Content-Security-Policy once the reports are clean.' : 'Missing. A CSP limits where scripts can load from, which blunts cross-site scripting attacks. Start with a report-only policy and tighten it.');
    else {
      var scr = dir['script-src'] || dir['default-src'] || [];
      var weak = scr.indexOf("'unsafe-inline'") >= 0 && !scr.some(function (x) { return /^'(nonce|sha\d+)-/.test(x) || x === "'strict-dynamic'"; });
      if (!dir['script-src'] && !dir['default-src']) add('Content-Security-Policy', 'warn', csp, 'Present, but it does not restrict scripts (no script-src or default-src).');
      else if (weak || scr.indexOf("'unsafe-eval'") >= 0 || scr.indexOf('*') >= 0) add('Content-Security-Policy', 'warn', csp, 'Present but weak: it allows ' + (weak ? "'unsafe-inline' " : '') + (scr.indexOf("'unsafe-eval'") >= 0 ? "'unsafe-eval' " : '') + (scr.indexOf('*') >= 0 ? 'any domain ' : '') + 'scripts. Use nonces or hashes instead.');
      else add('Content-Security-Policy', 'ok', csp, 'Good: scripts are restricted.');
    }
    var xcto = h['x-content-type-options'];
    add('X-Content-Type-Options', /nosniff/i.test(xcto || '') ? 'ok' : 'bad', xcto, /nosniff/i.test(xcto || '') ? 'Good.' : 'Add "X-Content-Type-Options: nosniff" so browsers do not guess file types.');
    var xfo = h['x-frame-options'], fa = dir['frame-ancestors'];
    if (fa) add('Clickjacking (frame-ancestors / X-Frame-Options)', 'ok', 'frame-ancestors ' + fa.join(' ') + (xfo ? ' · X-Frame-Options: ' + xfo : ''), 'Good: CSP frame-ancestors controls who can embed the page.');
    else if (/^(deny|sameorigin)$/i.test((xfo || '').trim())) add('Clickjacking (frame-ancestors / X-Frame-Options)', 'ok', 'X-Frame-Options: ' + xfo, 'Good. You can also add "frame-ancestors \'self\'" to your CSP (the modern way).');
    else add('Clickjacking (frame-ancestors / X-Frame-Options)', 'bad', xfo || '', 'Other sites can embed this page in a frame and trick visitors into clicking. Add "X-Frame-Options: SAMEORIGIN" or CSP "frame-ancestors \'self\'".');
    var rp = (h['referrer-policy'] || '').toLowerCase().split(',').pop().trim();
    var strong = ['no-referrer', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin'];
    if (!rp) add('Referrer-Policy', 'warn', '', 'Missing. Modern browsers default to strict-origin-when-cross-origin, but set it explicitly: "Referrer-Policy: strict-origin-when-cross-origin".');
    else if (strong.indexOf(rp) >= 0) add('Referrer-Policy', 'ok', rp, 'Good.');
    else add('Referrer-Policy', rp === 'unsafe-url' ? 'bad' : 'warn', rp, 'This can leak full page addresses to other sites. Use strict-origin-when-cross-origin.');
    var pp = h['permissions-policy'] || h['feature-policy'];
    add('Permissions-Policy', pp ? 'ok' : 'warn', pp, pp ? 'Good: browser features like camera and location are restricted.' : 'Missing. Add, for example, "Permissions-Policy: camera=(), microphone=(), geolocation=()" to switch off features you do not use.');
    var leaks = ['server', 'x-powered-by', 'x-aspnet-version'].filter(function (k) { return h[k] && /\d/.test(h[k]); });
    if (leaks.length) add('Version information', 'warn', leaks.map(function (k) { return k + ': ' + h[k]; }).join(' · '), 'The server announces software versions, which helps attackers find known bugs. Hide version numbers.');
    var pts = { ok: 2, warn: 1, bad: 0 }, core = checks.slice(0, 6), got = core.reduce(function (s, c) { return s + pts[c.status]; }, 0);
    var pct = got / (core.length * 2);
    var grade = pct >= 0.92 ? 'A' : pct >= 0.75 ? 'B' : pct >= 0.58 ? 'C' : pct >= 0.4 ? 'D' : 'F';
    return { grade: grade, checks: checks, status: parsed.status, redirects: parsed.redirects, empty: !Object.keys(h).length };
  }
  function curlHeadersCmd(url) { return "curl -sIL '" + String(url).replace(/'/g, "'\\''") + "'"; }

  // ---------- links ----------
  function decodeEntities(s) { return s.replace(/&amp;/g, '&').replace(/&#0*38;/g, '&').replace(/&quot;/g, '"').replace(/&#x2F;/gi, '/').replace(/&#0*39;/g, "'"); }
  /* Extract links from pasted HTML. -> [{url, text, kind:'internal'|'external', tag}] unique, skips mailto/tel/javascript/#anchors */
  function extractLinks(html, baseUrl) {
    var out = [], seen = {}, base = null, src = String(html || '');
    var bm = src.match(/<base[^>]+href\s*=\s*["']([^"']+)["']/i);
    try { base = new URL(bm ? bm[1] : baseUrl, baseUrl || undefined); } catch (e) { try { base = baseUrl ? new URL(baseUrl) : null; } catch (e2) { base = null; } }
    var re = /<(a|img|link|script|iframe|source)\b([^>]*)>/gi, m;
    while ((m = re.exec(src))) {
      if (m[1].toLowerCase() === 'a') { var endA = src.toLowerCase().indexOf('</a>', re.lastIndex); m[3] = endA < 0 ? '' : src.slice(re.lastIndex, endA); } else m[3] = '';
      var tag = m[1].toLowerCase(), attrs = m[2];
      var attr = tag === 'a' || tag === 'link' ? 'href' : 'src';
      var am = attrs.match(new RegExp('\\b' + attr + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
      if (!am) continue;
      if (tag === 'link' && !/rel\s*=\s*["']?(stylesheet|icon|canonical|alternate|preload|manifest)/i.test(attrs)) continue;
      var raw = decodeEntities((am[1] != null ? am[1] : am[2] != null ? am[2] : am[3]).trim());
      if (!raw || /^(#|mailto:|tel:|javascript:|data:|sms:|about:)/i.test(raw)) continue;
      var abs; try { abs = base ? new URL(raw, base).href : new URL(raw).href; } catch (e) { continue; }
      if (!/^https?:/i.test(abs)) continue;
      abs = abs.replace(/#.*$/, '');
      if (seen[abs]) continue; seen[abs] = 1;
      var text = tag === 'a' ? m[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
      var host = ''; try { host = new URL(abs).host; } catch (e) {}
      out.push({ url: abs, text: text, tag: tag, kind: base && host === base.host ? 'internal' : 'external' });
    }
    return out;
  }
  function parseUrlList(text) {
    var seen = {}, out = [];
    String(text || '').split(/[\s,]+/).forEach(function (s) {
      s = s.trim().replace(/^[<("']+|[>)"',.;]+$/g, ''); if (!/^https?:\/\/\S+\.\S+/i.test(s) || seen[s]) return; seen[s] = 1; out.push(s);
    });
    return out;
  }
  function linkCheckScript(urls) {
    var list = urls.map(function (u) { return "'" + u.replace(/'/g, "'\\''") + "'"; }).join(' \\\n  ');
    return 'for u in \\\n  ' + list + '; do\n  printf \'%s  %s\\n\' "$(curl -s -o /dev/null -L --max-time 20 -A \'Mozilla/5.0 link-check\' -w \'%{http_code}\' "$u")" "$u"\ndone | sort';
  }
  function linkCheckWorkflow(url) {
    return 'name: Broken links\non:\n  schedule: [{ cron: "0 21 * * 0" }]   # every Monday 8am AEDT\n  workflow_dispatch:\njobs:\n  links:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: lycheeverse/lychee-action@v2\n        with:\n          args: --max-depth 1 --accept 200,204,301,302,429 \'' + url + '\'\n          fail: true\n';
  }

  // ---------- report ----------
  var RATING_TXT = { good: 'Good', 'needs-work': 'Needs work', poor: 'Poor', na: 'Not available' };
  var RATING_COL = { good: '#1f7a46', 'needs-work': '#a66300', poor: '#b42318', na: '#5d6270' };
  function reportHtml(r, opts) {
    opts = opts || {};
    var h = [];
    h.push('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Website health report — ' + esc(r.url) + '</title><style>' +
      'body{font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d1f24;margin:24px auto;max-width:900px;padding:0 16px}h1{font-size:24px;margin-bottom:4px}h2{font-size:18px;margin-top:30px;border-bottom:1px solid #ddd;padding-bottom:4px}' +
      '.scores{display:flex;gap:12px;flex-wrap:wrap}.sc{border:1px solid #ddd;border-radius:10px;padding:10px 14px;min-width:120px}.sc b{font-size:28px;display:block}' +
      'table{border-collapse:collapse;width:100%;margin:8px 0;font-size:13px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f3f1ea}.muted{color:#5d6270}' +
      '@media print{h2{page-break-after:avoid}tr{page-break-inside:avoid}}</style></head><body>');
    h.push('<h1>Website health report</h1><p><b>' + esc(r.url) + '</b><br><span class="muted">Tested ' + esc(String(r.fetchTime || '').replace('T', ' ').slice(0, 16)) + ' UTC · ' + esc(r.strategy) + ' · Google PageSpeed Insights (Lighthouse ' + esc(r.lighthouseVersion) + ')' + (opts.sample ? ' · EXAMPLE DATA' : '') + '</span></p>');
    h.push('<div class="scores">' + r.scores.map(function (s) { return '<div class="sc"><b style="color:' + RATING_COL[s.rating] + '">' + (s.score == null ? '–' : s.score) + '</b>' + esc(s.label) + '</div>'; }).join('') + '</div>');
    if (r.top.length) h.push('<h2>Fix these first</h2><ol>' + r.top.map(function (f) { return '<li><b>' + esc(f.title) + '</b> (' + esc(f.category) + ', ' + esc(f.impact) + ' impact)<br>' + esc(f.fix) + '</li>'; }).join('') + '</ol>');
    h.push('<h2>Core Web Vitals</h2><table><thead><tr><th>Metric</th><th>Lab test</th><th>Real visitors (28 days)</th><th>Good / poor at</th></tr></thead><tbody>' + r.vitals.map(function (v) {
      return '<tr><td><b>' + esc(v.label) + '</b> (' + v.key + ')' + (v.core ? ' ★' : '') + '<br><span class="muted">' + esc(v.what) + '</span></td><td style="color:' + RATING_COL[v.labRating] + '">' + esc(v.labText) + (v.labRating !== 'na' ? ' · ' + RATING_TXT[v.labRating] : '') + '</td><td style="color:' + RATING_COL[v.fieldRating] + '">' + esc(v.fieldText) + (v.fieldRating !== 'na' ? ' · ' + RATING_TXT[v.fieldRating] : '') + '</td><td>' + esc(fmtMetric(v.good, v.unit) + ' / ' + fmtMetric(v.poor, v.unit)) + '</td></tr>';
    }).join('') + '</tbody></table><p class="muted">★ Core Web Vitals used by Google search. "Real visitors" data comes from Chrome users and only exists for sites with enough traffic.</p>');
    CATS.forEach(function (c) {
      var list = r.failed[c[0]];
      h.push('<h2>' + esc(c[1]) + ': ' + (list.length ? list.length + ' thing' + (list.length === 1 ? '' : 's') + ' to fix' : 'no problems found') + '</h2>');
      if (list.length) h.push('<table><thead><tr><th>Issue</th><th>Impact</th><th>What to do</th></tr></thead><tbody>' + list.map(function (f) { return '<tr><td>' + esc(f.title) + (f.displayValue ? '<br><span class="muted">' + esc(f.displayValue) + '</span>' : '') + '</td><td>' + esc(f.impact) + '</td><td>' + esc(f.fix) + '</td></tr>'; }).join('') + '</tbody></table>');
    });
    if (opts.headers && !opts.headers.empty) {
      h.push('<h2>Security headers: grade ' + esc(opts.headers.grade) + '</h2><table><thead><tr><th>Header</th><th>Result</th><th>Advice</th></tr></thead><tbody>' + opts.headers.checks.map(function (c) { return '<tr><td>' + esc(c.name) + (c.value ? '<br><code class="muted">' + esc(c.value.slice(0, 160)) + '</code>' : '') + '</td><td>' + esc({ ok: 'Pass', warn: 'Improve', bad: 'Missing / fail' }[c.status]) + '</td><td>' + esc(c.advice) + '</td></tr>'; }).join('') + '</tbody></table>');
    }
    if (opts.links && opts.links.length) h.push('<h2>Links found (' + opts.links.length + ')</h2><p class="muted">Check these with the command line script from the tool; a browser cannot test other sites\' links directly.</p><table><tbody>' + opts.links.slice(0, 300).map(function (l) { return '<tr><td>' + esc(l.kind) + '</td><td>' + esc(l.url) + '</td></tr>'; }).join('') + '</tbody></table>');
    h.push('<p class="muted" style="margin-top:30px">Scores change a little between runs. Lab results come from a single simulated test; real-visitor data reflects the last 28 days. Prepared with Brahaspati Website Health Checker.</p></body></html>');
    return h.join('\n');
  }

  var L = {
    PSI: PSI, CATS: CATS, VITALS: VITALS, FIX: FIX, normaliseUrl: normaliseUrl, psiUrl: psiUrl, friendlyError: friendlyError, scoreRating: scoreRating, rate: rate, fmtMetric: fmtMetric,
    fixFor: fixFor, transform: transform, parseHeaders: parseHeaders, gradeHeaders: gradeHeaders, curlHeadersCmd: curlHeadersCmd, extractLinks: extractLinks, parseUrlList: parseUrlList,
    linkCheckScript: linkCheckScript, linkCheckWorkflow: linkCheckWorkflow, reportHtml: reportHtml, RATING_TXT: RATING_TXT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.SiteHealthLib = L;
})(this);
