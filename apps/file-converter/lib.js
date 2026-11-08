/* File Converter — pure logic (no DOM). A "table" is {headers:[...], rows:[{header: value}]}.
   Readers: csv, tsv, json, markdown, html. Writers: csv, tsv, json, markdown, html, sql. Plus JSON flatten/unflatten
   and HTML -> Markdown (for Word files converted by mammoth). */
(function (root) {
  'use strict';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function decode(s) {
    return String(s).replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); }).replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); }).replace(/&amp;/g, '&');
  }

  // ---------- CSV / TSV ----------
  function parseDelimited(text, delim) {
    text = String(text || '').replace(/^﻿/, '');
    if (!delim) { var first = text.split(/\r?\n/, 1)[0] || '', best = ',', n = -1; [',', ';', '\t', '|'].forEach(function (d) { var c = first.split(d).length; if (c > n) { n = c; best = d; } }); delim = best; }
    var rows = [], row = [], f = '', q = false, c;
    for (var i = 0; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"' && f === '') q = true;
      else if (c === delim) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return !(r.length === 1 && r[0] === ''); });
  }
  function fromRows(rows) {
    if (!rows.length) return { headers: [], rows: [] };
    var seen = {}, headers = rows[0].map(function (h, i) {
      h = String(h == null ? '' : h).trim() || 'Column ' + (i + 1); var base = h, k = 2;
      while (seen[h]) h = base + ' (' + (k++) + ')'; seen[h] = 1; return h;
    });
    var width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    for (var i = headers.length; i < width; i++) headers.push('Column ' + (i + 1));
    return { headers: headers, rows: rows.slice(1).map(function (r) { var o = {}; headers.forEach(function (h, i) { o[h] = r[i] == null ? '' : r[i]; }); return o; }) };
  }
  function fromCsv(text, delim) { return fromRows(parseDelimited(text, delim)); }
  function cellText(v) { if (v == null) return ''; if (typeof v === 'object') return JSON.stringify(v); return String(v); }
  function toDelimited(t, delim) {
    delim = delim || ',';
    var cell = function (v) { v = cellText(v); return (v.indexOf(delim) > -1 || /["\n\r]/.test(v)) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [t.headers.map(cell).join(delim)].concat(t.rows.map(function (r) { return t.headers.map(function (h) { return cell(r[h]); }).join(delim); })).join('\n');
  }
  function toCsv(t) { return toDelimited(t, ','); }
  function toTsv(t) { return toDelimited(t, '\t'); }

  // ---------- JSON ----------
  function isPlain(o) { return o && typeof o === 'object' && !Array.isArray(o); }
  function flatten(obj, prefix, out) {
    out = out || {}; prefix = prefix || '';
    if (Array.isArray(obj) || isPlain(obj)) {
      var keys = Object.keys(obj);
      if (!keys.length && prefix) { out[prefix] = Array.isArray(obj) ? [] : {}; return out; }
      keys.forEach(function (k) { flatten(obj[k], prefix ? prefix + '.' + k : k, out); });
    } else out[prefix] = obj;
    return out;
  }
  function unflatten(flat) {
    var res = {};
    Object.keys(flat).forEach(function (path) {
      var parts = path.split('.'), cur = res;
      parts.forEach(function (p, i) {
        if (i === parts.length - 1) { cur[p] = flat[path]; return; }
        if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = /^\d+$/.test(parts[i + 1]) ? [] : {};
        cur = cur[p];
      });
    });
    return res;
  }
  // Pick the array of records out of any JSON value.
  function records(data) {
    if (Array.isArray(data)) return data;
    if (isPlain(data)) {
      var arr = Object.keys(data).filter(function (k) { return Array.isArray(data[k]) && data[k].some(isPlain); });
      if (arr.length === 1) return data[arr[0]];
      return [data];
    }
    return [{ value: data }];
  }
  function fromJson(text, opts) {
    opts = opts || {}; var data = typeof text === 'string' ? JSON.parse(text) : text;
    var recs = records(data).map(function (r) { return isPlain(r) ? (opts.flatten === false ? r : flatten(r)) : { value: r }; });
    var headers = [];
    recs.forEach(function (r) { Object.keys(r).forEach(function (k) { if (headers.indexOf(k) < 0) headers.push(k); }); });
    return { headers: headers, rows: recs };
  }
  function guessType(v) {
    if (typeof v !== 'string') return v;
    var s = v.trim();
    if (s === '') return '';
    if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(s) && s.length < 16) return Number(s);
    if (s === 'true' || s === 'false') return s === 'true';
    if (s === 'null') return null;
    return v;
  }
  function toJson(t, opts) {
    opts = opts || {};
    var arr = t.rows.map(function (r) {
      var o = {}; t.headers.forEach(function (h) { var v = r[h]; o[h] = opts.types === false ? (v == null ? '' : v) : guessType(v); });
      if (opts.unflatten) o = unflatten(o);
      return o;
    });
    return JSON.stringify(arr, null, opts.indent == null ? 2 : opts.indent);
  }

  // ---------- Markdown ----------
  function splitMdRow(line) {
    var s = line.trim().replace(/^\|/, '').replace(/\|$/, ''), cells = [], cur = '';
    for (var i = 0; i < s.length; i++) {
      if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; }
      else if (s[i] === '|') { cells.push(cur.trim()); cur = ''; }
      else cur += s[i];
    }
    cells.push(cur.trim()); return cells;
  }
  function fromMarkdown(text) {
    var lines = String(text || '').split(/\r?\n/).filter(function (l) { return /\|/.test(l); });
    var rows = lines.filter(function (l) { return !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l); }).map(splitMdRow);
    return fromRows(rows);
  }
  function toMarkdown(t) {
    var cell = function (v) { return cellText(v).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>'); };
    var head = '| ' + t.headers.map(cell).join(' | ') + ' |', sep = '| ' + t.headers.map(function () { return '---'; }).join(' | ') + ' |';
    return [head, sep].concat(t.rows.map(function (r) { return '| ' + t.headers.map(function (h) { return cell(r[h]); }).join(' | ') + ' |'; })).join('\n');
  }

  // ---------- HTML ----------
  function stripTags(s) { return decode(String(s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim(); }
  // Reads the first <table> (or table index n) without a DOM.
  function fromHtml(html, n) {
    var tables = String(html || '').match(/<table[\s\S]*?<\/table>/gi) || [];
    var tb = tables[n || 0]; if (!tb) return { headers: [], rows: [] };
    var rows = (tb.match(/<tr[\s\S]*?<\/tr>/gi) || []).map(function (tr) {
      return (tr.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) || []).map(function (td) { return stripTags(td.replace(/^<t[hd][^>]*>|<\/t[hd]>$/gi, '')); });
    }).filter(function (r) { return r.length; });
    return fromRows(rows);
  }
  function countHtmlTables(html) { return (String(html || '').match(/<table[\s\S]*?<\/table>/gi) || []).length; }
  function toHtml(t, opts) {
    opts = opts || {};
    var body = '<table>\n<thead><tr>' + t.headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead>\n<tbody>\n' +
      t.rows.map(function (r) { return '<tr>' + t.headers.map(function (h) { return '<td>' + esc(cellText(r[h])) + '</td>'; }).join('') + '</tr>'; }).join('\n') + '\n</tbody>\n</table>';
    if (!opts.page) return body;
    return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>' + esc(opts.title || 'Table') + '</title>\n<style>body{font:14px system-ui,sans-serif;margin:24px}table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}th{background:#f2f2f2}</style></head>\n<body>\n' + body + '\n</body></html>';
  }

  // ---------- SQL ----------
  function sqlIdent(name) { return '"' + String(name).replace(/"/g, '""') + '"'; }
  function sqlValue(v, opts) {
    if (v == null) return 'NULL';
    if (typeof v === 'number' && isFinite(v)) return String(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    var s = cellText(v);
    if (s === '' && opts.emptyAsNull) return 'NULL';
    if (opts.numbers !== false && /^-?(0|[1-9]\d*)(\.\d+)?$/.test(s.trim()) && s.trim().length < 16) return s.trim();
    return "'" + s.replace(/'/g, "''") + "'";
  }
  function toSql(t, opts) {
    opts = opts || {}; var table = sqlIdent(opts.table || 'my_table'), cols = t.headers.map(sqlIdent).join(', '), out = [];
    if (opts.create) out.push('CREATE TABLE ' + table + ' (\n  ' + t.headers.map(function (h) {
      var nums = t.rows.every(function (r) { var v = cellText(r[h]).trim(); return v === '' || /^-?\d+(\.\d+)?$/.test(v); }) && t.rows.length;
      return sqlIdent(h) + (nums ? ' NUMERIC' : ' TEXT');
    }).join(',\n  ') + '\n);');
    var size = opts.batch || 0;
    if (size > 1) {
      for (var i = 0; i < t.rows.length; i += size) {
        out.push('INSERT INTO ' + table + ' (' + cols + ') VALUES\n' + t.rows.slice(i, i + size).map(function (r) {
          return '  (' + t.headers.map(function (h) { return sqlValue(r[h], opts); }).join(', ') + ')';
        }).join(',\n') + ';');
      }
    } else t.rows.forEach(function (r) { out.push('INSERT INTO ' + table + ' (' + cols + ') VALUES (' + t.headers.map(function (h) { return sqlValue(r[h], opts); }).join(', ') + ');'); });
    return out.join('\n');
  }

  // ---------- HTML -> Markdown (headings, paragraphs, lists, links, bold/italic, tables) ----------
  function htmlToMarkdown(html) {
    var s = String(html || '').replace(/\r?\n/g, ' ');
    s = s.replace(/<table[\s\S]*?<\/table>/gi, function (tb) { var t = fromHtml(tb); return t.headers.length ? '\n\n' + toMarkdown(t) + '\n\n' : ''; });
    s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, function (_, n, x) { return '\n\n' + '######'.slice(0, +n) + ' ' + inline(x) + '\n\n'; });
    s = s.replace(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi, function (_, kind, inner) {
      var i = 0; return '\n\n' + (inner.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || []).map(function (li) { i++; return (kind.toLowerCase() === 'ol' ? i + '. ' : '- ') + inline(li.replace(/^<li[^>]*>|<\/li>$/gi, '')); }).join('\n') + '\n\n';
    });
    s = s.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, function (_, x) { return '\n\n' + inline(x) + '\n\n'; });
    s = inline(s);
    return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    function inline(x) {
      return decode(x.replace(/<br\s*\/?>/gi, '  \n')
        .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**').replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '_$2_')
        .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
        .replace(/<(?!\/?(?:br)\b)[^>]+>/g, '')).replace(/[ \t]{2,}(?!\n)/g, ' ');
    }
  }

  // ---------- format detection ----------
  var EXT = { csv: 'csv', tsv: 'tsv', tab: 'tsv', json: 'json', md: 'markdown', markdown: 'markdown', html: 'html', htm: 'html', xlsx: 'xlsx', xlsm: 'xlsx', xls: 'xlsx', ods: 'xlsx', pdf: 'pdf', docx: 'docx', txt: 'text', sql: 'text' };
  function formatFromName(name) { var m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? EXT[m[1].toLowerCase()] || null : null; }
  function detectFormat(text) {
    var s = String(text || '').trim();
    if (!s) return null;
    if (/^[\[{]/.test(s)) { try { JSON.parse(s); return 'json'; } catch (e) { /* not json */ } }
    if (/<table[\s>]/i.test(s)) return 'html';
    var lines = s.split(/\r?\n/);
    if (lines.length > 1 && /\|/.test(lines[0]) && /^\s*\|?\s*:?-{2,}/.test(lines[1])) return 'markdown';
    if (lines[0].split('\t').length > 1) return 'tsv';
    return 'csv';
  }
  function parse(text, format, opts) {
    if (format === 'json') return fromJson(text, opts);
    if (format === 'markdown') return fromMarkdown(text);
    if (format === 'html') return fromHtml(text, opts && opts.tableIndex);
    if (format === 'tsv') return fromCsv(text, '\t');
    return fromCsv(text, opts && opts.delimiter);
  }
  function write(t, format, opts) {
    opts = opts || {};
    if (format === 'csv') return toCsv(t);
    if (format === 'tsv') return toTsv(t);
    if (format === 'json') return toJson(t, opts);
    if (format === 'markdown') return toMarkdown(t);
    if (format === 'html') return toHtml(t, { page: opts.page, title: opts.title });
    if (format === 'sql') return toSql(t, opts);
    throw new Error('Unknown format ' + format);
  }

  var L = { parseDelimited: parseDelimited, fromRows: fromRows, fromCsv: fromCsv, toCsv: toCsv, toTsv: toTsv, flatten: flatten, unflatten: unflatten,
    fromJson: fromJson, toJson: toJson, fromMarkdown: fromMarkdown, toMarkdown: toMarkdown, fromHtml: fromHtml, countHtmlTables: countHtmlTables, toHtml: toHtml,
    toSql: toSql, sqlValue: sqlValue, htmlToMarkdown: htmlToMarkdown, detectFormat: detectFormat, formatFromName: formatFromName, parse: parse, write: write, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.ConverterLib = L;
})(this);
