/* Business Continuity Planner — pure logic (no DOM).
   plan -> risk register, business impact analysis (BIA), readiness score with gaps, contact tree,
   incident checklists, testing schedule and a printable BCP/DR document (Markdown + HTML). */
(function (root) {
  'use strict';

  function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function trim(s) { return String(s == null ? '' : s).trim(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parse(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3])) : null; }
  function iso(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function addMonths(s, n) { var d = parse(s), day = d.getUTCDate(), y = d.getUTCFullYear(), m = d.getUTCMonth() + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return iso(new Date(Date.UTC(y, m, Math.min(day, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())))); }
  function monthsBetween(a, b) { var x = parse(a), y = parse(b); if (!x || !y) return null; return (y - x) / (86400000 * 30.44); }
  function hours(h) {
    h = num(h); if (h == null) return '—';
    if (h < 1) return Math.round(h * 60) + ' min';
    if (h < 48) return (Math.round(h * 10) / 10) + ' h';
    if (h < 24 * 14) return (Math.round(h / 24 * 10) / 10) + ' days';
    return (Math.round(h / 24 / 7 * 10) / 10) + ' weeks';
  }
  function splitNames(s) { return String(s || '').split(/[,;\n]+/).map(trim).filter(Boolean); }
  function mentions(text, name) { name = trim(name).toLowerCase(); return !!name && splitNames(text).some(function (x) { return x.toLowerCase() === name; }) || (!!name && name.length > 3 && String(text || '').toLowerCase().indexOf(name) >= 0); }

  // ---------- scenarios ----------
  var SCENARIOS = [
    { key: 'power', short: 'Outage', name: 'Power or internet outage', L: 3, I: 2,
      desc: 'Loss of electricity, internet or phone lines at the premises for hours to days.',
      prevent: ['Keep a mobile hotspot or a second internet connection (e.g. 4G/5G backup).', 'Put the router, modem and key computer on a small UPS (battery backup).', 'Keep cloud copies of key files so work can continue from another location.', 'Know your electricity and internet provider fault numbers and account numbers.'],
      respond: ['Check whether the outage is just your building (switchboard, safety switch) or the area (provider outage page).', 'Report the fault to the provider and note the reference number and estimated fix time.', 'Switch critical work to the mobile hotspot or move staff to a backup location or home.', 'Tell customers with bookings or deadlines today about any delay.', 'Protect stock that needs power (fridges, freezers): keep doors shut, move stock if it will be off for long.'],
      recover: ['Restart equipment in order: modem/router, server or NAS, then computers.', 'Check that card terminals, phones and cloud sync are working again.', 'Record the downtime and any lost sales or stock for insurance.'] },
    { key: 'cyber', short: 'Cyber', name: 'Cyber attack or ransomware', L: 3, I: 4,
      desc: 'Ransomware, email account takeover, invoice fraud or a hacked website or system.',
      prevent: ['Turn on multi-factor authentication (MFA) for email, banking, accounting and cloud storage.', 'Keep software and devices updated automatically.', 'Keep at least one backup that is offline or immutable (cannot be changed by ransomware).', 'Train staff to check bank-detail changes by phone on a known number.', 'Follow the ACSC Essential Eight basics (cyber.gov.au).'],
      respond: ['Disconnect affected computers from the network and Wi-Fi — do not turn them off (keeps evidence).', 'Do not pay a ransom or reply to the attacker.', 'Change passwords for email and banking from a clean device; sign out all sessions.', 'Call your bank immediately if money or bank details may be affected.', 'Report it at cyber.gov.au (ReportCyber) or call the ACSC hotline 1300 292 371.', 'Call your IT support and your cyber insurer if you have one.', 'If personal information may have been accessed, check your Notifiable Data Breaches obligations (OAIC).'],
      recover: ['Wipe and rebuild affected devices or restore from a clean backup taken before the attack.', 'Check backups are clean before restoring.', 'Review what was accessed and tell affected customers if required.', 'Fix the way the attacker got in (MFA, patches, passwords) before going back to normal.'] },
    { key: 'keyperson', short: 'Key person', name: 'Key person unavailable', L: 3, I: 3,
      desc: 'Sudden illness, injury, resignation or death of the owner or someone with knowledge no one else has.',
      prevent: ['Name a deputy for every key person and let them practise the critical tasks.', 'Write down how critical tasks are done (use the Business Process Mapper for SOPs).', 'Store passwords in a shared business password manager with emergency access.', 'Make sure more than one person can approve bank payments and payroll.', 'Consider key person insurance.'],
      respond: ['Confirm the person is safe and supported; contact their family if appropriate.', 'Activate the deputy for each of their critical activities.', 'Check what is due in the next 7 days (payroll, BAS, customer deadlines, orders).', 'Get access to the accounts and passwords they held via the emergency access process.', 'Tell staff and key customers who to contact instead.'],
      recover: ['Hand over open work properly when the person returns, or recruit/contract a replacement.', 'Update the SOPs with anything that was missing.'] },
    { key: 'supplier', short: 'Supplier', name: 'Key supplier failure', L: 2, I: 3,
      desc: 'A critical supplier, wholesaler, software provider or contractor stops supplying or goes out of business.',
      prevent: ['Have at least one alternative supplier set up (account opened, prices known) for every critical item.', 'Keep a buffer of critical stock.', 'Export your data regularly from critical cloud software.', 'Check critical suppliers\' own continuity arrangements.'],
      respond: ['Confirm how long the supply problem will last and what is affected.', 'Contact the alternative supplier and place a trial or urgent order.', 'Ration or reprioritise stock for the most important customers.', 'Tell affected customers about delays or substitutes.'],
      recover: ['Decide whether to switch suppliers permanently or split orders.', 'Update the supplier list and contact details.'] },
    { key: 'fire', short: 'Fire/flood', name: 'Fire, flood or storm damage', L: 1, I: 5,
      desc: 'The premises or equipment are damaged or cannot be entered for days or weeks.',
      prevent: ['Keep fire equipment serviced and an evacuation plan practised.', 'Check flood and bushfire risk for your address and keep stock off the floor in flood-prone areas.', 'Keep important documents and data in the cloud or offsite.', 'Check your insurance covers business interruption, not just property.', 'Know where you could work from (alternative site, home, co-working).'],
      respond: ['Evacuate and call 000. Account for everyone at the assembly point.', 'Do not re-enter until emergency services say it is safe.', 'Call your insurer early and take photos of all damage.', 'Activate the alternative site or remote work arrangements.', 'Redirect phones and update your website, Google Business Profile and social media.', 'Contact customers with jobs or bookings in the next two weeks.'],
      recover: ['Arrange cleaning, repairs and replacement equipment (keep receipts for the insurer).', 'Restore data and systems at the temporary or repaired site.', 'Check State/Territory disaster assistance for small businesses.'] },
    { key: 'pandemic', short: 'Pandemic', name: 'Pandemic or widespread illness', L: 2, I: 3,
      desc: 'Many staff off sick at once, health orders, or customers staying away for weeks.',
      prevent: ['Make sure critical work can be done remotely and staff have the equipment.', 'Cross-train staff so each critical activity has at least two people who can do it.', 'Keep cleaning supplies and a basic hygiene plan.', 'Keep a cash reserve or access to finance for a slow period.'],
      respond: ['Follow health department advice and any public health orders.', 'Ask sick staff to stay home; move others to remote work where possible.', 'Prioritise critical activities and pause the rest.', 'Talk to the bank, landlord and suppliers early about payment arrangements if revenue drops.', 'Keep customers informed about opening hours and service changes.'],
      recover: ['Bring staff back in stages and review what worked remotely.', 'Check for government support programs.'] },
    { key: 'dataloss', short: 'Data loss', name: 'Data loss or system failure', L: 3, I: 3,
      desc: 'A laptop is lost or stolen, a server or disk fails, files are deleted, or a cloud system is down.',
      prevent: ['Back up every system that holds business data, automatically, with at least one copy offsite or in the cloud (3-2-1 rule).', 'Test restoring a file from backup every quarter.', 'Encrypt laptops and phones and turn on remote wipe.', 'Know how to export data from each cloud system.'],
      respond: ['Work out what data or system is affected and when it was last backed up.', 'Stop using the failed device so nothing is overwritten.', 'If a device was stolen: report to police, remotely wipe it and change passwords used on it.', 'Switch to the manual workaround for critical activities (paper forms, phone orders).', 'Contact your IT support or the software vendor.'],
      recover: ['Restore from the most recent good backup and re-enter anything done since.', 'Check the restored data is complete before going back to normal.', 'If personal information was on a lost device, check your privacy obligations.'] }
  ];
  function scenario(key) { return SCENARIOS.filter(function (s) { return s.key === key; })[0]; }

  function emptyPlan() {
    return {
      business: { name: '', owner: '', phone: '', address: '', industry: '', version: '1.0', reviewed: '', coordinator: '' },
      activities: [], people: [], suppliers: [], systems: [],
      premises: { address: '', alternative: '', remoteWork: false, insurance: false, insurer: '', policy: '', assembly: '' },
      comms: { staff: '', customers: '', suppliers: '', website: '', social: '', spokesperson: '', statement: '' },
      risks: {}, tests: []
    };
  }
  function normalize(p) {
    var e = emptyPlan(); p = p || {};
    var arr = function (a) { return Array.isArray(a) ? a.filter(function (x) { return x && typeof x === 'object'; }) : []; };
    return {
      business: Object.assign(e.business, p.business || {}), activities: arr(p.activities), people: arr(p.people), suppliers: arr(p.suppliers), systems: arr(p.systems),
      premises: Object.assign(e.premises, p.premises || {}), comms: Object.assign(e.comms, p.comms || {}),
      risks: p.risks && typeof p.risks === 'object' ? p.risks : {}, tests: arr(p.tests)
    };
  }

  // ---------- analysis ----------
  function minRto(plan) { var r = plan.activities.map(function (a) { return num(a.rto); }).filter(function (x) { return x != null; }); return r.length ? Math.min.apply(null, r) : null; }
  function minRpo(plan) { var r = plan.activities.map(function (a) { return num(a.rpo); }).filter(function (x) { return x != null; }); return r.length ? Math.min.apply(null, r) : null; }
  function hasBackup(s) { return s.backup && s.backup !== 'none'; }

  function riskRegister(plan) {
    var p = normalize(plan), rto = minRto(p), rpo = minRpo(p);
    var noBackup = p.systems.filter(function (s) { return !hasBackup(s); }), noOffsite = p.systems.filter(function (s) { return hasBackup(s) && !s.offsite; });
    var critPeople = p.people.filter(function (x) { return x.critical; }), noDeputy = critPeople.filter(function (x) { return !trim(x.deputy); });
    var critSup = p.suppliers.filter(function (x) { return x.critical; }), noAlt = critSup.filter(function (x) { return !trim(x.alternative); });
    var remote = !!p.premises.remoteWork, altSite = !!trim(p.premises.alternative);
    return SCENARIOS.map(function (s) {
      var L = s.L, I = s.I, controls = [], gaps = [];
      if (s.key === 'power') {
        if (remote || altSite) controls.push('Staff can work from home or another site'); else { I++; gaps.push('No alternative place to work'); }
        if (rto != null && rto <= 4) { I++; gaps.push('Some activities must be back within ' + hours(rto)); }
      } else if (s.key === 'cyber') {
        if (noBackup.length) { L++; gaps.push('Not backed up: ' + noBackup.map(function (x) { return x.name; }).join(', ')); }
        if (noOffsite.length) { I++; gaps.push('Backups not offsite/cloud: ' + noOffsite.map(function (x) { return x.name; }).join(', ')); }
        if (p.systems.length && !noBackup.length) controls.push('All listed systems are backed up');
      } else if (s.key === 'keyperson') {
        if (noDeputy.length) { L++; I++; gaps.push('No deputy for: ' + noDeputy.map(function (x) { return x.name; }).join(', ')); }
        else if (critPeople.length) controls.push('Every key person has a deputy');
        if (critPeople.length === 1 && p.people.length <= 1) gaps.push('One-person business — arrange an emergency contact who can access accounts');
      } else if (s.key === 'supplier') {
        if (noAlt.length) { L++; I++; gaps.push('No alternative for: ' + noAlt.map(function (x) { return x.name; }).join(', ')); }
        else if (critSup.length) controls.push('Alternative supplier for every critical supplier');
      } else if (s.key === 'fire') {
        if (altSite || remote) { I--; controls.push(altSite ? 'Alternative site: ' + p.premises.alternative : 'Remote work possible'); } else gaps.push('No alternative premises or remote work');
        if (p.premises.insurance) controls.push('Insured' + (p.premises.insurer ? ' (' + p.premises.insurer + ')' : '')); else gaps.push('Business insurance not confirmed');
      } else if (s.key === 'pandemic') {
        if (remote) { I--; controls.push('Remote work possible'); } else gaps.push('Critical work cannot be done remotely');
        if (noDeputy.length) gaps.push('Key people without deputies');
      } else if (s.key === 'dataloss') {
        if (noBackup.length) { L++; gaps.push('Not backed up: ' + noBackup.map(function (x) { return x.name; }).join(', ')); }
        if (noOffsite.length) { L++; gaps.push('Only onsite backups: ' + noOffsite.map(function (x) { return x.name; }).join(', ')); }
        if (rpo != null && rpo <= 24) { I++; gaps.push('Some activities can lose at most ' + hours(rpo) + ' of data'); }
        var stale = p.systems.filter(function (x) { return hasBackup(x) && !x.lastTested; });
        if (stale.length) gaps.push('Restore never tested: ' + stale.map(function (x) { return x.name; }).join(', '));
        if (p.systems.length && !noBackup.length && !noOffsite.length) controls.push('Backups offsite or in the cloud');
      }
      var o = p.risks[s.key] || {};
      L = clamp(num(o.likelihood) || L, 1, 5); I = clamp(num(o.impact) || I, 1, 5);
      var score = L * I;
      return { key: s.key, name: s.name, short: s.short, likelihood: L, impact: I, score: score, rating: rating(score), controls: controls, gaps: gaps, overridden: !!(o.likelihood || o.impact), notes: o.notes || '' };
    }).sort(function (a, b) { return b.score - a.score || b.impact - a.impact; });
  }
  function rating(score) { return score <= 4 ? 'Low' : score <= 9 ? 'Medium' : score <= 15 ? 'High' : 'Extreme'; }

  function priority(rto) { rto = num(rto); return rto == null ? 'Not set' : rto <= 4 ? 'Critical' : rto <= 24 ? 'High' : rto <= 72 ? 'Medium' : 'Low'; }
  function bia(plan) {
    var p = normalize(plan);
    return p.activities.map(function (a) {
      var issues = [], rto = num(a.rto), mtpd = num(a.mtpd), rpo = num(a.rpo);
      if (rto == null) issues.push('Set a recovery time objective (RTO)');
      if (mtpd == null) issues.push('Set the maximum tolerable downtime');
      if (rto != null && mtpd != null && rto > mtpd) issues.push('RTO (' + hours(rto) + ') is longer than the business can tolerate (' + hours(mtpd) + ')');
      var deps = splitNames(a.dependsOn);
      p.systems.forEach(function (s) {
        if (!mentions(a.dependsOn, s.name)) return;
        if (!hasBackup(s)) issues.push(s.name + ' is not backed up');
        else if (rpo != null && num(s.backupEvery) != null && num(s.backupEvery) > rpo) issues.push(s.name + ' is backed up every ' + hours(s.backupEvery) + ' but this activity can only lose ' + hours(rpo));
      });
      p.people.forEach(function (x) { if (mentions(a.dependsOn, x.name) && !trim(x.deputy)) issues.push(x.name + ' has no deputy'); });
      p.suppliers.forEach(function (x) { if (mentions(a.dependsOn, x.name) && !trim(x.alternative)) issues.push('No alternative to ' + x.name); });
      return { id: a.id, name: a.name, mtpd: mtpd, rto: rto, rpo: rpo, impact: num(a.impact) || null, priority: priority(rto), dependsOn: deps, workaround: a.workaround || '', issues: issues };
    }).sort(function (x, y) { return (x.rto == null ? 1e9 : x.rto) - (y.rto == null ? 1e9 : y.rto); });
  }
  // RPO each system needs = the smallest RPO of activities that depend on it
  function systemsCheck(plan, today) {
    var p = normalize(plan);
    return p.systems.map(function (s) {
      var needs = p.activities.filter(function (a) { return mentions(a.dependsOn, s.name) && num(a.rpo) != null; }).map(function (a) { return num(a.rpo); });
      var need = needs.length ? Math.min.apply(null, needs) : null, every = num(s.backupEvery), issues = [];
      if (!hasBackup(s)) issues.push('No backup');
      else {
        if (!s.offsite) issues.push('Backup is not offsite or in the cloud');
        if (need != null && every != null && every > need) issues.push('Backup every ' + hours(every) + ' but needs ' + hours(need));
        if (!s.lastTested) issues.push('Restore never tested');
        else if (today && monthsBetween(s.lastTested, today) > 6) issues.push('Restore last tested over 6 months ago');
        if (s.backup === 'manual') issues.push('Manual backups are easy to forget — automate if possible');
      }
      return { id: s.id, name: s.name, data: s.data || '', backup: s.backup || 'none', every: every, offsite: !!s.offsite, lastTested: s.lastTested || '', owner: s.owner || '', rpoNeeded: need, issues: issues };
    });
  }

  function readiness(plan, today) {
    var p = normalize(plan), items = [];
    function frac(list, test) { return list.length ? list.filter(test).length / list.length : 0; }
    function add(key, label, weight, ok, fix) { items.push({ key: key, label: label, weight: weight, ok: Math.round(clamp(ok, 0, 1) * 100) / 100, fix: fix }); }
    var acts = p.activities, crit = p.people.filter(function (x) { return x.critical; }), critSup = p.suppliers.filter(function (x) { return x.critical; });
    add('activities', 'Critical activities listed', 10, acts.length ? 1 : 0, 'List the activities that must keep running (e.g. taking orders, payroll, service delivery).');
    add('targets', 'Recovery targets set (RTO and maximum downtime)', 6, frac(acts, function (a) { return num(a.rto) != null && num(a.mtpd) != null; }), 'Set how quickly each critical activity must be back, and the longest the business could survive without it.');
    add('targetsFit', 'Recovery targets are achievable within tolerable downtime', 4, acts.length ? frac(acts, function (a) { return !(num(a.rto) != null && num(a.mtpd) != null && num(a.rto) > num(a.mtpd)); }) : 0, 'Make each RTO shorter than the maximum tolerable downtime.');
    add('people', 'Key people and contact details recorded', 5, p.people.length ? frac(p.people, function (x) { return trim(x.phone); }) : 0, 'Add key people with a mobile number.');
    add('deputies', 'Every key person has a trained deputy', 10, crit.length ? frac(crit, function (x) { return trim(x.deputy); }) : (p.people.length ? 0.5 : 0), 'Name a deputy for each key person and let them practise the critical tasks.');
    add('suppliers', 'Critical suppliers have an alternative', 8, critSup.length ? frac(critSup, function (x) { return trim(x.alternative); }) : (p.suppliers.length ? 1 : 0), 'List key suppliers and set up an alternative for each critical one.');
    add('systems', 'Systems and data listed', 5, p.systems.length ? 1 : 0, 'List every system that holds business data (accounting, email, files, booking system).');
    add('backups', 'All systems backed up', 10, frac(p.systems, hasBackup), 'Back up every system automatically.');
    add('offsite', 'Backups kept offsite or in the cloud', 8, frac(p.systems.filter(hasBackup), function (s) { return s.offsite; }) * (p.systems.some(hasBackup) ? 1 : 0), 'Keep at least one copy away from the premises (cloud or offsite).');
    add('restoreTest', 'Backup restore tested in the last 6 months', 8, frac(p.systems.filter(hasBackup), function (s) { return s.lastTested && (!today || monthsBetween(s.lastTested, today) <= 6); }), 'Restore a file from each backup and record the date.');
    var sc = systemsCheck(p, today);
    add('rpo', 'Backups are frequent enough for each activity (RPO)', 6, sc.length ? frac(sc, function (s) { return !(s.rpoNeeded != null && s.every != null && s.every > s.rpoNeeded) && s.backup !== 'none'; }) : 0, 'Back up more often than the data each activity can afford to lose.');
    add('premises', 'Alternative site or remote work arrangements', 6, (trim(p.premises.alternative) || p.premises.remoteWork) ? 1 : 0, 'Decide where you would work if the premises could not be used.');
    add('insurance', 'Insurance (including business interruption) confirmed', 4, p.premises.insurance ? 1 : 0, 'Check your policy covers business interruption, and note the insurer and policy number.');
    add('comms', 'Ways to reach staff and customers in an emergency', 5, ((trim(p.comms.staff) ? 0.5 : 0) + (trim(p.comms.customers) ? 0.5 : 0)), 'Choose an emergency channel for staff (e.g. group text) and for customers (website, email list, social).');
    add('spokesperson', 'Spokesperson and holding statement ready', 3, (trim(p.comms.spokesperson) ? 0.5 : 0) + (trim(p.comms.statement) ? 0.5 : 0), 'Name who speaks for the business and draft a short holding statement.');
    var recentTests = p.tests.filter(function (t) { return t.date && (!today || monthsBetween(t.date, today) <= 12); });
    add('tested', 'Plan tested in the last 12 months', 6, recentTests.length ? 1 : 0, 'Run a 30-minute tabletop exercise or a contact-tree call test and log it.');
    add('reviewed', 'Plan reviewed in the last 12 months', 3, p.business.reviewed && (!today || monthsBetween(p.business.reviewed, today) <= 12) ? 1 : 0, 'Review the plan at least once a year and after any incident.');
    var total = items.reduce(function (s, i) { return s + i.weight; }, 0), got = items.reduce(function (s, i) { return s + i.weight * i.ok; }, 0);
    var score = Math.round(got / total * 100);
    var gaps = items.filter(function (i) { return i.ok < 1; }).sort(function (a, b) { return b.weight * (1 - b.ok) - a.weight * (1 - a.ok); });
    return { score: score, level: score >= 80 ? 'Good' : score >= 50 ? 'Partly ready' : 'Not ready', items: items, gaps: gaps };
  }

  // Contact tree: coordinator calls up to `fan` people; each of them calls the next ones (breadth first).
  function contactTree(plan, fan) {
    var p = normalize(plan); fan = fan || 3;
    var people = p.people.slice().sort(function (a, b) { return (b.critical ? 1 : 0) - (a.critical ? 1 : 0); });
    var coordName = trim(p.business.coordinator) || trim(p.business.owner);
    var root = people.filter(function (x) { return coordName && x.name === coordName; })[0] || (coordName ? { name: coordName, role: 'Coordinator', phone: p.business.phone } : people[0]);
    if (!root) return null;
    var rest = people.filter(function (x) { return x !== root && x.name !== root.name; });
    var node = function (x) { return { name: x.name, role: x.role || '', phone: x.phone || '', backup: x.deputy ? x.deputy + (x.deputyPhone ? ' (' + x.deputyPhone + ')' : '') : '', calls: [] }; };
    var top = node(root), queue = [top], i = 0;
    while (i < rest.length) {
      var parent = queue.shift(); if (!parent) break;
      for (var k = 0; k < (parent === top ? fan : Math.max(2, fan - 1)) && i < rest.length; k++) { var n = node(rest[i++]); parent.calls.push(n); queue.push(n); }
    }
    return { root: top, suppliers: p.suppliers.filter(function (s) { return s.critical; }).map(function (s) { return { name: s.name, phone: s.phone || '', provides: s.provides || '' }; }) };
  }
  function treeLines(tree) {
    var out = [];
    (function walk(n, depth) {
      out.push({ depth: depth, text: n.name + (n.role ? ' (' + n.role + ')' : '') + (n.phone ? ' — ' + n.phone : '') + (n.backup ? ' · if unreachable: ' + n.backup : '') });
      n.calls.forEach(function (c) { walk(c, depth + 1); });
    })(tree.root, 0);
    return out;
  }

  // Step-by-step checklist for a scenario, personalised with the plan's names
  function checklist(key, plan) {
    var p = normalize(plan), s = scenario(key); if (!s) return null;
    var coord = trim(p.business.coordinator) || trim(p.business.owner) || 'the incident coordinator';
    var first = ['Make sure everyone is safe. If anyone is in danger call 000.', coord + ' takes charge and starts an incident log (time, what happened, decisions).', 'Start the contact tree' + (trim(p.comms.staff) ? ' using ' + p.comms.staff : '') + '.'];
    var respond = s.respond.slice();
    if (key === 'dataloss' || key === 'cyber') p.systems.filter(hasBackup).forEach(function (x) { respond.push('Restore ' + x.name + ' from its ' + (x.backup === 'automatic' ? 'automatic' : 'manual') + ' backup' + (x.owner ? ' (owner: ' + x.owner + ')' : '') + '.'); });
    if (key === 'keyperson') p.people.filter(function (x) { return x.critical && trim(x.deputy); }).forEach(function (x) { respond.push('If ' + x.name + ' is out: ' + x.deputy + ' covers ' + (x.role || 'their work') + (x.deputyPhone ? ' (' + x.deputyPhone + ')' : '') + '.'); });
    if (key === 'supplier') p.suppliers.filter(function (x) { return x.critical && trim(x.alternative); }).forEach(function (x) { respond.push('If ' + x.name + ' fails: use ' + x.alternative + (x.altPhone ? ' (' + x.altPhone + ')' : '') + ' for ' + (x.provides || 'supply') + '.'); });
    if ((key === 'fire' || key === 'power') && trim(p.premises.alternative)) respond.push('Move critical work to ' + p.premises.alternative + '.');
    if (key === 'fire' && p.premises.insurance) respond.push('Insurer: ' + (p.premises.insurer || '(add insurer)') + (p.premises.policy ? ', policy ' + p.premises.policy : '') + '.');
    var crit = bia(p).filter(function (a) { return a.rto != null; }).slice(0, 5);
    var restore = crit.map(function (a) { return 'Restore "' + a.name + '" within ' + hours(a.rto) + (a.workaround ? ' — workaround meanwhile: ' + a.workaround : '') + '.'; });
    var comms = [];
    if (trim(p.comms.customers)) comms.push('Tell customers via ' + p.comms.customers + (trim(p.comms.spokesperson) ? ' (spokesperson: ' + p.comms.spokesperson + ')' : '') + '.');
    else comms.push('Tell affected customers what is happening and when you expect to be back.');
    return {
      key: key, name: s.name,
      phases: [
        { title: 'First 15 minutes', steps: first },
        { title: 'First hour — respond', steps: respond },
        { title: 'First day — keep critical activities going', steps: restore.length ? restore.concat(comms) : comms },
        { title: 'Recovery and review', steps: s.recover.concat(['Hold a short review: what worked, what did not, and update this plan.']) }
      ]
    };
  }

  function testSchedule(plan, from) {
    var p = normalize(plan), reg = riskRegister(p), out = [];
    out.push({ what: 'Contact tree call-out test', how: 'Send a test message and check everyone replies within 1 hour. Fix wrong numbers.', every: 6, next: addMonths(from, 1) });
    if (p.systems.some(hasBackup)) out.push({ what: 'Backup restore test', how: 'Restore one file or record from each backup and check it opens: ' + p.systems.filter(hasBackup).map(function (s) { return s.name; }).join(', ') + '.', every: 3, next: addMonths(from, 1) });
    reg.slice(0, 2).forEach(function (r, i) { out.push({ what: 'Tabletop exercise: ' + r.name, how: '30–45 minutes: walk through the checklist with the team as if it were happening now. Note gaps.', every: 12, next: addMonths(from, 3 + i * 3) }); });
    if (p.people.some(function (x) { return trim(x.deputy); })) out.push({ what: 'Deputy practice', how: 'Each deputy performs one critical task while the key person watches.', every: 6, next: addMonths(from, 2) });
    if (p.suppliers.some(function (x) { return x.critical; })) out.push({ what: 'Supplier check', how: 'Confirm contact details and that alternative supplier accounts still work.', every: 12, next: addMonths(from, 4) });
    out.push({ what: 'Insurance review', how: 'Check sums insured and business interruption cover still match the business.', every: 12, next: addMonths(from, 6) });
    out.push({ what: 'Full plan review', how: 'Update people, suppliers, systems and lessons from any incidents or tests.', every: 12, next: addMonths(from, 12) });
    return out;
  }

  // Recurring test reminders as an .ics (RFC 5545: CRLF, escaped text, lines folded at 75 octets)
  function icsEscape(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) {
    var out = [], cur = '', bytes = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], c = line.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < line.length) ch += line[++i];
      var b = unescape(encodeURIComponent(ch)).length;
      if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += b;
    }
    out.push(cur); return out.join('\r\n ');
  }
  function testsICS(plan, from, nowIso) {
    var stamp = (nowIso || new Date().toISOString()).replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').slice(0, 15) + 'Z';
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Brahaspati//Continuity Planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    testSchedule(plan, from).forEach(function (t, i) {
      var d = t.next.replace(/-/g, '');
      lines.push('BEGIN:VEVENT', 'UID:bcp-test-' + i + '-' + d + '@brahaspati', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d, 'RRULE:FREQ=MONTHLY;INTERVAL=' + t.every,
        'SUMMARY:' + icsEscape('Continuity test: ' + t.what), 'DESCRIPTION:' + icsEscape(t.how), 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(t.what), 'TRIGGER:-P7D', 'END:VALARM', 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  // ---------- document ----------
  function sections(plan, today) {
    var p = normalize(plan), r = readiness(p, today), reg = riskRegister(p), b = bia(p), sys = systemsCheck(p, today), tree = contactTree(p), sched = testSchedule(p, today);
    var S = [];
    S.push({ title: 'Plan overview', blocks: [
      { type: 'kv', rows: [['Business', p.business.name || '—'], ['Address', p.business.address || '—'], ['Plan owner', p.business.owner || '—'], ['Incident coordinator', p.business.coordinator || p.business.owner || '—'],
        ['Version', p.business.version || '1.0'], ['Last reviewed', p.business.reviewed || '—'], ['Readiness score', r.score + '/100 (' + r.level + ')']] },
      { type: 'p', text: 'This plan explains how the business keeps its critical activities going, and recovers, when something goes wrong. Keep a printed copy offsite and a copy in the cloud.' }] });
    S.push({ title: 'Business impact analysis', blocks: b.length ? [
      { type: 'p', text: 'RTO = how quickly the activity must be running again. Maximum downtime = the longest the business can survive without it. RPO = how much recent data it can afford to lose.' },
      { type: 'table', head: ['Priority', 'Critical activity', 'Max downtime', 'RTO', 'RPO', 'Depends on', 'Workaround', 'Issues'],
        rows: b.map(function (a) { return [a.priority, a.name, hours(a.mtpd), hours(a.rto), hours(a.rpo), a.dependsOn.join(', '), a.workaround, a.issues.join('; ')]; }) }] : [{ type: 'p', text: 'No critical activities listed yet.' }] });
    S.push({ title: 'Risk register', blocks: [
      { type: 'p', text: 'Likelihood and impact are scored 1 (low) to 5 (high). Score = likelihood × impact: 1–4 Low, 5–9 Medium, 10–15 High, 16–25 Extreme.' },
      { type: 'table', head: ['Scenario', 'Likelihood', 'Impact', 'Score', 'Rating', 'Controls in place', 'Gaps'], rows: reg.map(function (x) { return [x.name, x.likelihood, x.impact, x.score, x.rating, x.controls.join('; '), x.gaps.join('; ')]; }) }] });
    S.push({ title: 'Recovery strategies', blocks: [].concat.apply([], reg.map(function (x) { var s = scenario(x.key); return [{ type: 'h3', text: s.name + ' (' + x.rating + ')' }, { type: 'p', text: s.desc }, { type: 'list', items: s.prevent }]; })) });
    var ppl = p.people.length ? [{ type: 'table', head: ['Name', 'Role', 'Phone', 'Email', 'Key person', 'Deputy', 'Deputy phone'], rows: p.people.map(function (x) { return [x.name, x.role, x.phone, x.email, x.critical ? 'Yes' : '', x.deputy, x.deputyPhone]; }) }] : [{ type: 'p', text: 'No people listed yet.' }];
    if (tree) ppl.unshift({ type: 'tree', lines: treeLines(tree) });
    S.push({ title: 'Contact tree and key people', blocks: ppl });
    S.push({ title: 'Key suppliers', blocks: p.suppliers.length ? [{ type: 'table', head: ['Supplier', 'Provides', 'Phone', 'Critical', 'Alternative', 'Alternative phone'], rows: p.suppliers.map(function (x) { return [x.name, x.provides, x.phone, x.critical ? 'Yes' : '', x.alternative, x.altPhone]; }) }] : [{ type: 'p', text: 'No suppliers listed yet.' }] });
    S.push({ title: 'Systems, data and backups (disaster recovery)', blocks: sys.length ? [{ type: 'table', head: ['System', 'Data', 'Backup', 'Every', 'Offsite/cloud', 'Restore last tested', 'Owner', 'Issues'],
      rows: sys.map(function (s) { return [s.name, s.data, s.backup, s.every != null ? hours(s.every) : '—', s.offsite ? 'Yes' : 'No', s.lastTested || 'Never', s.owner, s.issues.join('; ')]; }) }] : [{ type: 'p', text: 'No systems listed yet.' }] });
    S.push({ title: 'Premises', blocks: [{ type: 'kv', rows: [['Address', p.premises.address || p.business.address || '—'], ['Evacuation assembly point', p.premises.assembly || '—'], ['Alternative site', p.premises.alternative || '—'], ['Remote work possible', p.premises.remoteWork ? 'Yes' : 'No'],
      ['Insurance', p.premises.insurance ? (p.premises.insurer || 'Yes') + (p.premises.policy ? ' — policy ' + p.premises.policy : '') : 'Not confirmed']] }] });
    S.push({ title: 'Communications plan', blocks: [{ type: 'kv', rows: [['Staff', p.comms.staff || '—'], ['Customers', p.comms.customers || '—'], ['Suppliers', p.comms.suppliers || '—'], ['Website', p.comms.website || '—'], ['Social media', p.comms.social || '—'], ['Spokesperson', p.comms.spokesperson || '—']] },
      { type: 'p', text: 'Holding statement: ' + (p.comms.statement || defaultStatement(p)) }] });
    S.push({ title: 'Incident response checklists', blocks: [].concat.apply([], reg.map(function (x) {
      var c = checklist(x.key, p); return [{ type: 'h3', text: c.name }].concat(c.phases.map(function (ph) { return { type: 'checks', title: ph.title, items: ph.steps }; }));
    })) });
    var log = p.tests.length ? [{ type: 'h3', text: 'Test log' }, { type: 'table', head: ['Date', 'Test', 'Result / lessons'], rows: p.tests.map(function (t) { return [t.date, t.what, t.result]; }) }] : [];
    S.push({ title: 'Testing and maintenance schedule', blocks: [{ type: 'table', head: ['Test', 'How', 'Every', 'Next due'], rows: sched.map(function (t) { return [t.what, t.how, t.every + ' months', t.next]; }) }].concat(log) });
    S.push({ title: 'Gaps to fix', blocks: r.gaps.length ? [{ type: 'checks', title: '', items: r.gaps.map(function (g) { return g.label + ' — ' + g.fix; }) }] : [{ type: 'p', text: 'No gaps found. Keep testing the plan.' }] });
    return S;
  }
  function defaultStatement(p) {
    return '"We are dealing with an unexpected disruption at ' + (p.business.name || 'our business') + '. Everyone is safe. We are working to restore normal service and will update you by [time]. For urgent matters contact ' + (p.business.phone || '[phone]') + '."';
  }
  function mdCell(s) { return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' '); }
  function planMarkdown(plan, today) {
    var p = normalize(plan), md = '# Business continuity plan — ' + (p.business.name || 'My business') + '\n\n_Generated ' + (today || '') + '. Keep a copy offsite._\n';
    sections(p, today).forEach(function (s, i) {
      md += '\n## ' + (i + 1) + '. ' + s.title + '\n\n';
      s.blocks.forEach(function (b) {
        if (b.type === 'p') md += b.text + '\n\n';
        else if (b.type === 'h3') md += '### ' + b.text + '\n\n';
        else if (b.type === 'list') md += b.items.map(function (x) { return '- ' + x; }).join('\n') + '\n\n';
        else if (b.type === 'checks') md += (b.title ? '**' + b.title + '**\n\n' : '') + b.items.map(function (x) { return '- [ ] ' + x; }).join('\n') + '\n\n';
        else if (b.type === 'kv') md += b.rows.map(function (r) { return '- **' + r[0] + ':** ' + r[1]; }).join('\n') + '\n\n';
        else if (b.type === 'tree') md += b.lines.map(function (l) { return '  '.repeat(l.depth) + '- ' + l.text; }).join('\n') + '\n\n';
        else if (b.type === 'table') md += '| ' + b.head.map(mdCell).join(' | ') + ' |\n|' + b.head.map(function () { return ' --- '; }).join('|') + '|\n' + b.rows.map(function (r) { return '| ' + r.map(mdCell).join(' | ') + ' |'; }).join('\n') + '\n\n';
      });
    });
    return md;
  }
  function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function planHtml(plan, today) {
    var p = normalize(plan), e = escHtml, title = 'Business continuity plan — ' + (p.business.name || 'My business');
    var h = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + e(title) + '</title><style>' +
      'body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d1f24;background:#fff;max-width:960px;margin:24px auto;padding:0 16px}h1{font-size:24px}h2{font-size:18px;margin:26px 0 8px;border-bottom:2px solid #b4531b;padding-bottom:3px}h3{font-size:15px;margin:16px 0 6px}' +
      'table{border-collapse:collapse;width:100%;font-size:12.5px;margin:6px 0}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f1ede4}ul.checks{list-style:none;padding-left:4px}ul.checks li:before{content:"☐ ";}' +
      'dl{display:grid;grid-template-columns:200px 1fr;gap:2px 12px;margin:6px 0}dt{font-weight:600}dd{margin:0}.tree div{padding:1px 0}.muted{color:#555;font-size:12px}' +
      '@media print{body{margin:0}h2{break-after:avoid;break-before:auto}tr,li{break-inside:avoid}}</style></head><body>';
    h += '<h1>' + e(title) + '</h1><p class="muted">Generated ' + e(today || '') + '. Keep a printed copy offsite.</p>';
    sections(p, today).forEach(function (s, i) {
      h += '<h2>' + (i + 1) + '. ' + e(s.title) + '</h2>';
      s.blocks.forEach(function (b) {
        if (b.type === 'p') h += '<p>' + e(b.text) + '</p>';
        else if (b.type === 'h3') h += '<h3>' + e(b.text) + '</h3>';
        else if (b.type === 'list') h += '<ul>' + b.items.map(function (x) { return '<li>' + e(x) + '</li>'; }).join('') + '</ul>';
        else if (b.type === 'checks') h += (b.title ? '<p><b>' + e(b.title) + '</b></p>' : '') + '<ul class="checks">' + b.items.map(function (x) { return '<li>' + e(x) + '</li>'; }).join('') + '</ul>';
        else if (b.type === 'kv') h += '<dl>' + b.rows.map(function (r) { return '<dt>' + e(r[0]) + '</dt><dd>' + e(r[1]) + '</dd>'; }).join('') + '</dl>';
        else if (b.type === 'tree') h += '<div class="tree">' + b.lines.map(function (l) { return '<div style="padding-left:' + (l.depth * 22) + 'px">' + (l.depth ? '↳ ' : '☎ ') + e(l.text) + '</div>'; }).join('') + '</div>';
        else if (b.type === 'table') h += '<table><thead><tr>' + b.head.map(function (x) { return '<th>' + e(x) + '</th>'; }).join('') + '</tr></thead><tbody>' + b.rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + e(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
      });
    });
    return h + '</body></html>';
  }

  function samplePlan(today) {
    var t = today || '2026-11-08';
    return normalize({
      business: { name: 'Coastal Physio Clinic (made-up)', owner: 'Dana Reid', phone: '0400 000 111', address: '12 Example St, Wollongong NSW', industry: 'Allied health', version: '1.0', reviewed: '', coordinator: 'Dana Reid' },
      activities: [
        { id: 'a1', name: 'Patient appointments and treatment', mtpd: 48, rto: 24, rpo: 4, impact: 5, dependsOn: 'Cliniko, Dana Reid, Sam Patel', workaround: 'Paper appointment sheet; call patients from the printed day list' },
        { id: 'a2', name: 'Taking bookings and phone calls', mtpd: 24, rto: 4, rpo: 24, impact: 4, dependsOn: 'Cliniko, Phone system, Mia Wong', workaround: 'Divert phone to mobile; take bookings on paper' },
        { id: 'a3', name: 'Billing and HICAPS claims', mtpd: 120, rto: 72, rpo: 24, impact: 3, dependsOn: 'Xero, HICAPS terminal', workaround: 'Issue invoices later; patients claim themselves' },
        { id: 'a4', name: 'Payroll', mtpd: 168, rto: 96, rpo: 168, impact: 3, dependsOn: 'Xero, Dana Reid', workaround: '' }
      ],
      people: [
        { id: 'p1', name: 'Dana Reid', role: 'Owner / principal physio', phone: '0400 000 111', email: 'dana@example.com', critical: true, deputy: 'Sam Patel', deputyPhone: '0400 000 222' },
        { id: 'p2', name: 'Sam Patel', role: 'Senior physio', phone: '0400 000 222', email: 'sam@example.com', critical: true, deputy: '', deputyPhone: '' },
        { id: 'p3', name: 'Mia Wong', role: 'Practice manager', phone: '0400 000 333', email: 'mia@example.com', critical: true, deputy: 'Leo Brown', deputyPhone: '0400 000 444' },
        { id: 'p4', name: 'Leo Brown', role: 'Receptionist (part-time)', phone: '0400 000 444', email: '', critical: false, deputy: '', deputyPhone: '' },
        { id: 'p5', name: 'Ava Nguyen', role: 'Physio', phone: '0400 000 555', email: '', critical: false, deputy: '', deputyPhone: '' }
      ],
      suppliers: [
        { id: 's1', name: 'Cliniko', provides: 'Practice management software', phone: 'support via website', critical: true, alternative: '', altPhone: '' },
        { id: 's2', name: 'MedSupply Co', provides: 'Tape, dressings, consumables', phone: '1300 000 000', critical: true, alternative: 'Local pharmacy wholesale', altPhone: '02 4200 0000' },
        { id: 's3', name: 'NBN provider', provides: 'Internet and phones', phone: '13 00 00', critical: true, alternative: '4G hotspot', altPhone: '' }
      ],
      systems: [
        { id: 'y1', name: 'Cliniko', data: 'Patient records, appointments', backup: 'automatic', backupEvery: 24, offsite: true, lastTested: '', owner: 'Mia Wong' },
        { id: 'y2', name: 'Xero', data: 'Accounts, payroll', backup: 'automatic', backupEvery: 24, offsite: true, lastTested: addMonths(t, -2), owner: 'Dana Reid' },
        { id: 'y3', name: 'Office PC shared folder', data: 'Letters, forms, reports', backup: 'manual', backupEvery: 168, offsite: false, lastTested: '', owner: 'Mia Wong' },
        { id: 'y4', name: 'Phone system', data: 'Voicemail, call diversion settings', backup: 'none', backupEvery: '', offsite: false, lastTested: '', owner: 'Mia Wong' }
      ],
      premises: { address: '12 Example St, Wollongong NSW', alternative: 'Partner clinic at 5 Sample Rd (by arrangement)', remoteWork: false, insurance: true, insurer: 'Example Insurance', policy: 'BP-000000', assembly: 'Car park across the road' },
      comms: { staff: 'WhatsApp group "Clinic team"', customers: 'SMS from Cliniko + website banner', suppliers: 'Phone', website: 'example-physio.com.au', social: 'Facebook page', spokesperson: 'Dana Reid', statement: '' },
      risks: {}, tests: [{ id: 't1', date: addMonths(t, -14), what: 'Contact tree call-out test', result: 'Two wrong numbers fixed.' }]
    });
  }

  var L = {
    SCENARIOS: SCENARIOS, scenario: scenario, emptyPlan: emptyPlan, normalize: normalize, hours: hours, rating: rating, priority: priority, addMonths: addMonths,
    riskRegister: riskRegister, bia: bia, systemsCheck: systemsCheck, readiness: readiness, contactTree: contactTree, treeLines: treeLines, checklist: checklist,
    testSchedule: testSchedule, testsICS: testsICS, icsEscape: icsEscape, sections: sections, planMarkdown: planMarkdown, planHtml: planHtml, defaultStatement: defaultStatement, samplePlan: samplePlan
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.ContinuityLib = L;
})(this);
