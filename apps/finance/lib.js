/* Money Command Centre — pure logic (no DOM). Works in the browser (window.FinanceLib) and Node. */
(function (root) {
  'use strict';

  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) {
    if (!(y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }

  // Bank dates -> 'YYYY-MM-DD'. Australian banks are day-first.
  function parseDate(v) {
    var s = String(v == null ? '' : v).trim(), m;
    if (!s) return null;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return iso(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(\s|$)/))) { var y = +m[3]; if (y < 100) y += 2000; return iso(y, +m[2], +m[1]); }
    if ((m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-,]*(\d{2,4})/))) {
      var mo = MONTHS[m[2].toLowerCase().slice(0, m[2].toLowerCase() === 'sept' ? 4 : 3)]; var yy = +m[3]; if (yy < 100) yy += 2000;
      return mo ? iso(yy, mo, +m[1]) : null;
    }
    if ((m = s.match(/^[A-Za-z]{3,9}\s+(\d{1,2}),?\s+(\d{4})/))) {
      var mo2 = MONTHS[s.slice(0, 3).toLowerCase()]; return mo2 ? iso(+m[2], mo2, +m[1]) : null;
    }
    return null;
  }

  // "$1,234.50", "-12.00", "(12.00)", "12.00 DR", "+5.00", "" -> number or NaN
  function parseAmount(v) {
    if (typeof v === 'number') return v;
    var s = String(v == null ? '' : v).trim(); if (!s) return NaN;
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /^\$?\s*-/.test(s) || /-$/.test(s) || /\bDR\b/i.test(s);
    var t = s.replace(/[^0-9.]/g, '');
    if (!/\d/.test(t)) return NaN;
    var n = parseFloat(t); if (isNaN(n)) return NaN;
    return neg ? -n : n;
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  // ---------- column detection ----------
  var HEAD = {
    date: /(^|\b)(transaction |posted |value |effective )?date\b|^when$/i,
    description: /description|narrative|details|transaction details|memo|particulars|payee|merchant|reference|^transaction$/i,
    amount: /^\s*(amount|amt|value|transaction amount|amount \(aud\))\s*$|^amount/i,
    debit: /debit|withdraw|money out|paid out|^out$|spent/i,
    credit: /credit|deposit|money in|paid in|^in$|received/i,
    balance: /balance/i
  };

  function looksLikeHeader(row) {
    var dates = 0, nums = 0;
    row.forEach(function (c) { if (parseDate(c)) dates++; else if (!isNaN(parseAmount(c)) && /\d/.test(c)) nums++; });
    return dates === 0 && nums === 0;
  }

  // rows: array of arrays (raw CSV). Returns {hasHeader, headers, map:{date,description,amount,debit,credit,balance}, confident, reasons}
  function detectColumns(rows) {
    rows = (rows || []).filter(function (r) { return r && r.some(function (c) { return String(c).trim() !== ''; }); });
    if (!rows.length) return { hasHeader: false, headers: [], map: {}, confident: false, reasons: ['The file is empty.'] };
    var hasHeader = looksLikeHeader(rows[0]);
    var width = Math.max.apply(null, rows.slice(0, 50).map(function (r) { return r.length; }));
    var headers = [];
    for (var i = 0; i < width; i++) headers.push(hasHeader && rows[0][i] && String(rows[0][i]).trim() ? String(rows[0][i]).trim() : 'Column ' + (i + 1));
    var data = rows.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + 200);
    var map = { date: -1, description: -1, amount: -1, debit: -1, credit: -1, balance: -1 }, reasons = [];

    if (hasHeader) {
      headers.forEach(function (h, i) {
        var l = h.toLowerCase();
        if (map.balance < 0 && HEAD.balance.test(l)) { map.balance = i; return; }
        if (map.date < 0 && HEAD.date.test(l)) { map.date = i; return; }
        if (map.debit < 0 && HEAD.debit.test(l) && !/credit/i.test(l)) { map.debit = i; return; }
        if (map.credit < 0 && HEAD.credit.test(l) && !/debit/i.test(l)) { map.credit = i; return; }
        if (map.amount < 0 && HEAD.amount.test(l)) { map.amount = i; return; }
        if (map.description < 0 && HEAD.description.test(l)) { map.description = i; return; }
      });
    }

    // content profile of each column
    var prof = headers.map(function (h, i) {
      var d = 0, n = 0, empty = 0, len = 0, txt = 0;
      data.forEach(function (r) {
        var c = String(r[i] == null ? '' : r[i]).trim();
        if (!c) { empty++; return; }
        if (parseDate(c)) d++; else if (!isNaN(parseAmount(c)) && /^[\s$()+\-\d.,A-Za-z]*$/.test(c) && /\d/.test(c) && !/[a-z]{4,}/i.test(c)) n++; else { txt++; len += c.length; }
      });
      var filled = Math.max(1, data.length - empty);
      return { i: i, date: d / filled, num: n / filled, text: txt / filled, avgLen: txt ? len / txt : 0, empty: empty / Math.max(1, data.length) };
    });
    var used = function (i) { return Object.keys(map).some(function (k) { return map[k] === i; }); };

    if (map.date < 0) { var bd = prof.filter(function (p) { return !used(p.i) && p.date > 0.8; })[0]; if (bd) { map.date = bd.i; reasons.push('Date column found from its values.'); } }
    if (map.description < 0) {
      var bt = prof.filter(function (p) { return !used(p.i) && p.text > 0.6; }).sort(function (a, b) { return b.avgLen - a.avgLen; })[0];
      if (bt) map.description = bt.i;
    }
    if (map.amount < 0 && map.debit < 0 && map.credit < 0) {
      var nums = prof.filter(function (p) { return !used(p.i) && p.num > 0.6; }).map(function (p) { return p.i; });
      if (nums.length >= 2 && map.balance < 0) {
        // Work out which numeric column is a running balance: balance[i] - balance[i-1] == amount[i]
        var best = null;
        nums.forEach(function (a) { nums.forEach(function (b) {
          if (a === b) return; var hit = 0, tot = 0;
          for (var k = 1; k < data.length; k++) {
            var A = parseAmount(data[k][a]), Bp = parseAmount(data[k - 1][b]), Bc = parseAmount(data[k][b]);
            if (isNaN(A) || isNaN(Bp) || isNaN(Bc)) continue; tot++;
            if (Math.abs((Bc - Bp) - A) < 0.011 || Math.abs((Bp - Bc) - parseAmount(data[k - 1][a])) < 0.011) hit++;
          }
          var score = tot ? hit / tot : 0;
          if (!best || score > best.score) best = { amount: a, balance: b, score: score };
        }); });
        if (best && best.score >= 0.5) { map.amount = best.amount; map.balance = best.balance; reasons.push('Running balance matched the amounts.'); }
        else { map.amount = nums[0]; map.balance = nums[nums.length - 1]; reasons.push('Guessed amount and balance by position — please check.'); }
      } else if (nums.length) {
        map.amount = nums[0];
        if (nums.length === 2 && map.balance >= 0) { /* fine */ }
      }
    }
    if (map.balance < 0 && hasHeader === false) {
      var restNum = prof.filter(function (p) { return !used(p.i) && p.num > 0.6; })[0];
      if (restNum) map.balance = restNum.i;
    }
    var hasMoney = map.amount >= 0 || map.debit >= 0 || map.credit >= 0;
    var confident = map.date >= 0 && map.description >= 0 && hasMoney && reasons.every(function (r) { return !/check/.test(r); });
    if (map.date < 0) reasons.push('Could not find a date column.');
    if (map.description < 0) reasons.push('Could not find a description column.');
    if (!hasMoney) reasons.push('Could not find an amount column.');
    return { hasHeader: hasHeader, headers: headers, map: map, confident: confident, reasons: reasons };
  }

  // rows + mapping -> transactions [{date, desc, amount, balance}] (spending is negative)
  function toTransactions(rows, det, opts) {
    opts = opts || {};
    var map = det.map, out = [], skipped = 0;
    var body = (rows || []).slice(det.hasHeader ? 1 : 0);
    body.forEach(function (r) {
      if (!r || !r.some(function (c) { return String(c).trim() !== ''; })) return;
      var date = parseDate(r[map.date]);
      var amt = NaN;
      if (map.amount >= 0) amt = parseAmount(r[map.amount]);
      if (isNaN(amt) && (map.debit >= 0 || map.credit >= 0)) {
        var d = map.debit >= 0 ? parseAmount(r[map.debit]) : NaN, c = map.credit >= 0 ? parseAmount(r[map.credit]) : NaN;
        if (!isNaN(d) && d !== 0) amt = -Math.abs(d); else if (!isNaN(c) && c !== 0) amt = Math.abs(c); else if (!isNaN(d) || !isNaN(c)) amt = 0;
      }
      if (opts.flipSign && !isNaN(amt)) amt = -amt;
      if (!date || isNaN(amt)) { skipped++; return; }
      var desc = String(map.description >= 0 ? r[map.description] || '' : '').replace(/\s+/g, ' ').trim() || '(no description)';
      var bal = map.balance >= 0 ? parseAmount(r[map.balance]) : NaN;
      out.push({ date: date, desc: desc, amount: round2(amt), balance: isNaN(bal) ? null : bal, account: opts.account || '' });
    });
    return { transactions: out, skipped: skipped };
  }

  // ---------- merchants and dedupe ----------
  function merchantKey(desc) {
    var s = String(desc || '').toUpperCase();
    s = s.replace(/^(VISA|EFTPOS|POS|DEBIT CARD|CARD|DIRECT DEBIT|DIRECT CREDIT|BPAY|OSKO|PURCHASE|RECURRING|INTERNET TRANSFER|TRANSFER FROM|TRANSFER TO)\s+(PURCHASE\s+)?/g, '');
    s = s.replace(/^(PAYPAL|SQ|SP|SMP|LS|ZLR|UBER)\s*\*\s*/, function (m, p) { return p === 'UBER' ? 'UBER ' : ''; });
    s = s.replace(/\b(CARD|XX|X)\s*\d{3,}\b/g, ' ').replace(/\bVALUE DATE:?\s*[\d\/]+/g, ' ').replace(/\b\d{2}\/\d{2}(\/\d{2,4})?\b/g, ' ');
    s = s.replace(/\b(AUS?|AU|NSW|VIC|QLD|WA|SA|TAS|ACT|NT|NS)\b/g, ' ').replace(/\b(PTY|LTD|LIMITED|INC|COM|WWW)\b/g, ' ');
    s = s.replace(/[^A-Z&' ]+/g, ' ').replace(/\s+/g, ' ').trim();
    var words = s.split(' ').filter(function (w) { return w.length > 1 || w === '&'; });
    return words.slice(0, 2).join(' ') || String(desc || '').trim().toUpperCase().slice(0, 20);
  }
  function txKey(t) { return t.date + '|' + Number(t.amount).toFixed(2) + '|' + String(t.desc).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  // Adds only new transactions. Identical lines inside one statement are kept (counted), re-imports are skipped.
  function mergeTransactions(existing, incoming) {
    var have = {}; (existing || []).forEach(function (t) { var k = txKey(t); have[k] = (have[k] || 0) + 1; });
    var seen = {}, added = [], dupes = 0;
    (incoming || []).forEach(function (t) {
      var k = txKey(t); seen[k] = (seen[k] || 0) + 1;
      if (seen[k] <= (have[k] || 0)) { dupes++; return; }
      added.push(t);
    });
    return { all: (existing || []).concat(added), added: added, duplicates: dupes };
  }

  // ---------- categories and rules ----------
  var CATEGORIES = ['Income', 'Groceries', 'Eating out', 'Transport', 'Fuel', 'Utilities', 'Phone & internet', 'Rent & mortgage', 'Insurance',
    'Health', 'Subscriptions', 'Shopping', 'Entertainment', 'Travel', 'Education', 'Kids', 'Pets', 'Gifts & donations', 'Fees & interest',
    'Cash', 'Transfers', 'Savings', 'Uncategorised'];

  var DEFAULT_RULES = [
    ['salary', 'Income'], ['payroll', 'Income'], ['wages', 'Income'], ['pay from', 'Income'], ['ato', 'Income'], ['interest credit', 'Income'], ['dividend', 'Income'], ['centrelink', 'Income'],
    ['woolworths', 'Groceries'], ['woolies', 'Groceries'], ['coles', 'Groceries'], ['aldi', 'Groceries'], ['iga', 'Groceries'], ['harris farm', 'Groceries'], ['foodworks', 'Groceries'], ['costco', 'Groceries'],
    ['mcdonalds', 'Eating out'], ['kfc', 'Eating out'], ['hungry jacks', 'Eating out'], ['uber eats', 'Eating out'], ['uber *eats', 'Eating out'], ['menulog', 'Eating out'], ['doordash', 'Eating out'], ['cafe', 'Eating out'], ['coffee', 'Eating out'], ['restaurant', 'Eating out'], ['sushi', 'Eating out'], ['guzman', 'Eating out'], ['grill\'d', 'Eating out'], ['domino', 'Eating out'],
    ['opal', 'Transport'], ['myki', 'Transport'], ['go card', 'Transport'], ['translink', 'Transport'], ['transperth', 'Transport'], ['uber trip', 'Transport'], ['uber *trip', 'Transport'], ['didi', 'Transport'], ['13cabs', 'Transport'], ['linkt', 'Transport'], ['e-toll', 'Transport'], ['wilson parking', 'Transport'], ['secure parking', 'Transport'],
    ['bp', 'Fuel'], ['shell', 'Fuel'], ['ampol', 'Fuel'], ['caltex', 'Fuel'], ['7-eleven', 'Fuel'], ['united petroleum', 'Fuel'], ['metro petroleum', 'Fuel'],
    ['agl', 'Utilities'], ['origin energy', 'Utilities'], ['origin', 'Utilities'], ['energyaustralia', 'Utilities'], ['red energy', 'Utilities'], ['alinta', 'Utilities'], ['sydney water', 'Utilities'], ['yarra valley water', 'Utilities'], ['council rates', 'Utilities'], ['simply energy', 'Utilities'],
    ['telstra', 'Phone & internet'], ['optus', 'Phone & internet'], ['vodafone', 'Phone & internet'], ['tpg', 'Phone & internet'], ['aussie broadband', 'Phone & internet'], ['belong', 'Phone & internet'], ['amaysim', 'Phone & internet'], ['boost mobile', 'Phone & internet'],
    ['rent', 'Rent & mortgage'], ['mortgage', 'Rent & mortgage'], ['home loan', 'Rent & mortgage'], ['real estate', 'Rent & mortgage'], ['strata', 'Rent & mortgage'],
    ['nrma', 'Insurance'], ['aami', 'Insurance'], ['allianz', 'Insurance'], ['budget direct', 'Insurance'], ['youi', 'Insurance'], ['racv', 'Insurance'], ['insurance', 'Insurance'],
    ['bupa', 'Health'], ['medibank', 'Health'], ['hcf', 'Health'], ['nib', 'Health'], ['chemist warehouse', 'Health'], ['priceline', 'Health'], ['pharmacy', 'Health'], ['medical', 'Health'], ['dental', 'Health'], ['physio', 'Health'], ['anytime fitness', 'Health'], ['gym', 'Health'],
    ['netflix', 'Subscriptions'], ['spotify', 'Subscriptions'], ['stan.com', 'Subscriptions'], ['stan', 'Subscriptions'], ['disney plus', 'Subscriptions'], ['disney+', 'Subscriptions'], ['binge', 'Subscriptions'], ['kayo', 'Subscriptions'], ['foxtel', 'Subscriptions'], ['paramount', 'Subscriptions'], ['youtube premium', 'Subscriptions'], ['google one', 'Subscriptions'], ['apple.com/bill', 'Subscriptions'], ['icloud', 'Subscriptions'], ['amazon prime', 'Subscriptions'], ['microsoft', 'Subscriptions'], ['adobe', 'Subscriptions'], ['chatgpt', 'Subscriptions'], ['openai', 'Subscriptions'], ['audible', 'Subscriptions'], ['patreon', 'Subscriptions'],
    ['kmart', 'Shopping'], ['target', 'Shopping'], ['big w', 'Shopping'], ['bunnings', 'Shopping'], ['jb hi-fi', 'Shopping'], ['jb hifi', 'Shopping'], ['harvey norman', 'Shopping'], ['officeworks', 'Shopping'], ['amazon', 'Shopping'], ['ebay', 'Shopping'], ['myer', 'Shopping'], ['david jones', 'Shopping'], ['uniqlo', 'Shopping'], ['ikea', 'Shopping'], ['temu', 'Shopping'], ['shein', 'Shopping'],
    ['hoyts', 'Entertainment'], ['event cinemas', 'Entertainment'], ['ticketek', 'Entertainment'], ['ticketmaster', 'Entertainment'], ['steam', 'Entertainment'], ['playstation', 'Entertainment'], ['nintendo', 'Entertainment'],
    ['qantas', 'Travel'], ['virgin australia', 'Travel'], ['jetstar', 'Travel'], ['airbnb', 'Travel'], ['booking.com', 'Travel'], ['expedia', 'Travel'], ['hotel', 'Travel'],
    ['tafe', 'Education'], ['university', 'Education'], ['udemy', 'Education'], ['coursera', 'Education'], ['school', 'Education'],
    ['childcare', 'Kids'], ['early learning', 'Kids'], ['petbarn', 'Pets'], ['vet', 'Pets'],
    ['donation', 'Gifts & donations'], ['red cross', 'Gifts & donations'], ['unicef', 'Gifts & donations'],
    ['account fee', 'Fees & interest'], ['monthly fee', 'Fees & interest'], ['interest charged', 'Fees & interest'], ['overdrawn', 'Fees & interest'], ['international transaction fee', 'Fees & interest'], ['late fee', 'Fees & interest'],
    ['atm', 'Cash'], ['cash withdrawal', 'Cash'],
    ['transfer to', 'Transfers'], ['transfer from', 'Transfers'], ['tfr', 'Transfers'], ['internal transfer', 'Transfers'], ['credit card payment', 'Transfers'], ['payment thank you', 'Transfers'],
    ['savings', 'Savings'], ['transfer to goal saver', 'Savings'], ['transfer to savings', 'Savings'], ['transfer to saver', 'Savings'], ['to saver', 'Savings'], ['goal saver', 'Savings']
  ].map(function (r) { return { kw: r[0], cat: r[1] }; });

  var reCache = {};
  // Keywords must start at a word start ("stan" must not match "pakistan"); short ones must be whole words ("agl", "ato", "rent")
  function kwRegex(kw) {
    if (reCache[kw]) return reCache[kw];
    var esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var pre = /^[a-z0-9]/.test(kw) ? '(^|[^a-z0-9])' : '';
    var post = kw.length <= 4 && /[a-z0-9]$/.test(kw) ? '([^a-z0-9]|$)' : '';
    return (reCache[kw] = new RegExp(pre + esc + post));
  }
  function matchRule(desc, rules) {
    var d = ' ' + String(desc || '').toLowerCase().replace(/\s+/g, ' ') + ' ', best = null;
    (rules || []).forEach(function (r) {
      var kw = String(r.kw || '').toLowerCase().trim(); if (!kw) return;
      if (!kwRegex(kw).test(d)) return;
      // learned rules win, then longer (more specific) keywords
      var rank = (r.learned ? 1000 : 0) + kw.length;
      if (!best || rank > best.rank) best = { rule: r, rank: rank };
    });
    return best ? best.rule : null;
  }

  function categorise(t, rules) {
    var r = matchRule(t.desc, rules);
    if (r) {
      // A refund from a shop is still that category; but "Income" rules only make sense for money in
      if (r.cat === 'Income' && t.amount < 0) return 'Uncategorised';
      return r.cat;
    }
    return t.amount > 0 ? 'Income' : 'Uncategorised';
  }

  // Apply rules to every transaction that the user has not set by hand
  function applyRules(txs, rules) {
    return txs.map(function (t) { if (t.manualCat) return t; var c = categorise(t, rules); return c === t.category ? t : Object.assign({}, t, { category: c }); });
  }

  // When the user recategorises, remember the merchant so future imports follow it
  function learnRule(rules, desc, cat) {
    var kw = merchantKey(desc).toLowerCase();
    if (!kw || kw.length < 3) return rules;
    var out = (rules || []).filter(function (r) { return !(r.learned && r.kw === kw); });
    out.push({ kw: kw, cat: cat, learned: true });
    return out;
  }

  // ---------- reporting ----------
  function month(d) { return String(d).slice(0, 7); }
  var NOT_SPEND = { Transfers: 1, Savings: 1 };

  function monthlySummary(txs) {
    var by = {};
    (txs || []).forEach(function (t) {
      var m = month(t.date), c = t.category || 'Uncategorised';
      if (!by[m]) by[m] = { month: m, income: 0, spend: 0, saved: 0, count: 0 };
      by[m].count++;
      if (c === 'Transfers') return;
      if (c === 'Savings') { by[m].saved += -t.amount; return; }
      if (t.amount > 0 && c === 'Income') by[m].income += t.amount;
      else by[m].spend += -t.amount; // refunds (positive amounts in a spend category) reduce spending
    });
    return Object.keys(by).sort().map(function (m) {
      var r = by[m]; r.income = round2(r.income); r.spend = round2(r.spend); r.saved = round2(r.saved);
      r.net = round2(r.income - r.spend);
      r.savingsRate = r.income > 0 ? r.net / r.income : null;
      return r;
    });
  }

  function spendByCategory(txs, monthStr) {
    var by = {};
    (txs || []).forEach(function (t) {
      if (monthStr && month(t.date) !== monthStr) return;
      var c = t.category || 'Uncategorised'; if (c === 'Income' || NOT_SPEND[c]) return;
      by[c] = (by[c] || 0) - t.amount;
    });
    return Object.keys(by).map(function (c) { return { category: c, spent: round2(by[c]) }; }).filter(function (x) { return x.spent > 0; })
      .sort(function (a, b) { return b.spent - a.spent; });
  }

  // {months:[...], rows:[{category, values:{m:v}, total, average}]}
  function categoryByMonth(txs, lastN) {
    var months = monthlySummary(txs).map(function (r) { return r.month; });
    if (lastN) months = months.slice(-lastN);
    var cats = {};
    months.forEach(function (m) { spendByCategory(txs, m).forEach(function (x) { (cats[x.category] = cats[x.category] || {})[m] = x.spent; }); });
    var rows = Object.keys(cats).map(function (c) {
      var tot = 0; months.forEach(function (m) { tot += cats[c][m] || 0; });
      return { category: c, values: cats[c], total: round2(tot), average: round2(tot / Math.max(1, months.length)) };
    }).sort(function (a, b) { return b.total - a.total; });
    return { months: months, rows: rows };
  }

  function budgetProgress(txs, budgets, monthStr) {
    var spent = {}; spendByCategory(txs, monthStr).forEach(function (x) { spent[x.category] = x.spent; });
    return Object.keys(budgets || {}).filter(function (c) { return budgets[c] > 0; }).map(function (c) {
      var b = Number(budgets[c]), s = spent[c] || 0, pct = s / b;
      return { category: c, budget: b, spent: round2(s), left: round2(b - s), pct: pct, status: pct > 1 ? 'over' : pct >= 0.85 ? 'close' : 'ok' };
    }).sort(function (a, b) { return b.pct - a.pct; });
  }

  // Suggest budgets from the average of past full months, rounded up to the nearest $10
  function suggestBudgets(txs, lastN) {
    var cbm = categoryByMonth(txs, lastN || 3), out = {};
    cbm.rows.forEach(function (r) { if (r.average > 0) out[r.category] = Math.ceil(r.average / 10) * 10; });
    return out;
  }

  // ---------- subscriptions ----------
  var CADENCES = [
    { name: 'Weekly', min: 6, max: 8, perYear: 52 },
    { name: 'Fortnightly', min: 13, max: 15, perYear: 26 },
    { name: 'Monthly', min: 26, max: 35, perYear: 12 },
    { name: 'Quarterly', min: 85, max: 97, perYear: 4 },
    { name: 'Yearly', min: 350, max: 380, perYear: 1 }
  ];
  function dayNum(d) { return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5; }
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function addDays(d, n) { var x = new Date((dayNum(d) + n) * 864e5); return x.toISOString().slice(0, 10); }

  function detectSubscriptions(txs, opts) {
    opts = opts || {}; var tol = opts.amountTolerance == null ? 0.15 : opts.amountTolerance;
    var groups = {};
    (txs || []).forEach(function (t) {
      if (!(t.amount < 0)) return; var c = t.category; if (c === 'Transfers' || c === 'Savings' || c === 'Rent & mortgage' && opts.skipRent) return;
      var k = merchantKey(t.desc); (groups[k] = groups[k] || []).push(t);
    });
    var out = [];
    Object.keys(groups).forEach(function (k) {
      var g = groups[k].slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (g.length < 2) return;
      var amts = g.map(function (t) { return -t.amount; }), med = median(amts);
      // keep the charges close to the typical amount (supermarkets vary a lot and drop out here)
      var similar = g.filter(function (t) { return Math.abs(-t.amount - med) <= Math.max(1, med * tol); });
      if (similar.length < 2 || similar.length / g.length < 0.6) return;
      var gaps = []; for (var i = 1; i < similar.length; i++) gaps.push(dayNum(similar[i].date) - dayNum(similar[i - 1].date));
      var mg = median(gaps);
      var cad = CADENCES.filter(function (c) { return mg >= c.min && mg <= c.max; })[0]; if (!cad) return;
      var fit = gaps.filter(function (x) { return x >= cad.min && x <= cad.max; }).length / gaps.length;
      var need = cad.perYear >= 12 ? 2 : 1; // at least 3 charges for weekly/fortnightly/monthly
      if (gaps.length < need || fit < 0.7) return;
      var amt = round2(median(similar.map(function (t) { return -t.amount; })));
      var last = similar[similar.length - 1];
      out.push({
        merchant: k, cadence: cad.name, amount: amt, yearly: round2(amt * cad.perYear), count: similar.length,
        first: similar[0].date, last: last.date, nextDue: addDays(last.date, Math.round(mg)), category: last.category || '', sample: last.desc,
        confidence: Math.min(1, (fit * 0.6) + Math.min(similar.length, 6) / 15)
      });
    });
    return out.sort(function (a, b) { return b.yearly - a.yearly; });
  }

  // ---------- goals ----------
  function monthsBetween(fromIso, toIso) {
    var a = new Date(fromIso + 'T00:00:00Z'), b = new Date(toIso + 'T00:00:00Z');
    var m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + (b.getUTCDate() - a.getUTCDate()) / 30;
    return m;
  }
  function goalPlan(goal, todayIso, avgMonthlySavings) {
    var target = Number(goal.target) || 0, saved = Number(goal.saved) || 0, remaining = Math.max(0, round2(target - saved));
    var months = goal.date ? monthsBetween(todayIso, goal.date) : null;
    var r = { name: goal.name, target: target, saved: saved, remaining: remaining, progress: target > 0 ? Math.min(1, saved / target) : 0, monthsLeft: months, monthlyNeeded: null, status: 'ok', note: '' };
    if (remaining === 0) { r.status = 'done'; r.note = 'Goal reached — well done.'; return r; }
    if (months == null) { r.note = 'Add a target date to see the monthly amount needed.'; return r; }
    if (months <= 0) { r.status = 'late'; r.monthlyNeeded = remaining; r.note = 'The date has passed. Pick a new date or top up ' + remaining.toFixed(2) + ' now.'; return r; }
    r.monthlyNeeded = round2(remaining / Math.max(months, 0.5));
    if (avgMonthlySavings != null) {
      if (avgMonthlySavings <= 0) { r.status = 'risk'; r.note = 'You are not saving anything in an average month yet.'; }
      else if (r.monthlyNeeded > avgMonthlySavings) { r.status = 'risk'; r.note = 'Needs more than you save in an average month (' + avgMonthlySavings.toFixed(0) + ').'; }
      else r.note = 'On track if you keep saving like an average month.';
    }
    return r;
  }

  // ---------- sample data (CommBank-style, no header: date,amount,description,balance) ----------
  function sampleCSV(endIso) {
    var end = endIso ? new Date(endIso + 'T00:00:00Z') : new Date(Date.UTC(2026, 10, 7));
    var start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 3, 1));
    var rows = [], bal = 4200.0, seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    function fmtD(dt) { return pad(dt.getUTCDate()) + '/' + pad(dt.getUTCMonth() + 1) + '/' + dt.getUTCFullYear(); }
    for (var dt = new Date(start); dt <= end; dt = new Date(dt.getTime() + 864e5)) {
      var dom = dt.getUTCDate(), dow = dt.getUTCDay(), items = [];
      var wk = Math.floor((dt - start) / (7 * 864e5));
      if (dow === 4 && wk % 2 === 0) items.push([3150.00, 'Salary ACME PTY LTD PAYROLL']);
      if (dom === 1) items.push([-2300.00, 'Rent RAY WHITE REAL ESTATE']);
      if (dom === 3) items.push([-22.99, 'NETFLIX.COM MELBOURNE AUS']);
      if (dom === 9) items.push([-13.99, 'SPOTIFY SYDNEY AUS']);
      if (dom === 12) items.push([-75.00, 'TELSTRA PREPAID MELBOURNE']);
      if (dom === 15) items.push([-500.00, 'Transfer to Goal Saver NetBank']);
      if (dom === 18) items.push([-65.95, 'ANYTIME FITNESS NORTH SYDNEY']);
      if (dom === 21 && dt.getUTCMonth() % 3 === 0) items.push([-412.80, 'AGL SALES PTY LTD BPAY']);
      if (dom === 26) items.push([-189.40, 'BUPA AUSTRALIA HEALTH INS']);
      if (dow === 6) items.push([-(90 + Math.round(rnd() * 8000) / 100), 'WOOLWORTHS 1234 CHATSWOOD NS AUS Card xx4821']);
      if (dow === 3) items.push([-(25 + Math.round(rnd() * 3000) / 100), 'COLES 0789 NORTH SYDNEY NS AUS Card xx4821']);
      if (dow >= 1 && dow <= 5 && rnd() < 0.55) items.push([-(4.5 + Math.round(rnd() * 200) / 100), 'BEAN THERE CAFE NORTH SYDNEY']);
      if (dow >= 1 && dow <= 5) items.push([-(3.2 + (rnd() < 0.5 ? 2 : 0)), 'TRANSPORTFORNSW OPAL SYDNEY']);
      if (rnd() < 0.08) items.push([-(18 + Math.round(rnd() * 3000) / 100), 'UBER *EATS HELP.UBER.COM']);
      if (rnd() < 0.05) items.push([-(20 + Math.round(rnd() * 12000) / 100), 'KMART 1043 CHATSWOOD']);
      if (rnd() < 0.04) items.push([-(60 + Math.round(rnd() * 3000) / 100), 'AMPOL CROWS NEST 2065']);
      if (dom === 28 && rnd() < 0.5) items.push([-(40 + Math.round(rnd() * 4000) / 100), 'CHEMIST WAREHOUSE ST LEONARDS']);
      if (dom === 20 && rnd() < 0.6) items.push([-(30 + Math.round(rnd() * 9000) / 100), 'SUSHI TRAIN CROWS NEST']);
      items.forEach(function (it) {
        bal = round2(bal + it[0]);
        rows.push(fmtD(dt) + ',' + (it[0] > 0 ? '+' : '') + it[0].toFixed(2) + ',"' + it[1] + '",' + (bal >= 0 ? '+' : '') + bal.toFixed(2));
      });
    }
    return rows.join('\n');
  }

  var L = {
    parseDate: parseDate, parseAmount: parseAmount, detectColumns: detectColumns, toTransactions: toTransactions,
    merchantKey: merchantKey, txKey: txKey, mergeTransactions: mergeTransactions,
    CATEGORIES: CATEGORIES, DEFAULT_RULES: DEFAULT_RULES, matchRule: matchRule, categorise: categorise, applyRules: applyRules, learnRule: learnRule,
    monthlySummary: monthlySummary, spendByCategory: spendByCategory, categoryByMonth: categoryByMonth, budgetProgress: budgetProgress, suggestBudgets: suggestBudgets,
    detectSubscriptions: detectSubscriptions, goalPlan: goalPlan, monthsBetween: monthsBetween, sampleCSV: sampleCSV, addDays: addDays
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.FinanceLib = L;
})(this);
