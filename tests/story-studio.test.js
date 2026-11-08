const test = require('node:test');
const assert = require('node:assert');
const B = require('../assets/core.js');
const L = require('../apps/story-studio/lib.js');

const chars = [
  { id: 'k', name: 'Kamla', aliases: 'Dadi', age: '68', look: 'silver hair in a bun', outfit: 'green cotton saree, beige shawl', voice: 'soft Hindi' },
  { id: 'r', name: 'Raju', age: '24', look: 'messy black hair', outfit: 'blue delivery jacket, grey T-shirt' },
  { id: 'm', name: 'Meera', age: '9', outfit: 'navy school pinafore' }
];
function scene(o) { return Object.assign(L.newScene(), o); }
function rules(story) { return L.checkContinuity(story, chars).map(w => w.rule + '@' + (w.scene + 1)); }

test('a clean story produces no warnings', () => {
  const st = { scenes: [
    scene({ location: 'flat', time: 'evening', text: 'Kamla, in her green saree, waits for Raju.', charIds: ['k', 'r'], dialogue: [{ charId: 'k', line: 'Where were you?' }] }),
    scene({ location: 'flat', time: 'night', text: 'Raju hugs Kamla.', charIds: ['k', 'r'] })
  ] };
  assert.deepStrictEqual(L.checkContinuity(st, chars).filter(w => w.level === 'warn'), []);
});

test('outfit colour and garment mismatches are flagged against the bible', () => {
  const st = { scenes: [scene({ text: 'Raju walks in wearing a red hoodie. Kamla wears a blue saree.', charIds: ['k', 'r'] })] };
  const w = L.checkContinuity(st, chars).filter(x => x.rule === 'outfit');
  assert.strictEqual(w.length, 2);
  assert.ok(w.some(x => x.charId === 'r' && /red hoodie/.test(x.message)));
  assert.ok(w.some(x => x.charId === 'k' && /saree is blue/.test(x.message)));
  // an explicit outfit change is allowed
  const ok = { scenes: [scene({ text: 'Raju changes into a white kurta for the wedding.', charIds: ['r'] })] };
  assert.strictEqual(L.checkContinuity(ok, chars).filter(x => x.rule === 'outfit').length, 0);
});

test('age mismatches are attributed to the right character', () => {
  const st = { scenes: [scene({ text: 'Raju looks at 70-year-old Kamla. Meera, 12, laughs.', charIds: ['k', 'r', 'm'] })] };
  const w = L.checkContinuity(st, chars).filter(x => x.rule === 'age');
  assert.deepStrictEqual(w.map(x => x.charId).sort(), ['k', 'm']);
  // flashbacks are exempt
  const fb = { scenes: [scene({ text: 'Flashback: 30-year-old Kamla carries baby Raju.', charIds: ['k'] })] };
  assert.strictEqual(L.checkContinuity(fb, chars).filter(x => x.rule === 'age').length, 0);
});

test('characters written out (by text or tick box) cannot reappear, except as memories', () => {
  const st = { scenes: [
    scene({ time: 'evening', text: 'Raju leaves for good on the night train.', charIds: ['r', 'k'] }),
    scene({ time: 'night', text: 'Kamla holds a photo of Raju.', charIds: ['k'] }),
    scene({ time: 'night', text: 'Raju sits down and smiles.', charIds: ['k', 'r'] })
  ] };
  const r = rules(st);
  assert.ok(r.includes('written-out@3'));
  assert.ok(!r.includes('written-out@2'), 'photo is a memory');
  const tick = { scenes: [scene({ text: 'Meera waves.', charIds: ['m'], writtenOut: ['m'] }), scene({ text: 'Kamla is alone.', charIds: ['k'], dialogue: [{ charId: 'm', line: 'Dadi!' }] })] };
  assert.ok(rules(tick).includes('written-out@2'));
});

test('missing speakers, misspelt and unknown names are reported', () => {
  const st = { scenes: [scene({ text: 'Rajju runs in. Kamla calls Suresh from the window.', charIds: ['k'], dialogue: [{ charId: '', line: 'Stop!' }] })] };
  const w = L.checkContinuity(st, chars);
  assert.ok(w.some(x => x.rule === 'spelling' && x.charId === 'r'));
  assert.ok(w.some(x => x.rule === 'unknown-name' && /Suresh/.test(x.message)));
  assert.ok(w.some(x => x.rule === 'speaker' && x.level === 'warn'));
  // aliases count as the character
  const alias = { scenes: [scene({ text: 'Meera hugs Dadi.', charIds: ['m', 'k'] })] };
  assert.ok(!rules(alias).some(r => r.startsWith('unnamed') || r.startsWith('unknown')));
});

test('time going backwards and text/time clashes are caught; transitions excuse them', () => {
  const st = { scenes: [
    scene({ location: 'flat', time: 'night', text: 'Kamla waits.', charIds: ['k'] }),
    scene({ location: 'flat', time: 'morning', text: 'Kamla makes tea.', charIds: ['k'] }),
    scene({ location: 'flat', time: 'morning', text: 'Kamla reads by moonlight.', charIds: ['k'] })
  ] };
  const r = rules(st);
  assert.ok(r.includes('time@2') && r.includes('time@3'));
  st.scenes[1].transition = 'next morning';
  assert.ok(!rules(st).includes('time@2'));
});

