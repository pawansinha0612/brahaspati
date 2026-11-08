/* Money Command Centre — page wiring */
(function () {
  'use strict';
  var L = window.FinanceLib, $ = B.$, esc = B.esc, money = function (n) { return B.fmt.money(n); };
  var KEY = 'finance:v1';
  var state = load();
  var ovPicked = false; // user chose a month on the overview
  var pending = null; // import in progress: {rows, det, name}

  function blank() { return { txs: [], rules: L.DEFAULT_RULES.map(function (r) { return { kw: r.kw, cat: r.cat }; }), budgets: {}, goals: [], hiddenSubs: [] }; }
  function load() { var s = B.store.get(KEY, null); var b = blank(); if (!s) return b; Object.keys(b).forEach(function (k) { if (s[k] == null) s[k] = b[k]; }); return s; }
  function save() { if (!B.store.set(KEY, state)) B.toast('Could not save — browser storage may be full or blocked'); }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function monthLabel(m) { if (!m) return ''; var d = new Date(m + '-01T00:00:00Z'); return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  function months() { var s = {}; state.txs.forEach(function (t) { s[t.date.slice(0, 7)] = 1; }); return Object.keys(s).sort().reverse(); }
  function catOptions(sel, withAll) {
    return (withAll ? '<option value="">All categories</option>' : '') + L.CATEGORIES.map(function (c) { return '<option' + (c === sel ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
  }
  function fillMonthSelect(el, withAll) {
    var cur = el.value, ms = months();
    // No statements yet: show a clear placeholder instead of an empty drop-down.
    el.disabled = !ms.length;
    if (!ms.length) { el.innerHTML = '<option value="">No statements yet</option>'; return; }
    el.innerHTML = (withAll ? '<option value="">All months</option>' : '') + ms.map(function (m) { return '<option value="' + m + '">' + monthLabel(m) + '</option>'; }).join('');
    if (cur && (ms.indexOf(cur) >= 0 || (withAll && cur === ''))) el.value = cur;
  }
  function amountCell(n) { return '<span class="' + (n > 0 ? 'fin-amt-pos' : 'fin-amt-neg') + '">' + (n > 0 ? '+' : '') + esc(money(n)) + '</span>'; }

  // ---------- overview ----------
  function renderOverview() {
    var has = state.txs.length > 0; $('#ovEmpty').hidden = has; $('#ovBody').hidden = !has; $('#ovMonthRow').hidden = !has;
    var sel = $('#ovMonth'); fillMonthSelect(sel); if (!has) return;
    if (!ovPicked) { var ms = months(); sel.value = ms[0] === todayIso().slice(0, 7) && ms[1] && +todayIso().slice(8) < 20 ? ms[1] : ms[0]; }
    var m = sel.value || months()[0];
    var summ = L.monthlySummary(state.txs), cur = summ.filter(function (r) { return r.month === m; })[0] || { income: 0, spend: 0, net: 0, saved: 0, savingsRate: null };
    $('#ovStats').innerHTML = [
      ['Money in', money(cur.income), 'ok'], ['Spent', money(cur.spend), ''], ['Left over', money(cur.net), cur.net >= 0 ? 'ok' : 'bad'],
      ['Savings rate', cur.savingsRate == null ? '–' : B.fmt.pct(cur.savingsRate, 0), cur.savingsRate >= 0.2 ? 'ok' : cur.savingsRate < 0 ? 'bad' : ''],
      ['Moved to savings', money(cur.saved), '']
    ].map(function (s) { return '<div class="stat"><div class="k">' + s[0] + '</div><div class="v ' + s[2] + '">' + esc(s[1]) + '</div></div>'; }).join('');
    var cats = L.spendByCategory(state.txs, m);
    $('#ovCats').innerHTML = cats.length ? B.barChart(cats.map(function (c) { return { label: c.category, value: c.spent }; }), { fmt: money }) : '<p class="muted">No spending this month.</p>';
    var bp = L.budgetProgress(state.txs, state.budgets, m);
    $('#ovBudgets').innerHTML = bp.length ? budgetBars(bp) : '<p class="muted">No budgets set yet. <a href="#" data-goto="budgets">Set budgets</a>.</p>';
    $('#ovMonths').innerHTML = B.table(summ.slice().reverse(), [
      { key: 'month', label: 'Month', fmt: function (v) { return esc(monthLabel(v)); } },
      { key: 'income', label: 'In', fmt: function (v) { return esc(money(v)); } },
      { key: 'spend', label: 'Spent', fmt: function (v) { return esc(money(v)); } },
      { key: 'net', label: 'Left over', fmt: function (v) { return '<span class="' + (v >= 0 ? 'ok' : 'bad') + '">' + esc(money(v)) + '</span>'; } },
      { key: 'saved', label: 'To savings', fmt: function (v) { return esc(money(v)); } },
      { key: 'savingsRate', label: 'Savings rate', fmt: function (v) { return v == null ? '–' : esc(B.fmt.pct(v, 0)); } }
    ]);
    var cbm = L.categoryByMonth(state.txs, 6);
    var cols = [{ key: 'category', label: 'Category' }].concat(cbm.months.map(function (mm) {
      return { key: mm, label: monthLabel(mm), fmt: function (v, r) { var x = r.values[mm]; return x ? esc(B.fmt.num(x, 0)) : '<span class="muted">–</span>'; } };
    })).concat([{ key: 'average', label: 'Avg / month', fmt: function (v) { return '<strong>' + esc(B.fmt.num(v, 0)) + '</strong>'; } }]);
    $('#ovCatMonths').innerHTML = B.table(cbm.rows, cols);
    renderTips(m, cur, cats, bp);
  }
  function budgetBars(bp) {
    return bp.map(function (b) {
      var w = Math.min(100, b.pct * 100).toFixed(1);
      var msg = b.status === 'over' ? '<span class="bad">' + esc(money(-b.left)) + ' over</span>' : esc(money(b.left)) + ' left';
      return '<div class="fin-budget"><span>' + esc(b.category) + '</span><div class="fin-progress ' + b.status + '" role="img" aria-label="' + Math.round(b.pct * 100) + '% of budget used"><div style="width:' + w + '%"></div></div>' +
        '<div class="meta">' + esc(money(b.spent)) + ' of ' + esc(money(b.budget)) + ' · ' + msg + '</div></div>';
    }).join('');
  }
  function renderTips(m, cur, cats, bp) {
    var tips = [], subs = visibleSubs();
    if (cats[0]) tips.push('Biggest spend: ' + cats[0].category + ' at ' + money(cats[0].spent) + '.');
    var over = bp.filter(function (b) { return b.status === 'over'; });
    if (over.length) tips.push('Over budget in ' + over.map(function (b) { return b.category; }).join(', ') + '.');
    if (subs.length) tips.push(subs.length + ' recurring charges add up to about ' + money(subs.reduce(function (a, s) { return a + s.yearly; }, 0)) + ' a year. Worth a look in Subscriptions.');
    var unc = state.txs.filter(function (t) { return t.category === 'Uncategorised' && t.date.slice(0, 7) === m; }).length;
    if (unc) tips.push(unc + ' transactions this month are uncategorised. Sort them once and the app learns the merchant.');
    if (cur.savingsRate != null) tips.push(cur.savingsRate >= 0.2 ? 'You kept ' + B.fmt.pct(cur.savingsRate, 0) + ' of your income this month. Nice.' : 'You kept ' + B.fmt.pct(cur.savingsRate, 0) + ' of your income. Many people aim for 20%.');
    $('#ovTips').innerHTML = tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
  }

  // ---------- transactions ----------
  function renderTx() {
    fillMonthSelect($('#txMonth'), true);
    var cs = $('#txCat'), cv = cs.value; cs.innerHTML = catOptions(cv, true); cs.value = cv;
    var q = $('#txSearch').value.trim().toLowerCase(), m = $('#txMonth').value, c = cs.value;
    var rows = state.txs.filter(function (t) {
      return (!q || t.desc.toLowerCase().indexOf(q) >= 0) && (!m || t.date.slice(0, 7) === m) && (!c || t.category === c);
    }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var total = rows.reduce(function (a, t) { return a + t.amount; }, 0);
    $('#txCount').textContent = rows.length + ' transactions · net ' + money(total);
    $('#txTable').innerHTML = rows.length ? B.table(rows, [
      { key: 'date', label: 'Date' },
      { key: 'desc', label: 'Description' },
      { key: 'amount', label: 'Amount', fmt: function (v) { return amountCell(v); } },
      { key: 'category', label: 'Category', fmt: function (v, r) { return '<select data-cat="' + esc(r.id) + '" aria-label="Category">' + catOptions(v) + '</select>'; } },
      { key: 'id', label: '', fmt: function (v) { return '<button class="btn small" type="button" data-del="' + esc(v) + '" aria-label="Delete">✕</button>'; } }
    ], { limit: 400 }) : '<p class="muted">No transactions match.</p>';
  }
  function byId(id) { return state.txs.filter(function (t) { return t.id === id; })[0]; }
  $('#txTable').addEventListener('change', function (e) {
    var id = e.target.getAttribute('data-cat'); if (!id) return;
    var t = byId(id); if (!t) return;
    t.category = e.target.value; t.manualCat = true;
    var before = state.txs.map(function (x) { return x.category; });
    state.rules = L.learnRule(state.rules, t.desc, t.category);
    state.txs = L.applyRules(state.txs, state.rules);
    var changed = state.txs.filter(function (x, i) { return x.category !== before[i]; }).length;
    save(); renderAll();
    B.toast('Learned “' + L.merchantKey(t.desc).toLowerCase() + '” → ' + t.category + (changed ? '. Updated ' + changed + ' more.' : ''), 3200);
  });
  $('#txTable').addEventListener('click', function (e) {
    var id = e.target.getAttribute('data-del'); if (!id) return;
    state.txs = state.txs.filter(function (t) { return t.id !== id; }); save(); renderAll();
  });
  ['#txSearch', '#txMonth', '#txCat'].forEach(function (s) { $(s).addEventListener('input', renderTx); });
  $('#aCat').innerHTML = catOptions('Uncategorised'); $('#aDate').value = todayIso();
  $('#addForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var amt = Math.abs(parseFloat($('#aAmt').value)); if (!amt) return;
    var t = { id: B.uid(), date: $('#aDate').value, desc: $('#aDesc').value.trim(), amount: $('#aType').value === 'in' ? amt : -amt, balance: null, account: 'Manual', manual: true };
    t.category = $('#aCat').value === 'Uncategorised' ? L.categorise(t, state.rules) : $('#aCat').value;
    if ($('#aCat').value !== 'Uncategorised') t.manualCat = true;
    state.txs.push(t); save(); renderAll(); e.target.reset(); $('#aDate').value = todayIso(); $('#aCat').value = 'Uncategorised';
    B.toast('Added');
  });

  // ---------- import ----------
  var FIELDS = [['date', 'Date'], ['description', 'Description'], ['amount', 'Amount (+/−)'], ['debit', 'Debit / money out'], ['credit', 'Credit / money in'], ['balance', 'Balance']];
  function startImport(rows, name) {
    if (!rows.length) { B.toast('That file looks empty'); return; }
    var det = L.detectColumns(rows);
    pending = { rows: rows, det: det, name: name };
    $('#mapPanel').hidden = false;
    $('#mapMsg').innerHTML = det.confident ? '<span class="pill-ok">Recognised</span> ' + esc(name) + ' — check the preview and press Import.'
      : '<span class="pill-warn">Please check</span> ' + esc(det.reasons.join(' ')) + ' Pick the right columns below.';
    $('#mapHeader').checked = det.hasHeader; $('#mapFlip').checked = false;
    $('#mapSelects').innerHTML = FIELDS.map(function (f) {
      return '<div><label for="map_' + f[0] + '">' + f[1] + '</label><select id="map_' + f[0] + '" data-field="' + f[0] + '"><option value="-1">(none)</option>' +
        det.headers.map(function (h, i) { var ex = rows[det.hasHeader ? 1 : 0] ? rows[det.hasHeader ? 1 : 0][i] : ''; return '<option value="' + i + '"' + (det.map[f[0]] === i ? ' selected' : '') + '>' + esc(h + (ex ? ' — ' + String(ex).slice(0, 24) : '')) + '</option>'; }).join('') + '</select></div>';
    }).join('');
    previewImport();
    $('#mapPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function currentImport() {
    var det = { hasHeader: $('#mapHeader').checked, map: {} };
    B.$$('#mapSelects select').forEach(function (s) { det.map[s.dataset.field] = +s.value; });
    var res = L.toTransactions(pending.rows, det, { flipSign: $('#mapFlip').checked, account: $('#mapAccount').value.trim() });
    res.transactions.forEach(function (t) { t.category = L.categorise(t, state.rules); });
    return res;
  }
  function previewImport() {
    if (!pending) return;
    var res = currentImport(), merged = L.mergeTransactions(state.txs, res.transactions);
    $('#mapPreview').innerHTML = (res.transactions.length ? B.table(res.transactions.slice(0, 6), [
      { key: 'date', label: 'Date' }, { key: 'desc', label: 'Description' }, { key: 'amount', label: 'Amount', fmt: amountCell }, { key: 'category', label: 'Category' }
    ]) : '<p class="bad">No rows could be read with these columns.</p>') +
      '<p class="small muted">' + res.transactions.length + ' rows read' + (res.skipped ? ', ' + res.skipped + ' skipped (no date or amount)' : '') + '. ' +
      merged.added.length + ' new, ' + merged.duplicates + ' already imported.</p>';
    $('#mapImport').disabled = !merged.added.length;
    $('#mapImport').textContent = 'Import ' + merged.added.length + ' transactions';
  }
  $('#mapSelects').addEventListener('change', previewImport);
  $('#mapHeader').addEventListener('change', previewImport); $('#mapFlip').addEventListener('change', previewImport);
  $('#mapImport').addEventListener('click', function () {
    var res = currentImport(), merged = L.mergeTransactions(state.txs, res.transactions);
    merged.added.forEach(function (t) { t.id = B.uid(); });
    state.txs = merged.all; save(); pending = null; $('#mapPanel').hidden = true;
    B.toast('Imported ' + merged.added.length + ' transactions' + (merged.duplicates ? ' (' + merged.duplicates + ' duplicates skipped)' : ''), 3000);
    renderAll(); showTab('overview');
  });
  $('#mapCancel').addEventListener('click', function () { pending = null; $('#mapPanel').hidden = true; });
  function readAny(file) {
    if (/\.(xlsx|xls|xlsm|ods)$/i.test(file.name)) {
      return Promise.all([B.lib.xlsx(), B.readFile(file, 'buffer')]).then(function (r) {
        var wb = r[0].read(r[1], { type: 'array' }); return B.csv.parse(r[0].utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { rawNumbers: true }), ',');
      });
    }
    return B.readFile(file).then(function (t) { return B.csv.parse(t); });
  }
  B.dropZone($('#drop'), function (files) {
    var f = files[0];
    readAny(f).then(function (rows) { startImport(rows, f.name); }, function (err) { B.toast('Could not read ' + f.name + ': ' + err.message, 4000); });
    if (files.length > 1) B.toast('One file at a time — importing ' + f.name + ' first');
  }, { accept: '.csv,.txt,.tsv,.xlsx,.xls,.ods' });
  $('#pasteGo').addEventListener('click', function () { startImport(B.csv.parse($('#paste').value), 'Pasted text'); });

  // ---------- budgets ----------
  function renderBudgets() {
    fillMonthSelect($('#bMonth')); var m = $('#bMonth').value;
    var bp = L.budgetProgress(state.txs, state.budgets, m);
    $('#bProgress').innerHTML = bp.length ? budgetBars(bp) : '<p class="muted">Set a budget below to see progress.</p>';
    $('#bInputs').innerHTML = L.CATEGORIES.filter(function (c) { return ['Income', 'Transfers', 'Savings'].indexOf(c) < 0; }).map(function (c) {
      return '<div><label for="bud_' + esc(c) + '">' + esc(c) + '</label><input type="number" min="0" step="10" id="bud_' + esc(c) + '" data-bud="' + esc(c) + '" value="' + (state.budgets[c] || '') + '"></div>';
    }).join('');
  }
  $('#bMonth').addEventListener('change', renderBudgets);
  $('#bSave').addEventListener('click', function () {
    var b = {}; B.$$('[data-bud]').forEach(function (i) { var v = parseFloat(i.value); if (v > 0) b[i.dataset.bud] = v; });
    state.budgets = b; save(); renderAll(); B.toast('Budgets saved');
  });
  $('#bSuggest').addEventListener('click', function () {
    var s = L.suggestBudgets(state.txs, 3); if (!Object.keys(s).length) { B.toast('Import a few months of transactions first'); return; }
    B.$$('[data-bud]').forEach(function (i) { if (s[i.dataset.bud]) i.value = s[i.dataset.bud]; });
    B.toast('Filled in from your average spending. Adjust and save.', 3000);
  });

  // ---------- subscriptions ----------
  var showHidden = false;
  function allSubs() { return L.detectSubscriptions(state.txs); }
  function visibleSubs() { return allSubs().filter(function (s) { return state.hiddenSubs.indexOf(s.merchant) < 0; }); }
  function renderSubs() {
    var all = allSubs(), vis = showHidden ? all : all.filter(function (s) { return state.hiddenSubs.indexOf(s.merchant) < 0; });
    var yearly = vis.reduce(function (a, s) { return a + s.yearly; }, 0);
    $('#subStats').innerHTML = '<div class="stat"><div class="k">Found</div><div class="v">' + vis.length + '</div></div>' +
      '<div class="stat"><div class="k">Per year</div><div class="v">' + esc(money(yearly)) + '</div></div>' +
      '<div class="stat"><div class="k">Per month</div><div class="v">' + esc(money(yearly / 12)) + '</div></div>';
    $('#subTable').innerHTML = vis.length ? B.table(vis, [
      { key: 'merchant', label: 'Merchant', fmt: function (v, r) { return '<strong>' + esc(v) + '</strong><br><span class="small muted">' + esc(r.sample) + '</span>'; } },
      { key: 'cadence', label: 'How often' },
      { key: 'amount', label: 'Usual charge', fmt: function (v) { return esc(money(v)); } },
      { key: 'yearly', label: 'Per year', fmt: function (v) { return '<strong>' + esc(money(v)) + '</strong>'; } },
      { key: 'count', label: 'Seen' },
      { key: 'nextDue', label: 'Next due (est.)' },
      { key: 'merchant', label: '', fmt: function (v) { var h = state.hiddenSubs.indexOf(v) >= 0; return '<button class="btn small" type="button" data-hide="' + esc(v) + '">' + (h ? 'Unhide' : 'Hide') + '</button>'; } }
    ]) : '<p class="muted">No recurring charges found yet.</p>';
    $('#subShowHidden').textContent = showHidden ? 'Hide the ones I hid' : 'Show hidden (' + state.hiddenSubs.length + ')';
  }
  $('#subTable').addEventListener('click', function (e) {
    var m = e.target.getAttribute('data-hide'); if (m == null) return;
    var i = state.hiddenSubs.indexOf(m); if (i >= 0) state.hiddenSubs.splice(i, 1); else state.hiddenSubs.push(m);
    save(); renderSubs();
  });
  $('#subShowHidden').addEventListener('click', function () { showHidden = !showHidden; renderSubs(); });

  // ---------- goals ----------
  function avgSavings() {
    var s = L.monthlySummary(state.txs), cm = todayIso().slice(0, 7);
    var full = s.filter(function (r) { return r.month < cm && r.income > 0; }).slice(-3);
    if (!full.length) return null;
    return full.reduce(function (a, r) { return a + r.net + r.saved; }, 0) / full.length;
  }
  function renderGoals() {
    var avg = avgSavings();
    $('#gAvg').textContent = avg == null ? 'Import a full month of transactions to compare goals against what you usually save.' : 'In an average recent month you save about ' + money(avg) + ' (left over plus money moved to savings).';
    $('#goalList').innerHTML = state.goals.length ? state.goals.map(function (g) {
      var p = L.goalPlan(g, todayIso(), avg), pill = { done: 'pill-ok', ok: 'pill-ok', risk: 'pill-warn', late: 'pill-bad' }[p.status];
      return '<div class="card fin-goal"><h3>' + esc(g.name) + ' <span class="' + pill + '">' + ({ done: 'Done', ok: 'On track', risk: 'Stretch', late: 'Overdue' }[p.status]) + '</span></h3>' +
        '<div class="fin-progress"><div style="width:' + (p.progress * 100).toFixed(1) + '%"></div></div>' +
        '<p>' + esc(money(p.saved)) + ' of ' + esc(money(p.target)) + (g.date ? ' by ' + esc(g.date) : '') + '</p>' +
        (p.monthlyNeeded != null && p.status !== 'done' ? '<p><strong>' + esc(money(p.monthlyNeeded)) + '</strong> a month needed</p>' : '') +
        '<p class="small muted">' + esc(p.note) + '</p>' +
        '<div class="row" style="margin-top:8px"><input class="inline-num" type="number" min="0" step="1" data-gadd="' + esc(g.id) + '" placeholder="Add $" aria-label="Amount to add">' +
        '<button class="btn small" type="button" data-gbtn="' + esc(g.id) + '">Add</button><button class="btn small" type="button" data-gdel="' + esc(g.id) + '">Delete</button></div></div>';
    }).join('') : '<p class="muted">No goals yet.</p>';
  }
  $('#goalForm').addEventListener('submit', function (e) {
    e.preventDefault();
    state.goals.push({ id: B.uid(), name: $('#gName').value.trim(), target: +$('#gTarget').value, saved: +$('#gSaved').value || 0, date: $('#gDate').value });
    save(); e.target.reset(); $('#gSaved').value = 0; renderGoals();
  });
  $('#goalList').addEventListener('click', function (e) {
    var add = e.target.getAttribute('data-gbtn'), del = e.target.getAttribute('data-gdel');
    if (add) { var inp = B.$('[data-gadd="' + add + '"]'), v = parseFloat(inp.value) || 0; state.goals.forEach(function (g) { if (g.id === add) g.saved = Math.max(0, (g.saved || 0) + v); }); save(); renderGoals(); }
    if (del && confirm('Delete this goal?')) { state.goals = state.goals.filter(function (g) { return g.id !== del; }); save(); renderGoals(); }
  });

  // ---------- rules ----------
  function renderRules() {
    $('#rCat').innerHTML = catOptions('Groceries');
    var q = $('#rSearch').value.trim().toLowerCase();
    var rows = state.rules.map(function (r, i) { return { i: i, kw: r.kw, cat: r.cat, learned: r.learned }; })
      .filter(function (r) { return !q || r.kw.indexOf(q) >= 0 || r.cat.toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) { return (b.learned ? 1 : 0) - (a.learned ? 1 : 0) || a.cat.localeCompare(b.cat) || a.kw.localeCompare(b.kw); });
    $('#ruleTable').innerHTML = B.table(rows, [
      { key: 'kw', label: 'Keyword', fmt: function (v, r) { return esc(v) + (r.learned ? ' <span class="tag">learned</span>' : ''); } },
      { key: 'cat', label: 'Category', fmt: function (v, r) { return '<select data-rule="' + r.i + '" aria-label="Category">' + catOptions(v) + '</select>'; } },
      { key: 'i', label: '', fmt: function (v) { return '<button class="btn small" type="button" data-rdel="' + v + '" aria-label="Delete rule">✕</button>'; } }
    ], { limit: 1000 });
  }
  $('#rSearch').addEventListener('input', renderRules);
  $('#ruleTable').addEventListener('change', function (e) { var i = e.target.getAttribute('data-rule'); if (i == null) return; state.rules[+i].cat = e.target.value; save(); });
  $('#ruleTable').addEventListener('click', function (e) { var i = e.target.getAttribute('data-rdel'); if (i == null) return; state.rules.splice(+i, 1); save(); renderRules(); });
  $('#ruleForm').addEventListener('submit', function (e) {
    e.preventDefault(); var kw = $('#rKw').value.trim().toLowerCase(); if (!kw) return;
    state.rules = state.rules.filter(function (r) { return r.kw !== kw; }); state.rules.push({ kw: kw, cat: $('#rCat').value, learned: true });
    state.txs = L.applyRules(state.txs, state.rules); save(); e.target.reset(); renderAll(); B.toast('Rule added and applied');
  });
  $('#rApply').addEventListener('click', function () {
    var before = state.txs.map(function (t) { return t.category; });
    state.txs = L.applyRules(state.txs, state.rules);
    var n = state.txs.filter(function (t, i) { return t.category !== before[i]; }).length;
    save(); renderAll(); B.toast(n + ' transactions changed. Ones you set by hand were left alone.', 3000);
  });
  $('#rReset').addEventListener('click', function () {
    if (!confirm('Replace all rules (including learned ones) with the defaults?')) return;
    state.rules = blank().rules; save(); renderRules(); B.toast('Rules reset');
  });

  // ---------- backup ----------
  $('#exportJson').addEventListener('click', function () { B.download('money-command-centre-' + todayIso() + '.json', JSON.stringify({ app: 'finance', version: 1, data: state }, null, 2), 'application/json'); });
  $('#exportCsv').addEventListener('click', function () {
    B.download('transactions-' + todayIso() + '.csv', B.csv.stringify(state.txs.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }), ['date', 'desc', 'amount', 'category', 'balance', 'account']), 'text/csv');
  });
  $('#importJson').addEventListener('click', function () {
    var inp = B.h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', function () {
      if (!inp.files[0]) return;
      B.readFile(inp.files[0]).then(function (t) {
        var j = JSON.parse(t), d = j && j.data; if (!d || !Array.isArray(d.txs)) throw new Error('This is not a Money Command Centre backup');
        if (!confirm('Replace your current data with this backup (' + d.txs.length + ' transactions)?')) return;
        var b = blank(); Object.keys(b).forEach(function (k) { if (d[k] == null) d[k] = b[k]; });
        state = d; save(); renderAll(); B.toast('Backup restored');
      }).catch(function (err) { B.toast(err.message, 4000); });
    });
    inp.click();
  });
  $('#clearAll').addEventListener('click', function () {
    if (!confirm('Delete all transactions, budgets, goals and learned rules from this browser?')) return;
    state = blank(); save(); renderAll(); B.toast('All data deleted');
  });

  // ---------- sample + navigation ----------
  $('#sample').addEventListener('click', function () {
    if (state.txs.length && !confirm('Add sample transactions to your existing data? (Use Backup → Delete all data first if you want a clean start.)')) return;
    var rows = B.csv.parse(L.sampleCSV(todayIso())), det = L.detectColumns(rows);
    var res = L.toTransactions(rows, det, { account: 'Sample everyday' });
    res.transactions.forEach(function (t) { t.category = L.categorise(t, state.rules); });
    var merged = L.mergeTransactions(state.txs, res.transactions); merged.added.forEach(function (t) { t.id = B.uid(); });
    state.txs = merged.all;
    if (!Object.keys(state.budgets).length) state.budgets = { Groceries: 650, 'Eating out': 300, Transport: 150, Shopping: 200, Subscriptions: 60, Fuel: 120 };
    if (!state.goals.length) { var y = new Date().getFullYear() + 1; state.goals.push({ id: B.uid(), name: 'Emergency fund', target: 10000, saved: 3500, date: y + '-06-30' }, { id: B.uid(), name: 'Japan trip', target: 6000, saved: 1200, date: y + '-03-31' }); }
    save(); renderAll(); showTab('overview'); B.toast('Sample data loaded — ' + merged.added.length + ' transactions');
  });
  var showTab = B.tabs($('[data-tabs="fin"]'), function (id) { render(id); });
  $('#goImport').addEventListener('click', function () { showTab('import'); $('#drop').focus(); });
  // Buttons in the "Start here" box reuse the hero buttons.
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    if (e.target.closest('[data-go-import]')) $('#goImport').click();
    else if (e.target.closest('[data-go-sample]')) $('#sample').click();
  });
  document.addEventListener('click', function (e) { var g = e.target.getAttribute && e.target.getAttribute('data-goto'); if (g) { e.preventDefault(); showTab(g); } });
  $('#ovMonth').addEventListener('change', function () { ovPicked = true; renderOverview(); });

  function render(id) {
    if (id === 'overview') renderOverview(); else if (id === 'tx') renderTx(); else if (id === 'budgets') renderBudgets();
    else if (id === 'subs') renderSubs(); else if (id === 'goals') renderGoals(); else if (id === 'rules') renderRules();
    else if (id === 'data') $('#dataInfo').textContent = state.txs.length + ' transactions, ' + state.rules.length + ' rules, ' + state.goals.length + ' goals stored in this browser.';
  }
  function renderAll() { ['overview', 'tx', 'budgets', 'subs', 'goals', 'rules', 'data'].forEach(render); }

  // Optional AI: a plain-English read of the month (rule-based tips above always show)
  B.ai.button($('#ovAi'), 'Explain this month in plain English', function () {
    var m = $('#ovMonth').value; if (!m) return null;
    var s = L.monthlySummary(state.txs).filter(function (r) { return r.month === m; })[0];
    var cats = L.spendByCategory(state.txs, m).slice(0, 10).map(function (c) { return c.category + ': $' + c.spent.toFixed(0); }).join('; ');
    var subs = visibleSubs().slice(0, 8).map(function (x) { return x.merchant + ' ' + x.cadence + ' $' + x.amount; }).join('; ');
    return 'Month ' + m + '. Income $' + s.income + ', spending $' + s.spend + ', moved to savings $' + s.saved + '. Spending by category: ' + cats + '. Recurring charges: ' + subs +
      '. In 4 short bullet points of plain Australian English, say what stands out and suggest two practical, specific ways to save. No financial product advice.';
  }, function (ans) {
    var box = B.$('#aiAnswer') || B.h('div', { id: 'aiAnswer', class: 'panel' }); box.innerHTML = '<p class="small muted">AI-written — check it against your numbers.</p><div style="white-space:pre-wrap">' + esc(ans) + '</div>';
    $('#ovAi').appendChild(box);
  });
  B.ai.note($('#ovAi'));
})();
