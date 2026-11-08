/* PDF Intelligence — DOM wiring. Logic in lib.js (PdfLib). */
(function () {
  'use strict';
  var P = window.PdfLib, $ = B.$;
  var doc = null, cmpA = null, cmpB = null; // {name, pages:[{items, text}]}

  function bytes(str) { var u = new Uint8Array(str.length); for (var i = 0; i < str.length; i++) u[i] = str.charCodeAt(i) & 255; return u; }
  function pdfFile(name, str) { return new File([bytes(str)], name, { type: 'application/pdf' }); }

  function loadPdf(file, onStatus) {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return Promise.reject(new Error('That is not a PDF file.'));
    return Promise.all([B.lib.pdfjs(), B.readFile(file, 'buffer')]).then(function (r) {
      return r[0].getDocument({ data: r[1] }).promise;
    }).then(function (pdf) {
      var pages = [], p = Promise.resolve();
      for (var n = 1; n <= pdf.numPages; n++) (function (n) {
        p = p.then(function () { if (onStatus) onStatus('Reading page ' + n + ' of ' + pdf.numPages + '…'); return pdf.getPage(n); })
          .then(function (pg) { return pg.getTextContent(); })
          .then(function (tc) { var items = tc.items.filter(function (i) { return 'str' in i; }).map(P.normItem); pages.push({ items: items, text: P.itemsToLines(items).join('\n') }); });
      })(n);
      return p.then(function () { return { name: file.name, pages: pages }; });
    }, function (err) {
      if (err && err.name === 'PasswordException') throw new Error('This PDF is password-protected. Open it, print to a new PDF without a password, and try again.');
      throw err;
    });
  }
  function texts(d) { return d.pages.map(function (p) { return p.text; }); }

  // ---------- main document ----------
  function setStatus(t) { $('#pt-status').textContent = t; }
  function openMain(file) {
    setStatus('Opening…');
    return loadPdf(file, setStatus).then(function (d) {
      doc = d; $('#pt-name').textContent = d.name; setStatus(''); renderAll();
    }).catch(function (e) { setStatus(e.message || 'Could not read that PDF.'); });
  }
  function pageOptions(sel, withAll) {
    sel.innerHTML = (withAll ? '<option value="all">All pages</option>' : '') + doc.pages.map(function (_, i) { return '<option value="' + i + '">Page ' + (i + 1) + '</option>'; }).join('');
  }
  function renderAll() {
    var s = P.stats(texts(doc)), st = $('#pt-stats'); st.hidden = false;
    st.innerHTML = [['Pages', s.pages], ['Words', B.fmt.num(s.words, 0)], ['Reading time', s.readingMinutes + ' min'], ['Words per page', B.fmt.num(s.wordsPerPage, 0)]]
      .map(function (x) { return '<div class="stat"><div class="k">' + x[0] + '</div><div class="v">' + x[1] + '</div></div>'; }).join('');
    if (s.words === 0) setStatus('No text found. This looks like a scanned PDF — use the Screenshot Reader to read text from images.');
    else if (s.emptyPages) setStatus(s.emptyPages + ' page(s) have no text (probably scanned images).');
    pageOptions($('#pt-page'), true); pageOptions($('#pt-tpage'), true);
    renderText(); renderTable(); renderSummary();
    if ($('#pt-q').value.trim()) runSearch();
  }
  function currentText() {
    var v = $('#pt-page').value;
    if (v === 'all') return doc.pages.map(function (p, i) { return '--- Page ' + (i + 1) + ' ---\n' + p.text; }).join('\n\n');
    return doc.pages[+v].text;
  }
  function renderText() { $('#pt-text').textContent = doc ? currentText() || '(no text on this page)' : 'Open a PDF to see its text.'; }
  $('#pt-page').addEventListener('change', renderText);
  $('#pt-dl-text').addEventListener('click', function () { if (!doc) return B.toast('Open a PDF first'); B.download(doc.name.replace(/\.pdf$/i, '') + '.txt', currentText()); });
  $('#pt-copy-text').addEventListener('click', function () { if (!doc) return B.toast('Open a PDF first'); B.copy(currentText()); });

  // ---------- tables ----------
  var tableRows = [];
  function renderTable() {
    if (!doc) return;
    var v = $('#pt-tpage').value, opts = { onlyTableRows: $('#pt-only').checked, mergeGap: Math.max(0, +$('#pt-gap').value || 0) };
    var pages = v === 'all' ? doc.pages : [doc.pages[+v]], cols = 0; tableRows = [];
    pages.forEach(function (p) { var t = P.extractTable(p.items, opts); cols = Math.max(cols, t.columns); tableRows = tableRows.concat(t.rows); });
    tableRows = tableRows.map(function (r) { while (r.length < cols) r.push(''); return r; });
    $('#pt-tinfo').textContent = tableRows.length ? tableRows.length + ' rows × ' + cols + ' columns' : '';
    if (!tableRows.length) { $('#pt-table').innerHTML = '<p class="muted">No table-like rows found on this page.</p>'; return; }
    var head = []; for (var i = 0; i < cols; i++) head.push('Column ' + (i + 1));
    $('#pt-table').innerHTML = B.table(tableRows.map(function (r) { var o = {}; head.forEach(function (h, i) { o[h] = r[i]; }); return o; }), head, { limit: 300 });
  }
  ['#pt-tpage', '#pt-only', '#pt-gap'].forEach(function (s) { $(s).addEventListener('change', renderTable); });
  $('#pt-dl-csv').addEventListener('click', function () { if (!tableRows.length) return B.toast('No table to download'); B.download(doc.name.replace(/\.pdf$/i, '') + '-table.csv', P.toCsv(tableRows), 'text/csv'); });
  $('#pt-dl-xlsx').addEventListener('click', function () {
    if (!tableRows.length) return B.toast('No table to download');
    B.lib.xlsx().then(function (X) {
      var wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(tableRows.map(function (r) { return r.map(function (c) { var n = B.toNumber(c); return /^[-$(]?[\d,.]+\)?%?$/.test(c.trim()) && !isNaN(n) && !/%$/.test(c) ? n : c; }); })), 'Table');
      B.download(doc.name.replace(/\.pdf$/i, '') + '-table.xlsx', new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    }).catch(function (e) { B.toast(e.message); });
  });

  // ---------- summary ----------
  function renderSummary() {
    if (!doc) return;
    var s = P.summarise(texts(doc).join('\n'), +$('#pt-n').value);
    $('#pt-sum').innerHTML = s.length ? '<ol>' + s.map(function (x) { return '<li>' + B.esc(x) + '</li>'; }).join('') + '</ol>' : '<p class="muted">Not enough full sentences to summarise.</p>';
  }
  $('#pt-n').addEventListener('change', renderSummary);
  B.ai.button($('#pt-ai-slot'), 'AI summary', function () {
    if (!doc) { B.toast('Open a PDF first'); return null; }
    return 'Summarise this PDF in 5–8 plain-English bullet points (Australian spelling). Use only facts from the text. Mention key dates, amounts and obligations.\n\nTITLE: ' + doc.name + '\n\n' + texts(doc).join('\n').slice(0, 12000);
  }, function (ans) {
    var n = texts(doc).join('\n').length;
    $('#pt-ai-out').innerHTML = '<h3>AI summary</h3><div class="pt-text">' + B.esc(ans) + '</div><p class="small muted">Written by the AI helper' + (n > 12000 ? ' from the first part of the document only' : '') + '. Check it against the PDF.</p>';
  });
  B.ai.note($('#pt-ai-note'));

  // ---------- search ----------
  function runSearch() {
    var out = $('#pt-hits'), q = $('#pt-q').value;
    if (!doc) { out.innerHTML = '<p class="muted">Open a PDF first.</p>'; return; }
    var res;
    try { res = P.search(texts(doc), q, { regex: $('#pt-regex').checked, caseSensitive: $('#pt-case').checked }); }
    catch (e) { out.innerHTML = '<p class="bad">' + B.esc(e.message) + '</p>'; return; }
    if (!q.trim()) { out.innerHTML = ''; return; }
    out.innerHTML = '<p class="small muted">' + res.length + ' matching line' + (res.length === 1 ? '' : 's') + '.</p>';
    res.slice(0, 300).forEach(function (r) {
      var html = '', last = 0;
      r.hits.forEach(function (h) { html += B.esc(r.text.slice(last, h[0])) + '<mark>' + B.esc(r.text.slice(h[0], h[1])) + '</mark>'; last = h[1]; });
      html += B.esc(r.text.slice(last));
      var b = B.h('button', { type: 'button', text: 'Page ' + r.page + ', line ' + r.line, onclick: function () {
        $('#pt-page').value = String(r.page - 1); renderText(); document.querySelector('[data-tab="text"]').click();
      } });
      out.appendChild(B.h('div', { class: 'pt-hit' }, [b, B.h('div', { html: html })]));
    });
  }
  $('#pt-find').addEventListener('click', runSearch);
  $('#pt-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') runSearch(); });

  // ---------- compare ----------
  function renderCompare() {
    var out = $('#pt-cmp');
    if (!cmpA || !cmpB) { out.innerHTML = '<p class="muted">Add both PDFs to compare.</p>'; return; }
    var r = P.compare(texts(cmpA), texts(cmpB), { byPage: $('#pt-bypage').checked });
    out.innerHTML = '';
    out.appendChild(B.h('div', { class: 'stat-row', html:
      '<div class="stat"><div class="k">Lines added</div><div class="v ok">' + r.totals.added + '</div></div>' +
      '<div class="stat"><div class="k">Lines removed</div><div class="v bad">' + r.totals.removed + '</div></div>' +
      '<div class="stat"><div class="k">Unchanged</div><div class="v">' + r.totals.same + '</div></div>' +
      '<div class="stat"><div class="k">Pages A / B</div><div class="v">' + cmpA.pages.length + ' / ' + cmpB.pages.length + '</div></div>' }));
    if (r.identical) { out.appendChild(B.h('p', { class: 'ok', text: 'The text of both PDFs is the same (layout, images and fonts are not compared).' })); return; }
    var onlyChg = $('#pt-onlychg').checked, report = [];
    r.pages.forEach(function (pg) {
      if (onlyChg && !pg.added && !pg.removed) return;
      var title = (pg.page === 'All' ? 'Whole document' : 'Page ' + pg.page) + ' — ' + pg.added + ' added, ' + pg.removed + ' removed' + (pg.onlyIn ? ' (only in ' + pg.onlyIn + ')' : '');
      out.appendChild(B.h('h3', { text: title }));
      var box = B.h('div', { class: 'pt-diff' }), run = [];
      report.push('## ' + title);
      function flush(end) {
        if (!run.length) return;
        if (run.length > 6) {
          var keepHead = box.children.length ? 2 : 0, keepTail = end ? 0 : 2;
          run.slice(0, keepHead).forEach(function (t) { box.appendChild(B.h('div', { class: 'same', text: t })); });
          box.appendChild(B.h('div', { class: 'skip', text: '… ' + (run.length - keepHead - keepTail) + ' unchanged lines …' }));
          run.slice(run.length - keepTail).forEach(function (t) { box.appendChild(B.h('div', { class: 'same', text: t })); });
        } else run.forEach(function (t) { box.appendChild(B.h('div', { class: 'same', text: t })); });
        run = [];
      }
      pg.diff.forEach(function (d) {
        if (d.op === 'same') { run.push(d.text); return; }
        flush(false); box.appendChild(B.h('div', { class: d.op, text: d.text })); report.push((d.op === 'add' ? '+ ' : '- ') + d.text);
      });
      flush(true); out.appendChild(box);
    });
    out.appendChild(B.h('div', { class: 'row', style: 'margin-top:10px' }, [B.h('button', { class: 'btn small', type: 'button', text: 'Download change list (.txt)', onclick: function () {
      B.download('pdf-changes.txt', 'Compared ' + cmpA.name + ' (A) with ' + cmpB.name + ' (B)\n+ added in B, - removed from A\n\n' + report.join('\n'));
    } })]));
  }
  ['#pt-bypage', '#pt-onlychg'].forEach(function (s) { $(s).addEventListener('change', renderCompare); });
  function slot(which) {
    return function (files) {
      var el = $('#pt-' + which + '-name'); el.textContent = 'Reading…';
      loadPdf(files[0], function (t) { el.textContent = t; }).then(function (d) {
        if (which === 'a') cmpA = d; else cmpB = d; el.textContent = d.name; renderCompare();
      }).catch(function (e) { el.textContent = e.message; });
    };
  }
  $('#pt-use-main').addEventListener('click', function () { if (!doc) return B.toast('Open a PDF above first'); cmpA = doc; $('#pt-a-name').textContent = doc.name; renderCompare(); });

  // ---------- samples ----------
  var REPORT = [
    'Quarterly Operations Report - Harbour Cafe Group',
    '',
    'Sales grew 12% in the September quarter to $184,300 across three cafes.',
    'The Newtown cafe remains the strongest site, with weekend trade up 18%.',
    'Coffee bean costs rose 9% after the supplier increased prices in July.',
    'Staff costs were steady because rosters moved to a four-week cycle.',
    'The new online ordering page now brings in 14% of all orders.',
    'Customer complaints fell to 11, mostly about wait times at lunch.',
    'The board approved a fourth cafe in Marrickville, opening in March 2027.',
    'Fit-out for the new cafe is budgeted at $95,000 and starts in January.',
    'Next quarter the focus is faster lunch service and a loyalty card.',
    'Contact the operations manager at ops@harbourcafe.example for details.'
  ];
  function tablePage() {
    var rows = [['Cafe', 'Orders', 'Sales', 'Change'], ['Newtown', '9,412', '$78,200', '+18%'], ['Glebe', '6,105', '$54,900', '+7%'], ['Surry Hills', '5,880', '$51,200', '+9%'], ['Total', '21,397', '$184,300', '+12%']];
    var items = [{ x: 56, y: 780, text: 'Table 1. Sales by cafe, September quarter', size: 12 }], xs = [56, 200, 300, 400];
    rows.forEach(function (r, i) { r.forEach(function (c, j) { items.push({ x: xs[j], y: 740 - i * 20, text: c, size: 11 }); }); });
    items.push({ x: 56, y: 600, text: 'Figures exclude GST and catering orders.', size: 10 });
    return items;
  }
  function sampleDoc(version) {
    var lines = REPORT.slice();
    if (version === 2) {
      lines[2] = 'Sales grew 14% in the September quarter to $187,950 across three cafes.';
      lines.splice(7, 1);
      lines.splice(9, 0, 'Opening hours will extend to 4pm on weekdays from December.');
    }
    var pages = P.textPages([lines]); pages.push(tablePage());
    return pdfFile(version === 2 ? 'cafe-report-v2.pdf' : 'cafe-report.pdf', P.makePdf(pages));
  }
  $('#pt-sample').addEventListener('click', function () { openMain(sampleDoc(1)); });
  $('#pt-sample-pair').addEventListener('click', function () { slot('a')([sampleDoc(1)]); slot('b')([sampleDoc(2)]); });

  B.dropZone($('#pt-drop'), function (f) { openMain(f[0]); }, { accept: '.pdf,application/pdf' });
  B.dropZone($('#pt-drop-a'), slot('a'), { accept: '.pdf,application/pdf' });
  B.dropZone($('#pt-drop-b'), slot('b'), { accept: '.pdf,application/pdf' });
  B.tabs($('[data-tabs="pt"]'));
  renderCompare();
})();
