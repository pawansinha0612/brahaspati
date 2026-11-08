/* Property Inspection Assistant — ProductForge config plus inspection extras. */
(function () {
  'use strict';
  var L = window.InspectionLib, C = window.ForgeCore, esc = C.esc;
  var PRIORITY = [{ value: 'Urgent', label: 'Urgent', tone: 'bad' }, { value: 'High', label: 'High', tone: 'warn' }, 'Medium', 'Low'];
  var TRADES = ['Electrician', 'Plumber', 'Handyman', 'Painter', 'Cleaner', 'Carpet cleaner', 'Gardener', 'Garage door technician', 'Locksmith', 'Pest control', 'Other'];
  var propTitle = function (api, id) { return api.title('properties', id); };
  var latest = function (list) { return list.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0]; };

  function reportSpec(insp, api) {
    var p = api.get('properties', insp.property) || {}, s = L.summary(insp.checklist);
    var maint = api.list('maintenance').filter(function (m) { return m.inspection === insp.id; });
    return {
      title: insp.type + ' condition report', date: insp.date,
      meta: [['Property', p.address], ['Inspector', insp.inspector], ['Tenant', insp.tenantName || p.tenant], ['Status', insp.status]],
      intro: 'Ratings: Y = yes, N = no, N/A = not applicable, for Clean / Undamaged / Working. ' + s.rated + ' of ' + s.total + ' items rated; ' + s.issues + ' with a problem.',
      sections: [
        { heading: 'Summary by room', table: { headers: ['Room', 'Items', 'Rated', 'Problems'], rows: s.rooms.map(function (r) { return [r.room, r.items, r.rated, r.issues]; }) } },
        { heading: 'Room by room', checklist: insp.checklist || [], columns: L.COLS },
        maint.length ? { heading: 'Maintenance raised', table: { headers: ['Item', 'Priority', 'Trade', 'Due'], rows: maint.map(function (m) { return [m.title, m.priority, m.trade, m.due]; }) } } : null,
        insp.notes ? { heading: 'General notes', text: insp.notes } : null
      ].filter(Boolean),
      photos: insp.photos || [],
      signatures: [{ label: 'Tenant', name: insp.tenantName, image: insp.tenantSignature, date: insp.tenantSignedOn }, { label: 'Agent / landlord', name: insp.inspector, image: insp.agentSignature, date: insp.agentSignedOn }],
      footer: 'Tenants: if you disagree with anything in this report, note it and return a signed copy within the time your state\'s tenancy laws allow (for example 7 days in NSW).'
    };
  }

  Forge.app({
    id: 'property-inspection', name: 'Property Inspection', mount: '#app', quickAdd: ['inspections'],
    entities: {
      inspections: {
        label: 'Inspections', single: 'Inspection', board: 'status', calendar: ['date'], sort: { key: 'date', dir: 'desc' },
        title: function (r) { return (r.type || 'Inspection') + ' · ' + (r.date || 'no date'); },
        list: ['date', 'property', 'type', 'inspector', 'status', 'issues'], cardFields: ['property', 'date'],
        fields: [
          { key: 'property', label: 'Property', type: 'link', entity: 'properties', required: true, filter: true },
          { key: 'type', label: 'Type', type: 'select', required: true, options: ['Entry', 'Routine', 'Exit'] },
          { key: 'date', label: 'Date', type: 'date', required: true, default: 'today' },
          { key: 'inspector', label: 'Inspector', type: 'text' },
          { key: 'status', label: 'Status', type: 'select', required: true, options: ['Scheduled', 'In progress', { value: 'Completed', label: 'Completed', tone: 'ok' }, { value: 'Signed', label: 'Signed off', tone: 'ok' }] },
          { key: 'checklist', label: 'Room-by-room checklist', type: 'checklist', itemFields: L.COLS.map(function (c) { return { key: c.key, label: c.label, options: L.RATINGS }; }), itemPhotos: true, autoDone: true,
            groupLabel: 'Room', groupItems: function (room) { return L.ROOM_ITEMS[L.roomType(room)]; }, help: 'Rate each item Y / N / N/A. Add a photo and a note for anything marked N.' },
          { key: 'issues', label: 'Problems found', type: 'number', compute: function (r) { return L.summary(r.checklist).issues; } },
          { key: 'photos', label: 'General photos', type: 'photos' },
          { key: 'notes', label: 'General notes', type: 'longtext' },
          { key: 'tenantName', label: 'Tenant name', type: 'text' },
          { key: 'tenantSignature', label: 'Tenant signature', type: 'signature', dateField: 'tenantSignedOn' },
          { key: 'tenantSignedOn', label: 'Tenant signed on', type: 'date' },
          { key: 'agentSignature', label: 'Agent / landlord signature', type: 'signature', dateField: 'agentSignedOn' },
          { key: 'agentSignedOn', label: 'Agent signed on', type: 'date' }
        ],
        onNew: function (r, api) { var p = api.get('properties', r.property); r.checklist = L.buildChecklist(p ? p.rooms : L.DEFAULT_ROOMS); if (p && !r.tenantName) r.tenantName = p.tenant || ''; },
        onLinkChange: function (r, key, api) {
          if (key !== 'property') return; var p = api.get('properties', r.property); if (!p) return;
          if (!L.summary(r.checklist).rated) r.checklist = L.buildChecklist(p.rooms);
          if (!r.tenantName) r.tenantName = p.tenant || '';
        },
        beforeSave: function (r) { if (r.tenantSignature && r.agentSignature && r.status !== 'Signed') r.status = 'Signed'; },
        afterSave: function (r, api) {
          if (r.status !== 'Completed' && r.status !== 'Signed') return;
          var p = api.get('properties', r.property); if (!p || r.type === 'Exit') return;
          var next = L.nextRoutine(r.date, +p.routineMonths || 6, p.leaseEnd);
          if (next && (!p.nextInspection || p.nextInspection <= r.date)) api.save('properties', Object.assign({}, p, { nextInspection: next }), true);
        },
        actions: [
          { label: 'Raise maintenance for problems', when: function (r) { return L.summary(r.checklist).issues > 0; }, run: function (r, api) {
            var add = L.maintenanceFrom(r, api.list('maintenance'), api.today());
            if (!add.length) return api.toast('Maintenance already raised for every problem');
            api.saveMany('maintenance', add); api.toast('Added ' + add.length + ' maintenance item' + (add.length > 1 ? 's' : ''));
          } },
          { label: 'Compare with entry', when: function (r) { return r.type === 'Exit'; }, run: function (r, api) { cmp.property = r.property; cmp.exit = r.id; cmp.entry = ''; api.goTab('x-compare'); } },
          { label: 'Add follow-up', run: function (r, api) { api.edit('tasks', null, { property: r.property, due: C.addDays(api.today(), 7) }); } }
        ],
        detailExtra: function (el, r) {
          var s = L.summary(r.checklist);
          el.innerHTML = '<p class="small">' + s.rated + ' of ' + s.total + ' items rated · <b class="' + (s.issues ? 'bad' : 'ok') + '">' + s.issues + ' problem' + (s.issues === 1 ? '' : 's') + '</b></p>' +
            (s.issues ? '<ul class="small">' + (r.checklist || []).filter(L.hasIssue).map(function (it) { return '<li>' + esc(it.group + ': ' + it.text) + ' (' + esc(L.ratingText(it)) + ')' + (it.notes ? ' — ' + esc(it.notes) : '') + '</li>'; }).join('') + '</ul>' : '');
        }
      },
      properties: {
        label: 'Properties', single: 'Property', title: 'address', list: ['address', 'type', 'tenant', 'leaseEnd', 'nextInspection'],
        fields: [
          { key: 'address', label: 'Address', type: 'text', required: true },
          { key: 'type', label: 'Type', type: 'select', options: ['House', 'Unit', 'Townhouse', 'Commercial'] },
          { key: 'rooms', label: 'Rooms (one per line)', type: 'longtext', default: L.DEFAULT_ROOMS, help: 'Used to build the checklist for new inspections. Names like Kitchen, Bathroom, Bedroom 2, Laundry or Garage get suitable items.' },
          { key: 'landlord', label: 'Landlord', type: 'text' },
          { key: 'landlordEmail', label: 'Landlord email', type: 'email' },
          { key: 'tenant', label: 'Tenant(s)', type: 'text' },
          { key: 'tenantEmail', label: 'Tenant email', type: 'email' },
          { key: 'tenantPhone', label: 'Tenant phone', type: 'phone' },
          { key: 'leaseStart', label: 'Lease start', type: 'date' },
          { key: 'leaseEnd', label: 'Lease end', type: 'date' },
          { key: 'routineMonths', label: 'Routine inspection every (months)', type: 'number', min: 1, max: 24, default: 6 },
          { key: 'nextInspection', label: 'Next inspection due', type: 'date', help: 'Updated automatically when you complete a routine or entry inspection.' },
          { key: 'notes', label: 'Notes', type: 'longtext' }
        ],
        actions: [{ label: 'Start inspection', run: function (p, api) { api.edit('inspections', null, { property: p.id, type: 'Routine', status: 'In progress', tenantName: p.tenant || '', checklist: L.buildChecklist(p.rooms) }); } }]
      },
      maintenance: {
        label: 'Maintenance', single: 'Maintenance item', title: 'title', board: 'status', calendar: ['due'], sort: { key: 'priority' },
        list: ['title', 'property', 'priority', 'trade', 'status', 'due'], cardFields: ['property', 'priority'],
        fields: [
          { key: 'title', label: 'What needs doing', type: 'text', required: true },
          { key: 'property', label: 'Property', type: 'link', entity: 'properties', required: true, filter: true },
          { key: 'inspection', label: 'Found at inspection', type: 'link', entity: 'inspections', addFrom: false },
          { key: 'room', label: 'Room', type: 'text' },
          { key: 'priority', label: 'Priority', type: 'select', required: true, options: PRIORITY },
          { key: 'trade', label: 'Trade', type: 'select', options: TRADES },
          { key: 'status', label: 'Status', type: 'select', required: true, options: ['Open', 'Quote requested', 'Booked', { value: 'Done', label: 'Done', tone: 'ok' }] },
          { key: 'due', label: 'Due', type: 'date' },
          { key: 'cost', label: 'Cost', type: 'money', min: 0 },
          { key: 'photos', label: 'Photos', type: 'photos' },
          { key: 'notes', label: 'Notes', type: 'longtext' }
        ],
        onNew: function (r, api) { r.due = L.dueFor(r.priority || 'Urgent', api.today()); }
      },
      tasks: {
        label: 'Follow-ups', single: 'Follow-up', title: 'title', calendar: ['due'], sort: { key: 'due' }, list: ['title', 'property', 'due', 'done'],
        fields: [
          { key: 'title', label: 'Task', type: 'text', required: true },
          { key: 'property', label: 'Property', type: 'link', entity: 'properties', filter: true },
          { key: 'due', label: 'Due', type: 'date', required: true },
          { key: 'done', label: 'Done', type: 'checkbox', filter: true },
          { key: 'notes', label: 'Notes', type: 'longtext' }
        ],
        actions: [{ label: 'Mark done', when: function (t) { return !t.done; }, run: function (t, api) { api.save('tasks', Object.assign({}, t, { done: true })); api.toast('Done'); } }]
      }
    },
    reminders: [
      { entity: 'tasks', date: 'due', warnDays: 7, label: 'Follow-up due', when: function (t) { return !t.done; } },
      { entity: 'maintenance', date: 'due', warnDays: 3, label: 'Maintenance due', when: function (m) { return m.status !== 'Done'; } },
      { entity: 'properties', date: 'nextInspection', warnDays: 21, label: 'Routine inspection due' },
      { entity: 'properties', date: 'leaseEnd', warnDays: 60, pastDays: 30, label: 'Lease ending — book exit or renewal' },
      { entity: 'inspections', date: 'date', warnDays: 7, pastDays: 7, label: 'Inspection booked', when: function (i) { return i.status === 'Scheduled'; } }
    ],
    dashboard: {
      tiles: [
        { label: 'Properties', entity: 'properties', kind: 'count' },
        { label: 'Inspections this month', value: function (api) { var m = api.today().slice(0, 7); return api.list('inspections').filter(function (i) { return (i.date || '').slice(0, 7) === m; }).length; } },
        { label: 'Open maintenance', entity: 'maintenance', kind: 'count', where: function (m) { return m.status !== 'Done'; } },
        { label: 'Urgent repairs', entity: 'maintenance', kind: 'count', where: function (m) { return m.status !== 'Done' && m.priority === 'Urgent'; }, tone: function (v) { return v ? 'bad' : ''; } },
        { label: 'Overdue follow-ups', entity: 'tasks', kind: 'overdue', date: 'due', where: function (t) { return !t.done; } },
        { label: 'Repair costs logged', entity: 'maintenance', kind: 'sum', field: 'cost' }
      ],
      charts: [
        { title: 'Open maintenance by trade', entity: 'maintenance', by: 'trade', where: function (m) { return m.status !== 'Done'; } },
        { title: 'Problems found per property', entity: 'inspections', by: 'property', sum: 'issues' }
      ]
    },
    documents: [{ id: 'report', label: 'report', entity: 'inspections', build: reportSpec }],
    tabs: [{ id: 'compare', label: 'Entry vs exit', after: 'tasks', render: renderCompare }],
    sample: function (today) { return L.sample(today); }
  });

  // ---------- entry vs exit comparison ----------
  var cmp = { property: '', entry: '', exit: '' };
  function renderCompare(el, api) {
    var props = api.list('properties'), insps = api.list('inspections');
    if (!cmp.property && props.length) { var withExit = insps.filter(function (i) { return i.type === 'Exit'; })[0]; cmp.property = withExit ? withExit.property : props[0].id; }
    var mine = insps.filter(function (i) { return i.property === cmp.property; });
    var entries = mine.filter(function (i) { return i.type !== 'Exit'; }), exits = mine.filter(function (i) { return i.type === 'Exit' || i.type === 'Routine'; });
    if (!entries.some(function (i) { return i.id === cmp.entry; })) cmp.entry = (latest(entries.filter(function (i) { return i.type === 'Entry'; })) || latest(entries) || {}).id || '';
    if (!exits.some(function (i) { return i.id === cmp.exit; })) cmp.exit = (latest(exits.filter(function (i) { return i.type === 'Exit'; })) || latest(exits) || {}).id || '';
    var opt = function (list, sel) { return '<option value="">Choose…</option>' + list.map(function (i) { return '<option value="' + esc(i.id) + '"' + (i.id === sel ? ' selected' : '') + '>' + esc(i.type + ' · ' + i.date) + '</option>'; }).join(''); };
    var h = '<p class="small muted" style="margin-top:14px">Lines up the entry report with a later exit (or routine) report and shows every item that got worse — useful for bond claims. Fair wear and tear is not the tenant\'s cost; use your judgement.</p>' +
      '<div class="fg-form"><div><label for="cp-prop">Property</label><select id="cp-prop">' + props.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === cmp.property ? ' selected' : '') + '>' + esc(p.address) + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="cp-entry">Entry (before)</label><select id="cp-entry">' + opt(entries, cmp.entry) + '</select></div><div><label for="cp-exit">Exit (after)</label><select id="cp-exit">' + opt(exits, cmp.exit) + '</select></div></div>';
    var a = api.get('inspections', cmp.entry), b = api.get('inspections', cmp.exit), res = null;
    if (a && b && a.id !== b.id) {
      res = L.compare(a.checklist, b.checklist);
      h += '<div class="row" style="margin:12px 0"><b class="' + (res.worse.length ? 'bad' : 'ok') + '">' + res.worse.length + ' item' + (res.worse.length === 1 ? '' : 's') + ' got worse</b><button class="btn primary" type="button" id="cp-print">Print comparison</button>' +
        '<label class="fg-check"><input type="checkbox" id="cp-all"' + (cmp.all ? ' checked' : '') + '> Show all items</label></div>';
      var rows = cmp.all ? res.rows : res.worse;
      h += rows.length ? '<div class="table-wrap"><table><thead><tr><th>Room</th><th>Item</th><th>Entry C/U/W</th><th>Exit C/U/W</th><th>Change</th><th>Exit notes</th></tr></thead><tbody>' + rows.map(function (r) {
        return '<tr><td>' + esc(r.room) + '</td><td>' + esc(r.item) + '</td><td>' + esc(r.entry) + '</td><td>' + esc(r.exit) + '</td><td>' + (r.worse ? '<span class="pill-bad">' + esc(r.changes.join(', ')) + '</span>' : r.improved.length ? '<span class="pill-ok">better</span>' : '') + '</td><td>' + esc(r.exitNotes) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="ok">No item is in worse condition than at entry.</p>';
    } else h += '<p class="muted" style="margin-top:12px">' + (mine.length < 2 ? 'This property needs at least two inspections to compare.' : 'Choose two different inspections.') + '</p>';
    el.innerHTML = h;
    var on = function (id, fn) { var x = el.querySelector(id); if (x) x.addEventListener('change', fn); };
    on('#cp-prop', function (e) { cmp.property = e.target.value; cmp.entry = cmp.exit = ''; renderCompare(el, api); });
    on('#cp-entry', function (e) { cmp.entry = e.target.value; renderCompare(el, api); });
    on('#cp-exit', function (e) { cmp.exit = e.target.value; renderCompare(el, api); });
    on('#cp-all', function (e) { cmp.all = e.target.checked; renderCompare(el, api); });
    var pb = el.querySelector('#cp-print');
    if (pb) pb.addEventListener('click', function () {
      var p = api.get('properties', cmp.property) || {};
      api.print({ title: 'Entry vs exit comparison', date: api.today(), meta: [['Property', p.address], ['Entry', a.type + ' ' + a.date], ['Exit', b.type + ' ' + b.date], ['Tenant', b.tenantName || p.tenant]],
        intro: res.worse.length + ' item(s) recorded in worse condition at exit than at entry. C/U/W = Clean / Undamaged / Working.',
        sections: [{ heading: 'Items in worse condition', table: { headers: ['Room', 'Item', 'Entry', 'Exit', 'Change', 'Entry notes', 'Exit notes'], rows: res.worse.map(function (r) { return [r.room, r.item, r.entry, r.exit, r.changes.join(', '), r.entryNotes, r.exitNotes]; }) } }]
          .concat(res.worse.filter(function (r) { return r.exitPhotos.length; }).map(function (r) { return { heading: r.room + ': ' + r.item, photos: r.exitPhotos }; })) });
    });
  }
})();
