/* Home Inventory Vault — pure logic (no DOM). Browser: window.InventoryLib. Node: require(). */
(function (root) {
  'use strict';
  var K = (typeof module !== 'undefined' && module.exports) ? require('./vault-kit.js') : root.VaultKit;

  var ROOMS = ['Living room', 'Kitchen', 'Main bedroom', 'Bedroom 2', 'Bedroom 3', 'Bathroom', 'Laundry', 'Study', 'Garage', 'Outdoor', 'Other'];
  var CATEGORIES = ['Electronics', 'Appliances', 'Furniture', 'Jewellery & watches', 'Clothing', 'Tools', 'Sport & outdoor', 'Kitchenware', 'Art & collectables', 'Kids & toys', 'Musical instruments', 'Bikes & vehicles', 'Other'];

  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
  function round2(n) { return Math.round(n * 100) / 100; }

  // Clean an item from a form or an old backup
  function normalise(o) {
    o = o || {};
    var qty = Math.max(1, Math.round(num(o.qty) || 1));
    return {
      id: o.id || '', name: String(o.name || '').trim(), room: String(o.room || 'Other').trim() || 'Other', category: String(o.category || 'Other').trim() || 'Other',
      brand: String(o.brand || '').trim(), model: String(o.model || '').trim(), serial: String(o.serial || '').trim(),
      purchaseDate: K.isISO(o.purchaseDate) ? o.purchaseDate : '', price: round2(num(o.price)), qty: qty, retailer: String(o.retailer || '').trim(),
      warrantyMonths: Math.max(0, Math.round(num(o.warrantyMonths))), notes: String(o.notes || ''),
      photos: Array.isArray(o.photos) ? o.photos : [], receipts: Array.isArray(o.receipts) ? o.receipts : [],
      updated: o.updated || ''
    };
  }
  function value(it) { return round2((Number(it.price) || 0) * (Number(it.qty) || 1)); }

  function warrantyExpiry(it) {
    if (!it.purchaseDate || !(it.warrantyMonths > 0)) return '';
    return K.addMonths(it.purchaseDate, it.warrantyMonths);
  }
  // -> {expiry, daysLeft, status:'none'|'expired'|'soon'|'ok'}
  function warrantyStatus(it, today, soonDays) {
    var exp = warrantyExpiry(it);
    if (!exp) return { expiry: '', daysLeft: null, status: 'none' };
    var d = K.daysBetween(today, exp);
    return { expiry: exp, daysLeft: d, status: d < 0 ? 'expired' : d <= (soonDays == null ? 90 : soonDays) ? 'soon' : 'ok' };
  }
  function expiringSoon(items, today, days) {
    return (items || []).map(function (it) { return { item: it, w: warrantyStatus(it, today, days) }; })
      .filter(function (x) { return x.w.status === 'soon'; })
      .sort(function (a, b) { return a.w.daysLeft - b.w.daysLeft; });
  }

  // Totals by 'room' or 'category' -> [{key, count, value}] biggest first
  function totalsBy(items, field) {
    var by = {};
    (items || []).forEach(function (it) { var k = it[field] || 'Other'; by[k] = by[k] || { key: k, count: 0, value: 0 }; by[k].count += it.qty || 1; by[k].value += value(it); });
    return Object.keys(by).map(function (k) { by[k].value = round2(by[k].value); return by[k]; }).sort(function (a, b) { return b.value - a.value || (a.key < b.key ? -1 : 1); });
  }
  function grandTotal(items) { return round2((items || []).reduce(function (s, it) { return s + value(it); }, 0)); }

  // Every word must appear somewhere in the item
  function search(items, q) {
    var words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return (items || []).slice();
    return (items || []).filter(function (it) {
      var hay = [it.name, it.room, it.category, it.brand, it.model, it.serial, it.retailer, it.notes, it.purchaseDate].join(' ').toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    });
  }

  // Items without proof that an insurer usually asks for
  function gaps(it) {
    var g = [];
    if (!it.photos || !it.photos.length) g.push('photo');
    if (!it.receipts || !it.receipts.length) g.push('receipt');
    if (value(it) >= 300 && !it.serial && /Electronics|Appliances|Tools|Bikes|Musical/.test(it.category)) g.push('serial number');
    if (!it.purchaseDate) g.push('purchase date');
    return g;
  }

  function csvRows(items, today) {
    return (items || []).map(function (it) {
      var w = warrantyStatus(it, today);
      return {
        Name: it.name, Room: it.room, Category: it.category, Brand: it.brand, Model: it.model, 'Serial number': it.serial, Quantity: it.qty,
        'Purchase date': it.purchaseDate, 'Price each (AUD)': it.price.toFixed(2), 'Total value (AUD)': value(it).toFixed(2), Retailer: it.retailer,
        'Warranty (months)': it.warrantyMonths || '', 'Warranty ends': w.expiry, Photos: (it.photos || []).length, Receipts: (it.receipts || []).length, Notes: it.notes
      };
    });
  }

  // Calendar reminders: an all-day event on the warranty end date, with an alert 30 days before
  function warrantyEvents(items, today) {
    return (items || []).filter(function (it) { var w = warrantyStatus(it, today); return w.status === 'soon' || w.status === 'ok'; }).map(function (it) {
      var exp = warrantyExpiry(it);
      return { uid: 'warranty-' + (it.id || it.name.replace(/\W+/g, '')) + '-' + exp, date: exp, alarmDays: 30, title: 'Warranty ends: ' + it.name,
        description: [it.brand, it.model].filter(Boolean).join(' ') + (it.serial ? ' · Serial ' + it.serial : '') + (it.retailer ? ' · Bought from ' + it.retailer : '') + ' · Check it works properly before this date.' };
    });
  }

  // Printable insurance claim pack. photoSrc: {mediaId: dataURL}
  function claimPackHTML(items, opts) {
    opts = opts || {}; var e = K.esc, photo = opts.photoSrc || {};
    var total = grandTotal(items);
    var rows = items.map(function (it, i) {
      var pics = (it.photos || []).filter(function (p) { return photo[p.id]; }).slice(0, 4).map(function (p) { return '<img src="' + photo[p.id] + '" alt="">'; }).join('');
      var rec = (it.receipts || []).filter(function (p) { return photo[p.id]; }).slice(0, 2).map(function (p) { return '<img src="' + photo[p.id] + '" alt="Receipt">'; }).join('');
      return '<section class="item"><h2>' + (i + 1) + '. ' + e(it.name) + ' <span>' + K.money(value(it)) + '</span></h2><table>' +
        [['Room', it.room], ['Category', it.category], ['Brand / model', [it.brand, it.model].filter(Boolean).join(' ')], ['Serial number', it.serial],
          ['Quantity', it.qty > 1 ? it.qty + ' × ' + K.money(it.price) : '1'], ['Purchase date', K.niceDate(it.purchaseDate)], ['Retailer', it.retailer],
          ['Receipts kept', (it.receipts || []).length ? (it.receipts || []).length + ' file(s)' : 'None'], ['Notes', it.notes]]
          .filter(function (r) { return r[1]; }).map(function (r) { return '<tr><th>' + e(r[0]) + '</th><td>' + e(r[1]) + '</td></tr>'; }).join('') +
        '</table>' + (pics ? '<div class="pics">' + pics + '</div>' : '') + (rec ? '<div class="pics rec">' + rec + '</div>' : '') + '</section>';
    }).join('');
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Insurance claim list</title><style>' +
      'body{font:14px/1.45 system-ui,sans-serif;color:#000;margin:24px;max-width:820px}h1{font-size:22px;margin:0 0 4px}' +
      '.meta{color:#444;margin:0 0 16px}.sum{border:2px solid #000;padding:10px;margin:12px 0}.item{border-top:1px solid #999;padding:10px 0;break-inside:avoid}' +
      '.item h2{font-size:16px;display:flex;justify-content:space-between;margin:0 0 6px}table{border-collapse:collapse}th,td{text-align:left;padding:2px 12px 2px 0;vertical-align:top}th{color:#444;font-weight:600}' +
      '.pics{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.pics img{width:150px;height:110px;object-fit:cover;border:1px solid #ccc}.rec img{object-fit:contain}' +
      '</style></head><body><h1>Insurance claim — list of items</h1><p class="meta">' + e(opts.name ? 'Prepared by ' + opts.name + ' · ' : '') +
      (opts.reason ? e(opts.reason) + ' · ' : '') + 'Prepared ' + e(K.niceDate(opts.today || '')) + ' · ' + items.length + ' item(s)</p>' +
      '<div class="sum"><b>Total claimed value: ' + K.money(total) + '</b> (purchase prices; replacement cost may be higher)</div>' + rows +
      '<p class="meta">Values are what was paid, entered by the owner. Attach original receipts or bank statements where your insurer asks for them.</p></body></html>';
  }

  // Made-up sample data, dated relative to today so warranty states are always interesting
  function sample(today) {
    var d = function (m) { return K.addMonths(today, -m); };
    var list = [
      ['Samsung 65" QLED TV', 'Living room', 'Electronics', 'Samsung', 'QA65Q80C', 'SN0X4K2291B', d(22), 2199, 'JB Hi-Fi', 24, 'Wall mounted. Extended warranty not bought.'],
      ['Dyson V15 vacuum', 'Laundry', 'Appliances', 'Dyson', 'V15 Detect', 'DY-77231-AU', d(23), 1149, 'Harvey Norman', 24, ''],
      ['Fisher & Paykel fridge', 'Kitchen', 'Appliances', 'Fisher & Paykel', 'RF610ADX', 'FP2210887', d(30), 2899, 'The Good Guys', 60, '5-year manufacturer warranty.'],
      ['MacBook Air 13"', 'Study', 'Electronics', 'Apple', 'M3 2024', 'C02XK1ZZJG5H', d(11), 1899, 'Apple Store', 12, 'AppleCare not bought.'],
      ['Leather 3-seat sofa', 'Living room', 'Furniture', 'King', 'Jasper', '', d(40), 3400, 'King Living', 120, 'Frame warranty 10 years.'],
      ['Engagement ring', 'Main bedroom', 'Jewellery & watches', '', '1.0 ct diamond, platinum', 'GIA 2211993', d(70), 6500, 'Local jeweller', 0, 'Valuation certificate in the safe.'],
      ['Trek mountain bike', 'Garage', 'Bikes & vehicles', 'Trek', 'Marlin 7', 'WTU123G4567H', d(16), 1349, '99 Bikes', 0, ''],
      ['Makita drill kit', 'Garage', 'Tools', 'Makita', 'DLX2131', '', d(5), 449, 'Bunnings', 36, ''],
      ['Breville coffee machine', 'Kitchen', 'Appliances', 'Breville', 'Barista Express', 'BES870BSS-2209', d(14), 799, 'Myer', 12, ''],
      ['Queen bed + mattress', 'Main bedroom', 'Furniture', 'Koala', 'Queen', '', d(26), 1990, 'Koala', 120, '']
    ];
    return list.map(function (r, i) {
      return normalise({ id: 'sample' + i, name: r[0], room: r[1], category: r[2], brand: r[3], model: r[4], serial: r[5], purchaseDate: r[6], price: r[7], retailer: r[8], warrantyMonths: r[9], notes: r[10] });
    });
  }

  var L = { ROOMS: ROOMS, CATEGORIES: CATEGORIES, normalise: normalise, value: value, warrantyExpiry: warrantyExpiry, warrantyStatus: warrantyStatus,
    expiringSoon: expiringSoon, totalsBy: totalsBy, grandTotal: grandTotal, search: search, gaps: gaps, csvRows: csvRows, warrantyEvents: warrantyEvents,
    claimPackHTML: claimPackHTML, sample: sample };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.InventoryLib = L;
})(this);
