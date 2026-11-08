/* ProductForge core — pure logic for schema-driven small-business record apps.
   No DOM. Works in the browser (window.ForgeCore) and in Node (require('../forge/forge-core.js')).
   Dates are 'YYYY-MM-DD' strings, date-times 'YYYY-MM-DDTHH:MM' (local wall-clock time, as <input type=datetime-local> gives). */
(function (root) {
  'use strict';
  var C = {};

  C.FIELD_TYPES = ['text', 'longtext', 'number', 'money', 'date', 'datetime', 'time', 'select', 'multiselect', 'checkbox',
    'email', 'phone', 'link', 'photos', 'checklist', 'signature', 'lines'];
  C.WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  C.GST_RATE = 0.1;

  // ---------- small helpers ----------
  var r2 = C.r2 = function (n) { n = +n || 0; return Math.round((n + (n >= 0 ? 1 : -1) * Number.EPSILON) * 100) / 100; };
  C.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  C.num = function (v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var s = String(v == null ? '' : v).trim(); if (!s) return NaN;
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s);
    s = s.replace(/[^0-9.]/g, ''); var n = parseFloat(s);
    return isNaN(n) ? NaN : (neg ? -n : n);
  };
  C.isEmpty = function (v) { return v == null || v === '' || (Array.isArray(v) && v.length === 0); };
  C.money = function (n) {
    if (n == null || isNaN(n)) return '–';
    try { return Number(n).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }); } catch (e) { return '$' + r2(n).toFixed(2); }
  };
  var uidN = 0;
  C.uid = function () { uidN = (uidN + 1) % 1296; return Date.now().toString(36) + uidN.toString(36) + Math.random().toString(36).slice(2, 6); };

  // ---------- dates (UTC maths on plain day strings, so time zones never shift a day) ----------
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  C.ymd = function (d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  C.parseDay = function (s) {
    if (!s) return null; s = String(s).trim(); var m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return new Date(Date.UTC(+m[1], m[2] - 1, +m[3]));
    if ((m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/))) { var y = +m[3]; if (y < 100) y += 2000; return new Date(Date.UTC(y, m[2] - 1, +m[1])); }
    return null;
  };
  C.toDay = function (s) { var d = C.parseDay(s); return d && !isNaN(d) ? C.ymd(d) : ''; };
  C.addDays = function (day, n) { var d = C.parseDay(day); d.setUTCDate(d.getUTCDate() + n); return C.ymd(d); };
  C.daysBetween = function (a, b) { return Math.round((C.parseDay(b) - C.parseDay(a)) / 864e5); };
  C.addMonths = function (day, n, keepDay) {
    var d = C.parseDay(day), want = keepDay || d.getUTCDate();
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + n;
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return C.ymd(new Date(Date.UTC(y, m, Math.min(want, last))));
  };
  C.weekday = function (day) { return (C.parseDay(day).getUTCDay() + 6) % 7; }; // 0 = Monday
  C.weekStart = function (day) { return C.addDays(day, -C.weekday(day)); };
  C.weekOf = function (day) { var s = C.weekStart(day), out = []; for (var i = 0; i < 7; i++) out.push(C.addDays(s, i)); return out; };
  // Month grid, Monday first: array of weeks, each 7 day strings (includes days from neighbouring months).
  C.monthGrid = function (year, month0) {
    var first = C.ymd(new Date(Date.UTC(year, month0, 1))), start = C.weekStart(first), weeks = [], d = start;
    do { var w = []; for (var i = 0; i < 7; i++) { w.push(d); d = C.addDays(d, 1); } weeks.push(w); }
    while (C.parseDay(d).getUTCMonth() === month0 && C.parseDay(d).getUTCFullYear() === year);
    return weeks;
  };
  C.dayOf = function (v) { return v ? String(v).slice(0, 10) : ''; };
  C.timeOf = function (v) { var m = String(v || '').match(/T(\d{2}:\d{2})/); return m ? m[1] : ''; };

  // ---------- schema ----------
  C.fieldsOf = function (entity) { return entity.fields || []; };
  C.field = function (entity, key) { return (entity.fields || []).filter(function (f) { return f.key === key; })[0]; };
  C.optionValues = function (f) { return (f.options || []).map(function (o) { return typeof o === 'object' ? o.value : o; }); };
  C.optionLabel = function (f, v) { var o = (f.options || []).filter(function (x) { return (typeof x === 'object' ? x.value : x) === v; })[0]; return o == null ? v : (typeof o === 'object' ? o.label : o); };

  // Returns a list of human-readable problems with an app config (empty list = fine).
  C.validateSchema = function (cfg) {
    var errs = [];
    if (!cfg || typeof cfg !== 'object') return ['Config must be an object'];
    if (!cfg.id || !/^[a-z0-9-]+$/.test(cfg.id)) errs.push('App id must be lower-case letters, digits or dashes');
    var ents = cfg.entities || {};
    if (!Object.keys(ents).length) errs.push('Define at least one entity');
    Object.keys(ents).forEach(function (ek) {
      var e = ents[ek], seen = {};
      if (!e.fields || !e.fields.length) { errs.push(ek + ': needs fields'); return; }
      e.fields.forEach(function (f, i) {
        var where = ek + '.' + (f.key || '#' + i);
        if (!f.key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(f.key)) errs.push(where + ': field key must be a simple name');
        if (seen[f.key]) errs.push(where + ': duplicate field key'); seen[f.key] = 1;
        if (C.FIELD_TYPES.indexOf(f.type || 'text') < 0) errs.push(where + ': unknown type "' + f.type + '"');
        if ((f.type === 'select' || f.type === 'multiselect') && !(f.options && f.options.length)) errs.push(where + ': select needs options');
        if (f.type === 'link' && !ents[f.entity]) errs.push(where + ': links to unknown entity "' + f.entity + '"');
        if (f.compute && typeof f.compute !== 'function') errs.push(where + ': compute must be a function');
      });
      var title = e.title || e.fields[0].key;
      if (typeof title === 'string' && !seen[title]) errs.push(ek + ': title field "' + title + '" not found');
      if (e.board) { var bf = C.field(e, e.board); if (!bf || bf.type !== 'select') errs.push(ek + ': board field must be a select'); }
      [].concat(e.calendar || []).forEach(function (k) { var cf = C.field(e, k); if (!cf || (cf.type !== 'date' && cf.type !== 'datetime')) errs.push(ek + ': calendar field "' + k + '" must be a date or datetime'); });
      if (e.recurring) { var rf = C.field(e, e.recurring); if (!rf || (rf.type !== 'date' && rf.type !== 'datetime')) errs.push(ek + ': recurring field must be a date or datetime'); }
    });
    (cfg.reminders || []).forEach(function (r, i) {
      var e = ents[r.entity]; if (!e) { errs.push('reminder #' + (i + 1) + ': unknown entity "' + r.entity + '"'); return; }
      var f = C.field(e, r.date); if (!f || (f.type !== 'date' && f.type !== 'datetime')) errs.push('reminder #' + (i + 1) + ': "' + r.date + '" is not a date field of ' + r.entity);
    });
    return errs;
  };

  C.titleOf = function (entity, rec) {
    if (!rec) return '';
    if (typeof entity.title === 'function') return String(entity.title(rec) || '');
    var k = entity.title || (entity.fields[0] && entity.fields[0].key);
    return String(rec[k] == null || rec[k] === '' ? '(untitled)' : rec[k]);
  };

  // Turn raw input (form string, CSV cell) into a typed value.
  C.coerce = function (f, raw) {
    var t = f.type || 'text';
    if (raw == null) raw = '';
    switch (t) {
      case 'number': case 'money': { if (typeof raw === 'number') return raw; if (String(raw).trim() === '') return null; var n = C.num(raw); return isNaN(n) ? null : n; }
      case 'checkbox': return raw === true || /^(1|y|yes|true|done|x|✓)$/i.test(String(raw).trim());
      case 'date': return C.toDay(raw);
      case 'datetime': { var s = String(raw).trim(); var m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})/); if (m) return m[1] + 'T' + pad(+m[2]) + ':' + m[3]; return C.toDay(s) ? C.toDay(s) + 'T09:00' : ''; }
      case 'time': { var tm = String(raw).match(/(\d{1,2}):(\d{2})/); return tm ? pad(+tm[1]) + ':' + tm[2] : ''; }
      case 'multiselect': return Array.isArray(raw) ? raw.slice() : String(raw).split(/\s*[;|]\s*/).filter(Boolean);
      case 'photos': case 'checklist': case 'lines': return Array.isArray(raw) ? raw : [];
      default: return typeof raw === 'string' ? raw.trim() : String(raw);
    }
  };

  // ctx: { exists(entityKey, id) -> bool }. Returns {fieldKey: message}; empty object = valid.
  C.validateRecord = function (entity, rec, ctx) {
    var errs = {};
    (entity.fields || []).forEach(function (f) {
      if (f.compute) return;
      var v = rec[f.key], t = f.type || 'text', label = f.label || f.key;
      if (f.required && (C.isEmpty(v) || (t === 'checkbox' && !v))) { errs[f.key] = label + ' is required'; return; }
      if (C.isEmpty(v)) return;
      if ((t === 'number' || t === 'money') && (typeof v !== 'number' || isNaN(v))) errs[f.key] = label + ' must be a number';
      else if ((t === 'number' || t === 'money') && f.min != null && v < f.min) errs[f.key] = label + ' must be at least ' + f.min;
      else if ((t === 'number' || t === 'money') && f.max != null && v > f.max) errs[f.key] = label + ' must be at most ' + f.max;
      else if (t === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errs[f.key] = label + ' does not look like an email address';
      else if (t === 'phone' && (!/^[+\d\s().-]+$/.test(v) || String(v).replace(/\D/g, '').length < 6)) errs[f.key] = label + ' does not look like a phone number';
      else if (t === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errs[f.key] = label + ' must be a date';
      else if (t === 'datetime' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) errs[f.key] = label + ' must be a date and time';
      else if (t === 'select' && C.optionValues(f).indexOf(v) < 0) errs[f.key] = label + ': "' + v + '" is not one of the choices';
      else if (t === 'multiselect' && v.some(function (x) { return C.optionValues(f).indexOf(x) < 0; })) errs[f.key] = label + ' has an unknown choice';
      else if (t === 'link' && ctx && ctx.exists && !ctx.exists(f.entity, v)) errs[f.key] = label + ' points to a record that no longer exists';
      if (!errs[f.key] && typeof f.validate === 'function') { var m = f.validate(v, rec); if (m) errs[f.key] = m; }
    });
    if (typeof entity.validate === 'function') { var extra = entity.validate(rec) || {}; Object.keys(extra).forEach(function (k) { if (extra[k]) errs[k] = extra[k]; }); }
    return errs;
  };

  // Fill computed fields (f.compute(rec, ctx)) and return a new object.
  C.compute = function (entity, rec, ctx) {
    var out = Object.assign({}, rec);
    (entity.fields || []).forEach(function (f) { if (f.compute) { try { out[f.key] = f.compute(out, ctx || {}); } catch (e) { out[f.key] = null; } } });
    return out;
  };

  C.blankRecord = function (entity, idFn, today) {
    var r = { id: (idFn || C.uid)() };
    (entity.fields || []).forEach(function (f) {
      if (f.compute) return;
      var d = typeof f.default === 'function' ? f.default(today) : f.default;
      if (d === 'today') d = today;
      if (d != null) r[f.key] = JSON.parse(JSON.stringify(d));
      else if (f.type === 'checklist') r[f.key] = (f.items || []).map(function (it) { return C.checkItem(it); });
      else if (f.type === 'select' && f.required && f.options && f.options.length) r[f.key] = C.optionValues(f)[0];
      else if (f.type === 'multiselect' || f.type === 'photos' || f.type === 'lines') r[f.key] = [];
      else if (f.type === 'checkbox') r[f.key] = false;
    });
    return r;
  };
  // Checklist item: {id, text, group, done, notes, photos, ...extra columns}
  C.checkItem = function (it) {
    if (typeof it === 'string') it = { text: it };
    return Object.assign({ id: C.uid(), text: '', group: '', done: false, notes: '', photos: [] }, it);
  };
  C.checklistProgress = function (items) {
    items = items || []; var done = items.filter(function (i) { return i.done; }).length;
    return { done: done, total: items.length, pct: items.length ? done / items.length : 0 };
  };

  // Plain-text display of a value (tables, CSV, search). ctx.linkLabel(entityKey, id)
  C.display = function (f, v, ctx) {
    var t = f.type || 'text';
    if (C.isEmpty(v) && t !== 'checkbox') return '';
    switch (t) {
      case 'money': return C.money(v);
      case 'number': return String(v);
      case 'checkbox': return v ? 'Yes' : 'No';
      case 'select': return String(C.optionLabel(f, v));
      case 'multiselect': return v.map(function (x) { return C.optionLabel(f, x); }).join('; ');
      case 'link': return ctx && ctx.linkLabel ? ctx.linkLabel(f.entity, v) : String(v);
      case 'photos': return v.length + ' photo' + (v.length === 1 ? '' : 's');
      case 'checklist': { var p = C.checklistProgress(v); return p.done + '/' + p.total; }
      case 'signature': return v ? 'Signed' : '';
      case 'lines': return C.money(C.linesTotal(v));
      case 'datetime': return String(v).replace('T', ' ');
      default: return String(v);
    }
  };

  // ---------- list: search, filter, sort ----------
  // opts: {q, filters:{key: value}, sort: key, dir: 'asc'|'desc'}; ctx for link labels
  C.query = function (entity, records, opts, ctx) {
    opts = opts || {}; var q = String(opts.q || '').trim().toLowerCase(), fl = opts.filters || {};
    var fields = entity.fields || [];
    var out = (records || []).filter(function (r) {
      for (var k in fl) {
        if (fl[k] == null || fl[k] === '') continue;
        var f = C.field(entity, k), v = r[k];
        if (f && f.type === 'multiselect') { if ((v || []).indexOf(fl[k]) < 0) return false; }
        else if (f && f.type === 'checkbox') { if (!!v !== (fl[k] === true || fl[k] === 'true' || fl[k] === 'Yes')) return false; }
        else if (String(v == null ? '' : v) !== String(fl[k])) return false;
      }
      if (!q) return true;
      var hay = fields.map(function (f) { return /^(photos|signature)$/.test(f.type) ? '' : C.display(f, r[f.key], ctx); }).join(' ').toLowerCase();
      return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
    });
    if (opts.sort) {
      var f = C.field(entity, opts.sort) || { type: 'text' }, dir = opts.dir === 'desc' ? -1 : 1;
      var key = function (r) {
        var v = r[opts.sort];
        if (f.type === 'number' || f.type === 'money') return v == null || v === '' ? -Infinity : +v;
        if (f.type === 'select') return C.optionValues(f).indexOf(v);
        if (f.type === 'link' && ctx && ctx.linkLabel) return String(ctx.linkLabel(f.entity, v) || '').toLowerCase();
        if (f.type === 'checklist') return C.checklistProgress(v).pct;
        return String(v == null ? '' : v).toLowerCase();
      };
      out = out.map(function (r, i) { return { r: r, k: key(r), i: i }; }).sort(function (a, b) {
        var ea = a.k === '' || a.k === -Infinity, eb = b.k === '' || b.k === -Infinity;
        if (ea !== eb) return ea ? 1 : -1; // empties last whichever way
        return (a.k < b.k ? -1 : a.k > b.k ? 1 : 0) * dir || a.i - b.i;
      }).map(function (x) { return x.r; });
    }
    return out;
  };

  // Board columns: [{value, label, records}]
  C.board = function (entity, records) {
    var f = C.field(entity, entity.board);
    var cols = C.optionValues(f).map(function (v) { return { value: v, label: C.optionLabel(f, v), records: [] }; });
    var other = { value: '', label: 'No ' + (f.label || f.key).toLowerCase(), records: [] };
    (records || []).forEach(function (r) { var c = cols.filter(function (x) { return x.value === r[f.key]; })[0]; (c || other).records.push(r); });
    if (other.records.length) cols.unshift(other);
    return cols;
  };

  // Records that link to `id` of `targetKey`: [{entityKey, field, records}]
  C.backlinks = function (cfg, data, targetKey, id) {
    var out = [];
    Object.keys(cfg.entities).forEach(function (ek) {
      (cfg.entities[ek].fields || []).forEach(function (f) {
        if (f.type === 'link' && f.entity === targetKey) {
          var recs = (data[ek] || []).filter(function (r) { return r[f.key] === id; });
          if (recs.length) out.push({ entity: ek, field: f.key, records: recs });
        }
      });
    });
    return out;
  };

  // ---------- recurrence ----------
  // rule: {freq:'weekly'|'fortnightly'|'monthly', start:'YYYY-MM-DD', until?, count?}; returns day strings incl. start
  C.expandRecurrence = function (rule, max) {
    max = Math.min(max || 366, 1000);
    var out = [], d = C.toDay(rule.start), until = rule.until ? C.toDay(rule.until) : null, count = rule.count ? +rule.count : null;
    if (!d) return out;
    if (!until && !count) count = 12;
    var startDay = C.parseDay(d).getUTCDate(), i = 0;
    while (out.length < max) {
      var cur = rule.freq === 'monthly' ? C.addMonths(d, i, startDay) : C.addDays(d, i * (rule.freq === 'fortnightly' ? 14 : rule.freq === 'daily' ? 1 : 7));
      if (until && cur > until) break;
      out.push(cur); i++;
      if (count && out.length >= count) break;
    }
    return out;
  };
  // Copies of rec for each later date in the rule. dateFields are shifted by the same number of days
  // (datetime keeps its time). reset: values to apply to each copy (e.g. {status:'Scheduled'}).
  C.generateSeries = function (rec, dateField, rule, opts) {
    opts = opts || {};
    var base = C.dayOf(rec[dateField]); if (!base) return [];
    var days = C.expandRecurrence(Object.assign({}, rule, { start: base }), opts.max).slice(1);
    var seriesId = rec.seriesId || opts.seriesId || ('s' + (opts.idFn || C.uid)());
    var shiftKeys = [dateField].concat(opts.shift || []);
    var have = {}; (opts.existing || []).forEach(function (r) { if (r.seriesId === seriesId) have[C.dayOf(r[dateField])] = 1; });
    return days.filter(function (day) { return !have[day]; }).map(function (day) {
      var delta = C.daysBetween(base, day), copy = JSON.parse(JSON.stringify(rec));
      copy.id = (opts.idFn || C.uid)(); copy.seriesId = seriesId;
      shiftKeys.forEach(function (k) { var v = rec[k]; if (!v) return; var t = C.timeOf(v); copy[k] = C.addDays(C.dayOf(v), delta) + (t ? 'T' + t : ''); });
      (opts.clear || []).forEach(function (k) { delete copy[k]; });
      Object.assign(copy, opts.reset || {});
      return copy;
    });
  };

  // ---------- reminders ----------
  // rule: {entity, date, offsetDays?, offsetMonths?, warnDays?, label: string|fn(rec), when?: fn(rec)->bool, id?}
  // Returns [{rule, entity, id, title, label, due, days, status:'overdue'|'today'|'soon'}], most urgent first.
  C.reminders = function (cfg, data, today, opts) {
    opts = opts || {}; var out = [];
    (cfg.reminders || []).forEach(function (rule, ri) {
      var ent = cfg.entities[rule.entity]; if (!ent) return;
      (data[rule.entity] || []).forEach(function (rec) {
        if (rule.when && !rule.when(rec, today)) return;
        var base = C.dayOf(rec[rule.date]); if (!base) return;
        var due = rule.offsetMonths ? C.addMonths(base, rule.offsetMonths) : base;
        if (rule.offsetDays) due = C.addDays(due, rule.offsetDays);
        var days = C.daysBetween(today, due), warn = rule.warnDays == null ? 14 : rule.warnDays;
        if (days > (opts.horizon != null ? opts.horizon : warn)) return;
        if (rule.pastDays != null && days < -rule.pastDays) return;
        out.push({ rule: rule.id || ri, entity: rule.entity, id: rec.id, title: C.titleOf(ent, rec),
          label: typeof rule.label === 'function' ? rule.label(rec) : (rule.label || (C.field(ent, rule.date).label || rule.date)),
          due: due, time: C.timeOf(rec[rule.date]), days: days, status: days < 0 ? 'overdue' : days === 0 ? 'today' : 'soon' });
      });
    });
    return out.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
  };

  // ---------- calendar ----------
  // All dated items from entities' `calendar` fields: [{entity, id, field, day, time, title, label}]
  C.calendarEvents = function (cfg, data, from, to) {
    var out = [];
    Object.keys(cfg.entities).forEach(function (ek) {
      var e = cfg.entities[ek];
      [].concat(e.calendar || []).forEach(function (k) {
        var f = C.field(e, k);
        (data[ek] || []).forEach(function (r) {
          var day = C.dayOf(r[k]); if (!day || (from && day < from) || (to && day > to)) return;
          out.push({ entity: ek, id: r.id, field: k, day: day, time: C.timeOf(r[k]), title: C.titleOf(e, r), label: (e.single || ek) + ([].concat(e.calendar).length > 1 ? ' · ' + (f.label || k) : ''),
            hours: e.durationField ? +r[e.durationField] || null : null });
        });
      });
    });
    return out.sort(function (a, b) { return (a.day + a.time) < (b.day + b.time) ? -1 : (a.day + a.time) > (b.day + b.time) ? 1 : 0; });
  };

  // ---------- .ics (RFC 5545) ----------
  C.icsEscape = function (s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); };
  C.icsFold = function (line) {
    // fold at 75 octets (UTF-8), continuation lines start with a space
    var out = [], cur = '', bytes = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], code = line.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < line.length) { ch += line[++i]; }
      var b = unescape(encodeURIComponent(ch)).length;
      if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  };
  // events: [{uid, title, day:'YYYY-MM-DD', time?:'HH:MM', hours?, description?, location?, alarmDays?}]
  C.buildICS = function (events, opts) {
    opts = opts || {};
    var stamp = (opts.now || new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Brahaspati//ProductForge//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    if (opts.name) L.push('X-WR-CALNAME:' + C.icsEscape(opts.name));
    (events || []).forEach(function (ev) {
      var d = ev.day.replace(/-/g, '');
      L.push('BEGIN:VEVENT', 'UID:' + C.icsEscape(ev.uid || C.uid()) + '@brahaspati', 'DTSTAMP:' + stamp);
      if (ev.time) {
        var mins = Math.round((+ev.hours || 1) * 60), h = +ev.time.slice(0, 2), m = +ev.time.slice(3, 5) + mins;
        var endDay = C.addDays(ev.day, Math.floor((h * 60 + m) / 1440)), tot = (h * 60 + m) % 1440;
        L.push('DTSTART:' + d + 'T' + ev.time.replace(':', '') + '00', 'DTEND:' + endDay.replace(/-/g, '') + 'T' + pad(Math.floor(tot / 60)) + pad(tot % 60) + '00');
      } else {
        L.push('DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + C.addDays(ev.day, 1).replace(/-/g, ''));
      }
      L.push('SUMMARY:' + C.icsEscape(ev.title));
      if (ev.description) L.push('DESCRIPTION:' + C.icsEscape(ev.description));
      if (ev.location) L.push('LOCATION:' + C.icsEscape(ev.location));
      if (ev.alarmDays != null) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + C.icsEscape(ev.title), 'TRIGGER:-P' + (+ev.alarmDays || 0) + 'D', 'END:VALARM');
      L.push('END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.map(C.icsFold).join('\r\n') + '\r\n';
  };

  // ---------- CSV mapping ----------
  var csvable = function (f) { return f.type !== 'photos' && f.type !== 'signature' && f.csv !== false; };
  // -> {headers:[labels], rows:[{label: text}]} ; includes an "ID" column so a re-import updates instead of duplicating
  C.toCSV = function (entity, records, ctx) {
    var fs = (entity.fields || []).filter(csvable), headers = ['ID'].concat(fs.map(function (f) { return f.label || f.key; }));
    var rows = (records || []).map(function (r) {
      var o = { ID: r.id };
      fs.forEach(function (f) {
        var v = r[f.key], t = f.type;
        o[f.label || f.key] = t === 'number' || t === 'money' ? (v == null ? '' : v) : t === 'checklist' ? (v || []).map(function (i) { return (i.done ? '[x] ' : '[ ] ') + (i.group ? i.group + ': ' : '') + i.text; }).join(' | ')
          : t === 'lines' ? (v || []).map(function (l) { return (l.qty || 0) + ' x ' + (l.desc || '') + ' @ ' + (l.price || 0); }).join(' | ') : C.display(f, v, ctx);
      });
      return o;
    });
    return { headers: headers, rows: rows };
  };
  // objs: [{header: cell}] -> {records, errors:[{row, message}]}; headers matched by label or key, case-insensitive.
  // ctx.findLink(entityKey, text) -> id ; ctx.idFn
  C.fromCSV = function (entity, objs, ctx) {
    ctx = ctx || {};
    var records = [], errors = [];
    (objs || []).forEach(function (o, i) {
      var keys = Object.keys(o), norm = {}; keys.forEach(function (k) { norm[String(k).trim().toLowerCase()] = o[k]; });
      var get = function (f) { var a = norm[String(f.label || f.key).toLowerCase()]; return a !== undefined ? a : norm[f.key.toLowerCase()]; };
      var r = { id: norm.id || (ctx.idFn || C.uid)() }, any = false;
      (entity.fields || []).forEach(function (f) {
        if (f.compute || !csvable(f)) return;
        var raw = get(f); if (raw === undefined) return;
        if (String(raw).trim() !== '') any = true;
        if (f.type === 'link') { var id = String(raw).trim(); r[f.key] = id ? (ctx.findLink ? ctx.findLink(f.entity, id) || id : id) : ''; return; }
        if (f.type === 'checklist') { r[f.key] = String(raw).split('|').map(function (s) { s = s.trim(); if (!s) return null; var done = /^\[x\]/i.test(s); s = s.replace(/^\[[ x]?\]\s*/i, ''); var g = s.match(/^([^:]{1,40}):\s+(.*)$/); return C.checkItem({ text: g ? g[2] : s, group: g ? g[1] : '', done: done }); }).filter(Boolean); return; }
        if (f.type === 'lines') { r[f.key] = String(raw).split('|').map(function (s) { var m = s.trim().match(/^([\d.]+)\s*x\s*(.*?)\s*@\s*([\d.,$]+)$/); return m ? { desc: m[2], qty: +m[1], price: C.num(m[3]) } : null; }).filter(Boolean); return; }
        if (f.type === 'select') { var s = String(raw).trim(), match = C.optionValues(f).filter(function (v) { return String(v).toLowerCase() === s.toLowerCase() || String(C.optionLabel(f, v)).toLowerCase() === s.toLowerCase(); })[0]; r[f.key] = match != null ? match : s; return; }
        r[f.key] = C.coerce(f, raw);
      });
      if (!any) return;
      var errs = C.validateRecord(entity, r, ctx);
      var msgs = Object.keys(errs).map(function (k) { return errs[k]; });
      if (msgs.length) errors.push({ row: i + 2, message: msgs.join('; ') });
      records.push(r);
    });
    return { records: records, errors: errors };
  };

  // ---------- money ----------
  C.linesTotal = function (lines) { return r2((lines || []).reduce(function (s, l) { return s + (+l.qty || 0) * (+l.price || 0); }, 0)); };
  // opts: {gst:true, gstRate:.1, markupPct:0 (on lines), extras:[{label, amount}] (added after markup, before GST), discount: amount}
  C.totals = function (lines, opts) {
    opts = opts || {};
    var sub = C.linesTotal(lines), markup = r2(sub * (+opts.markupPct || 0) / 100);
    var extras = r2((opts.extras || []).reduce(function (s, x) { return s + (+x.amount || 0); }, 0));
    var discount = Math.min(r2(+opts.discount || 0), r2(sub + markup + extras));
    var net = r2(sub + markup + extras - discount), gst = opts.gst === false ? 0 : r2(net * (opts.gstRate == null ? C.GST_RATE : opts.gstRate));
    return { subtotal: sub, markup: markup, extras: extras, discount: discount, net: net, gst: gst, total: r2(net + gst) };
  };
  C.gstFromInclusive = function (amount, rate) { rate = rate == null ? C.GST_RATE : rate; return r2((+amount || 0) * rate / (1 + rate)); };

  // ---------- dashboard ----------
  // tile: {label, entity, kind:'count'|'sum'|'avg'|'overdue', field?, where?: fn(rec, today), date?: field (overdue), fmt?}
  C.tile = function (tile, data, today) {
    var recs = (data[tile.entity] || []).filter(function (r) { return !tile.where || tile.where(r, today); });
    var val;
    if (tile.kind === 'sum' || tile.kind === 'avg') {
      var s = recs.reduce(function (a, r) { var v = typeof tile.field === 'function' ? tile.field(r) : r[tile.field]; return a + (+v || 0); }, 0);
      val = tile.kind === 'avg' ? (recs.length ? r2(s / recs.length) : 0) : r2(s);
    } else if (tile.kind === 'overdue') val = recs.filter(function (r) { var d = C.dayOf(r[tile.date]); return d && d < today; }).length;
    else val = recs.length;
    return { label: tile.label, value: val, fmt: tile.fmt || (tile.kind === 'sum' ? 'money' : 'num'), tone: tile.tone ? tile.tone(val) : (tile.kind === 'overdue' && val ? 'bad' : '') };
  };
  // -> [{label, value}] summing `sum` (field or fn) or counting, grouped by `by` (field or fn); sorted biggest first unless order given
  C.groupBy = function (records, by, sum, ctx) {
    var m = {}, order = [];
    (records || []).forEach(function (r) {
      var k = typeof by === 'function' ? by(r) : r[by]; if (Array.isArray(k)) k = k.join(', ');
      k = k == null || k === '' ? '(none)' : String(k);
      if (!(k in m)) { m[k] = 0; order.push(k); }
      m[k] += sum ? (+(typeof sum === 'function' ? sum(r) : r[sum]) || 0) : 1;
    });
    return order.map(function (k) { return { label: ctx && ctx.label ? ctx.label(k) : k, value: r2(m[k]) }; }).sort(function (a, b) { return b.value - a.value; });
  };

  // ---------- backup ----------
  C.makeBackup = function (appId, data, photos, now) {
    return { app: appId, kind: 'forge-backup', version: 1, saved: (now || new Date()).toISOString(), data: data, photos: photos || {} };
  };
  C.readBackup = function (json, appId, cfg) {
    var j = typeof json === 'string' ? JSON.parse(json) : json;
    if (!j || typeof j !== 'object' || j.kind !== 'forge-backup') throw new Error('This is not a backup file from this app');
    if (j.app !== appId) throw new Error('This backup belongs to a different app (' + j.app + ')');
    var data = {};
    Object.keys(cfg.entities).forEach(function (k) {
      var v = (j.data || {})[k]; if (v != null && !Array.isArray(v)) throw new Error('"' + k + '" should be a list');
      data[k] = (v || []).filter(function (r) { return r && typeof r === 'object' && r.id; });
    });
    if (j.data && j.data._extra) data._extra = j.data._extra;
    return { data: data, photos: j.photos || {} };
  };

  // ---------- printable documents ----------
  // spec: {title, number?, date?, meta:[[label, value]], to?:{heading, lines:[text]}, intro?,
  //   lines?:[{desc, qty, price}], totals?: (from C.totals) + totalsLabels?, gst?: bool,
  //   sections?:[{heading, text? | html? | table?:{headers:[], rows:[[]]} | checklist?:[items], columns?:[{key,label}] | photos?:[ids]}],
  //   photos?:[ids], signatures?:[{label, image, name, date}], notes?, footer?}
  // business: {name, abn, address, phone, email, logo, payDetails}; photoSrc: {id: dataURL}
  C.docHTML = function (spec, business, photoSrc) {
    var e = C.esc, b = business || {}, ps = photoSrc || {}, m = C.money;
    var nl = function (s) { return e(s).replace(/\n/g, '<br>'); };
    var photosHTML = function (ids) {
      ids = (ids || []).filter(function (id) { return ps[id]; }); if (!ids.length) return '';
      return '<div class="ph">' + ids.map(function (id) { return '<img src="' + e(ps[id]) + '" alt="">'; }).join('') + '</div>';
    };
    var h = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + e(spec.title + (spec.number ? ' ' + spec.number : '')) + '</title><style>' +
      'body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d1f24;margin:0;padding:32px;max-width:860px}' +
      '.top{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}.logo{max-height:70px;max-width:220px}h1{font-size:26px;margin:0 0 4px}h2{font-size:17px;margin:22px 0 6px;border-bottom:2px solid #1d1f24;padding-bottom:3px}' +
      'table{width:100%;border-collapse:collapse;margin:10px 0}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}th{background:#f3f1ea}td.n,th.n{text-align:right;white-space:nowrap}' +
      '.tot{margin-left:auto;width:300px}.tot td{border:0;padding:3px 8px}.tot tr.big td{font-size:17px;font-weight:700;border-top:2px solid #1d1f24}' +
      '.muted{color:#5d6270}.box{background:#f7f6f2;padding:10px 14px;border-radius:8px;margin-top:14px;white-space:pre-wrap}.ok{color:#1f7a46}.bad{color:#b42318}' +
      '.ph{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.ph img{width:160px;height:120px;object-fit:cover;border:1px solid #ddd;border-radius:4px}' +
      '.sigs{display:flex;gap:28px;flex-wrap:wrap;margin-top:24px}.sig{min-width:220px}.sig img{height:70px;display:block;border-bottom:1px solid #1d1f24}.sig .line{height:70px;border-bottom:1px solid #1d1f24}' +
      'section{break-inside:avoid-page}@media print{body{padding:0}.noprint{display:none}}</style></head><body>';
    h += '<div class="top"><div>' + (b.logo ? '<img class="logo" src="' + e(b.logo) + '" alt=""><br>' : '') + '<b style="font-size:17px">' + e(b.name || 'Your business name') + '</b><br>' +
      (b.abn ? 'ABN ' + e(b.abn) + '<br>' : '') + (b.licence ? 'Licence ' + e(b.licence) + '<br>' : '') + (b.address ? nl(b.address) + '<br>' : '') +
      [b.email, b.phone].filter(Boolean).map(e).join(' · ') + '</div>';
    h += '<div style="text-align:right"><h1>' + e(spec.title) + '</h1>' + (spec.number ? '<b>' + e(spec.number) + '</b><br>' : '') + (spec.date ? 'Date: ' + e(spec.date) + '<br>' : '') +
      (spec.meta || []).filter(function (x) { return x && x[1] != null && x[1] !== ''; }).map(function (x) { return e(x[0]) + ': ' + e(x[1]); }).join('<br>') + '</div></div>';
    if (spec.to) h += '<p style="margin-top:20px"><span class="muted">' + e(spec.to.heading || 'For') + '</span><br>' + (spec.to.lines || []).filter(Boolean).map(function (l, i) { return i ? nl(l) : '<b>' + nl(l) + '</b>'; }).join('<br>') + '</p>';
    if (spec.intro) h += '<p>' + nl(spec.intro) + '</p>';
    if (spec.lines && spec.lines.length) {
      h += '<table><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Unit price</th><th class="n">Amount</th></tr></thead><tbody>' +
        spec.lines.map(function (l) { return '<tr><td>' + nl(l.desc) + '</td><td class="n">' + e(+l.qty || 0) + '</td><td class="n">' + m(+l.price || 0) + '</td><td class="n">' + m(r2((+l.qty || 0) * (+l.price || 0))) + '</td></tr>'; }).join('') + '</tbody></table>';
    }
    if (spec.totals) {
      var t = spec.totals, gst = spec.gst !== false;
      h += '<table class="tot"><tr><td>Subtotal</td><td class="n">' + m(t.subtotal) + '</td></tr>' +
        (t.markup ? '<tr><td>' + e(spec.markupLabel || 'Markup') + '</td><td class="n">' + m(t.markup) + '</td></tr>' : '') +
        (spec.extras || []).filter(function (x) { return +x.amount; }).map(function (x) { return '<tr><td>' + e(x.label) + '</td><td class="n">' + m(x.amount) + '</td></tr>'; }).join('') +
        (t.discount ? '<tr><td>Discount</td><td class="n">−' + m(t.discount) + '</td></tr>' : '') +
        (gst ? '<tr><td>GST (10%)</td><td class="n">' + m(t.gst) + '</td></tr>' : '') +
        '<tr class="big"><td>Total' + (gst ? ' incl. GST' : '') + '</td><td class="n">' + m(t.total) + '</td></tr>' +
        (spec.paid ? '<tr><td>Paid</td><td class="n">−' + m(spec.paid) + '</td></tr><tr><td><b>Balance due</b></td><td class="n"><b>' + m(r2(t.total - spec.paid)) + '</b></td></tr>' : '') + '</table>';
      if (!gst) h += '<p class="muted">No GST has been charged.</p>';
    }
    (spec.sections || []).forEach(function (s) {
      h += '<section>' + (s.heading ? '<h2>' + e(s.heading) + '</h2>' : '');
      if (s.text) h += '<p>' + nl(s.text) + '</p>';
      if (s.html) h += s.html; // caller is responsible for escaping
      if (s.table) h += '<table><thead><tr>' + s.table.headers.map(function (x) { return '<th>' + e(x) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        s.table.rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + nl(c == null ? '' : c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
      if (s.checklist) {
        var cols = s.columns || [], groups = [], byG = {};
        s.checklist.forEach(function (it) { var g = it.group || ''; if (!byG[g]) { byG[g] = []; groups.push(g); } byG[g].push(it); });
        groups.forEach(function (g) {
          if (g) h += '<h3 style="margin:14px 0 2px">' + e(g) + '</h3>';
          h += '<table><thead><tr><th style="width:28px">✓</th><th>Item</th>' + cols.map(function (c) { return '<th>' + e(c.label) + '</th>'; }).join('') + '<th>Notes</th></tr></thead><tbody>' +
            byG[g].map(function (it) {
              return '<tr><td>' + (it.done ? '☑' : '☐') + '</td><td>' + e(it.text) + '</td>' + cols.map(function (c) { return '<td>' + e(it[c.key] == null ? '' : it[c.key]) + '</td>'; }).join('') +
                '<td>' + nl(it.notes || '') + photosHTML(it.photos) + '</td></tr>';
            }).join('') + '</tbody></table>';
        });
      }
      if (s.photos) h += photosHTML(s.photos);
      h += '</section>';
    });
    if (spec.photos && spec.photos.length) h += '<section><h2>Photos</h2>' + photosHTML(spec.photos) + '</section>';
    if (spec.notes) h += '<div class="box">' + e(spec.notes) + '</div>';
    if (spec.payDetails !== false && b.payDetails && /invoice/i.test(spec.title)) h += '<div class="box"><b>How to pay</b>\n' + e(b.payDetails) + (spec.number ? '\nPlease use ' + e(spec.number) + ' as the reference.' : '') + '</div>';
    if (spec.signatures && spec.signatures.length) {
      h += '<div class="sigs">' + spec.signatures.map(function (s) {
        return '<div class="sig">' + (s.image ? '<img src="' + e(s.image) + '" alt="Signature">' : '<div class="line"></div>') + '<div>' + e(s.label) + (s.name ? ': ' + e(s.name) : '') + '</div>' + (s.date ? '<div class="muted">' + e(s.date) + '</div>' : '') + '</div>';
      }).join('') + '</div>';
    }
    if (spec.footer) h += '<p class="muted" style="margin-top:22px">' + nl(spec.footer) + '</p>';
    h += '<p class="noprint muted" style="margin-top:28px">Use your browser\'s Print command and choose "Save as PDF" to make a PDF.</p></body></html>';
    return h;
  };

  // Every photo id a record uses (photo fields + photos on checklist items).
  C.photoIds = function (entity, rec) {
    var ids = [];
    (entity.fields || []).forEach(function (f) {
      if (f.type === 'photos') ids = ids.concat(rec[f.key] || []);
      if (f.type === 'checklist') (rec[f.key] || []).forEach(function (it) { ids = ids.concat(it.photos || []); });
    });
    return ids;
  };
  C.allPhotoIds = function (cfg, data) {
    var ids = [];
    Object.keys(cfg.entities).forEach(function (ek) { (data[ek] || []).forEach(function (r) { ids = ids.concat(C.photoIds(cfg.entities[ek], r)); }); });
    return ids.filter(function (x, i) { return ids.indexOf(x) === i; });
  };
  // Photo ids referenced anywhere in a document spec.
  C.docPhotoIds = function (spec) {
    var ids = [].concat(spec.photos || []);
    (spec.sections || []).forEach(function (s) { ids = ids.concat(s.photos || []); (s.checklist || []).forEach(function (it) { ids = ids.concat(it.photos || []); }); });
    return ids;
  };

  // Next number like INV-0007 given existing numbers.
  C.nextNumber = function (numbers, prefix, width) {
    width = width || 4; var max = 0;
    (numbers || []).forEach(function (n) { var s = String(n || ''); if (s.indexOf(prefix) !== 0) return; var x = parseInt(s.slice(prefix.length), 10); if (!isNaN(x) && x > max) max = x; });
    var s = String(max + 1); while (s.length < width) s = '0' + s; return prefix + s;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = C; else root.ForgeCore = C;
})(this);
