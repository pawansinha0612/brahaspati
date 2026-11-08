/* Cleaning Business OS — ProductForge config plus roster, auto-allocation and payroll hours. */
(function () {
  'use strict';
  var L = window.CleaningLib, C = window.ForgeCore, B = window.B, esc = C.esc;
  var siteName = function (api, id) { return api.title('sites', id); };
  var cleanerName = function (api, id) { return api.title('cleaners', id); };
  var jobTitle = function (r, api) { return (api ? siteName(api, r.site) : '') || 'Clean'; };

  Forge.app({
    id: 'cleaning-os', name: 'Cleaning OS', mount: '#app', quickAdd: ['jobs'],
    entities: {
      jobs: {
        label: 'Jobs', single: 'Job', board: 'status', calendar: ['start'], durationField: 'hours', recurring: 'start', recurringReset: { status: 'Scheduled' },
        recurringClear: ['arrived', 'finished', 'actualHours', 'signedBy', 'signedOn', 'notes'], sort: { key: 'start', dir: 'desc' },
        title: function (r, api) { return siteName(api, r.site) + ' · ' + String(r.start || '').replace('T', ' '); },
        list: ['start', 'site', 'cleaner', 'hours', 'status'], cardFields: ['site', 'start', 'cleaner'],
        fields: [
          { key: 'site', label: 'Site', type: 'link', entity: 'sites', required: true, filter: true },
          { key: 'start', label: 'Start', type: 'datetime', required: true },
          { key: 'hours', label: 'Booked hours', type: 'number', min: 0.25, max: 16, required: true, default: 2 },
          { key: 'cleaner', label: 'Cleaner', type: 'link', entity: 'cleaners', filter: true, help: 'Leave empty and use Roster → Auto-allocate to fill it.' },
          { key: 'status', label: 'Status', type: 'select', required: true, options: ['Scheduled', 'In progress', { value: 'Done', label: 'Done', tone: 'ok' }, { value: 'Missed', label: 'Missed', tone: 'bad' }, 'Cancelled'] },
          { key: 'checklist', label: 'Checklist', type: 'checklist', groupLabel: 'Area' },
          { key: 'arrived', label: 'Arrived at', type: 'time' },
          { key: 'finished', label: 'Finished at', type: 'time' },
          { key: 'actualHours', label: 'Hours worked (if different)', type: 'number', min: 0, max: 16 },
          { key: 'photos', label: 'Photos', type: 'photos' },
          { key: 'notes', label: 'Notes / issues', type: 'longtext' },
          { key: 'signedBy', label: 'Client name', type: 'text' },
          { key: 'signature', label: 'Client sign-off', type: 'signature', dateField: 'signedOn' },
          { key: 'signedOn', label: 'Signed on', type: 'date' }
        ],
        onNew: function (r, api) { var s = api.get('sites', r.site); if (s && !(r.checklist || []).length) r.checklist = L.freshChecklist(s.checklist); },
        onLinkChange: function (r, key, api) { if (key === 'site' && !(r.checklist || []).some(function (i) { return i.done; })) { var s = api.get('sites', r.site); r.checklist = s ? L.freshChecklist(s.checklist) : []; } },
        validate: function (r) {
          var a = r.arrived, f = r.finished; return a && f && f <= a ? { finished: 'Finished time is before the arrival time' } : {};
        },
        beforeSave: function (r) { if (r.status === 'Scheduled' && r.arrived) r.status = r.finished ? 'Done' : 'In progress'; },
        actions: [
          { label: 'Complete job', when: function (j) { return j.status === 'Scheduled' || j.status === 'In progress'; }, run: function (j, api) {
            var now = new Date(), t = (now.getHours() < 10 ? '0' : '') + now.getHours() + ':' + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes();
            api.edit('jobs', j, { status: 'Done', arrived: j.arrived || C.timeOf(j.start), finished: j.finished || t });
          } },
          { label: 'Mark missed', when: function (j) { return j.status === 'Scheduled'; }, run: function (j, api) { api.save('jobs', Object.assign({}, j, { status: 'Missed' })); api.toast('Marked as missed'); } }
        ],
        detailExtra: function (el, j, api) {
          var f = L.jobFlag(j, api.today()), late = L.lateMinutes(j), s = api.get('sites', j.site);
          el.innerHTML = '<p class="small">' + (f === 'late' ? '<span class="pill-warn">Arrived ' + late + ' min late</span> ' : f === 'missed' ? '<span class="pill-bad">Missed</span> ' : f === 'overdue' ? '<span class="pill-bad">Past its date and not marked done</span> ' : '') +
            (j.status === 'Done' ? 'Hours worked: <b>' + L.workedHours(j) + '</b>' : '') + (s && s.access ? '<br>Access: ' + esc(s.access) : '') + '</p>';
        }
      },
      sites: {
        label: 'Sites', single: 'Site', title: 'name', list: ['name', 'client', 'type', 'address'],
        fields: [
          { key: 'name', label: 'Site name', type: 'text', required: true },
          { key: 'client', label: 'Client', type: 'text' },
          { key: 'type', label: 'Site type', type: 'select', required: true, options: Object.keys(L.TEMPLATES), help: 'Sets the starting checklist. Change the checklist below to suit this site.' },
          { key: 'address', label: 'Address', type: 'text' },
          { key: 'phone', label: 'Contact phone', type: 'phone' },
          { key: 'email', label: 'Contact email', type: 'email' },
          { key: 'access', label: 'Access notes (keys, alarm, pets)', type: 'longtext' },
          { key: 'checklist', label: 'Site checklist (copied into every job)', type: 'checklist', groupLabel: 'Area', itemNotes: false }
        ],
        onNew: function (r) { r.checklist = L.checklistFor(r.type); },
        actions: [
          { label: 'Reset checklist to template', run: function (s, api) { if (confirm('Replace this site\'s checklist with the ' + s.type + ' template?')) api.save('sites', Object.assign({}, s, { checklist: L.checklistFor(s.type) })); } },
          { label: 'Book a clean', run: function (s, api) { api.edit('jobs', null, { site: s.id, checklist: L.freshChecklist(s.checklist), start: C.addDays(api.today(), 1) + 'T09:00' }); } }
        ]
      },
      cleaners: {
        label: 'Cleaners', single: 'Cleaner', title: 'name', list: ['name', 'phone', 'days', 'maxHours', 'active'],
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'phone', label: 'Phone', type: 'phone' },
          { key: 'email', label: 'Email', type: 'email' },
          { key: 'days', label: 'Days available', type: 'multiselect', options: C.WEEKDAYS, default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
          { key: 'from', label: 'Available from', type: 'time' },
          { key: 'to', label: 'Available until', type: 'time' },
          { key: 'maxHours', label: 'Max hours per week', type: 'number', min: 0, max: 80, default: 38 },
          { key: 'rate', label: 'Hourly pay rate', type: 'money', min: 0 },
          { key: 'active', label: 'Active', type: 'checkbox', default: true }
        ]
      }
    },
    reminders: [
      { entity: 'jobs', date: 'start', warnDays: 1, pastDays: 7, label: function (j) { return j.cleaner ? 'Clean booked' : 'Clean booked — no cleaner yet'; }, ruleText: 'Jobs today and tomorrow, and past jobs not yet marked done (last 7 days)', when: function (j) { return j.status === 'Scheduled' || j.status === 'In progress'; } }
    ],
    dashboard: {
      tiles: [
        { label: 'Jobs today', value: function (api) { var t = api.today(); return api.list('jobs').filter(function (j) { return C.dayOf(j.start) === t && j.status !== 'Cancelled'; }).length; } },
        { label: 'Unassigned this week', value: function (api) { var w = C.weekOf(api.today()); return api.list('jobs').filter(function (j) { var d = C.dayOf(j.start); return !j.cleaner && j.status === 'Scheduled' && d >= w[0] && d <= w[6]; }).length; }, tone: function (v) { return v ? 'warn' : ''; } },
        { label: 'Missed (30 days)', value: function (api) { var f = C.addDays(api.today(), -30); return api.list('jobs').filter(function (j) { return j.status === 'Missed' && C.dayOf(j.start) >= f; }).length; }, tone: function (v) { return v ? 'bad' : ''; } },
        { label: 'Late arrivals (30 days)', value: function (api) { var f = C.addDays(api.today(), -30); return api.list('jobs').filter(function (j) { return C.dayOf(j.start) >= f && L.jobFlag(j, api.today()) === 'late'; }).length; }, tone: function (v) { return v ? 'warn' : ''; } },
        { label: 'Not marked done', value: function (api) { return api.list('jobs').filter(function (j) { return L.jobFlag(j, api.today()) === 'overdue'; }).length; }, tone: function (v) { return v ? 'bad' : ''; } },
        { label: 'Booked hours this week', value: function (api) { var w = C.weekOf(api.today()); return api.list('jobs').filter(function (j) { var d = C.dayOf(j.start); return d >= w[0] && d <= w[6] && j.status !== 'Cancelled' && j.status !== 'Missed'; }).reduce(function (s, j) { return s + (+j.hours || 0); }, 0); }, fmt: 'hours' }
      ],
      charts: [
        { title: 'Booked hours this week by cleaner', entity: 'jobs', by: function (j, api) { return j.cleaner ? cleanerName(api, j.cleaner) : 'Unassigned'; }, sum: 'hours', fmt: 'hours',
          where: function (j, t) { var w = C.weekOf(t); var d = C.dayOf(j.start); return d >= w[0] && d <= w[6] && j.status !== 'Cancelled' && j.status !== 'Missed'; } },
        { title: 'Jobs by status', entity: 'jobs', by: 'status' }
      ],
      render: function (el, api) {
        var db = L.doubleBookings(api.list('jobs'));
        el.innerHTML = db.length ? '<div class="panel"><h3 style="margin-top:0" class="bad">Double bookings</h3>' + db.map(function (p) { var a = api.get('jobs', p[0]), b = api.get('jobs', p[1]); return '<p class="small">' + esc(cleanerName(api, a.cleaner)) + ': ' + esc(jobTitle(a, api)) + ' overlaps ' + esc(jobTitle(b, api)) + ' on ' + esc(C.dayOf(a.start)) + '</p>'; }).join('') + '</div>' : '';
      }
    },
    documents: [{ id: 'report', label: 'job report', entity: 'jobs', build: function (j, api) {
      var s = api.get('sites', j.site) || {};
      return { title: 'Cleaning report', number: s.name, date: C.dayOf(j.start), meta: [['Booked', C.timeOf(j.start) + ' for ' + j.hours + ' h'], ['Cleaner', cleanerName(api, j.cleaner)], ['Arrived', j.arrived], ['Finished', j.finished], ['Status', j.status]],
        to: { heading: 'Client', lines: [s.client, s.address] }, sections: [{ heading: 'Checklist', checklist: j.checklist || [] }, j.notes ? { heading: 'Notes', text: j.notes } : null].filter(Boolean),
        photos: j.photos || [], signatures: [{ label: 'Client', name: j.signedBy, image: j.signature, date: j.signedOn }] };
    } }],
    tabs: [{ id: 'roster', label: 'Roster', after: 'jobs', render: renderRoster }, { id: 'hours', label: 'Hours & payroll', after: 'cleaners', render: renderHours }],
    sample: function (today) { return L.sample(today); }
  });

  // ---------- roster ----------
  var rosterWeek = null, lastAlloc = null;
  function renderRoster(el, api) {
    rosterWeek = rosterWeek || C.weekStart(api.today());
    var days = C.weekOf(rosterWeek), jobs = api.list('jobs').filter(function (j) { var d = C.dayOf(j.start); return d >= days[0] && d <= days[6] && j.status !== 'Cancelled'; });
    var people = api.list('cleaners').filter(function (c) { return c.active !== false; }).concat([{ id: '', name: 'Unassigned' }]);
    var chip = function (j) { var f = L.jobFlag(j, api.today()); return '<button type="button" class="fg-ev" data-open="jobs" data-id="' + esc(j.id) + '" title="' + esc(jobTitle(j, api)) + '" style="white-space:normal">' + esc(C.timeOf(j.start)) + ' ' + esc(siteName(api, j.site)) + ' (' + j.hours + 'h)' + (f === 'missed' ? ' ✕' : j.status === 'Done' ? ' ✓' : '') + '</button>'; };
    var h = '<div class="row fg-toolbar"><button class="btn small" type="button" id="ro-prev" aria-label="Previous week">◀</button><b>Week of ' + esc(days[0]) + '</b><button class="btn small" type="button" id="ro-next" aria-label="Next week">▶</button><button class="btn small" type="button" id="ro-today">This week</button>' +
      '<button class="btn primary" type="button" id="ro-auto">Auto-allocate this week</button><button class="btn small" type="button" id="ro-print">Print roster</button></div>' +
      '<p class="small muted">Auto-allocate fills empty jobs only: it checks each cleaner\'s days, hours and weekly maximum, leaves 30 minutes between jobs, never double-books, and gives work to whoever has the fewest hours so far.</p>';
    if (lastAlloc) h += '<div class="panel"><b>' + lastAlloc.assignments.length + ' job(s) allocated.</b>' + (lastAlloc.unassigned.length ? '<p class="small warn">Could not place ' + lastAlloc.unassigned.length + ':</p><ul class="small">' + lastAlloc.unassigned.map(function (u) { var j = api.get('jobs', u.job); return '<li>' + esc(j ? jobTitle(j, api) + ' ' + String(j.start).replace('T', ' ') : u.job) + ' — ' + esc(u.reason) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
    h += '<div class="table-wrap"><table><thead><tr><th>Cleaner</th>' + days.map(function (d, i) { return '<th>' + C.WEEKDAYS[i] + ' ' + (+d.slice(8)) + '</th>'; }).join('') + '<th class="num">Hours</th></tr></thead><tbody>' + people.map(function (p) {
      var mine = jobs.filter(function (j) { return (j.cleaner || '') === p.id; }); if (!p.id && !mine.length) return '';
      var hrs = mine.filter(function (j) { return j.status !== 'Missed'; }).reduce(function (s, j) { return s + (+j.hours || 0); }, 0);
      return '<tr><td><b>' + esc(p.name) + '</b>' + (p.maxHours ? '<div class="small muted">max ' + p.maxHours + ' h</div>' : '') + '</td>' + days.map(function (d) { return '<td style="min-width:96px">' + mine.filter(function (j) { return C.dayOf(j.start) === d; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; }).map(chip).join('') + '</td>'; }).join('') +
        '<td class="num ' + (p.maxHours && hrs > p.maxHours ? 'bad' : '') + '">' + B.fmt.num(hrs, 2) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
    el.innerHTML = h;
    var go = function (w) { rosterWeek = w; lastAlloc = null; renderRoster(el, api); };
    el.querySelector('#ro-prev').addEventListener('click', function () { go(C.addDays(rosterWeek, -7)); });
    el.querySelector('#ro-next').addEventListener('click', function () { go(C.addDays(rosterWeek, 7)); });
    el.querySelector('#ro-today').addEventListener('click', function () { go(C.weekStart(api.today())); });
    el.querySelector('#ro-auto').addEventListener('click', function () {
      var res = L.autoAllocate(api.list('jobs'), api.list('cleaners'), { from: days[0] < api.today() ? api.today() : days[0], to: days[6] });
      api.saveMany('jobs', res.assignments.map(function (a) { return Object.assign({}, api.get('jobs', a.job), { cleaner: a.cleaner }); }));
      lastAlloc = res; renderRoster(el, api);
    });
    el.querySelector('#ro-print').addEventListener('click', function () {
      api.print({ title: 'Cleaning roster', date: 'Week of ' + days[0], sections: people.map(function (p) {
        var mine = jobs.filter(function (j) { return (j.cleaner || '') === p.id; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; }); if (!mine.length) return null;
        return { heading: p.name, table: { headers: ['Day', 'Time', 'Hours', 'Site', 'Address', 'Access'], rows: mine.map(function (j) { var s = api.get('sites', j.site) || {}; return [C.WEEKDAYS[C.weekday(C.dayOf(j.start))] + ' ' + C.dayOf(j.start), C.timeOf(j.start), j.hours, s.name, s.address, s.access]; }) } };
      }).filter(Boolean) });
    });
  }

  // ---------- hours & payroll ----------
  var hrsRange = null;
  function renderHours(el, api) {
    if (!hrsRange) { var ws = C.weekStart(api.today()); hrsRange = { from: C.addDays(ws, -7), to: C.addDays(ws, 6) }; }
    var rep = L.hoursReport(api.list('jobs'), api.list('cleaners'), hrsRange.from, hrsRange.to, api.today());
    el.innerHTML = '<div class="row fg-toolbar"><label for="hr-from" style="margin:0">From</label><input type="date" id="hr-from" value="' + esc(hrsRange.from) + '" style="width:auto"><label for="hr-to" style="margin:0">to</label><input type="date" id="hr-to" value="' + esc(hrsRange.to) + '" style="width:auto">' +
      '<button class="btn small" type="button" id="hr-csv">Download CSV</button><button class="btn small" type="button" id="hr-print">Print</button></div>' +
      B.table(rep.rows.concat([{ name: 'Total', jobs: rep.total.jobs, hours: rep.total.hours, pay: rep.total.pay }]), [
        { key: 'name', label: 'Cleaner' }, { key: 'jobs', label: 'Jobs done' }, { key: 'hours', label: 'Hours worked' }, { key: 'booked', label: 'Hours booked' },
        { key: 'late', label: 'Late' }, { key: 'missed', label: 'Missed' }, { key: 'pay', label: 'Pay (estimate)', fmt: function (v) { return B.fmt.money(v); } }]) +
      '<p class="small muted">Hours worked = "hours worked" if entered, otherwise finished − arrived, otherwise the booked hours. Pay is hours × the rate on each cleaner — before tax, super, penalty rates and allowances. Check the Cleaning Services Award or your agreement before paying.</p>';
    var re = function () { hrsRange = { from: el.querySelector('#hr-from').value || hrsRange.from, to: el.querySelector('#hr-to').value || hrsRange.to }; renderHours(el, api); };
    el.querySelector('#hr-from').addEventListener('change', re); el.querySelector('#hr-to').addEventListener('change', re);
    var cols = ['Cleaner', 'Jobs done', 'Hours worked', 'Hours booked', 'Late arrivals', 'Missed', 'Rate', 'Pay estimate'];
    var rows = rep.rows.map(function (r) { return { Cleaner: r.name, 'Jobs done': r.jobs, 'Hours worked': r.hours, 'Hours booked': r.booked, 'Late arrivals': r.late, Missed: r.missed, Rate: r.rate, 'Pay estimate': r.pay }; });
    el.querySelector('#hr-csv').addEventListener('click', function () { B.download('cleaner-hours-' + hrsRange.from + '-to-' + hrsRange.to + '.csv', '﻿' + B.csv.stringify(rows, cols), 'text/csv;charset=utf-8'); });
    el.querySelector('#hr-print').addEventListener('click', function () { api.print({ title: 'Cleaner hours', date: hrsRange.from + ' to ' + hrsRange.to, sections: [{ table: { headers: cols, rows: rows.map(function (r) { return cols.map(function (c) { return r[c]; }); }).concat([['Total', rep.total.jobs, rep.total.hours, '', '', '', '', rep.total.pay]]) } }], footer: 'Estimate before tax, super, penalty rates and allowances.' }); });
  }
})();
