/* Home Inventory Vault — page wiring. Logic in lib.js (InventoryLib); photos in IndexedDB via vault-kit.js. */
(function () {
  'use strict';
  var L = window.InventoryLib, K = window.VaultKit, $ = B.$, esc = B.esc, money = K.money;
  var KEY = 'inventory:data', db = K.db('home-inventory');
  var data = load(), editing = null, newMedia = [], showTab, drawStorage;

  function load() { var d = B.store.get(KEY, null) || {}; return { items: (d.items || []).map(L.normalise), sumInsured: d.sumInsured || '', owner: d.owner || '' }; }
  function save() { if (!B.store.set(KEY, data)) B.toast('Could not save — browser storage may be full. Download a backup.', 4000); }
  function today() { return K.today(); }
  function opts(list, all) { return '<option value="">' + esc(all) + '</option>' + list.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join(''); }
  function roomsInUse() { var s = L.ROOMS.slice(); data.items.forEach(function (i) { if (s.indexOf(i.room) < 0) s.push(i.room); }); return s; }
  function catsInUse() { var s = L.CATEGORIES.slice(); data.items.forEach(function (i) { if (s.indexOf(i.category) < 0) s.push(i.category); }); return s; }
  var W_PILL = { expired: ['pill-bad', 'Warranty ended'], soon: ['pill-warn', 'Warranty ends soon'], ok: ['pill-ok', 'Under warranty'] };
  function wPill(it) { var w = L.warrantyStatus(it, today()); var p = W_PILL[w.status]; return p ? '<span class="' + p[0] + '">' + p[1] + '</span>' : ''; }
  function stat(v, k, cls) { return '<div class="stat"><div class="v ' + (cls || '') + '">' + esc(v) + '</div><div class="k">' + esc(k) + '</div></div>'; }
  function fillImgs(scope) {
    B.$$('img[data-mid]', scope).forEach(function (img) { db.url(img.dataset.mid).then(function (u) { if (u) img.src = u; else img.replaceWith(document.createTextNode('missing')); }).catch(function () {}); });
  }

  // ---------- items list ----------
  function renderStats() {
    var soon = L.expiringSoon(data.items, today(), 90).length, noProof = data.items.filter(function (i) { return L.gaps(i).length; }).length;
    $('#stats').innerHTML = stat(String(data.items.length), 'Items') + stat(money(L.grandTotal(data.items)), 'Total value') +
      stat(String(soon), 'Warranties ending in 90 days', soon ? 'warn' : '') + stat(String(noProof), 'Missing a photo, receipt or detail', noProof ? 'warn' : 'ok');
  }
  function renderFilters() {
    var r = $('#fRoom').value, c = $('#fCat').value;
    $('#fRoom').innerHTML = opts(roomsInUse(), 'All rooms'); $('#fRoom').value = r;
    $('#fCat').innerHTML = opts(catsInUse(), 'All categories'); $('#fCat').value = c;
  }
  function renderList() {
    var room = $('#fRoom').value, cat = $('#fCat').value;
    var list = L.search(data.items, $('#q').value).filter(function (i) { return (!room || i.room === room) && (!cat || i.category === cat); })
      .sort(function (a, b) { return a.room.localeCompare(b.room) || a.name.localeCompare(b.name); });
    $('#count').textContent = list.length + ' of ' + data.items.length + ' items · ' + money(L.grandTotal(list));
    if (!data.items.length) { $('#list').innerHTML = '<p>No items yet. Press <b>Add an item</b> — start with the expensive things (TV, laptop, jewellery, bikes) — or <b>Load sample data</b> to look around.</p>'; return; }
    $('#list').innerHTML = list.map(function (it) {
      var p = it.photos[0], g = L.gaps(it);
      return '<div class="card item-card"><div class="pic">' + (p ? '<img data-mid="' + esc(p.id) + '" alt="">' : 'No photo') + '</div><div>' +
        '<h3>' + esc(it.name) + '</h3><p>' + esc(it.room) + ' · ' + esc(it.category) + '</p><p><b>' + money(L.value(it)) + '</b>' + (it.qty > 1 ? ' (' + it.qty + ' × ' + money(it.price) + ')' : '') + '</p>' +
        '<p>' + wPill(it) + (it.serial ? ' <span class="tag">S/N ' + esc(it.serial) + '</span>' : '') + '</p>' +
        (g.length ? '<p class="small warn">Missing: ' + esc(g.join(', ')) + '</p>' : '') + '</div>' +
        '<div class="acts row"><button class="btn small" type="button" data-edit="' + esc(it.id) + '">Open / edit</button><button class="btn small" type="button" data-del="' + esc(it.id) + '">Delete</button></div></div>';
    }).join('') || '<p class="muted">Nothing matches.</p>';
    fillImgs($('#list'));
  }

  // ---------- editor ----------
  function startEdit(id) {
    var it = id ? data.items.filter(function (i) { return i.id === id; })[0] : null;
    editing = it ? JSON.parse(JSON.stringify(it)) : L.normalise({ id: B.uid(), room: $('#fRoom').value || 'Living room', category: $('#fCat').value || 'Electronics', purchaseDate: today() });
    editing._new = !it; newMedia = [];
    showTab('items'); renderEditor(); $('#editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function field(id, label, val, type, extra) { return '<div' + (extra && extra.full ? ' class="full"' : '') + '><label for="' + id + '">' + label + '</label><input type="' + (type || 'text') + '" id="' + id + '" value="' + esc(val) + '"' + (extra && extra.attrs ? ' ' + extra.attrs : '') + '></div>'; }
  function renderEditor() {
    var e = editing, ed = $('#editor');
    if (!e) { ed.hidden = true; ed.innerHTML = ''; return; }
    ed.hidden = false;
    ed.innerHTML = '<h2 style="margin-top:0">' + (e._new ? 'Add an item' : 'Edit item') + '</h2><div class="form-grid">' +
      field('e-name', 'What is it? *', e.name, 'text', { full: true, attrs: 'placeholder="e.g. Samsung 65&quot; TV" required' }) +
      '<div><label for="e-room">Room</label><input type="text" id="e-room" list="roomList" value="' + esc(e.room) + '"><datalist id="roomList">' + roomsInUse().map(function (r) { return '<option value="' + esc(r) + '">'; }).join('') + '</datalist></div>' +
      '<div><label for="e-cat">Category</label><input type="text" id="e-cat" list="catList" value="' + esc(e.category) + '"><datalist id="catList">' + catsInUse().map(function (r) { return '<option value="' + esc(r) + '">'; }).join('') + '</datalist></div>' +
      field('e-brand', 'Brand', e.brand) + field('e-model', 'Model', e.model) + field('e-serial', 'Serial number', e.serial) +
      field('e-date', 'Purchase date', e.purchaseDate, 'date') + field('e-price', 'Price paid each (AUD)', e.price || '', 'number', { attrs: 'min="0" step="0.01"' }) +
      field('e-qty', 'Quantity', e.qty, 'number', { attrs: 'min="1" step="1"' }) + field('e-retailer', 'Bought from', e.retailer) +
      field('e-warranty', 'Warranty (months, 0 = none)', e.warrantyMonths, 'number', { attrs: 'min="0" step="1"' }) +
      '<div><label>Warranty ends</label><p id="e-wend" style="margin:8px 0"></p></div>' +
      '<div class="full"><label for="e-notes">Notes</label><textarea id="e-notes" class="prose" style="min-height:60px">' + esc(e.notes) + '</textarea></div></div>' +
      '<h3>Photos</h3><p class="small muted">Photograph the item, its serial number label and the box. Photos are shrunk to about 1600 pixels to save space.</p>' +
      '<div class="thumbs" id="e-photos"></div><div class="row">' +
      '<span class="btn small file-btn">Take a photo<input type="file" accept="image/*" capture="environment" data-add="photos"></span>' +
      '<span class="btn small file-btn">Choose photos<input type="file" accept="image/*" multiple data-add="photos"></span></div>' +
      '<h3>Receipts</h3><p class="small muted">A photo or PDF of the receipt, invoice or bank statement line (PDF up to 10 MB).</p>' +
      '<div class="thumbs" id="e-receipts"></div><div class="row">' +
      '<span class="btn small file-btn">Photograph receipt<input type="file" accept="image/*" capture="environment" data-add="receipts"></span>' +
      '<span class="btn small file-btn">Choose files<input type="file" accept="image/*,application/pdf" multiple data-add="receipts"></span></div>' +
      '<div class="row" style="margin-top:14px"><button class="btn primary" type="button" id="e-save">Save item</button><button class="btn" type="button" id="e-cancel">Cancel</button></div>';
    renderMedia(); wEnd();
    $('#e-date').addEventListener('input', wEnd); $('#e-warranty').addEventListener('input', wEnd);
    B.$$('[data-add]', ed).forEach(function (inp) {
      inp.addEventListener('change', function () {
        var files = [].slice.call(inp.files), kind = inp.dataset.add; inp.value = '';
        if (!files.length) return;
        B.toast('Saving…');
        K.addFiles(db, files, { accept: kind === 'photos' ? /^image\// : /^(image\/|application\/pdf)/, maxBytes: 10 * 1048576 }).then(function (added) {
          added.forEach(function (m) { editing[kind].push(m); newMedia.push(m.id); }); renderMedia();
        }).catch(function (err) { B.toast(err.message, 5000); });
      });
    });
    $('#e-save').addEventListener('click', saveEdit);
    $('#e-cancel').addEventListener('click', function () {
      newMedia.forEach(function (id) { db.del(id); }); editing = null; renderEditor();
    });
  }
  function wEnd() {
    var w = L.warrantyExpiry({ purchaseDate: $('#e-date').value, warrantyMonths: +$('#e-warranty').value });
    $('#e-wend').textContent = w ? K.niceDate(w) : '—';
  }
  function renderMedia() {
    ['photos', 'receipts'].forEach(function (kind) {
      var box = $('#e-' + kind);
      box.innerHTML = editing[kind].map(function (m, i) {
        return '<div class="thumb">' + (/^image\//.test(m.type) ? '<img data-mid="' + esc(m.id) + '" alt="">' : '<a href="#" data-open="' + esc(m.id) + '">PDF<br>' + esc(m.name.slice(0, 14)) + '</a>') +
          '<button type="button" aria-label="Remove" data-rm="' + kind + ':' + i + '">×</button></div>';
      }).join('') || '<span class="small muted">None yet.</span>';
      fillImgs(box);
    });
    B.$$('[data-rm]', $('#editor')).forEach(function (b) {
      b.addEventListener('click', function () { var p = b.dataset.rm.split(':'); var m = editing[p[0]].splice(+p[1], 1)[0]; if (newMedia.indexOf(m.id) >= 0) db.del(m.id); else (editing._drop = editing._drop || []).push(m.id); renderMedia(); });
    });
    B.$$('[data-open]', $('#editor')).forEach(function (a) { a.addEventListener('click', function (ev) { ev.preventDefault(); db.url(a.dataset.open).then(function (u) { window.open(u, '_blank'); }); }); });
  }
  function saveEdit() {
    var name = $('#e-name').value.trim();
    if (!name) { $('#e-name').focus(); return B.toast('Give the item a name'); }
    var it = L.normalise({ id: editing.id, name: name, room: $('#e-room').value, category: $('#e-cat').value, brand: $('#e-brand').value, model: $('#e-model').value,
      serial: $('#e-serial').value, purchaseDate: $('#e-date').value, price: $('#e-price').value, qty: $('#e-qty').value, retailer: $('#e-retailer').value,
      warrantyMonths: $('#e-warranty').value, notes: $('#e-notes').value, photos: editing.photos, receipts: editing.receipts, updated: new Date().toISOString() });
    (editing._drop || []).forEach(function (id) { db.del(id); });
    var i = data.items.findIndex(function (x) { return x.id === it.id; });
    if (i >= 0) data.items[i] = it; else data.items.push(it);
    save(); editing = null; renderEditor(); renderAll(); B.toast('Saved');
  }
  function del(id) {
    var it = data.items.filter(function (i) { return i.id === id; })[0]; if (!it) return;
    if (!confirm('Delete "' + it.name + '" and its photos?')) return;
    it.photos.concat(it.receipts).forEach(function (m) { db.del(m.id); });
    data.items = data.items.filter(function (i) { return i.id !== id; }); save(); renderAll();
  }

  // ---------- rooms ----------
  function renderRooms() {
    var by = L.totalsBy(data.items, 'room');
    if (!by.length) { $('#rooms').innerHTML = '<div class="panel"><p>No items yet.</p></div>'; return; }
    $('#rooms').innerHTML = '<div class="grid" style="margin-top:14px">' + by.map(function (r) {
      var items = data.items.filter(function (i) { return i.room === r.key; }).sort(function (a, b) { return L.value(b) - L.value(a); });
      return '<div class="card"><h3>' + esc(r.key) + '</h3><p><b>' + money(r.value) + '</b> · ' + r.count + ' item(s)</p><ul class="small" style="padding-left:18px;margin:8px 0 0">' +
        items.map(function (i) { return '<li><a href="#" data-edit="' + esc(i.id) + '">' + esc(i.name) + '</a> — ' + money(L.value(i)) + '</li>'; }).join('') + '</ul></div>';
    }).join('') + '</div>';
  }

  // ---------- insurance ----------
  var picked = {};
  function renderInsurance() {
    var bar = function (rows) { return rows.length ? B.barChart(rows.map(function (r) { return { label: r.key, value: r.value }; }), { fmt: money }) : '<p class="muted">No items yet.</p>'; };
    $('#byRoom').innerHTML = bar(L.totalsBy(data.items, 'room'));
    $('#byCat').innerHTML = bar(L.totalsBy(data.items, 'category'));
    $('#sumInsured').value = data.sumInsured || '';
    renderCover();
    $('#claimList').innerHTML = data.items.length ? '<div class="table-wrap"><table><thead><tr><th></th><th>Item</th><th>Room</th><th class="num">Value</th></tr></thead><tbody>' +
      data.items.map(function (i) { return '<tr><td><input type="checkbox" aria-label="Include ' + esc(i.name) + '" data-pick="' + esc(i.id) + '"' + (picked[i.id] ? ' checked' : '') + '></td><td>' + esc(i.name) + '</td><td>' + esc(i.room) + '</td><td class="num">' + money(L.value(i)) + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="small" id="pickTotal"></p>' : '<p class="muted">No items yet.</p>';
    B.$$('[data-pick]').forEach(function (c) { c.addEventListener('change', function () { picked[c.dataset.pick] = c.checked; pickTotal(); }); });
    pickTotal();
    var g = data.items.map(function (i) { return { item: i, g: L.gaps(i) }; }).filter(function (x) { return x.g.length; });
    $('#gaps').innerHTML = g.length ? B.table(g.map(function (x) { return { id: x.item.id, name: x.item.name, missing: x.g.join(', ') }; }), [{ key: 'name', label: 'Item' }, { key: 'missing', label: 'Missing' },
      { key: 'id', label: '', fmt: function (id) { return '<button class="btn small" type="button" data-edit="' + esc(id) + '">Fix</button>'; } }]) : '<p class="ok">Every item has a photo, receipt and the key details.</p>';
  }
  function renderCover() {
    var tot = L.grandTotal(data.items), si = Number(data.sumInsured) || 0;
    if (!si) { $('#cover').innerHTML = '<span class="muted">Your list adds up to ' + money(tot) + '.</span>'; return; }
    var gap = tot - si;
    $('#cover').innerHTML = gap > 0 ? '<span class="bad">Your list (' + money(tot) + ') is ' + money(gap) + ' more than your cover. Talk to your insurer about raising the sum insured.</span>'
      : '<span class="ok">Your list (' + money(tot) + ') is within your cover (' + money(si) + '). Remember unlisted everyday items add up.</span>';
  }
  function selected() { return data.items.filter(function (i) { return picked[i.id]; }); }
  function pickTotal() { var s = selected(); var el = $('#pickTotal'); if (el) el.textContent = s.length + ' selected · ' + money(L.grandTotal(s)); }
  function claimHTML() {
    var items = selected();
    if (!items.length) { B.toast('Tick at least one item'); return Promise.resolve(null); }
    var ids = []; items.forEach(function (i) { i.photos.slice(0, 4).concat(i.receipts.filter(function (r) { return /^image\//.test(r.type); }).slice(0, 2)).forEach(function (m) { ids.push(m.id); }); });
    var src = {};
    return Promise.all(ids.map(function (id) { return db.dataURL(id).then(function (u) { src[id] = u; }).catch(function () {}); })).then(function () {
      return L.claimPackHTML(items, { photoSrc: src, today: today(), reason: $('#claimReason').value.trim() });
    });
  }

  // ---------- warranties ----------
  function renderWarranty() {
    var days = +$('#soonDays').value, t = today();
    var soon = L.expiringSoon(data.items, t, days);
    $('#soon').innerHTML = soon.length ? B.table(soon.map(function (x) { return { name: x.item.name, room: x.item.room, end: K.niceDate(x.w.expiry), left: x.w.daysLeft + ' days', retailer: x.item.retailer }; }),
      [{ key: 'name', label: 'Item' }, { key: 'room', label: 'Room' }, { key: 'end', label: 'Warranty ends' }, { key: 'left', label: 'Left' }, { key: 'retailer', label: 'Bought from' }])
      : '<p class="ok">No warranties end in this period.</p>';
    var all = data.items.map(function (i) { return { i: i, w: L.warrantyStatus(i, t) }; }).filter(function (x) { return x.w.status !== 'none'; }).sort(function (a, b) { return a.w.expiry < b.w.expiry ? -1 : 1; });
    $('#allW').innerHTML = all.length ? B.table(all.map(function (x) { return { name: x.i.name, end: K.niceDate(x.w.expiry), st: x.w.status }; }),
      [{ key: 'name', label: 'Item' }, { key: 'end', label: 'Ends' }, { key: 'st', label: 'Status', fmt: function (s) { var p = W_PILL[s]; return '<span class="' + p[0] + '">' + p[1] + '</span>'; } }])
      : '<p class="muted">Add a purchase date and warranty length to items to see them here.</p>';
  }

  function renderAll() { renderFilters(); renderStats(); renderList(); renderRooms(); renderInsurance(); renderWarranty(); if (drawStorage) drawStorage(); }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-edit],[data-del]'); if (!t) return;
    e.preventDefault();
    if (t.dataset.edit) startEdit(t.dataset.edit); else del(t.dataset.del);
  });
  $('#addTop').addEventListener('click', function () { startEdit(null); });
  ['#q', '#fRoom', '#fCat'].forEach(function (s) { $(s).addEventListener('input', renderList); });
  $('#soonDays').addEventListener('change', renderWarranty);
  $('#sumInsured').addEventListener('input', function () { data.sumInsured = this.value; save(); renderCover(); });
  $('#selAll').addEventListener('click', function () { data.items.forEach(function (i) { picked[i.id] = true; }); renderInsurance(); });
  $('#selNone').addEventListener('click', function () { picked = {}; renderInsurance(); });
  $('#claimPrint').addEventListener('click', function () { claimHTML().then(function (h) { if (h) K.printHTML(h); }); });
  $('#claimDl').addEventListener('click', function () { claimHTML().then(function (h) { if (h) B.download('insurance-claim-' + today() + '.html', h, 'text/html;charset=utf-8'); }); });
  $('#ics').addEventListener('click', function () { K.downloadICS('warranties.ics', L.warrantyEvents(data.items, today()), 'Home Inventory'); });
  $('#csv').addEventListener('click', function () {
    if (!data.items.length) return B.toast('Nothing to export');
    var rows = L.csvRows(data.items, today()); B.download('home-inventory-' + today() + '.csv', '﻿' + B.csv.stringify(rows, Object.keys(rows[0])), 'text/csv;charset=utf-8');
  });
  $('#backup').addEventListener('click', function () {
    $('#backupMsg').textContent = 'Preparing backup…';
    K.exportBackup(db, 'home-inventory', data).then(function (r) { $('#backupMsg').textContent = 'Backup downloaded: ' + data.items.length + ' items, ' + r.files + ' files, ' + K.formatBytes(r.bytes) + '.'; })
      .catch(function (err) { $('#backupMsg').textContent = 'Backup failed: ' + err.message; });
  });
  $('#restore').addEventListener('change', function () {
    var f = this.files[0]; this.value = ''; if (!f) return;
    if (!confirm('Restore this backup? It replaces everything currently in Home Inventory on this device.')) return;
    K.importBackup(db, f, 'home-inventory').then(function (d) {
      data = { items: (d.items || []).map(L.normalise), sumInsured: d.sumInsured || '', owner: d.owner || '' }; save(); renderAll(); B.toast('Backup restored');
    }).catch(function (err) { B.toast(err.message, 5000); });
  });
  $('#wipe').addEventListener('click', function () {
    if (!confirm('Delete every item, photo and receipt from this device? This cannot be undone. Download a backup first if you might need it.')) return;
    db.clear().then(function () { data = { items: [], sumInsured: '', owner: '' }; save(); renderAll(); B.toast('Deleted'); });
  });
  $('#sample').addEventListener('click', function () {
    if (data.items.length && !confirm('Replace your items with made-up sample data? (Your photos stay in storage until you delete everything.)')) return;
    data.items = L.sample(today()); data.sumInsured = 25000; save(); renderAll(); B.toast('Sample data loaded — all made up');
  });

  showTab = B.tabs($('.tabs'));
  drawStorage = K.storagePanel($('#storage'), db, { dataBytes: function () { return K.jsonBytes(data); } });
  renderAll();
})();
