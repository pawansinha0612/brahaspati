/* Appointment No-show Predictor — pure logic (no DOM). Browser: window.NoShowLib; Node: require(). */
(function (root) {
  'use strict';
  var DAY = 86400000, WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ---------- helpers ----------
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function guessColumns(headers, fields) {
    var cands = [];
    fields.forEach(function (f, fi) {
      headers.forEach(function (h, hi) {
        var n = String(h).trim().toLowerCase();
        for (var i = 0; i < f.re.length; i++) if (f.re[i].test(n)) { cands.push({ key: f.key, h: h, score: i * 10 + fi * 0.01 + hi * 0.0001 }); break; }
      });
    });
    cands.sort(function (a, b) { return a.score - b.score; });
    var map = {}, used = {};
    cands.forEach(function (c) { if (map[c.key] == null && !used[c.h]) { map[c.key] = c.h; used[c.h] = 1; } });
    fields.forEach(function (f) { if (map[f.key] == null) map[f.key] = ''; });
    return map;
  }
  var FIELDS = [
    { key: 'status', label: 'Status / outcome', required: true, re: [/^(appointment |booking )?(status|outcome|attendance|attended)$/, /status|outcome|attend|show/] },
    { key: 'date', label: 'Appointment date (or date + time)', required: true, re: [/^(appointment|appt|booking|visit|session|start) ?(date|date ?time|datetime|time)?$/, /^(date|start|starts|when)$/, /^(appointment|appt|visit|start).*(date|time)/, /date/] },
    { key: 'time', label: 'Appointment time', re: [/^(appointment |appt |start )?time$/, /^(start|from)$/, /time/] },
    { key: 'booked', label: 'Date booked', re: [/^(booked|created|made)( on| at| date)?$/, /^(booking|created|made) ?(date|on|at)$/, /booked|created|made on|booking date/] },
    { key: 'customer', label: 'Customer ID / name', re: [/^(client|customer|patient|member) ?(id|number|no|#)?$/, /client|customer|patient|member|email|phone/, /^name$/] },
    { key: 'service', label: 'Service', re: [/^(service|treatment|appointment type|type|class)$/, /service|treatment|type|class/] },
    { key: 'staff', label: 'Staff member', re: [/^(staff|practitioner|provider|stylist|therapist|doctor|employee)( name)?$/, /staff|practitioner|provider|stylist|therapist|doctor|with/] },
    { key: 'channel', label: 'Booking channel', re: [/^(booking )?(channel|source|method)$/, /channel|source|booked via|method/] },
    { key: 'reminder', label: 'Reminder sent', re: [/^reminder( sent)?$/, /remind|sms|confirm/] },
    { key: 'isNew', label: 'New or returning', re: [/^(client |customer |patient )?(type|status)$/, /new|returning|first visit|first time/] }
  ];
  function detectColumns(headers) { var m = guessColumns(headers, FIELDS); if (m.isNew && m.isNew === m.status) m.isNew = ''; return m; }

  function detectDateOrder(values) {
    var dmy = 0, mdy = 0;
    values.forEach(function (v) { var m = String(v || '').trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-]\d{2,4}/); if (!m) return; if (+m[1] > 12) dmy++; if (+m[2] > 12) mdy++; });
    return mdy > dmy ? 'mdy' : 'dmy';
  }
  var MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  function parseTime(s) {
    var m = String(s || '').trim().match(/(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([ap]\.?m\.?)?/i); if (!m) return null;
    var h = +m[1], mi = +(m[2] || 0), ap = m[3] ? m[3].toLowerCase()[0] : '';
    if (!m[2] && !ap) return null;
    if (ap === 'p' && h < 12) h += 12; if (ap === 'a' && h === 12) h = 0;
    if (h > 23 || mi > 59) return null; return h * 60 + mi;
  }
  // Returns a "naive" timestamp (local wall-clock time stored as UTC) and whether a time was found.
  function parseDateTime(v, timeStr, order) {
    var s = String(v == null ? '' : v).trim(), m, d = null, rest = '';
    if (!s) return null;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/))) { d = Date.UTC(+m[1], m[2] - 1, +m[3]); rest = m[4]; }
    else if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(.*)$/))) {
      var y = +m[3]; if (y < 100) y += 2000; var a = +m[1], b = +m[2]; if (order === 'mdy') { var t = a; a = b; b = t; }
      if (b < 1 || b > 12 || a < 1 || a > 31) return null; d = Date.UTC(y, b - 1, a); rest = m[4];
    } else if ((m = s.match(/^(?:[A-Za-z]{3,9},?\s+)?(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})(.*)$/)) && MON[m[2].toLowerCase()] != null) { d = Date.UTC(+m[3], MON[m[2].toLowerCase()], +m[1]); rest = m[4]; }
    else if (/^\d{5}(\.\d+)?$/.test(s)) { var n = +s; d = Date.UTC(1899, 11, 30) + Math.round(n * DAY); return { t: d, hasTime: n % 1 !== 0 }; }
    if (d == null) return null;
    var mins = parseTime(timeStr != null && String(timeStr).trim() ? timeStr : rest.replace(/^T/, ' '));
    return { t: d + (mins == null ? 0 : mins * 60000), hasTime: mins != null };
  }
  function status(s) {
    s = String(s == null ? '' : s).trim().toLowerCase();
    if (!s) return 'open';
    if (/no.?show|dna|did ?n.?t (attend|arrive|show)|did not|missed|absent|fail|^ns$|not attended|unattended/.test(s)) return 'noshow';
    if (/late.?cancel|cancel.*late|short.?notice|cancelled \(late\)/.test(s)) return 'late';
    if (/cancel|resched|moved|void|deleted/.test(s)) return 'cancelled';
    if (/attend|complete|arrived|^show|showed|checked|done|seen|paid|fulfil|finished|^yes$|^y$|^1$|^true$/.test(s)) return 'attended';
    if (/book|sched|confirm|pending|upcoming|reserved|open|new|tentative/.test(s)) return 'open';
    if (/^(no|n|0|false)$/.test(s)) return 'noshow';
    return 'unknown';
  }
  function yesNo(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase(); if (!s) return null;
    if (/^(no|n|false|0|none|not sent|-)$/.test(s)) return false;
    if (/^(yes|y|true|1|sent|sms|email|text|both|delivered|✓)$/.test(s) || /sent|sms|email/.test(s)) return true;
    return null;
  }
  function newFlag(v) { var s = String(v == null ? '' : v).trim().toLowerCase(); if (/new|first/.test(s)) return true; if (/return|exist|repeat|regular|old/.test(s)) return false; return null; }
  function leadBucket(d) { return d == null ? 'Unknown' : d < 1 ? 'Same day' : d <= 2 ? '1–2 days' : d <= 7 ? '3–7 days' : d <= 14 ? '8–14 days' : d <= 30 ? '15–30 days' : '31+ days'; }
  var LEAD_ORDER = ['Same day', '1–2 days', '3–7 days', '8–14 days', '15–30 days', '31+ days', 'Unknown'];
  function hourLabel(h) { if (h == null) return 'Unknown'; var ap = h < 12 ? 'am' : 'pm', x = h % 12 || 12; return x + ap; }
  function timeBand(h) { return h == null ? null : h < 10 ? 'early' : h < 12 ? 'late morning' : h < 14 ? 'midday' : h < 16 ? 'afternoon' : 'late afternoon'; }

  /* rows + map -> {past:[appt], upcoming:[appt], skipped, cancelled, baseRate, hasTime, ...}
     opts: {lateAsNoShow (true), today (ms, default now)} */
  function prepare(rows, map, opts) {
    opts = opts || {}; var late = opts.lateAsNoShow !== false, today = opts.today != null ? opts.today : Date.now();
    var order = detectDateOrder(rows.map(function (r) { return r[map.date]; }).concat(map.booked ? rows.map(function (r) { return r[map.booked]; }) : []));
    var list = [], skipped = 0, cancelled = 0, unknown = 0, CANON = { date: 'date', time: 'time', booked: 'booked', customer: 'customer', service: 'service', staff: 'staff', channel: 'channel', reminder: 'reminder', isNew: 'isNew', status: 'status' };
    var all = rows.map(function (r) { return { r: r, m: map }; }).concat((opts.extra || []).map(function (r) { return { r: r, m: CANON, manual: true }; }));
    all.forEach(function (x, i) {
      var r = x.r, map = x.m;
      var dt = parseDateTime(r[map.date], map.time ? r[map.time] : null, order);
      if (!dt) { skipped++; return; }
      var st = status(r[map.status]);
      if (st === 'cancelled') { cancelled++; return; }
      if (st === 'unknown') { unknown++; return; }
      if (st === 'late' && !late) { cancelled++; return; }
      var bk = map.booked ? parseDateTime(r[map.booked], null, order) : null;
      var a = {
        row: i, t: dt.t, hasTime: dt.hasTime, booked: bk ? bk.t : null, status: st,
        customer: map.customer ? String(r[map.customer] || '').trim() : '', service: map.service ? String(r[map.service] || '').trim() || 'Unspecified' : '',
        staff: map.staff ? String(r[map.staff] || '').trim() : '', channel: map.channel ? String(r[map.channel] || '').trim() || 'Unspecified' : '',
        reminder: map.reminder ? yesNo(r[map.reminder]) : null, isNew: map.isNew ? newFlag(r[map.isNew]) : null, manual: !!x.manual, id: r.id
      };
      var dd = new Date(a.t); a.weekday = WD[dd.getUTCDay()]; a.hour = a.hasTime ? dd.getUTCHours() : null;
      a.leadDays = a.booked != null ? Math.max(0, Math.floor((Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), dd.getUTCDate()) - Date.UTC(new Date(a.booked).getUTCFullYear(), new Date(a.booked).getUTCMonth(), new Date(a.booked).getUTCDate())) / DAY)) : null;
      a.date = new Date(a.t).toISOString().slice(0, 10);
      if (st === 'open') { if (a.t < today - DAY) { unknown++; return; } a.upcoming = true; }
      else a.outcome = st === 'attended' ? 0 : 1;
      list.push(a);
    });
    list.sort(function (x, y) { return x.t - y.t; });
    // customer history, using only earlier appointments (no peeking at the future)
    var hist = {};
    list.forEach(function (a) {
      var h = a.customer ? (hist[a.customer] = hist[a.customer] || { n: 0, ns: 0 }) : { n: 0, ns: 0 };
      a.priorCount = h.n; a.priorNoShows = h.ns;
      if (a.isNew == null && a.customer) a.derivedNew = h.n === 0;
      if (!a.upcoming && a.customer) { h.n++; h.ns += a.outcome; }
    });
    var past = list.filter(function (a) { return !a.upcoming; }), upcoming = list.filter(function (a) { return a.upcoming; });
    var ns = past.reduce(function (s, a) { return s + a.outcome; }, 0);
    list.forEach(function (a) { if (a.isNew == null && a.derivedNew != null) a.isNew = a.derivedNew; });
    return {
      past: past, upcoming: upcoming, skipped: skipped, cancelled: cancelled, unknown: unknown, noShows: ns, baseRate: past.length ? ns / past.length : 0,
      hasTime: past.some(function (a) { return a.hasTime; }), hasLead: past.some(function (a) { return a.leadDays != null; }), hasCustomer: !!map.customer,
      hasReminder: past.some(function (a) { return a.reminder != null; }), hasNew: past.some(function (a) { return a.isNew != null; }),
      hasService: !!map.service, hasChannel: !!map.channel, hasStaff: !!map.staff, order: order
    };
  }

  // ---------- rates by group ----------
  function wilson(k, n, z) {
    z = z || 1.96; if (!n) return [0, 1]; var p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), e = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return [Math.max(0, (c - e) / d), Math.min(1, (c + e) / d)];
  }
  function historyLabel(a) { return a.priorCount === 0 ? 'First visit' : a.priorNoShows === 0 ? 'Never missed before' : a.priorNoShows === 1 ? 'Missed once before' : 'Missed 2+ times before'; }
  var DIMS = {
    weekday: { label: 'Day of week', fn: function (a) { return a.weekday; }, order: WD.slice(1).concat(['Sunday']) },
    hour: { label: 'Time of day', fn: function (a) { return hourLabel(a.hour); }, sortNum: function (k) { var m = k.match(/(\d+)(am|pm)/); return m ? (+m[1] % 12) + (m[2] === 'pm' ? 12 : 0) : 99; } },
    lead: { label: 'Booked how far ahead', fn: function (a) { return leadBucket(a.leadDays); }, order: LEAD_ORDER },
    service: { label: 'Service', fn: function (a) { return a.service || 'Unspecified'; } },
    staff: { label: 'Staff member', fn: function (a) { return a.staff || 'Unspecified'; } },
    isNew: { label: 'New or returning', fn: function (a) { return a.isNew == null ? 'Unknown' : a.isNew ? 'New customer' : 'Returning customer'; } },
    reminder: { label: 'Reminder sent', fn: function (a) { return a.reminder == null ? 'Unknown' : a.reminder ? 'Reminder sent' : 'No reminder'; } },
    channel: { label: 'Booking channel', fn: function (a) { return a.channel || 'Unspecified'; } },
    history: { label: 'Customer history', fn: historyLabel, order: ['First visit', 'Never missed before', 'Missed once before', 'Missed 2+ times before'] }
  };
  function rateBy(appts, dim, minN) {
    var D = DIMS[dim], g = {}; minN = minN || 30;
    appts.forEach(function (a) { var k = D.fn(a); g[k] = g[k] || { key: k, n: 0, noShows: 0 }; g[k].n++; g[k].noShows += a.outcome; });
    var out = Object.keys(g).map(function (k) { var x = g[k], ci = wilson(x.noShows, x.n); x.rate = x.noShows / x.n; x.lo = ci[0]; x.hi = ci[1]; x.small = x.n < minN; return x; });
    if (D.order) out.sort(function (a, b) { var i = D.order.indexOf(a.key), j = D.order.indexOf(b.key); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j); });
    else if (D.sortNum) out.sort(function (a, b) { return D.sortNum(a.key) - D.sortNum(b.key); });
    else out.sort(function (a, b) { return b.n - a.n; });
    return out;
  }

  // ---------- logistic regression ----------
  function sigmoid(z) { return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)); }
  /* X: array of feature arrays (already standardised), y: 0/1. Batch gradient descent with L2 (bias not penalised). */
  function trainLogistic(X, y, opts) {
    opts = opts || {}; var lr = opts.lr || 0.3, iters = opts.iters || 600, lambda = opts.lambda == null ? 0.01 : opts.lambda;
    var n = X.length, d = n ? X[0].length : 0, w = new Array(d).fill(0), b = 0;
    var p0 = y.reduce(function (s, v) { return s + v; }, 0) / Math.max(1, n); b = Math.log(Math.max(1e-6, p0) / Math.max(1e-6, 1 - p0));
    for (var it = 0; it < iters; it++) {
      var gw = new Array(d).fill(0), gb = 0;
      for (var i = 0; i < n; i++) {
        var z = b, xi = X[i]; for (var j = 0; j < d; j++) z += w[j] * xi[j];
        var e = sigmoid(z) - y[i]; gb += e; for (j = 0; j < d; j++) gw[j] += e * xi[j];
      }
      b -= lr * gb / n; for (j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + lambda * w[j]);
    }
    return { w: w, b: b };
  }
  function predict(model, x) { var z = model.b; for (var j = 0; j < x.length; j++) z += model.w[j] * x[j]; return sigmoid(z); }
  function logLoss(p, y) { var s = 0; p.forEach(function (v, i) { v = Math.min(1 - 1e-9, Math.max(1e-9, v)); s -= y[i] ? Math.log(v) : Math.log(1 - v); }); return s / p.length; }
  // AUC = probability a random no-show gets a higher score than a random attended appointment (ties count half)
  function auc(scores, y) {
    var idx = scores.map(function (s, i) { return i; }).sort(function (a, b) { return scores[a] - scores[b]; });
    var ranks = new Array(scores.length), i = 0;
    while (i < idx.length) { var j = i; while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++; var r = (i + j) / 2 + 1; for (var k = i; k <= j; k++) ranks[idx[k]] = r; i = j + 1; }
    var pos = 0, neg = 0, rs = 0; y.forEach(function (v, i) { if (v) { pos++; rs += ranks[i]; } else neg++; });
    if (!pos || !neg) return null; return (rs - pos * (pos + 1) / 2) / (pos * neg);
  }
  function calibration(scores, y, bins) {
    bins = bins || 5; var idx = scores.map(function (s, i) { return i; }).sort(function (a, b) { return scores[a] - scores[b]; }), out = [];
    for (var b = 0; b < bins; b++) {
      var part = idx.slice(Math.floor(b * idx.length / bins), Math.floor((b + 1) * idx.length / bins)); if (!part.length) continue;
      var ps = 0, ys = 0; part.forEach(function (i) { ps += scores[i]; ys += y[i]; });
      out.push({ bin: b + 1, n: part.length, predicted: ps / part.length, actual: ys / part.length, from: scores[part[0]], to: scores[part[part.length - 1]] });
    }
    return out;
  }

  // Feature spec from training data: which columns become which inputs, with a plain-English reason for each.
  function featureSpec(train, info) {
    var base = info.baseRate, feats = [];
    function cats(fn, minN) { var c = {}; train.forEach(function (a) { var k = fn(a); if (k) c[k] = (c[k] || 0) + 1; }); var ks = Object.keys(c).filter(function (k) { return c[k] >= minN; }).sort(function (a, b) { return c[b] - c[a]; }); return ks.slice(1); }
    if (info.hasLead) feats.push({ id: 'lead', f: function (a) { return Math.log1p(a.leadDays == null ? 7 : a.leadDays); }, reason: function (a) { return a.leadDays == null ? null : 'Booked ' + a.leadDays + ' days ahead'; } });
    if (info.hasNew) feats.push({ id: 'new', f: function (a) { return a.isNew ? 1 : 0; }, reason: function (a) { return a.isNew ? 'New customer' : null; } });
    if (info.hasReminder) feats.push({ id: 'norem', f: function (a) { return a.reminder === false ? 1 : 0; }, reason: function (a) { return a.reminder === false ? 'No reminder sent yet' : null; } });
    if (info.hasCustomer) {
      feats.push({ id: 'prior', f: function (a) { return (a.priorNoShows + 2 * base) / (a.priorCount + 2); }, reason: function (a) { return a.priorNoShows ? 'Missed ' + a.priorNoShows + ' of ' + a.priorCount + ' past appointments' : null; } });
      feats.push({ id: 'visits', f: function (a) { return Math.log1p(a.priorCount); }, reason: function (a) { return a.priorCount === 0 ? 'No visit history' : null; } });
    }
    cats(function (a) { return a.weekday; }, 15).forEach(function (k) { feats.push({ id: 'wd:' + k, f: function (a) { return a.weekday === k ? 1 : 0; }, reason: function (a) { return a.weekday === k ? k + ' appointment' : null; } }); });
    if (info.hasTime) ['early', 'late morning', 'midday', 'afternoon', 'late afternoon'].slice(1).forEach(function (k) {
      feats.push({ id: 'tb:' + k, f: function (a) { return timeBand(a.hour) === k ? 1 : 0; }, reason: function (a) { return timeBand(a.hour) === k ? 'Time slot: ' + k : null; } });
    });
    if (info.hasTime) feats.push({ id: 'tb:early', f: function (a) { return timeBand(a.hour) === 'early' ? 1 : 0; }, reason: function (a) { return timeBand(a.hour) === 'early' ? 'Early slot (before 10am)' : null; } });
    if (info.hasService) cats(function (a) { return a.service; }, 20).forEach(function (k) { feats.push({ id: 'sv:' + k, f: function (a) { return a.service === k ? 1 : 0; }, reason: function (a) { return a.service === k ? 'Service: ' + k : null; } }); });
    if (info.hasChannel) cats(function (a) { return a.channel; }, 20).forEach(function (k) { feats.push({ id: 'ch:' + k, f: function (a) { return a.channel === k ? 1 : 0; }, reason: function (a) { return a.channel === k ? 'Booked via ' + k : null; } }); });
    // standardise
    feats.forEach(function (ft) {
      var v = train.map(ft.f), m = v.reduce(function (s, x) { return s + x; }, 0) / v.length, sd = Math.sqrt(v.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / v.length);
      ft.mean = m; ft.sd = sd || 1;
    });
    return feats.filter(function (ft) { return ft.sd > 1e-9; });
  }
  function vec(spec, a) { return spec.map(function (ft) { return (ft.f(a) - ft.mean) / ft.sd; }); }

  // Simple transparent score for small data: base rate × shrunk rate ratio of each factor.
  function pointsModel(past, info) {
    var base = info.baseRate || 0.01, dims = ['weekday', 'lead', 'isNew', 'reminder', 'channel', 'service', 'history'].filter(function (d) {
      return (d !== 'lead' || info.hasLead) && (d !== 'isNew' || info.hasNew) && (d !== 'reminder' || info.hasReminder) && (d !== 'channel' || info.hasChannel) && (d !== 'service' || info.hasService) && (d !== 'history' || info.hasCustomer);
    });
    var tables = {}; dims.forEach(function (d) { tables[d] = {}; rateBy(past, d, 1).forEach(function (g) { tables[d][g.key] = ((g.noShows + 20 * base) / (g.n + 20)) / base; }); });
    return {
      type: 'points', dims: dims,
      score: function (a) {
        var p = base, reasons = [];
        dims.forEach(function (d) { var k = DIMS[d].fn(a), r = tables[d][k]; if (r == null) return; p *= r; if (r >= 1.2) reasons.push({ text: DIMS[d].label + ': ' + k, weight: Math.log(r) }); });
        reasons.sort(function (x, y) { return y.weight - x.weight; });
        return { p: Math.min(0.95, p), reasons: reasons.slice(0, 3).map(function (r) { return r.text; }) };
      }
    };
  }
  /* Train + evaluate. Returns {type:'logistic'|'points', test:{auc, n, calibration}, score(appt)->{p, reasons}, warnings:[]} */
  function buildModel(info, opts) {
    opts = opts || {};
    var past = info.past, warnings = [], minN = opts.minN || 150, minNs = opts.minNoShows || 15;
    if (past.length < 30 || info.noShows < 3) {
      return { type: 'none', warnings: ['Only ' + past.length + ' past appointments with ' + info.noShows + ' no-shows — not enough to find patterns yet. Keep recording outcomes and come back after a few months.'], score: function () { return { p: info.baseRate, reasons: [] }; } };
    }
    if (past.length < minN || info.noShows < minNs) {
      warnings.push('Small history (' + past.length + ' appointments, ' + info.noShows + ' no-shows), so this uses a simple rate-based score instead of a trained model. Treat it as a rough guide.');
      var pm = pointsModel(past, info);
      var split0 = Math.floor(past.length * 0.75), pmTrain = pointsModel(past.slice(0, split0), Object.assign({}, info, { baseRate: rate(past.slice(0, split0)) })), te0 = past.slice(split0);
      var sc0 = te0.map(function (a) { return pmTrain.score(a).p; }), y0 = te0.map(function (a) { return a.outcome; });
      pm.test = { n: te0.length, auc: auc(sc0, y0), calibration: calibration(sc0, y0, 3) }; pm.warnings = warnings; return pm;
    }
    var split = Math.floor(past.length * 0.75), train = past.slice(0, split), test = past.slice(split);
    var tinfo = Object.assign({}, info, { baseRate: rate(train) });
    var spec = featureSpec(train, tinfo), model = trainLogistic(train.map(function (a) { return vec(spec, a); }), train.map(function (a) { return a.outcome; }), opts);
    var ts = test.map(function (a) { return predict(model, vec(spec, a)); }), ty = test.map(function (a) { return a.outcome; });
    var testAuc = auc(ts, ty);
    if (testAuc != null && testAuc < 0.6) warnings.push('The model only ranks risk slightly better than chance on recent appointments (AUC ' + testAuc.toFixed(2) + '). Your no-shows may be mostly random — use the rates by group rather than individual scores.');
    // final model on all past appointments
    var fspec = featureSpec(past, info), fmodel = trainLogistic(past.map(function (a) { return vec(fspec, a); }), past.map(function (a) { return a.outcome; }), opts);
    return {
      type: 'logistic', warnings: warnings, spec: fspec, model: fmodel,
      test: { n: test.length, noShows: ty.reduce(function (s, v) { return s + v; }, 0), auc: testAuc, logLoss: logLoss(ts, ty), calibration: calibration(ts, ty, 5) },
      weights: fspec.map(function (ft, i) { return { id: ft.id, w: fmodel.w[i] }; }).sort(function (a, b) { return Math.abs(b.w) - Math.abs(a.w); }),
      score: function (a) {
        var x = vec(fspec, a), p = predict(fmodel, x), reasons = [];
        fspec.forEach(function (ft, i) { var c = fmodel.w[i] * x[i], r = ft.reason(a); if (c > 0.12 && r) reasons.push({ text: r, c: c }); });
        reasons.sort(function (u, v) { return v.c - u.c; });
        return { p: p, reasons: reasons.slice(0, 3).map(function (r) { return r.text; }) };
      }
    };
  }
  function rate(list) { return list.length ? list.reduce(function (s, a) { return s + a.outcome; }, 0) / list.length : 0; }
  function riskLevel(p, base) { var hi = Math.max(0.25, 2 * base), med = Math.max(0.12, 1.3 * base); return p >= hi ? 'High' : p >= med ? 'Medium' : 'Low'; }

  // Distribution of how many of these appointments are missed (Poisson-binomial), P[k] = chance exactly k miss.
  function missDistribution(ps) { var d = [1]; ps.forEach(function (p) { var n = new Array(d.length + 1).fill(0); d.forEach(function (v, k) { n[k] += v * (1 - p); n[k + 1] += v * p; }); d = n; }); return d; }
  // Largest k with P(at least k no-shows) >= confidence -> overbooking k slots leaves a clash risk of at most 1 - confidence.
  function overbook(ps, confidence) {
    confidence = confidence == null ? 0.8 : confidence; var d = missDistribution(ps), tail = 1, k = 0;
    for (var i = 1; i < d.length; i++) { tail -= d[i - 1]; if (tail >= confidence - 1e-12) k = i; else break; }
    return k;
  }
  function byDay(scored, confidence) {
    var g = {}; scored.forEach(function (s) { (g[s.appt.date] = g[s.appt.date] || []).push(s); });
    return Object.keys(g).sort().map(function (d) {
      var ps = g[d].map(function (s) { return s.p; }), exp = ps.reduce(function (a, b) { return a + b; }, 0), k = overbook(ps, confidence), dist = missDistribution(ps);
      var clash = 0; for (var i = 0; i < k; i++) clash += dist[i];
      return { date: d, weekday: WD[new Date(d + 'T00:00:00Z').getUTCDay()], n: ps.length, expected: exp, overbook: k, clashRisk: k ? clash : 0, high: g[d].filter(function (s) { return s.level === 'High'; }).length };
    });
  }

  /* Plain-English recommendations backed by the data. Returns [{title, text, strength}] */
  function recommendations(info, opts) {
    opts = opts || {}; var past = info.past, base = info.baseRate, recs = [], value = opts.value || 0;
    function find(dim, key) { return rateBy(past, dim, 1).filter(function (g) { return g.key === key; })[0]; }
    function pct(x) { return Math.round(x * 1000) / 10 + '%'; }
    if (info.hasReminder) {
      var y = find('reminder', 'Reminder sent'), n = find('reminder', 'No reminder');
      if (y && n && y.n >= 30 && n.n >= 30 && n.rate > y.rate * 1.2) recs.push({ title: 'Remind everyone — and twice for high-risk bookings', strength: n.rate - y.rate,
        text: 'Without a reminder ' + pct(n.rate) + ' of appointments were missed, with one ' + pct(y.rate) + '. ' + n.n + ' appointments had no reminder. Send an SMS 24–48 hours before, and a second one 2–3 hours before for anything scored high risk.' });
    }
    if (info.hasLead) {
      var r = rateBy(past, 'lead', 1), far = r.filter(function (g) { return /15–30|31\+/.test(g.key); }), near = r.filter(function (g) { return /Same|1–2|3–7/.test(g.key); });
      var fn = far.reduce(function (s, g) { return s + g.n; }, 0), fk = far.reduce(function (s, g) { return s + g.noShows; }, 0), nn = near.reduce(function (s, g) { return s + g.n; }, 0), nk = near.reduce(function (s, g) { return s + g.noShows; }, 0);
      if (fn >= 30 && nn >= 30 && fk / fn > 1.4 * nk / nn) recs.push({ title: 'Ask far-ahead bookings to confirm', strength: fk / fn - nk / nn,
        text: 'Bookings made 15+ days ahead were missed ' + pct(fk / fn) + ' of the time, versus ' + pct(nk / nn) + ' for bookings within a week. Send a "reply YES to keep your spot" message 48 hours before and release unconfirmed slots to a waitlist.' });
    }
    if (info.hasNew) {
      var nw = find('isNew', 'New customer'), rt = find('isNew', 'Returning customer');
      if (nw && rt && nw.n >= 20 && rt.n >= 30 && nw.rate > 1.4 * rt.rate) recs.push({ title: 'Take a deposit or card on file for first visits', strength: nw.rate - rt.rate,
        text: 'New customers missed ' + pct(nw.rate) + ' of appointments, returning customers ' + pct(rt.rate) + '. A small deposit (for example 20–50% of the fee, refundable with 24 hours notice) for first visits usually cuts this sharply.' });
    }
    if (info.hasCustomer) {
      var cust = {}; past.forEach(function (a) { if (!a.customer) return; var c = cust[a.customer] = cust[a.customer] || { customer: a.customer, n: 0, ns: 0 }; c.n++; c.ns += a.outcome; });
      var rep = Object.keys(cust).map(function (k) { return cust[k]; }).filter(function (c) { return c.ns >= 2 && c.ns / c.n >= 0.4; }).sort(function (a, b) { return b.ns - a.ns; });
      if (rep.length) recs.push({ title: rep.length + ' customer' + (rep.length > 1 ? 's' : '') + ' with repeated missed appointments', strength: 0.5, customers: rep.slice(0, 20),
        text: 'These customers missed at least 2 appointments and at least 40% of their bookings. There may be good reasons — have a friendly chat first, then consider prepayment or a short-notice booking only policy for them.' });
    }
    var wd = rateBy(past, 'weekday', 30).filter(function (g) { return !g.small; }).sort(function (a, b) { return b.rate - a.rate; })[0];
    if (wd && wd.rate > 1.3 * base) recs.push({ title: 'Overbook or keep a waitlist for ' + wd.key + 's', strength: wd.rate - base,
      text: wd.key + ' appointments are missed ' + pct(wd.rate) + ' of the time (overall ' + pct(base) + '). Use the day planner below to see how many extra bookings are reasonably safe.' });
    if (info.hasChannel) {
      var ch = rateBy(past, 'channel', 30).filter(function (g) { return !g.small; }).sort(function (a, b) { return b.rate - a.rate; });
      if (ch.length > 1 && ch[0].rate > 1.3 * ch[ch.length - 1].rate) recs.push({ title: 'Tighten ' + ch[0].key + ' bookings', strength: ch[0].rate - ch[ch.length - 1].rate,
        text: ch[0].key + ' bookings are missed ' + pct(ch[0].rate) + ' of the time versus ' + pct(ch[ch.length - 1].rate) + ' for ' + ch[ch.length - 1].key + '. Require a mobile number and SMS confirmation for that channel, or add a card-on-file step.' });
    }
    recs.sort(function (a, b) { return b.strength - a.strength; });
    if (value > 0 && past.length) {
      var span = (past[past.length - 1].t - past[0].t) / DAY / 30.44 || 1;
      recs.push({ title: 'What no-shows cost you', strength: 0, text: 'About ' + Math.round(info.noShows / span) + ' missed appointments a month — roughly $' + Math.round(info.noShows / span * value).toLocaleString('en-AU') + ' a month in empty time at $' + value + ' each. Cutting no-shows by a third would recover about $' + Math.round(info.noShows / span * value / 3).toLocaleString('en-AU') + ' a month.' });
    }
    return recs;
  }

  // ---------- .ics for reminder follow-ups ----------
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function ics(events) {
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Brahaspati//No-show Predictor//EN', 'CALSCALE:GREGORIAN'];
    events.forEach(function (e, i) {
      var d = new Date(e.t), p = function (n) { return (n < 10 ? '0' : '') + n; };
      var dt = d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + '00';
      lines.push('BEGIN:VEVENT', 'UID:noshow-' + e.t + '-' + i + '@brahaspati', 'DTSTAMP:' + stamp, 'DTSTART:' + dt, 'DURATION:PT10M', 'SUMMARY:' + icsEscape(e.summary), 'DESCRIPTION:' + icsEscape(e.description || ''), 'END:VEVENT');
    });
    lines.push('END:VCALENDAR'); return lines.join('\r\n') + '\r\n';
  }

  // ---------- sample data (made up: a physio & massage clinic, Jan–Oct history + next two weeks booked) ----------
  function sampleData(todayIso) {
    var R = rng(4242), today = Date.parse((todayIso || '2026-11-08') + 'T00:00:00Z');
    var start = today - 280 * DAY, end = today + 14 * DAY;
    var services = [{ n: 'Initial consult', w: 0.18, eff: 0.25, len: 60 }, { n: 'Follow-up', w: 0.45, eff: 0, len: 30 }, { n: 'Remedial massage', w: 0.25, eff: 0.2, len: 60 }, { n: 'Clinical Pilates', w: 0.12, eff: -0.3, len: 45 }];
    var staff = ['Priya', 'Tom', 'Mei', 'Jack'], customers = [];
    for (var c = 0; c < 320; c++) customers.push({ id: 'C' + (1001 + c), flaky: R() < 0.08 ? 2.1 : R() < 0.15 ? 0.7 : 0, visits: 0, online: R() < 0.5 });
    function pick(arr) { return arr[Math.floor(R() * arr.length)]; }
    var rows = [], id = 5001;
    for (var day = start; day < end; day += DAY) {
      var wd = new Date(day).getUTCDay(); if (wd === 0) continue;
      var slots = wd === 6 ? 10 : 22;
      for (var s = 0; s < slots; s++) {
        if (R() < 0.12) continue;
        var hour = wd === 6 ? 8 + Math.floor(s / 2) : 8 + Math.floor(s / 2.2), minute = R() < 0.5 ? 0 : 30;
        var u = R(), sv = services[0], acc = 0; for (var k = 0; k < services.length; k++) { acc += services[k].w; if (u <= acc) { sv = services[k]; break; } }
        var cu = R() < 0.25 ? customers[Math.floor(R() * customers.length)] : customers[Math.floor(Math.pow(R(), 1.6) * customers.length)];
        var isNew = cu.visits === 0; if (isNew) sv = R() < 0.7 ? services[0] : sv;
        var leadDays = Math.min(60, Math.floor(-Math.log(1 - R()) * (sv.n === 'Clinical Pilates' ? 9 : 6)));
        var channel = cu.online ? (R() < 0.85 ? 'Online' : 'Phone') : (R() < 0.8 ? 'Phone' : 'Walk-in');
        var reminder = R() < 0.72;
        var t = day + hour * 3600000 + minute * 60000;
        var booked = t - leadDays * DAY - Math.floor(R() * 8) * 3600000;
        var z = -2.9 + (isNew ? 0.75 : 0) + (reminder ? -0.85 : 0) + (leadDays > 14 ? 0.7 : leadDays > 7 ? 0.3 : leadDays < 1 ? -0.4 : 0) +
          (wd === 1 ? 0.35 : wd === 5 && hour >= 14 ? 0.45 : 0) + (hour < 9 ? 0.3 : 0) + (channel === 'Online' ? 0.35 : channel === 'Walk-in' ? -0.5 : 0) + sv.eff + cu.flaky;
        var p = 1 / (1 + Math.exp(-z)), status;
        if (t >= today) status = 'Booked';
        else { var v = R(); status = v < p ? (R() < 0.8 ? 'No-show' : 'Cancelled (late)') : v < p + 0.04 ? 'Cancelled' : 'Completed'; }
        if (t >= today && R() < 0.4) reminder = false;
        cu.visits++;
        var dt = new Date(t), bk = new Date(booked), pad = function (n) { return (n < 10 ? '0' : '') + n; };
        rows.push({ 'Appointment ID': 'A' + (id++), 'Booked on': bk.toISOString().slice(0, 10) + ' ' + pad(bk.getUTCHours()) + ':' + pad(bk.getUTCMinutes()),
          'Appointment date': dt.toISOString().slice(0, 10), 'Start time': pad(dt.getUTCHours()) + ':' + pad(dt.getUTCMinutes()), 'Client ID': cu.id, Service: sv.n,
          Practitioner: pick(staff), 'Booking channel': channel, 'Reminder sent': reminder ? 'Yes' : 'No', 'Client type': isNew ? 'New' : 'Returning', Status: status });
      }
    }
    return { headers: ['Appointment ID', 'Booked on', 'Appointment date', 'Start time', 'Client ID', 'Service', 'Practitioner', 'Booking channel', 'Reminder sent', 'Client type', 'Status'], rows: rows };
  }

  var L = {
    FIELDS: FIELDS, DIMS: DIMS, WD: WD, rng: rng, guessColumns: guessColumns, detectColumns: detectColumns, parseDateTime: parseDateTime, parseTime: parseTime,
    status: status, yesNo: yesNo, leadBucket: leadBucket, hourLabel: hourLabel, prepare: prepare, rateBy: rateBy, wilson: wilson,
    sigmoid: sigmoid, trainLogistic: trainLogistic, predict: predict, auc: auc, calibration: calibration, logLoss: logLoss, buildModel: buildModel,
    riskLevel: riskLevel, missDistribution: missDistribution, overbook: overbook, byDay: byDay, recommendations: recommendations, ics: ics, sampleData: sampleData
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.NoShowLib = L;
})(this);