test('location jumps with the same characters and no travel are noted', () => {
  const st = { scenes: [
    scene({ location: 'school gate', time: 'morning', text: 'Meera waves at Kamla.', charIds: ['k', 'm'] }),
    scene({ location: 'temple', time: 'morning', text: 'Kamla prays with Meera.', charIds: ['k', 'm'] }),
    scene({ location: 'market', time: 'morning', text: 'Kamla walks to the market with Meera.', charIds: ['k', 'm'] })
  ] };
  const w = L.checkContinuity(st, chars).filter(x => x.rule === 'location');
  assert.strictEqual(w.length, 1);
  assert.strictEqual(w[0].scene, 1);
});

test('phrasebook has ~150 entries and fuzzy lookup works in Hinglish, Devanagari and English', () => {
  assert.ok(L.PHRASES.length >= 150);
  assert.ok(L.PHRASES.every(p => /[ऀ-ॿ]/.test(p.hi) && p.rom && p.en));
  assert.strictEqual(L.lookup('maa ki yaad aati hai')[0].en, 'I miss Mum');
  assert.strictEqual(L.lookup('mujhe maf kardo')[0].en, 'Please forgive me', 'spelling variants');
  assert.strictEqual(L.lookup('सब ठीक हो जाएगा')[0].en, 'Everything will be all right');
  assert.strictEqual(L.lookup('I am proud of you')[0].rom, 'mujhe tum par garv hai');
  assert.deepStrictEqual(L.lookup('xyzzy plugh'), []);
  const t = L.translateLines('tumne jhooth kyon bola?\nqwerty asdf');
  assert.strictEqual(t[0].best.en, 'Why did you lie?');
  assert.strictEqual(t[1].best, null);
});

test('prompt presets: long includes bible + dialogue, motion omits looks, tags are comma-separated', () => {
  const s = scene({ location: 'rented flat', time: 'night', camera: 'push', text: 'Raju walks in late. Kamla turns away.', charIds: ['k', 'r'], dialogue: [{ charId: 'k', line: 'Where were you?' }] });
  const long = L.scenePrompt('long', s, 0, chars, { aspect: '9:16' });
  assert.ok(long.includes('Kamla, 68 years old') && long.includes('blue delivery jacket') && long.includes('Kamla says “Where were you?”') && long.includes('9:16'));
  const motion = L.scenePrompt('motion', s, 0, chars, {});
  assert.ok(motion.startsWith('Motion: Raju walks in late.') && !motion.includes('saree'));
  const tags = L.scenePrompt('tags', s, 0, chars, {});
  assert.ok(tags.split(', ').length >= 6 && !tags.includes('.'));
  assert.ok(L.scenePrompt('image', s, 0, chars, {}).includes('Negative prompt'));
  assert.ok(L.scenePrompt('voice', s, 0, chars, {}).startsWith('KAMLA (soft Hindi): Where were you?'));
});

test('exports: markdown, CSV and backup round trip', () => {
  const st = Object.assign(L.newStory('Rent'), { scenes: [scene({ title: 'One', location: 'flat', text: 'Kamla, waiting, at the door.', charIds: ['k'] })] });
  const md = L.toMarkdown(st, chars, 'long', {});
  assert.ok(md.startsWith('# Rent') && md.includes('## Scene 1 — One') && md.includes('```'));
  const csv = L.toCSV(st, chars, 'tags', {}, B.csv.stringify);
  const back = B.csv.toObjects(csv);
  assert.deepStrictEqual(back.headers, ['scene', 'title', 'location', 'time', 'characters', 'prompt']);
  assert.strictEqual(back.rows[0].characters, 'Kamla');
  const state = { characters: [Object.assign({ image: 'data:image/jpeg;base64,AAAA' }, chars[0])], stories: [st], current: st.id };
  assert.strictEqual(L.importBackup(L.exportBackup(state, false)).characters[0].image, undefined);
  assert.strictEqual(L.importBackup(L.exportBackup(state, true)).characters[0].image, 'data:image/jpeg;base64,AAAA');
  assert.throws(() => L.importBackup('{"app":"x"}'), /not an AI Story Studio backup/);
  assert.strictEqual(L.dataUrlBytes('data:image/jpeg;base64,AAAA'), 3);
});

test('hooks and endings fill names with no leftover placeholders', () => {
  const h = L.hooks(chars);
  assert.strictEqual(h.length, L.HOOKS.length);
  assert.ok(h.every(x => !/\{\w+\}/.test(x)));
  assert.ok(h.some(x => x.includes('Kamla') && x.includes('Raju')));
  for (const type of ['twist', 'emotional', 'cliffhanger', 'moral']) {
    const e = L.endings(type, chars); assert.strictEqual(e.length, 5); assert.ok(e.every(x => !/\{\w+\}/.test(x)));
  }
  assert.ok(L.hooks([]).every(x => !/\{\w+\}/.test(x)));
});

test('dialogue suggestions follow the scene mood', () => {
  const s = L.suggestDialogue(scene({ text: 'Raju says sorry and asks her to forgive him.' }), 4);
  assert.ok(s.length > 0 && s.every(p => p.mood === 'sorry'));
  assert.ok(s.some(p => /forgive/i.test(p.en)));
});
