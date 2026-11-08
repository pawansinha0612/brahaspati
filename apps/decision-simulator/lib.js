/* Decision Simulator — pure logic (no DOM). Browser: window.DecisionLib. Node: require('./lib.js').
   Money is AUD. Month 0 = the day you decide (one-off costs). Months 1..H = recurring cash. */
(function (root) {
  'use strict';
  var B = (typeof require === 'function' && typeof module !== 'undefined' && module.exports) ? require('../../assets/core.js') : root.B;

  // ---------- numbers & randomness ----------
  function num(v, d) { var n = +v; return isFinite(n) ? n : (d || 0); }
  function r2(n) { return Math.round(num(n) * 100) / 100; }
  // Seeded RNG (mulberry32): same seed -> same simulation, so results are repeatable.
  function rng(seed) {
    var a = (num(seed, 1) >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // A range {low, likely, high}; missing low/high fall back to likely. Sorted so low <= likely <= high.
  function range(r) {
    if (r == null || typeof r !== 'object') { var x = num(r); return { low: x, likely: x, high: x }; }
    var l = num(r.likely, num(r.low)), lo = r.low === '' || r.low == null ? l : num(r.low), hi = r.high === '' || r.high == null ? l : num(r.high);
    var s = [lo, l, hi].sort(function (a, b) { return a - b; });
    return { low: s[0], likely: Math.min(Math.max(l, s[0]), s[2]), high: s[2] };
  }
  // Inverse-CDF draw from a triangular distribution.
  function triangular(u, r) {
    r = range(r); var a = r.low, c = r.likely, b = r.high;
    if (b === a) return a;
    var f = (c - a) / (b - a);
    return u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
  }
  function triMean(r) { r = range(r); return (r.low + r.likely + r.high) / 3; }
  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    var pos = (sorted.length - 1) * q, i = Math.floor(pos), f = pos - i;
    return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * f;
  }
  function monthlyRate(annualPct) { return Math.pow(1 + num(annualPct) / 100, 1 / 12) - 1; }
  function npv(flows, annualPct) {
    var m = monthlyRate(annualPct), s = 0;
    for (var t = 0; t < flows.length; t++) s += flows[t] / Math.pow(1 + m, t);
    return s;
  }
  // First month the running total is back at or above zero and stays there. null = not within the horizon.
  function payback(flows) {
    var cum = 0, last = null, neg = false;
    for (var t = 0; t < flows.length; t++) {
      cum += flows[t];
      if (cum < -1e-9) { neg = true; last = null; } else if (last === null) last = t;
    }
    if (!neg) return 0;
    return last;
  }

  // ---------- model ----------
  // Option: { id, name, oneOff:{low,likely,high}, lines:[{label, kind:'cost'|'benefit', low, likely, high}],
  //           delay:{low,likely,high} months before benefits start, ramp: months to reach full benefit,
  //           risks:[{label, prob (0-100 %), impact:{low,likely,high} one-off cost if it happens}], scores:{criterionId: 0-10} }
  // draw(key, range) returns the value to use for an input; key identifies the input (for the tornado).
  function flowsFor(opt, horizon, draw, riskHits) {
    var H = Math.max(1, Math.round(num(horizon, 36))), f = new Array(H + 1);
    for (var i = 0; i <= H; i++) f[i] = 0;
    f[0] -= draw('oneOff', opt.oneOff);
    var delay = Math.max(0, draw('delay', opt.delay)), ramp = Math.max(0, num(opt.ramp));
    (opt.lines || []).forEach(function (l, li) {
      var v = draw('line:' + li, l), benefit = l.kind === 'benefit';
      for (var t = 1; t <= H; t++) {
        if (!benefit) { f[t] -= v; continue; }
        // Benefit starts after the delay (fractional delays give a part month), then ramps up linearly.
        var active = Math.min(1, Math.max(0, t - delay));
        if (active <= 0) continue;
        var since = t - delay, share = ramp > 0 ? Math.min(1, since / ramp) : 1;
        f[t] += v * active * share;
      }
    });
    (opt.risks || []).forEach(function (rk, ri) {
      var hit = riskHits(ri, rk); // {factor: 0..1, month}
      if (!hit || !hit.factor) return;
      var m = Math.min(H, Math.max(1, Math.round(hit.month || 1)));
      f[m] -= draw('risk:' + ri, rk.impact) * hit.factor;
    });
    return f;
  }
  function likelyDraw(k, r) { return range(r).likely; }
  // Base case: likely values; each risk counted as its expected cost (probability x impact) half-way through.
  function baseCase(opt, d) {
    var H = horizonOf(d);
    var flows = flowsFor(opt, H, likelyDraw, function (ri, rk) { return { factor: clampPct(rk.prob) / 100, month: Math.ceil(H / 2) }; });
    return summarise(flows, d);
  }
  function horizonOf(d) { return Math.max(1, Math.round(num(d.horizon, 36))); }
  function clampPct(p) { return Math.min(100, Math.max(0, num(p))); }
  function summarise(flows, d) {
    var cum = [], s = 0, years = [];
    flows.forEach(function (v, t) { s += v; cum.push(s); if (t === 0) return; var y = Math.ceil(t / 12) - 1; years[y] = (years[y] || 0) + v; }); // years exclude the up-front month 0
    return { flows: flows, cumulative: cum, total: s, npv: npv(flows, d.discountRate), payback: payback(flows), years: years };
  }

  // Monte Carlo. Every option is drawn with its own uniforms; risks happen with their probability in a random month.
  function simulate(d, opts) {
    opts = opts || {};
    var runs = Math.max(100, Math.min(50000, Math.round(num(opts.runs || d.runs, 5000)))), rand = rng(opts.seed != null ? opts.seed : (d.seed || 42));
    var H = horizonOf(d), options = d.options || [], n = options.length;
    var npvs = options.map(function () { return new Array(runs); }), totals = options.map(function () { return new Array(runs); });
    var best = options.map(function () { return 0; }), loss = options.map(function () { return 0; }), pay = options.map(function () { return 0; });
    for (var r = 0; r < runs; r++) {
      var topI = -1, topV = -Infinity;
      for (var i = 0; i < n; i++) {
        var o = options[i];
        var flows = flowsFor(o, H, function (k, rg) { return triangular(rand(), rg); }, function (ri, rk) {
          return rand() < clampPct(rk.prob) / 100 ? { factor: 1, month: 1 + Math.floor(rand() * H) } : null;
        });
        var v = npv(flows, d.discountRate), tot = 0; for (var t = 0; t < flows.length; t++) tot += flows[t];
        npvs[i][r] = v; totals[i][r] = tot;
        if (v < 0) loss[i]++;
        if (payback(flows) !== null) pay[i]++;
        if (v > topV) { topV = v; topI = i; }
      }
      if (topI >= 0) best[topI]++;
    }
    return {
      runs: runs, seed: opts.seed != null ? opts.seed : (d.seed || 42),
      options: options.map(function (o, i) {
        var s = npvs[i].slice().sort(function (a, b) { return a - b; });
        var mean = s.reduce(function (a, b) { return a + b; }, 0) / runs;
        return { id: o.id, name: o.name, p10: quantile(s, 0.1), p50: quantile(s, 0.5), p90: quantile(s, 0.9), mean: mean, min: s[0], max: s[runs - 1],
          probBest: best[i] / runs, probLoss: loss[i] / runs, probPayback: pay[i] / runs, histogram: histogram(s, 24) };
      })
    };
  }
  function histogram(sorted, bins) {
    if (!sorted.length) return [];
    var lo = sorted[0], hi = sorted[sorted.length - 1], w = (hi - lo) / bins || 1, h = [];
    for (var b = 0; b < bins; b++) h.push({ from: lo + b * w, to: lo + (b + 1) * w, count: 0 });
    sorted.forEach(function (v) { var b = Math.min(bins - 1, Math.floor((v - lo) / w)); h[b].count++; });
    return h;
  }

  // Tornado: move one input at a time to its low and high end (others at likely, risks at expected cost)
  // and see how far NPV moves. Biggest swing first.
  function tornado(opt, d) {
    var H = horizonOf(d), base = baseCase(opt, d).npv, items = [];
    function run(key, val, riskOverride) {
      var flows = flowsFor(opt, H, function (k, rg) { return k === key ? val : range(rg).likely; }, function (ri, rk) {
        var p = riskOverride && riskOverride.ri === ri ? riskOverride.p : clampPct(rk.prob) / 100;
        return { factor: p, month: Math.ceil(H / 2) };
      });
      return npv(flows, d.discountRate);
    }
    function add(key, label, rg, lowText, highText) {
      var r = range(rg); if (r.low === r.high) return;
      var a = run(key, r.low), b = run(key, r.high);
      items.push({ key: key, label: label, lowValue: r.low, highValue: r.high, npvAtLow: a, npvAtHigh: b, swing: Math.abs(b - a), lowText: lowText, highText: highText });
    }
    add('oneOff', 'One-off cost', opt.oneOff);
    add('delay', 'Months until benefits start', opt.delay);
    (opt.lines || []).forEach(function (l, i) { add('line:' + i, (l.label || 'Line ' + (i + 1)) + (l.kind === 'benefit' ? ' (benefit / month)' : ' (cost / month)'), l); });
    (opt.risks || []).forEach(function (rk, i) {
      var a = run('none', 0, { ri: i, p: 0 }), b = run('none', 0, { ri: i, p: 1 });
      if (Math.abs(b - a) > 0.005) items.push({ key: 'risk:' + i, label: 'Risk: ' + (rk.label || 'risk ' + (i + 1)), lowValue: 0, highValue: 1, npvAtLow: a, npvAtHigh: b, swing: Math.abs(b - a), lowText: 'does not happen', highText: 'happens' });
    });
    items.sort(function (x, y) { return y.swing - x.swing; });
    return { base: base, items: items };
  }

  // Weighted qualitative score 0-100 per option. criteria: [{id, name, weight}], option.scores[id] = 0..10
  function criteriaScores(d) {
    var cr = (d.criteria || []).filter(function (c) { return num(c.weight) > 0; }), tw = cr.reduce(function (s, c) { return s + num(c.weight); }, 0);
    return (d.options || []).map(function (o) {
      if (!tw) return { id: o.id, name: o.name, score: null, parts: [] };
      var parts = cr.map(function (c) { var sc = Math.min(10, Math.max(0, num((o.scores || {})[c.id]))); return { id: c.id, name: c.name, score: sc, weighted: sc * num(c.weight) / tw * 10 }; });
      return { id: o.id, name: o.name, score: parts.reduce(function (s, p) { return s + p.weighted; }, 0), parts: parts };
    });
  }

  function analyse(d, opts) {
    var base = (d.options || []).map(function (o) { return Object.assign({ id: o.id, name: o.name }, baseCase(o, d)); });
    var sim = simulate(d, opts);
    var torn = (d.options || []).map(function (o) { return tornado(o, d); });
    var crit = criteriaScores(d);
    var res = { base: base, sim: sim, tornado: torn, criteria: crit };
    res.recommendation = recommend(d, res);
    return res;
  }

  function money(n) { return B.fmt.money(Math.round(n)).replace(/\.00$/, ''); }
  function pct(p) { return Math.round(p * 100) + '%'; }
  function paybackText(m) { return m === null ? 'Does not pay back within the period' : m === 0 ? 'Never out of pocket' : 'Pays back in month ' + m; }
  function monthText(m) { return m === null ? 'not within the period' : m === 0 ? 'straight away' : 'month ' + m; }

  // Plain-English recommendation that states its assumptions.
  function recommend(d, res) {
    var opts = d.options || [], s = res.sim.options;
    if (!opts.length) return { headline: 'Add at least two options to compare.', points: [], assumptions: [], caveats: [] };
    var idx = s.map(function (_, i) { return i; }).sort(function (a, b) { return s[b].p50 - s[a].p50; });
    var top = idx[0], second = idx[1], t = s[top], cr = res.criteria, H = horizonOf(d);
    var mostLikelyBest = s.map(function (_, i) { return i; }).sort(function (a, b) { return s[b].probBest - s[a].probBest; })[0];
    var points = [], caveats = [];
    var headline;
    if (opts.length === 1) headline = '"' + t.name + '" has a middle (P50) value of ' + money(t.p50) + ' over ' + H + ' months, in today\'s dollars.';
    else {
      var close = second != null && Math.abs(t.p50 - s[second].p50) < Math.max(1000, Math.abs(t.p50) * 0.05);
      headline = close
        ? 'It is close: "' + t.name + '" and "' + s[second].name + '" end up within ' + money(Math.abs(t.p50 - s[second].p50)) + ' of each other in the middle case. Decide on the non-money factors and the risks.'
        : 'On the numbers, "' + t.name + '" looks best: its middle outcome is worth ' + money(t.p50) + ' in today\'s dollars over ' + H + ' months' +
          (second != null ? ', ' + money(t.p50 - s[second].p50) + ' more than "' + s[second].name + '"' : '') + '.';
    }
    if (opts.length > 1) points.push('"' + s[mostLikelyBest].name + '" came out on top in ' + pct(s[mostLikelyBest].probBest) + ' of ' + res.sim.runs.toLocaleString('en-AU') + ' simulated futures.');
    idx.forEach(function (i) {
      var o = s[i], b = res.base[i];
      points.push('"' + o.name + '": 8 in 10 outcomes fall between ' + money(o.p10) + ' and ' + money(o.p90) + '. Chance of losing money: ' + pct(o.probLoss) +
        '. ' + paybackText(b.payback) + ' in the likely case.');
    });
    var biggest = res.tornado[top] && res.tornado[top].items[0];
    if (biggest) points.push('For "' + t.name + '", the input that matters most is ' + biggest.label.toLowerCase() + ' — it moves the result by ' + money(biggest.swing) + '. Firm up that number before committing.');
    var scored = cr.filter(function (c) { return c.score != null; });
    if (scored.length && opts.length > 1) {
      var cBest = scored.slice().sort(function (a, b) { return b.score - a.score; })[0];
      if (cBest.id !== t.id) caveats.push('On your weighted non-money criteria "' + cBest.name + '" scores higher (' + Math.round(cBest.score) + '/100 vs ' + Math.round(cr[top].score) + '/100). Ask whether that gap is worth ' + money(Math.max(0, t.p50 - s[cr.indexOf(cBest)].p50)) + '.');
      else points.push('It also has the best weighted score on your non-money criteria (' + Math.round(cBest.score) + '/100).');
    }
    if (t.p10 < 0) caveats.push('In the worst 1 in 10 outcomes "' + t.name + '" loses money (' + money(t.p10) + '). Make sure the business could absorb that.');
    if (res.base[top].payback === null) caveats.push('"' + t.name + '" does not pay back within ' + H + ' months in the likely case; most of its value comes later or not at all.');
    var assumptions = [
      'Period: ' + H + ' months. Discount rate: ' + num(d.discountRate) + '% a year (money later is worth less than money now).',
      'Each uncertain number is drawn between your low and high, most often near "likely" (triangular distribution), ' + res.sim.runs.toLocaleString('en-AU') + ' runs, seed ' + res.sim.seed + ' (same seed = same answer).',
      'Inputs are treated as independent of each other; risks happen at most once, in a random month, at their stated probability.',
      'Amounts are as entered (decide whether you entered GST-inclusive or exclusive figures and stay consistent). Tax effects, inflation and financing are not modelled unless you added them as lines.'
    ];
    return { headline: headline, points: points, caveats: caveats, assumptions: assumptions, topId: t.id };
  }

  // ---------- templates & sample ----------
  function rg(lo, li, hi) { return { low: lo, likely: li, high: hi }; }
  function line(label, kind, lo, li, hi) { return { label: label, kind: kind, low: lo, likely: li, high: hi }; }
  function risk(label, prob, lo, li, hi) { return { label: label, prob: prob, impact: rg(lo, li, hi) }; }
  var TEMPLATES = {
    hireVsAutomate: {
      title: 'Hire two staff or automate order processing', horizon: 36, discountRate: 8,
      criteria: [{ id: 'c1', name: 'Customer experience', weight: 3 }, { id: 'c2', name: 'Flexibility to scale', weight: 2 }, { id: 'c3', name: 'Ease to put in place', weight: 2 }, { id: 'c4', name: 'Team morale', weight: 1 }],
      options: [
        { name: 'Hire two staff', oneOff: rg(6000, 9000, 14000), delay: rg(1, 2, 3), ramp: 2,
          lines: [line('Wages + super (2 FTE)', 'cost', 11500, 12500, 13500), line('Gross profit on extra orders handled', 'benefit', 13000, 16000, 19000), line('Fewer errors / refunds', 'benefit', 500, 1000, 1800)],
          risks: [risk('A hire leaves in year one (re-recruit)', 30, 5000, 8000, 12000), risk('Workers comp / injury claim', 5, 5000, 15000, 40000)],
          scores: { c1: 8, c2: 4, c3: 7, c4: 8 } },
        { name: 'Automate order processing', oneOff: rg(45000, 60000, 85000), delay: rg(2, 4, 7), ramp: 3,
          lines: [line('Software licences + support', 'cost', 1100, 1500, 2000), line('Part-time staff to handle exceptions', 'cost', 3000, 4000, 5500), line('Gross profit on extra orders handled', 'benefit', 8000, 12000, 15000), line('Fewer errors / refunds', 'benefit', 1000, 1800, 2500)],
          risks: [risk('Project overruns (extra build cost)', 35, 8000, 15000, 30000), risk('Integration breaks after a supplier update', 20, 2000, 5000, 10000)],
          scores: { c1: 6, c2: 9, c3: 4, c4: 6 } }
      ]
    },
    leaseVsBuy: {
      title: 'Lease or buy a delivery van', horizon: 60, discountRate: 9,
      criteria: [{ id: 'c1', name: 'Cash kept free for growth', weight: 3 }, { id: 'c2', name: 'Flexibility to upgrade', weight: 2 }, { id: 'c3', name: 'Admin effort', weight: 1 }],
      options: [
        { name: 'Lease (5-year novated / operating lease)', oneOff: rg(0, 1500, 2500), delay: rg(0, 0, 0), ramp: 0,
          lines: [line('Lease payments incl. maintenance', 'cost', 1050, 1100, 1150), line('Fuel', 'cost', 600, 750, 950), line('Deliveries done in-house (saving on couriers)', 'benefit', 2200, 2600, 3000)],
          risks: [risk('Excess km / damage charges at lease end', 40, 1000, 3000, 6000)], scores: { c1: 9, c2: 8, c3: 7 } },
        { name: 'Buy outright', oneOff: rg(52000, 55000, 58000), delay: rg(0, 0, 0), ramp: 0,
          lines: [line('Servicing, tyres, rego, insurance', 'cost', 350, 450, 650), line('Fuel', 'cost', 600, 750, 950), line('Deliveries done in-house (saving on couriers)', 'benefit', 2200, 2600, 3000)],
          risks: [risk('Major repair out of warranty', 25, 3000, 6000, 12000)], scores: { c1: 3, c2: 4, c3: 6 },
          note: 'Add the resale value at the end as a benefit line if you want it counted (e.g. ~$22,000 spread over 60 months ≈ $370/month).' }
      ]
    },
    secondSite: {
      title: 'Open a second location or expand online', horizon: 36, discountRate: 10,
      criteria: [{ id: 'c1', name: 'Brand presence', weight: 2 }, { id: 'c2', name: 'Owner time needed', weight: 3 }, { id: 'c3', name: 'Reversibility (easy to back out)', weight: 2 }],
      options: [
        { name: 'Second shop', oneOff: rg(90000, 120000, 160000), delay: rg(2, 3, 5), ramp: 9,
          lines: [line('Rent + outgoings', 'cost', 5500, 6000, 6500), line('Staff', 'cost', 14000, 16000, 18000), line('Gross profit from sales', 'benefit', 20000, 28000, 40000)],
          risks: [risk('Slow trading — extra marketing push', 40, 10000, 20000, 35000), risk('Fit-out delay', 30, 5000, 12000, 25000)], scores: { c1: 9, c2: 3, c3: 2 } },
        { name: 'Expand online store', oneOff: rg(15000, 25000, 40000), delay: rg(1, 2, 4), ramp: 6,
          lines: [line('Platform, apps, ads', 'cost', 2500, 3500, 5000), line('Packing / part-time help', 'cost', 2000, 3000, 4000), line('Gross profit from online sales', 'benefit', 6000, 10000, 16000)],
          risks: [risk('Ad costs rise sharply', 35, 3000, 8000, 15000)], scores: { c1: 6, c2: 6, c3: 9 } }
      ]
    },
    buildVsBuy: {
      title: 'Build our own booking system or buy software', horizon: 36, discountRate: 8,
      criteria: [{ id: 'c1', name: 'Fit to how we work', weight: 3 }, { id: 'c2', name: 'Vendor lock-in risk (higher = less lock-in)', weight: 2 }, { id: 'c3', name: 'Time to go live', weight: 2 }],
      options: [
        { name: 'Build custom', oneOff: rg(40000, 60000, 95000), delay: rg(3, 5, 8), ramp: 2,
          lines: [line('Hosting + maintenance contract', 'cost', 800, 1200, 2000), line('Admin time saved + extra bookings', 'benefit', 4000, 5500, 7000)],
          risks: [risk('Key developer unavailable', 20, 5000, 15000, 30000), risk('Security fix needed', 15, 2000, 6000, 15000)], scores: { c1: 9, c2: 8, c3: 3 } },
        { name: 'Buy SaaS', oneOff: rg(2000, 4000, 8000), delay: rg(0.5, 1, 2), ramp: 2,
          lines: [line('Subscription', 'cost', 450, 600, 800), line('Admin time saved + extra bookings', 'benefit', 3000, 4500, 6000)],
          risks: [risk('Price rise at renewal', 50, 1000, 3000, 6000), risk('Forced migration (vendor closes / changes)', 8, 5000, 12000, 25000)], scores: { c1: 6, c2: 4, c3: 9 } }
      ]
    }
  };
  var TEMPLATE_NAMES = { hireVsAutomate: 'Hire two staff vs automate a process', leaseVsBuy: 'Lease vs buy (vehicle or equipment)', secondSite: 'Second location vs expand online', buildVsBuy: 'Build vs buy software' };
  function fromTemplate(key, uid) {
    var t = JSON.parse(JSON.stringify(TEMPLATES[key] || TEMPLATES.hireVsAutomate)), i = 0;
    uid = uid || function () { return 'id' + (++i) + Math.random().toString(36).slice(2, 6); };
    t.id = uid(); t.runs = 5000; t.seed = 42; t.notes = '';
    t.options.forEach(function (o) { o.id = uid(); });
    return t;
  }
  function blankOption(uid, n) {
    return { id: uid(), name: 'Option ' + (n || ''), oneOff: rg(0, 0, 0), delay: rg(0, 0, 0), ramp: 0, lines: [line('Monthly cost', 'cost', 0, 0, 0), line('Monthly benefit', 'benefit', 0, 0, 0)], risks: [], scores: {} };
  }

  // ---------- import / export ----------
  function validate(d) {
    var errs = [];
    if (!d || typeof d !== 'object') return ['Not a decision file.'];
    if (!Array.isArray(d.options) || !d.options.length) errs.push('It has no options.');
    else if (d.options.length > 5) errs.push('At most 5 options can be compared.');
    (d.options || []).forEach(function (o, i) { if (!o || typeof o !== 'object' || !Array.isArray(o.lines || [])) errs.push('Option ' + (i + 1) + ' is malformed.'); });
    return errs;
  }
  function importFile(text) {
    var j = JSON.parse(text), list = Array.isArray(j) ? j : Array.isArray(j.decisions) ? j.decisions : [j];
    var ok = [], bad = [];
    list.forEach(function (d, i) { var e = validate(d); if (e.length) bad.push('Decision ' + (i + 1) + ': ' + e.join(' ')); else ok.push(d); });
    return { decisions: ok, errors: bad };
  }

  // Cash view by year (for the table and the paper)
  function cashTable(d, res) {
    var H = horizonOf(d), Y = Math.ceil(H / 12);
    return res.base.map(function (b) {
      var row = { name: b.name, upfront: b.flows[0] };
      for (var y = 0; y < Y; y++) row['y' + (y + 1)] = b.years[y] || 0;
      row.total = b.total; row.npv = b.npv; row.payback = b.payback; return row;
    });
  }

  // ---------- printable decision paper ----------
  function paperHtml(d, res, today) {
    var e = B.esc, H = horizonOf(d), Y = Math.ceil(H / 12), rec = res.recommendation;
    var h = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + e('Decision paper — ' + (d.title || 'Decision')) + '</title><style>' +
      'body{font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d1f24;margin:0;padding:32px;max-width:860px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}' +
      'table{width:100%;border-collapse:collapse;margin:8px 0}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}th{background:#f3f1ea}td.n,th.n{text-align:right;white-space:nowrap}' +
      '.muted{color:#5d6270}.box{background:#f7f6f2;padding:12px 14px;border-radius:8px}.warn{color:#a66300}ul{padding-left:20px}@media print{body{padding:0}}</style></head><body>';
    h += '<p class="muted">Decision paper · ' + e(today || '') + '</p><h1>' + e(d.title || 'Decision') + '</h1>';
    if (d.notes) h += '<p>' + e(d.notes).replace(/\n/g, '<br>') + '</p>';
    h += '<h2>Recommendation</h2><div class="box"><p><b>' + e(rec.headline) + '</b></p><ul>' + rec.points.map(function (p) { return '<li>' + e(p) + '</li>'; }).join('') + '</ul>' +
      (rec.caveats.length ? '<p class="warn"><b>Watch out</b></p><ul>' + rec.caveats.map(function (p) { return '<li>' + e(p) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
    h += '<h2>Outcomes from ' + res.sim.runs.toLocaleString('en-AU') + ' simulated futures (net present value)</h2><table><thead><tr><th>Option</th><th class="n">Pessimistic (P10)</th><th class="n">Middle (P50)</th><th class="n">Optimistic (P90)</th><th class="n">Chance best</th><th class="n">Chance of loss</th></tr></thead><tbody>' +
      res.sim.options.map(function (o) { return '<tr><td>' + e(o.name) + '</td><td class="n">' + money(o.p10) + '</td><td class="n">' + money(o.p50) + '</td><td class="n">' + money(o.p90) + '</td><td class="n">' + pct(o.probBest) + '</td><td class="n">' + pct(o.probLoss) + '</td></tr>'; }).join('') + '</tbody></table>';
    var rows = cashTable(d, res), yh = '';
    for (var y = 1; y <= Y; y++) yh += '<th class="n">Year ' + y + '</th>';
    h += '<h2>Cash view, likely case</h2><table><thead><tr><th>Option</th><th class="n">Up-front</th>' + yh + '<th class="n">Total</th><th class="n">NPV</th><th class="n">Payback</th></tr></thead><tbody>' +
      rows.map(function (r) { var c = ''; for (var y = 1; y <= Y; y++) c += '<td class="n">' + money(r['y' + y]) + '</td>'; return '<tr><td>' + e(r.name) + '</td><td class="n">' + money(r.upfront) + '</td>' + c + '<td class="n">' + money(r.total) + '</td><td class="n">' + money(r.npv) + '</td><td class="n">' + e(monthText(r.payback)) + '</td></tr>'; }).join('') + '</tbody></table>';
    h += '<h2>What moves the result most</h2>';
    res.tornado.forEach(function (t, i) {
      h += '<p><b>' + e(d.options[i].name) + '</b></p><table><thead><tr><th>Input</th><th class="n">NPV at low end</th><th class="n">NPV at high end</th><th class="n">Swing</th></tr></thead><tbody>' +
        t.items.slice(0, 5).map(function (it) { return '<tr><td>' + e(it.label) + '</td><td class="n">' + money(it.npvAtLow) + '</td><td class="n">' + money(it.npvAtHigh) + '</td><td class="n">' + money(it.swing) + '</td></tr>'; }).join('') + '</tbody></table>';
    });
    var crit = (d.criteria || []).filter(function (c) { return num(c.weight) > 0; });
    if (crit.length) {
      h += '<h2>Non-money criteria (score 0–10, weighted)</h2><table><thead><tr><th>Criterion</th><th class="n">Weight</th>' + d.options.map(function (o) { return '<th class="n">' + e(o.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        crit.map(function (c) { return '<tr><td>' + e(c.name) + '</td><td class="n">' + e(c.weight) + '</td>' + d.options.map(function (o) { return '<td class="n">' + e(num((o.scores || {})[c.id])) + '</td>'; }).join('') + '</tr>'; }).join('') +
        '<tr><td><b>Weighted score /100</b></td><td></td>' + res.criteria.map(function (c) { return '<td class="n"><b>' + (c.score == null ? '–' : Math.round(c.score)) + '</b></td>'; }).join('') + '</tr></tbody></table>';
    }
    h += '<h2>Inputs</h2>';
    d.options.forEach(function (o) {
      var oo = range(o.oneOff), dl = range(o.delay);
      h += '<p><b>' + e(o.name) + '</b> — one-off ' + money(oo.low) + ' / ' + money(oo.likely) + ' / ' + money(oo.high) + '; benefits start after ' + dl.low + ' / ' + dl.likely + ' / ' + dl.high + ' months' + (num(o.ramp) ? ', reaching full level over ' + num(o.ramp) + ' months' : '') + '.</p>' +
        '<table><thead><tr><th>Monthly line</th><th class="n">Low</th><th class="n">Likely</th><th class="n">High</th></tr></thead><tbody>' +
        (o.lines || []).map(function (l) { var r = range(l); return '<tr><td>' + e(l.label) + ' <span class="muted">(' + (l.kind === 'benefit' ? 'benefit' : 'cost') + ')</span></td><td class="n">' + money(r.low) + '</td><td class="n">' + money(r.likely) + '</td><td class="n">' + money(r.high) + '</td></tr>'; }).join('') +
        (o.risks || []).map(function (rk) { var r = range(rk.impact); return '<tr><td>Risk: ' + e(rk.label) + ' <span class="muted">(' + clampPct(rk.prob) + '% chance, one-off)</span></td><td class="n">' + money(r.low) + '</td><td class="n">' + money(r.likely) + '</td><td class="n">' + money(r.high) + '</td></tr>'; }).join('') + '</tbody></table>' +
        (o.note ? '<p class="muted">' + e(o.note) + '</p>' : '');
    });
    h += '<h2>Assumptions</h2><ul>' + rec.assumptions.map(function (a) { return '<li>' + e(a) + '</li>'; }).join('') + '</ul>';
    h += '<p class="muted">Prepared with the free Brahaspati Decision Simulator. A model is only as good as its inputs — treat this as a structured way to think, not a guarantee.</p></body></html>';
    return h;
  }

  var L = {
    rng: rng, range: range, triangular: triangular, triMean: triMean, quantile: quantile, monthlyRate: monthlyRate, npv: npv, payback: payback,
    flowsFor: flowsFor, baseCase: baseCase, simulate: simulate, tornado: tornado, criteriaScores: criteriaScores, analyse: analyse, recommend: recommend,
    TEMPLATES: TEMPLATES, TEMPLATE_NAMES: TEMPLATE_NAMES, fromTemplate: fromTemplate, blankOption: blankOption, validate: validate, importFile: importFile,
    cashTable: cashTable, paperHtml: paperHtml, money: money, r2: r2, monthText: monthText, paybackText: paybackText
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.DecisionLib = L;
})(this);
