/* Small Business Admin — page wiring. Logic lives in lib.js (BizAdminLib). */
(function () {
  'use strict';
  var L = window.BizAdminLib, $ = B.$, m = B.fmt.money, esc = B.esc;
  function m1(v) { return m(v); } // B.table passes (value, row); money() must only get the value
  var KEY = 'bizadmin:data';
  var DEFAULT_SETTINGS = { name: '', contactName: '', abn: '', address: '', email: '', phone: '', payDetails: '', quoteTerms: '', termsDays: 14, quoteDays: 30, invoicePrefix: 'INV-', quotePrefix: 'Q-', gstRegistered: true, logo: '' };
  var data = load();
  var editing = null;   // doc being edited (copy)
  var showTab;

  function load() {
    var d = B.store.get(KEY, null) || {};
    return { settings: Object.assign({}, DEFAULT_SETTINGS, d.settings || {}), customers: d.customers || [], docs: d.docs || [], expenses: d.expenses || [] };
  }
  function save() { if (!B.store.set(KEY, data)) B.toast('Could not save — browser storage may be full. Download a backup.', 4000); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function cust(id) { return data.customers.filter(function (c) { return c.id === id; })[0]; }
  function custName(id) { var c = cust(id); return c ? c.name : '(no customer)'; }
  var PILL = { paid: 'pill-ok', accepted: 'pill-ok', invoiced: 'pill-ok', sent: 'pill-warn', overdue: 'pill-bad', declined: 'pill-bad', expired: 'pill-bad', draft: 'pill-mute' };
  function pill(s) { return '<span class="' + (PILL[s] || 'pill-mute') + '">' + esc(s) + '</span>'; }
  function stat(v, k, cls) { return '<div class="stat"><div class="v ' + (cls || '') + '">' + esc(v) + '</div><div class="k">' + esc(k) + '</div></div>'; }
  function csv(name, rows) {
    if (!rows.length) return B.toast('Nothing to export');
    B.download(name, '﻿' + B.csv.stringify(rows, Object.keys(rows[0])), 'text/csv;charset=utf-8');
  }

  // ---------- overview ----------
  function renderOverview() {
    var t = today(), invs = data.docs.filter(function (d) { return d.kind === 'invoice'; });
    var unpaid = invs.filter(function (d) { var s = L.status(d, t); return s === 'sent' || s === 'overdue'; });
    var overdue = unpaid.filter(function (d) { return L.status(d, t) === 'overdue'; });
    var owed = unpaid.reduce(function (s, d) { return s + L.balance(d); }, 0), late = overdue.reduce(function (s, d) { return s + L.balance(d); }, 0);
    var month = L.monthly(data.docs, data.expenses, t, 1)[0];
    var q = L.gstSummary(data.docs, data.expenses, 'accrual').filter(function (x) { return x.key === L.quarterOf(t).key; })[0];
    var openQuotes = data.docs.filter(function (d) { return d.kind === 'quote' && L.status(d, t) === 'sent'; });
    var html = '<div class="stat-row" style="margin-top:16px">' + stat(m(owed), 'Owed to you (' + unpaid.length + ')', owed ? 'warn' : 'ok') + stat(m(late), 'Overdue (' + overdue.length + ')', late ? 'bad' : 'ok') +
      stat(m(month.income), 'Invoiced this month (ex GST)') + stat(m(month.expenses), 'Spent this month (ex GST)') +
      stat(m(q ? q.net : 0), 'GST to pay this quarter (estimate)') + stat(String(openQuotes.length), 'Quotes waiting for a reply') + '</div>';
    var rem = L.reminders(data.docs, data.customers, t, 7).slice(0, 6);
    html += '<h2>Needs attention</h2>';
    if (!data.docs.length && !data.customers.length) html += '<div class="panel"><p>Nothing here yet. Start by adding your business details in <b>Settings</b>, then a customer, then your first invoice. Or press <b>Load sample data</b> to look around first.</p></div>';
    else if (!rem.length) html += '<p class="ok">No invoices are overdue or due this week.</p>';
    else html += B.table(rem.map(function (r) { return { inv: r.doc.number, cust: r.customer.name, bal: r.balance, when: r.daysOverdue > 0 ? r.daysOverdue + ' days overdue' : (r.daysOverdue === 0 ? 'due today' : 'due in ' + -r.daysOverdue + ' days'), lvl: r.level }; }),
      [{ key: 'inv', label: 'Invoice' }, { key: 'cust', label: 'Customer' }, { key: 'bal', label: 'Balance', fmt: m1 }, { key: 'when', label: 'When' }, { key: 'lvl', label: 'Next step', fmt: function (l) { return '<span class="' + (l >= 2 ? 'pill-bad' : 'pill-warn') + '">' + esc(L.LEVEL_NAME[l]) + '</span>'; } }]) +
      '<p><button class="btn small" type="button" data-go="reminders">Write reminders</button></p>';
    $('#overview').innerHTML = html;
  }

  // ---------- documents ----------
  function startDoc(kind, base) {
    editing = base ? JSON.parse(JSON.stringify(base)) : L.newDoc(kind, data.docs, data.settings, today(), B.uid());
    if (!base && data.customers.length === 1) editing.customerId = data.customers[0].id;
    showTab('docs'); renderEditor(); $('#editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderEditor() {
    var ed = $('#editor'); if (!editing) { ed.hidden = true; ed.innerHTML = ''; return; }
    var d = editing, isQ = d.kind === 'quote', isNew = !data.docs.some(function (x) { return x.id === d.id; });
    ed.hidden = false;
    var statuses = isQ ? ['draft', 'sent', 'accepted', 'declined', 'invoiced'] : ['draft', 'sent', 'paid'];
    ed.innerHTML = '<h2 style="margin-top:0">' + (isNew ? 'New ' : 'Edit ') + (isQ ? 'quote' : 'invoice') + '</h2>' +
      '<div class="form-grid">' +
      '<div><label for="e-number">Number</label><input type="text" id="e-number" value="' + esc(d.number) + '"></div>' +
      '<div><label for="e-customer">Customer</label><select id="e-customer"><option value="">Choose…</option>' + data.customers.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === d.customerId ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="e-date">Date</label><input type="date" id="e-date" value="' + esc(d.date) + '"></div>' +
      '<div><label for="e-due">' + (isQ ? 'Valid until' : 'Due date') + '</label><input type="date" id="e-due" value="' + esc(d.due || '') + '"></div>' +
      '<div><label for="e-status">Status</label><select id="e-status">' + statuses.map(function (s) { return '<option' + (s === d.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
      '</div>' + (data.customers.length ? '' : '<p class="small warn">Add a customer first (Customers tab), or the document will have no name on it.</p>') +
      '<h3>Items</h3><div class="line line-head"><span>Description</span><span>Qty</span><span>Unit price (ex GST)</span><span class="amt">Amount</span><span></span></div><div id="e-lines"></div>' +
      '<button class="btn small" type="button" id="e-addLine">+ Add line</button>' +
      '<div class="form-grid" style="margin-top:8px">' +
      '<div><label for="e-discType">Discount</label><select id="e-discType"><option value="pct"' + (d.discount.type === 'pct' ? ' selected' : '') + '>Percent (%)</option><option value="amt"' + (d.discount.type === 'amt' ? ' selected' : '') + '>Dollar amount</option></select></div>' +
      '<div><label for="e-discVal">Discount value</label><input type="number" id="e-discVal" min="0" step="0.01" value="' + esc(d.discount.value || 0) + '"></div>' +
      '<div><label class="check" style="margin-top:34px"><input type="checkbox" id="e-gst"' + (d.gst ? ' checked' : '') + '> Add GST (10%)</label></div>' +
      '<div class="full"><label for="e-notes">Notes printed on the document</label><textarea id="e-notes" class="prose" style="min-height:60px">' + esc(d.notes || '') + '</textarea></div></div>' +
      '<div class="totals" id="e-totals"></div>' +
      '<div class="row" style="margin-top:14px"><button class="btn primary" type="button" id="e-save">Save</button><button class="btn" type="button" id="e-savePrint">Save and print</button><button class="btn" type="button" id="e-cancel">Cancel</button></div>';
    renderLines();
    var bind = function (id, fn) { $(id).addEventListener('input', fn); $(id).addEventListener('change', fn); };
    bind('#e-number', function () { d.number = this.value; });
    bind('#e-customer', function () { d.customerId = this.value; });
    bind('#e-date', function () { d.date = this.value; });
    bind('#e-due', function () { d.due = this.value; });
    bind('#e-status', function () { d.status = this.value; });
    bind('#e-discType', function () { d.discount.type = this.value; renderTotals(); });
    bind('#e-discVal', function () { d.discount.value = +this.value || 0; renderTotals(); });
    bind('#e-gst', function () { d.gst = this.checked; renderTotals(); });
    bind('#e-notes', function () { d.notes = this.value; });
    $('#e-addLine').addEventListener('click', function () { d.lines.push({ desc: '', qty: 1, price: 0 }); renderLines(); B.$$('#e-lines .desc').pop().focus(); });
    $('#e-save').addEventListener('click', function () { saveDoc(false); });
    $('#e-savePrint').addEventListener('click', function () { saveDoc(true); });
    $('#e-cancel').addEventListener('click', function () { editing = null; renderEditor(); });
  }
  function renderLines() {
    var box = $('#e-lines'); box.innerHTML = '';
    editing.lines.forEach(function (l, i) {
      var row = B.h('div', { class: 'line' });
      var desc = B.h('input', { type: 'text', class: 'desc', 'aria-label': 'Description', placeholder: 'What you did or supplied', value: l.desc });
      var qty = B.h('input', { type: 'number', step: 'any', 'aria-label': 'Quantity', placeholder: 'Qty', title: 'Quantity', value: l.qty });
      var price = B.h('input', { type: 'number', step: '0.01', 'aria-label': 'Unit price', placeholder: 'Price ex GST', title: 'Unit price (ex GST)', value: l.price });
      var amt = B.h('span', { class: 'amt', text: m(L.r2(l.qty * l.price)) });
      var del = B.h('button', { class: 'btn small', type: 'button', 'aria-label': 'Remove line', text: '✕' });
      desc.addEventListener('input', function () { l.desc = desc.value; });
      var upd = function () { l.qty = +qty.value || 0; l.price = +price.value || 0; amt.textContent = m(L.r2(l.qty * l.price)); renderTotals(); };
      qty.addEventListener('input', upd); price.addEventListener('input', upd);
      del.addEventListener('click', function () { editing.lines.splice(i, 1); if (!editing.lines.length) editing.lines.push({ desc: '', qty: 1, price: 0 }); renderLines(); });
      row.append(desc, qty, price, amt, del); box.appendChild(row);
    });
    renderTotals();
  }
  function renderTotals() {
    var t = L.totals(editing);
    $('#e-totals').innerHTML = '<div><span>Subtotal</span><span>' + m(t.subtotal) + '</span></div>' + (t.discount ? '<div><span>Discount</span><span>−' + m(t.discount) + '</span></div>' : '') +
      (editing.gst ? '<div><span>GST</span><span>' + m(t.gst) + '</span></div>' : '') + '<div class="grand"><span>Total</span><span>' + m(t.total) + '</span></div>';
  }
  function saveDoc(andPrint) {
    var d = editing;
    if (!d.number.trim()) return B.toast('Give it a number');
    if (data.docs.some(function (x) { return x.id !== d.id && x.kind === d.kind && x.number === d.number; })) return B.toast('That number is already used');
    d.lines = d.lines.filter(function (l) { return l.desc.trim() || l.price; });
    if (!d.lines.length) { d.lines.push({ desc: '', qty: 1, price: 0 }); return B.toast('Add at least one item'); }
    if (d.kind === 'invoice' && d.status === 'paid' && L.balance(d) > 0) d.payments = (d.payments || []).concat([{ date: today(), amount: L.balance(d) }]);
    var i = data.docs.findIndex(function (x) { return x.id === d.id; });
    if (i >= 0) data.docs[i] = d; else data.docs.push(d);
    save(); editing = null; renderEditor(); renderAll(); B.toast('Saved ' + d.number);
    if (andPrint) printDoc(d);
  }
  function printDoc(d) {
    var html = L.docHtml(d, cust(d.customerId), data.settings, today());
    var f = B.h('iframe', { title: 'Print preview', style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0' });
    f.addEventListener('load', function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { B.toast('Printing was blocked. Use Download instead.'); } setTimeout(function () { f.remove(); }, 60000); });
    f.srcdoc = html; document.body.appendChild(f);
  }
  function docActions(d) {
    var s = L.status(d, today()), opts = [['', 'Actions…'], ['edit', 'Edit'], ['print', 'Print / save PDF'], ['download', 'Download HTML']];
    if (d.kind === 'quote') {
      if (s === 'draft') opts.push(['sent', 'Mark as sent']);
      if (s !== 'accepted' && s !== 'invoiced') opts.push(['accepted', 'Mark as accepted']);
      if (s !== 'declined' && s !== 'invoiced') opts.push(['declined', 'Mark as declined']);
      if (s !== 'invoiced') opts.push(['convert', 'Turn into invoice']);
    } else {
      if (s === 'draft') opts.push(['sent', 'Mark as sent']);
      if (s === 'sent' || s === 'overdue') { opts.push(['pay', 'Record a payment']); opts.push(['paid', 'Mark as fully paid']); }
      if (s === 'overdue' || s === 'sent') opts.push(['remind', 'Write a reminder']);
    }
    opts.push(['copy', 'Duplicate'], ['delete', 'Delete']);
    return '<select data-act="' + esc(d.id) + '" aria-label="Actions for ' + esc(d.number) + '">' + opts.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') + '</select>';
  }
  function runAction(id, act) {
    var d = data.docs.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    if (act === 'edit') startDoc(d.kind, d);
    else if (act === 'print') printDoc(d);
    else if (act === 'download') B.download(d.number + '.html', L.docHtml(d, cust(d.customerId), data.settings, today()), 'text/html;charset=utf-8');
    else if (act === 'sent' || act === 'accepted' || act === 'declined') { d.status = act; save(); renderAll(); }
    else if (act === 'paid') { var bal = L.balance(d); if (bal > 0) (d.payments = d.payments || []).push({ date: today(), amount: bal }); d.status = 'paid'; save(); renderAll(); B.toast(d.number + ' marked as paid'); }
    else if (act === 'pay') openPayment(d);
    else if (act === 'remind') { showTab('reminders'); var el = $('[data-rem="' + d.id + '"]'); if (el) { el.click(); el.scrollIntoView({ block: 'center' }); } }
    else if (act === 'convert') {
      var inv = L.quoteToInvoice(d, data.docs, data.settings, today(), B.uid());
      d.status = 'invoiced'; data.docs.push(inv); save(); renderAll(); startDoc('invoice', inv); B.toast('Invoice ' + inv.number + ' created from ' + d.number);
    } else if (act === 'copy') {
      var c = JSON.parse(JSON.stringify(d)); c.id = B.uid(); c.number = L.nextNumber(data.docs, d.kind, d.kind === 'quote' ? data.settings.quotePrefix : data.settings.invoicePrefix);
      c.status = 'draft'; c.payments = []; c.date = today(); c.due = L.addDays(today(), d.kind === 'quote' ? +data.settings.quoteDays || 30 : +data.settings.termsDays || 14); delete c.fromQuote; delete c.reminders;
      startDoc(d.kind, c);
    } else if (act === 'delete') { if (confirm('Delete ' + d.number + '? This cannot be undone.')) { data.docs = data.docs.filter(function (x) { return x !== d; }); save(); renderAll(); } }
  }
  function renderDocs() {
    var t = today(), f = $('#docFilter').value, q = $('#docSearch').value.trim().toLowerCase();
    var list = data.docs.filter(function (d) {
      var s = L.status(d, t);
      if (f === 'invoice' || f === 'quote') { if (d.kind !== f) return false; }
      else if (f === 'unpaid') { if (d.kind !== 'invoice' || (s !== 'sent' && s !== 'overdue')) return false; }
      else if (f === 'overdue') { if (s !== 'overdue') return false; }
      else if (f === 'draft') { if (s !== 'draft') return false; }
      return !q || (d.number + ' ' + custName(d.customerId)).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || b.number.localeCompare(a.number); });
    if (!list.length) { $('#docList').innerHTML = '<p class="muted">' + (data.docs.length ? 'Nothing matches.' : 'No quotes or invoices yet.') + '</p>'; return; }
    $('#docList').innerHTML = '<div class="table-wrap"><table><thead><tr><th>Number</th><th>Customer</th><th>Date</th><th>Due / valid</th><th class="num">Total</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead><tbody>' +
      list.map(function (d) {
        var tt = L.totals(d);
        return '<tr><td><b>' + esc(d.number) + '</b><br><span class="small muted">' + (d.kind === 'quote' ? 'Quote' : 'Invoice') + '</span></td><td>' + esc(custName(d.customerId)) + '</td><td>' + esc(d.date) + '</td><td>' + esc(d.due || '') + '</td>' +
          '<td class="num">' + m(tt.total) + '</td><td class="num">' + (d.kind === 'invoice' ? m(L.balance(d)) : '') + '</td><td>' + pill(L.status(d, t)) + '</td><td class="actions">' + docActions(d) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="row"><button class="btn small" type="button" id="docCsv">Download list (CSV)</button></p>';
    $('#docCsv').addEventListener('click', function () { csv('quotes-and-invoices.csv', L.docsCsvRows(data.docs, data.customers, today())); });
  }
  var payingDoc = null;
  function openPayment(d) {
    payingDoc = d; $('#payInfo').textContent = d.number + ' · ' + custName(d.customerId) + ' · balance ' + m(L.balance(d));
    $('#payAmount').value = L.balance(d); $('#payDate').value = today();
    var dlg = $('#payDialog'); if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  $('#payDialog').addEventListener('close', function () {
    if ($('#payDialog').returnValue !== 'ok' || !payingDoc) return;
    var amt = +$('#payAmount').value; if (!(amt > 0)) return;
    (payingDoc.payments = payingDoc.payments || []).push({ date: $('#payDate').value || today(), amount: L.r2(amt) });
    if (L.balance(payingDoc) <= 0) payingDoc.status = 'paid'; else if (payingDoc.status === 'draft') payingDoc.status = 'sent';
    save(); renderAll(); B.toast('Payment recorded'); payingDoc = null;
  });

  // ---------- customers ----------
  var editingCust = null;
  var CF = ['name', 'contact', 'email', 'phone', 'address', 'notes'];
  function fillCustForm(c) {
    editingCust = c || null;
    CF.forEach(function (k) { $('#c-' + k).value = c ? c[k] || '' : ''; });
    $('#custTitle').textContent = c ? 'Edit ' + c.name : 'Add a customer'; $('#custCancel').hidden = !c;
  }
  $('#custForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = editingCust || { id: B.uid() }; CF.forEach(function (k) { c[k] = $('#c-' + k).value.trim(); });
    if (!editingCust) data.customers.push(c);
    save(); fillCustForm(null); renderAll(); B.toast('Customer saved');
  });
  $('#custCancel').addEventListener('click', function () { fillCustForm(null); });
  function renderCustomers() {
    if (!data.customers.length) { $('#custList').innerHTML = '<p class="muted">No customers yet.</p>'; return; }
    var t = today();
    var rows = data.customers.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (c) {
      var invs = data.docs.filter(function (d) { return d.kind === 'invoice' && d.customerId === c.id && d.status !== 'draft'; });
      return { id: c.id, name: c.name, contact: c.contact, email: c.email, phone: c.phone, invoiced: invs.reduce(function (s, d) { return s + L.totals(d).total; }, 0), owed: invs.reduce(function (s, d) { var st = L.status(d, t); return s + (st === 'sent' || st === 'overdue' ? L.balance(d) : 0); }, 0) };
    });
    $('#custList').innerHTML = B.table(rows, [{ key: 'name', label: 'Name', fmt: function (v, r) { return '<b>' + esc(v) + '</b>' + (r.contact ? '<br><span class="small muted">' + esc(r.contact) + '</span>' : ''); } },
      { key: 'email', label: 'Email', fmt: function (v) { return v ? '<a href="mailto:' + esc(v) + '">' + esc(v) + '</a>' : ''; } }, { key: 'phone', label: 'Phone' },
      { key: 'invoiced', label: 'Invoiced', fmt: m1 }, { key: 'owed', label: 'Owed', fmt: function (v) { return v > 0 ? '<span class="warn">' + m(v) + '</span>' : m(0); } },
      { key: 'id', label: '', fmt: function (id) { return '<span class="row" style="flex-wrap:nowrap"><button class="btn small" type="button" data-cedit="' + esc(id) + '">Edit</button><button class="btn small" type="button" data-cinv="' + esc(id) + '">Invoice</button><button class="btn small" type="button" data-cdel="' + esc(id) + '">Delete</button></span>'; } }]);
  }

  // ---------- reminders ----------
  function renderReminders() {
    var t = today(), list = L.reminders(data.docs, data.customers, t, +$('#soonDays').value || 0), box = $('#remList');
    if (!list.length) { box.innerHTML = '<p class="ok" style="margin-top:14px">Nothing to chase. No unpaid invoices are overdue or due soon.</p>'; return; }
    box.innerHTML = '';
    list.forEach(function (r) {
      var d = r.doc, c = r.customer, sent = (d.reminders || []);
      var card = B.h('div', { class: 'panel reminder-card' });
      card.innerHTML = '<h3>' + esc(c.name) + ' · ' + esc(d.number) + ' · ' + m(r.balance) + '</h3><p class="small muted" style="margin:0">' +
        (r.daysOverdue > 0 ? '<span class="pill-bad">' + r.daysOverdue + ' days overdue</span>' : '<span class="pill-warn">' + (r.daysOverdue === 0 ? 'Due today' : 'Due in ' + -r.daysOverdue + ' days') + '</span>') +
        ' Suggested: <b>' + esc(L.LEVEL_NAME[r.level]) + '</b>' + (sent.length ? ' · Reminders sent: ' + sent.map(function (s) { return esc(s.date + ' (' + L.LEVEL_NAME[s.level] + ')'); }).join(', ') : '') + '</p>';
      var btn = B.h('button', { class: 'btn small', type: 'button', 'data-rem': d.id, text: 'Write reminder', style: 'margin-top:8px' });
      var area = B.h('div');
      btn.addEventListener('click', function () { btn.hidden = true; buildReminder(area, r); });
      card.append(btn, area); box.appendChild(card);
    });
  }
  function buildReminder(area, r) {
    var lv = B.h('select', { 'aria-label': 'Reminder level', style: 'width:auto', html: L.LEVEL_NAME.map(function (n, i) { return '<option value="' + i + '"' + (i === r.level ? ' selected' : '') + '>' + n + '</option>'; }).join('') });
    var subj = B.h('input', { type: 'text', 'aria-label': 'Subject' });
    var body = B.h('textarea', { class: 'prose', 'aria-label': 'Email text', style: 'min-height:220px' });
    var mail = B.h('a', { class: 'btn primary', text: 'Open in my email app' });
    var fill = function () { var e = L.reminderEmail(r.doc, r.customer, data.settings, +lv.value, today()); subj.value = e.subject; body.value = e.body; link(); };
    var link = function () { mail.href = L.mailto(r.customer.email, subj.value, body.value); };
    lv.addEventListener('change', fill); subj.addEventListener('input', link); body.addEventListener('input', link);
    var copy = B.h('button', { class: 'btn', type: 'button', text: 'Copy text', onclick: function () { B.copy('Subject: ' + subj.value + '\n\n' + body.value); } });
    var mark = B.h('button', { class: 'btn', type: 'button', text: 'Mark reminder as sent', onclick: function () {
      (r.doc.reminders = r.doc.reminders || []).push({ date: today(), level: +lv.value }); save(); renderAll(); B.toast('Reminder logged');
    } });
    area.append(B.h('label', { text: 'Tone' }), lv, B.h('label', { text: 'Subject' }), subj, B.h('label', { text: 'Message' }), body);
    var actions = B.h('div', { class: 'row', style: 'margin-top:10px' }, [mail, copy, mark]);
    area.appendChild(actions);
    if (!r.customer.email) area.appendChild(B.h('p', { class: 'small warn', text: 'This customer has no email address saved, so the email app will open with a blank "To".' }));
    B.ai.button(actions, 'Make it sound more personal', function () {
      return 'Rewrite this payment reminder email so it sounds warm, personal and professional for an Australian small business. Keep every fact (invoice number, amounts, dates, bank details) exactly the same, keep the same firmness, use Australian spelling, and return only the email body.\n\n' + body.value;
    }, function (ans) { body.value = ans.trim(); link(); B.toast('AI rewrite added — please read it before sending'); });
    fill();
  }

  // ---------- expenses ----------
  var editingExp = null;
  function fillExpForm(e) {
    editingExp = e || null;
    $('#x-date').value = e ? e.date : today(); $('#x-supplier').value = e ? e.supplier : ''; $('#x-category').value = e ? e.category : 'Other';
    $('#x-amount').value = e ? e.amount : ''; $('#x-gst').value = e ? e.gst : ''; $('#x-note').value = e ? e.note || '' : '';
    $('#x-hasgst').checked = e ? +e.gst > 0 : data.settings.gstRegistered !== false;
    $('#expTitle').textContent = e ? 'Edit expense' : 'Add an expense'; $('#expCancel').hidden = !e;
  }
  function autoGst() { var a = +$('#x-amount').value || 0; $('#x-gst').value = $('#x-hasgst').checked ? L.gstFromInclusive(a) : 0; }
  $('#x-amount').addEventListener('input', autoGst); $('#x-hasgst').addEventListener('change', autoGst);
  $('#expForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var e = editingExp || { id: B.uid() };
    e.date = $('#x-date').value; e.supplier = $('#x-supplier').value.trim(); e.category = $('#x-category').value; e.amount = L.r2(+$('#x-amount').value);
    e.gst = L.r2(+$('#x-gst').value || 0); e.note = $('#x-note').value.trim();
    if (e.gst > e.amount) return B.toast('GST cannot be more than the amount');
    if (!editingExp) data.expenses.push(e);
    save(); fillExpForm(null); renderAll(); B.toast('Expense saved');
  });
  $('#expCancel').addEventListener('click', function () { fillExpForm(null); });
  function renderExpenses() {
    var list = data.expenses.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    if (!list.length) { $('#expList').innerHTML = '<p class="muted">No expenses yet.</p>'; return; }
    var tot = list.reduce(function (s, e) { return s + e.amount; }, 0), gst = list.reduce(function (s, e) { return s + (+e.gst || 0); }, 0);
    $('#expList').innerHTML = '<div class="stat-row">' + stat(m(tot), 'Total spent (' + list.length + ')') + stat(m(gst), 'GST paid (credits)') + '</div><div style="margin-top:10px">' +
      B.table(list, [{ key: 'date', label: 'Date' }, { key: 'supplier', label: 'Supplier' }, { key: 'category', label: 'Category' }, { key: 'amount', label: 'Amount', fmt: m1 }, { key: 'gst', label: 'GST', fmt: m1 },
        { key: 'note', label: 'Receipt note' }, { key: 'id', label: '', fmt: function (id) { return '<span class="row" style="flex-wrap:nowrap"><button class="btn small" type="button" data-xedit="' + esc(id) + '">Edit</button><button class="btn small" type="button" data-xdel="' + esc(id) + '">Delete</button></span>'; } }], { limit: 1000 }) + '</div>';
  }

  // ---------- reports ----------
  var gstBasis = B.store.get('bizadmin:basis', 'accrual');
  function renderReports() {
    var t = today(), months = L.monthly(data.docs, data.expenses, t, 12);
    var max = Math.max.apply(null, months.map(function (x) { return Math.max(x.income, x.expenses); }).concat([1]));
    var html = '<h2>Income vs expenses (last 12 months, ex GST)</h2><div class="legend"><span><i style="background:var(--ok)"></i>Invoiced</span><span><i style="background:var(--warn)"></i>Expenses</span></div><div class="panel"><div class="dual">' +
      months.map(function (x) {
        return '<span>' + esc(x.month) + '</span><div class="bars2" title="Invoiced ' + esc(m(x.income)) + ', expenses ' + esc(m(x.expenses)) + '"><div class="inc" style="width:' + (x.income / max * 100).toFixed(1) + '%"></div><div class="exp" style="width:' + (x.expenses / max * 100).toFixed(1) + '%"></div></div>';
      }).join('') + '</div></div>' +
      B.table(months.slice().reverse(), [{ key: 'month', label: 'Month' }, { key: 'income', label: 'Invoiced', fmt: m1 }, { key: 'expenses', label: 'Expenses', fmt: m1 }, { key: 'profit', label: 'Difference', fmt: function (v) { return '<span class="' + (v < 0 ? 'bad' : 'ok') + '">' + m(v) + '</span>'; } }]);
    var q = L.gstSummary(data.docs, data.expenses, gstBasis);
    html += '<h2>GST collected vs paid (BAS helper)</h2><p class="small muted">An estimate to help you prepare your BAS, not tax advice. It assumes every invoice with GST ticked and every expense GST figure is correct. Check with your BAS agent or accountant before lodging.</p>' +
      '<div class="row"><label class="check" style="margin:0"><input type="radio" name="basis" value="accrual"' + (gstBasis === 'accrual' ? ' checked' : '') + '> Accrual (by invoice date)</label><label class="check" style="margin:0"><input type="radio" name="basis" value="cash"' + (gstBasis === 'cash' ? ' checked' : '') + '> Cash (by payment date)</label></div>' +
      (q.length ? B.table(q, [{ key: 'label', label: 'Quarter' }, { key: 'sales', label: 'Sales incl. GST (G1)', fmt: m1 }, { key: 'collected', label: 'GST on sales (1A)', fmt: m1 }, { key: 'purchases', label: 'Purchases', fmt: m1 }, { key: 'paid', label: 'GST on purchases (1B)', fmt: m1 }, { key: 'net', label: 'Estimated GST to pay', fmt: function (v) { return '<b class="' + (v < 0 ? 'ok' : '') + '">' + m(v) + (v < 0 ? ' refund' : '') + '</b>'; } }]) : '<p class="muted">No invoices or expenses yet.</p>');
    var top = L.topCustomers(data.docs, data.customers, 10);
    html += '<h2>Top customers</h2>' + (top.length ? B.barChart(top.map(function (c) { return { label: c.name, value: c.invoiced }; }), { fmt: m1 }) +
      B.table(top, [{ key: 'name', label: 'Customer' }, { key: 'count', label: 'Invoices' }, { key: 'invoiced', label: 'Invoiced', fmt: m1 }, { key: 'paid', label: 'Paid', fmt: m1 }, { key: 'outstanding', label: 'Owed', fmt: m1 }]) : '<p class="muted">No invoices yet.</p>');
    var a = L.aged(data.docs, data.customers, t);
    html += '<h2>Aged receivables</h2><p class="small muted">Unpaid balances grouped by how many days past the due date they are.</p>' + (a.rows.length ? '<div class="table-wrap"><table><thead><tr><th>Customer</th>' + L.AGE_BUCKETS.map(function (b) { return '<th class="num">' + esc(b) + '</th>'; }).join('') + '<th class="num">Total</th></tr></thead><tbody>' +
      a.rows.map(function (r) { return '<tr><td>' + esc(r.name) + '</td>' + r.buckets.map(function (v, i) { return '<td class="num' + (v && i >= 3 ? ' bad' : '') + '">' + (v ? m(v) : '–') + '</td>'; }).join('') + '<td class="num"><b>' + m(r.total) + '</b></td></tr>'; }).join('') +
      '<tr><td><b>Total</b></td>' + a.totals.map(function (v) { return '<td class="num"><b>' + m(v) + '</b></td>'; }).join('') + '<td class="num"><b>' + m(a.total) + '</b></td></tr></tbody></table></div>' : '<p class="ok">Nobody owes you money.</p>');
    html += '<h2>Exports</h2><div class="row"><button class="btn small" type="button" data-csv="docs">Quotes &amp; invoices (CSV)</button><button class="btn small" type="button" data-csv="exp">Expenses (CSV)</button><button class="btn small" type="button" data-csv="gst">GST by quarter (CSV)</button><button class="btn small" type="button" data-csv="aged">Aged receivables (CSV)</button></div>';
    $('#reports').innerHTML = html;
    B.$$('input[name=basis]').forEach(function (r) { r.addEventListener('change', function () { gstBasis = r.value; B.store.set('bizadmin:basis', gstBasis); renderReports(); }); });
  }

  // ---------- settings & backup ----------
  var SF = ['name', 'contactName', 'abn', 'email', 'phone', 'address', 'payDetails', 'quoteTerms', 'termsDays', 'quoteDays', 'invoicePrefix', 'quotePrefix'];
  function fillSettings() {
    SF.forEach(function (k) { $('#s-' + k).value = data.settings[k] == null ? '' : data.settings[k]; });
    $('#s-gstRegistered').checked = data.settings.gstRegistered !== false;
    $('#logoPrev').innerHTML = data.settings.logo ? '<img class="logo-prev" src="' + esc(data.settings.logo) + '" alt="Your logo"><button class="btn small" type="button" id="logoRemove">Remove logo</button>' : '';
  }
  $('#setForm').addEventListener('submit', function (e) {
    e.preventDefault();
    SF.forEach(function (k) { var v = $('#s-' + k).value; data.settings[k] = /Days$/.test(k) ? (+v || 0) : v.trim(); });
    data.settings.gstRegistered = $('#s-gstRegistered').checked;
    save(); renderAll(); B.toast('Settings saved');
  });
  $('#logoFile').addEventListener('change', function () {
    var f = this.files[0]; this.value = ''; if (!f) return;
    B.readFile(f, 'dataurl').then(function (url) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 400 / img.width, 160 / img.height), c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        data.settings.logo = c.toDataURL(/png|svg|gif/.test(f.type) ? 'image/png' : 'image/jpeg', 0.9); save(); fillSettings(); B.toast('Logo saved');
      };
      img.onerror = function () { B.toast('That image could not be read'); };
      img.src = url;
    });
  });
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t.closest) return;
    if (t.id === 'logoRemove') { data.settings.logo = ''; save(); fillSettings(); }
    var g = t.closest('[data-go]'); if (g) showTab(g.dataset.go);
    var ce = t.closest('[data-cedit]'); if (ce) { fillCustForm(cust(ce.dataset.cedit)); $('#custForm').scrollIntoView({ block: 'center' }); }
    var ci = t.closest('[data-cinv]'); if (ci) { startDoc('invoice'); editing.customerId = ci.dataset.cinv; renderEditor(); }
    var cd = t.closest('[data-cdel]');
    if (cd) {
      var c = cust(cd.dataset.cdel), used = data.docs.filter(function (d) { return d.customerId === c.id; }).length;
      if (confirm('Delete ' + c.name + '?' + (used ? ' Their ' + used + ' document(s) will stay but show no customer name.' : ''))) { data.customers = data.customers.filter(function (x) { return x !== c; }); save(); renderAll(); }
    }
    var xe = t.closest('[data-xedit]'); if (xe) { fillExpForm(data.expenses.filter(function (x) { return x.id === xe.dataset.xedit; })[0]); $('#expForm').scrollIntoView({ block: 'center' }); }
    var xd = t.closest('[data-xdel]'); if (xd && confirm('Delete this expense?')) { data.expenses = data.expenses.filter(function (x) { return x.id !== xd.dataset.xdel; }); save(); renderAll(); }
    var cv = t.closest('[data-csv]');
    if (cv) {
      var k = cv.dataset.csv;
      if (k === 'docs') csv('quotes-and-invoices.csv', L.docsCsvRows(data.docs, data.customers, today()));
      if (k === 'exp') csv('expenses.csv', L.expensesCsvRows(data.expenses));
      if (k === 'gst') csv('gst-by-quarter-estimate.csv', L.gstSummary(data.docs, data.expenses, gstBasis).map(function (q) { return { Quarter: q.label, 'Sales incl GST': q.sales, 'GST on sales': q.collected, Purchases: q.purchases, 'GST on purchases': q.paid, 'Estimated GST to pay': q.net, Basis: gstBasis }; }));
      if (k === 'aged') csv('aged-receivables.csv', L.aged(data.docs, data.customers, today()).rows.map(function (r) { var o = { Customer: r.name }; L.AGE_BUCKETS.forEach(function (b, i) { o[b] = r.buckets[i]; }); o.Total = r.total; return o; }));
    }
  });
  document.addEventListener('change', function (e) {
    var s = e.target.closest && e.target.closest('[data-act]'); if (!s || !s.value) return;
    var act = s.value; s.value = ''; runAction(s.dataset.act, act);
  });
  $('#backup').addEventListener('click', function () {
    B.download('business-admin-backup-' + today() + '.json', JSON.stringify(Object.assign({ app: 'business-admin', version: 1, exported: new Date().toISOString() }, data), null, 2), 'application/json');
  });
  var restoreInput = B.h('input', { type: 'file', accept: '.json,application/json', hidden: true }); document.body.appendChild(restoreInput);
  $('#restore').addEventListener('click', function () { restoreInput.click(); });
  restoreInput.addEventListener('change', function () {
    var f = restoreInput.files[0]; restoreInput.value = ''; if (!f) return;
    B.readFile(f).then(function (txt) {
      var d = L.validateBackup(JSON.parse(txt));
      if (!confirm('Replace everything here with this backup (' + d.customers.length + ' customers, ' + d.docs.length + ' documents, ' + d.expenses.length + ' expenses)?')) return;
      data = { settings: Object.assign({}, DEFAULT_SETTINGS, d.settings), customers: d.customers, docs: d.docs, expenses: d.expenses }; save(); renderAll(); B.toast('Backup restored');
    }).catch(function (e) { B.toast('Could not restore: ' + e.message, 4000); });
  });
  $('#custCsv').addEventListener('click', function () { csv('customers.csv', data.customers.map(function (c) { return { Name: c.name, Contact: c.contact || '', Email: c.email || '', Phone: c.phone || '', Address: c.address || '', Notes: c.notes || '' }; })); });
  $('#wipe').addEventListener('click', function () {
    if (!confirm('Delete ALL customers, quotes, invoices, expenses and settings from this browser? Download a backup first if unsure.')) return;
    data = { settings: Object.assign({}, DEFAULT_SETTINGS), customers: [], docs: [], expenses: [] }; save(); editing = null; renderAll(); B.toast('All data deleted');
  });
  $('#sample').addEventListener('click', function () {
    if ((data.docs.length || data.customers.length) && !confirm('Replace your current data with sample data? Download a backup first if you want to keep it.')) return;
    data = L.sample(today()); data.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings); save(); editing = null; renderAll(); showTab('overview'); B.toast('Sample business loaded');
  });

  // ---------- wiring ----------
  function renderAll() { renderOverview(); renderEditor(); renderDocs(); renderCustomers(); renderReminders(); renderExpenses(); renderReports(); fillSettings(); }
  $('#x-category').innerHTML = L.CATEGORIES.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
  showTab = B.tabs($('.tabs'));
  ['#newInvoice', '#newInvoiceTop'].forEach(function (s) { $(s).addEventListener('click', function () { startDoc('invoice'); }); });
  ['#newQuote', '#newQuoteTop'].forEach(function (s) { $(s).addEventListener('click', function () { startDoc('quote'); }); });
  $('#docFilter').addEventListener('change', renderDocs); $('#docSearch').addEventListener('input', renderDocs);
  $('#soonDays').addEventListener('input', renderReminders);
  $('#expCsv').addEventListener('click', function () { csv('expenses.csv', L.expensesCsvRows(data.expenses)); });
  fillExpForm(null); renderAll();
})();
