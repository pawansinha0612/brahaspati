/* Vendor Comparison — pure logic: proposal text extraction, total cost of ownership, weighted scoring,
   sensitivity, red flags, follow-up questions and the recommendation memo. No DOM. */
(function (root) {
  'use strict';

  var GST = 0.1;
  function num(v) { if (typeof v === 'number') return v; var s = String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''); var n = parseFloat(s); return isNaN(n) ? NaN : n; }
  function has(v) { return v != null && v !== '' && !(typeof v === 'number' && isNaN(v)); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function blankVendor(name) {
    return { id: '', name: name || '', oneOff: '', monthly: '', annual: '', perUnit: '', unitLabel: '', gst: 'unknown',
      contractMonths: '', noticeDays: '', paymentTerms: '', responseHours: '', uptime: '', warrantyMonths: '',
      autoRenew: false, escalationPct: '', escalationNote: '', inclusions: [], exclusions: [], notes: '', source: '' };
  }

  // ---------- extraction ----------
  var MONEY = /(?:A?\$|AUD\s?)\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(\s?[kK]\b)?/g;
  function moneyIn(line) {
    var out = [], m; MONEY.lastIndex = 0;
    while ((m = MONEY.exec(line))) { var n = parseFloat(m[1].replace(/,/g, '')); if (m[2]) n *= 1000; out.push({ value: n, index: m.index, end: m.index + m[0].length }); }
    return out;
  }
  function toMonths(n, unit) { unit = String(unit).toLowerCase(); return /^y/.test(unit) ? n * 12 : /^w/.test(unit) ? Math.round(n / 4.345) : n; }
  function toDays(n, unit) { unit = String(unit).toLowerCase(); return /^m/.test(unit) ? n * 30 : /^w/.test(unit) ? n * 7 : n; }
  var WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, eighteen: 18, twenty: 20, thirty: 30, sixty: 60, ninety: 90 };
  function wordsToDigits(t) { return t.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen|twenty|thirty|sixty|ninety)\b(?![- ]?off)(?:\s*\(\d+\))?/gi, function (w) { return String(WORDNUM[w.replace(/\s*\(\d+\)/, '').toLowerCase()]); }); }

  // Classify one price by the words around it.
  function priceKind(line, at) {
    var l = line.toLowerCase(), after = l.slice(at, at + 60), before = l.slice(Math.max(0, at - 70), at);
    if (/\btotal\b|\bsubtotal\b|\bsavings?\b|\bdiscount\b|\bdeposit\b/.test(before + ' ' + after.slice(0, 25))) return null;
    var perUnit = after.match(/^[^a-z]*(?:[^.;\n]{0,12}?)\b(?:per|\/|each|ea\b)\s*(user|seat|licen[cs]e|device|unit|item|pallet|carton|parcel|hour|hr|visit|call|transaction|order|kg|tonne|km|page|employee|staff|site|bin|lift|room|desk|cubic metre|m3|shift)/);
    if (perUnit) return { kind: 'perUnit', unit: perUnit[1] };
    if (/^[^.;\n]{0,25}?(per\s*month|\/\s*month|\/\s*mth|\/\s*mo\b|a month|monthly|p\.?\s?m\.?(?![a-z]))/.test(after) || /monthly|per month|month(ly)? fee|subscription/.test(before.slice(-40))) return { kind: 'monthly' };
    if (/^[^.;\n]{0,25}?(per\s*(annum|year)|\/\s*(year|yr|annum)|a year|annually|yearly|p\.?\s?a\.?(?![a-z]))/.test(after) || /annual|yearly|per year|per annum/.test(before.slice(-40))) return { kind: 'annual' };
    if (/^[^.;\n]{0,25}?(per\s*quarter|quarterly|\/\s*quarter)/.test(after) || /quarterly/.test(before.slice(-40))) return { kind: 'quarterly' };
    if (/^[^.;\n]{0,25}?(per\s*week|weekly|\/\s*week|\/\s*wk)/.test(after) || /weekly/.test(before.slice(-40))) return { kind: 'weekly' };
    if (/one[- ]?off|once[- ]?off|set[- ]?up|establishment|install|implementation|onboarding fee|upfront|up-front|purchase price|supply and install|hardware|commissioning|delivery fee|migration/.test(before + ' ' + after.slice(0, 30))) return { kind: 'oneOff' };
    return { kind: 'oneOff', guess: true };
  }

  function extract(text) {
    var v = blankVendor(''), raw = String(text || ''), t = wordsToDigits(raw.replace(/\r/g, ''));
    var lines = t.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var lower = t.toLowerCase(), found = [], m;
    v.source = raw.slice(0, 20000);

    // name: "Company Pty Ltd" / "From: X" / first short line
    m = t.match(/^\s*(?:from|vendor|supplier|company|prepared by|quote from)\s*[:\-]\s*(.+)$/im) || t.match(/([A-Z][A-Za-z0-9&'.\- ]{1,50}?\s(?:Pty\.?\s?Ltd\.?|Ltd|Limited|Pty|Group|Services|Solutions|Co\.))/);
    if (m) v.name = m[1].trim().replace(/[.,]$/, '');
    else if (lines[0] && lines[0].length < 50) v.name = lines[0];

    // prices
    var sums = { oneOff: 0, monthly: 0, annual: 0, perUnit: 0 }, seen = { oneOff: 0, monthly: 0, annual: 0, perUnit: 0 }, unit = '';
    lines.forEach(function (line) {
      moneyIn(line).forEach(function (p) {
        var k = priceKind(line, p.end); if (!k) return;
        var kind = k.kind, val = p.value;
        if (kind === 'quarterly') { kind = 'annual'; val *= 4; }
        if (kind === 'weekly') { kind = 'monthly'; val = val * 52 / 12; }
        if (kind === 'perUnit') { if (seen.perUnit) return; unit = unit || k.unit; }
        sums[kind] += val; seen[kind]++;
        found.push({ kind: kind, value: round2(val), line: line.slice(0, 160), guess: !!k.guess });
      });
    });
    ['oneOff', 'monthly', 'annual', 'perUnit'].forEach(function (k) { if (seen[k]) v[k] = round2(sums[k]); });
    v.unitLabel = unit;

    // GST
    if (/\b(?:inc\.?|incl\.?|including|inclusive of|includes?|included)\s*(?:of\s*)?gst\b|gst[- ]inclusive|gst inc(?:luded)?\b|gst is included/i.test(t)) v.gst = 'inc';
    if (/(?:\bex\.?|\bexcl\.?|\bexc\.?|\bexcluding|\bexclusive of|\bexcludes?|\bexcluded|\bplus|\+)\s*(?:of\s*)?gst\b|gst[- ]exclusive|gst (?:is )?extra|gst (?:is )?not included|gst (?:is )?additional|gst will be added/i.test(t)) v.gst = v.gst === 'inc' ? 'unknown' : 'ex';

    // contract length / minimum term
    m = lower.match(/(?:contract|minimum|initial|fixed)\s*(?:term|period|length)?\s*(?:of|is|:|-)?\s*(\d+)\s*(months?|years?|yrs?)/) ||
        lower.match(/(\d+)[- ]?(months?|years?|yrs?)\s*(?:minimum\s*)?(?:contract|term|agreement|commitment|lock[- ]?in)/) ||
        lower.match(/term\s*(?:of|:)\s*(\d+)\s*(months?|years?)/);
    if (m) v.contractMonths = toMonths(+m[1], m[2]);
    else if (/no (lock[- ]?in|minimum term|contract)|month[- ]to[- ]month|cancel any ?time/.test(lower)) v.contractMonths = 0;

    // notice period
    m = lower.match(/(\d+)\s*(days?|weeks?|months?)['’]?\s*(?:prior\s*)?(?:written\s*)?notice/) || lower.match(/notice\s*(?:period)?\s*(?:of|:|is)?\s*(\d+)\s*(days?|weeks?|months?)/);
    if (m) v.noticeDays = toDays(+m[1], m[2]);

    // payment terms
    m = lower.match(/(?:payment terms?|payable|invoices? (?:are )?(?:due|payable))[^.\n]{0,40}?(\d+)\s*days/) || lower.match(/\bnet\s*(\d+)\b/) || lower.match(/within\s*(\d+)\s*days\s*(?:of|from)\s*(?:the\s*)?(?:date of\s*)?invoice/);
    if (m) v.paymentTerms = m[1] + ' days';
    else if ((m = lower.match(/(?:payable|paid|billed|invoiced)\s*(monthly|quarterly|annually)?\s*in advance/))) v.paymentTerms = 'In advance' + (m[1] ? ' (' + m[1] + ')' : '');
    else if (/payment (?:is )?due on (?:receipt|invoice)|due upon receipt|cod\b|payment on delivery/.test(lower)) v.paymentTerms = 'On receipt';
    if ((m = lower.match(/(\d+)\s*%\s*deposit/))) v.paymentTerms = (v.paymentTerms ? v.paymentTerms + '; ' : '') + m[1] + '% deposit';

    // SLA
    m = lower.match(/respon[a-z]*\s*(?:time|times)?(?:\s*(?:of|within|:|is|-|under|guaranteed|in))*\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|business hours?|business days?|days?)/) ||
        lower.match(/(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|business days?|days?)\s*(?:response|respond)/);
    if (m) { var n = +m[1], u = m[2]; v.responseHours = /^min/.test(u) ? round2(n / 60) : /day/.test(u) ? n * (/business/.test(u) ? 8 : 24) : n; }
    m = lower.match(/(\d{2}(?:\.\d+)?)\s*%\s*(?:network\s*|service\s*|system\s*)?(?:uptime|availability|available)/) || lower.match(/(?:uptime|availability)\s*(?:of|:|guarantee(?:d)?(?: of)?)?\s*(\d{2}(?:\.\d+)?)\s*%/);
    if (m) v.uptime = +m[1];

    // warranty
    m = lower.match(/(\d+)[- ]?(months?|years?|yrs?)['’]?\s*(?:parts and labour\s*|manufacturer'?s?\s*|limited\s*|full\s*)?warrant/) || lower.match(/warrant[a-z]*\s*(?:period)?\s*(?:of|:|-|is)?\s*(\d+)\s*(months?|years?)/);
    if (m) v.warrantyMonths = toMonths(+m[1], m[2]);

    // auto-renewal
    if (/auto(?:matic(?:ally)?)?[- ]?renew|renews? automatically|rolls? over|evergreen|will be renewed for (?:a )?(?:further|subsequent)/.test(lower)) v.autoRenew = true;

    // price escalation
    m = lower.match(/(\d+(?:\.\d+)?)\s*%\s*(?:per annum|p\.?a\.?|annual|yearly|each year|every year|per year)?\s*(?:price\s*)?(?:increase|escalation|uplift|rise|indexation)/) ||
        lower.match(/(?:increase|escalat[a-z]*|uplift|indexation|rise)[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*%/);
    if (m) { v.escalationPct = +m[1]; v.escalationNote = (lower.match(/[^.\n]*(?:increase|escalat|uplift|index)[^.\n]*/) || [''])[0].trim().slice(0, 160); }
    else if (/\bcpi\b|consumer price index/.test(lower) && /increase|adjust|index|review/.test(lower)) { v.escalationNote = 'Prices linked to CPI (rate not stated)'; v.escalationPct = 3; }
    else if (/prices? (?:may|can) (?:be )?(?:increase|change|review)|subject to (?:annual )?(?:price )?review|reserve the right to (?:increase|vary|adjust)/.test(lower)) v.escalationNote = 'Prices can change (amount not stated)';

    // inclusions / exclusions
    var mode = null;
    lines.forEach(function (line) {
      var l = line.toLowerCase();
      var head = l.match(/^(what'?s included|inclusions?|included|includes|scope includes|the price includes|price includes|exclusions?|excluded|excludes|not included|what'?s not included|the price excludes|price excludes)\s*[:\-–]?\s*(.*)$/);
      if (head) {
        mode = /excl|not included/.test(head[1]) ? 'exclusions' : 'inclusions';
        if (head[2]) head[2].split(/[;,]\s*(?=[a-z])/i).forEach(function (x) { x = x.replace(/^[\-•*·]\s*/, '').replace(/[.;]+$/, '').trim(); if (x.length > 2) v[mode].push(x); });
        return;
      }
      if (mode && /^([\-•*·▪◦]|\d+[.)]\s|[a-z][.)]\s)/.test(line)) { var item = line.replace(/^([\-•*·▪◦]|\d+[.)]|[a-z][.)])\s*/, '').replace(/[.;]+$/, '').trim(); if (item) v[mode].push(item.slice(0, 140)); return; }
      if (mode && line.length < 80 && !/[:]$/.test(line) && !/\$/.test(line) && v[mode].length && !/^[A-Z][A-Za-z ]+:$/.test(line) && !/^(payment|price|pricing|contract|term|warranty|notice|sla|service level|support)/i.test(line)) { v[mode].push(line); return; }
      mode = null;
    });
    v.inclusions = v.inclusions.slice(0, 20); v.exclusions = v.exclusions.slice(0, 20);
    v.prices = found;
    return v;
  }

  // ---------- total cost of ownership ----------
  // opts: {years, volume (units per month), gstRate, basis: 'ex'|'inc'}
  function tco(v, opts) {
    opts = opts || {}; var years = Math.max(1, Math.round(num(opts.years) || 3)), vol = num(opts.volume) || 0, rate = opts.gstRate == null ? GST : opts.gstRate;
    var toEx = v.gst === 'inc' ? 1 / (1 + rate) : 1, out = opts.basis === 'inc' ? 1 + rate : 1, f = toEx * out;
    var oneOff = (num(v.oneOff) || 0) * f, monthly = (num(v.monthly) || 0) * f, annual = (num(v.annual) || 0) * f, unit = (num(v.perUnit) || 0) * f;
    var esc = (num(v.escalationPct) || 0) / 100, perYear = [], recurring = 0, usage = 0;
    for (var y = 0; y < years; y++) {
      var k = Math.pow(1 + esc, y), r = (monthly * 12 + annual) * k, u = unit * vol * 12 * k;
      recurring += r; usage += u; perYear.push(round2((y === 0 ? oneOff : 0) + r + u));
    }
    var total = oneOff + recurring + usage;
    return { years: years, oneOff: round2(oneOff), recurring: round2(recurring), usage: round2(usage), total: round2(total), perYear: perYear,
      monthlyAverage: round2(total / (years * 12)), gstAssumed: v.gst === 'unknown', priced: has(v.oneOff) || has(v.monthly) || has(v.annual) || has(v.perUnit) };
  }

  // ---------- scoring ----------
  // Price criterion scored automatically from TCO: cheapest = 5, dearest = 1, linear between.
  function priceScores(totals) {
    var vals = totals.filter(function (x) { return x > 0; }); if (!vals.length) return totals.map(function () { return null; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    return totals.map(function (t) { if (!(t > 0)) return null; return hi === lo ? 5 : round2(1 + 4 * (hi - t) / (hi - lo)); });
  }
  // criteria [{id,name,weight,auto}], scores {vendorId:{critId:{score,note}}}, auto {critId:{vendorId:score}}
  function scoreOf(scores, auto, vid, c) {
    if (auto && auto[c.id] && auto[c.id][vid] != null) return auto[c.id][vid];
    var s = scores && scores[vid] && scores[vid][c.id]; var n = s ? num(s.score) : NaN; return isNaN(n) ? null : Math.max(1, Math.min(5, n));
  }
  function weighted(vendors, criteria, scores, auto, weights) {
    return vendors.map(function (v) {
      var sum = 0, wsum = 0, missing = 0;
      criteria.forEach(function (c, i) {
        var w = weights ? weights[i] : (num(c.weight) || 0); if (w <= 0) return;
        var s = scoreOf(scores, auto, v.id, c); if (s == null) { missing++; return; }
        sum += w * s; wsum += w;
      });
      var totalW = criteria.reduce(function (a, c, i) { return a + Math.max(0, weights ? weights[i] : (num(c.weight) || 0)); }, 0);
      // Missing scores count as 0 so an unscored vendor cannot win by default.
      return { id: v.id, name: v.name, score: totalW ? round2(sum / totalW) : 0, pct: totalW ? round2(sum / totalW / 5 * 100) : 0, missing: missing, scoredWeight: wsum };
    });
  }
  function rank(results) { return results.slice().sort(function (a, b) { return b.score - a.score || a.name.localeCompare(b.name); }); }
  function winner(results) { var r = rank(results); if (!r.length) return null; return (r.length > 1 && r[0].score === r[1].score) ? null : r[0]; }

  // Does the winner change if any single weight moves ±pct? Plus a random shake of all weights at once.
  function sensitivity(vendors, criteria, scores, auto, pct, runs, seed) {
    pct = pct == null ? 0.2 : pct; runs = runs || 500;
    var base = criteria.map(function (c) { return Math.max(0, num(c.weight) || 0); });
    var baseRes = weighted(vendors, criteria, scores, auto), baseWin = winner(baseRes);
    var flips = [];
    criteria.forEach(function (c, i) {
      [1 + pct, 1 - pct].forEach(function (k) {
        if (!base[i]) return;
        var w = base.slice(); w[i] = base[i] * k;
        var win = winner(weighted(vendors, criteria, scores, auto, w));
        if (!win || !baseWin || win.id !== baseWin.id) flips.push({ criterion: c.name, change: (k > 1 ? '+' : '−') + Math.round(pct * 100) + '%', winner: win ? win.name : 'a tie' });
      });
    });
    var s = (seed || 12345) >>> 0; function rnd() { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }
    var wins = {}; vendors.forEach(function (v) { wins[v.id] = 0; });
    for (var r = 0; r < runs; r++) {
      var w2 = base.map(function (b) { return b * (1 - pct + 2 * pct * rnd()); });
      var wn = winner(weighted(vendors, criteria, scores, auto, w2)); if (wn) wins[wn.id]++;
    }
    var share = vendors.map(function (v) { return { id: v.id, name: v.name, share: runs ? round2(wins[v.id] / runs) : 0 }; }).sort(function (a, b) { return b.share - a.share; });
    var margin = (function () { var r = rank(baseRes); return r.length > 1 ? round2(r[0].score - r[1].score) : null; })();
    return { winner: baseWin, stable: !flips.length, flips: flips, share: share, margin: margin };
  }

  // ---------- red flags & questions ----------
  function redFlags(v, opts) {
    opts = opts || {}; var f = [], lock = opts.lockInMonths || 24, years = opts.years || 3;
    function add(level, text) { f.push({ level: level, text: text }); }
    if (!has(v.responseHours) && !has(v.uptime)) add('bad', 'No service level (response time or uptime) stated.');
    else if (has(v.responseHours) && num(v.responseHours) > 24) add('warn', 'Slow response time: ' + v.responseHours + ' hours.');
    if (v.autoRenew) add('bad', 'Contract renews automatically unless you give notice in time.');
    if (has(v.escalationPct) && num(v.escalationPct) > 0) add(num(v.escalationPct) >= 5 ? 'bad' : 'warn', 'Prices rise ' + v.escalationPct + '% a year' + (v.escalationNote && /cpi/i.test(v.escalationNote) ? ' (CPI — rate assumed)' : '') + '.');
    else if (v.escalationNote) add('warn', v.escalationNote + '.');
    if (has(v.contractMonths) && num(v.contractMonths) > lock) add('bad', 'Long lock-in: ' + v.contractMonths + ' months minimum.');
    if (has(v.contractMonths) && num(v.contractMonths) > years * 12) add('warn', 'Minimum term (' + v.contractMonths + ' months) is longer than your ' + years + '-year comparison period.');
    if (has(v.noticeDays) && num(v.noticeDays) >= 90) add('warn', 'Long notice period: ' + v.noticeDays + ' days.');
    if (!has(v.contractMonths)) add('warn', 'Contract length not stated.');
    if (!has(v.noticeDays)) add('warn', 'Notice / cancellation period not stated.');
    if (v.gst === 'unknown') add('warn', 'Not clear if prices include GST (treated as GST-exclusive).');
    if (!(has(v.oneOff) || has(v.monthly) || has(v.annual) || has(v.perUnit))) add('bad', 'No prices found.');
    if (has(v.perUnit) && !(num(opts.volume) > 0)) add('warn', 'Has per-' + (v.unitLabel || 'unit') + ' charges but no expected volume entered — costs may be understated.');
    if (/in advance/i.test(v.paymentTerms || '') && (num(v.annual) > 0)) add('warn', 'Annual fees payable in advance.');
    var dep = String(v.paymentTerms || '').match(/(\d+)%\s*deposit/); if (dep && +dep[1] > 30) add('warn', 'Large deposit required (' + dep[1] + '%).');
    if (opts.wantWarranty && !has(v.warrantyMonths)) add('warn', 'No warranty stated.');
    if ((v.exclusions || []).length >= 5) add('warn', (v.exclusions || []).length + ' exclusions — check what extra costs these could create.');
    return f;
  }

  function questions(v, opts) {
    opts = opts || {}; var q = [];
    if (!(has(v.oneOff) || has(v.monthly) || has(v.annual) || has(v.perUnit))) q.push('Please provide a full price breakdown: one-off (set-up, installation) costs, recurring monthly or annual fees, and any per-unit or usage charges.');
    if (v.gst === 'unknown') q.push('Are your prices inclusive or exclusive of GST?');
    if (!has(v.contractMonths)) q.push('What is the minimum contract term, and is there a month-to-month option?');
    if (!has(v.noticeDays)) q.push('How much notice is needed to cancel, and are there any exit or early-termination fees?');
    if (!v.paymentTerms) q.push('What are your payment terms (e.g. 14 or 30 days from invoice), and is any payment required in advance?');
    if (!has(v.responseHours) && !has(v.uptime)) q.push('What service levels do you commit to (response and resolution times, uptime/availability), and what credits apply if you miss them?');
    if (!has(v.warrantyMonths) && opts.wantWarranty) q.push('What warranty applies, for how long, and does it cover parts and labour?');
    if (v.autoRenew) q.push('Can the automatic renewal be removed, or changed so that renewal needs our written agreement?');
    if (has(v.escalationPct) || v.escalationNote) q.push('How are price increases calculated, how much notice do you give, and can increases be capped (e.g. at CPI or 3% a year)?');
    else q.push('Will prices stay fixed for the whole term? If not, how are increases capped?');
    if (has(v.perUnit)) q.push('Is the per-' + (v.unitLabel || 'unit') + ' rate tiered? What happens if our volume is higher or lower than expected?');
    if (has(v.contractMonths) && num(v.contractMonths) > 24) q.push('Would you offer a shorter initial term (12–24 months) and what would the price difference be?');
    if (!(v.exclusions || []).length) q.push('Is anything excluded from the price (travel, after-hours work, consumables, data migration, training)?');
    q.push('Can you provide two references from similar-sized Australian customers?');
    return q;
  }

  // ---------- comparison table ----------
  function bestIndex(values, dir) {
    var nums = values.map(function (x) { return has(x) ? num(x) : NaN; }), ok = nums.filter(function (x) { return !isNaN(x); });
    if (ok.length < 2 || !dir) return [];
    var best = dir === 'low' ? Math.min.apply(null, ok) : Math.max.apply(null, ok);
    if (ok.every(function (x) { return x === best; })) return [];
    return nums.map(function (x, i) { return x === best ? i : -1; }).filter(function (i) { return i >= 0; });
  }
  function rows(vendors, tcos, results) {
    function r(label, key, dir, get) { var vals = vendors.map(get || function (v) { return v[key]; }); return { label: label, values: vals, best: bestIndex(vals, dir), dir: dir }; }
    var out = [
      r('Total cost of ownership', null, 'low', function (v, i) { return tcos[vendors.indexOf(v)].total; }),
      r('Average per month', null, 'low', function (v) { return tcos[vendors.indexOf(v)].monthlyAverage; }),
      r('One-off costs', 'oneOff', 'low'), r('Monthly fee', 'monthly', 'low'), r('Annual fee', 'annual', 'low'), r('Per-unit rate', 'perUnit', 'low'),
      r('Prices quoted', 'gst', null, function (v) { return v.gst === 'inc' ? 'Incl. GST' : v.gst === 'ex' ? 'Excl. GST' : 'Not stated'; }),
      r('Contract (months)', 'contractMonths', 'low'), r('Notice (days)', 'noticeDays', 'low'), r('Payment terms', 'paymentTerms', null),
      r('Response time (hours)', 'responseHours', 'low'), r('Uptime %', 'uptime', 'high'), r('Warranty (months)', 'warrantyMonths', 'high'),
      r('Price rise % a year', 'escalationPct', 'low'), r('Auto-renews', 'autoRenew', null, function (v) { return v.autoRenew ? 'Yes' : 'No'; }),
      r('Inclusions', null, 'high', function (v) { return (v.inclusions || []).length; }), r('Exclusions', null, 'low', function (v) { return (v.exclusions || []).length; })
    ];
    if (results) out.unshift(r('Weighted score (out of 5)', null, 'high', function (v) { var x = results.filter(function (y) { return y.id === v.id; })[0]; return x ? x.score : ''; }));
    return out;
  }

  var DEFAULT_CRITERIA = [
    { id: 'price', name: 'Total cost', weight: 35, auto: true },
    { id: 'quality', name: 'Quality and fit for our needs', weight: 20 },
    { id: 'service', name: 'Service levels and support', weight: 15 },
    { id: 'terms', name: 'Contract terms and flexibility', weight: 10 },
    { id: 'experience', name: 'Experience and references', weight: 10 },
    { id: 'risk', name: 'Risk (financial, delivery)', weight: 10 }
  ];

  // ---------- memo ----------
  function memoHTML(st, calc, fmtMoney) {
    var money = fmtMoney || function (n) { return '$' + (Math.round(n * 100) / 100).toLocaleString('en-AU'); };
    var res = rank(calc.results), win = calc.sensitivity.winner, o = [];
    o.push('<h1>' + esc(st.title || 'Supplier recommendation') + '</h1>');
    o.push('<p><b>Prepared:</b> ' + esc(st.date || '') + (st.preparedBy ? ' · <b>By:</b> ' + esc(st.preparedBy) : '') + '</p>');
    o.push('<h2>Recommendation</h2>');
    if (win) o.push('<p>We recommend <b>' + esc(win.name) + '</b>, which scored ' + win.score.toFixed(2) + ' out of 5 (' + win.pct.toFixed(0) + '%) on our weighted criteria' +
      (calc.sensitivity.margin != null ? ', ' + calc.sensitivity.margin.toFixed(2) + ' points ahead of the next option' : '') + '.</p>');
    else o.push('<p>No clear winner — the top options are tied. Gather the missing information below and re-score.</p>');
    o.push('<p>' + (calc.sensitivity.stable ? 'The result is <b>robust</b>: moving any single weight by ±' + Math.round(st.sensPct * 100) + '% does not change the winner.' :
      'The result is <b>sensitive</b> to the weights: ' + calc.sensitivity.flips.map(function (f) { return esc(f.criterion) + ' ' + f.change + ' → ' + esc(f.winner); }).join('; ') + '.') +
      ' When all weights were randomly shaken by up to ±' + Math.round(st.sensPct * 100) + '%, ' + calc.sensitivity.share.filter(function (s) { return s.share > 0; }).map(function (s) { return esc(s.name) + ' won ' + Math.round(s.share * 100) + '%'; }).join(', ') + ' of the time.</p>');
    o.push('<h2>Cost over ' + st.years + ' year' + (st.years > 1 ? 's' : '') + ' (' + (st.basis === 'inc' ? 'incl.' : 'excl.') + ' GST)</h2><div style="overflow-x:auto"><table><tr><th>Vendor</th><th>One-off</th><th>Recurring</th><th>Usage</th><th>Total</th><th>Score</th></tr>');
    res.forEach(function (r) {
      var i = st.vendors.map(function (v) { return v.id; }).indexOf(r.id), t = calc.tcos[i];
      o.push('<tr><td>' + esc(r.name) + '</td><td>' + money(t.oneOff) + '</td><td>' + money(t.recurring) + '</td><td>' + money(t.usage) + '</td><td><b>' + money(t.total) + '</b></td><td>' + r.score.toFixed(2) + '</td></tr>');
    });
    o.push('</table></div>');
    if (num(st.volume) > 0) o.push('<p><small>Usage based on ' + esc(st.volume) + ' units a month. Price rises compounded yearly where stated.</small></p>');
    o.push('<h2>Scoring criteria</h2><ul>' + st.criteria.map(function (c) { return '<li>' + esc(c.name) + ' — weight ' + esc(c.weight) + (c.auto ? ' (scored from total cost)' : '') + '</li>'; }).join('') + '</ul>');
    o.push('<h2>Risks and open questions</h2>');
    st.vendors.forEach(function (v, i) {
      var fl = calc.flags[i]; if (!fl.length) return;
      o.push('<h3>' + esc(v.name) + '</h3><ul>' + fl.map(function (f) { return '<li>' + esc(f.text) + '</li>'; }).join('') + '</ul>');
    });
    if (st.memoNotes) o.push('<h2>Notes</h2><p>' + esc(st.memoNotes).replace(/\n/g, '<br>') + '</p>');
    o.push('<p><small>Figures come from the vendors’ proposals as entered; check them against the final signed quotes before committing.</small></p>');
    return o.join('\n');
  }

  var L = { GST: GST, blankVendor: blankVendor, extract: extract, moneyIn: moneyIn, tco: tco, priceScores: priceScores, weighted: weighted, rank: rank, winner: winner,
    sensitivity: sensitivity, redFlags: redFlags, questions: questions, bestIndex: bestIndex, rows: rows, DEFAULT_CRITERIA: DEFAULT_CRITERIA, memoHTML: memoHTML, esc: esc, num: num, has: has };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.VendorLib = L;
})(this);
