/* Gym & Studio Manager — ProductForge config plus check-in desk, class timetable with waitlists, trainer schedule,
   renewals and a retention dashboard. */
(function () {
  'use strict';
  var L = window.GymLib, C = window.ForgeCore, B = window.B, esc = C.esc;
  var app = null; // set when Forge.app returns (used by form validation only)
  var money = function (v) { return B.fmt.money(v); };
  var nowDT = function (api) { var n = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; }; return api.today() + 'T' + p(n.getHours()) + ':' + p(n.getMinutes()); };
  var planOf = function (api, m) { return api.get('plans', m && m.plan); };
  var holdsOf = function (api, m) { return L.holdsFor(api.list('holds'), m.id); };
  var stateOf = function (api, m) { return L.state(m, planOf(api, m), holdsOf(api, m), api.today()); };
  // A member's current membership (newest that is not cancelled), or the newest one.
  var currentOf = function (api, memberId) {
    var ms = api.list('memberships').filter(function (m) { return m.member === memberId; }).sort(function (a, b) { return a.start < b.start ? 1 : -1; });
    return ms.filter(function (m) { var s = stateOf(api, m); return s === 'Active' || s === 'On hold'; })[0] || ms[0] || null;
  };
  var TONE = { Active: 'ok', 'On hold': 'warn', 'Not started': 'warn', Expired: 'bad', Cancelled: 'bad' };
  var pill = function (s) { return '<span class="pill-' + (TONE[s] || 'mute') + '">' + esc(s) + '</span>'; };
  var classLabel = function (c) { return c ? c.name + ' · ' + c.weekday + ' ' + c.time : ''; };

  // After any booking change: fill free spots from the waitlist, first in first served.
  function fillFromWaitlist(api, classId, date) {
    var cls = api.get('classes', classId); if (!cls) return;
    var ids = L.promote(api.list('bookings'), cls, date); if (!ids.length) return;
    ids.forEach(function (id) { api.save('bookings', Object.assign({}, api.get('bookings', id), { status: 'Booked' }), true); });
    api.toast('Moved off the waitlist: ' + ids.map(function (id) { return api.title('members', api.get('bookings', id).member); }).join(', ') + ' — let them know (this app cannot send messages).');
  }
  function resaveMembership(api, id) { var m = api.get('memberships', id); if (m) api.save('memberships', Object.assign({}, m, { status: m.status === 'Cancelled' ? 'Cancelled' : statusFrom(api, m) }), true); }
  function statusFrom(api, m) { var s = L.state(Object.assign({}, m, { status: 'Active' }), planOf(api, m), holdsOf(api, m), api.today()); return s === 'On hold' ? 'Paused' : s === 'Expired' ? 'Expired' : 'Active'; }

  app = Forge.app({
    id: 'gym-manager', name: 'Gym & Studio Manager', mount: '#app', quickAdd: ['members', 'bookings'],
    entities: {
      members: {
        label: 'Members', single: 'Member', title: 'name', list: ['number', 'name', 'phone', 'healthDeclaration', 'joined'], sort: { key: 'name', dir: 'asc' },
        fields: [
          { key: 'number', label: 'Member number', type: 'text', required: true },
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'phone', label: 'Phone', type: 'phone' },
          { key: 'email', label: 'Email', type: 'email' },
          { key: 'emergencyName', label: 'Emergency contact', type: 'text', required: true },
          { key: 'emergencyPhone', label: 'Emergency phone', type: 'phone', required: true },
          { key: 'healthDeclaration', label: 'Health declaration (pre-exercise screening) received', type: 'checkbox', full: true },
          { key: 'healthDate', label: 'Declaration date', type: 'date' },
          { key: 'healthNote', label: 'Short note only (max 120 characters)', type: 'text', full: true, help: 'Do not store medical details here — keep the signed form in your files. e.g. "See form — GP clearance on file".',
            validate: function (v) { return String(v).length > 120 ? 'Keep it under 120 characters — store medical details on the paper or PDF form, not here.' : ''; } },
          { key: 'joined', label: 'Joined', type: 'date', default: 'today' },
          { key: 'notes', label: 'Notes (goals, preferences)', type: 'longtext' }
        ],
        onNew: function (r, api) { r.number = C.nextNumber(api.list('members').map(function (m) { return m.number; }), 'M-'); },
        validate: function (r) { return r.healthDeclaration && !r.healthDate ? { healthDate: 'Enter the date the declaration was signed' } : {}; },
        actions: [
          { label: 'Check in now', run: function (m, api) { api.save('checkins', { id: C.uid(), member: m.id, at: nowDT(api), kind: 'Gym floor' }); api.toast(m.name + ' checked in'); } },
          { label: 'Book a class', run: function (m, api) { api.edit('bookings', null, { member: m.id }); } }
        ],
        detailExtra: function (el, m, api) {
          var cur = currentOf(api, m.id), seen = L.lastSeen(m.id, api.list('checkins'), api.list('bookings'));
          var s = cur ? stateOf(api, cur) : '', p = cur && planOf(api, cur);
          el.innerHTML = '<p class="small">' + (cur ? 'Membership: ' + pill(s) + ' ' + esc(p ? p.name : '') : '<span class="pill-warn">No membership</span>') +
            (m.healthDeclaration ? '' : ' <span class="pill-bad">No health declaration on file</span>') +
            '<br>Last seen: <b>' + esc(seen || 'never') + '</b>' + (seen ? ' (' + C.daysBetween(seen, api.today()) + ' days ago)' : '') + '</p>';
        }
      },
      memberships: {
        label: 'Memberships', single: 'Membership', board: 'status', calendar: ['end'], sort: { key: 'start', dir: 'desc' },
        title: function (r, api) { return api.title('members', r.member) + ' · ' + api.title('plans', r.plan); },
        list: ['member', 'plan', 'start', 'end', 'status'], cardFields: ['plan', 'end'],
        fields: [
          { key: 'member', label: 'Member', type: 'link', entity: 'members', required: true, filter: true },
          { key: 'plan', label: 'Plan', type: 'link', entity: 'plans', required: true, filter: true },
          { key: 'start', label: 'Start date', type: 'date', required: true, default: 'today' },
          { key: 'status', label: 'Status', type: 'select', required: true, options: [{ value: 'Active', label: 'Active', tone: 'ok' }, { value: 'Paused', label: 'Paused (on hold)', tone: 'warn' }, { value: 'Expired', label: 'Expired', tone: 'bad' }, 'Cancelled'],
            help: 'Active, paused and expired are set from the dates and holds when you save. Choose Cancelled to cancel.' },
          { key: 'cancelledOn', label: 'Cancelled on', type: 'date' },
          { key: 'cancelReason', label: 'Reason for leaving', type: 'select', options: ['Moved away', 'Cost', 'Not using it', 'Injury / health', 'Joined another gym', 'Unhappy with service', 'Other'] },
          { key: 'end', label: 'Ends (includes hold days)', type: 'date', compute: function (r, api) { return api && api.get ? L.endDate(r, api.get('plans', r.plan), L.holdsFor(api.list('holds'), r.id)) : ''; } },
          { key: 'notes', label: 'Notes', type: 'longtext' }
        ],
        beforeSave: function (r, api) { if (r.status === 'Cancelled') { if (!r.cancelledOn) r.cancelledOn = api.today(); } else { r.status = statusFrom(api, r); r.cancelledOn = ''; } },
        onStatus: function (r, v, api) { if (v === 'Cancelled' && !r.cancelledOn) r.cancelledOn = api.today(); },
        actions: [
          { label: 'Put on hold', when: function (m) { return m.status !== 'Cancelled'; }, run: function (m, api) { api.edit('holds', null, { membership: m.id, from: api.today(), to: C.addDays(api.today(), 13) }); } },
          { label: 'Record payment', run: function (m, api) { var p = planOf(api, m) || {}; api.edit('payments', null, { member: m.member, membership: m.id, amount: +p.price || 0, date: api.today(), note: p.name || '' }); } },
          { label: 'Cancel membership', when: function (m) { return m.status !== 'Cancelled'; }, run: function (m, api) { api.edit('memberships', m, { status: 'Cancelled', cancelledOn: api.today() }); } }
        ],
        detailExtra: function (el, m, api) {
          var p = planOf(api, m), hs = holdsOf(api, m), t = api.today(), s = L.state(m, p, hs, t);
          var nb = L.nextBilling(m, p, hs, t), left = L.packRemaining(m, p, api.list('bookings'));
          el.innerHTML = '<p class="small">Now: ' + pill(s) + (hs.length ? ' · Hold days: <b>' + L.holdDays(hs) + '</b>' : '') +
            (nb ? ' · ' + (p && (p.billing === 'Annual' || +p.termMonths > 0) ? 'Renews' : 'Next payment') + ': <b>' + esc(nb) + '</b>' : '') +
            (left != null ? ' · Classes left: <b>' + left + '</b> of ' + esc(p.classCount) : '') +
            (p ? '<br>' + esc(p.billing) + ' ' + esc(money(p.price)) + (+p.termMonths ? ' · ' + p.termMonths + '-month minimum term' : ' · no lock-in') : '') + '</p>';
        }
      },
      plans: {
        label: 'Plans', single: 'Plan', title: 'name', list: ['name', 'billing', 'price', 'termMonths', 'classCount'],
        fields: [
          { key: 'name', label: 'Plan name', type: 'text', required: true },
          { key: 'billing', label: 'Billing', type: 'select', required: true, options: L.BILLING },
          { key: 'price', label: 'Price per payment incl. GST', type: 'money', min: 0, required: true },
          { key: 'termMonths', label: 'Minimum term (months, 0 = no lock-in)', type: 'number', min: 0, max: 60, default: 0 },
          { key: 'classCount', label: 'Classes in pack', type: 'number', min: 0, help: 'Class packs only.' },
          { key: 'validDays', label: 'Pack valid for (days)', type: 'number', min: 1, default: 90, help: 'Class packs only.' },
          { key: 'notes', label: 'What\'s included / cancellation terms', type: 'longtext' }
        ]
      },
      holds: {
        label: 'Holds', single: 'Hold', tab: false, title: function (r) { return 'Hold ' + (r.from || '') + ' to ' + (r.to || ''); },
        list: ['from', 'to', 'reason'],
        fields: [
          { key: 'membership', label: 'Membership', type: 'link', entity: 'memberships', required: true },
          { key: 'from', label: 'From', type: 'date', required: true },
          { key: 'to', label: 'To', type: 'date', required: true },
          { key: 'reason', label: 'Reason', type: 'text', placeholder: 'e.g. Holiday, injury' }
        ],
        validate: function (r) { return r.from && r.to && r.to < r.from ? { to: 'The hold ends before it starts' } : {}; },
        afterSave: function (h, api) { resaveMembership(api, h.membership); }
      },
      classes: {
        label: 'Classes', single: 'Class', title: function (r) { return classLabel(r); }, list: ['name', 'weekday', 'time', 'trainer', 'room', 'capacity'],
        sort: { key: 'weekday', dir: 'asc' },
        fields: [
          { key: 'name', label: 'Class name', type: 'text', required: true },
          { key: 'type', label: 'Type', type: 'select', options: ['Yoga', 'Pilates', 'HIIT', 'Spin', 'Strength', 'Boxing', 'Dance', 'Other'] },
          { key: 'trainer', label: 'Trainer', type: 'link', entity: 'trainers', filter: true },
          { key: 'room', label: 'Room', type: 'text' },
          { key: 'weekday', label: 'Day (every week)', type: 'select', required: true, options: C.WEEKDAYS },
          { key: 'time', label: 'Start time', type: 'time', required: true },
          { key: 'minutes', label: 'Minutes', type: 'number', min: 10, max: 240, default: 60 },
          { key: 'capacity', label: 'Capacity', type: 'number', min: 1, max: 500, required: true, default: 12 },
          { key: 'active', label: 'On the timetable', type: 'checkbox', default: true }
        ],
        detailExtra: function (el, c, api) {
          var cl = L.timetableClashes(api.list('classes')).filter(function (x) { return x.a === c.id || x.b === c.id; });
          el.innerHTML = cl.length ? '<p class="small">' + cl.map(function (x) { return '<span class="pill-warn">Clash</span> same ' + x.why + ' as ' + esc(classLabel(api.get('classes', x.a === c.id ? x.b : x.a))); }).join('<br>') + '</p>' : '';
        }
      },
      bookings: {
        label: 'Class bookings', single: 'Class booking', board: 'status', sort: { key: 'date', dir: 'desc' },
        title: function (r, api) { return api.title('members', r.member) + ' · ' + ((api.get('classes', r.class) || {}).name || 'Class') + ' · ' + (r.date || ''); },
        list: ['date', 'class', 'member', 'status'], cardFields: ['date', 'class'],
        fields: [
          { key: 'member', label: 'Member', type: 'link', entity: 'members', required: true, filter: true },
          { key: 'class', label: 'Class', type: 'link', entity: 'classes', required: true, filter: true },
          { key: 'date', label: 'Date', type: 'date', required: true, default: 'today', refresh: true },
          { key: 'status', label: 'Status', type: 'select', required: true, options: ['Booked', { value: 'Waitlisted', label: 'Waitlisted', tone: 'warn' }, { value: 'Attended', label: 'Attended', tone: 'ok' }, { value: 'No-show', label: 'No-show', tone: 'bad' }, 'Cancelled'], default: 'Booked',
            help: 'A booking for a full class goes on the waitlist automatically.' },
          { key: 'queuedAt', label: 'Booked at', type: 'datetime', hidden: true }
        ],
        onNew: function (r, api) { r.queuedAt = nowDT(api); },
        onLinkChange: function (r, key, api) { if (key === 'class') { var c = api.get('classes', r.class); if (c) for (var i = 0; i < 7; i++) { var d = C.addDays(api.today(), i); if (C.WEEKDAYS[C.weekday(d)] === c.weekday) { r.date = d; break; } } } },
        validate: function (r) {
          var e = {}, c = app && app.get('classes', r.class);
          if (c && r.date && C.WEEKDAYS[C.weekday(r.date)] !== c.weekday) e.date = c.name + ' runs on ' + c.weekday + 's';
          if (app && r.status !== 'Cancelled' && app.list('bookings').some(function (b) { return b.id !== r.id && b.member === r.member && b.class === r.class && b.date === r.date && b.status !== 'Cancelled'; })) e.member = 'This member is already booked or waitlisted for this class';
          return e;
        },
        beforeSave: function (r, api) {
          var c = api.get('classes', r.class); if (!r.queuedAt) r.queuedAt = nowDT(api);
          if (c && r.status === 'Booked' && L.occupancy(api.list('bookings'), c.id, r.date, r.id) >= (+c.capacity || 0)) { r.status = 'Waitlisted'; api.toast('Class is full — added to the waitlist'); }
        },
        afterSave: function (b, api) { fillFromWaitlist(api, b.class, b.date); },
        onStatus: function (r, v, api) { setTimeout(function () { fillFromWaitlist(api, r.class, r.date); }, 0); },
        actions: [
          { label: 'Check in', when: function (b) { return b.status === 'Booked'; }, run: function (b, api) { api.save('bookings', Object.assign({}, b, { status: 'Attended' })); } },
          { label: 'Cancel booking', when: function (b) { return b.status === 'Booked' || b.status === 'Waitlisted'; }, run: function (b, api) { api.save('bookings', Object.assign({}, b, { status: 'Cancelled' }), true); fillFromWaitlist(api, b.class, b.date); api.refresh(); } }
        ],
        detailExtra: function (el, b, api) {
          var c = api.get('classes', b.class); if (!c) return;
          var wl = L.waitlist(api.list('bookings'), c.id, b.date), pos = wl.map(function (x) { return x.id; }).indexOf(b.id);
          el.innerHTML = '<p class="small">' + L.occupancy(api.list('bookings'), c.id, b.date) + ' of ' + esc(c.capacity) + ' spots taken · ' + wl.length + ' waiting' + (pos >= 0 ? ' · this member is <b>#' + (pos + 1) + '</b> on the waitlist' : '') + '</p>';
        }
      },
      checkins: {
        label: 'Check-ins', single: 'Check-in', tab: false, title: function (r, api) { return api.title('members', r.member) + ' · ' + String(r.at || '').replace('T', ' '); },
        list: ['at', 'member', 'kind'], sort: { key: 'at', dir: 'desc' },
        fields: [
          { key: 'member', label: 'Member', type: 'link', entity: 'members', required: true },
          { key: 'at', label: 'When', type: 'datetime', required: true },
          { key: 'kind', label: 'Visit', type: 'select', options: ['Gym floor', 'Class', 'Personal training'], default: 'Gym floor' }
        ]
      },
      trainers: {
        label: 'Trainers', single: 'Trainer', title: 'name', list: ['name', 'phone', 'specialties', 'maxHours'],
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'phone', label: 'Phone', type: 'phone' },
          { key: 'email', label: 'Email', type: 'email' },
          { key: 'specialties', label: 'Specialties', type: 'text' },
          { key: 'maxHours', label: 'Max class hours per week', type: 'number', min: 0, max: 60 },
          { key: 'certExpiry', label: 'First aid / CPR expiry', type: 'date' }
        ]
      },
      payments: {
        label: 'Payments', single: 'Payment', sort: { key: 'date', dir: 'desc' },
        title: function (r, api) { return api.title('members', r.member) + ' · ' + money(r.amount) + ' · ' + (r.date || ''); },
        list: ['date', 'member', 'amount', 'method'], listTotals: ['amount'],
        fields: [
          { key: 'member', label: 'Member', type: 'link', entity: 'members', required: true, filter: true },
          { key: 'membership', label: 'Membership', type: 'link', entity: 'memberships', addFrom: true },
          { key: 'date', label: 'Date', type: 'date', required: true, default: 'today' },
          { key: 'amount', label: 'Amount incl. GST', type: 'money', min: 0, required: true },
          { key: 'method', label: 'Method', type: 'select', options: ['Card', 'Direct debit', 'Cash', 'Bank transfer'] },
          { key: 'note', label: 'For', type: 'text' }
        ]
      }
    },
    reminders: [
      { entity: 'memberships', date: 'end', warnDays: 30, pastDays: 14, label: 'Membership ends — offer a renewal', ruleText: 'Fixed-term memberships and class packs ending in the next 30 days (hold days included)', when: function (m) { return m.status !== 'Cancelled'; } },
      { entity: 'trainers', date: 'certExpiry', warnDays: 30, label: 'First aid / CPR certificate expires' }
    ],
    dashboard: {
      tiles: [
        { label: 'Active members', value: function (api) { return api.list('members').filter(function (m) { var c = currentOf(api, m.id); return c && stateOf(api, c) === 'Active'; }).length; } },
        { label: 'On hold', value: function (api) { return api.list('memberships').filter(function (m) { return stateOf(api, m) === 'On hold'; }).length; } },
        { label: 'At risk (not seen 14+ days)', value: function (api) { return atRiskList(api, 14).length; }, tone: function (v) { return v ? 'warn' : ''; } },
        { label: 'Ending in 30 days', value: function (api) { var t = api.today(), e = C.addDays(t, 30); return api.list('memberships').filter(function (m) { return m.status !== 'Cancelled' && m.end && m.end >= t && m.end <= e; }).length; } },
        { label: 'No health declaration', entity: 'members', kind: 'count', where: function (m) { return !m.healthDeclaration; }, tone: function (v) { return v ? 'bad' : ''; } },
        { label: 'Takings this month', entity: 'payments', kind: 'sum', field: 'amount', where: function (p, t) { return String(p.date).slice(0, 7) === t.slice(0, 7); } }
      ],
      charts: [{ title: 'Members by plan (current)', entity: 'memberships', by: 'plan', where: function (m) { return m.status === 'Active' || m.status === 'Paused'; } }],
      render: renderRetention
    },
    documents: [
      { id: 'card', label: 'member card', entity: 'members', build: function (m, api) {
        var cur = currentOf(api, m.id), p = cur && planOf(api, cur);
        return { title: 'Member card', number: m.number, date: api.today(), intro: m.name,
          meta: [['Plan', p ? p.name : ''], ['Status', cur ? stateOf(api, cur) : 'No membership'], ['Valid to', cur ? (cur.end || 'ongoing') : ''], ['Member since', m.joined]],
          sections: [{ heading: 'In an emergency', text: [m.emergencyName, m.emergencyPhone].filter(Boolean).join(' — ') || 'Not recorded' }],
          footer: 'Show this card at the front desk. Please tell staff about any injury before training.' };
      } },
      { id: 'receipt', label: 'receipt', entity: 'payments', build: function (p, api) {
        var m = api.get('members', p.member) || {}, amt = +p.amount || 0, gst = C.gstFromInclusive(amt);
        return { title: 'Tax invoice / receipt', number: 'R-' + String(p.id).slice(-6).toUpperCase(), date: p.date, meta: [['Paid by', p.method], ['Member', m.number]],
          to: { heading: 'Received from', lines: [m.name, m.email] }, lines: [{ desc: p.note || 'Membership', qty: 1, price: amt }],
          totals: { subtotal: C.r2(amt - gst), markup: 0, discount: 0, net: C.r2(amt - gst), gst: gst, total: amt }, paid: amt, footer: 'Thank you. Prices include GST.' };
      } }
    ],
    tabs: [
      { id: 'desk', label: 'Check-in desk', after: 'memberships', render: renderDesk },
      { id: 'timetable', label: 'Timetable', after: 'classes', render: renderTimetable },
      { id: 'trainersched', label: 'Trainer schedule', after: 'trainers', render: renderTrainers },
      { id: 'renewals', label: 'Renewals', after: 'x-trainersched', render: renderRenewals }
    ],
    sample: function (today) { return L.sample(today); },
    afterSample: function (api) { api.list('memberships').forEach(function (m) { resaveMembership(api, m.id); }); }
  });

  function atRiskList(api, days) {
    return L.atRisk(api.list('members'), { memberships: api.list('memberships'), plans: api.list('plans'), holds: api.list('holds'), checkins: api.list('checkins'), bookings: api.list('bookings') }, api.today(), days);
  }

  // ---------- retention (dashboard) ----------
  function renderRetention(el, api) {
    var t = api.today(), risk = atRiskList(api, 14), mv = L.monthlyMovement(api.list('memberships'), 6, t);
    var fr = L.fillRates(api.list('classes'), api.list('bookings'), C.addDays(t, -28), C.addDays(t, -1));
    el.innerHTML = '<div class="panel"><h3 style="margin-top:0">At risk — not seen for 14+ days</h3>' + (risk.length ? '<div class="table-wrap"><table><thead><tr><th>Member</th><th>Last seen</th><th class="num">Days</th><th>Phone</th></tr></thead><tbody>' + risk.map(function (r) {
      var m = api.get('members', r.member) || {};
      return '<tr><td><button type="button" class="fg-linkbtn" data-open="members" data-id="' + esc(m.id) + '">' + esc(m.name) + '</button></td><td>' + esc(r.lastSeen || 'never') + '</td><td class="num ' + (r.days >= 30 ? 'bad' : 'warn') + '">' + r.days + '</td><td>' + (m.phone ? '<a href="tel:' + esc(String(m.phone).replace(/\s/g, '')) + '">' + esc(m.phone) + '</a>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div><p class="small muted">30+ days in red. A friendly call or text in the first month of absence is the cheapest way to keep a member. Members on hold are left out.</p>' : '<p class="muted small">Everyone with an active membership has been in within 14 days.</p>') + '</div>' +
      '<div class="cols-2"><div class="panel"><h3 style="margin-top:0">Joined vs cancelled (6 months)</h3>' + B.table(mv, [{ key: 'month', label: 'Month' }, { key: 'joined', label: 'Joined' }, { key: 'cancelled', label: 'Cancelled' }, { key: 'net', label: 'Net' }]) + '</div>' +
      '<div class="panel"><h3 style="margin-top:0">Class fill rate (last 4 weeks)</h3>' + (fr.length ? B.barChart(fr.map(function (r) { return { label: r.name, value: Math.round(r.fill * 100) }; }), { fmt: function (v) { return v + '%'; } }) : '<p class="muted small">No classes yet.</p>') + '</div></div>';
  }

  // ---------- check-in desk ----------
  var deskQ = '';
  function renderDesk(el, api) {
    var t = api.today(), q = deskQ.toLowerCase();
    var list = api.list('members').filter(function (m) { return !q || (m.name + ' ' + m.number + ' ' + (m.phone || '')).toLowerCase().indexOf(q) >= 0; }).sort(function (a, b) { return a.name.localeCompare(b.name); }).slice(0, 30);
    var todays = api.list('checkins').filter(function (c) { return C.dayOf(c.at) === t; }).sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    el.innerHTML = '<div class="row fg-toolbar"><label for="dk-q" style="margin:0">Find member</label><input type="search" id="dk-q" value="' + esc(deskQ) + '" placeholder="Name, number or phone" style="width:auto;flex:1;min-width:160px"></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Member</th><th>Membership</th><th></th></tr></thead><tbody>' + list.map(function (m) {
        var cur = currentOf(api, m.id), s = cur ? stateOf(api, cur) : 'No membership', warn = [];
        if (!m.healthDeclaration) warn.push('no health declaration'); if (s !== 'Active') warn.push(s.toLowerCase());
        var left = cur ? L.packRemaining(cur, planOf(api, cur), api.list('bookings')) : null;
        return '<tr><td><button type="button" class="fg-linkbtn" data-open="members" data-id="' + esc(m.id) + '">' + esc(m.name) + '</button><div class="small muted">' + esc(m.number) + '</div></td><td>' + pill(s) + (left != null ? '<div class="small">' + left + ' classes left</div>' : '') + (m.healthDeclaration ? '' : '<div class="small bad">No health declaration</div>') + '</td>' +
          '<td><button class="btn small" type="button" data-ci="' + esc(m.id) + '" data-warn="' + esc(warn.join(', ')) + '">Check in</button></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<h4>Checked in today (' + todays.length + ')</h4>' + (todays.length ? '<ul class="small">' + todays.map(function (c) { return '<li>' + esc(C.timeOf(c.at)) + ' — ' + esc(api.title('members', c.member)) + ' (' + esc(c.kind) + ')</li>'; }).join('') + '</ul>' : '<p class="muted small">Nobody yet.</p>');
    var qi = el.querySelector('#dk-q');
    qi.addEventListener('input', function () { deskQ = qi.value; var pos = qi.selectionStart; renderDesk(el, api); var n = el.querySelector('#dk-q'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } });
    B.$$('[data-ci]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.warn && !confirm('Heads up: ' + b.dataset.warn + '.\n\nCheck in anyway?')) return;
        api.save('checkins', { id: C.uid(), member: b.dataset.ci, at: nowDT(api), kind: 'Gym floor' }, true); renderDesk(el, api); api.toast('Checked in');
      });
    });
  }

  // ---------- timetable with rosters ----------
  var ttWeek = null, ttSel = null;
  function renderTimetable(el, api) {
    ttWeek = ttWeek || C.weekStart(api.today());
    var days = C.weekOf(ttWeek), occ = L.occurrences(api.list('classes'), days[0], days[6]), bk = api.list('bookings');
    var clashes = L.timetableClashes(api.list('classes'));
    var h = '<div class="row fg-toolbar"><button class="btn small" type="button" id="tt-prev" aria-label="Previous week">◀</button><b>Week of ' + esc(days[0]) + '</b><button class="btn small" type="button" id="tt-next" aria-label="Next week">▶</button><button class="btn small" type="button" id="tt-this">This week</button><button class="btn small" type="button" id="tt-print">Print timetable</button></div>';
    if (clashes.length) h += '<div class="panel"><b class="warn">Timetable clashes</b>' + clashes.map(function (c) { return '<p class="small">Same ' + c.why + ': ' + esc(classLabel(api.get('classes', c.a))) + ' and ' + esc(classLabel(api.get('classes', c.b))) + '</p>'; }).join('') + '</div>';
    h += '<div class="table-wrap"><table><thead><tr>' + days.map(function (d, i) { return '<th>' + C.WEEKDAYS[i] + ' ' + (+d.slice(8)) + '</th>'; }).join('') + '</tr></thead><tbody><tr>' + days.map(function (d) {
      return '<td style="min-width:110px;vertical-align:top">' + occ.filter(function (o) { return o.date === d; }).map(function (o) {
        var n = L.occupancy(bk, o.cls.id, d), w = L.waitlist(bk, o.cls.id, d).length, key = o.cls.id + '|' + d;
        return '<button type="button" class="fg-ev" data-occ="' + esc(key) + '" aria-pressed="' + (ttSel === key) + '" style="white-space:normal;text-align:left">' + esc(o.cls.time) + ' ' + esc(o.cls.name) + '<br><span class="small">' + n + '/' + esc(o.cls.capacity) + (w ? ' · ' + w + ' waiting' : '') + '</span></button>';
      }).join('') + '</td>';
    }).join('') + '</tr></tbody></table></div><p class="small muted">Tap a class to see its roster, book members, check them in and manage the waitlist.</p><div id="tt-roster"></div>';
    el.innerHTML = h;
    var go = function (w) { ttWeek = w; ttSel = null; renderTimetable(el, api); };
    el.querySelector('#tt-prev').addEventListener('click', function () { go(C.addDays(ttWeek, -7)); });
    el.querySelector('#tt-next').addEventListener('click', function () { go(C.addDays(ttWeek, 7)); });
    el.querySelector('#tt-this').addEventListener('click', function () { go(C.weekStart(api.today())); });
    el.querySelector('#tt-print').addEventListener('click', function () {
      api.print({ title: 'Class timetable', date: 'Week of ' + days[0], sections: [{ table: { headers: ['Day', 'Time', 'Class', 'Trainer', 'Room', 'Booked', 'Capacity'], rows: occ.map(function (o) { return [C.WEEKDAYS[C.weekday(o.date)] + ' ' + o.date, o.cls.time, o.cls.name, api.title('trainers', o.cls.trainer), o.cls.room, L.occupancy(bk, o.cls.id, o.date), o.cls.capacity]; }) } }] });
    });
    B.$$('[data-occ]', el).forEach(function (b) { b.addEventListener('click', function () { ttSel = b.dataset.occ; renderTimetable(el, api); }); });
    if (ttSel) renderRoster(el.querySelector('#tt-roster'), api, el);
  }
  function renderRoster(box, api, parent) {
    var parts = ttSel.split('|'), cls = api.get('classes', parts[0]), date = parts[1]; if (!cls) return;
    var bk = api.list('bookings').filter(function (b) { return b.class === cls.id && b.date === date && b.status !== 'Cancelled'; });
    var booked = bk.filter(function (b) { return b.status !== 'Waitlisted'; }), wl = L.waitlist(api.list('bookings'), cls.id, date);
    var have = bk.map(function (b) { return b.member; });
    var row = function (b, i) {
      var acts = b.status === 'Booked' ? '<button class="btn small" type="button" data-rs="Attended" data-id="' + esc(b.id) + '">Check in</button><button class="btn small" type="button" data-rs="No-show" data-id="' + esc(b.id) + '">No-show</button><button class="btn small" type="button" data-rs="Cancelled" data-id="' + esc(b.id) + '">Cancel</button>'
        : b.status === 'Waitlisted' ? '<button class="btn small" type="button" data-rs="Cancelled" data-id="' + esc(b.id) + '">Remove</button>' : '';
      return '<tr><td>' + (i != null ? '#' + (i + 1) + ' ' : '') + esc(api.title('members', b.member)) + '</td><td>' + esc(b.status) + '</td><td><div class="row">' + acts + '</div></td></tr>';
    };
    box.innerHTML = '<div class="panel"><h3 style="margin-top:0">' + esc(cls.name) + ' — ' + esc(date) + ' ' + esc(cls.time) + '</h3><p class="small">' + esc(api.title('trainers', cls.trainer)) + ' · ' + esc(cls.room || '') + ' · <b>' + L.occupancy(api.list('bookings'), cls.id, date) + ' of ' + esc(cls.capacity) + '</b> spots taken</p>' +
      '<div class="row"><label for="tt-add" style="margin:0">Add member</label><select id="tt-add" style="width:auto"><option value="">Choose…</option>' + api.list('members').filter(function (m) { return have.indexOf(m.id) < 0; }).map(function (m) { return '<option value="' + esc(m.id) + '">' + esc(m.name) + '</option>'; }).join('') + '</select><button class="btn small primary" type="button" id="tt-book">Book</button></div>' +
      (booked.length ? '<div class="table-wrap"><table><tbody>' + booked.map(function (b) { return row(b); }).join('') + '</tbody></table></div>' : '<p class="muted small">No bookings yet.</p>') +
      (wl.length ? '<h4>Waitlist</h4><div class="table-wrap"><table><tbody>' + wl.map(row).join('') + '</tbody></table></div>' : '') + '</div>';
    box.querySelector('#tt-book').addEventListener('click', function () {
      var mid = box.querySelector('#tt-add').value; if (!mid) return api.toast('Choose a member first');
      var r = L.requestBooking(api.list('bookings'), cls, date, mid); if (!r.ok) return api.toast(r.reason);
      api.save('bookings', { id: C.uid(), member: mid, class: cls.id, date: date, status: r.status, queuedAt: nowDT(api) }, true);
      api.toast(r.status === 'Booked' ? 'Booked' : 'Class full — waitlisted at #' + r.position); renderTimetable(parent, api);
    });
    B.$$('[data-rs]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var rec = api.get('bookings', b.dataset.id); api.save('bookings', Object.assign({}, rec, { status: b.dataset.rs }), true);
        if (b.dataset.rs === 'Cancelled') fillFromWaitlist(api, cls.id, date);
        renderTimetable(parent, api);
      });
    });
  }

  // ---------- trainer schedule ----------
  function renderTrainers(el, api) {
    var hrs = L.trainerHours(api.list('classes'), api.list('trainers')), cls = api.list('classes').filter(function (c) { return c.active !== false; });
    var clashes = L.timetableClashes(cls).filter(function (c) { return c.why === 'trainer'; });
    el.innerHTML = '<div class="row fg-toolbar"><button class="btn small" type="button" id="tr-print">Print trainer schedule</button></div>' +
      B.table(hrs, [{ key: 'name', label: 'Trainer' }, { key: 'classes', label: 'Classes / week' }, { key: 'hours', label: 'Hours / week' }, { key: 'max', label: 'Max hours', fmt: function (v) { return v || '–'; } }, { key: 'over', label: 'Status', fmt: function (v) { return v ? 'Over max' : 'OK'; } }]) +
      (clashes.length ? '<p class="small bad">' + clashes.map(function (c) { var a = api.get('classes', c.a); return esc(api.title('trainers', a.trainer)) + ' is double-booked: ' + esc(classLabel(a)) + ' and ' + esc(classLabel(api.get('classes', c.b))); }).join('<br>') + '</p>' : '') +
      api.list('trainers').map(function (t) {
        var mine = cls.filter(function (c) { return c.trainer === t.id; }).sort(function (a, b) { return C.WEEKDAYS.indexOf(a.weekday) - C.WEEKDAYS.indexOf(b.weekday) || (a.time < b.time ? -1 : 1); });
        return '<h4>' + esc(t.name) + '</h4>' + (mine.length ? '<ul class="small">' + mine.map(function (c) { return '<li>' + esc(c.weekday + ' ' + c.time) + ' — ' + esc(c.name) + ' (' + (c.minutes || 60) + ' min, ' + esc(c.room || '') + ')</li>'; }).join('') + '</ul>' : '<p class="small muted">No classes.</p>');
      }).join('') + '<p class="small muted">Hours come from the weekly timetable only (not personal training or cover shifts).</p>';
    el.querySelector('#tr-print').addEventListener('click', function () {
      api.print({ title: 'Trainer schedule', date: api.today(), sections: api.list('trainers').map(function (t) {
        var mine = cls.filter(function (c) { return c.trainer === t.id; }).sort(function (a, b) { return C.WEEKDAYS.indexOf(a.weekday) - C.WEEKDAYS.indexOf(b.weekday) || (a.time < b.time ? -1 : 1); });
        var hr = hrs.filter(function (x) { return x.trainer === t.id; })[0] || {};
        return { heading: t.name + ' — ' + (hr.hours || 0) + ' h/week', table: { headers: ['Day', 'Time', 'Class', 'Minutes', 'Room'], rows: mine.map(function (c) { return [c.weekday, c.time, c.name, c.minutes || 60, c.room]; }) } };
      }) });
    });
  }

  // ---------- renewals ----------
  var renDays = 30;
  function renewalRows(api) {
    var t = api.today(), until = C.addDays(t, renDays);
    return api.list('memberships').filter(function (m) { return m.status !== 'Cancelled'; }).map(function (m) {
      var p = planOf(api, m), hs = holdsOf(api, m), s = L.state(m, p, hs, t), fixed = p && (p.billing === 'Annual' || p.billing === 'Class pack' || +p.termMonths > 0);
      var due = p && p.billing === 'Class pack' ? m.end : L.nextBilling(m, p, hs, t), left = L.packRemaining(m, p, api.list('bookings'));
      return { m: m, member: api.title('members', m.member), plan: p ? p.name : '', kind: p && p.billing === 'Class pack' ? 'Pack ends' : fixed ? 'Term ends — renew' : 'Next payment', due: due, state: s, left: left, price: p ? +p.price || 0 : 0 };
    }).filter(function (r) { return r.due && r.due <= until && (r.due >= C.addDays(t, -14)) || (r.left != null && r.left <= 2 && r.state !== 'Expired'); }).sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); });
  }
  function renderRenewals(el, api) {
    var rows = renewalRows(api);
    el.innerHTML = '<div class="row fg-toolbar"><label for="rn-days" style="margin:0">Next</label><select id="rn-days" style="width:auto">' + [14, 30, 60, 90].map(function (d) { return '<option' + (d === renDays ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select><span>days</span>' +
      '<button class="btn small" type="button" id="rn-ics"' + (rows.length ? '' : ' disabled') + '>Add to calendar (.ics)</button><button class="btn small" type="button" id="rn-csv"' + (rows.length ? '' : ' disabled') + '>CSV</button></div>' +
      (rows.length ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Member</th><th>Plan</th><th>What</th><th class="num">Amount</th></tr></thead><tbody>' + rows.map(function (r) {
        return '<tr><td>' + esc(r.due || '–') + '</td><td><button type="button" class="fg-linkbtn" data-open="memberships" data-id="' + esc(r.m.id) + '">' + esc(r.member) + '</button> ' + (r.state !== 'Active' ? pill(r.state) : '') + '</td><td>' + esc(r.plan) + '</td><td>' + esc(r.kind) + (r.left != null ? '<div class="small ' + (r.left <= 2 ? 'warn' : '') + '">' + r.left + ' classes left</div>' : '') + '</td><td class="num">' + esc(money(r.price)) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="muted">Nothing due in this period.</p>') +
      '<p class="small muted">Payment dates are worked out from the start date and billing cycle, pushed back by any hold days. This app does not charge cards — use your payment provider for direct debits.</p>';
    el.querySelector('#rn-days').addEventListener('change', function (e) { renDays = +e.target.value; renderRenewals(el, api); });
    el.querySelector('#rn-ics').addEventListener('click', function () {
      api.ics(rows.filter(function (r) { return r.due; }).map(function (r) { return { uid: 'renew-' + r.m.id + '-' + r.due, title: r.kind + ': ' + r.member + ' (' + r.plan + ')', day: r.due, description: 'Amount ' + money(r.price), alarmDays: r.kind === 'Next payment' ? 0 : 7 }; }), 'gym-renewals');
    });
    el.querySelector('#rn-csv').addEventListener('click', function () {
      var cols = ['Date', 'Member', 'Plan', 'What', 'Classes left', 'Amount'];
      B.download('gym-renewals.csv', '﻿' + B.csv.stringify(rows.map(function (r) { return { Date: r.due, Member: r.member, Plan: r.plan, What: r.kind, 'Classes left': r.left == null ? '' : r.left, Amount: r.price }; }), cols), 'text/csv;charset=utf-8');
    });
  }
})();
