/* Life Admin Vault — pure logic (no DOM). Browser: window.LifeAdminLib. Node: require(). */
(function (root) {
  'use strict';
  var node = typeof module !== 'undefined' && module.exports;
  var K = node ? require('../home-inventory/vault-kit.js') : root.VaultKit;

  // lead = days before expiry to start renewing. Steps are generic; rules differ by state and change over time.
  var TYPES = [
    { key: 'passport', name: 'Passport', lead: 270, expires: true, note: 'Many countries refuse entry if your passport has less than 6 months left on arrival, so renew well before travel. Australian passports can take several weeks.',
      steps: ['Check the expiry date against your travel dates (6-month rule).', 'Find the official renewal form on the Australian Passport Office website (search “renew passport Australia”).', 'Get new passport photos that meet the rules.', 'Have your old passport and identity documents ready.', 'Lodge and pay (online or at a post office); allow several weeks, longer in peak season.', 'Update the new number with airlines, visas (if linked) and travel bookings.'] },
    { key: 'visa', name: 'Visa', lead: 120, expires: true, note: 'Record the visa conditions (work limits, study, travel) — breaching conditions can have serious consequences. Check details in VEVO.',
      steps: ['Check your current visa grant and conditions in VEVO (search “VEVO check”).', 'Work out which visa you need next and the eligibility rules on the Department of Home Affairs website.', 'Collect documents (passport, police checks, health checks, evidence of work or study).', 'Lodge before your current visa ends so you can stay lawfully while it is processed (bridging visa).', 'Consider a registered migration agent for complex cases.'] },
    { key: 'licence', name: 'Driver licence', lead: 45, expires: true, note: 'Renewal rules and photo requirements differ by state or territory.',
      steps: ['Watch for a renewal notice from your state transport agency.', 'Check whether you can renew online or need a new photo/eye test.', 'Pay the fee for the length you choose.', 'Update the digital licence app if you use one.'] },
    { key: 'medicare', name: 'Medicare card', lead: 30, expires: true, note: 'Cards usually renew automatically if your address is up to date.',
      steps: ['Check your address is correct in myGov / Medicare online.', 'If the new card hasn’t arrived near the expiry, request one through myGov or the Medicare app.', 'Use the digital card in the Express Plus Medicare app meanwhile.'] },
    { key: 'health', name: 'Health insurance', lead: 30, expires: true, note: 'Premiums usually change on 1 April. Compare policies before renewing.',
      steps: ['Check what you used this year and what you actually need covered.', 'Compare policies on the government’s free comparison site (search “privatehealth.gov.au”).', 'Check waiting periods before switching.', 'Keep the lifetime health cover and tax statement for your tax return.'] },
    { key: 'rego', name: 'Car registration', lead: 30, expires: true, note: 'Some states need a safety inspection or CTP insurance first.',
      steps: ['Check if an inspection (pink slip / roadworthy) is needed.', 'Check CTP (green slip) insurance is current if your state needs it separately.', 'Pay the registration renewal online.', 'Do not drive an unregistered car — it is also uninsured.'] },
    { key: 'carins', name: 'Car insurance', lead: 30, expires: true, note: 'Renewal prices are often higher than new-customer prices — compare.',
      steps: ['Get the renewal notice and note the new premium.', 'Get two or three quotes for the same cover.', 'Ask your insurer to match or reduce, or switch.', 'Make sure new cover starts before old cover ends.'] },
    { key: 'homeins', name: 'Home & contents insurance', lead: 30, expires: true, note: 'Check the sum insured still covers rebuilding and your contents.',
      steps: ['Review the sum insured (use your home inventory for contents).', 'Check flood, storm and accidental damage cover.', 'Compare quotes and ask for a better price.', 'Make sure new cover starts before old cover ends.'] },
    { key: 'wwcc', name: 'Working with Children Check', lead: 60, expires: true, note: 'Usually valid for several years; rules differ by state.',
      steps: ['Start the renewal on your state’s screening website.', 'Complete identity checks (often at a service centre).', 'Give your employer or volunteer organisation the updated number.'] },
    { key: 'proflicence', name: 'Professional licence or registration', lead: 60, expires: true, note: 'May need continuing professional development (CPD) points.',
      steps: ['Check your CPD or training hours are complete.', 'Renew with the licensing body and pay the fee.', 'Update the certificate with your employer.'] },
    { key: 'certificate', name: 'Certificate (birth, marriage, citizenship…)', lead: 0, expires: false, note: 'These don’t expire, but record where the original is kept.',
      steps: ['Store the original somewhere safe (fireproof box or safe deposit).', 'If lost, order a new copy from the state Births, Deaths and Marriages registry or Home Affairs (citizenship).'] },
    { key: 'other', name: 'Other', lead: 30, expires: true, note: '', steps: ['Find out how to renew and how long it takes.', 'Set a reminder before the lead time.'] }
  ];
  var BY = {}; TYPES.forEach(function (t) { BY[t.key] = t; });
  function type(k) { return BY[k] || BY.other; }

  // Only keep the last 4 characters of an ID number (spaces ignored)
  function last4(s) { var c = String(s || '').replace(/[\s-]/g, ''); return c.slice(-4); }
  function masked(doc) {
    if (doc.fullNumber) return doc.fullNumber;
    return doc.last4 ? '•••• ' + doc.last4 : '';
  }

  function normaliseDoc(o) {
    o = o || {};
    var t = type(o.type);
    var d = {
      id: o.id || '', personId: o.personId || '', type: t.key, label: String(o.label || '').trim(), issuer: String(o.issuer || '').trim(),
      last4: o.last4 != null ? last4(o.last4) : '', fullNumber: '', issueDate: K.isISO(o.issueDate) ? o.issueDate : '', expiryDate: K.isISO(o.expiryDate) ? o.expiryDate : '',
      leadDays: o.leadDays === '' || o.leadDays == null || isNaN(+o.leadDays) ? t.lead : Math.max(0, Math.round(+o.leadDays)),
      conditions: String(o.conditions || ''), notes: String(o.notes || ''), location: String(o.location || ''), attachments: Array.isArray(o.attachments) ? o.attachments : []
    };
    // full number only if the user explicitly chose to keep it
    if (o.keepFull && o.number) { d.fullNumber = String(o.number).trim(); d.last4 = last4(o.number); }
    else if (o.number) d.last4 = last4(o.number);
    else if (o.fullNumber) { d.fullNumber = String(o.fullNumber); d.last4 = last4(o.fullNumber); }
    return d;
  }

  // -> {renewBy, daysToExpiry, daysToRenew, state:'none'|'expired'|'renew'|'soon'|'ok'}
  function status(doc, today) {
    if (!doc.expiryDate) return { renewBy: '', daysToExpiry: null, daysToRenew: null, state: 'none' };
    var renewBy = K.addDays(doc.expiryDate, -(doc.leadDays || 0));
    var dx = K.daysBetween(today, doc.expiryDate), dr = K.daysBetween(today, renewBy);
    var state = dx < 0 ? 'expired' : dr <= 0 ? 'renew' : dr <= 30 ? 'soon' : 'ok';
    return { renewBy: renewBy, daysToExpiry: dx, daysToRenew: dr, state: state };
  }

  // Passport check for a trip: valid for at least `months` after the return date (6 by default)
  function travelCheck(doc, departIso, returnIso, months) {
    months = months == null ? 6 : months;
    if (!doc.expiryDate) return { ok: false, msg: 'No expiry date recorded.' };
    var need = K.addMonths(returnIso || departIso, months);
    if (doc.expiryDate < departIso) return { ok: false, need: need, msg: 'Expires before you leave (' + K.niceDate(doc.expiryDate) + ').' };
    if (doc.expiryDate < need) return { ok: false, need: need, msg: 'Has less than ' + months + ' months left after the trip — many countries require it valid until at least ' + K.niceDate(need) + '. Renew first.' };
    return { ok: true, need: need, msg: 'OK — valid until ' + K.niceDate(doc.expiryDate) + ', past ' + K.niceDate(need) + '.' };
  }

  // Everything needing action within `days`: expiring, or past its renew-by date
  function upcoming(docs, today, days) {
    days = days == null ? 90 : days;
    return (docs || []).map(function (d) { return { doc: d, s: status(d, today) }; })
      .filter(function (x) { return x.s.state !== 'none' && (x.s.daysToExpiry <= days || x.s.daysToRenew <= 0); })
      .sort(function (a, b) { return a.s.daysToExpiry - b.s.daysToExpiry; });
  }

  function docTitle(doc) { return doc.label || type(doc.type).name; }
  function personName(people, id) { var p = (people || []).filter(function (x) { return x.id === id; })[0]; return p ? p.name : 'Household'; }

  function icsEvents(docs, people, today) {
    var out = [];
    (docs || []).forEach(function (d) {
      var s = status(d, today); if (s.state === 'none' || s.state === 'expired') return;
      var who = personName(people, d.personId), t = docTitle(d);
      if (d.leadDays > 0 && s.renewBy >= today) out.push({ uid: 'renew-' + d.id + '-' + s.renewBy, date: s.renewBy, alarmDays: 0, title: 'Start renewing: ' + t + ' (' + who + ')', description: t + ' expires ' + K.niceDate(d.expiryDate) + '. ' + type(d.type).note });
      out.push({ uid: 'expiry-' + d.id + '-' + d.expiryDate, date: d.expiryDate, alarmDays: 7, title: 'Expires today: ' + t + ' (' + who + ')', description: (d.last4 ? 'Number ending ' + d.last4 + '. ' : '') + (d.issuer ? 'Issuer: ' + d.issuer + '.' : '') });
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  function age(dob, today) {
    if (!K.isISO(dob)) return null;
    var a = +today.slice(0, 4) - +dob.slice(0, 4);
    if (today.slice(5) < dob.slice(5)) a--;
    return a;
  }

  // Printable one-page-per-household emergency summary. Numbers shown masked unless the user stored them in full.
  function emergencyHTML(people, docs, opts) {
    opts = opts || {}; var e = K.esc, t = opts.today || '';
    var blocks = (people || []).map(function (p) {
      var mine = (docs || []).filter(function (d) { return d.personId === p.id; });
      return '<section><h2>' + e(p.name) + (p.dob ? ' <span>born ' + e(K.niceDate(p.dob)) + (age(p.dob, t) != null ? ' (' + age(p.dob, t) + ')' : '') + '</span>' : '') + '</h2>' +
        '<table>' + [['Phone', p.phone], ['Medical notes / allergies', p.medical], ['Medicines', p.medicines], ['Doctor', p.doctor], ['Emergency contact', p.emergency], ['Blood type', p.blood]]
          .filter(function (r) { return r[1]; }).map(function (r) { return '<tr><th>' + e(r[0]) + '</th><td>' + e(r[1]) + '</td></tr>'; }).join('') + '</table>' +
        (mine.length ? '<table class="docs"><tr><th>Document</th><th>Number</th><th>Expires</th><th>Issuer / where kept</th></tr>' + mine.map(function (d) {
          return '<tr><td>' + e(docTitle(d)) + '</td><td>' + e(masked(d)) + '</td><td>' + e(K.niceDate(d.expiryDate) || '—') + '</td><td>' + e([d.issuer, d.location].filter(Boolean).join(' · ')) + '</td></tr>';
        }).join('') + '</table>' : '') + '</section>';
    }).join('');
    var household = (docs || []).filter(function (d) { return !d.personId; });
    if (household.length) blocks += '<section><h2>Household</h2><table class="docs"><tr><th>Document</th><th>Number</th><th>Expires</th><th>Issuer / where kept</th></tr>' +
      household.map(function (d) { return '<tr><td>' + e(docTitle(d)) + '</td><td>' + e(masked(d)) + '</td><td>' + e(K.niceDate(d.expiryDate) || '—') + '</td><td>' + e([d.issuer, d.location].filter(Boolean).join(' · ')) + '</td></tr>'; }).join('') + '</table></section>';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Emergency summary</title><style>body{font:13px/1.4 system-ui,sans-serif;margin:20px;color:#000;max-width:820px}h1{font-size:20px;margin:0}' +
      'h2{font-size:16px;margin:16px 0 4px;border-bottom:2px solid #000}h2 span{font-weight:400;font-size:13px}table{border-collapse:collapse;width:100%;margin:4px 0}th,td{text-align:left;padding:3px 8px 3px 0;vertical-align:top;border-bottom:1px solid #ccc}' +
      'th{color:#333}section{break-inside:avoid}.note{color:#444;font-size:12px}</style></head><body><h1>Emergency summary</h1><p class="note">Printed ' + e(K.niceDate(t)) + '. Emergency: 000. ' +
      e(opts.extra || '') + ' Keep this somewhere safe — it contains personal information. ID numbers show only the last 4 characters unless you chose to store them in full.</p>' + blocks + '</body></html>';
  }

  function sample(today) {
    var A = function (m) { return K.addMonths(today, m); };
    var people = [
      { id: 'p1', name: 'Priya Sharma', dob: '1986-04-12', phone: '0400 000 111', medical: 'Allergic to penicillin', medicines: '', doctor: 'Dr Lee, Harbour Medical (02 9000 0000)', emergency: 'Raj Sharma 0400 000 222', blood: 'O+' },
      { id: 'p2', name: 'Raj Sharma', dob: '1984-09-30', phone: '0400 000 222', medical: '', medicines: 'Ventolin (asthma)', doctor: 'Dr Lee, Harbour Medical', emergency: 'Priya Sharma 0400 000 111', blood: '' },
      { id: 'p3', name: 'Anika Sharma', dob: '2017-02-03', phone: '', medical: 'Peanut allergy — EpiPen in school bag', medicines: 'EpiPen', doctor: 'Dr Lee', emergency: 'Priya 0400 000 111', blood: '' }
    ];
    var docs = [
      { type: 'passport', personId: 'p1', label: 'Australian passport', number: 'PA1234567', issueDate: A(-114), expiryDate: A(6), issuer: 'Australian Passport Office', location: 'Home safe' },
      { type: 'passport', personId: 'p3', label: 'Australian passport (child)', number: 'PC7654321', issueDate: A(-58), expiryDate: A(2), issuer: 'Australian Passport Office', location: 'Home safe' },
      { type: 'visa', personId: 'p2', label: 'Subclass 482 visa', number: 'GRANT55512345', issueDate: A(-30), expiryDate: A(14), conditions: '8107 — must work only for the sponsoring employer. 8501 — maintain health insurance.', issuer: 'Department of Home Affairs' },
      { type: 'licence', personId: 'p1', label: 'NSW driver licence', number: '12345678', expiryDate: A(1), issuer: 'Service NSW', location: 'Wallet + digital' },
      { type: 'licence', personId: 'p2', label: 'NSW driver licence', number: '87654321', expiryDate: A(40), issuer: 'Service NSW' },
      { type: 'medicare', personId: '', label: 'Medicare card (family)', number: '2123 45678 9', expiryDate: A(3), issuer: 'Services Australia' },
      { type: 'health', personId: '', label: 'Private health — family hospital + extras', number: 'HF-889201', expiryDate: A(-1), issuer: 'Example Health Fund' },
      { type: 'rego', personId: '', label: 'Car rego — Toyota RAV4 ABC12D', number: 'ABC12D', expiryDate: K.addDays(today, 18), issuer: 'Service NSW' },
      { type: 'homeins', personId: '', label: 'Home & contents', number: 'HC-55102938', expiryDate: A(7), issuer: 'Example Insurance', location: 'Email folder “Insurance”' },
      { type: 'wwcc', personId: 'p1', label: 'Working with Children Check', number: 'WWC0012345E', expiryDate: A(30), issuer: 'Office of the Children’s Guardian' },
      { type: 'certificate', personId: 'p3', label: 'Birth certificate', number: '', issuer: 'NSW BDM', location: 'Fireproof box' }
    ].map(function (d, i) { d.id = 'sd' + i; return normaliseDoc(d); });
    return { people: people, docs: docs };
  }

  var L = { TYPES: TYPES, type: type, last4: last4, masked: masked, normaliseDoc: normaliseDoc, status: status, travelCheck: travelCheck, upcoming: upcoming,
    docTitle: docTitle, personName: personName, icsEvents: icsEvents, age: age, emergencyHTML: emergencyHTML, sample: sample };
  if (node) module.exports = L; else root.LifeAdminLib = L;
})(this);
