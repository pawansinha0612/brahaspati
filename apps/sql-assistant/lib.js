/* SQL Assistant — pure logic: tokenizer, formatter, plain-English explainer and linter. No DOM. */
(function (root) {
  'use strict';

  var KEYWORDS = ('SELECT FROM WHERE AND OR NOT IN IS NULL AS ON JOIN INNER LEFT RIGHT FULL OUTER CROSS NATURAL GROUP BY ORDER HAVING LIMIT OFFSET FETCH TOP ' +
    'DISTINCT ALL UNION INTERSECT EXCEPT MINUS INSERT INTO VALUES UPDATE SET DELETE WITH RECURSIVE CASE WHEN THEN ELSE END LIKE ILIKE BETWEEN EXISTS ' +
    'ASC DESC RETURNING CREATE TABLE ALTER DROP VIEW PRIMARY FOREIGN REFERENCES DEFAULT CONSTRAINT UNIQUE CHECK TRUE FALSE USING OVER PARTITION ' +
    'WINDOW MERGE MATCHED CAST INTERVAL ANY SOME LATERAL APPLY TRUNCATE GRANT REVOKE BEGIN COMMIT ROLLBACK PERCENT ESCAPE COLLATE QUALIFY CONFLICT DO NOTHING ROWNUM').split(' ');
  var SOFT = 'FIRST NEXT ROWS ROW ONLY LAST NULLS TIES'.split(' ');
  var FUNCS = ('COUNT SUM AVG MIN MAX COALESCE NULLIF IFNULL ISNULL NVL UPPER LOWER TRIM LTRIM RTRIM SUBSTRING SUBSTR LENGTH LEN CONCAT ROUND FLOOR ' +
    'CEIL CEILING ABS NOW DATE YEAR MONTH DAY EXTRACT DATE_TRUNC DATEADD DATEDIFF DATE_FORMAT TO_CHAR TO_DATE CONVERT ROW_NUMBER RANK DENSE_RANK ' +
    'LAG LEAD STRING_AGG GROUP_CONCAT LISTAGG GETDATE SYSDATE REPLACE POSITION CHARINDEX FORMAT IIF GREATEST LEAST').split(' ');
  var KW = {}, FN = {}, SF = {};
  KEYWORDS.forEach(function (k) { KW[k] = 1; }); FUNCS.forEach(function (k) { FN[k] = 1; }); SOFT.forEach(function (k) { SF[k] = 1; });
  var MULTI = [
    ['LEFT', 'OUTER', 'JOIN'], ['RIGHT', 'OUTER', 'JOIN'], ['FULL', 'OUTER', 'JOIN'], ['UNION', 'ALL'], ['GROUP', 'BY'], ['ORDER', 'BY'], ['PARTITION', 'BY'],
    ['INSERT', 'INTO'], ['DELETE', 'FROM'], ['MERGE', 'INTO'], ['LEFT', 'JOIN'], ['RIGHT', 'JOIN'], ['FULL', 'JOIN'], ['INNER', 'JOIN'], ['CROSS', 'JOIN'],
    ['NATURAL', 'JOIN'], ['CROSS', 'APPLY'], ['OUTER', 'APPLY'], ['ON', 'CONFLICT'], ['NOT', 'EXISTS'], ['NOT', 'IN'], ['NOT', 'LIKE'], ['IS', 'NOT'], ['NOT', 'BETWEEN']
  ];
  var JOINS = { 'JOIN': 1, 'INNER JOIN': 1, 'LEFT JOIN': 1, 'RIGHT JOIN': 1, 'FULL JOIN': 1, 'LEFT OUTER JOIN': 1, 'RIGHT OUTER JOIN': 1, 'FULL OUTER JOIN': 1, 'CROSS JOIN': 1, 'NATURAL JOIN': 1, 'CROSS APPLY': 1, 'OUTER APPLY': 1 };
  var MAJOR = { 'SELECT': 1, 'FROM': 1, 'WHERE': 1, 'GROUP BY': 1, 'HAVING': 1, 'ORDER BY': 1, 'LIMIT': 1, 'OFFSET': 1, 'FETCH': 1, 'UNION': 1, 'UNION ALL': 1, 'INTERSECT': 1, 'EXCEPT': 1, 'MINUS': 1,
    'INSERT INTO': 1, 'VALUES': 1, 'UPDATE': 1, 'SET': 1, 'DELETE FROM': 1, 'DELETE': 1, 'WITH': 1, 'RETURNING': 1, 'WINDOW': 1, 'QUALIFY': 1, 'ON CONFLICT': 1, 'MERGE INTO': 1 };
  var LIST_CLAUSES = { 'SELECT': 1, 'GROUP BY': 1, 'ORDER BY': 1, 'SET': 1, 'VALUES': 1, 'RETURNING': 1 };

  // ---------- tokenizer ----------
  // types: ws, comment, string, qident, number, keyword, func, word, param, op, punct
  function tokenize(sql) {
    var s = String(sql == null ? '' : sql), i = 0, out = [], m;
    function push(type, value) { out.push({ type: type, value: value }); }
    while (i < s.length) {
      var rest = s.slice(i), c = s.charAt(i);
      if ((m = rest.match(/^\s+/))) push('ws', m[0]);
      else if ((m = rest.match(/^--[^\n]*/))) push('comment', m[0]);
      else if (c === '/' && s.charAt(i + 1) === '*') { var e = s.indexOf('*/', i + 2); m = [e < 0 ? rest : s.slice(i, e + 2)]; push('comment', m[0]); }
      else if ((m = rest.match(/^(?:[NnEeBbXx])?'(?:[^']|'')*(?:'|$)/))) push('string', m[0]);
      else if ((m = rest.match(/^\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/))) push('string', m[0]);
      else if ((m = rest.match(/^"(?:[^"]|"")*(?:"|$)/)) || (m = rest.match(/^`[^`]*(?:`|$)/)) || (m = rest.match(/^\[[^\]\s][^\]]*\]/))) push('qident', m[0]);
      else if ((m = rest.match(/^(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/))) push('number', m[0]);
      else if ((m = rest.match(/^(?:[@:](?!:)[A-Za-z_][\w]*|\$\d+|\?)/))) push('param', m[0]);
      else if ((m = rest.match(/^[A-Za-z_À-￿][\w$#À-￿]*/))) {
        var up = m[0].toUpperCase();
        push(KW[up] ? 'keyword' : FN[up] ? 'func' : 'word', m[0]);
      }
      else if ((m = rest.match(/^(?:<>|!=|>=|<=|\|\||::|->>|->|=>|[=<>+\-*\/%&|^~!])/))) push('op', m[0]);
      else { m = [c]; push('punct', c); }
      i += m[0].length;
    }
    return out;
  }

  // significant tokens with merged multi-word keywords; comments kept unless dropComments
  function sigTokens(sql, dropComments) {
    var t = tokenize(sql).filter(function (x) { return x.type !== 'ws' && !(dropComments && x.type === 'comment'); });
    var out = [];
    for (var i = 0; i < t.length; i++) {
      var tok = t[i], merged = false;
      if (tok.type === 'keyword' || tok.type === 'word') {
        for (var k = 0; k < MULTI.length && !merged; k++) {
          var seq = MULTI[k], okSeq = true;
          for (var j = 0; j < seq.length; j++) { var x = t[i + j]; if (!x || x.value.toUpperCase() !== seq[j]) { okSeq = false; break; } }
          if (okSeq) { out.push({ type: 'keyword', value: seq.join(' '), raw: t.slice(i, i + seq.length).map(function (y) { return y.value; }).join(' ') }); i += seq.length - 1; merged = true; }
        }
      }
      if (!merged) out.push({ type: tok.type, value: tok.value });
    }
    // functions: a known or unknown word directly followed by "("; soft keywords in context
    for (var n = 0; n < out.length; n++) {
      var a = out[n], nx = out[n + 1], pv = out[n - 1];
      if (a.type === 'word' && SF[a.value.toUpperCase()] && pv && (pv.type === 'keyword' || pv.type === 'number' || (pv.type === 'word' && SF[pv.value.toUpperCase()]))) a.type = 'keyword';
      if (a.type === 'word' && a.value.toUpperCase() === 'NULLS' && nx && /^(FIRST|LAST)$/i.test(nx.value)) a.type = 'keyword';
      if ((a.type === 'func' || a.type === 'word') && nx && nx.value === '(') a.call = true;
      if (a.type === 'func' && !(nx && nx.value === '(')) a.type = 'word';
    }
    return out;
  }
  function U(t) { return t ? (t.type === 'keyword' || t.type === 'func' ? t.value.toUpperCase() : t.value) : ''; }

  // ---------- formatter ----------
  function needsSpace(prev, tok, ctx) {
    if (!prev) return false;
    var v = tok.value, p = prev.value;
    if (v === ',' || v === ')' || v === ';' || v === '.' || p === '(' || p === '.' || v === '::' || p === '::') return false;
    if (v === '(' && prev.call && !(ctx && ctx.insertTarget)) return false;
    if (v === '(' && (prev.type === 'word' || prev.type === 'qident') && !(ctx && ctx.insertTarget)) return false;
    if (prev.unary) return false;
    if (v === '[' || p === '[' || v === ']') return false;
    return true;
  }

  function format(sql, opts) {
    opts = opts || {}; var IND = opts.indent || '  ', upper = opts.uppercase !== false;
    var toks = sigTokens(sql, false);
    var lines = [], cur = '', curLevel = 0, level = 0, stack = [], clause = null, listStyle = false, pendingBreak = false, topMode = 0, between = false, prev = null, insertTarget = false;
    function ind(n) { return new Array(n + 1).join(IND); }
    function nl(extra) { if (cur.trim()) lines.push(cur.replace(/\s+$/, '')); curLevel = level + (extra || 0); cur = ind(curLevel); prev = null; }
    function emit(tok, text) {
      var sp = cur.trim() !== '' && needsSpace(prev, tok, { insertTarget: insertTarget && tok.value === '(' });
      cur += (sp ? ' ' : '') + text; prev = tok;
    }
    function inParen() { return stack.length && stack[stack.length - 1].type === 'paren'; }
    function countTopCommas(i) {
      var d = 0, n = 0;
      for (var j = i + 1; j < toks.length; j++) {
        var t = toks[j], u = U(t);
        if (t.value === '(') d++; else if (t.value === ')') { if (d === 0) break; d--; }
        else if (d === 0 && (t.value === ';' || (t.type === 'keyword' && (MAJOR[u] || JOINS[u])))) break;
        else if (d === 0 && t.value === ',') n++;
      }
      return n;
    }
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], u = U(t), text = t.type === 'keyword' || t.type === 'func' ? (upper ? (t.raw ? u : t.value.toUpperCase()) : (t.raw || t.value)) : t.value;
      if (t.type === 'word' && SF[t.value.toUpperCase()] === undefined && false) text = t.value;
      if (t.type === 'comment') {
        if (/^--/.test(t.value)) { if (cur.trim()) cur += ' '; cur += t.value; nl(curLevel - level); }
        else { if (cur.trim()) cur += ' '; cur += t.value; }
        continue;
      }
      if (pendingBreak) {
        var keep = u === 'DISTINCT' || u === 'ALL' || u === 'TOP' || topMode > 0 || (u === 'ON' && prev && U(prev) === 'DISTINCT');
        if (u === 'TOP') topMode = 1;
        else if (topMode === 1) { if (t.value === '(') topMode = 2; else if (t.type === 'number' || t.type === 'param') topMode = 3; else topMode = 0; }
        else if (topMode === 2) { if (t.value === ')') topMode = 3; }
        else if (topMode === 3) { topMode = (u === 'PERCENT' || u === 'WITH' || u === 'TIES') ? 3 : 0; keep = topMode > 0; }
        if (topMode === 0 && !(u === 'DISTINCT' || u === 'ALL' || u === 'TOP')) keep = false;
        if (!keep) { pendingBreak = false; nl(1); }
      }
      if (t.value === ';') { emit(t, ';'); nl(0); lines.push(''); level = 0; curLevel = 0; cur = ''; stack = []; clause = null; listStyle = false; insertTarget = false; continue; }
      if (t.value === '(') {
        var nx = toks[i + 1], sub = nx && /^(SELECT|WITH)$/.test(U(nx));
        emit(t, '(');
        stack.push({ type: sub ? 'sub' : 'paren', level: level, lineLevel: curLevel, clause: clause, listStyle: listStyle });
        if (sub) { level = curLevel + 1; clause = null; listStyle = false; }
        insertTarget = false;
        continue;
      }
      if (t.value === ')') {
        var f = stack.pop();
        if (f && f.type === 'sub') { level = f.lineLevel; nl(0); cur = ind(f.lineLevel); curLevel = f.lineLevel; emit(t, ')'); level = f.level; clause = f.clause; listStyle = f.listStyle; }
        else if (f && f.type === 'case') { emit(t, ')'); }
        else emit(t, ')');
        continue;
      }
      if (t.type === 'keyword' && u === 'CASE') { emit(t, text); stack.push({ type: 'case', level: level, lineLevel: curLevel }); level = curLevel + 1; continue; }
      if (t.type === 'keyword' && (u === 'WHEN' || u === 'ELSE') && stack.length && stack[stack.length - 1].type === 'case') { nl(0); emit(t, text); continue; }
      if (t.type === 'keyword' && u === 'END' && stack.length && stack[stack.length - 1].type === 'case') {
        var cf = stack.pop(); level = cf.lineLevel + 1; nl(-1); emit(t, text); level = cf.level; continue;
      }
      if (t.type === 'keyword' && !inParen() && (MAJOR[u] || JOINS[u])) {
        if (MAJOR[u]) {
          nl(0); emit(t, text); clause = u; between = false;
          insertTarget = u === 'INSERT INTO';
          listStyle = !!LIST_CLAUSES[u] && countTopCommas(i) > 0;
          if (listStyle) { pendingBreak = true; topMode = 0; }
          if (/^(UNION|UNION ALL|INTERSECT|EXCEPT|MINUS)$/.test(u)) nl(0);
        } else { nl(0); emit(t, text); clause = 'JOIN'; listStyle = false; }
        continue;
      }
      if (t.type === 'keyword' && u === 'ON' && clause === 'JOIN' && !inParen()) { nl(1); emit(t, text); clause = 'ON'; continue; }
      if (t.type === 'keyword' && u === 'BETWEEN') { between = true; emit(t, text); continue; }
      if (t.type === 'keyword' && (u === 'AND' || u === 'OR')) {
        if (u === 'AND' && between) { between = false; emit(t, text); continue; }
        if (!inParen() && /^(WHERE|HAVING|ON|QUALIFY)$/.test(clause || '') && !(stack.length && stack[stack.length - 1].type === 'case')) { nl(1); emit(t, text); continue; }
        emit(t, text); continue;
      }
      if (t.value === ',') {
        emit(t, ',');
        if (!inParen() && !(stack.length && stack[stack.length - 1].type === 'case')) {
          if (clause === 'WITH') nl(0);
          else if (listStyle) nl(1);
        }
        continue;
      }
      if (t.type === 'op' && (t.value === '-' || t.value === '+') && (!prev || prev.type === 'op' || prev.type === 'keyword' || prev.value === '(' || prev.value === ',')) {
        emit(t, t.value); prev = { type: 'op', value: t.value, unary: true }; continue;
      }
      emit(t, text);
    }
    if (cur.trim()) lines.push(cur.replace(/\s+$/, ''));
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }

  // single-line rendering of a token slice (used by the explainer and fix examples)
  function inline(toks) {
    var out = '', prev = null;
    toks.forEach(function (t) {
      if (t.type === 'comment') return;
      var text = t.type === 'keyword' || t.type === 'func' ? t.value.toUpperCase() : t.value;
      var before = prev;
      out += (out && needsSpace(prev, t) ? ' ' : '') + text; prev = t;
      if (t.type === 'op' && (t.value === '-' || t.value === '+') && (!before || before.type === 'op' || before.type === 'keyword' || before.value === '(' || before.value === ',')) prev = { type: 'op', value: t.value, unary: true };
    });
    return out;
  }

  // ---------- structure ----------
  function splitStatements(toks) {
    var out = [], cur = [], d = 0;
    toks.forEach(function (t) {
      if (t.value === '(') d++; else if (t.value === ')') d--;
      if (t.value === ';' && d <= 0) { if (cur.length) out.push(cur); cur = []; d = 0; } else cur.push(t);
    });
    if (cur.length) out.push(cur);
    return out;
  }
  // depth-0 clause segments: [{kw, toks}]
  function clauses(toks) {
    var out = [], d = 0, cur = { kw: null, toks: [] };
    toks.forEach(function (t) {
      var u = U(t);
      if (t.value === '(') d++; else if (t.value === ')') d--;
      if (d === 0 && t.type === 'keyword' && (MAJOR[u] || JOINS[u])) { if (cur.kw || cur.toks.length) out.push(cur); cur = { kw: u, toks: [] }; }
      else cur.toks.push(t);
    });
    out.push(cur);
    return out.filter(function (c) { return c.kw || c.toks.length; });
  }
  function splitTop(toks, sep) {
    var parts = [[]], d = 0;
    toks.forEach(function (t) {
      if (t.value === '(') d++; else if (t.value === ')') d--;
      if (d === 0 && (typeof sep === 'string' ? (t.value === sep || U(t) === sep) : sep(t))) parts.push([]); else parts[parts.length - 1].push(t);
    });
    return parts.filter(function (p) { return p.length; });
  }
  // split on top-level AND, but not the AND that belongs to BETWEEN x AND y
  function splitAnd(toks) {
    var between = false;
    return splitTop(toks, function (t) {
      var u = U(t);
      if (u === 'BETWEEN' || u === 'NOT BETWEEN') between = true;
      else if (u === 'AND') { if (between) { between = false; return false; } return true; }
      return false;
    });
  }
  function subqueries(toks) {
    var out = [];
    for (var i = 0; i < toks.length; i++) {
      if (toks[i].value === '(' && toks[i + 1] && /^(SELECT|WITH)$/.test(U(toks[i + 1]))) {
        var d = 0, j = i;
        for (; j < toks.length; j++) { if (toks[j].value === '(') d++; else if (toks[j].value === ')') { d--; if (d === 0) break; } }
        out.push({ start: i, end: j, toks: toks.slice(i + 1, j) }); i = j;
      }
    }
    return out;
  }
  function short(s, n) { n = n || 90; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  // ---------- explainer ----------
  var JOIN_TEXT = {
    'JOIN': 'keeps only rows that have a match on both sides (an inner join)', 'INNER JOIN': 'keeps only rows that have a match on both sides',
    'LEFT JOIN': 'keeps every row from the tables before it, even with no match (missing columns become NULL)', 'LEFT OUTER JOIN': 'keeps every row from the tables before it, even with no match (missing columns become NULL)',
    'RIGHT JOIN': 'keeps every row from this table, even with no match on the left', 'RIGHT OUTER JOIN': 'keeps every row from this table, even with no match on the left',
    'FULL JOIN': 'keeps every row from both sides, matched where possible', 'FULL OUTER JOIN': 'keeps every row from both sides, matched where possible',
    'CROSS JOIN': 'pairs every row with every row of this table (all combinations)', 'NATURAL JOIN': 'matches on every column with the same name (risky if columns are added later)',
    'CROSS APPLY': 'runs the right side once per row and keeps rows that return something', 'OUTER APPLY': 'runs the right side once per row and keeps every row'
  };
  function describeTable(toks) {
    var sq = subqueries(toks);
    if (sq.length && sq[0].start === 0) {
      var alias = toks.slice(sq[0].end + 1).filter(function (t) { return U(t) !== 'AS'; }).map(function (t) { return t.value; }).join(' ');
      return { text: 'a subquery' + (alias ? ' named ' + alias : ''), sub: sq[0].toks };
    }
    var parts = toks.filter(function (t) { return t.type !== 'comment'; }), name = [], k = 0;
    while (k < parts.length && (k === 0 || parts[k].value === '.' || (parts[k - 1] && parts[k - 1].value === '.'))) { name.push(parts[k].value); k++; }
    var rest = parts.slice(k).filter(function (t) { return U(t) !== 'AS'; });
    var al = rest.length && (rest[0].type === 'word' || rest[0].type === 'qident') ? rest[0].value : '';
    return { text: name.join('') + (al ? ' (as ' + al + ')' : '') };
  }
  function describeOrder(toks) {
    return splitTop(toks, ',').map(function (p) {
      var last = U(p[p.length - 1]), dir = '';
      var nulls = /NULLS/.test(p.map(U).join(' '));
      var core = p.filter(function (t) { return !/^(ASC|DESC|NULLS|FIRST|LAST)$/.test(U(t)); });
      if (p.some(function (t) { return U(t) === 'DESC'; })) dir = ' (highest/latest first)'; else dir = ' (lowest/earliest first)';
      return inline(core) + dir + (nulls ? ' with NULLs ' + (last === 'FIRST' ? 'first' : 'last') : '');
    }).join(', then ');
  }

  function explainSelect(toks, depth) {
    var b = [], cl = clauses(toks), anyAgg = false;
    cl.forEach(function (c) {
      var body = c.toks, text = inline(body), subs = subqueries(body);
      var kids = subs.map(function (s) { return { text: 'Subquery: ' + short(inline(s.toks), 70), children: depth < 3 ? explainStatement(s.toks, depth + 1) : [] }; });
      switch (c.kw) {
        case 'SELECT': {
          var mods = [], items = body;
          while (items.length && /^(DISTINCT|ALL|TOP)$/.test(U(items[0]))) {
            if (U(items[0]) === 'DISTINCT') { mods.push('removes duplicate rows (DISTINCT)'); items = items.slice(1); if (U(items[0]) === 'ON') { var e = 1, dd = 0; for (; e < items.length; e++) { if (items[e].value === '(') dd++; else if (items[e].value === ')') { dd--; if (!dd) break; } } mods[mods.length - 1] = 'keeps one row per ' + inline(items.slice(2, e)) + ' (DISTINCT ON)'; items = items.slice(e + 1); } }
            else if (U(items[0]) === 'TOP') { var n = items[1] && items[1].value === '(' ? items[2] : items[1]; mods.push('returns only the first ' + (n ? n.value : 'N') + ' rows (TOP)'); items = items.slice(items[1] && items[1].value === '(' ? 4 : 2); if (U(items[0]) === 'PERCENT') items = items.slice(1); }
            else items = items.slice(1);
          }
          var cols = splitTop(items, ',');
          var aggs = []; items.forEach(function (t, i) { if (t.call && /^(COUNT|SUM|AVG|MIN|MAX|STRING_AGG|GROUP_CONCAT|LISTAGG)$/.test(U(t))) aggs.push(U(t)); });
          var windowed = items.some(function (t) { return U(t) === 'OVER'; });
          anyAgg = aggs.length > 0;
          if (cols.length === 1 && inline(cols[0]) === '*') b.push({ text: 'Returns every column (SELECT *).' });
          else b.push({ text: 'Returns ' + cols.length + ' column' + (cols.length === 1 ? '' : 's') + ': ' + short(cols.map(function (p) {
            var as = -1; p.forEach(function (t, i) { if (U(t) === 'AS') as = i; });
            if (as > 0) return p.slice(as + 1).map(function (t) { return t.value; }).join('') + ' = ' + short(inline(p.slice(0, as)), 40);
            return short(inline(p), 40);
          }).join(', '), 260) + '.' });
          if (aggs.length) b.push({ text: 'Calculates ' + aggs.filter(function (x, i, a) { return a.indexOf(x) === i; }).join(', ') + (windowed ? ' as window functions (per row, without collapsing rows)' : ' (totals/summaries)') + '.' });
          if (body.some(function (t) { return U(t) === 'CASE'; })) b.push({ text: 'Uses CASE to pick a value based on conditions.' });
          mods.forEach(function (m) { b.push({ text: m.charAt(0).toUpperCase() + m.slice(1) + '.' }); });
          break;
        }
        case 'FROM': {
          var tabs = splitTop(body, ',').map(describeTable);
          b.push({ text: 'Reads from ' + tabs.map(function (t) { return t.text; }).join(', ') + '.' + (tabs.length > 1 ? ' (Comma-separated tables are joined — check the WHERE clause links them.)' : ''), children: kids });
          kids = null; break;
        }
        case 'WHERE': case 'HAVING': {
          var conds = splitAnd(body).map(inline);
          b.push({ text: (c.kw === 'WHERE' ? 'Keeps only rows where ' : 'After grouping, keeps only groups where ') + (conds.length > 1 ? 'all of these are true: ' : '') + conds.map(function (x) { return short(x, 90); }).join('; ') + '.', children: kids });
          kids = null; break;
        }
        case 'GROUP BY': b.push({ text: 'Groups rows by ' + text + ' — one result row per ' + (splitTop(body, ',').length > 1 ? 'combination' : 'value') + '.' }); break;
        case 'ORDER BY': b.push({ text: 'Sorts by ' + describeOrder(body) + '.' }); break;
        case 'LIMIT': {
          var lp = splitTop(body, ',');
          if (lp.length === 2) b.push({ text: 'Skips the first ' + inline(lp[0]) + ' rows, then returns at most ' + inline(lp[1]) + ' (MySQL LIMIT offset, count).' });
          else b.push({ text: 'Returns at most ' + text + ' rows.' });
          break;
        }
        case 'OFFSET': b.push({ text: 'Skips the first ' + inline(body.filter(function (t) { return !/^(ROWS|ROW)$/.test(U(t)); })) + ' rows.' }); break;
        case 'FETCH': { var fn = body.filter(function (t) { return t.type === 'number' || t.type === 'param'; })[0]; b.push({ text: 'Returns at most ' + (fn ? fn.value : 'N') + ' rows (FETCH FIRST/NEXT).' }); break; }
        case 'WINDOW': b.push({ text: 'Defines a named window for window functions: ' + short(text) + '.' }); break;
        case 'QUALIFY': b.push({ text: 'Filters on window function results: ' + short(text) + '.' }); break;
        default:
          if (JOINS[c.kw]) {
            var onIdx = -1, d = 0; body.forEach(function (t, i) { if (t.value === '(') d++; else if (t.value === ')') d--; if (d === 0 && onIdx < 0 && (U(t) === 'ON' || U(t) === 'USING')) onIdx = i; });
            var tab = describeTable(onIdx >= 0 ? body.slice(0, onIdx) : body);
            var cond = onIdx >= 0 ? (U(body[onIdx]) === 'USING' ? 'same ' + inline(body.slice(onIdx + 1)) : inline(body.slice(onIdx + 1))) : '';
            b.push({ text: c.kw + ' ' + tab.text + ' — ' + JOIN_TEXT[c.kw] + (cond ? ', matching on ' + short(cond, 80) : '') + '.', children: tab.sub ? [{ text: 'Subquery: ' + short(inline(tab.sub), 70), children: depth < 3 ? explainStatement(tab.sub, depth + 1) : [] }] : [] });
            kids = null;
          }
      }
      if (kids && kids.length) b[b.length - 1].children = (b[b.length - 1].children || []).concat(kids);
    });
    var hasGroup = cl.some(function (c) { return c.kw === 'GROUP BY'; });
    if (anyAgg && !hasGroup && !cl.some(function (c) { return c.kw === 'SELECT' && c.toks.some(function (t) { return U(t) === 'OVER'; }); })) b.push({ text: 'With no GROUP BY, the totals cover all matching rows (one result row).' });
    return b;
  }

  function explainStatement(toks, depth) {
    depth = depth || 0;
    toks = toks.filter(function (t) { return t.type !== 'comment'; });
    if (!toks.length) return [];
    var first = U(toks[0]), b = [];
    if (first === 'WITH') {
      // WITH [RECURSIVE] name [(cols)] AS ( ... ), ...  main
      var i = 1, ctes = [];
      if (U(toks[i]) === 'RECURSIVE') { b.push({ text: 'Recursive CTE: a query that refers to itself (e.g. walking a tree or hierarchy).' }); i++; }
      while (i < toks.length) {
        var name = toks[i] ? toks[i].value : ''; i++;
        if (toks[i] && toks[i].value === '(' && U(toks[i + 1]) !== 'SELECT') { var dd = 0; for (; i < toks.length; i++) { if (toks[i].value === '(') dd++; else if (toks[i].value === ')') { dd--; if (!dd) { i++; break; } } } }
        if (U(toks[i]) === 'AS') i++;
        if (U(toks[i]) === 'NOT' || U(toks[i]) === 'MATERIALIZED') { while (toks[i] && toks[i].value !== '(') i++; }
        if (!toks[i] || toks[i].value !== '(') break;
        var d = 0, j = i; for (; j < toks.length; j++) { if (toks[j].value === '(') d++; else if (toks[j].value === ')') { d--; if (!d) break; } }
        ctes.push({ name: name, toks: toks.slice(i + 1, j) }); i = j + 1;
        if (toks[i] && toks[i].value === ',') { i++; continue; }
        break;
      }
      ctes.forEach(function (c) { b.push({ text: 'Builds a temporary result called “' + c.name + '” (a CTE):', children: explainStatement(c.toks, depth + 1) }); });
      return b.concat(explainStatement(toks.slice(i), depth));
    }
    // set operations split the statement into parts
    var parts = [], cur = [], d0 = 0, ops = [];
    toks.forEach(function (t) {
      if (t.value === '(') d0++; else if (t.value === ')') d0--;
      if (d0 === 0 && /^(UNION|UNION ALL|INTERSECT|EXCEPT|MINUS)$/.test(U(t))) { parts.push(cur); cur = []; ops.push(U(t)); } else cur.push(t);
    });
    parts.push(cur);
    if (parts.length > 1) {
      var OPS = { 'UNION': 'combined with UNION (duplicates removed)', 'UNION ALL': 'combined with UNION ALL (duplicates kept)', 'INTERSECT': 'INTERSECT (only rows in both)', 'EXCEPT': 'EXCEPT (rows in the first but not the second)', 'MINUS': 'MINUS (rows in the first but not the second)' };
      parts.forEach(function (p, k) { b.push({ text: 'Part ' + (k + 1) + (k ? ' — ' + OPS[ops[k - 1]] : '') + ':', children: explainStatement(p, depth + 1) }); });
      return b;
    }
    if (toks[0].value === '(' ) return explainStatement(toks.slice(1, -1), depth);
    if (first === 'SELECT') return explainSelect(toks, depth);
    var cl = clauses(toks);
    if (first === 'INSERT INTO') {
      var tgt = cl[0].toks, paren = tgt.findIndex(function (t) { return t.value === '('; });
      var table = inline(paren >= 0 ? tgt.slice(0, paren) : tgt), cols = paren >= 0 ? inline(tgt.slice(paren + 1, -1)) : '';
      b.push({ text: 'Adds rows to ' + table + (cols ? ' (columns: ' + cols + ')' : '') + '.' });
      var vals = cl.filter(function (c) { return c.kw === 'VALUES'; })[0];
      if (vals) { var rows = splitTop(vals.toks, ','); b.push({ text: rows.length + ' row' + (rows.length === 1 ? '' : 's') + ' of values given directly.' }); }
      var selAt = toks.findIndex(function (t, i) { return U(t) === 'SELECT'; });
      if (!vals && selAt > 0) b.push({ text: 'The new rows come from this query:', children: explainStatement(toks.slice(selAt), depth + 1) });
      if (cl.some(function (c) { return c.kw === 'ON CONFLICT'; })) b.push({ text: 'If a row already exists (ON CONFLICT), it is updated or skipped instead of failing.' });
      if (cl.some(function (c) { return c.kw === 'RETURNING'; })) b.push({ text: 'Returns the inserted rows (RETURNING).' });
      return b;
    }
    if (first === 'UPDATE' || first === 'DELETE FROM' || first === 'DELETE') {
      var tgtC = cl[0], where = cl.filter(function (c) { return c.kw === 'WHERE'; })[0];
      var target = first === 'DELETE' && cl[1] && cl[1].kw === 'FROM' ? inline(cl[1].toks) : inline(tgtC.toks);
      if (first === 'UPDATE') {
        var set = cl.filter(function (c) { return c.kw === 'SET'; })[0];
        b.push({ text: 'Changes rows in ' + target + '.' });
        if (set) b.push({ text: 'Sets ' + splitTop(set.toks, ',').map(function (p) { return short(inline(p), 50); }).join(', ') + '.' });
      } else b.push({ text: 'Deletes rows from ' + target + '.' });
      cl.forEach(function (c) { if (JOINS[c.kw] || (c.kw === 'FROM' && first === 'UPDATE')) b.push({ text: 'Uses ' + short(inline(c.toks), 80) + ' to decide which rows (' + c.kw + ').' }); });
      if (where) b.push({ text: 'Only rows where ' + splitAnd(where.toks).map(function (p) { return short(inline(p), 80); }).join('; ') + '.', children: subqueries(where.toks).map(function (s) { return { text: 'Subquery: ' + short(inline(s.toks), 70), children: explainStatement(s.toks, depth + 1) }; }) });
      else b.push({ text: '⚠ There is no WHERE clause, so this affects EVERY row in the table.' });
      return b;
    }
    if (first === 'MERGE INTO') return [{ text: 'Merges (upserts) rows into ' + inline(cl[0].toks.slice(0, 2)) + ': updates rows that match and inserts the rest.' }];
    return [{ text: 'A ' + first + ' statement (only SELECT, INSERT, UPDATE, DELETE and WITH are explained in detail).' }];
  }

  function explain(sql) {
    return splitStatements(sigTokens(sql, true)).map(function (st, k) {
      var f = U(st[0]), kind = f === 'WITH' ? 'WITH … ' + (U(st.filter(function (t, i) { return i > 0 && /^(SELECT|INSERT INTO|UPDATE|DELETE FROM|DELETE)$/.test(U(t)); }).pop()) || 'SELECT') : f.replace(' INTO', '').replace(' FROM', '');
      return { title: 'Statement ' + (k + 1) + ' — ' + kind, bullets: explainStatement(st, 0) };
    });
  }

  // ---------- linter ----------
  var DIALECTS = { generic: 'Generic SQL', postgres: 'PostgreSQL', mysql: 'MySQL', sqlserver: 'SQL Server', oracle: 'Oracle' };
  function limitSnippet(dialect, n) {
    n = n || 50;
    if (dialect === 'sqlserver') return 'SELECT TOP (' + n + ') … ORDER BY …   -- or: ORDER BY … OFFSET 0 ROWS FETCH NEXT ' + n + ' ROWS ONLY';
    if (dialect === 'oracle') return 'ORDER BY … FETCH FIRST ' + n + ' ROWS ONLY   -- Oracle 12c+; older: WHERE ROWNUM <= ' + n;
    return 'ORDER BY … LIMIT ' + n;
  }

  function lint(sql, dialect) {
    dialect = dialect || 'generic';
    var all = sigTokens(sql, true), issues = [];
    function add(id, severity, title, detail, fix) { if (!issues.some(function (x) { return x.id === id; })) issues.push({ id: id, severity: severity, title: title, detail: detail, fix: fix }); }
    var flatAll = all.map(function (t) { return t.type === 'string' ? "'S'" : U(t); }).join(' ');

    // dialect-specific syntax
    all.forEach(function (t, i) {
      var u = U(t);
      if (u === 'LIMIT' && (dialect === 'sqlserver' || dialect === 'oracle')) add('dialect-limit', 'danger', DIALECTS[dialect] + ' does not support LIMIT', 'This query will fail with a syntax error on ' + DIALECTS[dialect] + '.', limitSnippet(dialect, 50));
      if (u === 'TOP' && /^(postgres|mysql|oracle)$/.test(dialect)) add('dialect-top', 'danger', DIALECTS[dialect] + ' does not support TOP', 'TOP is SQL Server syntax.', limitSnippet(dialect, 50));
      if (u === 'FETCH' && dialect === 'mysql') add('dialect-fetch', 'danger', 'MySQL does not support FETCH FIRST', 'Use LIMIT instead.', 'ORDER BY … LIMIT 50');
      if (u === 'ILIKE' && dialect !== 'postgres' && dialect !== 'generic') add('dialect-ilike', 'danger', 'ILIKE only exists in PostgreSQL', 'Use a case-insensitive collation or LOWER(col) LIKE LOWER(…).', "WHERE LOWER(name) LIKE 'smith%'");
      if (t.type === 'qident' && t.value.charAt(0) === '`' && dialect !== 'mysql' && dialect !== 'generic') add('dialect-backtick', 'warn', 'Backtick quotes are MySQL-only', 'Use double quotes for identifiers' + (dialect === 'sqlserver' ? ' or [square brackets]' : '') + '.', 'SELECT "order" FROM t');
      if (t.type === 'qident' && t.value.charAt(0) === '[' && dialect !== 'sqlserver' && dialect !== 'generic') add('dialect-brackets', 'warn', '[Square bracket] quotes are SQL Server-only', 'Use double quotes' + (dialect === 'mysql' ? ' (with ANSI_QUOTES) or backticks' : '') + '.', 'SELECT "order" FROM t');
    });

    if (/(?:^|[^<>!])(=|<>|!=)\s*NULL\b/.test(flatAll) || /\bNULL\s*(=|<>|!=)/.test(flatAll)) add('eq-null', 'danger', '“= NULL” is never true', 'Comparing with NULL using = or <> always gives “unknown”, so no rows match.', 'WHERE deleted_at IS NULL   -- or IS NOT NULL');

    splitStatements(all).forEach(function (st) {
      var first = U(st[0]), cl = clauses(st), kws = cl.map(function (c) { return c.kw; });
      var flat = st.map(function (t) { return t.type === 'string' ? "'S'" : U(t); }).join(' ');
      var where = cl.filter(function (c) { return c.kw === 'WHERE'; })[0];

      if ((first === 'UPDATE' || first === 'DELETE FROM' || first === 'DELETE') && !where) {
        add(first === 'UPDATE' ? 'update-no-where' : 'delete-no-where', 'danger', (first === 'UPDATE' ? 'UPDATE' : 'DELETE') + ' without WHERE changes every row',
          'There is no WHERE clause, so every row in the table is ' + (first === 'UPDATE' ? 'changed' : 'deleted') + '. Run it inside a transaction and check the row count first.',
          first === 'UPDATE' ? "BEGIN;\nUPDATE customers SET status = 'inactive' WHERE last_order_at < '2025-01-01';\n-- check the row count, then COMMIT; (or ROLLBACK;)" : "BEGIN;\nDELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP;\n-- check the row count, then COMMIT;");
      }
      if (where && /^(UPDATE|DELETE FROM|DELETE)$/.test(first) && /^\s*(1\s*=\s*1|TRUE)\s*$/.test(inline(where.toks))) add('where-always-true', 'danger', 'WHERE 1=1 on ' + first.split(' ')[0] + ' still affects every row', 'The condition is always true.', 'Add a real condition, e.g. WHERE id = 42');

      // walk every SELECT, including subqueries
      var selects = [st].concat(subqueries(st).map(function (s) { return s.toks; }));
      selects.forEach(function (q, qi) {
        var qcl = clauses(q), sel = qcl.filter(function (c) { return c.kw === 'SELECT'; })[0];
        if (!sel) return;
        var items = sel.toks.filter(function (t) { return !/^(DISTINCT|ALL)$/.test(U(t)); });
        var selFlat = items.map(function (t) { return t.value; }).join(' ');
        var isExistsSub = qi > 0 && /EXISTS \(\s*SELECT \*/.test(flat);
        if (!isExistsSub && (/^\*(\s|$)/.test(selFlat) || /(^|,)\s*\*\s*(,|$)/.test(selFlat) || /\w \. \*/.test(selFlat))) {
          add('select-star', 'warn', 'SELECT * fetches every column', 'It reads and sends columns you may not need, stops covering indexes from helping, and breaks code when columns are added or reordered.', 'SELECT id, name, email FROM customers');
        }
        var joins = qcl.filter(function (c) { return JOINS[c.kw]; });
        if (sel.toks.length && U(sel.toks[0]) === 'DISTINCT' && joins.length) add('distinct-join', 'warn', 'DISTINCT with a JOIN can hide duplicate rows', 'If the join multiplies rows (one customer, many orders), DISTINCT throws the extra rows away after doing all the work. Fix the join or use EXISTS instead.', 'SELECT c.id, c.name FROM customers c\nWHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)');
        joins.forEach(function (j) {
          if (/^(CROSS JOIN|NATURAL JOIN|CROSS APPLY|OUTER APPLY)$/.test(j.kw)) return;
          var d = 0, has = j.toks.some(function (t) { if (t.value === '(') d++; else if (t.value === ')') d--; return d === 0 && (U(t) === 'ON' || U(t) === 'USING'); });
          if (!has && dialect !== 'mysql') add('join-no-on', 'danger', 'JOIN without ON', 'A JOIN with no ON condition is either a syntax error or (in MySQL) a cross join of every row with every row.', 'JOIN orders o ON o.customer_id = c.id');
          else if (!has) add('join-no-on', 'danger', 'JOIN without ON makes a cross join in MySQL', 'Every row is paired with every row.', 'JOIN orders o ON o.customer_id = c.id');
        });
        var from = qcl.filter(function (c) { return c.kw === 'FROM'; })[0];
        if (from && splitTop(from.toks, ',').length > 1) {
          var qwhere = qcl.filter(function (c) { return c.kw === 'WHERE'; })[0];
          var linked = qwhere && /[\w"\]`]\s*\.\s*[\w"\[`]+\s*=\s*[\w"\[`]+\s*\.\s*[\w"\[`]/.test(inline(qwhere.toks));
          if (!linked) add('implicit-cross-join', 'danger', 'Comma join with nothing linking the tables', 'FROM a, b without a matching condition pairs every row of a with every row of b — the result can explode in size.', 'FROM orders o\nJOIN customers c ON c.id = o.customer_id');
          else add('comma-join', 'info', 'Old-style comma join', 'It works, but an explicit JOIN … ON keeps the join condition next to the table and is harder to get wrong.', 'FROM orders o\nJOIN customers c ON c.id = o.customer_id');
        }
        if (qi === 0) {
          var hasOrder = kws.indexOf('ORDER BY') >= 0, hasLimit = kws.indexOf('LIMIT') >= 0 || kws.indexOf('FETCH') >= 0 || /^TOP$/.test(U(sel.toks[0])) || /^(DISTINCT|ALL)$/.test(U(sel.toks[0])) && U(sel.toks[1]) === 'TOP';
          if (hasOrder && !hasLimit && first !== 'INSERT INTO') add('order-no-limit', 'info', 'ORDER BY without a row limit', 'Sorting every matching row can be slow on big tables. If you only show the first page or top results, limit the rows.', limitSnippet(dialect, 50));
        }
      });

      if (where) {
        var w = where.toks, wflat = inline(w);
        // leading wildcard LIKE
        w.forEach(function (t, i) { if (/^(LIKE|ILIKE|NOT LIKE)$/.test(U(t)) && w[i + 1] && w[i + 1].type === 'string' && /^[NnEe]?'%/.test(w[i + 1].value)) add('leading-wildcard', 'warn', 'LIKE starting with % can’t use an index', 'A pattern like \'%smith\' makes the database check every row.', "WHERE name LIKE 'smith%'   -- or use full-text search (PostgreSQL: pg_trgm / tsvector; MySQL: FULLTEXT; SQL Server: CONTAINS)"); });
        // non-sargable date casts
        if (/\b(?:CAST\s*\(\s*[\w."`\[\]]+\s+AS\s+DATE\s*\)|DATE\s*\(\s*[\w."`\[\]]+\s*\)|(?:YEAR|MONTH|DAY)\s*\(\s*[\w."`\[\]]+\s*\)|TO_CHAR\s*\(\s*[\w."`\[\]]+\s*,[^)]*\)|TRUNC\s*\(\s*[\w."`\[\]]+\s*\)|CONVERT\s*\(\s*(?:DATE|VARCHAR|NVARCHAR|CHAR)[^,]*,\s*[\w."`\[\]]+[^)]*\)|DATE_TRUNC\s*\(\s*'[^']*'\s*,\s*[\w."`\[\]]+\s*\)|EXTRACT\s*\(\s*\w+\s+FROM\s+[\w."`\[\]]+\s*\)|DATE_FORMAT\s*\(\s*[\w."`\[\]]+\s*,[^)]*\))\s*(=|<|>|<=|>=|<>|!=|BETWEEN|IN)/i.test(wflat)) {
          add('non-sargable-date', 'warn', 'Date function on a column in WHERE', 'Wrapping a date column (CAST(created_at AS DATE), YEAR(created_at), DATE_TRUNC…) means an index on that column can’t be used. Compare the raw column with a range instead.', "WHERE created_at >= '2026-01-01' AND created_at < '2027-01-01'");
        }
        if (/\b(UPPER|LOWER|TRIM|LTRIM|RTRIM|SUBSTR|SUBSTRING|COALESCE|ISNULL|IFNULL|NVL|LEFT|RIGHT|LEN|LENGTH|ABS|ROUND|REPLACE|CONCAT)\s*\(\s*[A-Za-z_"`\[][\w."`\[\]]*\s*(?:,[^()]*)?\)\s*(=|<|>|<=|>=|<>|!=|LIKE|IN)/i.test(wflat)) {
          add('function-on-column', 'warn', 'Function on a column in WHERE', 'Something like LOWER(email) = … stops a normal index on email being used, so every row is checked.', dialect === 'postgres' ? "CREATE INDEX ON customers (LOWER(email));   -- expression index\n-- or store emails already lower-cased and compare directly" : dialect === 'sqlserver' ? '-- add a computed column with an index, or rely on a case-insensitive collation:\nWHERE email = @email' : "WHERE email = 'jane@example.com'   -- store values already normalised, or add a functional/generated-column index");
        }
        // OR across columns
        var ors = splitTop(w, 'OR');
        if (ors.length > 1) {
          var lefts = ors.map(function (p) { for (var k = 0; k < p.length; k++) { if ((p[k].type === 'word' || p[k].type === 'qident') && !p[k].call) { var id = [p[k].value]; while (p[k + 1] && p[k + 1].value === '.' && p[k + 2]) { id.push('.', p[k + 2].value); k += 2; } return id.join('').toLowerCase(); } } return ''; });
          var distinct = lefts.filter(function (x, i, a) { return x && a.indexOf(x) === i; });
          if (distinct.length > 1) add('or-columns', 'warn', 'OR across different columns', 'Conditions like a = 1 OR b = 2 often stop the database using either index, so it scans the table.', 'SELECT … WHERE a = 1\nUNION ALL\nSELECT … WHERE b = 2 AND a <> 1');
          else if (distinct.length === 1 && ors.every(function (p) { return p.some(function (t) { return t.value === '='; }); })) add('or-same-column', 'info', 'Several ORs on the same column', 'col = 1 OR col = 2 OR col = 3 is easier to read as IN.', 'WHERE status IN (\'new\', \'open\', \'pending\')');
        }
      }
      if (/\bNOT IN \(\s*SELECT\b/.test(flat)) add('not-in-null', 'warn', 'NOT IN (subquery) breaks if the subquery returns a NULL', 'If any value from the subquery is NULL, NOT IN returns no rows at all. NOT EXISTS behaves as expected and is often faster.', 'WHERE NOT EXISTS (\n  SELECT 1 FROM orders o WHERE o.customer_id = c.id\n)');
      if (/\bCOUNT \( (\*|1) \)( FROM [^)]*)? \)? (>|>=|<>|!=) 0\b|\bCOUNT \( (\*|1) \)( FROM [^)]*)? \)? >= 1\b/.test(flat.replace(/\s+/g, ' '))) add('count-vs-exists', 'warn', 'COUNT(*) > 0 just to check existence', 'Counting reads every matching row; EXISTS stops at the first one.', 'WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)');
      // pagination
      var off = null, ci = kws.indexOf('OFFSET');
      if (ci >= 0) { var on = cl[ci].toks.filter(function (t) { return t.type === 'number'; })[0]; off = on ? +on.value : -1; }
      var li = kws.indexOf('LIMIT');
      if (li >= 0) { var lp = splitTop(cl[li].toks, ','); if (lp.length === 2 && lp[0][0].type === 'number') off = +lp[0][0].value; }
      if (off != null) {
        var keyset = dialect === 'sqlserver' ? 'SELECT TOP (50) … WHERE id > @last_seen_id ORDER BY id' : dialect === 'oracle' ? 'WHERE id > :last_seen_id ORDER BY id FETCH FIRST 50 ROWS ONLY' : 'WHERE id > :last_seen_id ORDER BY id LIMIT 50';
        add('offset-pagination', off >= 1000 ? 'warn' : 'info', 'OFFSET pagination gets slower on later pages', 'The database still reads and throws away every skipped row' + (off > 0 ? ' (' + off + ' here)' : '') + '. “Keyset” paging remembers the last row seen instead.', keyset);
      }
      if (/\bUNION (?!ALL)/.test(flat + ' ') && !/\bUNION ALL\b/.test(flat) || / UNION (SELECT|\()/.test(flat)) add('union-distinct', 'info', 'UNION removes duplicates (extra sort)', 'If the parts can’t overlap, or duplicates are fine, UNION ALL skips the de-duplication step and is faster.', 'SELECT … FROM a\nUNION ALL\nSELECT … FROM b');
    });
    var rank = { danger: 0, warn: 1, info: 2 };
    issues.sort(function (a, b) { return rank[a.severity] - rank[b.severity]; });
    return issues;
  }

  var L = { tokenize: tokenize, sigTokens: sigTokens, format: format, inline: inline, explain: explain, lint: lint, limitSnippet: limitSnippet, DIALECTS: DIALECTS, splitStatements: splitStatements, clauses: clauses };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.SqlLib = L;
})(this);
