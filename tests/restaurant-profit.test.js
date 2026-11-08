const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/restaurant-profit/lib.js');

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) < (eps || 1e-6), (msg || '') + ' expected ' + b + ' got ' + a);

test('convert: same-kind units, Australian spoons/cups, density bridges mass and volume', () => {
  assert.strictEqual(L.convert(1.5, 'kg', 'g'), 1500);
  assert.strictEqual(L.convert(250, 'ml', 'l'), 0.25);
  assert.strictEqual(L.convert(1, 'tbsp', 'ml'), 20);
  assert.strictEqual(L.convert(2, 'cup', 'ml'), 500);
  assert.strictEqual(L.convert(2, 'dozen', 'each'), 24);
  near(L.convert(1, 'lb', 'g'), 453.59237);
  near(L.convert(2, 'cup', 'g', 0.53), 265); // 2 cups flour
  near(L.convert(920, 'g', 'l', 0.92), 1);
  assert.ok(isNaN(L.convert(1, 'cup', 'g')), 'no density -> NaN');
  assert.ok(isNaN(L.convert(1, 'each', 'g', 1)), 'count to mass is impossible');
  assert.strictEqual(L.convert(3, 'Kilos', 'grams'), 3000);
});

test('costPerBase applies yield: trimmed lettuce and fish cost more per usable unit', () => {
  const lettuce = { packSize: 12, packUnit: 'each', packPrice: 21, yieldPct: 70 };
  near(L.costPerBase(lettuce), 21 / (12 * 0.7));
  const salmon = { packSize: 1, packUnit: 'kg', packPrice: 38.5, yieldPct: 92 };
  near(L.costPerBase(salmon) * 200, 38.5 / 920 * 200); // 200 g usable
  assert.deepStrictEqual(L.costPerDisplayUnit({ packSize: 5, packUnit: 'kg', packPrice: 50, yieldPct: 100 }), { unit: 'kg', cost: 10 });
  assert.ok(isNaN(L.costPerBase({ packSize: 0, packUnit: 'kg', packPrice: 5 })));
});

test('recipeCost: ingredients by volume with density, sub-recipe by volume and by portion', () => {
  const d = L.sample(); const ctx = L.context(d.ingredients, d.recipes);
  const aioli = L.recipeCost(ctx.recipes.aioli, ctx);
  const expAioli = 900 * (21.5 / 2500) + 120 * (38 / 2000) + 60 * (7.5 / 1000);
  near(aioli.total, expAioli);
  const chips = L.recipeCost(ctx.recipes.chips, ctx);
  near(chips.total, 250 * 34 / (20000 * 0.8) + 40 * 64 / 20000);
  const burger = L.recipeCost(ctx.recipes.burger, ctx);
  const exp = 180 * 72.5 / 5000 + 26.4 / 24 + 40 * 18.9 / 1000 + 0.1 * 21 / (12 * 0.7) + 40 * 24 / (5000 * 0.9) + 30 * 16 / (10000 * 0.85) + expAioli * 30 / 1000 + chips.total;
  near(burger.perPortion, exp);
  assert.deepStrictEqual(burger.errors, []);
});

test('portions divide the batch; pancakes use cups of flour converted by density', () => {
  const d = L.sample(); const ctx = L.context(d.ingredients, d.recipes);
  const p = L.recipeCost(ctx.recipes.pancake, ctx);
  const flour = 500 * 0.53 * 17.5 / 12500, egg = 2 * 99 / 180, cream = 250 * 13.8 / 2000, butter = 60 * 14.2 / 1000;
  near(p.total, flour + egg + cream + butter);
  near(p.perPortion, p.total / 4);
});

test('recipe loops and missing conversions are reported, not crashed on', () => {
  const ings = [{ id: 'a', name: 'Rice', packSize: 1, packUnit: 'kg', packPrice: 3 }];
  const recs = [{ id: 'x', name: 'X', sub: true, yieldQty: 1, yieldUnit: 'kg', items: [{ type: 'recipe', ref: 'y', qty: 100, unit: 'g' }] },
    { id: 'y', name: 'Y', sub: true, yieldQty: 1, yieldUnit: 'kg', items: [{ type: 'recipe', ref: 'x', qty: 100, unit: 'g' }] },
    { id: 'z', name: 'Z', items: [{ type: 'ing', ref: 'a', qty: 1, unit: 'cup' }] }];
  const ctx = L.context(ings, recs);
  assert.match(L.recipeCost(recs[0], ctx).error, /Recipe loop: X → Y → X/);
  const z = L.recipeCost(recs[2], ctx);
  assert.strictEqual(z.total, 0);
  assert.match(z.errors[0], /add a density/);
});

test('food cost % and suggested price include GST and round up', () => {
  near(L.foodCostPct(6.6, 22, 0.1), 0.33);
  assert.deepStrictEqual(L.suggestPrice(7.2, 0.3, 0.1, 0.5), { ex: 24.09, inc: 26.5 }); // 24 ex -> 26.40 inc -> rounded up to 26.50
  const s = L.suggestPrice(7.2, 0.3, 0.1, 0);
  assert.deepStrictEqual(s, { ex: 24, inc: 26.4 });
  assert.deepStrictEqual(L.suggestPrice(10, 0.25, 0, 1), { ex: 40, inc: 40 });
});

