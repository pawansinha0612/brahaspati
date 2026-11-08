/* Cleaning Business OS — pure logic (no DOM): checklists, rostering, auto-allocation, lateness and payroll hours. */
(function (root) {
  'use strict';
  var C = typeof module !== 'undefined' && module.exports ? require('../../forge/forge-core.js') : root.ForgeCore;
  var r2 = C.r2, DAYS = C.WEEKDAYS;

  var TEMPLATES = {
    Office: { 'Kitchen': ['Wipe benches and sink', 'Clean microwave inside and out', 'Load / unload dishwasher', 'Empty bins and replace liners'], 'Desks and floors': ['Wipe desks (clear areas only)', 'Vacuum carpets', 'Mop hard floors', 'Spot-clean glass doors'], 'Bathrooms': ['Clean toilets and urinals', 'Clean basins and mirrors', 'Restock paper and soap', 'Mop floors'] },
    Home: { 'Kitchen': ['Wipe benches and splashback', 'Clean stovetop', 'Clean sink', 'Wipe cupboard fronts'], 'Bathrooms': ['Clean shower and screen', 'Clean toilet', 'Clean vanity and mirror', 'Mop floor'], 'Living and bedrooms': ['Dust surfaces', 'Make beds / change linen if left out', 'Vacuum floors', 'Mop hard floors'] },
    Retail: { 'Shop floor': ['Vacuum / mop floor', 'Dust shelves and displays', 'Clean front glass inside', 'Empty bins'], 'Back of house': ['Clean staff kitchen', 'Clean staff toilet', 'Sweep storeroom'] },
    Medical: { 'Waiting room': ['Wipe chairs and armrests', 'Disinfect door handles and touch points', 'Mop floor'], 'Consult rooms': ['Disinfect benches and couches', 'Empty general waste', 'Mop floor with hospital-grade disinfectant'], 'Bathrooms': ['Clean and disinfect toilets', 'Restock supplies', 'Mop floor'], 'Sign-off': ['Clinical waste left untouched (not our scope)'] },
    'Strata common area': { 'Lobby and corridors': ['Vacuum / mop', 'Clean lift doors and buttons', 'Wipe letterboxes'], 'Outdoor': ['Sweep entry and paths', 'Clean bin room', 'Pick up litter'] }
  };
  function checklistFor(siteType, mk) {
    mk = mk || C.checkItem; var t = TEMPLATES[siteType] || TEMPLATES.Office, out = [];
    Object.keys(t).forEach(function (g) { t[g].forEach(function (x) { out.push(mk({ text: x, group: g })); }); });
    return out;
  }
  // Copy a site's checklist for a new visit (fresh ids, nothing ticked).
  function freshChecklist(items, mk) { mk = mk || C.checkItem; return (items || []).map(function (it) { return mk({ text: it.text, group: it.group }); }); }

  var mins = function (t) { var m = String(t || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  var hhmm = function (n) { n = ((n % 1440) + 1440) % 1440; return (n < 600 ? '0' : '') + Math.floor(n / 60) + ':' + (n % 60 < 10 ? '0' : '') + (n % 60); };
  // job: {start:'YYYY-MM-DDTHH:MM', hours}
  function span(job) { var s = mins(C.timeOf(job.start)); if (s == null) s = 0; return { day: C.dayOf(job.start), from: s, to: s + Math.round((+job.hours || 0) * 60) }; }
  function overlaps(a, b, gap) { var x = span(a), y = span(b); gap = gap || 0; return x.day === y.day && x.from < y.to + gap && y.from < x.to + gap; }
  var active = function (j) { return j.status !== 'Cancelled' && j.status !== 'Missed'; };

  // Is the cleaner free for this job according to their availability? Returns '' or the reason they are not.
  function availability(cleaner, job) {
    if (cleaner.active === false) return 'not active';
    var sp = span(job), wd = DAYS[C.weekday(sp.day)];
    if (cleaner.days && cleaner.days.length && cleaner.days.indexOf(wd) < 0) return 'does not work ' + wd;
    var af = mins(cleaner.from), at = mins(cleaner.to);
    if (af != null && sp.from < af) return 'starts at ' + cleaner.from;
    if (at != null && sp.to > at) return 'finishes at ' + cleaner.to;
    return '';
  }
  function weekHours(jobs, cleanerId, day) {
    var w = C.weekOf(day);
    return r2((jobs || []).filter(function (j) { return j.cleaner === cleanerId && active(j) && C.dayOf(j.start) >= w[0] && C.dayOf(j.start) <= w[6]; }).reduce(function (s, j) { return s + (+j.hours || 0); }, 0));
  }

  // Auto-allocate unassigned jobs. Rules: available that day and time, no double booking (with `gapMin` travel
  // time between jobs), stay under each cleaner's weekly max hours, and give the job to whoever has the fewest hours
  // that week (ties: fewer jobs that day, then name). Longest jobs are placed first. Does not change the input.
  // opts: {from, to, gapMin, keepExisting:true}. Returns {assignments:[{job, cleaner}], unassigned:[{job, reason}]}
  function autoAllocate(jobs, cleaners, opts) {
    opts = opts || {}; var gap = opts.gapMin == null ? 30 : opts.gapMin;
    var plan = (jobs || []).map(function (j) { return Object.assign({}, j); });
    var todo = plan.filter(function (j) { var d = C.dayOf(j.start); return !j.cleaner && j.status === 'Scheduled' && d && (!opts.from || d >= opts.from) && (!opts.to || d <= opts.to); })
      .sort(function (a, b) { return (+b.hours || 0) - (+a.hours || 0) || (a.start < b.start ? -1 : a.start > b.start ? 1 : 0); });
    var assignments = [], unassigned = [];
    todo.forEach(function (job) {
      var reasons = [];
      var cands = (cleaners || []).filter(function (c) {
        var why = availability(c, job);
        if (!why && plan.some(function (o) { return o !== job && o.cleaner === c.id && active(o) && overlaps(o, job, gap); })) why = 'already booked then';
        if (!why && c.maxHours && weekHours(plan, c.id, C.dayOf(job.start)) + (+job.hours || 0) > +c.maxHours) why = 'would go over ' + c.maxHours + ' h this week';
        if (why) reasons.push(c.name + ': ' + why);
        return !why;
      }).map(function (c) {
        return { c: c, hours: weekHours(plan, c.id, C.dayOf(job.start)), sameDay: plan.filter(function (o) { return o.cleaner === c.id && C.dayOf(o.start) === C.dayOf(job.start); }).length };
      }).sort(function (a, b) { return a.hours - b.hours || a.sameDay - b.sameDay || String(a.c.name).localeCompare(String(b.c.name)); });
      if (!cands.length) { unassigned.push({ job: job.id, reason: reasons.length ? reasons.join('; ') : 'no cleaners' }); return; }
      job.cleaner = cands[0].c.id; assignments.push({ job: job.id, cleaner: job.cleaner });
    });
    return { assignments: assignments, unassigned: unassigned };
  }

  // Double bookings already in the roster: [[jobIdA, jobIdB]]
  function doubleBookings(jobs) {
    var list = (jobs || []).filter(function (j) { return j.cleaner && active(j) && j.start; }), out = [];
    for (var i = 0; i < list.length; i++) for (var k = i + 1; k < list.length; k++) if (list[i].cleaner === list[k].cleaner && overlaps(list[i], list[k], 0)) out.push([list[i].id, list[k].id]);
    return out;
  }

  // Lateness: minutes after the booked start that the cleaner arrived (0 if on time or no arrival recorded).
  function lateMinutes(job) { var a = mins(job.arrived), s = span(job).from; return a == null || !job.start ? 0 : Math.max(0, a - s); }
  // 'missed' | 'late' | 'overdue' (still Scheduled after its day) | 'ok' | 'upcoming'
  function jobFlag(job, today, graceMin) {
    graceMin = graceMin == null ? 15 : graceMin;
    if (job.status === 'Missed') return 'missed';
    if (job.status === 'Done') return lateMinutes(job) > graceMin ? 'late' : 'ok';
    if (job.status === 'Cancelled') return 'ok';
    return C.dayOf(job.start) < today ? 'overdue' : 'upcoming';
  }
  // Hours actually worked: actualHours, else finished − arrived, else booked hours.
  function workedHours(job) {
    if (job.actualHours != null && job.actualHours !== '') return r2(+job.actualHours);
    var a = mins(job.arrived), f = mins(job.finished);
    if (a != null && f != null && f > a) return r2((f - a) / 60);
    return r2(+job.hours || 0);
  }

  // Payroll: completed jobs in [from, to] per cleaner.
  function hoursReport(jobs, cleaners, from, to, today, graceMin) {
    var rows = (cleaners || []).map(function (c) {
      var mine = (jobs || []).filter(function (j) { var d = C.dayOf(j.start); return j.cleaner === c.id && d >= from && d <= to; });
      var done = mine.filter(function (j) { return j.status === 'Done'; }), hrs = r2(done.reduce(function (s, j) { return s + workedHours(j); }, 0));
      return { cleaner: c.id, name: c.name, jobs: done.length, hours: hrs, booked: r2(mine.filter(active).reduce(function (s, j) { return s + (+j.hours || 0); }, 0)),
        late: done.filter(function (j) { return jobFlag(j, today, graceMin) === 'late'; }).length, missed: mine.filter(function (j) { return j.status === 'Missed'; }).length,
        rate: +c.rate || 0, pay: r2(hrs * (+c.rate || 0)) };
    });
    var total = rows.reduce(function (a, r) { a.jobs += r.jobs; a.hours = r2(a.hours + r.hours); a.pay = r2(a.pay + r.pay); return a; }, { jobs: 0, hours: 0, pay: 0 });
    return { rows: rows, total: total };
  }

  function sample(today) {
    var d = function (n, t) { return C.addDays(today, n) + (t ? 'T' + t : ''); }, n = 0;
    var mk = function (o) { return C.checkItem(Object.assign({ id: 'k' + (++n) }, o)); };
    var cleaners = [
      { id: 'c1', name: 'Maria Lopez', phone: '0412 555 401', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], from: '06:00', to: '15:00', maxHours: 30, rate: 32.5, active: true },
      { id: 'c2', name: 'Ken Ito', phone: '0412 555 402', days: ['Mon', 'Wed', 'Fri', 'Sat'], from: '16:00', to: '23:00', maxHours: 20, rate: 34, active: true },
      { id: 'c3', name: 'Grace Okafor', phone: '0412 555 403', days: ['Tue', 'Thu', 'Sat', 'Sun'], from: '07:00', to: '20:00', maxHours: 25, rate: 32.5, active: true },
      { id: 'c4', name: 'Tom Reid', phone: '0412 555 404', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], from: '17:00', to: '22:00', maxHours: 12, rate: 31, active: true }
    ];
    var sites = [
      { id: 's1', name: 'Northside Accounting', client: 'Northside Accounting Pty Ltd', type: 'Office', address: 'Level 2, 40 Miller St, North Sydney', phone: '02 5550 7001', access: 'Swipe card in lockbox 1123. Alarm code on card.', checklist: checklistFor('Office', mk) },
      { id: 's2', name: 'Chen residence', client: 'Lily Chen', type: 'Home', address: '9 Lilly Pilly Cl, Epping', phone: '0412 555 410', access: 'Key under the blue pot. Cat stays inside.', checklist: checklistFor('Home', mk) },
      { id: 's3', name: 'Bayside Physio', client: 'Bayside Physio', type: 'Medical', address: 'Shop 4, 120 Bay St, Brighton-le-Sands', phone: '02 5550 7003', access: 'After 6pm only. Code 2580#.', checklist: checklistFor('Medical', mk) },
      { id: 's4', name: 'Seaview Apartments', client: 'Seaview Strata (SP 40211)', type: 'Strata common area', address: '88 Ocean Pde, Coogee', phone: '02 5550 4400', access: 'Fob from building manager.', checklist: checklistFor('Strata common area', mk) }
    ];
    var J = function (id, site, day, time, hrs, cleaner, status, extra) {
      var s = sites.filter(function (x) { return x.id === site; })[0];
      return Object.assign({ id: id, site: site, start: d(day, time), hours: hrs, cleaner: cleaner, status: status, checklist: freshChecklist(s.checklist, mk) }, extra || {});
    };
    var jobs = [
      J('j1', 's1', -7, '18:00', 3, 'c2', 'Done', { arrived: '18:05', finished: '21:00' }),
      J('j2', 's3', -6, '18:30', 2, 'c4', 'Done', { arrived: '19:05', finished: '21:00' }),
      J('j3', 's2', -5, '09:00', 3, 'c1', 'Missed', { notes: 'Client away — not told. Charge per policy?' }),
      J('j4', 's4', -2, '08:00', 2.5, 'c3', 'Done', { arrived: '07:55', finished: '10:20' }),
      J('j5', 's1', 0, '18:00', 3, 'c2', 'Scheduled'),
      J('j6', 's3', 1, '18:30', 2, '', 'Scheduled'),
      J('j7', 's2', 2, '09:00', 3, '', 'Scheduled'),
      J('j8', 's1', 2, '18:00', 3, '', 'Scheduled'),
      J('j9', 's4', 3, '08:00', 2.5, '', 'Scheduled'),
      J('j10', 's3', 3, '18:30', 2, 'c4', 'Scheduled'),
      J('j11', 's1', 4, '18:00', 3, '', 'Scheduled'),
      J('j12', 's4', 5, '09:00', 2.5, '', 'Scheduled')
    ];
    jobs.forEach(function (j) { if (j.status === 'Done') j.checklist.forEach(function (it) { it.done = true; }); });
    // make sure "today" looks real: past scheduled jobs before today become done
    jobs.forEach(function (j) { if (j.status === 'Scheduled' && C.dayOf(j.start) < today) { j.status = 'Done'; j.cleaner = j.cleaner || 'c1'; j.checklist.forEach(function (it) { it.done = true; }); } });
    return { sites: sites, cleaners: cleaners, jobs: jobs };
  }

  var L = { TEMPLATES: TEMPLATES, checklistFor: checklistFor, freshChecklist: freshChecklist, span: span, overlaps: overlaps, availability: availability, weekHours: weekHours,
    autoAllocate: autoAllocate, doubleBookings: doubleBookings, lateMinutes: lateMinutes, jobFlag: jobFlag, workedHours: workedHours, hoursReport: hoursReport, hhmm: hhmm, sample: sample };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.CleaningLib = L;
})(this);
