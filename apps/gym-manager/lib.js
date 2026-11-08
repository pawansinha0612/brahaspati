/* Gym & Studio Manager — pure logic (no DOM): membership end/renewal dates with holds, membership state,
   class capacity + waitlist promotion, timetable clashes, trainer hours, retention and fill rates. */
(function (root) {
  'use strict';
  var C = typeof module !== 'undefined' && module.exports ? require('../../forge/forge-core.js') : root.ForgeCore;
  var r2 = C.r2, DAYS = C.WEEKDAYS;

  var BILLING = ['Weekly', 'Fortnightly', 'Monthly', 'Annual', 'Class pack'];
  var TAKEN = ['Booked', 'Attended'];          // statuses that hold a spot in a class
  var USED = ['Booked', 'Attended', 'No-show']; // statuses that use a class-pack credit

  // Total hold days (inclusive), overlapping holds merged. holds: [{from, to}]
  function holdDays(holds, before) {
    var list = (holds || []).filter(function (h) { return h.from && h.to && h.to >= h.from && (!before || h.from < before); })
      .map(function (h) { return [h.from, h.to]; }).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
    var total = 0, cur = null;
    list.forEach(function (h) {
      if (cur && h[0] <= C.addDays(cur[1], 1)) { if (h[1] > cur[1]) cur[1] = h[1]; return; }
      if (cur) total += C.daysBetween(cur[0], cur[1]) + 1; cur = h.slice();
    });
    if (cur) total += C.daysBetween(cur[0], cur[1]) + 1;
    return total;
  }

  // Last day of a fixed-term membership, pushed out by hold days. '' for ongoing (no lock-in) plans.
  function endDate(m, plan, holds) {
    if (!m || !m.start || !plan) return '';
    var base;
    if (plan.billing === 'Class pack') base = C.addDays(m.start, (+plan.validDays || 90) - 1);
    else if (plan.billing === 'Annual') base = C.addDays(C.addMonths(m.start, 12), -1);
    else if (+plan.termMonths > 0) base = C.addDays(C.addMonths(m.start, +plan.termMonths), -1);
    else return '';
    return C.addDays(base, holdDays(holds));
  }

  // Next billing / renewal date on or after `today`. Ongoing plans step weekly/fortnightly/monthly from the start,
  // each date pushed back by the hold days taken before it. Fixed terms renew the day after they end.
  function nextBilling(m, plan, holds, today) {
    if (!m || !m.start || !plan) return '';
    if (plan.billing === 'Class pack') return '';
    if (plan.billing === 'Annual' || +plan.termMonths > 0) { var e = endDate(m, plan, holds); return e ? C.addDays(e, 1) : ''; }
    for (var k = 1; k < 2000; k++) {
      var raw = plan.billing === 'Weekly' ? C.addDays(m.start, 7 * k) : plan.billing === 'Fortnightly' ? C.addDays(m.start, 14 * k) : C.addMonths(m.start, k);
      var d = C.addDays(raw, holdDays(holds, raw));
      if (d >= today) return d;
    }
    return '';
  }

  function onHold(holds, day) { return (holds || []).some(function (h) { return h.from && h.from <= day && (h.to || h.from) >= day; }); }

  // 'Active' | 'On hold' | 'Expired' | 'Cancelled' | 'Not started'
  function state(m, plan, holds, today) {
    if (m.status === 'Cancelled') return 'Cancelled';
    if (m.start && m.start > today) return 'Not started';
    if (onHold(holds, today)) return 'On hold';
    var e = endDate(m, plan, holds);
    if (e && e < today) return 'Expired';
    return 'Active';
  }

  // Class pack credits left. bookings for this member from the start date use a credit unless cancelled.
  function packRemaining(m, plan, bookings) {
    if (!plan || plan.billing !== 'Class pack') return null;
    var used = (bookings || []).filter(function (b) { return b.member === m.member && b.date >= m.start && USED.indexOf(b.status) >= 0; }).length;
    return Math.max(0, (+plan.classCount || 0) - used);
  }

  // ---------- classes, capacity and waitlist ----------
  var forClass = function (bookings, classId, date) { return (bookings || []).filter(function (b) { return b.class === classId && b.date === date; }); };
  function occupancy(bookings, classId, date, exceptId) { return forClass(bookings, classId, date).filter(function (b) { return b.id !== exceptId && TAKEN.indexOf(b.status) >= 0; }).length; }
  var queueOrder = function (a, b) { return String(a.queuedAt || '').localeCompare(String(b.queuedAt || '')) || String(a.id).localeCompare(String(b.id)); };
  function waitlist(bookings, classId, date) { return forClass(bookings, classId, date).filter(function (b) { return b.status === 'Waitlisted'; }).sort(queueOrder); }
  // What a new booking request should become: {ok, status:'Booked'|'Waitlisted', position?, reason?}
  function requestBooking(bookings, cls, date, memberId) {
    if (!cls) return { ok: false, reason: 'No class' };
    if (cls.weekday && DAYS[C.weekday(date)] !== cls.weekday) return { ok: false, reason: cls.name + ' runs on ' + cls.weekday + 's' };
    var mine = forClass(bookings, cls.id, date).filter(function (b) { return b.member === memberId && b.status !== 'Cancelled'; })[0];
    if (mine) return { ok: false, reason: 'Already ' + mine.status.toLowerCase() + ' for this class' };
    if (occupancy(bookings, cls.id, date) < (+cls.capacity || 0)) return { ok: true, status: 'Booked' };
    return { ok: true, status: 'Waitlisted', position: waitlist(bookings, cls.id, date).length + 1 };
  }
  // Ids of waitlisted bookings to move to Booked now that spots are free (first in, first served).
  function promote(bookings, cls, date) {
    var free = (+cls.capacity || 0) - occupancy(bookings, cls.id, date);
    return free > 0 ? waitlist(bookings, cls.id, date).slice(0, free).map(function (b) { return b.id; }) : [];
  }

  // Each active class on each matching day between from and to: [{cls, date}]
  function occurrences(classes, from, to) {
    var out = [];
    for (var d = from; d <= to; d = C.addDays(d, 1)) {
      var wd = DAYS[C.weekday(d)];
      (classes || []).forEach(function (c) { if (c.active !== false && c.weekday === wd) out.push({ cls: c, date: d }); });
    }
    return out.sort(function (a, b) { return (a.date + a.cls.time) < (b.date + b.cls.time) ? -1 : (a.date + a.cls.time) > (b.date + b.cls.time) ? 1 : 0; });
  }

  // ---------- timetable ----------
  var mins = function (t) { var m = String(t || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  function slotOverlap(a, b) { if (a.weekday !== b.weekday) return false; var af = mins(a.time), bf = mins(b.time); if (af == null || bf == null) return false; return af < bf + (+b.minutes || 60) && bf < af + (+a.minutes || 60); }
  // Same trainer or same room at overlapping times on the same weekday: [{a, b, why:'trainer'|'room'}]
  function timetableClashes(classes) {
    var list = (classes || []).filter(function (c) { return c.active !== false; }), out = [];
    for (var i = 0; i < list.length; i++) for (var k = i + 1; k < list.length; k++) {
      var a = list[i], b = list[k]; if (!slotOverlap(a, b)) continue;
      if (a.trainer && a.trainer === b.trainer) out.push({ a: a.id, b: b.id, why: 'trainer' });
      if (a.room && String(a.room).toLowerCase() === String(b.room || '').toLowerCase()) out.push({ a: a.id, b: b.id, why: 'room' });
    }
    return out;
  }
  // Weekly timetabled hours per trainer: [{trainer, hours, classes, max, over}]
  function trainerHours(classes, trainers) {
    return (trainers || []).map(function (t) {
      var mine = (classes || []).filter(function (c) { return c.active !== false && c.trainer === t.id; });
      var h = r2(mine.reduce(function (s, c) { return s + (+c.minutes || 60) / 60; }, 0));
      return { trainer: t.id, name: t.name, hours: h, classes: mine.length, max: +t.maxHours || 0, over: !!(+t.maxHours && h > +t.maxHours) };
    });
  }

  // ---------- retention ----------
  function lastSeen(memberId, checkins, bookings) {
    var last = '';
    (checkins || []).forEach(function (c) { if (c.member === memberId && C.dayOf(c.at) > last) last = C.dayOf(c.at); });
    (bookings || []).forEach(function (b) { if (b.member === memberId && b.status === 'Attended' && b.date > last) last = b.date; });
    return last;
  }
  // Members with a current (active) membership not seen for `days` or more. [{member, lastSeen, days}]
  // ctx: {memberships, plans, holds, checkins, bookings}
  function atRisk(members, ctx, today, days) {
    var planOf = function (id) { return (ctx.plans || []).filter(function (p) { return p.id === id; })[0]; };
    return (members || []).map(function (mem) {
      var act = (ctx.memberships || []).filter(function (m) { return m.member === mem.id && state(m, planOf(m.plan), holdsFor(ctx.holds, m.id), today) === 'Active'; });
      if (!act.length) return null;
      var seen = lastSeen(mem.id, ctx.checkins, ctx.bookings), since = seen || act.map(function (m) { return m.start; }).sort()[0];
      var gap = C.daysBetween(since, today);
      return gap >= days ? { member: mem.id, lastSeen: seen, days: gap } : null;
    }).filter(Boolean).sort(function (a, b) { return b.days - a.days; });
  }
  function holdsFor(holds, membershipId) { return (holds || []).filter(function (h) { return h.membership === membershipId; }); }

  // New vs cancelled memberships per month for the last `months` months: [{month:'YYYY-MM', joined, cancelled, net}]
  function monthlyMovement(memberships, months, today) {
    var out = [];
    for (var i = months - 1; i >= 0; i--) {
      var mo = C.addMonths(today.slice(0, 7) + '-01', -i).slice(0, 7);
      var j = (memberships || []).filter(function (m) { return String(m.start || '').slice(0, 7) === mo; }).length;
      var c = (memberships || []).filter(function (m) { return m.status === 'Cancelled' && String(m.cancelledOn || '').slice(0, 7) === mo; }).length;
      out.push({ month: mo, joined: j, cancelled: c, net: j - c });
    }
    return out;
  }
  // Class fill rate between from and to (past occurrences): spots taken (booked, attended, no-show) ÷ capacity.
  function fillRates(classes, bookings, from, to) {
    return (classes || []).filter(function (c) { return c.active !== false; }).map(function (c) {
      var occ = occurrences([c], from, to), cap = (+c.capacity || 0) * occ.length;
      var taken = (bookings || []).filter(function (b) { return b.class === c.id && b.date >= from && b.date <= to && USED.indexOf(b.status) >= 0; }).length;
      var attended = (bookings || []).filter(function (b) { return b.class === c.id && b.date >= from && b.date <= to && b.status === 'Attended'; }).length;
      return { class: c.id, name: c.name, sessions: occ.length, taken: taken, attended: attended, fill: cap ? r2(taken / cap) : 0 };
    }).sort(function (a, b) { return b.fill - a.fill; });
  }

  function sample(today) {
    var d = function (n) { return C.addDays(today, n); }, wd = function (n) { return DAYS[C.weekday(d(n))]; };
    var trainers = [
      { id: 't1', name: 'Ava Brooks', phone: '0412 555 701', email: 'ava@example.com', maxHours: 10, specialties: 'Yoga, Pilates' },
      { id: 't2', name: 'Marcus Reid', phone: '0412 555 702', email: 'marcus@example.com', maxHours: 2.5, specialties: 'HIIT, Strength, Boxing' },
      { id: 't3', name: 'Lena Fischer', phone: '0412 555 703', email: 'lena@example.com', maxHours: 8, specialties: 'Spin' }
    ];
    var classes = [
      { id: 'c1', name: 'Sunrise Yoga', type: 'Yoga', trainer: 't1', room: 'Studio 1', weekday: wd(0), time: '06:00', minutes: 60, capacity: 4, active: true },
      { id: 'c2', name: 'HIIT 45', type: 'HIIT', trainer: 't2', room: 'Main floor', weekday: wd(0), time: '18:00', minutes: 45, capacity: 12, active: true },
      { id: 'c3', name: 'Spin Express', type: 'Spin', trainer: 't3', room: 'Spin room', weekday: wd(1), time: '06:15', minutes: 45, capacity: 10, active: true },
      { id: 'c4', name: 'Reformer Pilates', type: 'Pilates', trainer: 't1', room: 'Studio 1', weekday: wd(2), time: '09:30', minutes: 50, capacity: 3, active: true },
      { id: 'c5', name: 'Boxing Fit', type: 'Boxing', trainer: 't2', room: 'Main floor', weekday: wd(2), time: '17:30', minutes: 60, capacity: 14, active: true },
      { id: 'c6', name: 'Strength Club', type: 'Strength', trainer: 't2', room: 'Main floor', weekday: wd(2), time: '18:00', minutes: 60, capacity: 10, active: true },
      { id: 'c7', name: 'Yin Yoga', type: 'Yoga', trainer: 't1', room: 'Studio 1', weekday: wd(4), time: '19:00', minutes: 75, capacity: 15, active: true }
    ];
    var plans = [
      { id: 'pl1', name: 'Monthly no lock-in', billing: 'Monthly', price: 79, termMonths: 0 },
      { id: 'pl2', name: '12-month saver (fortnightly)', billing: 'Fortnightly', price: 34, termMonths: 12 },
      { id: 'pl3', name: 'Annual upfront', billing: 'Annual', price: 799, termMonths: 12 },
      { id: 'pl4', name: '10-class pack', billing: 'Class pack', price: 220, classCount: 10, validDays: 90 },
      { id: 'pl5', name: 'Student weekly', billing: 'Weekly', price: 19, termMonths: 0 }
    ];
    var P = function (id, name, extra) { return Object.assign({ id: id, number: 'M-' + id.slice(1).padStart(4, '0'), name: name, phone: '0412 555 ' + (800 + +id.slice(1)), email: name.split(' ')[0].toLowerCase() + '@example.com', healthDeclaration: true, healthDate: d(-200) }, extra || {}); };
    var members = [
      P('m1', 'Chloe Martin', { emergencyName: 'Ben Martin', emergencyPhone: '0412 555 911', joined: d(-400) }),
      P('m2', 'Daniel Osei', { emergencyName: 'Ama Osei', emergencyPhone: '0412 555 912', joined: d(-150) }),
      P('m3', 'Hannah Kim', { emergencyName: 'Joon Kim', emergencyPhone: '0412 555 913', joined: d(-60), healthNote: 'See form — cleared by GP' }),
      P('m4', 'Oliver Grant', { emergencyName: 'Sue Grant', emergencyPhone: '0412 555 914', joined: d(-30), healthDeclaration: false, healthDate: '' }),
      P('m5', 'Priya Nair', { emergencyName: 'Arjun Nair', emergencyPhone: '0412 555 915', joined: d(-95) }),
      P('m6', 'Tom Walsh', { emergencyName: 'Kim Walsh', emergencyPhone: '0412 555 916', joined: d(-220) }),
      P('m7', 'Grace Liu', { emergencyName: 'Wei Liu', emergencyPhone: '0412 555 917', joined: d(-10) })
    ];
    var memberships = [
      { id: 'ms1', member: 'm1', plan: 'pl3', start: C.addDays(C.addMonths(today, -12), 20), status: 'Active' },
      { id: 'ms2', member: 'm2', plan: 'pl2', start: d(-150), status: 'Active' },
      { id: 'ms3', member: 'm3', plan: 'pl4', start: d(-60), status: 'Active' },
      { id: 'ms4', member: 'm4', plan: 'pl1', start: d(-30), status: 'Active' },
      { id: 'ms5', member: 'm5', plan: 'pl1', start: d(-95), status: 'Active' },
      { id: 'ms6', member: 'm6', plan: 'pl1', start: d(-220), status: 'Cancelled', cancelledOn: d(-12) },
      { id: 'ms7', member: 'm7', plan: 'pl5', start: d(-10), status: 'Active' }
    ];
    var holds = [
      { id: 'h1', membership: 'ms2', from: d(-40), to: d(-27), reason: 'Overseas holiday' },
      { id: 'h2', membership: 'ms5', from: d(-3), to: d(10), reason: 'Knee injury — physio' }
    ];
    var n = 0, q = 0;
    var Bk = function (member, cls, day, status) { n++; q++; return { id: 'b' + n, member: member, class: cls, date: d(day), status: status, queuedAt: d(day - 2) + 'T08:' + String(q % 60).padStart(2, '0') }; };
    var bookings = [];
    // past weeks: attendance history
    [-7, -14, -21].forEach(function (w) {
      bookings.push(Bk('m1', 'c1', w, 'Attended'), Bk('m3', 'c1', w, 'Attended'), Bk('m2', 'c2', w, w === -14 ? 'No-show' : 'Attended'), Bk('m7', 'c2', w, w === -7 ? 'Attended' : 'Cancelled'));
      bookings.push(Bk('m1', 'c4', w + 2, 'Attended'), Bk('m3', 'c4', w + 2, 'Attended'));
      bookings.push(Bk('m1', 'c3', w + 1, 'Attended'), Bk('m2', 'c3', w + 1, 'Attended'), Bk('m7', 'c3', w + 1, w === -21 ? 'No-show' : 'Attended'));
      bookings.push(Bk('m2', 'c5', w + 2, 'Attended'), Bk('m7', 'c5', w + 2, 'Attended'), Bk('m4', 'c5', w + 2, w === -21 ? 'Attended' : 'No-show'), Bk('m2', 'c6', w + 2, 'Attended'));
      bookings.push(Bk('m1', 'c7', w + 4, 'Attended'), Bk('m3', 'c7', w + 4, 'Attended'), Bk('m7', 'c7', w + 4, 'Attended'));
    });
    // today: Sunrise Yoga is full (4) with a waitlist of 2
    bookings.push(Bk('m1', 'c1', 0, 'Booked'), Bk('m3', 'c1', 0, 'Booked'), Bk('m2', 'c1', 0, 'Booked'), Bk('m7', 'c1', 0, 'Booked'), Bk('m4', 'c1', 0, 'Waitlisted'), Bk('m5', 'c1', 0, 'Waitlisted'));
    bookings.push(Bk('m2', 'c2', 0, 'Booked'), Bk('m1', 'c3', 1, 'Booked'), Bk('m3', 'c4', 2, 'Booked'), Bk('m1', 'c4', 2, 'Booked'), Bk('m7', 'c4', 2, 'Booked'), Bk('m2', 'c4', 2, 'Waitlisted'));
    var checkins = [
      { id: 'ci1', member: 'm1', at: d(-1) + 'T06:40', kind: 'Gym floor' },
      { id: 'ci2', member: 'm2', at: d(-2) + 'T17:55', kind: 'Gym floor' },
      { id: 'ci3', member: 'm7', at: d(-3) + 'T12:10', kind: 'Gym floor' },
      { id: 'ci4', member: 'm4', at: d(-27) + 'T07:00', kind: 'Gym floor' }
    ];
    var payments = [
      { id: 'pa1', member: 'm1', membership: 'ms1', date: memberships[0].start, amount: 799, method: 'Card', note: 'Annual upfront' },
      { id: 'pa2', member: 'm3', membership: 'ms3', date: d(-60), amount: 220, method: 'Card', note: '10-class pack' },
      { id: 'pa3', member: 'm4', membership: 'ms4', date: d(-30), amount: 79, method: 'Direct debit', note: 'Month 1' },
      { id: 'pa4', member: 'm2', membership: 'ms2', date: d(-6), amount: 34, method: 'Direct debit', note: 'Fortnightly instalment' },
      { id: 'pa5', member: 'm7', membership: 'ms7', date: d(-3), amount: 19, method: 'Card', note: 'Student weekly' }
    ];
    return { members: members, memberships: memberships, plans: plans, holds: holds, classes: classes, bookings: bookings, checkins: checkins, trainers: trainers, payments: payments };
  }

  var L = { BILLING: BILLING, TAKEN: TAKEN, USED: USED, holdDays: holdDays, endDate: endDate, nextBilling: nextBilling, onHold: onHold, state: state, packRemaining: packRemaining,
    occupancy: occupancy, waitlist: waitlist, requestBooking: requestBooking, promote: promote, occurrences: occurrences, timetableClashes: timetableClashes, trainerHours: trainerHours,
    lastSeen: lastSeen, atRisk: atRisk, holdsFor: holdsFor, monthlyMovement: monthlyMovement, fillRates: fillRates, sample: sample };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.GymLib = L;
})(this);
