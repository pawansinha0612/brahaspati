/* Restaurant Profit Calculator — pure maths: unit conversion, yields, nested recipe costing, food cost %, pricing,
   wastage, menu engineering (Kasavana & Smith), supplier price changes, theoretical vs actual food cost. No DOM. */
(function (root) {
  'use strict';

  // ---------- units ----------
  // Every unit belongs to a kind and has a factor to that kind's base unit (g, ml or each).
  // Spoons and cups are Australian metric: tsp 5 ml, tbsp 20 ml, cup 250 ml.
  var UNITS = {
    g: { kind: 'mass', f: 1, label: 'g' }, kg: { kind: 'mass', f: 1000, label: 'kg' },
    oz: { kind: 'mass', f: 28.349523125, label: 'oz' }, lb: { kind: 'mass', f: 453.59237, label: 'lb' },
    ml: { kind: 'volume', f: 1, label: 'ml' }, l: { kind: 'volume', f: 1000, label: 'l' },
    tsp: { kind: 'volume', f: 5, label: 'tsp (5 ml)' }, tbsp: { kind: 'volume', f: 20, label: 'tbsp (20 ml, AU)' }, cup: { kind: 'volume', f: 250, label: 'cup (250 ml)' },
    each: { kind: 'count', f: 1, label: 'each' }, dozen: { kind: 'count', f: 12, label: 'dozen' }
  };
  var BASE = { mass: 'g', volume: 'ml', count: 'each' };

  function unitKey(u) {
    var s = String(u || '').trim().toLowerCase().replace(/\.$/, '');
    var alias = { gram: 'g', grams: 'g', gm: 'g', gms: 'g', kilo: 'kg', kilos: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg', litre: 'l', litres: 'l', liter: 'l', liters: 'l', lt: 'l', ltr: 'l',
      millilitre: 'ml', millilitres: 'ml', mls: 'ml', teaspoon: 'tsp', teaspoons: 'tsp', tablespoon: 'tbsp', tablespoons: 'tbsp', cups: 'cup', ea: 'each', pc: 'each', pcs: 'each', piece: 'each', pieces: 'each', unit: 'each', units: 'each', dz: 'dozen', pound: 'lb', pounds: 'lb', lbs: 'lb', ounce: 'oz', ounces: 'oz' };
    s = alias[s] || s;
    return UNITS[s] ? s : null;
  }
  function kindOf(u) { var k = unitKey(u); return k ? UNITS[k].kind : null; }

  // Convert qty from one unit to another. density = grams per ml (water 1, oil ~0.92, flour ~0.53) bridges mass <-> volume.
  // Returns NaN when the conversion is impossible (e.g. "each" to grams, or mass<->volume without a density).
  function convert(qty, from, to, density) {
    var a = unitKey(from), b = unitKey(to); qty = +qty;
    if (!a || !b || isNaN(qty)) return NaN;
    var ua = UNITS[a], ub = UNITS[b], base = qty * ua.f;
    if (ua.kind === ub.kind) return base / ub.f;
    var d = +density;
    if (!(d > 0)) return NaN;
    if (ua.kind === 'volume' && ub.kind === 'mass') return base * d / ub.f;
    if (ua.kind === 'mass' && ub.kind === 'volume') return base / d / ub.f;
    return NaN;
  }

  function r2(n) { return Math.round((+n + Number.EPSILON) * 100) / 100; }
  function r4(n) { return Math.round((+n + Number.EPSILON) * 10000) / 10000; }
  function num(v, d) { var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? (d == null ? 0 : d) : n; }
  function yieldOf(ing) { var y = num(ing.yieldPct, 100); return y > 0 && y <= 100 ? y / 100 : (y > 100 ? 1 : 1); }

  // ---------- ingredients ----------
  // Cost of one base unit (g / ml / each) of USABLE ingredient, after trim and waste (yield %).
  function ingBaseKind(ing) { return kindOf(ing.packUnit) || 'count'; }
  function costPerBase(ing) {
    var size = convert(num(ing.packSize), ing.packUnit, BASE[ingBaseKind(ing)]);
    if (!(size > 0)) return NaN;
    return num(ing.packPrice) / (size * yieldOf(ing));
  }
  // Price per kg / l / each of the usable product — easier for people to read.
  function costPerDisplayUnit(ing) {
    var k = ingBaseKind(ing), c = costPerBase(ing);
    return { unit: k === 'mass' ? 'kg' : k === 'volume' ? 'l' : 'each', cost: k === 'count' ? c : c * 1000 };
  }

  // ---------- recipes ----------
  // recipe: { id, name, sub (bool: sauce/base used inside other recipes), portions, yieldQty, yieldUnit, menuPrice (GST incl), items:[{type:'ing'|'recipe', ref, qty, unit}] }
  // ctx: { ingredients: {id: ing}, recipes: {id: recipe} } (arrays are accepted too)
  function index(list) { if (!Array.isArray(list)) return list || {}; var o = {}; list.forEach(function (x) { o[x.id] = x; }); return o; }
  function context(ingredients, recipes) { return { ingredients: index(ingredients), recipes: index(recipes) }; }

  // Cost of one line. Returns {cost, error}
  function lineCost(item, ctx, stack) {
    var qty = num(item.qty);
    if (item.type === 'recipe') {
      var sub = ctx.recipes[item.ref];
      if (!sub) return { cost: 0, error: 'Missing sub-recipe' };
      var rc = recipeCost(sub, ctx, stack);
      if (rc.error) return { cost: 0, error: rc.error };
      if (unitKey(item.unit) === null && /^portions?$/i.test(String(item.unit || 'portion'))) return { cost: qty * rc.perPortion };
      var yk = kindOf(sub.yieldUnit);
      if (!yk || !(num(sub.yieldQty) > 0)) return { cost: 0, error: 'Set how much "' + sub.name + '" one batch makes' };
      var used = convert(qty, item.unit, sub.yieldUnit, sub.density);
      if (isNaN(used)) return { cost: 0, error: 'Can\'t convert ' + (item.unit || '?') + ' to ' + sub.yieldUnit + ' for "' + sub.name + '"' };
      return { cost: rc.total * used / num(sub.yieldQty) };
    }
    var ing = ctx.ingredients[item.ref];
    if (!ing) return { cost: 0, error: 'Missing ingredient' };
    var per = costPerBase(ing);
    if (isNaN(per)) return { cost: 0, error: 'Pack size missing for "' + ing.name + '"' };
    var base = convert(qty, item.unit, BASE[ingBaseKind(ing)], ing.density);
    if (isNaN(base)) return { cost: 0, error: 'Can\'t convert ' + (item.unit || '?') + ' to ' + ing.packUnit + ' for "' + ing.name + '"' + (ing.density ? '' : ' (add a density)') };
    return { cost: base * per };
  }

  // Total batch cost and cost per portion. Detects loops (A uses B uses A).
  function recipeCost(recipe, ctx, stack) {
    stack = stack || [];
    if (stack.indexOf(recipe.id) >= 0) return { total: 0, perPortion: 0, lines: [], error: 'Recipe loop: ' + stack.concat(recipe.id).map(function (id) { return (ctx.recipes[id] || {}).name || id; }).join(' → ') };
    var next = stack.concat(recipe.id), total = 0, errors = [];
    var lines = (recipe.items || []).map(function (it) {
      var c = lineCost(it, ctx, next); if (c.error) errors.push(c.error); total += c.cost; return { item: it, cost: c.cost, error: c.error || '' };
    });
    var portions = num(recipe.portions, 1) > 0 ? num(recipe.portions, 1) : 1;
    var loop = errors.filter(function (e) { return /^Recipe loop/.test(e); })[0];
    return { total: total, perPortion: total / portions, lines: lines, errors: errors, error: loop || '' };
  }

  function exGst(price, gstRate) { return num(price) / (1 + (gstRate == null ? 0.1 : gstRate)); }
  // Food cost % = plate cost / menu price ex GST.
  function foodCostPct(plateCost, menuPriceInc, gstRate) { var ex = exGst(menuPriceInc, gstRate); return ex > 0 ? plateCost / ex : NaN; }
  // Price needed so the food cost is targetPct (0.30 = 30%). Rounds the GST-inclusive price UP to roundTo (e.g. 0.5).
  function suggestPrice(plateCost, targetPct, gstRate, roundTo) {
    gstRate = gstRate == null ? 0.1 : gstRate;
    if (!(targetPct > 0)) return { ex: NaN, inc: NaN };
    var ex = plateCost / targetPct, inc = ex * (1 + gstRate);
    if (roundTo > 0) inc = Math.ceil(inc / roundTo - 1e-9) * roundTo;
    return { ex: r2(inc / (1 + gstRate)), inc: r2(inc) };
  }

  // Full costing of every non-sub recipe (dishes on the menu)
  function costMenu(ingredients, recipes, opts) {
    opts = opts || {}; var ctx = context(ingredients, recipes), g = opts.gstRate == null ? 0.1 : opts.gstRate, t = opts.targetPct || 0.3;
    return (Array.isArray(recipes) ? recipes : Object.keys(ctx.recipes).map(function (k) { return ctx.recipes[k]; })).map(function (r) {
      var c = recipeCost(r, ctx), price = num(r.menuPrice), ex = exGst(price, g);
      return { id: r.id, name: r.name, sub: !!r.sub, total: c.total, plateCost: c.perPortion, menuPrice: price, priceEx: ex, foodCostPct: ex > 0 ? c.perPortion / ex : NaN,
        margin: ex - c.perPortion, suggested: suggestPrice(c.perPortion, t, g, opts.roundTo == null ? 0.5 : opts.roundTo), errors: c.errors || [], lines: c.lines };
    });
  }

  // Ingredient quantities (usable, base units) needed for `portions` portions of a recipe, walking sub-recipes.
  function explode(recipe, portions, ctx, out, stack) {
    out = out || {}; stack = stack || [];
    if (stack.indexOf(recipe.id) >= 0) return out;
    var p = num(recipe.portions, 1) > 0 ? num(recipe.portions, 1) : 1, scale = portions / p;
    (recipe.items || []).forEach(function (it) {
      var q = num(it.qty) * scale;
      if (it.type === 'recipe') {
        var sub = ctx.recipes[it.ref]; if (!sub) return;
        var sp = num(sub.portions, 1) > 0 ? num(sub.portions, 1) : 1, batches;
        if (unitKey(it.unit) === null) batches = q / sp; // portions of the sub-recipe
        else { var used = convert(q, it.unit, sub.yieldUnit, sub.density); if (isNaN(used) || !(num(sub.yieldQty) > 0)) return; batches = used / num(sub.yieldQty); }
        explode(sub, batches * sp, ctx, out, stack.concat(recipe.id));
      } else {
        var ing = ctx.ingredients[it.ref]; if (!ing) return;
        var base = convert(q, it.unit, BASE[ingBaseKind(ing)], ing.density); if (isNaN(base)) return;
        out[ing.id] = (out[ing.id] || 0) + base;
      }
    });
    return out;
  }

  // ---------- wastage ----------
  // entry: {date, ingredientId, qty, unit, reason}. Wasted stock is valued at the purchase price (no yield — it was never used).
  function wasteCost(entry, ctx) {
    var ing = ctx.ingredients[entry.ingredientId]; if (!ing) return 0;
    var size = convert(num(ing.packSize), ing.packUnit, BASE[ingBaseKind(ing)]);
    var base = convert(num(entry.qty), entry.unit || ing.packUnit, BASE[ingBaseKind(ing)], ing.density);
    if (!(size > 0) || isNaN(base)) return 0;
    return base * num(ing.packPrice) / size;
  }
  function wasteSummary(entries, ingredients, from, to) {
    var ctx = context(ingredients, []), byReason = {}, byIng = {}, total = 0, rows = [];
    (entries || []).forEach(function (e) {
      if (from && e.date < from) return; if (to && e.date > to) return;
      var c = wasteCost(e, ctx), ing = ctx.ingredients[e.ingredientId], name = ing ? ing.name : '(deleted)';
      total += c; byReason[e.reason || 'Other'] = (byReason[e.reason || 'Other'] || 0) + c; byIng[name] = (byIng[name] || 0) + c;
      rows.push(Object.assign({ cost: c, name: name }, e));
    });
    function sorted(o) { return Object.keys(o).map(function (k) { return { label: k, value: r2(o[k]) }; }).sort(function (a, b) { return b.value - a.value; }); }
    return { total: r2(total), byReason: sorted(byReason), byIngredient: sorted(byIng), rows: rows };
  }

  // ---------- menu engineering ----------
  // items: [{name, qty (sold), price (ex GST), cost (plate)}]. Kasavana & Smith: popular if menu-mix % >= 70% of an equal share;
  // high-profit if contribution margin >= the weighted average margin.
  var QUADRANTS = {
    star: { label: 'Star', action: 'Keep it exactly as is. Feature it, keep quality consistent, and test a small price rise.' },
    plowhorse: { label: 'Plowhorse', action: 'Popular but low margin. Trim the portion or swap a costly ingredient, pair it with a high-margin side, or nudge the price.' },
    puzzle: { label: 'Puzzle', action: 'Profitable but not ordered enough. Move it to a better spot on the menu, rename or describe it better, get staff to recommend it.' },
    dog: { label: 'Dog', action: 'Low sales and low margin. Remove it, or rework it into something cheaper to make.' }
  };
  function menuEngineering(items, opts) {
    opts = opts || {}; var factor = opts.factor == null ? 0.7 : opts.factor;
    var list = (items || []).filter(function (i) { return num(i.qty) > 0 || i.qty === 0 || i.qty === '0'; }).map(function (i) {
      var price = num(i.price), cost = num(i.cost), qty = num(i.qty); return { name: i.name, qty: qty, price: price, cost: cost, cm: price - cost };
    });
    var n = list.length, totalQty = list.reduce(function (s, i) { return s + i.qty; }, 0);
    var totalCm = list.reduce(function (s, i) { return s + i.cm * i.qty; }, 0);
    var avgCm = totalQty ? totalCm / totalQty : 0, popThreshold = n ? factor / n : 0;
    list.forEach(function (i) {
      i.mix = totalQty ? i.qty / totalQty : 0; i.totalCm = i.cm * i.qty;
      i.popular = i.mix >= popThreshold - 1e-12; i.profitable = i.cm >= avgCm - 1e-9;
      i.quadrant = i.popular ? (i.profitable ? 'star' : 'plowhorse') : (i.profitable ? 'puzzle' : 'dog');
      i.label = QUADRANTS[i.quadrant].label; i.action = QUADRANTS[i.quadrant].action;
    });
    return { items: list, avgCm: avgCm, popThreshold: popThreshold, totalQty: totalQty, totalCm: totalCm };
  }

  // ---------- supplier price changes ----------
  // Apply a price list [{name|id, packPrice, packSize?, packUnit?, supplier?}] to ingredients (copy). Match by id, then by name (case-insensitive).
  function applyPriceList(ingredients, rows) {
    var out = ingredients.map(function (i) { return Object.assign({}, i); }), matched = [], unmatched = [];
    function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
    (rows || []).forEach(function (r) {
      var target = out.filter(function (i) { return (r.id && i.id === r.id) || (key(r.name) && key(i.name) === key(r.name)); })[0];
      var price = num(r.packPrice != null ? r.packPrice : r.price, NaN);
      if (!target || isNaN(price)) { unmatched.push(r); return; }
      var before = target.packPrice;
      target.packPrice = price;
      if (r.packSize != null && r.packSize !== '' && num(r.packSize) > 0) target.packSize = num(r.packSize);
      if (r.packUnit && unitKey(r.packUnit)) target.packUnit = unitKey(r.packUnit);
      if (r.supplier) target.supplier = r.supplier;
      matched.push({ id: target.id, name: target.name, before: num(before), after: price });
    });
    return { ingredients: out, matched: matched, unmatched: unmatched };
  }
  // Compare dish costs before and after a set of ingredient changes.
  function priceImpact(oldIngs, newIngs, recipes, opts) {
    opts = opts || {}; var g = opts.gstRate == null ? 0.1 : opts.gstRate;
    var a = costMenu(oldIngs, recipes, opts), b = costMenu(newIngs, recipes, opts);
    return a.map(function (x, i) {
      var y = b[i], keepPct = x.foodCostPct > 0 ? suggestPrice(y.plateCost, x.foodCostPct, g, opts.roundTo == null ? 0.5 : opts.roundTo) : { inc: NaN };
      return { id: x.id, name: x.name, sub: x.sub, before: x.plateCost, after: y.plateCost, change: y.plateCost - x.plateCost, changePct: x.plateCost ? (y.plateCost - x.plateCost) / x.plateCost : 0,
        fcBefore: x.foodCostPct, fcAfter: y.foodCostPct, marginBefore: x.margin, marginAfter: y.margin, menuPrice: x.menuPrice, keepFcPrice: keepPct.inc, targetPrice: y.suggested.inc };
    }).filter(function (r) { return Math.abs(r.change) > 0.00001; }).sort(function (p, q) { return Math.abs(q.change) - Math.abs(p.change); });
  }

  // ---------- theoretical vs actual ----------
  // counts: [{ingredientId, opening, purchases, closing}] in the ingredient's pack unit (e.g. kg). sales: [{recipeId, qty}]
  function stockValue(ing, qty) { var size = num(ing.packSize); return size > 0 ? num(qty) / size * num(ing.packPrice) : 0; }
  function theoreticalVsActual(ingredients, recipes, sales, counts, foodSalesExGst) {
    var ctx = context(ingredients, recipes), use = {};
    (sales || []).forEach(function (s) { var r = ctx.recipes[s.recipeId]; if (r && num(s.qty) > 0) explode(r, num(s.qty), ctx, use); });
    var theoCost = 0, actualCost = 0, rows = [];
    (counts || []).forEach(function (c) {
      var ing = ctx.ingredients[c.ingredientId]; if (!ing) return;
      var kind = ingBaseKind(ing), usable = use[ing.id] || 0;
      var theoQty = convert(usable / yieldOf(ing), BASE[kind], ing.packUnit); // as purchased, in pack unit
      var actQty = num(c.opening) + num(c.purchases) - num(c.closing);
      var tv = stockValue(ing, theoQty), av = stockValue(ing, actQty);
      theoCost += tv; actualCost += av;
      rows.push({ id: ing.id, name: ing.name, unit: ing.packUnit, theoQty: theoQty, actQty: actQty, varQty: actQty - theoQty, theoCost: tv, actCost: av, variance: av - tv });
    });
    rows.sort(function (a, b) { return b.variance - a.variance; });
    var s = num(foodSalesExGst);
    return { rows: rows, theoCost: theoCost, actualCost: actualCost, variance: actualCost - theoCost, theoPct: s ? theoCost / s : NaN, actualPct: s ? actualCost / s : NaN };
  }

  // ---------- sample data (made up) ----------
  function sample() {
    var I = [
      ['beef', 'Beef mince (premium)', 'Northside Meats', 5, 'kg', 72.5, 100, ''], ['bun', 'Brioche buns', 'Crumb Bakery', 24, 'each', 26.4, 100, ''],
      ['ched', 'Cheddar slices', 'Dairy Direct', 1, 'kg', 18.9, 100, ''], ['lett', 'Cos lettuce', 'Market Greens', 12, 'each', 21, 70, ''],
      ['tom', 'Tomatoes', 'Market Greens', 5, 'kg', 24, 90, ''], ['onion', 'Brown onions', 'Market Greens', 10, 'kg', 16, 85, ''],
      ['pot', 'Potatoes (washed)', 'Market Greens', 20, 'kg', 34, 80, ''], ['oil', 'Canola fry oil', 'Wholesale Co', 20, 'l', 64, 100, '0.92'],
      ['mayo', 'Whole egg mayonnaise', 'Wholesale Co', 2.5, 'l', 21.5, 100, '0.95'], ['chip', 'Chipotle in adobo', 'Wholesale Co', 2, 'kg', 38, 100, ''],
      ['salmon', 'Salmon fillet (skin on)', 'Harbour Seafood', 1, 'kg', 38.5, 92, ''], ['lemon', 'Lemons', 'Market Greens', 1, 'kg', 7.5, 100, ''],
      ['rice', 'Jasmine rice', 'Wholesale Co', 10, 'kg', 26, 100, ''], ['chick', 'Chicken thigh fillet', 'Northside Meats', 5, 'kg', 59, 95, ''],
      ['cream', 'Thickened cream', 'Dairy Direct', 2, 'l', 13.8, 100, '1.01'], ['flour', 'Plain flour', 'Wholesale Co', 12.5, 'kg', 17.5, 100, '0.53'],
      ['egg', 'Eggs (free range)', 'Dairy Direct', 15, 'dozen', 99, 100, ''], ['butter', 'Butter (unsalted)', 'Dairy Direct', 1, 'kg', 14.2, 100, '']
    ].map(function (r) { return { id: r[0], name: r[1], supplier: r[2], packSize: r[3], packUnit: r[4], packPrice: r[5], yieldPct: r[6], density: r[7] }; });
    function it(ref, qty, unit, type) { return { type: type || 'ing', ref: ref, qty: qty, unit: unit }; }
    var R = [
      { id: 'aioli', name: 'Chipotle aioli', sub: true, portions: 1, yieldQty: 1, yieldUnit: 'l', density: 0.95, menuPrice: 0, items: [it('mayo', 900, 'ml'), it('chip', 120, 'g'), it('lemon', 60, 'g')] },
      { id: 'chips', name: 'Chips (side)', portions: 1, menuPrice: 9, items: [it('pot', 250, 'g'), it('oil', 2, 'tbsp')] },
      { id: 'burger', name: 'Cheeseburger', portions: 1, menuPrice: 24, items: [it('beef', 180, 'g'), it('bun', 1, 'each'), it('ched', 2 * 20, 'g'), it('lett', 0.1, 'each'), it('tom', 40, 'g'), it('onion', 30, 'g'), it('aioli', 30, 'ml', 'recipe'), it('chips', 1, 'portion', 'recipe')] },
      { id: 'salmon', name: 'Crispy-skin salmon', portions: 1, menuPrice: 36, items: [it('salmon', 200, 'g'), it('rice', 90, 'g'), it('lemon', 30, 'g'), it('butter', 15, 'g')] },
      { id: 'chicken', name: 'Chicken & rice bowl', portions: 1, menuPrice: 22, items: [it('chick', 200, 'g'), it('rice', 100, 'g'), it('aioli', 25, 'ml', 'recipe'), it('lett', 0.15, 'each')] },
      { id: 'pancake', name: 'Buttermilk pancakes', portions: 4, menuPrice: 15, items: [it('flour', 2, 'cup'), it('egg', 2, 'each'), it('cream', 250, 'ml'), it('butter', 60, 'g')] },
      { id: 'creamchicken', name: 'Creamy chicken pasta', portions: 1, menuPrice: 27, items: [it('chick', 160, 'g'), it('cream', 150, 'ml'), it('onion', 40, 'g'), it('butter', 10, 'g')] }
    ];
    var sales = [{ recipeId: 'burger', qty: 420 }, { recipeId: 'chips', qty: 160 }, { recipeId: 'salmon', qty: 95 }, { recipeId: 'chicken', qty: 310 }, { recipeId: 'pancake', qty: 60 }, { recipeId: 'creamchicken', qty: 70 }];
    var waste = [
      { id: 'w1', date: '2026-11-01', ingredientId: 'lett', qty: 3, unit: 'each', reason: 'Spoiled' }, { id: 'w2', date: '2026-11-02', ingredientId: 'salmon', qty: 0.4, unit: 'kg', reason: 'Over-production' },
      { id: 'w3', date: '2026-11-03', ingredientId: 'pot', qty: 2.5, unit: 'kg', reason: 'Prep error' }, { id: 'w4', date: '2026-11-05', ingredientId: 'cream', qty: 0.5, unit: 'l', reason: 'Expired' },
      { id: 'w5', date: '2026-11-06', ingredientId: 'beef', qty: 0.6, unit: 'kg', reason: 'Dropped / returned' }
    ];
    var counts = [
      { ingredientId: 'beef', opening: 12, purchases: 75, closing: 9 }, { ingredientId: 'pot', opening: 30, purchases: 160, closing: 5 },
      { ingredientId: 'chick', opening: 8, purchases: 80, closing: 9 }, { ingredientId: 'salmon', opening: 4, purchases: 22, closing: 4 },
      { ingredientId: 'rice', opening: 20, purchases: 30, closing: 10 }
    ];
    return { ingredients: I, recipes: R, sales: sales, waste: waste, counts: counts, foodSales: 22300 };
  }

  var L = { UNITS: UNITS, BASE: BASE, QUADRANTS: QUADRANTS, unitKey: unitKey, kindOf: kindOf, convert: convert, r2: r2, r4: r4, num: num, costPerBase: costPerBase, costPerDisplayUnit: costPerDisplayUnit,
    context: context, lineCost: lineCost, recipeCost: recipeCost, exGst: exGst, foodCostPct: foodCostPct, suggestPrice: suggestPrice, costMenu: costMenu, explode: explode,
    wasteCost: wasteCost, wasteSummary: wasteSummary, menuEngineering: menuEngineering, applyPriceList: applyPriceList, priceImpact: priceImpact,
    stockValue: stockValue, theoreticalVsActual: theoreticalVsActual, sample: sample };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.RestaurantLib = L;
})(this);
