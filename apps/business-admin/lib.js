/* Small Business Admin — pure logic (no DOM). Browser: window.BizAdminLib. Node: require('./lib.js'). */
(function (root) {
  'use strict';
  var B = (typeof require === 'function' && typeof module !== 'undefined' && module.exports) ? require('../../assets/core.js') : root.B;
  var GST_RATE = 0.1;

  function r2(n) { return Math.round((+n || 0) * 100 + (n >= 0 ? 1e-9 : -1e-9)) / 100; }
  function iso(d) { return B.fmt.date(d); }
  function parse(d) { return d instanceof Date ? d : B.toDate(d); }
  function addDays(d, n) { var x = parse(d); return iso(new Date(x.getTime() + n * 86400000)); }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); } // b - a

  // ---------- document maths ----------
  /* doc.lines: [{desc, qty, price}] (price excludes GST); doc.discount: {type:'pct'|'amt', value}; doc.gst: true adds 10% */
  function totals(doc) {
    var subtotal = r2((doc.lines || []).reduce(function (s, l) { return s + (+l.qty || 0) * (+l.price || 0); }, 0));
    var d = doc.discount || {}, discount = 0;
    if (+d.value > 0) discount = d.type === 'pct' ? r2(subtotal * Math.min(100, +d.value) / 100) : r2(Math.min(subtotal, +d.value));
    var net = r2(subtotal - discount), gst = doc.gst ? r2(net * GST_RATE) : 0;
    return { subtotal: subtotal, discount: discount, net: net, gst: gst, total: r2(net + gst) };
  }
  function paid(doc) { return r2((doc.payments || []).reduce(function (s, p) { return s + (+p.amount || 0); }, 0)); }
  function balance(doc) { return r2(totals(doc).total - paid(doc)); }

  /* Effective status shown to the user. Invoices: draft, sent, overdue, paid. Quotes: draft, sent, accepted, declined, invoiced, expired. */
  function status(doc, today) {
    if (doc.kind === 'quote') {
      if (doc.status === 'sent' && doc.due && daysBetween(doc.due, today) > 0) return 'expired';
      return doc.status || 'draft';
    }
    if (doc.status === 'draft') return 'draft';
    var t = totals(doc).total;
    if (doc.status === 'paid' || (t > 0 && balance(doc) <= 0)) return 'paid';
    if (doc.due && daysBetween(doc.due, today) > 0) return 'overdue';
    return 'sent';
  }

  function nextNumber(docs, kind, prefix) {
    prefix = prefix == null ? (kind === 'quote' ? 'Q-' : 'INV-') : prefix;
    var max = 0, width = 4;
    docs.forEach(function (d) {
      if (d.kind !== kind || String(d.number || '').indexOf(prefix) !== 0) return;
      var m = String(d.number).slice(prefix.length).match(/^(\d+)$/);
      if (m) { max = Math.max(max, +m[1]); width = Math.max(width, m[1].length); }
    });
    var n = String(max + 1); while (n.length < width) n = '0' + n;
    return prefix + n;
  }

  function newDoc(kind, docs, settings, today, id) {
    settings = settings || {};
    var days = kind === 'quote' ? (+settings.quoteDays || 30) : (+settings.termsDays || 14);
    return { id: id, kind: kind, number: nextNumber(docs, kind, kind === 'quote' ? settings.quotePrefix : settings.invoicePrefix), customerId: '', date: iso(today), due: addDays(today, days),
      lines: [{ desc: '', qty: 1, price: 0 }], discount: { type: 'pct', value: 0 }, gst: settings.gstRegistered !== false, status: 'draft', payments: [], notes: '' };
  }

  function quoteToInvoice(quote, docs, settings, today, id) {
    var inv = newDoc('invoice', docs, settings, today, id);
    inv.customerId = quote.customerId;
    inv.lines = JSON.parse(JSON.stringify(quote.lines || []));
    inv.discount = Object.assign({}, quote.discount);
    inv.gst = !!quote.gst; inv.notes = quote.notes || ''; inv.fromQuote = quote.number;
    return inv;
  }

  // ---------- reminders ----------
  function reminderLevel(daysOverdue) { return daysOverdue <= 0 ? 0 : daysOverdue <= 14 ? 1 : daysOverdue <= 30 ? 2 : 3; }
  var LEVEL_NAME = ['Due soon', 'Friendly reminder', 'Second reminder', 'Final notice'];
  /* Unpaid invoices that are overdue or due within `soon` days. -> [{doc, customer, daysOverdue, level, balance}] most urgent first */
  function reminders(docs, customers, today, soon) {
    soon = soon == null ? 7 : soon;
    var byId = {}; (customers || []).forEach(function (c) { byId[c.id] = c; });
    return docs.filter(function (d) { return d.kind === 'invoice' && d.status !== 'draft' && status(d, today) !== 'paid' && d.due; })
      .map(function (d) { var od = daysBetween(d.due, today); return { doc: d, customer: byId[d.customerId] || { name: 'Unknown customer' }, daysOverdue: od, level: reminderLevel(od), balance: balance(d) }; })
      .filter(function (x) { return x.daysOverdue > 0 || -x.daysOverdue <= soon; })
      .sort(function (a, b) { return b.daysOverdue - a.daysOverdue; });
  }
  function reminderEmail(doc, customer, settings, level, today) {
    settings = settings || {}; customer = customer || {};
    var bal = B.fmt.money(balance(doc)), num = doc.number, biz = settings.name || 'our business';
    var who = (customer.contact || customer.name || '').split(' ')[0] || 'there';
    var od = daysBetween(doc.due, today), dueTxt = B.fmt.date(doc.due);
    var pay = settings.payDetails ? '\n\nPayment details:\n' + settings.payDetails : '';
    var sign = '\n\nKind regards,\n' + (settings.contactName ? settings.contactName + '\n' : '') + biz + (settings.phone ? '\n' + settings.phone : '');
    var subject, body;
    if (level === 0) {
      subject = 'Invoice ' + num + ' is due on ' + dueTxt;
      body = 'Hi ' + who + ',\n\nJust a quick heads-up that invoice ' + num + ' for ' + bal + ' is due on ' + dueTxt + '. If it is already on its way, thank you and please ignore this note.' + pay;
    } else if (level === 1) {
      subject = 'Friendly reminder: invoice ' + num + ' (' + bal + ')';
      body = 'Hi ' + who + ',\n\nI hope all is well. Our records show invoice ' + num + ' for ' + bal + ' was due on ' + dueTxt + ' and is still open. It may simply have slipped through, so I have attached a copy for convenience.\n\nCould you let me know when we can expect payment? If you have already paid, please reply with the date so I can match it up.' + pay;
    } else if (level === 2) {
      subject = 'Second reminder: invoice ' + num + ' is ' + od + ' days overdue';
      body = 'Hi ' + who + ',\n\nI am following up on invoice ' + num + ' for ' + bal + ', which was due on ' + dueTxt + ' and is now ' + od + ' days overdue. I have not yet received payment or a reply to my earlier reminder.\n\nPlease arrange payment within the next 7 days, or let me know if there is a problem with the invoice. I am happy to talk about a payment plan if that would help.' + pay;
    } else {
      subject = 'Final notice: invoice ' + num + ' (' + bal + ') — ' + od + ' days overdue';
      body = 'Dear ' + (customer.contact || customer.name || 'customer') + ',\n\nInvoice ' + num + ' for ' + bal + ' was due on ' + dueTxt + ' and remains unpaid ' + od + ' days later, despite earlier reminders.\n\nPlease pay the full amount by ' + B.fmt.date(addDays(today, 7)) + '. If payment is not received by then, I will need to pause further work and consider other steps to recover the debt. If you are having difficulty paying, please contact me now so we can agree on a plan.' + pay;
    }
    return { subject: subject, body: body + sign };
  }
  function mailto(to, subject, body) {
    return 'mailto:' + encodeURIComponent(to || '').replace(/%40/g, '@') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  // ---------- expenses ----------
  function gstFromInclusive(amount) { return r2((+amount || 0) / 11); }
  function expenseGst(e) { return e.gst != null && e.gst !== '' ? r2(e.gst) : 0; }
  var CATEGORIES = ['Advertising', 'Bank fees', 'Equipment', 'Insurance', 'Motor vehicle', 'Office supplies', 'Phone & internet', 'Rent', 'Software & subscriptions', 'Stock & materials', 'Subcontractors', 'Travel', 'Utilities', 'Other'];

  // ---------- reports ----------
  function monthKey(d) { return iso(d).slice(0, 7); }
  function invoicesIssued(docs) { return docs.filter(function (d) { return d.kind === 'invoice' && d.status !== 'draft'; }); }
  /* Last `months` months ending at today's month. Income = invoices issued (ex GST); expenses ex GST. */
  function monthly(docs, expenses, today, months) {
    months = months || 12; var t = parse(today), out = [], idx = {};
    for (var i = months - 1; i >= 0; i--) {
      var k = iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - i, 1))).slice(0, 7);
      idx[k] = { month: k, income: 0, expenses: 0, profit: 0 }; out.push(idx[k]);
    }
    invoicesIssued(docs).forEach(function (d) { var m = idx[monthKey(d.date)]; if (m) m.income = r2(m.income + totals(d).net); });
    (expenses || []).forEach(function (e) { var m = idx[monthKey(e.date)]; if (m) m.expenses = r2(m.expenses + (+e.amount || 0) - expenseGst(e)); });
    out.forEach(function (m) { m.profit = r2(m.income - m.expenses); });
    return out;
  }
  // Australian BAS quarter for a date: Jul–Sep, Oct–Dec, Jan–Mar, Apr–Jun.
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function quarterOf(d) {
    var x = parse(d), y = x.getUTCFullYear(), m = x.getUTCMonth(), sm = m - (m % 3);
    var start = iso(new Date(Date.UTC(y, sm, 1))), end = iso(new Date(Date.UTC(y, sm + 3, 0)));
    return { key: start.slice(0, 7), label: MON[sm] + '–' + MON[sm + 2] + ' ' + y, start: start, end: end };
  }
  /* GST collected vs paid per BAS quarter. basis 'accrual' (invoice date) or 'cash' (payments received, GST share pro rata). ESTIMATE ONLY. */
  function gstSummary(docs, expenses, basis) {
    var q = {};
    function bucket(d) { var k = quarterOf(d); return q[k.key] || (q[k.key] = { key: k.key, label: k.label, start: k.start, end: k.end, sales: 0, collected: 0, purchases: 0, paid: 0, net: 0 }); }
    invoicesIssued(docs).forEach(function (d) {
      var t = totals(d); if (!t.total) return;
      if (basis === 'cash') (d.payments || []).forEach(function (p) { var b = bucket(p.date), share = (+p.amount || 0) / t.total; b.sales = r2(b.sales + (+p.amount || 0)); b.collected = r2(b.collected + t.gst * share); });
      else { var b = bucket(d.date); b.sales = r2(b.sales + t.total); b.collected = r2(b.collected + t.gst); }
    });
    (expenses || []).forEach(function (e) { var b = bucket(e.date); b.purchases = r2(b.purchases + (+e.amount || 0)); b.paid = r2(b.paid + expenseGst(e)); });
    return Object.keys(q).sort().reverse().map(function (k) { var b = q[k]; b.net = r2(b.collected - b.paid); return b; });
  }
  function topCustomers(docs, customers, limit) {
    var byId = {}; (customers || []).forEach(function (c) { byId[c.id] = { id: c.id, name: c.name, invoiced: 0, paid: 0, outstanding: 0, count: 0 }; });
    invoicesIssued(docs).forEach(function (d) {
      var c = byId[d.customerId] || (byId[d.customerId] = { id: d.customerId, name: 'Unknown customer', invoiced: 0, paid: 0, outstanding: 0, count: 0 });
      c.invoiced = r2(c.invoiced + totals(d).total); c.paid = r2(c.paid + paid(d)); c.outstanding = r2(c.outstanding + Math.max(0, balance(d))); c.count++;
    });
    return Object.keys(byId).map(function (k) { return byId[k]; }).filter(function (c) { return c.count; }).sort(function (a, b) { return b.invoiced - a.invoiced; }).slice(0, limit || 10);
  }
  var AGE_BUCKETS = ['Not yet due', '0–30 days', '31–60 days', '61–90 days', '90+ days'];
  /* Aged receivables by days past the due date. -> {rows:[{name, buckets:[5], total}], totals:[5], total} */
  function aged(docs, customers, today) {
    var names = {}; (customers || []).forEach(function (c) { names[c.id] = c.name; });
    var rows = {}, totalsArr = [0, 0, 0, 0, 0];
    invoicesIssued(docs).forEach(function (d) {
      var bal = balance(d); if (bal <= 0) return;
      var od = d.due ? daysBetween(d.due, today) : daysBetween(d.date, today);
      var i = od <= 0 ? 0 : od <= 30 ? 1 : od <= 60 ? 2 : od <= 90 ? 3 : 4;
      var r = rows[d.customerId] || (rows[d.customerId] = { name: names[d.customerId] || 'Unknown customer', buckets: [0, 0, 0, 0, 0], total: 0 });
      r.buckets[i] = r2(r.buckets[i] + bal); r.total = r2(r.total + bal); totalsArr[i] = r2(totalsArr[i] + bal);
    });
    var list = Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) { return b.total - a.total; });
    return { rows: list, totals: totalsArr, total: r2(totalsArr.reduce(function (s, x) { return s + x; }, 0)) };
  }

  // ---------- CSV exports ----------
  function docsCsvRows(docs, customers, today) {
    var names = {}; (customers || []).forEach(function (c) { names[c.id] = c.name; });
    return docs.map(function (d) {
      var t = totals(d);
      return { Type: d.kind === 'quote' ? 'Quote' : 'Invoice', Number: d.number, Customer: names[d.customerId] || '', Date: d.date, 'Due / valid until': d.due || '', Status: status(d, today),
        Subtotal: t.subtotal, Discount: t.discount, GST: t.gst, Total: t.total, Paid: paid(d), Balance: d.kind === 'invoice' ? balance(d) : '' };
    });
  }
  function expensesCsvRows(expenses) {
    return (expenses || []).map(function (e) { return { Date: e.date, Supplier: e.supplier || '', Category: e.category || '', 'Amount (incl GST)': r2(e.amount), GST: expenseGst(e), 'Receipt / note': e.note || '' }; });
  }

  // ---------- printable document ----------
  function docHtml(doc, customer, settings, today) {
    settings = settings || {}; customer = customer || {};
    var e = B.esc, t = totals(doc), m = B.fmt.money, isQ = doc.kind === 'quote';
    var title = isQ ? 'Quote' : (doc.gst ? 'Tax invoice' : 'Invoice');
    var st = status(doc, today);
    var lines = (doc.lines || []).filter(function (l) { return l.desc || +l.price; });
    var h = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + e(title + ' ' + doc.number) + '</title><style>' +
      'body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d1f24;margin:0;padding:32px;max-width:820px}' +
      '.top{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}.logo{max-height:70px;max-width:220px}h1{font-size:28px;margin:0 0 4px;letter-spacing:.5px}' +
      'table{width:100%;border-collapse:collapse;margin:24px 0 8px}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}th{background:#f3f1ea}td.n,th.n{text-align:right;white-space:nowrap}' +
      '.tot{margin-left:auto;width:280px}.tot td{border:0;padding:3px 8px}.tot tr.big td{font-size:18px;font-weight:700;border-top:2px solid #1d1f24}' +
      '.muted{color:#5d6270}.box{background:#f7f6f2;padding:12px 14px;border-radius:8px;margin-top:18px;white-space:pre-wrap}.paid{color:#1f7a46;font-weight:700;border:2px solid #1f7a46;display:inline-block;padding:2px 10px;border-radius:6px;transform:rotate(-4deg)}' +
      '@media print{body{padding:0}.noprint{display:none}}</style></head><body>';
    h += '<div class="top"><div>' + (settings.logo ? '<img class="logo" src="' + e(settings.logo) + '" alt=""><br>' : '') + '<b style="font-size:17px">' + e(settings.name || 'Your business name') + '</b><br>' +
      (settings.abn ? 'ABN ' + e(settings.abn) + '<br>' : '') + (settings.address ? e(settings.address).replace(/\n/g, '<br>') + '<br>' : '') +
      [settings.email, settings.phone].filter(Boolean).map(e).join(' · ') + '</div>';
    h += '<div style="text-align:right"><h1>' + e(title.toUpperCase()) + '</h1><b>' + e(doc.number) + '</b><br>Date: ' + e(B.fmt.date(doc.date)) + '<br>' +
      (doc.due ? (isQ ? 'Valid until: ' : 'Due: ') + e(B.fmt.date(doc.due)) + '<br>' : '') + (doc.fromQuote ? '<span class="muted">From quote ' + e(doc.fromQuote) + '</span><br>' : '') +
      (!isQ && st === 'paid' ? '<span class="paid">PAID</span>' : '') + '</div></div>';
    h += '<p style="margin-top:22px"><span class="muted">' + (isQ ? 'Prepared for' : 'Bill to') + '</span><br><b>' + e(customer.name || '') + '</b>' + (customer.contact ? '<br>Attn: ' + e(customer.contact) : '') +
      (customer.address ? '<br>' + e(customer.address).replace(/\n/g, '<br>') : '') + (customer.email ? '<br>' + e(customer.email) : '') + '</p>';
    h += '<table><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Unit price</th><th class="n">Amount</th></tr></thead><tbody>' +
      lines.map(function (l) { return '<tr><td>' + e(l.desc).replace(/\n/g, '<br>') + '</td><td class="n">' + e(B.fmt.num(+l.qty)) + '</td><td class="n">' + m(+l.price) + '</td><td class="n">' + m(r2((+l.qty || 0) * (+l.price || 0))) + '</td></tr>'; }).join('') + '</tbody></table>';
    h += '<table class="tot"><tr><td>Subtotal</td><td class="n">' + m(t.subtotal) + '</td></tr>' +
      (t.discount ? '<tr><td>Discount' + (doc.discount.type === 'pct' ? ' (' + e(doc.discount.value) + '%)' : '') + '</td><td class="n">−' + m(t.discount) + '</td></tr>' : '') +
      (doc.gst ? '<tr><td>GST (10%)</td><td class="n">' + m(t.gst) + '</td></tr>' : '') +
      '<tr class="big"><td>Total' + (doc.gst ? ' incl. GST' : '') + '</td><td class="n">' + m(t.total) + '</td></tr>' +
      (!isQ && paid(doc) ? '<tr><td>Paid</td><td class="n">−' + m(paid(doc)) + '</td></tr><tr><td><b>Balance due</b></td><td class="n"><b>' + m(balance(doc)) + '</b></td></tr>' : '') + '</table>';
    if (!doc.gst && !isQ) h += '<p class="muted small">No GST has been charged.</p>';
    if (doc.notes) h += '<div class="box">' + e(doc.notes) + '</div>';
    if (!isQ && settings.payDetails) h += '<div class="box"><b>How to pay</b>\n' + e(settings.payDetails) + '\nPlease use ' + e(doc.number) + ' as the reference.</div>';
    if (isQ && settings.quoteTerms) h += '<div class="box">' + e(settings.quoteTerms) + '</div>';
    h += '<p class="noprint muted" style="margin-top:28px">Use your browser\'s Print command and choose "Save as PDF" to make a PDF.</p></body></html>';
    return h;
  }

  // ---------- backup ----------
  function validateBackup(j) {
    if (!j || typeof j !== 'object') throw new Error('Not a backup file');
    if (j.app && j.app !== 'business-admin') throw new Error('This backup is from a different app (' + j.app + ')');
    ['customers', 'docs', 'expenses'].forEach(function (k) { if (j[k] != null && !Array.isArray(j[k])) throw new Error('"' + k + '" should be a list'); });
    return { settings: j.settings || {}, customers: j.customers || [], docs: j.docs || [], expenses: j.expenses || [] };
  }

  // ---------- sample data (dates relative to today so reminders and ageing look real) ----------
  function sample(today) {
    var d = function (n) { return addDays(today, n); };
    var customers = [
      { id: 'c1', name: 'Harbour Cafe', contact: 'Mia Nguyen', email: 'accounts@harbourcafe.example', phone: '0412 555 101', address: '12 Wharf St\nSydney NSW 2000' },
      { id: 'c2', name: 'Bondi Plumbing', contact: 'Jack Wilson', email: 'admin@bondiplumbing.example', phone: '0412 555 102', address: '4/88 Campbell Pde\nBondi Beach NSW 2026' },
      { id: 'c3', name: 'Westside Florist', contact: 'Priya Sharma', email: 'hello@westsideflorist.example', phone: '0412 555 103', address: '201 Ballarat Rd\nFootscray VIC 3011' },
      { id: 'c4', name: 'Northern Tiles', contact: 'Tom O\'Brien', email: 'pay@ntiles.example', phone: '0412 555 104', address: '7 Industrial Ave\nMolendinar QLD 4214' }
    ];
    var L = function (desc, qty, price) { return { desc: desc, qty: qty, price: price }; };
    var docs = [
      { id: 'd1', kind: 'invoice', number: 'INV-0001', customerId: 'c1', date: d(-130), due: d(-116), lines: [L('Website refresh — design and build', 1, 2400), L('Hosting setup', 1, 150)], discount: { type: 'pct', value: 0 }, gst: true, status: 'sent', payments: [{ date: d(-110), amount: 2805 }], notes: '' },
      { id: 'd2', kind: 'invoice', number: 'INV-0002', customerId: 'c2', date: d(-100), due: d(-86), lines: [L('Google Business profile setup', 1, 450), L('Monthly SEO care (3 months)', 3, 300)], discount: { type: 'amt', value: 100 }, gst: true, status: 'sent', payments: [], notes: '' },
      { id: 'd3', kind: 'invoice', number: 'INV-0003', customerId: 'c3', date: d(-62), due: d(-48), lines: [L('Online shop — product upload', 40, 12), L('Photography editing', 6, 45)], discount: { type: 'pct', value: 0 }, gst: true, status: 'sent', payments: [{ date: d(-40), amount: 300 }], notes: '' },
      { id: 'd4', kind: 'invoice', number: 'INV-0004', customerId: 'c1', date: d(-35), due: d(-21), lines: [L('Menu redesign and print files', 1, 680)], discount: { type: 'pct', value: 0 }, gst: true, status: 'sent', payments: [], notes: '' },
      { id: 'd5', kind: 'invoice', number: 'INV-0005', customerId: 'c4', date: d(-20), due: d(-6), lines: [L('Booking system integration', 1, 1200), L('Staff training session', 2, 150)], discount: { type: 'pct', value: 10 }, gst: true, status: 'sent', payments: [], notes: '' },
      { id: 'd6', kind: 'invoice', number: 'INV-0006', customerId: 'c2', date: d(-10), due: d(4), lines: [L('Monthly SEO care', 1, 300)], discount: { type: 'pct', value: 0 }, gst: true, status: 'sent', payments: [], notes: '' },
      { id: 'd7', kind: 'invoice', number: 'INV-0007', customerId: 'c3', date: d(-3), due: d(11), lines: [L('Christmas campaign landing page', 1, 900)], discount: { type: 'pct', value: 0 }, gst: true, status: 'paid', payments: [{ date: d(-1), amount: 990 }], notes: 'Thanks for the quick payment!' },
      { id: 'd8', kind: 'invoice', number: 'INV-0008', customerId: 'c4', date: d(0), due: d(14), lines: [L('Quarterly maintenance', 1, 450)], discount: { type: 'pct', value: 0 }, gst: true, status: 'draft', payments: [], notes: '' },
      { id: 'q1', kind: 'quote', number: 'Q-0001', customerId: 'c4', date: d(-5), due: d(25), lines: [L('New website — 6 pages', 1, 3800), L('Copywriting', 6, 120), L('Logo refresh', 1, 650)], discount: { type: 'pct', value: 5 }, gst: true, status: 'sent', payments: [], notes: '50% deposit on acceptance, balance on launch.' },
      { id: 'q2', kind: 'quote', number: 'Q-0002', customerId: 'c1', date: d(-2), due: d(28), lines: [L('Loyalty app prototype', 1, 2200)], discount: { type: 'pct', value: 0 }, gst: true, status: 'draft', payments: [], notes: '' }
    ];
    var x = function (id, n, supplier, category, amount, note) { return { id: id, date: d(n), supplier: supplier, category: category, amount: amount, gst: gstFromInclusive(amount), note: note }; };
    var expenses = [
      x('e1', -125, 'Adobe', 'Software & subscriptions', 87.99, 'Monthly plan — email receipt'),
      x('e2', -95, 'Officeworks', 'Office supplies', 142.5, 'Printer ink, paper'),
      x('e3', -90, 'Telstra', 'Phone & internet', 110, 'Mobile + NBN'),
      x('e4', -60, 'JB Hi-Fi', 'Equipment', 1499, 'Laptop — keep receipt for 5 years'),
      x('e5', -32, 'Adobe', 'Software & subscriptions', 87.99, ''),
      x('e6', -28, 'Telstra', 'Phone & internet', 110, ''),
      { id: 'e7', date: d(-15), supplier: 'Bank', category: 'Bank fees', amount: 10, gst: 0, note: 'Account fee (no GST)' },
      x('e8', -4, 'Canva', 'Software & subscriptions', 21.99, '')
    ];
    var settings = { name: 'Sinha Digital Studio', contactName: 'Pawan', abn: '12 345 678 901', address: '1 Example St\nParramatta NSW 2150', email: 'hello@example.com', phone: '0400 000 000',
      payDetails: 'Bank transfer: BSB 062-000  Account 1234 5678\nAccount name: Sinha Digital Studio', termsDays: 14, quoteDays: 30, gstRegistered: true, invoicePrefix: 'INV-', quotePrefix: 'Q-',
      quoteTerms: 'This quote is valid for 30 days. Prices include 10% GST where shown.', logo: '' };
    return { settings: settings, customers: customers, docs: docs, expenses: expenses };
  }

  var L = {
    GST_RATE: GST_RATE, r2: r2, addDays: addDays, daysBetween: daysBetween, totals: totals, paid: paid, balance: balance, status: status, nextNumber: nextNumber, newDoc: newDoc,
    quoteToInvoice: quoteToInvoice, reminderLevel: reminderLevel, LEVEL_NAME: LEVEL_NAME, reminders: reminders, reminderEmail: reminderEmail, mailto: mailto,
    gstFromInclusive: gstFromInclusive, CATEGORIES: CATEGORIES, monthly: monthly, quarterOf: quarterOf, gstSummary: gstSummary, topCustomers: topCustomers,
    AGE_BUCKETS: AGE_BUCKETS, aged: aged, docsCsvRows: docsCsvRows, expensesCsvRows: expensesCsvRows, docHtml: docHtml, validateBackup: validateBackup, sample: sample
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.BizAdminLib = L;
})(this);
