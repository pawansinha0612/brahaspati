(function () {
  'use strict';
  var L = window.MonitorLib, $ = B.$, $$ = B.$$, esc = B.esc;
  var FILES = { wf: '.github/workflows/page-monitor.yml', js: 'monitor/monitor.js', json: 'monitor/urls.json' };
  var current = {};

  // ---------- page rows ----------
  var saved = B.store.get('monitor:cfg', null);
  var pages = saved && saved.pages && saved.pages.length ? saved.pages : [{ name: '', url: '', ignore: '' }];

  function renderPages() {
    $('#pages').innerHTML = pages.map(function (p, i) {
      return '<div class="page-row" data-i="' + i + '">' +
        '<div><label for="pn' + i + '">Name</label><input type="text" id="pn' + i + '" data-k="name" placeholder="Competitor prices" value="' + esc(p.name) + '"></div>' +
        '<div><label for="pu' + i + '">Web address</label><input type="url" id="pu' + i + '" data-k="url" placeholder="https://…" value="' + esc(p.url) + '"></div>' +
        '<div><label for="pi' + i + '">Ignore (CSS selectors, optional)</label><input type="text" id="pi' + i + '" data-k="ignore" placeholder=".ad, #clock" value="' + esc(Array.isArray(p.ignore) ? p.ignore.join(', ') : p.ignore || '') + '"></div>' +
        '<div><button class="btn small" type="button" data-del="' + i + '" aria-label="Remove page ' + (i + 1) + '">Remove</button></div></div>';
    }).join('');
  }
  $('#pages').addEventListener('input', function (e) { var r = e.target.closest('[data-i]'); if (r && e.target.dataset.k) { pages[+r.dataset.i][e.target.dataset.k] = e.target.value; update(); } });
  $('#pages').addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (!b) return; pages.splice(+b.dataset.del, 1); if (!pages.length) pages.push({ name: '', url: '', ignore: '' }); renderPages(); update(); });
  $('#addPage').addEventListener('click', function () { pages.push({ name: '', url: '', ignore: '' }); renderPages(); update(); var u = $$('#pages input[data-k=url]'); u[u.length - 1].focus(); });
  $('#sample').addEventListener('click', function () {
    pages = [{ name: 'Example home page', url: 'https://example.com', ignore: '' }, { name: 'Competitor pricing', url: 'https://www.example.org/pricing', ignore: '.cookie-banner, .live-chat' }];
    $('#schedule').value = 'daily'; $('#time').value = '09:17'; renderPages(); update();
  });

  // ---------- settings ----------
  Object.keys(L.VIEWPORTS).forEach(function (k) { $('#viewport').appendChild(B.h('option', { value: k, text: L.VIEWPORTS[k].label })); });
  if (saved) {
    ['schedule', 'weekday', 'viewport', 'threshold', 'wait', 'time'].forEach(function (k) { if (saved[k] != null) $('#' + k).value = saved[k]; });
    if (saved.fullPage != null) $('#fullPage').checked = saved.fullPage; if (saved.textAlert != null) $('#textAlert').checked = saved.textAlert;
  }
  var tzName = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop().replace(/_/g, ' ') + ' time'; } catch (e) { return 'your time'; } })();

  function cfg() {
    var t = ($('#time').value || '09:17').split(':');
    return { pages: pages, schedule: $('#schedule').value, weekday: +$('#weekday').value, hour: +t[0], minute: +t[1], tzOffset: -new Date().getTimezoneOffset(), tzName: tzName,
      viewport: $('#viewport').value, threshold: $('#threshold').value, waitMs: $('#wait').value, fullPage: $('#fullPage').checked, textAlert: $('#textAlert').checked };
  }

  function fileBlock(key, content) {
    return '<div class="row" style="justify-content:space-between;margin-top:10px"><span class="path">' + esc(FILES[key]) + '</span><span class="row" style="gap:6px">' +
      '<button class="btn small" type="button" data-copy="' + key + '">Copy</button><button class="btn small" type="button" data-dl="' + key + '">Download</button></span></div><pre>' + esc(content) + '</pre>';
  }

  function update() {
    var c = cfg(), s = $('#schedule').value;
    $('#dayWrap').hidden = s !== 'weekly'; $('#timeWrap').hidden = /h$|hourly/.test(s);
    var cr = L.cron(c), n = L.normalise(c);
    var bad = pages.filter(function (p) { return String(p.url || '').trim() && !L.validUrl(p.url); }).length;
    $('#cronNote').innerHTML = 'Runs ' + esc(cr.text) + ' — in GitHub’s UTC clock that’s <code>' + esc(cr.cron) + '</code>. ' + n.pages.length + ' page' + (n.pages.length === 1 ? '' : 's') + ' ready.' +
      (bad ? ' <span class="warn">' + bad + ' address' + (bad === 1 ? ' doesn’t' : 'es don’t') + ' start with http:// or https:// and will be left out.</span>' : '') +
      (!n.pages.length ? ' <span class="warn">Add at least one web address.</span>' : '') +
      (/^(daily|weekdays|weekly)$/.test(s) ? ' <span class="muted">If your clocks change for daylight saving, the run shifts by an hour.</span>' : '');
    current = { wf: L.genWorkflow(c), js: L.genMonitorJs(), json: L.genUrlsJson(c) };
    Object.keys(current).forEach(function (k) { $('[data-panel="' + k + '"]').innerHTML = fileBlock(k, current[k]); });
    B.store.set('monitor:cfg', { pages: pages, schedule: s, weekday: $('#weekday').value, viewport: $('#viewport').value, threshold: $('#threshold').value, wait: $('#wait').value, time: $('#time').value, fullPage: $('#fullPage').checked, textAlert: $('#textAlert').checked });
  }
  ['schedule', 'weekday', 'time', 'viewport', 'threshold', 'wait', 'fullPage', 'textAlert'].forEach(function (k) { $('#' + k).addEventListener('input', update); $('#' + k).addEventListener('change', update); });
  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-copy]'), d = e.target.closest('[data-dl]');
    if (c) B.copy(current[c.dataset.copy]);
    if (d) B.download(FILES[d.dataset.dl].split('/').pop(), current[d.dataset.dl], d.dataset.dl === 'json' ? 'application/json' : 'text/plain;charset=utf-8');
  });
  $('#dlAll').addEventListener('click', function () {
    ['wf', 'js', 'json'].forEach(function (k, i) { setTimeout(function () { B.download(FILES[k].split('/').pop(), current[k]); }, i * 400); });
    B.toast('Downloading 3 files — remember the folder names when you upload them');
  });
  B.tabs($('[data-tabs="files"]'));
  renderPages(); update();

  // ---------- compare two screenshots ----------
  var imgs = { a: null, b: null }, result = null, view = 'overlay', canvas = $('#cmpCanvas');

  function load(which, src) {
    var im = new Image();
    im.onload = function () { imgs[which] = im; var tag = $(which === 'a' ? '#imgA' : '#imgB'); tag.src = src; tag.hidden = false; compare(); };
    im.onerror = function () { B.toast('Could not read that image'); };
    im.src = src;
  }
  function pick(which) { return function (files) { var f = files[0]; if (!f || !/^image\//.test(f.type)) { B.toast('Please choose an image'); return; } B.readFile(f, 'dataurl').then(function (u) { load(which, u); }); }; }
  B.dropZone($('#dropA'), pick('a'), { accept: 'image/*' });
  B.dropZone($('#dropB'), pick('b'), { accept: 'image/*' });

  function pixels(im, w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0);
    return g.getImageData(0, 0, w, h);
  }
  function compare() {
    if (!imgs.a || !imgs.b) { $('#cmpResult').textContent = imgs.a || imgs.b ? 'Now add the other image.' : ''; return; }
    var w = Math.max(imgs.a.naturalWidth, imgs.b.naturalWidth), h = Math.max(imgs.a.naturalHeight, imgs.b.naturalHeight);
    if (w * h > 40e6) { $('#cmpResult').innerHTML = '<span class="warn">These images are too large to compare in the browser (over 40 megapixels).</span>'; return; }
    var A = pixels(imgs.a, w, h), Bp = pixels(imgs.b, w, h);
    var r = L.diffPixels(A.data, Bp.data, w, h, { threshold: +$('#sens').value });
    result = { w: w, h: h, A: A, B: Bp, r: r };
    var sizeNote = imgs.a.naturalWidth !== imgs.b.naturalWidth || imgs.a.naturalHeight !== imgs.b.naturalHeight ? ' The images are different sizes (' + imgs.a.naturalWidth + '×' + imgs.a.naturalHeight + ' vs ' + imgs.b.naturalWidth + '×' + imgs.b.naturalHeight + '), so the extra area counts as changed.' : '';
    $('#cmpResult').innerHTML = (r.count ? '<span class="' + (r.percent >= 1 ? 'pill-bad' : 'pill-warn') + '">' + r.percent + '% changed</span> ' + B.fmt.num(r.count, 0) + ' of ' + B.fmt.num(r.total, 0) + ' pixels differ' +
      (r.box ? ', in the area from (' + r.box.x + ', ' + r.box.y + ') measuring ' + r.box.w + '×' + r.box.h + ' px.' : '.') : '<span class="pill-ok">No visible difference</span>') + esc(sizeNote);
    $('#view').hidden = false; canvas.hidden = false; $('#dlDiff').hidden = false; draw();
  }
  function draw() {
    if (!result) return;
    canvas.width = result.w; canvas.height = result.h;
    var g = canvas.getContext('2d');
    if (view === 'a') g.putImageData(result.A, 0, 0);
    else if (view === 'b') g.putImageData(result.B, 0, 0);
    else {
      var out = g.createImageData(result.w, result.h); out.data.set(L.overlay(result.B.data, result.r.mask, result.w, result.h)); g.putImageData(out, 0, 0);
      if (result.r.box) { g.strokeStyle = '#e61e1e'; g.lineWidth = Math.max(2, result.w / 400); var b = result.r.box, p = 6; g.strokeRect(b.x - p, b.y - p, b.w + 2 * p, b.h + 2 * p); }
    }
    canvas.style.width = Math.min(result.w, canvas.parentNode.clientWidth) + 'px';
  }
  $('#view').addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (!b) return; view = b.dataset.v; $$('#view button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); draw(); });
  $('#sens').addEventListener('change', compare);
  $('#dlDiff').addEventListener('click', function () { canvas.toBlob(function (blob) { B.download('difference.png', blob); }); });
  window.addEventListener('resize', function () { if (result) canvas.style.width = Math.min(result.w, canvas.parentNode.clientWidth) + 'px'; });

  $('#cmpSample').addEventListener('click', function () {
    function mock(price, banner) {
      var c = document.createElement('canvas'); c.width = 640; c.height = 400; var g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 640, 400); g.fillStyle = '#1d1f24'; g.fillRect(0, 0, 640, 56);
      g.fillStyle = '#ffffff'; g.font = 'bold 22px sans-serif'; g.fillText('Acme Tools', 20, 36);
      g.fillStyle = '#1d1f24'; g.font = 'bold 28px sans-serif'; g.fillText('Cordless drill 18V', 20, 120);
      g.font = '18px sans-serif'; g.fillStyle = '#5d6270'; g.fillText('Includes two batteries and a charger.', 20, 156);
      g.fillStyle = '#b4531b'; g.font = 'bold 40px sans-serif'; g.fillText(price, 20, 230);
      g.fillStyle = '#2557d6'; g.fillRect(20, 260, 160, 44); g.fillStyle = '#fff'; g.font = '18px sans-serif'; g.fillText('Add to cart', 52, 288);
      if (banner) { g.fillStyle = '#1f7a46'; g.fillRect(380, 90, 220, 40); g.fillStyle = '#fff'; g.font = 'bold 18px sans-serif'; g.fillText('SALE — 20% off', 402, 117); }
      return c.toDataURL('image/png');
    }
    load('a', mock('$149.00', false)); load('b', mock('$119.00', true));
  });
})();
