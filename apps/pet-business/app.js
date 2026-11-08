/* Pet Business Manager — ProductForge config plus Today sheet, customer history and pupdates. */
(function () {
  'use strict';
  var L = window.PetLib, C = window.ForgeCore, B = window.B, esc = C.esc;
  var app = null; // set when Forge.app returns (used by form validation only)
  var petName = function (api, id) { return api.title('pets', id); };
  var svcOf = function (api, id) { return api.get('services', id); };
  var svcName = function (api, id) { var s = svcOf(api, id); return s ? s.name : 'Visit'; };
  var staffName = function (api, id) { return api.title('staff', id); };
  var money = function (v) { return B.fmt.money(v); };
  var STATUS = ['Booked', 'Checked in', { value: 'Done', label: 'Done', tone: 'ok' }, 'Cancelled', { value: 'No-show', label: 'No-show', tone: 'bad' }];
  var sizeFields = function (prefix, label, type) { return L.SIZES.map(function (s) { return { key: prefix + s, label: label + ' — ' + s.toLowerCase(), type: type, min: 0 }; }); };

  // Fill price, length and checklist from the pet's size and the service.
  function fillFromService(r, api) {
    var p = api.get('pets', r.pet), s = svcOf(api, r.service); if (!s) return;
    var pf = L.priceFor(s, L.sizeFor(p && p.weight));
    r.hours = C.r2(pf.minutes / 60); r.price = r.package ? 0 : pf.price;
    if (!(r.checklist || []).some(function (i) { return i.done; })) r.checklist = L.checklistFor(s.kind);
  }
  // Keep pet.lastGroom and package counts in step after a booking changes.
  function afterBooking(b, api) {
    var p = api.get('pets', b.pet);
    if (p) { var lg = L.lastGroom(p.id, api.list('bookings'), api.list('services')); if (lg && lg !== p.lastGroom) api.save('pets', Object.assign({}, p, { lastGroom: lg }), true); }
    if (b.package) { var k = api.get('packages', b.package); if (k) api.save('packages', k, true); }
  }
  function vaxPill(api, b) {
    var issues = L.vaxIssues(b.pet, api.list('vaccinations'), C.dayOf(b.start));
    return issues.length ? '<span class="pill-bad" title="' + esc(issues.map(function (i) { return i.type + ' due ' + i.due; }).join('; ')) + '">Vaccination overdue</span>' : '';
  }

  app = Forge.app({
    id: 'pet-business', name: 'Pet Business', mount: '#app', quickAdd: ['bookings', 'owners'],
    entities: {
      bookings: {
        label: 'Bookings', single: 'Booking', board: 'status', calendar: ['start'], durationField: 'hours', recurring: 'start',
        recurringReset: { status: 'Booked' }, recurringClear: ['report', 'mood', 'invoice', 'signedOn'], sort: { key: 'start', dir: 'desc' },
        title: function (r, api) { return petName(api, r.pet) + ' · ' + svcName(api, r.service) + ' · ' + String(r.start || '').replace('T', ' '); },
        list: ['start', 'pet', 'service', 'staff', 'status', 'price'], listTotals: ['price'], cardFields: ['start', 'service', 'staff'],
        fields: [
          { key: 'pet', label: 'Pet', type: 'link', entity: 'pets', required: true, filter: true },
          { key: 'service', label: 'Service', type: 'link', entity: 'services', required: true, filter: true },
          { key: 'staff', label: 'Staff member', type: 'link', entity: 'staff', filter: true },
          { key: 'start', label: 'Start', type: 'datetime', required: true },
          { key: 'hours', label: 'Length (hours)', type: 'number', min: 0.25, max: 24, default: 1, refresh: true, help: 'Filled from the service and the pet\'s size.' },
          { key: 'price', label: 'Price incl. GST', type: 'money', min: 0, refresh: true, help: 'Filled from the service and size. $0 when paid by a package.' },
          { key: 'package', label: 'Paid from package', type: 'link', entity: 'packages', refresh: true },
          { key: 'groupOk', label: 'Group walk — may overlap other group bookings for this staff member', type: 'checkbox', full: true },
          { key: 'status', label: 'Status', type: 'select', required: true, options: STATUS },
          { key: 'notes', label: 'Booking notes', type: 'longtext' },
          { key: 'checklist', label: 'Visit checklist', type: 'checklist', groups: false, refresh: true },
          { key: 'mood', label: 'Mood', type: 'select', options: ['Happy', 'Excited', 'Calm', 'Tired', 'Shy', 'Anxious', 'Grumpy'] },
          { key: 'report', label: 'Visit report (goes on the pupdate)', type: 'longtext' },
          { key: 'photos', label: 'Photos', type: 'photos' },
          { key: 'invoice', label: 'Invoice', type: 'link', entity: 'invoices', addFrom: false }
        ],
        onNew: function (r, api) { if (r.pet && r.service) fillFromService(r, api); },
        onLinkChange: function (r, key, api) {
          if (key === 'package') { var k = api.get('packages', r.package); if (k && k.service && !r.service) r.service = k.service; }
          if (key === 'pet' || key === 'service' || key === 'package') fillFromService(r, api);
        },
        validate: function (r) {
          if (!app) return {};
          var e = {}, cl = L.clashFor(r, app.list('bookings'));
          if (cl.length) e.start = staffName(app, r.staff) + ' is already booked then: ' + cl.map(function (o) { return app.title('bookings', o); }).join('; ') + '. Change the time or staff member (or tick "Group walk" on both).';
          if (r.package) {
            var k = app.get('packages', r.package), was = app.get('bookings', r.id);
            if (k && (!was || was.package !== k.id) && L.packageUse(k, app.list('bookings'), app.today()).remaining <= 0) e.package = 'No visits left on ' + k.name + ' — sell a new pass or charge this visit.';
          }
          return e;
        },
        afterSave: afterBooking,
        onStatus: function (r, v, api) { setTimeout(function () { afterBooking(api.get('bookings', r.id) || r, api); }, 0); },
        actions: [
          { label: 'Check in', when: function (b) { return b.status === 'Booked'; }, run: function (b, api) { api.save('bookings', Object.assign({}, b, { status: 'Checked in' })); } },
          { label: 'Finish & write report', when: function (b) { return b.status === 'Booked' || b.status === 'Checked in'; }, run: function (b, api) { api.edit('bookings', b, { status: 'Done' }); } },
          { label: 'Copy pupdate text', when: function (b) { return b.status === 'Done'; }, run: function (b, api) {
            B.copy(L.pupdateText(b, api.get('pets', b.pet), svcName(api, b.service), staffName(api, b.staff), (api.business() || {}).name));
          } }
        ],
        detailExtra: function (el, b, api) {
          var p = api.get('pets', b.pet) || {}, o = api.get('owners', p.owner) || {}, cl = L.clashFor(b, api.list('bookings'));
          var issues = L.vaxIssues(b.pet, api.list('vaccinations'), C.dayOf(b.start));
          el.innerHTML = '<p class="small">' +
            (issues.length ? '<span class="pill-bad">Vaccination overdue</span> ' + esc(issues.map(function (i) { return i.type + ' (due ' + i.due + ')'; }).join('; ')) + '<br>' : '') +
            (cl.length ? '<span class="pill-warn">Double booked</span> overlaps ' + esc(cl.map(function (x) { return api.title('bookings', x); }).join('; ')) + '<br>' : '') +
            (p.allergies ? 'Allergies: <b>' + esc(p.allergies) + '</b><br>' : '') + (p.behaviour ? 'Behaviour: ' + esc(p.behaviour) + '<br>' : '') +
            (o.phone ? 'Owner: ' + esc(o.name) + ' <a href="tel:' + esc(String(o.phone).replace(/\s/g, '')) + '">' + esc(o.phone) + '</a>' : '') +
            (o.access ? '<br>Access: ' + esc(o.access) : '') + '</p>';
        }
      },
      owners: {
        label: 'Owners', single: 'Owner', title: 'name', list: ['name', 'phone', 'email', 'vet'],
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'phone', label: 'Phone', type: 'phone' },
          { key: 'email', label: 'Email', type: 'email' },
          { key: 'address', label: 'Address', type: 'text' },
          { key: 'emergencyName', label: 'Emergency contact', type: 'text' },
          { key: 'emergencyPhone', label: 'Emergency phone', type: 'phone' },
          { key: 'vet', label: 'Usual vet clinic', type: 'text' },
          { key: 'vetPhone', label: 'Vet phone', type: 'phone' },
          { key: 'access', label: 'Access notes (keys, gate codes, alarm)', type: 'longtext' },
          { key: 'notes', label: 'Notes', type: 'longtext' }
        ],
        actions: [{ label: 'Invoice unbilled visits', run: function (o, api) {
          var bks = L.unbilled(o.id, api.list('pets'), api.list('bookings'));
          if (!bks.length) return api.toast('No finished visits waiting to be invoiced');
          var inv = { id: C.uid(), number: C.nextNumber(api.list('invoices').map(function (i) { return i.number; }), 'INV-'), owner: o.id, issued: api.today(), due: C.addDays(api.today(), 7), gst: true,
            lines: L.invoiceLines(bks, function (id) { return petName(api, id); }, function (id) { return svcName(api, id); }), amountPaid: 0, status: 'Unpaid' };
          api.save('invoices', inv, true);
          bks.forEach(function (b) { api.save('bookings', Object.assign({}, b, { invoice: inv.id }), true); });
          api.toast('Invoice ' + inv.number + ' created for ' + bks.length + ' visit(s)'); api.open('invoices', inv.id);
        } }],
        detailExtra: function (el, o, api) {
          var h = L.ownerHistory(o.id, api.list('pets'), api.list('bookings'), api.list('packages'), api.list('services'), api.today());
          el.innerHTML = '<p class="small">Visits: <b>' + h.visits + '</b> · Spend: <b>' + esc(money(h.spend)) + '</b> · Last visit: <b>' + esc(h.last || '–') + '</b> · Upcoming: <b>' + h.upcoming + '</b>' + (h.noShows ? ' · <span class="pill-warn">' + h.noShows + ' no-show(s)</span>' : '') + '</p>';
        }
      },
      pets: {
        label: 'Pets', single: 'Pet', title: 'name', list: ['name', 'owner', 'species', 'breed', 'size', 'nextGroom'],
        fields: [
          { key: 'name', label: 'Pet name', type: 'text', required: true },
          { key: 'owner', label: 'Owner', type: 'link', entity: 'owners', required: true, filter: true },
          { key: 'species', label: 'Species', type: 'select', options: ['Dog', 'Cat', 'Rabbit', 'Other'], default: 'Dog' },
          { key: 'breed', label: 'Breed', type: 'text' },
          { key: 'dob', label: 'Date of birth (approx. is fine)', type: 'date' },
          { key: 'weight', label: 'Weight (kg)', type: 'number', min: 0, max: 120 },
          { key: 'size', label: 'Size (from weight)', type: 'text', compute: function (r) { return L.sizeFor(r.weight); } },
          { key: 'sex', label: 'Sex', type: 'select', options: ['Male', 'Female'] },
          { key: 'desexed', label: 'Desexed', type: 'checkbox' },
          { key: 'microchip', label: 'Microchip number', type: 'text' },
          { key: 'temperament', label: 'Temperament', type: 'multiselect', options: ['Friendly', 'Shy', 'Reactive to dogs', 'Reactive to people', 'Nippy when handled', 'Pulls on lead', 'Escape artist'] },
          { key: 'behaviour', label: 'Behaviour notes', type: 'longtext' },
          { key: 'allergies', label: 'Allergies', type: 'text' },
          { key: 'medical', label: 'Medical / medication', type: 'longtext' },
          { key: 'groomWeeks', label: 'Groom every (weeks)', type: 'number', min: 1, max: 26, default: 6 },
          { key: 'lastGroom', label: 'Last groom', type: 'date', help: 'Updated automatically when a groom booking is marked Done.' },
          { key: 'nextGroom', label: 'Next groom due', type: 'date', compute: function (r) { return L.nextGroom(r.lastGroom, r.groomWeeks); } },
          { key: 'photos', label: 'Photos', type: 'photos' }
        ],
        actions: [{ label: 'Book', run: function (p, api) { var s = api.list('services')[0]; var r = { pet: p.id, service: s ? s.id : '', start: C.addDays(api.today(), 1) + 'T09:00', status: 'Booked' }; fillFromService(r, api); api.edit('bookings', null, r); } }],
        detailExtra: function (el, p, api) {
          var a = L.age(p.dob, api.today()), issues = L.vaxIssues(p.id, api.list('vaccinations'), api.today()), latest = L.latestVaccinations(api.list('vaccinations'), p.id);
          el.innerHTML = '<p class="small">' + (a.text ? 'Age: <b>' + esc(a.text) + '</b><br>' : '') +
            (Object.keys(latest).length ? 'Vaccinations: ' + Object.keys(latest).map(function (t) { var d = L.dueOf(latest[t]); return esc(t) + ' — due ' + esc(d) + (d < api.today() ? ' <span class="pill-bad">overdue</span>' : ''); }).join('<br>') : '<span class="pill-warn">No vaccination on file</span>') +
            (issues.length ? '<br><b class="bad">Ask the owner for an updated certificate before the next visit.</b>' : '') + '</p>';
        }
      },
      vaccinations: {
        label: 'Vaccinations', single: 'Vaccination', calendar: ['due'], sort: { key: 'due', dir: 'asc' },
        title: function (r, api) { return petName(api, r.pet) + ' · ' + String(r.type || '').split(' (')[0]; },
        list: ['pet', 'type', 'given', 'due', 'replaced'],
        fields: [
          { key: 'pet', label: 'Pet', type: 'link', entity: 'pets', required: true, filter: true },
          { key: 'type', label: 'Vaccine', type: 'select', required: true, options: Object.keys(L.VACCINES) },
          { key: 'given', label: 'Date given', type: 'date', required: true },
          { key: 'due', label: 'Next due', type: 'date', help: 'Leave empty to use the usual interval (C3 every 3 years, others yearly). The vet certificate date is best.' },
          { key: 'vetName', label: 'Vet clinic', type: 'text' },
          { key: 'certificate', label: 'Certificate photo', type: 'photos' },
          { key: 'replaced', label: 'Replaced by a newer record', type: 'checkbox', hidden: true }
        ],
        validate: function (r) { return r.due && r.given && r.due <= r.given ? { due: 'Next due must be after the date given' } : {}; },
        beforeSave: function (r) { if (!r.due && r.given) r.due = L.vaccineDue(r.type, r.given); },
        afterSave: function (v, api) { var ids = L.replacedIds(api.list('vaccinations'), v); if (ids.length) api.saveMany('vaccinations', ids.map(function (id) { return Object.assign({}, api.get('vaccinations', id), { replaced: true }); })); }
      },
      services: {
        label: 'Services', single: 'Service', title: 'name', list: ['name', 'kind', 'priceSmall', 'priceMedium', 'priceLarge', 'priceGiant'],
        fields: [
          { key: 'name', label: 'Service', type: 'text', required: true },
          { key: 'kind', label: 'Kind', type: 'select', required: true, options: ['Groom', 'Walk', 'Sitting', 'Daycare', 'Other'], help: 'Sets the visit checklist. "Groom" bookings update the pet\'s last-groom date.' }
        ].concat(sizeFields('price', 'Price incl. GST', 'money')).concat(sizeFields('mins', 'Minutes', 'number'))
      },
      staff: {
        label: 'Staff', single: 'Staff member', title: 'name', list: ['name', 'role', 'phone'],
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'role', label: 'Role', type: 'text', placeholder: 'e.g. Groomer, Walker' },
          { key: 'phone', label: 'Phone', type: 'phone' }
        ]
      },
      packages: {
        label: 'Packages', single: 'Package', title: function (r, api) { return (r.name || 'Package') + ' · ' + api.title('owners', r.owner); },
        list: ['name', 'owner', 'visits', 'remaining', 'expires'],
        fields: [
          { key: 'name', label: 'Package', type: 'text', required: true, default: '10-walk pass' },
          { key: 'owner', label: 'Owner', type: 'link', entity: 'owners', required: true },
          { key: 'pet', label: 'Pet (optional)', type: 'link', entity: 'pets', addFrom: false },
          { key: 'service', label: 'Service it covers', type: 'link', entity: 'services', addFrom: false },
          { key: 'visits', label: 'Visits included', type: 'number', min: 1, max: 200, required: true, default: 10 },
          { key: 'price', label: 'Price paid incl. GST', type: 'money', min: 0 },
          { key: 'bought', label: 'Bought on', type: 'date', default: 'today' },
          { key: 'expires', label: 'Expires', type: 'date', default: function (t) { return C.addMonths(t, 6); } },
          { key: 'remaining', label: 'Visits left', type: 'number', compute: function (r, api) { return api && api.list ? L.packageUse(r, api.list('bookings')).remaining : null; } }
        ],
        detailExtra: function (el, k, api) {
          var u = L.packageUse(k, api.list('bookings'), api.today());
          el.innerHTML = '<p class="small">Used <b>' + u.used + '</b> of ' + (+k.visits || 0) + ' · <b>' + u.remaining + ' left</b>' + (u.over ? ' · <span class="pill-bad">' + u.over + ' over the pass</span>' : '') + (u.expired ? ' · <span class="pill-warn">Expired</span>' : '') + '</p>';
        }
      },
      invoices: {
        label: 'Invoices', single: 'Invoice', title: 'number', board: 'status', calendar: ['due'], sort: { key: 'number', dir: 'desc' },
        list: ['number', 'owner', 'issued', 'due', 'status', 'total'], listTotals: ['total'],
        fields: [
          { key: 'number', label: 'Invoice number', type: 'text', required: true },
          { key: 'owner', label: 'Owner', type: 'link', entity: 'owners', required: true },
          { key: 'issued', label: 'Issued', type: 'date', default: 'today' },
          { key: 'due', label: 'Due', type: 'date', default: function (t) { return C.addDays(t, 7); } },
          { key: 'lines', label: 'Items (prices incl. GST)', type: 'lines' },
          { key: 'gst', label: 'Registered for GST (price includes 1/11 GST)', type: 'checkbox', default: true },
          { key: 'total', label: 'Total', type: 'money', compute: function (r) { return L.invoiceTotals(r.lines, r.gst).total; } },
          { key: 'amountPaid', label: 'Amount paid', type: 'money', min: 0, default: 0 },
          { key: 'paidOn', label: 'Paid on', type: 'date' },
          { key: 'status', label: 'Payment', type: 'select', options: ['Unpaid', 'Part paid', { value: 'Overdue', label: 'Overdue', tone: 'bad' }, { value: 'Paid', label: 'Paid', tone: 'ok' }], help: 'Set automatically from the amount paid and due date.' },
          { key: 'notes', label: 'Notes', type: 'longtext' }
        ],
        onNew: function (r, api) { r.number = C.nextNumber(api.list('invoices').map(function (i) { return i.number; }), 'INV-'); },
        beforeSave: function (r, api) { r.status = L.invoiceStatus(r, api.today()); if (r.status === 'Paid' && !r.paidOn) r.paidOn = api.today(); },
        onStatus: function (r, v, api) { if (v === 'Paid') { r.amountPaid = L.invoiceTotals(r.lines, r.gst).total; r.paidOn = r.paidOn || api.today(); } },
        actions: [{ label: 'Mark paid in full', when: function (i) { return i.status !== 'Paid'; }, run: function (i, api) { api.save('invoices', Object.assign({}, i, { amountPaid: L.invoiceTotals(i.lines, i.gst).total, paidOn: api.today(), status: 'Paid' })); } }]
      }
    },
    reminders: [
      { entity: 'vaccinations', date: 'due', warnDays: 30, pastDays: 365, label: function (v) { return String(v.type).split(' (')[0] + ' vaccination due'; }, ruleText: '30 days before a vaccination is due (newest record per vaccine)', when: function (v) { return !v.replaced; } },
      { entity: 'pets', date: 'nextGroom', warnDays: 7, pastDays: 60, label: 'Due for next groom — offer a booking', ruleText: 'Last groom + the pet\'s groom interval (6–8 weeks)' },
      { entity: 'bookings', date: 'start', warnDays: 1, pastDays: 3, label: 'Booking', when: function (b) { return b.status === 'Booked'; } },
      { entity: 'invoices', date: 'due', warnDays: 3, label: 'Invoice due — chase payment', when: function (i) { return i.status !== 'Paid'; } },
      { entity: 'packages', date: 'expires', warnDays: 14, label: 'Package expiring with visits left', when: function (k) { return +k.remaining > 0; } }
    ],
    dashboard: {
      tiles: [
        { label: 'Bookings today', value: function (api) { var t = api.today(); return api.list('bookings').filter(function (b) { return C.dayOf(b.start) === t && b.status !== 'Cancelled'; }).length; } },
        { label: 'Takings this month', value: function (api) { var m = api.today().slice(0, 7); return api.list('bookings').filter(function (b) { return b.status === 'Done' && String(b.start).slice(0, 7) === m; }).reduce(function (s, b) { return s + (+b.price || 0); }, 0) + api.list('packages').filter(function (k) { return String(k.bought).slice(0, 7) === m; }).reduce(function (s, k) { return s + (+k.price || 0); }, 0); }, fmt: 'money' },
        { label: 'Upcoming bookings: vaccination overdue', value: function (api) { var t = api.today(); return api.list('bookings').filter(function (b) { return b.status === 'Booked' && C.dayOf(b.start) >= t && L.vaxIssues(b.pet, api.list('vaccinations'), C.dayOf(b.start)).length; }).length; }, tone: function (v) { return v ? 'bad' : ''; } },
        { label: 'Double bookings', value: function (api) { return L.clashes(api.list('bookings').filter(function (b) { return C.dayOf(b.start) >= api.today(); })).length; }, tone: function (v) { return v ? 'warn' : ''; } },
        { label: 'Due for a groom (7 days)', entity: 'pets', kind: 'count', where: function (p, t) { return p.nextGroom && p.nextGroom <= C.addDays(t, 7); }, tone: function (v) { return v ? 'warn' : ''; } },
        { label: 'Owed to you', value: function (api) { return api.list('invoices').filter(function (i) { return i.status !== 'Paid'; }).reduce(function (s, i) { return s + L.invoiceTotals(i.lines, i.gst).total - (+i.amountPaid || 0); }, 0); }, fmt: 'money' }
      ],
      charts: [
        { title: 'Bookings by service (last 60 days and upcoming)', entity: 'bookings', by: 'service', where: function (b, t) { return C.dayOf(b.start) >= C.addDays(t, -60) && b.status !== 'Cancelled'; } },
        { title: 'Takings by staff member (done, 60 days)', entity: 'bookings', by: 'staff', sum: 'price', fmt: 'money', where: function (b, t) { return b.status === 'Done' && C.dayOf(b.start) >= C.addDays(t, -60); } }
      ],
      render: function (el, api) {
        var t = api.today(), bk = api.list('bookings');
        var flagged = bk.filter(function (b) { return b.status === 'Booked' && C.dayOf(b.start) >= t && L.vaxIssues(b.pet, api.list('vaccinations'), C.dayOf(b.start)).length; });
        var cl = L.clashes(bk.filter(function (b) { return C.dayOf(b.start) >= t; }));
        var link = function (b) { return '<button type="button" class="fg-linkbtn" data-open="bookings" data-id="' + esc(b.id) + '">' + esc(api.title('bookings', b)) + '</button>'; };
        el.innerHTML = (flagged.length ? '<div class="panel"><h3 style="margin-top:0" class="bad">Bookings for pets with overdue vaccinations</h3>' + flagged.map(function (b) { return '<p class="small">' + link(b) + ' — ' + esc(L.vaxIssues(b.pet, api.list('vaccinations'), C.dayOf(b.start)).map(function (i) { return i.type.split(' (')[0] + ' due ' + i.due; }).join(', ')) + '</p>'; }).join('') + '</div>' : '') +
          (cl.length ? '<div class="panel"><h3 style="margin-top:0" class="warn">Double bookings</h3>' + cl.map(function (p) { var a = api.get('bookings', p[0]), b = api.get('bookings', p[1]); return '<p class="small">' + esc(staffName(api, a.staff)) + ': ' + link(a) + ' overlaps ' + link(b) + '</p>'; }).join('') + '</div>' : '');
      }
    },
    documents: [
      { id: 'pupdate', label: 'pupdate', entity: 'bookings', build: function (b, api) {
        var p = api.get('pets', b.pet) || {};
        return { title: 'Pupdate', number: p.name, date: C.dayOf(b.start), intro: 'Here\'s how ' + (p.name || 'your pet') + '\'s visit went today.',
          meta: [['Service', svcName(api, b.service)], ['Time', C.timeOf(b.start)], ['With', staffName(api, b.staff)], ['Mood', b.mood]],
          to: { heading: 'For', lines: [api.title('owners', p.owner)] },
          sections: [(b.checklist || []).length ? { heading: 'What we did', checklist: b.checklist } : null, b.report ? { heading: 'Notes', text: b.report } : null].filter(Boolean),
          photos: b.photos || [], footer: 'Thanks for trusting us with ' + (p.name || 'your pet') + '!' };
      } },
      { id: 'profile', label: 'pet profile', entity: 'pets', build: function (p, api) {
        var o = api.get('owners', p.owner) || {}, latest = L.latestVaccinations(api.list('vaccinations'), p.id);
        return { title: 'Pet profile', number: p.name, date: api.today(),
          meta: [['Species', p.species], ['Breed', p.breed], ['Age', L.age(p.dob, api.today()).text], ['Weight', p.weight ? p.weight + ' kg (' + L.sizeFor(p.weight) + ')' : ''], ['Microchip', p.microchip]],
          to: { heading: 'Owner', lines: [o.name, o.phone, o.address, o.emergencyName ? 'Emergency: ' + o.emergencyName + ' ' + (o.emergencyPhone || '') : '', o.vet ? 'Vet: ' + o.vet + ' ' + (o.vetPhone || '') : ''] },
          sections: [
            { heading: 'Care notes', table: { headers: ['', ''], rows: [['Temperament', (p.temperament || []).join(', ')], ['Behaviour', p.behaviour], ['Allergies', p.allergies], ['Medical', p.medical], ['Access', o.access]] } },
            { heading: 'Vaccinations', table: { headers: ['Vaccine', 'Given', 'Next due'], rows: Object.keys(latest).map(function (t) { return [t, latest[t].given, L.dueOf(latest[t])]; }) } }
          ], photos: (p.photos || []).slice(0, 2) };
      } },
      { id: 'invoice', label: 'invoice', entity: 'invoices', build: function (i, api) {
        var o = api.get('owners', i.owner) || {};
        return { title: i.gst !== false ? 'Tax invoice' : 'Invoice', number: i.number, date: i.issued, meta: [['Due', i.due], ['Status', i.status]],
          to: { heading: 'Bill to', lines: [o.name, o.address, o.email] }, lines: i.lines || [], totals: L.invoiceTotals(i.lines, i.gst), gst: i.gst !== false,
          paid: +i.amountPaid || 0, notes: i.notes, footer: i.gst !== false ? 'Prices include GST.' : '' };
      } }
    ],
    tabs: [{ id: 'today', label: 'Day sheet', after: 'bookings', render: renderDay }, { id: 'history', label: 'Customer history', after: 'owners', render: renderHistory }],
    sample: function (today) { return L.sample(today); },
    afterSample: function (api) { api.list('packages').forEach(function (k) { api.save('packages', k, true); }); }
  });

  // ---------- day sheet ----------
  var day = null;
  function renderDay(el, api) {
    day = day || api.today();
    var rows = api.list('bookings').filter(function (b) { return C.dayOf(b.start) === day && b.status !== 'Cancelled'; }).sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
    var info = function (b) { var p = api.get('pets', b.pet) || {}, o = api.get('owners', p.owner) || {}; return { p: p, o: o }; };
    el.innerHTML = '<div class="row fg-toolbar"><label for="pd-day" style="margin:0">Day</label><input type="date" id="pd-day" value="' + esc(day) + '" style="width:auto">' +
      '<button class="btn small" type="button" id="pd-prev" aria-label="Previous day">◀</button><button class="btn small" type="button" id="pd-next" aria-label="Next day">▶</button><button class="btn small" type="button" id="pd-today">Today</button>' +
      '<button class="btn primary" type="button" id="pd-print"' + (rows.length ? '' : ' disabled') + '>Print day sheet</button></div>' +
      (rows.length ? '<div class="table-wrap"><table><thead><tr><th>Time</th><th>Pet</th><th>Service</th><th>Staff</th><th>Care notes</th><th>Status</th></tr></thead><tbody>' + rows.map(function (b) {
        var x = info(b), cl = L.clashFor(b, api.list('bookings'));
        return '<tr><td>' + esc(C.timeOf(b.start)) + '<div class="small muted">' + esc(b.hours) + ' h</div></td><td><button type="button" class="fg-linkbtn" data-open="bookings" data-id="' + esc(b.id) + '">' + esc(x.p.name || '?') + '</button><div class="small muted">' + esc([x.p.breed, x.o.name].filter(Boolean).join(' · ')) + '</div></td>' +
          '<td>' + esc(svcName(api, b.service)) + (b.package ? '<div class="small muted">package</div>' : '') + '</td><td>' + esc(staffName(api, b.staff)) + (cl.length ? ' <span class="pill-warn">clash</span>' : '') + '</td>' +
          '<td class="small">' + vaxPill(api, b) + ' ' + esc([(x.p.temperament || []).join(', '), x.p.allergies ? 'Allergies: ' + x.p.allergies : '', x.p.behaviour].filter(Boolean).join(' · ')) + '</td><td>' + esc(b.status) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="muted">No bookings on this day.</p>');
    var go = function (d) { day = d; renderDay(el, api); };
    el.querySelector('#pd-day').addEventListener('change', function (e) { if (e.target.value) go(e.target.value); });
    el.querySelector('#pd-prev').addEventListener('click', function () { go(C.addDays(day, -1)); });
    el.querySelector('#pd-next').addEventListener('click', function () { go(C.addDays(day, 1)); });
    el.querySelector('#pd-today').addEventListener('click', function () { go(api.today()); });
    el.querySelector('#pd-print').addEventListener('click', function () {
      api.print({ title: 'Day sheet', date: day, sections: [{ table: { headers: ['Time', 'Pet', 'Owner / phone', 'Service', 'Staff', 'Care notes', 'Done'], rows: rows.map(function (b) {
        var x = info(b), v = L.vaxIssues(b.pet, api.list('vaccinations'), day);
        return [C.timeOf(b.start), x.p.name + (x.p.breed ? ' (' + x.p.breed + ')' : ''), [x.o.name, x.o.phone, x.o.access].filter(Boolean).join('\n'), svcName(api, b.service), staffName(api, b.staff),
          [v.length ? 'VACCINATION OVERDUE' : '', x.p.allergies ? 'Allergies: ' + x.p.allergies : '', x.p.behaviour].filter(Boolean).join('\n'), '☐'];
      }) } }] });
    });
  }

  // ---------- customer history ----------
  function renderHistory(el, api) {
    var t = api.today(), rows = api.list('owners').map(function (o) {
      var h = L.ownerHistory(o.id, api.list('pets'), api.list('bookings'), api.list('packages'), api.list('services'), t);
      return { id: o.id, name: o.name, pets: h.pets.map(function (p) { return p.name; }).join(', '), visits: h.visits, spend: h.spend, last: h.last, upcoming: h.upcoming, noShows: h.noShows,
        groom: h.pets.filter(function (p) { return p.nextGroom; }).map(function (p) { return p.name + ' ' + p.nextGroom + (p.nextGroom < t ? ' (overdue)' : ''); }).join('; ') };
    }).sort(function (a, b) { return b.spend - a.spend; });
    var cols = ['Owner', 'Pets', 'Visits', 'Spend', 'Last visit', 'Upcoming', 'No-shows', 'Next groom due'];
    el.innerHTML = '<div class="row fg-toolbar"><button class="btn small" type="button" id="ph-csv">Download CSV</button></div>' +
      '<div class="table-wrap"><table><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr><td><button type="button" class="fg-linkbtn" data-open="owners" data-id="' + esc(r.id) + '">' + esc(r.name) + '</button></td><td>' + esc(r.pets) + '</td><td class="num">' + r.visits + '</td><td class="num">' + esc(money(r.spend)) + '</td><td>' + esc(r.last || '–') + '</td><td class="num">' + r.upcoming + '</td><td class="num">' + r.noShows + '</td><td class="small">' + esc(r.groom) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="small muted">Spend = finished pay-per-visit bookings plus packages bought. Next groom = last finished groom + each pet\'s groom interval.</p>';
    el.querySelector('#ph-csv').addEventListener('click', function () {
      B.download('pet-customer-history.csv', '﻿' + B.csv.stringify(rows.map(function (r) { return { Owner: r.name, Pets: r.pets, Visits: r.visits, Spend: r.spend, 'Last visit': r.last, Upcoming: r.upcoming, 'No-shows': r.noShows, 'Next groom due': r.groom }; }), cols), 'text/csv;charset=utf-8');
    });
  }
})();
