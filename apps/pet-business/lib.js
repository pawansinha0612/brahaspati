/* Pet Business Manager — pure logic (no DOM): sizes, ages, vaccinations, size-based pricing, double bookings,
   packages, grooming intervals, customer history, GST-inclusive invoices and "pupdate" text. */
(function (root) {
  'use strict';
  var C = typeof module !== 'undefined' && module.exports ? require('../../forge/forge-core.js') : root.ForgeCore;
  var r2 = C.r2;

  var SIZES = ['Small', 'Medium', 'Large', 'Giant'];
  // Weight bands most Australian groomers use. No weight → Medium (ask the owner).
  function sizeFor(kg) {
    kg = +kg; if (!kg) return 'Medium';
    return kg < 10 ? 'Small' : kg < 25 ? 'Medium' : kg < 45 ? 'Large' : 'Giant';
  }

  // Age from date of birth: {years, months, text}
  function age(dob, today) {
    dob = C.dayOf(dob); if (!dob || !today || dob > today) return { years: 0, months: 0, text: '' };
    var a = C.parseDay(dob), b = C.parseDay(today);
    var m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
    if (b.getUTCDate() < a.getUTCDate()) m--;
    var y = Math.floor(m / 12), mo = m % 12;
    var text = y ? y + ' yr' + (y === 1 ? '' : 's') + (mo ? ' ' + mo + ' mth' + (mo === 1 ? '' : 's') : '') : mo + ' mth' + (mo === 1 ? '' : 's');
    return { years: y, months: mo, text: text };
  }

  // Typical revaccination intervals in months — a guide only; the vet certificate's due date wins.
  var VACCINES = {
    'C3 (distemper, hepatitis, parvo)': 36,
    'C5 (C3 + kennel cough)': 12,
    'Kennel cough (Bordetella)': 12,
    'Leptospirosis': 12,
    'F3 (cat flu, enteritis)': 12,
    'FIV (cat)': 12,
    'Other': 12
  };
  function vaccineDue(type, given) { return given ? C.addMonths(C.dayOf(given), VACCINES[type] || 12) : ''; }
  function dueOf(v) { return C.dayOf(v.due) || vaccineDue(v.type, v.given); }

  // Latest record per vaccine type for one pet: {type: record}
  function latestVaccinations(vaccs, petId) {
    var out = {};
    (vaccs || []).forEach(function (v) {
      if (v.pet !== petId || !v.given) return;
      if (!out[v.type] || v.given > out[v.type].given) out[v.type] = v;
    });
    return out;
  }
  // Vaccinations that will be overdue on `day` (latest record per type only): [{type, due, id}]
  function vaxIssues(petId, vaccs, day) {
    var latest = latestVaccinations(vaccs, petId);
    return Object.keys(latest).map(function (t) { return { type: t, due: dueOf(latest[t]), id: latest[t].id }; })
      .filter(function (x) { return x.due && x.due < day; }).sort(function (a, b) { return a.due < b.due ? -1 : 1; });
  }
  // Older records of the same pet + type as `rec` (so reminders only follow the newest one).
  function replacedIds(vaccs, rec) {
    return (vaccs || []).filter(function (v) { return v.id !== rec.id && v.pet === rec.pet && v.type === rec.type && v.given && rec.given && v.given < rec.given && !v.replaced; })
      .map(function (v) { return v.id; });
  }

  // Service price and minutes for a size. service: {priceSmall, priceMedium, …, minsSmall, …}
  function priceFor(service, size) {
    if (!service) return { price: 0, minutes: 60 };
    size = SIZES.indexOf(size) >= 0 ? size : 'Medium';
    var p = service['price' + size], m = service['mins' + size];
    if (p == null || p === '') p = service.priceMedium; if (m == null || m === '') m = service.minsMedium;
    return { price: r2(+p || 0), minutes: +m || 60 };
  }

  var mins = function (t) { var m = String(t || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  function span(b) { var s = mins(C.timeOf(b.start)) || 0; return { day: C.dayOf(b.start), from: s, to: s + Math.round((+b.hours || 1) * 60) }; }
  var live = function (b) { return b.status !== 'Cancelled' && b.status !== 'No-show'; };
  function overlaps(a, b) { var x = span(a), y = span(b); return x.day === y.day && x.from < y.to && y.from < x.to; }
  // Other bookings that clash with `b` for the same staff member. Group walks (groupOk on both) may overlap.
  function clashFor(b, bookings) {
    if (!b.staff || !b.start || !live(b)) return [];
    return (bookings || []).filter(function (o) { return o.id !== b.id && o.staff === b.staff && o.start && live(o) && !(o.groupOk && b.groupOk) && overlaps(o, b); });
  }
  function clashes(bookings) {
    var list = (bookings || []).filter(function (b) { return b.staff && b.start && live(b); }), out = [];
    for (var i = 0; i < list.length; i++) for (var k = i + 1; k < list.length; k++) {
      var a = list[i], b = list[k];
      if (a.staff === b.staff && !(a.groupOk && b.groupOk) && overlaps(a, b)) out.push([a.id, b.id]);
    }
    return out;
  }

  // Package (e.g. 10-walk pass): bookings linked to it, except cancelled ones, use a visit. No-shows count (policy).
  function packageUse(pkg, bookings, today) {
    var used = (bookings || []).filter(function (b) { return b.package === pkg.id && b.status !== 'Cancelled'; }).length;
    var total = +pkg.visits || 0;
    return { used: used, remaining: Math.max(0, total - used), over: Math.max(0, used - total), expired: !!(pkg.expires && today && pkg.expires < today) };
  }

  // Last finished groom for a pet (any service whose kind is Groom).
  function lastGroom(petId, bookings, services) {
    var kind = {}; (services || []).forEach(function (s) { kind[s.id] = s.kind; });
    var last = '';
    (bookings || []).forEach(function (b) { if (b.pet === petId && b.status === 'Done' && kind[b.service] === 'Groom' && C.dayOf(b.start) > last) last = C.dayOf(b.start); });
    return last;
  }
  function nextGroom(last, weeks) { return last ? C.addDays(last, Math.round((+weeks || 6) * 7)) : ''; }

  // Customer history per owner: visits, spend (finished bookings + packages bought), last visit, per pet rows.
  function ownerHistory(ownerId, pets, bookings, packages, services, today) {
    var mine = (pets || []).filter(function (p) { return p.owner === ownerId; }), ids = mine.map(function (p) { return p.id; });
    var done = (bookings || []).filter(function (b) { return ids.indexOf(b.pet) >= 0 && b.status === 'Done'; });
    var pk = (packages || []).filter(function (p) { return p.owner === ownerId; });
    var spend = r2(done.reduce(function (s, b) { return s + (b.package ? 0 : +b.price || 0); }, 0) + pk.reduce(function (s, p) { return s + (+p.price || 0); }, 0));
    var last = done.reduce(function (m, b) { var d = C.dayOf(b.start); return d > m ? d : m; }, '');
    var upcoming = (bookings || []).filter(function (b) { return ids.indexOf(b.pet) >= 0 && b.status === 'Booked' && C.dayOf(b.start) >= today; }).length;
    return {
      visits: done.length, spend: spend, last: last, upcoming: upcoming, noShows: (bookings || []).filter(function (b) { return ids.indexOf(b.pet) >= 0 && b.status === 'No-show'; }).length,
      pets: mine.map(function (p) {
        var lg = lastGroom(p.id, bookings, services) || C.dayOf(p.lastGroom);
        return { id: p.id, name: p.name, visits: done.filter(function (b) { return b.pet === p.id; }).length, lastGroom: lg, nextGroom: nextGroom(lg, p.groomWeeks) };
      })
    };
  }

  // Prices are GST-inclusive (how pet businesses quote). GST = total / 11 when registered.
  function invoiceTotals(lines, gstRegistered) {
    var total = C.linesTotal(lines), gst = gstRegistered === false ? 0 : C.gstFromInclusive(total);
    return { subtotal: r2(total - gst), markup: 0, discount: 0, net: r2(total - gst), gst: gst, total: total };
  }
  function invoiceStatus(inv, today) {
    var total = invoiceTotals(inv.lines, inv.gst).total, paid = r2(+inv.amountPaid || 0);
    if (total > 0 && paid >= total) return 'Paid';
    if (inv.due && today && inv.due < today) return 'Overdue';
    return paid > 0 ? 'Part paid' : 'Unpaid';
  }
  // Finished, paid-per-visit bookings for an owner's pets that are not on an invoice yet.
  function unbilled(ownerId, pets, bookings) {
    var ids = (pets || []).filter(function (p) { return p.owner === ownerId; }).map(function (p) { return p.id; });
    return (bookings || []).filter(function (b) { return ids.indexOf(b.pet) >= 0 && b.status === 'Done' && !b.invoice && !b.package && +b.price > 0; })
      .sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  }
  function invoiceLines(bks, petName, serviceName) {
    return bks.map(function (b) { return { desc: serviceName(b.service) + ' — ' + petName(b.pet) + ' (' + C.dayOf(b.start) + ')', qty: 1, price: r2(+b.price || 0) }; });
  }

  var CHECKLISTS = {
    Walk: ['Picked up on time', 'Harness and lead checked', 'Wee', 'Poo (picked up)', 'Water given', 'Paws wiped', 'Dropped home, door locked'],
    Groom: ['Brush out / de-matt', 'Bath', 'Blow dry', 'Clip / scissor', 'Nails', 'Ears cleaned', 'Hygiene trim', 'Bandana or bow'],
    Sitting: ['Fed', 'Fresh water', 'Litter / yard cleaned', 'Medication given (if any)', 'Play and cuddles', 'Mail and plants (if asked)', 'Home locked, lights as asked'],
    Daycare: ['Checked in', 'Fed lunch (if supplied)', 'Water', 'Rest time', 'Played well with others', 'Checked out'],
    Other: ['Arrived', 'Service done', 'Notes added']
  };
  function checklistFor(kind, mk) { mk = mk || C.checkItem; return (CHECKLISTS[kind] || CHECKLISTS.Other).map(function (t) { return mk({ text: t }); }); }

  // Shareable text report ("pupdate") for a message or email.
  function pupdateText(b, pet, serviceName, staffName, business) {
    var done = (b.checklist || []).filter(function (i) { return i.done; }).map(function (i) { return '✓ ' + i.text; });
    var parts = ['Pupdate for ' + (pet && pet.name || 'your pet') + ' — ' + C.dayOf(b.start) + ' ' + C.timeOf(b.start),
      serviceName + (staffName ? ' with ' + staffName : '')];
    if (b.mood) parts.push('Mood: ' + b.mood);
    if (done.length) parts.push(done.join('\n'));
    if (b.report) parts.push(b.report);
    parts.push('Thanks from ' + (business || 'the team') + '!');
    return parts.join('\n\n');
  }

  function sample(today) {
    var d = function (n, t) { return C.addDays(today, n) + (t ? 'T' + t : ''); }, n = 0;
    var mk = function (o) { return C.checkItem(Object.assign({ id: 'k' + (++n) }, o)); };
    var owners = [
      { id: 'o1', name: 'Mia Nguyen', phone: '0412 555 101', email: 'mia.nguyen@example.com', address: '14 Banksia St, Marrickville NSW', emergencyName: 'Tom Nguyen', emergencyPhone: '0412 555 102', vet: 'Inner West Vet Clinic', vetPhone: '02 5550 1201', access: 'Side gate, code 4410. Keys in lockbox.' },
      { id: 'o2', name: 'Raj Patel', phone: '0412 555 201', email: 'raj.patel@example.com', address: '3/22 Glebe Point Rd, Glebe NSW', emergencyName: 'Anika Patel', emergencyPhone: '0412 555 202', vet: 'Glebe Animal Hospital', vetPhone: '02 5550 1302' },
      { id: 'o3', name: 'Sophie Walker', phone: '0412 555 301', email: 'sophie.w@example.com', address: '8 Ocean View Rd, Coogee NSW', emergencyName: 'Jack Walker', emergencyPhone: '0412 555 302', vet: 'Coogee Vets', vetPhone: '02 5550 1403', access: 'Concierge holds the fob.' }
    ];
    var pets = [
      { id: 'p1', name: 'Biscuit', owner: 'o1', species: 'Dog', breed: 'Cavoodle', dob: C.addMonths(today, -40), weight: 8.5, sex: 'Male', desexed: true, temperament: ['Friendly'], allergies: 'Chicken', groomWeeks: 6, behaviour: 'Hates the dryer on high. Loves liver treats.' },
      { id: 'p2', name: 'Luna', owner: 'o1', species: 'Cat', breed: 'Ragdoll', dob: C.addMonths(today, -70), weight: 5.2, sex: 'Female', desexed: true, temperament: ['Shy'], groomWeeks: 8, medical: 'Kidney diet — no treats.' },
      { id: 'p3', name: 'Max', owner: 'o2', species: 'Dog', breed: 'Labrador', dob: C.addMonths(today, -26), weight: 32, sex: 'Male', desexed: true, temperament: ['Friendly', 'Pulls on lead'], groomWeeks: 8 },
      { id: 'p4', name: 'Bella', owner: 'o3', species: 'Dog', breed: 'Great Dane', dob: C.addMonths(today, -50), weight: 58, sex: 'Female', desexed: true, temperament: ['Reactive to dogs'], groomWeeks: 8, behaviour: 'Walk solo only. Muzzle trained.' },
      { id: 'p5', name: 'Pip', owner: 'o3', species: 'Dog', breed: 'Jack Russell', dob: C.addMonths(today, -9), weight: 6, sex: 'Male', desexed: false, temperament: ['Escape artist'], groomWeeks: 6 }
    ];
    var vaccinations = [
      { id: 'v1', pet: 'p1', type: 'C5 (C3 + kennel cough)', given: C.addMonths(today, -23), due: C.addMonths(today, -11), vetName: 'Inner West Vet Clinic', replaced: true },
      { id: 'v2', pet: 'p1', type: 'C5 (C3 + kennel cough)', given: C.addDays(C.addMonths(today, -12), 20), due: C.addDays(today, 20), vetName: 'Inner West Vet Clinic' },
      { id: 'v3', pet: 'p3', type: 'C5 (C3 + kennel cough)', given: C.addMonths(today, -13), due: C.addMonths(today, -1), vetName: 'Glebe Animal Hospital' },
      { id: 'v4', pet: 'p4', type: 'C3 (distemper, hepatitis, parvo)', given: C.addMonths(today, -14), due: C.addMonths(today, 22), vetName: 'Coogee Vets' },
      { id: 'v5', pet: 'p4', type: 'Kennel cough (Bordetella)', given: C.addMonths(today, -4), due: C.addMonths(today, 8), vetName: 'Coogee Vets' },
      { id: 'v6', pet: 'p2', type: 'F3 (cat flu, enteritis)', given: C.addMonths(today, -5), due: C.addMonths(today, 7), vetName: 'Inner West Vet Clinic' },
      { id: 'v7', pet: 'p5', type: 'C5 (C3 + kennel cough)', given: C.addMonths(today, -7), due: C.addMonths(today, 5), vetName: 'Coogee Vets' }
    ];
    var services = [
      { id: 's1', name: 'Full groom', kind: 'Groom', priceSmall: 85, priceMedium: 105, priceLarge: 130, priceGiant: 170, minsSmall: 90, minsMedium: 120, minsLarge: 150, minsGiant: 180 },
      { id: 's2', name: 'Bath and tidy', kind: 'Groom', priceSmall: 55, priceMedium: 70, priceLarge: 85, priceGiant: 110, minsSmall: 60, minsMedium: 60, minsLarge: 90, minsGiant: 120 },
      { id: 's3', name: '30-minute walk', kind: 'Walk', priceSmall: 30, priceMedium: 30, priceLarge: 35, priceGiant: 40, minsSmall: 30, minsMedium: 30, minsLarge: 30, minsGiant: 30 },
      { id: 's4', name: 'Pack walk (60 min)', kind: 'Walk', priceSmall: 35, priceMedium: 35, priceLarge: 38, priceGiant: 42, minsSmall: 60, minsMedium: 60, minsLarge: 60, minsGiant: 60 },
      { id: 's5', name: 'Drop-in visit (cat or dog)', kind: 'Sitting', priceSmall: 32, priceMedium: 32, priceLarge: 32, priceGiant: 32, minsSmall: 30, minsMedium: 30, minsLarge: 30, minsGiant: 30 }
    ];
    var staff = [
      { id: 't1', name: 'Jess Carter', role: 'Groomer', phone: '0412 555 901' },
      { id: 't2', name: 'Liam O\'Brien', role: 'Walker / sitter', phone: '0412 555 902' }
    ];
    var packages = [
      { id: 'k1', name: '10-walk pass', owner: 'o2', pet: 'p3', service: 's4', visits: 10, price: 320, bought: C.addDays(today, -21), expires: C.addMonths(today, 3) }
    ];
    var svc = function (id) { return services.filter(function (s) { return s.id === id; })[0]; };
    var pet = function (id) { return pets.filter(function (p) { return p.id === id; })[0]; };
    var B = function (id, p, s, t, day, time, status, extra) {
      var pf = priceFor(svc(s), sizeFor(pet(p).weight));
      var b = Object.assign({ id: id, pet: p, service: s, staff: t, start: d(day, time), hours: r2(pf.minutes / 60), price: pf.price, status: status, checklist: checklistFor(svc(s).kind, mk) }, extra || {});
      if (b.package) b.price = 0;
      if (status === 'Done') b.checklist.forEach(function (i) { i.done = true; });
      return b;
    };
    var bookings = [
      B('b1', 'p1', 's1', 't1', -44, '09:00', 'Done', { mood: 'Happy', report: 'Lovely teddy-bear trim. Slight matting behind the ears — brushing twice a week will help.', invoice: 'i1' }),
      B('b2', 'p4', 's2', 't1', -30, '13:00', 'Done', { mood: 'Calm', report: 'Big girl did great. Nails were long — we filed them back.', invoice: 'i2' }),
      B('b3', 'p3', 's4', 't2', -14, '08:00', 'Done', { package: 'k1', groupOk: true, mood: 'Excited', report: 'Park run with the pack. Lots of sniffing!' }),
      B('b4', 'p3', 's4', 't2', -7, '08:00', 'Done', { package: 'k1', groupOk: true, mood: 'Happy' }),
      B('b5', 'p5', 's3', 't2', -7, '10:00', 'No-show', { report: 'No one home, gate locked.' }),
      B('b6', 'p2', 's5', 't2', -3, '17:00', 'Done', { mood: 'Shy', report: 'Ate half her dinner, hid under the bed but came out for a brush.' }),
      B('b7', 'p3', 's4', 't2', 0, '08:00', 'Booked', { package: 'k1', groupOk: true }),
      B('b8', 'p5', 's4', 't2', 0, '08:00', 'Booked', { groupOk: true }),
      B('b9', 'p1', 's1', 't1', 0, '10:00', 'Booked'),
      B('b10', 'p4', 's1', 't1', 1, '09:00', 'Booked'),
      B('b11', 'p1', 's2', 't1', 1, '11:00', 'Booked', { notes: 'Owner asked to squeeze in — check timing with Bella\'s groom.' }),
      B('b12', 'p3', 's4', 't2', 7, '08:00', 'Booked', { package: 'k1', groupOk: true })
    ];
    pets.forEach(function (p) { p.lastGroom = lastGroom(p.id, bookings, services); });
    var invoices = [
      { id: 'i1', number: 'INV-0001', owner: 'o1', issued: d(-44), due: d(-37), gst: true, lines: [{ desc: 'Full groom — Biscuit (' + d(-44) + ')', qty: 1, price: 85 }], amountPaid: 85, paidOn: d(-40), status: 'Paid' },
      { id: 'i2', number: 'INV-0002', owner: 'o3', issued: d(-30), due: d(-16), gst: true, lines: [{ desc: 'Bath and tidy — Bella (' + d(-30) + ')', qty: 1, price: 110 }], amountPaid: 0, status: 'Overdue' }
    ];
    return { owners: owners, pets: pets, vaccinations: vaccinations, services: services, staff: staff, bookings: bookings, packages: packages, invoices: invoices };
  }

  var L = { SIZES: SIZES, VACCINES: VACCINES, CHECKLISTS: CHECKLISTS, sizeFor: sizeFor, age: age, vaccineDue: vaccineDue, dueOf: dueOf, latestVaccinations: latestVaccinations,
    vaxIssues: vaxIssues, replacedIds: replacedIds, priceFor: priceFor, span: span, overlaps: overlaps, clashFor: clashFor, clashes: clashes, packageUse: packageUse,
    lastGroom: lastGroom, nextGroom: nextGroom, ownerHistory: ownerHistory, invoiceTotals: invoiceTotals, invoiceStatus: invoiceStatus, unbilled: unbilled,
    invoiceLines: invoiceLines, checklistFor: checklistFor, pupdateText: pupdateText, sample: sample };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.PetLib = L;
})(this);
