/* Creator Autopilot — page wiring. Logic lives in lib.js (CreatorLib). */
(function () {
  'use strict';
  var L = window.CreatorLib, $ = B.$, KEY = 'creator-autopilot';
  var S = L.normaliseState(B.store.get(KEY));
  var ui = B.store.get(KEY + ':ui', { seed: '', ep: null, capVariant: 0, topics: ['emotional', 'family'], month: null });
  var shown = [];

  function save() { B.store.set(KEY, S); B.store.set(KEY + ':ui', ui); }
  function opt(v, label, sel) { return '<option value="' + B.esc(v) + '"' + (sel ? ' selected' : '') + '>' + B.esc(label) + '</option>'; }
  function options(list, cur, anyLabel) { return (anyLabel ? opt('', anyLabel, !cur) : '') + list.map(function (x) { return opt(x, x.charAt(0).toUpperCase() + x.slice(1), x === cur); }).join(''); }
  function platformOptions(cur) { return Object.keys(L.PLATFORMS).map(function (k) { return opt(k, L.PLATFORMS[k].label, k === cur); }).join(''); }
  function ep() { return S.episodes.filter(function (e) { return e.id === ui.ep; })[0] || S.episodes[0] || null; }
  function charsFor(e) { return e ? S.characters.filter(function (c) { return (e.charIds || []).indexOf(c.id) >= 0; }) : []; }

  // ---------- Ideas ----------
  $('#genre').innerHTML = options(L.GENRES, '', 'Any genre');
  $('#emotion').innerHTML = options(L.EMOTIONS, '', 'Any emotion');
  if (!ui.seed) ui.seed = 'series-' + Math.floor(Math.random() * 9000 + 1000);
  $('#seed').value = ui.seed;

  function renderConcepts() {
    ui.seed = $('#seed').value.trim() || ui.seed; save();
    shown = L.concepts(ui.seed, 6, { genre: $('#genre').value, emotion: $('#emotion').value });
    var box = $('#concepts'); box.innerHTML = '';
    shown.forEach(function (c) { box.appendChild(conceptCard(c, false)); });
  }
  function conceptCard(c, saved) {
    var card = B.h('div', { class: 'card concept' }, [
      B.h('div', {}, [B.h('span', { class: 'tag', text: c.genre }), B.h('span', { class: 'tag', text: c.emotion })]),
      B.h('p', { text: c.logline })
    ]);
    var row = B.h('div', { class: 'row' });
    if (!saved) row.appendChild(B.h('button', { class: 'btn small', text: 'Save', onclick: function () {
      if (!S.savedConcepts.some(function (x) { return x.id === c.id; })) { S.savedConcepts.push(c); save(); renderSaved(); B.toast('Saved'); }
    } }));
    row.appendChild(B.h('button', { class: 'btn small primary', text: 'Start episode', onclick: function () { newEpisode(c); B.$('[data-tab="scenes"]').click(); } }));
    if (saved) row.appendChild(B.h('button', { class: 'btn small', text: 'Remove', onclick: function () {
      S.savedConcepts = S.savedConcepts.filter(function (x) { return x.id !== c.id; }); save(); renderSaved();
    } }));
    card.appendChild(row); return card;
  }
  function renderSaved() {
    var box = $('#saved'); box.innerHTML = '';
    if (!S.savedConcepts.length) { box.innerHTML = '<p class="muted">Nothing saved yet. Press “Save” on an idea you like.</p>'; return; }
    var g = B.h('div', { class: 'grid' }); S.savedConcepts.forEach(function (c) { g.appendChild(conceptCard(c, true)); }); box.appendChild(g);
  }
  $('#gen').onclick = renderConcepts;
  $('#reshuffle').onclick = function () { $('#seed').value = 'series-' + Math.floor(Math.random() * 9000 + 1000); renderConcepts(); };
  $('#genre').onchange = $('#emotion').onchange = renderConcepts;

  // ---------- Characters ----------
  var CF = ['Name', 'Age', 'Look', 'Outfit', 'Voice', 'Traits'];
  function renderChars() {
    var box = $('#charList'); box.innerHTML = '';
    if (!S.characters.length) { box.innerHTML = '<p class="muted">No characters yet.</p>'; return; }
    S.characters.forEach(function (c) {
      var block = L.consistencyBlock(c);
      box.appendChild(B.h('div', { class: 'panel' }, [
        B.h('h3', { style: 'margin-top:0', text: c.name + (c.age ? ', ' + c.age : '') }),
        B.h('pre', { style: 'white-space:pre-wrap', text: block }),
        B.h('div', { class: 'row' }, [
          B.h('button', { class: 'btn small', text: 'Copy block', onclick: function () { B.copy(block); } }),
          B.h('button', { class: 'btn small', text: 'Edit', onclick: function () {
            $('#cId').value = c.id; CF.forEach(function (f) { $('#c' + f).value = c[f.toLowerCase()] || ''; });
            $('#charFormTitle').textContent = 'Edit ' + c.name; $('#cName').focus();
          } }),
          B.h('button', { class: 'btn small', text: 'Delete', onclick: function () {
            if (!confirm('Delete ' + c.name + '?')) return;
            S.characters = S.characters.filter(function (x) { return x.id !== c.id; }); save(); renderAll();
          } })
        ])
      ]));
    });
  }
  $('#charForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = $('#cId').value, c = id ? S.characters.filter(function (x) { return x.id === id; })[0] : null;
    if (!c) { c = { id: B.uid() }; S.characters.push(c); }
    CF.forEach(function (f) { c[f.toLowerCase()] = $('#c' + f).value.trim(); });
    save(); $('#charForm').reset(); $('#cId').value = ''; $('#charFormTitle').textContent = 'Add a character'; renderAll(); B.toast('Character saved');
  });
  $('#cReset').onclick = function () { $('#cId').value = ''; $('#charFormTitle').textContent = 'Add a character'; };

  // ---------- Episodes & scenes ----------
  function newEpisode(c) {
    c = c || shown[0] || L.concepts(ui.seed, 1)[0];
    var e = { id: B.uid(), title: 'Episode ' + (S.episodes.length + 1), concept: c, length: 30, platform: 'reels', style: 'cinematic',
      charIds: S.characters.slice(0, 2).map(function (x) { return x.id; }), scenes: [] };
    e.scenes = L.breakdown(e.length, e.concept, charsFor(e));
    S.episodes.push(e); ui.ep = e.id; save(); renderAll();
  }
  $('#epNew').onclick = function () { newEpisode(); };
  $('#epDel').onclick = function () {
    var e = ep(); if (!e || !confirm('Delete "' + e.title + '"?')) return;
    S.episodes = S.episodes.filter(function (x) { return x.id !== e.id; }); ui.ep = S.episodes[0] && S.episodes[0].id; save(); renderAll();
  };
  $('#epSel').onchange = function () { ui.ep = this.value; save(); renderAll(); };

  function renderEpisode() {
    $('#epSel').innerHTML = S.episodes.length ? S.episodes.map(function (e) { return opt(e.id, e.title, ep() && e.id === ep().id); }).join('') : opt('', 'No episodes yet');
    var e = ep(), form = $('#epForm'), out = $('#sceneOut'); form.innerHTML = ''; out.innerHTML = '';
    if (!e) { form.innerHTML = '<p class="muted">Start an episode from an idea, or press “New episode”.</p>'; return; }
    form.innerHTML =
      '<div class="field-grid">' +
      '<div><label for="eTitle">Episode title</label><input type="text" id="eTitle" value="' + B.esc(e.title) + '"></div>' +
      '<div><label for="eLen">Target length</label><select id="eLen">' + L.LENGTHS.map(function (n) { return opt(n, n + ' seconds', n === Number(e.length)); }).join('') + '</select></div>' +
      '<div><label for="ePlat">Platform</label><select id="ePlat">' + platformOptions(e.platform) + '</select></div>' +
      '<div><label for="eStyle">Visual style</label><select id="eStyle">' + Object.keys(L.STYLES).map(function (k) { return opt(k, L.STYLES[k].label, k === e.style); }).join('') + '</select></div>' +
      '</div><label for="eLog">Story (logline)</label><textarea class="prose" id="eLog" style="min-height:70px">' + B.esc(e.concept.logline || '') + '</textarea>' +
      '<label>Characters in this episode</label><div class="checks" id="eChars">' +
      (S.characters.length ? S.characters.map(function (c) { return '<label><input type="checkbox" value="' + B.esc(c.id) + '"' + ((e.charIds || []).indexOf(c.id) >= 0 ? ' checked' : '') + '> ' + B.esc(c.name) + '</label>'; }).join('') : '<span class="small muted">Add characters in the Characters tab.</span>') +
      '</div><div class="row" style="margin-top:12px"><button class="btn primary" id="eBuild">Rebuild scene breakdown</button><button class="btn" id="eCopyAll">Copy all prompts</button><button class="btn" id="eMd">Download as Markdown</button><span id="aiScenes"></span></div>' +
      '<p class="small muted">Rebuilding replaces scene text with fresh template beats. Edit any scene below — prompts update as you type.</p>';
    $('#eTitle').oninput = function () { e.title = this.value; save(); };
    $('#eTitle').onchange = function () { renderEpisode(); renderTitles(); renderPostForm(); };
    $('#eLog').oninput = function () { e.concept = Object.assign({}, e.concept, { logline: this.value }); save(); };
    ['eLen', 'ePlat', 'eStyle'].forEach(function (id) {
      $('#' + id).onchange = function () {
        e.length = Number($('#eLen').value); e.platform = $('#ePlat').value; e.style = $('#eStyle').value;
        if (id === 'eLen') rescale(e); save(); renderScenes(e);
      };
    });
    B.$$('#eChars input').forEach(function (cb) { cb.onchange = function () { e.charIds = B.$$('#eChars input:checked').map(function (x) { return x.value; }); save(); renderScenes(e); }; });
    $('#eBuild').onclick = function () { e.scenes = L.breakdown(e.length, e.concept, charsFor(e)); save(); renderScenes(e); };
    $('#eCopyAll').onclick = function () { B.copy(markdown(e)); };
    $('#eMd').onclick = function () { B.download((e.title || 'episode').replace(/[^\w-]+/g, '-') + '.md', markdown(e), 'text/markdown'); };
    B.ai.button($('#aiScenes'), 'Write richer scenes', function () {
      return 'Write a ' + e.length + '-second vertical short story video as exactly ' + e.scenes.length + ' scenes with these beats: ' +
        e.scenes.map(function (s) { return s.label + ' (' + s.dur + 's)'; }).join(', ') + '. Story: ' + e.concept.logline + ' Characters: ' +
        (charsFor(e).map(function (c) { return c.name + ' (' + (c.age || '?') + ', ' + (c.traits || '') + ')'; }).join('; ') || 'invent none, use "she"/"he"') +
        '. Original story only. Each scene: one or two visual sentences a camera can film. Reply as a JSON array of strings, one per scene.';
    }, function (ans) {
      var arr = B.ai.parseJSON(ans);
      if (!Array.isArray(arr)) { B.toast('The AI reply was not a list — try again.'); return; }
      e.scenes.forEach(function (s, i) { if (typeof arr[i] === 'string') s.text = arr[i]; }); save(); renderScenes(e);
    }, { json: true, temperature: 0.8 });
    renderScenes(e);
  }
  // keep user text but re-time beats for a new target length
  function rescale(e) {
    var fresh = L.breakdown(e.length, e.concept, charsFor(e));
    e.scenes = fresh.map(function (f) { var old = (e.scenes || []).filter(function (s) { return s.beat === f.beat; })[0]; if (old) f.text = old.text; return f; });
  }
  function renderScenes(e) {
    var out = $('#sceneOut'), chars = charsFor(e); out.innerHTML = '';
    if (!e.scenes || !e.scenes.length) e.scenes = L.breakdown(e.length, e.concept, chars);
    var panel = B.h('div', { class: 'panel' }, [B.h('h2', { style: 'margin-top:0', text: 'Scenes — ' + e.length + ' s, ' + L.PLATFORMS[e.platform].aspect + ', ' + L.STYLES[e.style].label })]);
    e.scenes.forEach(function (s, i) {
      var img = B.h('pre'), vid = B.h('pre');
      function upd() { img.textContent = L.imagePrompt(s, chars, e.style, e.platform); vid.textContent = L.videoPrompt(s, chars, e.style, e.platform); }
      var ta = B.h('textarea', { class: 'prose', style: 'min-height:64px', 'aria-label': s.label + ' scene text' }); ta.value = s.text;
      ta.oninput = function () { s.text = ta.value; save(); upd(); };
      upd();
      panel.appendChild(B.h('div', { class: 'scene' }, [
        B.h('h3', { style: 'margin-top:0' }, [(i + 1) + '. ' + s.label + ' ', B.h('span', { class: 'tag', text: s.start + '–' + s.end + ' s (' + s.dur + ' s)' })]),
        B.h('p', { class: 'small muted', text: s.purpose }), ta,
        B.h('div', { class: 'cols-2' }, [
          B.h('div', {}, [B.h('div', { class: 'row', style: 'justify-content:space-between' }, [B.h('b', { class: 'small', text: 'Image prompt' }), B.h('button', { class: 'btn small', text: 'Copy', onclick: function () { B.copy(img.textContent); } })]), img]),
          B.h('div', {}, [B.h('div', { class: 'row', style: 'justify-content:space-between' }, [B.h('b', { class: 'small', text: 'Video prompt' }), B.h('button', { class: 'btn small', text: 'Copy', onclick: function () { B.copy(vid.textContent); } })]), vid])
        ])
      ]));
    });
    out.appendChild(panel);
  }
  function markdown(e) {
    var chars = charsFor(e);
    return '# ' + e.title + '\n\n' + e.concept.logline + '\n\nLength: ' + e.length + ' s · ' + L.PLATFORMS[e.platform].label + ' (' + L.PLATFORMS[e.platform].aspect + ') · ' + L.STYLES[e.style].label + '\n\n' +
      (chars.length ? '## Characters\n\n' + chars.map(function (c) { return '- ' + L.consistencyBlock(c); }).join('\n') + '\n\n' : '') +
      e.scenes.map(function (s, i) {
        return '## ' + (i + 1) + '. ' + s.label + ' (' + s.start + '–' + s.end + ' s)\n\n' + s.text + '\n\n**Image prompt:** ' + L.imagePrompt(s, chars, e.style, e.platform) +
          '\n\n**Video prompt:** ' + L.videoPrompt(s, chars, e.style, e.platform) + '\n';
      }).join('\n');
  }

  // ---------- Titles, captions, hashtags ----------
  $('#capPlatform').innerHTML = platformOptions('reels');
  $('#tagTopics').innerHTML = Object.keys(L.HASHTAG_SETS).filter(function (k) { return k !== 'general'; }).map(function (k) {
    return '<label><input type="checkbox" value="' + k + '"' + (ui.topics.indexOf(k) >= 0 ? ' checked' : '') + '> ' + k + '</label>';
  }).join('');
  function renderTitles() {
    var e = ep(), c = e ? e.concept : (shown[0] || L.concepts(ui.seed, 1)[0]);
    $('#titleFor').textContent = e ? 'For: ' + e.title : 'No episode yet — showing titles for the first idea.';
    var main = e && charsFor(e)[0];
    var list = L.titles(c, main ? { who: main.name } : {});
    $('#titleList').innerHTML = '';
    list.forEach(function (t) {
      $('#titleList').appendChild(B.h('div', { class: 'row', style: 'justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0' }, [
        B.h('span', { text: t.title }), B.h('button', { class: 'btn small', text: 'Copy', onclick: function () { B.copy(t.title); } })]));
    });
    if (e && e.platform && !renderTitles.done) $('#capPlatform').value = e.platform;
    renderTitles.done = true;
    renderCaption();
  }
  function tagResult() {
    var custom = $('#tagCustom').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    return L.hashtags(ui.topics, $('#capPlatform').value, { custom: custom, all: $('#tagAll').checked });
  }
  function renderCaption() {
    var e = ep(), c = e ? e.concept : (shown[0] || {});
    $('#caption').value = L.caption(c, $('#capPlatform').value, ui.capVariant);
    renderTags();
  }
  function renderTags() {
    var r = tagResult(), pf = L.PLATFORMS[$('#capPlatform').value];
    $('#tagOut').textContent = r.tags.join(' ');
    $('#tagNote').textContent = pf.label + ': we suggest about ' + r.suggested + ' tags; the most allowed is ' + r.limit + '.' + (r.dropped ? ' ' + r.dropped + ' more were left out.' : '') +
      ($('#capPlatform').value === 'shorts' || $('#capPlatform').value === 'youtube' ? ' YouTube ignores every hashtag if you use more than 15.' : '');
    $('#capLen').textContent = $('#caption').value.length + ' / ' + pf.captionMax + ' characters';
  }
  $('#capPlatform').onchange = renderCaption;
  $('#capNext').onclick = function () { ui.capVariant = (ui.capVariant + 1) % 3; save(); renderCaption(); };
  $('#caption').oninput = renderTags;
  $('#tagCustom').oninput = $('#tagAll').onchange = renderTags;
  B.$$('#tagTopics input').forEach(function (cb) { cb.onchange = function () { ui.topics = B.$$('#tagTopics input:checked').map(function (x) { return x.value; }); save(); renderTags(); }; });
  $('#capCopy').onclick = function () { B.copy($('#caption').value + '\n\n' + tagResult().tags.join(' ')); };

  // ---------- Calendar ----------
  var today = new Date(), todayIso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  if (!ui.month) ui.month = todayIso.slice(0, 7);
  $('#pStatus').innerHTML = options(L.STATUSES, 'idea');
  $('#pPlatform').innerHTML = platformOptions('reels');
  $('#pDate').value = todayIso;
  function renderPostForm() { $('#pEpisode').innerHTML = opt('', '— none —') + S.episodes.map(function (e) { return opt(e.id, e.title); }).join(''); }
  $('#pEpisode').onchange = function () { var e = S.episodes.filter(function (x) { return x.id === $('#pEpisode').value; })[0]; if (e && !$('#pTitle').value) $('#pTitle').value = e.title; if (e) $('#pPlatform').value = e.platform; };
  $('#postForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    S.posts.push({ id: B.uid(), title: $('#pTitle').value.trim(), episodeId: $('#pEpisode').value || null, platform: $('#pPlatform').value, date: $('#pDate').value, status: $('#pStatus').value });
    save(); $('#pTitle').value = ''; if ($('#pDate').value) ui.month = $('#pDate').value.slice(0, 7); renderCal(); renderPerf(); B.toast('Added to calendar');
  });
  function shiftMonth(n) { var y = +ui.month.slice(0, 4), m = +ui.month.slice(5, 7) - 1 + n; var d = new Date(Date.UTC(y, m, 1)); ui.month = d.toISOString().slice(0, 7); save(); renderCal(); }
  $('#calPrev').onclick = function () { shiftMonth(-1); };
  $('#calNext').onclick = function () { shiftMonth(1); };
  function renderCal() {
    var y = +ui.month.slice(0, 4), m = +ui.month.slice(5, 7) - 1;
    $('#calTitle').textContent = new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    var byDay = L.postsByDay(S.posts), cal = $('#cal'); cal.innerHTML = '';
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function (d) { cal.appendChild(B.h('div', { class: 'dow', text: d })); });
    L.monthGrid(y, m).forEach(function (week) {
      week.forEach(function (d) {
        if (!d) { cal.appendChild(B.h('div', { class: 'day blank', 'aria-hidden': 'true' })); return; }
        var cell = B.h('div', { class: 'day' + (d === todayIso ? ' today' : ''), 'data-date': d }, [B.h('div', { class: 'num', text: String(+d.slice(8)) })]);
        (byDay[d] || []).forEach(function (p) {
          var chip = B.h('button', { type: 'button', class: 'chip s-' + p.status, draggable: 'true', title: p.title + ' — ' + L.PLATFORMS[p.platform].label + ' — ' + p.status, text: p.title });
          chip.addEventListener('dragstart', function (ev) { ev.dataTransfer.setData('text/plain', p.id); ev.dataTransfer.effectAllowed = 'move'; });
          chip.addEventListener('click', function () { var r = document.getElementById('row-' + p.id); if (r) { r.scrollIntoView({ block: 'center' }); var s = r.querySelector('select'); if (s) s.focus(); } });
          cell.appendChild(chip);
        });
        cell.addEventListener('dragover', function (ev) { ev.preventDefault(); cell.classList.add('over'); });
        cell.addEventListener('dragleave', function () { cell.classList.remove('over'); });
        cell.addEventListener('drop', function (ev) {
          ev.preventDefault(); cell.classList.remove('over');
          var p = S.posts.filter(function (x) { return x.id === ev.dataTransfer.getData('text/plain'); })[0];
          if (p) { p.date = d; save(); renderCal(); }
        });
        cal.appendChild(cell);
      });
    });
    var list = S.posts.filter(function (p) { return (p.date || '').slice(0, 7) === ui.month || !p.date; }).sort(function (a, b) { return (a.date || '9').localeCompare(b.date || '9'); });
    var box = $('#postList'); box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<p class="muted">No posts planned this month.</p>'; return; }
    var tbl = B.h('table'), tb = B.h('tbody');
    tbl.appendChild(B.h('thead', { html: '<tr><th>Title</th><th>Date</th><th>Platform</th><th>Status</th><th></th></tr>' }));
    list.forEach(function (p) {
      var date = B.h('input', { type: 'date', value: p.date || '', 'aria-label': 'Date for ' + p.title });
      date.onchange = function () { p.date = date.value; save(); renderCal(); };
      var plat = B.h('select', { 'aria-label': 'Platform', html: platformOptions(p.platform) }); plat.onchange = function () { p.platform = plat.value; save(); renderCal(); renderPerf(); };
      var st = B.h('select', { 'aria-label': 'Status', html: options(L.STATUSES, p.status) }); st.onchange = function () { p.status = st.value; save(); renderCal(); };
      var del = B.h('button', { class: 'btn small', text: 'Delete', onclick: function () { S.posts = S.posts.filter(function (x) { return x !== p; }); save(); renderCal(); renderPerf(); } });
      tb.appendChild(B.h('tr', { id: 'row-' + p.id }, [B.h('td', { text: p.title }), B.h('td', {}, [date]), B.h('td', {}, [plat]), B.h('td', {}, [st]), B.h('td', {}, [del])]));
    });
    tbl.appendChild(tb); box.appendChild(B.h('div', { class: 'table-wrap' }, [tbl]));
  }

  // ---------- Performance ----------
  var METRICS = [['views', 'Views'], ['likes', 'Likes'], ['shares', 'Shares'], ['comments', 'Comments'], ['watch', 'Avg watch (s)']];
  function renderPerf() {
    var posted = S.posts.filter(function (p) { return p.status === 'posted' || Number(p.views) > 0; });
    var box = $('#perfTable'); box.innerHTML = '';
    if (!posted.length) box.innerHTML = '<p class="muted">Mark a post as “posted” in the calendar to log its numbers here.</p>';
    else {
      var tbl = B.h('table'), tb = B.h('tbody');
      tbl.appendChild(B.h('thead', { html: '<tr><th>Post</th>' + METRICS.map(function (m) { return '<th>' + m[1] + '</th>'; }).join('') + '<th>Engagement</th></tr>' }));
      posted.forEach(function (p) {
        var engCell = B.h('td');
        function eng() { var v = Number(p.views) || 0; engCell.textContent = v ? B.fmt.pct(((+p.likes || 0) + (+p.shares || 0) + (+p.comments || 0)) / v) : '–'; }
        var tr = B.h('tr', {}, [B.h('td', {}, [B.h('div', { text: p.title }), B.h('div', { class: 'small muted', text: (p.date || '') + ' · ' + L.PLATFORMS[p.platform].label })])]);
        METRICS.forEach(function (m) {
          var inp = B.h('input', { type: 'number', min: '0', value: p[m[0]] == null ? '' : p[m[0]], 'aria-label': m[1] + ' for ' + p.title });
          inp.onchange = function () { p[m[0]] = inp.value === '' ? null : Number(inp.value); save(); eng(); renderPerfCharts(); };
          tr.appendChild(B.h('td', {}, [inp]));
        });
        eng(); tr.appendChild(engCell); tb.appendChild(tr);
      });
      tbl.appendChild(tb); box.appendChild(B.h('div', { class: 'table-wrap' }, [tbl]));
    }
    renderPerfCharts();
  }
  function renderPerfCharts() {
    var r = L.perf(S.posts);
    $('#perfStats').innerHTML = [['Posts with data', B.fmt.num(r.posts, 0)], ['Total views', B.fmt.num(r.totals.views, 0)], ['Average views', B.fmt.num(r.avgViews, 0)],
      ['Engagement', B.fmt.pct(r.engagement)], ['Total shares', B.fmt.num(r.totals.shares, 0)], ['Avg watch', r.avgWatch ? B.fmt.num(r.avgWatch, 1) + ' s' : '–']]
      .map(function (s) { return '<div class="stat"><div class="k">' + s[0] + '</div><div class="v">' + s[1] + '</div></div>'; }).join('');
    var top = r.rows.slice(0, 12);
    $('#chartViews').innerHTML = top.length ? B.barChart(top.map(function (x) { return { label: x.title, value: x.views }; }), { fmt: function (v) { return B.fmt.num(v, 0); } }) : '<p class="muted small">No numbers yet.</p>';
    $('#chartEng').innerHTML = top.length ? B.barChart(top.slice().sort(function (a, b) { return b.engagement - a.engagement; }).map(function (x) { return { label: x.title, value: x.engagement }; }), { fmt: function (v) { return B.fmt.pct(v); } }) : '<p class="muted small">No numbers yet.</p>';
    $('#chartPlat').innerHTML = r.byPlatform.length ? B.barChart(r.byPlatform.map(function (b) { return { label: L.PLATFORMS[b.platform] ? L.PLATFORMS[b.platform].label + ' (' + b.posts + ')' : b.platform, value: b.avgViews }; }), { fmt: function (v) { return B.fmt.num(v, 0); } }) : '<p class="muted small">No numbers yet.</p>';
  }

  // ---------- AI extras (hidden when AI is off) ----------
  B.ai.note($('#aiNote'));
  B.ai.button($('#aiIdeas'), 'Five fresh ideas', function () {
    return 'Suggest 5 original short-video story ideas (30–60 seconds, emotional, suitable for Facebook Reels and YouTube Shorts' +
      ($('#genre').value ? ', genre: ' + $('#genre').value : '') + ($('#emotion').value ? ', main emotion: ' + $('#emotion').value : '') +
      '). Do not use existing shows, films or characters. Reply as a JSON array of objects with keys genre, emotion, logline (one sentence with a twist).';
  }, function (ans) {
    var arr = B.ai.parseJSON(ans); if (!Array.isArray(arr)) { B.toast('The AI reply was not a list — try again.'); return; }
    var box = $('#concepts'); box.innerHTML = '';
    shown = arr.filter(function (x) { return x && x.logline; }).map(function (x) {
      return { id: L.hashSeed(x.logline).toString(36), genre: String(x.genre || 'drama'), emotion: String(x.emotion || 'emotion'), logline: String(x.logline), setting: '', twist: '', protagonist: '', want: '' };
    });
    shown.forEach(function (c) { box.appendChild(conceptCard(c, false)); });
  }, { json: true, temperature: 0.9 });
  B.ai.button($('#aiTitles'), 'More title ideas', function () {
    var e = ep(); return 'Write 10 short, curiosity-driven titles (under 60 characters) for this short story video: ' + (e ? e.concept.logline : (shown[0] || {}).logline) + ' No clickbait lies. One per line, no numbering.';
  }, function (ans) {
    ans.split('\n').map(function (s) { return s.replace(/^[\s\d.\-*"]+|"$/g, '').trim(); }).filter(Boolean).slice(0, 10).forEach(function (t) {
      $('#titleList').appendChild(B.h('div', { class: 'row', style: 'justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0' }, [
        B.h('span', {}, ['✨ ' + t]), B.h('button', { class: 'btn small', text: 'Copy', onclick: function () { B.copy(t); } })]));
    });
  }, { temperature: 0.9 });

  // ---------- series name, backup, sample ----------
  $('#seriesName').value = S.series.name || '';
  $('#seriesName').oninput = function () { S.series.name = this.value; save(); };
  $('#export').onclick = function () { B.download('creator-autopilot-backup.json', L.exportBackup(S), 'application/json'); };
  $('#import').onclick = function () {
    var inp = B.h('input', { type: 'file', accept: '.json,application/json' });
    inp.onchange = function () {
      if (!inp.files[0]) return;
      B.readFile(inp.files[0]).then(function (t) { S = L.importBackup(t); ui.ep = null; save(); $('#seriesName').value = S.series.name; renderAll(); B.toast('Backup restored'); })
        .catch(function (err) { B.toast(err.message || 'Could not read that file'); });
    };
    inp.click();
  };
  $('#clear').onclick = function () { if (!confirm('Delete all series data in this browser?')) return; S = L.emptyState(); ui.ep = null; save(); $('#seriesName').value = ''; renderAll(); };
  $('#sample').onclick = function () {
    if ((S.characters.length || S.episodes.length || S.posts.length) && !confirm('Replace your current data with the sample series?')) return;
    S = sampleState(); ui.ep = S.episodes[0].id; ui.month = todayIso.slice(0, 7); save(); $('#seriesName').value = S.series.name; renderAll(); B.toast('Sample series loaded');
  };
  function sampleState() {
    var s = L.emptyState(); s.series.name = 'Chitthi — short family stories';
    var dadi = { id: 'c-dadi', name: 'Kamla', age: '68', look: 'thin face, silver hair in a low bun, round steel glasses, laugh lines', outfit: 'faded green cotton saree with a thin red border, beige shawl', voice: 'soft, slow, slightly hoarse Hindi', traits: 'proud, secretly generous, hides worry with jokes' };
    var raju = { id: 'c-raju', name: 'Raju', age: '24', look: 'lean build, messy black hair, light stubble, tired eyes', outfit: 'blue delivery jacket over a grey T-shirt, black backpack', voice: 'quick, warm, Hinglish', traits: 'restless, loyal, too proud to ask for help' };
    var meera = { id: 'c-meera', name: 'Meera', age: '9', look: 'small, two oiled plaits, gap-toothed smile', outfit: 'navy school pinafore, white socks, red hair ribbons', voice: 'bright, curious', traits: 'notices everything, keeps secrets badly' };
    s.characters = [dadi, raju, meera];
    var cs = L.concepts('chitthi-demo', 4, { emotion: 'sacrifice' }); s.savedConcepts = cs.slice(0, 2);
    var c1 = { genre: 'family drama', emotion: 'sacrifice', setting: 'a cramped rented flat', protagonist: 'a proud grandmother', want: 'is saving every coin for someone else',
      twist: 'the grandson she scolds every night has been paying her rent in secret', logline: 'Kamla scolds her grandson Raju for coming home late every night — until Meera shows her the rent receipts he has been paying in secret.' };
    var e1 = { id: 'e-1', title: 'Episode 1 — The late shift', concept: c1, length: 30, platform: 'reels', style: 'warm', charIds: ['c-dadi', 'c-raju', 'c-meera'] };
    e1.scenes = L.breakdown(30, c1, [dadi, raju]);
    e1.scenes[0].text = 'Close-up: Kamla stares at the clock at 1 a.m., a cold plate of rotis beside her.';
    e1.scenes[2].text = 'Raju walks in, still in his delivery jacket. Kamla snaps at him; he says nothing and goes to bed.';
    e1.scenes[3].text = 'Meera tiptoes in and hands Kamla a bundle of rent receipts — all signed by Raju.';
    var e2 = { id: 'e-2', title: 'Episode 2 — The ribbon', concept: Object.assign({}, cs[2], { logline: 'Meera loses her red ribbon on the school bus, and a stranger returns it with a note that changes Kamla’s day.' }), length: 60, platform: 'shorts', style: 'cinematic', charIds: ['c-meera', 'c-dadi'] };
    e2.scenes = L.breakdown(60, e2.concept, [meera, dadi]);
    s.episodes = [e1, e2];
    var base = new Date(); function day(off) { var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + off); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    s.posts = [
      { id: 'p1', title: 'Teaser — Kamla waits up', platform: 'reels', date: day(-12), status: 'posted', views: 18400, likes: 1320, shares: 410, comments: 96, watch: 11.2 },
      { id: 'p2', title: 'Ep 1 — The late shift', episodeId: 'e-1', platform: 'reels', date: day(-9), status: 'posted', views: 52300, likes: 4810, shares: 2240, comments: 388, watch: 21.5 },
      { id: 'p3', title: 'Ep 1 — The late shift', episodeId: 'e-1', platform: 'shorts', date: day(-8), status: 'posted', views: 31200, likes: 2050, shares: 310, comments: 141, watch: 18.9 },
      { id: 'p4', title: 'Behind the prompts', platform: 'shorts', date: day(-5), status: 'posted', views: 4100, likes: 160, shares: 12, comments: 22, watch: 9.4 },
      { id: 'p5', title: 'Ep 2 — The ribbon', episodeId: 'e-2', platform: 'shorts', date: day(-1), status: 'posted', views: 12800, likes: 990, shares: 205, comments: 64, watch: 33.1 },
      { id: 'p6', title: 'Ep 2 — The ribbon', episodeId: 'e-2', platform: 'reels', date: day(2), status: 'produced' },
      { id: 'p7', title: 'Ep 3 — Kamla’s letter', platform: 'reels', date: day(6), status: 'scripted' },
      { id: 'p8', title: 'Ep 4 — idea: the tailor', platform: 'shorts', date: day(11), status: 'idea' }
    ];
    return s;
  }

  function renderAll() { renderSaved(); renderChars(); renderEpisode(); renderTitles(); renderPostForm(); renderCal(); renderPerf(); }
  B.tabs(B.$('[data-tabs="main"]'));
  renderConcepts(); renderAll();
})();
