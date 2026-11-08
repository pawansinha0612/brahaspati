/* File Converter — DOM wiring. Logic in lib.js (ConverterLib). */
(function () {
  'use strict';
  var C = window.ConverterLib, $ = B.$;
  // src: {kind:'table', table, name} | {kind:'doc', name, text, html?} | null
  var src = null, sheets = null, htmlText = null, baseName = 'converted';
  var TABLE_OUT = [['csv', 'CSV'], ['tsv', 'TSV'], ['json', 'JSON (flat)'], ['json-nested', 'JSON (nested from dot paths)'], ['xlsx', 'Excel (.xlsx)'], ['markdown', 'Markdown table'], ['html', 'HTML table'], ['html-page', 'HTML page'], ['sql', 'SQL INSERT statements']];
  var DOC_OUT = { pdf: [['text', 'Plain text']], docx: [['text', 'Plain text'], ['markdown-doc', 'Markdown'], ['html-doc', 'HTML']] };
  var EXT = { csv: 'csv', tsv: 'tsv', json: 'json', 'json-nested': 'json', xlsx: 'xlsx', markdown: 'md', html: 'html', 'html-page': 'html', sql: 'sql', text: 'txt', 'markdown-doc': 'md', 'html-doc': 'html' };
  var MIME = { csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json', md: 'text/markdown', html: 'text/html', sql: 'application/sql', txt: 'text/plain' };

  function setOutputs(list) {
    var sel = $('#fc-to'), cur = sel.value;
    sel.innerHTML = list.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('');
    if (list.some(function (o) { return o[0] === cur; })) sel.value = cur;
    else if (src && src.kind === 'table' && src.from === 'csv') sel.value = 'json';
    syncOptions();
  }
  function syncOptions() {
    var to = $('#fc-to').value;
    B.$$('[data-for]').forEach(function (el) { el.hidden = !(el.dataset.for === to || (el.dataset.for === 'json' && /^json/.test(to))); });
  }
  function info(t, cls) { var el = $('#fc-info'); el.textContent = t || ''; el.className = 'small ' + (cls || 'muted'); }

  // ---------- reading ----------
  function fromText(text, name) {
    htmlText = null;
    var fmt = $('#fc-from').value; if (fmt === 'auto') fmt = C.formatFromName(name) || C.detectFormat(text);
    if (!fmt || fmt === 'text') fmt = C.detectFormat(text);
    if (!fmt) { src = null; render(); return; }
    var tbl = $('#fc-tbl-wrap');
    if (fmt === 'html') {
      htmlText = text; var n = C.countHtmlTables(text), keep = +($('#fc-tbl').value || 0);
      tbl.hidden = n < 2; $('#fc-tbl').innerHTML = Array.from({ length: n }, function (_, i) { return '<option value="' + i + '">Table ' + (i + 1) + '</option>'; }).join('');
      if (keep < n) $('#fc-tbl').value = String(keep);
    } else tbl.hidden = true;
    try {
      var t = C.parse(text, fmt, { flatten: $('#fc-flatten').checked, tableIndex: +($('#fc-tbl').value || 0) });
      src = { kind: 'table', table: t, name: name, from: fmt };
      info('Read as ' + fmt.toUpperCase() + ': ' + t.rows.length + ' rows, ' + t.headers.length + ' columns.');
    } catch (e) { src = null; info('Could not read this as ' + fmt.toUpperCase() + ': ' + e.message, 'bad'); }
    setOutputs(TABLE_OUT); render();
  }
  function openFile(file) {
    var kind = C.formatFromName(file.name); baseName = file.name.replace(/\.[^.]+$/, '') || 'converted';
    $('#fc-src').innerHTML = 'Reading <span class="fc-name">' + B.esc(file.name) + '</span>…';
    $('#fc-sheet-wrap').hidden = true; $('#fc-tbl-wrap').hidden = true; sheets = null;
    var done = function () { $('#fc-src').innerHTML = 'File: <span class="fc-name">' + B.esc(file.name) + '</span> (' + B.fmt.num(file.size / 1024, 1) + ' KB)'; };
    var fail = function (e) { $('#fc-src').textContent = 'Could not read ' + file.name + ': ' + (e && e.message || e); };
    if (kind === 'xlsx') {
      return Promise.all([B.lib.xlsx(), B.readFile(file, 'buffer')]).then(function (r) {
        var X = r[0], wb = X.read(r[1], { type: 'array', cellDates: true });
        sheets = wb.SheetNames.map(function (n) { return { name: n, rows: X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }) }; });
        $('#fc-sheet').innerHTML = sheets.map(function (s, i) { return '<option value="' + i + '">' + B.esc(s.name) + '</option>'; }).join('');
        $('#fc-sheet-wrap').hidden = sheets.length < 2; $('#fc-in').value = '';
        useSheet(0); done();
      }).catch(fail);
    }
    if (kind === 'pdf') {
      return B.readFile(file, 'buffer').then(readPdf).then(function (text) {
        src = { kind: 'doc', type: 'pdf', name: file.name, text: text }; $('#fc-in').value = '';
        info(text.trim() ? 'Text pulled from the PDF.' : 'No text found — this looks like a scanned PDF. Try the Screenshot Reader for images.', text.trim() ? 'muted' : 'warn');
        setOutputs(DOC_OUT.pdf); render(); done();
      }).catch(fail);
    }
    if (kind === 'docx') {
      return Promise.all([B.lib.mammoth(), B.readFile(file, 'buffer')]).then(function (r) {
        return Promise.all([r[0].convertToHtml({ arrayBuffer: r[1] }), r[0].extractRawText({ arrayBuffer: r[1] })]);
      }).then(function (out) {
        src = { kind: 'doc', type: 'docx', name: file.name, html: out[0].value, text: out[1].value }; $('#fc-in').value = '';
        info('Word document read. ' + (out[0].messages.length ? out[0].messages.length + ' part(s) could not be converted exactly (e.g. unusual styles).' : ''));
        setOutputs(DOC_OUT.docx); render(); done();
      }).catch(fail);
    }
    return B.readFile(file).then(function (text) {
      if (text.length < 2e6) $('#fc-in').value = text; else $('#fc-in').value = '';
      fromText(text, file.name); done();
    }).catch(fail);
  }
  function useSheet(i) {
    var s = sheets[i]; src = { kind: 'table', table: C.fromRows(s.rows.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); })), name: s.name, from: 'xlsx' };
    info('Sheet “' + s.name + '”: ' + src.table.rows.length + ' rows, ' + src.table.headers.length + ' columns. Values only — formulas and formatting are not kept.');
    setOutputs(TABLE_OUT); render();
  }
  function readPdf(buf) {
    return B.lib.pdfjs().then(function (lib) { return lib.getDocument({ data: buf }).promise; }).then(function (pdf) {
      var out = [], p = Promise.resolve();
      for (var n = 1; n <= pdf.numPages; n++) (function (n) {
        p = p.then(function () { return pdf.getPage(n); }).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
          var rows = [];
          tc.items.filter(function (i) { return 'str' in i && i.str.trim(); }).map(function (i) { return { s: i.str, x: i.transform[4], y: i.transform[5] }; })
            .sort(function (a, b) { return b.y - a.y || a.x - b.x; })
            .forEach(function (it) { var r = rows[rows.length - 1]; if (r && Math.abs(r.y - it.y) <= 3) r.items.push(it); else rows.push({ y: it.y, items: [it] }); });
          out.push(rows.map(function (r) { return r.items.sort(function (a, b) { return a.x - b.x; }).map(function (i) { return i.s; }).join(' ').replace(/\s+/g, ' ').trim(); }).join('\n'));
        });
      })(n);
      return p.then(function () { return out.join('\n\n'); });
    });
  }

  // ---------- writing ----------
  var result = { text: '', ext: 'txt', blob: null };
  function convert() {
    var to = $('#fc-to').value; result = { text: '', ext: EXT[to] || 'txt', blob: null };
    if (!src) return result;
    if (src.kind === 'doc') {
      if (to === 'markdown-doc') result.text = C.htmlToMarkdown(src.html);
      else if (to === 'html-doc') result.text = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>' + C.esc(src.name) + '</title></head>\n<body>\n' + src.html + '\n</body></html>';
      else result.text = src.text;
      return result;
    }
    var t = src.table;
    if (to === 'xlsx') { result.text = '(Excel file — use Download. Preview of the first rows is shown above.)'; return result; }
    if (to === 'json' || to === 'json-nested') result.text = C.toJson(t, { unflatten: to === 'json-nested', types: $('#fc-types').checked });
    else if (to === 'html-page') result.text = C.toHtml(t, { page: true, title: baseName });
    else if (to === 'sql') result.text = C.toSql(t, { table: $('#fc-table').value.trim() || 'my_table', create: $('#fc-create').checked, emptyAsNull: $('#fc-null').checked, batch: $('#fc-batch').checked ? 100 : 0 });
    else result.text = C.write(t, to);
    return result;
  }
  function render() {
    var prev = $('#fc-preview'), out = $('#fc-out');
    if (!src) { prev.innerHTML = ''; out.value = ''; if (!$('#fc-in').value.trim()) info('Add a file or paste some text to start.'); return; }
    var r = convert();
    out.value = r.text.length > 400000 ? r.text.slice(0, 400000) + '\n\n… (preview cut short — Download has everything)' : r.text;
    if (src.kind === 'table') {
      var t = src.table;
      prev.innerHTML = t.headers.length ? '<p class="small muted">Preview (first 50 rows)</p>' + B.table(t.rows.slice(0, 50), t.headers) : '<p class="muted">No columns found.</p>';
    } else if (src.type === 'docx' && $('#fc-to').value !== 'text') {
      prev.innerHTML = '<p class="small muted">Preview</p><div class="fc-docprev">' + sanitise(src.html) + '</div>';
    } else prev.innerHTML = '';
  }
  // mammoth output is simple HTML; strip anything active before showing it.
  function sanitise(html) {
    var d = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    B.$$('script,style,iframe,object,embed', d).forEach(function (n) { n.remove(); });
    B.$$('*', d).forEach(function (n) { Array.prototype.slice.call(n.attributes).forEach(function (a) { if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name); }); });
    return d.body.firstChild.innerHTML;
  }

  $('#fc-dl').addEventListener('click', function () {
    if (!src) return B.toast('Nothing to convert yet');
    var to = $('#fc-to').value;
    if (to === 'xlsx') {
      return B.lib.xlsx().then(function (X) {
        var t = src.table, wb = X.utils.book_new();
        var aoa = [t.headers].concat(t.rows.map(function (r) { return t.headers.map(function (h) { var v = r[h]; if (v != null && typeof v === 'object') return JSON.stringify(v); var n = typeof v === 'string' && /^-?(0|[1-9]\d*)(\.\d+)?$/.test(v.trim()) && v.trim().length < 16 ? Number(v) : v; return n == null ? '' : n; }); }));
        X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), String(src.from === 'xlsx' ? src.name : 'Sheet1').slice(0, 31));
        B.download(baseName + '.xlsx', new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      }).catch(function (e) { B.toast(e.message); });
    }
    var r = convert(); B.download(baseName + '.' + r.ext, r.text, (MIME[r.ext] || 'text/plain') + ';charset=utf-8');
  });
  $('#fc-copy').addEventListener('click', function () { if (!src) return B.toast('Nothing to copy yet'); if ($('#fc-to').value === 'xlsx') return B.toast('Excel can only be downloaded'); B.copy(convert().text); });
  $('#fc-print').addEventListener('click', function () {
    if (!src) return B.toast('Nothing to print yet');
    var html;
    if (src.kind === 'table') html = C.toHtml(src.table, { page: true, title: baseName });
    else if (src.html) html = '<!doctype html><html><head><meta charset="utf-8"><title>' + C.esc(src.name) + '</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:24px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style></head><body>' + sanitise(src.html) + '</body></html>';
    else html = '<!doctype html><html><head><meta charset="utf-8"><title>' + C.esc(src.name) + '</title></head><body><pre style="white-space:pre-wrap;font:13px/1.5 ui-monospace,monospace">' + C.esc(src.text) + '</pre></body></html>';
    var old = $('#fc-frame'); if (old) old.remove();
    var f = B.h('iframe', { id: 'fc-frame', title: 'Print preview', style: 'position:fixed;width:0;height:0;border:0;right:0;bottom:0' });
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { B.toast('Printing is blocked here — download the HTML and print it instead.'); } }, 150);
    B.toast('In the print window, choose “Save as PDF”', 3500);
  });

  // ---------- inputs ----------
  var typing;
  $('#fc-in').addEventListener('input', function () {
    clearTimeout(typing); typing = setTimeout(function () {
      var t = $('#fc-in').value; sheets = null; $('#fc-sheet-wrap').hidden = true; $('#fc-src').textContent = ''; baseName = 'converted';
      if (!t.trim()) { src = null; render(); return; } fromText(t, '');
    }, 250);
  });
  function reread() { if (sheets) return; var t = $('#fc-in').value; if (t.trim()) fromText(t, ''); else if (htmlText) fromText(htmlText, ''); }
  $('#fc-from').addEventListener('change', reread);
  $('#fc-flatten').addEventListener('change', reread);
  $('#fc-tbl').addEventListener('change', reread);
  $('#fc-sheet').addEventListener('change', function () { useSheet(+this.value); });
  $('#fc-to').addEventListener('change', function () { syncOptions(); render(); });
  ['#fc-table', '#fc-create', '#fc-null', '#fc-batch', '#fc-types'].forEach(function (s) { $(s).addEventListener(s === '#fc-table' ? 'input' : 'change', render); });
  $('#fc-clear').addEventListener('click', function () { $('#fc-in').value = ''; src = null; sheets = null; htmlText = null; $('#fc-src').textContent = ''; $('#fc-sheet-wrap').hidden = true; $('#fc-tbl-wrap').hidden = true; setOutputs(TABLE_OUT); render(); });

  $('#fc-s-csv').addEventListener('click', function () {
    $('#fc-in').value = 'Invoice,Customer,Date,Amount,Paid\nINV-1001,Harbour Cafe,2026-10-02,1250.00,true\nINV-1002,"Smith & Co, Pty Ltd",2026-10-09,480.50,false\nINV-1003,O\'Brien Plumbing,2026-10-15,2210.00,true\nINV-1004,Wattle Studio,2026-10-21,,false';
    $('#fc-from').value = 'auto'; baseName = 'invoices'; $('#fc-src').textContent = 'Sample: invoices.csv'; fromText($('#fc-in').value, 'invoices.csv'); $('#fc-to').value = 'json'; syncOptions(); render();
  });
  $('#fc-s-json').addEventListener('click', function () {
    $('#fc-in').value = JSON.stringify({ customers: [
      { id: 1, name: 'Ann Lee', contact: { email: 'ann@example.com', phone: '0412 000 111' }, address: { city: 'Sydney', state: 'NSW' }, tags: ['vip', 'monthly'] },
      { id: 2, name: 'Raj Patel', contact: { email: 'raj@example.com' }, address: { city: 'Melbourne', state: 'VIC' }, tags: ['new'] },
      { id: 3, name: 'Mia Chen', contact: { email: 'mia@example.com', phone: '0400 222 333' }, address: { city: 'Brisbane', state: 'QLD' }, tags: [] }
    ] }, null, 2);
    $('#fc-from').value = 'auto'; baseName = 'customers'; $('#fc-src').textContent = 'Sample: customers.json (nested)'; fromText($('#fc-in').value, 'customers.json'); $('#fc-to').value = 'csv'; syncOptions(); render();
  });
  B.dropZone($('#fc-drop'), function (files) { openFile(files[0]); }, { accept: '.csv,.tsv,.tab,.txt,.json,.md,.markdown,.html,.htm,.xlsx,.xlsm,.xls,.ods,.pdf,.docx' });
  setOutputs(TABLE_OUT); render();
})();
