/* AI Story Studio — pure logic (no DOM). Browser: window.StoryLib (needs phrases.js first). Node: require('./lib.js'). */
(function (root) {
  'use strict';
  var PHRASES = (typeof require === 'function' && typeof module !== 'undefined') ? require('./phrases.js') : (root.StoryPhrases || []);

  // ---------- small text helpers ----------
  function lc(s) { return String(s == null ? '' : s).toLowerCase(); }
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function sentences(text) { return String(text || '').split(/(?<=[.!?।])\s+|\n+/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    var prev = [], cur, i, j; for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) { cur = [i]; for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[b.length];
  }
  function namesOf(ch) { return [ch.name].concat(String(ch.aliases || '').split(',')).map(function (s) { return s.trim(); }).filter(Boolean); }
  // positions of every mention of each character in a string
  function mentions(text, chars) {
    var out = [];
    (chars || []).forEach(function (c) {
      namesOf(c).forEach(function (n) {
        var re = new RegExp('(^|[^\\p{L}])' + esc(n) + '(?![\\p{L}])', 'giu'), m;
        while ((m = re.exec(text))) out.push({ id: c.id, at: m.index + m[1].length, len: n.length });
      });
    });
    return out.sort(function (a, b) { return a.at - b.at; });
  }
  function mentioned(text, ch) { return mentions(text, [ch]).length > 0; }

  // ---------- consistency block ----------
  function consistencyBlock(ch) {
    if (!ch || !ch.name) return '';
    var p = [ch.name]; if (ch.age) p.push(ch.age + ' years old'); if (ch.look) p.push(ch.look); if (ch.outfit) p.push('wearing ' + ch.outfit);
    return '[' + p.join(', ') + ' — same face, hair, age and outfit in every shot]';
  }

  // ---------- continuity checker ----------
  var CLOTHES = ['saree', 'sari', 'kurta', 'kurti', 'shirt', 't-shirt', 'tshirt', 'dress', 'jacket', 'suit', 'dupatta', 'shawl', 'uniform', 'hoodie', 'lehenga', 'dhoti', 'sherwani',
    'salwar', 'blouse', 'coat', 'sweater', 'jeans', 'trousers', 'skirt', 'frock', 'pinafore', 'cap', 'turban', 'pagdi', 'scarf', 'apron', 'vest', 'lungi', 'gown', 'raincoat', 'cardigan', 'overcoat', 'blazer', 'pyjamas', 'nightgown'];
  var COLOURS = ['red', 'blue', 'green', 'yellow', 'white', 'black', 'grey', 'gray', 'pink', 'purple', 'orange', 'brown', 'maroon', 'beige', 'gold', 'golden', 'silver', 'navy', 'cream', 'saffron', 'violet', 'teal', 'olive', 'mustard'];
  var TIMES = ['morning', 'afternoon', 'evening', 'night'];
  var TIME_CUES = { morning: /\b(sunrise|dawn|breakfast|morning sun|first light|early morning)\b/i, night: /\b(midnight|moonlight|moonlit|stars|starry|at night|dark night|pitch dark|lamp ?light|1 ?a\.?m|2 ?a\.?m|3 ?a\.?m)\b/i,
    afternoon: /\b(midday|noon|lunch|afternoon sun|harsh sun)\b/i, evening: /\b(sunset|dusk|twilight|dinner)\b/i };
  var BREAK = /\b(next (day|morning|evening|night|week)|the following (day|morning)|(days|weeks|months|years) later|later that|flash ?back|years ago|meanwhile|tomorrow|that night|hours later|dream|memory|remembers)\b/i;
  var EXIT = /\b(dies|died|passes away|passed away|is killed|was killed|leaves forever|left forever|leaves for good|left for good|is gone forever|never returns|takes (his|her) last breath)\b/i;
  var MEMORY = /\b(photo|photograph|picture|memory|memories|remembers|remembered|flash ?back|dream|dreams|ghost|spirit|letter|voicemail|recording|video call|portrait|garland|funeral|grave|ashes|framed)\b/i;
  var COMMON = ('I God Mum Dad Maa Papa Mummy Dadi Nani Dada Nana Didi Bhai Beta Beti Ji Sir Madam Mr Mrs Ms Dr Diwali Holi Eid Christmas Raksha Bandhan Rakhi Monday Tuesday Wednesday Thursday Friday Saturday Sunday ' +
    'January February March April May June July August September October November December India Delhi Mumbai Kolkata Chennai Bengaluru Bangalore Hyderabad Pune Jaipur Lucknow Patna Varanasi Ganga ' +
    'Hindi English OK TV AI POV CUT INT EXT CLOSE WIDE Camera Scene The A An He She They We You It His Her Their Our My Then When Later Meanwhile Suddenly Outside Inside Next Everyone Nobody Someone').split(' ');

  function nearestOwner(sentence, idx, chars) {
    var ms = mentions(sentence, chars), before = ms.filter(function (m) { return m.at <= idx; });
    return before.length ? before[before.length - 1].id : ms.length ? ms[0].id : null;
  }
  function sceneRef(s, i) { return 'Scene ' + (i + 1) + (s.title ? ' — ' + s.title : ''); }

  function checkContinuity(story, chars) {
    chars = chars || []; var scenes = (story && story.scenes) || [], out = [];
    var byId = {}; chars.forEach(function (c) { byId[c.id] = c; });
    var gone = {}; // charId -> scene index where written out
    function add(level, i, rule, msg, charId) { out.push({ level: level, scene: i, ref: i == null ? 'Story' : sceneRef(scenes[i], i), rule: rule, message: msg, charId: charId || null }); }

    scenes.forEach(function (s, i) {
      var text = String(s.text || ''), ids = s.charIds || [], dlg = s.dialogue || [];
      var allText = text + ' ' + dlg.map(function (d) { return d.line || ''; }).join(' ');
      var flash = BREAK.test(text) && /flash ?back|years ago|memory|dream/i.test(text) || /flash ?back/i.test(s.transition || '');

      // 1. characters who were written out earlier
      chars.forEach(function (c) {
        if (gone[c.id] == null || gone[c.id] >= i) return;
        var inList = ids.indexOf(c.id) >= 0, named = sentences(text).filter(function (x) { return mentioned(x, c); });
        var real = named.filter(function (x) { return !MEMORY.test(x); });
        var speaks = dlg.some(function (d) { return d.charId === c.id; });
        if (!flash && (real.length || speaks || (inList && !named.length))) {
          add('warn', i, 'written-out', c.name + ' appears here but was written out in ' + sceneRef(scenes[gone[c.id]], gone[c.id]) + '. If this is a memory or flashback, say so in the scene (e.g. “flashback”, “photo”, “remembers”).', c.id);
        }
      });

      // 2. outfit and age against the bible (skip flashbacks, where looks can differ)
      sentences(text).forEach(function (sent) {
        var low = lc(sent);
        if (!flash && !/\bchang(e|es|ed|ing) (in)?to\b|\bnew (outfit|clothes)\b|\bputs on\b/i.test(sent)) {
          CLOTHES.forEach(function (w) {
            var re = new RegExp('(?:\\b(' + COLOURS.join('|') + ')\\s+)?(?:[a-z-]+\\s+)?\\b' + esc(w) + 's?\\b', 'gi'), m;
            while ((m = re.exec(low))) {
              var owner = nearestOwner(sent, m.index, chars); if (!owner) continue;
              var bible = lc(byId[owner].outfit); if (!bible) continue;
              var wearing = /\b(wear|wears|wearing|in (a|an|her|his)|dressed)\b/.test(low) || m[1];
              if (!wearing) continue;
              var syn = w === 'sari' ? 'saree' : w === 'saree' ? 'sari' : w;
              if (bible.indexOf(w) < 0 && bible.indexOf(syn) < 0) add('warn', i, 'outfit', byId[owner].name + ' is described in a ' + (m[1] ? m[1] + ' ' : '') + w + ', but the character bible says “' + byId[owner].outfit + '”.', owner);
              else if (m[1] && bible.indexOf(m[1]) < 0) add('warn', i, 'outfit', byId[owner].name + '’s ' + w + ' is ' + m[1] + ' here, but the character bible says “' + byId[owner].outfit + '”.', owner);
            }
          });
        }
        if (!flash) {
          var ageRe = /(\d{1,3})[\s-]*(?:year|yr)s?[\s-]*old|\baged?\s+(\d{1,3})\b|,\s*(\d{1,3})\s*,|\((\d{1,3})\)/gi, a;
          while ((a = ageRe.exec(sent))) {
            var n = +(a[1] || a[2] || a[3] || a[4]), who = null;
            if (a[1] || a[2]) { // "68-year-old Kamla" / "aged 68" — prefer the name right after
              var after = mentions(sent, chars).filter(function (m) { return m.at >= a.index + a[0].length && m.at - (a.index + a[0].length) <= 25; })[0];
              who = after ? after.id : nearestOwner(sent, a.index, chars);
            } else who = nearestOwner(sent, a.index, chars);
            if (!who || !byId[who].age) continue;
            if (Math.abs(n - Number(byId[who].age)) > 1) add('warn', i, 'age', byId[who].name + ' is said to be ' + n + ' here, but the character bible says ' + byId[who].age + '.', who);
          }
        }
        // written out by the text itself
        if (EXIT.test(sent) && !/\b(almost|nearly|thought|fear|afraid|if)\b/i.test(sent)) {
          var ex = EXIT.exec(sent), dead = nearestOwner(sent, ex.index, chars);
          if (dead && gone[dead] == null) gone[dead] = i;
        }
      });
      (s.writtenOut || []).forEach(function (id) { if (gone[id] == null) gone[id] = i; });

      // 3. names: unassigned, missing, unknown, misspelt
      chars.forEach(function (c) {
        var named = mentioned(allText, c), listed = ids.indexOf(c.id) >= 0, speaks = dlg.some(function (d) { return d.charId === c.id; });
        if (named && !listed && !speaks && gone[c.id] == null) add('info', i, 'unlisted', c.name + ' is mentioned but not ticked as being in this scene, so their look will not be added to the prompts.', c.id);
        if (listed && !named && !speaks) add('info', i, 'unnamed', c.name + ' is in this scene but never named in the text — the video tool may not know who is who.', c.id);
      });
      if (!ids.length && !mentions(allText, chars).length && text.trim()) add('info', i, 'no-characters', 'No characters are named or ticked in this scene.');
      dlg.forEach(function (d, k) {
        if (!d.charId || !byId[d.charId]) add('warn', i, 'speaker', 'Dialogue line ' + (k + 1) + ' (“' + String(d.line || '').slice(0, 40) + '”) has no speaker.');
        else if (ids.indexOf(d.charId) < 0 && gone[d.charId] == null) add('info', i, 'speaker', byId[d.charId].name + ' speaks but is not ticked as being in this scene.', d.charId);
      });
      var known = {}; chars.forEach(function (c) { namesOf(c).forEach(function (n) { known[lc(n)] = c; }); });
      sentences(text).forEach(function (sent) {
        var words = sent.match(/\b[A-Z][a-z]{2,}\b/g) || [];
        words.forEach(function (w, k) {
          if (known[lc(w)] || COMMON.indexOf(w) >= 0) return;
          var start = k === 0 && sent.replace(/^[“"'‘(]+/, '').indexOf(w) === 0;
          var close = chars.filter(function (c) { return namesOf(c).some(function (n) { return n.length >= 4 && lev(lc(n), lc(w)) <= (n.length >= 6 ? 2 : 1); }); })[0];
          if (close) add('warn', i, 'spelling', '“' + w + '” looks like a misspelling of ' + close.name + '.', close.id);
          else if (!start) add('info', i, 'unknown-name', '“' + w + '” looks like a name but is not in your character library.');
        });
      });

      // 4. time of day and location jumps
      if (s.time) {
        Object.keys(TIME_CUES).forEach(function (t) {
          if (t !== s.time && TIME_CUES[t].test(text) && Math.abs(TIMES.indexOf(t) - TIMES.indexOf(s.time)) >= 2) add('warn', i, 'time', 'The text suggests ' + t + ' (“' + TIME_CUES[t].exec(text)[0] + '”), but the scene is set in the ' + s.time + '.');
        });
      }
      if (i > 0) {
        var p = scenes[i - 1], marker = BREAK.test(text) || BREAK.test(s.transition || '');
        if (p.time && s.time && TIMES.indexOf(s.time) < TIMES.indexOf(p.time) && !marker)
          add('warn', i, 'time', 'Time jumps backwards from ' + p.time + ' to ' + s.time + ' with no “next day”, “later” or “flashback” cue.');
        var shared = (s.charIds || []).filter(function (id) { return (p.charIds || []).indexOf(id) >= 0; });
        if (p.location && s.location && lc(p.location) !== lc(s.location) && p.time === s.time && shared.length && !marker && !/\b(walk|walks|run|runs|rush|rushes|drive|drives|travel|arrive|arrives|reach|reaches|enter|enters|bus|train|auto|taxi|later)\b/i.test(text + ' ' + (s.transition || '')))
          add('info', i, 'location', shared.map(function (id) { return byId[id] ? byId[id].name : '?'; }).join(' and ') + (shared.length === 1 ? ' jumps' : ' jump') + ' from ' + p.location + ' to ' + s.location + ' in the same ' + s.time + ' with no travel or transition shown.');
      }
    });
    return out;
  }

  // ---------- prompts & export presets ----------
  var SHOT_FOR = ['wide establishing shot', 'medium shot', 'close-up', 'over-the-shoulder shot', 'two-shot', 'extreme close-up'];
  var CAMERAS = { 'static': 'locked-off static camera', 'push': 'slow push-in', 'pull': 'slow pull-back', 'pan': 'gentle pan', 'handheld': 'subtle handheld movement', 'orbit': 'slow orbit around the subject', 'tilt': 'slow tilt up' };
  var LIGHT = { morning: 'soft morning light', afternoon: 'bright natural daylight', evening: 'warm golden-hour light', night: 'low warm practical light, deep shadows' };
  function sceneChars(s, chars) {
    var ids = (s.charIds || []).slice();
    mentions(s.text || '', chars).forEach(function (m) { if (ids.indexOf(m.id) < 0) ids.push(m.id); });
    return chars.filter(function (c) { return ids.indexOf(c.id) >= 0; });
  }
  function firstSentence(t) { return sentences(t)[0] || ''; }
  var PRESETS = {
    long: { label: 'Text-to-video (long prompt)', note: 'One detailed paragraph per scene. Suits tools such as Runway, Kling, Sora and Veo.' },
    motion: { label: 'Image-to-video (motion only)', note: 'You give the tool a still image, so the prompt only describes movement and camera. Suits image-to-video modes in tools such as Kling, Runway and Pika.' },
    tags: { label: 'Short-tag style', note: 'Comma-separated keywords, for tools that prefer short tag prompts.' },
    image: { label: 'Still image (with negative prompt)', note: 'Key frame for each scene, to generate first and then animate.' },
    voice: { label: 'Dialogue / voice-over script', note: 'Lines per scene for text-to-speech or lip-sync tools.' }
  };
  function scenePrompt(preset, s, i, chars, opts) {
    opts = opts || {}; var cs = sceneChars(s, chars), style = opts.style || 'cinematic realism, natural skin texture, 35mm film look', aspect = opts.aspect || '9:16';
    var cam = CAMERAS[s.camera] || CAMERAS.push, light = LIGHT[s.time] || 'natural light', where = (s.location || 'the scene') + (s.time ? ', ' + s.time : '');
    var blocks = cs.map(consistencyBlock).join(' ');
    var lines = (s.dialogue || []).filter(function (d) { return d.line; });
    switch (preset) {
      case 'motion':
        return 'Motion: ' + (firstSentence(s.text) || 'subtle natural movement') + ' Camera: ' + cam + '. Keep faces, clothing and background exactly as in the image; small natural movements only (breathing, blinking, hair and fabric moving).' + (s.duration ? ' Length: ' + s.duration + ' s.' : '');
      case 'tags':
        return [SHOT_FOR[i % SHOT_FOR.length], s.location, s.time, light].concat(cs.map(function (c) { return [c.name, c.age ? c.age + ' years old' : '', c.outfit].filter(Boolean).join(' '); }))
          .concat([s.mood || 'emotional', style.split(',')[0], cam, aspect]).filter(Boolean).join(', ');
      case 'image':
        return SHOT_FOR[i % SHOT_FOR.length] + ' of ' + (s.text || where) + ' Setting: ' + where + ', ' + light + '. ' + blocks + ' Style: ' + style + '. Aspect ratio ' + aspect + '.\nNegative prompt: extra fingers, deformed hands, blurry face, changing outfit, text, watermark, logo.';
      case 'voice':
        return lines.length ? lines.map(function (d) { var c = chars.filter(function (x) { return x.id === d.charId; })[0]; return (c ? c.name.toUpperCase() + (c.voice ? ' (' + c.voice + ')' : '') : 'NARRATOR') + ': ' + d.line + (d.hindi ? '\n   [Hindi: ' + d.hindi + ']' : ''); }).join('\n') : '(no dialogue)';
      default:
        return SHOT_FOR[i % SHOT_FOR.length] + ' in ' + where + '. ' + (s.text || '') + ' ' + blocks + ' Lighting: ' + light + '. Camera: ' + cam + '. Mood: ' + (s.mood || 'emotional, intimate') + '. Style: ' + style + '. Aspect ratio ' + aspect + ', keep faces in the centre.' +
          (lines.length ? ' Dialogue: ' + lines.map(function (d) { var c = chars.filter(function (x) { return x.id === d.charId; })[0]; return (c ? c.name : 'Someone') + ' says “' + d.line + '”'; }).join('; ') + '.' : '');
    }
  }
  function exportPrompts(story, chars, preset, opts) {
    return (story.scenes || []).map(function (s, i) { return { scene: i + 1, title: s.title || '', prompt: scenePrompt(preset, s, i, chars, opts).replace(/\s+\./g, '.').replace(/ {2,}/g, ' ') }; });
  }
  function toMarkdown(story, chars, preset, opts) {
    var p = PRESETS[preset] || PRESETS.long;
    return '# ' + (story.title || 'Untitled story') + '\n\n' + (story.logline ? story.logline + '\n\n' : '') + '_Format: ' + p.label + '_\n\n## Characters\n\n' +
      chars.map(function (c) { return '- ' + consistencyBlock(c) + (c.voice ? ' Voice: ' + c.voice + '.' : ''); }).join('\n') + '\n\n' +
      exportPrompts(story, chars, preset, opts).map(function (x) { return '## Scene ' + x.scene + (x.title ? ' — ' + x.title : '') + '\n\n```\n' + x.prompt + '\n```\n'; }).join('\n');
  }
  function toCSV(story, chars, preset, opts, stringify) {
    var rows = exportPrompts(story, chars, preset, opts).map(function (x, i) {
      var s = story.scenes[i]; return { scene: x.scene, title: x.title, location: s.location || '', time: s.time || '', characters: sceneChars(s, chars).map(function (c) { return c.name; }).join('; '), prompt: x.prompt };
    });
    return stringify(rows, ['scene', 'title', 'location', 'time', 'characters', 'prompt']);
  }

  // ---------- hooks & endings ----------
  var HOOKS = [
    '{name} had one night to tell the truth.', 'Nobody in this house knew what {name} kept in that old tin box.', 'This is the last time {name} will see {other}.',
    'Everyone laughed at {name}. Nobody laughs now.', '{name} found a letter that was never meant for {pronoun}.', 'At 2 a.m., {name}’s phone rang. It was {other}.',
    '“Don’t tell {other},” {name} whispered.', '{name} saved every coin for 20 years. Here’s why.', 'One small lie. One broken family.', '{other} walked in and saw everything.',
    'Watch {name}’s hands, not {pronoun2} face.', '{name} smiled for the photo. Five minutes later, it all fell apart.'
  ];
  var ENDINGS = {
    twist: ['The stranger was {name}’s own {rel} all along.', 'The money {other} blamed {name} for — {name} had been sending it to {other} every month.', 'The letter was written by {other}, not {name}.', 'It was a test — and only {name} passed.', 'The person {name} was protecting was {other}.'],
    emotional: ['{name} finally says the words: “I’m sorry.” {other} just holds {pronoun} tight.', '{other} reads the last line, and quietly cries.', '{name} sits in the empty room, holding {other}’s old shawl.', 'Years later, {other} keeps {name}’s promise.', '{name} and {other} share one last cup of tea, in silence.'],
    cliffhanger: ['A knock at the door. {name} freezes — it’s {other}.', 'The phone screen lights up: one missed call from a number {name} thought was gone forever.', '{other} opens the box… and goes pale. (Part 2 tomorrow.)', '{name} turns around — and someone is already standing there.', '“There is one more thing you don’t know,” {other} says.'],
    moral: ['Never judge someone by what they wear.', 'A parent’s silence is often their sacrifice.', 'Kindness always finds its way back to you.', 'Say the important words while you still can.', 'Family is who stays when it gets hard.']
  };
  function fillT(t, v) { return t.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); }
  function hooks(chars) {
    var v = vars(chars); return HOOKS.map(function (h) { return fillT(h, v); });
  }
  function endings(type, chars) {
    var v = vars(chars); return (ENDINGS[type] || []).map(function (h) { return fillT(h, v); });
  }
  function vars(chars) {
    var a = (chars && chars[0]) || { name: 'She' }, b = (chars && chars[1]) || { name: 'her son' };
    var female = /\b(she|her|woman|girl|mother|maa|grandmother|dadi|nani|sister|didi|wife|daughter|saree|sari)\b/i.test([a.look, a.outfit, a.traits, a.gender].join(' '));
    return { name: a.name, other: b.name, pronoun: female ? 'her' : 'him', pronoun2: female ? 'her' : 'his', rel: 'brother' };
  }

  // ---------- phrasebook lookup ----------
  function romNorm(s) {
    return lc(s).replace(/[’'`]/g, '').replace(/[^a-z\s]/g, ' ').replace(/chh/g, 'ch').replace(/([bcdgjkpt])h/g, '$1')
      .replace(/aa+/g, 'a').replace(/ee+|ii+/g, 'i').replace(/oo+|uu+/g, 'u').replace(/w/g, 'v').replace(/z/g, 'j').replace(/q/g, 'k').replace(/ph/g, 'f')
      .replace(/\s+/g, ' ').trim();
  }
  function hiNorm(s) { return String(s || '').replace(/[़ँं]/g, '').replace(/[^ऀ-ॿ\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function enNorm(s) { return lc(s).replace(/[’']/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
  var EN_STOP = { the: 1, a: 1, an: 1, to: 1, of: 1, is: 1, are: 1, so: 1, it: 1, and: 1, please: 1, i: 1, am: 1, im: 1, m: 1, you: 1, me: 1, my: 1, be: 1, will: 1, ill: 1, re: 1, s: 1 };
  function tokenScore(q, t, fuzzy) {
    if (!q.length || !t.length) return 0; var used = {}, hit = 0;
    q.forEach(function (w) {
      for (var j = 0; j < t.length; j++) {
        if (used[j]) continue;
        if (t[j] === w || (fuzzy && w.length >= 4 && t[j].length >= 4 && lev(w, t[j]) <= 1)) { used[j] = 1; hit += t[j] === w ? 1 : 0.8; break; }
      }
    });
    return 2 * hit / (q.length + t.length);
  }
  function detectScript(q) { return /[ऀ-ॿ]/.test(q) ? 'hi' : 'latin'; }
  // Returns best phrasebook matches with a 0–1 score. Searches Hindi, Hinglish and English.
  function lookup(query, opts) {
    opts = opts || {}; var limit = opts.limit || 5, q = String(query || '').trim(); if (!q) return [];
    var script = detectScript(q), list = opts.phrases || PHRASES;
    var qh = hiNorm(q).split(' '), qr = romNorm(q).split(' ').filter(Boolean), qe = enNorm(q).split(' ').filter(function (w) { return w && !EN_STOP[w]; });
    return list.map(function (p) {
      var s;
      if (script === 'hi') s = tokenScore(qh, hiNorm(p.hi).split(' '), false);
      else {
        var r = tokenScore(qr, romNorm(p.rom).split(' '), true);
        var e = tokenScore(qe, enNorm(p.en).split(' ').filter(function (w) { return !EN_STOP[w]; }), true);
        s = Math.max(r, e * 0.95); p = Object.assign({ via: r >= e ? 'hinglish' : 'english' }, p);
      }
      return Object.assign({ score: s }, p);
    }).filter(function (x) { return x.score >= (opts.min || 0.34); }).sort(function (a, b) { return b.score - a.score; }).slice(0, limit);
  }
  // Line-by-line helper: for each sentence, the best phrasebook match (if any good one exists)
  function translateLines(text) {
    return sentences(text).map(function (line) { var m = lookup(line, { limit: 3 }); return { line: line, best: m[0] && m[0].score >= 0.6 ? m[0] : null, others: m }; });
  }
  // Suggest dialogue for a scene from the phrasebook, by words in the scene text
  var MOOD_WORDS = { sorry: ['forgive', 'sorry', 'wrong', 'fault'], miss: ['miss', 'empty', 'alone'], angry: ['lie', 'betray', 'truth', 'leave'], hope: ['right', 'worry', 'promise', 'heart'],
    reveal: ['truth', 'knew', 'letter', 'money', 'test'], goodbye: ['goodbye', 'go', 'leave', 'stay'], proud: ['proud', 'grown', 'pride'] };
  var MOOD_CUES = { sorry: /sorry|forgive|apolog|regret|mistake/i, miss: /miss|alone|lonely|empty|gone|waits?/i, angry: /angry|shout|snap|slam|lie|lied|betray|argue/i, hope: /hope|smile|comfort|hug|hold/i,
    reveal: /reveal|truth|secret|letter|receipt|discover|finds?|found/i, goodbye: /goodbye|leav|station|platform|train|last/i, proud: /proud|result|first salary|graduat|report card|award/i };
  function suggestDialogue(scene, n) {
    var t = String((scene && scene.text) || ''), moods = Object.keys(MOOD_CUES).filter(function (k) { return MOOD_CUES[k].test(t); });
    if (!moods.length) moods = ['hope'];
    var seen = {}, out = [];
    moods.forEach(function (m) {
      PHRASES.forEach(function (p) {
        if (seen[p.en] || out.length >= (n || 6)) return;
        if (MOOD_WORDS[m].some(function (w) { return lc(p.en).indexOf(w) >= 0; })) { seen[p.en] = 1; out.push(Object.assign({ mood: m }, p)); }
      });
    });
    return out;
  }

  // ---------- state & backup ----------
  function emptyState() { return { characters: [], stories: [], current: null }; }
  function newStory(title) { return { id: 's' + Math.random().toString(36).slice(2, 9), title: title || 'Untitled story', logline: '', scenes: [] }; }
  function newScene(n) { return { id: 'sc' + Math.random().toString(36).slice(2, 9), title: 'Scene ' + (n || 1), location: '', time: 'evening', camera: 'push', mood: '', duration: 5, transition: '', text: '', charIds: [], writtenOut: [], dialogue: [] }; }
  function exportBackup(state, withImages) {
    var copy = JSON.parse(JSON.stringify(state)); if (!withImages) copy.characters.forEach(function (c) { delete c.image; });
    return JSON.stringify({ app: 'story-studio', version: 1, data: copy }, null, 2);
  }
  function importBackup(text) {
    var j = typeof text === 'string' ? JSON.parse(text) : text;
    if (!j || j.app !== 'story-studio' || !j.data || !Array.isArray(j.data.characters) || !Array.isArray(j.data.stories)) throw new Error('This is not an AI Story Studio backup file.');
    return j.data;
  }
  function dataUrlBytes(u) { var i = String(u || '').indexOf(','); return i < 0 ? 0 : Math.floor((u.length - i - 1) * 3 / 4); }

  var L = {
    PHRASES: PHRASES, CLOTHES: CLOTHES, COLOURS: COLOURS, TIMES: TIMES, CAMERAS: CAMERAS, PRESETS: PRESETS, HOOKS: HOOKS, ENDINGS: ENDINGS,
    sentences: sentences, lev: lev, mentions: mentions, consistencyBlock: consistencyBlock, checkContinuity: checkContinuity, sceneChars: sceneChars,
    scenePrompt: scenePrompt, exportPrompts: exportPrompts, toMarkdown: toMarkdown, toCSV: toCSV, hooks: hooks, endings: endings,
    romNorm: romNorm, lookup: lookup, translateLines: translateLines, suggestDialogue: suggestDialogue,
    emptyState: emptyState, newStory: newStory, newScene: newScene, exportBackup: exportBackup, importBackup: importBackup, dataUrlBytes: dataUrlBytes
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.StoryLib = L;
})(this);
