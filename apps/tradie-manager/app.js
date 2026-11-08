/* Tradie Business Manager — a ProductForge config plus trade-specific extras. */
(function () {
  'use strict';
  var L = window.TradieLib, C = window.ForgeCore, esc = C.esc;
  var JOB_STATUS = ['Enquiry', 'Quoted', 'Scheduled', 'In progress', { value: 'Done', label: 'Done', tone: 'ok' }, { value: 'Invoiced', label: 'Invoiced', tone: 'warn' }, { value: 'Paid', label: 'Paid', tone: 'ok' }, 'Cancelled'];
  var pricing = function (lab) {
    return [
      { key: 'labourHours', label: 'Labour hours', type: 'number', min: 0 },
      { key: 'labourRate', label: 'Labour rate ($/h, ex GST)', type: 'money', min: 0, default: 110 },
      { key: 'materials', label: 'Materials (at your cost)', type: 'lines' },
      { key: 'markupPct', label: 'Markup on materials %', type: 'number', min: 0, max: 500, default: 15 },
      { key: 'calloutFee', label: 'Call-out fee', type: 'money', min: 0, default: 0 },
      { key: 'gst', label: 'Add GST (10%)', type: 'checkbox', default: true },
      { key: 'total', label: lab, type: 'money', compute: function (r) { return L.quoteTotals(r).total; } }
    ];
  };
  var jobLabel = function (api, id) { var j = api.get('jobs', id); return j ? j.title : ''; };
  var jobCustomer = function (api, jobId) { var j = api.get('jobs', jobId); return j && api.get('customers', j.customer); };
  var docTo = function (api, jobId, heading) {
    var j = api.get('jobs', jobId) || {}, c = api.get('customers', j.customer) || {}, s = api.get('sites', j.site) || {};
    return { heading: heading, lines: [c.name, c.address, c.email, s.address ? 'Site: ' + s.address : ''] };
  };
  var priceSpec = function (r) { var t = L.quoteTotals(r); return { lines: L.priceLines(r), totals: { subtotal: C.r2(t.net), markup: 0, discount: 0, net: t.net, gst: t.gst, total: t.total }, gst: r.gst !== false }; };

  var app = Forge.app({
    id: 'tradie-manager', name: 'Tradie Manager', mount: '#app',
    quickAdd: ['jobs', 'quotes'],
    entities: {
      jobs: {
        label: 'Jobs', single: 'Job', title: 'title', board: 'status', calendar: ['start'], durationField: 'hours', recurring: 'start',
        recurringReset: { status: 'Scheduled' }, defaultView: 'list', sort: { key: 'start', dir: 'desc' },
        list: ['title', 'customer', 'start', 'worker', 'status'], cardFields: ['customer', 'start'],
        fields: [
          { key: 'title', label: 'Job', type: 'text', required: true, placeholder: 'e.g. Replace hot water system' },
          { key: 'customer', label: 'Customer', type: 'link', entity: 'customers', filter: true },
          { key: 'site', label: 'Site', type: 'link', entity: 'sites' },
          { key: 'start', label: 'Booked for', type: 'datetime' },
          { key: 'hours', label: 'Estimated hours', type: 'number', min: 0, default: 2 },
          { key: 'worker', label: 'Who', type: 'text', placeholder: 'e.g. Dan' },
          { key: 'status', label: 'Status', type: 'select', required: true, options: JOB_STATUS },
          { key: 'materials', label: 'Materials used (at cost)', type: 'lines' },
          { key: 'safety', label: 'Safety and sign-off checklist', type: 'checklist', groups: false, items: ['Hazards checked (SWMS / JSA)', 'Power or water isolated and tagged', 'Work tested and working', 'Site cleaned up', 'Customer shown the work'] },
          { key: 'before', label: 'Before photos', type: 'photos' },
          { key: 'after', label: 'After photos', type: 'photos' },
          { key: 'notes', label: 'Notes', type: 'longtext' },
          { key: 'signature', label: 'Customer sign-off', type: 'signature', dateField: 'signedOn' },
          { key: 'signedOn', label: 'Signed on', type: 'date' }
        ],
        onLinkChange: function (r, key, api) { if (key === 'customer' && !r.site) { var s = api.list('sites').filter(function (x) { return x.customer === r.customer; })[0]; if (s) r.site = s.id; } },
        actions: [
          { label: 'Create quote', run: function (j, api) { api.edit('quotes', null, { job: j.id, materials: JSON.parse(JSON.stringify(j.materials || [])), labourHours: j.hours || 0 }); } },
          { label: 'Log time', run: function (j, api) { api.edit('time', null, { job: j.id, worker: j.worker || '', date: C.dayOf(j.start) || api.today(), hours: j.hours || 0 }); } }
        ],
        detailExtra: function (el, j, api) {
          var hrs = L.jobHours(api.list('time'), j.id), c = api.get('customers', j.customer);
          el.innerHTML = '<p class="small">Time logged: <b>' + hrs + ' h</b>' + (c && c.phone ? ' · Call customer: <a href="tel:' + esc(c.phone.replace(/\s/g, '')) + '">' + esc(c.phone) + '</a>' : '') + '</p>';
        }
      },
      customers: {
        label: 'Customers', single: 'Customer', title: 'name', list: ['name', 'type', 'phone', 'email'],
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'type', label: 'Type', type: 'select', options: ['Residential', 'Commercial', 'Strata', 'Real estate agent'] },
          { key: 'phone', label: 'Phone', type: 'phone' },
          { key: 'email', label: 'Email', type: 'email' },
          { key: 'address', label: 'Billing address', type: 'longtext' },
          { key: 'notes', label: 'Notes', type: 'longtext' }
        ]
      },
      sites: {
        label: 'Sites', single: 'Site', title: 'address', list: ['address', 'customer', 'access'],
        fields: [
          { key: 'address', label: 'Site address', type: 'text', required: true },
          { key: 'customer', label: 'Customer', type: 'link', entity: 'customers' },
          { key: 'access', label: 'Access notes (keys, codes, parking, pets)', type: 'longtext' }
        ]
      },
      quotes: {
        label: 'Quotes', single: 'Quote', title: 'number', board: 'status', calendar: ['validUntil'], sort: { key: 'number', dir: 'desc' },
        list: ['number', 'job', 'date', 'status', 'total'], listTotals: ['total'],
        fields: [
          { key: 'number', label: 'Quote number', type: 'text', required: true },
          { key: 'job', label: 'Job', type: 'link', entity: 'jobs', required: true },
          { key: 'date', label: 'Date', type: 'date', default: 'today' },
          { key: 'validUntil', label: 'Valid until', type: 'date', default: function (t) { return C.addDays(t, 30); } },
          { key: 'status', label: 'Status', type: 'select', required: true, options: ['Draft', 'Sent', { value: 'Accepted', label: 'Accepted', tone: 'ok' }, { value: 'Declined', label: 'Declined', tone: 'bad' }, 'Invoiced'] }
        ].concat(pricing('Quote total')).concat([{ key: 'notes', label: 'Notes / inclusions / exclusions', type: 'longtext' }]),
        onNew: function (r, api) { r.number = C.nextNumber(api.list('quotes').map(function (q) { return q.number; }), 'Q-'); },
        actions: [{ label: 'Turn into invoice', when: function (q) { return q.status !== 'Invoiced'; }, run: function (q, api) {
          var inv = L.invoiceFromQuote(q, api.list('invoices'), api.today(), 14);
          api.save('invoices', inv, true); api.save('quotes', Object.assign({}, q, { status: 'Invoiced' }), true);
          var j = api.get('jobs', q.job); if (j && ['Done', 'Scheduled', 'In progress', 'Quoted'].indexOf(j.status) >= 0) api.save('jobs', Object.assign({}, j, { status: 'Invoiced' }), true);
          api.toast('Invoice ' + inv.number + ' created'); api.open('invoices', inv.id);
        } }]
      },
      invoices: {
        label: 'Invoices', single: 'Invoice', title: 'number', board: 'status', calendar: ['due'], sort: { key: 'number', dir: 'desc' },
        list: ['number', 'job', 'issued', 'due', 'status', 'total', 'balance'], listTotals: ['total', 'balance'],
        fields: [
          { key: 'number', label: 'Invoice number', type: 'text', required: true },
          { key: 'job', label: 'Job', type: 'link', entity: 'jobs', required: true },
          { key: 'quote', label: 'From quote', type: 'link', entity: 'quotes', addFrom: false },
          { key: 'issued', label: 'Issued', type: 'date', default: 'today' },
          { key: 'due', label: 'Due', type: 'date', default: function (t) { return C.addDays(t, 14); } }
        ].concat(pricing('Invoice total')).concat([
          { key: 'amountPaid', label: 'Amount paid', type: 'money', min: 0, default: 0 },
          { key: 'paidOn', label: 'Paid on', type: 'date' },
          { key: 'status', label: 'Payment', type: 'select', options: ['Unpaid', 'Part paid', { value: 'Overdue', label: 'Overdue', tone: 'bad' }, { value: 'Paid', label: 'Paid', tone: 'ok' }], help: 'Set automatically from the amount paid and due date when you save.' },
          { key: 'balance', label: 'Balance', type: 'money', compute: function (r) { return L.balance(r); } },
          { key: 'notes', label: 'Notes', type: 'longtext' }
        ]),
        onNew: function (r, api) { r.number = C.nextNumber(api.list('invoices').map(function (q) { return q.number; }), 'INV-'); },
        beforeSave: function (r, api) { r.status = L.paymentStatus(r, api.today()); if (r.status === 'Paid' && !r.paidOn) r.paidOn = api.today(); },
        onStatus: function (r, v, api) { if (v === 'Paid') { r.amountPaid = L.quoteTotals(r).total; r.paidOn = r.paidOn || api.today(); } },
        actions: [{ label: 'Mark paid in full', when: function (i) { return i.status !== 'Paid'; }, run: function (i, api) {
          var t = L.quoteTotals(i).total; api.save('invoices', Object.assign({}, i, { amountPaid: t, paidOn: api.today(), status: 'Paid' }));
          var j = api.get('jobs', i.job); if (j) api.save('jobs', Object.assign({}, j, { status: 'Paid' }), true); api.toast('Marked paid');
        } }]
      },
      time: {
        label: 'Timesheets', single: 'Time entry', title: function (r) { return (r.worker || 'Someone') + ' · ' + (r.date || '') + ' · ' + (r.hours || 0) + ' h'; },
        list: ['date', 'job', 'worker', 'hours'], listTotals: ['hours'], sort: { key: 'date', dir: 'desc' },
        fields: [
          { key: 'date', label: 'Date', type: 'date', required: true, default: 'today' },
          { key: 'job', label: 'Job', type: 'link', entity: 'jobs', required: true, filter: true },
          { key: 'worker', label: 'Who', type: 'text' },
          { key: 'hours', label: 'Hours', type: 'number', min: 0, max: 24, required: true },
          { key: 'notes', label: 'Notes', type: 'text' }
        ]
      }
    },
    reminders: [
      { entity: 'jobs', date: 'start', warnDays: 2, pastDays: 7, label: 'Job booked', when: function (j) { return j.status === 'Scheduled'; } },
      { entity: 'invoices', date: 'due', warnDays: 3, label: 'Invoice due — chase payment', when: function (i) { return i.status !== 'Paid'; } },
      { entity: 'quotes', date: 'validUntil', warnDays: 3, label: 'Quote expiring — follow up', when: function (q) { return q.status === 'Sent'; } }
    ],
    dashboard: {
      tiles: [
        { label: 'Jobs today', value: function (api) { return L.runSheet(api.list('jobs'), api.today()).length; } },
        { label: 'Jobs this week', value: function (api) { var w = C.weekOf(api.today()); return api.list('jobs').filter(function (j) { var d = C.dayOf(j.start); return d >= w[0] && d <= w[6]; }).length; } },
        { label: 'Quotes awaiting reply', entity: 'quotes', kind: 'count', where: function (q) { return q.status === 'Sent'; } },
        { label: 'Owed to you', value: function (api) { return api.list('invoices').filter(function (i) { return i.status !== 'Paid'; }).reduce(function (s, i) { return s + L.balance(i); }, 0); }, fmt: 'money' },
        { label: 'Overdue invoices', entity: 'invoices', kind: 'overdue', date: 'due', where: function (i) { return i.status !== 'Paid'; } },
        { label: 'Hours logged (30 days)', value: function (api) { var from = C.addDays(api.today(), -30); return api.list('time').filter(function (t) { return t.date >= from; }).reduce(function (s, t) { return s + (+t.hours || 0); }, 0); }, fmt: 'hours' }
      ],
      charts: [
        { title: 'Jobs by status', entity: 'jobs', by: 'status' },
        { title: 'Invoiced by customer (incl. GST)', entity: 'invoices', by: function (i, api) { var c = jobCustomer(api, i.job); return c ? c.name : '(no customer)'; }, sum: function (i) { return L.quoteTotals(i).total; }, fmt: 'money' }
      ],
      render: function (el, api) {
        var cl = L.clashes(api.list('jobs'));
        el.innerHTML = cl.length ? '<div class="panel"><h3 style="margin-top:0" class="warn">Double bookings</h3>' + cl.map(function (p) { return '<p class="small">' + esc(jobLabel(api, p[0])) + ' overlaps ' + esc(jobLabel(api, p[1])) + ' (same person, same time).</p>'; }).join('') + '</div>' : '';
      }
    },
    documents: [
      { id: 'quote', label: 'quote', entity: 'quotes', build: function (q, api) {
        var p = priceSpec(q);
        return Object.assign({ title: 'Quote', number: q.number, date: q.date, meta: [['Valid until', q.validUntil], ['Job', jobLabel(api, q.job)]], to: docTo(api, q.job, 'Prepared for'), notes: q.notes,
          footer: 'Materials include supply and handling. Prices in AUD. To accept, reply to this quote or sign below.', signatures: [{ label: 'Accepted by' }] }, p);
      } },
      { id: 'invoice', label: 'invoice', entity: 'invoices', build: function (i, api) {
        var p = priceSpec(i);
        return Object.assign({ title: i.gst !== false ? 'Tax invoice' : 'Invoice', number: i.number, date: i.issued, meta: [['Due', i.due], ['Job', jobLabel(api, i.job)], ['Status', i.status]], to: docTo(api, i.job, 'Bill to'), notes: i.notes, paid: +i.amountPaid || 0 }, p);
      } },
      { id: 'jobsheet', label: 'job sheet', entity: 'jobs', build: function (j, api) {
        var c = api.get('customers', j.customer) || {}, s = api.get('sites', j.site) || {};
        var time = api.list('time').filter(function (t) { return t.job === j.id; });
        return { title: 'Job sheet', number: j.title, date: C.dayOf(j.start), meta: [['Time', C.timeOf(j.start)], ['Who', j.worker], ['Status', j.status]],
          to: { heading: 'Customer', lines: [c.name, c.phone, s.address || c.address, s.access ? 'Access: ' + s.access : ''] },
          sections: [
            j.notes ? { heading: 'Notes', text: j.notes } : null,
            (j.materials || []).length ? { heading: 'Materials used', table: { headers: ['Item', 'Qty'], rows: j.materials.map(function (m) { return [m.desc, m.qty]; }) } } : null,
            time.length ? { heading: 'Time', table: { headers: ['Date', 'Who', 'Hours'], rows: time.map(function (t) { return [t.date, t.worker, t.hours]; }) } } : null,
            (j.safety || []).length ? { heading: 'Checklist', checklist: j.safety } : null,
            (j.before || []).length ? { heading: 'Before', photos: j.before } : null,
            (j.after || []).length ? { heading: 'After', photos: j.after } : null
          ].filter(Boolean),
          signatures: [{ label: 'Customer', image: j.signature, date: j.signedOn }] };
      } }
    ],
    tabs: [{ id: 'run', label: 'Run sheet', after: 'jobs', render: renderRunSheet }],
    sample: function (today) { return L.sample(today); }
  });

  // ---------- daily run sheet ----------
  var runDay = null;
  function renderRunSheet(el, api) {
    runDay = runDay || api.today();
    var rows = L.runSheet(api.list('jobs'), runDay, api.list('customers'), api.list('sites'));
    el.innerHTML = '<div class="row fg-toolbar"><label for="rs-day" style="margin:0">Day</label><input type="date" id="rs-day" value="' + esc(runDay) + '" style="width:auto">' +
      '<button class="btn small" type="button" id="rs-prev">◀ Previous</button><button class="btn small" type="button" id="rs-next">Next ▶</button>' +
      '<button class="btn primary" type="button" id="rs-print"' + (rows.length ? '' : ' disabled') + '>Print run sheet</button></div>' +
      (rows.length ? '<div class="table-wrap"><table><thead><tr><th>Time</th><th>Job</th><th>Customer</th><th>Address</th><th>Access</th></tr></thead><tbody>' + rows.map(function (r) {
        return '<tr><td>' + esc(r.time) + (r.hours ? '<div class="small muted">' + r.hours + ' h</div>' : '') + '</td><td><button type="button" class="fg-linkbtn" data-open="jobs" data-id="' + esc(r.id) + '">' + esc(r.job) + '</button><div class="small muted">' + esc(r.status) + '</div></td><td>' + esc(r.customer) + (r.phone ? '<div class="small"><a href="tel:' + esc(r.phone.replace(/\s/g, '')) + '">' + esc(r.phone) + '</a></div>' : '') + '</td><td>' + esc(r.address) + '</td><td>' + esc(r.access) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="muted">No jobs booked on this day.</p>');
    var go = function (d) { runDay = d; renderRunSheet(el, api); };
    el.querySelector('#rs-day').addEventListener('change', function (e) { if (e.target.value) go(e.target.value); });
    el.querySelector('#rs-prev').addEventListener('click', function () { go(C.addDays(runDay, -1)); });
    el.querySelector('#rs-next').addEventListener('click', function () { go(C.addDays(runDay, 1)); });
    el.querySelector('#rs-print').addEventListener('click', function () {
      api.print({ title: 'Run sheet', date: runDay, sections: [{ table: { headers: ['Time', 'Job', 'Customer', 'Phone', 'Address', 'Access / notes', 'Done'], rows: rows.map(function (r) { return [r.time + (r.hours ? ' (' + r.hours + ' h)' : ''), r.job, r.customer, r.phone, r.address, [r.access, r.notes].filter(Boolean).join('\n'), '☐']; }) } }] });
    });
  }
})();
