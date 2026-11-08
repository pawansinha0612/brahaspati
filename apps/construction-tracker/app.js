/* Construction Project Tracker — ProductForge config plus Gantt, budget and progress report. */
(function () {
  'use strict';
  var L = window.ConstructionLib, C = window.ForgeCore, B = window.B, esc = C.esc;
  var money = function (v) { return B.fmt.money(v); }, pct = function (v) { return Math.round(v * 100) + '%'; };
  var proj = function (required) { return { key: 'project', label: 'Project', type: 'link', entity: 'projects', required: required !== false, filter: true }; };
  var code = { key: 'code', label: 'Cost code', type: 'select', options: L.COST_CODES, filter: true };

  function reportSpec(p, api) {
    var r = L.projectReport(p, api.data, api.today());
    return {
      title: 'Progress report', number: p.name, date: api.today(),
      meta: [['Client', p.client], ['Site', p.address], ['Planned finish', p.end], ['Status', p.status]],
      intro: 'Work complete: ' + pct(r.progress) + ' (plan for today: ' + pct(r.planned) + '). Contract value ' + money(r.contract.current) + ' including ' + money(r.contract.approved) + ' approved variations' +
        (r.contract.pending ? ', with ' + money(r.contract.pending) + ' pending' : '') + '. Days lost to delays: ' + r.delays.total + '.',
      sections: [
        { heading: 'Stages', table: { headers: ['Stage', 'Start', 'Finish', 'Complete'], rows: r.gantt.rows.map(function (s) { return [s.name + (s.milestone ? ' (milestone)' : ''), s.start, s.end, s.pct + '%' + (s.late ? ' — behind' : '')]; }) } },
        { heading: 'Budget vs actual', table: { headers: ['Cost code', 'Budget', 'Actual', 'Committed', 'Variance'], rows: r.budget.rows.map(function (b) { return [b.code, money(b.budget), money(b.actual), money(b.committed), money(b.variance)]; }).concat([['Total', money(r.budget.total.budget), money(r.budget.total.actual), money(r.budget.total.committed), money(r.budget.total.variance)]]) } },
        r.delays.byCause.length ? { heading: 'Delays', table: { headers: ['Cause', 'Days lost'], rows: r.delays.byCause.map(function (x) { return [x.label, x.value]; }) } } : null,
        r.lateOrders.length ? { heading: 'Late deliveries', table: { headers: ['Supplier', 'Item', 'Expected'], rows: r.lateOrders.map(function (o) { return [o.supplier, o.item, o.expected]; }) } } : null,
        r.diary.length ? { heading: 'Recent site diary', table: { headers: ['Date', 'Weather', 'On site', 'Notes'], rows: r.diary.map(function (y) { return [y.date, y.weather + (y.temp != null ? ' ' + y.temp + '°C' : ''), y.workers, y.notes]; }) }, photos: [].concat.apply([], r.diary.map(function (y) { return (y.photos || []).slice(0, 2); })) } : null
      ].filter(Boolean),
      footer: 'Committed = orders placed but not yet invoiced. Variance = budget − (actual + committed); negative means over budget.'
    };
  }

  Forge.app({
    id: 'construction-tracker', name: 'Construction Tracker', mount: '#app', quickAdd: ['diary', 'costs'],
    entities: {
      projects: {
        label: 'Projects', single: 'Project', title: 'name', board: 'status', calendar: ['end'], list: ['name', 'client', 'start', 'end', 'status', 'contract'],
        fields: [
          { key: 'name', label: 'Project name', type: 'text', required: true },
          { key: 'client', label: 'Client', type: 'text' },
          { key: 'address', label: 'Site address', type: 'text' },
          { key: 'start', label: 'Start', type: 'date' },
          { key: 'end', label: 'Planned finish', type: 'date', validate: function (v, r) { return r.start && v < r.start ? 'Finish is before start' : ''; } },
          { key: 'contract', label: 'Contract price (incl. GST)', type: 'money', min: 0 },
          { key: 'status', label: 'Status', type: 'select', required: true, options: ['Planning', 'In progress', 'On hold', { value: 'Complete', label: 'Complete', tone: 'ok' }] },
          { key: 'notes', label: 'Notes', type: 'longtext' }
        ],
        actions: [{ label: 'Gantt and budget', run: function (p, api) { view.project = p.id; api.goTab('x-progress'); } }],
        detailExtra: function (el, p, api) {
          var r = L.projectReport(p, api.data, api.today());
          el.innerHTML = '<div class="stat-row">' + [['Complete', pct(r.progress)], ['Planned by today', pct(r.planned)], ['Contract value', money(r.contract.current)], ['Budget variance', money(r.budget.total.variance)], ['Days lost', r.delays.total]].map(function (s) { return '<div class="stat"><div class="k">' + s[0] + '</div><div class="v">' + esc(s[1]) + '</div></div>'; }).join('') + '</div>';
        }
      },
      stages: {
        label: 'Stages', single: 'Stage', title: 'name', calendar: ['end'], sort: { key: 'start' }, list: ['name', 'project', 'start', 'end', 'pct', 'milestone'],
        fields: [
          { key: 'name', label: 'Stage or milestone', type: 'text', required: true },
          proj(),
          { key: 'start', label: 'Start', type: 'date', required: true },
          { key: 'end', label: 'Finish', type: 'date', validate: function (v, r) { return r.start && v < r.start ? 'Finish is before start' : ''; } },
          { key: 'pct', label: '% complete', type: 'number', min: 0, max: 100, default: 0 },
          { key: 'milestone', label: 'Milestone (single day)', type: 'checkbox' },
          { key: 'contractor', label: 'Main contractor', type: 'link', entity: 'contractors' }
        ],
        beforeSave: function (r) { if (!r.end || r.milestone) r.end = r.start; }
      },
      contractors: {
        label: 'Contractors', single: 'Contractor', title: 'name', list: ['name', 'trade', 'phone', 'licenceExpiry', 'insuranceExpiry'],
        fields: [
          { key: 'name', label: 'Business name', type: 'text', required: true },
          { key: 'trade', label: 'Trade', type: 'select', options: ['Builder', 'Carpenter', 'Concreter', 'Plumber', 'Electrician', 'Plasterer', 'Tiler', 'Painter', 'Roofer', 'Landscaper', 'Other'], filter: true },
          { key: 'contact', label: 'Contact person', type: 'text' },
          { key: 'phone', label: 'Phone', type: 'phone' },
          { key: 'email', label: 'Email', type: 'email' },
          { key: 'abn', label: 'ABN', type: 'text' },
          { key: 'licence', label: 'Licence number', type: 'text' },
          { key: 'licenceExpiry', label: 'Licence expiry', type: 'date' },
          { key: 'insuranceExpiry', label: 'Public liability expiry', type: 'date' },
          { key: 'workersCompExpiry', label: "Workers' comp expiry", type: 'date' }
        ],
        detailExtra: function (el, c, api) {
          var s = L.compliance(c, api.today());
          el.innerHTML = '<p class="small">Compliance: <span class="' + (s.status === 'ok' ? 'pill-ok' : s.status === 'expiring' || s.status === 'missing' ? 'pill-warn' : 'pill-bad') + '">' + esc(s.status) + '</span>' + (s.missing.length ? ' · missing: ' + esc(s.missing.join(', ')) : '') + '</p>';
        }
      },
      orders: {
        label: 'Orders', single: 'Order', title: 'item', board: 'status', calendar: ['expected'], sort: { key: 'expected' }, list: ['item', 'project', 'supplier', 'expected', 'status', 'cost'], listTotals: ['cost'],
        fields: [
          { key: 'item', label: 'Item', type: 'text', required: true },
          proj(), { key: 'supplier', label: 'Supplier', type: 'text' }, code,
          { key: 'qty', label: 'Quantity', type: 'number', min: 0 },
          { key: 'cost', label: 'Cost (ex GST)', type: 'money', min: 0 },
          { key: 'ordered', label: 'Ordered on', type: 'date', default: 'today' },
          { key: 'expected', label: 'Delivery expected', type: 'date' },
          { key: 'delivered', label: 'Delivered on', type: 'date' },
          { key: 'status', label: 'Status', type: 'select', required: true, options: ['Ordered', { value: 'Delivered', label: 'Delivered', tone: 'ok' }, 'Invoiced', 'Cancelled'], help: '"Invoiced" means the cost is now entered under Costs, so it is no longer counted as committed.' },
          { key: 'notes', label: 'Notes', type: 'text' }
        ],
        beforeSave: function (r) { if (r.delivered && r.status === 'Ordered') r.status = 'Delivered'; },
        actions: [{ label: 'Mark delivered today', when: function (o) { return o.status === 'Ordered'; }, run: function (o, api) { api.save('orders', Object.assign({}, o, { delivered: api.today(), status: 'Delivered' })); } }]
      },
      budget: {
        label: 'Budget', single: 'Budget line', title: function (r) { return r.code || 'Budget line'; }, list: ['code', 'project', 'amount'], listTotals: ['amount'], sort: { key: 'code' },
        fields: [code, proj(), { key: 'amount', label: 'Budget (ex GST)', type: 'money', required: true, min: 0 }, { key: 'notes', label: 'Notes', type: 'text' }]
      },
      costs: {
        label: 'Costs', single: 'Cost', title: 'description', sort: { key: 'date', dir: 'desc' }, list: ['date', 'description', 'project', 'code', 'amount'], listTotals: ['amount'],
        fields: [{ key: 'description', label: 'Description', type: 'text', required: true }, proj(), code, { key: 'date', label: 'Date', type: 'date', default: 'today' },
          { key: 'supplier', label: 'Supplier / contractor', type: 'text' }, { key: 'amount', label: 'Amount (ex GST)', type: 'money', required: true }, { key: 'photos', label: 'Receipt / invoice photo', type: 'photos' }]
      },
      variations: {
        label: 'Variations', single: 'Variation', title: 'number', board: 'status', sort: { key: 'number' }, list: ['number', 'description', 'project', 'status', 'amount'], listTotals: ['amount'],
        fields: [{ key: 'number', label: 'Number', type: 'text', required: true }, proj(), { key: 'date', label: 'Date', type: 'date', default: 'today' },
          { key: 'description', label: 'Change requested', type: 'longtext', required: true }, { key: 'amount', label: 'Price change (incl. GST, negative for a credit)', type: 'money' },
          { key: 'days', label: 'Extra days needed', type: 'number', min: 0 },
          { key: 'status', label: 'Status', type: 'select', required: true, options: ['Pending', { value: 'Approved', label: 'Approved', tone: 'ok' }, { value: 'Rejected', label: 'Rejected', tone: 'bad' }] },
          { key: 'signature', label: 'Client approval signature', type: 'signature', dateField: 'signedOn' }, { key: 'signedOn', label: 'Signed on', type: 'date' }],
        onNew: function (r, api) { r.number = C.nextNumber(api.list('variations').map(function (v) { return v.number; }), 'V-', 3); },
        beforeSave: function (r) { if (r.signature && r.status === 'Pending') r.status = 'Approved'; }
      },
      delays: {
        label: 'Delays', single: 'Delay', title: function (r) { return (r.cause || 'Delay') + ' · ' + (r.date || ''); }, sort: { key: 'date', dir: 'desc' }, list: ['date', 'project', 'cause', 'days', 'notes'], listTotals: ['days'],
        fields: [proj(), { key: 'date', label: 'Date', type: 'date', required: true, default: 'today' }, { key: 'cause', label: 'Cause', type: 'select', required: true, options: L.DELAY_CAUSES },
          { key: 'days', label: 'Days lost', type: 'number', required: true, min: 0, max: 365 }, { key: 'stage', label: 'Stage affected', type: 'link', entity: 'stages' }, { key: 'notes', label: 'What happened', type: 'longtext' }]
      },
      diary: {
        label: 'Site diary', single: 'Diary entry', title: function (r) { return (r.date || '') + ' · ' + (r.weather || ''); }, sort: { key: 'date', dir: 'desc' }, list: ['date', 'project', 'weather', 'workers', 'notes'],
        fields: [proj(), { key: 'date', label: 'Date', type: 'date', required: true, default: 'today' }, { key: 'weather', label: 'Weather', type: 'select', options: ['Fine', 'Cloudy', 'Showers', 'Heavy rain', 'Windy', 'Hot', 'Storm'] },
          { key: 'temp', label: 'Temperature °C', type: 'number' }, { key: 'workers', label: 'People on site', type: 'number', min: 0 }, { key: 'visitors', label: 'Visitors / inspections', type: 'text' },
          { key: 'notes', label: 'Work done and issues', type: 'longtext', required: true }, { key: 'photos', label: 'Photos', type: 'photos' }]
      }
    },
    reminders: [
      { entity: 'contractors', date: 'licenceExpiry', warnDays: 30, pastDays: 365, label: 'Licence expiry' },
      { entity: 'contractors', date: 'insuranceExpiry', warnDays: 30, pastDays: 365, label: 'Public liability insurance expiry' },
      { entity: 'contractors', date: 'workersCompExpiry', warnDays: 30, pastDays: 365, label: "Workers' comp expiry" },
      { entity: 'orders', date: 'expected', warnDays: 2, pastDays: 60, label: 'Delivery expected', when: function (o) { return o.status === 'Ordered'; } },
      { entity: 'stages', date: 'end', warnDays: 3, pastDays: 60, label: 'Stage due to finish', when: function (s) { return (+s.pct || 0) < 100; } }
    ],
    dashboard: {
      tiles: [
        { label: 'Active projects', entity: 'projects', kind: 'count', where: function (p) { return p.status === 'In progress'; } },
        { label: 'Spent so far', entity: 'costs', kind: 'sum', field: 'amount' },
        { label: 'Committed orders', entity: 'orders', kind: 'sum', field: 'cost', where: function (o) { return o.status === 'Ordered' || o.status === 'Delivered'; } },
        { label: 'Late deliveries', entity: 'orders', kind: 'overdue', date: 'expected', where: function (o) { return o.status === 'Ordered'; } },
        { label: 'Days lost to delays', entity: 'delays', kind: 'sum', field: 'days', fmt: 'num' },
        { label: 'Contractor docs expiring', value: function (api) { return api.list('contractors').filter(function (c) { return L.compliance(c, api.today()).status !== 'ok'; }).length; }, tone: function (v) { return v ? 'warn' : ''; } }
      ],
      charts: [
        { title: 'Days lost by cause', entity: 'delays', by: 'cause', sum: 'days' },
        { title: 'Spend by cost code', entity: 'costs', by: 'code', sum: 'amount', fmt: 'money' }
      ]
    },
    documents: [{ id: 'progress', label: 'progress report', entity: 'projects', build: reportSpec }],
    tabs: [{ id: 'progress', label: 'Gantt & budget', after: 'projects', render: renderProgress }],
    sample: function (today) { return L.sample(today); }
  });

  // ---------- Gantt + budget view ----------
  var view = { project: '' };
  function renderProgress(el, api) {
    var ps = api.list('projects');
    if (!ps.length) { el.innerHTML = '<p class="muted" style="margin-top:14px">Add a project first.</p>'; return; }
    if (!api.get('projects', view.project)) view.project = (ps.filter(function (p) { return p.status === 'In progress'; })[0] || ps[0]).id;
    var p = api.get('projects', view.project), r = L.projectReport(p, api.data, api.today()), g = r.gantt;
    var h = '<div class="row fg-toolbar"><label for="cg-p" style="margin:0">Project</label><select id="cg-p" style="width:auto;max-width:100%">' + ps.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === p.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select>' +
      '<button class="btn primary" type="button" id="cg-print">Print progress report</button></div>';
    h += '<div class="stat-row">' + [['Complete', pct(r.progress), r.progress + 0.05 < r.planned ? 'bad' : 'ok'], ['Planned by today', pct(r.planned), ''], ['Contract value', money(r.contract.current), ''], ['Forecast cost', money(r.budget.total.forecast), ''], ['Budget variance', money(r.budget.total.variance), r.budget.total.variance < 0 ? 'bad' : 'ok'], ['Days lost', r.delays.total, r.delays.total ? 'warn' : '']]
      .map(function (s) { return '<div class="stat"><div class="k">' + s[0] + '</div><div class="v ' + s[2] + '">' + esc(s[1]) + '</div></div>'; }).join('') + '</div>';
    h += '<div class="panel"><h3 style="margin-top:0">Timeline</h3>' + (g.rows.length ? '<p class="small muted">' + esc(g.from) + ' to ' + esc(g.to) + ' · dark part of each bar = % complete · red = past its finish date and not complete · diamond = milestone' + (g.todayPct != null ? ' · orange line = today' : '') + '</p><div class="fg-gantt">' + g.rows.map(function (s) {
      var track = s.milestone ? '<span class="g-ms" style="left:' + (s.left + s.width / 2) + '%" title="' + esc(s.start) + '"></span>' : '<span class="g-bar' + (s.late ? ' late' : '') + '" style="left:' + s.left + '%;width:' + Math.max(s.width, 1) + '%" title="' + esc(s.start + ' → ' + s.end + ' · ' + s.pct + '%') + '"><i style="width:' + s.pct + '%"></i></span>';
      return '<div class="g-row"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><button type="button" class="fg-linkbtn" data-open="stages" data-id="' + esc(s.id) + '">' + esc(s.name) + '</button> <span class="small muted">' + s.pct + '%</span></span><div class="g-track">' + track + (g.todayPct != null ? '<span class="g-today" style="left:' + g.todayPct + '%"></span>' : '') + '</div></div>';
    }).join('') + '</div>' : '<p class="muted">No stages with dates yet.</p>') + '</div>';
    h += '<div class="panel"><h3 style="margin-top:0">Budget vs actual</h3>' + (r.budget.rows.length ? '<div class="table-wrap"><table><thead><tr><th>Cost code</th><th class="num">Budget</th><th class="num">Actual</th><th class="num">Committed</th><th class="num">Variance</th></tr></thead><tbody>' +
      r.budget.rows.map(function (b) { return '<tr><td>' + esc(b.code) + '</td><td class="num">' + money(b.budget) + '</td><td class="num">' + money(b.actual) + '</td><td class="num">' + money(b.committed) + '</td><td class="num ' + (b.flag === 'over' ? 'bad' : b.flag === 'close' ? 'warn' : '') + '">' + money(b.variance) + (b.variancePct != null ? ' <span class="small">(' + pct(b.variancePct) + ')</span>' : '') + '</td></tr>'; }).join('') +
      '<tr><td><b>Total</b></td><td class="num"><b>' + money(r.budget.total.budget) + '</b></td><td class="num"><b>' + money(r.budget.total.actual) + '</b></td><td class="num"><b>' + money(r.budget.total.committed) + '</b></td><td class="num"><b>' + money(r.budget.total.variance) + '</b></td></tr></tbody></table></div>' +
      '<p class="small muted">Variance = budget − (actual + committed orders). Red = over budget, amber = more than 90% used.</p>' : '<p class="muted">Add budget lines and costs to compare.</p>') + '</div>';
    h += '<div class="panel"><h3 style="margin-top:0">Contract value</h3><p>Original ' + money(r.contract.original) + ' + approved variations ' + money(r.contract.approved) + ' = <b>' + money(r.contract.current) + '</b>' + (r.contract.pending ? ' <span class="muted">(' + money(r.contract.pending) + ' pending)</span>' : '') + '</p></div>';
    el.innerHTML = h;
    el.querySelector('#cg-p').addEventListener('change', function (e) { view.project = e.target.value; renderProgress(el, api); });
    el.querySelector('#cg-print').addEventListener('click', function () { api.print(reportSpec(p, api)); });
  }
})();
