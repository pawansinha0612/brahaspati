/* Tradie Business Manager — pure logic (no DOM). Reuses ProductForge core for GST and dates. */
(function (root) {
  'use strict';
  var C = typeof module !== 'undefined' && module.exports ? require('../../forge/forge-core.js') : root.ForgeCore;
  var r2 = C.r2;

  // Quote / invoice pricing. q: {labourHours, labourRate, materials:[{desc, qty, price}] (at cost), markupPct, calloutFee, gst}
  // Materials are charged at cost + markup (rounded per unit, so the printed lines always add up to the total).
  function priceLines(q) {
    var m = +q.markupPct || 0, lines = [];
    if (+q.labourHours) lines.push({ desc: 'Labour', qty: +q.labourHours, price: r2(+q.labourRate || 0) });
    (q.materials || []).forEach(function (l) { if (!l || (!l.desc && !+l.price)) return; lines.push({ desc: l.desc || 'Materials', qty: +l.qty || 0, price: r2((+l.price || 0) * (1 + m / 100)) }); });
    if (+q.calloutFee) lines.push({ desc: 'Call-out fee', qty: 1, price: r2(+q.calloutFee) });
    return lines;
  }
  function quoteTotals(q) {
    var lines = priceLines(q), t = C.totals(lines, { gst: q.gst !== false });
    var labour = r2((+q.labourHours || 0) * (+q.labourRate || 0));
    var matCost = C.linesTotal(q.materials || []), callout = r2(+q.calloutFee || 0);
    var matCharged = r2(t.subtotal - labour - callout);
    return { labour: labour, materialsCost: matCost, materials: matCharged, markup: r2(matCharged - matCost), callout: callout, net: t.net, gst: t.gst, total: t.total };
  }

  function paymentStatus(inv, today) {
    var total = quoteTotals(inv).total, paid = r2(+inv.amountPaid || 0);
    if (total > 0 && paid >= total) return 'Paid';
    if (inv.due && today && inv.due < today) return 'Overdue';
    return paid > 0 ? 'Part paid' : 'Unpaid';
  }
  function balance(inv) { return r2(quoteTotals(inv).total - (+inv.amountPaid || 0)); }

  // Copy a quote into a new invoice record.
  function invoiceFromQuote(q, invoices, today, termsDays, id) {
    return {
      id: id || C.uid(), number: C.nextNumber((invoices || []).map(function (i) { return i.number; }), 'INV-'), job: q.job || '', quote: q.id,
      issued: today, due: C.addDays(today, termsDays == null ? 14 : termsDays), labourHours: q.labourHours, labourRate: q.labourRate,
      materials: JSON.parse(JSON.stringify(q.materials || [])), markupPct: q.markupPct, calloutFee: q.calloutFee, gst: q.gst !== false, amountPaid: 0, status: 'Unpaid', notes: q.notes || ''
    };
  }

  // Labour hours logged against a job, and what it cost you at an hourly wage cost.
  function jobHours(timeEntries, jobId) { return r2((timeEntries || []).filter(function (t) { return t.job === jobId; }).reduce(function (s, t) { return s + (+t.hours || 0); }, 0)); }
  // Gross profit of an invoiced job: invoice ex-GST minus materials at cost minus wages.
  function jobProfit(inv, timeEntries, wagePerHour) {
    var t = quoteTotals(inv), wages = r2(jobHours(timeEntries, inv.job) * (+wagePerHour || 0));
    return { revenue: t.net, materials: t.materialsCost, wages: wages, profit: r2(t.net - t.materialsCost - wages) };
  }

  // Daily run sheet: jobs on `day` in time order, with customer and site details for the van.
  function runSheet(jobs, day, customers, sites) {
    var byId = function (list, id) { return (list || []).filter(function (x) { return x.id === id; })[0] || {}; };
    return (jobs || []).filter(function (j) { return C.dayOf(j.start) === day && j.status !== 'Cancelled'; })
      .sort(function (a, b) { return (a.start || '') < (b.start || '') ? -1 : 1; })
      .map(function (j) {
        var c = byId(customers, j.customer), s = byId(sites, j.site);
        return { id: j.id, time: C.timeOf(j.start) || 'Any time', hours: +j.hours || 0, job: j.title, customer: c.name || '', phone: c.phone || '', address: s.address || c.address || '', access: s.access || '', notes: j.notes || '', status: j.status };
      });
  }
  // Clashes: two jobs for the same worker that overlap in time on the same day.
  function clashes(jobs) {
    var out = [], list = (jobs || []).filter(function (j) { return j.start && /T/.test(j.start) && j.status !== 'Cancelled'; });
    var mins = function (j) { var t = C.timeOf(j.start); return +t.slice(0, 2) * 60 + +t.slice(3); };
    for (var i = 0; i < list.length; i++) for (var k = i + 1; k < list.length; k++) {
      var a = list[i], b = list[k];
      if ((a.worker || '') !== (b.worker || '') || C.dayOf(a.start) !== C.dayOf(b.start)) continue;
      var as = mins(a), ae = as + (+a.hours || 1) * 60, bs = mins(b), be = bs + (+b.hours || 1) * 60;
      if (as < be && bs < ae) out.push([a.id, b.id]);
    }
    return out;
  }

  function sample(today) {
    var d = function (n, t) { return C.addDays(today, n) + (t ? 'T' + t : ''); };
    var customers = [
      { id: 'c1', name: 'Mia Nguyen', type: 'Residential', phone: '0412 555 101', email: 'mia@example.com', address: '14 Banksia St, Marrickville NSW 2204' },
      { id: 'c2', name: 'Harbour Cafe Pty Ltd', type: 'Commercial', phone: '02 5550 1020', email: 'accounts@harbourcafe.example', address: '12 Wharf St, Sydney NSW 2000' },
      { id: 'c3', name: 'Seaview Strata (SP 40211)', type: 'Strata', phone: '02 5550 4400', email: 'manager@seaview.example', address: 'c/o 3/88 Ocean Pde, Coogee NSW 2034' },
      { id: 'c4', name: 'Jack Wilson', type: 'Residential', phone: '0412 555 104', email: 'jackw@example.com', address: '7 Grevillea Ave, Ryde NSW 2112' }
    ];
    var sites = [
      { id: 's1', address: '14 Banksia St, Marrickville', customer: 'c1', access: 'Side gate, dog is friendly. Park on street.' },
      { id: 's2', address: '12 Wharf St, Sydney (kitchen)', customer: 'c2', access: 'Before 7am only. Loading dock code 4471.' },
      { id: 's3', address: '88 Ocean Pde, Coogee — common areas', customer: 'c3', access: 'Keys from building manager, unit 1.' },
      { id: 's4', address: '7 Grevillea Ave, Ryde', customer: 'c4', access: '' }
    ];
    var jobs = [
      { id: 'j1', title: 'Replace hot water system', customer: 'c1', site: 's1', start: d(-12, '08:00'), hours: 5, status: 'Paid', worker: 'Dan', materials: [{ desc: 'Rheem 250L electric HWS', qty: 1, price: 1180 }, { desc: 'Valves and fittings', qty: 1, price: 96.5 }], notes: 'Old unit removed and disposed.' },
      { id: 'j2', title: 'Commercial kitchen RCD testing', customer: 'c2', site: 's2', start: d(-3, '06:00'), hours: 3, status: 'Invoiced', worker: 'Dan', materials: [{ desc: 'Test tags (pack)', qty: 1, price: 18 }], notes: '' },
      { id: 'j3', title: 'Stairwell lights not working', customer: 'c3', site: 's3', start: d(0, '09:30'), hours: 2, status: 'Scheduled', worker: 'Dan', materials: [], notes: 'Levels 2–4. Bring LED battens.' },
      { id: 'j4', title: 'Leaking kitchen mixer', customer: 'c4', site: 's4', start: d(0, '13:00'), hours: 1.5, status: 'Scheduled', worker: 'Priya', materials: [{ desc: 'Mixer cartridge 40mm', qty: 1, price: 42 }], notes: '' },
      { id: 'j5', title: 'Add two power points in office', customer: 'c2', site: 's2', start: d(2, '06:30'), hours: 3, status: 'Quoted', worker: 'Dan', materials: [], notes: '' },
      { id: 'j6', title: 'Blocked stormwater drain', customer: 'c3', site: 's3', start: '', hours: 2, status: 'Enquiry', worker: '', materials: [], notes: 'Strata manager to confirm access.' },
      { id: 'j7', title: 'Ceiling fan install x3', customer: 'c1', site: 's1', start: d(6, '10:00'), hours: 4, status: 'Scheduled', worker: 'Priya', materials: [{ desc: 'Ceiling fan with light', qty: 3, price: 189 }], notes: '' }
    ];
    var time = [
      { id: 't1', job: 'j1', worker: 'Dan', date: d(-12), hours: 5.5, notes: '' },
      { id: 't2', job: 'j2', worker: 'Dan', date: d(-3), hours: 3, notes: '' },
      { id: 't3', job: 'j2', worker: 'Priya', date: d(-3), hours: 2, notes: 'Apprentice' }
    ];
    var quotes = [
      { id: 'q1', number: 'Q-0001', job: 'j1', date: d(-20), validUntil: d(-6), labourHours: 5, labourRate: 110, materials: jobs[0].materials, markupPct: 15, calloutFee: 0, gst: true, status: 'Invoiced' },
      { id: 'q2', number: 'Q-0002', job: 'j5', date: d(-2), validUntil: d(12), labourHours: 3, labourRate: 110, materials: [{ desc: 'Double GPO', qty: 2, price: 14.5 }, { desc: 'TPS cable 2.5mm (m)', qty: 20, price: 2.1 }], markupPct: 20, calloutFee: 80, gst: true, status: 'Sent' },
      { id: 'q3', number: 'Q-0003', job: 'j6', date: d(-1), validUntil: d(2), labourHours: 2, labourRate: 120, materials: [], markupPct: 0, calloutFee: 90, gst: true, status: 'Draft' }
    ];
    var invoices = [
      Object.assign(invoiceFromQuote(quotes[0], [], d(-11), 14, 'i1'), { amountPaid: 2273.72, paidOn: d(-5), status: 'Paid' }),
      Object.assign(invoiceFromQuote({ job: 'j2', labourHours: 3, labourRate: 110, materials: jobs[1].materials, markupPct: 10, calloutFee: 0, gst: true }, [{ number: 'INV-0001' }], d(-30), 14, 'i2'), { issued: d(-30), due: d(-16), amountPaid: 0, status: 'Unpaid' })
    ];
    invoices[0].amountPaid = quoteTotals(invoices[0]).total;
    return { customers: customers, sites: sites, jobs: jobs, time: time, quotes: quotes, invoices: invoices };
  }

  var L = { priceLines: priceLines, quoteTotals: quoteTotals, paymentStatus: paymentStatus, balance: balance, invoiceFromQuote: invoiceFromQuote,
    jobHours: jobHours, jobProfit: jobProfit, runSheet: runSheet, clashes: clashes, sample: sample };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.TradieLib = L;
})(this);
