/* Construction Project Tracker — pure logic (no DOM). Builds on ProductForge core. */
(function (root) {
  'use strict';
  var C = typeof module !== 'undefined' && module.exports ? require('../../forge/forge-core.js') : root.ForgeCore;
  var r2 = C.r2;
  var COST_CODES = ['01 Preliminaries and site', '02 Demolition', '03 Earthworks', '04 Concrete', '05 Framing', '06 Roofing', '07 Plumbing', '08 Electrical',
    '09 Plastering', '10 Joinery', '11 Tiling', '12 Painting', '13 Landscaping', '99 Contingency'];
  var DELAY_CAUSES = ['Weather', 'Materials late', 'Contractor', 'Client decision', 'Inspection / approval', 'Design change', 'Other'];

  var forProject = function (list, pid) { return (list || []).filter(function (x) { return x.project === pid; }); };
  var dur = function (s) { return s.start && s.end ? Math.max(1, C.daysBetween(s.start, s.end) + 1) : 1; };

  // Overall progress: stage % complete weighted by stage length in days (milestones count as 1 day).
  function progress(stages) {
    var w = 0, done = 0;
    (stages || []).forEach(function (s) { var d = dur(s); w += d; done += d * Math.min(100, Math.max(0, +s.pct || 0)) / 100; });
    return w ? done / w : 0;
  }
  // Where progress should be by today if work ran evenly to plan.
  function plannedProgress(stages, today) {
    var w = 0, due = 0;
    (stages || []).forEach(function (s) {
      var d = dur(s); w += d;
      if (!s.start || today < s.start) return;
      due += today >= s.end ? d : C.daysBetween(s.start, today) + 1;
    });
    return w ? due / w : 0;
  }

  // Gantt-style rows positioned as % of the overall date range.
  function gantt(stages, today) {
    var dated = (stages || []).filter(function (s) { return s.start; }).map(function (s) { return Object.assign({}, s, { end: s.end || s.start }); });
    if (!dated.length) return { from: '', to: '', rows: [], todayPct: null };
    var from = dated.reduce(function (m, s) { return s.start < m ? s.start : m; }, dated[0].start);
    var to = dated.reduce(function (m, s) { return s.end > m ? s.end : m; }, dated[0].end);
    var span = C.daysBetween(from, to) + 1;
    var rows = dated.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; }).map(function (s) {
      var left = C.daysBetween(from, s.start) / span * 100, width = (C.daysBetween(s.start, s.end) + 1) / span * 100, pct = Math.min(100, Math.max(0, +s.pct || 0));
      return { id: s.id, name: s.name, start: s.start, end: s.end, milestone: !!s.milestone, left: r2(left), width: r2(width), pct: pct, late: !!today && s.end < today && pct < 100 };
    });
    var tp = today && today >= from && today <= to ? r2(C.daysBetween(from, today) / span * 100) : null;
    return { from: from, to: to, days: span, rows: rows, todayPct: tp };
  }

  // Budget vs actual by cost code. Actual = recorded costs. Committed = orders placed but not yet invoiced (not in costs yet).
  function budgetReport(budgets, costs, orders) {
    var m = {}, order = [];
    var row = function (code) { code = code || 'Uncoded'; if (!m[code]) { m[code] = { code: code, budget: 0, actual: 0, committed: 0 }; order.push(code); } return m[code]; };
    (budgets || []).forEach(function (b) { row(b.code).budget += +b.amount || 0; });
    (costs || []).forEach(function (c) { row(c.code).actual += +c.amount || 0; });
    (orders || []).forEach(function (o) { if (o.status === 'Ordered' || o.status === 'Delivered') row(o.code).committed += +o.cost || 0; });
    var rows = order.sort().map(function (k) {
      var r = m[k]; r.budget = r2(r.budget); r.actual = r2(r.actual); r.committed = r2(r.committed);
      r.forecast = r2(r.actual + r.committed); r.variance = r2(r.budget - r.forecast); r.variancePct = r.budget ? r.variance / r.budget : null;
      r.flag = r.variance < 0 ? 'over' : r.budget && r.forecast / r.budget > 0.9 ? 'close' : 'ok';
      return r;
    });
    var t = rows.reduce(function (a, r) { a.budget += r.budget; a.actual += r.actual; a.committed += r.committed; return a; }, { budget: 0, actual: 0, committed: 0 });
    t.budget = r2(t.budget); t.actual = r2(t.actual); t.committed = r2(t.committed); t.forecast = r2(t.actual + t.committed); t.variance = r2(t.budget - t.forecast);
    return { rows: rows, total: t };
  }

  function contractValue(project, variations) {
    var approved = forProject(variations, project.id).filter(function (v) { return v.status === 'Approved'; }).reduce(function (s, v) { return s + (+v.amount || 0); }, 0);
    var pending = forProject(variations, project.id).filter(function (v) { return v.status === 'Pending'; }).reduce(function (s, v) { return s + (+v.amount || 0); }, 0);
    return { original: r2(+project.contract || 0), approved: r2(approved), pending: r2(pending), current: r2((+project.contract || 0) + approved) };
  }

  function delaySummary(delays) {
    var by = {}, total = 0;
    (delays || []).forEach(function (d) { var k = d.cause || 'Other'; by[k] = r2((by[k] || 0) + (+d.days || 0)); total += +d.days || 0; });
    return { total: r2(total), byCause: Object.keys(by).map(function (k) { return { label: k, value: by[k] }; }).sort(function (a, b) { return b.value - a.value; }) };
  }

  function orderStatus(o, today) {
    if (o.status === 'Cancelled' || o.status === 'Invoiced') return o.status;
    if (o.delivered) return 'Delivered';
    if (o.expected && o.expected < today) return 'Late';
    return 'Ordered';
  }

  // Contractor compliance: any document expired or expiring within `warn` days.
  function compliance(ct, today, warn) {
    warn = warn == null ? 30 : warn;
    var docs = [['Licence', ct.licenceExpiry], ['Public liability insurance', ct.insuranceExpiry], ["Workers' compensation", ct.workersCompExpiry]];
    var issues = docs.filter(function (d) { return d[1]; }).map(function (d) { var days = C.daysBetween(today, d[1]); return { doc: d[0], expiry: d[1], days: days, status: days < 0 ? 'expired' : days <= warn ? 'expiring' : 'ok' }; });
    var missing = docs.filter(function (d) { return !d[1]; }).map(function (d) { return d[0]; });
    var worst = issues.some(function (i) { return i.status === 'expired'; }) ? 'expired' : issues.some(function (i) { return i.status === 'expiring'; }) ? 'expiring' : missing.length ? 'missing' : 'ok';
    return { status: worst, docs: issues, missing: missing };
  }

  // One summary object for the progress report.
  function projectReport(p, d, today) {
    var stages = forProject(d.stages, p.id);
    return {
      progress: progress(stages), planned: plannedProgress(stages, today), gantt: gantt(stages, today),
      budget: budgetReport(forProject(d.budget, p.id), forProject(d.costs, p.id), forProject(d.orders, p.id)),
      contract: contractValue(p, d.variations), delays: delaySummary(forProject(d.delays, p.id)),
      lateOrders: forProject(d.orders, p.id).filter(function (o) { return orderStatus(o, today) === 'Late'; }),
      diary: forProject(d.diary, p.id).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 5)
    };
  }

  function sample(today) {
    var d = function (n) { return C.addDays(today, n); };
    var projects = [
      { id: 'p1', name: 'Kowalski extension', client: 'Anna & Tom Kowalski', address: '22 Wattle Rd, Ringwood VIC 3134', start: d(-70), end: d(50), contract: 285000, status: 'In progress' },
      { id: 'p2', name: 'Harbour Cafe fit-out', client: 'Harbour Cafe Pty Ltd', address: '12 Wharf St, Sydney NSW 2000', start: d(14), end: d(60), contract: 96000, status: 'Planning' }
    ];
    var stages = [
      { id: 's1', project: 'p1', name: 'Site set-up and demolition', start: d(-70), end: d(-60), pct: 100 },
      { id: 's2', project: 'p1', name: 'Slab and footings', start: d(-59), end: d(-42), pct: 100 },
      { id: 's3', project: 'p1', name: 'Frame inspection', start: d(-30), end: d(-30), pct: 100, milestone: true },
      { id: 's4', project: 'p1', name: 'Framing and roof', start: d(-41), end: d(-12), pct: 100 },
      { id: 's5', project: 'p1', name: 'Rough-in plumbing and electrical', start: d(-14), end: d(-2), pct: 70 },
      { id: 's6', project: 'p1', name: 'Plaster and joinery', start: d(1), end: d(25), pct: 0 },
      { id: 's7', project: 'p1', name: 'Tiling, painting and fit-off', start: d(20), end: d(45), pct: 0 },
      { id: 's8', project: 'p1', name: 'Handover', start: d(50), end: d(50), pct: 0, milestone: true },
      { id: 's9', project: 'p2', name: 'Strip-out', start: d(14), end: d(20), pct: 0 },
      { id: 's10', project: 'p2', name: 'Services and joinery', start: d(21), end: d(50), pct: 0 }
    ];
    var contractors = [
      { id: 'c1', name: 'Ringwood Plumbing', trade: 'Plumber', contact: 'Steve Bell', phone: '0412 555 301', licence: 'PL 41225', licenceExpiry: d(220), insuranceExpiry: d(12), workersCompExpiry: d(180) },
      { id: 'c2', name: 'Bright Sparks Electrical', trade: 'Electrician', contact: 'Priya Rao', phone: '0412 555 302', licence: 'REC 19982', licenceExpiry: d(-3), insuranceExpiry: d(300), workersCompExpiry: d(300) },
      { id: 'c3', name: 'East Plaster Co', trade: 'Plasterer', contact: 'Luke Vo', phone: '0412 555 303', licence: '', licenceExpiry: '', insuranceExpiry: d(150), workersCompExpiry: d(150) },
      { id: 'c4', name: 'Coastal Tiling', trade: 'Tiler', contact: 'Maria Costa', phone: '0412 555 304', licence: 'DB-U 5521', licenceExpiry: d(400), insuranceExpiry: d(25), workersCompExpiry: d(400) }
    ];
    var orders = [
      { id: 'o1', project: 'p1', supplier: 'Bowens Timber', item: 'Frame and truss package', code: '05 Framing', qty: 1, cost: 31800, ordered: d(-55), expected: d(-43), delivered: d(-42), status: 'Invoiced' },
      { id: 'o2', project: 'p1', supplier: 'Reece', item: 'Bathroom fixtures', code: '07 Plumbing', qty: 1, cost: 6400, ordered: d(-20), expected: d(-4), delivered: '', status: 'Ordered' },
      { id: 'o3', project: 'p1', supplier: 'CSR Gyprock', item: 'Plasterboard 10mm (sheets)', code: '09 Plastering', qty: 120, cost: 4150, ordered: d(-6), expected: d(2), delivered: '', status: 'Ordered' },
      { id: 'o4', project: 'p1', supplier: 'Beaumont Tiles', item: 'Floor and wall tiles', code: '11 Tiling', qty: 1, cost: 5200, ordered: d(-2), expected: d(16), delivered: '', status: 'Ordered' }
    ];
    var budget = [
      ['01 Preliminaries and site', 14000], ['02 Demolition', 9000], ['04 Concrete', 26000], ['05 Framing', 52000], ['06 Roofing', 21000], ['07 Plumbing', 24000],
      ['08 Electrical', 19000], ['09 Plastering', 16000], ['10 Joinery', 22000], ['11 Tiling', 12000], ['12 Painting', 9000], ['99 Contingency', 15000]
    ].map(function (b, i) { return { id: 'b' + i, project: 'p1', code: b[0], amount: b[1] }; });
    var costs = [
      { id: 'k1', project: 'p1', date: d(-66), code: '01 Preliminaries and site', supplier: 'Kennards Hire', description: 'Fencing, toilet, skip bins', amount: 8900 },
      { id: 'k2', project: 'p1', date: d(-62), code: '02 Demolition', supplier: 'Eastern Demolition', description: 'Demolish rear lean-to', amount: 10400 },
      { id: 'k3', project: 'p1', date: d(-44), code: '04 Concrete', supplier: 'Boral', description: 'Slab pour incl. pump', amount: 24750 },
      { id: 'k4', project: 'p1', date: d(-40), code: '05 Framing', supplier: 'Bowens Timber', description: 'Frame and truss package', amount: 31800 },
      { id: 'k5', project: 'p1', date: d(-15), code: '05 Framing', supplier: 'Frame crew', description: 'Labour — framing', amount: 22600 },
      { id: 'k6', project: 'p1', date: d(-12), code: '06 Roofing', supplier: 'Metal Roofs Vic', description: 'Colorbond roof supply and install', amount: 19300 },
      { id: 'k7', project: 'p1', date: d(-5), code: '07 Plumbing', supplier: 'Ringwood Plumbing', description: 'Rough-in progress claim', amount: 9800 }
    ];
    var delays = [
      { id: 'd1', project: 'p1', date: d(-50), cause: 'Weather', days: 3, notes: 'Rain — could not pour slab' },
      { id: 'd2', project: 'p1', date: d(-31), cause: 'Inspection / approval', days: 2, notes: 'Frame inspection rebooked by surveyor' },
      { id: 'd3', project: 'p1', date: d(-4), cause: 'Materials late', days: 2, notes: 'Bathroom fixtures not delivered' }
    ];
    var variations = [
      { id: 'v1', project: 'p1', number: 'V-001', date: d(-35), description: 'Upgrade to double-glazed windows', amount: 7800, status: 'Approved' },
      { id: 'v2', project: 'p1', number: 'V-002', date: d(-8), description: 'Add skylight to living area', amount: 3450, status: 'Pending' },
      { id: 'v3', project: 'p1', number: 'V-003', date: d(-20), description: 'Delete garden shed', amount: -2200, status: 'Approved' }
    ];
    var diary = [
      { id: 'y1', project: 'p1', date: d(-2), weather: 'Fine', temp: 22, workers: 4, notes: 'Electrician rough-in level 1 complete. Plumber waiting on fixtures.' },
      { id: 'y2', project: 'p1', date: d(-1), weather: 'Showers', temp: 17, workers: 2, notes: 'Wrapped frame openings. Insulation delivered.' },
      { id: 'y3', project: 'p1', date: d(0), weather: 'Windy', temp: 19, workers: 3, notes: 'Pre-plaster walk-through with client. Skylight variation discussed.' }
    ];
    return { projects: projects, stages: stages, contractors: contractors, orders: orders, budget: budget, costs: costs, delays: delays, variations: variations, diary: diary };
  }

  var L = { COST_CODES: COST_CODES, DELAY_CAUSES: DELAY_CAUSES, progress: progress, plannedProgress: plannedProgress, gantt: gantt, budgetReport: budgetReport,
    contractValue: contractValue, delaySummary: delaySummary, orderStatus: orderStatus, compliance: compliance, projectReport: projectReport, forProject: forProject, sample: sample };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.ConstructionLib = L;
})(this);
