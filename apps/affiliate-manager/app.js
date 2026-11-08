/* Affiliate Content Manager — page wiring. Logic lives in lib.js (AffiliateLib). */
(function () {
  'use strict';
  var L = window.AffiliateLib, $ = B.$, $$ = B.$$, esc = B.esc, m = function (v) { return B.fmt.money(v); };
  var KEY = 'affiliate:data';
  var data = load(), editing = {}, showTab;

  function load() { var d = B.store.get(KEY, null) || {}; return { programs: d.programs || [], links: d.links || [], content: d.content || [], stats: d.stats || [], settings: Object.assign({ recheckDays: 90 }, d.settings || {}) }; }
  function save() { if (!B.store.set(KEY, data)) B.toast('Could not save — browser storage may be full. Download a backup.', 4000); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function stat(v, k, cls) { return '<div class="stat"><div class="v ' + (cls || '') + '">' + esc(v) + '</div><div class="k">' + esc(k) + '</div></div>'; }
  function byId(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }
  function linkName(l) { return l ? (l.shortName || l.product || 'link') : '(deleted)'; }
  function csvDownload(name, rows) { if (!rows.length) return B.toast('Nothing to export'); B.download(name, '﻿' + B.csv.stringify(rows, Object.keys(rows[0])), 'text/csv;charset=utf-8'); }
  function pct(v) { return B.fmt.pct(v); }
  function epc(v) { return isNaN(v) ? '–' : '$' + v.toFixed(2); }

  // ---------- generic list + form ----------
  // cfg: {key, el, title, fields:[{k,label,type,opts,full,help}], cols:[...B.table cols], extraButtons(row)}
  function crud(cfg) {
    function form(rec) {
      var isNew = !byId(data[cfg.key], rec.id);
      return '<div class="panel"><h2 style="margin-top:0">' + (isNew ? 'Add ' : 'Edit ') + esc(cfg.title) + '</h2><form class="form-grid" data-form="' + cfg.key + '">' + cfg.fields.map(function (f) {
        var id = cfg.key + '-' + f.k, v = rec[f.k] == null ? '' : rec[f.k], cls = f.full ? 'full' : '';
        var lab = '<label for="' + id + '">' + esc(f.label) + '</label>';
        var input;
        if (f.type === 'select') input = '<select id="' + id + '" name="' + f.k + '">' + f.opts().map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
        else if (f.type === 'textarea') input = '<textarea class="prose" style="min-height:60px" id="' + id + '" name="' + f.k + '">' + esc(v) + '</textarea>';
        else if (f.type === 'checkbox') return '<div class="' + cls + '"><label class="check" style="margin-top:30px"><input type="checkbox" id="' + id + '" name="' + f.k + '"' + (v ? ' checked' : '') + '> ' + esc(f.label) + '</label></div>';
        else if (f.type === 'multi') { var sel = v || []; input = '<div class="multi" id="' + id + '">' + (f.opts().length ? f.opts().map(function (o) { return '<label class="check"><input type="checkbox" name="' + f.k + '" value="' + esc(o[0]) + '"' + (sel.indexOf(o[0]) >= 0 ? ' checked' : '') + '> ' + esc(o[1]) + '</label>'; }).join('') : '<span class="muted small">Add some links first.</span>') + '</div>'; lab = '<label>' + esc(f.label) + '</label>'; }
        else input = '<input type="' + (f.type || 'text') + '" id="' + id + '" name="' + f.k + '" value="' + esc(v) + '"' + (f.type === 'number' ? ' step="any" min="0"' : '') + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') + '>';
        return '<div class="' + cls + '">' + lab + input + (f.help ? '<div class="small muted">' + f.help + '</div>' : '') + '</div>';
      }).join('') + (cfg.formExtra ? '<div class="full">' + cfg.formExtra(rec) + '</div>' : '') +
        '<div class="full row" style="margin-top:12px"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" data-cancel>Cancel</button></div></form></div>';
    }
    function render() {
      var rec = editing[cfg.key], rows = data[cfg.key];
      var html = (rec ? form(rec) : '<div class="row" style="margin-top:14px"><button class="btn primary" type="button" data-add>+ Add ' + esc(cfg.title) + '</button>' + (cfg.topExtra ? cfg.topExtra() : '') + '</div>');
      html += rows.length ? '<div style="margin-top:12px">' + B.table(cfg.sort ? rows.slice().sort(cfg.sort) : rows, cfg.cols.concat([{ key: 'id', label: '', fmt: function (id, r) { return '<span class="actions">' + (cfg.rowExtra ? cfg.rowExtra(r) : '') + '<button class="btn small" type="button" data-edit="' + esc(id) + '">Edit</button> <button class="btn small" type="button" data-del="' + esc(id) + '">Delete</button></span>'; } }])) + '</div>'
        : '<p class="muted">None yet. ' + (cfg.empty || '') + '</p>';
      $(cfg.el).innerHTML = html;
    }
    $(cfg.el).addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-add]')) { editing[cfg.key] = Object.assign({ id: B.uid() }, cfg.defaults ? cfg.defaults() : {}); render(); var f = $(cfg.el + ' input, ' + cfg.el + ' select'); if (f) f.focus(); }
      else if (t.closest('[data-cancel]')) { editing[cfg.key] = null; render(); }
      else if (t.closest('[data-edit]')) { editing[cfg.key] = JSON.parse(JSON.stringify(byId(data[cfg.key], t.closest('[data-edit]').dataset.edit))); render(); $(cfg.el).scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      else if (t.closest('[data-del]')) {
        var id = t.closest('[data-del]').dataset.del, r = byId(data[cfg.key], id);
        if (!confirm('Delete “' + (r.name || r.shortName || r.product || r.title || 'this') + '”?' + (cfg.delWarn ? ' ' + cfg.delWarn(r) : ''))) return;
        data[cfg.key] = data[cfg.key].filter(function (x) { return x.id !== id; }); if (cfg.onDelete) cfg.onDelete(id); save(); renderAll();
      } else if (cfg.onClick) cfg.onClick(e, editing[cfg.key], render);
    });
    $(cfg.el).addEventListener('submit', function (e) {
      e.preventDefault(); var rec = editing[cfg.key], fd = e.target;
      cfg.fields.forEach(function (f) {
        if (f.type === 'multi') rec[f.k] = $$('input[name="' + f.k + '"]:checked', fd).map(function (x) { return x.value; });
        else if (f.type === 'checkbox') rec[f.k] = fd.elements[f.k].checked;
        else if (f.type === 'number') rec[f.k] = fd.elements[f.k].value === '' ? '' : +fd.elements[f.k].value;
        else rec[f.k] = fd.elements[f.k].value.trim();
      });
      if (cfg.validate) { var err = cfg.validate(rec); if (err) return B.toast(err, 3500); }
      var i = data[cfg.key].map(function (x) { return x.id; }).indexOf(rec.id);
      if (i >= 0) data[cfg.key][i] = rec; else data[cfg.key].push(rec);
      editing[cfg.key] = null; save(); renderAll(); B.toast('Saved');
    });
    return render;
  }

  var progOpts = function () { return [['', '— choose —']].concat(data.programs.map(function (p) { return [p.id, p.name]; })); };
  var linkOpts = function () { return data.links.map(function (l) { return [l.id, linkName(l) + (l.product && l.shortName ? ' — ' + l.product : '')]; }); };

  var renderPrograms = crud({ key: 'programs', el: '#programs', title: 'program', empty: 'Add the affiliate programs you’ve joined.',
    fields: [{ k: 'name', label: 'Program name' }, { k: 'network', label: 'Network (Impact, CJ, Amazon…)' }, { k: 'commissionPct', label: 'Commission %', type: 'number' }, { k: 'commissionFlat', label: 'Or flat amount per sale ($)', type: 'number' },
      { k: 'cookieDays', label: 'Cookie length (days)', type: 'number' }, { k: 'payoutThreshold', label: 'Minimum payout ($)', type: 'number' }, { k: 'currency', label: 'Paid in (currency)', ph: 'AUD' }, { k: 'notes', label: 'Notes', type: 'textarea', full: true }],
    validate: function (r) { return r.name ? '' : 'Give the program a name'; },
    delWarn: function (r) { var n = data.links.filter(function (l) { return l.programId === r.id; }).length; return n ? n + ' link(s) use it and will lose their program.' : ''; },
    cols: [{ key: 'name', label: 'Program' }, { key: 'network', label: 'Network' }, { key: 'commissionPct', label: 'Commission', fmt: function (v, r) { return esc(v ? v + '%' : r.commissionFlat ? '$' + r.commissionFlat + ' flat' : '–'); } },
      { key: 'cookieDays', label: 'Cookie', fmt: function (v) { return v ? esc(v + ' days') : '–'; } }, { key: 'payoutThreshold', label: 'Min payout', fmt: function (v) { return v ? m(v) : '–'; } }] });

  var renderLinks = crud({ key: 'links', el: '#links', title: 'link', empty: 'Add each affiliate link you use.',
    defaults: function () { return { status: 'unknown', utmSource: '', utmMedium: 'affiliate', utmCampaign: '' }; },
    fields: [{ k: 'product', label: 'Product' }, { k: 'shortName', label: 'Short name (unique, e.g. rode-mic)' }, { k: 'programId', label: 'Program', type: 'select', opts: progOpts },
      { k: 'status', label: 'Status', type: 'select', opts: function () { return [['unknown', 'Not checked'], ['ok', 'Works'], ['broken', 'Broken']]; } }, { k: 'lastChecked', label: 'Last checked', type: 'date' },
      { k: 'originalUrl', label: 'Normal product address', type: 'url', full: true, ph: 'https://shop.com/product' }, { k: 'affiliateUrl', label: 'Your affiliate link', type: 'url', full: true, ph: 'https://…?tag=you-22' },
      { k: 'utmSource', label: 'UTM source', ph: 'blog' }, { k: 'utmMedium', label: 'UTM medium', ph: 'affiliate' }, { k: 'utmCampaign', label: 'UTM campaign', ph: 'gear-guide' }, { k: 'utmContent', label: 'UTM content', ph: 'top-button' },
      { k: 'notes', label: 'Notes', type: 'textarea', full: true }],
    formExtra: function () { return '<div class="row"><button class="btn small" type="button" data-utm>Add UTM tags to my affiliate link</button><span class="small muted">Only if the program allows extra tags — some (like Amazon) ignore or forbid them. UTM tags let your own analytics see which page sent the click.</span></div>'; },
    onClick: function (e, rec) {
      if (e.target.closest('[data-utm]')) {
        var f = $('[data-form="links"]'), u = f.elements.affiliateUrl.value || f.elements.originalUrl.value;
        if (!/^https?:\/\//.test(u)) return B.toast('Enter a link starting with https:// first');
        f.elements.affiliateUrl.value = L.buildUtm(u, { source: f.elements.utmSource.value, medium: f.elements.utmMedium.value, campaign: f.elements.utmCampaign.value, content: f.elements.utmContent.value });
      }
      var c = e.target.closest('[data-copylink]'); if (c) { var l = byId(data.links, c.dataset.copylink); B.copy(l.affiliateUrl || l.originalUrl || ''); }
      var k = e.target.closest('[data-checked]'); if (k) { var l2 = byId(data.links, k.dataset.checked); l2.lastChecked = today(); if (l2.status === 'unknown') l2.status = 'ok'; save(); renderAll(); B.toast('Marked as checked today'); }
    },
    validate: function (r) {
      if (!r.product && !r.shortName) return 'Give the link a product or short name';
      if (r.shortName && data.links.some(function (l) { return l.id !== r.id && l.shortName && l.shortName.toLowerCase() === r.shortName.toLowerCase(); })) return 'That short name is already used';
      return '';
    },
    delWarn: function (r) { var n = data.stats.filter(function (s) { return s.linkId === r.id; }).length; return n ? 'Its ' + n + ' month(s) of earnings will be deleted too.' : ''; },
    onDelete: function (id) { data.stats = data.stats.filter(function (s) { return s.linkId !== id; }); data.content.forEach(function (c) { c.linkIds = (c.linkIds || []).filter(function (x) { return x !== id; }); }); },
    rowExtra: function (r) { return '<button class="btn small" type="button" data-copylink="' + esc(r.id) + '">Copy</button> <button class="btn small" type="button" data-checked="' + esc(r.id) + '">Checked today</button> '; },
    cols: [{ key: 'shortName', label: 'Link', fmt: function (v, r) { return '<b>' + esc(linkName(r)) + '</b><div class="small muted">' + esc(r.product || '') + '</div>'; } },
      { key: 'programId', label: 'Program', fmt: function (v) { var p = byId(data.programs, v); return esc(p ? p.name : '–'); } },
      { key: 'affiliateUrl', label: 'Affiliate link', fmt: function (v) { return '<span class="url">' + esc(v || '–') + '</span>'; } },
      { key: 'status', label: 'Status', fmt: function (v, r) { return '<span class="' + (v === 'ok' ? 'pill-ok' : v === 'broken' ? 'pill-bad' : 'pill-warn') + '">' + (v === 'ok' ? 'works' : v === 'broken' ? 'broken' : 'not checked') + '</span>' + (r.lastChecked ? '<div class="small muted">' + esc(r.lastChecked) + '</div>' : ''); } }] });

  var renderContent = crud({ key: 'content', el: '#content', title: 'content piece', empty: 'Add the posts, videos and emails where you use your links.',
    defaults: function () { return { type: 'post', publishDate: today(), linkIds: [], disclosed: false }; },
    sort: function (a, b) { return String(b.publishDate || '').localeCompare(String(a.publishDate || '')); },
    fields: [{ k: 'title', label: 'Title', full: true }, { k: 'type', label: 'Type', type: 'select', opts: function () { return [['post', 'Blog post'], ['video', 'Video'], ['email', 'Email'], ['social', 'Social post'], ['other', 'Other']]; } },
      { k: 'platform', label: 'Platform', ph: 'YouTube, blog, Instagram…' }, { k: 'publishDate', label: 'Published', type: 'date' }, { k: 'url', label: 'Address', type: 'url', ph: 'https://' },
      { k: 'disclosed', label: 'Has an affiliate disclosure', type: 'checkbox' }, { k: 'linkIds', label: 'Links used in it', type: 'multi', opts: linkOpts, full: true }],
    validate: function (r) { return r.title ? '' : 'Give it a title'; },
    cols: [{ key: 'title', label: 'Content', fmt: function (v, r) { return (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(v) + '</a>' : esc(v)) + '<div class="small muted">' + esc([r.type, r.platform, r.publishDate].filter(Boolean).join(' · ')) + '</div>'; } },
      { key: 'linkIds', label: 'Links', fmt: function (v) { return esc((v || []).map(function (id) { return linkName(byId(data.links, id)); }).join(', ') || '–'); } },
      { key: 'disclosed', label: 'Disclosed', fmt: function (v) { return v ? '<span class="pill-ok">yes</span>' : '<span class="pill-warn">no</span>'; } }] });

  // ---------- overview ----------
  function range() { var v = $('#range').value, now = L.month(today()); return v === 'all' ? [null, null] : [L.addMonths(now, -(+v - 1)), now]; }
  function renderOverview() {
    if (!data.links.length && !data.programs.length) { $('#overview').innerHTML = '<div class="panel" style="margin-top:14px"><p style="margin:0">Start with <b>Programs</b> (the affiliate programs you’ve joined), then <b>Links</b>, then the <b>Content</b> where you use them. Add monthly numbers under <b>Clicks &amp; earnings</b>. Or press <b>Load sample data</b> to look around.</p></div>'; return; }
    var rg = range(), r = L.report(data, rg[0], rg[1]), t = r.total, b = L.best(r.links), rem = L.recheck(data, today(), data.settings.recheckDays);
    var due = r.programs.filter(function (p) { return p.payoutDue; });
    var html = '<div class="stat-row" style="margin-top:14px">' + stat(m(t.commission), 'Commission earned') + stat(B.fmt.num(t.clicks, 0), 'Clicks') + stat(epc(t.epc), 'Earnings per click (EPC)') +
      stat(isNaN(t.cr) ? '–' : pct(t.cr), 'Conversion rate') + stat(m(t.pending), 'Pending (not yet approved)', t.pending ? 'warn' : '') + stat(m(t.approved), 'Approved, not yet paid', t.approved ? 'warn' : '') + stat(m(t.paid), 'Paid') + '</div>';
    if (r.months.length) html += '<h2>Commission by month</h2>' + B.barChart(r.months.map(function (x) { return { label: x.month, value: L.r2(x.commission) }; }), { fmt: m });
    html += '<div class="cols-2"><div style="min-width:0"><h2>Top earning links</h2>' + (b.byCommission.length ? B.table(b.byCommission.slice(0, 8), [{ key: 'link', label: 'Link', fmt: function (v) { return esc(linkName(v)); } }, { key: 'commission', label: 'Commission', fmt: m }, { key: 'epc', label: 'EPC', fmt: epc }, { key: 'cr', label: 'Conv.', fmt: function (v) { return isNaN(v) ? '–' : pct(v); } }]) : '<p class="muted">No commission recorded in this period.</p>') + '</div>' +
      '<div style="min-width:0"><h2>Best earnings per click</h2><p class="small muted" style="margin-top:-6px">Links with at least 20 clicks.</p>' + (b.byEpc.length ? B.table(b.byEpc.slice(0, 8), [{ key: 'link', label: 'Link', fmt: function (v) { return esc(linkName(v)); } }, { key: 'epc', label: 'EPC', fmt: epc }, { key: 'clicks', label: 'Clicks', fmt: function (v) { return B.fmt.num(v, 0); } }]) : '<p class="muted">Not enough clicks yet.</p>') + '</div></div>';
    if (b.noSales.length) html += '<p class="small warn">Clicks but no sales: ' + b.noSales.map(function (l) { return esc(linkName(l.link)) + ' (' + l.clicks + ' clicks)'; }).join(', ') + ' — check the landing page, price or whether the link still tracks.</p>';
    var content = r.content.filter(function (c) { return c.clicks || c.commission; }).sort(function (a, b2) { return b2.commission - a.commission; });
    if (content.length) html += '<h2>Content that earns</h2><p class="small muted" style="margin-top:-6px">Totals of the links each piece uses (a link used in several pieces counts in each).</p>' + B.table(content, [{ key: 'content', label: 'Content', fmt: function (v) { return esc(v.title) + '<div class="small muted">' + esc([v.type, v.platform].filter(Boolean).join(' · ')) + '</div>'; } }, { key: 'linkCount', label: 'Links' }, { key: 'clicks', label: 'Clicks', fmt: function (v) { return B.fmt.num(v, 0); } }, { key: 'commission', label: 'Commission', fmt: m }]);
    html += '<h2>Payouts by program</h2>' + B.table(r.programs, [{ key: 'program', label: 'Program', fmt: function (v) { return esc(v.name); } }, { key: 'commission', label: 'Earned (period)', fmt: m }, { key: 'pending', label: 'Pending', fmt: m },
      { key: 'approvedAllTime', label: 'Approved, unpaid', fmt: m }, { key: 'payoutDue', label: 'Payout', fmt: function (v, p) { return v ? '<span class="pill-ok">over minimum — expect payment</span>' : p.toThreshold ? '<span class="small muted">' + m(p.toThreshold) + ' to go</span>' : '–'; } }]);
    if (due.length) html += '<p class="small">If a program shows “expect payment” but nothing arrives by its usual pay date, check your payment details in that network.</p>';
    html += '<h2>To do</h2>' + (rem.length ? rem.map(function (x) { return '<div class="rem ' + x.level + '"><b>' + esc(x.name) + '</b> — ' + esc(x.why) + '</div>'; }).join('') : '<p class="ok">Nothing to recheck right now.</p>') +
      '<p class="small muted">This page can’t open your links to test them. Click a link yourself and mark it “Checked today” on the Links tab, or use the free GitHub <b>Link checker</b>.</p>';
    $('#overview').innerHTML = html;
  }
  $('#range').addEventListener('change', renderOverview);

  // ---------- earnings ----------
  function curMonth() { return $('#emonth').value || L.month(today()); }
  function renderEarnings() {
    var mo = curMonth();
    if (!data.links.length) { $('#egrid').innerHTML = '<p class="muted">Add links first.</p>'; return; }
    $('#egrid').innerHTML = '<div class="table-wrap"><table class="edit-table"><thead><tr><th>Link</th><th>Clicks</th><th>Conversions</th><th>Sales $</th><th>Commission $</th><th>Status</th></tr></thead><tbody>' +
      data.links.map(function (l) {
        var s = data.stats.filter(function (x) { return x.linkId === l.id && x.month === mo; })[0] || {};
        function inp(k) { return '<td><input type="number" min="0" step="any" data-k="' + k + '" value="' + esc(s[k] == null ? '' : s[k]) + '" aria-label="' + k + ' for ' + esc(linkName(l)) + '"></td>'; }
        return '<tr data-link="' + esc(l.id) + '"><td>' + esc(linkName(l)) + '</td>' + inp('clicks') + inp('conversions') + inp('sales') + inp('commission') +
          '<td><select data-k="status" aria-label="Status for ' + esc(linkName(l)) + '">' + ['pending', 'approved', 'paid', 'rejected'].map(function (o) { return '<option' + ((s.status || 'pending') === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  $('#egrid').addEventListener('change', function (e) {
    var tr = e.target.closest('[data-link]'); if (!tr) return; var mo = curMonth(), id = tr.dataset.link;
    var s = data.stats.filter(function (x) { return x.linkId === id && x.month === mo; })[0];
    if (!s) { s = { id: B.uid(), linkId: id, month: mo, clicks: 0, conversions: 0, sales: 0, commission: 0, status: 'pending' }; data.stats.push(s); }
    s[e.target.dataset.k] = e.target.dataset.k === 'status' ? e.target.value : (+e.target.value || 0); save(); renderOverview();
  });
  $('#emonth').addEventListener('change', renderEarnings);
  $('#ePrev').addEventListener('click', function () { $('#emonth').value = L.addMonths(curMonth(), -1); renderEarnings(); });
  $('#eNext').addEventListener('click', function () { $('#emonth').value = L.addMonths(curMonth(), 1); renderEarnings(); });
  B.dropZone($('#eDrop'), function (files) {
    B.readTable(files[0]).then(function (t) {
      var r = L.importStats(t.rows, data.links, data.stats); data.stats = r.stats; save(); renderAll();
      B.toast(r.added + ' added, ' + r.updated + ' updated' + (r.unmatched.length ? '; ' + r.unmatched.length + ' rows not matched (' + r.unmatched.slice(0, 3).join(', ') + ')' : ''), 5000);
    }).catch(function (err) { B.toast('Could not read that file: ' + err.message, 4000); });
  }, { accept: '.csv,.tsv,.txt,.xlsx,.xls' });
  $('#eTemplate').addEventListener('click', function () { B.download('affiliate-earnings-template.csv', '﻿link,month,clicks,conversions,sales,commission,status\n' + data.links.slice(0, 3).map(function (l) { return (l.shortName || l.product) + ',' + L.month(today()) + ',0,0,0,0,pending'; }).join('\n') + '\n', 'text/csv;charset=utf-8'); });
  $('#eExport').addEventListener('click', function () { csvDownload('affiliate-earnings.csv', data.stats.slice().sort(function (a, b) { return a.month < b.month ? -1 : 1; }).map(function (s) { var l = byId(data.links, s.linkId); return { link: linkName(l), month: s.month, clicks: s.clicks, conversions: s.conversions, sales: s.sales, commission: s.commission, status: s.status }; })); });

  // ---------- disclosure ----------
  function renderDisclosure() { $('#dtext').value = L.disclosure($('#dtype').value); }
  $('#dtype').addEventListener('change', renderDisclosure);
  $('#dcopy').addEventListener('click', function () { B.copy($('#dtext').value); });

  // ---------- link checker files ----------
  var CF = { cwf: ['.github/workflows/link-check.yml', function () { return L.genCheckerWorkflow(); }], cjs: ['links/check-links.js', function () { return L.genCheckerJs(); }], cjson: ['links/links.json', function () { return L.genLinksJson(data.links); }] };
  function renderChecker() {
    Object.keys(CF).forEach(function (k) {
      $('[data-panel="' + k + '"]').innerHTML = '<div class="row" style="justify-content:space-between;margin-top:10px"><span class="path">' + esc(CF[k][0]) + '</span><span class="row" style="gap:6px"><button class="btn small" type="button" data-ccopy="' + k + '">Copy</button><button class="btn small" type="button" data-cdl="' + k + '">Download</button></span></div><pre>' + esc(CF[k][1]()) + '</pre>';
    });
  }
  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-ccopy]'), d = e.target.closest('[data-cdl]');
    if (c) B.copy(CF[c.dataset.ccopy][1]()); if (d) B.download(CF[d.dataset.cdl][0].split('/').pop(), CF[d.dataset.cdl][1]());
  });

  // ---------- settings ----------
  $('#recheckDays').addEventListener('change', function () { var v = +this.value; if (v >= 7) { data.settings.recheckDays = v; save(); renderOverview(); } });
  $('#ics').addEventListener('click', function () {
    var d = new Date(); d.setMonth(d.getMonth() + 1, 1);
    var date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01', stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    B.download('recheck-affiliate-links.ics', L.ics({ date: date, monthly: true, stamp: stamp, title: 'Recheck affiliate links', description: 'Open the Affiliate Content Manager, click each link on the To do list, enter last month’s earnings and mark links as checked. ' + location.href }), 'text/calendar;charset=utf-8');
  });
  $('#backup').addEventListener('click', function () { B.download('affiliate-backup-' + today() + '.json', JSON.stringify(Object.assign({ app: 'affiliate-manager', version: 1, exported: new Date().toISOString() }, data), null, 2), 'application/json'); });
  $('#restore').addEventListener('click', function () {
    var i = B.h('input', { type: 'file', accept: '.json' });
    i.addEventListener('change', function () {
      if (!i.files[0]) return;
      B.readFile(i.files[0]).then(function (t) {
        var d = JSON.parse(t); if (!d || !Array.isArray(d.links) || !Array.isArray(d.programs)) throw new Error('This is not an Affiliate Content Manager backup');
        if (!confirm('Replace everything here with this backup (' + d.programs.length + ' programs, ' + d.links.length + ' links)?')) return;
        B.store.set(KEY, d); data = load(); renderAll(); B.toast('Backup restored');
      }).catch(function (e) { B.toast(e.message, 4000); });
    });
    i.click();
  });
  $('#expLinks').addEventListener('click', function () { csvDownload('affiliate-links.csv', data.links.map(function (l) { var p = byId(data.programs, l.programId); return { short_name: l.shortName, product: l.product, program: p ? p.name : '', original_url: l.originalUrl, affiliate_url: l.affiliateUrl, status: l.status, last_checked: l.lastChecked || '' }; })); });
  $('#clearAll').addEventListener('click', function () { if (!confirm('Delete ALL programs, links, content and earnings from this browser?')) return; B.store.remove(KEY); data = load(); editing = {}; renderAll(); });
  $('#sample').addEventListener('click', function () {
    if ((data.links.length || data.programs.length) && !confirm('Replace your data with sample data? Download a backup first if you want to keep it.')) return;
    var s = L.sample(today()); data = { programs: s.programs, links: s.links, content: s.content, stats: s.stats, settings: data.settings }; editing = {}; save(); renderAll(); showTab('overview');
    B.toast('Sample data loaded — made-up programs and numbers');
  });

  function renderAll() { renderOverview(); renderPrograms(); renderLinks(); renderContent(); renderEarnings(); renderChecker(); $('#recheckDays').value = data.settings.recheckDays; }
  $('#emonth').value = L.month(today());
  renderDisclosure();
  B.tabs($('[data-tabs="cfiles"]'));
  showTab = B.tabs($('[data-tabs="aff"]'));
  renderAll();
})();
