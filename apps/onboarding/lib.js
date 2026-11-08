/* Employee Onboarding — pure logic: role templates, due dates, document and training tracking, progress,
   overdue tasks, sensitive-data guard, .ics and CSV output, welcome pack. No DOM. */
(function (root) {
  'use strict';

  var PHASES = [
    { id: 'before', name: 'Before day 1' }, { id: 'day1', name: 'Day 1' }, { id: 'week1', name: 'Week 1' },
    { id: 'month1', name: 'Month 1' }, { id: 'month3', name: 'Months 2–3' }
  ];
  var OWNERS = ['Manager', 'HR', 'IT', 'New starter'];

  // task: [phase, owner, offsetDays, title, key?]  (offset relative to start date; negative = before)
  var COMMON = [
    ['before', 'HR', -7, 'Send letter of offer / employment contract to sign'],
    ['before', 'HR', -5, 'Send Fair Work Information Statement (and Casual or Fixed Term statement if relevant)'],
    ['before', 'HR', -5, 'Send new-starter forms: TFN declaration, super choice, bank details, emergency contact'],
    ['before', 'Manager', -3, 'Plan the first week: who they meet, what they do, buddy assigned'],
    ['before', 'Manager', -1, 'Send welcome email: start time, where to go, who to ask for, what to bring'],
    ['day1', 'Manager', 0, 'Welcome, introductions and workplace tour (toilets, kitchen, exits, first aid, assembly point)', true],
    ['day1', 'HR', 0, 'Collect signed contract and new-starter forms (record received — don’t copy numbers into this tool)'],
    ['day1', 'Manager', 0, 'Work health and safety induction: hazards, incident reporting, emergency procedures'],
    ['day1', 'New starter', 0, 'Read and sign key policies (code of conduct, WHS, bullying and harassment, privacy)'],
    ['week1', 'Manager', 2, 'Explain the role, expectations and how performance is reviewed'],
    ['week1', 'New starter', 4, 'Complete required training modules for week 1'],
    ['week1', 'Manager', 4, 'End-of-week check-in: questions, concerns, what went well', true],
    ['month1', 'HR', 14, 'Confirm payroll set up and first pay correct; super fund details lodged'],
    ['month1', 'Manager', 28, '30-day check-in and set goals for the next 60 days', true],
    ['month3', 'Manager', 60, '60-day check-in', true],
    ['month3', 'Manager', 85, 'Probation / 90-day review — confirm employment and record outcome', true],
    ['month3', 'New starter', 88, 'Give feedback on the onboarding experience']
  ];
  var TEMPLATES = {
    office: { name: 'Office / admin', tasks: [
      ['before', 'IT', -3, 'Create email, accounts and system access (least privilege)'],
      ['before', 'IT', -2, 'Prepare laptop, phone and peripherals'],
      ['day1', 'IT', 0, 'Hand over equipment, set passwords and multi-factor sign-in'],
      ['week1', 'New starter', 3, 'Complete cyber security awareness module'],
      ['week1', 'Manager', 3, 'Workstation ergonomic set-up check']
    ], training: [['WHS induction', null], ['Cyber security awareness', 12], ['Privacy and confidentiality', 24], ['Fire warden briefing', 12]],
      equipment: ['Laptop', 'Monitor', 'Headset', 'Building access card', 'Mobile phone'] },
    warehouse: { name: 'Warehouse / logistics', tasks: [
      ['before', 'Manager', -3, 'Check licences (forklift LF/LO, MR/HR driver) and record expiry dates'],
      ['before', 'Manager', -2, 'Order PPE in the right sizes: boots, hi-vis, gloves'],
      ['day1', 'Manager', 0, 'Site-specific induction: traffic management plan, pedestrian zones, exclusion zones'],
      ['day1', 'Manager', 0, 'Manual handling training and safe lifting demonstration'],
      ['week1', 'Manager', 2, 'Supervised shifts with buddy; sign off on each piece of equipment'],
      ['week1', 'Manager', 5, 'Verification of competency (VOC) for forklift / plant'],
      ['month1', 'Manager', 21, 'Pick/pack accuracy and safety observation']
    ], training: [['WHS induction', null], ['Manual handling', 24], ['Forklift verification of competency', 12], ['Chain of responsibility', 24], ['First aid (HLTAID011)', 36], ['CPR (HLTAID009)', 12]],
      equipment: ['Steel-cap boots', 'Hi-vis vest', 'Gloves', 'Hearing protection', 'Scanner / RF gun', 'Locker key'] },
    retail: { name: 'Retail / hospitality', tasks: [
      ['before', 'Manager', -3, 'Add to the roster and send the first two weeks of shifts'],
      ['before', 'HR', -2, 'Order uniform and name badge'],
      ['day1', 'Manager', 0, 'POS / register training and cash handling procedure'],
      ['day1', 'Manager', 0, 'Opening and closing procedures; security and emergency (hold-up) procedure'],
      ['week1', 'Manager', 3, 'Product knowledge and customer service standards'],
      ['week1', 'Manager', 5, 'Handling complaints, refunds and the Australian Consumer Law basics'],
      ['month1', 'Manager', 21, 'Mystery-shop style observation and feedback']
    ], training: [['WHS induction', null], ['Responsible Service of Alcohol (RSA)', 60], ['Food safety handler', 60], ['Cash handling', null], ['Dealing with difficult customers', null]],
      equipment: ['Uniform', 'Name badge', 'POS login', 'Locker key'] },
    remote: { name: 'Remote / hybrid', tasks: [
      ['before', 'IT', -5, 'Courier laptop and equipment so it arrives before day 1'],
      ['before', 'IT', -3, 'Create accounts; send secure sign-in instructions'],
      ['before', 'Manager', -2, 'Book day-1 video welcome and the first week of meetings'],
      ['day1', 'IT', 0, 'Video call to set up multi-factor sign-in and check equipment works'],
      ['day1', 'Manager', 0, 'Team video introductions; share communication norms and working hours'],
      ['week1', 'New starter', 3, 'Complete working-from-home safety checklist (desk, chair, lighting, hazards)'],
      ['week1', 'Manager', 4, 'Agree on core hours, check-in rhythm and how to ask for help'],
      ['month1', 'Manager', 21, 'Arrange an in-person meet-up or team day if possible']
    ], training: [['WHS induction', null], ['Working from home safety', 12], ['Cyber security awareness', 12], ['Privacy and confidentiality', 24]],
      equipment: ['Laptop', 'Monitor', 'Headset', 'Webcam', 'Ergonomic chair allowance', 'Internet reimbursement set up'] },
    trade: { name: 'Trade / construction', tasks: [
      ['before', 'Manager', -5, 'Check White Card, trade licence and tickets; record expiry dates'],
      ['before', 'Manager', -3, 'Order PPE and arrange tools / vehicle'],
      ['day1', 'Manager', 0, 'Site induction; read and sign Safe Work Method Statements (SWMS)'],
      ['day1', 'Manager', 0, 'Toolbox talk; explain incident and near-miss reporting'],
      ['week1', 'Manager', 2, 'Vehicle and fuel card policy; pre-start checks'],
      ['week1', 'Manager', 4, 'Supervisor sign-off on tools and plant used'],
      ['month1', 'Manager', 20, 'Workmanship and safety observation on site']
    ], training: [['General construction induction (White Card)', null], ['WHS induction', null], ['Working at heights', 24], ['First aid (HLTAID011)', 36], ['CPR (HLTAID009)', 12], ['Asbestos awareness', 24]],
      equipment: ['Steel-cap boots', 'Hi-vis shirts', 'Hard hat', 'Safety glasses', 'Hearing protection', 'Tool kit', 'Vehicle / fuel card'] }
  };

  // Required documents — general guidance only (Australia). who: 'give' (employer gives) or 'get' (collect from starter).
  var DOCUMENTS = [
    { id: 'contract', name: 'Signed employment contract or letter of offer', who: 'get', when: 'Before day 1' },
    { id: 'fwis', name: 'Fair Work Information Statement given', who: 'give', when: 'Before or as soon as possible after starting' },
    { id: 'casual', name: 'Casual Employment Information Statement given', who: 'give', when: 'Before or as soon as possible after starting', types: ['casual'] },
    { id: 'fixed', name: 'Fixed Term Contract Information Statement given', who: 'give', when: 'Before or as soon as possible after starting', types: ['fixed-term'] },
    { id: 'tfn', name: 'TFN declaration received', who: 'get', when: 'Within the first pay period (lodge via payroll)' },
    { id: 'super', name: 'Superannuation standard choice form received (or stapled fund requested)', who: 'get', when: 'Offer within 28 days of starting' },
    { id: 'bank', name: 'Bank account details received (kept in payroll, not here)', who: 'get', when: 'Before the first pay run' },
    { id: 'emergency', name: 'Emergency contact details received', who: 'get', when: 'Day 1' },
    { id: 'policies', name: 'Policy acknowledgements signed (code of conduct, WHS, IT use, privacy)', who: 'get', when: 'Week 1' },
    { id: 'rtw', name: 'Right to work checked (citizenship, or visa via VEVO)', who: 'get', when: 'Before day 1' },
    { id: 'licences', name: 'Licences / tickets sighted and expiry recorded', who: 'get', when: 'Before day 1', roles: ['warehouse', 'trade', 'retail'] },
    { id: 'wwcc', name: 'Working with Children / police check (only if the role requires it)', who: 'get', when: 'Before day 1', optional: true }
  ];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parseISO(s) { var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3])) : null; }
  function iso(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function addDays(s, n) { var d = parseISO(s); if (!d) return ''; d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function addMonths(s, n) {
    var d = parseISO(s); if (!d) return ''; var day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
    var last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return iso(d);
  }
  function daysBetween(a, b) { var x = parseISO(a), y = parseISO(b); return x && y ? Math.round((y - x) / 864e5) : null; }
  // Weekend due dates move to the Friday before (before day 1) or Monday after (from day 1).
  function workday(s, back) { var d = parseISO(s); if (!d) return s; var w = d.getUTCDay(); if (w === 6) d.setUTCDate(d.getUTCDate() + (back ? -1 : 2)); else if (w === 0) d.setUTCDate(d.getUTCDate() + (back ? -2 : 1)); return iso(d); }
  function dueDate(start, offset) { return workday(addDays(start, offset), offset < 0); }

  var n = 0; function id(p) { n = (n + 1) % 1e6; return (p || 'x') + Date.now().toString(36) + n.toString(36) + Math.random().toString(36).slice(2, 5); }

  function templateTasks(role) {
    var t = TEMPLATES[role] || TEMPLATES.office;
    return COMMON.concat(t.tasks).map(function (x) { return { phase: x[0], owner: x[1], offset: x[2], title: x[3], key: !!x[4] }; })
      .sort(function (a, b) { return a.offset - b.offset; });
  }
  function docsFor(role, type) {
    return DOCUMENTS.filter(function (d) { return (!d.types || d.types.indexOf(type) >= 0) && (!d.roles || d.roles.indexOf(role) >= 0); })
      .map(function (d) { return { id: d.id, name: d.name, who: d.who, when: d.when, optional: !!d.optional, received: false, date: '' }; });
  }

  // Build a new person from a template. p: {name, role, start, type, position, manager, email}
  function newPerson(p) {
    var role = TEMPLATES[p.role] ? p.role : 'office', t = TEMPLATES[role];
    return {
      id: id('p'), name: p.name || 'New starter', position: p.position || '', manager: p.manager || '', type: p.type || 'full-time', role: role, start: p.start,
      probationMonths: p.probationMonths == null ? 3 : p.probationMonths, notes: '',
      tasks: templateTasks(role).map(function (x) { return { id: id('t'), phase: x.phase, owner: x.owner, offset: x.offset, title: x.title, key: x.key, due: dueDate(p.start, x.offset), done: false, doneDate: '' }; }),
      docs: docsFor(role, p.type || 'full-time'),
      training: t.training.map(function (x) { return { id: id('m'), name: x[0], validMonths: x[1], completed: '', required: true }; }),
      equipment: t.equipment.map(function (x) { return { id: id('e'), item: x, issued: false, serial: '', date: '', returned: false }; })
    };
  }
  // Recalculate due dates after the start date changes (keeps done status).
  function reschedule(person, start) {
    person.start = start;
    person.tasks.forEach(function (t) { if (typeof t.offset === 'number') t.due = dueDate(start, t.offset); });
    return person;
  }

  // ---------- training ----------
  function trainingExpiry(m) { return m.completed && m.validMonths ? addMonths(m.completed, +m.validMonths) : ''; }
  function trainingStatus(m, today, soonDays) {
    soonDays = soonDays == null ? 30 : soonDays;
    if (!m.completed) return 'not done';
    var exp = trainingExpiry(m); if (!exp) return 'complete';
    var left = daysBetween(today, exp);
    return left < 0 ? 'expired' : left <= soonDays ? 'expiring' : 'valid';
  }
  // Refresher reminders across everyone: expired or expiring within `within` days.
  function refreshers(people, today, within) {
    var out = [];
    people.forEach(function (p) {
      p.training.forEach(function (m) {
        var s = trainingStatus(m, today, within == null ? 60 : within);
        if (s === 'expired' || s === 'expiring') out.push({ person: p.name, personId: p.id, module: m.name, expiry: trainingExpiry(m), status: s, days: daysBetween(today, trainingExpiry(m)) });
      });
    });
    return out.sort(function (a, b) { return a.days - b.days; });
  }

  // ---------- progress ----------
  function progress(p, today) {
    var tasks = p.tasks, done = tasks.filter(function (t) { return t.done; }).length;
    var docsNeeded = p.docs.filter(function (d) { return !d.optional; }), docsIn = docsNeeded.filter(function (d) { return d.received; }).length;
    var tr = p.training.filter(function (m) { return m.required; }), trDone = tr.filter(function (m) { var s = trainingStatus(m, today); return s === 'complete' || s === 'valid' || s === 'expiring'; }).length;
    var overdue = tasks.filter(function (t) { return !t.done && t.due && t.due < today; });
    var total = tasks.length + docsNeeded.length + tr.length, got = done + docsIn + trDone;
    var day = daysBetween(p.start, today);
    var phase = day == null ? '' : day < 0 ? 'before' : day === 0 ? 'day1' : day < 7 ? 'week1' : day < 31 ? 'month1' : day < 92 ? 'month3' : 'done';
    return { tasksDone: done, tasks: tasks.length, docsIn: docsIn, docs: docsNeeded.length, trainingDone: trDone, training: tr.length,
      overdue: overdue.length, pct: total ? Math.round(got / total * 100) : 0, day: day, phase: phase };
  }
  function overdueTasks(people, today) {
    var out = [];
    people.forEach(function (p) { p.tasks.forEach(function (t) { if (!t.done && t.due && t.due < today) out.push({ person: p.name, personId: p.id, taskId: t.id, title: t.title, owner: t.owner, due: t.due, daysLate: daysBetween(t.due, today) }); }); });
    return out.sort(function (a, b) { return b.daysLate - a.daysLate; });
  }
  function dueSoon(people, today, days) {
    var end = addDays(today, days == null ? 7 : days), out = [];
    people.forEach(function (p) { p.tasks.forEach(function (t) { if (!t.done && t.due && t.due >= today && t.due <= end) out.push({ person: p.name, personId: p.id, taskId: t.id, title: t.title, owner: t.owner, due: t.due }); }); });
    return out.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
  }

  // ---------- sensitive data guard ----------
  function tfnValid(digits) {
    if (!/^\d{8,9}$/.test(digits)) return false;
    var w = digits.length === 9 ? [1, 4, 3, 7, 5, 8, 6, 9, 10] : [10, 7, 8, 4, 6, 3, 5, 1], s = 0;
    for (var i = 0; i < digits.length; i++) s += +digits[i] * w[i];
    return s % 11 === 0;
  }
  // Returns a list of reasons the text looks like it holds a TFN, bank details or similar. Empty = OK.
  function sensitive(text) {
    var t = String(text || ''), out = [], m, re = /(?:^|[^\d])(\d{3}[ -]?\d{3}[ -]?\d{2,3})(?!\d)/g;
    while ((m = re.exec(t))) { var d = m[1].replace(/\D/g, ''); if (tfnValid(d)) { out.push('a tax file number'); break; } }
    if (/\b(?:tfn|tax file)\b[^\n]{0,12}\d{3}/i.test(t) && out.indexOf('a tax file number') < 0) out.push('a tax file number');
    if (/\bbsb\b[^\n]{0,8}\d{3}[ -]?\d{3}/i.test(t) || /\b\d{3}-\d{3}\b[^\n]{0,20}\b\d{6,10}\b/.test(t)) out.push('bank details (BSB / account)');
    if (/\b(?:acc(?:oun)?t|a\/c)\s*(?:no|number|#)?\.?\s*:?\s*\d{6,10}\b/i.test(t)) { if (out.indexOf('bank details (BSB / account)') < 0) out.push('bank details (BSB / account)'); }
    if (/\b(?:\d{4}[ -]?){3}\d{4}\b/.test(t)) out.push('a card number');
    if (/\b(?:medicare)\b[^\n]{0,12}\d{4}/i.test(t)) out.push('a Medicare number');
    if (/\b(?:passport|licen[cs]e)\s*(?:no|number|#)\.?\s*:?\s*[A-Z]{0,2}\d{6,9}\b/i.test(t)) out.push('an ID document number');
    return out;
  }

  // ---------- exports ----------
  function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) { var out = [], i = 0; while (line.length - i > 74) { out.push((i ? ' ' : '') + line.slice(i, i + (i ? 73 : 74))); i += i ? 73 : 74; } out.push((i ? ' ' : '') + line.slice(i)); return out.join('\r\n'); }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function keyDates(p) {
    var ev = [{ date: p.start, title: p.name + ' starts' + (p.position ? ' as ' + p.position : ''), desc: 'First day. Manager: ' + (p.manager || '–') }];
    p.tasks.forEach(function (t) { if (t.key && !t.done && t.due && t.due !== p.start) ev.push({ date: t.due, title: p.name + ': ' + t.title, desc: 'Owner: ' + t.owner }); });
    if (p.probationMonths) ev.push({ date: addMonths(p.start, +p.probationMonths), title: p.name + ': end of probation (' + p.probationMonths + ' months)', desc: 'Confirm employment before this date.' });
    p.training.forEach(function (m) { var e = trainingExpiry(m); if (e) { ev.push({ date: addDays(e, -30), title: p.name + ': book ' + m.name + ' refresher', desc: m.name + ' expires ' + e }); ev.push({ date: e, title: p.name + ': ' + m.name + ' expires', desc: 'Refresher training is due.' }); } });
    return ev.filter(function (e) { return parseISO(e.date); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }
  function toICS(people, stamp) {
    var now = stamp || new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Brahaspati//Employee Onboarding//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    [].concat(people).forEach(function (p) {
      keyDates(p).forEach(function (e) {
        var d = e.date.replace(/-/g, '');
        lines.push('BEGIN:VEVENT', 'UID:' + d + '-' + hash(p.id + e.title) + '@brahaspati-onboarding', 'DTSTAMP:' + now, 'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + addDays(e.date, 1).replace(/-/g, ''),
          fold('SUMMARY:' + icsEscape(e.title)), fold('DESCRIPTION:' + icsEscape(e.desc)), 'TRANSP:TRANSPARENT',
          'BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + icsEscape(e.title)), 'TRIGGER:-P1D', 'END:VALARM', 'END:VEVENT');
      });
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }
  function phaseName(id) { var p = PHASES.filter(function (x) { return x.id === id; })[0]; return p ? p.name : id; }
  function taskRows(people, today) {
    var out = [];
    people.forEach(function (p) {
      p.tasks.forEach(function (t) { out.push({ Person: p.name, Position: p.position, Start: p.start, Phase: phaseName(t.phase), Task: t.title, Owner: t.owner, Due: t.due, Status: t.done ? 'Done' : (t.due < today ? 'Overdue' : 'To do'), Completed: t.doneDate || '' }); });
    });
    return out;
  }
  function summaryRows(people, today) {
    return people.map(function (p) {
      var g = progress(p, today);
      return { Person: p.name, Position: p.position, Template: (TEMPLATES[p.role] || {}).name, Type: p.type, Start: p.start, Manager: p.manager, 'Progress %': g.pct,
        'Tasks done': g.tasksDone + '/' + g.tasks, 'Documents in': g.docsIn + '/' + g.docs, 'Training done': g.trainingDone + '/' + g.training, 'Overdue tasks': g.overdue };
    });
  }
  function trainingRows(people, today) {
    var out = [];
    people.forEach(function (p) { p.training.forEach(function (m) { out.push({ Person: p.name, Module: m.name, Completed: m.completed, 'Valid (months)': m.validMonths || 'No expiry', Expires: trainingExpiry(m), Status: trainingStatus(m, today) }); }); });
    return out;
  }

  // Printable welcome pack for the new starter (HTML body).
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function niceDate(s) { var d = parseISO(s); if (!d) return s || ''; return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); }
  function welcomePack(p, co) {
    co = co || {}; var mine = p.tasks.filter(function (t) { return t.owner === 'New starter' || t.key; });
    var o = ['<h1>Welcome to ' + esc(co.name || 'the team') + ', ' + esc(p.name.split(' ')[0]) + '!</h1>'];
    o.push('<p>' + esc(co.welcome || 'We’re glad you’re joining us. This pack covers what to expect in your first weeks.') + '</p>');
    o.push('<h2>Your first day</h2><ul><li><b>Date:</b> ' + esc(niceDate(p.start)) + '</li>' + (co.startTime ? '<li><b>Start time:</b> ' + esc(co.startTime) + '</li>' : '') +
      (co.address ? '<li><b>Where:</b> ' + esc(co.address) + '</li>' : '') + (p.manager ? '<li><b>Ask for:</b> ' + esc(p.manager) + '</li>' : '') +
      (p.position ? '<li><b>Your role:</b> ' + esc(p.position) + '</li>' : '') + (co.bring ? '<li><b>Please bring:</b> ' + esc(co.bring) + '</li>' : '') + '</ul>');
    var get = p.docs.filter(function (d) { return d.who === 'get' && !d.received && !d.optional; });
    if (get.length) o.push('<h2>Paperwork we need from you</h2><p>Please complete these and hand them to us or your payroll system directly — don’t email bank or tax file numbers.</p><ul>' + get.map(function (d) { return '<li>' + esc(d.name.replace(/ received.*| signed.*| sighted.*| checked.*/, '')) + ' — ' + esc(d.when) + '</li>'; }).join('') + '</ul>');
    o.push('<h2>What happens when</h2>');
    PHASES.forEach(function (ph) {
      var ts = mine.filter(function (t) { return t.phase === ph.id && ph.id !== 'before'; }); if (!ts.length) return;
      o.push('<h3>' + esc(ph.name) + '</h3><ul>' + ts.map(function (t) { return '<li>' + esc(t.title) + ' <small>(' + esc(niceDate(t.due)) + ')</small></li>'; }).join('') + '</ul>');
    });
    if (p.training.length) o.push('<h2>Training you’ll complete</h2><ul>' + p.training.map(function (m) { return '<li>' + esc(m.name) + (m.validMonths ? ' <small>(refresh every ' + m.validMonths + ' months)</small>' : '') + '</li>'; }).join('') + '</ul>');
    if (p.equipment.length) o.push('<h2>Equipment you’ll receive</h2><ul>' + p.equipment.map(function (e) { return '<li>' + esc(e.item) + '</li>'; }).join('') + '</ul>');
    if (co.contacts) o.push('<h2>Useful contacts</h2><p>' + esc(co.contacts).replace(/\n/g, '<br>') + '</p>');
    o.push('<p>Any questions at all, just ask — nobody expects you to know everything in your first weeks.</p>');
    return o.join('\n');
  }

  var L = { PHASES: PHASES, OWNERS: OWNERS, TEMPLATES: TEMPLATES, DOCUMENTS: DOCUMENTS, addDays: addDays, addMonths: addMonths, daysBetween: daysBetween, dueDate: dueDate,
    templateTasks: templateTasks, docsFor: docsFor, newPerson: newPerson, reschedule: reschedule, trainingExpiry: trainingExpiry, trainingStatus: trainingStatus,
    refreshers: refreshers, progress: progress, overdueTasks: overdueTasks, dueSoon: dueSoon, tfnValid: tfnValid, sensitive: sensitive, keyDates: keyDates, toICS: toICS,
    phaseName: phaseName, taskRows: taskRows, summaryRows: summaryRows, trainingRows: trainingRows, welcomePack: welcomePack, esc: esc, niceDate: niceDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.OnboardLib = L;
})(this);
