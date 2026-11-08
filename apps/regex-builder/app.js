(function () {
  'use strict';
  var L = window.RegexLib, $ = B.$, $$ = B.$$, esc = B.esc;
  var desc = $('#desc'), pat = $('#pattern'), testText = $('#testText'), repl = $('#repl');
  var timer = null;

  var EXAMPLES = [
    'starts with INV- followed by 6 digits',
    'Australian mobile',
    'between 8 and 20 characters, contains a digit, contains an uppercase letter',
    'ends with .pdf case-insensitive',
    'one of red, green or blue as a whole word',
    'exactly 3 letters then a hyphen then 4 digits',
    'dd/mm/yyyy',
    'log level'
  ];
  var SAMPLE_TEXT = 'Invoices: INV-004512 paid, INV-77 is wrong, INV-120934 overdue.\n' +
    'Call 0412 345 678 or +61 412 345 678. Email accounts@example.com.au\n' +
    'Dates: 08/11/2026 and 2026-11-08. Colours: #b4531b #FFF\n' +
    '2026-11-08 09:41:17 ERROR Payment failed\n2026-11-08 09:41:18 INFO Retrying';

  // examples + catalogue picker
  $('#examples').innerHTML = EXAMPLES.map(function (e) { return '<button type="button">' + esc(e) + '</button>'; }).join('');
  $$('#examples button').forEach(function (b) { b.addEventListener('click', function () { desc.value = b.textContent; build(); }); });
  $('#catalogue').innerHTML += L.CATALOGUE.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
  $('#catalogue').addEventListener('change', function () {
    var c = L.CATALOGUE.filter(function (x) { return x.id === this.value; }, this)[0]; if (!c) return;
    desc.value = c.keys[0]; build();
    $('#buildInfo').innerHTML += '<p class="small muted" style="margin:6px 0 0">Example: <code>' + esc(c.example) + '</code>' + (c.note ? ' — ' + esc(c.note) : '') + '</p>';
  });

  function flags() { return $$('#flags input').filter(function (i) { return i.checked; }).map(function (i) { return i.value; }).join(''); }
  function setFlags(f) { $$('#flags input').forEach(function (i) { i.checked = f.indexOf(i.value) >= 0; }); }

  function build() {
    var r = L.build(desc.value);
    if (!r.ok) {
      $('#buildInfo').innerHTML = '<p class="warn" style="margin:0">I couldn’t turn that into a pattern. Try words like “starts with”, “6 digits”, “one of a, b or c”, “contains a digit”, or a pattern name such as “email” or “postcode”.</p>';
      return;
    }
    pat.value = r.pattern; setFlags(r.flags);
    var cat = r.used.map(function (id) { return L.CATALOGUE.filter(function (c) { return c.id === id; })[0]; });
    $('#buildInfo').innerHTML = '<p style="margin:0"><strong>How I read it:</strong> ' + r.steps.map(esc).join(' → ') + '</p>' +
      (r.ignored.length ? '<p class="small warn" style="margin:6px 0 0">Ignored words I didn’t understand: ' + r.ignored.map(function (w) { return '“' + esc(w) + '”'; }).join(', ') + '. Put exact text in quotes, e.g. starts with "Order #".</p>' : '') +
      cat.filter(function (c) { return c && c.note; }).map(function (c) { return '<p class="small muted" style="margin:6px 0 0">' + esc(c.name) + ': ' + esc(c.note) + '</p>'; }).join('');
    B.store.set('regex:last', { desc: desc.value });
    update();
  }

  function highlight(text, matches) {
    var html = '', last = 0;
    matches.forEach(function (m, i) {
      if (m.index < last) return;
      html += esc(text.slice(last, m.index));
      html += m.text ? '<mark class="' + (i % 2 ? 'alt' : '') + '" title="Match ' + (i + 1) + '">' + esc(m.text) + '</mark>' : '<mark class="empty" title="Empty match ' + (i + 1) + '"></mark>';
      last = m.end;
    });
    return html + esc(text.slice(last));
  }

  function update() {
    var src = pat.value, f = flags(), text = testText.value;
    var c = L.compile(src, f);
    $('#patErr').textContent = c.error ? 'This pattern has an error: ' + c.error : '';
    var lits = L.literals(src, f);
    $('#jsLit').textContent = src ? lits.js : '';
    // test
    if (!c.error && src) {
      var r = L.test(src, f, text);
      var n = r.matches.length;
      $('#matchCount').innerHTML = n ? '<span class="pill-ok">' + n + (r.truncated ? '+' : '') + ' match' + (n === 1 ? '' : 'es') + '</span>' + (f.indexOf('g') < 0 ? ' <span class="small muted">(g is off, so only the first match)</span>' : '') : '<span class="pill-warn">No matches</span>';
      $('#highlight').innerHTML = highlight(text, r.matches) || '<span class="muted">Add test text above.</span>';
      if (n) {
        var groupCount = Math.max.apply(null, r.matches.map(function (m) { return m.groups.length; }));
        var names = r.matches[0].named ? Object.keys(r.matches[0].named) : [];
        var cols = [{ key: 'n', label: '#' }, { key: 'at', label: 'At' }, { key: 'm', label: 'Match', fmt: function (v) { return '<code>' + esc(v) + '</code>'; } }];
        for (var g = 0; g < groupCount; g++) cols.push({ key: 'g' + g, label: 'Group ' + (g + 1), fmt: function (v) { return v == null ? '<span class="muted">—</span>' : '<code>' + esc(v) + '</code>'; } });
        names.forEach(function (nm) { cols.push({ key: 'n_' + nm, label: '<' + nm + '>', fmt: function (v) { return v == null ? '<span class="muted">—</span>' : '<code>' + esc(v) + '</code>'; } }); });
        var rows = r.matches.map(function (m, i) {
          var o = { n: i + 1, at: m.index, m: m.text };
          m.groups.forEach(function (v, j) { o['g' + j] = v; });
          names.forEach(function (nm) { o['n_' + nm] = m.named[nm]; });
          return o;
        });
        $('#groups').innerHTML = B.table(rows, cols, { limit: 200 }); $('#groups').className = 'small';
      } else { $('#groups').innerHTML = 'No matches yet.'; $('#groups').className = 'small muted'; }
      var rp = L.replace(src, f, text, repl.value);
      $('#replOut').textContent = repl.value ? rp.text : 'Type a replacement above to preview it.';
    } else {
      $('#matchCount').textContent = ''; $('#highlight').innerHTML = esc(text); $('#groups').textContent = 'No matches yet.'; $('#replOut').textContent = '';
    }
    // explain
    var toks = L.explain(src);
    $('#explain').innerHTML = toks.length ? '<div class="table-wrap tok"><table><thead><tr><th>Piece</th><th>Meaning</th></tr></thead><tbody>' + toks.map(function (t) {
      return '<tr><td>' + '  '.repeat(t.depth) + esc(t.text) + '</td><td>' + esc(t.desc) + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<p class="muted">Build or type a pattern to see it explained.</p>';
    var fl = L.explainFlags(f);
    $('#flagNotes').innerHTML = fl.length ? fl.map(function (x) { return '<li><code>' + esc(x.split(' — ')[0]) + '</code> — ' + esc(x.split(' — ')[1]) + '</li>'; }).join('') : '<li class="muted">No flags.</li>';
    $('#flavour').innerHTML = src ? L.flavourNotes(src, f).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') : '';
    // code
    var blocks = [['JavaScript (literal)', lits.js], ['JavaScript (string)', lits.jsString], ['Python', lits.python], ['Java', lits.java], ['C#', lits.csharp]];
    $('#code').innerHTML = src ? blocks.map(function (b, i) {
      return '<div class="code-block"><div class="row"><strong>' + esc(b[0]) + '</strong><button class="btn small" type="button" data-copy="' + i + '">Copy</button></div><pre>' + esc(b[1]) + '</pre></div>';
    }).join('') + '<p class="small muted">Python converts named groups to (?P&lt;name&gt;…). Java strings double every backslash; C# uses a verbatim @"…" string.</p>' : '<p class="muted">Build or type a pattern first.</p>';
    $$('#code [data-copy]').forEach(function (b) { b.addEventListener('click', function () { B.copy(blocks[+b.dataset.copy][1]); }); });
  }

  function later() { clearTimeout(timer); timer = setTimeout(update, 150); }
  $('#build').addEventListener('click', build);
  desc.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) build(); });
  pat.addEventListener('input', later); testText.addEventListener('input', later); repl.addEventListener('input', later);
  $$('#flags input').forEach(function (i) { i.addEventListener('change', update); });
  $('#copyPat').addEventListener('click', function () { if (pat.value) B.copy(pat.value); });
  $('#copyRepl').addEventListener('click', function () { B.copy($('#replOut').textContent); });
  $('#sample').addEventListener('click', function () { desc.value = EXAMPLES[0]; testText.value = SAMPLE_TEXT; repl.value = '[$&]'; build(); });

  B.tabs($('[data-tabs="rx"]'));

  // optional AI for harder requests
  B.ai.button($('#aiBox'), 'Ask AI for a harder pattern', function () {
    if (!desc.value.trim()) { B.toast('Describe what to match first'); return null; }
    return 'Write a JavaScript regular expression for this request: "' + desc.value.trim() + '".\n' +
      'Reply with JSON only: {"pattern": "<regex source without slashes>", "flags": "<flags like gi>", "explanation": "<one or two plain-English sentences>"}';
  }, function (ans) {
    var j = B.ai.parseJSON(ans);
    if (!j || !j.pattern) { $('#buildInfo').innerHTML = '<p class="warn">The AI answer wasn’t in the expected format:</p><pre>' + esc(ans) + '</pre>'; return; }
    pat.value = j.pattern; setFlags((j.flags || 'g').replace(/[^gimsu]/g, ''));
    $('#buildInfo').innerHTML = '<p style="margin:0"><strong>From AI</strong> (check it against your test text — AI can be wrong): ' + esc(j.explanation || '') + '</p>';
    update();
  }, { json: true });
  B.ai.note($('#aiNote'));

  var last = B.store.get('regex:last');
  testText.value = SAMPLE_TEXT;
  if (last && last.desc) { desc.value = last.desc; build(); } else update();
})();
