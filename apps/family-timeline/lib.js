/* Family Memory Timeline — pure logic (no DOM) plus WebCrypto helpers (work in browsers and Node 18+).
   Browser: window.FamilyLib. Node: require(). */
(function (root) {
  'use strict';
  var node = typeof module !== 'undefined' && module.exports;
  var K = node ? require('../home-inventory/vault-kit.js') : root.VaultKit;
  var M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  var MILESTONES = ['First smile', 'First word', 'First steps', 'First tooth', 'First haircut', 'First day of childcare', 'First day of school', 'Lost first tooth', 'Rode a bike',
    'Learned to swim', 'Last day of school', 'Graduation', 'First job', 'Got a driver licence', 'Moved house', 'Engagement', 'Wedding', 'New baby', 'Retirement', 'Other milestone'];

  // ---------- dates: 'YYYY-MM-DD', 'YYYY-MM' or 'YYYY' (+ approx flag) ----------
  function cleanDate(s) {
    s = String(s || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{4}-\d{2}$/.test(s) || /^\d{4}$/.test(s)) return s;
    var m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
    if (m) return m[1] + '-' + K.pad(+m[2]) + (m[3] ? '-' + K.pad(+m[3]) : '');
    return '';
  }
  function precision(d) { return d.length === 10 ? 'day' : d.length === 7 ? 'month' : d.length === 4 ? 'year' : 'none'; }
  function sortKey(m) { var d = m.date || '0000'; return (d + '-00-00').slice(0, 10); }
  function dateLabel(m) {
    var d = m.date || ''; if (!d) return 'Date unknown';
    var p = precision(d), out = p === 'day' ? K.niceDate(d) : p === 'month' ? M[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4) : d;
    return (m.approx ? 'About ' : '') + out;
  }
  function parseTags(s) {
    var seen = {}, out = [];
    String(s || '').split(/[,#]/).forEach(function (t) { t = t.trim().toLowerCase().replace(/\s+/g, ' '); if (t && !seen[t]) { seen[t] = 1; out.push(t); } });
    return out;
  }

  function normalise(o) {
    o = o || {};
    return { id: o.id || '', title: String(o.title || '').trim() || 'Untitled memory', date: cleanDate(o.date), approx: !!o.approx, story: String(o.story || ''),
      people: Array.isArray(o.people) ? o.people.filter(Boolean) : [], tags: Array.isArray(o.tags) ? o.tags : parseTags(o.tags), milestone: String(o.milestone || ''),
      media: Array.isArray(o.media) ? o.media : [], created: o.created || '' };
  }

  // Newest first
  function sorted(memories) { return (memories || []).slice().sort(function (a, b) { return sortKey(b) < sortKey(a) ? -1 : sortKey(b) > sortKey(a) ? 1 : (a.title < b.title ? -1 : 1); }); }

  function filter(memories, f) {
    f = f || {};
    var words = String(f.q || '').toLowerCase().split(/\s+/).filter(Boolean);
    return (memories || []).filter(function (m) {
      if (f.person && m.people.indexOf(f.person) < 0) return false;
      if (f.tag && m.tags.indexOf(f.tag) < 0) return false;
      if (f.milestones && !m.milestone) return false;
      if (f.media === 'photo' && !m.media.some(function (x) { return x.kind === 'photo'; })) return false;
      if (f.media === 'voice' && !m.media.some(function (x) { return x.kind === 'audio'; })) return false;
      if (f.media === 'video' && !m.media.some(function (x) { return x.kind === 'video'; })) return false;
      if (words.length) { var hay = (m.title + ' ' + m.story + ' ' + m.tags.join(' ') + ' ' + m.milestone).toLowerCase(); if (!words.every(function (w) { return hay.indexOf(w) >= 0; })) return false; }
      return true;
    });
  }

  // -> [{year, count, months:[{key:'03'|'', label, items}]}] newest first; year-only memories sit under "Sometime in YYYY"
  function group(memories) {
    var years = {}, out = [];
    sorted(memories).forEach(function (m) {
      var y = (m.date || '').slice(0, 4) || 'Undated', mo = precision(m.date || '') === 'year' || !m.date ? '' : m.date.slice(5, 7);
      if (!years[y]) { years[y] = { year: y, count: 0, months: [], _m: {} }; out.push(years[y]); }
      var Y = years[y]; Y.count++;
      if (!Y._m[mo]) { Y._m[mo] = { key: mo, label: mo ? M[+mo - 1] : (y === 'Undated' ? 'No date' : 'Sometime in ' + y), items: [] }; Y.months.push(Y._m[mo]); }
      Y._m[mo].items.push(m);
    });
    out.forEach(function (Y) { delete Y._m; });
    return out;
  }

  // Exact-date memories from the same day in earlier years
  function onThisDay(memories, today) {
    var md = today.slice(5);
    return (memories || []).filter(function (m) { return precision(m.date) === 'day' && !m.approx && m.date.slice(5) === md && m.date < today; })
      .map(function (m) { return { memory: m, yearsAgo: +today.slice(0, 4) - +m.date.slice(0, 4) }; })
      .sort(function (a, b) { return a.yearsAgo - b.yearsAgo; });
  }

  // "2 years 3 months", "5 months", "12 days"
  function ageAt(dob, date) {
    if (!K.isISO(dob) || !date) return '';
    var d = (date + '-15').slice(0, 10); if (date.length === 4) d = date + '-07-01';
    if (d < dob) return 'before birth';
    var months = (+d.slice(0, 4) - +dob.slice(0, 4)) * 12 + (+d.slice(5, 7) - +dob.slice(5, 7)) - (+d.slice(8, 10) < +dob.slice(8, 10) ? 1 : 0);
    if (months < 1) { var days = K.daysBetween(dob, d); return days === 0 ? 'newborn' : days + (days === 1 ? ' day' : ' days'); }
    var y = Math.floor(months / 12), mo = months % 12;
    if (y >= 5 || !mo) return y ? y + (y === 1 ? ' year' : ' years') : mo + (mo === 1 ? ' month' : ' months');
    return (y ? y + (y === 1 ? ' year ' : ' years ') : '') + mo + (mo === 1 ? ' month' : ' months');
  }

  // Milestones per person, oldest first, with their age at the time
  function milestones(memories, people) {
    return (people || []).map(function (p) {
      var list = (memories || []).filter(function (m) { return m.milestone && m.people.indexOf(p.id) >= 0; })
        .sort(function (a, b) { return sortKey(a) < sortKey(b) ? -1 : 1; })
        .map(function (m) { return { memory: m, age: p.dob ? ageAt(p.dob, m.date) : '' }; });
      return { person: p, items: list };
    });
  }
  function tagCounts(memories) {
    var c = {}; (memories || []).forEach(function (m) { m.tags.forEach(function (t) { c[t] = (c[t] || 0) + 1; }); });
    return Object.keys(c).map(function (t) { return { tag: t, count: c[t] }; }).sort(function (a, b) { return b.count - a.count || (a.tag < b.tag ? -1 : 1); });
  }
  // Photos for the slideshow, oldest first: [{mediaId, memory}]
  function slides(memories) {
    var out = [];
    sorted(memories).reverse().forEach(function (m) { m.media.forEach(function (x) { if (x.kind === 'photo' || x.kind === 'video') out.push({ mediaId: x.id, kind: x.kind, memory: m }); }); });
    return out;
  }

  // ---------- encryption (AES-256-GCM, key from passcode via PBKDF2-SHA256) ----------
  var ITER = 600000;
  function subtle() { var c = (typeof globalThis !== 'undefined' && globalThis.crypto) || root.crypto; if (!c || !c.subtle) throw new Error('This browser has no WebCrypto (use https or a newer browser).'); return c; }
  function randomB64(n) { var u = new Uint8Array(n); subtle().getRandomValues(u); return K.b64FromBytes(u); }
  var enc = function (s) { return new TextEncoder().encode(s); }, dec = function (u) { return new TextDecoder().decode(u); };

  function deriveKey(pass, saltB64, iter) {
    var c = subtle();
    return c.subtle.importKey('raw', enc(String(pass).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return c.subtle.deriveKey({ name: 'PBKDF2', salt: K.bytesFromB64(saltB64), iterations: iter || ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function encryptBytes(key, bytes) {
    var iv = randomB64(12);
    return subtle().subtle.encrypt({ name: 'AES-GCM', iv: K.bytesFromB64(iv) }, key, bytes).then(function (ct) { return { iv: iv, data: new Uint8Array(ct) }; });
  }
  function decryptBytes(key, bytes, ivB64) {
    return subtle().subtle.decrypt({ name: 'AES-GCM', iv: K.bytesFromB64(ivB64) }, key, bytes).then(function (pt) { return new Uint8Array(pt); },
      function () { throw new Error('Wrong passcode, or the data is damaged.'); });
  }
  function encryptJSON(key, obj) { return encryptBytes(key, enc(JSON.stringify(obj))).then(function (r) { return { iv: r.iv, ct: K.b64FromBytes(r.data) }; }); }
  function decryptJSON(key, box) { return decryptBytes(key, K.bytesFromB64(box.ct), box.iv).then(function (u) { return JSON.parse(dec(u)); }); }

  // New vault for `obj` -> {vault:{v,kdf,iter,salt,iv,ct}, key}
  function createVault(pass, obj, iter) {
    if (String(pass || '').length < 6) return Promise.reject(new Error('Use at least 6 characters.'));
    var salt = randomB64(16), it = iter || ITER;
    return deriveKey(pass, salt, it).then(function (key) {
      return encryptJSON(key, obj).then(function (box) { return { vault: { v: 1, kdf: 'PBKDF2-SHA256', cipher: 'AES-256-GCM', iter: it, salt: salt, iv: box.iv, ct: box.ct }, key: key }; });
    });
  }
  // Re-encrypt new data with an already-unlocked key (keeps salt and rounds)
  function sealVault(key, vault, obj) { return encryptJSON(key, obj).then(function (box) { return Object.assign({}, vault, { iv: box.iv, ct: box.ct }); }); }
  function openVault(pass, vault) {
    if (!vault || vault.v !== 1) return Promise.reject(new Error('Unknown vault format.'));
    return deriveKey(pass, vault.salt, vault.iter).then(function (key) { return decryptJSON(key, vault).then(function (data) { return { key: key, data: data }; }); });
  }
  // Media cipher for the IndexedDB store (vault-kit db.setCipher)
  function mediaCipher(key) { return { encrypt: function (u8) { return encryptBytes(key, u8); }, decrypt: function (u8, iv) { return decryptBytes(key, u8, iv); } }; }

  // ---------- printable memory book ----------
  function bookHTML(memories, people, src, opts) {
    opts = opts || {}; var e = K.esc, P = {}; (people || []).forEach(function (p) { P[p.id] = p; });
    var body = group(memories).slice().reverse().map(function (Y) {
      var items = []; Y.months.slice().reverse().forEach(function (mo) { items = items.concat(mo.items.slice().reverse()); });
      return '<h2>' + e(Y.year) + '</h2>' + items.map(function (m) {
        var pics = m.media.filter(function (x) { return x.kind === 'photo' && src[x.id]; }).slice(0, 4).map(function (x) { return '<img src="' + src[x.id] + '" alt="">'; }).join('');
        var who = m.people.map(function (id) { return P[id] ? P[id].name + (P[id].dob && m.date ? ' (' + ageAt(P[id].dob, m.date) + ')' : '') : ''; }).filter(Boolean).join(', ');
        return '<article><h3>' + e(m.title) + '</h3><p class="meta">' + e(dateLabel(m)) + (m.milestone ? ' · ★ ' + e(m.milestone) : '') + (who ? ' · ' + e(who) : '') + '</p>' +
          (pics ? '<div class="pics n' + Math.min(4, m.media.filter(function (x) { return x.kind === 'photo' && src[x.id]; }).length) + '">' + pics + '</div>' : '') +
          (m.story ? '<p>' + e(m.story).replace(/\n/g, '<br>') + '</p>' : '') + (m.media.some(function (x) { return x.kind !== 'photo'; }) ? '<p class="meta">(Includes a voice note or video — see the app.)</p>' : '') + '</article>';
      }).join('');
    }).join('');
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + e(opts.title || 'Our family memories') + '</title><style>' +
      'body{font:15px/1.6 Georgia,serif;color:#222;margin:0 auto;padding:24px;max-width:760px}.cover{text-align:center;padding:30vh 0 20vh;break-after:page}.cover h1{font-size:36px;margin:0}' +
      'h2{font-size:28px;border-bottom:1px solid #999;margin:32px 0 8px;break-after:avoid}article{break-inside:avoid;margin:18px 0}h3{font-size:19px;margin:0}.meta{color:#666;font:13px system-ui,sans-serif;margin:2px 0 8px}' +
      '.pics{display:grid;gap:6px;grid-template-columns:repeat(2,1fr)}.pics.n1{grid-template-columns:1fr}.pics img{width:100%;max-height:420px;object-fit:cover;border-radius:4px}</style></head><body>' +
      '<div class="cover"><h1>' + e(opts.title || 'Our family memories') + '</h1><p>' + e(opts.subtitle || '') + '</p></div>' + body + '</body></html>';
  }

  function sample(today) {
    var y = +today.slice(0, 4), md = today.slice(5);
    var people = [{ id: 'p1', name: 'Grandma June', dob: '1951-06-20', relation: 'Grandmother' }, { id: 'p2', name: 'Sam', dob: (y - 38) + '-03-14', relation: 'Dad' },
      { id: 'p3', name: 'Alex', dob: (y - 37) + '-08-02', relation: 'Mum' }, { id: 'p4', name: 'Mia', dob: (y - 6) + '-01-09', relation: 'Daughter' }];
    var mems = [
      { title: 'Mia is born', date: (y - 6) + '-01-09', people: ['p2', 'p3', 'p4'], tags: 'birthday, hospital', milestone: 'New baby', story: 'Born at 6:42 am, 3.4 kg. Grandma June drove through the night to meet her.' },
      { title: 'First smile', date: (y - 6) + '-03-02', people: ['p4'], milestone: 'First smile', story: 'Dad was singing off-key. She loved it.' },
      { title: 'First steps in the backyard', date: (y - 5) + '-01-20', people: ['p4', 'p3'], tags: 'home', milestone: 'First steps', story: 'Three wobbly steps towards the dog.' },
      { title: 'Christmas at Grandma’s', date: (y - 3) + '-12-25', people: ['p1', 'p2', 'p3', 'p4'], tags: 'christmas, family' , story: 'Pavlova collapsed. Nobody cared.' },
      { title: 'First day of school', date: (y - 1) + '-01-29', people: ['p4'], tags: 'school', milestone: 'First day of school', story: 'Hat too big, backpack bigger. Didn’t look back once.' },
      { title: 'Beach holiday', date: (y - 1) + '-04', people: ['p2', 'p3', 'p4'], tags: 'holiday, beach', story: 'A week of sandcastles and fish and chips.' },
      { title: 'Grandma’s wedding day', date: '1974', approx: true, people: ['p1'], tags: 'wedding, old photos', milestone: 'Wedding', story: 'Told to us many times: it rained, and the cake was lemon.' },
      { title: 'Learned to ride a bike', date: y + '-' + md, people: ['p4', 'p2'], tags: 'outdoors', milestone: 'Rode a bike', story: 'No training wheels! Lap of the park.' },
      { title: 'Sunday pancakes', date: (y - 2) + '-' + md, people: ['p2', 'p4'], tags: 'home, food', story: 'Mia’s first time flipping one. Most of it hit the pan.' }
    ];
    // keep "today" memories in the past
    mems[7].date = K.addDays(today, -1).slice(0, 4) === String(y) ? K.addDays(today, -1) : mems[7].date;
    return { people: people, memories: mems.map(function (m, i) { m.id = 'sm' + i; return normalise(m); }) };
  }

  var L = { MILESTONES: MILESTONES, ITER: ITER, cleanDate: cleanDate, precision: precision, sortKey: sortKey, dateLabel: dateLabel, parseTags: parseTags, normalise: normalise,
    sorted: sorted, filter: filter, group: group, onThisDay: onThisDay, ageAt: ageAt, milestones: milestones, tagCounts: tagCounts, slides: slides,
    deriveKey: deriveKey, encryptBytes: encryptBytes, decryptBytes: decryptBytes, encryptJSON: encryptJSON, decryptJSON: decryptJSON, createVault: createVault, sealVault: sealVault,
    openVault: openVault, mediaCipher: mediaCipher, bookHTML: bookHTML, sample: sample };
  if (node) module.exports = L; else root.FamilyLib = L;
})(this);
