/* Returns Intelligence — pure logic (no DOM). Browser: window.ReturnsLib; Node: require(). */
(function (root) {
  'use strict';
  var DAY = 86400000;

  // ---------- helpers ----------
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function toNum(v) {
    if (typeof v === 'number') return v; var s = String(v == null ? '' : v).trim(); if (!s) return NaN;
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s); s = s.replace(/[^0-9.,]/g, '');
    if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
    var n = parseFloat(s); return isNaN(n) ? NaN : (neg ? -n : n);
  }
  function num(v, d) { var n = toNum(v); return isNaN(n) ? (d == null ? 0 : d) : n; }
  function str(v) { return String(v == null ? '' : v).trim(); }
  function guessColumns(headers, fields) {
    var cands = [];
    fields.forEach(function (f, fi) {
      headers.forEach(function (h, hi) {
        var n = String(h).trim().toLowerCase();
        for (var i = 0; i < f.re.length; i++) if (f.re[i].test(n)) { cands.push({ key: f.key, h: h, score: i * 10 + fi * 0.01 + hi * 0.0001 }); break; }
      });
    });
    cands.sort(function (a, b) { return a.score - b.score; });
    var map = {}, used = {};
    cands.forEach(function (c) { if (map[c.key] == null && !used[c.h]) { map[c.key] = c.h; used[c.h] = 1; } });
    fields.forEach(function (f) { if (map[f.key] == null) map[f.key] = ''; });
    return map;
  }
  var MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  function detectDateOrder(values) {
    var dmy = 0, mdy = 0;
    values.forEach(function (v) { var m = String(v || '').trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-]\d{2,4}/); if (!m) return; if (+m[1] > 12) dmy++; if (+m[2] > 12) mdy++; });
    return mdy > dmy ? 'mdy' : 'dmy';
  }
  function parseDate(v, order) {
    var s = str(v), m; if (!s) return null;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return Date.UTC(+m[1], m[2] - 1, +m[3]);
    if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/))) { var y = +m[3]; if (y < 100) y += 2000; var a = +m[1], b = +m[2]; if (order === 'mdy') { var t = a; a = b; b = t; } return b >= 1 && b <= 12 && a >= 1 && a <= 31 ? Date.UTC(y, b - 1, a) : null; }
    if ((m = s.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/)) && MON[m[2].toLowerCase()] != null) return Date.UTC(+m[3], MON[m[2].toLowerCase()], +m[1]);
    return null;
  }

  var ORDER_FIELDS = [
    { key: 'orderId', label: 'Order ID', required: true, re: [/^(order|order ?(id|number|no|#)|name)$/, /order/] },
    { key: 'sku', label: 'SKU', re: [/^(lineitem |variant )?sku$/, /sku|item code|product code/] },
    { key: 'product', label: 'Product name', re: [/^(lineitem |product |item )?(name|title)$/, /^product$/, /product|item|title|description/] },
    { key: 'category', label: 'Category', re: [/^(category|product type|type|collection|department)$/, /categ|type|collection|department/] },
    { key: 'variant', label: 'Size / variant', re: [/^(size|variant|variant title|option|option1 value)$/, /size|variant|option|colou?r/] },
    { key: 'qty', label: 'Quantity', re: [/^(lineitem )?(qty|quantity|units)$/, /qty|quantity|units/] },
    { key: 'price', label: 'Unit price', re: [/^(lineitem )?(unit )?price$/, /price/, /amount|total|subtotal/] },
    { key: 'date', label: 'Order date', re: [/^(order )?date$/, /created|date|paid at/] },
    { key: 'channel', label: 'Sales channel', re: [/^(channel|sales channel|source|marketplace)$/, /channel|source|marketplace/] },
    { key: 'customer', label: 'Customer ID / email', re: [/^(customer|customer ?(id|email|number)|email)$/, /customer|email|buyer|client/] }
  ];
  var RETURN_FIELDS = [
    { key: 'orderId', label: 'Order ID', required: true, re: [/^(order|order ?(id|number|no|#))$/, /order/] },
    { key: 'sku', label: 'SKU', re: [/^sku$/, /sku|item code|product code/] },
    { key: 'product', label: 'Product name', re: [/^(product|item)( name| title)?$/, /product|item|title/] },
    { key: 'variant', label: 'Size / variant', re: [/^(size|variant)$/, /size|variant|option/] },
    { key: 'qty', label: 'Quantity returned', re: [/^(return(ed)? )?(qty|quantity|units)( returned)?$/, /qty|quantity|units/] },
    { key: 'reasonCode', label: 'Reason code', re: [/^(return )?reason( code)?$/, /reason ?code|reason category|reason$/, /reason|^why$|why returned/] },
    { key: 'reasonText', label: 'Customer comment', re: [/^(customer )?(comment|comments|notes?|note|details|feedback|reason (text|details|comment))$/, /comment|note|detail|feedback|free ?text|explain/] },
    { key: 'refund', label: 'Refund amount', re: [/^(refund|refunded|refund amount|amount refunded)$/, /refund/, /amount|value/] },
    { key: 'shipping', label: 'Return shipping cost', re: [/^(return )?(shipping|postage|freight|label)( cost)?$/, /shipping|postage|freight|label|courier/] },
    { key: 'date', label: 'Return date', re: [/^(return(ed)? )?date$/, /date|received|created/] },
    { key: 'condition', label: 'Condition', re: [/^(condition|item condition|resaleable|resellable|restock(able)?)$/, /condition|resal|resell|restock|disposition/] },
    { key: 'channel', label: 'Channel', re: [/^(channel|source|marketplace)$/, /channel|source/] },
    { key: 'customer', label: 'Customer ID / email', re: [/^(customer|customer ?(id|email)|email)$/, /customer|email|buyer/] },
    { key: 'category', label: 'Category', re: [/^(category|product type|type)$/, /categ/] }
  ];
  function detectOrderColumns(h) { return guessColumns(h, ORDER_FIELDS); }
  function detectReturnColumns(h) { var m = guessColumns(h, RETURN_FIELDS); if (m.reasonText === m.reasonCode) m.reasonText = ''; return m; }

  // ---------- reason themes ----------
  var REASONS = [
    { id: 'small', name: 'Too small', re: /too ?small|too tight|runs? small|size ?up|tight|smaller than|small fit|apparel too small|^small$/i, writeOff: 0.05 },
    { id: 'large', name: 'Too large', re: /too ?(large|big|loose|long)|runs? (large|big)|size ?down|baggy|bigger than|apparel too large|^(large|big)$/i, writeOff: 0.05 },
    { id: 'fit', name: 'Size / fit (unspecified)', re: /\bsizes?\b|\bfit\b|fitting|wrong size|didn'?t fit|doesn'?t fit/i, writeOff: 0.05 },
    { id: 'damaged', name: 'Damaged / faulty', re: /damag|broken|broke|crack|chipped|smashed|faulty|defect|not working|doesn'?t work|stopped working|dead on arrival|\bdoa\b|shattered|dented|leak/i, writeOff: 1 },
    { id: 'wrong', name: 'Wrong item sent', re: /wrong (item|product|colou?r sent|one)|incorrect item|sent the wrong|not what i ordered|different item|missing (part|item)|ordered wrong item|mispick/i, writeOff: 0 },
    { id: 'described', name: 'Not as described', re: /not as (described|pictured|shown|advertised)|than shown|different (from|to) (the )?(photo|picture|description|website)|colou?r (is |was )?(different|off|not)|looks? different|misleading|description|inaccurate|photo/i, writeOff: 0.1 },
    { id: 'quality', name: 'Poor quality', re: /quality|\bcheap(ly)?\b|flimsy|pill|thin|fabric|stitch|seam|fell apart|came apart|frayed|faded|poorly made|material/i, writeOff: 0.6 },
    { id: 'late', name: 'Arrived late', re: /late|delay|took too long|arrived after|missed (the )?(estimated|delivery)|too slow|never arrived|didn'?t arrive in time/i, writeOff: 0.05 },
    { id: 'mind', name: 'Changed mind', re: /changed? (my )?mind|no longer (need|want)|unwanted|don'?t (need|want)|not needed|gift|found (a )?(better|cheaper)|better price|ordered (by mistake|twice|multiple)|accidental|didn'?t like|don'?t like|not for me|bought (two|multiple) sizes/i, writeOff: 0.05 }
  ];
  function classifyOne(s) {
    s = str(s).replace(/_/g, ' '); if (!s) return 'other';
    for (var i = 0; i < REASONS.length; i++) if (REASONS[i].re.test(s)) return REASONS[i].id;
    return 'other';
  }
  // The reason code wins (it is structured); the customer's comment fills gaps and sharpens a vague "size/fit" code.
  function classify(code, text) {
    var c = classifyOne(code), t = classifyOne(text);
    if (c === 'fit' && (t === 'small' || t === 'large')) return t;
    return c !== 'other' ? c : t;
  }
  function reasonName(id) { var r = REASONS.filter(function (x) { return x.id === id; })[0]; return r ? r.name : 'Other / not given'; }
  function isFit(id) { return id === 'small' || id === 'large' || id === 'fit'; }
  function unsellable(cond) { var s = str(cond).toLowerCase(); if (!s) return null; if (/not|un|damag|dispos|write|scrap|faulty|destroy|bin|no$|^n$|opened|used/.test(s)) return true; if (/new|good|resal|resell|restock|ok|yes|^y$|as new|sealed|a grade/.test(s)) return false; return null; }

  /* Build lines. orders/returns: {rows, map}. settings: {handling (8), costPct (0.45), writeOff overrides} */
  function prepare(orders, returns, settings) {
    var st = Object.assign({ handling: 8, costPct: 0.45 }, settings || {});
    var om = orders ? orders.map : null, rm = returns.map;
    var oOrder = orders && om.date ? detectDateOrder(orders.rows.map(function (r) { return r[om.date]; })) : 'dmy';
    var rOrder = rm.date ? detectDateOrder(returns.rows.map(function (r) { return r[rm.date]; })) : 'dmy';
    var lines = [], byKey = {}, byOrder = {};
    (orders ? orders.rows : []).forEach(function (r) {
      var id = str(r[om.orderId]); if (!id) return;
      var l = { orderId: id, sku: om.sku ? str(r[om.sku]) : '', product: om.product ? str(r[om.product]) : '', category: om.category ? str(r[om.category]) : '', variant: om.variant ? str(r[om.variant]) : '',
        qty: om.qty ? num(r[om.qty], 1) : 1, price: om.price ? num(r[om.price], NaN) : NaN, date: om.date ? parseDate(r[om.date], oOrder) : null, channel: om.channel ? str(r[om.channel]) : '', customer: om.customer ? str(r[om.customer]).toLowerCase() : '', returned: 0, returns: [] };
      if (!l.product) l.product = l.sku; if (!l.sku) l.sku = l.product;
      lines.push(l); byKey[id + '|' + l.sku] = byKey[id + '|' + l.sku] || l; (byOrder[id] = byOrder[id] || []).push(l);
    });
    var rets = [], unmatched = 0;
    returns.rows.forEach(function (r) {
      var id = str(r[rm.orderId]), sku = rm.sku ? str(r[rm.sku]) : '', prod = rm.product ? str(r[rm.product]) : '';
      if (!id && !sku && !prod) return;
      var line = byKey[id + '|' + (sku || prod)] || null;
      if (!line && byOrder[id]) { var cands = byOrder[id].filter(function (l) { return (!sku || l.sku === sku) && (!prod || l.product === prod) && (!(rm.variant && str(r[rm.variant])) || l.variant === str(r[rm.variant])); }); line = cands.length === 1 || (cands.length > 1 && (sku || prod)) ? cands[0] : null; }
      if (orders && !line) unmatched++;
      var code = rm.reasonCode ? str(r[rm.reasonCode]) : '', text = rm.reasonText ? str(r[rm.reasonText]) : '';
      var x = { orderId: id, sku: sku || (line && line.sku) || prod, product: prod || (line && line.product) || sku, category: (rm.category && str(r[rm.category])) || (line && line.category) || '',
        variant: (rm.variant && str(r[rm.variant])) || (line && line.variant) || '', qty: rm.qty ? num(r[rm.qty], 1) : 1, reasonCode: code, reasonText: text, reason: classify(code, text),
        refund: rm.refund ? num(r[rm.refund], 0) : (line && !isNaN(line.price) ? line.price * (rm.qty ? num(r[rm.qty], 1) : 1) : 0), shipping: rm.shipping ? num(r[rm.shipping], 0) : 0,
        date: rm.date ? parseDate(r[rm.date], rOrder) : null, channel: (rm.channel && str(r[rm.channel])) || (line && line.channel) || '', customer: ((rm.customer && str(r[rm.customer])) || (line && line.customer) || '').toLowerCase(),
        condition: rm.condition ? str(r[rm.condition]) : '', orderDate: line ? line.date : null, price: line && !isNaN(line.price) ? line.price : NaN, matched: !!line };
      if (isNaN(x.price) && x.qty) x.price = x.refund / x.qty;
      var un = unsellable(x.condition), wo = un == null ? REASONS.concat([{ id: 'other', writeOff: 0.1 }]).filter(function (q) { return q.id === x.reason; })[0].writeOff : (un ? 1 : 0);
      if (st.writeOff && st.writeOff[x.reason] != null) wo = st.writeOff[x.reason];
      x.handling = st.handling * (x.qty ? 1 : 0); x.writeOff = wo * (isNaN(x.price) ? 0 : x.price) * st.costPct * x.qty;
      x.cost = x.refund + x.shipping + x.handling + x.writeOff;
      if (line) { line.returned += x.qty; line.returns.push(x); }
      rets.push(x);
    });
    return { lines: lines, returns: rets, unmatched: unmatched, hasOrders: !!orders && lines.length > 0 };
  }

  // ---------- rates and costs ----------
  function group(data, keyFn, opts) {
    opts = opts || {}; var g = {};
    function get(k) { return g[k] = g[k] || { key: k, sold: 0, returned: 0, refund: 0, shipping: 0, handling: 0, writeOff: 0, cost: 0, reasons: {}, revenue: 0 }; }
    if (data.hasOrders) data.lines.forEach(function (l) { var k = keyFn(l); if (k == null) return; var x = get(k); x.sold += l.qty; if (!isNaN(l.price)) x.revenue += l.price * l.qty; });
    data.returns.forEach(function (r) {
      var k = keyFn(r); if (k == null) return; var x = get(k); x.returned += r.qty; x.refund += r.refund; x.shipping += r.shipping; x.handling += r.handling; x.writeOff += r.writeOff; x.cost += r.cost;
      x.reasons[r.reason] = (x.reasons[r.reason] || 0) + r.qty;
    });
    return Object.keys(g).map(function (k) {
      var x = g[k]; x.rate = x.sold ? x.returned / x.sold : null;
      var top = Object.keys(x.reasons).sort(function (a, b) { return x.reasons[b] - x.reasons[a]; })[0]; x.topReason = top || null; x.topReasonShare = top ? x.reasons[top] / x.returned : 0;
      return x;
    }).filter(function (x) { return opts.minSold ? x.sold >= opts.minSold || x.returned > 0 : true; })
      .sort(function (a, b) { return b.cost - a.cost; });
  }
  var DIMS = {
    product: { label: 'Product', fn: function (x) { return x.product || x.sku || '(unknown)'; } },
    sku: { label: 'SKU', fn: function (x) { return x.sku || '(unknown)'; } },
    category: { label: 'Category', fn: function (x) { return x.category || '(none)'; } },
    variant: { label: 'Size / variant', fn: function (x) { return x.variant || '(none)'; } },
    channel: { label: 'Channel', fn: function (x) { return x.channel || '(none)'; } },
    month: { label: 'Order month', fn: function (x) { var d = x.orderDate !== undefined ? x.orderDate : x.date; return d == null ? null : new Date(d).toISOString().slice(0, 7); } }
  };
  function totals(data) {
    var t = { sold: 0, returned: 0, refund: 0, shipping: 0, handling: 0, writeOff: 0, cost: 0, revenue: 0, returns: data.returns.length, orders: 0 };
    var seen = {}; data.lines.forEach(function (l) { t.sold += l.qty; if (!isNaN(l.price)) t.revenue += l.price * l.qty; if (!seen[l.orderId]) { seen[l.orderId] = 1; t.orders++; } });
    data.returns.forEach(function (r) { t.returned += r.qty; t.refund += r.refund; t.shipping += r.shipping; t.handling += r.handling; t.writeOff += r.writeOff; t.cost += r.cost; });
    t.rate = data.hasOrders && t.sold ? t.returned / t.sold : null; t.processing = t.shipping + t.handling + t.writeOff; return t;
  }
  function reasonBreakdown(data) {
    var g = {}, tot = 0; data.returns.forEach(function (r) { var x = g[r.reason] = g[r.reason] || { id: r.reason, name: reasonName(r.reason), returned: 0, cost: 0, examples: [] }; x.returned += r.qty; x.cost += r.cost; tot += r.qty; if (r.reasonText && x.examples.length < 3 && x.examples.indexOf(r.reasonText) < 0) x.examples.push(r.reasonText); });
    return Object.keys(g).map(function (k) { g[k].share = tot ? g[k].returned / tot : 0; return g[k]; }).sort(function (a, b) { return b.returned - a.returned; });
  }

  /* Size direction per product: among fit returns, which way? Needs at least minFit size-specific fit returns. */
  function sizeSignals(data, minFit) {
    minFit = minFit || 5; var g = {};
    data.returns.forEach(function (r) { if (!isFit(r.reason)) return; var k = r.product || r.sku, x = g[k] = g[k] || { product: k, small: 0, large: 0, unspecified: 0 }; x[r.reason === 'fit' ? 'unspecified' : r.reason] += r.qty; });
    return Object.keys(g).map(function (k) {
      var x = g[k], dir = x.small + x.large; x.fitReturns = dir + x.unspecified;
      x.verdict = dir >= minFit && x.small / dir >= 0.65 ? 'runs small' : dir >= minFit && x.large / dir >= 0.65 ? 'runs large' : dir >= minFit ? 'mixed fit' : null;
      return x;
    }).filter(function (x) { return x.verdict; }).sort(function (a, b) { return b.fitReturns - a.fitReturns; });
  }

  var FIX = {
    small: 'Add "runs small — size up" to the listing and update the size chart with measured garments.', large: 'Add "runs large — size down" to the listing and update the size chart.',
    fit: 'Add a detailed size chart with body and garment measurements, plus model height and size worn.', damaged: 'Improve packaging (padding, sturdier box, fragile label) and check the courier; inspect stock before dispatch.',
    wrong: 'Check picking: barcode-scan at packing and separate look-alike SKUs on the shelf.', described: 'Re-shoot photos in natural light, show true colour and scale, and tighten the description.',
    quality: 'Raise the faults with your supplier (with photos and batch numbers) and add a quality check before listing new stock.', late: 'Show realistic delivery times and review your courier for this product or region.',
    mind: 'Mostly normal browsing behaviour. Keep the policy clear; consider store credit instead of refunds for change-of-mind.', other: 'Ask for a reason on the returns form so you can act on it.'
  };
  /* Products ranked by return cost with a fix-or-delist suggestion. */
  function productActions(data, opts) {
    opts = opts || {}; var t = totals(data), overall = t.rate, sizes = {}; sizeSignals(data).forEach(function (s) { sizes[s.product] = s; });
    return group(data, DIMS.product.fn).filter(function (p) { return p.returned > 0; }).map(function (p) {
      var qualityShare = ((p.reasons.damaged || 0) + (p.reasons.quality || 0)) / p.returned;
      var action = 'fix', why = FIX[p.topReason] || FIX.other;
      if (p.topReason && isFit(p.topReason) && sizes[p.key]) why = sizes[p.key].verdict === 'runs small' ? FIX.small : sizes[p.key].verdict === 'runs large' ? FIX.large : FIX.fit;
      if (overall != null && p.rate != null && p.sold >= 10 && p.rate >= Math.max(0.3, 1.75 * overall) && qualityShare >= 0.5) { action = 'delist'; why = 'Returns are ' + Math.round(p.rate * 100) + '% (store average ' + Math.round(overall * 100) + '%), mostly faults or poor quality. Unless the supplier fixes it fast, stop selling it.'; }
      else if (overall != null && p.rate != null && p.rate < 0.5 * overall && p.cost < t.cost * 0.05) action = 'watch';
      p.action = action; p.fix = why; p.costPerSold = p.sold ? p.cost / p.sold : null; p.size = sizes[p.key] ? sizes[p.key].verdict : null; return p;
    }).sort(function (a, b) { return b.cost - a.cost; });
  }

  /* Customers who return a lot. Careful: many are genuine (bracketing sizes, faulty items). */
  function frequentReturners(data, opts) {
    opts = opts || {}; var minReturns = opts.minReturns || 3, minRate = opts.minRate || 0.5, c = {};
    data.lines.forEach(function (l) { if (!l.customer) return; var x = c[l.customer] = c[l.customer] || { customer: l.customer, orders: {}, units: 0, returned: 0, refund: 0, faulty: 0, bracketing: 0 }; x.orders[l.orderId] = 1; x.units += l.qty; });
    data.returns.forEach(function (r) { if (!r.customer) return; var x = c[r.customer] = c[r.customer] || { customer: r.customer, orders: {}, units: 0, returned: 0, refund: 0, faulty: 0, bracketing: 0 }; x.returned += r.qty; x.refund += r.refund; if (r.reason === 'damaged' || r.reason === 'wrong' || r.reason === 'quality') x.faulty += r.qty; });
    // bracketing: same product in 2+ sizes/variants in one order, at least one returned
    var byOrder = {}; data.lines.forEach(function (l) { (byOrder[l.orderId] = byOrder[l.orderId] || []).push(l); });
    Object.keys(byOrder).forEach(function (id) {
      var ls = byOrder[id], prods = {}; ls.forEach(function (l) { (prods[l.product] = prods[l.product] || []).push(l); });
      Object.keys(prods).forEach(function (p) { var v = prods[p]; if (v.length > 1 && v.some(function (l) { return l.returned > 0; }) && v[0].customer && c[v[0].customer]) c[v[0].customer].bracketing++; });
    });
    return Object.keys(c).map(function (k) { var x = c[k]; x.orderCount = Object.keys(x.orders).length; x.rate = x.units ? x.returned / x.units : null; delete x.orders; return x; })
      .filter(function (x) { return x.returned >= minReturns && (x.rate == null || x.rate >= minRate); })
      .sort(function (a, b) { return b.returned - a.returned; });
  }

  function recommendations(data) {
    var t = totals(data), recs = [], reasons = reasonBreakdown(data), acts = productActions(data), sizes = sizeSignals(data);
    var fit = reasons.filter(function (r) { return isFit(r.id); }).reduce(function (s, r) { return s + r.share; }, 0);
    if (fit >= 0.25) recs.push({ title: 'Fix sizing first', text: Math.round(fit * 100) + '% of returned items were about size or fit.' + (sizes.filter(function (x) { return x.verdict !== 'mixed fit'; }).length ? ' Clear signals: ' + sizes.filter(function (x) { return x.verdict !== 'mixed fit'; }).slice(0, 3).map(function (s) { return s.product + ' ' + s.verdict; }).join(', ') + '.' : '') + ' Better size charts, "fits small/large" notes and fit reviews on listings are the cheapest way to cut returns.' });
    var dmg = reasons.filter(function (r) { return r.id === 'damaged'; })[0];
    if (dmg && dmg.share >= 0.08) recs.push({ title: 'Stop damage in transit', text: 'Damaged or faulty items are ' + Math.round(dmg.share * 100) + '% of returns and usually can\'t be resold, so they cost the most each. Check packaging on the worst products below.' });
    var dl = acts.filter(function (a) { return a.action === 'delist'; });
    if (dl.length) recs.push({ title: 'Consider delisting ' + dl.map(function (a) { return a.key; }).join(', '), text: 'Return rates far above your average, mostly for faults or poor quality.' });
    if (data.hasOrders) {
      var ch = group(data, DIMS.channel.fn).filter(function (c) { return c.sold >= 50 && c.rate != null; }).sort(function (a, b) { return b.rate - a.rate; });
      if (ch.length > 1 && ch[0].rate > 1.3 * ch[ch.length - 1].rate) recs.push({ title: ch[0].key + ' has the highest return rate', text: Math.round(ch[0].rate * 100) + '% versus ' + Math.round(ch[ch.length - 1].rate * 100) + '% on ' + ch[ch.length - 1].key + '. Check that listings there have the same size charts, photos and descriptions as your main store.' });
    }
    var mind = reasons.filter(function (r) { return r.id === 'mind'; })[0];
    if (mind && mind.share >= 0.15) recs.push({ title: 'Change-of-mind returns are ' + Math.round(mind.share * 100) + '%', text: 'Consider offering store credit or an exchange first, and a shorter window for change-of-mind (faulty items must still be refunded under Australian Consumer Law).' });
    var other = reasons.filter(function (r) { return r.id === 'other'; })[0];
    if (other && other.share >= 0.15) recs.push({ title: 'Ask why', text: Math.round(other.share * 100) + '% of returns have no clear reason. Make the reason a required drop-down on your returns form.' });
    return recs;
  }

  // ---------- sample data (made up: online fashion & homewares store, 12 months) ----------
  function sampleData(endIso) {
    var R = rng(9090), end = Date.parse((endIso || '2026-11-08') + 'T00:00:00Z');
    function pick(a) { return a[Math.floor(R() * a.length)]; }
    var P = [
      { sku: 'LIN-SHIRT', name: 'Linen Shirt', cat: 'Tops', price: 89, sizes: ['XS', 'S', 'M', 'L', 'XL'], w: 0.16, rate: 0.26, reasons: { small: 0.62, large: 0.06, fit: 0.08, quality: 0.06, mind: 0.18 } },
      { sku: 'DEN-JEAN', name: 'High-rise Jeans', cat: 'Bottoms', price: 119, sizes: ['8', '10', '12', '14', '16'], w: 0.14, rate: 0.3, reasons: { small: 0.3, large: 0.3, fit: 0.15, mind: 0.15, described: 0.1 } },
      { sku: 'WRAP-DRS', name: 'Wrap Dress', cat: 'Dresses', price: 139, sizes: ['8', '10', '12', '14'], w: 0.1, rate: 0.28, reasons: { described: 0.45, fit: 0.2, mind: 0.25, quality: 0.1 } },
      { sku: 'MUG-SET4', name: 'Ceramic Mug Set (4)', cat: 'Homewares', price: 59, sizes: [''], w: 0.12, rate: 0.12, reasons: { damaged: 0.82, mind: 0.12, wrong: 0.06 } },
      { sku: 'MER-KNIT', name: 'Merino Knit', cat: 'Tops', price: 149, sizes: ['S', 'M', 'L'], w: 0.1, rate: 0.17, reasons: { quality: 0.55, fit: 0.15, mind: 0.3 } },
      { sku: 'TOTE-CNV', name: 'Canvas Tote', cat: 'Accessories', price: 35, sizes: [''], w: 0.12, rate: 0.03, reasons: { mind: 0.6, quality: 0.2, wrong: 0.2 } },
      { sku: 'CANDLE-L', name: 'Scented Candle Large', cat: 'Homewares', price: 45, sizes: [''], w: 0.12, rate: 0.05, reasons: { damaged: 0.5, mind: 0.4, late: 0.1 } },
      { sku: 'LAMP-RAT', name: 'Rattan Table Lamp', cat: 'Homewares', price: 129, sizes: [''], w: 0.06, rate: 0.36, reasons: { damaged: 0.55, quality: 0.3, described: 0.15 } },
      { sku: 'BELT-LTH', name: 'Leather Belt', cat: 'Accessories', price: 65, sizes: ['S', 'M', 'L'], w: 0.08, rate: 0.08, reasons: { large: 0.4, small: 0.3, mind: 0.3 } }
    ];
    var TEXT = {
      small: ['Too small, usual size was tight across the shoulders', 'Runs small, need a size up', 'Too tight', '', ''],
      large: ['Too big', 'Too loose around the waist', '', 'Way too long'],
      fit: ['Didn\'t fit right', 'Fit was off', '', 'Bought two sizes, keeping one'],
      damaged: ['Arrived broken — two mugs smashed', 'Box was crushed and item cracked', 'Lamp base cracked on arrival', 'Chipped rim', ''],
      quality: ['Started pilling after one wear', 'Fabric thinner than expected', 'Poor stitching, seam came apart', 'Feels cheap', ''],
      described: ['Colour is different from the photo', 'Much shorter than shown on the model', 'Not as pictured, fabric looks different', ''],
      mind: ['Changed my mind', 'No longer needed', 'Gift — not their style', 'Found it cheaper elsewhere', '', ''],
      wrong: ['Sent the wrong colour', 'Wrong item in the box'],
      late: ['Arrived after the event', 'Took too long']
    };
    var CODE = { small: 'Size too small', large: 'Size too large', fit: 'Size / fit', damaged: 'Damaged or faulty', quality: 'Quality not as expected', described: 'Not as described', mind: 'Changed mind', wrong: 'Wrong item sent', late: 'Arrived late' };
    var customers = []; for (var c = 0; c < 1400; c++) customers.push('cust' + (10000 + c) + '@example.com');
    var serial = ['cust10007@example.com', 'cust10042@example.com', 'cust10311@example.com'];
    var orders = [], returns = [], oid = 31001;
    for (var i = 0; i < 3600; i++) {
      var t = end - 7 * DAY - Math.floor(R() * 365) * DAY, mo = new Date(t).getUTCMonth();
      var channel = R() < 0.62 ? 'Website' : R() < 0.6 ? 'Marketplace' : 'Instagram';
      var cust = R() < 0.012 ? pick(serial) : customers[Math.floor(Math.pow(R(), 1.3) * customers.length)];
      var nLines = R() < 0.7 ? 1 : R() < 0.7 ? 2 : 3, id = 'CO' + (oid++), used = {};
      for (var k = 0; k < nLines; k++) {
        var u = R(), acc = 0, p = P[0]; for (var j = 0; j < P.length; j++) { acc += P[j].w; if (u <= acc) { p = P[j]; break; } }
        if (used[p.sku]) continue; used[p.sku] = 1;
        var size = pick(p.sizes), bracket = p.sizes.length > 1 && (serial.indexOf(cust) >= 0 ? R() < 0.7 : R() < 0.03);
        var variants = [size]; if (bracket) { var si = p.sizes.indexOf(size); variants.push(p.sizes[si + 1] || p.sizes[si - 1]); }
        variants.forEach(function (v, vi) {
          orders.push({ 'Order ID': id, 'Order date': new Date(t).toISOString().slice(0, 10), SKU: p.sku + (v ? '-' + v : ''), Product: p.name, Category: p.cat, Size: v, Qty: 1, 'Unit price': p.price.toFixed(2), Channel: channel, 'Customer email': cust });
          var rate = p.rate * (channel === 'Marketplace' ? 1.45 : channel === 'Instagram' ? 1.1 : 1) * (mo === 0 ? 1.4 : 1) * (serial.indexOf(cust) >= 0 ? 2.6 : 1);
          if (p.sku === 'LIN-SHIRT' && (v === 'XS' || v === 'S')) rate *= 1.35;
          var ret = vi === 1 || R() < Math.min(0.9, rate);
          if (!ret) return;
          var reason; if (vi === 1) reason = 'fit'; else if (mo === 0 && R() < 0.35) reason = 'mind'; else { var x = R(), a2 = 0; reason = 'mind'; Object.keys(p.reasons).some(function (r) { a2 += p.reasons[r]; if (x <= a2) { reason = r; return true; } return false; }); }
          var rd = t + (4 + Math.floor(R() * 20)) * DAY; if (rd > end) rd = end;
          var cond = reason === 'damaged' ? 'Not resaleable' : reason === 'quality' ? (R() < 0.6 ? 'Not resaleable' : 'Resaleable') : (R() < 0.93 ? 'Resaleable' : 'Not resaleable');
          returns.push({ 'Return ID': 'R' + (returns.length + 5001), 'Order ID': id, SKU: p.sku + (v ? '-' + v : ''), 'Return reason': R() < 0.85 ? CODE[reason] : '', 'Customer comment': pick(TEXT[reason]),
            'Refund amount': p.price.toFixed(2), 'Return shipping cost': (reason === 'mind' ? 0 : channel === 'Marketplace' ? 12.5 : 9.95).toFixed(2), 'Return date': new Date(rd).toISOString().slice(0, 10), Condition: cond });
        });
      }
    }
    return {
      orders: { headers: ['Order ID', 'Order date', 'SKU', 'Product', 'Category', 'Size', 'Qty', 'Unit price', 'Channel', 'Customer email'], rows: orders },
      returns: { headers: ['Return ID', 'Order ID', 'SKU', 'Return reason', 'Customer comment', 'Refund amount', 'Return shipping cost', 'Return date', 'Condition'], rows: returns }
    };
  }

  var L = {
    ORDER_FIELDS: ORDER_FIELDS, RETURN_FIELDS: RETURN_FIELDS, REASONS: REASONS, DIMS: DIMS, FIX: FIX, rng: rng, toNum: toNum, parseDate: parseDate, guessColumns: guessColumns,
    detectOrderColumns: detectOrderColumns, detectReturnColumns: detectReturnColumns, classify: classify, reasonName: reasonName, unsellable: unsellable,
    prepare: prepare, group: group, totals: totals, reasonBreakdown: reasonBreakdown, sizeSignals: sizeSignals, productActions: productActions,
    frequentReturners: frequentReturners, recommendations: recommendations, sampleData: sampleData
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.ReturnsLib = L;
})(this);
