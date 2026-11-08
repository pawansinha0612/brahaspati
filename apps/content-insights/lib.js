/* Content Insights — pure analysis of Facebook / YouTube analytics exports. No DOM.
   Browser: window.InsightsLib. Node: require('./lib.js'). */
(function (root) {
  'use strict';

  // ---------- column detection ----------
  // Each field lists header patterns (tested against a normalised header: lower case, punctuation -> space).
  // Order matters: earlier patterns win, and a header is only used once.
  var FIELDS = [
    { key: 'title', label: 'Title', pats: [/^video title$/, /^title$/, /^content$/, /^post title$/, /^name$/, /title/] },
    { key: 'description', label: 'Description / caption', pats: [/^description$/, /^caption$/, /^message$/, /^post message$/, /description/] },
    { key: 'published', label: 'Publish time', pats: [/^video publish time$/, /^publish time$/, /^published$/, /^publish date$/, /^date published$/, /^created time$/, /^posted$/, /publish/, /^date$/] },
    { key: 'views', label: 'Views', pats: [/^views$/, /^video views$/, /^plays$/, /^3 second video views$/, /^total views$/, /\bviews$/] },
    { key: 'reach', label: 'Reach', pats: [/^reach$/, /^post reach$/, /^accounts reached$/, /reach/] },
    { key: 'impressions', label: 'Impressions', pats: [/^impressions$/, /^post impressions$/] },
    { key: 'avgViewSec', label: 'Average view duration', pats: [/^average view duration$/, /^average seconds viewed$/, /^avg view duration$/, /^average watch time$/, /average.*(duration|seconds viewed|watch time)/] },
    { key: 'avgPct', label: 'Average % viewed', pats: [/^average percentage viewed( %)?$/, /^average percentage viewed/, /^avg percentage viewed/, /percentage viewed/, /completion rate/] },
    { key: 'likes', label: 'Likes / reactions', pats: [/^likes$/, /^reactions$/, /^post reactions$/, /^likes and reactions$/] },
    { key: 'shares', label: 'Shares', pats: [/^shares$/, /^post shares$/] },
    { key: 'comments', label: 'Comments', pats: [/^comments$/, /^comments added$/, /^post comments$/] },
    { key: 'duration', label: 'Video length', pats: [/^duration$/, /^duration sec$/, /^duration seconds$/, /^video length$/, /^length$/, /^video duration/] },
    { key: 'watchHours', label: 'Watch time (hours)', pats: [/^watch time hours$/, /^watch time$/] }
  ];
  function normHeader(h) { return String(h || '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function detectColumns(headers) {
    var used = {}, map = {}, norm = headers.map(normHeader);
    FIELDS.forEach(function (f) {
      for (var p = 0; p < f.pats.length && !map[f.key]; p++) {
        for (var i = 0; i < norm.length; i++) {
          if (!used[i] && f.pats[p].test(norm[i])) {
            // "Reactions, Comments and Shares" is a combined column, not likes/comments/shares
            if (/ and /.test(norm[i]) && /(comments|shares)/.test(norm[i]) && f.key !== 'likes') continue;
            if (f.key === 'likes' && /comments/.test(norm[i])) continue;
            map[f.key] = headers[i]; used[i] = true; break;
          }
        }
      }
    });
    return map;
  }
  function detectPlatform(headers) {
    var n = headers.map(normHeader).join('|');
    if (/video publish time|average percentage viewed|comments added|watch time hours|impressions click/.test(n)) return 'youtube';
    if (/reach|reactions|permalink|page name|post id|seconds viewed/.test(n)) return 'facebook';
    return 'other';
  }

  // ---------- value parsing ----------
  function toNum(v) {
    if (typeof v === 'number') return v;
    var s = String(v == null ? '' : v).trim(); if (!s || s === '-' || s === '—') return NaN;
    var k = /([\d.]+)\s*k$/i.exec(s); if (k) return parseFloat(k[1]) * 1000;
    var m = /([\d.]+)\s*m$/i.exec(s); if (m) return parseFloat(m[1]) * 1e6;
    s = s.replace(/[%\s]/g, '').replace(/,(?=\d{3}\b)/g, '');
    var n = parseFloat(s.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? NaN : n;
  }
  // "0:00:35", "1:05", "35", "35s", "1m 5s", "PT1M5S" -> seconds
  function toSeconds(v) {
    if (typeof v === 'number') return v;
    var s = String(v == null ? '' : v).trim(); if (!s) return NaN;
    var m;
    if ((m = /^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(s))) return +m[1] * 3600 + +m[2] * 60 + +m[3];
    if ((m = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(s))) return +m[1] * 60 + +m[2];
    if ((m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(s))) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
    if (/[hms]/i.test(s) && /\d/.test(s)) {
      var t = 0, any = false; s.replace(/(\d+(?:\.\d+)?)\s*(h|m|s)/gi, function (x, n, u) { any = true; t += +n * ({ h: 3600, m: 60, s: 1 })[u.toLowerCase()]; });
      if (any) return t;
    }
    return toNum(s);
  }
  // Work out whether slash dates are day-first or month-first from the whole column.
  function dateOrder(values, fallback) {
    var dmy = 0, mdy = 0;
    values.forEach(function (v) {
      var m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-]\d{2,4}/.exec(String(v || '').trim()); if (!m) return;
      if (+m[1] > 12) dmy++; else if (+m[2] > 12) mdy++;
    });
    return dmy > mdy ? 'dmy' : mdy > dmy ? 'mdy' : (fallback || 'dmy');
  }
  var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  // Returns a Date in local-free form: we keep wall-clock values in UTC fields so weekday/hour match the export.
  function toDateTime(v, order) {
    var s = String(v == null ? '' : v).trim(); if (!s) return null; var m, y, mo, d, hh = 0, mi = 0;
    var time = /(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i.exec(s);
    if (time) { hh = +time[1]; mi = +time[2]; if (time[3]) { var pm = /pm/i.test(time[3]); if (pm && hh < 12) hh += 12; if (!pm && hh === 12) hh = 0; } }
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) { y = +m[1]; mo = +m[2] - 1; d = +m[3]; }
    else if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s))) {
      y = +m[3]; if (y < 100) y += 2000;
      if (order === 'mdy') { mo = +m[1] - 1; d = +m[2]; } else { d = +m[1]; mo = +m[2] - 1; }
    } else if ((m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i.exec(s)) && MONTHS[m[1].toLowerCase()] != null) { mo = MONTHS[m[1].toLowerCase()]; d = +m[2]; y = +m[3]; }
    else if ((m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})/i.exec(s)) && MONTHS[m[2].toLowerCase()] != null) { d = +m[1]; mo = MONTHS[m[2].toLowerCase()]; y = +m[3]; }
    else return null;
    var dt = new Date(Date.UTC(y, mo, d, hh, mi)); return isNaN(dt) ? null : dt;
  }

  // ---------- rows -> posts ----------
  function normalise(rows, map, opts) {
    opts = opts || {};
    var order = map.published ? dateOrder(rows.map(function (r) { return r[map.published]; }), opts.platform === 'facebook' ? 'mdy' : 'dmy') : 'dmy';
    var hasTime = false;
    var posts = [];
    rows.forEach(function (r) {
      var title = map.title ? String(r[map.title] || '').trim() : '';
      var desc = map.description ? String(r[map.description] || '').trim() : '';
      var firstCell = String(r[Object.keys(r)[0]] || '').trim();
      if (/^totals?$/i.test(title) || /^totals?$/i.test(firstCell)) return; // YouTube's summary row
      var p = { title: title || desc.slice(0, 90), description: desc, platform: opts.platform || 'other' };
      ['views', 'reach', 'impressions', 'likes', 'shares', 'comments', 'watchHours'].forEach(function (k) { p[k] = map[k] ? toNum(r[map[k]]) : NaN; });
      p.avgViewSec = map.avgViewSec ? toSeconds(r[map.avgViewSec]) : NaN;
      p.avgPct = map.avgPct ? toNum(r[map.avgPct]) : NaN;
      p.duration = map.duration ? toSeconds(r[map.duration]) : NaN;
      if (isNaN(p.views) && !isNaN(p.reach)) p.views = p.reach; // Facebook exports sometimes only have reach
      if (isNaN(p.avgPct) && p.avgViewSec > 0 && p.duration > 0) p.avgPct = Math.min(100, p.avgViewSec / p.duration * 100);
      if (map.published && /\d:\d{2}/.test(String(r[map.published] || ''))) hasTime = true;
      p.published = map.published ? toDateTime(r[map.published], order) : null;
      if (!p.title && isNaN(p.views)) return;
      posts.push(p);
    });
    var latest = posts.reduce(function (mx, p) { return p.published && p.published > mx ? p.published : mx; }, new Date(0));
    var asOf = opts.asOf || (latest.getTime() > 0 ? new Date(latest.getTime() + 86400000) : new Date());
    posts.forEach(function (p) {
      p.days = p.published ? Math.max(1, Math.round((asOf - p.published) / 86400000)) : null;
      var interactions = (p.likes || 0) + (p.shares || 0) + (p.comments || 0);
      var base = p.views > 0 ? p.views : p.reach;
      p.engagement = base > 0 ? interactions / base : NaN;
      p.hasTime = hasTime;
    });
    return { posts: posts, dateOrder: order, hasTime: hasTime, asOf: asOf };
  }

  // ---------- metrics ----------
  var METRICS = {
    views: { label: 'Views', get: function (p) { return p.views; } },
    engagement: { label: 'Engagement rate', get: function (p) { return p.engagement; }, pct: true },
    shares: { label: 'Shares', get: function (p) { return p.shares; } },
    avgPct: { label: 'Average % viewed', get: function (p) { return p.avgPct; }, pctNum: true },
    avgViewSec: { label: 'Average view duration (s)', get: function (p) { return p.avgViewSec; } },
    likes: { label: 'Likes / reactions', get: function (p) { return p.likes; } },
    comments: { label: 'Comments', get: function (p) { return p.comments; } }
  };
  var RATE_METRICS = { engagement: 1, avgPct: 1, avgViewSec: 1 };
  function metric(p, key, perDay) {
    var v = METRICS[key].get(p);
    if (perDay && !RATE_METRICS[key] && p.days) v = v / p.days;
    return v;
  }
  function available(posts) {
    return Object.keys(METRICS).filter(function (k) { return posts.filter(function (p) { var v = METRICS[k].get(p); return isFinite(v); }).length >= Math.min(3, posts.length); });
  }
  function avg(arr) { var a = arr.filter(isFinite); return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : NaN; }
  function median(arr) { var a = arr.filter(isFinite).sort(function (x, y) { return x - y; }); if (!a.length) return NaN; var m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
  function quantile(arr, q) { var a = arr.filter(isFinite).sort(function (x, y) { return x - y; }); if (!a.length) return NaN; var i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); }

  function rank(posts, key, perDay, n) {
    var list = posts.map(function (p) { return { post: p, value: metric(p, key, perDay) }; }).filter(function (x) { return isFinite(x.value); })
      .sort(function (a, b) { return b.value - a.value; });
    n = n || 5;
    return { top: list.slice(0, n), bottom: list.slice(-Math.min(n, Math.max(0, list.length - n))).reverse(), all: list };
  }
  function summary(posts) {
    var tv = posts.reduce(function (s, p) { return s + (p.views || 0); }, 0);
    return { posts: posts.length, totalViews: tv, medianViews: median(posts.map(function (p) { return p.views; })),
      avgEngagement: avg(posts.map(function (p) { return p.engagement; })), avgPct: avg(posts.map(function (p) { return p.avgPct; })),
      avgDuration: avg(posts.map(function (p) { return p.duration; })) };
  }

  // ---------- groupings ----------
  var BUCKETS = [[0, 15, '0–15 s'], [15, 30, '16–30 s'], [30, 60, '31–60 s'], [60, 90, '61–90 s'], [90, 180, '1.5–3 min'], [180, 600, '3–10 min'], [600, Infinity, '10 min +']];
  function bucketOf(sec) { if (!isFinite(sec)) return null; for (var i = 0; i < BUCKETS.length; i++) if (sec <= BUCKETS[i][1] && (sec > BUCKETS[i][0] || i === 0)) return BUCKETS[i][2]; return null; }
  function groupBy(posts, keyFn, mKey, perDay, orderList) {
    var g = {};
    posts.forEach(function (p) {
      [].concat(keyFn(p)).forEach(function (k) { if (k == null) return; (g[k] = g[k] || []).push(metric(p, mKey, perDay)); });
    });
    var overall = avg(posts.map(function (p) { return metric(p, mKey, perDay); }));
    var keys = orderList ? orderList.filter(function (k) { return g[k]; }) : Object.keys(g);
    return keys.map(function (k) { var a = avg(g[k]); return { key: k, count: g[k].length, avg: a, median: median(g[k]), lift: overall ? a / overall : NaN }; });
  }
  function byDuration(posts, mKey, perDay) { return groupBy(posts, function (p) { return bucketOf(p.duration); }, mKey, perDay, BUCKETS.map(function (b) { return b[2]; })); }
  var DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function byDay(posts, mKey, perDay) { return groupBy(posts, function (p) { return p.published ? DOW[p.published.getUTCDay()] : null; }, mKey, perDay, DOW.slice(1).concat(['Sunday'])); }
  var HOURS = ['Early morning (5–9)', 'Late morning (9–12)', 'Afternoon (12–17)', 'Evening (17–21)', 'Night (21–5)'];
  function hourBand(h) { return h >= 5 && h < 9 ? HOURS[0] : h >= 9 && h < 12 ? HOURS[1] : h >= 12 && h < 17 ? HOURS[2] : h >= 17 && h < 21 ? HOURS[3] : HOURS[4]; }
  function byHour(posts, mKey, perDay) { return groupBy(posts.filter(function (p) { return p.hasTime; }), function (p) { return p.published ? hourBand(p.published.getUTCHours()) : null; }, mKey, perDay, HOURS); }

  // ---------- hook patterns ----------
  var EMO = ['mother', 'mom', 'mum', 'maa', 'mummy', 'father', 'dad', 'papa', 'baba', 'son', 'daughter', 'beti', 'beta', 'wife', 'husband', 'sister', 'brother', 'bhai', 'grandma', 'grandpa', 'dadi', 'nani',
    'cry', 'cried', 'crying', 'tears', 'heart', 'heartbreaking', 'love', 'alone', 'lonely', 'sacrifice', 'betrayed', 'betrayal', 'forgive', 'sorry', 'last', 'never', 'forever', 'miss', 'pain', 'hurt',
    'emotional', 'secret', 'truth', 'goodbye', 'proud', 'shocking', 'shocked', 'poor', 'rich', 'orphan', 'hospital', 'died', 'death', 'wedding', 'promise'];
  var PATTERNS = [
    { id: 'question', phrase: 'ask a question', label: 'Asks a question', test: function (t) { return /\?/.test(t) || /^(why|what|how|who|would|could|can|did|do|does|is|are|will)\b/i.test(t); } },
    { id: 'number', phrase: 'include a number', label: 'Has a number', test: function (t) { return /\d/.test(t); } },
    { id: 'when', phrase: 'start with “When…”', label: 'Starts with “When…”', test: function (t) { return /^when\b/i.test(t); } },
    { id: 'my', phrase: 'start with “My…”', label: 'Starts with “My…”', test: function (t) { return /^my\b/i.test(t); } },
    { id: 'this', phrase: 'start with “This…”', label: 'Starts with “This…”', test: function (t) { return /^this\b/i.test(t); } },
    { id: 'pov', phrase: 'use POV or “you”', label: 'POV / you', test: function (t) { return /\bpov\b/i.test(t) || /\byou(r)?\b/i.test(t); } },
    { id: 'emotional', phrase: 'use an emotional word', label: 'Emotional word', test: function (t) { var w = words(t); return w.some(function (x) { return EMO.indexOf(x) >= 0; }); } },
    { id: 'ellipsis', phrase: 'end on a cliffhanger', label: 'Ends on a cliffhanger (… or “wait”)', test: function (t) { return /(\.\.\.|…)/.test(t) || /\bwait\b|\bend(ing)?\b/i.test(t); } },
    { id: 'caps', phrase: 'have a word in capitals', label: 'Word in CAPITALS', test: function (t) { return /\b[A-Z]{3,}\b/.test(t.replace(/\bPOV\b|\bAI\b/g, '')); } },
    { id: 'emoji', phrase: 'have an emoji', label: 'Has an emoji', test: function (t) { return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t); } },
    { id: 'hindi', phrase: 'use Hindi script', label: 'Hindi / Devanagari', test: function (t) { return /[\u0900-\u097F]/.test(t); } },
    { id: 'short', phrase: 'are short (6 words or fewer)', label: 'Short title (≤ 6 words)', test: function (t) { return words(t).length > 0 && words(t).length <= 6; } }
  ];
  function words(t) { return String(t || '').toLowerCase().match(/[\p{L}\p{N}']+/gu) || []; }
  function patternsOf(title) { return PATTERNS.filter(function (p) { return p.test(String(title || '').trim()); }).map(function (p) { return p.id; }); }
  function hooks(posts, mKey, perDay) {
    var res = groupBy(posts, function (p) { return patternsOf(p.title); }, mKey, perDay, PATTERNS.map(function (p) { return p.id; }));
    var none = posts.filter(function (p) { return !patternsOf(p.title).length; });
    res.forEach(function (r) { var P = PATTERNS.filter(function (p) { return p.id === r.key; })[0]; r.label = P.label; r.phrase = P.phrase; });
    var first = groupBy(posts, function (p) { var w = words(p.title)[0]; return w || null; }, mKey, perDay).filter(function (r) { return r.count >= 2; })
      .sort(function (a, b) { return b.avg - a.avg; });
    return { patterns: res.sort(function (a, b) { return b.lift - a.lift; }), firstWords: first, plain: none.length };
  }

  // ---------- keywords (TF-IDF-ish) ----------
  var STOP = ('a an the and or but if of to in on at by for with from as is are was were be been being it its this that these those i me my we our you your he him his she her they them their ' +
    'what which who whom when where why how not no so too very can will just do does did done have has had into out up down over under again then once here there all any both each few more most ' +
    'other some such only own same than s t don should now video videos shorts short reel reels part full new official watch story ka ki ke ko hai hain se ne mein me aur bhi ek yeh woh kya tha thi the').split(' ');
  function keywords(posts, mKey, perDay, opts) {
    opts = opts || {}; var minDf = opts.minDf || 2, N = posts.length || 1, df = {}, vals = {};
    posts.forEach(function (p) {
      var seen = {};
      words(p.title + ' ' + (p.description || '')).forEach(function (w) {
        if (w.length < 3 || STOP.indexOf(w) >= 0 || /^\d+$/.test(w) || seen[w]) return; seen[w] = 1;
        df[w] = (df[w] || 0) + 1; (vals[w] = vals[w] || []).push(metric(p, mKey, perDay));
      });
    });
    var overall = avg(posts.map(function (p) { return metric(p, mKey, perDay); }));
    return Object.keys(df).filter(function (w) { return df[w] >= minDf && df[w] < N; }).map(function (w) {
      var a = avg(vals[w]), idf = Math.log(N / df[w]);
      return { word: w, count: df[w], avg: a, lift: overall ? a / overall : NaN, score: (overall ? a / overall : 1) * Math.log(1 + df[w]) * (0.5 + idf) };
    }).sort(function (a, b) { return b.score - a.score; });
  }

  // ---------- recommendations ----------
  function fmtN(n) { if (!isFinite(n)) return '–'; if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M'; if (Math.abs(n) >= 1e4) return Math.round(n / 1000) + 'k'; if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'k'; return Math.abs(n) < 10 ? n.toFixed(2).replace(/\.?0+$/, '') : String(Math.round(n)); }
  function fmtM(n, key) { return METRICS[key].pct ? (n * 100).toFixed(1) + '%' : METRICS[key].pctNum ? n.toFixed(0) + '%' : fmtN(n); }
  function recommendations(posts, mKey, perDay) {
    mKey = mKey || 'views'; var out = [], label = METRICS[mKey].label.toLowerCase() + (perDay && !RATE_METRICS[mKey] ? ' per day' : '');
    if (posts.length < 5) out.push({ level: 'warn', text: 'Only ' + posts.length + ' posts loaded. Patterns below are guesses until you have at least 15–20 posts.' });
    var minN = posts.length >= 20 ? 3 : 2;
    var d = byDuration(posts, mKey, perDay).filter(function (r) { return r.count >= minN; }).sort(function (a, b) { return b.avg - a.avg; });
    if (d.length >= 2) {
      var best = d[0], worst = d[d.length - 1];
      out.push({ level: 'ok', text: 'Videos of ' + best.key + ' do best: average ' + label + ' ' + fmtM(best.avg, mKey) + ' across ' + best.count + ' posts, versus ' + fmtM(worst.avg, mKey) + ' for ' + worst.key + ' (' + worst.count + ' posts). Make more ' + best.key + ' videos.' });
    }
    var h = hooks(posts, mKey, perDay).patterns.filter(function (r) { return r.count >= 3 && r.count < posts.length; });
    var up = h.filter(function (r) { return r.lift >= 1.2; }).slice(0, 2), down = h.filter(function (r) { return r.lift <= 0.8; }).sort(function (a, b) { return a.lift - b.lift; }).slice(0, 1);
    up.forEach(function (r) { out.push({ level: 'ok', text: 'Titles that ' + r.phrase + ' average ' + Math.round((r.lift - 1) * 100) + '% more ' + label + ' (' + r.count + ' posts). Use this hook style more often.' }); });
    down.forEach(function (r) { out.push({ level: 'warn', text: 'Titles that ' + r.phrase + ' average ' + Math.round((1 - r.lift) * 100) + '% fewer ' + label + ' (' + r.count + ' posts). Try a different opening.' }); });
    var dw = byDay(posts, mKey, perDay).filter(function (r) { return r.count >= minN; }).sort(function (a, b) { return b.avg - a.avg; });
    if (dw.length >= 3) out.push({ level: 'ok', text: dw[0].key + ' is your strongest posting day (average ' + fmtM(dw[0].avg, mKey) + ' ' + label + ' over ' + dw[0].count + ' posts); ' + dw[dw.length - 1].key + ' is weakest (' + fmtM(dw[dw.length - 1].avg, mKey) + ').' });
    var hr = byHour(posts, mKey, perDay).filter(function (r) { return r.count >= minN; }).sort(function (a, b) { return b.avg - a.avg; });
    if (hr.length >= 2) out.push({ level: 'ok', text: 'Posts published in the ' + hr[0].key.toLowerCase() + ' do best (average ' + fmtM(hr[0].avg, mKey) + ', ' + hr[0].count + ' posts).' });
    var kw = keywords(posts, mKey, perDay).filter(function (k) { return k.count >= 3 && k.lift >= 1.3; }).slice(0, 3);
    if (kw.length) out.push({ level: 'ok', text: 'Topics that pull above average: ' + kw.map(function (k) { return '“' + k.word + '” (' + k.count + ' posts, ' + k.lift.toFixed(1) + '× average)'; }).join(', ') + '.' });
    var pct = posts.filter(function (p) { return isFinite(p.avgPct); });
    if (pct.length >= 5) {
      var a = avg(pct.map(function (p) { return p.avgPct; }));
      out.push({ level: a < 50 ? 'warn' : 'ok', text: 'On average viewers watch ' + a.toFixed(0) + '% of each video.' + (a < 50 ? ' Under half — tighten the first 3 seconds and cut slow setup.' : ' That is strong; keep the pacing.') });
    }
    var eng = posts.filter(function (p) { return isFinite(p.engagement); });
    if (eng.length >= 5) {
      var sorted = eng.slice().sort(function (x, y) { return y.engagement - x.engagement; })[0];
      out.push({ level: 'ok', text: 'Most engaging post: “' + sorted.title.slice(0, 70) + '” at ' + (sorted.engagement * 100).toFixed(1) + '% (likes + shares + comments ÷ views). The median post sits at ' + (median(eng.map(function (p) { return p.engagement; })) * 100).toFixed(1) + '%. Make a follow-up or part 2.' });
    }
    var shares = posts.filter(function (p) { return p.views > 0 && isFinite(p.shares); });
    if (shares.length >= 5) {
      var sr = median(shares.map(function (p) { return p.shares / p.views; }));
      out.push({ level: sr < 0.005 ? 'warn' : 'ok', text: 'Median share rate is ' + (sr * 100).toFixed(2) + '% of views.' + (sr < 0.005 ? ' Shares drive Reels and Shorts reach — end with a line people want to send to family.' : ' Shares are healthy — keep endings that people want to pass on.') });
    }
    return out;
  }

  // ---------- estimate for a new idea ----------
  function estimate(idea, posts, opts) {
    opts = opts || {}; var mKey = opts.metric || 'views', k = opts.k || 7;
    var pats = patternsOf(idea.title), bucket = bucketOf(Number(idea.duration)), kws = words(idea.title).filter(function (w) { return w.length >= 3 && STOP.indexOf(w) < 0; });
    var scored = posts.map(function (p) {
      var pp = patternsOf(p.title), pw = words(p.title + ' ' + (p.description || ''));
      var inter = pats.filter(function (x) { return pp.indexOf(x) >= 0; }).length, uni = pats.length + pp.length - inter;
      var kwHits = kws.filter(function (w) { return pw.indexOf(w) >= 0; }).length;
      var s = (bucket && bucketOf(p.duration) === bucket ? 1.5 : 0) + (uni ? 2 * inter / uni : 0) + (kws.length ? 2 * kwHits / kws.length : 0);
      return { post: p, score: s, value: metric(p, mKey, false) };
    }).filter(function (x) { return isFinite(x.value); }).sort(function (a, b) { return b.score - a.score; });
    var near = scored.slice(0, Math.min(k, scored.length)).filter(function (x) { return x.score > 0; });
    if (near.length < 3) near = scored.slice(0, Math.min(k, scored.length));
    var vals = near.map(function (x) { return x.value; });
    var conf = posts.length < 10 || near.length < 3 ? 'low' : near.filter(function (x) { return x.score >= 2; }).length >= 3 && posts.length >= 25 ? 'medium' : 'low';
    return { patterns: pats, bucket: bucket, keywords: kws, neighbours: near, low: quantile(vals, 0.25), mid: median(vals), high: quantile(vals, 0.75),
      overallMedian: median(posts.map(function (p) { return metric(p, mKey, false); })), confidence: conf, sample: posts.length };
  }

  var L = {
    FIELDS: FIELDS, METRICS: METRICS, PATTERNS: PATTERNS, BUCKETS: BUCKETS, DOW: DOW, HOURS: HOURS,
    normHeader: normHeader, detectColumns: detectColumns, detectPlatform: detectPlatform, toNum: toNum, toSeconds: toSeconds, dateOrder: dateOrder, toDateTime: toDateTime,
    normalise: normalise, metric: metric, available: available, rank: rank, summary: summary, bucketOf: bucketOf, byDuration: byDuration, byDay: byDay, byHour: byHour,
    patternsOf: patternsOf, hooks: hooks, keywords: keywords, recommendations: recommendations, estimate: estimate, avg: avg, median: median, quantile: quantile, fmtN: fmtN, fmtM: fmtM
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.InsightsLib = L;
})(this);
