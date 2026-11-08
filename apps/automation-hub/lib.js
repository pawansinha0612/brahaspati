/* Automation Hub — pure logic (no DOM): rename rules, organise plans, duplicate grouping,
   CSV recipes, and bash / PowerShell / GitHub Actions script generation. */
(function (root) {
  'use strict';

  // ---------- names ----------
  function splitName(name) {
    var i = name.lastIndexOf('.');
    if (i <= 0 || i === name.length - 1) return { base: name, ext: '' };
    return { base: name.slice(0, i), ext: name.slice(i + 1) };
  }
  function pad(n, w) { var s = String(Math.abs(n)); while (s.length < w) s = '0' + s; return (n < 0 ? '-' : '') + s; }
  function formatDate(ts, fmt, utc) {
    var d = new Date(ts); if (isNaN(d)) return '';
    var g = utc ? { Y: d.getUTCFullYear(), M: d.getUTCMonth() + 1, D: d.getUTCDate(), h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds() }
      : { Y: d.getFullYear(), M: d.getMonth() + 1, D: d.getDate(), h: d.getHours(), m: d.getMinutes(), s: d.getSeconds() };
    return String(fmt || 'YYYY-MM-DD').replace(/YYYY|MM|DD|HH|mm|ss/g, function (t) {
      return t === 'YYYY' ? String(g.Y) : t === 'MM' ? pad(g.M, 2) : t === 'DD' ? pad(g.D, 2) : t === 'HH' ? pad(g.h, 2) : t === 'mm' ? pad(g.m, 2) : pad(g.s, 2);
    });
  }
  function wordsOf(s) { return String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[\s_\-.]+/).filter(Boolean); }
  function changeCase(s, mode) {
    switch (mode) {
      case 'lower': return s.toLowerCase();
      case 'upper': return s.toUpperCase();
      case 'title': return s.toLowerCase().replace(/(^|[\s_\-(\[])([a-z\u00e0-\u00ff])/g, function (m, a, b) { return a + b.toUpperCase(); });
      case 'sentence': return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      case 'kebab': return wordsOf(s).join('-').toLowerCase();
      case 'snake': return wordsOf(s).join('_').toLowerCase();
      default: return s;
    }
  }
  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* rules: {find, replace, regex, caseSensitive, caseMode, prefix, suffix,
             seq:{on, start, step, pad, where:'prefix'|'suffix'|'replace', sep},
             date:{on, where:'prefix'|'suffix', format, sep}, ext, extLower, collapseSpaces}
     files: [{name, lastModified}] in the order sequence numbers should follow. */
  function newName(file, rules, i) {
    rules = rules || {};
    var p = splitName(file.name), base = p.base, ext = p.ext;
    if (rules.find) {
      var re = rules.regex ? new RegExp(rules.find, rules.caseSensitive ? 'g' : 'gi') : new RegExp(escRe(rules.find), rules.caseSensitive ? 'g' : 'gi');
      base = base.replace(re, rules.replace || '');
    }
    if (rules.collapseSpaces) base = base.replace(/\s+/g, ' ').trim();
    base = changeCase(base, rules.caseMode);
    var seq = rules.seq || {};
    if (seq.on) {
      var n = pad((seq.start == null ? 1 : +seq.start) + i * (seq.step == null ? 1 : +seq.step), seq.pad == null ? 2 : +seq.pad), sep = seq.sep == null ? '-' : seq.sep;
      base = seq.where === 'replace' ? n : seq.where === 'suffix' ? base + sep + n : n + sep + base;
    }
    var dt = rules.date || {};
    if (dt.on) {
      var ds = formatDate(file.lastModified, dt.format || 'YYYY-MM-DD', dt.utc), dsep = dt.sep == null ? '_' : dt.sep;
      base = dt.where === 'suffix' ? base + dsep + ds : ds + dsep + base;
    }
    base = (rules.prefix || '') + base + (rules.suffix || '');
    if (rules.ext != null && String(rules.ext).trim() !== '') ext = String(rules.ext).trim().replace(/^\./, '');
    if (rules.extLower) ext = ext.toLowerCase();
    return ext ? base + '.' + ext : base;
  }

  var BAD_CHARS = /[\/\\:*?"<>|\x00-\x1f]/;
  var RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
  function nameProblem(n) {
    if (!n || !n.trim()) return 'Empty name';
    if (BAD_CHARS.test(n)) return 'Has a character files can’t use (/ \\ : * ? " < > |)';
    if (RESERVED.test(n)) return 'Reserved name on Windows';
    if (/[. ]$/.test(n)) return 'Ends with a dot or space';
    if (n.length > 255) return 'Longer than 255 characters';
    return null;
  }
  // -> [{from, to, status:'same'|'ok'|'conflict'|'exists'|'invalid', note}] ; names compared case-insensitively
  function renamePlan(files, rules) {
    var plan = files.map(function (f, i) {
      var to; try { to = newName(f, rules, i); } catch (e) { return { from: f.name, to: f.name, status: 'invalid', note: 'Bad pattern: ' + e.message }; }
      return { from: f.name, to: to, status: to === f.name ? 'same' : 'ok', note: '' };
    });
    var moving = {}, targets = {};
    plan.forEach(function (p) { if (p.status !== 'same') moving[p.from.toLowerCase()] = 1; var k = p.to.toLowerCase(); targets[k] = (targets[k] || 0) + 1; });
    plan.forEach(function (p) {
      if (p.status === 'same' || p.status === 'invalid') return;
      var bad = nameProblem(p.to);
      if (bad) { p.status = 'invalid'; p.note = bad; return; }
      var k = p.to.toLowerCase();
      // target is an existing file that is not itself being renamed away (case-only change of itself is fine)
      if (k !== p.from.toLowerCase() && files.some(function (f) { return f.name.toLowerCase() === k; }) && !moving[k]) { p.status = 'exists'; p.note = 'A file with this name already exists'; return; }
      if (targets[k] > 1) { p.status = 'conflict'; p.note = 'Two files would get this name'; }
    });
    return plan;
  }
  function planSummary(plan) {
    var s = { total: plan.length, changes: 0, same: 0, problems: 0 };
    plan.forEach(function (p) { if (p.status === 'ok') s.changes++; else if (p.status === 'same') s.same++; else s.problems++; });
    return s;
  }
  // Turn {from,to} moves into a safe order: anything whose target is another move's source
  // (swaps, chains, case-only renames) goes through a temporary name first.
  function moveSteps(moves) {
    var sources = {}; moves.forEach(function (m) { sources[m.from.toLowerCase()] = 1; });
    var direct = [], viaTemp = [];
    moves.forEach(function (m, i) {
      if (m.from === m.to) return;
      if (sources[m.to.toLowerCase()]) viaTemp.push({ from: m.from, tmp: dirOf(m.from) + '.bh-tmp-' + i + '-' + baseOf(m.from), to: m.to });
      else direct.push({ from: m.from, to: m.to });
    });
    var steps = [];
    viaTemp.forEach(function (m) { steps.push({ from: m.from, to: m.tmp, temp: true }); });
    direct.forEach(function (m) { steps.push(m); });
    viaTemp.forEach(function (m) { steps.push({ from: m.tmp, to: m.to }); });
    return steps;
  }
  function dirOf(p) { var i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); }
  function baseOf(p) { var i = p.lastIndexOf('/'); return i < 0 ? p : p.slice(i + 1); }

  // ---------- organise ----------
  var CATEGORIES = {
    Images: 'jpg jpeg png gif webp heic heif bmp tif tiff svg raw cr2 nef arw dng ico avif',
    Documents: 'pdf doc docx odt rtf txt md pages xls xlsx xlsm ods csv tsv numbers ppt pptx odp key epub',
    Video: 'mp4 mov m4v avi mkv webm wmv flv 3gp mts',
    Audio: 'mp3 wav m4a aac flac ogg opus wma aiff',
    Archives: 'zip rar 7z tar gz tgz bz2 xz dmg iso',
    Code: 'js ts jsx tsx json html htm css scss py rb java c cpp h cs go rs php sh ps1 sql yml yaml xml swift kt ipynb'
  };
  var EXT_CAT = {}; Object.keys(CATEGORIES).forEach(function (c) { CATEGORIES[c].split(' ').forEach(function (e) { EXT_CAT[e] = c; }); });
  function categoryOf(name) { return EXT_CAT[splitName(name).ext.toLowerCase()] || 'Other'; }
  // files: [{name, path, lastModified}] (top-level: path === name). opts: {byType, byDate, dateFormat}
  function organisePlan(files, opts, existingPaths) {
    opts = opts || {}; var fmt = opts.dateFormat || 'YYYY-MM';
    var existing = {}; (existingPaths || []).forEach(function (p) { existing[p.toLowerCase()] = 1; });
    var plan = files.map(function (f) {
      var parts = [];
      if (opts.byType) parts.push(categoryOf(f.name));
      if (opts.byDate) parts.push(formatDate(f.lastModified, fmt, opts.utc));
      var folder = parts.join('/'), to = folder ? folder + '/' + f.name : f.path || f.name;
      return { from: f.path || f.name, to: to, folder: folder, status: to === (f.path || f.name) ? 'same' : 'ok', note: '' };
    });
    var seen = {};
    plan.forEach(function (p) { if (p.status !== 'ok') return; var k = p.to.toLowerCase(); if (existing[k]) { p.status = 'exists'; p.note = 'Already a file with this name in that folder'; } else if (seen[k]) { p.status = 'conflict'; p.note = 'Two files would land on the same name'; } seen[k] = 1; });
    return plan;
  }
  function folderCounts(plan) {
    var c = {}; plan.forEach(function (p) { if (p.status === 'ok') c[p.folder] = (c[p.folder] || 0) + 1; });
    return Object.keys(c).sort().map(function (k) { return { folder: k, count: c[k] }; });
  }

  // ---------- duplicates ----------
  // Step 1: only files sharing a size can be duplicates.
  function sizeGroups(files) {
    var by = {}; files.forEach(function (f) { if (f.size > 0) (by[f.size] = by[f.size] || []).push(f); });
    return Object.keys(by).map(function (k) { return by[k]; }).filter(function (g) { return g.length > 1; });
  }
  // Step 2: files with .hash -> groups of identical content, biggest waste first. Keeps the oldest, then shortest path.
  function duplicateGroups(files) {
    var by = {}; files.forEach(function (f) { if (f.hash) (by[f.hash + ':' + f.size] = by[f.hash + ':' + f.size] || []).push(f); });
    var groups = Object.keys(by).map(function (k) { return by[k]; }).filter(function (g) { return g.length > 1; }).map(function (g) {
      var sorted = g.slice().sort(function (a, b) { return (a.lastModified || 0) - (b.lastModified || 0) || a.path.length - b.path.length || (a.path < b.path ? -1 : 1); });
      return { hash: sorted[0].hash, size: sorted[0].size, files: sorted, keep: sorted[0].path, wasted: sorted[0].size * (sorted.length - 1) };
    });
    groups.sort(function (a, b) { return b.wasted - a.wasted; });
    return { groups: groups, wasted: groups.reduce(function (s, g) { return s + g.wasted; }, 0), extraFiles: groups.reduce(function (s, g) { return s + g.files.length - 1; }, 0) };
  }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function fmtBytes(n) { if (!n) return '0 B'; var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.min(4, Math.floor(Math.log(n) / Math.log(1024))); return (n / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i]; }

  // ---------- CSV recipes ----------
  // table: {headers:[], rows:[{h:v}]}. Steps never mutate the input.
  function cols(v) { return (Array.isArray(v) ? v : String(v || '').split(',')).map(function (s) { return String(s).trim(); }).filter(Boolean); }
  function num(v) { var s = String(v == null ? '' : v).replace(/[$,\s]/g, ''); return s === '' || isNaN(s) ? NaN : Number(s); }
  function needCol(t, c) { if (c !== '*' && t.headers.indexOf(c) < 0) throw new Error('No column called “' + c + '”'); }
  var STEPS = {
    trim: function (t) {
      var hs = t.headers.map(function (h) { return h.trim() || h; });
      var rows = t.rows.map(function (r) { var o = {}; t.headers.forEach(function (h, i) { o[hs[i]] = String(r[h] == null ? '' : r[h]).replace(/\s+/g, ' ').trim(); }); return o; })
        .filter(function (r) { return hs.some(function (h) { return r[h] !== ''; }); });
      return { headers: hs, rows: rows };
    },
    dedupe: function (t, s) {
      var c = cols(s.cols); c.forEach(function (x) { needCol(t, x); }); if (!c.length) c = t.headers;
      var seen = {}; return { headers: t.headers, rows: t.rows.filter(function (r) { var k = JSON.stringify(c.map(function (h) { return String(r[h] == null ? '' : r[h]).trim().toLowerCase(); })); if (seen[k]) return false; seen[k] = 1; return true; }) };
    },
    filter: function (t, s) {
      needCol(t, s.col); var v = String(s.value == null ? '' : s.value), lv = v.toLowerCase(), re = s.op === 'regex' ? new RegExp(v, 'i') : null;
      var keep = function (r) {
        var x = String(r[s.col] == null ? '' : r[s.col]), lx = x.toLowerCase();
        switch (s.op) {
          case 'equals': return lx.trim() === lv.trim();
          case 'not-equals': return lx.trim() !== lv.trim();
          case 'contains': return lx.indexOf(lv) > -1;
          case 'not-contains': return lx.indexOf(lv) < 0;
          case 'empty': return x.trim() === '';
          case 'not-empty': return x.trim() !== '';
          case 'gt': return num(x) > num(v);
          case 'lt': return num(x) < num(v);
          case 'regex': return re.test(x);
          default: throw new Error('Unknown filter “' + s.op + '”');
        }
      };
      return { headers: t.headers, rows: t.rows.filter(keep) };
    },
    rename: function (t, s) {
      needCol(t, s.from); var to = String(s.to || '').trim(); if (!to) throw new Error('New column name is empty');
      if (to !== s.from && t.headers.indexOf(to) > -1) throw new Error('There is already a column called “' + to + '”');
      return { headers: t.headers.map(function (h) { return h === s.from ? to : h; }), rows: t.rows.map(function (r) { var o = {}; t.headers.forEach(function (h) { o[h === s.from ? to : h] = r[h]; }); return o; }) };
    },
    remove: function (t, s) {
      var c = cols(s.cols); c.forEach(function (x) { needCol(t, x); });
      var hs = t.headers.filter(function (h) { return c.indexOf(h) < 0; });
      return { headers: hs, rows: t.rows.map(function (r) { var o = {}; hs.forEach(function (h) { o[h] = r[h]; }); return o; }) };
    },
    reorder: function (t, s) {
      var c = cols(s.cols); c.forEach(function (x) { needCol(t, x); });
      return { headers: c.concat(t.headers.filter(function (h) { return c.indexOf(h) < 0; })), rows: t.rows };
    },
    split: function (t, s) {
      needCol(t, s.col); var sep = s.sep == null || s.sep === '' ? ' ' : s.sep, into = cols(s.into);
      if (into.length < 2) throw new Error('Give at least two new column names');
      into.forEach(function (n) { if (t.headers.indexOf(n) > -1 && n !== s.col) throw new Error('There is already a column called “' + n + '”'); });
      var at = t.headers.indexOf(s.col), hs = t.headers.slice(0, at + 1).concat(into).concat(t.headers.slice(at + 1));
      if (!s.keep) hs = hs.filter(function (h) { return h !== s.col || into.indexOf(h) > -1; });
      return { headers: hs, rows: t.rows.map(function (r) {
        var parts = String(r[s.col] == null ? '' : r[s.col]).split(sep), o = {};
        // last column takes the rest, so "Mary Anne Smith" -> "Mary" + "Anne Smith"
        var vals = into.map(function (_, i) { return i < into.length - 1 ? (parts[i] || '').trim() : parts.slice(i).join(sep).trim(); });
        t.headers.forEach(function (h) { o[h] = r[h]; }); into.forEach(function (n, i) { o[n] = vals[i]; });
        if (!s.keep && into.indexOf(s.col) < 0) delete o[s.col];
        return o;
      }) };
    },
    merge: function (t, s) {
      var c = cols(s.cols); if (c.length < 2) throw new Error('Pick at least two columns to merge'); c.forEach(function (x) { needCol(t, x); });
      var into = String(s.into || c.join(' ')).trim(), sep = s.sep == null ? ' ' : s.sep;
      var at = t.headers.indexOf(c[0]), hs = t.headers.slice();
      if (hs.indexOf(into) < 0) hs.splice(at + 1, 0, into);
      if (!s.keep) hs = hs.filter(function (h) { return c.indexOf(h) < 0 || h === into; });
      return { headers: hs, rows: t.rows.map(function (r) {
        var o = {}; t.headers.forEach(function (h) { o[h] = r[h]; });
        o[into] = c.map(function (h) { return String(r[h] == null ? '' : r[h]).trim(); }).filter(Boolean).join(sep);
        if (!s.keep) c.forEach(function (h) { if (h !== into) delete o[h]; });
        return o;
      }) };
    },
    'case': function (t, s) {
      var c = s.col === '*' || !s.col ? t.headers : cols(s.col); c.forEach(function (x) { needCol(t, x); });
      return { headers: t.headers, rows: t.rows.map(function (r) { var o = Object.assign({}, r); c.forEach(function (h) { o[h] = changeCase(String(r[h] == null ? '' : r[h]), s.mode); }); return o; }) };
    },
    replace: function (t, s) {
      var c = s.col === '*' || !s.col ? t.headers : cols(s.col); c.forEach(function (x) { needCol(t, x); });
      if (!s.find) throw new Error('Nothing to find');
      var re = s.regex ? new RegExp(s.find, 'g') : new RegExp(escRe(s.find), 'g');
      return { headers: t.headers, rows: t.rows.map(function (r) { var o = Object.assign({}, r); c.forEach(function (h) { o[h] = String(r[h] == null ? '' : r[h]).replace(re, s.replace || ''); }); return o; }) };
    },
    sort: function (t, s) {
      needCol(t, s.col); var dir = s.dir === 'desc' ? -1 : 1;
      var numeric = s.numeric != null ? s.numeric : t.rows.every(function (r) { var v = r[s.col]; return String(v == null ? '' : v).trim() === '' || !isNaN(num(v)); });
      var rows = t.rows.map(function (r, i) { return { r: r, i: i }; });
      rows.sort(function (a, b) {
        var x = a.r[s.col], y = b.r[s.col], c;
        if (numeric) { var nx = num(x), ny = num(y); c = isNaN(nx) ? (isNaN(ny) ? 0 : 1) : isNaN(ny) ? -1 : (nx - ny) * dir; }
        else c = String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'en', { sensitivity: 'base', numeric: true }) * dir;
        return c || a.i - b.i;
      });
      return { headers: t.headers, rows: rows.map(function (x) { return x.r; }) };
    }
  };
  function applyStep(t, s) { var f = STEPS[s.type]; if (!f) throw new Error('Unknown step “' + s.type + '”'); return f(t, s); }
  // -> {table, errors:[{index, message}]} ; a failing step is skipped so the rest still run.
  function applyRecipe(table, steps) {
    var t = { headers: table.headers.slice(), rows: table.rows }, errors = [];
    (steps || []).forEach(function (s, i) {
      if (s.off) return;
      try { t = applyStep(t, s); } catch (e) { errors.push({ index: i, message: e.message }); }
    });
    return { table: t, errors: errors };
  }
  var OPS = { equals: 'is', 'not-equals': 'is not', contains: 'contains', 'not-contains': 'does not contain', empty: 'is empty', 'not-empty': 'is not empty', gt: 'is more than', lt: 'is less than', regex: 'matches pattern' };
  function describeStep(s) {
    switch (s.type) {
      case 'trim': return 'Trim spaces and drop empty rows';
      case 'dedupe': return 'Remove duplicate rows' + (cols(s.cols).length ? ' (by ' + cols(s.cols).join(', ') + ')' : '');
      case 'filter': return 'Keep rows where ' + s.col + ' ' + (OPS[s.op] || s.op) + (/empty/.test(s.op) ? '' : ' “' + s.value + '”');
      case 'rename': return 'Rename column ' + s.from + ' → ' + s.to;
      case 'remove': return 'Remove columns: ' + cols(s.cols).join(', ');
      case 'reorder': return 'Move to front: ' + cols(s.cols).join(', ');
      case 'split': return 'Split ' + s.col + ' on “' + (s.sep || ' ') + '” into ' + cols(s.into).join(', ');
      case 'merge': return 'Merge ' + cols(s.cols).join(' + ') + ' into ' + (s.into || cols(s.cols).join(' '));
      case 'case': return 'Change case of ' + (s.col && s.col !== '*' ? s.col : 'all columns') + ' to ' + s.mode;
      case 'replace': return 'Replace “' + s.find + '” with “' + (s.replace || '') + '” in ' + (s.col && s.col !== '*' ? s.col : 'all columns');
      case 'sort': return 'Sort by ' + s.col + (s.dir === 'desc' ? ' (high to low / Z–A)' : ' (low to high / A–Z)');
      default: return s.type;
    }
  }

  // ---------- script generation ----------
  function bashQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
  // PowerShell treats curly single quotes as quotes too, so double those as well.
  function psQuote(s) { return "'" + String(s).replace(/['\u2018\u2019\u201a\u201b]/g, '$&$&') + "'"; }
  function stamp(when) { return (when || new Date()).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'; }

  // A fixed list of moves (rename preview, organise preview). Safe ordering via moveSteps.
  function bashMoves(moves, opts) {
    opts = opts || {}; var steps = moveSteps(moves), dirs = {};
    moves.forEach(function (m) { var d = dirOf(m.to); if (d) dirs[d.slice(0, -1)] = 1; });
    var out = ['#!/usr/bin/env bash', '# ' + (opts.title || 'Move files') + ' — made by Brahaspati Automation Hub on ' + stamp(opts.when) + '.',
      '# Usage:  bash ' + (opts.file || 'script.sh') + ' "/path/to/folder"    (defaults to the current folder)',
      '# Preview first:  DRY_RUN=1 bash ' + (opts.file || 'script.sh') + ' "/path/to/folder"',
      '# Works on macOS and Linux (and Git Bash on Windows). Never overwrites an existing file.',
      'set -u', 'cd -- "${1:-.}" || { echo "Folder not found: ${1:-.}" >&2; exit 1; }',
      'mv_safe() {', '  if [ ! -e "$1" ]; then echo "Missing, skipped: $1" >&2; return; fi',
      '  if [ -e "$2" ]; then echo "Already exists, skipped: $2" >&2; return; fi',
      '  if [ "${DRY_RUN:-0}" = 1 ]; then echo "would move: $1 -> $2"; else mv -n -- "$1" "$2" && echo "moved: $1 -> $2"; fi', '}'];
    Object.keys(dirs).sort().forEach(function (d) { out.push('[ "${DRY_RUN:-0}" = 1 ] || mkdir -p -- ' + bashQuote(d)); });
    steps.forEach(function (s) { out.push('mv_safe ' + bashQuote(s.from) + ' ' + bashQuote(s.to)); });
    return out.join('\n') + '\n';
  }
  function psMoves(moves, opts) {
    opts = opts || {}; var steps = moveSteps(moves), dirs = {};
    moves.forEach(function (m) { var d = dirOf(m.to); if (d) dirs[d.slice(0, -1)] = 1; });
    var out = ['# ' + (opts.title || 'Move files') + ' — made by Brahaspati Automation Hub on ' + stamp(opts.when) + '.',
      '# Usage:  powershell -ExecutionPolicy Bypass -File ' + (opts.file || 'script.ps1') + ' -Dir "C:\\path\\to\\folder"',
      '# Preview first: add -DryRun. Never overwrites an existing file.',
      'param([string]$Dir = \'.\', [switch]$DryRun)', '$ErrorActionPreference = \'Stop\'',
      '$Root = (Resolve-Path -LiteralPath $Dir).ProviderPath',
      'function Move-Safe([string]$From, [string]$To) {',
      '  $src = Join-Path $Root $From; $dst = Join-Path $Root $To',
      '  if (-not (Test-Path -LiteralPath $src)) { Write-Warning "Missing, skipped: $From"; return }',
      '  if (Test-Path -LiteralPath $dst) { Write-Warning "Already exists, skipped: $To"; return }',
      '  if ($DryRun) { Write-Output "would move: $From -> $To"; return }',
      '  [System.IO.File]::Move($src, $dst); Write-Output "moved: $From -> $To"', '}'];
    Object.keys(dirs).sort().forEach(function (d) { out.push('if (-not $DryRun) { [void][System.IO.Directory]::CreateDirectory((Join-Path $Root ' + psQuote(d) + ')) }'); });
    steps.forEach(function (s) { out.push('Move-Safe ' + psQuote(s.from) + ' ' + psQuote(s.to)); });
    return out.join('\r\n') + '\r\n';
  }
  function bashDelete(paths, opts) {
    opts = opts || {};
    return ['#!/usr/bin/env bash', '# Delete duplicate files — made by Brahaspati Automation Hub on ' + stamp(opts.when) + '.',
      '# Usage: bash delete-duplicates.sh "/path/to/folder"   (DRY_RUN=1 to preview). Deleted files do NOT go to the Bin.',
      'set -u', 'cd -- "${1:-.}" || exit 1'].concat(paths.map(function (p) {
      return 'if [ "${DRY_RUN:-0}" = 1 ]; then echo "would delete: "' + bashQuote(p) + '; else rm -f -- ' + bashQuote(p) + ' && echo "deleted: "' + bashQuote(p) + '; fi';
    })).join('\n') + '\n';
  }
  function psDelete(paths, opts) {
    opts = opts || {};
    return ['# Delete duplicate files — made by Brahaspati Automation Hub on ' + stamp(opts.when) + '.',
      '# Usage: powershell -ExecutionPolicy Bypass -File delete-duplicates.ps1 -Dir "C:\\folder"  (-DryRun to preview)',
      'param([string]$Dir = \'.\', [switch]$DryRun)', '$Root = (Resolve-Path -LiteralPath $Dir).ProviderPath'].concat(paths.map(function (p) {
      return '$p = Join-Path $Root ' + psQuote(p) + '; if ($DryRun) { Write-Output "would delete: $p" } elseif (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p; Write-Output "deleted: $p" }';
    })).join('\r\n') + '\r\n';
  }
  // Rule-based organise script: works on whatever is in the folder each time it runs (good for schedules).
  function bashOrganise(opts) {
    opts = opts || {}; var fmt = (opts.dateFormat || 'YYYY-MM').replace('YYYY', '%Y').replace('MM', '%m').replace('DD', '%d');
    var out = ['#!/usr/bin/env bash', '# Organise a folder by ' + [opts.byType && 'file type', opts.byDate && 'date'].filter(Boolean).join(' and ') + ' — made by Brahaspati Automation Hub on ' + stamp(opts.when) + '.',
      '# Rule-based: sorts whatever files are in the folder each time it runs, so it is safe to schedule.',
      '# Usage: bash organise.sh "/path/to/folder"   (DRY_RUN=1 to preview). Never overwrites; skips hidden files.',
      'set -u', 'cd -- "${1:-.}" || { echo "Folder not found" >&2; exit 1; }', 'self="$(basename -- "$0")"',
      'for f in *; do', '  [ -f "$f" ] || continue', '  case "$f" in .*) continue;; esac', '  [ "$f" = "$self" ] && continue',
      '  dest=""'];
    if (opts.byType) {
      out.push('  ext="${f##*.}"; [ "$ext" = "$f" ] && ext=""', '  ext="$(printf \'%s\' "$ext" | tr \'[:upper:]\' \'[:lower:]\')"', '  case "$ext" in');
      Object.keys(CATEGORIES).forEach(function (c) { out.push('    ' + CATEGORIES[c].split(' ').join('|') + ') dest=' + bashQuote(c) + ' ;;'); });
      out.push("    *) dest='Other' ;;", '  esac');
    }
    if (opts.byDate) {
      out.push('  if d="$(date -r "$f" +' + bashQuote(fmt) + ' 2>/dev/null)"; then :; else d="$(stat -c %y "$f" | cut -c1-7)"; fi',
        '  dest="${dest:+$dest/}$d"');
    }
    out.push('  [ -n "$dest" ] || continue', '  if [ -e "$dest/$f" ]; then echo "Already exists, skipped: $dest/$f" >&2; continue; fi',
      '  if [ "${DRY_RUN:-0}" = 1 ]; then echo "would move: $f -> $dest/"; else mkdir -p -- "$dest" && mv -n -- "$f" "$dest/" && echo "moved: $f -> $dest/"; fi', 'done');
    return out.join('\n') + '\n';
  }
  function psOrganise(opts) {
    opts = opts || {}; var fmt = (opts.dateFormat || 'YYYY-MM').replace('YYYY', 'yyyy');
    var out = ['# Organise a folder by ' + [opts.byType && 'file type', opts.byDate && 'date'].filter(Boolean).join(' and ') + ' — made by Brahaspati Automation Hub on ' + stamp(opts.when) + '.',
      '# Rule-based: sorts whatever files are in the folder each time it runs, so it is safe to schedule.',
      '# Usage: powershell -ExecutionPolicy Bypass -File organise.ps1 -Dir "C:\\folder"  (-DryRun to preview)',
      'param([string]$Dir = \'.\', [switch]$DryRun)', '$ErrorActionPreference = \'Stop\'', '$Root = (Resolve-Path -LiteralPath $Dir).ProviderPath', '$Map = @{}'];
    if (opts.byType) Object.keys(CATEGORIES).forEach(function (c) { out.push(CATEGORIES[c].split(' ').map(psQuote).join(',') + ' | ForEach-Object { $Map[$_] = ' + psQuote(c) + ' }'); });
    out.push('Get-ChildItem -LiteralPath $Root -File | Where-Object { -not $_.Name.StartsWith(\'.\') -and $_.FullName -ne $PSCommandPath } | ForEach-Object {', '  $parts = @()');
    if (opts.byType) out.push('  $ext = $_.Extension.TrimStart(\'.\').ToLower()', '  if ($Map.ContainsKey($ext)) { $parts += $Map[$ext] } else { $parts += \'Other\' }');
    if (opts.byDate) out.push('  $parts += $_.LastWriteTime.ToString(' + psQuote(fmt) + ')');
    out.push('  if ($parts.Count -eq 0) { return }', '  $destDir = Join-Path $Root ($parts -join \'\\\')', '  $dst = Join-Path $destDir $_.Name',
      '  if (Test-Path -LiteralPath $dst) { Write-Warning "Already exists, skipped: $dst"; return }',
      '  if ($DryRun) { Write-Output "would move: $($_.Name) -> $destDir"; return }',
      '  [void][System.IO.Directory]::CreateDirectory($destDir); [System.IO.File]::Move($_.FullName, $dst); Write-Output "moved: $($_.Name) -> $destDir"', '}');
    return out.join('\r\n') + '\r\n';
  }

  // Local time -> UTC cron. offsetMinutes = minutes AHEAD of UTC (Sydney summer = 660). days: 'daily'|'weekdays'|'weekly'
  function cronFromLocal(hour, minute, offsetMinutes, days) {
    var total = hour * 60 + minute - (offsetMinutes || 0), shift = 0;
    while (total < 0) { total += 1440; shift--; } while (total >= 1440) { total -= 1440; shift++; }
    var dow = '*';
    if (days === 'weekdays') dow = [1, 2, 3, 4, 5].map(function (d) { return (d + shift + 7) % 7; }).sort().join(',').replace('1,2,3,4,5', '1-5').replace('0,1,2,3,4', '0-4').replace('2,3,4,5,6', '2-6');
    else if (days === 'weekly') dow = String((1 + shift + 7) % 7);
    return (total % 60) + ' ' + Math.floor(total / 60) + ' * * ' + dow;
  }
  function actionsWorkflow(opts) {
    opts = opts || {}; var cron = opts.cron || '0 21 * * *', script = opts.script || 'scripts/daily.sh';
    return ['# Save as .github/workflows/daily-automation.yml in a GitHub repository (free for public repos;',
      '# private repos get 2,000 free minutes a month). Runs on GitHub’s computers, not yours —',
      '# it can only work on files inside the repository.',
      'name: Daily automation', 'on:', '  schedule:', "    - cron: '" + cron + "'   # UTC time. " + (opts.note || ''), '  workflow_dispatch: {}   # adds a “Run workflow” button',
      'permissions:', '  contents: write', 'jobs:', '  run:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4',
      '      - name: Run the script', '        run: bash ' + script + ' ' + (opts.folder || '.'),
      '      - name: Save any changes back to the repository', '        run: |', '          git config user.name "github-actions[bot]"',
      '          git config user.email "41898668+github-actions[bot]@users.noreply.github.com"', '          git add -A',
      '          git diff --cached --quiet || git commit -m "Daily automation $(date -u +%F)"', '          git push', ''].join('\n');
  }
  // Like bashQuote but keeps a leading ~/ working (quotes would stop the shell expanding it).
  function bashPath(p) { p = String(p); return /^~\//.test(p) ? '"$HOME"/' + bashQuote(p.slice(2)) : p === '~' ? '"$HOME"' : bashQuote(p); }
  function crontabLine(hour, minute, scriptPath, folder, days) {
    var dow = days === 'weekdays' ? '1-5' : days === 'weekly' ? '1' : '*';
    return minute + ' ' + hour + ' * * ' + dow + ' /bin/bash ' + bashPath(scriptPath) + ' ' + bashPath(folder) + ' >> "$HOME/brahaspati-automation.log" 2>&1';
  }
  function schtasksLine(hour, minute, scriptPath, folder, days, name) {
    var t = pad(hour, 2) + ':' + pad(minute, 2), sc = days === 'weekdays' ? '/SC WEEKLY /D MON,TUE,WED,THU,FRI' : days === 'weekly' ? '/SC WEEKLY /D MON' : '/SC DAILY';
    var tr = 'powershell -NoProfile -ExecutionPolicy Bypass -File \\"' + scriptPath + '\\" -Dir \\"' + folder + '\\"';
    return 'schtasks /Create ' + sc + ' /ST ' + t + ' /TN "' + (name || 'Brahaspati organise') + '" /TR "' + tr + '"';
  }

  var L = { splitName: splitName, formatDate: formatDate, changeCase: changeCase, newName: newName, nameProblem: nameProblem, renamePlan: renamePlan, planSummary: planSummary,
    moveSteps: moveSteps, CATEGORIES: CATEGORIES, categoryOf: categoryOf, organisePlan: organisePlan, folderCounts: folderCounts, sizeGroups: sizeGroups,
    duplicateGroups: duplicateGroups, hex: hex, fmtBytes: fmtBytes, applyStep: applyStep, applyRecipe: applyRecipe, describeStep: describeStep, STEP_TYPES: Object.keys(STEPS),
    bashQuote: bashQuote, bashPath: bashPath, psQuote: psQuote, bashMoves: bashMoves, psMoves: psMoves, bashDelete: bashDelete, psDelete: psDelete, bashOrganise: bashOrganise, psOrganise: psOrganise,
    cronFromLocal: cronFromLocal, actionsWorkflow: actionsWorkflow, crontabLine: crontabLine, schtasksLine: schtasksLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.AutomationLib = L;
})(this);
