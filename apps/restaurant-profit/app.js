/* Restaurant Profit Calculator — page wiring. All maths lives in lib.js (RestaurantLib). */
(function () {
  'use strict';
  var L = window.RestaurantLib, $ = B.$, esc = B.esc, m = function (v) { return B.fmt.money(v); }, pct = function (v) { return B.fmt.pct(v); };
  var KEY = 'restaurant:data';
  var DEF = { gstRate: 0.1, targetPct: 0.3, roundTo: 0.5 };
  var data = load(), currentRecipe = null, pending = null, showTab;

  function load() {
    var d = B.store.get(KEY, null) || {};
    return { settings: Object.assign({}, DEF, d.settings || {}), ingredients: d.ingredients || [], recipes: d.recipes || [], sales: d.sales || [], waste: d.waste || [], counts: d.counts || [], foodSales: d.foodSales || '' };
  }
  function save() { if (!B.store.set(KEY, data)) B.toast('Could not save — browser storage may be full. Download a backup.', 4000); }
  function opts() { return { gstRate: data.settings.gstRate, targetPct: data.settings.targetPct, roundTo: data.settings.roundTo }; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function pick(accept, cb) { var i = B.h('input', { type: 'file', accept: accept }); i.addEventListener('change', function () { if (i.files[0]) cb(i.files[0]); }); i.click(); }
  function csvDownload(name, rows) { if (!rows.length) return B.toast('Nothing to export'); B.download(name, '﻿' + B.csv.stringify(rows, Object.keys(rows[0])), 'text/csv;charset=utf-8'); }
  function stat(v, k, cls) { return '<div class="stat"><div class="v ' + (cls || '') + '">' + esc(v) + '</div><div class="k">' + esc(k) + '</div></div>'; }
  function fcPill(v) { if (isNaN(v)) return '<span class="small muted">no price</span>'; var t = data.settings.targetPct; return '<span class="' + (v <= t ? 'pill-ok' : v <= t + 0.05 ? 'pill-warn' : 'pill-bad') + '">' + pct(v) + '</span>'; }
  function ing(id) { return data.ingredients.filter(function (i) { return i.id === id; })[0]; }
  function rec(id) { return data.recipes.filter(function (r) { return r.id === id; })[0]; }
  function unitOptions(sel, withPortion) {
    return (withPortion ? '<option value="portion"' + (sel === 'portion' ? ' selected' : '') + '>portion</option>' : '') +
      Object.keys(L.UNITS).map(function (u) { return '<option value="' + u + '"' + (u === sel ? ' selected' : '') + '>' + esc(L.UNITS[u].label) + '</option>'; }).join('');
  }
  function sorted(list) { return list.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }); }

  // ---------- dishes overview ----------
  function renderDishes() {
    var all = L.costMenu(data.ingredients, data.recipes, opts()), dishes = all.filter(function (d) { return !d.sub; });
    if (!data.ingredients.length && !data.recipes.length) {
      $('#dishes').innerHTML = '<div class="panel" style="margin-top:16px"><p>Nothing here yet. Add the <b>Ingredients</b> you buy, then build <b>Recipes</b> from them. Or press <b>Load sample data</b> to see a small burger cafe.</p></div>'; return;
    }
    var priced = dishes.filter(function (d) { return !isNaN(d.foodCostPct); });
    var avg = priced.length ? priced.reduce(function (s, d) { return s + d.foodCostPct; }, 0) / priced.length : NaN;
    var over = priced.filter(function (d) { return d.foodCostPct > data.settings.targetPct; }).length;
    var errs = all.filter(function (d) { return d.errors.length; });
    var html = '<div class="stat-row" style="margin-top:16px">' + stat(String(dishes.length), 'Dishes') + stat(pct(avg), 'Average food cost') +
      stat(String(over), 'Above ' + pct(data.settings.targetPct, 0) + ' target', over ? 'warn' : 'ok') + stat(String(data.ingredients.length), 'Ingredients') + '</div>';
    if (errs.length) html += '<div class="panel"><p class="warn" style="margin:0"><b>Check these recipes:</b> ' + errs.map(function (d) { return esc(d.name) + ' — ' + esc(d.errors[0]); }).join('; ') + '</p></div>';
    html += '<h2>Dish costs</h2>' + B.table(dishes.sort(function (a, b) { return (b.foodCostPct || 0) - (a.foodCostPct || 0); }), [
      { key: 'name', label: 'Dish', fmt: function (v, r) { return '<a href="#" data-open="' + esc(r.id) + '">' + esc(v) + '</a>'; } },
      { key: 'plateCost', label: 'Plate cost', fmt: m }, { key: 'menuPrice', label: 'Menu price (inc GST)', fmt: m },
      { key: 'foodCostPct', label: 'Food cost', fmt: fcPill }, { key: 'margin', label: 'Margin per plate (ex GST)', fmt: m },
      { key: 'suggested', label: 'Price for ' + pct(data.settings.targetPct, 0) + ' (inc GST)', fmt: function (v) { return m(v.inc); } }]) +
      '<p class="row" style="margin-top:8px"><button class="btn small" id="expDishes" type="button">Download CSV</button></p>';
    var subs = all.filter(function (d) { return d.sub; });
    if (subs.length) html += '<h3>Sauces and sub-recipes</h3>' + B.table(subs, [{ key: 'name', label: 'Name', fmt: function (v, r) { return '<a href="#" data-open="' + esc(r.id) + '">' + esc(v) + '</a>'; } }, { key: 'total', label: 'Batch cost', fmt: m },
      { key: 'id', label: 'Makes', fmt: function (v) { var r = rec(v); return r && r.yieldQty ? esc(r.yieldQty + ' ' + (r.yieldUnit || '')) : '–'; } }]);
    $('#dishes').innerHTML = html;
    var ex = $('#expDishes'); if (ex) ex.addEventListener('click', function () {
      csvDownload('dish-costs.csv', dishes.map(function (d) { return { dish: d.name, plate_cost: L.r2(d.plateCost), menu_price_inc_gst: d.menuPrice, food_cost_pct: isNaN(d.foodCostPct) ? '' : L.r2(d.foodCostPct * 100), margin_ex_gst: L.r2(d.margin), suggested_price_inc_gst: d.suggested.inc }; }));
    });
  }
  document.addEventListener('click', function (e) { var a = e.target.closest('[data-open]'); if (!a) return; e.preventDefault(); currentRecipe = a.dataset.open; showTab('recipes'); });

  // ---------- ingredients ----------
  function renderIngredients() {
    var q = ($('#ingSearch').value || '').toLowerCase();
    var list = sorted(data.ingredients).filter(function (i) { return !q || (i.name + ' ' + i.supplier).toLowerCase().indexOf(q) >= 0; });
    if (!data.ingredients.length) { $('#ingTable').innerHTML = '<p class="muted">No ingredients yet.</p>'; return; }
    $('#ingTable').innerHTML = '<div class="table-wrap"><table class="edit-table"><thead><tr><th>Name</th><th>Supplier</th><th>Pack size</th><th>Unit</th><th>Pack price $</th><th>Yield %</th><th>Density g/ml</th><th class="num">Usable cost</th><th></th></tr></thead><tbody>' +
      list.map(function (i) {
        var c = L.costPerDisplayUnit(i);
        return '<tr data-id="' + esc(i.id) + '"><td><input class="name" data-k="name" value="' + esc(i.name) + '" aria-label="Name"></td>' +
          '<td><input data-k="supplier" value="' + esc(i.supplier || '') + '" aria-label="Supplier"></td>' +
          '<td><input type="number" step="any" min="0" data-k="packSize" value="' + esc(i.packSize) + '" aria-label="Pack size"></td>' +
          '<td><select data-k="packUnit" aria-label="Pack unit">' + unitOptions(L.unitKey(i.packUnit) || 'each') + '</select></td>' +
          '<td><input type="number" step="0.01" min="0" data-k="packPrice" value="' + esc(i.packPrice) + '" aria-label="Pack price"></td>' +
          '<td><input type="number" step="1" min="1" max="100" data-k="yieldPct" value="' + esc(i.yieldPct == null ? 100 : i.yieldPct) + '" aria-label="Yield %"></td>' +
          '<td><input type="number" step="0.01" min="0" data-k="density" value="' + esc(i.density || '') + '" aria-label="Density"></td>' +
          '<td class="num">' + (isNaN(c.cost) ? '–' : m(c.cost) + '/' + c.unit) + '</td>' +
          '<td><button class="btn small" type="button" data-del-ing="' + esc(i.id) + '">Delete</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  $('#ingTable').addEventListener('change', function (e) {
    var tr = e.target.closest('[data-id]'), k = e.target.dataset.k; if (!tr || !k) return;
    var i = ing(tr.dataset.id); i[k] = /packSize|packPrice|yieldPct/.test(k) ? +e.target.value : e.target.value; save(); renderAll();
  });
  $('#ingTable').addEventListener('click', function (e) {
    var b = e.target.closest('[data-del-ing]'); if (!b) return;
    var id = b.dataset.delIng, used = data.recipes.filter(function (r) { return (r.items || []).some(function (it) { return it.type === 'ing' && it.ref === id; }); });
    if (!confirm('Delete "' + ing(id).name + '"?' + (used.length ? ' It is used in: ' + used.map(function (r) { return r.name; }).join(', ') + '.' : ''))) return;
    data.ingredients = data.ingredients.filter(function (i) { return i.id !== id; }); save(); renderAll();
  });
  $('#addIng').addEventListener('click', function () {
    data.ingredients.push({ id: B.uid(), name: 'New ingredient', supplier: '', packSize: 1, packUnit: 'kg', packPrice: 0, yieldPct: 100, density: '' });
    $('#ingSearch').value = ''; save(); renderAll(); var ins = B.$$('#ingTable input.name'); var n = ins.filter(function (x) { return x.value === 'New ingredient'; })[0]; if (n) { n.focus(); n.select(); }
  });
  $('#ingSearch').addEventListener('input', renderIngredients);
  $('#expIng').addEventListener('click', function () { csvDownload('ingredients.csv', data.ingredients.map(function (i) { return { name: i.name, supplier: i.supplier, packSize: i.packSize, packUnit: i.packUnit, packPrice: i.packPrice, yieldPct: i.yieldPct, density: i.density || '' }; })); });
  $('#impIng').addEventListener('click', function () {
    pick('.csv,.tsv,.txt,.xlsx,.xls,.json', function (f) {
      B.readTable(f).then(function (t) {
        var added = 0, updated = 0;
        t.rows.forEach(function (r) {
          var g = norm(r), name = String(g.name || '').trim(); if (!name) return;
          var ex = data.ingredients.filter(function (i) { return i.name.toLowerCase() === name.toLowerCase(); })[0];
          var o = { name: name, supplier: g.supplier || '', packSize: B.toNumber(g.packsize) || 1, packUnit: L.unitKey(g.packunit || g.unit) || 'each', packPrice: B.toNumber(g.packprice || g.price) || 0, yieldPct: B.toNumber(g.yieldpct || g.yield) || 100, density: g.density || '' };
          if (ex) { Object.assign(ex, o); updated++; } else { o.id = B.uid(); data.ingredients.push(o); added++; }
        });
        save(); renderAll(); B.toast(added + ' added, ' + updated + ' updated');
      }).catch(function (err) { B.toast('Could not read that file: ' + err.message, 4000); });
    });
  });
  function norm(row) { var o = {}; Object.keys(row).forEach(function (k) { o[k.toLowerCase().replace(/[^a-z]/g, '')] = row[k]; }); return o; }

  // ---------- recipes ----------
  function renderRecipePick() {
    var dishes = sorted(data.recipes.filter(function (r) { return !r.sub; })), subs = sorted(data.recipes.filter(function (r) { return r.sub; }));
    if (!rec(currentRecipe)) currentRecipe = (dishes[0] || subs[0] || {}).id || null;
    $('#recipePick').innerHTML = (data.recipes.length ? '' : '<option value="">No recipes yet</option>') +
      (dishes.length ? '<optgroup label="Dishes">' + dishes.map(function (r) { return '<option value="' + esc(r.id) + '"' + (r.id === currentRecipe ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join('') + '</optgroup>' : '') +
      (subs.length ? '<optgroup label="Sauces / sub-recipes">' + subs.map(function (r) { return '<option value="' + esc(r.id) + '"' + (r.id === currentRecipe ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join('') + '</optgroup>' : '');
  }
  function renderRecipe() {
    renderRecipePick();
    var r = rec(currentRecipe), ed = $('#recipeEditor');
    if (!r) { ed.innerHTML = '<p class="muted" style="margin:0">Choose a recipe, or add a new dish. Make sauces, dressings and bases as sub-recipes so you can use them in several dishes.</p>'; return; }
    var ctx = L.context(data.ingredients, data.recipes), c = L.recipeCost(r, ctx), s = data.settings;
    var fc = L.foodCostPct(c.perPortion, r.menuPrice, s.gstRate), sug = L.suggestPrice(c.perPortion, s.targetPct, s.gstRate, s.roundTo);
    var refOpts = '<optgroup label="Ingredients">' + sorted(data.ingredients).map(function (i) { return '<option value="ing:' + esc(i.id) + '">' + esc(i.name) + '</option>'; }).join('') + '</optgroup>' +
      '<optgroup label="Sub-recipes">' + sorted(data.recipes.filter(function (x) { return x.sub && x.id !== r.id; })).map(function (x) { return '<option value="recipe:' + esc(x.id) + '">' + esc(x.name) + '</option>'; }).join('') + '</optgroup>';
    ed.innerHTML = '<div class="form-grid">' +
      '<div class="full"><label for="rName">Name</label><input type="text" id="rName" value="' + esc(r.name) + '"></div>' +
      '<div><label for="rPortions">' + (r.sub ? 'Portions in one batch (optional)' : 'Portions this recipe makes') + '</label><input type="number" id="rPortions" min="1" step="any" value="' + esc(r.portions || 1) + '"></div>' +
      (r.sub ? '<div><label for="rYieldQty">One batch makes</label><input type="number" id="rYieldQty" min="0" step="any" value="' + esc(r.yieldQty || '') + '"></div>' +
        '<div><label for="rYieldUnit">Unit</label><select id="rYieldUnit">' + unitOptions(L.unitKey(r.yieldUnit) || 'l') + '</select></div>' +
        '<div><label for="rDensity">Density g/ml (optional)</label><input type="number" id="rDensity" min="0" step="0.01" value="' + esc(r.density || '') + '"></div>'
        : '<div><label for="rPrice">Menu price inc GST ($)</label><input type="number" id="rPrice" min="0" step="0.1" value="' + esc(r.menuPrice || '') + '"></div>') +
      '</div><h3>Ingredients</h3><div class="table-wrap"><table class="edit-table"><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th class="num">Cost</th><th></th></tr></thead><tbody id="rLines">' +
      (r.items || []).map(function (it, idx) {
        var lc = c.lines[idx] || { cost: 0 }, val = it.type + ':' + it.ref;
        return '<tr data-idx="' + idx + '"><td><select data-k="ref" aria-label="Item">' + refOpts.replace('value="' + esc(val) + '"', 'value="' + esc(val) + '" selected') + '</select></td>' +
          '<td><input type="number" step="any" min="0" data-k="qty" value="' + esc(it.qty) + '" aria-label="Quantity"></td>' +
          '<td><select data-k="unit" aria-label="Unit">' + unitOptions(it.unit || 'g', it.type === 'recipe') + '</select></td>' +
          '<td class="num">' + (lc.error ? '<span class="bad" title="' + esc(lc.error) + '">' + esc(lc.error) + '</span>' : m(lc.cost)) + '</td>' +
          '<td><button class="btn small" type="button" data-del-line="' + idx + '" aria-label="Remove line">✕</button></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn small" type="button" id="rAdd"' + (data.ingredients.length ? '' : ' disabled') + '>+ Add item</button></div>' +
      '<div class="stat-row" style="margin-top:14px">' + stat(m(c.total), 'Batch cost') + stat(m(c.perPortion), 'Cost per portion') +
      (r.sub ? (r.yieldQty ? stat(m(c.total / r.yieldQty) + '/' + (r.yieldUnit || ''), 'Cost per unit made') : '') :
        stat(isNaN(fc) ? '–' : pct(fc), 'Food cost', isNaN(fc) ? '' : fc <= s.targetPct ? 'ok' : 'warn') + stat(m(sug.inc), 'Price for ' + pct(s.targetPct, 0) + ' food cost') +
        stat(m(L.exGst(r.menuPrice, s.gstRate) - c.perPortion), 'Margin per plate (ex GST)')) + '</div>' +
      '<div class="row" style="margin-top:14px"><label class="check" style="margin:0"><input type="checkbox" id="rSub"' + (r.sub ? ' checked' : '') + '> This is a sauce / sub-recipe</label>' +
      '<button class="btn small" type="button" id="rCopy">Duplicate</button><button class="btn small" type="button" id="rDel">Delete recipe</button></div>';
    function set(k, conv) { return function () { r[k] = conv ? conv(this.value) : this.value; save(); refresh(); }; }
    function on(id, k, conv) { var el = $(id); if (el) el.addEventListener('change', set(k, conv)); }
    on('#rName', 'name'); on('#rPortions', 'portions', Number); on('#rPrice', 'menuPrice', Number); on('#rYieldQty', 'yieldQty', Number); on('#rYieldUnit', 'yieldUnit'); on('#rDensity', 'density');
    $('#rSub').addEventListener('change', function () { r.sub = this.checked; if (r.sub && !r.yieldUnit) { r.yieldUnit = 'l'; } save(); refresh(); });
    $('#rLines').addEventListener('change', function (e) {
      var tr = e.target.closest('[data-idx]'), it = r.items[+tr.dataset.idx], k = e.target.dataset.k;
      if (k === 'ref') { var p = e.target.value.split(':'); it.type = p[0]; it.ref = p.slice(1).join(':'); if (it.type === 'recipe' && !rec(it.ref).yieldUnit) it.unit = 'portion'; }
      else if (k === 'qty') it.qty = +e.target.value; else it.unit = e.target.value;
      save(); refresh();
    });
    $('#rLines').addEventListener('click', function (e) { var b = e.target.closest('[data-del-line]'); if (!b) return; r.items.splice(+b.dataset.delLine, 1); save(); refresh(); });
    $('#rAdd').addEventListener('click', function () { var f = sorted(data.ingredients)[0]; r.items = r.items || []; r.items.push({ type: 'ing', ref: f.id, qty: 100, unit: L.kindOf(f.packUnit) === 'count' ? 'each' : L.kindOf(f.packUnit) === 'volume' ? 'ml' : 'g' }); save(); refresh(); });
    $('#rCopy').addEventListener('click', function () { var copy = JSON.parse(JSON.stringify(r)); copy.id = B.uid(); copy.name = r.name + ' (copy)'; data.recipes.push(copy); currentRecipe = copy.id; save(); refresh(); });
    $('#rDel').addEventListener('click', function () {
      var users = data.recipes.filter(function (x) { return (x.items || []).some(function (it) { return it.type === 'recipe' && it.ref === r.id; }); });
      if (!confirm('Delete "' + r.name + '"?' + (users.length ? ' It is used in: ' + users.map(function (x) { return x.name; }).join(', ') + '.' : ''))) return;
      data.recipes = data.recipes.filter(function (x) { return x.id !== r.id; }); currentRecipe = null; save(); refresh();
    });
  }
  function refresh() { renderAll(); }
  $('#recipePick').addEventListener('change', function () { currentRecipe = this.value; renderRecipe(); });
  function newRecipe(sub) { var r = { id: B.uid(), name: sub ? 'New sauce' : 'New dish', sub: sub, portions: 1, menuPrice: sub ? 0 : '', yieldQty: sub ? 1 : '', yieldUnit: sub ? 'l' : '', items: [] }; data.recipes.push(r); currentRecipe = r.id; save(); renderAll(); $('#rName').focus(); $('#rName').select(); }
  $('#newDish').addEventListener('click', function () { newRecipe(false); });
  $('#newSub').addEventListener('click', function () { newRecipe(true); });

  // ---------- menu engineering ----------
  function salesQty(id) { var s = data.sales.filter(function (x) { return x.recipeId === id; })[0]; return s ? s.qty : ''; }
  function menuItems() {
    var costs = L.costMenu(data.ingredients, data.recipes, opts()).filter(function (d) { return !d.sub; });
    return costs.filter(function (d) { return salesQty(d.id) !== '' && d.menuPrice > 0; }).map(function (d) { return { id: d.id, name: d.name, qty: +salesQty(d.id), price: d.priceEx, cost: d.plateCost }; });
  }
  function renderMenu() {
    var dishes = sorted(data.recipes.filter(function (r) { return !r.sub; }));
    $('#salesInputs').innerHTML = dishes.length ? '<div class="table-wrap"><table class="edit-table"><thead><tr><th>Dish</th><th>Number sold</th></tr></thead><tbody>' + dishes.map(function (d) {
      return '<tr><td>' + esc(d.name) + (d.menuPrice > 0 ? '' : ' <span class="small warn">(no menu price)</span>') + '</td><td><input type="number" min="0" step="1" data-sales="' + esc(d.id) + '" value="' + esc(salesQty(d.id)) + '" aria-label="Number sold of ' + esc(d.name) + '"></td></tr>';
    }).join('') + '</tbody></table></div>' : '<p class="muted">Add some dishes first.</p>';
    var items = menuItems();
    if (items.length < 2) { $('#menuResult').innerHTML = '<p class="muted">Enter sales for at least two dishes with a menu price.</p>'; return; }
    var r = L.menuEngineering(items), groups = { star: [], plowhorse: [], puzzle: [], dog: [] };
    r.items.forEach(function (i) { groups[i.quadrant].push(i); });
    function box(k) { var q = L.QUADRANTS[k]; return '<div><h3>' + esc(q.label) + 's (' + groups[k].length + ')</h3><p>' + esc(q.action) + '</p><ul>' + groups[k].map(function (i) { return '<li>' + esc(i.name) + '</li>'; }).join('') + '</ul></div>'; }
    $('#menuResult').innerHTML = '<h2>Results</h2><p class="small muted">Average contribution margin ' + m(r.avgCm) + ' per dish. A dish counts as popular when it has at least ' + pct(r.popThreshold) + ' of all ' + B.fmt.num(r.totalQty, 0) + ' sales (70% of an equal share). Total margin ' + m(r.totalCm) + '.</p>' +
      '<div class="quad">' + box('puzzle') + box('star') + box('dog') + box('plowhorse') + '</div>' + scatter(r) +
      B.table(r.items.slice().sort(function (a, b) { return b.totalCm - a.totalCm; }), [{ key: 'name', label: 'Dish' }, { key: 'qty', label: 'Sold', fmt: function (v) { return B.fmt.num(v, 0); } }, { key: 'mix', label: 'Menu mix', fmt: function (v) { return pct(v); } },
        { key: 'cm', label: 'Margin each', fmt: m }, { key: 'totalCm', label: 'Total margin', fmt: m },
        { key: 'label', label: 'Class', fmt: function (v, row) { return '<span class="' + ({ star: 'pill-ok', plowhorse: 'pill-warn', puzzle: 'pill-warn', dog: 'pill-bad' })[row.quadrant] + '">' + esc(v) + '</span>'; } }]);
  }
  // Popularity (x) vs margin (y) scatter, quadrants split at the thresholds.
  function scatter(r) {
    var W = 640, H = 300, P = 36, xs = r.items.map(function (i) { return i.mix; }), ys = r.items.map(function (i) { return i.cm; });
    var xMax = Math.max.apply(null, xs.concat([r.popThreshold])) * 1.1 || 1, yMin = Math.min.apply(null, ys.concat([0])), yMax = Math.max.apply(null, ys.concat([r.avgCm])) * 1.1 || 1;
    function X(v) { return P + v / xMax * (W - 2 * P); } function Y(v) { return H - P - (v - yMin) / (yMax - yMin || 1) * (H - 2 * P); }
    return '<svg class="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Dishes by popularity and margin">' +
      '<line class="axis" x1="' + P + '" y1="' + (H - P) + '" x2="' + (W - P) + '" y2="' + (H - P) + '"/><line class="axis" x1="' + P + '" y1="' + P + '" x2="' + P + '" y2="' + (H - P) + '"/>' +
      '<line class="guide" x1="' + X(r.popThreshold) + '" y1="' + P + '" x2="' + X(r.popThreshold) + '" y2="' + (H - P) + '"/><line class="guide" x1="' + P + '" y1="' + Y(r.avgCm) + '" x2="' + (W - P) + '" y2="' + Y(r.avgCm) + '"/>' +
      '<text x="' + (W - P) + '" y="' + (H - 10) + '" text-anchor="end">more popular →</text><text x="6" y="' + (P - 12) + '">↑ higher margin</text>' +
      r.items.map(function (i) { var x = X(i.mix), y = Y(i.cm); return '<circle class="dot" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="5"/><text x="' + (x + 7).toFixed(1) + '" y="' + (y + 4).toFixed(1) + '"' + (x > W * 0.7 ? ' text-anchor="end" dx="-14"' : '') + '>' + esc(i.name.slice(0, 22)) + '</text>'; }).join('') + '</svg>';
  }
  $('#salesInputs').addEventListener('change', function (e) {
    var id = e.target.dataset.sales; if (!id) return;
    data.sales = data.sales.filter(function (s) { return s.recipeId !== id; }); if (e.target.value !== '') data.sales.push({ recipeId: id, qty: +e.target.value });
    save(); renderMenu(); renderStock();
  });
  $('#impSales').addEventListener('click', function () {
    pick('.csv,.tsv,.txt,.xlsx,.xls', function (f) {
      B.readTable(f).then(function (t) {
        var ok = 0, miss = [];
        t.rows.forEach(function (row) {
          var g = norm(row), name = String(g.dish || g.name || g.item || g.product || '').trim().toLowerCase(), q = B.toNumber(g.qty || g.quantity || g.sold || g.count);
          var r = data.recipes.filter(function (x) { return !x.sub && x.name.toLowerCase() === name; })[0];
          if (!r || isNaN(q)) { if (name) miss.push(name); return; }
          data.sales = data.sales.filter(function (s) { return s.recipeId !== r.id; }); data.sales.push({ recipeId: r.id, qty: q }); ok++;
        });
        save(); renderAll(); B.toast(ok + ' dishes updated' + (miss.length ? '; not matched: ' + miss.slice(0, 4).join(', ') : ''), 4000);
      }).catch(function (err) { B.toast('Could not read that file: ' + err.message, 4000); });
    });
  });
  $('#expMenu').addEventListener('click', function () {
    var items = menuItems(); if (items.length < 2) return B.toast('Enter sales first');
    csvDownload('menu-engineering.csv', L.menuEngineering(items).items.map(function (i) { return { dish: i.name, sold: i.qty, menu_mix_pct: L.r2(i.mix * 100), margin_each: L.r2(i.cm), total_margin: L.r2(i.totalCm), class: i.label, action: i.action }; }));
  });

  // ---------- supplier prices ----------
  function renderSupplier() {
    var cur = $('#spIng').value;
    $('#spIng').innerHTML = sorted(data.ingredients).map(function (i) { return '<option value="' + esc(i.id) + '"' + (i.id === cur ? ' selected' : '') + '>' + esc(i.name) + ' — now ' + m(i.packPrice) + ' per ' + esc(i.packSize + ' ' + i.packUnit) + '</option>'; }).join('');
  }
  function showImpact(next, matched, unmatched) {
    var imp = L.priceImpact(data.ingredients, next, data.recipes, opts());
    pending = { ingredients: next };
    var html = '<div class="panel"><h2 style="margin-top:0">Effect on your dishes</h2>' +
      '<p class="small">' + matched.map(function (x) { return esc(x.name) + ': ' + m(x.before) + ' → ' + m(x.after) + ' <span class="' + (x.after > x.before ? 'bad' : 'ok') + '">(' + (x.after >= x.before ? '+' : '') + pct(x.before ? (x.after - x.before) / x.before : 0) + ')</span>'; }).join('<br>') + '</p>' +
      (unmatched.length ? '<p class="small warn">Not matched to an ingredient: ' + unmatched.slice(0, 10).map(function (u) { return esc(u.name || u.id || '?'); }).join(', ') + '</p>' : '');
    html += imp.length ? B.table(imp, [{ key: 'name', label: 'Dish' }, { key: 'before', label: 'Plate cost before', fmt: m }, { key: 'after', label: 'After', fmt: m },
      { key: 'change', label: 'Change', fmt: function (v, r) { return '<span class="' + (v > 0 ? 'bad' : 'ok') + '">' + (v > 0 ? '+' : '') + m(v) + ' (' + pct(r.changePct) + ')</span>'; } },
      { key: 'fcAfter', label: 'Food cost before → after', fmt: function (v, r) { return r.sub ? '–' : (isNaN(r.fcBefore) ? '–' : pct(r.fcBefore)) + ' → ' + fcPill(v); } },
      { key: 'keepFcPrice', label: 'New price to keep the same food cost %', fmt: function (v, r) { return r.sub || isNaN(v) ? '–' : m(v) + ' <span class="small muted">(now ' + m(r.menuPrice) + ')</span>'; } }])
      : '<p class="muted">No dish uses these ingredients, so no plate costs change.</p>';
    html += '<div class="row" style="margin-top:12px"><button class="btn primary" id="spApply" type="button">Save the new prices</button><button class="btn" id="spCancel" type="button">Cancel</button>' +
      (imp.length ? '<button class="btn" id="spCsv" type="button">Download CSV</button>' : '') + '</div></div>';
    $('#spResult').innerHTML = html;
    $('#spApply').addEventListener('click', function () { data.ingredients = pending.ingredients; pending = null; save(); $('#spResult').innerHTML = ''; renderAll(); B.toast('Prices saved'); });
    $('#spCancel').addEventListener('click', function () { pending = null; $('#spResult').innerHTML = ''; });
    var c = $('#spCsv'); if (c) c.addEventListener('click', function () { csvDownload('price-change-impact.csv', imp.map(function (r) { return { item: r.name, plate_cost_before: L.r2(r.before), plate_cost_after: L.r2(r.after), change: L.r2(r.change), food_cost_before_pct: isNaN(r.fcBefore) ? '' : L.r2(r.fcBefore * 100), food_cost_after_pct: isNaN(r.fcAfter) ? '' : L.r2(r.fcAfter * 100), menu_price: r.menuPrice, price_to_keep_food_cost: isNaN(r.keepFcPrice) ? '' : r.keepFcPrice }; })); });
  }
  $('#spPreview').addEventListener('click', function () {
    var i = ing($('#spIng').value), p = $('#spPrice').value; if (!i || p === '') return B.toast('Choose an ingredient and enter the new price');
    var res = L.applyPriceList(data.ingredients, [{ id: i.id, packPrice: +p }]); showImpact(res.ingredients, res.matched, res.unmatched);
  });
  $('#spImport').addEventListener('click', function () {
    pick('.csv,.tsv,.txt,.xlsx,.xls', function (f) {
      B.readTable(f).then(function (t) {
        var rows = t.rows.map(function (r) { var g = norm(r); return { name: g.name || g.item || g.product || g.description, packPrice: g.packprice || g.price || g.cost, packSize: g.packsize, packUnit: g.packunit || g.unit, supplier: g.supplier }; });
        var res = L.applyPriceList(data.ingredients, rows); showImpact(res.ingredients, res.matched, res.unmatched);
      }).catch(function (err) { B.toast('Could not read that file: ' + err.message, 4000); });
    });
  });

  // ---------- wastage ----------
  function renderWaste() {
    var cur = $('#wIng').value;
    $('#wIng').innerHTML = sorted(data.ingredients).map(function (i) { return '<option value="' + esc(i.id) + '"' + (i.id === cur ? ' selected' : '') + '>' + esc(i.name) + '</option>'; }).join('');
    syncWasteUnit();
    var s = L.wasteSummary(data.waste, data.ingredients, $('#wFrom').value, $('#wTo').value);
    if (!s.rows.length) { $('#wResult').innerHTML = '<p class="muted">No wastage logged for this period.</p>'; return; }
    $('#wResult').innerHTML = '<div class="stat-row" style="margin-top:12px">' + stat(m(s.total), 'Wastage cost') + stat(String(s.rows.length), 'Entries') + '</div>' +
      '<div class="cols-2"><div><h3>By reason</h3>' + B.barChart(s.byReason, { fmt: m }) + '</div><div><h3>By ingredient</h3>' + B.barChart(s.byIngredient.slice(0, 10), { fmt: m }) + '</div></div>' +
      '<h3>Log</h3>' + B.table(s.rows.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }), [{ key: 'date', label: 'Date' }, { key: 'name', label: 'Ingredient' }, { key: 'qty', label: 'Qty', fmt: function (v, r) { return esc(v + ' ' + (r.unit || '')); } },
        { key: 'reason', label: 'Reason' }, { key: 'cost', label: 'Cost', fmt: m }, { key: 'id', label: '', fmt: function (v) { return '<button class="btn small" type="button" data-del-w="' + esc(v) + '">Delete</button>'; } }]);
  }
  function syncWasteUnit() { var i = ing($('#wIng').value), u = i ? L.unitKey(i.packUnit) : 'kg'; if ($('#wUnit').dataset.for !== (i && i.id)) { $('#wUnit').innerHTML = unitOptions(u); $('#wUnit').dataset.for = i ? i.id : ''; } }
  $('#wIng').addEventListener('change', syncWasteUnit);
  $('#wForm').addEventListener('submit', function (e) {
    e.preventDefault(); if (!$('#wIng').value) return B.toast('Add ingredients first');
    data.waste.push({ id: B.uid(), date: $('#wDate').value, ingredientId: $('#wIng').value, qty: +$('#wQty').value, unit: $('#wUnit').value, reason: $('#wReason').value });
    $('#wQty').value = ''; save(); renderWaste(); B.toast('Logged');
  });
  $('#wResult').addEventListener('click', function (e) { var b = e.target.closest('[data-del-w]'); if (!b) return; data.waste = data.waste.filter(function (w) { return w.id !== b.dataset.delW; }); save(); renderWaste(); });
  ['#wFrom', '#wTo'].forEach(function (s) { $(s).addEventListener('change', renderWaste); });
  $('#wExport').addEventListener('click', function () { var s = L.wasteSummary(data.waste, data.ingredients, $('#wFrom').value, $('#wTo').value); csvDownload('wastage.csv', s.rows.map(function (r) { return { date: r.date, ingredient: r.name, qty: r.qty, unit: r.unit, reason: r.reason, cost: L.r2(r.cost) }; })); });

  // ---------- stocktake ----------
  function count(id) { return data.counts.filter(function (c) { return c.ingredientId === id; })[0] || { ingredientId: id, opening: '', purchases: '', closing: '' }; }
  function renderStock() {
    $('#foodSales').value = data.foodSales;
    $('#countTable').innerHTML = data.ingredients.length ? '<div class="table-wrap"><table class="edit-table"><thead><tr><th>Ingredient</th><th>Opening</th><th>Purchases</th><th>Closing</th><th>Unit</th></tr></thead><tbody>' +
      sorted(data.ingredients).map(function (i) { var c = count(i.id); return '<tr data-cid="' + esc(i.id) + '"><td>' + esc(i.name) + '</td>' + ['opening', 'purchases', 'closing'].map(function (k) { return '<td><input type="number" step="any" min="0" data-k="' + k + '" value="' + esc(c[k]) + '" aria-label="' + k + ' ' + esc(i.name) + '"></td>'; }).join('') + '<td>' + esc(i.packUnit) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '<p class="muted">Add ingredients first.</p>';
    var counted = data.counts.filter(function (c) { return c.opening !== '' || c.purchases !== '' || c.closing !== ''; });
    if (!counted.length) { $('#stockResult').innerHTML = '<p class="muted">Enter stock counts for the ingredients you want to check (start with your most expensive ones).</p>'; return; }
    var r = L.theoreticalVsActual(data.ingredients, data.recipes, data.sales, counted, data.foodSales);
    $('#stockResult').innerHTML = '<div class="stat-row" style="margin-top:12px">' + stat(m(r.theoCost), 'Should have used (theoretical)') + stat(m(r.actualCost), 'Actually used') +
      stat(m(r.variance), 'Difference', r.variance > 0 ? 'bad' : 'ok') + stat(isNaN(r.theoPct) ? '–' : pct(r.theoPct) + ' → ' + pct(r.actualPct), 'Food cost: theoretical → actual') + '</div>' +
      (data.sales.length ? '' : '<p class="small warn">No sales entered on the Menu engineering tab, so theoretical use is zero.</p>') +
      B.table(r.rows, [{ key: 'name', label: 'Ingredient' }, { key: 'theoQty', label: 'Should have used', fmt: function (v, x) { return esc(B.fmt.num(v, 2) + ' ' + x.unit); } },
        { key: 'actQty', label: 'Actually used', fmt: function (v, x) { return esc(B.fmt.num(v, 2) + ' ' + x.unit); } },
        { key: 'variance', label: 'Difference ($)', fmt: function (v) { return '<span class="' + (v > 0.005 ? 'bad' : 'ok') + '">' + m(v) + '</span>'; } }]) +
      '<p class="small muted">Theoretical use includes trim loss (yield %). Unlogged wastage, over-portioning and missed invoices all show up as a positive difference.</p>';
  }
  $('#countTable').addEventListener('change', function (e) {
    var tr = e.target.closest('[data-cid]'); if (!tr) return;
    var c = count(tr.dataset.cid); if (data.counts.indexOf(c) < 0) data.counts.push(c);
    c[e.target.dataset.k] = e.target.value === '' ? '' : +e.target.value; save(); renderStock();
  });
  $('#foodSales').addEventListener('change', function () { data.foodSales = this.value === '' ? '' : +this.value; save(); renderStock(); });

  // ---------- settings ----------
  function renderSettings() { $('#sTarget').value = L.r2(data.settings.targetPct * 100); $('#sGst').value = L.r2(data.settings.gstRate * 100); $('#sRound').value = String(data.settings.roundTo); }
  $('#sTarget').addEventListener('change', function () { var v = +this.value; if (v > 0 && v <= 100) { data.settings.targetPct = v / 100; save(); renderAll(); } });
  $('#sGst').addEventListener('change', function () { var v = +this.value; if (v >= 0) { data.settings.gstRate = v / 100; save(); renderAll(); } });
  $('#sRound').addEventListener('change', function () { data.settings.roundTo = +this.value; save(); renderAll(); });
  $('#backup').addEventListener('click', function () { B.download('restaurant-profit-backup-' + today() + '.json', JSON.stringify(Object.assign({ app: 'restaurant-profit', version: 1, exported: new Date().toISOString() }, data), null, 2), 'application/json'); });
  $('#restore').addEventListener('click', function () {
    pick('.json', function (f) {
      B.readFile(f).then(function (t) {
        var d = JSON.parse(t); if (!d || !Array.isArray(d.ingredients) || !Array.isArray(d.recipes)) throw new Error('This is not a Restaurant Profit backup');
        if (!confirm('Replace everything here with this backup (' + d.ingredients.length + ' ingredients, ' + d.recipes.length + ' recipes)?')) return;
        B.store.set(KEY, d); data = load(); renderAll(); B.toast('Backup restored');
      }).catch(function (err) { B.toast(err.message, 4000); });
    });
  });
  $('#clearAll').addEventListener('click', function () { if (!confirm('Delete ALL ingredients, recipes, sales, wastage and counts from this browser?')) return; B.store.remove(KEY); data = load(); currentRecipe = null; renderAll(); });
  $('#sample').addEventListener('click', function () {
    if ((data.ingredients.length || data.recipes.length) && !confirm('Replace your current data with sample data? Download a backup first if you want to keep it.')) return;
    var s = L.sample(); data = { settings: Object.assign({}, data.settings), ingredients: s.ingredients, recipes: s.recipes, sales: s.sales, waste: s.waste, counts: s.counts, foodSales: s.foodSales };
    currentRecipe = 'burger'; save(); renderAll(); showTab('dishes'); B.toast('Sample cafe loaded (made-up numbers)');
  });

  // ---------- print ----------
  $('#printReport').addEventListener('click', function () {
    var dishes = L.costMenu(data.ingredients, data.recipes, opts()).filter(function (d) { return !d.sub; });
    if (!dishes.length) return B.toast('Add some dishes first');
    var ctx = L.context(data.ingredients, data.recipes);
    var body = '<h1>Dish costing report</h1><p>' + esc(today()) + ' · target food cost ' + pct(data.settings.targetPct, 0) + ' · prices include GST at ' + pct(data.settings.gstRate, 0) + '</p>' +
      '<table><thead><tr><th>Dish</th><th>Plate cost</th><th>Menu price</th><th>Food cost</th><th>Suggested</th></tr></thead><tbody>' + dishes.map(function (d) { return '<tr><td>' + esc(d.name) + '</td><td>' + m(d.plateCost) + '</td><td>' + m(d.menuPrice) + '</td><td>' + pct(d.foodCostPct) + '</td><td>' + m(d.suggested.inc) + '</td></tr>'; }).join('') + '</tbody></table>' +
      dishes.map(function (d) { var r = ctx.recipes[d.id]; return '<h2>' + esc(d.name) + '</h2><table><tbody>' + d.lines.map(function (l) { var it = l.item, nm = it.type === 'recipe' ? (ctx.recipes[it.ref] || {}).name : (ctx.ingredients[it.ref] || {}).name; return '<tr><td>' + esc(nm || '?') + '</td><td>' + esc(it.qty + ' ' + it.unit) + '</td><td>' + m(l.cost) + '</td></tr>'; }).join('') + '<tr><th>Per portion (' + esc(r.portions || 1) + ' made)</th><th></th><th>' + m(d.plateCost) + '</th></tr></tbody></table>'; }).join('');
    var f = B.h('iframe', { style: 'position:fixed;width:0;height:0;border:0', title: 'print' }); document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write('<!doctype html><html><head><meta charset="utf-8"><title>Dish costing report</title><style>body{font:13px system-ui,sans-serif;color:#000;margin:20px}table{border-collapse:collapse;width:100%;margin:6px 0 14px}td,th{border-bottom:1px solid #ccc;padding:4px 6px;text-align:left}h2{font-size:15px;margin:16px 0 4px;page-break-after:avoid}</style></head><body>' + body + '</body></html>'); f.contentDocument.close();
    setTimeout(function () { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(function () { f.remove(); }, 1000); }, 200);
  });

  function renderAll() { renderDishes(); renderIngredients(); renderRecipe(); renderMenu(); renderSupplier(); renderWaste(); renderStock(); renderSettings(); }
  $('#wDate').value = today();
  showTab = B.tabs($('[data-tabs="rp"]'), function (id) { if (id === 'recipes') renderRecipe(); });
  renderAll();
})();
