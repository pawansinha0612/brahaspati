/* Digital Product Store — page wiring. Logic lives in lib.js (StoreLib). Images are kept in IndexedDB. */
(function () {
  'use strict';
  var L = window.StoreLib, $ = B.$, $$ = B.$$, esc = B.esc;
  var KEY = 'store:data';
  var DEF = { name: '', tagline: '', about: '', template: 'minimal', currency: 'AUD', contact: '', footer: '', primary: '#b4531b', background: '#ffffff', text: '#1d1f24', emailLink: '', emailText: '', seoTitle: '', seoDescription: '', siteUrl: '', products: [], faq: [], testimonials: [] };
  var data = Object.assign({}, DEF, B.store.get(KEY, {}) || {}), images = {}, timer, deviceW = '';

  // ---------- tiny IndexedDB wrapper (falls back to memory) ----------
  var db = (function () {
    var p = null, mem = {};
    function open() {
      if (p) return p;
      p = new Promise(function (res) {
        try { var r = indexedDB.open('bh-store-builder', 1); r.onupgradeneeded = function () { r.result.createObjectStore('img'); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(null); }; }
        catch (e) { res(null); }
      });
      return p;
    }
    function tx(mode, fn) { return open().then(function (d) { if (!d) return fn(null); return new Promise(function (res, rej) { var t = d.transaction('img', mode), s = t.objectStore('img'), out = fn(s); t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { rej(t.error); }; }); }); }
    return {
      set: function (k, v) { return tx('readwrite', function (s) { if (!s) { mem[k] = v; return; } s.put(v, k); }); },
      del: function (k) { return tx('readwrite', function (s) { if (!s) { delete mem[k]; return; } s.delete(k); }); },
      all: function () { return open().then(function (d) { if (!d) return Object.assign({}, mem); return new Promise(function (res) { var out = {}, c = d.transaction('img').objectStore('img').openCursor(); c.onsuccess = function () { var cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); }; c.onerror = function () { res(out); }; }); }); },
      clear: function () { return tx('readwrite', function (s) { if (!s) { mem = {}; return; } s.clear(); }); }
    };
  })();

  function save() { if (!B.store.set(KEY, data)) B.toast('Could not save — browser storage may be full.', 4000); schedule(); }
  function full() { var s = JSON.parse(JSON.stringify(data)); s.logo = images.logo || ''; s.shareImage = images.share || ''; s.products.forEach(function (p) { p.image = images['p:' + p.id] || ''; }); return s; }
  function showStorage() {
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) { $('#storage').textContent = 'Storage used: ' + (e.usage / 1048576).toFixed(1) + ' MB.'; }).catch(function () {});
  }

  // downscale to max px (JPEG 0.8, or PNG for logos with transparency); SVG kept as is
  function readImage(file, max, keepPng) {
    if (!/^image\//.test(file.type)) return Promise.reject(new Error('Please choose an image file'));
    return B.readFile(file, 'dataurl').then(function (url) {
      if (/svg/.test(file.type)) return url;
      return new Promise(function (res, rej) {
        var im = new Image();
        im.onload = function () {
          var sc = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
          c.width = Math.round(im.naturalWidth * sc); c.height = Math.round(im.naturalHeight * sc);
          var g = c.getContext('2d'); if (!keepPng) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
          g.drawImage(im, 0, 0, c.width, c.height); res(keepPng ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.8));
        };
        im.onerror = function () { rej(new Error('Could not read that image')); }; im.src = url;
      });
    });
  }
  function pickImage(key, max, keepPng, done) {
    var i = B.h('input', { type: 'file', accept: 'image/*' });
    i.addEventListener('change', function () { if (!i.files[0]) return; readImage(i.files[0], max, keepPng).then(function (u) { images[key] = u; return db.set(key, u); }).then(function () { done(); schedule(); showStorage(); }, function (e) { B.toast(e.message, 4000); }); });
    i.click();
  }

  // ---------- store form ----------
  Object.keys(L.TEMPLATES).forEach(function (k) { $('#template').appendChild(B.h('option', { value: k, text: L.TEMPLATES[k] })); });
  function renderStore() {
    $$('[data-f]').forEach(function (el) { el.value = data[el.dataset.f] || DEF[el.dataset.f] || ''; });
    $('#logoPrev').hidden = !images.logo; if (images.logo) $('#logoPrev').src = images.logo;
    $('#sharePrev').hidden = !images.share; if (images.share) $('#sharePrev').src = images.share;
    counts();
  }
  function counts() { $('#seoTitleCount').textContent = '(' + $('#seoTitle').value.length + ')'; $('#seoDescCount').textContent = '(' + $('#seoDescription').value.length + ')'; }
  $$('[data-f]').forEach(function (el) { el.addEventListener('input', function () { data[el.dataset.f] = el.value; counts(); save(); }); });
  $('#logoPick').addEventListener('click', function () { pickImage('logo', 600, true, renderStore); });
  $('#logoDel').addEventListener('click', function () { delete images.logo; db.del('logo').then(function () { renderStore(); schedule(); }); });
  $('#sharePick').addEventListener('click', function () { pickImage('share', 1200, false, renderStore); });
  $('#shareDel').addEventListener('click', function () { delete images.share; db.del('share').then(function () { renderStore(); schedule(); }); });

  // ---------- products ----------
  var PF = [['title', 'Title', 'text', 'full'], ['category', 'Category', 'text'], ['format', 'Format (PDF, XLSX…)', 'text'], ['price', 'Price (0 = free)', 'number'], ['compareAt', 'Was (optional)', 'number'], ['badge', 'Badge (optional)', 'text'],
    ['buyLink', 'Checkout link', 'url', 'full'], ['description', 'Description', 'textarea', 'full']];
  function renderProducts() {
    if (!data.products.length) { $('#prodList').innerHTML = '<p class="muted">No products yet.</p>'; return; }
    $('#prodList').innerHTML = data.products.map(function (p, i) {
      var img = images['p:' + p.id], via = L.provider(p.buyLink);
      return '<div class="prod" data-id="' + esc(p.id) + '"><div class="prod-head"><h3>' + esc(p.title || 'Untitled product') + '</h3>' +
        '<button class="btn small" type="button" data-act="up"' + (i ? '' : ' disabled') + ' aria-label="Move up">↑</button><button class="btn small" type="button" data-act="down"' + (i < data.products.length - 1 ? '' : ' disabled') + ' aria-label="Move down">↓</button>' +
        '<button class="btn small" type="button" data-act="del">Delete</button></div><div class="form-grid">' +
        PF.map(function (f) {
          var id = 'p-' + f[0] + '-' + i, v = p[f[0]] == null ? '' : p[f[0]];
          return '<div class="' + (f[3] || '') + '"><label for="' + id + '">' + esc(f[1]) + (f[0] === 'buyLink' && via ? ' <span class="pill-ok">' + esc(via) + '</span>' : '') + '</label>' +
            (f[2] === 'textarea' ? '<textarea class="prose" id="' + id + '" data-k="' + f[0] + '" style="min-height:70px">' + esc(v) + '</textarea>' : '<input type="' + f[2] + '" id="' + id + '" data-k="' + f[0] + '" value="' + esc(v) + '"' + (f[2] === 'number' ? ' min="0" step="0.01"' : '') + (f[2] === 'url' ? ' placeholder="https://yourname.gumroad.com/l/…"' : '') + '>') + '</div>';
        }).join('') + '</div><div class="img-row">' + (img ? '<img class="thumb" src="' + esc(img) + '" alt="">' : '') + '<button class="btn small" type="button" data-act="img">' + (img ? 'Change image' : 'Add image') + '</button>' + (img ? '<button class="btn small" type="button" data-act="noimg">Remove image</button>' : '') + '</div></div>';
    }).join('');
  }
  function prodOf(el) { var c = el.closest('[data-id]'); return c && data.products.filter(function (p) { return p.id === c.dataset.id; })[0]; }
  $('#prodList').addEventListener('input', function (e) {
    var p = prodOf(e.target), k = e.target.dataset.k; if (!p || !k) return;
    p[k] = e.target.type === 'number' ? (e.target.value === '' ? '' : +e.target.value) : e.target.value;
    if (k === 'title') e.target.closest('.prod').querySelector('h3').textContent = p.title || 'Untitled product';
    save();
  });
  $('#prodList').addEventListener('change', function (e) { if (e.target.dataset.k === 'buyLink') renderProducts(); });
  $('#prodList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return; var p = prodOf(b), i = data.products.indexOf(p), a = b.dataset.act;
    if (a === 'up' || a === 'down') { var j = a === 'up' ? i - 1 : i + 1; data.products.splice(j, 0, data.products.splice(i, 1)[0]); save(); renderProducts(); }
    if (a === 'del' && confirm('Delete “' + (p.title || 'this product') + '”?')) { data.products.splice(i, 1); delete images['p:' + p.id]; db.del('p:' + p.id); save(); renderProducts(); }
    if (a === 'img') pickImage('p:' + p.id, 1600, false, renderProducts);
    if (a === 'noimg') { delete images['p:' + p.id]; db.del('p:' + p.id).then(function () { renderProducts(); schedule(); }); }
  });
  $('#addProd').addEventListener('click', function () { data.products.push({ id: B.uid(), title: '', category: '', format: '', price: '', compareAt: '', badge: '', buyLink: '', description: '' }); save(); renderProducts(); var t = $$('#prodList input[data-k=title]'); t[t.length - 1].focus(); });

  // ---------- FAQ + testimonials ----------
  function renderPairs(listKey, el, a, b, la, lb) {
    var arr = data[listKey];
    $(el).innerHTML = arr.length ? arr.map(function (x, i) {
      return '<div class="pair" data-i="' + i + '"><div><label for="' + listKey + a + i + '">' + la + '</label><input type="text" id="' + listKey + a + i + '" data-k="' + a + '" value="' + esc(x[a] || '') + '"></div>' +
        '<div><label for="' + listKey + b + i + '">' + lb + '</label><textarea class="prose" style="min-height:60px" id="' + listKey + b + i + '" data-k="' + b + '">' + esc(x[b] || '') + '</textarea></div>' +
        '<div><label>&nbsp;</label><button class="btn small" type="button" data-del="1">Remove</button></div></div>';
    }).join('') : '<p class="muted small">None yet.</p>';
    $(el).oninput = function (e) { var r = e.target.closest('[data-i]'); if (!r || !e.target.dataset.k) return; arr[+r.dataset.i][e.target.dataset.k] = e.target.value; save(); };
    $(el).onclick = function (e) { if (!e.target.closest('[data-del]')) return; arr.splice(+e.target.closest('[data-i]').dataset.i, 1); save(); renderExtras(); };
  }
  function renderExtras() { renderPairs('faq', '#faqList', 'q', 'a', 'Question', 'Answer'); renderPairs('testimonials', '#tList', 'name', 'quote', 'Name (and permission!)', 'What they said'); }
  // note: in the store, testimonials show quote then "— name"
  $('#addFaq').addEventListener('click', function () { data.faq.push({ q: '', a: '' }); save(); renderExtras(); });
  $('#addT').addEventListener('click', function () { data.testimonials.push({ quote: '', name: '' }); save(); renderExtras(); });

  // ---------- preview + download ----------
  function schedule() { clearTimeout(timer); timer = setTimeout(renderPreview, 350); }
  function renderPreview() {
    var s = full(), w = L.checks(s);
    $('#checks').innerHTML = w.length ? '<div class="panel"><h3 style="margin-top:0">Before you publish</h3><ul class="small">' + w.map(function (x) { return '<li><span class="' + (x.level === 'bad' ? 'pill-bad' : x.level === 'warn' ? 'pill-warn' : 'pill-ok') + '">' + (x.level === 'bad' ? 'Fix' : x.level === 'warn' ? 'Check' : 'Tip') + '</span> ' + esc(x.msg) + '</li>'; }).join('') + '</ul></div>' : '<p class="ok">Looks ready to publish.</p>';
    $('#preview').srcdoc = L.buildHtml(s);
    $('#preview').style.width = deviceW ? deviceW + 'px' : '100%';
  }
  $('#device').addEventListener('click', function (e) { var b = e.target.closest('[data-w]'); if (!b) return; deviceW = b.dataset.w; $$('#device button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); renderPreview(); });
  function fileBase() { return L.slug(data.name || 'my-store'); }
  $('#dlZip').addEventListener('click', function () { var pkg = L.buildPackage(full(), 'zip'); B.download(fileBase() + '-website.zip', new Blob([pkg.zip], { type: 'application/zip' })); });
  $('#dlHtml').addEventListener('click', function () { B.download('index.html', L.buildPackage(full(), 'html').html, 'text/html;charset=utf-8'); });
  $('#openTab').addEventListener('click', function () { var u = URL.createObjectURL(new Blob([L.buildHtml(full())], { type: 'text/html' })); window.open(u, '_blank', 'noopener'); setTimeout(function () { URL.revokeObjectURL(u); }, 60000); });

  // ---------- backup ----------
  $('#backup').addEventListener('click', function () { B.download(fileBase() + '-store-backup.json', JSON.stringify({ app: 'store-builder', version: 1, exported: new Date().toISOString(), data: data, images: images }), 'application/json'); });
  $('#restore').addEventListener('click', function () {
    var i = B.h('input', { type: 'file', accept: '.json' });
    i.addEventListener('change', function () {
      if (!i.files[0]) return;
      B.readFile(i.files[0]).then(function (t) {
        var j = JSON.parse(t); if (!j || j.app !== 'store-builder' || !j.data) throw new Error('This is not a store backup');
        if (!confirm('Replace your store with this backup (' + (j.data.products || []).length + ' products)?')) return;
        data = Object.assign({}, DEF, j.data); images = j.images || {};
        return db.clear().then(function () { return Promise.all(Object.keys(images).map(function (k) { return db.set(k, images[k]); })); }).then(function () { save(); renderAll(); B.toast('Backup restored'); });
      }).catch(function (e) { B.toast(e.message, 4000); });
    });
    i.click();
  });
  $('#clearAll').addEventListener('click', function () { if (!confirm('Delete the whole store, including images, from this browser?')) return; data = Object.assign({}, DEF, { products: [], faq: [], testimonials: [] }); images = {}; B.store.remove(KEY); db.clear().then(renderAll); });

  $('#sample').addEventListener('click', function () {
    if (data.products.length && !confirm('Replace your store with the sample? Download a backup first if you want to keep it.')) return;
    var s = L.sample(); images = {};
    s.products.forEach(function (p) { images['p:' + p.id] = p.image; delete p.image; });
    data = Object.assign({}, DEF, s);
    db.clear().then(function () { return Promise.all(Object.keys(images).map(function (k) { return db.set(k, images[k]); })); }).then(function () { save(); renderAll(); showTab('preview'); B.toast('Sample store loaded — made-up products and example links'); });
  });

  function renderAll() { renderStore(); renderProducts(); renderExtras(); renderPreview(); showStorage(); }
  var showTab = B.tabs($('[data-tabs="sb"]'), function (id) { if (id === 'preview') renderPreview(); });
  db.all().then(function (all) { images = Object.assign({}, all || {}, images); renderAll(); });
  renderStore(); renderProducts(); renderExtras();
})();
