/* Hand-written, trimmed PageSpeed Insights v5 response (Lighthouse 12 shape) for a made-up café website.
   Used by "Load sample data" and by tests/site-health.test.js. Not a real test result. */
(function (root) {
  'use strict';
  function ref(id, weight, group) { var r = { id: id, weight: weight }; if (group) r.group = group; return r; }
  var S = {
    captchaResult: 'CAPTCHA_NOT_NEEDED',
    kind: 'pagespeedonline#result',
    id: 'https://www.harbourcafe.example/',
    analysisUTCTimestamp: '2026-11-08T08:30:12.345Z',
    loadingExperience: {
      id: 'https://www.harbourcafe.example/',
      metrics: {
        CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 14, distributions: [{ min: 0, max: 10, proportion: 0.71 }, { min: 10, max: 25, proportion: 0.18 }, { min: 25, proportion: 0.11 }], category: 'AVERAGE' },
        EXPERIMENTAL_TIME_TO_FIRST_BYTE: { percentile: 1310, category: 'AVERAGE' },
        FIRST_CONTENTFUL_PAINT_MS: { percentile: 2240, category: 'AVERAGE' },
        INTERACTION_TO_NEXT_PAINT: { percentile: 168, category: 'FAST' },
        LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3620, category: 'AVERAGE' }
      },
      overall_category: 'AVERAGE',
      initial_url: 'https://www.harbourcafe.example/'
    },
    lighthouseResult: {
      requestedUrl: 'https://www.harbourcafe.example/',
      finalUrl: 'https://www.harbourcafe.example/',
      finalDisplayedUrl: 'https://www.harbourcafe.example/',
      lighthouseVersion: '12.8.2',
      fetchTime: '2026-11-08T08:30:01.002Z',
      runWarnings: [],
      configSettings: { emulatedFormFactor: 'mobile', formFactor: 'mobile', locale: 'en-US', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] },
      audits: {
        'first-contentful-paint': { id: 'first-contentful-paint', title: 'First Contentful Paint', description: 'First Contentful Paint marks the time at which the first text or image is painted.', score: 0.42, scoreDisplayMode: 'numeric', numericValue: 3412.6, numericUnit: 'millisecond', displayValue: '3.4 s' },
        'largest-contentful-paint': { id: 'largest-contentful-paint', title: 'Largest Contentful Paint', description: 'Largest Contentful Paint marks the time at which the largest text or image is painted.', score: 0.09, scoreDisplayMode: 'numeric', numericValue: 7120.4, numericUnit: 'millisecond', displayValue: '7.1 s' },
        'total-blocking-time': { id: 'total-blocking-time', title: 'Total Blocking Time', description: 'Sum of all time periods between FCP and Time to Interactive.', score: 0.55, scoreDisplayMode: 'numeric', numericValue: 455, numericUnit: 'millisecond', displayValue: '460 ms' },
        'cumulative-layout-shift': { id: 'cumulative-layout-shift', title: 'Cumulative Layout Shift', description: 'Cumulative Layout Shift measures the movement of visible elements within the viewport.', score: 0.77, scoreDisplayMode: 'numeric', numericValue: 0.162, numericUnit: 'unitless', displayValue: '0.162' },
        'speed-index': { id: 'speed-index', title: 'Speed Index', description: 'Speed Index shows how quickly the contents of a page are visibly populated.', score: 0.61, scoreDisplayMode: 'numeric', numericValue: 5210.3, numericUnit: 'millisecond', displayValue: '5.2 s' },
        'interactive': { id: 'interactive', title: 'Time to Interactive', score: 0.38, scoreDisplayMode: 'numeric', numericValue: 8900, displayValue: '8.9 s' },
        'render-blocking-insight': { id: 'render-blocking-insight', title: 'Render blocking requests', description: 'Requests are blocking the page\'s initial render, which may delay LCP. [Deferring or inlining](https://web.dev/learn/performance/understanding-the-critical-path) can move these network requests out of the critical path.', score: 0, scoreDisplayMode: 'metricSavings', displayValue: 'Est savings of 1,450 ms', metricSavings: { FCP: 1450, LCP: 1450 }, details: { type: 'table', items: [{ url: 'https://www.harbourcafe.example/wp-content/themes/cafe/style.css' }, { url: 'https://fonts.googleapis.com/css2?family=Playfair+Display' }, { url: 'https://www.harbourcafe.example/wp-includes/js/jquery/jquery.min.js' }] } },
        'image-delivery-insight': { id: 'image-delivery-insight', title: 'Improve image delivery', description: 'Reducing the download time of images can improve the perceived load time of the page and LCP. [Learn more about optimizing image size](https://developer.chrome.com/docs/performance/insights/image-delivery)', score: 0, scoreDisplayMode: 'metricSavings', displayValue: 'Est savings of 1,284 KiB', metricSavings: { FCP: 0, LCP: 2100 }, details: { type: 'table', items: [{ url: 'https://www.harbourcafe.example/uploads/hero-latte.jpg', totalBytes: 1180000, wastedBytes: 1010000 }, { url: 'https://www.harbourcafe.example/uploads/menu-board.png', totalBytes: 340000, wastedBytes: 275000 }] } },
        'lcp-discovery-insight': { id: 'lcp-discovery-insight', title: 'LCP request discovery', description: 'Optimize LCP by making the LCP image discoverable from the HTML immediately, and avoiding lazy-loading.', score: 0, scoreDisplayMode: 'metricSavings', metricSavings: { LCP: 600 }, details: { type: 'checklist', items: {} } },
        'unused-javascript': { id: 'unused-javascript', title: 'Reduce unused JavaScript', description: 'Reduce unused JavaScript and defer loading scripts until they are required to decrease bytes consumed by network activity.', score: 0.5, scoreDisplayMode: 'metricSavings', displayValue: 'Est savings of 212 KiB', metricSavings: { FCP: 0, LCP: 450 }, details: { type: 'opportunity', overallSavingsMs: 450, items: [{ url: 'https://www.googletagmanager.com/gtag/js' }, { url: 'https://connect.facebook.net/en_US/fbevents.js' }] } },
        'cls-culprits-insight': { id: 'cls-culprits-insight', title: 'Layout shift culprits', description: 'Layout shifts occur when elements move absent any user interaction.', score: 0, scoreDisplayMode: 'metricSavings', metricSavings: { CLS: 0.15 }, details: { type: 'list', items: [{}] } },
        'cache-insight': { id: 'cache-insight', title: 'Use efficient cache lifetimes', description: 'A long cache lifetime can speed up repeat visits to your page.', score: 0.5, scoreDisplayMode: 'metricSavings', displayValue: 'Est savings of 96 KiB', metricSavings: { LCP: 0, FCP: 0 }, details: { type: 'table', items: [{}, {}, {}, {}] } },
        'font-display-insight': { id: 'font-display-insight', title: 'Font display', description: 'Consider setting font-display to swap or optional to ensure text is consistently visible.', score: 1, scoreDisplayMode: 'metricSavings', metricSavings: { FCP: 0 } },
        'third-parties-insight': { id: 'third-parties-insight', title: '3rd parties', description: '3rd party code can significantly impact load performance.', score: null, scoreDisplayMode: 'informative', details: { type: 'table', items: [{}, {}, {}] } },
        'mainthread-work-breakdown': { id: 'mainthread-work-breakdown', title: 'Minimize main-thread work', description: 'Consider reducing the time spent parsing, compiling and executing JS.', score: 0.38, scoreDisplayMode: 'metricSavings', displayValue: '4.1 s', metricSavings: { TBT: 300 } },
        'dom-size-insight': { id: 'dom-size-insight', title: 'Optimize DOM size', description: 'A large DOM can increase the duration of style calculations and layout reflows.', score: 1, scoreDisplayMode: 'numeric' },
        'diagnostics': { id: 'diagnostics', title: 'Diagnostics', score: null, scoreDisplayMode: 'informative' },
        'color-contrast': { id: 'color-contrast', title: 'Background and foreground colors do not have a sufficient contrast ratio.', description: 'Low-contrast text is difficult or impossible for many users to read. [Learn how to provide sufficient color contrast](https://dequeuniversity.com/rules/axe/4.10/color-contrast).', score: 0, scoreDisplayMode: 'binary', details: { type: 'table', items: [{}, {}, {}, {}, {}] } },
        'image-alt': { id: 'image-alt', title: 'Image elements do not have `[alt]` attributes', description: 'Informative elements should aim for short, descriptive alternate text.', score: 0, scoreDisplayMode: 'binary', details: { type: 'table', items: [{}, {}, {}] } },
        'link-name': { id: 'link-name', title: 'Links do not have a discernible name', description: 'Link text that is discernible, unique, and focusable improves the navigation experience for screen reader users.', score: 0, scoreDisplayMode: 'binary', details: { type: 'table', items: [{}, {}] } },
        'heading-order': { id: 'heading-order', title: 'Heading elements are not in a sequentially-descending order', description: 'Properly ordered headings that do not skip levels convey the semantic structure of the page.', score: 0, scoreDisplayMode: 'binary' },
        'html-has-lang': { id: 'html-has-lang', title: '`<html>` element has a `[lang]` attribute', score: 1, scoreDisplayMode: 'binary' },
        'document-title': { id: 'document-title', title: 'Document has a `<title>` element', score: 1, scoreDisplayMode: 'binary' },
        'meta-viewport': { id: 'meta-viewport', title: '`[user-scalable="no"]` is not used in the `<meta name="viewport">` element and the `[maximum-scale]` attribute is not less than 5.', score: 1, scoreDisplayMode: 'binary' },
        'button-name': { id: 'button-name', title: 'Buttons have an accessible name', score: 1, scoreDisplayMode: 'binary' },
        'label': { id: 'label', title: 'Form elements have associated labels', score: 1, scoreDisplayMode: 'binary' },
        'target-size': { id: 'target-size', title: 'Touch targets do not have sufficient size or spacing.', description: 'Touch targets with sufficient size and spacing help users who may have difficulty targeting small controls.', score: 0, scoreDisplayMode: 'binary' },
        'video-caption': { id: 'video-caption', title: '`<video>` elements contain a `<track>` element with `[kind="captions"]`', score: null, scoreDisplayMode: 'notApplicable' },
        'logical-tab-order': { id: 'logical-tab-order', title: 'The page has a logical tab order', score: null, scoreDisplayMode: 'manual' },
        'is-on-https': { id: 'is-on-https', title: 'Uses HTTPS', score: 1, scoreDisplayMode: 'binary' },
        'errors-in-console': { id: 'errors-in-console', title: 'Browser errors were logged to the console', description: 'Errors logged to the console indicate unresolved problems.', score: 0, scoreDisplayMode: 'binary', details: { type: 'table', items: [{ description: 'Failed to load resource: the server responded with a status of 404 ()' }] } },
        'inspector-issues': { id: 'inspector-issues', title: 'Issues were logged in the `Issues` panel in Chrome Devtools', description: 'Issues logged to the Issues panel in Chrome Devtools indicate unresolved problems.', score: 0, scoreDisplayMode: 'binary' },
        'image-aspect-ratio': { id: 'image-aspect-ratio', title: 'Displays images with correct aspect ratio', score: 1, scoreDisplayMode: 'binary' },
        'deprecations': { id: 'deprecations', title: 'Avoids deprecated APIs', score: 1, scoreDisplayMode: 'binary' },
        'doctype': { id: 'doctype', title: 'Page has the HTML doctype', score: 1, scoreDisplayMode: 'binary' },
        'csp-xss': { id: 'csp-xss', title: 'Ensure CSP is effective against XSS attacks', score: null, scoreDisplayMode: 'informative' },
        'meta-description': { id: 'meta-description', title: 'Document does not have a meta description', description: 'Meta descriptions may be included in search results to concisely summarize page content.', score: 0, scoreDisplayMode: 'binary' },
        'link-text': { id: 'link-text', title: 'Links do not have descriptive text', description: 'Descriptive link text helps search engines understand your content.', score: 0, scoreDisplayMode: 'binary', displayValue: '3 links found', details: { type: 'table', items: [{ text: 'click here' }, { text: 'more' }, { text: 'here' }] } },
        'http-status-code': { id: 'http-status-code', title: 'Page has successful HTTP status code', score: 1, scoreDisplayMode: 'binary' },
        'is-crawlable': { id: 'is-crawlable', title: 'Page isn’t blocked from indexing', score: 1, scoreDisplayMode: 'binary' },
        'crawlable-anchors': { id: 'crawlable-anchors', title: 'Links are crawlable', score: 1, scoreDisplayMode: 'binary' },
        'robots-txt': { id: 'robots-txt', title: 'robots.txt is valid', score: 1, scoreDisplayMode: 'binary' },
        'hreflang': { id: 'hreflang', title: 'Document has a valid `hreflang`', score: null, scoreDisplayMode: 'notApplicable' },
        'canonical': { id: 'canonical', title: 'Document has a valid `rel=canonical`', score: 1, scoreDisplayMode: 'binary' },
        'structured-data': { id: 'structured-data', title: 'Structured data is valid', score: null, scoreDisplayMode: 'manual' }
      },
      categories: {
        performance: { id: 'performance', title: 'Performance', score: 0.38, auditRefs: [
          ref('first-contentful-paint', 10, 'metrics'), ref('largest-contentful-paint', 25, 'metrics'), ref('total-blocking-time', 30, 'metrics'), ref('cumulative-layout-shift', 25, 'metrics'), ref('speed-index', 10, 'metrics'),
          ref('render-blocking-insight', 0, 'insights'), ref('image-delivery-insight', 0, 'insights'), ref('lcp-discovery-insight', 0, 'insights'), ref('cls-culprits-insight', 0, 'insights'),
          ref('cache-insight', 0, 'insights'), ref('font-display-insight', 0, 'insights'), ref('third-parties-insight', 0, 'insights'), ref('dom-size-insight', 0, 'insights'),
          ref('unused-javascript', 0, 'diagnostics'), ref('mainthread-work-breakdown', 0, 'diagnostics'), ref('interactive', 0, 'hidden'), ref('diagnostics', 0, 'hidden')] },
        accessibility: { id: 'accessibility', title: 'Accessibility', score: 0.79, auditRefs: [
          ref('color-contrast', 7, 'a11y-color-contrast'), ref('image-alt', 10, 'a11y-names-labels'), ref('link-name', 7, 'a11y-names-labels'), ref('heading-order', 3, 'a11y-navigation'),
          ref('html-has-lang', 7, 'a11y-language'), ref('document-title', 7, 'a11y-names-labels'), ref('meta-viewport', 10, 'a11y-best-practices'), ref('button-name', 10, 'a11y-names-labels'),
          ref('label', 7, 'a11y-names-labels'), ref('target-size', 7, 'a11y-best-practices'), ref('video-caption', 0, 'a11y-audio-video'), ref('logical-tab-order', 0)] },
        'best-practices': { id: 'best-practices', title: 'Best Practices', score: 0.78, auditRefs: [
          ref('is-on-https', 5, 'best-practices-trust-safety'), ref('csp-xss', 0, 'best-practices-trust-safety'), ref('image-aspect-ratio', 1, 'best-practices-ux'), ref('doctype', 1, 'best-practices-browser-compat'),
          ref('deprecations', 5, 'best-practices-general'), ref('errors-in-console', 1, 'best-practices-general'), ref('inspector-issues', 1, 'best-practices-general')] },
        seo: { id: 'seo', title: 'SEO', score: 0.83, auditRefs: [
          ref('is-crawlable', 4.043, 'seo-crawl'), ref('document-title', 1, 'seo-content'), ref('meta-description', 1, 'seo-content'), ref('http-status-code', 1, 'seo-crawl'),
          ref('link-text', 1, 'seo-content'), ref('crawlable-anchors', 1, 'seo-crawl'), ref('robots-txt', 1, 'seo-crawl'), ref('image-alt', 1, 'seo-content'),
          ref('hreflang', 1, 'seo-content'), ref('canonical', 1, 'seo-content'), ref('structured-data', 0)] }
      }
    }
  };
  // Pasted `curl -sIL` output for the same made-up site (one redirect, then the page).
  var HEADERS = 'HTTP/1.1 301 Moved Permanently\nLocation: https://www.harbourcafe.example/\nServer: Apache/2.4.41 (Ubuntu)\n\nHTTP/2 200\ncontent-type: text/html; charset=UTF-8\nserver: Apache/2.4.41 (Ubuntu)\nx-powered-by: PHP/7.4.3\nstrict-transport-security: max-age=86400\nx-frame-options: SAMEORIGIN\ncontent-security-policy: default-src \'self\'; script-src \'self\' \'unsafe-inline\' https://www.googletagmanager.com\nreferrer-policy: no-referrer-when-downgrade\ncache-control: max-age=600\n';
  var HTML = '<!doctype html><html lang="en"><head><title>Harbour Cafe — Coffee by the water</title><link rel="stylesheet" href="/wp-content/themes/cafe/style.css"><link rel="canonical" href="https://www.harbourcafe.example/"></head><body>' +
    '<nav><a href="/">Home</a> <a href="/menu/">Menu</a> <a href="/catering">Catering</a> <a href="https://www.harbourcafe.example/contact#map">Contact</a> <a href="#top">Top</a></nav>' +
    '<img src="/uploads/hero-latte.jpg"><p>Order on <a href="https://www.ubereats.example/au/store/harbour-cafe">Uber Eats</a> or <a href="tel:0412555101">call us</a>. <a href="mailto:hi@harbourcafe.example">Email</a></p>' +
    '<footer><a href="https://instagram.example/harbourcafe"><svg></svg></a> <a href="/old-specials.html">Specials</a> <a href=\'/menu/\'>Menu again</a> <a href="javascript:void(0)">Popup</a></footer></body></html>';
  var out = { psi: S, headers: HEADERS, html: HTML, url: 'https://www.harbourcafe.example/' };
  if (typeof module !== 'undefined' && module.exports) module.exports = out; else root.SiteHealthSample = out;
})(this);
