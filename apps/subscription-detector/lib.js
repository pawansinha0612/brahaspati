/* Subscription Leak Detector — pure logic. Reuses the Money app's statement reader and subscription finder
   (apps/finance/lib.js, loaded first as window.FinanceLib) and adds price-change detection, stopped-charge
   detection, keep/cancel/review decisions, trial reminders and cancellation checklists. */
(function (root) {
  'use strict';
  var node = typeof module !== 'undefined' && module.exports;
  var F = node ? require('../finance/lib.js') : root.FinanceLib;
  var K = node ? require('../home-inventory/vault-kit.js') : root.VaultKit;

  var CAD = {
    Weekly: { perYear: 52, days: 7, min: 6, max: 8 }, Fortnightly: { perYear: 26, days: 14, min: 13, max: 15 },
    Monthly: { perYear: 12, days: 30, min: 26, max: 35 }, Quarterly: { perYear: 4, days: 91, min: 85, max: 97 }, Yearly: { perYear: 1, days: 365, min: 350, max: 380 }
  };
  function round2(n) { return Math.round(n * 100) / 100; }
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; }
  var CITIES = /\b(SYDNEY|MELBOURNE|BRISBANE|PERTH|ADELAIDE|HOBART|DARWIN|CANBERRA|NORTH|SOUTH|BILL)\b/g;
  function niceName(k) { var t = String(k || '').replace(CITIES, ' ').replace(/\s+/g, ' ').trim(); return title(t || k); }
  function title(s) { return String(s || '').toLowerCase().replace(/(^|[\s&'])([a-z])/g, function (m, p, c) { return p + c.toUpperCase(); }); }

  // rows (arrays from a CSV) -> {transactions, skipped, det}. Spending is negative.
  function readStatement(rows, opts) {
    opts = opts || {};
    var det = opts.det || F.detectColumns(rows);
    var r = F.toTransactions(rows, det, { flipSign: !!opts.flipSign, account: opts.account || '' });
    return { transactions: F.applyRules(r.transactions, F.DEFAULT_RULES), skipped: r.skipped, det: det };
  }
  function merge(existing, incoming) { return F.mergeTransactions(existing, incoming); }

  function cadenceOf(gaps) {
    var mg = median(gaps);
    var name = Object.keys(CAD).filter(function (k) { return mg >= CAD[k].min && mg <= CAD[k].max; })[0];
    if (!name) return null;
    var fit = gaps.filter(function (x) { return x >= CAD[name].min && x <= CAD[name].max; }).length / gaps.length;
    return { name: name, fit: fit, gap: mg };
  }

  // Runs of (almost) the same amount in date order: [{amount, from, to, count}]
  function priceRuns(charges) {
    var runs = [];
    charges.forEach(function (t) {
      var a = -t.amount, last = runs[runs.length - 1];
      if (last && Math.abs(a - last.amount) <= Math.max(0.05, last.amount * 0.02)) { last.to = t.date; last.count++; }
      else runs.push({ amount: round2(a), from: t.date, to: t.date, count: 1 });
    });
    return runs;
  }
  // Latest lasting price change (a one-off odd charge between two equal prices is ignored)
  function priceChange(charges) {
    var runs = priceRuns(charges).filter(function (r, i, all) { return r.count >= 2 || i === all.length - 1; });
    for (var i = runs.length - 1; i > 0; i--) {
      var from = runs[i - 1].amount, to = runs[i].amount;
      if (Math.abs(to - from) > 0.01) return { from: from, to: to, since: runs[i].from, pct: (to - from) / from, up: to > from };
    }
    return null;
  }

  function debitGroups(txs) {
    var g = {};
    (txs || []).forEach(function (t) {
      if (!(t.amount < 0) || t.category === 'Transfers' || t.category === 'Savings') return;
      var k = F.merchantKey(t.desc); (g[k] = g[k] || []).push(t);
    });
    Object.keys(g).forEach(function (k) { g[k].sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); });
    return g;
  }

  // Charges whose price stepped up or down part-way (the Money app's finder needs one steady price, so these are added here)
  function steppedSubscription(key, group) {
    if (group.length < 3) return null;
    var runs = priceRuns(group);
    if (runs.length < 2 || runs.length > 3 || runs.some(function (r) { return r.count < 1; })) return null;
    if (runs[runs.length - 1].count < 2 && runs.length > 2) return null;
    var gaps = []; for (var i = 1; i < group.length; i++) gaps.push(K.daysBetween(group[i - 1].date, group[i].date));
    var c = cadenceOf(gaps);
    if (!c || c.fit < 0.7 || (CAD[c.name].perYear >= 12 && gaps.length < 2)) return null;
    // price must not jump around more than 60%
    var amts = runs.map(function (r) { return r.amount; });
    if (Math.max.apply(null, amts) > 1.6 * Math.min.apply(null, amts)) return null;
    var last = group[group.length - 1];
    return { merchant: key, cadence: c.name, amount: round2(-last.amount), count: group.length, first: group[0].date, last: last.date,
      nextDue: K.addDays(last.date, Math.round(c.gap)), category: last.category || '', sample: last.desc, confidence: Math.min(1, c.fit * 0.6 + Math.min(group.length, 6) / 15) };
  }

  // -> [{key, name, cadence, perYear, amount (latest), yearly, count, first, last, next, status, overdueDays, priceChange, sample, category, confidence}]
  function findRecurring(txs, today, opts) {
    opts = opts || {};
    var groups = debitGroups(txs), found = {}, out = [];
    F.detectSubscriptions(txs, { amountTolerance: opts.tolerance }).forEach(function (s) { found[s.merchant] = s; });
    Object.keys(groups).forEach(function (k) { if (!found[k]) { var s = steppedSubscription(k, groups[k]); if (s) found[k] = s; } });
    Object.keys(found).forEach(function (k) {
      var s = found[k];
      if (s.category === 'Rent & mortgage' && !opts.includeHousing) return; // rent is not a leak
      var cad = CAD[s.cadence], g = groups[k] || [];
      // charges belonging to this subscription: within 60% of its usual price
      var mine = g.filter(function (t) { var a = -t.amount; return a >= s.amount / 1.6 && a <= s.amount * 1.6; });
      var latest = mine.length ? mine[mine.length - 1] : null;
      var amount = latest ? round2(-latest.amount) : s.amount;
      var lastDate = latest ? latest.date : s.last;
      var next = K.addDays(lastDate, cad.days === 30 ? 0 : cad.days);
      if (cad.days === 30) next = K.addMonths(lastDate, 1);
      var grace = Math.max(5, Math.round(cad.days * 0.5));
      var overdue = today ? K.daysBetween(next, today) : 0;
      out.push({
        key: k, name: niceName(k), cadence: s.cadence, perYear: cad.perYear, amount: amount, yearly: round2(amount * cad.perYear),
        count: mine.length || s.count, first: mine.length ? mine[0].date : s.first, last: lastDate, next: next,
        status: overdue > grace ? 'stopped' : 'active', overdueDays: overdue, priceChange: priceChange(mine), sample: latest ? latest.desc : s.sample,
        category: s.category, confidence: s.confidence
      });
    });
    return out.sort(function (a, b) { return (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1) || b.yearly - a.yearly; });
  }

  // decisions: {key: {decision:'keep'|'cancel'|'review', cancelled?:bool}}
  function summary(subs, decisions) {
    decisions = decisions || {};
    var s = { count: 0, yearly: 0, monthly: 0, cancel: 0, review: 0, keep: 0, unanswered: 0, unansweredCount: 0, leak: 0, saved: 0, increases: 0, stopped: 0 };
    (subs || []).forEach(function (x) {
      if (x.status === 'stopped') { s.stopped++; return; }
      var d = (decisions[x.key] || {});
      s.count++; s.yearly += x.yearly;
      if (x.priceChange && x.priceChange.up) s.increases++;
      if (d.decision === 'cancel') { s.cancel += x.yearly; if (d.cancelled) s.saved += x.yearly; }
      else if (d.decision === 'review') s.review += x.yearly;
      else if (d.decision === 'keep') s.keep += x.yearly;
      else { s.unanswered += x.yearly; s.unansweredCount++; }
    });
    ['yearly', 'cancel', 'review', 'keep', 'unanswered', 'saved'].forEach(function (k) { s[k] = round2(s[k]); });
    s.monthly = round2(s.yearly / 12);
    s.leak = round2(s.cancel - s.saved + s.review); // money you said you might not need, not yet cancelled
    return s;
  }

  // Generic help per kind of merchant. No live data or partner links: just plain-English steps and a web search.
  var HINTS = [
    { re: /APPLE|ITUNES/, tip: 'Charges from Apple are usually App Store or iCloud subscriptions. On an iPhone: Settings → your name → Subscriptions.' },
    { re: /GOOGLE|PLAY/, tip: 'Google charges are often Google One or Play Store subscriptions. Open the Play Store → your profile → Payments & subscriptions.' },
    { re: /PAYPAL/, tip: 'PayPal can hide the real merchant. In PayPal: Settings → Payments → Manage automatic payments.' },
    { re: /AMAZON|PRIME|AUDIBLE|KINDLE/, tip: 'Amazon services are cancelled from your Amazon account → Memberships & subscriptions.' },
    { re: /FITNESS|GYM|ANYTIME|F45|JETTS|SNAP|PLUS FITNESS|GOODLIFE/, tip: 'Gyms often need written notice and may charge a cancellation fee or a final period — read your membership terms and ask for written confirmation.' },
    { re: /TELSTRA|OPTUS|VODAFONE|TPG|AUSSIE|BELONG|IINET|DODO|FOXTEL/, tip: 'Phone, internet and pay-TV plans may have a contract with exit fees. Check before cancelling, and keep your number if you are moving providers.' },
    { re: /INSURANCE|BUPA|MEDIBANK|HCF|NIB|AHM|NRMA|AAMI|ALLIANZ|YOUI/, tip: 'Insurance is not a subscription to drop lightly. Compare first, and make sure new cover starts before old cover ends.' }
  ];
  function cancelSteps(sub) {
    var hint = HINTS.filter(function (h) { return h.re.test(String(sub.key || '').toUpperCase() + ' ' + String(sub.sample || '').toUpperCase()); })[0];
    var steps = [
      'Check what this charge is: search your email for "' + sub.name + '" receipts, and look at the full bank description: “' + (sub.sample || sub.name) + '”.',
      'Sign in to the service’s website or app and find Account, Billing, Plan or Membership.',
      'Choose Cancel, Downgrade or Pause. If there is no button, use the service’s help page or chat and ask for written confirmation.',
      'Save the confirmation email or a screenshot with the date.',
      'Watch your next statement around ' + K.niceDate(sub.next) + ' to make sure the charge stops.',
      'If it keeps charging after you cancelled, contact the business first, then your bank (you can ask your bank to stop a recurring card payment).'
    ];
    return { steps: steps, tip: hint ? hint.tip : '', search: 'https://www.google.com/search?q=' + encodeURIComponent('how to cancel ' + sub.name + ' subscription Australia') };
  }

  // Calendar: trial end reminders (2 days before) and next-charge reminders for subscriptions marked "review"
  function trialEvents(trials) {
    return (trials || []).filter(function (t) { return t.name && K.isISO(t.ends); }).map(function (t) {
      return { uid: 'trial-' + (t.id || t.name.replace(/\W+/g, '')) + '-' + t.ends, date: K.addDays(t.ends, -2), alarmDays: 0,
        title: 'Free trial ends ' + K.niceDate(t.ends) + ': ' + t.name, description: 'Cancel before ' + K.niceDate(t.ends) + (t.price ? ' or you will be charged ' + K.money(t.price) + (t.cadence ? ' ' + t.cadence.toLowerCase() : '') : '') + '.' + (t.how ? ' How: ' + t.how : '') };
    });
  }
  function reviewEvents(subs, decisions) {
    return (subs || []).filter(function (s) { var d = (decisions || {})[s.key] || {}; return s.status === 'active' && (d.decision === 'review' || (d.decision === 'cancel' && !d.cancelled)); }).map(function (s) {
      return { uid: 'sub-' + s.key.replace(/\W+/g, '') + '-' + s.next, date: K.addDays(s.next, -3), alarmDays: 0,
        title: 'Decide on ' + s.name + ' before it charges ' + K.money(s.amount), description: s.cadence + ' charge of ' + K.money(s.amount) + ' (' + K.money(s.yearly) + ' a year), next expected ' + K.niceDate(s.next) + '.' };
    });
  }
  function trialStatus(t, today) {
    var d = K.daysBetween(today, t.ends);
    return d < 0 ? 'ended' : d <= 3 ? 'urgent' : d <= 7 ? 'soon' : 'ok';
  }

  // Made-up statement (CommBank style, no header) with a price rise, a stopped service and everyday noise
  function sampleCSV(today) {
    var end = today, start = K.addMonths(today, -7), rows = [], bal = 5200, seed = 11;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    function fmt(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4); }
    var monthsIn = 0;
    for (var d = start; d <= end; d = K.addDays(d, 1)) {
      var dom = +d.slice(8, 10), dow = new Date(d + 'T00:00:00Z').getUTCDay(), items = [];
      if (dom === 1) monthsIn++;
      if (dow === 4 && K.daysBetween(start, d) % 14 < 7) items.push([2950, 'Salary NORTHWIND PTY LTD PAYROLL']);
      if (dom === 2) items.push([-2150, 'Rent BELLE PROPERTY REAL ESTATE']);
      if (dom === 4) items.push([monthsIn >= 4 ? -22.99 : -18.99, 'NETFLIX.COM MELBOURNE AUS']);
      if (dom === 7) items.push([-13.99, 'SPOTIFY P1234 SYDNEY AUS']);
      if (dom === 10) items.push([-17.99, 'DISNEY PLUS MELBOURNE AUS']);
      if (dom === 11 && monthsIn <= 3) items.push([-12, 'STAN.COM.AU SYDNEY']);
      if (dom === 13) items.push([-4.49, 'APPLE.COM/BILL SYDNEY']);
      if (dom === 16) items.push([-25, 'KAYO SPORTS MELBOURNE']);
      if (dom === 19) items.push([monthsIn >= 5 ? -35.99 : -32.99, 'ADOBE CREATIVE CLOUD SYDNEY']);
      if (dom === 22) items.push([-16.45, 'AUDIBLE AU SYDNEY']);
      if (dom === 25) items.push([-89, 'TELSTRA MOBILE MELBOURNE']);
      if (dow === 1 && K.daysBetween(start, d) % 14 < 7) items.push([-31.9, 'SNAP FITNESS CROWS NEST']);
      if (dow === 6) items.push([-(95 + Math.round(rnd() * 9000) / 100), 'WOOLWORTHS 3321 CHATSWOOD NS AUS Card xx1188']);
      if (dow === 3) items.push([-(20 + Math.round(rnd() * 4000) / 100), 'ALDI STORES ARTARMON NS AUS']);
      if (dow >= 1 && dow <= 5 && rnd() < 0.5) items.push([-(4.8 + Math.round(rnd() * 150) / 100), 'BEAN THERE CAFE NORTH SYDNEY']);
      if (rnd() < 0.05) items.push([-(25 + Math.round(rnd() * 6000) / 100), 'UBER *EATS HELP.UBER.COM']);
      if (rnd() < 0.04) items.push([-(55 + Math.round(rnd() * 3000) / 100), 'AMPOL CROWS NEST 2065']);
      items.forEach(function (it) { bal = round2(bal + it[0]); rows.push(fmt(d) + ',' + (it[0] > 0 ? '+' : '') + it[0].toFixed(2) + ',"' + it[1] + '",' + (bal >= 0 ? '+' : '') + bal.toFixed(2)); });
    }
    return rows.join('\n');
  }

  var L = { CAD: CAD, readStatement: readStatement, merge: merge, priceRuns: priceRuns, priceChange: priceChange, findRecurring: findRecurring,
    summary: summary, cancelSteps: cancelSteps, trialEvents: trialEvents, reviewEvents: reviewEvents, trialStatus: trialStatus, sampleCSV: sampleCSV, title: title, niceName: niceName };
  if (node) module.exports = L; else root.SubsLib = L;
})(this);
