/* Website Health Checker — page wiring. Logic lives in lib.js (SiteHealthLib); example data in sample.js. */
(function () {
  'use strict';
  var L = window.SiteHealthLib, S = window.SiteHealthSample, $ = B.$, esc = B.esc;
  var KEY = 'sitehealth:key', LAST = 'sitehealth:last';
  var state = { result: null, sample: false, headers: null, links: null };
  var IMPACT_PILL = { high: 'pill-bad', medium: 'pill-warn', low: 'pill-ok' };

  function strategy() { return (B.$$('input[name=strategy]').filter(function (r) { return r.checked; })[0] || {}).value || 'mobile'; }
  function setStatus(msg, cls) { var s = $('#status'); s.className = 'status-line small ' + (cls || ''); s.innerHTML = msg || ''; }

  // ---------- run a test ----------
  var timer = null;
  function run(e) {
    if (e) e.preventDefault();
    var n = L.normaliseUrl($('#url').value);
    if (n.error) return setStatus(esc(n.error), 'bad');
    $('#url').value = n.url;
    var key = B.store.get(KEY, ''), started = Date.now(), btn = $('#run');
    btn.disabled = true;
    var tick = function () { setStatus('Google is loading ' + esc(n.url) + ' on a simulated ' + (strategy() === 'mobile' ? 'phone' : 'desktop') + '… ' + Math.round((Date.now() - started) / 1000) + ' s (usually 15–45 s)'); };
    tick(); timer = setInterval(tick, 1000);
    var ctrl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 120000);
    fetch(L.psiUrl(n.url, strategy(), key), ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.error) { var err = new Error(L.friendlyError(r.status, j)); err.quota = r.status === 429; throw err; } return j; }); },
        function (err) { throw new Error(err && err.name === 'AbortError' ? 'The test took more than two minutes, so it was stopped. Try again, or try Desktop.' : 'Could not reach Google. Check your internet connection and try again.'); })
      .then(function (j) {
        var res = L.transform(j);
        state.result = res; state.sample = false; persist(); render();
        setStatus('Done in ' + Math.round((Date.now() - started) / 1000) + ' s.', 'ok');
        $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function (err) {
        setStatus(esc(err.message) + (err.quota && !key ? ' <button class="btn small" type="button" id="openKey">Add a key</button> or <button class="btn small" type="button" id="trySample">see the sample report</button>' : ''), 'bad');
        if (err.quota && !key) {
          $('#keyBox').open = true;
          var ok = $('#openKey'); if (ok) ok.addEventListener('click', function () { $('#apiKey').focus(); });
          var ts = $('#trySample'); if (ts) ts.addEventListener('click', loadSample);
        }
      })
      .then(function () { clearInterval(timer); clearTimeout(to); btn.disabled = false; });
  }

  // ---------- render ----------
  function ratingWord(r) { return L.RATING_TXT[r] || ''; }
  function render() {
    var r = state.result; if (!r) { $('#results').hidden = true; return; }
    $('#results').hidden = false;
    $('#resTitle').textContent = r.url;
    $('#resMeta').innerHTML = (state.sample ? '<span class="pill-warn">Example data, not a live test</span> ' : '') + 'Tested ' + esc(String(r.fetchTime || '').replace('T', ' ').slice(0, 16)) + ' UTC · ' + (r.strategy === 'desktop' ? 'Desktop' : 'Phone') + ' · Lighthouse ' + esc(r.lighthouseVersion);
    $('#gauges').innerHTML = r.scores.map(function (s) {
      return '<div class="gauge-card r-' + s.rating + '"><div class="gauge" style="--p:' + (s.score || 0) + '"><span>' + (s.score == null ? '–' : s.score) + '</span></div><b style="color:var(--ink)">' + esc(s.label) + '</b><br><span class="small">' + ratingWord(s.rating) + '</span></div>';
    }).join('');
    $('#topFixes').innerHTML = r.top.length ? r.top.map(finding).join('') : '<p class="ok">Google found nothing important to fix. Nice work.</p>';
    if (r.warnings && r.warnings.length) $('#topFixes').innerHTML += '<p class="small warn">Google noted: ' + esc(r.warnings.join(' ')) + '</p>';
    $('#vitals').innerHTML = '<div class="table-wrap"><table><thead><tr><th>Measure</th><th>Real visitors</th><th>Lab test</th><th>Good up to</th></tr></thead><tbody>' + r.vitals.map(function (v) {
      var cell = function (txt, rt) { return rt === 'na' ? '<span class="muted">' + (txt === '–' ? 'No data' : esc(txt)) + '</span>' : '<b class="r-' + rt + '">' + esc(txt) + '</b><br><span class="small r-' + rt + '">' + ratingWord(rt) + '</span>'; };
      return '<tr><td><b>' + esc(v.label) + '</b> (' + v.key + ')' + (v.core ? ' ★' : '') + '<br><span class="small muted">' + esc(v.what) + '</span></td><td>' + cell(v.fieldText, v.fieldRating) + '</td><td>' + (v.key === 'INP' ? '<span class="small muted">Real visitors only (see TBT)</span>' : cell(v.labText, v.labRating)) + '</td><td class="small">' + esc(L.fmtMetric(v.good, v.unit)) + '<br><span class="muted">poor over ' + esc(L.fmtMetric(v.poor, v.unit)) + '</span></td></tr>';
    }).join('') + '</tbody></table></div>' + (r.field ? '<p class="small muted">Real-visitor data: ' + esc(r.field.scope) + (r.field.overall ? ', overall ' + esc(r.field.overall.toLowerCase()) : '') + '.</p>' : '<p class="small muted">Not enough Chrome visitors for real-world data, so only the lab test is shown.</p>');
    L.CATS.forEach(function (c) {
      var list = r.failed[c[0]], box = $('#cat-' + c[0]);
      var html = list.length ? '<p class="small muted">' + list.length + ' issue' + (list.length === 1 ? '' : 's') + ', most important first.</p>' + list.map(finding).join('') : '<p class="ok">No problems found in this category.</p>';
      if (c[0] === 'seo' || c[0] === 'accessibility') {
        var cl = r.checklists[c[0]];
        html += '<h3>' + (c[0] === 'seo' ? 'SEO basics checklist' : 'Accessibility basics checklist') + '</h3><ul class="checklist">' + cl.map(function (x) {
          return '<li>' + (x.passed ? '<span class="ok" aria-label="Pass">✔</span> ' : '<span class="bad" aria-label="Fail">✘</span> ') + esc(x.title.replace(/`/g, '')) + '</li>';
        }).join('') + '</ul>';
        if (c[0] === 'seo') html += '<p class="small muted">Google also suggests checking structured data by hand with its <a href="https://search.google.com/test/rich-results" target="_blank" rel="noopener">Rich Results Test</a>. Checks that do not apply to this page (for example hreflang on a one-language site) are left out.</p>';
      }
      box.innerHTML = html;
    });
  }
  function finding(f) {
    return '<div class="finding"><h4>' + esc(f.title.replace(/`/g, '')) + ' <span class="' + IMPACT_PILL[f.impact] + '">' + f.impact + ' impact</span>' + (f.category ? ' <span class="tag">' + esc(f.category) + '</span>' : '') + '</h4>' +
      (f.displayValue ? '<span class="small muted">' + esc(f.displayValue) + (f.items ? ' · ' + f.items + ' item' + (f.items === 1 ? '' : 's') : '') + '</span>' : (f.items ? '<span class="small muted">' + f.items + ' item' + (f.items === 1 ? '' : 's') + ' affected</span>' : '')) +
      '<p>' + esc(f.fix) + '</p></div>';
  }

  // ---------- headers ----------
  function updateCurl() {
    var n = L.normaliseUrl($('#url').value || (state.result && state.result.url) || '');
    $('#curlCmd').textContent = L.curlHeadersCmd(n.url || 'https://yourbusiness.com.au/');
    if (n.url && !$('#linkBase').value) $('#linkBase').placeholder = n.url;
  }
  function gradeHeaders() {
    var g = L.gradeHeaders(L.parseHeaders($('#hdrText').value));
    if (g.empty) { $('#hdrOut').innerHTML = '<p class="warn">No headers found. Paste the lines that look like "name: value".</p>'; state.headers = null; return; }
    state.headers = g; persist();
    var P = { ok: ['pill-ok', 'Pass'], warn: ['pill-warn', 'Improve'], bad: ['pill-bad', 'Missing'] };
    var gc = { A: 'ok', B: 'ok', C: 'warn', D: 'bad', F: 'bad' }[g.grade];
    $('#hdrOut').innerHTML = '<div class="stat-row" style="margin-top:12px"><div class="stat"><div class="v ' + gc + '">' + g.grade + '</div><div class="k">Header grade</div></div>' +
      (g.status ? '<div class="stat"><div class="v">' + g.status + '</div><div class="k">Status code' + (g.redirects ? ' (after ' + g.redirects + ' redirect' + (g.redirects > 1 ? 's' : '') + ')' : '') + '</div></div>' : '') + '</div>' +
      g.checks.map(function (c) { return '<div class="finding"><h4>' + esc(c.name) + ' <span class="' + P[c.status][0] + '">' + P[c.status][1] + '</span></h4>' + (c.value ? '<code class="small" style="word-break:break-all">' + esc(c.value.slice(0, 300)) + '</code>' : '') + '<p class="small">' + esc(c.advice) + '</p></div>'; }).join('');
  }

  // ---------- links ----------
  function collectLinks() {
    var txt = $('#linkText').value, base = L.normaliseUrl($('#linkBase').value || $('#linkBase').placeholder || '').url || '';
    var links = /<[a-z!][\s\S]*>/i.test(txt) ? L.extractLinks(txt, base) : L.parseUrlList(txt).map(function (u) { return { url: u, text: '', tag: 'a', kind: base && u.indexOf(new URL(base).origin) === 0 ? 'internal' : 'external' }; });
    if (!links.length) { $('#linkOut').innerHTML = '<p class="warn">No links found. Paste the page source (it starts with &lt;!doctype html&gt;) or one URL per line.</p>'; return; }
    state.links = links; persist();
    var urls = links.map(function (l) { return l.url; });
    var internal = links.filter(function (l) { return l.kind === 'internal'; }).length;
    $('#linkOut').innerHTML = '<div class="stat-row" style="margin-top:12px"><div class="stat"><div class="v">' + links.length + '</div><div class="k">Links and files</div></div><div class="stat"><div class="v">' + internal + '</div><div class="k">On this site</div></div><div class="stat"><div class="v">' + (links.length - internal) + '</div><div class="k">Other sites</div></div></div>' +
      '<h3>Check them on your computer (free)</h3><p class="small">Paste this into Terminal (Mac/Linux, or Git Bash on Windows). Each line shows the status: 200 is fine, 301/302 are redirects, 404 and 5xx are broken, 000 means no answer.</p>' +
      '<div class="row"><button class="btn small" type="button" id="copyScript">Copy script</button></div><pre class="cmd" id="script"></pre>' +
      '<h3>Or check every week with GitHub Actions (free)</h3><p class="small">Create a repository, add this as <code>.github/workflows/links.yml</code>, and GitHub emails you when a link breaks.</p>' +
      '<div class="row"><button class="btn small" type="button" id="copyWf">Copy workflow</button></div><pre class="cmd" id="wf"></pre>' +
      '<h3>Links found</h3>' + B.table(links, [{ key: 'kind', label: 'Where' }, { key: 'tag', label: 'Type', fmt: function (t) { return { a: 'link', img: 'image', link: 'stylesheet/icon', script: 'script', iframe: 'embed', source: 'media' }[t] || esc(t); } }, { key: 'text', label: 'Link text' }, { key: 'url', label: 'Address', fmt: function (u) { return '<span style="word-break:break-all">' + esc(u) + '</span>'; } }]);
    $('#script').textContent = L.linkCheckScript(urls);
    $('#wf').textContent = L.linkCheckWorkflow(base || urls[0]);
    $('#copyScript').addEventListener('click', function () { B.copy($('#script').textContent); });
    $('#copyWf').addEventListener('click', function () { B.copy($('#wf').textContent); });
  }

  // ---------- report ----------
  function reportHtml() { return state.result ? L.reportHtml(state.result, { headers: state.headers, links: state.links, sample: state.sample }) : null; }
  function host() { try { return new URL(state.result.url).hostname.replace(/^www\./, ''); } catch (e) { return 'website'; } }

  // ---------- persistence & sample ----------
  function persist() { B.store.set(LAST, { result: state.result, sample: state.sample, headers: state.headers, links: state.links && state.links.slice(0, 500), hdrText: $('#hdrText').value.slice(0, 20000), linkBase: $('#linkBase').value }); }
  function loadSample() {
    state.result = L.transform(S.psi); state.sample = true;
    $('#url').value = S.url; $('#hdrText').value = S.headers; $('#linkText').value = S.html; $('#linkBase').value = S.url;
    updateCurl(); render(); gradeHeaders(); collectLinks(); persist();
    setStatus('Loaded an example report for a made-up café website. Type your own address and press Check website for a live test.', 'muted');
  }

  // ---------- wiring ----------
  B.tabs($('.tabs[data-tabs="cats"]'));
  $('#checkForm').addEventListener('submit', run);
  $('#sample').addEventListener('click', loadSample);
  $('#url').addEventListener('input', updateCurl);
  $('#apiKey').value = B.store.get(KEY, '');
  $('#saveKey').addEventListener('click', function () { var k = $('#apiKey').value.trim(); if (k && !/^AIza[\w-]{20,}$/.test(k)) return B.toast('That does not look like a Google API key (they start with AIza)'); B.store.set(KEY, k); B.toast(k ? 'Key saved in this browser' : 'Key removed'); });
  $('#clearKey').addEventListener('click', function () { $('#apiKey').value = ''; B.store.remove(KEY); B.toast('Key removed'); });
  if (B.store.get(KEY, '')) $('#keyBox').querySelector('summary').textContent = 'Your Google key is saved (change or remove)';
  $('#copyCurl').addEventListener('click', function () { B.copy($('#curlCmd').textContent); });
  $('#gradeHdr').addEventListener('click', gradeHeaders);
  $('#extract').addEventListener('click', collectLinks);
  $('#dlReport').addEventListener('click', function () { var h = reportHtml(); if (h) B.download('website-health-' + host() + '.html', h, 'text/html;charset=utf-8'); });
  $('#printReport').addEventListener('click', function () {
    var h = reportHtml(); if (!h) return;
    var f = B.h('iframe', { title: 'Report', style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0' });
    f.addEventListener('load', function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { B.toast('Printing was blocked. Use Download report.'); } setTimeout(function () { f.remove(); }, 60000); });
    f.srcdoc = h; document.body.appendChild(f);
  });

  // Optional AI: turn the findings into a short note for a client or developer. The findings themselves are rule-based.
  B.ai.note($('#aiBox'));
  B.ai.button($('#aiBox'), 'Write this up as an email to my web developer', function () {
    var r = state.result; if (!r) return null;
    return 'Write a short, friendly email (Australian spelling, under 200 words) from a small-business owner to their web developer asking them to fix the most important problems on ' + r.url + '. Use only these facts:\nScores: ' +
      r.scores.map(function (s) { return s.label + ' ' + s.score; }).join(', ') + '\nTop issues:\n' + r.top.map(function (f) { return '- ' + f.title + ' (' + f.category + '): ' + f.fix; }).join('\n') +
      (state.headers ? '\nSecurity header grade: ' + state.headers.grade + '; missing or weak: ' + state.headers.checks.filter(function (c) { return c.status !== 'ok'; }).map(function (c) { return c.name; }).join(', ') : '');
  }, function (ans) { $('#aiOut').innerHTML = '<div class="panel"><p class="small muted">AI draft. Check it before sending.</p><div style="white-space:pre-wrap">' + esc(ans) + '</div><button class="btn small" type="button" id="copyAi">Copy</button></div>'; $('#copyAi').addEventListener('click', function () { B.copy(ans); }); });

  var last = B.store.get(LAST, null);
  if (last && last.result) {
    state.result = last.result; state.sample = !!last.sample; state.headers = last.headers || null; state.links = last.links || null;
    $('#url').value = last.result.requestedUrl || last.result.url; $('#hdrText').value = last.hdrText || ''; $('#linkBase').value = last.linkBase || '';
    render(); if (state.headers) gradeHeaders();
  }
  updateCurl();
})();
