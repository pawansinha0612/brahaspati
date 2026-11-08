/* PDF Intelligence — pure logic (no DOM). Works on text items from pdf.js normalised to
   {str, x, y, w} (x/y in PDF points, y grows upwards). Also builds tiny PDFs for samples/tests. */
(function (root) {
  'use strict';

  // pdf.js textContent item -> {str, x, y, w, h}
  function normItem(it) { var t = it.transform || [1, 0, 0, 1, 0, 0]; return { str: it.str, x: t[4], y: t[5], w: it.width || 0, h: it.height || Math.abs(t[3]) || 10 }; }

  // Group items into visual rows (top to bottom), each row sorted left to right.
  function groupRows(items, tol) {
    tol = tol == null ? 3 : tol;
    var list = items.filter(function (i) { return i.str != null && String(i.str).trim() !== ''; }).slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var rows = [];
    list.forEach(function (it) {
      var r = rows[rows.length - 1];
      if (r && Math.abs(r.y - it.y) <= tol) r.items.push(it); else rows.push({ y: it.y, items: [it] });
    });
    rows.forEach(function (r) { r.items.sort(function (a, b) { return a.x - b.x; }); });
    return rows;
  }

  // Rows -> text lines, adding a space where there is a visible gap.
  function itemsToLines(items, tol) {
    return groupRows(items, tol).map(function (r) {
      var s = '', prevEnd = null;
      r.items.forEach(function (it) {
        if (prevEnd !== null && it.x - prevEnd > 1 && !/\s$/.test(s) && !/^\s/.test(it.str)) s += ' ';
        s += it.str; prevEnd = it.x + (it.w || 0);
      });
      return s.replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
  }

  // Table heuristic: merge nearby items into cells, build column bands from rows that have
  // 2+ cells, then drop each cell into the band its centre falls in.
  function extractTable(items, opts) {
    opts = opts || {};
    var mergeGap = opts.mergeGap == null ? 6 : opts.mergeGap, rows = groupRows(items, opts.rowTol);
    var cellRows = rows.map(function (r) {
      var cells = [];
      r.items.forEach(function (it) {
        var c = cells[cells.length - 1], gap = c ? it.x - c.x2 : Infinity;
        if (c && gap <= mergeGap) { c.text += (gap > 1 && !/\s$/.test(c.text) ? ' ' : '') + it.str; c.x2 = Math.max(c.x2, it.x + it.w); }
        else cells.push({ text: it.str, x1: it.x, x2: it.x + (it.w || it.str.length * 5) });
      });
      cells.forEach(function (c) { c.text = c.text.replace(/\s+/g, ' ').trim(); });
      return cells;
    });
    var bands = [];
    cellRows.filter(function (c) { return c.length >= 2; }).forEach(function (cells) {
      cells.forEach(function (c) { bands.push([c.x1, c.x2]); });
    });
    bands.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [];
    bands.forEach(function (b) {
      var m = merged[merged.length - 1];
      if (m && b[0] <= m[1] + 2) m[1] = Math.max(m[1], b[1]); else merged.push([b[0], b[1]]);
    });
    if (!merged.length) return { columns: 0, rows: cellRows.map(function (c) { return c.map(function (x) { return x.text; }); }) };
    function colOf(c) {
      var mid = (c.x1 + c.x2) / 2, best = 0, bd = Infinity;
      merged.forEach(function (b, i) { var d = mid < b[0] ? b[0] - mid : mid > b[1] ? mid - b[1] : 0; if (d < bd) { bd = d; best = i; } });
      return best;
    }
    var out = [];
    cellRows.forEach(function (cells) {
      if (opts.onlyTableRows !== false && cells.length < 2) return;
      var row = merged.map(function () { return ''; });
      cells.forEach(function (c) { var i = colOf(c); row[i] = row[i] ? row[i] + ' ' + c.text : c.text; });
      out.push(row);
    });
    return { columns: merged.length, rows: out };
  }

  function toCsv(rows) {
    return rows.map(function (r) { return r.map(function (v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
  }

  // ---------- diff (LCS on lines) ----------
  function diffLines(a, b) {
    var pre = 0; while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
    var suf = 0; while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
    var A = a.slice(pre, a.length - suf), Bm = b.slice(pre, b.length - suf), mid = [];
    var n = A.length, m = Bm.length;
    if (n * m > 4e6) { // too big for a table: mark as removed/added in bulk
      A.forEach(function (t) { mid.push({ op: 'del', text: t }); }); Bm.forEach(function (t) { mid.push({ op: 'add', text: t }); });
    } else {
      var dp = []; for (var i = 0; i <= n; i++) { dp.push(new Uint32Array(m + 1)); }
      for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) dp[i][j] = A[i] === Bm[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      i = 0; j = 0;
      while (i < n && j < m) {
        if (A[i] === Bm[j]) { mid.push({ op: 'same', text: A[i] }); i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) mid.push({ op: 'del', text: A[i++] });
        else mid.push({ op: 'add', text: Bm[j++] });
      }
      while (i < n) mid.push({ op: 'del', text: A[i++] }); while (j < m) mid.push({ op: 'add', text: Bm[j++] });
    }
    var head = a.slice(0, pre).map(function (t) { return { op: 'same', text: t }; });
    var tail = a.slice(a.length - suf).map(function (t) { return { op: 'same', text: t }; });
    return head.concat(mid, tail);
  }
  function lines(text, ignoreSpace) {
    return String(text || '').split(/\r?\n/).map(function (l) { return ignoreSpace ? l.replace(/\s+/g, ' ').trim() : l.replace(/\s+$/, ''); }).filter(function (l) { return l !== ''; });
  }
  // pagesA/pagesB: arrays of page text. byPage false -> compare the whole document as one.
  function compare(pagesA, pagesB, opts) {
    opts = opts || {}; var ig = opts.ignoreSpace !== false, res = [], totals = { added: 0, removed: 0, same: 0 };
    function count(d) { var c = { added: 0, removed: 0, same: 0 }; d.forEach(function (x) { if (x.op === 'add') c.added++; else if (x.op === 'del') c.removed++; else c.same++; }); return c; }
    if (opts.byPage === false) {
      var d = diffLines(lines(pagesA.join('\n'), ig), lines(pagesB.join('\n'), ig)), c = count(d);
      res.push({ page: 'All', diff: d, added: c.added, removed: c.removed, same: c.same }); totals = c;
    } else {
      for (var p = 0; p < Math.max(pagesA.length, pagesB.length); p++) {
        var dd = diffLines(lines(pagesA[p], ig), lines(pagesB[p], ig)), cc = count(dd);
        res.push({ page: p + 1, diff: dd, added: cc.added, removed: cc.removed, same: cc.same, onlyIn: p >= pagesA.length ? 'B' : p >= pagesB.length ? 'A' : null });
        totals.added += cc.added; totals.removed += cc.removed; totals.same += cc.same;
      }
    }
    return { pages: res, totals: totals, identical: totals.added === 0 && totals.removed === 0 };
  }

  // ---------- stats, search, summary ----------
  function wordCount(t) { var m = String(t || '').match(/\S+/g); return m ? m.length : 0; }
  function stats(pages) {
    var words = 0, chars = 0, empty = 0;
    pages.forEach(function (p) { var w = wordCount(p); words += w; chars += String(p || '').length; if (!w) empty++; });
    return { pages: pages.length, words: words, chars: chars, emptyPages: empty, readingMinutes: words ? Math.max(1, Math.round(words / 230)) : 0, wordsPerPage: pages.length ? Math.round(words / pages.length) : 0 };
  }
  function search(pages, query, opts) {
    opts = opts || {}; var q = String(query || ''); if (!q.trim()) return [];
    var re;
    try { re = opts.regex ? new RegExp(q, opts.caseSensitive ? 'g' : 'gi') : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), opts.caseSensitive ? 'g' : 'gi'); }
    catch (e) { throw new Error('That pattern is not valid: ' + e.message); }
    var out = [];
    pages.forEach(function (text, pi) {
      String(text || '').split(/\r?\n/).forEach(function (line, li) {
        re.lastIndex = 0; var m, hits = [];
        while ((m = re.exec(line))) { hits.push([m.index, m.index + m[0].length]); if (!m[0].length) re.lastIndex++; }
        if (hits.length) out.push({ page: pi + 1, line: li + 1, text: line, hits: hits });
      });
    });
    return out;
  }
  function splitSentences(text) {
    var t = String(text || '').replace(/-\n(?=[a-z])/g, '').replace(/\s+/g, ' ').trim(); if (!t) return [];
    return (t.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || [t]).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  var STOP = {}; 'a an and are as at be but by for from has have he her his i if in into is it its of on or our she that the their them they this to was we were which who will with you your not can than then there these those been being do does did so such'.split(' ').forEach(function (w) { STOP[w] = 1; });
  function terms(s) { return (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(function (w) { return !STOP[w] && w.length > 2; }); }
  // Extractive summary: sentence score = average document frequency of its words + small lead bonus.
  function summarise(text, n) {
    n = n || 5; var sents = splitSentences(text).filter(function (s) { var w = wordCount(s); return w >= 6 && w <= 80; });
    if (sents.length <= n) return sents;
    var freq = {}; sents.forEach(function (s) { terms(s).forEach(function (t) { freq[t] = (freq[t] || 0) + 1; }); });
    var max = 1; Object.keys(freq).forEach(function (k) { if (freq[k] > max) max = freq[k]; });
    var scored = sents.map(function (s, i) {
      var ts = terms(s); if (!ts.length) return { i: i, s: 0 };
      var sc = ts.reduce(function (a, t) { return a + freq[t] / max; }, 0) / Math.sqrt(ts.length);
      if (i < 3) sc *= 1.2; if (/\d/.test(s)) sc *= 1.05;
      return { i: i, s: sc };
    }).sort(function (a, b) { return b.s - a.s; });
    var picked = [], seen = {};
    for (var k = 0; k < scored.length && picked.length < n; k++) { var key = sents[scored[k].i].toLowerCase(); if (seen[key]) continue; seen[key] = 1; picked.push(scored[k].i); }
    return picked.sort(function (a, b) { return a - b; }).map(function (i) { return sents[i]; });
  }

  // ---------- tiny PDF writer (Helvetica, ASCII only) for samples and tests ----------
  // pages: [[{x, y, text, size}]] -> PDF as a binary string (latin1)
  function makePdf(pages) {
    var objs = [], kids = [];
    function add(s) { objs.push(s); return objs.length; }
    add('<< /Type /Catalog /Pages 2 0 R >>'); add(''); var font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    pages.forEach(function (items) {
      var content = items.map(function (it) {
        var t = String(it.text).replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');
        return 'BT /F1 ' + (it.size || 11) + ' Tf ' + it.x + ' ' + it.y + ' Td (' + t + ') Tj ET';
      }).join('\n');
      var c = add('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
      kids.push(add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ' + font + ' 0 R >> >> /Contents ' + c + ' 0 R >>'));
    });
    objs[1] = '<< /Type /Pages /Kids [' + kids.map(function (k) { return k + ' 0 R'; }).join(' ') + '] /Count ' + kids.length + ' >>';
    var out = '%PDF-1.4\n', offs = [];
    objs.forEach(function (o, i) { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var x = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(function (o) { return ('0000000000' + o).slice(-10) + ' 00000 n \n'; }).join('');
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF\n';
    return out;
  }
  // Lay out plain lines of text on A4 pages for makePdf.
  function textPages(pageLines) {
    return pageLines.map(function (ls) { return ls.map(function (l, i) { return { x: 56, y: 780 - i * 16, text: l, size: 11 }; }); });
  }

  var L = { normItem: normItem, groupRows: groupRows, itemsToLines: itemsToLines, extractTable: extractTable, toCsv: toCsv, diffLines: diffLines,
    compare: compare, stats: stats, search: search, summarise: summarise, splitSentences: splitSentences, wordCount: wordCount, makePdf: makePdf, textPages: textPages };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.PdfLib = L;
})(this);
