/* Logistics Control Tower — pure logic (no DOM): licence classes, allocation checks, auto-allocation, run sheets,
   on-time-in-full (OTIF) and exception rates. No live tracking: statuses are updated by people. */
(function (root) {
  'use strict';
  var C = typeof module !== 'undefined' && module.exports ? require('../../forge/forge-core.js') : root.ForgeCore;
  var r2 = C.r2, DAYS = C.WEEKDAYS;

  // Australian heavy vehicle licence classes, lowest to highest. A higher class covers the lower ones.
  var CLASSES = ['C', 'LR', 'MR', 'HR', 'HC', 'MC'];
  var CLASS_HELP = { C: 'Car — up to 4.5 t GVM', LR: 'Light rigid — 4.5–8 t', MR: 'Medium rigid — 2 axles, over 8 t', HR: 'Heavy rigid — 3+ axles', HC: 'Heavy combination — semi-trailer', MC: 'Multi-combination — B-double, road train' };
  function classOk(driverClass, vehicleClass) { var d = CLASSES.indexOf(driverClass), v = CLASSES.indexOf(vehicleClass || 'C'); return d >= 0 && d >= v; }

  var STATUSES = ['Booked', 'Allocated', 'Picked up', 'In transit', 'Delivered', 'Exception', 'Cancelled'];
  var open = function (c) { return c.status !== 'Cancelled'; };
  var mins = function (t) { var m = String(t || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };

  // Load for a set of consignments: {kg, pallets, cubic, items}
  function load(list) {
    return (list || []).reduce(function (a, c) { a.kg = r2(a.kg + (+c.weight || 0)); a.pallets = r2(a.pallets + (+c.pallets || 0)); a.cubic = r2(a.cubic + (+c.cubic || 0)); a.items += +c.items || 0; return a; }, { kg: 0, pallets: 0, cubic: 0, items: 0 });
  }
  // Time span of a driver's run that day: earliest window start → latest window end (whole day if no windows).
  function runSpan(list) {
    var from = null, to = null;
    (list || []).forEach(function (c) { var f = mins(c.windowFrom), t = mins(c.windowTo); if (f == null) f = 0; if (t == null) t = 1440; from = from == null ? f : Math.min(from, f); to = to == null ? t : Math.max(to, t); });
    return { from: from == null ? 0 : from, to: to == null ? 1440 : to };
  }
  function spansOverlap(a, b) { return a.from < b.to && b.from < a.to; }

  // Is the driver working that day? '' or the reason not.
  function driverAvailability(d, day) {
    if (!d) return 'no driver';
    if (d.active === false) return d.name + ' is not active';
    if (d.days && d.days.length && d.days.indexOf(DAYS[C.weekday(day)]) < 0) return d.name + ' does not work ' + DAYS[C.weekday(day)];
    if (d.leaveFrom && day >= d.leaveFrom && day <= (d.leaveTo || d.leaveFrom)) return d.name + ' is on leave';
    return '';
  }

  // Check allocating consignment `c` (with c.driver/c.vehicle set) against everything else that day.
  // Returns {errors:[], warnings:[]} — errors are legal/physical limits, warnings need a human look.
  function checkAllocation(c, all, drivers, vehicles) {
    var out = { errors: [], warnings: [] }; if (!c || !c.date) return out;
    var d = (drivers || []).filter(function (x) { return x.id === c.driver; })[0], v = (vehicles || []).filter(function (x) { return x.id === c.vehicle; })[0];
    var day = c.date, same = (all || []).filter(function (o) { return o.id !== c.id && o.date === day && open(o); }).concat([c]);
    if (d) {
      if (!d.licenceExpiry || d.licenceExpiry < day) out.errors.push(d.name + '\'s licence ' + (d.licenceExpiry ? 'expired ' + d.licenceExpiry : 'expiry is not recorded'));
      var why = driverAvailability(d, day); if (why) out.warnings.push(why);
      if (v && !classOk(d.licenceClass, v.licenceClass)) out.errors.push(d.name + ' holds class ' + (d.licenceClass || '?') + ' — ' + v.rego + ' needs ' + v.licenceClass);
      var other = same.filter(function (o) { return o.driver === d.id && o.vehicle && o.vehicle !== c.vehicle; });
      if (v && other.length && spansOverlap(runSpan(other), runSpan(same.filter(function (o) { return o.driver === d.id && o.vehicle === c.vehicle; })))) out.warnings.push(d.name + ' is also on another vehicle at overlapping times');
    }
    if (v) {
      if (v.active === false) out.errors.push(v.rego + ' is off the road');
      if (v.regoExpiry && v.regoExpiry < day) out.errors.push(v.rego + ' registration expired ' + v.regoExpiry);
      if (v.serviceDue && v.serviceDue < day) out.warnings.push(v.rego + ' service overdue (' + v.serviceDue + ')');
      var onboard = same.filter(function (o) { return o.vehicle === v.id; }), ld = load(onboard);
      if (+v.maxKg && ld.kg > +v.maxKg) out.errors.push(v.rego + ' over weight: ' + ld.kg + ' kg of ' + v.maxKg + ' kg');
      if (+v.maxPallets && ld.pallets > +v.maxPallets) out.errors.push(v.rego + ' over pallet spaces: ' + ld.pallets + ' of ' + v.maxPallets);
      if (+v.maxCubic && ld.cubic > +v.maxCubic) out.warnings.push(v.rego + ' over cubic capacity: ' + ld.cubic + ' m³ of ' + v.maxCubic + ' m³');
      var others = same.filter(function (o) { return o.vehicle === v.id && o.driver && o.driver !== c.driver; });
      if (c.driver && others.length) {
        var mine = same.filter(function (o) { return o.vehicle === v.id && o.driver === c.driver; });
        var byDriver = {}; others.forEach(function (o) { (byDriver[o.driver] = byDriver[o.driver] || []).push(o); });
        Object.keys(byDriver).forEach(function (k) { if (spansOverlap(runSpan(mine), runSpan(byDriver[k]))) out.errors.push(v.rego + ' is already on another driver\'s run at overlapping times'); });
      }
    }
    return out;
  }

  // Auto-allocate Booked consignments on `day` with no driver/vehicle. Heaviest first. A driver keeps one vehicle
  // for the day. Prefers adding to a run that is already going out (fewer trucks), then the smallest vehicle that fits.
  // Does not change the input. Returns {assignments:[{id, driver, vehicle}], unassigned:[{id, reason}]}
  function autoAllocate(cons, drivers, vehicles, day) {
    var plan = (cons || []).map(function (c) { return Object.assign({}, c); });
    var todo = plan.filter(function (c) { return c.date === day && c.status === 'Booked' && !c.driver && !c.vehicle; })
      .sort(function (a, b) { return (+b.weight || 0) - (+a.weight || 0) || (+b.pallets || 0) - (+a.pallets || 0) || String(a.windowFrom || '').localeCompare(String(b.windowFrom || '')); });
    var assignments = [], unassigned = [];
    todo.forEach(function (c) {
      var reasons = [], best = null;
      var pairOf = function (dId) { var x = plan.filter(function (o) { return o.date === day && open(o) && o.driver === dId && o.vehicle; })[0]; return x ? x.vehicle : null; };
      (drivers || []).forEach(function (d) {
        var fixed = pairOf(d.id);
        (vehicles || []).forEach(function (v) {
          if (fixed && fixed !== v.id) return;
          var vehUsedByOther = plan.some(function (o) { return o.date === day && open(o) && o.vehicle === v.id && o.driver && o.driver !== d.id; });
          if (vehUsedByOther) return;
          var trial = Object.assign({}, c, { driver: d.id, vehicle: v.id, status: 'Allocated' });
          var chk = checkAllocation(trial, plan.filter(function (o) { return o.id !== c.id; }), drivers, vehicles);
          var avail = driverAvailability(d, day);
          if (chk.errors.length || avail) { reasons.push(d.name + ' + ' + v.rego + ': ' + (chk.errors[0] || avail)); return; }
          var score = [fixed ? 0 : 1, +v.maxKg || 1e9, String(d.name)];
          if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && (score[1] < best.score[1] || (score[1] === best.score[1] && score[2] < best.score[2])))) best = { d: d, v: v, score: score };
        });
      });
      if (!best) { unassigned.push({ id: c.id, reason: reasons.length ? reasons.slice(0, 3).join('; ') + (reasons.length > 3 ? ' …' : '') : 'no drivers or vehicles' }); return; }
      c.driver = best.d.id; c.vehicle = best.v.id; c.status = 'Allocated';
      assignments.push({ id: c.id, driver: c.driver, vehicle: c.vehicle });
    });
    return { assignments: assignments, unassigned: unassigned };
  }

  // A driver's run sheet for a day, ordered by time window (no window last).
  function runSheet(cons, driverId, day) {
    return (cons || []).filter(function (c) { return c.driver === driverId && c.date === day && open(c); }).sort(function (a, b) {
      var fa = mins(a.windowFrom), fb = mins(b.windowFrom), ta = mins(a.windowTo), tb = mins(b.windowTo);
      fa = fa == null ? 9999 : fa; fb = fb == null ? 9999 : fb; ta = ta == null ? 9999 : ta; tb = tb == null ? 9999 : tb;
      return fa - fb || ta - tb || String(a.number || '').localeCompare(String(b.number || ''));
    });
  }

  // On time: delivered on the date (or earlier) and by the end of the window. In full: ticked in full and no
  // damage/short exception. Returns null if not delivered.
  function onTime(c) {
    if (c.status !== 'Delivered' || !c.deliveredAt) return null;
    var d = C.dayOf(c.deliveredAt), t = mins(C.timeOf(c.deliveredAt)), end = mins(c.windowTo);
    if (d < c.date) return true; if (d > c.date) return false;
    return end == null || t == null || t <= end;
  }
  var INFULL_BREAKERS = ['Damaged', 'Short / missing items'];
  function inFull(c, exceptions) {
    if (c.status !== 'Delivered') return null;
    if (c.inFull === false) return false;
    return !(exceptions || []).some(function (e) { return e.consignment === c.id && INFULL_BREAKERS.indexOf(e.type) >= 0; });
  }
  // Performance for consignments due between from and to (inclusive).
  function otif(cons, exceptions, from, to) {
    var due = (cons || []).filter(function (c) { return open(c) && c.date >= from && c.date <= to; });
    var delivered = due.filter(function (c) { return c.status === 'Delivered'; });
    var ot = delivered.filter(function (c) { return onTime(c); }).length, inf = delivered.filter(function (c) { return inFull(c, exceptions); }).length;
    var both = delivered.filter(function (c) { return onTime(c) && inFull(c, exceptions); }).length;
    var withEx = due.filter(function (c) { return (exceptions || []).some(function (e) { return e.consignment === c.id; }); }).length;
    var pct = function (n, d) { return d ? r2(n / d) : 0; };
    return { due: due.length, delivered: delivered.length, onTime: ot, inFull: inf, otif: both, otifPct: pct(both, delivered.length), onTimePct: pct(ot, delivered.length), inFullPct: pct(inf, delivered.length), exceptions: withEx, exceptionRate: pct(withEx, due.length) };
  }
  // OTIF per customer: [{customer, …otif}]
  function otifByCustomer(cons, exceptions, from, to) {
    var ids = []; (cons || []).forEach(function (c) { if (c.customer && ids.indexOf(c.customer) < 0) ids.push(c.customer); });
    return ids.map(function (id) { return Object.assign({ customer: id }, otif(cons.filter(function (c) { return c.customer === id; }), exceptions, from, to)); }).filter(function (r) { return r.due; });
  }
  // Late but not yet delivered: past the window end today, or past the date.
  function runningLate(c, today, nowHHMM) {
    if (!open(c) || c.status === 'Delivered' || c.status === 'Exception') return false;
    if (c.date < today) return true;
    if (c.date > today) return false;
    var end = mins(c.windowTo), now = mins(nowHHMM); return end != null && now != null && now > end;
  }

  function sample(today) {
    var d = function (n) { return C.addDays(today, n); };
    var customers = [
      { id: 'c1', name: 'Harbour Hardware Pty Ltd', contact: 'Dee Morgan', phone: '02 5550 3101', email: 'dispatch@harbourhw.example.com', address: '12 Dock Rd, Port Botany NSW' },
      { id: 'c2', name: 'Fresh Fields Grocers', contact: 'Sam Lee', phone: '02 5550 3102', email: 'orders@freshfields.example.com', address: '88 Market St, Flemington NSW' },
      { id: 'c3', name: 'Coastline Furniture', contact: 'Priya Shah', phone: '02 5550 3103', email: 'logistics@coastline.example.com', address: '5 Industrial Ave, Wetherill Park NSW' }
    ];
    // rotating day off that never falls today or tomorrow, so the sample looks sane on any day
    var except = function (n) { var off = DAYS[C.weekday(d(n))]; return DAYS.filter(function (x) { return x !== off; }); };
    var drivers = [
      { id: 'd1', name: 'Gary Watts', phone: '0412 555 601', licenceClass: 'HR', licenceExpiry: C.addMonths(today, 26), days: except(3), active: true },
      { id: 'd2', name: 'Nina Kovac', phone: '0412 555 602', licenceClass: 'MR', licenceExpiry: d(20), days: except(4), active: true },
      { id: 'd3', name: 'Ahmed Rahimi', phone: '0412 555 603', licenceClass: 'LR', licenceExpiry: C.addMonths(today, 14), days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], active: true },
      { id: 'd4', name: 'Kate Lim', phone: '0412 555 604', licenceClass: 'C', licenceExpiry: C.addMonths(today, 30), days: ['Mon', 'Wed', 'Fri', 'Sat', 'Sun'], active: true, leaveFrom: d(2), leaveTo: d(6) }
    ];
    var vehicles = [
      { id: 'v1', rego: 'XQ 41 PL', type: 'Heavy rigid (pantech)', licenceClass: 'HR', maxKg: 9000, maxPallets: 12, maxCubic: 45, regoExpiry: C.addMonths(today, 7), serviceDue: d(10), active: true },
      { id: 'v2', rego: 'BT 22 KM', type: 'Medium rigid (tautliner)', licenceClass: 'MR', maxKg: 6000, maxPallets: 8, maxCubic: 32, regoExpiry: d(18), serviceDue: d(-3), active: true },
      { id: 'v3', rego: 'CV 09 RN', type: 'Light rigid (3 t pod)', licenceClass: 'LR', maxKg: 3000, maxPallets: 4, maxCubic: 18, regoExpiry: C.addMonths(today, 10), serviceDue: d(45), active: true },
      { id: 'v4', rego: 'EZ 77 VN', type: 'Van', licenceClass: 'C', maxKg: 1100, maxPallets: 2, maxCubic: 9, regoExpiry: C.addMonths(today, 4), serviceDue: d(60), active: true }
    ];
    var n = 0;
    var K = function (day, cust, from, to, w, pal, cub, items, status, extra) {
      n++; var c = customers.filter(function (x) { return x.id === cust; })[0];
      return Object.assign({ id: 'k' + n, number: 'CN-' + String(1000 + n).slice(1), customer: cust, date: d(day), windowFrom: from, windowTo: to, weight: w, pallets: pal, cubic: cub, items: items,
        pickupAddress: c.address, status: status, inFull: true }, extra || {});
    };
    var cons = [
      K(-6, 'c1', '07:00', '10:00', 2400, 4, 12, 40, 'Delivered', { driver: 'd1', vehicle: 'v1', deliveryAddress: '44 George St, Parramatta NSW', receiver: 'Store manager', deliveredAt: d(-6) + 'T09:20', podName: 'L. Brooks' }),
      K(-6, 'c2', '05:00', '07:00', 1800, 3, 10, 60, 'Delivered', { driver: 'd2', vehicle: 'v2', deliveryAddress: '210 Crown St, Surry Hills NSW', receiver: 'Back dock', deliveredAt: d(-6) + 'T07:35', podName: 'J. Tan' }),
      K(-5, 'c3', '09:00', '13:00', 650, 1, 6, 3, 'Delivered', { driver: 'd3', vehicle: 'v3', deliveryAddress: '17 Rose St, Chatswood NSW', receiver: 'Residential — call ahead', deliveredAt: d(-5) + 'T11:10', podName: 'M. Grant', inFull: false }),
      K(-4, 'c2', '05:00', '07:00', 2100, 4, 11, 70, 'Delivered', { driver: 'd2', vehicle: 'v2', deliveryAddress: '210 Crown St, Surry Hills NSW', deliveredAt: d(-4) + 'T06:40', podName: 'J. Tan' }),
      K(-3, 'c1', '08:00', '12:00', 900, 2, 5, 15, 'Exception', { driver: 'd3', vehicle: 'v3', deliveryAddress: '3 Smith St, Penrith NSW', receiver: 'Site office' }),
      K(-1, 'c3', '10:00', '14:00', 420, 1, 4, 2, 'Delivered', { driver: 'd4', vehicle: 'v4', deliveryAddress: '9 Palm Ave, Manly NSW', deliveredAt: d(-1) + 'T13:30', podName: 'R. Ellis' }),
      K(0, 'c2', '05:00', '07:00', 1950, 4, 10, 64, 'In transit', { driver: 'd2', vehicle: 'v2', deliveryAddress: '210 Crown St, Surry Hills NSW', pickedAt: d(0) + 'T04:30' }),
      K(0, 'c1', '08:00', '11:00', 3200, 5, 16, 50, 'Allocated', { driver: 'd1', vehicle: 'v1', deliveryAddress: '44 George St, Parramatta NSW' }),
      K(0, 'c1', '11:30', '15:00', 1500, 3, 9, 22, 'Booked', { deliveryAddress: '120 Hume Hwy, Liverpool NSW' }),
      K(0, 'c3', '13:00', '17:00', 380, 1, 3, 2, 'Booked', { deliveryAddress: '22 Beach Rd, Bondi NSW', receiver: 'Residential — 2-person lift' }),
      K(1, 'c2', '05:00', '07:00', 2000, 4, 10, 66, 'Booked', { deliveryAddress: '210 Crown St, Surry Hills NSW' }),
      K(1, 'c3', '09:00', '12:00', 2600, 6, 20, 8, 'Booked', { deliveryAddress: '75 Victoria Rd, Ryde NSW' }),
      K(1, 'c1', '07:00', '16:00', 7800, 10, 30, 90, 'Booked', { deliveryAddress: 'Lot 4 Erskine Park Rd, Erskine Park NSW', notes: 'Forklift on site.' }),
      K(2, 'c1', '08:00', '12:00', 600, 1, 3, 10, 'Booked', { deliveryAddress: '3 Smith St, Penrith NSW', notes: 'Redelivery of ' + 'CN-005' })
    ];
    cons.forEach(function (c) { if (c.status === 'Delivered' && !c.pickedAt) c.pickedAt = c.date + 'T' + (c.windowFrom || '06:00'); });
    var exceptions = [
      { id: 'x1', consignment: 'k2', date: d(-6), type: 'Late', cause: 'Traffic / road closure', details: 'M4 closure, 35 min late.', followUp: 'Told customer; leave 15 min earlier on this run.', status: 'Resolved' },
      { id: 'x2', consignment: 'k3', date: d(-5), type: 'Short / missing items', cause: 'Loading error', details: '1 of 3 cartons left at depot.', followUp: 'Send missing carton with next Chatswood run.', followUpDue: d(1), status: 'Open' },
      { id: 'x3', consignment: 'k5', date: d(-3), type: 'Failed delivery', cause: 'Receiver closed / not home', details: 'Site office closed at 11:40. No answer on phone.', followUp: 'Rebooked as CN-014.', followUpDue: d(2), status: 'Open' }
    ];
    return { consignments: cons, customers: customers, drivers: drivers, vehicles: vehicles, exceptions: exceptions };
  }

  var L = { CLASSES: CLASSES, CLASS_HELP: CLASS_HELP, STATUSES: STATUSES, INFULL_BREAKERS: INFULL_BREAKERS, classOk: classOk, load: load, runSpan: runSpan, driverAvailability: driverAvailability,
    checkAllocation: checkAllocation, autoAllocate: autoAllocate, runSheet: runSheet, onTime: onTime, inFull: inFull, otif: otif, otifByCustomer: otifByCustomer, runningLate: runningLate, mins: mins, sample: sample };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.LogisticsLib = L;
})(this);
