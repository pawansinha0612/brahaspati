/* Creator Autopilot — pure logic (no DOM). Works in the browser (window.CreatorLib) and in Node (require). */
(function (root) {
  'use strict';

  // ---------- seeded randomness ----------
  function hashSeed(s) {
    s = String(s == null ? '' : s); var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var a = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function pick(arr, rand) { return arr[Math.floor(rand() * arr.length)]; }
  function fill(tpl, vars) { return tpl.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null && vars[k] !== '' ? vars[k] : m; }); }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- story concept building blocks (original, generic) ----------
  var GENRES = ['family drama', 'romance', 'mystery', 'slice of life', 'comedy-drama', 'thriller', 'fantasy fable', 'coming of age'];
  var EMOTIONS = ['heartbreak', 'hope', 'regret', 'gratitude', 'betrayal', 'pride', 'loneliness', 'forgiveness', 'joy', 'sacrifice'];
  var SETTINGS = ['a crowded railway platform', 'a small village kitchen', 'a hospital waiting room', 'a rainy city bus stop',
    'a wedding hall after the guests leave', 'a rooftop at dusk', 'a school gate at closing time', 'an old tailor shop',
    'a night-shift call centre', 'a roadside tea stall', 'a quiet temple courtyard', 'a cramped rented flat'];
  var TWISTS = [
    { id: 'hidden-sacrifice', text: 'the person everyone blamed was secretly paying for it all along' },
    { id: 'reversed-roles', text: 'the helper turns out to be the one who needed help' },
    { id: 'old-letter', text: 'an old letter reveals the real reason someone left' },
    { id: 'mistaken-identity', text: 'the stranger is family nobody recognised' },
    { id: 'quiet-witness', text: 'a child saw everything and finally speaks' },
    { id: 'returned-kindness', text: 'a small kindness from years ago comes back at the perfect moment' },
    { id: 'test', text: 'it was a test, and only one person passed' },
    { id: 'wrong-assumption', text: 'the "rude" character was protecting someone the whole time' },
    { id: 'time-skip', text: 'a jump forward shows how one choice changed everything' },
    { id: 'last-message', text: 'a voicemail heard too late changes how the story ends' }
  ];
  var PROTAGONISTS = ['a retired school teacher', 'a young delivery rider', 'a widowed mother', 'a proud grandfather', 'a shy college student',
    'an overworked nurse', 'a street vendor', 'a newly married bride', 'a single father', 'an elder sister who gave up her dreams'];
  var WANTS = ['wants to be seen', 'is hiding a debt', 'is waiting for an apology', 'needs to keep a promise', 'is trying to get home in time',
    'wants one last chance', 'is saving every coin for someone else', 'is afraid of being forgotten'];

  // Generate n concept cards. filters: {genre, emotion}. Same seed -> same list.
  function concepts(seed, n, filters) {
    filters = filters || {}; n = n || 6;
    var rand = rng('concepts:' + seed);
    var g = filters.genre ? [filters.genre] : shuffle(GENRES, rand);
    var e = filters.emotion ? [filters.emotion] : shuffle(EMOTIONS, rand);
    var s = shuffle(SETTINGS, rand), t = shuffle(TWISTS, rand), p = shuffle(PROTAGONISTS, rand), w = shuffle(WANTS, rand);
    var out = [];
    for (var i = 0; i < n; i++) {
      var c = { genre: g[i % g.length], emotion: e[i % e.length], setting: s[i % s.length], twist: t[i % t.length].text,
        twistId: t[i % t.length].id, protagonist: p[i % p.length], want: w[i % w.length] };
      c.logline = cap(c.protagonist) + ', in ' + c.setting + ', ' + c.want + ' — until ' + c.twist + '.';
      c.id = hashSeed(c.logline).toString(36);
      out.push(c);
    }
    return out;
  }

  // ---------- character bible ----------
  function consistencyBlock(ch) {
    if (!ch || !ch.name) return '';
    var parts = [ch.name];
    if (ch.age) parts.push(ch.age + ' years old');
    if (ch.look) parts.push(ch.look);
    if (ch.outfit) parts.push('wearing ' + ch.outfit);
    if (ch.traits) parts.push('personality: ' + ch.traits);
    if (ch.voice) parts.push('voice: ' + ch.voice);
    return '[' + parts.join(', ') + '. Keep face, hair, outfit and age identical in every shot.]';
  }

  // ---------- scene breakdown ----------
  var BEATS = [
    { key: 'hook', label: 'Hook', weight: 0, purpose: 'Stop the scroll: show the most striking image or line first.' },
    { key: 'setup', label: 'Setup', weight: 2, purpose: 'Who is this and what do they want? One clear situation.' },
    { key: 'conflict', label: 'Conflict', weight: 3, purpose: 'Raise the stakes: something stands in the way.' },
    { key: 'turn', label: 'Turn', weight: 2, purpose: 'The twist or reveal that changes how we see it.' },
    { key: 'payoff', label: 'Payoff', weight: 2.5, purpose: 'The emotional landing — let the moment breathe.' },
    { key: 'cta', label: 'Call to action', weight: 0.5, purpose: 'Ask viewers to follow, share or answer a question.' }
  ];
  var LENGTHS = [15, 30, 60, 90];

  function beatText(key, c, chars) {
    var hero = (chars && chars[0] && chars[0].name) || cap(c.protagonist || 'the hero');
    var other = (chars && chars[1] && chars[1].name) || 'someone close';
    var map = {
      hook: 'Close-up of ' + hero + "'s face in " + (c.setting || 'the scene') + ' — a moment of ' + (c.emotion || 'emotion') + ' before we know why.',
      setup: hero + ' ' + (c.want || 'wants something') + '. We see daily life in ' + (c.setting || 'the setting') + '.',
      conflict: 'Things get harder: ' + other + ' misunderstands, and ' + hero + ' is pushed to breaking point.',
      turn: 'The reveal: ' + (c.twist || 'nothing is what it seemed') + '.',
      payoff: hero + ' and ' + other + ' share a silent moment of ' + (c.emotion || 'feeling') + '. Hold on the faces.',
      cta: 'Text on screen: "Would you have done the same?" Follow for part 2.'
    };
    return map[key];
  }

  // Durations: hook is fixed 0–3 s, the rest share the remaining time by weight, rounded to whole seconds.
  function breakdown(lengthSec, concept, chars) {
    lengthSec = Math.max(10, Number(lengthSec) || 30);
    var hookLen = 3, rest = lengthSec - hookLen;
    var beats = BEATS;
    var totalW = beats.reduce(function (s, b) { return s + b.weight; }, 0);
    var t = 0, out = [];
    beats.forEach(function (b, i) {
      var d;
      if (b.key === 'hook') d = hookLen;
      else if (i === beats.length - 1) d = lengthSec - t;
      else { d = Math.max(1, Math.round(rest * b.weight / totalW)); }
      out.push({ beat: b.key, label: b.label, purpose: b.purpose, start: t, end: t + d, dur: d, text: beatText(b.key, concept || {}, chars) });
      t += d;
    });
    // make the last beat absorb rounding, never below 1 s
    var last = out[out.length - 1]; if (last.dur < 1) { var fix = 1 - last.dur; out[out.length - 2].dur -= fix; out[out.length - 2].end -= fix; last.start -= fix; last.dur = 1; }
    return out;
  }

  // ---------- prompts ----------
  var STYLES = {
    cinematic: { label: 'Cinematic realism', img: 'cinematic film still, shallow depth of field, natural skin texture, soft key light, 35mm lens, subtle film grain', vid: 'slow dolly-in, handheld micro-movement, natural motion blur, 24 fps film look' },
    warm: { label: 'Warm emotional', img: 'golden-hour light, warm tones, soft focus background, gentle lens flare, intimate framing', vid: 'slow push-in on faces, gentle breeze in hair and fabric, soft rack focus' },
    anime: { label: 'Anime / illustrated', img: 'hand-drawn anime style, clean line art, painterly background, expressive eyes, soft cel shading', vid: 'subtle parallax, drifting particles, hair and cloth sway, gentle camera pan' },
    pixar: { label: '3D animated family film', img: 'stylised 3D animation, soft global illumination, rounded friendly features, rich colour, detailed textures', vid: 'smooth animated camera move, expressive character acting, bouncy timing' },
    documentary: { label: 'Documentary', img: 'documentary photo, available light, candid moment, muted realistic colour, eye-level framing', vid: 'handheld observational camera, natural pacing, ambient movement in the background' },
    noir: { label: 'Moody night', img: 'low-key lighting, deep shadows, neon and streetlight reflections, rain on surfaces, high contrast', vid: 'slow lateral track, rain falling, flickering light, lingering hold at the end' }
  };
  var PLATFORMS = {
    reels: { label: 'Facebook / Instagram Reels', aspect: '9:16', res: '1080x1920', hashtagLimit: 30, hashtagSuggest: 5, captionMax: 2200 },
    shorts: { label: 'YouTube Shorts', aspect: '9:16', res: '1080x1920', hashtagLimit: 15, hashtagSuggest: 3, captionMax: 5000 },
    tiktok: { label: 'TikTok', aspect: '9:16', res: '1080x1920', hashtagLimit: 10, hashtagSuggest: 5, captionMax: 4000 },
    youtube: { label: 'YouTube (long)', aspect: '16:9', res: '1920x1080', hashtagLimit: 15, hashtagSuggest: 3, captionMax: 5000 },
    feed: { label: 'Instagram / Facebook feed', aspect: '4:5', res: '1080x1350', hashtagLimit: 30, hashtagSuggest: 5, captionMax: 2200 }
  };
  var SHOTS = { hook: 'extreme close-up', setup: 'wide establishing shot', conflict: 'medium shot, tense framing', turn: 'over-the-shoulder reveal', payoff: 'close two-shot', cta: 'clean medium shot with space for text' };

  function charsIn(sceneText, chars) {
    var t = String(sceneText || '').toLowerCase();
    var hit = (chars || []).filter(function (c) { return c.name && t.indexOf(c.name.toLowerCase()) >= 0; });
    return hit.length ? hit : (chars || []).slice(0, 1);
  }
  function imagePrompt(scene, chars, styleKey, platformKey) {
    var st = STYLES[styleKey] || STYLES.cinematic, pf = PLATFORMS[platformKey] || PLATFORMS.reels;
    var who = charsIn(scene.text, chars).map(consistencyBlock).filter(Boolean).join(' ');
    return [SHOTS[scene.beat] || 'medium shot', scene.text, st.img, who, 'aspect ratio ' + pf.aspect + ' (' + pf.res + ')', 'no text, no watermark'].filter(Boolean).join('. ').replace(/\.\./g, '.');
  }
  function videoPrompt(scene, chars, styleKey, platformKey) {
    var st = STYLES[styleKey] || STYLES.cinematic, pf = PLATFORMS[platformKey] || PLATFORMS.reels;
    var who = charsIn(scene.text, chars).map(consistencyBlock).filter(Boolean).join(' ');
    return [scene.dur + ' second shot, ' + (SHOTS[scene.beat] || 'medium shot'), scene.text, 'Camera and motion: ' + st.vid, who, 'Frame for ' + pf.aspect + (pf.aspect === '16:9' ? ' widescreen' : ', keep faces in the centre safe area')].filter(Boolean).join('. ').replace(/\.\./g, '.');
  }

  // ---------- titles, captions, hashtags ----------
  var TITLE_FORMULAS = [
    { id: 'question', tpl: 'Would you forgive {who} after this?' },
    { id: 'pov', tpl: 'POV: you finally learn why {who} {verb}' },
    { id: 'nobody', tpl: 'Nobody noticed what {who} did every night…' },
    { id: 'number', tpl: '3 seconds that changed {who} forever' },
    { id: 'when', tpl: 'When {who} found out the truth' },
    { id: 'my', tpl: 'My {rel} kept this secret for 20 years' },
    { id: 'this', tpl: 'This is why you never judge {who}' },
    { id: 'wait', tpl: 'Wait for the ending… {emotion} hits different' },
    { id: 'they-laughed', tpl: 'They laughed at {who}. Then this happened' },
    { id: 'one-line', tpl: '{Emotion} in one minute 💔' }
  ];
  var RELATIONS = ['mother', 'father', 'sister', 'brother', 'grandmother', 'husband', 'wife', 'son', 'daughter', 'teacher'];
  function titles(concept, opts) {
    concept = concept || {}; opts = opts || {};
    var who = opts.who || (concept.protagonist ? concept.protagonist.replace(/^an? /, 'the ') : 'her');
    var rel = opts.relation || (RELATIONS.filter(function (r) { return String(concept.protagonist || '').indexOf(r) >= 0; })[0]) || 'mother';
    var emotion = concept.emotion || 'heartbreak';
    var vars = { who: who, rel: rel, emotion: emotion, Emotion: cap(emotion), verb: 'stayed silent' };
    return TITLE_FORMULAS.map(function (f) { return { formula: f.id, title: fill(f.tpl, vars) }; });
  }

  var HASHTAG_SETS = {
    general: ['shorts', 'reels', 'viral', 'storytime', 'shortfilm'],
    emotional: ['emotional', 'heartouching', 'emotionalstory', 'tearjerker', 'feelings'],
    family: ['family', 'familystory', 'mother', 'father', 'parents', 'familylove'],
    romance: ['lovestory', 'romance', 'couplegoals', 'truelove'],
    motivation: ['motivation', 'inspiration', 'nevergiveup', 'lifelessons'],
    hindi: ['hindistory', 'hindi', 'kahani', 'hindikahaniya', 'desi'],
    ai: ['aivideo', 'aistory', 'aiart', 'aianimation', 'generativeai'],
    mystery: ['mystery', 'twist', 'suspense', 'plottwist'],
    kids: ['kidsstory', 'moralstory', 'bedtimestory', 'fable']
  };
  // topics: array of set keys; returns de-duplicated tags capped at the platform's limit (suggested count first)
  function hashtags(topics, platformKey, opts) {
    opts = opts || {};
    var pf = PLATFORMS[platformKey] || PLATFORMS.reels, seen = {}, out = [];
    var lists = (topics || []).map(function (t) { return HASHTAG_SETS[t] || []; });
    lists.push(HASHTAG_SETS.general);
    // round-robin so every topic gets represented near the top
    for (var i = 0; i < 10; i++) lists.forEach(function (l) { var tg = l[i]; if (tg && !seen[tg]) { seen[tg] = 1; out.push('#' + tg); } });
    (opts.custom || []).forEach(function (c) { c = String(c).replace(/[^\p{L}\p{N}_]/gu, ''); if (c && !seen[c.toLowerCase()]) { seen[c.toLowerCase()] = 1; out.unshift('#' + c); } });
    var limit = opts.all ? pf.hashtagLimit : pf.hashtagSuggest;
    return { tags: out.slice(0, limit), limit: pf.hashtagLimit, suggested: pf.hashtagSuggest, dropped: Math.max(0, out.length - limit) };
  }

  var CAPTION_TEMPLATES = [
    '{hook}\n\n{line}\n\n{question}',
    '{line} 💔\n\n{question} Tell me in the comments.',
    '{hook} Watch till the end.\n\n{question}'
  ];
  function caption(concept, platformKey, variant) {
    concept = concept || {};
    var pf = PLATFORMS[platformKey] || PLATFORMS.reels;
    var hook = 'Some people carry ' + (concept.emotion || 'pain') + ' quietly.';
    var line = cap(concept.protagonist || 'She') + ' ' + (concept.want || 'kept going') + '… until ' + (concept.twist || 'the truth came out') + '.';
    var question = 'What would you have done?';
    var text = fill(CAPTION_TEMPLATES[(variant || 0) % CAPTION_TEMPLATES.length], { hook: hook, line: line, question: question });
    return text.length > pf.captionMax ? text.slice(0, pf.captionMax - 1) + '…' : text;
  }

  // ---------- calendar ----------
  var STATUSES = ['idea', 'scripted', 'produced', 'posted'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  // Weeks (Monday first) for a month. m is 0-based. Cells outside the month are null.
  function monthGrid(year, month) {
    var first = new Date(Date.UTC(year, month, 1)), days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    var lead = (first.getUTCDay() + 6) % 7, cells = [], weeks = [];
    for (var i = 0; i < lead; i++) cells.push(null);
    for (var d = 1; d <= days; d++) cells.push(iso(year, month, d));
    while (cells.length % 7) cells.push(null);
    for (var w = 0; w < cells.length; w += 7) weeks.push(cells.slice(w, w + 7));
    return weeks;
  }
  function postsByDay(posts) {
    var m = {}; (posts || []).forEach(function (p) { if (p.date) (m[p.date] = m[p.date] || []).push(p); }); return m;
  }

  // ---------- performance ----------
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function perf(posts) {
    var withData = (posts || []).filter(function (p) { return num(p.views) > 0; });
    var rows = withData.map(function (p) {
      var eng = (num(p.likes) + num(p.shares) + num(p.comments)) / num(p.views);
      return { id: p.id, title: p.title, platform: p.platform, date: p.date, views: num(p.views), likes: num(p.likes), shares: num(p.shares),
        comments: num(p.comments), watch: num(p.watch), engagement: eng, shareRate: num(p.shares) / num(p.views) };
    });
    var tot = rows.reduce(function (a, r) { a.views += r.views; a.likes += r.likes; a.shares += r.shares; a.comments += r.comments; a.watch += r.watch; return a; },
      { views: 0, likes: 0, shares: 0, comments: 0, watch: 0 });
    var byPlatform = {};
    rows.forEach(function (r) { var k = r.platform || 'other'; var b = byPlatform[k] = byPlatform[k] || { platform: k, posts: 0, views: 0 }; b.posts++; b.views += r.views; });
    return {
      rows: rows.sort(function (a, b) { return b.views - a.views; }), totals: tot, posts: rows.length,
      avgViews: rows.length ? tot.views / rows.length : 0, avgWatch: rows.length ? tot.watch / rows.length : 0,
      engagement: tot.views ? (tot.likes + tot.shares + tot.comments) / tot.views : 0,
      byPlatform: Object.keys(byPlatform).map(function (k) { var b = byPlatform[k]; b.avgViews = b.views / b.posts; return b; })
    };
  }

  // ---------- backup ----------
  var EMPTY = function () { return { series: { name: '', notes: '' }, savedConcepts: [], characters: [], episodes: [], posts: [] }; };
  function normaliseState(s) {
    var e = EMPTY(); if (!s || typeof s !== 'object') return e;
    Object.keys(e).forEach(function (k) { if (s[k] != null && typeof s[k] === typeof e[k] && Array.isArray(s[k]) === Array.isArray(e[k])) e[k] = s[k]; });
    return e;
  }
  function importBackup(text) {
    var j = typeof text === 'string' ? JSON.parse(text) : text;
    if (!j || j.app !== 'creator-autopilot' || !j.data) throw new Error('This is not a Creator Autopilot backup file.');
    return normaliseState(j.data);
  }
  function exportBackup(state) { return JSON.stringify({ app: 'creator-autopilot', version: 1, exported: new Date().toISOString(), data: state }, null, 2); }

  var L = {
    rng: rng, hashSeed: hashSeed, shuffle: shuffle, pick: pick, fill: fill,
    GENRES: GENRES, EMOTIONS: EMOTIONS, SETTINGS: SETTINGS, TWISTS: TWISTS, BEATS: BEATS, LENGTHS: LENGTHS, STYLES: STYLES, PLATFORMS: PLATFORMS,
    TITLE_FORMULAS: TITLE_FORMULAS, HASHTAG_SETS: HASHTAG_SETS, STATUSES: STATUSES,
    concepts: concepts, consistencyBlock: consistencyBlock, breakdown: breakdown, imagePrompt: imagePrompt, videoPrompt: videoPrompt,
    titles: titles, hashtags: hashtags, caption: caption, monthGrid: monthGrid, postsByDay: postsByDay, perf: perf,
    emptyState: EMPTY, normaliseState: normaliseState, importBackup: importBackup, exportBackup: exportBackup
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.CreatorLib = L;
})(this);
