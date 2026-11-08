/* Family Memory Timeline — page wiring. Logic + encryption in lib.js (FamilyLib); media in IndexedDB via vault-kit.js. */
(function () {
  'use strict';
  var L = window.FamilyLib, K = window.VaultKit, $ = B.$, esc = B.esc;
  var DKEY = 'family:data', VKEY = 'family:vault', db = K.db('family-timeline');
  var VIDEO_CAP = 30 * 1048576, VIDEO_WARN = 10 * 1048576, REC_MAX = 300;
  var data = null, key = null, vault = B.store.get(VKEY, null), editing = null, newMedia = [], editPerson = null;
  var showTab = null, drawStorage = null, saving = Promise.resolve(), rec = null;
  var cryptoOK = !!(window.crypto && window.crypto.subtle);

  function blank() { return { people: [], memories: [] }; }
  function norm(d) { d = d || {}; return { people: d.people || [], memories: (d.memories || []).map(L.normalise) }; }
  // Saves are queued so an older encrypted write can never land after a newer one
  function save() {
    if (key) {
      var snap = JSON.parse(JSON.stringify(data));
      saving = saving.then(function () { return L.sealVault(key, vault, snap); }).then(function (v) { vault = v; if (!B.store.set(VKEY, v)) B.toast('Could not save — storage may be full.', 4000); })
        .catch(function (e) { B.toast('Could not save: ' + e.message, 5000); });
      return saving;
    }
    if (!B.store.set(DKEY, data)) B.toast('Could not save — browser storage may be full. Download a backup.', 4000);
    return Promise.resolve();
  }
  function today() { return K.today(); }
  function person(id) { return data.people.filter(function (p) { return p.id === id; })[0]; }
  function fillMedia(scope) {
    B.$$('[data-mid]', scope).forEach(function (el) { db.url(el.dataset.mid).then(function (u) { if (u) el.src = u; }).catch(function () {}); });
  }

  // ---------- lock screen ----------
  function showLock() {
    $('#app').hidden = true; $('#heroBtns').hidden = true; $('#lockScreen').hidden = false; $('#unlockPass').value = ''; $('#unlockMsg').textContent = '';
    setTimeout(function () { $('#unlockPass').focus(); }, 50);
  }
  function start() {
    $('#lockScreen').hidden = true; $('#app').hidden = false; $('#heroBtns').hidden = false;
    if (!showTab) { showTab = B.tabs($('.tabs')); drawStorage = K.storagePanel($('#storage'), db, { dataBytes: function () { return K.jsonBytes(key ? vault : data); } }); }
    renderAll();
  }
  $('#unlockForm').addEventListener('submit', function (e) {
    e.preventDefault(); $('#unlockBtn').disabled = true; $('#unlockMsg').textContent = 'Checking…';
    L.openVault($('#unlockPass').value, vault).then(function (r) {
      key = r.key; data = norm(r.data); db.setCipher(L.mediaCipher(key)); start();
    }).catch(function (err) { $('#unlockMsg').textContent = err.message; }).then(function () { $('#unlockBtn').disabled = false; });
  });
  $('#lockWipe').addEventListener('click', function () {
    if (!confirm('Delete every memory, photo and voice note on this device? This cannot be undone.')) return;
    db.clear().then(function () { B.store.remove(VKEY); B.store.remove(DKEY); vault = null; key = null; db.setCipher(null); data = blank(); start(); });
  });

  // ---------- timeline ----------
  function currentFilter() { var k = $('#fKind').value; return { person: $('#fPerson').value, tag: $('#fTag').value, q: $('#fQ').value, milestones: k === 'milestones', media: k === 'milestones' ? '' : k }; }
  function renderFilters() {
    var p = $('#fPerson').value, t = $('#fTag').value;
    $('#fPerson').innerHTML = '<option value="">Everyone</option>' + data.people.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>'; }).join('');
    $('#fTag').innerHTML = '<option value="">All tags</option>' + L.tagCounts(data.memories).map(function (x) { return '<option value="' + esc(x.tag) + '">' + esc(x.tag) + ' (' + x.count + ')</option>'; }).join('');
    $('#fPerson').value = person(p) ? p : ''; $('#fTag').value = t; if ($('#fTag').value !== t) $('#fTag').value = '';
  }
  function mediaHTML(m) {
    return m.media.length ? '<div class="media">' + m.media.map(function (x) {
      if (x.kind === 'photo') return '<img data-mid="' + esc(x.id) + '" data-slide="' + esc(x.id) + '" alt="Photo: ' + esc(m.title) + '" loading="lazy">';
      if (x.kind === 'video') return '<video data-mid="' + esc(x.id) + '" controls preload="metadata"></video>';
      return '<audio data-mid="' + esc(x.id) + '" controls preload="none"></audio>';
    }).join('') + '</div>' : '';
  }
  function peopleLine(m) {
    return m.people.map(function (id) { var p = person(id); return p ? esc(p.name) + (p.dob && m.date ? ' <span class="muted">(' + esc(L.ageAt(p.dob, m.date)) + ')</span>' : '') : ''; }).filter(Boolean).join(', ');
  }
  function memHTML(m) {
    return '<div class="panel mem"><h3>' + esc(m.title) + (m.milestone ? ' <span class="star" title="Milestone">★ ' + esc(m.milestone) + '</span>' : '') + '</h3>' +
      '<p class="meta">' + esc(L.dateLabel(m)) + (m.people.length ? ' · ' + peopleLine(m) : '') + '</p>' + mediaHTML(m) +
      (m.story ? '<p class="story">' + esc(m.story) + '</p>' : '') +
      '<div class="row">' + m.tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') +
      '<button class="btn small" type="button" data-edit="' + esc(m.id) + '" style="margin-left:auto">Edit</button><button class="btn small" type="button" data-del="' + esc(m.id) + '">Delete</button></div></div>';
  }
  function renderTimeline() {
    var list = L.filter(data.memories, currentFilter());
    $('#count').textContent = list.length + ' of ' + data.memories.length + ' memories';
    if (!data.memories.length) { $('#timeline').innerHTML = '<div class="panel"><p>No memories yet. Press <b>Add a memory</b> — an old photo and two lines about it is plenty — or <b>Load sample data</b> to look around.</p></div>'; return; }
    $('#timeline').innerHTML = L.group(list).map(function (Y) {
      return '<h2 class="year">' + esc(Y.year) + ' <small>' + Y.count + ' memor' + (Y.count === 1 ? 'y' : 'ies') + '</small></h2><div class="tline">' + Y.months.map(function (mo) {
        return '<p class="month">' + esc(mo.label) + '</p>' + mo.items.map(memHTML).join('');
      }).join('') + '</div>';
    }).join('') || '<p class="muted">Nothing matches these filters.</p>';
    fillMedia($('#timeline'));
  }
  function renderOTD() {
    var o = L.onThisDay(data.memories, today());
    $('#otd').innerHTML = o.length ? '<div class="panel" style="margin-top:14px"><h2 style="margin-top:0">On this day</h2>' + o.map(function (x) {
      return '<p><b>' + x.yearsAgo + ' year' + (x.yearsAgo === 1 ? '' : 's') + ' ago:</b> ' + esc(x.memory.title) + ' <button class="btn small" type="button" data-edit="' + esc(x.memory.id) + '">Open</button></p>';
    }).join('') + '</div>' : '';
  }

  // ---------- editor ----------
  function startEdit(id) {
    var m = id ? data.memories.filter(function (x) { return x.id === id; })[0] : null;
    editing = m ? JSON.parse(JSON.stringify(m)) : L.normalise({ id: B.uid(), date: today(), people: $('#fPerson').value ? [$('#fPerson').value] : [] });
    editing._new = !m; newMedia = [];
    showTab('timeline'); renderEditor(); $('#editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderEditor() {
    var e = editing, ed = $('#editor');
    if (!e) { ed.hidden = true; ed.innerHTML = ''; return; }
    var prec = L.precision(e.date); if (prec === 'none') prec = 'day';
    ed.hidden = false;
    ed.innerHTML = '<h2 style="margin-top:0">' + (e._new ? 'Add a memory' : 'Edit memory') + '</h2><div class="form-grid">' +
      '<div class="full"><label for="m-title">What happened? *</label><input type="text" id="m-title" value="' + esc(e._new ? '' : e.title) + '" placeholder="e.g. First day at the beach"></div>' +
      '<div><label for="m-prec">How exact is the date?</label><select id="m-prec"><option value="day">Exact day</option><option value="month">Month only</option><option value="year">Year only</option></select></div>' +
      '<div><label for="m-date">When</label><input type="date" id="m-date"><input type="month" id="m-month" hidden aria-label="Month"><input type="number" id="m-year" min="1850" max="2100" hidden aria-label="Year"></div>' +
      '<div><label class="check" style="margin-top:34px"><input type="checkbox" id="m-approx"' + (e.approx ? ' checked' : '') + '> Roughly (not sure)</label></div>' +
      '<div><label for="m-milestone">Milestone (optional)</label><select id="m-milestone"><option value="">—</option>' + L.MILESTONES.map(function (x) { return '<option' + (x === e.milestone ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></div>' +
      '<div class="full"><label>Who’s in it?</label><div class="chips">' + (data.people.length ? data.people.map(function (p) { return '<label class="check"><input type="checkbox" data-who="' + esc(p.id) + '"' + (e.people.indexOf(p.id) >= 0 ? ' checked' : '') + '> ' + esc(p.name) + '</label>'; }).join('') : '<span class="small muted">Add family members on the People tab to tag them.</span>') + '</div></div>' +
      '<div class="full"><label for="m-story">The story</label><textarea id="m-story" class="prose" style="min-height:110px" placeholder="Who was there, what was said, why it matters…">' + esc(e.story) + '</textarea></div>' +
      '<div class="full"><label for="m-tags">Tags (comma separated)</label><input type="text" id="m-tags" value="' + esc(e.tags.join(', ')) + '" placeholder="e.g. holiday, beach, grandparents"></div></div>' +
      '<h3>Photos, video and voice</h3><p class="small muted">Photos are shrunk to about 1600 px. Short videos only — up to ' + K.formatBytes(VIDEO_CAP) + ' each (they fill storage fast). Voice notes up to 5 minutes.</p>' +
      '<div class="thumbs" id="m-media"></div><div class="row">' +
      '<span class="btn small file-btn">Take a photo<input type="file" accept="image/*" capture="environment" data-add="photo"></span>' +
      '<span class="btn small file-btn">Choose photos<input type="file" accept="image/*" multiple data-add="photo"></span>' +
      '<span class="btn small file-btn">Add a short video<input type="file" accept="video/*" data-add="video"></span>' +
      '<button class="btn small" type="button" id="rec">● Record a voice note</button></div>' +
      '<div class="row" style="margin-top:14px"><button class="btn primary" type="button" id="m-save">Save memory</button><button class="btn" type="button" id="m-cancel">Cancel</button></div>';
    $('#m-prec').value = prec;
    if (prec === 'day') $('#m-date').value = e.date; else if (prec === 'month') $('#m-month').value = e.date; else $('#m-year').value = e.date;
    precUI();
    $('#m-prec').addEventListener('change', precUI);
    renderMediaEdit();
    B.$$('[data-add]', ed).forEach(function (inp) {
      inp.addEventListener('change', function () {
        var files = [].slice.call(inp.files), kind = inp.dataset.add; inp.value = ''; if (!files.length) return;
        if (kind === 'video') {
          var f = files[0];
          if (f.size > VIDEO_CAP) return B.toast('That video is ' + K.formatBytes(f.size) + ' — the limit is ' + K.formatBytes(VIDEO_CAP) + '. Trim it on your phone first.', 6000);
          if (f.size > VIDEO_WARN && !confirm('This video is ' + K.formatBytes(f.size) + '. Videos use a lot of storage on this device. Add it anyway?')) return;
        }
        B.toast('Saving…');
        addMedia(files, kind);
      });
    });
    $('#rec').addEventListener('click', toggleRec);
    $('#m-save').addEventListener('click', saveMemory);
    $('#m-cancel').addEventListener('click', function () { stopRec(true); newMedia.forEach(function (id) { db.del(id); }); editing = null; renderEditor(); });
  }
  function addMedia(files, kind) {
    var accept = kind === 'photo' ? /^image\// : kind === 'video' ? /^video\// : /^audio\//;
    return K.addFiles(db, files, { accept: accept, maxBytes: kind === 'video' ? VIDEO_CAP : 15 * 1048576 }).then(function (added) {
      if (!editing) { added.forEach(function (m) { db.del(m.id); }); return; }
      added.forEach(function (m) { editing.media.push({ id: m.id, kind: kind, type: m.type, size: m.size }); newMedia.push(m.id); });
      renderMediaEdit();
    }).catch(function (err) { B.toast(err.message, 5000); });
  }
  function precUI() {
    var p = $('#m-prec').value;
    $('#m-date').hidden = p !== 'day'; $('#m-month').hidden = p !== 'month'; $('#m-year').hidden = p !== 'year';
    var cur = $('#m-date').value || $('#m-month').value || $('#m-year').value;
    if (p === 'month' && !$('#m-month').value && cur) $('#m-month').value = String(cur).slice(0, 7).length === 7 ? String(cur).slice(0, 7) : '';
    if (p === 'year' && !$('#m-year').value && cur) $('#m-year').value = String(cur).slice(0, 4);
  }
  function renderMediaEdit() {
    var box = $('#m-media');
    box.innerHTML = editing.media.map(function (x, i) {
      var inner = x.kind === 'photo' ? '<img data-mid="' + esc(x.id) + '" alt="">' : x.kind === 'video' ? '<video data-mid="' + esc(x.id) + '" muted></video>' : '<span>🎙 Voice note<br>' + K.formatBytes(x.size || 0) + '</span>';
      return '<div class="thumb">' + inner + '<button type="button" aria-label="Remove" data-rm="' + i + '">×</button></div>';
    }).join('') || '<span class="small muted">Nothing added yet.</span>';
    fillMedia(box);
    B.$$('[data-rm]', box).forEach(function (b) { b.addEventListener('click', function () { var x = editing.media.splice(+b.dataset.rm, 1)[0]; if (newMedia.indexOf(x.id) >= 0) db.del(x.id); else (editing._drop = editing._drop || []).push(x.id); renderMediaEdit(); }); });
  }
  function readDate() {
    var p = $('#m-prec').value;
    return p === 'day' ? $('#m-date').value : p === 'month' ? $('#m-month').value : String($('#m-year').value || '');
  }
  function saveMemory() {
    var title = $('#m-title').value.trim(); if (!title) { $('#m-title').focus(); return B.toast('Give the memory a title'); }
    if (rec) return B.toast('Stop the recording first');
    var m = L.normalise({ id: editing.id, title: title, date: readDate(), approx: $('#m-approx').checked, story: $('#m-story').value, tags: L.parseTags($('#m-tags').value),
      milestone: $('#m-milestone').value, people: B.$$('[data-who]').filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.who; }), media: editing.media, created: editing.created || new Date().toISOString() });
    (editing._drop || []).forEach(function (id) { db.del(id); });
    var i = data.memories.findIndex(function (x) { return x.id === m.id; });
    if (i >= 0) data.memories[i] = m; else data.memories.push(m);
    save(); editing = null; renderEditor(); renderAll(); B.toast('Saved');
  }
  function delMemory(id) {
    var m = data.memories.filter(function (x) { return x.id === id; })[0]; if (!m) return;
    if (!confirm('Delete "' + m.title + '" and its photos, video and voice notes?')) return;
    m.media.forEach(function (x) { db.del(x.id); });
    data.memories = data.memories.filter(function (x) { return x.id !== id; }); save(); renderAll();
  }

  // ---------- voice notes (MediaRecorder) ----------
  var asking = false;
  function toggleRec() { if (asking) return; if (rec) stopRec(); else startRec(); }
  function startRec() {
    if (!navigator.mediaDevices || !window.MediaRecorder) return B.toast('This browser can’t record audio. You can add an audio file from your phone’s voice recorder instead.', 5000);
    asking = true; $('#rec').textContent = 'Starting microphone…';
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      asking = false;
      if (!editing) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      var chunks = [], mr = new MediaRecorder(stream), t0 = Date.now();
      rec = { mr: mr, stream: stream, timer: null, discard: false };
      mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        var r = rec; rec = null; clearInterval(r.timer); var b = $('#rec'); if (b) { b.dataset.on = '0'; b.textContent = '● Record a voice note'; }
        if (r.discard || !chunks.length) return;
        var type = (mr.mimeType || 'audio/webm').split(';')[0];
        addMedia([new File(chunks, 'voice-note.' + (/mp4/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm'), { type: type })], 'audio');
      };
      mr.start(1000);
      var b = $('#rec'); b.dataset.on = '1';
      rec.timer = setInterval(function () {
        var s = Math.round((Date.now() - t0) / 1000); if ($('#rec')) $('#rec').textContent = '■ Stop recording (' + Math.floor(s / 60) + ':' + K.pad(s % 60) + ')';
        if (s >= REC_MAX) stopRec();
      }, 500);
      b.textContent = '■ Stop recording (0:00)';
    }).catch(function () { asking = false; var b = $('#rec'); if (b) b.textContent = '● Record a voice note'; B.toast('Microphone not available or permission denied.', 4000); });
  }
  function stopRec(discard) { if (!rec) return; rec.discard = !!discard; if (rec.mr.state !== 'inactive') rec.mr.stop(); }

  // ---------- people ----------
  function renderPeople() {
    var ms = L.milestones(data.memories, data.people);
    $('#people').innerHTML = ms.length ? ms.map(function (x) {
      var p = x.person, n = data.memories.filter(function (m) { return m.people.indexOf(p.id) >= 0; }).length;
      return '<div class="panel"><div class="row"><h2 style="margin:0">' + esc(p.name) + '</h2><span class="muted">' + esc(p.relation || '') + (p.dob ? ' · born ' + K.niceDate(p.dob) : '') + ' · ' + n + ' memories</span>' +
        '<button class="btn small" type="button" data-pview="' + esc(p.id) + '">Show on timeline</button><button class="btn small" type="button" data-pedit="' + esc(p.id) + '">Edit</button><button class="btn small" type="button" data-pdel="' + esc(p.id) + '">Remove</button></div>' +
        (x.items.length ? '<h3>Milestones</h3><ul>' + x.items.map(function (i) { return '<li><span class="star">★</span> <b>' + esc(i.memory.milestone) + '</b> — ' + esc(L.dateLabel(i.memory)) + (i.age ? ' (age ' + esc(i.age) + ')' : '') + ': <a href="#" data-edit="' + esc(i.memory.id) + '">' + esc(i.memory.title) + '</a></li>'; }).join('') + '</ul>'
          : '<p class="small muted">No milestones yet — pick one when adding a memory.</p>') + '</div>';
    }).join('') : '<p class="muted">No family members added yet.</p>';
  }

  // ---------- slideshow ----------
  var deck = [], at = 0, timer = null;
  function openShow() {
    deck = L.slides(L.filter(data.memories, currentFilter()));
    if (!deck.length) return B.toast('No photos or videos in these memories yet');
    at = 0; $('#show').showModal(); play(true); drawSlide();
  }
  function drawSlide() {
    var s = deck[at], fig = $('#showFig');
    fig.innerHTML = (s.kind === 'video' ? '<video data-mid="' + esc(s.mediaId) + '" controls autoplay muted playsinline></video>' : '<img data-mid="' + esc(s.mediaId) + '" alt="">') +
      '<figcaption><b>' + esc(s.memory.title) + '</b> · ' + esc(L.dateLabel(s.memory)) + ' <span class="muted">(' + (at + 1) + ' / ' + deck.length + ')</span></figcaption>';
    fillMedia(fig);
  }
  function step(d) { at = (at + d + deck.length) % deck.length; drawSlide(); }
  function play(on) { clearInterval(timer); timer = on ? setInterval(function () { step(1); }, 4000) : null; $('#sPlay').textContent = on ? 'Pause' : 'Play'; }
  $('#sPrev').addEventListener('click', function () { play(false); step(-1); });
  $('#sNext').addEventListener('click', function () { play(false); step(1); });
  $('#sPlay').addEventListener('click', function () { play(!timer); });
  $('#sClose').addEventListener('click', function () { $('#show').close(); });
  $('#show').addEventListener('close', function () { play(false); $('#showFig').innerHTML = ''; });
  $('#show').addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); });
  $('#slideBtn').addEventListener('click', openShow);

  // ---------- memory book ----------
  function bookHTML() {
    var mems = $('#bFiltered').checked ? L.filter(data.memories, currentFilter()) : data.memories;
    if (!mems.length) { B.toast('No memories to put in the book'); return Promise.resolve(null); }
    var ids = []; mems.forEach(function (m) { m.media.filter(function (x) { return x.kind === 'photo'; }).slice(0, 4).forEach(function (x) { ids.push(x.id); }); });
    var src = {};
    return Promise.all(ids.map(function (id) { return db.dataURL(id).then(function (u) { src[id] = u; }).catch(function () {}); }))
      .then(function () { return L.bookHTML(mems, data.people, src, { title: $('#bTitle').value.trim(), subtitle: $('#bSub').value.trim() }); });
  }
  $('#bPrint').addEventListener('click', function () { bookHTML().then(function (h) { if (h) K.printHTML(h); }); });
  $('#bDl').addEventListener('click', function () { bookHTML().then(function (h) { if (h) B.download('memory-book.html', h, 'text/html;charset=utf-8'); }); });

  // ---------- passcode lock ----------
  function renderLock() {
    var el = $('#lockPanel');
    if (!cryptoOK) { el.innerHTML = '<h2 style="margin-top:0">Passcode lock</h2><p class="small">Encryption needs a secure (https) page and a modern browser, which this isn’t — so the lock is unavailable here.</p>'; return; }
    el.innerHTML = '<h2 style="margin-top:0">Passcode lock ' + (key ? '<span class="pill-ok">On — encrypted</span>' : '<span class="pill-warn">Off</span>') + '</h2>' +
      '<p class="small">With a passcode, your memories, photos, videos and voice notes are <b>encrypted</b> on this device (AES-256-GCM, with a key made from your passcode by PBKDF2-SHA256, ' + L.ITER.toLocaleString('en-AU') + ' rounds). Anyone who copies the browser’s files sees only scrambled data.</p>' +
      '<p class="small warn"><b>No recovery:</b> if you forget the passcode, nobody — including us — can open your memories. Keep it somewhere safe. It doesn’t protect against someone using this device while it’s unlocked, or against malware on the device.</p>' +
      (key ? '<div class="row"><button class="btn primary" type="button" id="lockNow">Lock now</button></div>' : '') +
      '<div class="form-grid" style="margin-top:8px"><div><label for="np1">' + (key ? 'New passcode' : 'Choose a passcode') + ' (6+ characters)</label><input type="password" id="np1" autocomplete="new-password"></div>' +
      '<div><label for="np2">Type it again</label><input type="password" id="np2" autocomplete="new-password"></div></div>' +
      '<label class="check" style="margin-top:8px"><input type="checkbox" id="npOk"> I understand a forgotten passcode can’t be recovered</label>' +
      '<div class="row" style="margin-top:10px"><button class="btn' + (key ? '' : ' primary') + '" type="button" id="setLock">' + (key ? 'Change passcode' : 'Turn on passcode lock') + '</button>' +
      (key ? '<button class="btn" type="button" id="offLock">Turn off (decrypt)</button>' : '') + '</div><p class="small muted" id="lockMsg"></p>';
    $('#setLock').addEventListener('click', setLock);
    if (key) { $('#lockNow').addEventListener('click', lockNow); $('#offLock').addEventListener('click', function () { if (confirm('Turn off the passcode? Everything will be stored unencrypted on this device.')) removeLock(false); }); }
  }
  function busy(msg) { var m = $('#lockMsg'); if (m) m.textContent = msg; }
  // Re-write every stored file through the current cipher state. decryptFirst: read with the old cipher, write plain
  function rewriteMedia(toPlain) {
    return db.all().then(function (recs) {
      var n = 0;
      return (recs || []).reduce(function (p, r) {
        return p.then(function () {
          busy('Working on files… ' + (++n) + ' / ' + recs.length);
          if (toPlain) { if (!r.enc) return; return db.get(r.id).then(function (full) { return db.putRaw({ id: full.id, type: full.type, name: full.name, created: full.created, size: full.blob.size, blob: full.blob }); }); }
          if (r.enc) return;
          return db.put({ id: r.id, type: r.type, name: r.name, created: r.created, blob: r.blob });
        });
      }, Promise.resolve());
    });
  }
  function setLock() {
    var a = $('#np1').value, b = $('#np2').value;
    if (a.length < 6) return B.toast('Use at least 6 characters');
    if (a !== b) return B.toast('The two passcodes don’t match');
    if (!$('#npOk').checked) return B.toast('Tick the box to confirm you understand');
    $('#setLock').disabled = true;
    var p = key ? removeLock(true) : Promise.resolve();
    p.then(function () { busy('Making your key…'); return L.createVault(a, data); }).then(function (r) {
      key = r.key; vault = r.vault; db.setCipher(L.mediaCipher(key));
      B.store.set(VKEY, vault); B.store.remove(DKEY);
      return rewriteMedia(false);
    }).then(function () { db.forget(); renderLock(); B.toast('Passcode lock is on — everything is encrypted'); if (drawStorage) drawStorage(); })
      .catch(function (err) { busy('Failed: ' + err.message); $('#setLock').disabled = false; });
  }
  function removeLock(quiet) {
    return saving.then(function () { return rewriteMedia(true); }).then(function () {
      db.setCipher(null); key = null; vault = null; db.forget();
      B.store.set(DKEY, data); B.store.remove(VKEY);
      if (!quiet) { renderLock(); renderAll(); B.toast('Passcode removed — data is no longer encrypted'); }
    });
  }
  function lockNow() {
    saving.then(function () { key = null; data = null; editing = null; db.setCipher(null); db.forget(); $('#timeline').innerHTML = ''; $('#people').innerHTML = ''; $('#otd').innerHTML = ''; renderEditor(); showLock(); });
  }

  // ---------- backup ----------
  $('#backup').addEventListener('click', function () {
    $('#backupMsg').textContent = 'Preparing backup…';
    K.collectMedia(db).then(function (media) {
      var obj = K.makeBackup('family-timeline', data, media), json = JSON.stringify(obj);
      if (!key) return { text: json, files: media.length, enc: false };
      return L.encryptBytes(key, new TextEncoder().encode(json)).then(function (r) {
        return { text: JSON.stringify({ format: 'brahaspati-backup-encrypted', app: 'family-timeline', v: 1, kdf: 'PBKDF2-SHA256', cipher: 'AES-256-GCM', iter: vault.iter, salt: vault.salt, iv: r.iv, ct: K.b64FromBytes(r.data) }), files: media.length, enc: true };
      });
    }).then(function (r) {
      B.download('family-memories-backup-' + today() + (r.enc ? '-encrypted' : '') + '.json', r.text, 'application/json');
      $('#backupMsg').textContent = 'Backup downloaded: ' + data.memories.length + ' memories, ' + r.files + ' files, ' + K.formatBytes(r.text.length) + (r.enc ? ' — encrypted with your current passcode.' : ' — not encrypted; keep it somewhere private.');
    }).catch(function (err) { $('#backupMsg').textContent = 'Backup failed: ' + err.message; });
  });
  $('#restore').addEventListener('change', function () {
    var f = this.files[0]; this.value = ''; if (!f) return;
    B.readFile(f).then(function (text) {
      var o; try { o = JSON.parse(text); } catch (e) { throw new Error('This file is not a backup (it is not valid JSON).'); }
      if (o && o.format === 'brahaspati-backup-encrypted') {
        var pass = $('#restorePass').value; if (!pass) throw new Error('This backup is encrypted — type its passcode in the box below first.');
        return L.deriveKey(pass, o.salt, o.iter).then(function (k) { return L.decryptBytes(k, K.bytesFromB64(o.ct), o.iv); }).then(function (u) { return K.readBackup(new TextDecoder().decode(u), 'family-timeline'); });
      }
      return K.readBackup(o, 'family-timeline');
    }).then(function (o) {
      if (!confirm('Restore this backup (' + (o.data.memories || []).length + ' memories)? It replaces everything here.' + (key ? ' It will be encrypted with your current passcode.' : '')) ) return;
      $('#backupMsg').textContent = 'Restoring…';
      return K.restoreBackup(db, o).then(function (d) { data = norm(d); return save(); }).then(function () { renderAll(); $('#backupMsg').textContent = 'Backup restored.'; B.toast('Backup restored'); });
    }).catch(function (err) { B.toast(err.message, 6000); $('#backupMsg').textContent = err.message; });
  });
  $('#wipe').addEventListener('click', function () {
    if (!confirm('Delete every memory, photo, video and voice note on this device? This cannot be undone.')) return;
    db.clear().then(function () { data = blank(); save(); renderAll(); });
  });

  // ---------- sample (made-up memories + drawn picture cards) ----------
  function card(title, hue) {
    return new Promise(function (res) {
      var c = document.createElement('canvas'); c.width = 960; c.height = 640; var g = c.getContext('2d');
      var gr = g.createLinearGradient(0, 0, 960, 640); gr.addColorStop(0, 'hsl(' + hue + ',70%,72%)'); gr.addColorStop(1, 'hsl(' + ((hue + 50) % 360) + ',65%,45%)');
      g.fillStyle = gr; g.fillRect(0, 0, 960, 640);
      g.fillStyle = 'rgba(255,255,255,.25)'; for (var i = 0; i < 6; i++) { g.beginPath(); g.arc(120 + i * 150, 480 - (i % 2) * 90, 60 + i * 8, 0, 7); g.fill(); }
      g.fillStyle = '#fff'; g.font = 'bold 54px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(title, 480, 300);
      g.font = '28px system-ui, sans-serif'; g.fillText('Sample picture', 480, 360);
      c.toBlob(function (b) { res(b); }, 'image/jpeg', 0.8);
    });
  }
  $('#sample').addEventListener('click', function () {
    if (data.memories.length && !confirm('Replace your memories with a made-up sample family? (This deletes the current memories and photos on this device.)')) return;
    var s = L.sample(today());
    db.clear().then(function () {
      return s.memories.reduce(function (p, m, i) {
        if (i % 3 === 2) return p;
        return p.then(function () { return card(m.title, (i * 47) % 360); }).then(function (blob) {
          var id = 'm' + B.uid(); return db.put({ id: id, type: 'image/jpeg', name: 'sample.jpg', blob: blob }).then(function () { m.media.push({ id: id, kind: 'photo', type: 'image/jpeg', size: blob.size }); });
        });
      }, Promise.resolve());
    }).then(function () { data = s; save(); renderAll(); showTab('timeline'); B.toast('Sample family loaded — all made up'); });
  });

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-edit],[data-del],[data-pedit],[data-pdel],[data-pview],[data-slide]'); if (!t || !data) return;
    e.preventDefault();
    var d = t.dataset;
    if (d.edit) startEdit(d.edit);
    else if (d.del) delMemory(d.del);
    else if (d.slide) { deck = L.slides(L.filter(data.memories, currentFilter())); at = Math.max(0, deck.findIndex(function (x) { return x.mediaId === d.slide; })); $('#show').showModal(); play(false); drawSlide(); }
    else if (d.pview) { $('#fPerson').value = d.pview; showTab('timeline'); renderTimeline(); }
    else if (d.pedit) { var p = person(d.pedit); editPerson = p.id; $('#pTitle').textContent = 'Edit ' + p.name; $('#p-name').value = p.name; $('#p-dob').value = p.dob || ''; $('#p-relation').value = p.relation || ''; $('#pForm').scrollIntoView({ behavior: 'smooth' }); }
    else if (d.pdel) {
      var q = person(d.pdel); if (!confirm('Remove ' + q.name + '? Their memories stay, just untagged.')) return;
      data.people = data.people.filter(function (x) { return x.id !== q.id; }); data.memories.forEach(function (m) { m.people = m.people.filter(function (id) { return id !== q.id; }); }); save(); renderAll();
    }
  });
  $('#pForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var p = { id: editPerson || B.uid(), name: $('#p-name').value.trim(), dob: $('#p-dob').value, relation: $('#p-relation').value.trim() };
    var i = data.people.findIndex(function (x) { return x.id === p.id; }); if (i >= 0) data.people[i] = p; else data.people.push(p);
    save(); clearPerson(); renderAll(); B.toast('Saved');
  });
  function clearPerson() { editPerson = null; $('#pTitle').textContent = 'Add a family member'; $('#pForm').reset(); }
  $('#pClear').addEventListener('click', clearPerson);
  $('#addTop').addEventListener('click', function () { startEdit(null); });
  ['#fPerson', '#fTag', '#fKind', '#fQ'].forEach(function (s) { $(s).addEventListener('input', renderTimeline); });

  function renderAll() { if (!data) return; renderFilters(); renderOTD(); renderTimeline(); renderPeople(); renderLock(); if (drawStorage) drawStorage(); }

  if (vault) showLock(); else { data = norm(B.store.get(DKEY, null) || blank()); start(); }
})();