test('menu engineering classifies Stars, Plowhorses, Puzzles and Dogs (Kasavana & Smith)', () => {
  const r = L.menuEngineering([
    { name: 'Burger', qty: 400, price: 21.82, cost: 7 },   // popular, CM 14.82
    { name: 'Parma', qty: 300, price: 20, cost: 9 },       // popular, CM 11
    { name: 'Steak', qty: 60, price: 40, cost: 16 },       // not popular, CM 24
    { name: 'Soup', qty: 40, price: 12, cost: 4 }          // not popular, CM 8
  ]);
  const by = Object.fromEntries(r.items.map((i) => [i.name, i.quadrant]));
  assert.deepStrictEqual(by, { Burger: 'star', Parma: 'plowhorse', Steak: 'puzzle', Soup: 'dog' });
  near(r.popThreshold, 0.7 / 4);
  near(r.avgCm, (400 * 14.82 + 300 * 11 + 60 * 24 + 40 * 8) / 800);
  assert.match(r.items[3].action, /Remove/);
});

test('applyPriceList matches by name (case/space-insensitive) and keeps unmatched rows', () => {
  const d = L.sample();
  const res = L.applyPriceList(d.ingredients, [{ name: '  beef MINCE (premium) ', packPrice: '$80.00' }, { name: 'Truffles', packPrice: 900 }, { name: 'Potatoes (washed)', price: 40, packSize: 25, packUnit: 'kilos' }]);
  assert.strictEqual(res.matched.length, 2);
  assert.strictEqual(res.unmatched[0].name, 'Truffles');
  const beef = res.ingredients.find((i) => i.id === 'beef');
  assert.strictEqual(beef.packPrice, 80);
  assert.strictEqual(d.ingredients.find((i) => i.id === 'beef').packPrice, 72.5, 'original untouched');
  const pot = res.ingredients.find((i) => i.id === 'pot');
  assert.deepStrictEqual([pot.packPrice, pot.packSize, pot.packUnit], [40, 25, 'kg']);
});

test('priceImpact shows which dishes changed, by how much, and a price that keeps the old food cost %', () => {
  const d = L.sample();
  const next = L.applyPriceList(d.ingredients, [{ name: 'Beef mince (premium)', packPrice: 82.5 }]).ingredients;
  const imp = L.priceImpact(d.ingredients, next, d.recipes, { roundTo: 0 });
  assert.deepStrictEqual(imp.map((r) => r.name), ['Cheeseburger']);
  near(imp[0].change, 180 * 10 / 5000); // $10 more per 5 kg, 180 g
  near(imp[0].keepFcPrice, imp[0].after / imp[0].fcBefore * 1.1, 0.01);
  assert.ok(imp[0].fcAfter > imp[0].fcBefore);
  // a sub-recipe change flows through to every dish that uses it
  const mayo = L.applyPriceList(d.ingredients, [{ name: 'Whole egg mayonnaise', packPrice: 30 }]).ingredients;
  const names = L.priceImpact(d.ingredients, mayo, d.recipes).map((r) => r.name).sort();
  assert.deepStrictEqual(names, ['Cheeseburger', 'Chicken & rice bowl', 'Chipotle aioli']);
});

test('explode walks nested recipes into ingredient quantities', () => {
  const d = L.sample(); const ctx = L.context(d.ingredients, d.recipes);
  const use = L.explode(ctx.recipes.burger, 10, ctx);
  near(use.beef, 1800);
  near(use.pot, 2500); // 10 × chips portion (250 g)
  near(use.mayo, 10 * 30 * 900 / 1000); // aioli 30 ml per burger, 900 ml mayo per litre
  near(use.oil, 10 * 40);
  const pan = L.explode(ctx.recipes.pancake, 8, ctx); // 2 batches
  near(pan.egg, 4);
  near(pan.flour, 2 * 2 * 250 * 0.53);
});

test('wastage is valued at purchase price and grouped by reason and ingredient', () => {
  const d = L.sample();
  const w = L.wasteSummary(d.waste, d.ingredients);
  near(w.total, L.r2(3 * 21 / 12 + 0.4 * 38.5 + 2.5 * 34 / 20 + 0.5 * 13.8 / 2 + 0.6 * 72.5 / 5), 0.011);
  assert.strictEqual(w.byReason[0].label, 'Over-production');
  assert.strictEqual(L.wasteSummary(d.waste, d.ingredients, '2026-11-05').rows.length, 2);
});

test('theoretical vs actual food cost from sales and stock counts', () => {
  const ings = [{ id: 'b', name: 'Beef', packSize: 5, packUnit: 'kg', packPrice: 50, yieldPct: 100 }, { id: 'p', name: 'Potato', packSize: 10, packUnit: 'kg', packPrice: 20, yieldPct: 80 }];
  const recs = [{ id: 'd', name: 'Dish', portions: 1, items: [{ type: 'ing', ref: 'b', qty: 200, unit: 'g' }, { type: 'ing', ref: 'p', qty: 200, unit: 'g' }] }];
  const r = L.theoreticalVsActual(ings, recs, [{ recipeId: 'd', qty: 100 }], [{ ingredientId: 'b', opening: 5, purchases: 20, closing: 4 }, { ingredientId: 'p', opening: 0, purchases: 30, closing: 4 }], 2000);
  const beef = r.rows.find((x) => x.id === 'b'), pot = r.rows.find((x) => x.id === 'p');
  near(beef.theoQty, 20); near(beef.actQty, 21); near(beef.variance, 10);
  near(pot.theoQty, 25); near(pot.actQty, 26); near(pot.variance, 2); // 20 kg usable / 0.8 yield = 25 kg bought
  near(r.theoCost, 200 + 50); near(r.actualCost, 210 + 52);
  near(r.actualPct, 262 / 2000);
});
