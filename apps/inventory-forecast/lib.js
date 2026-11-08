/* Inventory Forecasting — pure logic (no DOM). Works in the browser (window.InventoryLib) and in Node (require). */
(function (root) {
  'use strict';
  var DAY = 86400000;

  // ---------- small helpers ----------
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function toNum(v) {
    if (typeof v === 'number') return v;
    var s = String(v == null ? '' : v).trim(); if (!s) return NaN;
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s);
    s = s.replace(/[^0-9.,]/g, '');
    if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
    var n = parseFloat(s); return isNaN(n) ? NaN : (neg ? -n : n);
  }
  function round(n, d) { var p = Math.pow(10, d == null ? 2 : d); return Math.round(n * p) / p; }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function mean(a) { return a.length ? sum(a) / a.length : 0; }
  function sd(a) { if (a.length < 2) return 0; var m = mean(a), s = 0; a.forEach(function (x) { s += (x - m) * (x - m); }); return Math.sqrt(s / (a.length - 1)); }
  function iso(d) { return d.toISOString().slice(0, 10); }

  // Day-first (AU) or month-first? Look at all values: a first part > 12 means day-first.
  function detectDateOrder(values) {
    var dmy = 0, mdy = 0;
    values.forEach(function (v) { var m = String(v || '').trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-]\d{2,4}/); if (!m) return; if (+m[1] > 12) dmy++; if (+m[2] > 12) mdy++; });
    return mdy > dmy ? 'mdy' : 'dmy';
  }
  var MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  function parseDate(v, order) {
    if (v instanceof Date) return isNaN(v) ? null : new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
    var s = String(v == null ? '' : v).trim(), m; if (!s) return null;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return new Date(Date.UTC(+m[1], m[2] - 1, +m[3]));
    if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/))) {
      var y = +m[3]; if (y < 100) y += 2000; var a = +m[1], b = +m[2];
      if (order === 'mdy') { var t = a; a = b; b = t; }
      if (b < 1 || b > 12 || a < 1 || a > 31) return null; return new Date(Date.UTC(y, b - 1, a));
    }
    if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/)) && MON[m[2].toLowerCase()] != null) return new Date(Date.UTC(+m[3], MON[m[2].toLowerCase()], +m[1]));
    if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/)) && MON[m[1].toLowerCase()] != null) return new Date(Date.UTC(+m[3], MON[m[1].toLowerCase()], +m[2]));
    if (/^\d{5}(\.\d+)?$/.test(s)) { var n = +s; if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * DAY); }
    return null;
  }
  // Greedy header matching. fields: [{key, re:[RegExp,...]}] (earlier regex = better match)
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
    { key: 'date', label: 'Date', required: true, re: [/^(sale |order |transaction |invoice )?date$/, /^week( start(ing)?)?$/, /date|day|week|period/] },
    { key: 'sku', label: 'SKU / product code', required: true, re: [/^sku$/, /^(item|product|variant) ?(code|id|sku)$/, /sku|code|item id|product id|barcode/, /^(item|product)$/] },
    { key: 'qty', label: 'Quantity sold', required: true, re: [/^(qty|quantity|units)( sold)?$/, /qty|quantity|units|sold|volume/] },
    { key: 'name', label: 'Product name', re: [/^(product|item) ?(name|title|description)$/, /name|title|description/, /^product$/] },
    { key: 'price', label: 'Unit price', re: [/^(unit )?(sell(ing)? )?price$/, /price|rrp/] },
    { key: 'revenue', label: 'Sales amount', re: [/^(net |gross )?(sales|revenue)( amount| \$)?$/, /revenue|sales \$|amount|total/] },
    { key: 'stock', label: 'Stock on hand', re: [/^(stock|soh|on hand|inventory)( on hand| level| qty)?$/, /stock|on ?hand|soh|inventory/] },
    { key: 'lead', label: 'Lead time (days)', re: [/^lead ?time( \(?days\)?)?$/, /lead/] }
  ];
  function detectColumns(headers) { return guessColumns(headers, FIELDS); }

  // ---------- weekly aggregation ----------
  function weekStart(d) { var day = d.getUTCDay(); return new Date(d.getTime() - ((day + 6) % 7) * DAY); }
  /* rows + mapping -> {weeks:[iso...], skus:{sku:{sku,name,qty:[..],revenue:[..],price,stock,lead,lastSale}}, skipped} */
  function aggregate(rows, map) {
    var order = detectDateOrder(rows.map(function (r) { return r[map.date]; }));
    var skus = {}, minW = null, maxW = null, skipped = 0, recs = [];
    rows.forEach(function (r) {
      var d = parseDate(r[map.date], order), sku = String(r[map.sku] == null ? '' : r[map.sku]).trim(), q = toNum(r[map.qty]);
      if (!d || !sku || isNaN(q)) { skipped++; return; }
      var w = weekStart(d); if (!minW || w < minW) minW = w; if (!maxW || w > maxW) maxW = w;
      recs.push({ d: d, w: w, sku: sku, q: q, r: r });
    });
    if (!recs.length) return { weeks: [], skus: {}, skipped: skipped, order: order };
    var weeks = []; for (var t = minW.getTime(); t <= maxW.getTime(); t += 7 * DAY) weeks.push(iso(new Date(t)));
    var idx = {}; weeks.forEach(function (w, i) { idx[w] = i; });
    recs.sort(function (a, b) { return a.d - b.d; });
    recs.forEach(function (x) {
      var s = skus[x.sku];
      if (!s) s = skus[x.sku] = { sku: x.sku, name: '', qty: weeks.map(function () { return 0; }), revenue: weeks.map(function () { return 0; }), priceSum: 0, priceQty: 0, stock: null, lead: null, lastSale: null };
      var i = idx[iso(x.w)]; s.qty[i] += x.q;
      if (map.name && x.r[map.name]) s.name = String(x.r[map.name]).trim();
      var p = map.price ? toNum(x.r[map.price]) : NaN, rev = map.revenue ? toNum(x.r[map.revenue]) : NaN;
      if (!isNaN(rev)) { s.revenue[i] += rev; if (x.q > 0) { s.priceSum += rev; s.priceQty += x.q; } }
      else if (!isNaN(p)) { s.revenue[i] += p * x.q; s.priceSum += p * x.q; s.priceQty += x.q; }
      if (map.stock) { var st = toNum(x.r[map.stock]); if (!isNaN(st)) s.stock = st; }
      if (map.lead) { var ld = toNum(x.r[map.lead]); if (!isNaN(ld) && ld >= 0) s.lead = ld; }
      if (x.q > 0) s.lastSale = iso(x.d);
    });
    Object.keys(skus).forEach(function (k) { var s = skus[k]; s.price = s.priceQty ? s.priceSum / s.priceQty : null; delete s.priceSum; delete s.priceQty; });
    return { weeks: weeks, skus: skus, skipped: skipped, order: order };
  }

  // ---------- forecasting methods ----------
  // Each fit returns {fitted:[one-step predictions or null], level, trend, season, forecast(h)->[...], c(j)} where c(j) is
  // the weight used for the forecast-error variance: var(h) = sigma^2 * (1 + sum_{j=1}^{h-1} c(j)^2).
  function movingAverage(y, k) {
    var fitted = y.map(function (_, t) { return t >= k ? mean(y.slice(t - k, t)) : null; });
    var last = mean(y.slice(Math.max(0, y.length - k)));
    return { fitted: fitted, params: { k: k }, forecast: function (h) { var o = []; for (var i = 0; i < h; i++) o.push(last); return o; }, c: function () { return 1 / Math.sqrt(k); } };
  }
  function ses(y, alpha) {
    var L = y[0], fitted = [null];
    for (var t = 1; t < y.length; t++) { fitted.push(L); L = alpha * y[t] + (1 - alpha) * L; }
    return { fitted: fitted, level: L, params: { alpha: alpha }, forecast: function (h) { var o = []; for (var i = 0; i < h; i++) o.push(L); return o; }, c: function () { return alpha; } };
  }
  function holt(y, alpha, beta) {
    var L = y[1], T = y[1] - y[0], fitted = [null, null];
    for (var t = 2; t < y.length; t++) {
      fitted.push(L + T);
      var nl = alpha * y[t] + (1 - alpha) * (L + T); T = beta * (nl - L) + (1 - beta) * T; L = nl;
    }
    return { fitted: fitted, level: L, trend: T, params: { alpha: alpha, beta: beta },
      forecast: function (h) { var o = []; for (var i = 1; i <= h; i++) o.push(L + i * T); return o; },
      c: function (j) { return alpha * (1 + j * beta); } };
  }
  function holtWinters(y, m, alpha, beta, gamma) {
    var L = mean(y.slice(0, m)), T = (mean(y.slice(m, 2 * m)) - L) / m, S = [], fitted = [], t;
    for (t = 0; t < m; t++) { S.push(y[t] - L); fitted.push(null); }
    for (t = m; t < y.length; t++) {
      var s = S[t - m]; fitted.push(L + T + s);
      var nl = alpha * (y[t] - s) + (1 - alpha) * (L + T);
      T = beta * (nl - L) + (1 - beta) * T;
      S.push(gamma * (y[t] - nl) + (1 - gamma) * s); L = nl;
    }
    var n = y.length;
    return { fitted: fitted, level: L, trend: T, params: { alpha: alpha, beta: beta, gamma: gamma, m: m },
      forecast: function (h) { var o = []; for (var i = 1; i <= h; i++) o.push(L + i * T + S[n - m + ((i - 1) % m)]); return o; },
      c: function (j) { return alpha * (1 + j * beta) + (j % m === 0 ? gamma * (1 - alpha) : 0); } };
  }
  function sse(fit, y) { var s = 0, n = 0; fit.fitted.forEach(function (p, t) { if (p != null) { s += (y[t] - p) * (y[t] - p); n++; } }); return n ? s / n : Infinity; }
  function residualSigma(fit, y) {
    var e = []; fit.fitted.forEach(function (p, t) { if (p != null) e.push(y[t] - p); });
    if (e.length < 2) return sd(y);
    return Math.sqrt(sum(e.map(function (x) { return x * x; })) / (e.length - 1));
  }
  var GA = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], GB = [0.01, 0.05, 0.1, 0.2, 0.3], GG = [0.05, 0.1, 0.2, 0.3, 0.5];
  function best(y, make, grid) { var b = null, be = Infinity; grid.forEach(function (p) { var f = make(y, p), e = sse(f, y); if (e < be) { be = e; b = f; } }); return b; }
  function combos() { var o = [], a = [].slice.call(arguments); (function rec(i, cur) { if (i === a.length) { o.push(cur.slice()); return; } a[i].forEach(function (v) { cur.push(v); rec(i + 1, cur); cur.pop(); }); })(0, []); return o; }

  var METHODS = {
    ma4: { label: '4-week average', min: 6, fit: function (y) { return movingAverage(y, 4); } },
    ma8: { label: '8-week average', min: 10, fit: function (y) { return movingAverage(y, 8); } },
    ma13: { label: '13-week average', min: 15, fit: function (y) { return movingAverage(y, 13); } },
    ses: { label: 'Exponential smoothing', min: 4, fit: function (y) { return best(y, function (y, p) { return ses(y, p[0]); }, combos(GA)); } },
    holt: { label: 'Holt (trend)', min: 8, fit: function (y) { return best(y, function (y, p) { return holt(y, p[0], p[1]); }, combos(GA, GB)); } },
    hw: { label: 'Holt-Winters (seasonal)', min: 104, fit: function (y, m) { return best(y, function (y, p) { return holtWinters(y, m, p[0], p[1], p[2]); }, combos(GA, GB, GG)); } }
  };
  function errors(actual, pred) {
    var ae = 0, ape = 0, nz = 0;
    actual.forEach(function (a, i) { var e = Math.abs(a - pred[i]); ae += e; if (a !== 0) { ape += e / Math.abs(a); nz++; } });
    return { mae: ae / actual.length, mape: nz ? ape / nz : null };
  }
  /* Pick a method by holdout error, refit on all data, forecast h weeks with intervals.
     opts: {horizon, season (52), metric 'mae'|'mape', z (interval z, default 1.645 for 90%), method (force)} */
  function forecastSeries(y, opts) {
    opts = opts || {}; var h = opts.horizon || 12, m = opts.season || 52, z = opts.z || 1.645;
    var n = y.length, H = Math.min(8, Math.max(2, Math.floor(n * 0.2)));
    var res = { n: n, holdout: H, candidates: [], note: '' };
    if (n < 6) {
      var avg = mean(y), s0 = sd(y);
      res.method = 'avg'; res.label = 'Average (short history)'; res.sigma = s0;
      res.forecast = []; for (var i = 0; i < h; i++) res.forecast.push({ mean: Math.max(0, avg), lo: Math.max(0, avg - z * s0), hi: avg + z * s0 });
      res.fitted = y.map(function () { return null; });
      res.note = 'Only ' + n + ' weeks of sales — the forecast is a plain average. It gets better with 3+ months of history.';
      return res;
    }
    var train = y.slice(0, n - H), test = y.slice(n - H);
    Object.keys(METHODS).forEach(function (k) {
      var M = METHODS[k], need = k === 'hw' ? 2 * m : M.min; if (train.length < need) return;
      var f = M.fit(train, m), p = f.forecast(H).map(function (v) { return Math.max(0, v); }), e = errors(test, p);
      res.candidates.push({ method: k, label: M.label, mae: e.mae, mape: e.mape });
    });
    var metric = opts.metric === 'mape' && res.candidates.every(function (c) { return c.mape != null; }) ? 'mape' : 'mae';
    var chosen = opts.method && METHODS[opts.method] && res.candidates.some(function (c) { return c.method === opts.method; }) ? opts.method : null;
    if (!chosen) { var b = null; res.candidates.forEach(function (c) { if (!b || c[metric] < b[metric] - 1e-9) b = c; }); chosen = b.method; }
    res.metric = metric; res.method = chosen; res.label = METHODS[chosen].label;
    var cand = res.candidates.filter(function (c) { return c.method === chosen; })[0]; res.mae = cand.mae; res.mape = cand.mape;
    var fit = METHODS[chosen].fit(y, m); res.params = fit.params; res.fitted = fit.fitted;
    var sig = residualSigma(fit, y); res.sigma = sig;
    var acc = 0; res.forecast = fit.forecast(h).map(function (v, i) {
      if (i > 0) acc += Math.pow(fit.c(i), 2);
      var se = sig * Math.sqrt(1 + acc), mu = Math.max(0, v);
      return { mean: mu, lo: Math.max(0, v - z * se), hi: Math.max(0, v + z * se) };
    });
    if (n < 2 * m + H) res.note = 'Less than two years of history, so yearly seasonal patterns can\'t be checked.';
    return res;
  }

  // ---------- normal distribution ----------
  function normCdf(x) {
    var t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2), a = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
    var y = 1 - (((((a[4] * t + a[3]) * t) + a[2]) * t + a[1]) * t + a[0]) * t * Math.exp(-x * x / 2);
    return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }
  // Acklam's inverse normal
  function normInv(p) {
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239],
      b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572],
      c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783],
      d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416], q, r;
    if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  // ---------- stock policy ----------
  function safetyStock(z, sigmaWeekly, leadWeeks) { return z * sigmaWeekly * Math.sqrt(Math.max(0, leadWeeks)); }
  // demand over a fractional number of weeks from a weekly forecast array
  function demandOver(fc, weeks) {
    var s = 0, i = 0; while (weeks > 0 && i < fc.length) { var part = Math.min(1, weeks); s += fc[i] * part; weeks -= part; i++; }
    if (weeks > 0 && fc.length) s += fc[fc.length - 1] * weeks; return s;
  }
  function eoq(annualDemand, orderCost, holdingCostPerUnitYear) {
    if (!(annualDemand > 0) || !(orderCost > 0) || !(holdingCostPerUnitYear > 0)) return null;
    return Math.sqrt(2 * annualDemand * orderCost / holdingCostPerUnitYear);
  }
  function stockoutRisk(stock, meanLT, sigmaLT) {
    if (stock == null) return null; if (sigmaLT <= 0) return stock < meanLT ? 1 : 0;
    return 1 - normCdf((stock - meanLT) / sigmaLT);
  }
  /* ABC by value: items [{key, value}] -> {key: 'A'|'B'|'C'}. A = top 80% of value, B = next 15%, C = rest. */
  function abc(items, aCut, bCut) {
    aCut = aCut || 0.8; bCut = bCut || 0.95;
    var total = sum(items.map(function (i) { return Math.max(0, i.value); })), out = {}, cum = 0;
    items.slice().sort(function (a, b) { return b.value - a.value; }).forEach(function (i) {
      var before = total ? cum / total : 1; cum += Math.max(0, i.value);
      out[i.key] = total && i.value > 0 ? (before < aCut ? 'A' : before < bCut ? 'B' : 'C') : 'C';
    });
    return out;
  }

  /* Full plan for every SKU.
     settings: {horizon, serviceLevel (0.95), leadDays (14), coverWeeks (4), useEOQ, orderCost, holdingPct, costPct, metric,
                stockOverrides:{sku:n}, leadOverrides:{sku:days}} */
  function plan(agg, settings) {
    var st = Object.assign({ horizon: 12, serviceLevel: 0.95, leadDays: 14, coverWeeks: 4, useEOQ: false, orderCost: 50, holdingPct: 0.25, costPct: 0.5, metric: 'mae' }, settings || {});
    var z = normInv(st.serviceLevel), weeks = agg.weeks, n = weeks.length, lastWeek = n ? weeks[n - 1] : null;
    var out = Object.keys(agg.skus).sort().map(function (k) {
      var s = agg.skus[k], y = s.qty;
      // ignore leading weeks before the product's first sale
      var first = 0; while (first < y.length - 1 && y[first] === 0) first++;
      var series = y.slice(first);
      var fc = forecastSeries(series, { horizon: Math.max(st.horizon, 26), metric: st.metric });
      var means = fc.forecast.map(function (f) { return f.mean; });
      var avgWeekly = mean(means.slice(0, 4));
      var lead = (st.leadOverrides && st.leadOverrides[k] != null) ? st.leadOverrides[k] : (s.lead != null ? s.lead : st.leadDays);
      var Lw = lead / 7, sigma = fc.sigma;
      var ss = safetyStock(z, sigma, Lw), muLT = demandOver(means, Lw), rop = muLT + ss;
      var stock = (st.stockOverrides && st.stockOverrides[k] != null && st.stockOverrides[k] !== '') ? +st.stockOverrides[k] : s.stock;
      var price = s.price, unitCost = price != null ? price * st.costPct : null;
      var annual = avgWeekly * 52, q = st.useEOQ && unitCost ? eoq(annual, st.orderCost, unitCost * st.holdingPct) : null;
      var orderUpTo = rop + demandOver(means.slice(Math.ceil(Lw)), st.coverWeeks);
      var order = 0, status = 'ok', orderInWeeks = null;
      if (stock != null) {
        if (stock <= rop) { order = q ? Math.max(q, rop - stock) : orderUpTo - stock; status = stock <= ss ? 'urgent' : 'order'; }
        else if (avgWeekly > 0) orderInWeeks = (stock - rop) / avgWeekly;
      } else order = null;
      var last13 = sum(y.slice(-13)), prev39 = y.length > 13 ? mean(y.slice(-52, -13)) : null;
      var weeksSince = s.lastSale ? Math.round((Date.parse(lastWeek) - Date.parse(iso(weekStart(new Date(Date.parse(s.lastSale)))))) / (7 * DAY)) : null;
      var movement = 'normal';
      if (series.length >= 13 && last13 === 0) movement = 'dead';
      else if (prev39 != null && prev39 > 0 && last13 / 13 < 0.25 * prev39) movement = 'slow';
      else if (stock != null && avgWeekly > 0 && stock / avgWeekly > 26) movement = 'slow';
      var rev52 = sum(s.revenue.slice(-52)), qty52 = sum(y.slice(-52));
      return {
        sku: k, name: s.name, method: fc.method, methodLabel: fc.label, mae: fc.mae, mape: fc.mape, note: fc.note, candidates: fc.candidates,
        history: y, fitted: new Array(first).fill(null).concat(fc.fitted || []), forecast: fc.forecast.slice(0, st.horizon), sigma: sigma,
        avgWeekly: avgWeekly, leadDays: lead, safetyStock: ss, leadDemand: muLT, reorderPoint: rop, eoq: q, orderUpTo: orderUpTo,
        stock: stock, orderQty: order == null ? null : Math.max(0, Math.ceil(order)), status: stock == null ? 'unknown' : status, orderInWeeks: orderInWeeks,
        daysCover: stock != null && avgWeekly > 0 ? stock / (avgWeekly / 7) : (stock != null && stock > 0 ? Infinity : null),
        risk: stock == null ? null : stockoutRisk(stock, muLT, sigma * Math.sqrt(Lw)),
        price: price, revenue52: rev52 || (price ? qty52 * price : qty52), qty52: qty52, movement: movement, weeksSinceSale: weeksSince,
        deadValue: movement === 'dead' && stock && unitCost ? stock * unitCost : 0
      };
    });
    var cls = abc(out.map(function (r) { return { key: r.sku, value: r.revenue52 }; }));
    out.forEach(function (r) { r.abc = cls[r.sku]; });
    return out;
  }
  function riskLabel(p) { return p == null ? '' : p >= 0.3 ? 'High' : p >= 0.1 ? 'Medium' : 'Low'; }

  function purchaseCsvRows(rows) {
    return rows.map(function (r) {
      return { SKU: r.sku, Product: r.name, Class: r.abc, Method: r.methodLabel, 'Avg weekly forecast': round(r.avgWeekly, 1), 'Stock on hand': r.stock == null ? '' : r.stock,
        'Lead time (days)': r.leadDays, 'Safety stock': Math.ceil(r.safetyStock), 'Reorder point': Math.ceil(r.reorderPoint), 'Order qty': r.orderQty == null ? '' : r.orderQty,
        Status: r.status, 'Days of cover': r.daysCover == null ? '' : r.daysCover === Infinity ? 'no demand' : Math.round(r.daysCover), 'Stock-out risk': r.risk == null ? '' : Math.round(r.risk * 100) + '%', Movement: r.movement };
    });
  }

  // ---------- sample data (made up: an Australian garden & outdoor shop, weekly POS export, 2.5 years) ----------
  function sampleData(endDate) {
    var R = rng(20261108), end = weekStart(endDate ? parseDate(endDate) : new Date(Date.UTC(2026, 10, 2)));
    function pois(l) { if (l <= 0) return 0; if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss())); var L = Math.exp(-l), k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; }
    function gauss() { var u = 1 - R(), v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    // seasonal shape by month (southern hemisphere: summer = Dec–Feb)
    function summer(mo) { return [1.7, 1.5, 1.1, 0.7, 0.45, 0.35, 0.35, 0.45, 0.75, 1.1, 1.45, 1.9][mo]; }
    function winter(mo) { return 2 - summer(mo); }
    var items = [
      { sku: 'SUN-SPF50-200', name: 'SPF50 sunscreen 200ml', price: 14.95, base: 38, shape: summer, stock: 60, lead: 14 },
      { sku: 'HOSE-30M', name: 'Garden hose 30m', price: 49.0, base: 9, shape: summer, stock: 22, lead: 21 },
      { sku: 'BEANIE-THRM', name: 'Thermal beanie', price: 24.0, base: 11, shape: winter, stock: 85, lead: 28 },
      { sku: 'PLANTER-BAM-L', name: 'Bamboo planter large', price: 39.5, base: 6, trend: 0.035, stock: 9, lead: 21 },
      { sku: 'SEED-HERB-6', name: 'Herb seed kit (6 pack)', price: 12.5, base: 15, shape: function (mo) { return [0.8, 0.9, 1.3, 1.2, 0.8, 0.6, 0.6, 0.9, 1.5, 1.5, 1.1, 0.8][mo]; }, stock: 70, lead: 10 },
      { sku: 'GLOVE-GDN-M', name: 'Gardening gloves (M)', price: 9.95, base: 20, stock: 48, lead: 14 },
      { sku: 'POTMIX-25L', name: 'Premium potting mix 25L', price: 17.9, base: 26, trend: 0.012, stock: 40, lead: 7 },
      { sku: 'SOLAR-LIGHT-4', name: 'Solar path lights (4)', price: 34.0, base: 7, trend: -0.02, stock: 64, lead: 35 },
      { sku: 'BBQ-COVER-XL', name: 'BBQ cover XL', price: 59.0, base: 2.2, shape: summer, stock: 12, lead: 28 },
      { sku: 'FIREPIT-STL', name: 'Steel fire pit', price: 189.0, base: 1.3, shape: winter, stock: 6, lead: 42 },
      { sku: 'WIND-CHIME', name: 'Bamboo wind chime', price: 29.0, base: 3, dead: 16, stock: 37, lead: 21 },
      { sku: 'TRELLIS-EXP', name: 'Expandable trellis', price: 22.0, base: 0.7, stock: 30, lead: 21 }
    ];
    var W = 130, rows = [];
    items.forEach(function (it) {
      for (var w = 0; w < W; w++) {
        var d = new Date(end.getTime() - (W - 1 - w) * 7 * DAY), mo = new Date(d.getTime() + 3 * DAY).getUTCMonth();
        var lam = it.base * (it.shape ? it.shape(mo) : 1) * (it.trend ? Math.exp(it.trend * (w - W + 1)) : 1);
        if (it.dead && w > W - it.dead) lam = 0;
        var q = pois(lam);
        var row = { 'Week starting': iso(d), SKU: it.sku, 'Product name': it.name, 'Units sold': q, 'Unit price': it.price.toFixed(2) };
        row['Stock on hand'] = w === W - 1 ? it.stock : ''; row['Lead time days'] = it.lead;
        rows.push(row);
      }
    });
    return { headers: ['Week starting', 'SKU', 'Product name', 'Units sold', 'Unit price', 'Stock on hand', 'Lead time days'], rows: rows };
  }

  var L = {
    FIELDS: FIELDS, METHODS: METHODS, rng: rng, toNum: toNum, parseDate: parseDate, detectDateOrder: detectDateOrder, guessColumns: guessColumns, detectColumns: detectColumns,
    weekStart: weekStart, aggregate: aggregate, movingAverage: movingAverage, ses: ses, holt: holt, holtWinters: holtWinters, errors: errors,
    forecastSeries: forecastSeries, normCdf: normCdf, normInv: normInv, safetyStock: safetyStock, demandOver: demandOver, eoq: eoq,
    stockoutRisk: stockoutRisk, abc: abc, plan: plan, riskLabel: riskLabel, purchaseCsvRows: purchaseCsvRows, sampleData: sampleData, mean: mean, sd: sd, round: round
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.InventoryLib = L;
})(this);
