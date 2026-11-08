/* Smart Trip Planner — pure logic (no DOM): auto-scheduler, costs, packing list, calendar. Browser: window.TripLib. */
(function (root) {
  'use strict';
  var node = typeof module !== 'undefined' && module.exports;
  var K = node ? require('../home-inventory/vault-kit.js') : root.VaultKit;

  function toMin(t) { var m = String(t || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; }
  function hhmm(n) { n = Math.max(0, Math.round(n)); return K.pad(Math.floor(n / 60) % 24) + ':' + K.pad(n % 60); }
  function round2(n) { return Math.round(n * 100) / 100; }
  var PRIORITY = { must: 0, want: 1, maybe: 2 };
  var PRIORITY_NAME = { must: 'Must do', want: 'Would like', maybe: 'If time' };

  // Pace: how much to fit in one day
  var PACE = {
    relaxed: { maxActs: 2, maxMins: 300, gap: 30, label: 'Relaxed' },
    normal: { maxActs: 3, maxMins: 420, gap: 15, label: 'Normal' },
    packed: { maxActs: 5, maxMins: 540, gap: 5, label: 'Packed' }
  };
  // Minutes to move between places
  var TRAVEL = { car: { same: 10, other: 35 }, public: { same: 15, other: 50 }, flights: { same: 10, other: 40 } };

  function defaultTrip(today) {
    return { destination: '', start: today, end: K.addDays(today, 3), travellers: [{ name: 'Adult 1', age: 35 }], budget: 0, transport: 'car', pace: 'normal',
      dayStart: '09:00', dayEnd: '18:00', lunch: true, napStart: '13:00', napMins: 0, baseArea: '', tripType: 'city', weather: 'mild', rainDays: [], costs: [], spends: [] };
  }
  function normaliseActivity(o) {
    o = o || {};
    var n = function (v, d) { var x = parseFloat(v); return isNaN(x) ? d : x; };
    return {
      id: o.id || '', name: String(o.name || '').trim(), area: String(o.area || '').trim() || 'Anywhere', duration: Math.max(15, Math.round(n(o.duration, 120))),
      costAdult: Math.max(0, n(o.costAdult, 0)), costChild: Math.max(0, n(o.costChild, 0)), open: toMin(o.open) != null ? o.open : '09:00', close: toMin(o.close) != null ? o.close : '17:00',
      closedDays: Array.isArray(o.closedDays) ? o.closedDays.map(Number) : [], kidFriendly: o.kidFriendly !== false, setting: o.setting === 'indoor' ? 'indoor' : 'outdoor',
      priority: PRIORITY[o.priority] != null ? o.priority : 'want', date: K.isISO(o.date) ? o.date : '', notes: String(o.notes || ''), template: !!o.template
    };
  }

  function days(trip) {
    var out = []; if (!K.isISO(trip.start) || !K.isISO(trip.end) || trip.end < trip.start) return out;
    for (var d = trip.start; d <= trip.end && out.length < 60; d = K.addDays(d, 1)) out.push(d);
    return out;
  }
  function weekday(iso) { return new Date(iso + 'T00:00:00Z').getUTCDay(); }
  // Age bands: under 3 free, 3–15 child price, 16+ adult price
  function party(trip) {
    var t = trip.travellers && trip.travellers.length ? trip.travellers : [{ age: 30 }];
    var p = { adults: 0, children: 0, infants: 0, youngest: 99, count: t.length };
    t.forEach(function (x) { var a = Number(x.age); if (isNaN(a)) a = 30; if (a < 3) p.infants++; else if (a < 16) p.children++; else p.adults++; p.youngest = Math.min(p.youngest, a); });
    return p;
  }
  function costOf(act, trip) { var p = party(trip); return round2(p.adults * act.costAdult + p.children * act.costChild); }

  function travelMins(trip, from, to) {
    var t = TRAVEL[trip.transport] || TRAVEL.car;
    if (!from) return to && trip.baseArea && to.toLowerCase() === trip.baseArea.toLowerCase() ? t.same : 30; // from where you're staying
    return from.toLowerCase() === to.toLowerCase() ? t.same : t.other;
  }
  // Fixed blocks in a day: lunch and young children's nap
  function blocks(trip) {
    var b = [], p = party(trip), ds = toMin(trip.dayStart), de = toMin(trip.dayEnd);
    var nap = Number(trip.napMins) || 0;
    if (nap > 0 && p.youngest < 5) { var ns = toMin(trip.napStart) || 780; if (ns < de && ns + nap > ds) b.push({ start: ns, end: ns + nap, label: 'Nap / quiet time', kind: 'nap' }); }
    if (trip.lunch !== false) {
      var ls = 720, le = 765;
      // lunch moves earlier if it would clash with the nap
      if (b.length && ls < b[0].end && le > b[0].start) { ls = b[0].start - 45; le = b[0].start; }
      if (ls >= ds && le <= de) b.push({ start: ls, end: le, label: 'Lunch', kind: 'lunch' });
    }
    return b.sort(function (x, y) { return x.start - y.start; });
  }
  function absorbs(act, block) { return block.kind === 'lunch' ? act.duration >= 150 : act.duration >= 240; }
  function restAfter(trip, act) { return party(trip).youngest < 10 && act.duration >= 120 ? 20 : 0; }

  // Try a given order of activities in one day. Returns {items, end, mins} or null if it doesn't fit.
  function simulate(trip, date, acts) {
    var ds = toMin(trip.dayStart), de = toMin(trip.dayEnd), pace = PACE[trip.pace] || PACE.normal, bl = blocks(trip);
    var cursor = ds, prev = null, items = [], mins = 0;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i], tr = travelMins(trip, prev, a.area), open = toMin(a.open), close = toMin(a.close);
      var start = Math.max(cursor + tr, open);
      // if the trip there + the activity would overlap lunch or nap, set off after it instead
      // (long outings are the exception: lunch is eaten there if 2.5 h+, the nap happens in the pram or car if 4 h+)
      for (var moved = true, guard = 0; moved && guard < 5; guard++) {
        moved = false;
        for (var k = 0; k < bl.length; k++) {
          if (absorbs(a, bl[k])) continue;
          if (start - tr < bl[k].end && start + a.duration > bl[k].start) { start = Math.max(bl[k].end + tr, open); moved = true; }
        }
      }
      var end = start + a.duration;
      if (end > close || end > de) return null;
      if (tr) items.push({ type: 'travel', start: start - tr, end: start, label: prev && prev.toLowerCase() === a.area.toLowerCase() ? 'Walk / short hop' : 'Travel to ' + a.area });
      items.push({ type: 'activity', start: start, end: end, act: a, cost: costOf(a, trip) });
      mins += a.duration;
      cursor = end + pace.gap;
      var r = restAfter(trip, a);
      if (r && i < acts.length - 1) { items.push({ type: 'rest', start: end, end: end + r, label: 'Rest and snack break' }); cursor = end + r; }
      prev = a.area;
    }
    bl.forEach(function (b) {
      var during = items.filter(function (x) { return x.type === 'activity' && x.start < b.end && x.end > b.start; })[0];
      items.push({ type: 'block', start: b.start, end: b.end, label: b.label + (during ? ' — during ' + during.act.name + (b.kind === 'nap' ? ' (pram, carrier or car)' : '') : ''), kind: b.kind, during: !!during });
    });
    items.sort(function (x, y) { return x.start - y.start || (x.type === 'block' ? -1 : 1); });
    return { items: items, mins: mins };
  }
  // Area clusters in order of their earliest opening time
  function orders(acts) {
    var byArea = {}; acts.forEach(function (a) { var k = a.area.toLowerCase(); (byArea[k] = byArea[k] || []).push(a); });
    var areaOrder = Object.keys(byArea).sort(function (x, y) { return Math.min.apply(null, byArea[x].map(function (a) { return toMin(a.open); })) - Math.min.apply(null, byArea[y].map(function (a) { return toMin(a.open); })); });
    var o1 = []; areaOrder.forEach(function (k) { o1 = o1.concat(byArea[k].slice().sort(function (a, b) { return toMin(a.open) - toMin(b.open) || toMin(a.close) - toMin(b.close); })); });
    var o2 = acts.slice().sort(function (a, b) { return toMin(a.close) - toMin(b.close); });
    var o3 = acts.slice().sort(function (a, b) { return toMin(a.open) - toMin(b.open); });
    return [o1, o2, o3];
  }
  function fitDay(trip, date, acts) {
    var os = orders(acts);
    for (var i = 0; i < os.length; i++) { var r = simulate(trip, date, os[i]); if (r) return r; }
    return null;
  }

  // The auto-scheduler. Returns {days:[{date, items, cost, mins, rain, areas}], unscheduled:[{act, reason}], warnings, cost, budget}
  function schedule(trip, activities) {
    var ds = days(trip), p = party(trip), pace = PACE[trip.pace] || PACE.normal, rain = trip.rainDays || [];
    var out = { days: [], unscheduled: [], warnings: [], cost: 0, budget: activityBudget(trip) };
    if (!ds.length) { out.warnings.push('Set the trip start and end dates.'); return out; }
    if (toMin(trip.dayEnd) <= toMin(trip.dayStart)) { out.warnings.push('The day end time must be after the start time.'); return out; }
    var plan = {}; ds.forEach(function (d) { plan[d] = []; });
    var acts = (activities || []).map(normaliseActivity).filter(function (a) { return a.name; });
    acts.sort(function (a, b) { return PRIORITY[a.priority] - PRIORITY[b.priority] || (a.date ? -1 : 0) - (b.date ? -1 : 0) || b.duration - a.duration || a.name.localeCompare(b.name); });
    var spent = 0;
    acts.forEach(function (a) {
      if (p.youngest < 12 && !a.kidFriendly) return out.unscheduled.push({ act: a, reason: 'Not marked kid-friendly and you have young children.' });
      if (a.duration > toMin(trip.dayEnd) - toMin(trip.dayStart)) return out.unscheduled.push({ act: a, reason: 'Longer than your day (' + trip.dayStart + '–' + trip.dayEnd + ').' });
      var c = costOf(a, trip);
      if (out.budget > 0 && spent + c > out.budget && a.priority !== 'must') return out.unscheduled.push({ act: a, reason: 'Would go over your activities budget (' + K.money(out.budget) + ').' });
      var cands = ds.filter(function (d) { return !a.date || d === a.date; });
      var why = {};
      if (a.date && !cands.length) why['Its fixed date is outside the trip.'] = 1;
      cands = cands.filter(function (d) {
        if (a.closedDays.indexOf(weekday(d)) >= 0) { why['closed'] = 1; return false; }
        if (a.setting === 'outdoor' && rain.indexOf(d) >= 0) { why['rain'] = 1; return false; }
        var mins = plan[d].reduce(function (s, x) { return s + x.duration; }, 0);
        if (plan[d].length >= pace.maxActs || mins + a.duration > pace.maxMins) { why['full'] = 1; return false; }
        return true;
      });
      var NICE = { closed: 'closed on some days', rain: 'outdoors on a rainy day', full: 'other days are full at a ' + pace.label.toLowerCase() + ' pace' };
      var whys = Object.keys(why).map(function (k) { return NICE[k] || k; }).join('; ');
      var reason = cands.length ? 'Doesn’t fit the opening hours and time left' + (whys ? ' (other days: ' + whys + ')' : '') + '.' : whys ? 'No day works: ' + whys + '.' : '';
      // prefer days already in the same area (less travel), then the emptiest day, then earlier
      var area = a.area.toLowerCase();
      cands.sort(function (x, y) {
        var sx = plan[x].some(function (q) { return q.area.toLowerCase() === area; }) ? 0 : 1, sy = plan[y].some(function (q) { return q.area.toLowerCase() === area; }) ? 0 : 1;
        return sx - sy || plan[x].length - plan[y].length || (x < y ? -1 : 1);
      });
      for (var i = 0; i < cands.length; i++) {
        if (fitDay(trip, cands[i], plan[cands[i]].concat([a]))) { plan[cands[i]].push(a); spent += c; return; }
      }
      out.unscheduled.push({ act: a, reason: reason || 'Doesn’t fit the opening hours and time left.' });
    });
    ds.forEach(function (d) {
      var r = plan[d].length ? fitDay(trip, d, plan[d]) : simulate(trip, d, []);
      var cost = r.items.reduce(function (s, x) { return s + (x.cost || 0); }, 0);
      out.days.push({ date: d, items: r.items, mins: r.mins, cost: round2(cost), rain: rain.indexOf(d) >= 0, areas: plan[d].map(function (a) { return a.area; }).filter(function (x, i, all) { return all.indexOf(x) === i; }) });
    });
    out.cost = round2(spent);
    if (out.budget > 0 && spent > out.budget) out.warnings.push('Your must-do activities cost ' + K.money(spent) + ', which is ' + K.money(spent - out.budget) + ' over the ' + K.money(out.budget) + ' left for activities.');
    var musts = out.unscheduled.filter(function (u) { return u.act.priority === 'must'; });
    if (musts.length) out.warnings.push(musts.length + ' must-do activit' + (musts.length > 1 ? 'ies' : 'y') + ' could not be fitted — see “Not scheduled”.');
    var empty = out.days.filter(function (d) { return !d.items.some(function (x) { return x.type === 'activity'; }); }).length;
    if (empty && acts.length) out.warnings.push(empty + ' day(s) have nothing planned — good for rest, travel days or a spare rainy-day option.');
    return out;
  }

  // ---------- budget ----------
  function activityBudget(trip) {
    var b = Number(trip.budget) || 0; if (!b) return 0;
    var fixed = (trip.costs || []).reduce(function (s, c) { return s + (Number(c.planned) || 0); }, 0);
    return round2(Math.max(0, b - fixed));
  }
  // -> {rows:[{label, planned, spent, left}], planned, spent, budget, left, over}
  function budgetSummary(trip, sched) {
    var rows = (trip.costs || []).map(function (c) { return { label: c.label, planned: Number(c.planned) || 0, spent: 0 }; });
    var byLabel = {}; rows.forEach(function (r) { byLabel[r.label.toLowerCase()] = r; });
    var act = { label: 'Activities (from itinerary)', planned: sched ? sched.cost : 0, spent: 0 };
    rows.push(act);
    var other = { label: 'Other', planned: 0, spent: 0 };
    (trip.spends || []).forEach(function (s) {
      var r = byLabel[String(s.category || '').toLowerCase()] || (s.category === 'Activities' ? act : other);
      r.spent += Number(s.amount) || 0;
    });
    if (other.spent) rows.push(other);
    rows.forEach(function (r) { r.planned = round2(r.planned); r.spent = round2(r.spent); r.left = round2(r.planned - r.spent); });
    var planned = round2(rows.reduce(function (s, r) { return s + r.planned; }, 0)), spent = round2(rows.reduce(function (s, r) { return s + r.spent; }, 0));
    var budget = Number(trip.budget) || 0;
    return { rows: rows, planned: planned, spent: spent, budget: budget, left: round2(budget - spent), over: budget > 0 && planned > budget };
  }

  // ---------- packing list ----------
  function packingList(trip) {
    var p = party(trip), nights = Math.max(1, days(trip).length - 1), ages = (trip.travellers || []).map(function (t) { return Number(t.age); });
    var g = [];
    var add = function (name, items) { items = items.filter(Boolean); if (items.length) g.push({ group: name, items: items }); };
    var w = trip.weather || 'mild';
    add('Essentials', ['Phone and charger', 'Wallet, cards and some cash', 'Photo ID for every adult', 'Medicines and scripts (in original packaging)', 'Health insurance / Medicare cards', 'Booking confirmations (offline copy)', 'Reusable water bottles', 'Small first-aid kit']);
    var laundry = nights > 6 ? ' (plan a laundry day)' : '';
    add('Clothes (each person)', ['Underwear × ' + Math.min(nights + 1, 8) + laundry, 'Socks × ' + Math.min(nights + 1, 8), 'Sleepwear',
      w === 'hot' || w === 'warm' ? 'Light shirts and shorts × ' + Math.min(nights, 6) : 'Tops × ' + Math.min(nights, 6),
      w === 'cold' ? 'Warm jacket, beanie and gloves' : w === 'mild' || w === 'mixed' ? 'Jumper or light jacket' : '',
      w === 'cold' ? 'Thermal layers' : '', 'Comfortable walking shoes', w === 'hot' || w === 'warm' ? 'Wide-brim hat' : '', 'Rain jacket']);
    add('Sun and weather', [w !== 'cold' ? 'Sunscreen SPF 50+' : 'Lip balm and moisturiser', w !== 'cold' ? 'Sunglasses' : '', (trip.rainDays || []).length || w === 'mixed' ? 'Compact umbrella' : '', w === 'hot' ? 'Insect repellent' : '']);
    if (ages.some(function (a) { return a < 2; })) add('Baby (under 2)', ['Nappies (about 8 a day) and wipes', 'Nappy bags and change mat', 'Formula / bottles / steriliser as needed', 'Baby carrier or pram', 'Portable cot or check one is provided', 'Baby sunscreen and hat', 'Favourite comforter']);
    if (ages.some(function (a) { return a >= 2 && a < 5; })) add('Toddler (2–4)', ['Stroller for long days', 'Snacks and spill-proof cup', 'Spare clothes in the day bag', 'Toilet-training supplies if needed', 'Small toys and books', 'Night light']);
    if (ages.some(function (a) { return a >= 5 && a < 13; })) add('Kids (5–12)', ['Activity books, cards or a tablet with downloads', 'Headphones', 'Kid-size water bottle', 'Spare clothes for messy days']);
    var tt = trip.tripType;
    if (tt === 'beach') add('Beach', ['Swimmers × 2 each', 'Rash vests', 'Beach towels', 'Beach shade or umbrella', 'Thongs / sandals', 'Bucket and spade', 'Waterproof phone pouch']);
    if (tt === 'city') add('City', ['Day backpack', 'Transport card or app for the local public transport', 'Portable phone battery', 'One smarter outfit for dinners']);
    if (tt === 'themepark') add('Theme parks', ['Portable phone battery', 'Ponchos for water rides', 'Ziplock bags for phones', 'Pre-bought tickets and the park app', 'Check kids’ heights against ride limits']);
    if (tt === 'nationalpark') add('National park', ['Hiking shoes', 'Insect repellent', 'Torch or head torch', 'Paper map — phone signal can drop out', 'Plenty of water and snacks', 'Park pass if needed', 'Leave your walk plan with someone']);
    if (trip.transport === 'car') add('Car', ['Licence and rego up to date', 'Car seats / boosters fitted for children under 7 (required by law in Australia)', 'Car snacks and rubbish bag', 'Phone mount and car charger', 'Offline maps downloaded', p.youngest < 5 ? 'Window sun shades' : '']);
    if (trip.transport === 'flights') add('Flights', ['Passports / ID', 'Liquids under 100 ml in a clear bag (carry-on)', 'Chargers and batteries in carry-on (not checked bags)', 'Change of clothes in carry-on', p.youngest < 5 ? 'Snacks and something to suck on for take-off' : 'Headphones']);
    if (trip.transport === 'public') add('Public transport', ['Transport card or app set up', 'Light luggage you can carry up stairs', p.youngest < 4 ? 'Lightweight fold-up stroller' : '']);
    return g;
  }

  // ---------- templates (generic ideas, not live data) ----------
  var T = function (name, area, duration, adult, child, open, close, setting, priority, notes) { return { name: name, area: area, duration: duration, costAdult: adult, costChild: child, open: open, close: close, setting: setting, kidFriendly: true, priority: priority, notes: notes || '', template: true }; };
  var TEMPLATES = {
    beach: { name: 'Beach holiday', items: [T('Morning swim at a patrolled beach', 'Beach', 120, 0, 0, '07:00', '17:00', 'outdoor', 'must', 'Swim between the red and yellow flags.'),
      T('Rock pool walk at low tide', 'Headland', 90, 0, 0, '07:00', '18:00', 'outdoor', 'want', 'Check tide times.'), T('Group surf lesson', 'Beach', 120, 80, 65, '08:00', '16:00', 'outdoor', 'want'),
      T('Lighthouse or headland walk', 'Headland', 120, 0, 0, '07:00', '17:30', 'outdoor', 'maybe'), T('Aquarium or marine centre', 'Town centre', 120, 40, 25, '09:00', '17:00', 'indoor', 'want'),
      T('Fish and chips by the water', 'Town centre', 60, 22, 14, '11:00', '20:00', 'outdoor', 'maybe')] },
    city: { name: 'City break', items: [T('Main museum', 'City centre', 150, 0, 0, '10:00', '17:00', 'indoor', 'must', 'Many big museums are free; special exhibitions cost extra.'),
      T('Botanic gardens', 'City centre', 90, 0, 0, '07:00', '18:00', 'outdoor', 'want'), T('Harbour or river ferry ride', 'Waterfront', 90, 15, 8, '08:00', '18:00', 'outdoor', 'want'),
      T('Lookout or observation deck', 'City centre', 60, 35, 25, '09:00', '21:00', 'indoor', 'maybe'), T('Zoo', 'Zoo precinct', 240, 50, 30, '09:30', '17:00', 'outdoor', 'want'),
      T('Food market lunch', 'Markets', 75, 25, 15, '08:00', '15:00', 'indoor', 'maybe')] },
    themepark: { name: 'Theme parks', items: [T('Theme park day 1', 'Theme park strip', 420, 110, 95, '09:30', '17:00', 'outdoor', 'must', 'Buy tickets online ahead; check ride height limits.'),
      T('Water park', 'Theme park strip', 300, 85, 70, '10:00', '17:00', 'outdoor', 'want'), T('Wildlife sanctuary', 'Hinterland', 180, 50, 35, '08:30', '16:00', 'outdoor', 'want'),
      T('Pool afternoon at the accommodation', 'Accommodation', 120, 0, 0, '08:00', '19:00', 'outdoor', 'maybe')] },
    nationalpark: { name: 'National park', items: [T('Signature day walk', 'Park — main trailhead', 240, 0, 0, '07:00', '17:00', 'outdoor', 'must', 'Check track closures and fire danger before you go.'),
      T('Short waterfall walk', 'Park — falls', 90, 0, 0, '07:00', '17:30', 'outdoor', 'want'), T('Visitor centre', 'Park — visitor centre', 60, 0, 0, '09:00', '16:30', 'indoor', 'want'),
      T('Sunset lookout', 'Park — lookout', 60, 0, 0, '16:00', '20:00', 'outdoor', 'maybe'), T('Picnic and creek swim', 'Park — falls', 120, 0, 0, '09:00', '17:00', 'outdoor', 'maybe')] },
    rainy: { name: 'Rainy-day indoor ideas', items: [T('Indoor play centre', 'Suburbs', 120, 0, 18, '09:00', '17:00', 'indoor', 'maybe'), T('Cinema session', 'Town centre', 150, 18, 14, '10:00', '21:00', 'indoor', 'maybe'),
      T('Museum or science centre', 'City centre', 150, 25, 15, '10:00', '17:00', 'indoor', 'maybe'), T('Library story time / board game café', 'Town centre', 90, 10, 5, '10:00', '17:00', 'indoor', 'maybe'),
      T('Indoor pool / aquatic centre', 'Suburbs', 120, 9, 6, '06:00', '20:00', 'indoor', 'maybe')] }
  };

  // ---------- exports: calendar and printable itinerary ----------
  function icsEvents(trip, sched) {
    var out = [];
    sched.days.forEach(function (d) {
      d.items.filter(function (x) { return x.type === 'activity'; }).forEach(function (x) {
        out.push({ uid: 'trip-' + (x.act.id || x.act.name.replace(/\W+/g, '')) + '-' + d.date, start: d.date + 'T' + hhmm(x.start), end: d.date + 'T' + hhmm(x.end), alarmMinutes: 60,
          title: x.act.name, location: x.act.area + (trip.destination ? ', ' + trip.destination : ''), description: (x.cost ? 'Estimated cost ' + K.money(x.cost) + '. ' : '') + (x.act.notes || '') + ' Check opening hours before you go.' });
      });
    });
    return out;
  }
  function itineraryHTML(trip, sched) {
    var e = K.esc;
    var body = sched.days.map(function (d, i) {
      return '<section><h2>Day ' + (i + 1) + ' — ' + e(K.niceDate(d.date)) + (d.rain ? ' (rain expected)' : '') + '</h2><table>' + d.items.map(function (x) {
        var what = x.type === 'activity' ? '<b>' + e(x.act.name) + '</b> <span>' + e(x.act.area) + (x.cost ? ' · ' + K.money(x.cost) : '') + '</span>' + (x.act.notes ? '<br><i>' + e(x.act.notes) + '</i>' : '') : '<span>' + e(x.label) + '</span>';
        return '<tr><td>' + hhmm(x.start) + '–' + hhmm(x.end) + '</td><td>' + what + '</td></tr>';
      }).join('') + '</table>' + (d.cost ? '<p>Day total about ' + K.money(d.cost) + '</p>' : '') + '</section>';
    }).join('');
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + e(trip.destination || 'Trip') + ' itinerary</title><style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;max-width:780px;color:#000}h1{font-size:22px;margin:0}' +
      'h2{font-size:16px;border-bottom:2px solid #000;margin:18px 0 6px}table{border-collapse:collapse;width:100%}td{padding:3px 10px 3px 0;vertical-align:top;border-bottom:1px solid #ddd}td:first-child{white-space:nowrap;width:110px}span{color:#444}section{break-inside:avoid}</style></head><body>' +
      '<h1>' + e(trip.destination || 'Our trip') + '</h1><p>' + e(K.niceDate(trip.start)) + ' to ' + e(K.niceDate(trip.end)) + ' · ' + (trip.travellers || []).length + ' travellers · activities about ' + K.money(sched.cost) +
      '</p><p><i>Times and prices are planning estimates you entered — check opening hours and bookings before you go.</i></p>' + body + '</body></html>';
  }

  function sample(today) {
    var start = K.addDays(today, 21);
    var trip = Object.assign(defaultTrip(today), { destination: 'Gold Coast (sample)', start: start, end: K.addDays(start, 4), budget: 3500, transport: 'car', pace: 'normal', tripType: 'themepark', weather: 'warm',
      travellers: [{ name: 'Mum', age: 38 }, { name: 'Dad', age: 40 }, { name: 'Maya', age: 7 }, { name: 'Leo', age: 3 }], napMins: 90, napStart: '13:00', baseArea: 'Broadbeach',
      rainDays: [K.addDays(start, 2)], costs: [{ id: 'c1', label: 'Accommodation', planned: 1400 }, { id: 'c2', label: 'Food', planned: 700 }, { id: 'c3', label: 'Fuel & parking', planned: 180 }],
      spends: [{ id: 's1', date: today, label: 'Apartment deposit', category: 'Accommodation', amount: 400 }] });
    var acts = [
      ['Theme park A', 'Oxenford', 360, 109, 99, '09:30', '17:00', 'outdoor', 'must'], ['Theme park B', 'Coomera', 330, 115, 99, '10:00', '17:00', 'outdoor', 'want'],
      ['Beach morning (patrolled)', 'Broadbeach', 120, 0, 0, '07:00', '17:00', 'outdoor', 'must'], ['Wildlife sanctuary', 'Currumbin', 180, 59, 44, '08:00', '16:00', 'outdoor', 'want'],
      ['Indoor play centre', 'Broadbeach', 120, 0, 18, '09:00', '17:00', 'indoor', 'maybe'], ['Skypoint observation deck', 'Surfers Paradise', 60, 33, 23, '09:00', '20:00', 'indoor', 'want'],
      ['Markets dinner', 'Surfers Paradise', 90, 25, 15, '16:00', '21:00', 'outdoor', 'maybe'], ['Late-night bar crawl', 'Surfers Paradise', 180, 60, 0, '20:00', '23:59', 'indoor', 'maybe']
    ].map(function (r, i) { return normaliseActivity({ id: 'a' + i, name: r[0], area: r[1], duration: r[2], costAdult: r[3], costChild: r[4], open: r[5], close: r[6], setting: r[7], priority: r[8], kidFriendly: i !== 7 }); });
    return { trip: trip, activities: acts };
  }

  var L = { toMin: toMin, hhmm: hhmm, PACE: PACE, TRAVEL: TRAVEL, PRIORITY_NAME: PRIORITY_NAME, defaultTrip: defaultTrip, normaliseActivity: normaliseActivity, days: days, party: party,
    costOf: costOf, travelMins: travelMins, blocks: blocks, simulate: simulate, schedule: schedule, activityBudget: activityBudget, budgetSummary: budgetSummary, packingList: packingList,
    TEMPLATES: TEMPLATES, icsEvents: icsEvents, itineraryHTML: itineraryHTML, sample: sample };
  if (node) module.exports = L; else root.TripLib = L;
})(this);
