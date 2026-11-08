/* AI Story Studio — page wiring. Logic lives in lib.js (StoryLib). */
(function () {
  'use strict';
  var L = window.StoryLib, $ = B.$, KEY = 'story-studio';
  var S = B.store.get(KEY, null) || L.emptyState();
  var ui = B.store.get(KEY + ':ui', { endType: 'twist', preset: 'long', hMain: '', hOther: '' });
  var pendingImage = null;
  var DEFAULT_STYLE = 'cinematic realism, natural skin texture, soft film grain, 35mm lens';

  function save() {
    var ok = B.store.set(KEY, S); B.store.set(KEY + ':ui', ui); usage();
    if (!ok) B.toast('Browser storage is full — remove an image or export a backup.', 4000);
  }
  function usage() {
    var bytes = 0; try { bytes = (localStorage.getItem('bh:' + KEY) || '').length * 2; } catch (e) {}
    var imgs = S.characters.reduce(function (t, c) { return t + L.dataUrlBytes(c.image); }, 0);
    $('#usage').textContent = 'Using about ' + Math.round(bytes / 1024) + ' KB of browser storage' + (imgs ? ' (images ' + Math.round(imgs / 1024) + ' KB)' : '') + '.' + (bytes > 3.5e6 ? ' Getting close to the limit — export a backup.' : '');
  }
  function story() { var s = S.stories.filter(function (x) { return x.id === S.current; })[0] || S.stories[0]; if (!s) { s = L.newStory('My first story'); s.scenes.push(L.newScene(1)); S.stories.push(s); } S.current = s.id; return s; }
  function charById(id) { return S.characters.filter(function (c) { return c.id === id; })[0]; }
  function opt(v, label, sel) { return '<option value="' + B.esc(v) + '"' + (sel ? ' selected' : '') + '>' + B.esc(label) + '</option>'; }
  function opts() { var st = story(); return { style: st.style || DEFAULT_STYLE, aspect: st.aspect || '9:16' }; }

  // ---------- stories ----------
  function renderStorySel() { story(); $('#storySel').innerHTML = S.stories.map(function (s) { return opt(s.id, s.title, s.id === S.current); }).join(''); }
  $('#storySel').onchange = function () { S.current = this.value; save(); renderAll(); };
  $('#storyNew').onclick = function () { var t = prompt('Story title', 'Untitled story'); if (t == null) return; var s = L.newStory(t || 'Untitled story'); s.scenes.push(L.newScene(1)); S.stories.push(s); S.current = s.id; save(); renderAll(); B.$('[data-tab="story"]').click(); };

  // ---------- characters ----------
  var CF = { Name: 'name', Age: 'age', Aliases: 'aliases', Look: 'look', Outfit: 'outfit', Voice: 'voice', Traits: 'traits' };
  function resetForm() { $('#charForm').reset(); $('#cId').value = ''; pendingImage = null; $('#imgPreview').innerHTML = ''; $('#cfTitle').textContent = 'Add a character'; }
  function editChar(c) {
    resetForm(); $('#cId').value = c.id; Object.keys(CF).forEach(function (k) { $('#c' + k).value = c[CF[k]] || ''; });
    $('#cfTitle').textContent = 'Edit ' + c.name; if (c.image) $('#imgPreview').innerHTML = '<img src="' + c.image + '" alt="" style="max-width:120px;border-radius:8px">';
    $('#cName').focus();
  }
  function renderChars() {
    var box = $('#charList'); box.innerHTML = '';
    if (!S.characters.length) { box.innerHTML = '<p class="muted">No characters yet. Add one, or load the sample.</p>'; return; }
    S.characters.forEach(function (c) {
      var block = L.consistencyBlock(c);
      box.appendChild(B.h('div', { class: 'panel char-card' }, [
        c.image ? B.h('img', { src: c.image, alt: 'Reference for ' + c.name }) : B.h('div', { class: 'ph', 'aria-hidden': 'true' }),
        B.h('div', {}, [
          B.h('b', { text: c.name + (c.age ? ', ' + c.age : '') }),
          c.traits ? B.h('div', { class: 'small muted', text: c.traits + (c.voice ? ' · voice: ' + c.voice : '') }) : null,
          B.h('pre', { text: block }),
          B.h('div', { class: 'row' }, [
            B.h('button', { class: 'btn small', text: 'Copy', onclick: function () { B.copy(block); } }),
            B.h('button', { class: 'btn small edit', text: 'Edit', onclick: function () { editChar(c); } }),
            c.image ? B.h('button', { class: 'btn small', text: 'Remove image', onclick: function () { delete c.image; save(); renderChars(); } }) : null,
            B.h('button', { class: 'btn small', text: 'Delete', onclick: function () {
              if (!confirm('Delete ' + c.name + '?')) return;
              S.characters = S.characters.filter(function (x) { return x !== c; });
              S.stories.forEach(function (st) { st.scenes.forEach(function (sc) { sc.charIds = sc.charIds.filter(function (id) { return id !== c.id; }); }); });
              save(); renderAll();
            } })
          ])
        ])
      ]));
    });
  }
  $('#charForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = charById($('#cId').value); if (!c) { c = { id: B.uid() }; S.characters.push(c); }
    Object.keys(CF).forEach(function (k) { c[CF[k]] = $('#c' + k).value.trim(); });
    if (pendingImage) c.image = pendingImage;
    save(); resetForm(); renderAll(); B.toast('Character saved');
  });
  $('#cCancel').onclick = resetForm;
  // Downscale to a small JPEG data URL, under ~200 KB.
  function shrink(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 512, q = 0.82, out;
        for (var tries = 0; tries < 8; tries++) {
          var sc = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * sc)); cv.height = Math.max(1, Math.round(img.height * sc));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          out = cv.toDataURL('image/jpeg', q);
          if (L.dataUrlBytes(out) <= 200 * 1024) break;
          max = Math.round(max * 0.8); q = Math.max(0.5, q - 0.08);
        }
        URL.revokeObjectURL(url); res(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('That file is not an image this browser can read.')); };
      img.src = url;
    });
  }
  $('#imgInput').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    shrink(f).then(function (data) {
      pendingImage = data;
      $('#imgPreview').innerHTML = '<img src="' + data + '" alt="" style="max-width:120px;border-radius:8px"><p class="small muted">' + Math.round(L.dataUrlBytes(data) / 1024) + ' KB after shrinking.</p>';
      var c = charById($('#cId').value);
      if (c) { c.image = data; save(); renderChars(); B.toast('Image saved to ' + c.name); } else B.toast('Image ready — press Save character');
    }).catch(function (e) { B.toast(e.message, 4000); });
    this.value = '';
  });

  // ---------- scenes ----------
  function field(label, input) { return B.h('div', {}, [B.h('label', { text: label }), input]); }
  function bindInput(el, obj, key, after) { el.addEventListener('input', function () { obj[key] = el.type === 'number' ? Number(el.value) : el.value; save(); if (after) after(); }); return el; }
  function renderStory() {
    var st = story();
    $('#sTitle').value = st.title; $('#sLog').value = st.logline || ''; $('#sStyle').value = st.style || DEFAULT_STYLE; $('#sAspect').value = st.aspect || '9:16';
    var box = $('#scenes'); box.innerHTML = '';
    st.scenes.forEach(function (sc, i) { box.appendChild(sceneEl(st, sc, i)); });
  }
  $('#sTitle').oninput = function () { story().title = this.value; save(); };
  $('#sTitle').onchange = renderStorySel;
  $('#sLog').oninput = function () { story().logline = this.value; save(); };
  $('#sStyle').oninput = function () { story().style = this.value; save(); };
  $('#sAspect').onchange = function () { story().aspect = this.value; save(); renderStory(); };
  $('#addScene').onclick = function () { var st = story(), last = st.scenes[st.scenes.length - 1], sc = L.newScene(st.scenes.length + 1); if (last) { sc.location = last.location; sc.time = last.time; sc.charIds = last.charIds.slice(); } st.scenes.push(sc); save(); renderStory(); };

  function sceneEl(st, sc, i) {
    var pre = B.h('pre');
    function upd() { pre.textContent = L.scenePrompt('long', sc, i, S.characters, opts()); }
    var title = bindInput(B.h('input', { type: 'text', value: sc.title }), sc, 'title');
    var loc = bindInput(B.h('input', { type: 'text', value: sc.location, placeholder: 'rented flat, kitchen' }), sc, 'location', upd);
    var time = B.h('select', { html: L.TIMES.map(function (t) { return opt(t, t.charAt(0).toUpperCase() + t.slice(1), t === sc.time); }).join('') });
    time.onchange = function () { sc.time = time.value; save(); upd(); };
    var cam = B.h('select', { html: Object.keys(L.CAMERAS).map(function (k) { return opt(k, L.CAMERAS[k], k === sc.camera); }).join('') });
    cam.onchange = function () { sc.camera = cam.value; save(); upd(); };
    var mood = bindInput(B.h('input', { type: 'text', value: sc.mood || '', placeholder: 'tense, quiet' }), sc, 'mood', upd);
    var dur = bindInput(B.h('input', { type: 'number', value: sc.duration || 5, min: 1, max: 60 }), sc, 'duration');
    var trans = bindInput(B.h('input', { type: 'text', value: sc.transition || '', placeholder: 'next morning / flashback' }), sc, 'transition');
    var text = bindInput(B.h('textarea', { class: 'prose', style: 'min-height:80px', 'aria-label': 'What happens in scene ' + (i + 1) }), sc, 'text', upd); text.value = sc.text || '';
    var inScene = B.h('div', { class: 'checks' }), outAfter = B.h('div', { class: 'checks' });
    S.characters.forEach(function (c) {
      var a = B.h('input', { type: 'checkbox', checked: sc.charIds.indexOf(c.id) >= 0 }); a.onchange = function () { sc.charIds = toggle(sc.charIds, c.id, a.checked); save(); upd(); renderDialogue(); };
      inScene.appendChild(B.h('label', {}, [a, ' ' + c.name]));
      var b = B.h('input', { type: 'checkbox', checked: (sc.writtenOut || []).indexOf(c.id) >= 0 }); b.onchange = function () { sc.writtenOut = toggle(sc.writtenOut || [], c.id, b.checked); save(); };
      outAfter.appendChild(B.h('label', {}, [b, ' ' + c.name]));
    });
    if (!S.characters.length) inScene.innerHTML = '<span class="small muted">Add characters first.</span>';
    var dlgBox = B.h('div'), sugg = B.h('div', { class: 'sugg' });
    function renderDialogue() {
      dlgBox.innerHTML = '';
      sc.dialogue.forEach(function (d, k) {
        var who = B.h('select', { 'aria-label': 'Speaker', html: opt('', '— speaker —', !d.charId) + S.characters.map(function (c) { return opt(c.id, c.name, c.id === d.charId); }).join('') });
        who.onchange = function () { d.charId = who.value; save(); upd(); };
        var line = bindInput(B.h('input', { type: 'text', value: d.line || '', placeholder: 'English line', 'aria-label': 'Line' }), d, 'line', upd);
        var hi = bindInput(B.h('input', { type: 'text', class: 'hi', value: d.hindi || '', placeholder: 'Hindi (optional)', 'aria-label': 'Hindi line' }), d, 'hindi');
        var del = B.h('button', { class: 'btn small', type: 'button', text: '✕', 'aria-label': 'Remove line', onclick: function () { sc.dialogue.splice(k, 1); save(); renderDialogue(); upd(); } });
        dlgBox.appendChild(B.h('div', { class: 'dl' }, [who, line, del, hi]));
      });
    }
    renderDialogue(); upd();
    function move(d) { var j = i + d; if (j < 0 || j >= st.scenes.length) return; st.scenes.splice(j, 0, st.scenes.splice(i, 1)[0]); save(); renderStory(); }
    return B.h('div', { class: 'panel' }, [
      B.h('div', { class: 'scene-head' }, [B.h('h3', { style: 'margin:0', text: 'Scene ' + (i + 1) }), B.h('div', { class: 'row' }, [
        B.h('button', { class: 'btn small', text: '↑', 'aria-label': 'Move up', onclick: function () { move(-1); } }),
        B.h('button', { class: 'btn small', text: '↓', 'aria-label': 'Move down', onclick: function () { move(1); } }),
        B.h('button', { class: 'btn small', text: 'Delete', onclick: function () { if (confirm('Delete scene ' + (i + 1) + '?')) { st.scenes.splice(i, 1); save(); renderStory(); } } })])]),
      B.h('div', { class: 'field-grid' }, [field('Scene title', title), field('Location', loc), field('Time of day', time), field('Camera', cam), field('Mood', mood), field('Seconds', dur), field('Transition into this scene', trans)]),
      B.h('label', { text: 'What happens (what the camera sees)' }), text,
      B.h('label', { text: 'Characters in this scene' }), inScene,
      B.h('label', { text: 'Written out after this scene (leaves or dies)' }), outAfter,
      B.h('label', { text: 'Dialogue' }), dlgBox,
      B.h('div', { class: 'row', style: 'margin-top:6px' }, [
        B.h('button', { class: 'btn small', type: 'button', text: 'Add line', onclick: function () { sc.dialogue.push({ charId: sc.charIds[0] || '', line: '' }); save(); renderDialogue(); } }),
        B.h('button', { class: 'btn small', type: 'button', text: 'Suggest lines from phrasebook', onclick: function () {
          sugg.innerHTML = '';
          L.suggestDialogue(sc, 6).forEach(function (p) {
            sugg.appendChild(B.h('button', { class: 'btn small', type: 'button', title: p.hi, onclick: function () { sc.dialogue.push({ charId: sc.charIds[0] || '', line: p.en, hindi: p.hi + ' (' + p.rom + ')' }); save(); renderDialogue(); upd(); } }, [p.en + ' · ' + p.rom]));
          });
          if (!sugg.childNodes.length) sugg.textContent = 'No matching phrases.';
        } })
      ]), sugg,
      B.h('details', {}, [B.h('summary', { text: 'Prompt for this scene' }), pre, B.h('button', { class: 'btn small', type: 'button', text: 'Copy prompt', onclick: function () { B.copy(pre.textContent); } })])
    ]);
  }
  function toggle(arr, id, on) { arr = arr.filter(function (x) { return x !== id; }); if (on) arr.push(id); return arr; }

  // ---------- continuity ----------
  function renderCheck() {
    var st = story(), w = L.checkContinuity(st, S.characters), warn = w.filter(function (x) { return x.level === 'warn'; }).length;
    $('#checkStats').innerHTML = [['Scenes', st.scenes.length], ['Warnings', warn], ['Notes', w.length - warn]].map(function (s) { return '<div class="stat"><div class="k">' + s[0] + '</div><div class="v">' + s[1] + '</div></div>'; }).join('');
    $('#checkOut').innerHTML = w.length ? w.map(function (x) {
      return '<li><span class="' + (x.level === 'warn' ? 'pill-bad' : 'pill-warn') + '">' + (x.level === 'warn' ? 'Warning' : 'Note') + '</span> <b>' + B.esc(x.ref) + ':</b> ' + B.esc(x.message) + '</li>';
    }).join('') : '<li><span class="pill-ok">All clear</span> No continuity problems found.</li>';
  }

  // ---------- hooks & endings ----------
  var END_TYPES = [['twist', 'Twist'], ['emotional', 'Emotional'], ['cliffhanger', 'Cliffhanger'], ['moral', 'Moral']];
  function hookChars() {
    var a = charById(ui.hMain) || S.characters[0], b = charById(ui.hOther) || S.characters.filter(function (c) { return c !== a; })[0];
    return [a || { name: 'She' }, b || { name: 'her son' }];
  }
  function line(text, useLabel, onUse) {
    return B.h('div', { class: 'hook' }, [B.h('span', { text: text }), B.h('span', { class: 'row', style: 'flex-wrap:nowrap' }, [
      B.h('button', { class: 'btn small', text: 'Copy', onclick: function () { B.copy(text); } }),
      onUse ? B.h('button', { class: 'btn small', text: useLabel, onclick: onUse }) : null])]);
  }
  function renderHooks() {
    var choices = S.characters.map(function (c) { return opt(c.id, c.name); }).join('');
    $('#hMain').innerHTML = choices || opt('', 'No characters'); $('#hOther').innerHTML = choices || opt('', 'No characters');
    var hc = hookChars(); if (hc[0].id) $('#hMain').value = hc[0].id; if (hc[1].id) $('#hOther').value = hc[1].id;
    var box = $('#hookList'); box.innerHTML = '';
    L.hooks(hc).forEach(function (h) {
      box.appendChild(line(h, 'Use in scene 1', function () { var st = story(); if (!st.scenes.length) st.scenes.push(L.newScene(1)); st.scenes[0].text = h + (st.scenes[0].text ? ' ' + st.scenes[0].text : ''); save(); renderStory(); B.toast('Added to scene 1'); }));
    });
    $('#endTabs').innerHTML = '';
    END_TYPES.forEach(function (t) {
      $('#endTabs').appendChild(B.h('button', { type: 'button', 'aria-selected': String(ui.endType === t[0]), text: t[1], onclick: function () { ui.endType = t[0]; save(); renderHooks(); } }));
    });
    var eb = $('#endList'); eb.innerHTML = '';
    L.endings(ui.endType, hc).forEach(function (h) {
      eb.appendChild(line(h, 'Add as last scene', function () { var st = story(), sc = L.newScene(st.scenes.length + 1), last = st.scenes[st.scenes.length - 1]; sc.title = 'Ending'; sc.text = h; if (last) { sc.location = last.location; sc.time = last.time; sc.charIds = last.charIds.slice(); } st.scenes.push(sc); save(); renderStory(); B.toast('Ending scene added'); }));
    });
  }
  $('#hMain').onchange = function () { ui.hMain = this.value; save(); renderHooks(); };
  $('#hOther').onchange = function () { ui.hOther = this.value; save(); renderHooks(); };

  // ---------- Hindi helper ----------
  function renderHindi() {
    var out = $('#hiOut'), lines = L.translateLines($('#hiIn').value); out.innerHTML = '';
    if (!lines.length) return;
    lines.forEach(function (r) {
      var m = r.others;
      var body = m.length ? m.map(function (p, k) {
        return '<div class="' + (k ? 'small' : '') + '">' + (k ? '' : '<div class="en">' + B.esc(p.en) + '</div>') + (k ? 'Also close: <b>' + B.esc(p.en) + '</b> — ' : '') + B.esc(p.hi) + ' · <i>' + B.esc(p.rom) + '</i> <span class="tag">' + Math.round(p.score * 100) + '% match</span></div>';
      }).join('') : '<div class="muted">No close phrase in the phrasebook. Try fewer words, or use the AI helper for a full translation.</div>';
      out.insertAdjacentHTML('beforeend', '<div class="match"><div class="small muted">' + B.esc(r.line) + '</div>' + body + (m.length && !r.best ? '<div class="small warn">Closest phrases only — not an exact translation.</div>' : '') + '</div>');
    });
  }
  $('#hiIn').addEventListener('input', renderHindi);
  function renderPhrasebook() {
    var q = $('#pbFilter').value.trim().toLowerCase();
    var rows = L.PHRASES.filter(function (p) { return !q || (p.hi + ' ' + p.rom + ' ' + p.en).toLowerCase().indexOf(q) >= 0; });
    $('#pbTable').innerHTML = B.table(rows, [{ key: 'hi', label: 'Hindi' }, { key: 'rom', label: 'Hinglish' }, { key: 'en', label: 'English' }], { limit: 200 });
  }
  $('#pbFilter').addEventListener('input', renderPhrasebook);

  // ---------- export ----------
  $('#preset').innerHTML = Object.keys(L.PRESETS).map(function (k) { return opt(k, L.PRESETS[k].label, k === ui.preset); }).join('');
  $('#preset').onchange = function () { ui.preset = this.value; save(); renderExport(); };
  function renderExport() {
    var st = story(); $('#presetNote').textContent = L.PRESETS[ui.preset].note;
    $('#exportText').value = L.toMarkdown(st, S.characters.filter(function (c) { return st.scenes.some(function (s) { return L.sceneChars(s, S.characters).indexOf(c) >= 0; }); }), ui.preset, opts());
  }
  function fname(ext) { return (story().title || 'story').replace(/[^\w-]+/g, '-').toLowerCase() + '-' + ui.preset + '.' + ext; }
  $('#exCopy').onclick = function () { B.copy($('#exportText').value); };
  $('#exMd').onclick = function () { B.download(fname('md'), $('#exportText').value, 'text/markdown'); };
  $('#exCsv').onclick = function () { B.download(fname('csv'), L.toCSV(story(), S.characters, ui.preset, opts(), B.csv.stringify), 'text/csv'); };
  $('#exJson').onclick = function () {
    var st = story();
    B.download(fname('json'), JSON.stringify({ title: st.title, logline: st.logline, format: L.PRESETS[ui.preset].label, aspect: opts().aspect,
      characters: S.characters.map(function (c) { return { name: c.name, age: c.age, look: c.look, outfit: c.outfit, voice: c.voice, consistency: L.consistencyBlock(c) }; }),
      scenes: L.exportPrompts(st, S.characters, ui.preset, opts()).map(function (x, i) { var s = st.scenes[i]; return Object.assign(x, { location: s.location, time: s.time, seconds: s.duration, dialogue: s.dialogue.map(function (d) { return { speaker: (charById(d.charId) || {}).name || '', line: d.line, hindi: d.hindi || '' }; }) }); })
    }, null, 2), 'application/json');
  };

  // ---------- AI extras (hidden when AI is off) ----------
  B.ai.note($('#aiNote'));
  B.ai.button($('#aiHindi'), 'Translate everything with AI', function () {
    var t = $('#hiIn').value.trim(); if (!t) { B.toast('Type something first'); return null; }
    return 'Translate this Hindi / Hinglish dialogue into natural, emotional spoken English for a short video subtitle. Keep it short. Line by line, no notes:\n\n' + t;
  }, function (ans) { $('#aiHindiOut').innerHTML = ''; $('#aiHindiOut').appendChild(B.h('pre', { style: 'white-space:pre-wrap', text: ans })); });
  B.ai.button($('#aiHooks'), 'More hooks with AI', function () {
    var st = story(), hc = hookChars();
    return 'Write 8 original first-3-second hook lines (under 12 words each) for a short emotional story video. Story: ' + (st.logline || st.title) + '. Main character: ' + hc[0].name + '. Second: ' + hc[1].name + '. One per line, no numbering.';
  }, function (ans) { ans.split('\n').map(function (s) { return s.replace(/^[\s\d.\-*"]+|"$/g, '').trim(); }).filter(Boolean).slice(0, 8).forEach(function (h) { $('#hookList').appendChild(line('✨ ' + h)); }); }, { temperature: 0.9 });
  B.ai.button($('#aiStory'), 'Draft dialogue for every scene', function () {
    var st = story();
    return 'For this short story video, write 1–2 short spoken lines per scene in natural English. Return a JSON array (one item per scene, same order) of arrays of {"speaker": name, "line": text}.\nCharacters: ' +
      S.characters.map(function (c) { return c.name + ' (' + (c.traits || '') + ')'; }).join('; ') + '\nScenes:\n' + st.scenes.map(function (s, i) { return (i + 1) + '. ' + s.text; }).join('\n');
  }, function (ans) {
    var arr = B.ai.parseJSON(ans), st = story(); if (!Array.isArray(arr)) { B.toast('The AI reply was not in the expected format — try again.'); return; }
    st.scenes.forEach(function (s, i) { (Array.isArray(arr[i]) ? arr[i] : []).forEach(function (d) { if (!d || !d.line) return; var c = S.characters.filter(function (x) { return x.name.toLowerCase() === String(d.speaker || '').toLowerCase(); })[0]; s.dialogue.push({ charId: c ? c.id : '', line: String(d.line) }); }); });
    save(); renderStory(); B.toast('Dialogue added');
  }, { json: true, temperature: 0.7 });

  // ---------- backup & sample ----------
  $('#export').onclick = function () {
    var withImg = S.characters.some(function (c) { return c.image; }) ? confirm('Include character images in the backup? (Larger file.)') : false;
    B.download('story-studio-backup.json', L.exportBackup(S, withImg), 'application/json');
  };
  $('#import').onclick = function () {
    var inp = B.h('input', { type: 'file', accept: '.json,application/json' });
    inp.onchange = function () {
      if (!inp.files[0]) return;
      B.readFile(inp.files[0]).then(function (t) { S = L.importBackup(t); save(); renderAll(); B.toast('Backup restored'); }).catch(function (e) { B.toast(e.message || 'Could not read that file'); });
    };
    inp.click();
  };
  $('#clear').onclick = function () { if (!confirm('Delete all characters and stories in this browser?')) return; S = L.emptyState(); save(); renderAll(); };
  $('#sample').onclick = function () {
    if ((S.characters.length || S.stories.some(function (s) { return s.scenes.some(function (x) { return x.text; }); })) && !confirm('Replace your current data with the sample story?')) return;
    S = sample(); save(); renderAll(); B.toast('Sample story loaded — see the Continuity tab');
  };
  function sample() {
    var s = L.emptyState();
    s.characters = [
      { id: 'kamla', name: 'Kamla', aliases: 'Dadi', age: '68', look: 'thin face, silver hair in a low bun, round steel glasses', outfit: 'green cotton saree, beige shawl', voice: 'soft, slow Hindi', traits: 'proud, secretly generous' },
      { id: 'raju', name: 'Raju', age: '24', look: 'lean, messy black hair, light stubble', outfit: 'blue delivery jacket, grey T-shirt', voice: 'quick, warm Hinglish', traits: 'restless, loyal, too proud to ask for help' },
      { id: 'meera', name: 'Meera', age: '9', look: 'two oiled plaits, gap-toothed smile', outfit: 'navy school pinafore, red ribbons', voice: 'bright, curious', traits: 'notices everything' }
    ];
    var st = L.newStory('The Rent Receipts'); st.logline = 'Kamla scolds her grandson Raju for coming home late every night — until Meera shows her the rent receipts he has been paying in secret.';
    st.aspect = '9:16'; st.style = 'warm emotional realism, golden practical light, shallow depth of field';
    function sc(o) { return Object.assign(L.newScene(), o); }
    st.scenes = [
      sc({ title: 'Waiting up', location: 'rented flat', time: 'night', camera: 'push', mood: 'lonely, tense', duration: 4, text: 'Kamla sits by the wall clock at midnight, a cold plate of rotis beside her.', charIds: ['kamla'], dialogue: [{ charId: 'kamla', line: 'Where were you?', hindi: 'तुम कहाँ थे? (tum kahan the?)' }] }),
      sc({ title: 'The argument', location: 'rented flat', time: 'night', camera: 'handheld', mood: 'angry', duration: 6, text: 'Raju walks in wearing a red hoodie. Kamla snaps at him; he says nothing and goes to bed.', charIds: ['kamla', 'raju'], dialogue: [{ charId: 'kamla', line: 'Have you no shame?' }, { charId: '', line: 'Leave me alone.' }] }),
      sc({ title: 'Meera’s secret', location: 'rented flat', time: 'night', camera: 'static', mood: 'quiet', duration: 6, text: 'Meera tiptoes in and hands Dadi a bundle of rent receipts, all signed by Rajju. 70-year-old Kamla reads them slowly.', charIds: ['kamla', 'meera'], dialogue: [{ charId: 'meera', line: 'Bhaiya pays the rent, Dadi.' }] }),
      sc({ title: 'School gate', location: 'school gate', time: 'morning', camera: 'pan', mood: 'hopeful', duration: 5, transition: 'next morning', text: 'Kamla walks Meera to school under the morning sun. Raju waves from his bike.', charIds: ['kamla', 'meera', 'raju'] }),
      sc({ title: 'The delivery', location: 'city market', time: 'morning', camera: 'handheld', mood: 'busy', duration: 5, text: 'Raju is stacking parcels in the moonlight while Suresh shouts at him.', charIds: ['raju'] }),
      sc({ title: 'Goodbye', location: 'railway platform', time: 'evening', camera: 'pull', mood: 'heartbreak', duration: 6, text: 'Raju boards a train to the city and leaves for good. Kamla watches from the platform.', charIds: ['raju', 'kamla'] }),
      sc({ title: 'Tea for two', location: 'rented flat', time: 'night', camera: 'push', mood: 'bittersweet', duration: 6, text: 'Kamla pours two cups of tea. Raju sits across from her and smiles.', charIds: ['kamla', 'raju'], dialogue: [{ charId: 'raju', line: 'I kept my promise, Dadi.' }] })
    ];
    s.stories = [st]; s.current = st.id; return s;
  }

  function renderAll() { renderStorySel(); renderChars(); renderStory(); renderCheck(); renderHooks(); renderExport(); renderPhrasebook(); usage(); }
  B.tabs(B.$('[data-tabs="ss"]'), function (id) { if (id === 'check') renderCheck(); if (id === 'export') renderExport(); if (id === 'hooks') renderHooks(); });
  renderAll();
})();
