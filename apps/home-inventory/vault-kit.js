/* Vault kit — small helpers shared by the personal "vault" apps (Home Inventory, Family Timeline, Life Admin,
   Trip Planner, Subscription Leak Detector). Lives in this folder; other apps load ../home-inventory/vault-kit.js.
   Pure parts (dates, .ics, base64, backup format) work in Node; browser parts (IndexedDB, image downscaling,
   storage panel, printing) are added only when a window exists. */
(function (root) {
  'use strict';
  var K = {};

  // ---------- dates (all ISO 'YYYY-MM-DD', UTC maths so time zones never shift a day) ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  K.pad = pad;
  K.isISO = function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); };
  K.toDay = function (s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5; };
  K.fromDay = function (n) { return new Date(n * 864e5).toISOString().slice(0, 10); };
  K.addDays = function (iso, n) { return K.fromDay(K.toDay(iso) + n); };
  K.daysBetween = function (a, b) { return K.toDay(b) - K.toDay(a); };
  // Adds calendar months; 31 Jan + 1 month = 28/29 Feb (clamped to the month's last day)
  K.addMonths = function (iso, n) {
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1 + Number(n), d = +iso.slice(8, 10);
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return y + '-' + pad(m + 1) + '-' + pad(Math.min(d, last));
  };
  K.today = function (d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  K.niceDate = function (iso) {
    if (!K.isISO(iso)) return iso || '';
    var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return +iso.slice(8, 10) + ' ' + M[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4);
  };

  K.formatBytes = function (n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
    return (n / 1073741824).toFixed(1) + ' GB';
  };
  K.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  K.money = function (n) { return '$' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  // ---------- calendar (.ics, RFC 5545) ----------
  K.icsEscape = function (s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); };
  // Lines longer than 75 octets are folded: CRLF + one space
  function fold(line) {
    var out = [], cur = '', bytes = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], b = unescape(encodeURIComponent(ch)).length;
      if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  function icsStamp(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  // events: [{uid, title, date:'YYYY-MM-DD'} (all day) or {start:'YYYY-MM-DDTHH:MM', end:'…'} (local time), description, location, alarmDays}]
  K.ics = function (events, opts) {
    opts = opts || {};
    var now = icsStamp(opts.now || new Date());
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Brahaspati//' + K.icsEscape(opts.app || 'Vault') + '//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    (events || []).forEach(function (e, i) {
      L.push('BEGIN:VEVENT');
      L.push('UID:' + (e.uid || ('ev' + i)) + '@brahaspati');
      L.push('DTSTAMP:' + now);
      if (e.start) {
        var t = function (s) { return s.replace(/[-:]/g, '').slice(0, 13) + '00'; };
        L.push('DTSTART:' + t(e.start));
        L.push('DTEND:' + t(e.end || e.start));
      } else {
        L.push('DTSTART;VALUE=DATE:' + e.date.replace(/-/g, ''));
        L.push('DTEND;VALUE=DATE:' + K.addDays(e.date, 1).replace(/-/g, ''));
      }
      L.push('SUMMARY:' + K.icsEscape(e.title));
      if (e.description) L.push('DESCRIPTION:' + K.icsEscape(e.description));
      if (e.location) L.push('LOCATION:' + K.icsEscape(e.location));
      if (e.alarmDays != null || e.alarmMinutes != null) {
        L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + K.icsEscape(e.title),
          'TRIGGER:' + (e.alarmMinutes != null ? '-PT' + Math.max(0, e.alarmMinutes) + 'M' : '-P' + Math.max(0, e.alarmDays) + 'D'), 'END:VALARM');
      }
      L.push('END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  };

  // ---------- base64 (works the same in Node and browsers) ----------
  var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  K.b64FromBytes = function (u8) {
    var out = [], i;
    for (i = 0; i + 2 < u8.length; i += 3) {
      var n = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2];
      out.push(A[n >> 18 & 63] + A[n >> 12 & 63] + A[n >> 6 & 63] + A[n & 63]);
    }
    var r = u8.length - i;
    if (r === 1) { var a = u8[i] << 16; out.push(A[a >> 18 & 63] + A[a >> 12 & 63] + '=='); }
    else if (r === 2) { var b = (u8[i] << 16) | (u8[i + 1] << 8); out.push(A[b >> 18 & 63] + A[b >> 12 & 63] + A[b >> 6 & 63] + '='); }
    return out.join('');
  };
  var REV = {}; for (var j = 0; j < A.length; j++) REV[A[j]] = j;
  K.bytesFromB64 = function (s) {
    s = String(s || '').replace(/[^A-Za-z0-9+/]/g, '');
    var len = Math.floor(s.length * 3 / 4), out = new Uint8Array(len), o = 0;
    for (var i = 0; i < s.length; i += 4) {
      var n = (REV[s[i]] << 18) | (REV[s[i + 1]] << 12) | ((REV[s[i + 2]] || 0) << 6) | (REV[s[i + 3]] || 0);
      if (o < len) out[o++] = n >> 16 & 255;
      if (o < len && i + 2 < s.length) out[o++] = n >> 8 & 255;
      if (o < len && i + 3 < s.length) out[o++] = n & 255;
    }
    return out.slice(0, o);
  };

  // ---------- backup file format ----------
  // {format:'brahaspati-backup', app, version:1, exportedAt, data, media:[{id,type,name,size,created,b64}]}
  K.makeBackup = function (app, data, media, now) {
    return { format: 'brahaspati-backup', app: app, version: 1, exportedAt: (now || new Date()).toISOString(), data: data, media: media || [] };
  };
  K.readBackup = function (text, app) {
    var o;
    try { o = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { throw new Error('This file is not a backup (it is not valid JSON).'); }
    if (!o || o.format !== 'brahaspati-backup') throw new Error('This file is not a Brahaspati backup.');
    if (app && o.app !== app) throw new Error('This backup is from a different app (' + o.app + ').');
    if (!o.data || typeof o.data !== 'object') throw new Error('The backup has no data in it.');
    o.media = Array.isArray(o.media) ? o.media.filter(function (m) { return m && m.id && typeof m.b64 === 'string'; }) : [];
    return o;
  };

  // Keep aspect ratio inside a max edge (never upscales)
  K.scaleDims = function (w, h, max) {
    if (!(w > 0 && h > 0)) return { w: 0, h: 0 };
    var s = Math.min(1, max / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = K; return; }

  // ======================= browser only =======================
  // ---------- IndexedDB media store ----------
  // Records: {id, type, name, size, created, blob, enc?, iv?}
  K.db = function (name) {
    var dbp = null, cipher = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise(function (res, rej) {
        if (!root.indexedDB) return rej(new Error('This browser cannot store photos (IndexedDB is off — private window?).'));
        var r = indexedDB.open('bh-' + name, 1);
        r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains('media')) r.result.createObjectStore('media', { keyPath: 'id' }); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { dbp = null; rej(r.error || new Error('Could not open storage')); };
      });
      return dbp;
    }
    function tx(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (res, rej) {
          var t = db.transaction('media', mode), st = t.objectStore('media'), out;
          var req = fn(st);
          if (req) req.onsuccess = function () { out = req.result; };
          t.oncomplete = function () { res(out); };
          t.onerror = t.onabort = function () { rej(t.error || new Error('Storage error (the device may be full)')); };
        });
      });
    }
    var api = {
      setCipher: function (c) { cipher = c; },
      hasCipher: function () { return !!cipher; },
      putRaw: function (rec) { return tx('readwrite', function (st) { return st.put(rec); }); },
      put: function (rec) {
        rec = Object.assign({ created: new Date().toISOString() }, rec);
        if (!cipher) { rec.size = rec.blob.size; delete rec.enc; delete rec.iv; return api.putRaw(rec); }
        return rec.blob.arrayBuffer().then(function (buf) { return cipher.encrypt(new Uint8Array(buf)); }).then(function (r) {
          rec.enc = true; rec.iv = r.iv; rec.blob = new Blob([r.data], { type: 'application/octet-stream' }); rec.size = rec.blob.size;
          return api.putRaw(rec);
        });
      },
      getRaw: function (id) { return tx('readonly', function (st) { return st.get(id); }); },
      get: function (id) {
        return api.getRaw(id).then(function (rec) {
          if (!rec || !rec.enc) return rec;
          if (!cipher) throw new Error('Locked');
          return rec.blob.arrayBuffer().then(function (buf) { return cipher.decrypt(new Uint8Array(buf), rec.iv); }).then(function (bytes) {
            return Object.assign({}, rec, { enc: false, iv: null, blob: new Blob([bytes], { type: rec.type }) });
          });
        });
      },
      del: function (id) { drop(id); return tx('readwrite', function (st) { return st.delete(id); }); },
      all: function () { return tx('readonly', function (st) { return st.getAll(); }); },
      clear: function () { Object.keys(urls).forEach(drop); return tx('readwrite', function (st) { return st.clear(); }); },
      bytes: function () { return api.all().then(function (a) { return (a || []).reduce(function (s, r) { return s + (r.size || 0); }, 0); }); },
      // Object URL for showing an image/video/audio; cached per id
      url: function (id) {
        if (urls[id]) return Promise.resolve(urls[id]);
        return api.get(id).then(function (rec) { if (!rec) return ''; urls[id] = URL.createObjectURL(rec.blob); return urls[id]; });
      },
      dataURL: function (id) {
        return api.get(id).then(function (rec) {
          if (!rec) return '';
          return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { res(''); }; fr.readAsDataURL(rec.blob); });
        });
      },
      forget: function () { Object.keys(urls).forEach(drop); }
    };
    var urls = {};
    function drop(id) { if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; } }
    return api;
  };

  // ---------- image downscaling (~1600px JPEG, quality 0.8) ----------
  K.downscale = function (file, max, quality) {
    max = max || 1600; quality = quality || 0.8;
    if (!/^image\/(jpeg|png|webp|heic|heif|bmp)$/i.test(file.type)) return Promise.resolve(file);
    var load = root.createImageBitmap ? createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(file); }) : new Promise(function (res, rej) {
      var img = new Image(); img.onload = function () { res(img); }; img.onerror = rej; img.src = URL.createObjectURL(file);
    });
    return load.then(function (img) {
      var d = K.scaleDims(img.width, img.height, max), c = document.createElement('canvas');
      c.width = d.w; c.height = d.h;
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, d.w, d.h); g.drawImage(img, 0, 0, d.w, d.h);
      if (img.close) img.close();
      return new Promise(function (res) { c.toBlob(function (b) { res(b && b.size < file.size ? b : file); }, 'image/jpeg', quality); });
    }).catch(function () { return file; });
  };

  // Save picked files: images are downscaled; others kept as they are, up to maxBytes. -> [{id,type,name,size}]
  K.addFiles = function (db, files, opts) {
    opts = opts || {};
    var out = [], skipped = [];
    return files.reduce(function (p, f) {
      return p.then(function () {
        var isImg = /^image\//.test(f.type);
        var cap = opts.maxBytes || 15 * 1048576;
        if (opts.accept && !opts.accept.test(f.type)) { skipped.push(f.name + ' (type not supported)'); return; }
        return (isImg ? K.downscale(f, opts.maxEdge) : Promise.resolve(f)).then(function (blob) {
          if (blob.size > cap) { skipped.push(f.name + ' (' + K.formatBytes(blob.size) + ', limit ' + K.formatBytes(cap) + ')'); return; }
          var rec = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), type: blob.type || f.type || 'application/octet-stream', name: f.name || 'file', blob: blob };
          return db.put(rec).then(function () { out.push({ id: rec.id, type: rec.type, name: rec.name, size: blob.size }); });
        });
      });
    }, Promise.resolve()).then(function () {
      if (skipped.length && root.B) B.toast('Not saved: ' + skipped.join(', '), 5000);
      return out;
    });
  };

  K.blobToB64 = function (blob) { return blob.arrayBuffer().then(function (b) { return K.b64FromBytes(new Uint8Array(b)); }); };
  K.b64ToBlob = function (b64, type) { return new Blob([K.bytesFromB64(b64)], { type: type || 'application/octet-stream' }); };

  // Full backup: data + every stored file as base64 in one JSON file
  K.exportBackup = function (db, app, data, filename) {
    return K.collectMedia(db).then(function (media) {
      var json = JSON.stringify(K.makeBackup(app, data, media));
      B.download(filename || (app + '-backup-' + K.today() + '.json'), json, 'application/json');
      return { files: media.length, bytes: json.length };
    });
  };
  // Every stored file (decrypted if the store has a cipher) as [{id,type,name,size,created,b64}]
  K.collectMedia = function (db) {
    return db.all().then(function (recs) {
      return (recs || []).reduce(function (p, r) {
        return p.then(function (arr) {
          return db.get(r.id).then(function (full) {
            if (!full) return arr;
            return K.blobToB64(full.blob).then(function (b64) { arr.push({ id: full.id, type: full.type, name: full.name, size: full.blob.size, created: full.created, b64: b64 }); return arr; });
          });
        });
      }, Promise.resolve([]));
    });
  };
  // Replaces everything with the backup's contents. -> data
  K.importBackup = function (db, file, app) {
    return B.readFile(file).then(function (text) { return K.restoreBackup(db, K.readBackup(text, app)); });
  };
  // o: a checked backup object (from K.readBackup). Clears the store, writes every file. -> o.data
  K.restoreBackup = function (db, o) {
    return db.clear().then(function () {
      return o.media.reduce(function (p, m) {
        return p.then(function () { return db.put({ id: m.id, type: m.type, name: m.name, created: m.created, blob: K.b64ToBlob(m.b64, m.type) }); });
      }, Promise.resolve());
    }).then(function () { return o.data; });
  };

  // ---------- storage panel: usage, persistent storage request, honest warning ----------
  K.storagePanel = function (el, db, opts) {
    opts = opts || {};
    function draw() {
      var est = navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null);
      var per = navigator.storage && navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(null);
      var mine = db.bytes().catch(function () { return 0; });
      Promise.all([est, per, mine]).then(function (r) {
        var e = r[0], persisted = r[1], bytes = r[2], dataBytes = (opts.dataBytes ? opts.dataBytes() : 0);
        el.innerHTML = '<h2 style="margin-top:0">Storage on this device</h2>' +
          '<div class="stat-row"><div class="stat"><div class="v">' + K.formatBytes(bytes) + '</div><div class="k">Photos and files</div></div>' +
          '<div class="stat"><div class="v">' + K.formatBytes(dataBytes) + '</div><div class="k">Text records</div></div>' +
          (e && e.quota ? '<div class="stat"><div class="v">' + K.formatBytes(e.usage) + '</div><div class="k">Used by this site of ' + K.formatBytes(e.quota) + ' allowed</div></div>' : '') +
          '<div class="stat"><div class="v ' + (persisted ? 'ok' : 'warn') + '">' + (persisted == null ? 'Unknown' : persisted ? 'Protected' : 'Not protected') + '</div><div class="k">Kept when space runs low</div></div></div>' +
          '<p class="small">Everything stays on this device — nothing is uploaded. Browsers may clear site data when the device is low on space unless the site has <b>persistent storage</b>. Ask for it below; the browser may say yes, ask you, or decide on its own (Chrome grants it more often to installed or bookmarked sites).</p>' +
          '<p class="small warn"><b>Important:</b> clearing your browser’s history or site data, uninstalling the browser, or using a private window deletes everything here. Download a backup regularly and keep it somewhere safe (e.g. a USB drive or your own cloud folder).</p>' +
          '<div class="row"><button class="btn" type="button" data-k="persist"' + (persisted ? ' disabled' : '') + '>' + (persisted ? 'Storage is protected' : 'Ask the browser to keep my data') + '</button></div>';
        var b = el.querySelector('[data-k="persist"]');
        if (b) b.addEventListener('click', function () {
          if (!navigator.storage || !navigator.storage.persist) return B.toast('This browser does not support persistent storage. Keep backups.', 4000);
          navigator.storage.persist().then(function (ok) { B.toast(ok ? 'The browser will keep your data' : 'The browser said no for now — keep backups', 4000); draw(); });
        });
      });
    }
    draw();
    return draw;
  };

  // ---------- printing and .ics download ----------
  K.printHTML = function (html) {
    var f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    var d = f.contentWindow.document; d.open(); d.write(html); d.close();
    var go = function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(function () { f.remove(); }, 60000); };
    var imgs = [].slice.call(d.images || []), left = imgs.length;
    if (!left) return setTimeout(go, 150);
    var done = function () { if (--left === 0) setTimeout(go, 100); };
    imgs.forEach(function (i) { if (i.complete) done(); else { i.onload = i.onerror = done; } });
  };
  K.downloadICS = function (name, events, app) {
    if (!events.length) return B.toast('Nothing to add to a calendar yet');
    B.download(name, K.ics(events, { app: app }), 'text/calendar;charset=utf-8');
  };
  // Approximate bytes of the JSON text saved in localStorage
  K.jsonBytes = function (o) { try { return new Blob([JSON.stringify(o)]).size; } catch (e) { return 0; } };

  root.VaultKit = K;
})(typeof window !== 'undefined' ? window : this);
