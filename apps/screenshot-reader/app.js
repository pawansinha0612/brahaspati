(function () {
  'use strict';
  var L = window.ScreenshotLib, $ = B.$, esc = B.esc;
  var textEl = $('#text'), status = $('#status'), prog = $('#prog'), preview = $('#preview');
  var busy = false, lastAnalysis = null, timer = null;

  var SAMPLE = [
    '2026-11-08 09:41:17 ERROR [http-nio-8080-exec-3] Request failed',
    'request id: 7f3a9c21-55e0-4b7d-9a0c-2d1e6f8b4c10',
    'java.lang.NullPointerException: Cannot invoke "Order.getTotal()" because "order" is null',
    '    at com.shop.service.OrderService.checkout(OrderService.java:42)',
    '    at com.shop.web.CartController.pay(CartController.java:88)',
    '    at org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:897)',
    'Returned HTTP 500 Internal Server Error to https://shop.example.com/api/cart/pay'
  ];

  function setStatus(msg) { status.textContent = msg || ''; }

  function sampleImage() {
    var scale = 2, w = 980, lh = 26, h = SAMPLE.length * lh + 40;
    var c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
    var g = c.getContext('2d'); g.scale(scale, scale);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#111111'; g.font = '15px Menlo, Consolas, "DejaVu Sans Mono", monospace'; g.textBaseline = 'top';
    SAMPLE.forEach(function (line, i) { g.fillText(line, 16, 20 + i * lh); });
    return c;
  }

  function showPreview(src) { preview.src = src; preview.hidden = false; }

  function ocr(image) {
    if (busy) { B.toast('Still reading the last image…'); return; }
    busy = true; prog.hidden = false; prog.value = 0; setStatus('Loading the text reader…');
    B.lib.tesseract().then(function (T) {
      return T.recognize(image, 'eng', {
        logger: function (m) {
          if (m.status) setStatus(m.status.charAt(0).toUpperCase() + m.status.slice(1) + (m.progress ? ' ' + Math.round(m.progress * 100) + '%' : '') + '…');
          if (m.status === 'recognizing text' && typeof m.progress === 'number') prog.value = m.progress;
        }
      });
    }).then(function (res) {
      var text = (res && res.data && res.data.text) || '';
      textEl.value = text.trim();
      setStatus(text.trim() ? 'Done. Read ' + text.trim().split(/\s+/).length + ' words' + (res.data.confidence != null ? ' (confidence ' + Math.round(res.data.confidence) + '%)' : '') + '.' : 'No text found in this image.');
      analyse();
    }, function (err) {
      setStatus('Could not read the image: ' + (err && err.message ? err.message : err) + '. You can still paste the text into the box.');
    }).then(function () { busy = false; prog.hidden = true; });
  }

  function handleFile(file) {
    if (!file || !/^image\//.test(file.type)) { B.toast('Please use an image file'); return; }
    B.readFile(file, 'dataurl').then(function (url) { showPreview(url); ocr(url); });
  }

  B.dropZone($('#drop'), function (files) { handleFile(files[0]); }, { accept: 'image/*' });
  document.addEventListener('paste', function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { e.preventDefault(); handleFile(items[i].getAsFile()); return; }
    }
  });

  $('#sample').addEventListener('click', function () {
    var c = sampleImage(); var url = c.toDataURL('image/png'); showPreview(url); ocr(url);
  });

  // ---------- render ----------
  var KIND_LABEL = { exception: 'Exception', traceback: 'Python traceback', http: 'HTTP status', oracle: 'Oracle error', sqlstate: 'SQL error', npm: 'npm error', exit: 'Exit code', timeout: 'Timeout', denied: 'Access problem', failed: 'Failure', validation: 'Validation' };
  var KIND_PILL = { exception: 'bad', traceback: 'bad', http: 'bad', oracle: 'bad', sqlstate: 'bad', npm: 'bad', exit: 'warn', timeout: 'warn', denied: 'warn', failed: 'warn', validation: 'warn' };

  function list(title, items, fmt) {
    if (!items.length) return '';
    return '<p style="margin:8px 0 4px"><strong>' + esc(title) + '</strong> (' + items.length + ')</p><div class="row" style="gap:6px">' + items.slice(0, 30).map(fmt).join('') + '</div>';
  }

  function analyse() {
    var t = textEl.value, a = L.analyse(t); lastAnalysis = a;
    if (!t.trim()) {
      $('#summary').textContent = 'Add a screenshot to see a summary.'; $('#summary').className = 'muted'; $('#typePill').innerHTML = '';
      $('#errors').innerHTML = '<li class="muted">None yet.</li>'; $('#steps').innerHTML = '<li class="muted">—</li>';
      $('#entities').innerHTML = 'Nothing found yet.'; $('#entities').className = 'ent muted'; return;
    }
    $('#summary').textContent = a.summary; $('#summary').className = '';
    $('#typePill').innerHTML = '<span class="tag">' + esc(a.classification.label) + '</span>';
    $('#errors').innerHTML = a.errors.length ? a.errors.slice(0, 25).map(function (e) {
      return '<li><span class="pill-' + KIND_PILL[e.kind] + '">' + esc(KIND_LABEL[e.kind] || e.kind) + '</span> <span class="small muted">line ' + e.line + '</span><br><code>' + esc(e.text) + '</code></li>';
    }).join('') : '<li class="muted">No error messages spotted.</li>';
    $('#steps').innerHTML = a.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var en = a.entities, fr = a.frames;
    var html = list('Links', en.urls, function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u) + '</a>'; }) +
      list('IDs and references', en.ids, function (x) { return '<code>' + esc(x) + '</code>'; }) +
      list('Timestamps', en.timestamps, function (x) { return '<code>' + esc(x) + '</code>'; }) +
      list('Email addresses', en.emails, function (x) { return '<code>' + esc(x) + '</code>'; }) +
      list('IP addresses', en.ips, function (x) { return '<code>' + esc(x) + '</code>'; });
    if (fr.length) html += '<p style="margin:12px 0 4px"><strong>Stack frames</strong> (' + fr.length + ')</p>' + B.table(fr.map(function (f) { return { Method: f.method, File: f.file, Line: f.line }; }), ['Method', 'File', 'Line'], { limit: 40 });
    $('#entities').innerHTML = html || 'No links, IDs or timestamps found.';
    $('#entities').className = html ? 'ent' : 'ent muted';
  }

  textEl.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(analyse, 250); });
  $('#copy').addEventListener('click', function () { if (textEl.value) B.copy(textEl.value); else B.toast('Nothing to copy'); });
  $('#dl').addEventListener('click', function () { if (textEl.value) B.download('screenshot-text.txt', textEl.value); else B.toast('Nothing to download'); });
  $('#clear').addEventListener('click', function () { textEl.value = ''; preview.hidden = true; preview.removeAttribute('src'); setStatus(''); analyse(); });

  // ---------- optional AI ----------
  B.ai.button($('#aiBox'), 'AI summary', function () {
    var t = textEl.value.trim(); if (!t) { B.toast('Add a screenshot or text first'); return null; }
    return 'Here is text read (by OCR, so it may contain small mistakes) from a screenshot. In plain English, explain in 3–5 short sentences what it shows, ' +
      'the most likely root cause of any error, and the 3 most useful next steps. Australian spelling.\n\n---\n' + t.slice(0, 8000);
  }, function (ans) {
    $('#aiOut').innerHTML = '<div class="panel" style="background:var(--soft)"><p class="small muted" style="margin:0 0 6px">AI summary (check it — AI can be wrong)</p><div style="white-space:pre-wrap">' + esc(ans) + '</div></div>';
  });
  B.ai.note($('#aiNote'));
  analyse();
})();
