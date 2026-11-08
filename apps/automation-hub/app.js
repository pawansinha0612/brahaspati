/* Automation Hub — DOM wiring. Logic in lib.js (AutomationLib). */
(function () {
  'use strict';
  var A = window.AutomationLib, $ = B.$;
  var HAS_FSA = typeof window.showDirectoryPicker === 'function';
  var MAX_FILES = 20000, MAX_HASH = 1024 * 1024 * 1024;
  // folder: {mode:'fsa'|'readonly', sample, name, root, entries:[{name, path, size, lastModified, top, handle, parent, file}]}
  var folder = null;

  // ---------- choosing / scanning a folder ----------
  function setMode() {
    var box = $('#ah-mode-box'), el = $('#ah-mode');
    $('#ah-folder').textContent = folder ? folder.name + ' — ' + folder.entries.length + ' file' + (folder.entries.length === 1 ? '' : 's') + (folder.truncated ? ' (first ' + MAX_FILES + ' only)' : '') : '';
    box.classList.toggle('ah-ro', !!folder && folder.mode !== 'fsa');
    if (!folder) {
      el.innerHTML = HAS_FSA ? 'Your browser can make changes to a folder you choose (it will ask permission first).'
        : 'This browser can only <strong>read</strong> folders — Chrome or Edge on a computer can also make changes. You can still preview everything here and download a script that makes the changes for you.';
      return;
    }
    if (folder.mode === 'fsa') el.innerHTML = folder.sample ? 'Sample folder: these files live in this browser’s private storage, so it’s safe to try renaming, moving and deleting.' : '<span class="pill-ok">Full access</span> Changes are made directly in this folder when you press Apply.';
    else el.innerHTML = '<span class="pill-warn">Read-only</span> This browser can’t change files on disk' + (folder.sample ? ' (sample files only exist in memory)' : '') + '. Preview here, then download the script and run it yourself.';
  }
  function skipDir(n) { return n.charAt(0) === '.' || n === 'node_modules' || n === '$RECYCLE.BIN'; }
  async function scanFsa(root, name, sample) {
    var entries = [], truncated = false;
    async function walk(dir, prefix) {
      for await (var h of dir.values()) {
        if (entries.length >= MAX_FILES) { truncated = true; return; }
        if (h.kind === 'directory') { if (!skipDir(h.name)) await walk(h, prefix + h.name + '/'); continue; }
        if (h.name === '.DS_Store' || /^\.bh-tmp-/.test(h.name)) continue;
        var f = await h.getFile();
        entries.push({ name: h.name, path: prefix + h.name, size: f.size, lastModified: f.lastModified, top: !prefix, handle: h, parent: dir });
      }
    }
    await walk(root, '');
    folder = { mode: 'fsa', sample: !!sample, name: name, root: root, entries: entries, truncated: truncated };
    refreshAll();
  }
  function scanInput(files, sample) {
    var list = files.filter(function (f) { return f.name !== '.DS_Store'; }).slice(0, MAX_FILES).map(function (f) {
      var rel = f.webkitRelativePath || f.name, path = rel.indexOf('/') > -1 ? rel.slice(rel.indexOf('/') + 1) : rel;
      return { name: f.name, path: path, size: f.size, lastModified: f.lastModified, top: path.indexOf('/') < 0, file: f };
    }).filter(function (e) { return !e.path.split('/').slice(0, -1).some(skipDir); });
    var first = files[0] && files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : 'Sample folder';
    folder = { mode: 'readonly', sample: !!sample, name: first, root: null, entries: list, truncated: files.length > MAX_FILES };
    refreshAll();
  }
  function rescan() { return folder && folder.mode === 'fsa' ? scanFsa(folder.root, folder.name, folder.sample) : Promise.resolve(); }
  function getFile(e) { return e.file ? Promise.resolve(e.file) : e.handle.getFile(); }

  $('#ah-pick').addEventListener('click', function () {
    if (!HAS_FSA) { $('#ah-dir-input').click(); return; }
    window.showDirectoryPicker({ mode: 'readwrite' }).then(function (dir) { return scanFsa(dir, dir.name, false); })
      .catch(function (e) { if (e && e.name !== 'AbortError') B.toast(e.message || 'Could not open that folder', 4000); });
  });
  $('#ah-dir-input').addEventListener('change', function () { var f = [].slice.call(this.files); this.value = ''; if (f.length) scanInput(f, false); });

  // Sample folder: real files in the browser's private storage (OPFS) when available, so every action can be tried safely.
  var SAMPLE = [
    ['IMG_2041.JPG', 'photo-a'], ['IMG_2042.JPG', 'photo-b'], ['Holiday photo copy.JPG', 'photo-a'], ['Invoice March.pdf', 'invoice-march'],
    ['invoice march (1).pdf', 'invoice-march'], ['Team song.mp3', 'audio'], ['notes  from   meeting.txt', 'notes'], ['backup 2025.zip', 'zip'],
    ['clean_data.py', 'print(1)'], ['Report FINAL v2.docx', 'report'], ['screen recording.mov', 'video'], ['old/IMG_2041.JPG', 'photo-a']
  ];
  $('#ah-sample').addEventListener('click', async function () {
    try {
      if (!(navigator.storage && navigator.storage.getDirectory)) throw new Error('no OPFS');
      var opfs = await navigator.storage.getDirectory();
      try { await opfs.removeEntry('brahaspati-sample-folder', { recursive: true }); } catch (e) { /* first time */ }
      var dir = await opfs.getDirectoryHandle('brahaspati-sample-folder', { create: true });
      for (var i = 0; i < SAMPLE.length; i++) {
        var parts = SAMPLE[i][0].split('/'), d = dir;
        if (parts.length > 1) d = await dir.getDirectoryHandle(parts[0], { create: true });
        var fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
        if (!fh.createWritable) throw new Error('no writable');
        var w = await fh.createWritable(); await w.write(SAMPLE[i][1].repeat(200)); await w.close();
      }
      await scanFsa(dir, 'Sample folder', true);
    } catch (err) {
      var base = Date.now() - 86400000 * 40;
      scanInput(SAMPLE.map(function (s, i) {
        var f = new File([s[1].repeat(200)], s[0].split('/').pop(), { lastModified: base + i * 86400000 * 3 });
        Object.defineProperty(f, 'webkitRelativePath', { value: 'Sample folder/' + s[0] }); return f;
      }), true);
    }
    B.toast('Sample folder ready');
  });

  // ---------- file moves via the File System Access API ----------
  async function exists(dir, name) { try { await dir.getFileHandle(name); return true; } catch (e) { try { await dir.getDirectoryHandle(name); return true; } catch (e2) { return false; } } }
  async function moveFile(srcDir, name, dstDir, newName) {
    var fh = await srcDir.getFileHandle(name);
    if (await exists(dstDir, newName)) throw new Error('“' + newName + '” already exists there');
    if (typeof fh.move === 'function') {
      try { if (srcDir === dstDir || (srcDir.isSameEntry && await srcDir.isSameEntry(dstDir))) await fh.move(newName); else await fh.move(dstDir, newName); return; }
      catch (e) { if (!/NotSupported|TypeError|InvalidModification/.test(e.name)) throw e; }
    }
    // Fallback: copy then remove (the copy gets today's "modified" date).
    var file = await fh.getFile(), nh = await dstDir.getFileHandle(newName, { create: true }), w = await nh.createWritable();
    await w.write(file); await w.close();
    await srcDir.removeEntry(name);
  }
  async function dirFor(path) {
    var parts = path.split('/').slice(0, -1), d = folder.root;
    for (var i = 0; i < parts.length; i++) d = await d.getDirectoryHandle(parts[i], { create: true });
    return d;
  }
  function needWrite() {
    if (!folder) { B.toast('Choose a folder first'); return false; }
    if (folder.mode !== 'fsa') { B.toast('This browser can’t change files — download the script instead', 4000); return false; }
    return true;
  }
  function showErrors(box, errors) {
    if (!errors.length) return;
    box.insertAdjacentHTML('afterbegin', '<div class="panel" style="border-color:var(--bad)"><strong>' + errors.length + ' file(s) could not be changed:</strong><ul class="small">' +
      errors.slice(0, 50).map(function (e) { return '<li>' + B.esc(e) + '</li>'; }).join('') + '</ul></div>');
  }

  // ---------- rename ----------
  function rules() {
    return {
      find: $('#rn-find').value, replace: $('#rn-replace').value, regex: $('#rn-regex').checked, caseSensitive: $('#rn-cs').checked,
      prefix: $('#rn-prefix').value, suffix: $('#rn-suffix').value, caseMode: $('#rn-case').value, ext: $('#rn-ext').value,
      extLower: $('#rn-extlower').checked, collapseSpaces: $('#rn-spaces').checked,
      seq: { on: $('#rn-seq').checked, start: +$('#rn-seq-start').value || 0, step: 1, pad: Math.min(8, Math.max(1, +$('#rn-seq-pad').value || 1)), where: $('#rn-seq-where').value, sep: '-' },
      date: { on: $('#rn-date').checked, format: $('#rn-date-fmt').value, where: $('#rn-date-where').value, sep: '_' }
    };
  }
  var RN_IDS = ['rn-find', 'rn-replace', 'rn-regex', 'rn-cs', 'rn-prefix', 'rn-suffix', 'rn-case', 'rn-ext', 'rn-extlower', 'rn-spaces', 'rn-seq', 'rn-seq-start', 'rn-seq-pad', 'rn-seq-where', 'rn-sort', 'rn-date', 'rn-date-fmt', 'rn-date-where'];
  function topFiles() {
    if (!folder) return [];
    var list = folder.entries.filter(function (e) { return e.top; }), by = $('#rn-sort').value;
    return list.sort(function (a, b) { return by === 'date' ? a.lastModified - b.lastModified : by === 'size' ? a.size - b.size : a.name.localeCompare(b.name, 'en', { numeric: true }); });
  }
  var rnPlan = [];
  function renderRename() {
    var box = $('#rn-preview'), sum = $('#rn-summary');
    if (!folder) { box.innerHTML = ''; sum.textContent = 'Choose a folder or try the sample to see a preview.'; return; }
    rnPlan = A.renamePlan(topFiles(), rules());
    var s = A.planSummary(rnPlan);
    sum.innerHTML = s.total + ' files · <strong>' + s.changes + '</strong> will be renamed · ' + s.same + ' unchanged' + (s.problems ? ' · <span class="bad">' + s.problems + ' problem(s) to fix first</span>' : '');
    $('#rn-apply').disabled = !s.changes || !!s.problems;
    var shown = rnPlan.filter(function (p) { return p.status !== 'same'; });
    if (!shown.length) { box.innerHTML = '<p class="muted">Set a rule above to see the new names.</p>'; return; }
    var pill = { ok: '<span class="pill-ok">OK</span>', conflict: '<span class="pill-bad">Clash</span>', exists: '<span class="pill-bad">Exists</span>', invalid: '<span class="pill-bad">Invalid</span>' };
    box.innerHTML = B.table(shown, [
      { key: 'from', label: 'Now', fmt: function (v) { return '<span class="ah-old">' + B.esc(v) + '</span>'; } },
      { key: 'to', label: 'Will be', fmt: function (v) { return '<span class="ah-new">' + B.esc(v) + '</span>'; } },
      { key: 'status', label: '', fmt: function (v, r) { return pill[v] + (r.note ? '<div class="small muted">' + B.esc(r.note) + '</div>' : ''); } }
    ], { limit: 500 });
  }
  RN_IDS.forEach(function (id) { var el = $('#' + id); el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', renderRename); });
  $('#rn-reset').addEventListener('click', function () {
    RN_IDS.forEach(function (id) { var el = $('#' + id); if (el.type === 'checkbox') el.checked = false; else if (el.tagName === 'SELECT') el.selectedIndex = 0; else if (el.type !== 'number') el.value = ''; });
    renderRename();
  });
  function rnMoves() { return rnPlan.filter(function (p) { return p.status === 'ok'; }).map(function (p) { return { from: p.from, to: p.to }; }); }
  $('#rn-apply').addEventListener('click', async function () {
    if (!needWrite()) return;
    var moves = rnMoves(); if (!moves.length) return;
    if (!confirm('Rename ' + moves.length + ' file(s) in “' + folder.name + '”?')) return;
    var steps = A.moveSteps(moves), errors = [], btn = this; btn.disabled = true;
    for (var i = 0; i < steps.length; i++) {
      $('#rn-summary').textContent = 'Renaming ' + (i + 1) + ' of ' + steps.length + '…';
      try { await moveFile(folder.root, steps[i].from, folder.root, steps[i].to); } catch (e) { errors.push(steps[i].from + ' → ' + steps[i].to + ': ' + e.message); }
    }
    await rescan(); showErrors($('#rn-preview'), errors);
    B.toast(errors.length ? 'Done with ' + errors.length + ' problem(s)' : 'Renamed ' + moves.length + ' file(s)', 3500);
  });
  $('#rn-sh').addEventListener('click', function () { var m = rnMoves(); if (!m.length) return B.toast('No renames to export'); B.download('rename-files.sh', A.bashMoves(m, { title: 'Rename files', file: 'rename-files.sh' })); });
  $('#rn-ps').addEventListener('click', function () { var m = rnMoves(); if (!m.length) return B.toast('No renames to export'); B.download('rename-files.ps1', A.psMoves(m, { title: 'Rename files', file: 'rename-files.ps1' })); });

  // ---------- organise ----------
  var ogPlan = [];
  function ogOpts() { return { byType: $('#og-type').checked, byDate: $('#og-date').checked, dateFormat: $('#og-fmt').value }; }
  function renderOrganise() {
    var box = $('#og-preview'), sum = $('#og-summary'), o = ogOpts();
    renderSchedule();
    if (!folder) { box.innerHTML = ''; $('#og-folders').innerHTML = ''; sum.textContent = 'Choose a folder or try the sample to see a preview.'; return; }
    if (!o.byType && !o.byDate) { box.innerHTML = ''; $('#og-folders').innerHTML = ''; sum.textContent = 'Tick “By type” and/or “By year-month”.'; $('#og-apply').disabled = true; return; }
    ogPlan = A.organisePlan(folder.entries.filter(function (e) { return e.top; }), o, folder.entries.map(function (e) { return e.path; }));
    var ok = ogPlan.filter(function (p) { return p.status === 'ok'; }), bad = ogPlan.filter(function (p) { return p.status === 'exists' || p.status === 'conflict'; });
    sum.innerHTML = '<strong>' + ok.length + '</strong> file(s) will move' + (bad.length ? ' · <span class="warn">' + bad.length + ' skipped (a file with that name is already there)</span>' : '');
    $('#og-apply').disabled = !ok.length;
    $('#og-folders').innerHTML = ok.length ? B.barChart(A.folderCounts(ogPlan).map(function (f) { return { label: f.folder, value: f.count }; }), { fmt: function (v) { return v + ' file' + (v === 1 ? '' : 's'); } }) : '';
    box.innerHTML = ogPlan.filter(function (p) { return p.status !== 'same'; }).length ? B.table(ogPlan.filter(function (p) { return p.status !== 'same'; }), [
      { key: 'from', label: 'File' }, { key: 'folder', label: 'Moves to', fmt: function (v) { return '<span class="ah-new">' + B.esc(v) + '/</span>'; } },
      { key: 'status', label: '', fmt: function (v, r) { return v === 'ok' ? '<span class="pill-ok">OK</span>' : '<span class="pill-warn">Skip</span><div class="small muted">' + B.esc(r.note) + '</div>'; } }
    ], { limit: 500 }) : '<p class="muted">Nothing to move.</p>';
  }
  ['#og-type', '#og-date', '#og-fmt'].forEach(function (s) { $(s).addEventListener('change', renderOrganise); });
  $('#og-apply').addEventListener('click', async function () {
    if (!needWrite()) return;
    var ok = ogPlan.filter(function (p) { return p.status === 'ok'; }); if (!ok.length) return;
    if (!confirm('Move ' + ok.length + ' file(s) into sub-folders of “' + folder.name + '”?')) return;
    var errors = [];
    for (var i = 0; i < ok.length; i++) {
      $('#og-summary').textContent = 'Moving ' + (i + 1) + ' of ' + ok.length + '…';
      try { await moveFile(folder.root, ok[i].from, await dirFor(ok[i].to), ok[i].from); } catch (e) { errors.push(ok[i].from + ': ' + e.message); }
    }
    await rescan(); showErrors($('#og-preview'), errors);
    B.toast(errors.length ? 'Done with ' + errors.length + ' problem(s)' : 'Moved ' + ok.length + ' file(s)', 3500);
  });
  function ogMoves() { return ogPlan.filter(function (p) { return p.status === 'ok'; }).map(function (p) { return { from: p.from, to: p.to }; }); }
  $('#og-sh').addEventListener('click', function () { var m = ogMoves(); if (!m.length) return B.toast('Nothing to move'); B.download('organise-these-files.sh', A.bashMoves(m, { title: 'Organise these files', file: 'organise-these-files.sh' })); });
  $('#og-ps').addEventListener('click', function () { var m = ogMoves(); if (!m.length) return B.toast('Nothing to move'); B.download('organise-these-files.ps1', A.psMoves(m, { title: 'Organise these files', file: 'organise-these-files.ps1' })); });

  // ---------- duplicates ----------
  var dupResult = null;
  async function sha256(file) { return A.hex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())); }
  $('#dp-scan').addEventListener('click', async function () {
    if (!folder) return B.toast('Choose a folder first');
    if (!(window.crypto && crypto.subtle)) { $('#dp-status').textContent = 'This page needs to be opened over https to fingerprint files.'; return; }
    var btn = this; btn.disabled = true;
    var groups = A.sizeGroups(folder.entries), todo = [].concat.apply([], groups), skipped = 0;
    folder.entries.forEach(function (e) { delete e.hash; });
    for (var i = 0; i < todo.length; i++) {
      $('#dp-status').textContent = 'Checking ' + (i + 1) + ' of ' + todo.length + ' same-size files…';
      if (todo[i].size > MAX_HASH) { skipped++; continue; }
      try { todo[i].hash = await sha256(await getFile(todo[i])); } catch (e) { skipped++; }
    }
    dupResult = A.duplicateGroups(folder.entries);
    $('#dp-status').textContent = 'Checked ' + folder.entries.length + ' files.' + (skipped ? ' ' + skipped + ' could not be read or were over 1 GB and were skipped.' : '');
    btn.disabled = false; renderDupes();
  });
  function renderDupes() {
    var box = $('#dp-groups'); box.innerHTML = '';
    if (!dupResult) { $('#dp-stats').innerHTML = ''; $('#dp-actions').hidden = true; return; }
    $('#dp-stats').innerHTML = [['Duplicate groups', dupResult.groups.length], ['Extra copies', dupResult.extraFiles], ['Space you could free', A.fmtBytes(dupResult.wasted)]]
      .map(function (x) { return '<div class="stat"><div class="k">' + x[0] + '</div><div class="v">' + x[1] + '</div></div>'; }).join('');
    $('#dp-actions').hidden = !dupResult.groups.length;
    $('#dp-delete').hidden = !folder || folder.mode !== 'fsa';
    if (!dupResult.groups.length) { box.innerHTML = '<p class="ok">No duplicate files found.</p>'; return; }
    dupResult.groups.slice(0, 300).forEach(function (g, gi) {
      var el = B.h('div', { class: 'ah-group' }, [B.h('div', { class: 'small muted', text: g.files.length + ' identical files · ' + A.fmtBytes(g.size) + ' each' })]);
      g.files.forEach(function (f) {
        var keep = f.path === g.keep;
        el.appendChild(B.h('label', {}, [B.h('input', { type: 'checkbox', 'data-path': f.path, 'data-group': gi, checked: !keep }),
          B.h('span', { html: B.esc(f.path) + ' <span class="small muted">· ' + B.fmt.date(f.lastModified) + '</span>' + (keep ? ' <span class="pill-ok">keep (oldest)</span>' : '') })]));
      });
      box.appendChild(el);
    });
    if (dupResult.groups.length > 300) box.appendChild(B.h('p', { class: 'small muted', text: 'Showing the 300 groups that waste the most space.' }));
  }
  function ticked() {
    var byGroup = {}, out = [], whole = 0;
    B.$$('#dp-groups input[type=checkbox]').forEach(function (c) { var g = c.dataset.group; byGroup[g] = byGroup[g] || { all: 0, on: [] }; byGroup[g].all++; if (c.checked) byGroup[g].on.push(c.dataset.path); });
    Object.keys(byGroup).forEach(function (g) { if (byGroup[g].on.length === byGroup[g].all) whole++; else out = out.concat(byGroup[g].on); });
    return { paths: out, wholeGroups: whole };
  }
  $('#dp-delete').addEventListener('click', async function () {
    if (!needWrite()) return;
    var t = ticked();
    if (t.wholeGroups) B.toast(t.wholeGroups + ' group(s) had every copy ticked — those were skipped so you keep at least one.', 5000);
    if (!t.paths.length) return;
    var size = 0; t.paths.forEach(function (p) { var e = folder.entries.find(function (x) { return x.path === p; }); if (e) size += e.size; });
    if (!confirm('Permanently delete ' + t.paths.length + ' file(s) (' + A.fmtBytes(size) + ')? They will not go to the Bin.')) return;
    var errors = [];
    for (var i = 0; i < t.paths.length; i++) {
      var e = folder.entries.find(function (x) { return x.path === t.paths[i]; });
      try { await e.parent.removeEntry(e.name); } catch (err) { errors.push(t.paths[i] + ': ' + err.message); }
    }
    await rescan(); dupResult = null; renderDupes();
    $('#dp-status').textContent = 'Deleted ' + (t.paths.length - errors.length) + ' file(s). Run “Find duplicates” again to re-check.';
    showErrors($('#dp-groups'), errors);
  });
  $('#dp-sh').addEventListener('click', function () { var t = ticked(); if (!t.paths.length) return B.toast('Tick some files first'); B.download('delete-duplicates.sh', A.bashDelete(t.paths)); });
  $('#dp-ps').addEventListener('click', function () { var t = ticked(); if (!t.paths.length) return B.toast('Tick some files first'); B.download('delete-duplicates.ps1', A.psDelete(t.paths)); });

  // ---------- CSV recipes ----------
  var csv = null, csvName = 'cleaned', steps = [];
  function result() { return csv ? A.applyRecipe(csv, steps) : null; }
  function colOptions(withAll) { var r = result(), hs = r ? r.table.headers : []; return (withAll ? '<option value="*">All columns</option>' : '') + hs.map(function (h) { return '<option>' + B.esc(h) + '</option>'; }).join(''); }
  function chips(inputId) {
    var r = result(); if (!r) return '';
    return '<div class="row small" style="gap:4px;margin-top:4px">' + r.table.headers.map(function (h) { return '<button type="button" class="btn small" data-chip="' + inputId + '" data-col="' + B.esc(h) + '">+ ' + B.esc(h) + '</button>'; }).join('') + '</div>';
  }
  var FORMS = {
    trim: function () { return '<p class="small muted">Removes extra spaces in every cell and drops rows that are completely empty.</p>'; },
    dedupe: function () { return '<label for="f-cols">Compare these columns (empty = whole row)</label><input type="text" id="f-cols" placeholder="e.g. Email">' + chips('f-cols'); },
    filter: function () { return '<label for="f-col">Column</label><select id="f-col">' + colOptions() + '</select><label for="f-op">Rule</label><select id="f-op"><option value="contains">contains</option><option value="not-contains">does not contain</option><option value="equals">is exactly</option><option value="not-equals">is not</option><option value="not-empty">is not empty</option><option value="empty">is empty</option><option value="gt">is more than (number)</option><option value="lt">is less than (number)</option><option value="regex">matches pattern (regex)</option></select><label for="f-val">Value</label><input type="text" id="f-val">'; },
    rename: function () { return '<label for="f-col">Column</label><select id="f-col">' + colOptions() + '</select><label for="f-to">New name</label><input type="text" id="f-to">'; },
    remove: function () { return '<label for="f-cols">Columns to remove</label><input type="text" id="f-cols" placeholder="comma separated">' + chips('f-cols'); },
    reorder: function () { return '<label for="f-cols">Columns to put first, in order</label><input type="text" id="f-cols" placeholder="comma separated">' + chips('f-cols'); },
    split: function () { return '<label for="f-col">Column</label><select id="f-col">' + colOptions() + '</select><label for="f-sep">Split on</label><input type="text" id="f-sep" value=" " placeholder="space"><label for="f-into">New column names</label><input type="text" id="f-into" placeholder="e.g. First name, Last name"><label class="ah-check"><input type="checkbox" id="f-keep"> Keep the original column</label>'; },
    merge: function () { return '<label for="f-cols">Columns to join, in order</label><input type="text" id="f-cols" placeholder="e.g. First name, Last name">' + chips('f-cols') + '<label for="f-sep">Put between them</label><input type="text" id="f-sep" value=" "><label for="f-into">New column name</label><input type="text" id="f-into" placeholder="e.g. Full name"><label class="ah-check"><input type="checkbox" id="f-keep"> Keep the original columns</label>'; },
    'case': function () { return '<label for="f-col">Column</label><select id="f-col">' + colOptions(true) + '</select><label for="f-mode">Change to</label><select id="f-mode"><option value="title">Title Case</option><option value="upper">UPPER CASE</option><option value="lower">lower case</option><option value="sentence">Sentence case</option></select>'; },
    replace: function () { return '<label for="f-col">Column</label><select id="f-col">' + colOptions(true) + '</select><label for="f-find">Find</label><input type="text" id="f-find"><label for="f-rep">Replace with</label><input type="text" id="f-rep"><label class="ah-check"><input type="checkbox" id="f-regex"> Find is a pattern (regex)</label>'; },
    sort: function () { return '<label for="f-col">Sort by</label><select id="f-col">' + colOptions() + '</select><label for="f-dir">Order</label><select id="f-dir"><option value="asc">Low to high / A–Z</option><option value="desc">High to low / Z–A</option></select>'; }
  };
  function v(id) { var el = $('#' + id); return el ? (el.type === 'checkbox' ? el.checked : el.value) : undefined; }
  function readForm(type) {
    switch (type) {
      case 'trim': return { type: type };
      case 'dedupe': case 'remove': case 'reorder': return { type: type, cols: v('f-cols') };
      case 'filter': return { type: type, col: v('f-col'), op: v('f-op'), value: v('f-val') };
      case 'rename': return { type: type, from: v('f-col'), to: v('f-to') };
      case 'split': return { type: type, col: v('f-col'), sep: v('f-sep'), into: v('f-into'), keep: v('f-keep') };
      case 'merge': return { type: type, cols: v('f-cols'), sep: v('f-sep'), into: v('f-into'), keep: v('f-keep') };
      case 'case': return { type: type, col: v('f-col'), mode: v('f-mode') };
      case 'replace': return { type: type, col: v('f-col'), find: v('f-find'), replace: v('f-rep'), regex: v('f-regex') };
      case 'sort': return { type: type, col: v('f-col'), dir: v('f-dir') };
    }
  }
  function renderForm() { $('#cv-form').innerHTML = FORMS[$('#cv-type').value](); }
  $('#cv-type').addEventListener('change', renderForm);
  $('#cv-form').addEventListener('click', function (e) {
    var b = e.target.closest('[data-chip]'); if (!b) return;
    var inp = $('#' + b.dataset.chip), cur = inp.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (cur.indexOf(b.dataset.col) < 0) cur.push(b.dataset.col); inp.value = cur.join(', ');
  });
  $('#cv-add').addEventListener('click', function () {
    var s = readForm($('#cv-type').value);
    if (csv) { try { A.applyStep(result().table, s); } catch (e) { B.toast(e.message, 3500); return; } }
    steps.push(s); renderCsv(); renderForm();
  });
  function renderCsv() {
    var list = $('#cv-steps'), r = result();
    list.innerHTML = '';
    if (!steps.length) list.innerHTML = '<li class="small muted">No steps yet — add one below.</li>';
    steps.forEach(function (s, i) {
      var err = r && r.errors.find(function (e) { return e.index === i; });
      list.appendChild(B.h('li', {}, [
        B.h('span', { html: (i + 1) + '. ' + B.esc(A.describeStep(s)) + (err ? '<br><span class="small bad">Skipped: ' + B.esc(err.message) + '</span>' : '') }),
        B.h('button', { class: 'btn small', type: 'button', text: '↑', 'aria-label': 'Move step up', disabled: i === 0, onclick: function () { steps.splice(i - 1, 0, steps.splice(i, 1)[0]); renderCsv(); } }),
        B.h('button', { class: 'btn small', type: 'button', text: '↓', 'aria-label': 'Move step down', disabled: i === steps.length - 1, onclick: function () { steps.splice(i + 1, 0, steps.splice(i, 1)[0]); renderCsv(); } }),
        B.h('button', { class: 'btn small', type: 'button', text: 'Remove', onclick: function () { steps.splice(i, 1); renderCsv(); renderForm(); } })
      ]));
    });
    if (!r) { $('#cv-info').textContent = 'Load a CSV to see the result.'; $('#cv-preview').innerHTML = ''; return; }
    $('#cv-info').innerHTML = 'Before: ' + csv.rows.length + ' rows × ' + csv.headers.length + ' columns → After: <strong>' + r.table.rows.length + ' rows × ' + r.table.headers.length + ' columns</strong>';
    $('#cv-preview').innerHTML = r.table.headers.length ? B.table(r.table.rows.slice(0, 50), r.table.headers) + (r.table.rows.length > 50 ? '<p class="small muted">Showing 50 of ' + r.table.rows.length + ' rows. Download has them all.</p>' : '') : '<p class="muted">No columns left.</p>';
  }
  function loadTable(t, name) { csv = { headers: t.headers, rows: t.rows }; csvName = (name || 'cleaned').replace(/\.[^.]+$/, ''); $('#cv-file').textContent = (name || 'Table') + ' — ' + t.rows.length + ' rows'; renderCsv(); renderForm(); }
  B.dropZone($('#cv-drop'), function (files) {
    B.readTable(files[0]).then(function (t) { loadTable(t, files[0].name); }).catch(function (e) { B.toast('Could not read that file: ' + e.message, 4000); });
  }, { accept: '.csv,.tsv,.txt,.xlsx,.xls,.json' });
  $('#cv-sample').addEventListener('click', function () {
    loadTable(B.csv.toObjects('Name, Email ,Phone,State,Amount\n  ann lee ,ANN@EXAMPLE.COM,0412 000 111,nsw,"$1,200"\nRaj Patel,raj@example.com,,VIC,$80\nann lee,ann@example.com ,0412 000 111,NSW,"$1,200"\n,,,,\nMia  Chen,mia@example.com,0400 222 333,qld,$450\nTom Becker,,0400 999 000,NSW,$15'), 'customers-export.csv');
    if (!steps.length) { steps = [{ type: 'trim' }, { type: 'case', col: 'Email', mode: 'lower' }, { type: 'dedupe', cols: 'Email' }, { type: 'filter', col: 'Email', op: 'not-empty' }, { type: 'case', col: 'Name', mode: 'title' }, { type: 'case', col: 'State', mode: 'upper' }, { type: 'sort', col: 'Amount', dir: 'desc' }]; renderCsv(); renderForm(); }
  });
  $('#cv-dl').addEventListener('click', function () { var r = result(); if (!r) return B.toast('Load a CSV first'); B.download(csvName + '-cleaned.csv', B.csv.stringify(r.table.rows, r.table.headers), 'text/csv;charset=utf-8'); });
  function saved() { return B.store.get('automation:recipes', {}); }
  function renderSaved() {
    var s = saved(), names = Object.keys(s).sort();
    $('#cv-saved').innerHTML = names.length ? names.map(function (n) { return '<option>' + B.esc(n) + '</option>'; }).join('') : '<option value="">(none yet)</option>';
  }
  $('#cv-save').addEventListener('click', function () {
    var n = $('#cv-name').value.trim(); if (!n) return B.toast('Give the recipe a name');
    if (!steps.length) return B.toast('Add some steps first');
    var s = saved(); s[n] = steps; B.store.set('automation:recipes', s); renderSaved(); $('#cv-saved').value = n; B.toast('Recipe saved');
  });
  $('#cv-load').addEventListener('click', function () { var n = $('#cv-saved').value, s = saved(); if (!s[n]) return; steps = JSON.parse(JSON.stringify(s[n])); $('#cv-name').value = n; renderCsv(); renderForm(); B.toast('Loaded “' + n + '”'); });
  $('#cv-del').addEventListener('click', function () { var n = $('#cv-saved').value, s = saved(); if (!s[n] || !confirm('Delete recipe “' + n + '”?')) return; delete s[n]; B.store.set('automation:recipes', s); renderSaved(); });

  // ---------- scheduled jobs ----------
  function parseTime() { var m = /^(\d{1,2}):(\d{2})$/.exec($('#sc-time').value.trim()); var h = m ? Math.min(23, +m[1]) : 7, mi = m ? Math.min(59, +m[2]) : 0; return { h: h, m: mi }; }
  function winPath(p, script) { p = String(p).replace(/^~(?=\/|$)/, '%USERPROFILE%').replace(/\//g, '\\'); return script ? p.replace(/\.sh$/, '.ps1') : p; }
  function renderSchedule() {
    var o = ogOpts(); if (!o.byType && !o.byDate) o.byType = true;
    var t = parseTime(), days = $('#sc-days').value, off = -new Date().getTimezoneOffset(), cron = A.cronFromLocal(t.h, t.m, off, days);
    var sign = off >= 0 ? '+' : '−', abs = Math.abs(off);
    $('#sc-tz').textContent = 'Your computer is on UTC' + sign + Math.floor(abs / 60) + (abs % 60 ? ':' + ('0' + abs % 60).slice(-2) : '') + '. Cron on your own computer uses your local time; GitHub uses UTC, so ' +
      ('0' + t.h).slice(-2) + ':' + ('0' + t.m).slice(-2) + ' becomes cron “' + cron + '”. When daylight saving starts or ends, the GitHub run shifts by an hour.';
    $('#sc-bash').textContent = A.bashOrganise(o);
    $('#sc-ps').textContent = A.psOrganise(o);
    $('#sc-cron').textContent = A.crontabLine(t.h, t.m, $('#sc-script').value || '~/organise.sh', $('#sc-folder').value || '~/Downloads', days);
    $('#sc-win-cmd').textContent = A.schtasksLine(t.h, t.m, winPath($('#sc-script').value || '~/organise.ps1', true), winPath($('#sc-folder').value || '~/Downloads'), days);
    $('#sc-yaml').textContent = A.actionsWorkflow({ cron: cron, script: 'scripts/organise.sh', folder: 'inbox', note: 'Change “inbox” below to the folder in your repo.' });
  }
  ['#sc-time', '#sc-days', '#sc-folder', '#sc-script'].forEach(function (s) { $(s).addEventListener(s === '#sc-days' ? 'change' : 'input', renderSchedule); });
  [['sc-bash', 'organise.sh'], ['sc-ps', 'organise.ps1'], ['sc-yaml', 'daily-automation.yml']].forEach(function (x) {
    $('#' + x[0] + '-copy').addEventListener('click', function () { B.copy($('#' + x[0]).textContent); });
    $('#' + x[0] + '-dl').addEventListener('click', function () { B.download(x[1], $('#' + x[0]).textContent); });
  });
  $('#sc-cron-copy').addEventListener('click', function () { B.copy($('#sc-cron').textContent); });
  $('#sc-win-copy').addEventListener('click', function () { B.copy($('#sc-win-cmd').textContent); });

  // ---------- start ----------
  function refreshAll() { setMode(); renderRename(); renderOrganise(); dupResult = null; renderDupes(); $('#dp-status').textContent = ''; }
  B.tabs($('[data-tabs="ah"]'));
  B.tabs($('[data-tabs="sc-os"]'));
  if (/Win/.test(navigator.platform || '')) { $('#sc-script').value = '~/organise.ps1'; document.querySelector('[data-tab="sc-win"]').click(); }
  renderForm(); renderSaved(); renderCsv(); refreshAll();
})();
