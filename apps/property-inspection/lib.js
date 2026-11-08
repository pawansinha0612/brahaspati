/* Property Inspection Assistant — pure logic (no DOM). Builds on ProductForge core. */
(function (root) {
  'use strict';
  var C = typeof module !== 'undefined' && module.exports ? require('../../forge/forge-core.js') : root.ForgeCore;

  var RATINGS = ['Y', 'N', 'N/A'];
  var PROBLEM = { clean: 'not clean', undamaged: 'damaged', working: 'not working' };
  var COLS = [{ key: 'clean', label: 'Clean' }, { key: 'undamaged', label: 'Undamaged' }, { key: 'working', label: 'Working' }];
  // Typical items per room type (Australian condition report style).
  var ROOM_ITEMS = {
    entry: ['Front door and lock', 'Walls', 'Ceiling', 'Floor / carpet', 'Light fittings', 'Smoke alarm'],
    living: ['Walls', 'Ceiling', 'Floor / carpet', 'Windows and screens', 'Blinds / curtains', 'Light fittings', 'Power points', 'Air conditioner / heater'],
    kitchen: ['Walls', 'Ceiling', 'Floor', 'Benchtops', 'Cupboards and drawers', 'Sink and taps', 'Oven', 'Cooktop', 'Rangehood', 'Dishwasher', 'Power points', 'Light fittings'],
    bedroom: ['Walls', 'Ceiling', 'Floor / carpet', 'Windows and screens', 'Blinds / curtains', 'Wardrobe', 'Light fittings', 'Power points', 'Smoke alarm'],
    bathroom: ['Walls and tiles', 'Ceiling', 'Floor', 'Shower / bath', 'Vanity and taps', 'Toilet', 'Mirror / cabinet', 'Exhaust fan', 'Towel rails'],
    laundry: ['Walls', 'Floor', 'Tub and taps', 'Washing machine taps', 'Cupboards', 'Light fittings'],
    outdoor: ['Lawns and gardens', 'Fences and gates', 'Clothesline', 'Driveway / paths', 'Garage door', 'Letterbox', 'Bins']
  };
  function roomType(name) {
    var n = String(name).toLowerCase();
    if (/kitchen/.test(n)) return 'kitchen';
    if (/bath|ensuite|toilet|wc/.test(n)) return 'bathroom';
    if (/bed/.test(n)) return 'bedroom';
    if (/laundry/.test(n)) return 'laundry';
    if (/entry|hall/.test(n)) return 'entry';
    if (/outdoor|yard|garden|garage|exterior|balcony/.test(n)) return 'outdoor';
    return 'living';
  }
  var DEFAULT_ROOMS = 'Entry / hallway\nLounge\nKitchen\nBedroom 1\nBedroom 2\nBathroom\nLaundry\nOutdoor areas';
  // rooms: text with one room per line -> checklist items grouped by room
  function buildChecklist(roomsText, mk) {
    mk = mk || C.checkItem;
    var items = [];
    String(roomsText || DEFAULT_ROOMS).split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (room) {
      ROOM_ITEMS[roomType(room)].forEach(function (t) { items.push(mk({ text: t, group: room, clean: '', undamaged: '', working: '' })); });
    });
    return items;
  }
  function ratingText(it) { return COLS.map(function (c) { return it[c.key] || '–'; }).join('/'); }
  function hasIssue(it) { return COLS.some(function (c) { return it[c.key] === 'N'; }); }
  function isRated(it) { return COLS.some(function (c) { return it[c.key]; }); }

  function summary(items) {
    items = items || [];
    var byRoom = {}, rooms = [];
    items.forEach(function (it) { var g = it.group || 'General'; if (!byRoom[g]) { byRoom[g] = { room: g, items: 0, rated: 0, issues: 0 }; rooms.push(g); } byRoom[g].items++; if (isRated(it)) byRoom[g].rated++; if (hasIssue(it)) byRoom[g].issues++; });
    var rated = items.filter(isRated).length, issues = items.filter(hasIssue).length;
    return { total: items.length, rated: rated, issues: issues, okPct: rated ? (rated - issues) / rated : 0, rooms: rooms.map(function (r) { return byRoom[r]; }) };
  }

  // Compare an entry and an exit inspection item by item (matched on room + item, case-insensitive).
  function compare(entryItems, exitItems) {
    var key = function (it) { return (String(it.group || '').trim() + '|' + String(it.text || '').trim()).toLowerCase(); };
    var ex = {}; (exitItems || []).forEach(function (it) { ex[key(it)] = it; });
    var seen = {}, rows = [];
    (entryItems || []).forEach(function (a) {
      var b = ex[key(a)]; seen[key(a)] = 1;
      var changes = b ? COLS.filter(function (c) { return b[c.key] === 'N' && a[c.key] !== 'N'; }).map(function (c) { return PROBLEM[c.key]; }) : [];
      var fixed = b ? COLS.filter(function (c) { return a[c.key] === 'N' && b[c.key] === 'Y'; }).map(function (c) { return c.label.toLowerCase(); }) : [];
      rows.push({ room: a.group || '', item: a.text, entry: ratingText(a), exit: b ? ratingText(b) : 'not inspected', worse: changes.length > 0, changes: changes, improved: fixed, entryNotes: a.notes || '', exitNotes: b ? b.notes || '' : '', exitPhotos: b ? b.photos || [] : [], entryPhotos: a.photos || [] });
    });
    (exitItems || []).forEach(function (b) { if (!seen[key(b)]) rows.push({ room: b.group || '', item: b.text, entry: 'not inspected', exit: ratingText(b), worse: hasIssue(b), changes: hasIssue(b) ? ['new item with issues'] : [], improved: [], entryNotes: '', exitNotes: b.notes || '', exitPhotos: b.photos || [], entryPhotos: [] }); });
    return { rows: rows, worse: rows.filter(function (r) { return r.worse; }) };
  }

  // Guess trade and priority for a problem item.
  var TRADES = [
    [/smoke alarm|power point|light|switch|oven|cooktop|rangehood|exhaust fan|air ?con|heater|dishwasher/i, 'Electrician'],
    [/tap|toilet|shower|bath|sink|vanity|tub|hot water|leak|drain/i, 'Plumber'],
    [/carpet/i, 'Carpet cleaner'],
    [/wall|ceiling/i, 'Painter'],
    [/lawn|garden|hedge/i, 'Gardener'],
    [/garage door/i, 'Garage door technician'],
    [/lock|door|window|screen|cupboard|wardrobe|drawer|fence|gate|bench/i, 'Handyman']
  ];
  function guessTrade(text, it) {
    if (it && it.clean === 'N' && it.undamaged !== 'N' && it.working !== 'N') return 'Cleaner';
    for (var i = 0; i < TRADES.length; i++) if (TRADES[i][0].test(text)) return TRADES[i][1];
    return 'Handyman';
  }
  function guessPriority(text, it) {
    if (/smoke alarm|gas|leak|electric|lock|hot water/i.test(text) && (it.working === 'N' || it.undamaged === 'N')) return 'Urgent';
    if (it.working === 'N') return 'High';
    if (it.undamaged === 'N') return 'Medium';
    return 'Low';
  }
  var PRIORITY_DAYS = { Urgent: 1, High: 7, Medium: 14, Low: 30 };
  function dueFor(priority, from) { return C.addDays(from, PRIORITY_DAYS[priority] || 14); }

  // Maintenance requests for every item with a problem, skipping ones already raised for this inspection.
  function maintenanceFrom(insp, existing, today, idFn) {
    var have = {}; (existing || []).forEach(function (m) { if (m.inspection === insp.id) have[m.title] = 1; });
    var out = [];
    (insp.checklist || []).forEach(function (it) {
      if (!hasIssue(it)) return;
      var what = COLS.filter(function (c) { return it[c.key] === 'N'; }).map(function (c) { return PROBLEM[c.key]; }).join(', ');
      var title = (it.group ? it.group + ': ' : '') + it.text + ' — ' + what;
      if (have[title]) return;
      var pr = guessPriority(it.text, it);
      out.push({ id: (idFn || C.uid)(), title: title, property: insp.property, inspection: insp.id, room: it.group || '', priority: pr, trade: guessTrade(it.text, it), status: 'Open', due: dueFor(pr, today), notes: it.notes || '', photos: (it.photos || []).slice() });
    });
    return out;
  }

  // Next routine inspection: every `months` (default 6) after the last inspection, but not after the lease end.
  function nextRoutine(lastDate, months, leaseEnd) {
    if (!lastDate) return '';
    var n = C.addMonths(lastDate, months || 6);
    return leaseEnd && n > leaseEnd ? '' : n;
  }

  function sample(today, idFn) {
    var d = function (n) { return C.addDays(today, n); }, n = 0;
    idFn = idFn || function () { return 'x' + (++n); };
    var mk = function (o) { return C.checkItem(Object.assign({ id: idFn() }, o)); };
    var properties = [
      { id: 'p1', address: '3/14 Banksia St, Marrickville NSW 2204', type: 'Unit', landlord: 'R. & K. Patel', landlordEmail: 'patel.owners@example.com', tenant: 'Sam Taylor', tenantEmail: 'sam.t@example.com', tenantPhone: '0412 555 201', leaseStart: d(-370), leaseEnd: d(-5), rooms: 'Entry / hallway\nLounge\nKitchen\nBedroom 1\nBathroom\nLaundry', nextInspection: '' },
      { id: 'p2', address: '27 Grevillea Ave, Ryde NSW 2112', type: 'House', landlord: 'Helen Brooks', landlordEmail: 'h.brooks@example.com', tenant: 'The Nguyen family', tenantEmail: 'nguyen.fam@example.com', tenantPhone: '0412 555 202', leaseStart: d(-200), leaseEnd: d(165), rooms: DEFAULT_ROOMS, nextInspection: d(10) },
      { id: 'p3', address: '8 Ocean Pde, Coogee NSW 2034', type: 'Townhouse', landlord: 'Coastal Holdings Pty Ltd', landlordEmail: 'admin@coastal.example', tenant: '', leaseStart: '', leaseEnd: '', rooms: 'Entry / hallway\nLounge\nKitchen\nBedroom 1\nBedroom 2\nBathroom\nEnsuite\nLaundry\nGarage', nextInspection: d(3) }
    ];
    var rate = function (items, fn) { items.forEach(function (it, i) { Object.assign(it, { clean: 'Y', undamaged: 'Y', working: /wall|ceiling|floor|carpet|blind|curtain|mirror|bench|fence|lawn|letterbox|bins|driveway/i.test(it.text) ? 'N/A' : 'Y', done: true }); if (fn) fn(it, i); }); return items; };
    var entry = rate(buildChecklist(properties[0].rooms, mk), function (it) { if (it.group === 'Bathroom' && it.text === 'Exhaust fan') { it.clean = 'N'; it.notes = 'Dusty grille'; } });
    var exit = rate(buildChecklist(properties[0].rooms, mk), function (it) {
      if (it.group === 'Lounge' && it.text === 'Walls') { it.undamaged = 'N'; it.notes = 'Three picture-hook holes and a scuff behind sofa'; }
      if (it.group === 'Kitchen' && it.text === 'Oven') { it.clean = 'N'; it.notes = 'Grease build-up inside'; }
      if (it.group === 'Bedroom 1' && it.text === 'Floor / carpet') { it.clean = 'N'; it.notes = 'Stain near window, about 20 cm'; }
      if (it.group === 'Bathroom' && it.text === 'Exhaust fan') { it.clean = 'Y'; it.notes = 'Cleaned'; }
    });
    var routine = rate(buildChecklist(properties[1].rooms, mk), function (it) {
      if (it.group === 'Bathroom' && it.text === 'Vanity and taps') { it.working = 'N'; it.notes = 'Hot tap drips constantly'; }
      if (it.group === 'Bedroom 2' && it.text === 'Smoke alarm') { it.working = 'N'; it.notes = 'No response to test button'; }
    });
    var inspections = [
      { id: 'i1', property: 'p1', type: 'Entry', date: d(-372), inspector: 'Alex Morgan', status: 'Signed', checklist: entry, notes: 'Property presented well. Keys: 2 front door, 1 mailbox.', tenantName: 'Sam Taylor' },
      { id: 'i2', property: 'p1', type: 'Exit', date: d(-4), inspector: 'Alex Morgan', status: 'Completed', checklist: exit, notes: 'All keys returned.', tenantName: 'Sam Taylor' },
      { id: 'i3', property: 'p2', type: 'Routine', date: d(-21), inspector: 'Priya Shah', status: 'Completed', checklist: routine, notes: 'Tenants keeping the home tidy. Two repairs needed.', tenantName: 'Linh Nguyen' },
      { id: 'i4', property: 'p3', type: 'Entry', date: d(3), inspector: 'Alex Morgan', status: 'Scheduled', checklist: buildChecklist(properties[2].rooms, mk), notes: '' }
    ];
    var maintenance = maintenanceFrom(inspections[2], [], d(-21), idFn).concat(maintenanceFrom(inspections[1], [], d(-4), idFn));
    maintenance[0].status = 'Booked';
    var tasks = [
      { id: 't1', title: 'Send exit report and bond claim to tenant', property: 'p1', due: d(1), done: false },
      { id: 't2', title: 'Lodge bond claim with Fair Trading', property: 'p1', due: d(-1), done: false },
      { id: 't3', title: 'Email routine report to landlord', property: 'p2', due: d(-18), done: true },
      { id: 't4', title: 'Check smoke alarm was replaced', property: 'p2', due: d(5), done: false }
    ];
    return { properties: properties, inspections: inspections, maintenance: maintenance, tasks: tasks };
  }

  var L = { RATINGS: RATINGS, COLS: COLS, ROOM_ITEMS: ROOM_ITEMS, DEFAULT_ROOMS: DEFAULT_ROOMS, roomType: roomType, buildChecklist: buildChecklist, ratingText: ratingText, hasIssue: hasIssue,
    summary: summary, compare: compare, guessTrade: guessTrade, guessPriority: guessPriority, dueFor: dueFor, maintenanceFrom: maintenanceFrom, nextRoutine: nextRoutine, sample: sample };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.InspectionLib = L;
})(this);
