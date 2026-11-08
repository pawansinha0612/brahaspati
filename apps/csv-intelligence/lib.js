/* Excel & CSV Intelligence — pure logic (no DOM). Works in the browser (window.CsvIntelLib) and in Node. */
(function (root) {
  'use strict';
  var B = (typeof require === 'function' && typeof module !== 'undefined' && module.exports) ? require('../../assets/core.js') : root.B;
  var SEP = '␟';

  function str(v) { return v == null ? '' : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)); }
  function norm(v, opts) {
    opts = opts || {};
    var s = str(v);
    if (opts.trim !== false) s = s.trim().replace(/\s+/g, ' ');
    if (opts.ignoreCase !== false) s = s.toLowerCase();
    return s;
  }
  // Stronger normalisation for fuzzy duplicate checks: case, spaces, punctuation, common business suffixes.
  function fuzzy(v) {
    var s = str(v).toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9@ ]+/g, ' ')
      .replace(/\b(pty|ltd|limited|inc|co|the|llc|plc)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function isNum(v) { var s = str(v).trim(); return s !== '' && /\d/.test(s) && /^[-(]?\s*(AUD|USD|NZD|A\$|\$|€|£)?\s*[-(]?\d[\d.,]*\)?\s*(DR|CR|-)?$/i.test(s) && !isNaN(B.toNumber(s)); }

  function lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function similarity(a, b) { var m = Math.max(a.length, b.length); return m ? 1 - lev(a, b) / m : 1; }

  // Score each column as a likely ID / key column.
  function suggestKeys(headers, rows) {
    var n = rows.length || 1;
    return headers.map(function (h) {
      var seen = {}, filled = 0, uniq = 0;
      rows.forEach(function (r) { var v = norm(r[h]); if (v) { filled++; if (!seen[v]) { seen[v] = 1; uniq++; } } });
      var name = h.toLowerCase(), score = 0;
      if (/(^|[^a-z])(id|ref|reference|no|num|number|code|key|sku|abn|acn)([^a-z]|$)/.test(name) || /id$|number$|code$/.test(name)) score += 3;
      if (/invoice|order|customer|account|employee|product|email|account/.test(name)) score += 1.5;
      if (/name|description|desc|notes?|comment|address|amount|total|price|balance|date|qty|quantity|last|first|created|updated|modified|phone|mobile/.test(name)) score -= 2;
      score += 4 * (uniq / n) + 1 * (filled / n);
      return { col: h, score: Math.round(score * 100) / 100, unique: filled ? uniq / filled : 0, filled: filled / n };
    }).sort(function (a, b) { return b.score - a.score; });
  }

  function matchHeaders(ha, hb) {
    var map = {}; hb.forEach(function (h) { map[h.trim().toLowerCase()] = h; });
    var common = [], onlyA = [];
    ha.forEach(function (h) { var m = map[h.trim().toLowerCase()]; if (m) { common.push({ a: h, b: m }); delete map[h.trim().toLowerCase()]; } else onlyA.push(h); });
    return { common: common, onlyA: onlyA, onlyB: Object.keys(map).map(function (k) { return map[k]; }) };
  }

  function valuesEqual(a, b, opts) {
    opts = opts || {};
    var x = norm(a, opts), y = norm(b, opts);
    if (x === y) return true;
    if (isNum(a) && isNum(b)) {
      var d = Math.abs(B.toNumber(a) - B.toNumber(b));
      return d <= (+opts.tolerance || 0) + 1e-9;
    }
    if (opts.compareDates !== false && /\d/.test(x) && /\d/.test(y) && /[\/-]/.test(x + y)) {
      var da = B.toDate(a), db = B.toDate(b);
      if (da && db && !isNaN(da) && !isNaN(db) && /^\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}/.test(x) && /^\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}/.test(y)) return da.getTime() === db.getTime();
    }
    return false;
  }

  function keyOf(row, keys, opts) { return keys.map(function (k) { return norm(row[k], opts); }).join(SEP); }
  function keyLabel(row, keys) { return keys.map(function (k) { return str(row[k]).trim(); }).join(' / '); }

  /* Compare two tables. keysA / keysB: arrays of key columns (same length). opts: {tolerance, ignoreCase, trim}
     -> {onlyA, onlyB, changed:[{key, a, b, diffs:[{col, a, b}]}], same, dupA, dupB, columns} */
  function compare(a, b, keysA, keysB, opts) {
    opts = opts || {}; keysB = keysB || keysA;
    var cols = matchHeaders(a.headers, b.headers);
    var keyColsA = {}; keysA.forEach(function (k) { keyColsA[k] = 1; });
    var cmpCols = cols.common.filter(function (c) { return !keyColsA[c.a]; });
    function index(t, keys) {
      var m = {}, dups = [];
      t.rows.forEach(function (r, i) {
        var k = keyOf(r, keys, opts);
        if (!k.replace(new RegExp(SEP, 'g'), '')) return; // blank key
        if (m[k]) { dups.push({ key: keyLabel(r, keys), row: i + 2 }); return; }
        m[k] = { row: r, line: i + 2 };
      });
      return { map: m, dups: dups };
    }
    var ia = index(a, keysA), ib = index(b, keysB);
    var onlyA = [], onlyB = [], changed = [], same = 0;
    Object.keys(ia.map).forEach(function (k) {
      var ra = ia.map[k], rb = ib.map[k];
      if (!rb) { onlyA.push(ra.row); return; }
      var diffs = [];
      cmpCols.forEach(function (c) { if (!valuesEqual(ra.row[c.a], rb.row[c.b], opts)) diffs.push({ col: c.a, a: str(ra.row[c.a]), b: str(rb.row[c.b]) }); });
      if (diffs.length) changed.push({ key: keyLabel(ra.row, keysA), lineA: ra.line, lineB: rb.line, a: ra.row, b: rb.row, diffs: diffs }); else same++;
    });
    Object.keys(ib.map).forEach(function (k) { if (!ia.map[k]) onlyB.push(ib.map[k].row); });
    return { onlyA: onlyA, onlyB: onlyB, changed: changed, same: same, dupA: ia.dups, dupB: ib.dups, columns: cols, compared: cmpCols.map(function (c) { return c.a; }) };
  }

  /* Duplicates on chosen columns. mode: 'exact' (trim+case), 'fuzzy' (punctuation, suffixes) or 'similar' (fuzzy + near spelling).
     -> [{key, rows:[{line, row}]}] groups with 2+ rows */
  function duplicates(rows, cols, mode, threshold) {
    mode = mode || 'exact'; threshold = threshold || 0.88;
    var groups = {}, order = [];
    var keyFn = mode === 'exact' ? function (r) { return cols.map(function (c) { return norm(r[c]); }).join(SEP); }
      : function (r) { return cols.map(function (c) { return fuzzy(r[c]); }).join(SEP); };
    rows.forEach(function (r, i) {
      var k = keyFn(r); if (!k.replace(new RegExp(SEP, 'g'), '').trim()) return;
      if (!groups[k]) { groups[k] = { key: k.split(SEP).join(' / '), rows: [] }; order.push(k); }
      groups[k].rows.push({ line: i + 2, row: r });
    });
    if (mode === 'similar' && order.length <= 3000) {
      // merge near-identical keys (blocked by first character to stay fast)
      var parent = {}; order.forEach(function (k) { parent[k] = k; });
      var find = function (k) { while (parent[k] !== k) k = parent[k] = parent[parent[k]]; return k; };
      var blocks = {}; order.forEach(function (k) { var b = k.charAt(0); (blocks[b] = blocks[b] || []).push(k); });
      Object.keys(blocks).forEach(function (b) {
        var ks = blocks[b];
        for (var i = 0; i < ks.length; i++) for (var j = i + 1; j < ks.length; j++) {
          if (Math.abs(ks[i].length - ks[j].length) > 4) continue;
          if (similarity(ks[i], ks[j]) >= threshold) parent[find(ks[j])] = find(ks[i]);
        }
      });
      var merged = {}, mOrder = [];
      order.forEach(function (k) { var r = find(k); if (!merged[r]) { merged[r] = { key: groups[r].key, rows: [] }; mOrder.push(r); } merged[r].rows = merged[r].rows.concat(groups[k].rows); });
      groups = merged; order = mOrder;
    }
    return order.map(function (k) { var g = groups[k]; g.rows.sort(function (x, y) { return x.line - y.line; }); return g; }).filter(function (g) { return g.rows.length > 1; });
  }

  function refNorm(v) { return str(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function refDigits(v) { var m = str(v).match(/\d{3,}/g); return m ? m.map(function (d) { return d.replace(/^0+/, ''); }) : []; }
  function dayDiff(a, b) { return Math.round((a - b) / 86400000); }
  function r2(n) { return Math.round(n * 100) / 100; }

  /* Invoice <-> payment reconciliation.
     inv/pay: {rows, ref, amount, date} (column names). opts: {days: 7, tolerance: 0.01}
     Pass 1: reference match (payment reference contains the invoice number, or same digits); several payments may pay one invoice.
     Pass 2: unmatched payments matched to an open invoice with the same outstanding amount (± tolerance) within ±days, closest date wins. */
  function reconcile(inv, pay, opts) {
    opts = opts || {}; var days = opts.days == null ? 7 : +opts.days, tol = opts.tolerance == null ? 0.01 : +opts.tolerance;
    var invoices = inv.rows.map(function (r, i) {
      return { line: i + 2, row: r, ref: str(r[inv.ref]).trim(), refN: refNorm(r[inv.ref]), digits: refDigits(r[inv.ref]), amount: B.toNumber(r[inv.amount]) || 0, date: inv.date ? B.toDate(r[inv.date]) : null, paid: 0, payments: [] };
    }).filter(function (x) { return x.ref || x.amount; });
    var payments = pay.rows.map(function (r, i) {
      return { line: i + 2, row: r, ref: pay.ref ? str(r[pay.ref]).trim() : '', refN: pay.ref ? refNorm(r[pay.ref]) : '', amount: B.toNumber(r[pay.amount]) || 0, date: pay.date ? B.toDate(r[pay.date]) : null, invoice: null, how: '' };
    }).filter(function (x) { return x.amount || x.ref; });
    // index invoices by normalised ref and by digit runs (only when unique)
    var byRef = {}, byDigits = {}, digitCount = {};
    invoices.forEach(function (x) { if (x.refN) byRef[x.refN] = x; x.digits.forEach(function (d) { digitCount[d] = (digitCount[d] || 0) + 1; byDigits[d] = x; }); });
    var refs = Object.keys(byRef).filter(function (k) { return k.length >= 3; }).sort(function (a, b) { return b.length - a.length; });
    function apply(p, x, how) { p.invoice = x; p.how = how; x.paid = r2(x.paid + p.amount); x.payments.push(p); }
    payments.forEach(function (p) {
      if (!p.refN) return;
      if (byRef[p.refN]) return apply(p, byRef[p.refN], 'Reference');
      for (var i = 0; i < refs.length; i++) if (p.refN.indexOf(refs[i]) !== -1) return apply(p, byRef[refs[i]], 'Reference (in text)');
      var ds = refDigits(p.ref);
      for (var j = 0; j < ds.length; j++) if (digitCount[ds[j]] === 1 && ds[j].length >= 3) return apply(p, byDigits[ds[j]], 'Reference number');
    });
    payments.forEach(function (p) {
      if (p.invoice) return;
      var best = null, bestGap = Infinity;
      invoices.forEach(function (x) {
        var open = r2(x.amount - x.paid);
        if (x.paid > 0 || Math.abs(open - p.amount) > tol + 1e-9) return;
        var gap = (p.date && x.date) ? Math.abs(dayDiff(p.date, x.date)) : (p.date || x.date ? Infinity : 0);
        if (gap <= days && gap < bestGap) { best = x; bestGap = gap; }
      });
      if (best) apply(p, best, 'Amount + date (' + bestGap + ' day' + (bestGap === 1 ? '' : 's') + ')');
    });
    invoices.forEach(function (x) {
      var bal = r2(x.amount - x.paid);
      x.balance = bal;
      x.status = x.paid === 0 ? 'Unpaid' : Math.abs(bal) <= tol + 1e-9 ? 'Paid' : bal > 0 ? 'Part paid' : 'Overpaid';
    });
    var sum = function (arr, f) { return r2(arr.reduce(function (s, x) { return s + f(x); }, 0)); };
    var unmatchedPay = payments.filter(function (p) { return !p.invoice; });
    return {
      invoices: invoices, payments: payments,
      paid: invoices.filter(function (x) { return x.status === 'Paid'; }),
      partial: invoices.filter(function (x) { return x.status === 'Part paid'; }),
      overpaid: invoices.filter(function (x) { return x.status === 'Overpaid'; }),
      unpaid: invoices.filter(function (x) { return x.status === 'Unpaid'; }),
      unmatchedPayments: unmatchedPay,
      totals: {
        invoiced: sum(invoices, function (x) { return x.amount; }),
        received: sum(payments, function (p) { return p.amount; }),
        applied: sum(payments.filter(function (p) { return p.invoice; }), function (p) { return p.amount; }),
        unapplied: sum(unmatchedPay, function (p) { return p.amount; }),
        outstanding: sum(invoices, function (x) { return Math.max(0, x.balance); }),
        invoiceCount: invoices.length, paymentCount: payments.length
      }
    };
  }

  // Guess the ref / amount / date columns for reconciliation.
  function guessColumns(headers) {
    function pick(re, not) { for (var i = 0; i < headers.length; i++) if (re.test(headers[i]) && !(not && not.test(headers[i]))) return headers[i]; return ''; }
    return {
      ref: pick(/invoice\s*(no|num|#|id)|^inv|ref|reference|description|narration|particulars|number|^id$/i, /date|amount/i),
      amount: pick(/amount|total|paid|value|credit|\$/i, /date|tax|gst/i),
      date: pick(/date|paid on|issued|when/i)
    };
  }

  // A real calendar date (rejects 31/02 and 2026-13-45, which Date would silently roll over).
  function validDate(s) {
    s = str(s).trim(); var m, y, mo, d;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
    else { var x = B.toDate(s); return !!(x && !isNaN(x) && /\d/.test(s) && /[a-z]{3}/i.test(s)); }
    var dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  }

  var EMAIL =/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var RULES = {
    required: 'Must not be empty', number: 'Must be a number', date: 'Must be a date', email: 'Must be an email address',
    unique: 'Must be unique', regex: 'Must match pattern', min: 'Must be at least', max: 'Must be at most', oneOf: 'Must be one of'
  };
  /* Validate rows. rules: [{col, type, value}] -> {failures:[{line, col, value, rule, message}], byRule:[{col,type,count}], badRows} */
  function validate(rows, rules) {
    var failures = [], counts = {};
    rules.forEach(function (rule, ri) {
      var seen = {}, re = null;
      if (rule.type === 'regex') { try { re = new RegExp(rule.value); } catch (e) { failures.push({ line: 0, col: rule.col, value: rule.value, rule: rule.type, message: 'Pattern is not valid: ' + e.message }); return; } }
      var list = rule.type === 'oneOf' ? String(rule.value || '').split(/[,|]/).map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean) : null;
      if (rule.type === 'unique') rows.forEach(function (r) { var v = norm(r[rule.col]); if (v) seen[v] = (seen[v] || 0) + 1; });
      rows.forEach(function (r, i) {
        var v = r[rule.col], s = str(v).trim(), bad = false, msg = RULES[rule.type] || rule.type;
        if (rule.type === 'required') bad = !s;
        else if (!s) bad = false; // other rules skip blanks (combine with "required")
        else if (rule.type === 'number') bad = isNaN(B.toNumber(s)) || !/\d/.test(s) || /[a-z]{2,}/i.test(s.replace(/\b(DR|CR|AUD|USD)\b/gi, ''));
        else if (rule.type === 'date') bad = !validDate(s);
        else if (rule.type === 'email') bad = !EMAIL.test(s);
        else if (rule.type === 'unique') { bad = seen[norm(v)] > 1; msg = 'Appears ' + seen[norm(v)] + ' times'; }
        else if (rule.type === 'regex') bad = !re.test(s);
        else if (rule.type === 'min' || rule.type === 'max') {
          var n = B.toNumber(s), lim = B.toNumber(rule.value);
          bad = isNaN(n) || (rule.type === 'min' ? n < lim : n > lim); msg += ' ' + rule.value;
        } else if (rule.type === 'oneOf') { bad = list.indexOf(s.toLowerCase()) < 0; msg += ': ' + list.join(', '); }
        if (rule.type === 'regex') msg += ' ' + rule.value;
        if (bad) { failures.push({ line: i + 2, col: rule.col, value: s, rule: rule.type, message: msg }); counts[ri] = (counts[ri] || 0) + 1; }
      });
    });
    var badRows = {}; failures.forEach(function (f) { if (f.line) badRows[f.line] = 1; });
    failures.sort(function (a, b) { return a.line - b.line; });
    return { failures: failures, byRule: rules.map(function (r, i) { return { col: r.col, type: r.type, value: r.value, count: counts[i] || 0 }; }), badRows: Object.keys(badRows).length };
  }

  // Suggest starter rules from the data itself.
  function suggestRules(headers, rows) {
    var out = [];
    headers.forEach(function (h) {
      var vals = rows.map(function (r) { return str(r[h]).trim(); }).filter(Boolean), n = vals.length;
      if (!n) return;
      var name = h.toLowerCase();
      if (n >= rows.length * 0.9) out.push({ col: h, type: 'required' });
      if (/e-?mail/.test(name) || vals.filter(function (v) { return EMAIL.test(v); }).length >= n * 0.8) out.push({ col: h, type: 'email' });
      else if (/date|dob|due|issued/.test(name) || vals.filter(function (v) { return /^\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}$/.test(v); }).length >= n * 0.8) out.push({ col: h, type: 'date' });
      else if (vals.filter(isNum).length >= n * 0.8) { out.push({ col: h, type: 'number' }); if (/amount|price|qty|quantity|total|cost/.test(name)) out.push({ col: h, type: 'min', value: '0' }); }
      if (suggestKeys([h], rows)[0].score >= 6 && /id|ref|no|number|code|sku|email/.test(name)) out.push({ col: h, type: 'unique' });
    });
    return out;
  }

  // ---------- report ----------
  function esc(s) { return B.esc(s); }
  function tableHtml(rows, cols) {
    if (!rows.length) return '<p><em>None.</em></p>';
    return '<table><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + cols.map(function (c) { return '<td>' + esc(str(r[c])) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }
  function money(n) { return B.fmt.money(n); }
  /* Build a standalone printable HTML report. parts: {title, compare:{result, nameA, nameB, headersA, headersB}, recon:{result}, dups:{groups, cols}, validation:{result}} */
  function reportHtml(parts) {
    var h = [], when = parts.when || new Date().toISOString().slice(0, 16).replace('T', ' ');
    h.push('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(parts.title || 'Reconciliation report') + '</title>');
    h.push('<style>body{font:14px/1.5 system-ui,sans-serif;color:#111;margin:24px;max-width:1100px}h1{font-size:22px}h2{font-size:17px;margin-top:28px;border-bottom:1px solid #ccc}table{border-collapse:collapse;width:100%;font-size:12px;margin:8px 0}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f2f2f2}.k{display:inline-block;margin:0 18px 8px 0}.k b{display:block;font-size:18px}del{color:#b42318}ins{color:#1f7a46;text-decoration:none;font-weight:600}@media print{h2{page-break-after:avoid}}</style></head><body>');
    h.push('<h1>' + esc(parts.title || 'Reconciliation report') + '</h1><p>Prepared ' + esc(when) + ' with Brahaspati Excel &amp; CSV Intelligence. Data was processed in the browser.</p>');
    if (parts.compare) {
      var c = parts.compare, r = c.result;
      h.push('<h2>Comparison: ' + esc(c.nameA) + ' vs ' + esc(c.nameB) + '</h2>');
      h.push('<p><span class="k"><b>' + r.same + '</b>identical</span><span class="k"><b>' + r.changed.length + '</b>changed</span><span class="k"><b>' + r.onlyA.length + '</b>only in ' + esc(c.nameA) + '</span><span class="k"><b>' + r.onlyB.length + '</b>only in ' + esc(c.nameB) + '</span></p>');
      h.push('<h3>Changed rows</h3>');
      h.push(r.changed.length ? '<table><thead><tr><th>Key</th><th>Column</th><th>' + esc(c.nameA) + '</th><th>' + esc(c.nameB) + '</th></tr></thead><tbody>' +
        r.changed.map(function (x) { return x.diffs.map(function (d, i) { return '<tr><td>' + (i ? '' : esc(x.key)) + '</td><td>' + esc(d.col) + '</td><td><del>' + esc(d.a) + '</del></td><td><ins>' + esc(d.b) + '</ins></td></tr>'; }).join(''); }).join('') + '</tbody></table>' : '<p><em>None.</em></p>');
      h.push('<h3>Only in ' + esc(c.nameA) + '</h3>' + tableHtml(r.onlyA, c.headersA));
      h.push('<h3>Only in ' + esc(c.nameB) + '</h3>' + tableHtml(r.onlyB, c.headersB));
    }
    if (parts.recon) {
      var t = parts.recon.result.totals, rr = parts.recon.result;
      h.push('<h2>Invoice and payment reconciliation</h2>');
      h.push('<p><span class="k"><b>' + money(t.invoiced) + '</b>invoiced (' + t.invoiceCount + ')</span><span class="k"><b>' + money(t.received) + '</b>received (' + t.paymentCount + ')</span><span class="k"><b>' + money(t.outstanding) + '</b>still owed</span><span class="k"><b>' + money(t.unapplied) + '</b>payments not matched</span></p>');
      var invRow = function (x) { return '<tr><td>' + esc(x.ref) + '</td><td>' + esc(x.date ? B.fmt.date(x.date) : '') + '</td><td>' + money(x.amount) + '</td><td>' + money(x.paid) + '</td><td>' + money(x.balance) + '</td><td>' + esc(x.status) + '</td><td>' + esc(x.payments.map(function (p) { return p.how; }).join('; ')) + '</td></tr>'; };
      h.push('<h3>Invoices</h3><table><thead><tr><th>Invoice</th><th>Date</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th>Matched by</th></tr></thead><tbody>' + rr.invoices.map(invRow).join('') + '</tbody></table>');
      h.push('<h3>Payments not matched to an invoice</h3>' + (rr.unmatchedPayments.length ? '<table><thead><tr><th>Reference</th><th>Date</th><th>Amount</th></tr></thead><tbody>' +
        rr.unmatchedPayments.map(function (p) { return '<tr><td>' + esc(p.ref) + '</td><td>' + esc(p.date ? B.fmt.date(p.date) : '') + '</td><td>' + money(p.amount) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p><em>None.</em></p>'));
    }
    if (parts.dups) {
      h.push('<h2>Duplicates on ' + esc(parts.dups.cols.join(', ')) + '</h2>');
      h.push(parts.dups.groups.length ? '<table><thead><tr><th>Value</th><th>Rows</th></tr></thead><tbody>' + parts.dups.groups.map(function (g) { return '<tr><td>' + esc(g.key) + '</td><td>' + g.rows.map(function (x) { return x.line; }).join(', ') + '</td></tr>'; }).join('') + '</tbody></table>' : '<p><em>No duplicates found.</em></p>');
    }
    if (parts.validation) {
      var v = parts.validation.result;
      h.push('<h2>Data checks</h2><p>' + v.failures.length + ' problem(s) across ' + v.badRows + ' row(s).</p>');
      h.push('<table><thead><tr><th>Rule</th><th>Column</th><th>Failures</th></tr></thead><tbody>' + v.byRule.map(function (b) { return '<tr><td>' + esc(b.type + (b.value ? ' ' + b.value : '')) + '</td><td>' + esc(b.col) + '</td><td>' + b.count + '</td></tr>'; }).join('') + '</tbody></table>');
      if (v.failures.length) h.push('<h3>Failing cells</h3><table><thead><tr><th>Row</th><th>Column</th><th>Value</th><th>Problem</th></tr></thead><tbody>' + v.failures.slice(0, 2000).map(function (f) { return '<tr><td>' + f.line + '</td><td>' + esc(f.col) + '</td><td>' + esc(f.value) + '</td><td>' + esc(f.message) + '</td></tr>'; }).join('') + '</tbody></table>');
    }
    h.push('<p style="margin-top:28px;color:#666">Row numbers count the header as row 1, so they match the row numbers in Excel.</p></body></html>');
    return h.join('\n');
  }

  // Flatten result sets into sheet-friendly arrays of objects.
  function exportSets(parts) {
    var sets = [];
    if (parts.compare) {
      var r = parts.compare.result;
      sets.push({ name: 'Changed', rows: [].concat.apply([], r.changed.map(function (x) { return x.diffs.map(function (d) { return { Key: x.key, Column: d.col, Before: d.a, After: d.b, 'Row in A': x.lineA, 'Row in B': x.lineB }; }); })) });
      sets.push({ name: 'Only in A', rows: r.onlyA });
      sets.push({ name: 'Only in B', rows: r.onlyB });
    }
    if (parts.recon) {
      var rr = parts.recon.result;
      sets.push({ name: 'Invoices', rows: rr.invoices.map(function (x) { return { Invoice: x.ref, Date: x.date ? B.fmt.date(x.date) : '', Amount: x.amount, Paid: x.paid, Balance: x.balance, Status: x.status, 'Matched by': x.payments.map(function (p) { return p.how; }).join('; ') }; }) });
      sets.push({ name: 'Unmatched payments', rows: rr.unmatchedPayments.map(function (p) { return { Reference: p.ref, Date: p.date ? B.fmt.date(p.date) : '', Amount: p.amount }; }) });
    }
    if (parts.dups) sets.push({ name: 'Duplicates', rows: [].concat.apply([], parts.dups.groups.map(function (g, i) { return g.rows.map(function (x) { return Object.assign({ Group: i + 1, Row: x.line }, x.row); }); })) });
    if (parts.validation) sets.push({ name: 'Validation', rows: parts.validation.result.failures.map(function (f) { return { Row: f.line, Column: f.col, Value: f.value, Problem: f.message }; }) });
    return sets;
  }

  var L = {
    norm: norm, fuzzy: fuzzy, similarity: similarity, isNum: isNum, suggestKeys: suggestKeys, matchHeaders: matchHeaders, valuesEqual: valuesEqual,
    validDate: validDate, compare: compare, duplicates: duplicates, reconcile: reconcile, guessColumns: guessColumns, validate: validate, suggestRules: suggestRules,
    RULES: RULES, reportHtml: reportHtml, exportSets: exportSets
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.CsvIntelLib = L;
})(this);
