/* Smart Trip Planner — page wiring. Logic in lib.js (TripLib). */
(function () {
  'use strict';
  var L = window.TripLib, K = window.VaultKit, $ = B.$, esc = B.esc, money = K.money;
  var KEY = 'tripplanner:data';
  var data = load(), sched = null, editId = null, showTab;
  var TRIP_FIELDS = ['destination', 'start', 'end', 'budget', 'transport', 'pace', 'tripType', 'weather', 'dayStart', 'dayEnd', 'baseArea', 'napMins', 'napStart'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function load() {
    var d = B.store.get(KEY, null) || {};
    return { trip: Object.assign(L.defaultTrip(K.today()), d.trip || {}), activities: (d.activities || []).map(L.normaliseActivity), packed: d.packed || {}, extraPack: d.extraPack || [] };
  }
  function save() { if (!B.store.set(KEY, data)) B.toast('Could not save — browser storage may be full.', 4000); }
  function stat(v, k, cls) { return '<div class="stat"><div class="v ' + (cls || '') + '">' + esc(v) + '</div><div class="k">' + esc(k) + '</div></div>'; }
  function hm(n) { return L.hhmm(n); }
  function dayName(iso) { return DAYS[new Date(iso + 'T00:00:00Z').getUTCDay()]; }

  // ---------- trip ----------
  function fillTrip() {
    var t = data.trip;
    TRIP_FIELDS.forEach(function (f) { $('#t-' + f).value = t[f] == null ? '' : t[f]; });
    $('#t-lunch').checked = t.lunch !== false;
    renderTravellers();
  }
  function readTrip() {
    TRIP_FIELDS.forEach(function (f) { var v = $('#t-' + f).value; data.trip[f] = /budget|napMins/.test(f) ? (Number(v) || 0) : v; });
    data.trip.lunch = $('#t-lunch').checked;
    save(); recompute();
  }
  function renderTravellers() {
    $('#travellers').innerHTML = data.trip.travellers.map(function (p, i) {
      return '<div class="trav"><input type="text" aria-label="Name" data-tr="' + i + '|name" value="' + esc(p.name) + '"><input type="number" aria-label="Age" min="0" max="110" data-tr="' + i + '|age" value="' + esc(p.age) + '">' +
        '<button class="btn small" type="button" data-trdel="' + i + '" aria-label="Remove">×</button></div>';
    }).join('');
  }

  // ---------- activities ----------
  function clearForm() {
    editId = null; $('#actTitle').textContent = 'Add an activity'; $('#a-save').textContent = 'Add activity';
    ['name', 'area', 'date', 'notes'].forEach(function (f) { $('#a-' + f).value = ''; });
    $('#a-duration').value = 120; $('#a-open').value = '09:00'; $('#a-close').value = '17:00'; $('#a-costAdult').value = 0; $('#a-costChild').value = 0;
    $('#a-priority').value = 'want'; $('#a-setting').value = 'outdoor'; $('#a-kid').checked = true;
    B.$$('#a-closed input').forEach(function (c) { c.checked = false; });
  }
  function editAct(id) {
    var a = data.activities.filter(function (x) { return x.id === id; })[0]; if (!a) return;
    editId = id; $('#actTitle').textContent = 'Edit activity'; $('#a-save').textContent = 'Save changes';
    ['name', 'area', 'duration', 'open', 'close', 'costAdult', 'costChild', 'priority', 'setting', 'date', 'notes'].forEach(function (f) { $('#a-' + f).value = a[f]; });
    $('#a-kid').checked = a.kidFriendly;
    B.$$('#a-closed input').forEach(function (c) { c.checked = a.closedDays.indexOf(+c.value) >= 0; });
    showTab('acts'); $('#actPanel').scrollIntoView({ behavior: 'smooth' });
  }
  function saveAct() {
    var name = $('#a-name').value.trim(); if (!name) { $('#a-name').focus(); return B.toast('Give the activity a name'); }
    var a = L.normaliseActivity({ id: editId || B.uid(), name: name, area: $('#a-area').value, duration: $('#a-duration').value, open: $('#a-open').value, close: $('#a-close').value,
      costAdult: $('#a-costAdult').value, costChild: $('#a-costChild').value, priority: $('#a-priority').value, setting: $('#a-setting').value, date: $('#a-date').value, notes: $('#a-notes').value,
      kidFriendly: $('#a-kid').checked, closedDays: B.$$('#a-closed input').filter(function (c) { return c.checked; }).map(function (c) { return +c.value; }) });
    if (L.toMin(a.close) <= L.toMin(a.open)) return B.toast('Closing time must be after opening time');
    var i = data.activities.findIndex(function (x) { return x.id === a.id; });
    if (i >= 0) data.activities[i] = a; else data.activities.push(a);
    save(); clearForm(); recompute(); B.toast('Saved — itinerary updated');
  }
  function renderActs() {
    var areas = {}; data.activities.forEach(function (a) { areas[a.area] = 1; }); if (data.trip.baseArea) areas[data.trip.baseArea] = 1;
    $('#areaList').innerHTML = Object.keys(areas).map(function (a) { return '<option value="' + esc(a) + '">'; }).join('');
    var unsched = {}; (sched ? sched.unscheduled : []).forEach(function (u) { unsched[u.act.id] = 1; });
    var list = data.activities.slice().sort(function (a, b) { return a.area.localeCompare(b.area) || a.name.localeCompare(b.name); });
    $('#actList').innerHTML = list.length ? B.table(list.map(function (a) { return a; }), [
      { key: 'name', label: 'Activity', fmt: function (v, a) { return '<b>' + esc(v) + '</b>' + (a.template ? ' <span class="pill-mute">generic idea</span>' : '') + (unsched[a.id] ? ' <span class="pill-warn">not scheduled</span>' : '') + '<br><span class="small muted">' + esc(a.area) + ' · ' + esc(L.PRIORITY_NAME[a.priority]) + (a.kidFriendly ? '' : ' · not for kids') + '</span>'; } },
      { key: 'duration', label: 'Time', fmt: function (v, a) { return (v / 60).toFixed(v % 60 ? 1 : 0) + ' h<br><span class="small muted">' + esc(a.open) + '–' + esc(a.close) + '</span>'; } },
      { key: 'costAdult', label: 'Cost', fmt: function (v, a) { return money(L.costOf(a, data.trip)); } },
      { key: 'id', label: '', fmt: function (id) { return '<button class="btn small" type="button" data-aedit="' + esc(id) + '">Edit</button> <button class="btn small" type="button" data-adel="' + esc(id) + '">×</button>'; } }
    ]) : '<p class="muted">No activities yet. Add your own above, or start from the generic ideas.</p>';
  }

  // ---------- itinerary ----------
  function recompute() { sched = L.schedule(data.trip, data.activities); renderPlan(); renderActs(); renderBudget(); renderPack(); }
  function renderPlan() {
    var placed = sched.days.reduce(function (s, d) { return s + d.items.filter(function (x) { return x.type === 'activity'; }).length; }, 0);
    $('#planStats').innerHTML = stat(String(sched.days.length), 'Days') + stat(placed + ' of ' + data.activities.length, 'Activities scheduled') +
      stat(money(sched.cost), 'Activities cost (estimate)') + stat(sched.budget ? money(sched.budget) : 'No limit', 'Left for activities', sched.budget && sched.cost > sched.budget ? 'bad' : '');
    $('#warnings').innerHTML = sched.warnings.map(function (w) { return '<p class="warn" style="margin:6px 0">⚠ ' + esc(w) + '</p>'; }).join('');
    $('#days').innerHTML = sched.days.map(function (d, i) {
      return '<div class="panel day"><div class="row"><h3>Day ' + (i + 1) + ' · ' + dayName(d.date) + ' ' + K.niceDate(d.date) + '</h3>' + (d.cost ? '<span class="tag">' + money(d.cost) + '</span>' : '') +
        '<label class="check small no-print" style="margin-left:auto"><input type="checkbox" data-rain="' + d.date + '"' + (d.rain ? ' checked' : '') + '> Rain expected</label></div>' +
        '<ul class="tl">' + d.items.map(function (x) {
          var what = x.type === 'activity' ? '<b>' + esc(x.act.name) + '</b> <span class="small muted">' + esc(x.act.area) + (x.cost ? ' · ' + money(x.cost) : '') + (x.act.setting === 'indoor' ? ' · indoor' : '') + '</span>' + (x.act.notes ? '<br><span class="small muted">' + esc(x.act.notes) + '</span>' : '')
            : esc(x.label);
          return '<li class="' + x.type + '"><span class="t">' + hm(x.start) + '–' + hm(x.end) + '</span><span>' + what + '</span></li>';
        }).join('') + '</ul>' + (d.items.some(function (x) { return x.type === 'activity'; }) ? '' : '<p class="small muted">Free day.</p>') + '</div>';
    }).join('');
    $('#unschedPanel').hidden = !sched.unscheduled.length;
    $('#unsched').innerHTML = sched.unscheduled.length ? B.table(sched.unscheduled.map(function (u) { return { name: u.act.name, pri: L.PRIORITY_NAME[u.act.priority], why: u.reason, id: u.act.id }; }),
      [{ key: 'name', label: 'Activity' }, { key: 'pri', label: 'Priority' }, { key: 'why', label: 'Why' }, { key: 'id', label: '', fmt: function (id) { return '<button class="btn small" type="button" data-aedit="' + esc(id) + '">Edit</button>'; } }]) +
      '<p class="small muted">Try a longer day, a faster pace, fewer must-dos, a bigger budget or another date.</p>' : '';
  }

  // ---------- packing ----------
  function renderPack() {
    var groups = L.packingList(data.trip);
    if (data.extraPack.length) groups.push({ group: 'My extras', items: data.extraPack });
    $('#pack').innerHTML = groups.map(function (g) {
      return '<div class="pack-group"><h3>' + esc(g.group) + '</h3>' + g.items.map(function (it) {
        var k = g.group + '|' + it; return '<label><input type="checkbox" data-pack="' + esc(k) + '"' + (data.packed[k] ? ' checked' : '') + '><span>' + esc(it) + '</span></label>';
      }).join('') + '</div>';
    }).join('');
  }
  function packHTML() {
    var groups = L.packingList(data.trip); if (data.extraPack.length) groups.push({ group: 'My extras', items: data.extraPack });
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Packing list</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:#000;columns:2;column-gap:28px}h1{column-span:all;font-size:20px}h2{font-size:15px;margin:12px 0 4px}div{break-inside:avoid}p{margin:2px 0}</style></head><body><h1>Packing list — ' + esc(data.trip.destination || 'trip') + '</h1>' +
      groups.map(function (g) { return '<div><h2>' + esc(g.group) + '</h2>' + g.items.map(function (i) { return '<p>☐ ' + esc(i) + '</p>'; }).join('') + '</div>'; }).join('') + '</body></html>';
  }

  // ---------- budget ----------
  function renderBudget() {
    var t = data.trip, s = L.budgetSummary(t, sched);
    $('#budStats').innerHTML = stat(s.budget ? money(s.budget) : 'Not set', 'Budget') + stat(money(s.planned), 'Planned', s.over ? 'bad' : '') + stat(money(s.spent), 'Spent so far') + stat(s.budget ? money(s.left) : '–', 'Budget left', s.budget && s.left < 0 ? 'bad' : 'ok');
    $('#costLines').innerHTML = (t.costs || []).map(function (c, i) {
      return '<div class="line"><input type="text" aria-label="Cost name" data-cost="' + i + '|label" value="' + esc(c.label) + '"><input type="number" aria-label="Planned amount" min="0" step="10" data-cost="' + i + '|planned" value="' + esc(c.planned) + '"><button class="btn small" type="button" data-costdel="' + i + '" aria-label="Remove">×</button></div>';
    }).join('') || '<p class="small muted">e.g. Accommodation, Food, Fuel, Flights.</p>';
    var cats = (t.costs || []).map(function (c) { return c.label; }).filter(Boolean).concat(['Activities', 'Other']);
    var cur = $('#s-cat').value; $('#s-cat').innerHTML = cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join(''); if (cats.indexOf(cur) >= 0) $('#s-cat').value = cur;
    $('#spends').innerHTML = (t.spends || []).length ? B.table(t.spends.slice().reverse(), [{ key: 'label', label: 'What' }, { key: 'category', label: 'Category' }, { key: 'amount', label: 'Amount', fmt: function (v) { return money(v); } },
      { key: 'id', label: '', fmt: function (id) { return '<button class="btn small" type="button" data-spdel="' + esc(id) + '" aria-label="Remove">×</button>'; } }]) : '<p class="small muted">Nothing spent yet.</p>';
    $('#budTable').innerHTML = B.table(s.rows, [{ key: 'label', label: 'Category' }, { key: 'planned', label: 'Planned', fmt: function (v) { return money(v); } }, { key: 'spent', label: 'Spent', fmt: function (v) { return money(v); } },
      { key: 'left', label: 'Left', fmt: function (v) { return '<span class="' + (v < 0 ? 'bad' : '') + '">' + money(v) + '</span>'; } }]) +
      (s.over ? '<p class="bad">Your plan (' + money(s.planned) + ') is over budget by ' + money(s.planned - s.budget) + '.</p>' : '');
  }

  // ---------- events ----------
  B.$$('#tripForm input, #tripForm select').forEach(function (el) { el.addEventListener('change', readTrip); });
  $('#travellers').addEventListener('change', function (e) {
    var p = (e.target.dataset.tr || '').split('|'); if (!p[1]) return;
    data.trip.travellers[+p[0]][p[1]] = p[1] === 'age' ? Number(e.target.value) : e.target.value; save(); recompute();
  });
  $('#addTrav').addEventListener('click', function () { data.trip.travellers.push({ name: 'Traveller ' + (data.trip.travellers.length + 1), age: 30 }); save(); renderTravellers(); recompute(); });
  $('#costLines').addEventListener('change', function (e) {
    var p = (e.target.dataset.cost || '').split('|'); if (!p[1]) return;
    data.trip.costs[+p[0]][p[1]] = p[1] === 'planned' ? Number(e.target.value) || 0 : e.target.value; save(); recompute();
  });
  $('#addCost').addEventListener('click', function () { data.trip.costs.push({ id: B.uid(), label: 'New cost', planned: 0 }); save(); renderBudget(); });
  $('#s-add').addEventListener('click', function () {
    var amt = Number($('#s-amount').value); if (!(amt > 0)) return B.toast('Enter an amount');
    data.trip.spends.push({ id: B.uid(), date: K.today(), label: $('#s-label').value.trim() || $('#s-cat').value, category: $('#s-cat').value, amount: amt });
    $('#s-label').value = ''; $('#s-amount').value = ''; save(); renderBudget();
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-trdel],[data-aedit],[data-adel],[data-costdel],[data-spdel]'); if (!t) return;
    var d = t.dataset;
    if (d.trdel != null) { if (data.trip.travellers.length < 2) return B.toast('At least one traveller'); data.trip.travellers.splice(+d.trdel, 1); renderTravellers(); }
    else if (d.aedit) return editAct(d.aedit);
    else if (d.adel) { data.activities = data.activities.filter(function (a) { return a.id !== d.adel; }); if (editId === d.adel) clearForm(); }
    else if (d.costdel != null) data.trip.costs.splice(+d.costdel, 1);
    else if (d.spdel) data.trip.spends = data.trip.spends.filter(function (s) { return s.id !== d.spdel; });
    save(); recompute();
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.rain) { var r = data.trip.rainDays || []; data.trip.rainDays = t.checked ? r.concat([t.dataset.rain]) : r.filter(function (x) { return x !== t.dataset.rain; }); save(); recompute(); }
    else if (t.dataset.pack) { if (t.checked) data.packed[t.dataset.pack] = 1; else delete data.packed[t.dataset.pack]; save(); }
  });
  $('#a-save').addEventListener('click', saveAct);
  $('#a-cancel').addEventListener('click', clearForm);
  $('#tplPick').innerHTML = Object.keys(L.TEMPLATES).map(function (k) { return '<option value="' + k + '">' + esc(L.TEMPLATES[k].name) + '</option>'; }).join('');
  $('#tplAdd').addEventListener('click', function () {
    var tp = L.TEMPLATES[$('#tplPick').value];
    tp.items.forEach(function (a) { data.activities.push(L.normaliseActivity(Object.assign({}, a, { id: B.uid() }))); });
    save(); recompute(); B.toast(tp.items.length + ' generic ideas added — edit them to real places');
  });
  $('#a-closed').innerHTML = DAYS.map(function (d, i) { return '<label class="check"><input type="checkbox" value="' + i + '"> ' + d + '</label>'; }).join('');
  $('#printPlan').addEventListener('click', function () { K.printHTML(L.itineraryHTML(data.trip, sched)); });
  $('#dlPlan').addEventListener('click', function () { B.download('itinerary.html', L.itineraryHTML(data.trip, sched), 'text/html;charset=utf-8'); });
  $('#icsPlan').addEventListener('click', function () { K.downloadICS('itinerary.ics', L.icsEvents(data.trip, sched), 'Trip Planner'); });
  $('#printPack').addEventListener('click', function () { K.printHTML(packHTML()); });
  $('#resetPack').addEventListener('click', function () { data.packed = {}; save(); renderPack(); });
  $('#packAddBtn').addEventListener('click', function () { var v = $('#packAdd').value.trim(); if (!v) return; data.extraPack.push(v); $('#packAdd').value = ''; save(); renderPack(); });
  $('#goTrip').addEventListener('click', function () { showTab('trip'); $('#t-destination').focus(); });
  $('#backup').addEventListener('click', function () { B.download('trip-plan-' + K.today() + '.json', JSON.stringify(K.makeBackup('trip-planner', data)), 'application/json'); });
  $('#restore').addEventListener('change', function () {
    var f = this.files[0]; this.value = ''; if (!f) return;
    B.readFile(f).then(function (text) {
      var o = K.readBackup(text, 'trip-planner'); if (!confirm('Open this plan? It replaces the current one.')) return;
      B.store.set(KEY, o.data); data = load(); fillTrip(); clearForm(); recompute(); B.toast('Plan opened');
    }).catch(function (err) { B.toast(err.message, 5000); });
  });
  $('#wipe').addEventListener('click', function () { if (!confirm('Clear this trip and all its activities?')) return; B.store.remove(KEY); data = load(); fillTrip(); clearForm(); recompute(); });
  $('#sample').addEventListener('click', function () {
    if (data.activities.length && !confirm('Replace your trip with a made-up sample?')) return;
    var s = L.sample(K.today()); data = { trip: s.trip, activities: s.activities, packed: {}, extraPack: [] }; save(); fillTrip(); clearForm(); recompute(); showTab('plan'); B.toast('Sample trip loaded — all made up');
  });

  showTab = B.tabs($('.tabs'));
  fillTrip(); recompute();
})();
