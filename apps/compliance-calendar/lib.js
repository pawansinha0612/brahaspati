/* Compliance Calendar — pure date rules and obligation logic (no DOM).
   Dates are ISO strings 'YYYY-MM-DD' handled in UTC so time zones never shift a day.
   Rule types (all accept optional from / until ISO dates):
     {type:'dates', dates:[{m,d,label}]}   the same month/day list every year (e.g. quarterly BAS)
     {type:'yearly', m, d, label}
     {type:'monthly', d}                   every month on day d (clamped to month end)
     {type:'every', start, months|days|businessDays, offsetBusinessDays}  repeating from an anchor date
     {type:'once', date}
   General information only — the ATO, ASIC and your accountant have the final say. */
(function (root) {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---------- date helpers ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parse(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3])) : null; }
  function iso(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function daysInMonth(y, m0) { return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate(); }
  function make(y, m1, d) { return iso(new Date(Date.UTC(y, m1 - 1, Math.min(d, daysInMonth(y, m1 - 1))))); }
  function addDays(s, n) { var d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function addMonths(s, n) {
    var d = parse(s), day = d.getUTCDate(), y = d.getUTCFullYear(), m = d.getUTCMonth() + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return iso(new Date(Date.UTC(y, m, Math.min(day, daysInMonth(y, m)))));
  }
  function weekday(s) { return parse(s).getUTCDay(); }
  function isWeekend(s) { var w = weekday(s); return w === 0 || w === 6; }
  // ATO rule of thumb: a due date on a weekend or public holiday moves to the next business day.
  // Public holidays vary by state and are not included — add them via opts.holidays (array of ISO dates).
  function shiftToBusinessDay(s, holidays) {
    var h = holidays || [], out = s, guard = 0;
    while ((isWeekend(out) || h.indexOf(out) >= 0) && guard++ < 14) out = addDays(out, 1);
    return out;
  }
  function addBusinessDays(s, n, holidays) {
    var out = s, h = holidays || [];
    while (n > 0) { out = addDays(out, 1); if (!isWeekend(out) && h.indexOf(out) < 0) n--; }
    return out;
  }
  function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function fmtDate(s) { var d = parse(s); return d ? d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : ''; }

  // ---------- rules ----------
  // Raw (unshifted) rule dates within [from, to] inclusive -> [{date, label}]
  function rawDates(rule, from, to) {
    var out = [], y0 = +from.slice(0, 4) - 1, y1 = +to.slice(0, 4) + 1, y, d;
    if (!rule) return out;
    var push = function (date, label) { if (date >= from && date <= to) out.push({ date: date, label: label || '' }); };
    if (rule.type === 'dates') {
      for (y = y0; y <= y1; y++) (rule.dates || []).forEach(function (x) { push(make(y, x.m, x.d), x.label); });
    } else if (rule.type === 'yearly') {
      for (y = y0; y <= y1; y++) push(make(y, rule.m, rule.d), rule.label);
    } else if (rule.type === 'monthly') {
      for (y = y0; y <= y1; y++) for (var m = 1; m <= 12; m++) if (!(rule.skipMonths || []).some(function (k) { return k === m; })) push(make(y, m, rule.d), rule.label);
    } else if (rule.type === 'every') {
      if (!parse(rule.start)) return out;
      var n = 0, cur = rule.start, guard = 0;
      while (cur <= to && guard++ < 5000) {
        d = rule.offsetBusinessDays ? addBusinessDays(cur, rule.offsetBusinessDays) : cur;
        push(d, rule.label);
        n++;
        if (rule.months) cur = addMonths(rule.start, rule.months * n);
        else if (rule.days) cur = addDays(rule.start, rule.days * n);
        else break;
      }
    } else if (rule.type === 'once') {
      if (parse(rule.date)) push(rule.date, rule.label);
    }
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  // Occurrences with due dates (shifted when opts.shift) whose DUE date falls in [from, to]
  function occurrences(rule, from, to, opts) {
    opts = opts || {};
    var lo = rule && rule.from && rule.from > from ? rule.from : from, hi = rule && rule.until && rule.until < to ? rule.until : to;
    if (lo > hi) return [];
    // look a few days before `from` so a Saturday date that shifts into the window is included
    return rawDates(rule, addDays(lo, -4), hi).map(function (x) {
      return { date: x.date, due: opts.shift ? shiftToBusinessDay(x.date, opts.holidays) : x.date, label: x.label };
    }).filter(function (x) { return x.due >= lo && x.due <= (opts.shift ? addDays(hi, 4) : hi) && x.date <= hi; });
  }
  function nextDue(rule, from, opts) {
    var horizon = addMonths(from, rule && rule.type === 'every' && rule.months ? Math.max(rule.months, 12) * 2 + 1 : 25);
    return occurrences(rule, from, horizon, opts)[0] || null;
  }
  function describeRule(rule) {
    if (!rule) return '';
    var lim = (rule.from ? ' from ' + fmtDate(rule.from) : '') + (rule.until ? ' until ' + fmtDate(rule.until) : '');
    if (rule.type === 'dates') return 'Every year on ' + rule.dates.map(function (x) { return x.d + ' ' + MONTHS[x.m - 1]; }).join(', ') + lim;
    if (rule.type === 'yearly') return 'Every year on ' + rule.d + ' ' + MONTHS[rule.m - 1] + lim;
    if (rule.type === 'monthly') return 'Every month on day ' + rule.d + (rule.skipMonths && rule.skipMonths.length ? ' (not in ' + rule.skipMonths.map(function (m) { return MONTHS[m - 1]; }).join(', ') + ')' : '') + lim;
    if (rule.type === 'every') {
      var step = rule.months ? (rule.months === 12 ? 'year' : rule.months === 36 ? '3 years' : rule.months + ' months') : rule.days === 7 ? 'week' : rule.days === 14 ? 'fortnight' : rule.days + ' days';
      return 'Every ' + step + ' from ' + fmtDate(rule.start) + (rule.offsetBusinessDays ? ' + ' + rule.offsetBusinessDays + ' business days' : '') + lim;
    }
    if (rule.type === 'once') return 'Once, on ' + fmtDate(rule.date);
    return '';
  }

  // ---------- Australian templates ----------
  var BAS_QUARTERLY_SELF = [{ m: 10, d: 28, label: 'Jul–Sep quarter' }, { m: 2, d: 28, label: 'Oct–Dec quarter' }, { m: 4, d: 28, label: 'Jan–Mar quarter' }, { m: 7, d: 28, label: 'Apr–Jun quarter' }];
  // Typical tax-agent lodgment program dates — they change; confirm with your agent.
  var BAS_QUARTERLY_AGENT = [{ m: 11, d: 25, label: 'Jul–Sep quarter' }, { m: 2, d: 28, label: 'Oct–Dec quarter' }, { m: 5, d: 26, label: 'Jan–Mar quarter' }, { m: 8, d: 25, label: 'Apr–Jun quarter' }];
  // Monthly: 21st of the next month, except December's which is due 21 February (so nothing on 21 January).
  var FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var BAS_MONTHLY = FULL_MONTHS.map(function (name, i) { return i === 11 ? { m: 2, d: 21, label: name } : { m: i + 2, d: 21, label: name }; });
  var SUPER_QUARTERLY = [{ m: 10, d: 28, label: 'Jul–Sep quarter' }, { m: 1, d: 28, label: 'Oct–Dec quarter' }, { m: 4, d: 28, label: 'Jan–Mar quarter' }, { m: 7, d: 28, label: 'Apr–Jun quarter' }];
  var PAYDAY_SUPER_START = '2026-07-01';
  var ATO = 'https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/reports-and-returns/due-dates-for-lodging-and-paying';

  function ob(key, title, category, rule, lead, notes, extra) {
    return Object.assign({ key: key, title: title, category: category, rule: rule, leadDays: lead, notes: notes || '', source: 'auto', link: '' }, extra || {});
  }

  function defaultProfile() {
    return {
      businessName: '', structure: 'sole', gst: true, basCycle: 'quarterly', lodger: 'self', agentBasDates: BAS_QUARTERLY_AGENT.map(function (x) { return { m: x.m, d: x.d, label: x.label }; }),
      employees: false, paygwCycle: 'quarterly', superMode: 'payday', payFrequency: 'fortnightly', firstPayday: '', paygInstalments: false,
      fbt: false, tpar: false, incomeTaxDate: '', asicReviewDate: '', businessNameRenewal: '', businessNameTerm: 3,
      workersCompRenewal: '', publicLiabilityRenewal: '', professionalIndemnityRenewal: '', shiftWeekend: true, startDate: ''
    };
  }

  // profile -> obligations (without ids). Every item is editable afterwards.
  function generate(profile) {
    var p = Object.assign(defaultProfile(), profile || {}), out = [], agent = p.lodger === 'agent';
    var basDates = agent ? (p.agentBasDates && p.agentBasDates.length ? p.agentBasDates : BAS_QUARTERLY_AGENT) : BAS_QUARTERLY_SELF;
    var agentNote = agent ? ' Dates shown are typical tax-agent lodgment program dates — confirm the exact dates with your agent.' : '';
    if (p.gst) {
      if (p.basCycle === 'monthly') out.push(ob('bas', 'BAS — lodge and pay (monthly)', 'Tax', { type: 'dates', dates: BAS_MONTHLY }, 7, 'GST' + (p.employees ? ', PAYG withholding' : '') + ' for the month. Monthly BAS is due on the 21st of the following month; December\'s is due 21 February.'));
      else if (p.basCycle === 'annual') out.push(ob('gst-annual', 'Annual GST return / BAS', 'Tax', { type: 'yearly', m: 10, d: 31, label: 'Financial year' }, 14, 'Annual GST reporting is only for businesses that chose it (turnover under $75,000). If you lodge an income tax return the annual GST return is generally due with it; otherwise 28 February. Check with the ATO.'));
      else out.push(ob('bas', 'BAS — lodge and pay (quarterly)', 'Tax', { type: 'dates', dates: basDates }, 14, 'GST' + (p.employees && p.paygwCycle !== 'monthly' ? ', PAYG withholding' : '') + (p.paygInstalments ? ', PAYG instalments' : '') + ' for the quarter.' + agentNote));
    }
    if (p.employees) {
      if (p.paygwCycle === 'monthly') out.push(ob('paygw', 'PAYG withholding — report and pay (monthly)', 'Payroll', { type: 'monthly', d: 21 }, 5, 'Medium withholders report and pay tax withheld from wages by the 21st of the next month (on the BAS or an IAS).'));
      else if (!p.gst || p.basCycle !== 'quarterly') out.push(ob('paygw', 'PAYG withholding — quarterly activity statement', 'Payroll', { type: 'dates', dates: BAS_QUARTERLY_SELF }, 14, 'Small withholders report and pay tax withheld from wages each quarter (on an activity statement).'));
      out.push(ob('stp-final', 'Single Touch Payroll — finalisation', 'Payroll', { type: 'yearly', m: 7, d: 14 }, 14, 'Make a finalisation declaration for each employee in your payroll software by 14 July. Pay runs themselves are reported through STP on or before each payday.'));
      if (p.superMode === 'quarterly') {
        out.push(ob('super', 'Super guarantee — quarterly payment', 'Payroll', { type: 'dates', dates: SUPER_QUARTERLY }, 14, 'Quarterly super due dates applied up to the April–June 2026 quarter (due 28 July 2026). From 1 July 2026 Payday Super applies — switch this to "payday" in Setup if it applies to you.'));
      } else {
        out.push(ob('super-q-last', 'Super guarantee — last quarterly payment (Apr–Jun 2026)', 'Payroll', { type: 'once', date: '2026-07-28', label: 'Apr–Jun 2026 quarter' }, 14, 'The last quarter paid under the old quarterly rules.'));
        if (p.firstPayday) {
          var days = p.payFrequency === 'weekly' ? 7 : p.payFrequency === 'monthly' ? 0 : 14;
          var rule = days ? { type: 'every', start: p.firstPayday, days: days, offsetBusinessDays: 7, from: PAYDAY_SUPER_START } : { type: 'every', start: p.firstPayday, months: 1, offsetBusinessDays: 7, from: PAYDAY_SUPER_START };
          out.push(ob('super-payday', 'Payday Super — super must reach the fund', 'Payroll', rule, 2, 'From 1 July 2026, employers must pay super with each pay so it reaches the employee\'s fund within 7 business days of payday (general information — check the ATO\'s Payday Super guidance and your clearing house timing). Dates here are payday + 7 business days, weekends skipped but not public holidays.'));
        } else {
          out.push(ob('super-payday', 'Payday Super — set your pay dates', 'Payroll', { type: 'once', date: PAYDAY_SUPER_START }, 0, 'From 1 July 2026 super is due within 7 business days of each payday. Add your first payday in Setup to get a reminder for every pay run.'));
        }
      }
      out.push(ob('workers-comp', 'Workers compensation insurance — renewal', 'Insurance', p.workersCompRenewal ? { type: 'every', start: p.workersCompRenewal, months: 12 } : { type: 'yearly', m: 6, d: 30 }, 30, 'Required in every state when you employ staff. Renewal and wage declaration dates depend on your state scheme and insurer — set the date on your policy.'));
    }
    if (p.paygInstalments && !(p.gst && p.basCycle === 'quarterly')) out.push(ob('payg-i', 'PAYG instalments (if the ATO has asked you to pay them)', 'Tax', { type: 'dates', dates: BAS_QUARTERLY_SELF }, 14, 'Quarterly instalments towards your income tax.'));
    // income tax return
    var itr;
    if (agent) itr = p.incomeTaxDate ? { type: 'yearly', m: +p.incomeTaxDate.slice(5, 7), d: +p.incomeTaxDate.slice(8, 10) } : { type: 'yearly', m: 5, d: 15 };
    else if (p.structure === 'company') itr = { type: 'yearly', m: 2, d: 28 };
    else itr = { type: 'yearly', m: 10, d: 31 };
    var who = { sole: 'Individual tax return (with business schedule)', company: 'Company tax return', trust: 'Trust tax return', partnership: 'Partnership tax return' }[p.structure] || 'Income tax return';
    out.push(ob('itr', who, 'Tax', itr, 30, agent ? 'Lodging through a registered tax agent usually gives a later date under their lodgment program, as long as you are on their client list before 31 October. Set the date your agent gives you.' :
      (p.structure === 'company' ? 'Self-lodging companies are generally due 28 February, but 31 October applies if a prior-year return is outstanding.' : 'Self-lodgers are generally due 31 October.') + ' Check the ATO due-date tool.'));
    if (p.structure === 'trust') out.push(ob('trust-res', 'Trustee distribution resolution', 'Tax', { type: 'yearly', m: 6, d: 30 }, 30, 'Trustees generally need to decide (and record) how income is distributed by 30 June. Talk to your accountant before the end of June.'));
    if (p.fbt) out.push(ob('fbt', 'Fringe benefits tax return', 'Tax', agent ? { type: 'yearly', m: 6, d: 25 } : { type: 'yearly', m: 5, d: 21 }, 21, 'The FBT year runs 1 April – 31 March. Self-lodgers: return and payment due 21 May. Tax agents lodging electronically: usually 25 June (payment still 28 May).'));
    if (p.tpar) out.push(ob('tpar', 'Taxable payments annual report (TPAR)', 'Tax', { type: 'yearly', m: 8, d: 28 }, 21, 'For businesses in building and construction, cleaning, courier and road freight, IT, and security/investigation/surveillance services that pay contractors.'));
    if (p.structure === 'company') {
      if (p.asicReviewDate) {
        out.push(ob('asic-review', 'ASIC annual review — check company details', 'ASIC', { type: 'every', start: p.asicReviewDate, months: 12 }, 14, 'ASIC sends an annual statement on your review date. Check the details and fix any errors within 28 days. Keep the solvency resolution on file.'));
        out.push(ob('asic-fee', 'ASIC annual review fee — pay', 'ASIC', { type: 'every', start: addMonths(p.asicReviewDate, 2), months: 12 }, 14, 'The annual review fee is due within two months of your review date (late fees apply).'));
      } else {
        out.push(ob('asic-review', 'ASIC annual review — add your review date', 'ASIC', { type: 'once', date: p.startDate || '' }, 0, 'Your review date is usually the anniversary of company registration. Add it in Setup.'));
      }
    }
    if (p.businessNameRenewal) out.push(ob('bn', 'Business name renewal (ASIC)', 'ASIC', { type: 'every', start: p.businessNameRenewal, months: (+p.businessNameTerm === 1 ? 12 : 36) }, 30, 'Business names are registered for 1 or 3 years. Renew before the expiry date or the name can be cancelled.'));
    if (p.publicLiabilityRenewal) out.push(ob('pl', 'Public liability insurance — renewal', 'Insurance', { type: 'every', start: p.publicLiabilityRenewal, months: 12 }, 30, 'Check the cover amount still suits your contracts and premises lease.'));
    if (p.professionalIndemnityRenewal) out.push(ob('pi', 'Professional indemnity insurance — renewal', 'Insurance', { type: 'every', start: p.professionalIndemnityRenewal, months: 12 }, 30, 'PI is often a condition of client contracts or professional membership.'));
    out.forEach(function (o) { o.link = /Tax|Payroll/.test(o.category) ? ATO : /ASIC/.test(o.category) ? 'https://asic.gov.au/' : ''; });
    return out;
  }
  // Suggestions for custom items people often forget
  var CUSTOM_IDEAS = [
    { title: 'Business licence / permit renewal', category: 'Licences', months: 12 },
    { title: 'Food business licence / food safety supervisor certificate', category: 'Licences', months: 12 },
    { title: 'Lease option — notice to renew deadline', category: 'Premises', months: 0 },
    { title: 'WHS risk assessment review', category: 'WHS', months: 12 },
    { title: 'Fire equipment inspection (tagging)', category: 'WHS', months: 6 },
    { title: 'Electrical test and tag', category: 'WHS', months: 12 },
    { title: 'First aid certificate renewal', category: 'WHS', months: 36 },
    { title: 'Vehicle registration', category: 'Vehicles', months: 12 },
    { title: 'Domain name renewal', category: 'Other', months: 12 },
    { title: 'Privacy policy review', category: 'Other', months: 12 }
  ];

  // ---------- status ----------
  function recKey(id, date) { return id + '|' + date; }
  // Every occurrence in [from, to] across obligations, with status
  function items(obligations, records, today, opts) {
    opts = opts || {};
    var from = opts.from || addMonths(today, -12), to = opts.to || addMonths(today, 12), start = opts.startDate || '', out = [];
    (obligations || []).forEach(function (o) {
      if (o.enabled === false) return;
      occurrences(o.rule, from, to, { shift: o.shift != null ? o.shift : opts.shift, holidays: opts.holidays }).forEach(function (x) {
        var r = (records || {})[recKey(o.id, x.date)] || {}, lead = o.leadDays == null ? 14 : +o.leadDays, remind = addDays(x.due, -lead), status;
        if (r.done) status = 'done';
        else if (x.due < today) status = start && x.due < start ? 'before-start' : 'overdue';
        else if (today >= remind) status = 'due-soon';
        else status = 'upcoming';
        out.push({ id: o.id, key: recKey(o.id, x.date), title: o.title, category: o.category, date: x.date, due: x.due, shifted: x.due !== x.date, label: x.label, remind: remind,
          status: status, done: !!r.done, doneOn: r.doneOn || '', evidence: r.evidence || '', attachment: r.attachment || '', daysLeft: diffDays(today, x.due), notes: o.notes });
      });
    });
    return out.filter(function (x) { return x.status !== 'before-start'; }).sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : a.title < b.title ? -1 : 1; });
  }
  function summary(list) {
    var s = { overdue: 0, dueSoon: 0, upcoming: 0, done: 0 };
    list.forEach(function (x) { if (x.status === 'overdue') s.overdue++; else if (x.status === 'due-soon') s.dueSoon++; else if (x.status === 'done') s.done++; else s.upcoming++; });
    return s;
  }
  // For each obligation: next not-done due date on/after today (or the oldest overdue one)
  function nextFor(o, records, today, opts) {
    var list = items([o], records, today, Object.assign({}, opts, { from: addMonths(today, -12), to: addMonths(today, 40) }));
    return list.filter(function (x) { return x.status === 'overdue'; })[0] || list.filter(function (x) { return !x.done && x.due >= today; })[0] || null;
  }
  // Month grid: weeks (Mon-first) of {date, inMonth, items[]}
  function monthGrid(year, month1, list) {
    var first = make(year, month1, 1), dow = (weekday(first) + 6) % 7, start = addDays(first, -dow), weeks = [];
    for (var w = 0; w < 6; w++) {
      var week = [];
      for (var d = 0; d < 7; d++) {
        var day = addDays(start, w * 7 + d);
        week.push({ date: day, inMonth: +day.slice(5, 7) === month1, items: list.filter(function (x) { return x.due === day; }) });
      }
      if (w >= 4 && !week.some(function (x) { return x.inMonth; })) break;
      weeks.push(week);
    }
    return weeks;
  }

  // ---------- exports ----------
  function icsEscape(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) {
    // fold at 75 octets (approximate by UTF-16 units, never splitting a surrogate pair)
    var out = [], cur = '', bytes = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], code = line.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < line.length) { ch += line[++i]; }
      var b = unescape(encodeURIComponent(ch)).length;
      if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  function toICS(list, opts) {
    opts = opts || {};
    var stamp = (opts.now || new Date().toISOString()).replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').slice(0, 15) + 'Z';
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Brahaspati//Compliance Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsEscape(opts.name || 'Compliance calendar')];
    list.forEach(function (x) {
      var d = x.due.replace(/-/g, ''), end = addDays(x.due, 1).replace(/-/g, ''), lead = Math.max(0, diffDays(x.remind, x.due));
      lines.push('BEGIN:VEVENT', 'UID:' + icsEscape(x.key.replace(/[^A-Za-z0-9|-]/g, '') + '@brahaspati-compliance'), 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + end,
        'SUMMARY:' + icsEscape('Due: ' + x.title + (x.label ? ' (' + x.label + ')' : '')),
        'DESCRIPTION:' + icsEscape((x.notes || '') + (x.shifted ? '\nMoved from ' + x.date + ' (weekend).' : '') + '\nGeneral information only — check with the ATO/ASIC or your accountant.'),
        'CATEGORIES:' + icsEscape(x.category || 'Compliance'), 'TRANSP:TRANSPARENT');
      if (lead > 0) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape('Coming up: ' + x.title), 'TRIGGER:-P' + lead + 'D', 'END:VALARM');
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape('Due today: ' + x.title), 'TRIGGER:PT9H', 'END:VALARM');
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }
  function toCSVRows(list) {
    return list.map(function (x) {
      return { Obligation: x.title, Period: x.label, Category: x.category, 'Due date': x.due, 'Original date': x.date, 'Remind from': x.remind, Status: x.status, 'Done on': x.doneOn, Evidence: x.evidence, Attachment: x.attachment };
    });
  }
  // Financial year (Jul–Jun) containing a date -> {from, to, label}
  function financialYear(s) { var y = +s.slice(0, 4), m = +s.slice(5, 7), start = m >= 7 ? y : y - 1; return { from: start + '-07-01', to: (start + 1) + '-06-30', label: 'FY' + start + '–' + String(start + 1).slice(2) }; }
  function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function planHtml(list, opts) {
    opts = opts || {};
    var e = escHtml, groups = {}, order = [];
    list.forEach(function (x) { var k = x.due.slice(0, 7); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(x); });
    var h = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + e(opts.title || 'Annual compliance plan') + '</title><style>' +
      'body{font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d1f24;background:#fff;max-width:900px;margin:24px auto;padding:0 16px}h1{font-size:24px;margin:0}h2{font-size:16px;margin:20px 0 6px;border-bottom:1px solid #ccc}' +
      'table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f1ede4}.box{width:16px}.note{font-size:12px;color:#555}' +
      '@media print{body{margin:0}h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body>';
    h += '<h1>' + e(opts.title || 'Annual compliance plan') + '</h1><p class="note">' + e(opts.subtitle || '') + '</p>';
    h += '<p class="note">General information only. Due dates are based on common ATO/ASIC rules and the details you entered; they can change and may differ for your situation. Check with the ATO, ASIC, your insurer or your accountant.</p>';
    if (!order.length) h += '<p>No obligations in this period.</p>';
    order.forEach(function (k) {
      h += '<h2>' + MONTHS[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4) + '</h2><table><thead><tr><th class="box">✓</th><th>Due</th><th>Obligation</th><th>Period</th><th>Category</th><th>Evidence / notes</th></tr></thead><tbody>' +
        groups[k].map(function (x) { return '<tr><td>' + (x.done ? '☑' : '☐') + '</td><td>' + e(fmtDate(x.due)) + (x.shifted ? '*' : '') + '</td><td>' + e(x.title) + '</td><td>' + e(x.label) + '</td><td>' + e(x.category) + '</td><td>' + e([x.evidence, x.attachment].filter(Boolean).join(' · ')) + '</td></tr>'; }).join('') + '</tbody></table>';
    });
    if (list.some(function (x) { return x.shifted; })) h += '<p class="note">* moved to the next business day because the date falls on a weekend.</p>';
    return h + '</body></html>';
  }

  // ---------- rule editing ----------
  // "28 Oct, 28 Feb, 28/4, 28 July" -> [{m,d}]; invalid parts are reported
  function parseDayMonthList(text) {
    var out = [], bad = [];
    String(text || '').split(/[,;\n]+/).map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (part) {
      var m = part.match(/^(\d{1,2})\s*(?:\/|-|\s)\s*([A-Za-z]{3,}|\d{1,2})$/), mon;
      if (m) {
        mon = /^\d+$/.test(m[2]) ? +m[2] : MONTHS.map(function (x) { return x.toLowerCase(); }).indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
        if (mon >= 1 && mon <= 12 && +m[1] >= 1 && +m[1] <= 31) { out.push({ m: mon, d: +m[1] }); return; }
      }
      bad.push(part);
    });
    return { dates: out, bad: bad };
  }
  // rule <-> flat form fields {kind, date, n, unit, day, list}
  function ruleToForm(rule) {
    rule = rule || {};
    var f = { kind: rule.type || 'yearly', date: '', n: 12, unit: 'months', day: 28, list: '', offset: rule.offsetBusinessDays || 0, from: rule.from || '', until: rule.until || '' };
    if (rule.type === 'yearly') { f.date = make(2027, rule.m, rule.d); }
    else if (rule.type === 'dates') f.list = (rule.dates || []).map(function (x) { return x.d + ' ' + MONTHS[x.m - 1]; }).join(', ');
    else if (rule.type === 'monthly') f.day = rule.d;
    else if (rule.type === 'every') { f.date = rule.start; if (rule.months) { f.n = rule.months; f.unit = 'months'; } else { f.n = rule.days; f.unit = 'days'; } }
    else if (rule.type === 'once') f.date = rule.date || '';
    return f;
  }
  function formToRule(f, prev) {
    var r, keepLabels = prev && prev.type === 'dates' ? prev.dates : [];
    if (f.kind === 'yearly') { var d = parse(f.date); if (!d) return { error: 'Choose a date' }; r = { type: 'yearly', m: d.getUTCMonth() + 1, d: d.getUTCDate() }; }
    else if (f.kind === 'dates') {
      var p = parseDayMonthList(f.list); if (p.bad.length) return { error: 'Could not read: ' + p.bad.join(', ') + ' (use e.g. 28 Oct)' }; if (!p.dates.length) return { error: 'Add at least one date like 28 Oct' };
      r = { type: 'dates', dates: p.dates.map(function (x) { var old = keepLabels.filter(function (k) { return k.m === x.m && k.d === x.d; })[0]; return old && old.label ? { m: x.m, d: x.d, label: old.label } : x; }) };
    } else if (f.kind === 'monthly') { var day = +f.day; if (!(day >= 1 && day <= 31)) return { error: 'Day must be 1–31' }; r = { type: 'monthly', d: day }; }
    else if (f.kind === 'every') {
      if (!parse(f.date)) return { error: 'Choose the first due date' }; var n = Math.round(+f.n); if (!(n >= 1)) return { error: 'Repeat every 1 or more' };
      r = { type: 'every', start: f.date }; if (f.unit === 'days') r.days = n; else r.months = n;
      if (+f.offset) r.offsetBusinessDays = Math.round(+f.offset);
    } else if (f.kind === 'once') { if (!parse(f.date)) return { error: 'Choose a date' }; r = { type: 'once', date: f.date }; }
    else return { error: 'Unknown repeat type' };
    if (f.from && parse(f.from)) r.from = f.from;
    if (f.until && parse(f.until)) r.until = f.until;
    return { rule: r };
  }

  // ---------- data ----------
  function normalize(d) {
    d = d || {};
    return { profile: Object.assign(defaultProfile(), d.profile || {}), obligations: Array.isArray(d.obligations) ? d.obligations : [], records: d.records && typeof d.records === 'object' ? d.records : {}, setupDone: !!d.setupDone };
  }

  var L = {
    MONTHS: MONTHS, parse: parse, iso: iso, make: make, addDays: addDays, addMonths: addMonths, isWeekend: isWeekend, shiftToBusinessDay: shiftToBusinessDay,
    addBusinessDays: addBusinessDays, diffDays: diffDays, fmtDate: fmtDate, rawDates: rawDates, occurrences: occurrences, nextDue: nextDue, describeRule: describeRule,
    BAS_QUARTERLY_SELF: BAS_QUARTERLY_SELF, BAS_QUARTERLY_AGENT: BAS_QUARTERLY_AGENT, BAS_MONTHLY: BAS_MONTHLY, SUPER_QUARTERLY: SUPER_QUARTERLY, PAYDAY_SUPER_START: PAYDAY_SUPER_START,
    defaultProfile: defaultProfile, generate: generate, CUSTOM_IDEAS: CUSTOM_IDEAS, recKey: recKey, items: items, summary: summary, nextFor: nextFor, monthGrid: monthGrid,
    icsEscape: icsEscape, fold: fold, toICS: toICS, toCSVRows: toCSVRows, financialYear: financialYear, planHtml: planHtml, parseDayMonthList: parseDayMonthList, ruleToForm: ruleToForm, formToRule: formToRule, normalize: normalize
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.ComplianceLib = L;
})(this);
