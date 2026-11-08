/* Logistics Control Tower — ProductForge config plus allocation board, run sheets and OTIF performance. */
(function () {
  'use strict';
  var L = window.LogisticsLib, C = window.ForgeCore, B = window.B, esc = C.esc;
  var app = null; // set when Forge.app returns (used by form validation only)
  var nowHM = function () { var n = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; }; return p(n.getHours()) + ':' + p(n.getMinutes()); };
  var nowDT = function (api) { return api.today() + 'T' + nowHM(); };
  var pct = function (v) { return B.fmt.pct(v, 0); };
  var STATUS = ['Booked', 'Allocated', 'Picked up', 'In transit', { value: 'Delivered', label: 'Delivered', tone: 'ok' }, { value: 'Exception', label: 'Exception', tone: 'bad' }, 'Cancelled'];
  var win = function (c) { return (c.windowFrom || '') + (c.windowTo ? '–' + c.windowTo : ''); };
  var loadText = function (c) { return [c.pallets ? c.pallets + ' plt' : '', c.weight ? c.weight + ' kg' : '', c.cubic ? c.cubic + ' m³' : '', c.items ? c.items + ' items' : ''].filter(Boolean).join(' · '); };
  var link = function (ek, r, api) { return '<button type="button" class="fg-linkbtn" data-open="' + ek + '" data-id="' + esc(r.id) + '">' + esc(api.title(ek, r)) + '</button>'; };

  app = Forge.app({
    id: 'logistics-tower', name: 'Logistics Control Tower', mount: '#app', quickAdd: ['consignments', 'exceptions'],
    entities: {
      consignments: {
        label: 'Consignments', single: 'Consignment', title: 'number', board: 'status', calendar: ['date'], sort: { key: 'date', dir: 'desc' },
        list: ['number', 'date', 'customer', 'deliveryAddress', 'driver', 'status'], cardFields: ['date', 'customer', 'driver'],
        fields: [
          { key: 'number', label: 'Consignment number', type: 'text', required: true },
          { key: 'customer', label: 'Customer', type: 'link', entity: 'customers', required: true, filter: true },
          { key: 'date', label: 'Delivery date', type: 'date', required: true, default: 'today' },
          { key: 'windowFrom', label: 'Window from', type: 'time' },
          { key: 'windowTo', label: 'Window to', type: 'time' },
          { key: 'pickupAddress', label: 'Pick-up address', type: 'text', full: true },
          { key: 'deliveryAddress', label: 'Delivery address', type: 'text', required: true, full: true },
          { key: 'receiver', label: 'Receiver / instructions', type: 'text' },
          { key: 'receiverPhone', label: 'Receiver phone', type: 'phone' },
          { key: 'items', label: 'Items / cartons', type: 'number', min: 0 },
          { key: 'pallets', label: 'Pallets', type: 'number', min: 0 },
          { key: 'weight', label: 'Weight (kg)', type: 'number', min: 0 },
          { key: 'cubic', label: 'Cubic (m³)', type: 'number', min: 0 },
          { key: 'driver', label: 'Driver', type: 'link', entity: 'drivers', filter: true },
          { key: 'vehicle', label: 'Vehicle', type: 'link', entity: 'vehicles', filter: true },
          { key: 'status', label: 'Status', type: 'select', required: true, options: STATUS },
          { key: 'pickedAt', label: 'Picked up at', type: 'datetime' },
          { key: 'deliveredAt', label: 'Delivered at', type: 'datetime' },
          { key: 'inFull', label: 'Delivered in full (nothing short or damaged)', type: 'checkbox', default: true, full: true },
          { key: 'podName', label: 'Received by (print name)', type: 'text' },
          { key: 'signature', label: 'Receiver signature', type: 'signature', dateField: 'signedOn' },
          { key: 'signedOn', label: 'Signed on', type: 'date' },
          { key: 'photos', label: 'Delivery photos', type: 'photos' },
          { key: 'notes', label: 'Notes', type: 'longtext' }
        ],
        onNew: function (r, api) { r.number = C.nextNumber(api.list('consignments').map(function (c) { return c.number; }), 'CN-', 3); },
        onLinkChange: function (r, key, api) { if (key === 'customer' && !r.pickupAddress) { var c = api.get('customers', r.customer); if (c) r.pickupAddress = c.address || ''; } },
        validate: function (r) {
          var e = {};
          if (r.windowFrom && r.windowTo && r.windowTo <= r.windowFrom) e.windowTo = 'Window end must be after the start';
          if (r.status === 'Delivered' && !r.deliveredAt) e.deliveredAt = 'Enter when it was delivered (needed for on-time reporting)';
          if (app && (r.driver || r.vehicle) && r.status !== 'Cancelled') { var chk = L.checkAllocation(r, app.list('consignments'), app.list('drivers'), app.list('vehicles')); if (chk.errors.length) e[r.vehicle ? 'vehicle' : 'driver'] = chk.errors.join(' · '); }
          return e;
        },
        beforeSave: function (r) {
          if (r.status === 'Booked' && r.driver && r.vehicle) r.status = 'Allocated';
          if (r.status === 'Allocated' && (!r.driver || !r.vehicle)) r.status = 'Booked';
        },
        onStatus: function (r, v, api) { if (v === 'Picked up' && !r.pickedAt) r.pickedAt = nowDT(api); if (v === 'Delivered' && !r.deliveredAt) r.deliveredAt = nowDT(api); },
        actions: [
          { label: 'Picked up', when: function (c) { return c.status === 'Allocated'; }, run: function (c, api) { api.save('consignments', Object.assign({}, c, { status: 'Picked up', pickedAt: nowDT(api) })); } },
          { label: 'In transit', when: function (c) { return c.status === 'Picked up'; }, run: function (c, api) { api.save('consignments', Object.assign({}, c, { status: 'In transit' })); } },
          { label: 'Record delivery (POD)', when: function (c) { return ['Allocated', 'Picked up', 'In transit', 'Exception'].indexOf(c.status) >= 0; }, run: function (c, api) { api.edit('consignments', c, { status: 'Delivered', deliveredAt: c.deliveredAt || nowDT(api) }); } },
          { label: 'Log exception', run: function (c, api) { api.edit('exceptions', null, { consignment: c.id, date: api.today(), status: 'Open' }); } }
        ],
        detailExtra: function (el, c, api) {
          var chk = L.checkAllocation(c, api.list('consignments'), api.list('drivers'), api.list('vehicles'));
          var ot = L.onTime(c), inf = L.inFull(c, api.list('exceptions')), late = L.runningLate(c, api.today(), nowHM());
          el.innerHTML = '<p class="small">Window: <b>' + esc(win(c) || 'any time') + '</b> · Load: ' + esc(loadText(c) || '–') +
            (ot != null ? '<br>' + (ot ? '<span class="pill-ok">On time</span>' : '<span class="pill-bad">Late</span>') + ' ' + (inf ? '<span class="pill-ok">In full</span>' : '<span class="pill-bad">Not in full</span>') : '') +
            (late ? '<br><span class="pill-warn">Running late</span> past the delivery window and not marked delivered' : '') +
            chk.errors.map(function (x) { return '<br><span class="pill-bad">Problem</span> ' + esc(x); }).join('') + chk.warnings.map(function (x) { return '<br><span class="pill-warn">Check</span> ' + esc(x); }).join('') + '</p>';
        }
      },
      customers: {
        label: 'Customers', single: 'Customer', title: 'name', list: ['name', 'contact', 'phone', 'email'],
        fields: [
          { key: 'name', label: 'Business name', type: 'text', required: true },
          { key: 'contact', label: 'Contact person', type: 'text' },
          { key: 'phone', label: 'Phone', type: 'phone' },
          { key: 'email', label: 'Email', type: 'email' },
          { key: 'address', label: 'Usual pick-up address', type: 'text', full: true },
          { key: 'notes', label: 'Notes (dock hours, booking rules)', type: 'longtext' }
        ]
      },
      drivers: {
        label: 'Drivers', single: 'Driver', title: 'name', list: ['name', 'licenceClass', 'licenceExpiry', 'days', 'active'],
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'phone', label: 'Phone', type: 'phone' },
          { key: 'licenceClass', label: 'Licence class', type: 'select', required: true, options: L.CLASSES.map(function (k) { return { value: k, label: k + ' — ' + L.CLASS_HELP[k] }; }) },
          { key: 'licenceNumber', label: 'Licence number', type: 'text' },
          { key: 'licenceExpiry', label: 'Licence expiry', type: 'date', required: true },
          { key: 'days', label: 'Days available', type: 'multiselect', options: C.WEEKDAYS, default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
          { key: 'leaveFrom', label: 'On leave from', type: 'date' },
          { key: 'leaveTo', label: 'On leave until', type: 'date' },
          { key: 'active', label: 'Active', type: 'checkbox', default: true },
          { key: 'notes', label: 'Notes (inductions, fatigue rules)', type: 'longtext' }
        ],
        validate: function (r) { return r.leaveFrom && r.leaveTo && r.leaveTo < r.leaveFrom ? { leaveTo: 'Leave end is before the start' } : {}; },
        actions: [{ label: 'Open run sheet', run: function (d, api) { rsDriver = d.id; api.goTab('x-runs'); } }]
      },
      vehicles: {
        label: 'Vehicles', single: 'Vehicle', title: 'rego', list: ['rego', 'type', 'licenceClass', 'maxKg', 'maxPallets', 'regoExpiry', 'serviceDue'],
        fields: [
          { key: 'rego', label: 'Rego', type: 'text', required: true },
          { key: 'type', label: 'Type', type: 'text', placeholder: 'e.g. Medium rigid tautliner' },
          { key: 'licenceClass', label: 'Licence class needed', type: 'select', required: true, options: L.CLASSES },
          { key: 'maxKg', label: 'Payload (kg)', type: 'number', min: 0 },
          { key: 'maxPallets', label: 'Pallet spaces', type: 'number', min: 0 },
          { key: 'maxCubic', label: 'Cubic capacity (m³)', type: 'number', min: 0 },
          { key: 'regoExpiry', label: 'Rego expiry', type: 'date' },
          { key: 'serviceDue', label: 'Next service due', type: 'date' },
          { key: 'active', label: 'On the road (untick when off for repairs)', type: 'checkbox', default: true },
          { key: 'notes', label: 'Notes', type: 'longtext' }
        ]
      },
      exceptions: {
        label: 'Exceptions', single: 'Exception', board: 'status', sort: { key: 'date', dir: 'desc' },
        title: function (r, api) { return (r.type || 'Exception') + ' · ' + api.title('consignments', r.consignment); },
        list: ['date', 'consignment', 'type', 'cause', 'status', 'followUpDue'], cardFields: ['type', 'cause', 'followUpDue'],
        fields: [
          { key: 'consignment', label: 'Consignment', type: 'link', entity: 'consignments', required: true },
          { key: 'date', label: 'Date', type: 'date', required: true, default: 'today' },
          { key: 'type', label: 'What happened', type: 'select', required: true, options: ['Late', 'Damaged', 'Failed delivery', 'Refused', 'Short / missing items', 'Other'] },
          { key: 'cause', label: 'Cause', type: 'select', options: ['Traffic / road closure', 'Receiver closed / not home', 'Wrong or incomplete address', 'Loading error', 'Packaging', 'Handling damage', 'Vehicle breakdown', 'Weather', 'Customer changed order', 'Other'] },
          { key: 'details', label: 'Details', type: 'longtext' },
          { key: 'followUp', label: 'Follow-up action', type: 'longtext' },
          { key: 'followUpDue', label: 'Follow up by', type: 'date' },
          { key: 'status', label: 'Status', type: 'select', required: true, options: [{ value: 'Open', label: 'Open', tone: 'warn' }, { value: 'Resolved', label: 'Resolved', tone: 'ok' }] },
          { key: 'photos', label: 'Photos', type: 'photos' }
        ],
        afterSave: function (x, api, isNew) {
          var c = api.get('consignments', x.consignment);
          if (isNew && c && (x.type === 'Failed delivery' || x.type === 'Refused') && c.status !== 'Delivered') api.save('consignments', Object.assign({}, c, { status: 'Exception' }), true);
        }
      }
    },
    reminders: [
      { entity: 'drivers', date: 'licenceExpiry', warnDays: 30, label: 'Driver licence expires', when: function (d) { return d.active !== false; } },
      { entity: 'vehicles', date: 'regoExpiry', warnDays: 30, label: 'Rego expires', when: function (v) { return v.active !== false; } },
      { entity: 'vehicles', date: 'serviceDue', warnDays: 14, label: 'Vehicle service due', when: function (v) { return v.active !== false; } },
      { entity: 'exceptions', date: 'followUpDue', warnDays: 2, label: 'Exception follow-up', when: function (x) { return x.status === 'Open'; } },
      { entity: 'consignments', date: 'date', warnDays: 1, pastDays: 7, label: function (c) { return c.status === 'Booked' ? 'Not allocated yet' : 'Not marked delivered'; }, ruleText: 'Unallocated consignments for today/tomorrow, and past ones not marked delivered', when: function (c, t) { return c.status === 'Booked' || (c.date < t && ['Allocated', 'Picked up', 'In transit'].indexOf(c.status) >= 0); } }
    ],
    dashboard: {
      tiles: [
        { label: 'Deliveries today', value: function (api) { return api.list('consignments').filter(function (c) { return c.date === api.today() && c.status !== 'Cancelled'; }).length; } },
        { label: 'Not allocated (today + tomorrow)', value: function (api) { var t = api.today(), m = C.addDays(t, 1); return api.list('consignments').filter(function (c) { return c.status === 'Booked' && c.date >= t && c.date <= m; }).length; }, tone: function (v) { return v ? 'warn' : ''; } },
        { label: 'On the road now', entity: 'consignments', kind: 'count', where: function (c) { return c.status === 'Picked up' || c.status === 'In transit'; } },
        { label: 'OTIF (30 days)', value: function (api) { return L.otif(api.list('consignments'), api.list('exceptions'), C.addDays(api.today(), -30), api.today()).otifPct; }, fmt: 'pct', tone: function (v) { return v < 0.9 ? 'warn' : 'ok'; } },
        { label: 'Exception rate (30 days)', value: function (api) { return L.otif(api.list('consignments'), api.list('exceptions'), C.addDays(api.today(), -30), api.today()).exceptionRate; }, fmt: 'pct', tone: function (v) { return v > 0.05 ? 'bad' : ''; } },
        { label: 'Open exceptions', entity: 'exceptions', kind: 'count', where: function (x) { return x.status === 'Open'; }, tone: function (v) { return v ? 'warn' : ''; } }
      ],
      charts: [
        { title: 'Exceptions by type (90 days)', entity: 'exceptions', by: 'type', where: function (x, t) { return x.date >= C.addDays(t, -90); } },
        { title: 'Exceptions by cause (90 days)', entity: 'exceptions', by: 'cause', where: function (x, t) { return x.date >= C.addDays(t, -90); } }
      ],
      render: function (el, api) {
        var t = api.today(), all = api.list('consignments');
        var probs = all.filter(function (c) { return c.date >= t && c.status !== 'Cancelled' && c.status !== 'Delivered' && (c.driver || c.vehicle); }).map(function (c) { var k = L.checkAllocation(c, all, api.list('drivers'), api.list('vehicles')); return { c: c, msgs: k.errors.concat(k.warnings) }; }).filter(function (x) { return x.msgs.length; });
        var late = all.filter(function (c) { return L.runningLate(c, t, nowHM()); });
        el.innerHTML = (late.length ? '<div class="panel"><h3 style="margin-top:0" class="bad">Running late / not closed off</h3>' + late.map(function (c) { return '<p class="small">' + link('consignments', c, api) + ' — ' + esc(c.date + ' ' + win(c)) + ' · ' + esc(c.status) + '</p>'; }).join('') + '</div>' : '') +
          (probs.length ? '<div class="panel"><h3 style="margin-top:0" class="warn">Allocation checks</h3>' + probs.map(function (x) { return '<p class="small">' + link('consignments', x.c, api) + ' (' + esc(x.c.date) + ') — ' + esc(x.msgs.join(' · ')) + '</p>'; }).join('') + '</div>' : '') +
          '<p class="small muted">No live GPS: statuses change when someone updates them here.</p>';
      }
    },
    documents: [
      { id: 'connote', label: 'consignment note', entity: 'consignments', build: function (c, api) {
        var cu = api.get('customers', c.customer) || {}, v = api.get('vehicles', c.vehicle) || {};
        return { title: 'Consignment note', number: c.number, date: c.date, meta: [['Window', win(c)], ['Driver', api.title('drivers', c.driver)], ['Vehicle', v.rego]],
          to: { heading: 'Sender', lines: [cu.name, c.pickupAddress, cu.phone] },
          sections: [
            { heading: 'Deliver to', text: [c.deliveryAddress, c.receiver, c.receiverPhone].filter(Boolean).join('\n') },
            { heading: 'Freight', table: { headers: ['Items', 'Pallets', 'Weight (kg)', 'Cubic (m³)'], rows: [[c.items || '', c.pallets || '', c.weight || '', c.cubic || '']] } },
            c.notes ? { heading: 'Instructions', text: c.notes } : null
          ].filter(Boolean),
          signatures: [{ label: 'Sender' }, { label: 'Driver (picked up)', name: api.title('drivers', c.driver) }, { label: 'Receiver', name: c.podName, image: c.signature, date: c.signedOn }],
          footer: 'Goods received in apparent good order unless noted above.' };
      } },
      { id: 'pod', label: 'proof of delivery', entity: 'consignments', when: function (c) { return c.status === 'Delivered'; }, build: function (c, api) {
        var cu = api.get('customers', c.customer) || {}, ot = L.onTime(c);
        return { title: 'Proof of delivery', number: c.number, date: C.dayOf(c.deliveredAt), meta: [['Delivered at', String(c.deliveredAt || '').replace('T', ' ')], ['Window', win(c)], ['On time', ot ? 'Yes' : 'No'], ['In full', c.inFull === false ? 'No' : 'Yes'], ['Driver', api.title('drivers', c.driver)]],
          to: { heading: 'Customer', lines: [cu.name, cu.email] },
          sections: [{ heading: 'Delivered to', text: [c.deliveryAddress, c.receiver].filter(Boolean).join('\n') }, { heading: 'Freight', text: loadText(c) }, c.notes ? { heading: 'Notes', text: c.notes } : null].filter(Boolean),
          photos: c.photos || [], signatures: [{ label: 'Received by', name: c.podName, image: c.signature, date: c.signedOn || C.dayOf(c.deliveredAt) }] };
      } }
    ],
    tabs: [{ id: 'alloc', label: 'Allocation', after: 'consignments', render: renderAlloc }, { id: 'runs', label: 'Run sheets', after: 'x-alloc', render: renderRuns }, { id: 'perf', label: 'Performance', after: 'exceptions', render: renderPerf }],
    sample: function (today) { return L.sample(today); }
  });

  // ---------- allocation ----------
  var allocDay = null, lastAlloc = null;
  function renderAlloc(el, api) {
    allocDay = allocDay || api.today();
    var all = api.list('consignments'), dr = api.list('drivers'), vs = api.list('vehicles');
    var day = all.filter(function (c) { return c.date === allocDay && c.status !== 'Cancelled'; }).sort(function (a, b) { return String(a.windowFrom || '99').localeCompare(String(b.windowFrom || '99')); });
    var opt = function (list, sel, lab) { return '<option value="">—</option>' + list.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === sel ? ' selected' : '') + '>' + esc(lab(x)) + '</option>'; }).join(''); };
    var h = '<div class="row fg-toolbar"><label for="al-day" style="margin:0">Day</label><input type="date" id="al-day" value="' + esc(allocDay) + '" style="width:auto">' +
      '<button class="btn small" type="button" id="al-prev" aria-label="Previous day">◀</button><button class="btn small" type="button" id="al-next" aria-label="Next day">▶</button>' +
      '<button class="btn primary" type="button" id="al-auto">Auto-allocate this day</button></div>' +
      '<p class="small muted">Auto-allocate fills consignments still "Booked" with no driver or vehicle. It checks licence class and expiry, driver days and leave, rego, vehicle weight and pallet limits (everything on a vehicle that day counted as one load), and one driver per vehicle at a time. It prefers trucks already going out, then the smallest one that fits.</p>';
    if (lastAlloc) h += '<div class="panel"><b>' + lastAlloc.assignments.length + ' allocated.</b>' + (lastAlloc.unassigned.length ? '<ul class="small">' + lastAlloc.unassigned.map(function (u) { return '<li>' + esc(api.title('consignments', u.id)) + ' — ' + esc(u.reason) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
    h += day.length ? '<div class="table-wrap"><table><thead><tr><th>Consignment</th><th>Window</th><th>Load</th><th>Driver</th><th>Vehicle</th><th>Checks</th></tr></thead><tbody>' + day.map(function (c) {
      var k = L.checkAllocation(c, all, dr, vs), locked = ['Delivered', 'Picked up', 'In transit'].indexOf(c.status) >= 0;
      return '<tr><td>' + link('consignments', c, api) + '<div class="small muted">' + esc(api.title('customers', c.customer)) + ' · ' + esc(c.status) + '</div></td><td>' + esc(win(c)) + '</td><td class="small">' + esc(loadText(c)) + '</td>' +
        '<td><select data-al="driver" data-id="' + esc(c.id) + '" aria-label="Driver for ' + esc(c.number) + '"' + (locked ? ' disabled' : '') + ' style="min-width:110px">' + opt(dr.filter(function (d) { return d.active !== false; }), c.driver, function (d) { return d.name + ' (' + d.licenceClass + ')'; }) + '</select></td>' +
        '<td><select data-al="vehicle" data-id="' + esc(c.id) + '" aria-label="Vehicle for ' + esc(c.number) + '"' + (locked ? ' disabled' : '') + ' style="min-width:110px">' + opt(vs.filter(function (v) { return v.active !== false; }), c.vehicle, function (v) { return v.rego + ' (' + v.licenceClass + ')'; }) + '</select></td>' +
        '<td class="small">' + (k.errors.length || k.warnings.length ? k.errors.map(function (x) { return '<div class="bad">✕ ' + esc(x) + '</div>'; }).join('') + k.warnings.map(function (x) { return '<div class="warn">! ' + esc(x) + '</div>'; }).join('') : (c.driver && c.vehicle ? '<span class="ok">✓ OK</span>' : '<span class="muted">Not allocated</span>')) + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<p class="muted">No consignments on this day.</p>';
    // vehicle loads
    var used = vs.filter(function (v) { return day.some(function (c) { return c.vehicle === v.id; }); });
    if (used.length) h += '<h4>Vehicle loads</h4><div class="table-wrap"><table><thead><tr><th>Vehicle</th><th>Driver(s)</th><th class="num">kg</th><th class="num">Pallets</th><th class="num">m³</th></tr></thead><tbody>' + used.map(function (v) {
      var on = day.filter(function (c) { return c.vehicle === v.id; }), ld = L.load(on), drs = on.map(function (c) { return api.title('drivers', c.driver); }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
      var cell = function (val, max) { return '<td class="num ' + (+max && val > +max ? 'bad' : '') + '">' + val + (+max ? ' / ' + max : '') + '</td>'; };
      return '<tr><td>' + esc(v.rego) + '<div class="small muted">' + esc(v.type || '') + '</div></td><td>' + esc(drs.join(', ')) + '</td>' + cell(ld.kg, v.maxKg) + cell(ld.pallets, v.maxPallets) + cell(ld.cubic, v.maxCubic) + '</tr>';
    }).join('') + '</tbody></table></div>';
    el.innerHTML = h;
    var go = function (d) { allocDay = d; lastAlloc = null; renderAlloc(el, api); };
    el.querySelector('#al-day').addEventListener('change', function (e) { if (e.target.value) go(e.target.value); });
    el.querySelector('#al-prev').addEventListener('click', function () { go(C.addDays(allocDay, -1)); });
    el.querySelector('#al-next').addEventListener('click', function () { go(C.addDays(allocDay, 1)); });
    el.querySelector('#al-auto').addEventListener('click', function () {
      var res = L.autoAllocate(api.list('consignments'), dr, vs, allocDay);
      lastAlloc = res;
      api.saveMany('consignments', res.assignments.map(function (a) { return Object.assign({}, api.get('consignments', a.id), { driver: a.driver, vehicle: a.vehicle, status: 'Allocated' }); }));
    });
    B.$$('select[data-al]', el).forEach(function (s) {
      s.addEventListener('change', function () {
        var c = Object.assign({}, api.get('consignments', s.dataset.id)); c[s.dataset.al] = s.value;
        if (c.status === 'Booked' && c.driver && c.vehicle) c.status = 'Allocated'; if (c.status === 'Allocated' && (!c.driver || !c.vehicle)) c.status = 'Booked';
        var k = L.checkAllocation(c, api.list('consignments'), dr, vs);
        if (k.errors.length && !confirm('This breaks a rule:\n\n' + k.errors.join('\n') + '\n\nSave anyway?')) { renderAlloc(el, api); return; }
        lastAlloc = null; api.save('consignments', c);
      });
    });
  }

  // ---------- run sheets ----------
  var rsDay = null, rsDriver = '';
  function renderRuns(el, api) {
    rsDay = rsDay || api.today();
    var dr = api.list('drivers'); if (!rsDriver || !api.get('drivers', rsDriver)) rsDriver = (dr.filter(function (d) { return L.runSheet(api.list('consignments'), d.id, rsDay).length; })[0] || dr[0] || {}).id || '';
    var rows = L.runSheet(api.list('consignments'), rsDriver, rsDay), d = api.get('drivers', rsDriver) || {};
    var vehs = rows.map(function (c) { return (api.get('vehicles', c.vehicle) || {}).rego; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    el.innerHTML = '<div class="row fg-toolbar"><label for="rs-drv" style="margin:0">Driver</label><select id="rs-drv" style="width:auto">' + dr.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === rsDriver ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select>' +
      '<label for="rs-day" style="margin:0">Day</label><input type="date" id="rs-day" value="' + esc(rsDay) + '" style="width:auto">' +
      '<button class="btn primary" type="button" id="rs-print"' + (rows.length ? '' : ' disabled') + '>Print run sheet</button><button class="btn small" type="button" id="rs-csv"' + (rows.length ? '' : ' disabled') + '>CSV</button></div>' +
      (rows.length ? '<p class="small">Vehicle: <b>' + esc(vehs.join(', ') || '–') + '</b> · Load: ' + esc(loadText(L.load(rows))) + '</p><div class="table-wrap"><table><thead><tr><th>#</th><th>Window</th><th>Consignment</th><th>Deliver to</th><th>Freight</th><th>Status</th></tr></thead><tbody>' + rows.map(function (c, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(win(c) || 'any') + '</td><td>' + link('consignments', c, api) + '<div class="small muted">' + esc(api.title('customers', c.customer)) + '</div></td><td>' + esc(c.deliveryAddress) + '<div class="small muted">' + esc([c.receiver, c.receiverPhone].filter(Boolean).join(' · ')) + '</div></td><td class="small">' + esc(loadText(c)) + '</td><td>' + esc(c.status) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="muted">No deliveries for ' + esc(d.name || 'this driver') + ' on this day.</p>');
    el.querySelector('#rs-drv').addEventListener('change', function (e) { rsDriver = e.target.value; renderRuns(el, api); });
    el.querySelector('#rs-day').addEventListener('change', function (e) { if (e.target.value) { rsDay = e.target.value; renderRuns(el, api); } });
    var headers = ['#', 'Window', 'Consignment', 'Customer', 'Pick up', 'Deliver to', 'Receiver', 'Freight', 'Notes', 'Time delivered', 'Received by (name + signature)'];
    var table = rows.map(function (c, i) { return [i + 1, win(c), c.number, api.title('customers', c.customer), c.pickupAddress, c.deliveryAddress, [c.receiver, c.receiverPhone].filter(Boolean).join('\n'), loadText(c), c.notes || '', '', '']; });
    el.querySelector('#rs-print').addEventListener('click', function () {
      api.print({ title: 'Run sheet', number: d.name, date: rsDay, meta: [['Vehicle', vehs.join(', ')], ['Load', loadText(L.load(rows))]], sections: [{ table: { headers: headers, rows: table } }],
        footer: 'Driver: check the vehicle before departure and record each delivery time. Ordered by delivery window.' });
    });
    el.querySelector('#rs-csv').addEventListener('click', function () {
      B.download('run-sheet-' + (d.name || 'driver').replace(/\W+/g, '-') + '-' + rsDay + '.csv', '﻿' + B.csv.stringify(table.map(function (r) { var o = {}; headers.forEach(function (h, i) { o[h] = r[i]; }); return o; }), headers), 'text/csv;charset=utf-8');
    });
  }

  // ---------- performance ----------
  var perf = null;
  function renderPerf(el, api) {
    if (!perf) perf = { from: C.addDays(api.today(), -30), to: api.today() };
    var cons = api.list('consignments'), ex = api.list('exceptions'), tot = L.otif(cons, ex, perf.from, perf.to);
    var rows = L.otifByCustomer(cons, ex, perf.from, perf.to).map(function (r) { return { Customer: api.title('customers', r.customer), Due: r.due, Delivered: r.delivered, 'On time': pct(r.onTimePct), 'In full': pct(r.inFullPct), OTIF: pct(r.otifPct), 'With exceptions': r.exceptions, 'Exception rate': pct(r.exceptionRate) }; });
    var cols = ['Customer', 'Due', 'Delivered', 'On time', 'In full', 'OTIF', 'With exceptions', 'Exception rate'];
    rows.push({ Customer: 'All customers', Due: tot.due, Delivered: tot.delivered, 'On time': pct(tot.onTimePct), 'In full': pct(tot.inFullPct), OTIF: pct(tot.otifPct), 'With exceptions': tot.exceptions, 'Exception rate': pct(tot.exceptionRate) });
    el.innerHTML = '<div class="row fg-toolbar"><label for="pf-from" style="margin:0">From</label><input type="date" id="pf-from" value="' + esc(perf.from) + '" style="width:auto"><label for="pf-to" style="margin:0">to</label><input type="date" id="pf-to" value="' + esc(perf.to) + '" style="width:auto">' +
      '<button class="btn small" type="button" id="pf-csv">Download CSV</button><button class="btn small" type="button" id="pf-print">Print</button></div>' +
      '<div class="stat-row"><div class="stat"><div class="k">OTIF</div><div class="v">' + esc(pct(tot.otifPct)) + '</div></div><div class="stat"><div class="k">On time</div><div class="v">' + esc(pct(tot.onTimePct)) + '</div></div><div class="stat"><div class="k">In full</div><div class="v">' + esc(pct(tot.inFullPct)) + '</div></div><div class="stat"><div class="k">Exception rate</div><div class="v">' + esc(pct(tot.exceptionRate)) + '</div></div></div>' +
      B.table(rows, cols.map(function (c) { return { key: c, label: c }; })) +
      '<p class="small muted">On time = delivered on the day and by the end of the window (or earlier). In full = "delivered in full" ticked and no "Damaged" or "Short / missing items" exception. OTIF counts delivered consignments only; exception rate counts every consignment due in the range.</p>';
    var re = function () { perf = { from: el.querySelector('#pf-from').value || perf.from, to: el.querySelector('#pf-to').value || perf.to }; renderPerf(el, api); };
    el.querySelector('#pf-from').addEventListener('change', re); el.querySelector('#pf-to').addEventListener('change', re);
    el.querySelector('#pf-csv').addEventListener('click', function () { B.download('otif-' + perf.from + '-to-' + perf.to + '.csv', '﻿' + B.csv.stringify(rows, cols), 'text/csv;charset=utf-8'); });
    el.querySelector('#pf-print').addEventListener('click', function () { api.print({ title: 'Delivery performance', date: perf.from + ' to ' + perf.to, sections: [{ table: { headers: cols, rows: rows.map(function (r) { return cols.map(function (c) { return r[c]; }); }) } }] }); });
  }
})();
