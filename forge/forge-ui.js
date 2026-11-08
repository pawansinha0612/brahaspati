/* ProductForge UI — turns an app config into a working records app (lists, boards, forms, calendar,
   reminders, documents, CSV, backup). Needs assets/core.js (B) and forge/forge-core.js (ForgeCore) first.
   Usage: Forge.app({ id, mount, entities, reminders, dashboard, documents, tabs, sample }) — see forge/README.md. */
(function (root) {
  'use strict';
  var C = root.ForgeCore, B = root.B, esc = C.esc;
  var Forge = { core: C };

  // ---------- photos in IndexedDB (key = appId + ':' + photoId, value = JPEG data URL) ----------
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!root.indexedDB) return rej(new Error('This browser cannot store photos'));
      var rq = indexedDB.open('forge-photos', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('photos'); };
      rq.onsuccess = function () { res(rq.result); }; rq.onerror = function () { rej(rq.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction('photos', mode), s = t.objectStore('photos'), out = fn(s); t.oncomplete = function () { res(out && 'result' in out ? out.result : undefined); }; t.onerror = function () { rej(t.error); }; }); });
  }
  var cache = {};
  Forge.photos = {
    put: function (app, id, url) { cache[app + ':' + id] = url; return tx('readwrite', function (s) { s.put(url, app + ':' + id); }); },
    get: function (app, id) { var k = app + ':' + id; if (cache[k]) return Promise.resolve(cache[k]); return tx('readonly', function (s) { return s.get(k); }).then(function (v) { if (v) cache[k] = v; return v; }, function () { return null; }); },
    del: function (app, id) { delete cache[app + ':' + id]; return tx('readwrite', function (s) { s.delete(app + ':' + id); }).catch(function () {}); },
    many: function (app, ids) { var out = {}; return Promise.all((ids || []).map(function (id) { return Forge.photos.get(app, id).then(function (v) { if (v) out[id] = v; }); })).then(function () { return out; }); }
  };
  // Downscale an image file to a JPEG data URL (longest side `max`).
  Forge.downscale = function (file, max, quality) {
    max = max || 1600;
    return B.readFile(file, 'dataurl').then(function (url) {
      return new Promise(function (res, rej) {
        var img = new Image();
        img.onload = function () {
          var s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', quality || 0.8));
        };
        img.onerror = function () { rej(new Error('Could not read that image')); };
        img.src = url;
      });
    });
  };
  // Fill <img data-photo="id"> inside el.
  Forge.hydrate = function (app, el) {
    B.$$('img[data-photo]', el).forEach(function (img) { Forge.photos.get(app, img.dataset.photo).then(function (u) { if (u) img.src = u; else img.alt = 'Photo missing'; }); });
  };

  // ---------- printing ----------
  Forge.print = function (html) {
    var f = B.h('iframe', { title: 'Print preview', style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0' });
    f.addEventListener('load', function () { setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { B.toast('Printing was blocked. Use Download instead.'); } }, 250); setTimeout(function () { f.remove(); }, 60000); });
    f.srcdoc = html; document.body.appendChild(f);
  };
  Forge.business = {
    get: function () { return B.store.get('forge:business', {}) || {}; },
    set: function (v) { return B.store.set('forge:business', v); }
  };
  function localToday() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function fileSafe(s) { return String(s || 'file').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file'; }
  function fmtVal(f, v, ctx) {
    var t = f.type || 'text';
    if (t === 'select' && v != null && v !== '') {
      var o = (f.options || []).filter(function (x) { return (typeof x === 'object' ? x.value : x) === v; })[0];
      var tone = o && typeof o === 'object' && o.tone; return '<span class="' + (tone ? 'pill-' + tone : 'pill-mute') + '">' + esc(C.optionLabel(f, v)) + '</span>';
    }
    if (t === 'checkbox') return v ? '✓' : '';
    if (t === 'date' && v && f.dueSoon) return esc(v);
    return esc(C.display(f, v, ctx));
  }

  // =====================================================================
  Forge.app = function (cfg) {
    var errs = C.validateSchema(cfg);
    if (errs.length) { console.error('Forge config problems:\n' + errs.join('\n')); }
    var mount = typeof cfg.mount === 'string' ? B.$(cfg.mount) : cfg.mount; mount.classList.add('fg-root');
    var KEY = 'forge:' + cfg.id, ents = cfg.entities, ekeys = Object.keys(ents);
    ekeys.forEach(function (k) { ents[k].key = k; ents[k].label = ents[k].label || k; ents[k].single = ents[k].single || ents[k].label.replace(/s$/, ''); });
    var data = load(), ui = {}, dlg = null;
    ekeys.forEach(function (k) { ui[k] = { q: '', filters: {}, sort: (ents[k].sort || {}).key || null, dir: (ents[k].sort || {}).dir || 'asc', view: ents[k].board && ents[k].defaultView === 'board' ? 'board' : 'list', open: null }; });
    var calState = { view: 'month', anchor: localToday() };

    function load() {
      var d = B.store.get(KEY, null) || {};
      ekeys.forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
      d._extra = d._extra || {};
      return d;
    }
    function persist() { if (!B.store.set(KEY, data)) B.toast('Could not save — browser storage may be full. Download a backup.', 5000); }
    var ctx = {
      linkLabel: function (ek, id) { var r = api.get(ek, id); return r ? C.titleOf(ents[ek], r) : ''; },
      exists: function (ek, id) { return !!api.get(ek, id); },
      findLink: function (ek, text) { var t = String(text).toLowerCase(); var r = (data[ek] || []).filter(function (x) { return x.id === text || C.titleOf(ents[ek], x).toLowerCase() === t; })[0]; return r && r.id; },
      today: localToday
    };

    // ---------- public API handed to config callbacks ----------
    var api = {
      cfg: cfg, core: C, ctx: ctx, id: cfg.id,
      get data() { return data; },
      today: localToday,
      list: function (ek) { return data[ek] || []; },
      get: function (ek, id) { return id ? (data[ek] || []).filter(function (r) { return r.id === id; })[0] : null; },
      title: function (ek, rec) { if (typeof rec === 'string') rec = api.get(ek, rec); return rec ? C.titleOf(ents[ek], rec) : ''; },
      save: function (ek, rec, quiet) {
        rec = C.compute(ents[ek], rec, api); var now = new Date().toISOString();
        rec.updated = now; if (!rec.created) rec.created = now;
        var arr = data[ek], i = arr.findIndex(function (x) { return x.id === rec.id; });
        if (i >= 0) arr[i] = rec; else arr.push(rec);
        persist(); if (!quiet) refresh(); return rec;
      },
      saveMany: function (ek, recs) { recs.forEach(function (r) { api.save(ek, r, true); }); refresh(); },
      remove: function (ek, id) {
        var r = api.get(ek, id); if (!r) return;
        C.photoIds(ents[ek], r).forEach(function (p) { Forge.photos.del(cfg.id, p); });
        data[ek] = data[ek].filter(function (x) { return x.id !== id; }); persist(); refresh();
      },
      extra: function (k, v) { if (arguments.length > 1) { data._extra[k] = v; persist(); } return data._extra[k]; },
      business: Forge.business.get,
      refresh: function () { refresh(); },
      open: function (ek, id) { openDetail(ek, id); },
      edit: function (ek, rec, preset) { openForm(ek, typeof rec === 'string' ? api.get(ek, rec) : rec, preset); },
      photoSrc: function (ids) { return Forge.photos.many(cfg.id, ids); },
      addPhoto: function (url) { var id = 'p' + C.uid(); return Forge.photos.put(cfg.id, id, url).then(function () { return id; }); },
      docHTML: function (spec) { return Promise.resolve(spec).then(function (s) { return api.photoSrc(C.docPhotoIds(s)).then(function (src) { return C.docHTML(s, Forge.business.get(), src); }); }); },
      print: function (spec) { return api.docHTML(spec).then(Forge.print); },
      download: function (name, spec) { return api.docHTML(spec).then(function (h) { B.download(fileSafe(name) + '.html', h, 'text/html'); }); },
      ics: function (events, name) { B.download(fileSafe(name || cfg.id) + '.ics', C.buildICS(events, { name: cfg.name || cfg.id }), 'text/calendar;charset=utf-8'); },
      goTab: function (id) { if (showTab) showTab(id); },
      toast: B.toast
    };

    // function titles get the api as a second argument, e.g. title: function (r, api) { return api.title('sites', r.site); }
    ekeys.forEach(function (k) { var tf = ents[k].title; if (typeof tf === 'function' && !tf._fg) { ents[k].title = function (r) { return tf(r, api); }; ents[k].title._fg = 1; } });
    // ---------- shell ----------
    var tabs = [{ id: 'dash', label: cfg.dashboardLabel || 'Overview' }];
    ekeys.forEach(function (k) { if (ents[k].tab !== false) tabs.push({ id: 'e-' + k, label: ents[k].label, ek: k }); });
    var hasCal = ekeys.some(function (k) { return ents[k].calendar; });
    if (hasCal) tabs.push({ id: 'cal', label: 'Calendar' });
    if ((cfg.reminders || []).length) tabs.push({ id: 'rem', label: 'Reminders' });
    (cfg.tabs || []).forEach(function (t) { var at = t.after ? tabs.findIndex(function (x) { return x.id === t.after || x.ek === t.after; }) : -1; var item = { id: 'x-' + t.id, label: t.label, x: t }; if (at >= 0) tabs.splice(at + 1, 0, item); else tabs.push(item); });
    tabs.push({ id: 'set', label: 'Settings' });

    mount.innerHTML = '<div class="row no-print">' + (cfg.sample ? '<button class="btn primary" type="button" data-fg="sample">Load sample data</button>' : '') +
      (cfg.quickAdd || []).map(function (ek) { return '<button class="btn" type="button" data-fg="quick" data-ek="' + esc(ek) + '">New ' + esc(ents[ek].single.toLowerCase()) + '</button>'; }).join('') + '</div>' +
      '<p class="privacy">Saved in this browser only — there is no account or cloud copy. Use Settings → Download backup regularly, and before clearing your browser or switching devices.</p>' +
      '<div class="tabs" data-tabs="' + esc(cfg.id) + '">' + tabs.map(function (t) { return '<button type="button" data-tab="' + t.id + '">' + esc(t.label) + '</button>'; }).join('') + '</div>' +
      tabs.map(function (t) { return '<section class="tab-panel" data-panel="' + t.id + '"><div id="fg-' + t.id + '"></div></section>'; }).join('');
    var panes = {}; tabs.forEach(function (t) { panes[t.id] = B.$('#fg-' + t.id, mount); });
    var current = 'dash', showTab = null;
    function refresh() { renderTab(current); }
    function renderTab(id) {
      var t = tabs.filter(function (x) { return x.id === id; })[0]; if (!t) return;
      try {
        if (id === 'dash') renderDash(); else if (t.ek) renderEntity(t.ek); else if (id === 'cal') renderCal(); else if (id === 'rem') renderRem(); else if (id === 'set') renderSettings();
        else if (t.x) t.x.render(panes[id], api);
      } catch (e) { console.error(e); panes[id].innerHTML = '<p class="bad">Something went wrong showing this view: ' + esc(e.message) + '</p>'; }
    }
    mount.addEventListener('click', function (e) {
      var b = e.target.closest('[data-fg]'); if (!b) return;
      if (b.dataset.fg === 'sample') loadSample();
      if (b.dataset.fg === 'quick') openForm(b.dataset.ek, null);
    });

    // ---------- dashboard ----------
    function renderDash() {
      var el = panes.dash, d = cfg.dashboard || {}, today = localToday(), h = '';
      var tiles = (d.tiles || []).map(function (t) { var r = t.value ? { label: t.label, value: t.value(api), fmt: t.fmt || 'num', tone: t.tone ? t.tone(t.value(api)) : '' } : C.tile(t, data, today); return r; });
      if (!tiles.length) tiles = ekeys.map(function (k) { return { label: ents[k].label, value: data[k].length, fmt: 'num' }; });
      h += '<div class="stat-row" style="margin-top:14px">' + tiles.map(function (t) {
        var v = t.fmt === 'money' ? B.fmt.money(t.value) : t.fmt === 'pct' ? B.fmt.pct(t.value, 0) : t.fmt === 'hours' ? B.fmt.num(t.value, 1) + ' h' : B.fmt.num(t.value);
        return '<div class="stat"><div class="k">' + esc(t.label) + '</div><div class="v ' + (t.tone || '') + '">' + esc(v) + '</div></div>';
      }).join('') + '</div>';
      var rem = C.reminders(cfg, data, today);
      if ((cfg.reminders || []).length) h += '<div class="panel"><h3 style="margin-top:0">Needs attention</h3>' + (rem.length ? remList(rem.slice(0, 6)) + (rem.length > 6 ? '<p class="small"><button class="fg-linkbtn" type="button" data-go="rem">See all ' + rem.length + ' reminders</button></p>' : '') : '<p class="muted">Nothing overdue or due soon.</p>') + '</div>';
      var charts = (d.charts || []).map(function (c) {
        var recs = (data[c.entity] || []).filter(function (r) { return !c.where || c.where(r, today); });
        var by = typeof c.by === 'function' ? function (r) { return c.by(r, api); } : c.by, sum = typeof c.sum === 'function' ? function (r) { return c.sum(r, api); } : c.sum, f = typeof by === 'string' && C.field(ents[c.entity], by);
        var items = C.groupBy(recs, by, sum, f && f.type === 'link' ? { label: function (id) { return ctx.linkLabel(f.entity, id) || id; } } : null).slice(0, c.limit || 10);
        return '<div class="panel"><h3 style="margin-top:0">' + esc(c.title) + '</h3>' + (items.length ? B.barChart(items, { fmt: c.fmt === 'money' ? function (v) { return B.fmt.money(v); } : c.fmt === 'hours' ? function (v) { return B.fmt.num(v, 1) + ' h'; } : null }) : '<p class="muted small">No data yet.</p>') + '</div>';
      });
      if (charts.length) h += '<div class="cols-2">' + charts.join('') + '</div>';
      if (!ekeys.some(function (k) { return data[k].length; })) h += '<div class="panel"><p>No records yet. Click <b>Load sample data</b> to explore with made-up examples, or start adding your own.</p></div>';
      h += '<div id="fg-dash-extra"></div>';
      el.innerHTML = h;
      if (d.render) d.render(B.$('#fg-dash-extra', el), api);
    }
    function remList(items) {
      return items.map(function (r) {
        var pill = r.status === 'overdue' ? '<span class="pill-bad">' + Math.abs(r.days) + ' day' + (Math.abs(r.days) === 1 ? '' : 's') + ' overdue</span>' : r.status === 'today' ? '<span class="pill-warn">Today</span>' : '<span class="pill-ok">In ' + r.days + ' day' + (r.days === 1 ? '' : 's') + '</span>';
        return '<div class="fg-rem"><span class="when">' + esc(r.due) + (r.time ? ' ' + esc(r.time) : '') + '</span>' + pill + '<span><b>' + esc(r.label) + '</b> — <button class="fg-linkbtn" type="button" data-open="' + esc(r.entity) + '" data-id="' + esc(r.id) + '">' + esc(r.title) + '</button></span></div>';
      }).join('');
    }
    mount.addEventListener('click', function (e) {
      var o = e.target.closest('[data-open]');
      if (o) { e.preventDefault(); openDetail(o.dataset.open, o.dataset.id); return; }
      var g = e.target.closest('[data-go]'); if (g) showTab(g.dataset.go);
    });

    // ---------- entity tab ----------
    function listCols(e) {
      var keys = e.list || e.fields.filter(function (f) { return !/^(photos|signature|longtext|checklist|lines)$/.test(f.type); }).slice(0, 5).map(function (f) { return f.key; });
      return keys.map(function (k) { return C.field(e, k); }).filter(Boolean);
    }
    function renderEntity(ek) {
      var e = ents[ek], st = ui[ek], el = panes['e-' + ek];
      var filt = e.fields.filter(function (f) { return f.filter || (f.type === 'select' && f.filter !== false) || (f.type === 'link' && f.filter); });
      var views = [['list', 'List']]; if (e.board) views.push(['board', 'Board']);
      el.innerHTML = '<div class="row fg-toolbar no-print"><button class="btn primary" type="button" data-act="new">New ' + esc(e.single.toLowerCase()) + '</button>' +
        '<input type="search" placeholder="Search ' + esc(e.label.toLowerCase()) + '" aria-label="Search ' + esc(e.label) + '" data-act="q" value="' + esc(st.q) + '">' +
        filt.map(function (f) {
          var opts = f.type === 'link' ? data[f.entity].map(function (r) { return [r.id, C.titleOf(ents[f.entity], r)]; }) : C.optionValues(f).map(function (v) { return [v, C.optionLabel(f, v)]; });
          return '<select data-filter="' + esc(f.key) + '" aria-label="Filter by ' + esc(f.label || f.key) + '"><option value="">' + esc(f.label || f.key) + ': any</option>' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (st.filters[f.key] === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
        }).join('') +
        (views.length > 1 ? '<span class="fg-seg" role="group" aria-label="View">' + views.map(function (v) { return '<button type="button" data-view="' + v[0] + '" aria-pressed="' + (st.view === v[0]) + '">' + v[1] + '</button>'; }).join('') + '</span>' : '') +
        '<button class="btn small" type="button" data-act="csv">Export CSV</button><button class="btn small" type="button" data-act="import">Import CSV</button>' +
        '<input type="file" hidden accept=".csv,.tsv,.txt,.xlsx,.xls" data-act="file"></div>' +
        '<div class="fg-detail-wrap"></div><div class="fg-body"></div>';
      var body = B.$('.fg-body', el), recs = C.query(e, data[ek], st, ctx);
      if (st.view === 'board' && e.board) body.innerHTML = boardHTML(ek, recs);
      else body.innerHTML = tableHTML(ek, recs);
      if (e.renderBelow) { var x = B.h('div'); body.appendChild(x); e.renderBelow(x, api, recs); }
      if (st.open && api.get(ek, st.open)) renderDetail(ek, st.open); else st.open = null;
    }
    function tableHTML(ek, recs) {
      var e = ents[ek], st = ui[ek], cols = listCols(e);
      if (!data[ek].length) return '<p class="muted">No ' + esc(e.label.toLowerCase()) + ' yet.</p>';
      if (!recs.length) return '<p class="muted">Nothing matches.</p>';
      var num = function (f) { return f.type === 'money' || f.type === 'number'; };
      var rows = recs.slice(0, 500).map(function (r) {
        return '<tr>' + cols.map(function (f, i) {
          var v = fmtVal(f, r[f.key], ctx);
          if (i === 0) v = '<button type="button" class="fg-linkbtn" data-open="' + esc(ek) + '" data-id="' + esc(r.id) + '">' + (v || '(untitled)') + '</button>';
          if (f.type === 'link' && r[f.key] && i) v = '<button type="button" class="fg-linkbtn" data-open="' + esc(f.entity) + '" data-id="' + esc(r[f.key]) + '">' + v + '</button>';
          return '<td' + (num(f) ? ' class="num"' : '') + '>' + v + '</td>';
        }).join('') + '</tr>';
      }).join('');
      var sums = e.listTotals ? '<tr>' + cols.map(function (f, i) { return '<td' + (num(f) ? ' class="num"' : '') + '><b>' + (i === 0 ? 'Total' : e.listTotals.indexOf(f.key) >= 0 ? esc(C.display(f, C.r2(recs.reduce(function (s, r) { return s + (+r[f.key] || 0); }, 0)))) : '') + '</b></td>'; }).join('') + '</tr>' : '';
      return '<div class="table-wrap"><table><thead><tr>' + cols.map(function (f) {
        var arrow = st.sort === f.key ? (st.dir === 'asc' ? ' ▲' : ' ▼') : '';
        return '<th' + (num(f) ? ' class="num"' : '') + ' aria-sort="' + (st.sort === f.key ? (st.dir === 'asc' ? 'ascending' : 'descending') : 'none') + '"><button type="button" class="fg-sort" data-sort="' + esc(f.key) + '">' + esc(f.label || f.key) + arrow + '</button></th>';
      }).join('') + '</tr></thead><tbody>' + rows + sums + '</tbody></table></div><p class="small muted">' + recs.length + ' of ' + data[ek].length + ' ' + esc(e.label.toLowerCase()) + (recs.length > 500 ? ' (first 500 shown)' : '') + '</p>';
    }
    function boardHTML(ek, recs) {
      var e = ents[ek], f = C.field(e, e.board), sub = e.cardFields || listCols(e).slice(1, 3).map(function (x) { return x.key; });
      return '<p class="small muted">Drag a card to another column, or change it with the drop-down on the card.</p><div class="fg-board">' + C.board(e, recs).map(function (col) {
        return '<div class="fg-col" data-col="' + esc(col.value) + '"><h4><span>' + esc(col.label) + '</span><span>' + col.records.length + '</span></h4>' + col.records.map(function (r) {
          return '<div class="fg-card" draggable="true" data-card="' + esc(r.id) + '"><button type="button" class="fg-linkbtn" data-open="' + esc(ek) + '" data-id="' + esc(r.id) + '"><b>' + esc(C.titleOf(e, r)) + '</b></button>' +
            sub.map(function (k) { var sf = C.field(e, k); return sf && !C.isEmpty(r[k]) ? '<div class="small muted">' + esc(C.display(sf, r[k], ctx)) + '</div>' : ''; }).join('') +
            '<select data-move="' + esc(r.id) + '" aria-label="' + esc(f.label || f.key) + ' for ' + esc(C.titleOf(e, r)) + '">' + C.optionValues(f).map(function (v) { return '<option value="' + esc(v) + '"' + (r[f.key] === v ? ' selected' : '') + '>' + esc(C.optionLabel(f, v)) + '</option>'; }).join('') + '</select></div>';
        }).join('') + '</div>';
      }).join('') + '</div>';
    }
    function moveCard(ek, id, value) {
      var r = api.get(ek, id), f = ents[ek].board; if (!r || r[f] === value) return;
      r = Object.assign({}, r); r[f] = value;
      if (ents[ek].onStatus) ents[ek].onStatus(r, value, api);
      api.save(ek, r); B.toast('Moved to ' + value);
    }
    // entity-tab events (delegated per pane)
    ekeys.forEach(function (ek) {
      var el = panes['e-' + ek]; if (!el) return;
      el.addEventListener('click', function (ev) {
        var t = ev.target, st = ui[ek];
        var a = t.closest('[data-act]'); var act = a && a.dataset.act;
        if (act === 'new') openForm(ek, null);
        else if (act === 'csv') exportCSV(ek);
        else if (act === 'import') B.$('[data-act=file]', el).click();
        var s = t.closest('[data-sort]'); if (s) { var k = s.dataset.sort; if (st.sort === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = k; st.dir = 'asc'; } renderEntity(ek); }
        var v = t.closest('[data-view]'); if (v) { st.view = v.dataset.view; renderEntity(ek); }
      });
      el.addEventListener('input', function (ev) {
        if (ev.target.dataset.act === 'q') { ui[ek].q = ev.target.value; var pos = ev.target.selectionStart; renderEntity(ek); var q = B.$('[data-act=q]', el); q.focus(); try { q.setSelectionRange(pos, pos); } catch (x) {} }
      });
      el.addEventListener('change', function (ev) {
        var t = ev.target;
        if (t.dataset.filter) { ui[ek].filters[t.dataset.filter] = t.value; renderEntity(ek); }
        if (t.dataset.move) moveCard(ek, t.dataset.move, t.value);
        if (t.dataset.act === 'file' && t.files[0]) { importCSV(ek, t.files[0]); t.value = ''; }
      });
      el.addEventListener('dragstart', function (ev) { var c = ev.target.closest && ev.target.closest('[data-card]'); if (c) { ev.dataTransfer.setData('text/plain', c.dataset.card); ev.dataTransfer.effectAllowed = 'move'; } });
      el.addEventListener('dragover', function (ev) { var col = ev.target.closest && ev.target.closest('[data-col]'); if (col) { ev.preventDefault(); col.classList.add('over'); } });
      el.addEventListener('dragleave', function (ev) { var col = ev.target.closest && ev.target.closest('[data-col]'); if (col) col.classList.remove('over'); });
      el.addEventListener('drop', function (ev) { var col = ev.target.closest && ev.target.closest('[data-col]'); if (!col) return; ev.preventDefault(); col.classList.remove('over'); var id = ev.dataTransfer.getData('text/plain'); if (id && col.dataset.col) moveCard(ek, id, col.dataset.col); });
    });

    // ---------- detail ----------
    function openDetail(ek, id) {
      if (!ents[ek] || !api.get(ek, id)) return;
      ui[ek].open = id;
      if (ents[ek].tab === false) { var parentField = ents[ek].fields.filter(function (f) { return f.type === 'link'; })[0]; var pr = api.get(ek, id); if (parentField && pr[parentField.key]) { var pk = parentField.entity; ui[pk].open = pr[parentField.key]; } }
      var tabId = ents[ek].tab === false ? null : 'e-' + ek;
      if (tabId) { if (current !== tabId) showTab(tabId); else renderEntity(ek); } else detailDialog(ek, id);
      var w = tabId && B.$('.fg-detail-wrap', panes[tabId]); if (w && w.firstChild) w.firstChild.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    function valueHTML(f, v, rec) {
      var t = f.type || 'text';
      if (t === 'photos') return (v || []).length ? '<div class="fg-thumbs">' + v.map(function (p) { return '<a class="fg-thumb" href="#" data-big="' + esc(p) + '"><img data-photo="' + esc(p) + '" alt="Photo"></a>'; }).join('') + '</div>' : '';
      if (t === 'signature') return v ? '<div class="fg-sig"><img src="' + esc(v) + '" alt="Signature"></div>' : '<span class="muted">Not signed</span>';
      if (t === 'link') return v ? '<button type="button" class="fg-linkbtn" data-open="' + esc(f.entity) + '" data-id="' + esc(v) + '">' + esc(ctx.linkLabel(f.entity, v) || '(deleted)') + '</button>' : '';
      if (t === 'checklist') {
        var p = C.checklistProgress(v), cols = f.itemFields || [], g = null;
        return '<div><div>' + p.done + ' of ' + p.total + ' done</div><div class="fg-progress"><div style="width:' + Math.round(p.pct * 100) + '%"></div></div>' + (v || []).map(function (it) {
          var head = it.group && it.group !== g ? '<div class="fg-cl-group">' + esc(it.group) + '</div>' : ''; g = it.group;
          return head + '<div class="small">' + (it.done ? '☑ ' : '☐ ') + '<span class="' + (it.done ? 'fg-cl-done' : '') + '">' + esc(it.text) + '</span>' +
            cols.map(function (c) { return it[c.key] ? ' · ' + esc(c.label) + ': <b>' + esc(it[c.key]) + '</b>' : ''; }).join('') + (it.notes ? ' — <i>' + esc(it.notes) + '</i>' : '') + '</div>' +
            ((it.photos || []).length ? '<div class="fg-thumbs">' + it.photos.map(function (ph) { return '<a class="fg-thumb" href="#" data-big="' + esc(ph) + '"><img data-photo="' + esc(ph) + '" alt="Photo"></a>'; }).join('') + '</div>' : '');
        }).join('') + '</div>';
      }
      if (t === 'lines') return (v || []).length ? B.table(v.map(function (l) { return { d: l.desc, q: l.qty, p: l.price, a: C.r2((+l.qty || 0) * (+l.price || 0)) }; }), [{ key: 'd', label: 'Item' }, { key: 'q', label: 'Qty' }, { key: 'p', label: 'Price', fmt: function (x) { return B.fmt.money(x); } }, { key: 'a', label: 'Amount', fmt: function (x) { return B.fmt.money(x); } }]) + '<div><b>Total ' + esc(C.money(C.linesTotal(v))) + '</b></div>' : '';
      return fmtVal(f, v, ctx);
    }
    function detailHTML(ek, rec) {
      var e = ents[ek];
      var docs = (cfg.documents || []).filter(function (d) { return d.entity === ek && (!d.when || d.when(rec, api)); });
      var acts = (e.actions || []).filter(function (a) { return !a.when || a.when(rec, api); });
      var h = '<div class="panel fg-detail"><div class="row" style="justify-content:space-between"><h3>' + esc(C.titleOf(e, rec)) + ' <span class="small muted">' + esc(e.single) + '</span></h3>' +
        '<button class="btn small no-print" type="button" data-d="close" aria-label="Close">✕ Close</button></div>' +
        '<div class="row no-print"><button class="btn small primary" type="button" data-d="edit">Edit</button><button class="btn small" type="button" data-d="dup">Duplicate</button>' +
        (e.recurring ? '<button class="btn small" type="button" data-d="repeat">Repeat…</button>' : '') +
        docs.map(function (d, i) { return '<button class="btn small" type="button" data-doc="' + i + '">Print ' + esc(d.label) + '</button><button class="btn small" type="button" data-docdl="' + i + '" aria-label="Download ' + esc(d.label) + ' as HTML">⬇ HTML</button>'; }).join('') +
        acts.map(function (a, i) { return '<button class="btn small" type="button" data-xa="' + i + '">' + esc(a.label) + '</button>'; }).join('') +
        '<button class="btn small" type="button" data-d="del">Delete</button></div><dl class="fg-dl">';
      e.fields.forEach(function (f) {
        var v = rec[f.key]; if (C.isEmpty(v) && f.type !== 'signature' && !f.compute) return;
        h += '<dt>' + esc(f.label || f.key) + '</dt><dd>' + (valueHTML(f, v, rec) || '<span class="muted">–</span>') + '</dd>';
      });
      h += '</dl>';
      if (e.detailExtra) h += '<div class="fg-dx"></div>';
      C.backlinks(cfg, data, ek, rec.id).forEach(function (bl) {
        var be = ents[bl.entity], cols = listCols(be).filter(function (f) { return f.key !== bl.field; }).slice(0, 4);
        h += '<h4 style="margin:14px 0 6px">' + esc(be.label) + ' (' + bl.records.length + ')</h4><div class="table-wrap"><table><thead><tr>' + cols.map(function (f) { return '<th>' + esc(f.label || f.key) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          bl.records.slice(0, 50).map(function (r) { return '<tr>' + cols.map(function (f, i) { var v = fmtVal(f, r[f.key], ctx); return '<td>' + (i === 0 ? '<button type="button" class="fg-linkbtn" data-open="' + esc(bl.entity) + '" data-id="' + esc(r.id) + '">' + (v || '(untitled)') + '</button>' : v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
      });
      var addable = ekeys.filter(function (k) { return ents[k].fields.some(function (f) { return f.type === 'link' && f.entity === ek && f.addFrom !== false; }); });
      if (addable.length) h += '<div class="row no-print" style="margin-top:10px">' + addable.map(function (k) { return '<button class="btn small" type="button" data-addlinked="' + esc(k) + '">+ ' + esc(ents[k].single) + '</button>'; }).join('') + '</div>';
      return h + '</div>';
    }
    function wireDetail(ek, rec, box, onClose) {
      var e = ents[ek];
      var docs = (cfg.documents || []).filter(function (d) { return d.entity === ek && (!d.when || d.when(rec, api)); });
      var acts = (e.actions || []).filter(function (a) { return !a.when || a.when(rec, api); });
      Forge.hydrate(cfg.id, box);
      if (e.detailExtra) e.detailExtra(B.$('.fg-dx', box), rec, api);
      box.addEventListener('click', function (ev) {
        var t = ev.target, b;
        if ((b = t.closest('[data-big]'))) { ev.preventDefault(); Forge.photos.get(cfg.id, b.dataset.big).then(function (u) { if (u) { var w = window.open(''); if (w) w.document.write('<title>Photo</title><img src="' + u + '" style="max-width:100%">'); } }); return; }
        if ((b = t.closest('[data-d]'))) {
          var d = b.dataset.d;
          if (d === 'close') onClose();
          if (d === 'edit') openForm(ek, rec);
          if (d === 'dup') { var c = JSON.parse(JSON.stringify(rec)); c.id = C.uid(); delete c.seriesId; delete c.created; C.photoIds(e, c); e.fields.forEach(function (f) { if (f.type === 'photos' || f.type === 'signature' || f.unique) c[f.key] = f.type === 'photos' ? [] : ''; if (f.type === 'checklist') c[f.key] = (c[f.key] || []).map(function (it) { return C.checkItem({ text: it.text, group: it.group }); }); }); openForm(ek, c, null, true); }
          if (d === 'repeat') repeatDialog(ek, rec);
          if (d === 'del' && confirm('Delete this ' + e.single.toLowerCase() + '? This cannot be undone.')) { ui[ek].open = null; onClose(true); api.remove(ek, rec.id); B.toast('Deleted'); }
        }
        if ((b = t.closest('[data-doc]'))) { var dd = docs[+b.dataset.doc]; api.print(dd.build(rec, api)).catch(function (er) { B.toast(er.message); }); }
        if ((b = t.closest('[data-docdl]'))) { var d2 = docs[+b.dataset.docdl]; api.download(d2.label + '-' + C.titleOf(e, rec), d2.build(rec, api)); }
        if ((b = t.closest('[data-xa]'))) acts[+b.dataset.xa].run(rec, api);
        if ((b = t.closest('[data-addlinked]'))) { var k = b.dataset.addlinked, lf = ents[k].fields.filter(function (f) { return f.type === 'link' && f.entity === ek; })[0], pre = {}; pre[lf.key] = rec.id; openForm(k, null, pre); }
      });
    }
    function renderDetail(ek, id) {
      var w = B.$('.fg-detail-wrap', panes['e-' + ek]), rec = api.get(ek, id); if (!w || !rec) return;
      w.innerHTML = detailHTML(ek, rec);
      wireDetail(ek, rec, w.firstChild, function () { ui[ek].open = null; w.innerHTML = ''; });
    }
    function detailDialog(ek, id) {
      var rec = api.get(ek, id), d = B.h('dialog', { class: 'fg-dialog', 'aria-label': ents[ek].single });
      d.innerHTML = '<div style="padding:4px 12px 12px">' + detailHTML(ek, rec) + '</div>';
      document.body.appendChild(d); d.showModal();
      d.addEventListener('close', function () { d.remove(); });
      wireDetail(ek, rec, d.firstChild.firstChild, function () { d.close(); });
    }

    // ---------- form ----------
    function openForm(ek, rec, preset, isCopy) {
      var e = ents[ek], isNew = !rec || isCopy || !api.get(ek, rec.id);
      var draft = rec ? JSON.parse(JSON.stringify(rec)) : C.blankRecord(e, null, localToday());
      Object.assign(draft, preset || {});
      if (isNew && e.onNew) e.onNew(draft, api);
      var added = [];
      if (dlg) dlg.remove();
      dlg = B.h('dialog', { class: 'fg-dialog', 'aria-label': (isNew ? 'New ' : 'Edit ') + e.single });
      dlg.innerHTML = '<form novalidate><div class="fg-dhead"><h3>' + (isNew ? 'New ' : 'Edit ') + esc(e.single.toLowerCase()) + '</h3><button class="btn small" type="button" data-x="cancel" aria-label="Close">✕</button></div>' +
        '<div class="fg-form"></div><p class="fg-err" data-x="summary" role="alert"></p><div class="row fg-actions"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" data-x="cancel">Cancel</button></div></form>';
      var grid = B.$('.fg-form', dlg), form = B.$('form', dlg);
      e.fields.forEach(function (f) {
        if (f.hidden) return;
        var wide = f.full || /^(longtext|photos|checklist|signature|lines|multiselect)$/.test(f.type);
        var cell = B.h('div', { class: wide ? 'full' : '' }); cell.dataset.field = f.key; grid.appendChild(cell);
        renderField(cell, f);
      });
      function fid(f) { return 'fg-' + ek + '-' + f.key; }
      function renderField(cell, f) {
        var t = f.type || 'text', v = draft[f.key], id = fid(f), lab = '<label for="' + id + '">' + esc(f.label || f.key) + (f.required ? ' *' : '') + '</label>', h = '';
        if (f.compute) { var cv = C.compute(e, draft, api)[f.key]; cell.innerHTML = '<label>' + esc(f.label || f.key) + '</label><div class="fg-readonly" data-computed>' + esc(C.display(f, cv, ctx)) + '</div>'; return; }
        if (t === 'longtext') h = lab + '<textarea class="prose" id="' + id + '" rows="3" style="min-height:80px">' + esc(v || '') + '</textarea>';
        else if (t === 'select') h = lab + '<select id="' + id + '">' + (f.required ? '' : '<option value=""></option>') + C.optionValues(f).map(function (o) { return '<option value="' + esc(o) + '"' + (v === o ? ' selected' : '') + '>' + esc(C.optionLabel(f, o)) + '</option>'; }).join('') + '</select>';
        else if (t === 'link') {
          var opts = data[f.entity].slice().sort(function (a, b) { return C.titleOf(ents[f.entity], a).localeCompare(C.titleOf(ents[f.entity], b)); });
          h = lab + '<select id="' + id + '"><option value="">' + (opts.length ? 'Choose…' : 'No ' + esc(ents[f.entity].label.toLowerCase()) + ' yet') + '</option>' + opts.map(function (r) { return '<option value="' + esc(r.id) + '"' + (v === r.id ? ' selected' : '') + '>' + esc(C.titleOf(ents[f.entity], r)) + '</option>'; }).join('') + '</select>';
        }
        else if (t === 'multiselect') h = '<label>' + esc(f.label || f.key) + '</label><div class="fg-checks">' + C.optionValues(f).map(function (o, i) { return '<label class="fg-check"><input type="checkbox" data-ms="' + esc(o) + '"' + ((v || []).indexOf(o) >= 0 ? ' checked' : '') + '> ' + esc(C.optionLabel(f, o)) + '</label>'; }).join('') + '</div>';
        else if (t === 'checkbox') h = '<label class="fg-check" style="margin-top:34px"><input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '> ' + esc(f.label || f.key) + '</label>';
        else if (t === 'photos') h = '<label>' + esc(f.label || f.key) + '</label><div class="fg-thumbs">' + (v || []).map(function (p) { return '<div class="fg-thumb"><img data-photo="' + esc(p) + '" alt="Photo"><button type="button" data-rmphoto="' + esc(p) + '" aria-label="Remove photo">×</button></div>'; }).join('') + '</div><label class="btn small" style="display:inline-flex;font-weight:400">+ Add photos<input type="file" accept="image/*" multiple hidden data-addphotos></label>';
        else if (t === 'signature') h = sigHTML(f, v);
        else if (t === 'checklist') h = checklistHTML(f, v || []);
        else if (t === 'lines') h = linesHTML(f, v || []);
        else {
          var it = { text: 'text', email: 'email', phone: 'tel', number: 'number', money: 'number', date: 'date', datetime: 'datetime-local', time: 'time' }[t] || 'text';
          h = lab + '<input id="' + id + '" type="' + it + '"' + (t === 'money' ? ' step="0.01" inputmode="decimal"' : t === 'number' ? ' step="any" inputmode="decimal"' : '') + (f.min != null ? ' min="' + esc(f.min) + '"' : '') + (f.max != null ? ' max="' + esc(f.max) + '"' : '') +
            (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + ' value="' + esc(v == null ? '' : v) + '"' + (t === 'phone' ? ' autocomplete="tel"' : '') + '>';
        }
        if (f.help) h += '<p class="fg-help">' + esc(f.help) + '</p>';
        cell.innerHTML = h + '<p class="fg-err" data-err></p>';
        Forge.hydrate(cfg.id, cell);
        if (t === 'signature' && !v) setupSig(cell, f);
      }
      function updateComputed() { e.fields.forEach(function (f) { if (f.compute) { var c = B.$('[data-field="' + f.key + '"] [data-computed]', grid); if (c) c.textContent = C.display(f, C.compute(e, draft, api)[f.key], ctx); } }); }
      // simple inputs
      grid.addEventListener('input', function (ev) { readSimple(ev.target); updateComputed(); });
      grid.addEventListener('change', function (ev) {
        readSimple(ev.target); var cell = ev.target.closest('[data-field]'); if (!cell) return; var f = C.field(e, cell.dataset.field);
        if (ev.target.dataset.addphotos != null && ev.target.files.length) addPhotos(ev.target.files, function (ids) { draft[f.key] = (draft[f.key] || []).concat(ids); renderField(cell, f); });
        if (ev.target.dataset.itemphotos != null && ev.target.files.length) { var it = draft[f.key].filter(function (x) { return x.id === ev.target.dataset.itemphotos; })[0]; addPhotos(ev.target.files, function (ids) { it.photos = (it.photos || []).concat(ids); renderField(cell, f); }); }
        if (f.type === 'link' && e.onLinkChange) { e.onLinkChange(draft, f.key, api); e.fields.forEach(function (o) { if (o.type === 'checklist' || o.refresh) { var c2 = B.$('[data-field="' + o.key + '"]', grid); if (c2) renderField(c2, o); } }); }
        if (f.type === 'checklist' && ev.target.dataset.done != null) renderField(cell, f);
        updateComputed();
      });
      function readSimple(t) {
        var cell = t.closest('[data-field]'); if (!cell) return; var f = C.field(e, cell.dataset.field); if (!f) return;
        if (f.type === 'checklist') return readChecklist(t, f);
        if (f.type === 'lines') return readLines(t, f, cell);
        if (f.type === 'multiselect') { draft[f.key] = B.$$('[data-ms]', cell).filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.ms; }); return; }
        if (t.id !== fid(f)) return;
        draft[f.key] = f.type === 'checkbox' ? t.checked : C.coerce(f, t.value);
      }
      function addPhotos(files, done) {
        var list = [].slice.call(files); B.toast('Adding ' + list.length + ' photo' + (list.length > 1 ? 's' : '') + '…');
        Promise.all(list.map(function (file) { return Forge.downscale(file, cfg.photoMax || 1600, 0.8).then(api.addPhoto); })).then(function (ids) { added = added.concat(ids); done(ids); }, function (er) { B.toast(er.message || 'Could not add photo'); });
      }
      grid.addEventListener('click', function (ev) {
        var t = ev.target, cell = t.closest('[data-field]'); if (!cell) return; var f = C.field(e, cell.dataset.field);
        if (t.dataset.rmphoto) { draft[f.key] = draft[f.key].filter(function (p) { return p !== t.dataset.rmphoto; }); renderField(cell, f); }
        if (t.dataset.rmitemphoto) { draft[f.key].forEach(function (it) { it.photos = (it.photos || []).filter(function (p) { return p !== t.dataset.rmitemphoto; }); }); renderField(cell, f); }
        if (t.dataset.sigclear != null) { draft[f.key] = ''; renderField(cell, f); }
        if (t.dataset.cladd != null) { var g = t.dataset.cladd; var txt = prompt('New item' + (g ? ' in ' + g : '') + ':'); if (txt) { var items = draft[f.key] = draft[f.key] || [], idx = -1; items.forEach(function (it, i) { if ((it.group || '') === g) idx = i; }); var ni = C.checkItem({ text: txt, group: g }); if (idx >= 0) items.splice(idx + 1, 0, ni); else items.push(ni); renderField(cell, f); } }
        if (t.dataset.claddgroup != null) { var gname = prompt(f.groupLabel ? 'New ' + f.groupLabel.toLowerCase() + ':' : 'New section:'); if (gname) { (typeof f.groupItems === 'function' ? f.groupItems(gname, draft) : (f.groupItems || [''])).forEach(function (txt2) { draft[f.key].push(C.checkItem({ text: txt2 || 'Item', group: gname })); }); renderField(cell, f); } }
        if (t.dataset.clrm) { draft[f.key] = draft[f.key].filter(function (it) { return it.id !== t.dataset.clrm; }); renderField(cell, f); }
        if (t.dataset.clall != null) { var g2 = t.dataset.clall; draft[f.key].forEach(function (it) { if ((it.group || '') === g2) it.done = true; }); renderField(cell, f); }
        if (t.dataset.lineadd != null) { draft[f.key] = (draft[f.key] || []).concat([{ desc: '', qty: 1, price: 0 }]); renderField(cell, f); }
        if (t.dataset.linerm != null) { draft[f.key].splice(+t.dataset.linerm, 1); renderField(cell, f); }
        updateComputed();
      });
      // checklist
      function checklistHTML(f, items) {
        var cols = f.itemFields || [], g = null, h = '<label>' + esc(f.label || f.key) + '</label>';
        var p = C.checklistProgress(items); h += '<div class="small muted">' + p.done + ' of ' + p.total + ' done</div><div class="fg-progress"><div style="width:' + Math.round(p.pct * 100) + '%"></div></div>';
        var groups = []; items.forEach(function (it) { if (groups.indexOf(it.group || '') < 0) groups.push(it.group || ''); });
        groups.forEach(function (gr) {
          if (gr || groups.length > 1) h += '<div class="fg-cl-group"><span>' + esc(gr || 'General') + '</span><span><button type="button" class="btn small" data-clall="' + esc(gr) + '">Tick all</button> <button type="button" class="btn small" data-cladd="' + esc(gr) + '">+ Item</button></span></div>';
          items.filter(function (it) { return (it.group || '') === gr; }).forEach(function (it) {
            h += '<div class="fg-cl-item" data-item="' + esc(it.id) + '"><div class="fg-cl-row"><input type="checkbox" data-done aria-label="Done: ' + esc(it.text) + '"' + (it.done ? ' checked' : '') + '>' +
              '<input type="text" data-k="text" value="' + esc(it.text) + '" aria-label="Item">' +
              '<button type="button" class="btn small" data-clrm="' + esc(it.id) + '" aria-label="Remove item">×</button></div>';
            if (cols.length || f.itemNotes !== false || f.itemPhotos) {
              h += '<div class="fg-cl-row" style="margin-top:4px">' + cols.map(function (c) {
                return '<label class="fg-mini">' + esc(c.label) + ' <select data-k="' + esc(c.key) + '"><option value=""></option>' + (c.options || []).map(function (o) { return '<option' + (it[c.key] === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></label>';
              }).join('') + (f.itemNotes !== false ? '<input type="text" data-k="notes" placeholder="Notes" value="' + esc(it.notes || '') + '" aria-label="Notes for ' + esc(it.text) + '">' : '') +
                (f.itemPhotos ? '<label class="btn small" style="font-weight:400;margin:0">📷<span class="small">Photo</span><input type="file" accept="image/*" multiple hidden data-itemphotos="' + esc(it.id) + '"></label>' : '') + '</div>';
              if ((it.photos || []).length) h += '<div class="fg-thumbs">' + it.photos.map(function (ph) { return '<div class="fg-thumb"><img data-photo="' + esc(ph) + '" alt="Photo"><button type="button" data-rmitemphoto="' + esc(ph) + '" aria-label="Remove photo">×</button></div>'; }).join('') + '</div>';
            }
            h += '</div>';
          });
        });
        h += '<div class="row" style="margin-top:6px">' + (groups.length <= 1 && !groups[0] ? '<button type="button" class="btn small" data-cladd="">+ Item</button>' : '') + (f.groups !== false ? '<button type="button" class="btn small" data-claddgroup>+ ' + esc(f.groupLabel || 'Section') + '</button>' : '') + '</div>';
        return h;
      }
      function readChecklist(t, f) {
        var row = t.closest('[data-item]'); if (!row) return;
        var it = (draft[f.key] || []).filter(function (x) { return x.id === row.dataset.item; })[0]; if (!it) return;
        if (t.dataset.done != null) it.done = t.checked;
        else if (t.dataset.k) it[t.dataset.k] = t.value;
        if (f.autoDone && t.dataset.k && t.tagName === 'SELECT') { it.done = (f.itemFields || []).every(function (c) { return it[c.key]; }); var cb = B.$('[data-done]', row); if (cb) cb.checked = it.done; }
      }
      // lines
      function linesHTML(f, lines) {
        return '<label>' + esc(f.label || f.key) + '</label>' + lines.map(function (l, i) {
          return '<div class="fg-line" data-line="' + i + '"><input class="desc" type="text" data-k="desc" placeholder="Description" value="' + esc(l.desc || '') + '" aria-label="Description">' +
            '<input type="number" step="any" data-k="qty" value="' + esc(l.qty == null ? '' : l.qty) + '" aria-label="Quantity">' +
            '<input type="number" step="0.01" data-k="price" value="' + esc(l.price == null ? '' : l.price) + '" aria-label="Unit price">' +
            '<span class="amt">' + esc(C.money(C.r2((+l.qty || 0) * (+l.price || 0)))) + '</span><button type="button" class="btn small" data-linerm="' + i + '" aria-label="Remove line">×</button></div>';
        }).join('') + '<div class="row"><button type="button" class="btn small" data-lineadd>+ Line</button><b data-linetotal>Total ' + esc(C.money(C.linesTotal(lines))) + '</b></div>';
      }
      function readLines(t, f, cell) {
        var row = t.closest('[data-line]'); if (!row) return; var l = draft[f.key][+row.dataset.line];
        l[t.dataset.k] = t.dataset.k === 'desc' ? t.value : (t.value === '' ? null : +t.value);
        B.$('.amt', row).textContent = C.money(C.r2((+l.qty || 0) * (+l.price || 0)));
        B.$('[data-linetotal]', cell).textContent = 'Total ' + C.money(C.linesTotal(draft[f.key]));
      }
      // signature
      function sigHTML(f, v) {
        return '<label>' + esc(f.label || f.key) + '</label><div class="fg-sig">' + (v ? '<img src="' + esc(v) + '" alt="Signature"><button type="button" class="btn small" data-sigclear style="margin-top:6px">Clear and sign again</button>' :
          '<canvas width="700" height="220" aria-label="Signature pad — sign with your finger or mouse"></canvas><div class="row" style="margin-top:6px"><button type="button" class="btn small" data-sigclear>Clear</button><span class="small muted">Sign above with a finger, pen or mouse.</span></div>') + '</div>';
      }
      function setupSig(cell, f) {
        var cv = B.$('canvas', cell); if (!cv) return; var g = cv.getContext('2d'), drawing = false, last = null;
        g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.strokeStyle = '#111'; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
        var pos = function (ev) { var r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) * cv.width / r.width, (ev.clientY - r.top) * cv.height / r.height]; };
        cv.addEventListener('pointerdown', function (ev) { drawing = true; last = pos(ev); try { cv.setPointerCapture(ev.pointerId); } catch (x) {} });
        cv.addEventListener('pointermove', function (ev) { if (!drawing) return; var p = pos(ev); g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(p[0], p[1]); g.stroke(); last = p; draft[f.key] = '__drawn__'; });
        var end = function () { if (drawing && draft[f.key] === '__drawn__') cell._sigCanvas = cv; drawing = false; };
        cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
        cell._sigCanvas = cv;
      }
      function finishSigs() {
        e.fields.forEach(function (f) {
          if (f.type !== 'signature') return; var cell = B.$('[data-field="' + f.key + '"]', grid);
          if (draft[f.key] === '__drawn__') draft[f.key] = cell && cell._sigCanvas ? cell._sigCanvas.toDataURL('image/png') : '';
          if (draft[f.key] && f.dateField && !draft[f.dateField]) draft[f.dateField] = localToday();
        });
      }
      function close(saved) {
        if (!saved) added.forEach(function (p) { Forge.photos.del(cfg.id, p); });
        if (dlg) { dlg.close(); dlg.remove(); dlg = null; }
      }
      B.$$('[data-x=cancel]', dlg).forEach(function (b) { b.addEventListener('click', function () { close(false); }); });
      dlg.addEventListener('cancel', function (ev) { ev.preventDefault(); close(false); });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault(); finishSigs();
        if (e.beforeSave) e.beforeSave(draft, api);
        var errs = C.validateRecord(e, C.compute(e, draft, api), ctx);
        B.$$('[data-err]', grid).forEach(function (p) { p.textContent = ''; });
        var keys = Object.keys(errs);
        if (keys.length) {
          keys.forEach(function (k) { var p = B.$('[data-field="' + k + '"] [data-err]', grid); if (p) p.textContent = errs[k]; });
          B.$('[data-x=summary]', dlg).textContent = 'Please fix: ' + keys.map(function (k) { return errs[k]; }).join(' · ');
          var first = B.$('[data-field="' + keys[0] + '"]', grid); if (first) first.scrollIntoView({ block: 'center' });
          return;
        }
        // photos removed while editing: delete from storage
        if (!isNew && rec) { var keep = C.photoIds(e, draft); C.photoIds(e, rec).forEach(function (p) { if (keep.indexOf(p) < 0) Forge.photos.del(cfg.id, p); }); }
        var saved = api.save(ek, draft, true);
        close(true);
        if (e.afterSave) e.afterSave(saved, api, isNew);
        ui[ek].open = saved.id;
        if (ents[ek].tab === false) refresh(); else if (current === 'e-' + ek || (current === 'dash' && isNew)) openDetail(ek, saved.id); else refresh();
        B.toast('Saved');
      });
      document.body.appendChild(dlg); dlg.showModal();
    }

    // ---------- recurring ----------
    function repeatDialog(ek, rec) {
      var e = ents[ek], d = B.h('dialog', { class: 'fg-dialog', 'aria-label': 'Repeat' }), base = C.dayOf(rec[e.recurring]);
      if (!base) return B.toast('Set the ' + (C.field(e, e.recurring).label || 'date') + ' first');
      d.innerHTML = '<form method="dialog" style="padding:16px"><h3 style="margin-top:0">Repeat “' + esc(C.titleOf(e, rec)) + '”</h3><p class="small muted">Makes copies on later dates, starting from ' + esc(base) + '. Copies that already exist in this series are skipped.</p>' +
        '<label for="fg-rf">How often</label><select id="fg-rf"><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option></select>' +
        '<label for="fg-ru">Until</label><input type="date" id="fg-ru" value="' + esc(C.addMonths(base, 3)) + '">' +
        '<div class="row" style="margin-top:14px"><button class="btn primary" value="ok">Create copies</button><button class="btn" value="cancel">Cancel</button></div></form>';
      document.body.appendChild(d); d.showModal();
      d.addEventListener('close', function () {
        if (d.returnValue === 'ok') {
          var copies = C.generateSeries(rec, e.recurring, { freq: B.$('#fg-rf', d).value, until: B.$('#fg-ru', d).value }, { shift: e.recurringShift, reset: e.recurringReset, clear: (e.recurringClear || []), existing: data[ek], max: 200 });
          if (!rec.seriesId && copies[0]) { var r2 = Object.assign({}, rec, { seriesId: copies[0].seriesId }); api.save(ek, r2, true); }
          copies.forEach(function (c) { e.fields.forEach(function (f) { if (f.type === 'photos') c[f.key] = []; if (f.type === 'signature') c[f.key] = ''; if (f.type === 'checklist') c[f.key] = (c[f.key] || []).map(function (it) { return C.checkItem({ text: it.text, group: it.group }); }); }); });
          api.saveMany(ek, copies); B.toast('Added ' + copies.length + ' ' + (copies.length === 1 ? e.single.toLowerCase() : e.label.toLowerCase()));
        }
        d.remove();
      });
    }

    // ---------- calendar ----------
    function renderCal() {
      var el = panes.cal, st = calState, a = C.parseDay(st.anchor), today = localToday(), days, title;
      if (st.view === 'month') { var weeks = C.monthGrid(a.getUTCFullYear(), a.getUTCMonth()); days = [].concat.apply([], weeks); title = a.toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' }); }
      else { days = C.weekOf(st.anchor); title = 'Week of ' + days[0]; }
      var evs = C.calendarEvents(cfg, data, days[0], days[days.length - 1]), byDay = {};
      evs.forEach(function (x) { (byDay[x.day] = byDay[x.day] || []).push(x); });
      var h = '<div class="row fg-toolbar"><button class="btn small" type="button" data-cal="prev" aria-label="Previous">◀</button><b style="min-width:140px;text-align:center">' + esc(title) + '</b><button class="btn small" type="button" data-cal="next" aria-label="Next">▶</button>' +
        '<button class="btn small" type="button" data-cal="today">Today</button><span class="fg-seg" role="group" aria-label="Calendar view"><button type="button" data-cal="month" aria-pressed="' + (st.view === 'month') + '">Month</button><button type="button" data-cal="week" aria-pressed="' + (st.view === 'week') + '">Week</button></span>' +
        '<button class="btn small" type="button" data-cal="ics">Download .ics (next 90 days)</button></div>';
      var ev = function (x) { return '<button type="button" class="fg-ev" data-open="' + esc(x.entity) + '" data-id="' + esc(x.id) + '" title="' + esc(x.label + ': ' + x.title) + '">' + (x.time ? '<span class="t">' + esc(x.time) + ' </span>' : '') + esc(x.title) + '</button>'; };
      if (st.view === 'month') {
        var mo = a.getUTCMonth();
        h += '<div class="fg-cal">' + C.WEEKDAYS.map(function (w) { return '<div class="h">' + w + '</div>'; }).join('') + days.map(function (d) {
          var list = byDay[d] || [], out = C.parseDay(d).getUTCMonth() !== mo;
          return '<div class="d' + (out ? ' out' : '') + (d === today ? ' today' : '') + '"><span class="n">' + (+d.slice(8)) + '</span>' + list.slice(0, 3).map(ev).join('') + (list.length > 3 ? '<button type="button" class="fg-ev" data-day="' + d + '">+' + (list.length - 3) + ' more</button>' : '') + '</div>';
        }).join('') + '</div>';
      } else {
        h += '<div class="fg-week">' + days.map(function (d, i) { var list = byDay[d] || []; return '<div class="day"><h4' + (d === today ? ' class="warn"' : '') + '>' + C.WEEKDAYS[i] + ' ' + esc(d) + '</h4>' + (list.length ? list.map(function (x) { return ev(x).replace('</button>', ' <span class="small muted">· ' + esc(x.label) + '</span></button>'); }).join('') : '<span class="small muted">Nothing booked</span>') + '</div>'; }).join('') + '</div>';
      }
      el.innerHTML = h;
    }
    panes.cal && panes.cal.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cal],[data-day]'); if (!b) return; var st = calState;
      if (b.dataset.day) { st.view = 'week'; st.anchor = b.dataset.day; }
      var c = b.dataset.cal;
      if (c === 'prev' || c === 'next') { var s = c === 'prev' ? -1 : 1; st.anchor = st.view === 'month' ? C.addMonths(st.anchor.slice(0, 8) + '01', s) : C.addDays(st.anchor, 7 * s); }
      if (c === 'today') st.anchor = localToday();
      if (c === 'month' || c === 'week') st.view = c;
      if (c === 'ics') { var t = localToday(); var evs = C.calendarEvents(cfg, data, t, C.addDays(t, 90)); if (!evs.length) return B.toast('Nothing in the next 90 days'); api.ics(evs.map(function (x) { return { uid: x.entity + '-' + x.id + '-' + x.field, title: x.title + ' (' + x.label + ')', day: x.day, time: x.time, hours: x.hours }; }), cfg.id + '-calendar'); return; }
      renderCal();
    });

    // ---------- reminders ----------
    function renderRem() {
      var el = panes.rem, today = localToday(), items = C.reminders(cfg, data, today);
      var h = '<div class="row fg-toolbar"><button class="btn small" type="button" data-rem="ics"' + (items.length ? '' : ' disabled') + '>Add these to my calendar (.ics)</button></div>' +
        '<p class="small muted">A web page cannot send you alerts while it is closed. Download the .ics file and open it — your phone or computer calendar will then remind you.</p>' +
        '<div class="panel">' + (items.length ? remList(items) : '<p class="muted">Nothing overdue or due soon.</p>') + '</div>' +
        '<h3>Rules</h3><ul class="small">' + (cfg.reminders || []).map(function (r) { var lab = typeof r.label === 'function' ? (r.ruleText || 'Custom reminder') : r.label; return '<li>' + esc(r.ruleText || (lab + ': ' + ents[r.entity].label.toLowerCase() + ' — ' + (C.field(ents[r.entity], r.date).label || r.date) + (r.offsetMonths ? ' + ' + r.offsetMonths + ' months' : '') + (r.offsetDays ? (r.offsetDays > 0 ? ' + ' : ' − ') + Math.abs(r.offsetDays) + ' days' : '') + ', warn ' + (r.warnDays == null ? 14 : r.warnDays) + ' days ahead')) + '</li>'; }).join('') + '</ul>';
      el.innerHTML = h;
      var b = B.$('[data-rem=ics]', el); if (b) b.addEventListener('click', function () { api.ics(items.map(function (r) { return { uid: 'rem-' + r.entity + '-' + r.id + '-' + r.rule, title: r.label + ': ' + r.title, day: r.due < today ? today : r.due, time: r.time, alarmDays: 0 }; }), cfg.id + '-reminders'); });
    }

    // ---------- CSV ----------
    function exportCSV(ek) {
      var e = ents[ek], recs = C.query(e, data[ek], ui[ek], ctx).map(function (r) { return C.compute(e, r, api); }), t = C.toCSV(e, recs, ctx);
      B.download(cfg.id + '-' + ek + '-' + localToday() + '.csv', '﻿' + B.csv.stringify(t.rows, t.headers), 'text/csv;charset=utf-8');
    }
    function importCSV(ek, file) {
      B.readTable(file).then(function (t) {
        var e = ents[ek], res = C.fromCSV(e, t.rows, ctx), ok = 0, upd = 0, bad = res.errors.map(function (x) { return x.row; });
        res.records.forEach(function (r, i) {
          var rowNo = i + 2; if (bad.indexOf(rowNo) >= 0) return;
          var old = api.get(ek, r.id); if (old) { r = Object.assign({}, old, r); upd++; } else ok++;
          api.save(ek, r, true);
        });
        refresh();
        var msg = 'Imported ' + ok + ' new, updated ' + upd + '.' + (res.errors.length ? ' Skipped ' + res.errors.length + ' row(s) with problems — e.g. row ' + res.errors[0].row + ': ' + res.errors[0].message : '');
        B.toast(msg, 7000);
      }).catch(function (er) { B.toast('Could not read that file: ' + er.message, 5000); });
    }

    // ---------- settings ----------
    function renderSettings() {
      var el = panes.set, b = Forge.business.get(), bytes = JSON.stringify(data).length;
      el.innerHTML = '<div class="panel"><h3 style="margin-top:0">Your business details</h3><p class="small muted">Shown on printed quotes, invoices and reports. Shared by all Brahaspati business apps in this browser.</p>' +
        '<div class="fg-form">' + [['name', 'Business name'], ['abn', 'ABN'], ['licence', 'Licence number'], ['phone', 'Phone'], ['email', 'Email']].map(function (x) { return '<div><label for="fb-' + x[0] + '">' + x[1] + '</label><input type="text" id="fb-' + x[0] + '" value="' + esc(b[x[0]] || '') + '"></div>'; }).join('') +
        '<div class="full"><label for="fb-address">Address</label><textarea class="prose" id="fb-address" rows="2" style="min-height:60px">' + esc(b.address || '') + '</textarea></div>' +
        '<div class="full"><label for="fb-payDetails">Payment details (shown on invoices)</label><textarea class="prose" id="fb-payDetails" rows="2" style="min-height:60px" placeholder="BSB 000-000  Account 12345678">' + esc(b.payDetails || '') + '</textarea></div>' +
        '<div class="full"><label>Logo</label>' + (b.logo ? '<img src="' + esc(b.logo) + '" alt="Logo" style="max-height:60px;display:block;margin:4px 0">' : '') + '<div class="row"><label class="btn small" style="font-weight:400;margin:0">Choose logo<input type="file" accept="image/*" hidden id="fb-logo"></label>' + (b.logo ? '<button class="btn small" type="button" id="fb-nologo">Remove logo</button>' : '') + '</div></div></div>' +
        '<div class="row" style="margin-top:12px"><button class="btn primary" type="button" id="fb-save">Save details</button></div></div>' +
        '<div class="panel"><h3 style="margin-top:0">Backup and restore</h3><p class="small">Your records use about ' + (bytes / 1024).toFixed(0) + ' KB of browser storage <span id="fb-est"></span>.</p>' +
        '<label class="fg-check"><input type="checkbox" id="fb-incphotos" checked> Include photos in the backup (bigger file)</label>' +
        '<div class="row" style="margin-top:8px"><button class="btn" type="button" id="fb-backup">Download backup (.json)</button><label class="btn" style="font-weight:400;margin:0">Restore from backup<input type="file" accept=".json,application/json" hidden id="fb-restore"></label></div>' +
        '<p class="small muted">Restoring replaces everything in this app with the backup.</p></div>' +
        '<div class="panel"><h3 style="margin-top:0">Start again</h3><div class="row">' + (cfg.sample ? '<button class="btn" type="button" data-fg="sample">Load sample data</button>' : '') + '<button class="btn" type="button" id="fb-clear">Delete all ' + esc(cfg.name || 'app') + ' data</button></div></div>' +
        '<p class="small muted">There is no login, cloud sync or billing here — this is a free tool that keeps everything on this device. To use it on two devices, move a backup file between them.</p>';
      if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (s) { var x = B.$('#fb-est', el); if (x && s.usage != null) x.textContent = '(this site uses ' + (s.usage / 1048576).toFixed(1) + ' MB in total including photos' + (s.quota ? ', of about ' + Math.round(s.quota / 1048576) + ' MB allowed' : '') + ')'; });
      B.$('#fb-save', el).addEventListener('click', function () {
        var nb = Forge.business.get(); ['name', 'abn', 'licence', 'phone', 'email', 'address', 'payDetails'].forEach(function (k) { nb[k] = B.$('#fb-' + k, el).value.trim(); });
        Forge.business.set(nb); B.toast('Business details saved');
      });
      B.$('#fb-logo', el).addEventListener('change', function (ev) { var f = ev.target.files[0]; if (!f) return; Forge.downscale(f, 400, 0.85).then(function (u) { var nb = Forge.business.get(); nb.logo = u; Forge.business.set(nb); renderSettings(); }, function (er) { B.toast(er.message); }); });
      var nl = B.$('#fb-nologo', el); if (nl) nl.addEventListener('click', function () { var nb = Forge.business.get(); delete nb.logo; Forge.business.set(nb); renderSettings(); });
      B.$('#fb-backup', el).addEventListener('click', function () {
        var inc = B.$('#fb-incphotos', el).checked;
        (inc ? api.photoSrc(C.allPhotoIds(cfg, data)) : Promise.resolve({})).then(function (ph) {
          B.download(cfg.id + '-backup-' + localToday() + '.json', JSON.stringify(C.makeBackup(cfg.id, data, ph)), 'application/json');
        });
      });
      B.$('#fb-restore', el).addEventListener('change', function (ev) {
        var f = ev.target.files[0]; if (!f) return;
        B.readFile(f).then(function (txt) {
          var r = C.readBackup(txt, cfg.id, cfg);
          if (!confirm('Replace all current ' + (cfg.name || '') + ' data with this backup?')) return;
          data = r.data; data._extra = data._extra || {}; persist();
          return Promise.all(Object.keys(r.photos).map(function (id) { return Forge.photos.put(cfg.id, id, r.photos[id]); })).then(function () { B.toast('Backup restored'); refresh(); });
        }).catch(function (er) { B.toast('Could not restore: ' + er.message, 5000); });
      });
      B.$('#fb-clear', el).addEventListener('click', function () {
        if (!confirm('Delete every record in this app? Download a backup first if you might need it.')) return;
        C.allPhotoIds(cfg, data).forEach(function (p) { Forge.photos.del(cfg.id, p); });
        data = {}; ekeys.forEach(function (k) { data[k] = []; }); data._extra = {}; persist(); B.toast('All data deleted'); refresh();
      });
    }
    function loadSample() {
      if (ekeys.some(function (k) { return data[k].length; }) && !confirm('Replace your current data with made-up sample data?')) return;
      var s = cfg.sample(localToday(), api) || {};
      data = { _extra: s._extra || {} }; ekeys.forEach(function (k) { data[k] = (s[k] || []).map(function (r) { return C.compute(ents[k], Object.assign(C.blankRecord(ents[k], null, localToday()), r), api); }); });
      persist(); ekeys.forEach(function (k) { ui[k].open = null; });
      if (cfg.afterSample) cfg.afterSample(api);
      B.toast('Sample data loaded — all names and numbers are made up'); refresh();
    }

    showTab = B.tabs(B.$('.tabs', mount), function (id) { current = id; renderTab(id); });
    api.showTab = showTab;
    return api;
  };

  root.Forge = Forge;
})(this);
