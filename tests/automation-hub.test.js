const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const A = require('../apps/automation-hub/lib.js');

const ts = new Date(2026, 0, 5, 9, 30).getTime(); // local time 5 Jan 2026
const files = ['IMG_001.JPG', 'IMG_002.JPG', 'notes final.txt'].map(name => ({ name, lastModified: ts }));

test('newName applies find/replace, case, sequence, date, prefix/suffix and extension in order', () => {
  const r = { find: 'IMG_', replace: 'Holiday ', caseMode: 'kebab', seq: { on: true, start: 1, pad: 3, where: 'suffix', sep: '-' }, date: { on: true, where: 'prefix', format: 'YYYY-MM-DD', sep: '_' }, prefix: 'x-', ext: '', extLower: true };
  assert.strictEqual(A.newName(files[0], r, 0), 'x-2026-01-05_holiday-001-001.jpg');
  assert.strictEqual(A.newName(files[1], { ext: '.jpeg' }, 1), 'IMG_002.jpeg');
  assert.strictEqual(A.newName({ name: 'a1b2' }, { find: '\\d', replace: '#', regex: true }, 0), 'a#b#');
  assert.strictEqual(A.newName({ name: 'my file.tar' }, { caseMode: 'title' }, 0), 'My File.tar');
  assert.strictEqual(A.newName({ name: '.bashrc' }, { prefix: 'old' }, 0), 'old.bashrc'); // dotfile has no extension
});

test('renamePlan detects duplicates, existing names, invalid names and unchanged files', () => {
  const list = [{ name: 'a.txt' }, { name: 'b.txt' }, { name: 'c.txt' }, { name: 'keep.txt' }];
  const p = A.renamePlan(list, { find: '^[ab]', replace: 'z', regex: true });
  assert.deepStrictEqual(p.map(x => x.status), ['conflict', 'conflict', 'same', 'same']);
  const p2 = A.renamePlan(list, { find: 'c', replace: 'keep' });
  assert.strictEqual(p2[2].status, 'exists');
  const p3 = A.renamePlan([{ name: 'x.txt' }], { find: 'x', replace: 'a:b' });
  assert.strictEqual(p3[0].status, 'invalid');
  const p4 = A.renamePlan([{ name: 'x.txt' }], { find: '(', regex: true });
  assert.strictEqual(p4[0].status, 'invalid');
  assert.deepStrictEqual(A.planSummary(p), { total: 4, changes: 0, same: 2, problems: 2 });
});

test('renamePlan allows swaps and case-only renames, and moveSteps routes them via temp names', () => {
  const p = A.renamePlan([{ name: 'a.txt' }, { name: 'b.txt' }], { find: '^(a|b)', replace: 'x', regex: true });
  assert.ok(p.every(x => x.status === 'conflict'));
  const swap = [{ from: 'a.txt', to: 'b.txt' }, { from: 'b.txt', to: 'a.txt' }, { from: 'c.txt', to: 'd.txt' }];
  const steps = A.moveSteps(swap);
  assert.strictEqual(steps.length, 5);
  assert.ok(steps[0].to.startsWith('.bh-tmp-'));
  assert.deepStrictEqual(steps[2], { from: 'c.txt', to: 'd.txt' });
  assert.deepStrictEqual(steps.slice(3).map(s => s.to), ['b.txt', 'a.txt']);
  const caseOnly = A.renamePlan([{ name: 'Photo.JPG' }], { extLower: true, caseMode: 'lower' });
  assert.strictEqual(caseOnly[0].status, 'ok');
  assert.strictEqual(A.moveSteps([{ from: 'Photo.JPG', to: 'photo.jpg' }]).length, 2);
  assert.strictEqual(A.moveSteps([{ from: 'sub/A.txt', to: 'sub/a.txt' }])[0].to, 'sub/.bh-tmp-0-A.txt');
});

test('categoryOf and organisePlan sort by type and year-month, flagging clashes', () => {
  assert.strictEqual(A.categoryOf('x.HEIC'), 'Images');
  assert.strictEqual(A.categoryOf('report.pdf'), 'Documents');
  assert.strictEqual(A.categoryOf('noext'), 'Other');
  const list = [{ name: 'a.jpg', path: 'a.jpg', lastModified: ts }, { name: 'b.mp3', path: 'b.mp3', lastModified: ts }];
  const p = A.organisePlan(list, { byType: true, byDate: true }, ['Images/2026-01/a.jpg']);
  assert.deepStrictEqual(p.map(x => [x.to, x.status]), [['Images/2026-01/a.jpg', 'exists'], ['Audio/2026-01/b.mp3', 'ok']]);
  assert.deepStrictEqual(A.folderCounts(p), [{ folder: 'Audio/2026-01', count: 1 }]);
  assert.strictEqual(A.organisePlan(list, {})[0].status, 'same');
});

test('duplicate finder groups by size then hash, keeps the oldest and totals wasted space', () => {
  const f = [
    { path: 'a/1.jpg', size: 100, lastModified: 5, hash: 'h1' }, { path: 'old.jpg', size: 100, lastModified: 1, hash: 'h1' }, { path: 'c.jpg', size: 100, lastModified: 9, hash: 'h2' },
    { path: 'd.bin', size: 50, lastModified: 1 }, { path: 'e.txt', size: 0, lastModified: 1 }, { path: 'f.txt', size: 0, lastModified: 1 }
  ];
  assert.strictEqual(A.sizeGroups(f).length, 1); // empty files ignored
  const r = A.duplicateGroups(f);
  assert.strictEqual(r.groups.length, 1);
  assert.strictEqual(r.groups[0].keep, 'old.jpg');
  assert.strictEqual(r.wasted, 100);
  assert.strictEqual(r.extraFiles, 1);
  assert.strictEqual(A.fmtBytes(1536), '1.5 KB');
  assert.strictEqual(A.hex(new Uint8Array([0, 255, 16]).buffer), '00ff10');
});

const T = { headers: ['Name', ' Email ', 'Amount'], rows: [
  { Name: ' ann  lee ', ' Email ': 'ANN@x.com', Amount: '10' },
  { Name: 'Bob Stone', ' Email ': 'bob@x.com', Amount: '$2,000' },
  { Name: 'ann lee', ' Email ': 'ann@x.com ', Amount: '10' },
  { Name: '', ' Email ': '', Amount: '' },
  { Name: 'Cy Ng', ' Email ': '', Amount: '5' }
] };

test('CSV recipe: trim, dedupe, filter, sort and case chain correctly', () => {
  const { table, errors } = A.applyRecipe(T, [
    { type: 'trim' }, { type: 'dedupe', cols: 'Email' }, { type: 'filter', col: 'Email', op: 'not-empty' },
    { type: 'sort', col: 'Amount', dir: 'desc' }, { type: 'case', col: 'Name', mode: 'title' }
  ]);
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(table.headers, ['Name', 'Email', 'Amount']);
  assert.deepStrictEqual(table.rows.map(r => r.Name), ['Bob Stone', 'Ann Lee']);
  assert.strictEqual(T.rows[0].Name, ' ann  lee '); // input untouched
});

test('CSV recipe: split, merge, rename, remove, reorder and replace', () => {
  let t = A.applyRecipe(T, [{ type: 'trim' }, { type: 'split', col: 'Name', sep: ' ', into: 'First, Last' }]).table;
  assert.deepStrictEqual(t.headers, ['First', 'Last', 'Email', 'Amount']);
  assert.strictEqual(A.applyStep({ headers: ['N'], rows: [{ N: 'Mary Anne Smith' }] }, { type: 'split', col: 'N', into: 'F,L' }).rows[0].L, 'Anne Smith');
  t = A.applyStep(t, { type: 'merge', cols: 'Last,First', sep: ', ', into: 'Full name' });
  assert.deepStrictEqual(t.headers, ['Full name', 'Email', 'Amount']);
  assert.strictEqual(t.rows[1]['Full name'], 'Stone, Bob');
  t = A.applyRecipe(t, [{ type: 'rename', from: 'Amount', to: 'Total' }, { type: 'remove', cols: ['Email'] }, { type: 'reorder', cols: 'Total' }, { type: 'replace', col: 'Total', find: '$', replace: 'AUD ' }]).table;
  assert.deepStrictEqual(t.headers, ['Total', 'Full name']);
  assert.strictEqual(t.rows[1].Total, 'AUD 2,000');
});

test('CSV recipe reports a bad step and keeps going; filters compare numbers', () => {
  const r = A.applyRecipe(T, [{ type: 'remove', cols: 'Nope' }, { type: 'filter', col: 'Amount', op: 'gt', value: '9' }]);
  assert.strictEqual(r.errors.length, 1);
  assert.match(r.errors[0].message, /No column called “Nope”/);
  assert.strictEqual(r.table.rows.length, 3);
  assert.strictEqual(A.describeStep({ type: 'filter', col: 'A', op: 'contains', value: 'x' }), 'Keep rows where A contains “x”');
  assert.ok(A.STEP_TYPES.includes('sort'));
});

test('bashQuote and psQuote escape awkward names', () => {
  assert.strictEqual(A.bashQuote("it's $HOME `x`"), "'it'\\''s $HOME `x`'");
  assert.strictEqual(A.psQuote("O'Brien’s $x"), "'O''Brien’’s $x'");
});

test('generated bash rename script really works on awkward file names (and dry run changes nothing)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-auto-'));
  const names = ["it's.txt", 'a $b `c`.txt', 'x.txt', 'y.txt', 'Case.TXT'];
  names.forEach(n => fs.writeFileSync(path.join(dir, n), n));
  fs.writeFileSync(path.join(dir, 'taken.txt'), 'keep me');
  const moves = [
    { from: "it's.txt", to: 'Docs/it is.txt' }, { from: 'a $b `c`.txt', to: 'safe.txt' },
    { from: 'x.txt', to: 'y.txt' }, { from: 'y.txt', to: 'x.txt' }, { from: 'Case.TXT', to: 'case.txt' }, { from: 'missing.txt', to: 'taken.txt' }
  ];
  const script = path.join(dir, '..', path.basename(dir) + '.sh');
  fs.writeFileSync(script, A.bashMoves(moves, { file: 'r.sh' }));
  execFileSync('bash', [script, dir], { env: { ...process.env, DRY_RUN: '1' }, stdio: 'pipe' });
  assert.ok(fs.existsSync(path.join(dir, "it's.txt")));
  execFileSync('bash', [script, dir], { stdio: 'pipe' });
  const after = fs.readdirSync(dir).sort();
  assert.ok(after.includes('safe.txt') && after.includes('Docs') && after.includes('case.txt'));
  assert.strictEqual(fs.readFileSync(path.join(dir, 'Docs', 'it is.txt'), 'utf8'), "it's.txt");
  assert.strictEqual(fs.readFileSync(path.join(dir, 'x.txt'), 'utf8'), 'y.txt'); // swapped
  assert.strictEqual(fs.readFileSync(path.join(dir, 'taken.txt'), 'utf8'), 'keep me');
  fs.rmSync(dir, { recursive: true }); fs.rmSync(script);
});

test('generated bash organise script sorts by type and month and skips itself', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-org-'));
  ['p.JPG', 'song.mp3', 'weird name.xyz', '.hidden'].forEach(n => fs.writeFileSync(path.join(dir, n), n));
  const when = new Date(2026, 2, 3); fs.utimesSync(path.join(dir, 'p.JPG'), when, when);
  fs.writeFileSync(path.join(dir, 'organise.sh'), A.bashOrganise({ byType: true, byDate: true }));
  execFileSync('bash', [path.join(dir, 'organise.sh'), dir], { stdio: 'pipe' });
  assert.ok(fs.existsSync(path.join(dir, 'Images', '2026-03', 'p.JPG')));
  assert.ok(fs.readdirSync(path.join(dir, 'Audio')).length === 1);
  assert.ok(fs.existsSync(path.join(dir, 'Other')));
  assert.ok(fs.existsSync(path.join(dir, 'organise.sh')) && fs.existsSync(path.join(dir, '.hidden')));
  fs.rmSync(dir, { recursive: true });
});

test('PowerShell scripts use literal paths, quote safely and never overwrite', () => {
  const ps = A.psMoves([{ from: "O'Brien [1].txt", to: 'Docs/x.txt' }]);
  assert.ok(ps.includes("Move-Safe 'O''Brien [1].txt' 'Docs/x.txt'"));
  assert.ok(ps.includes('Test-Path -LiteralPath $dst'));
  assert.ok(ps.includes("CreateDirectory((Join-Path $Root 'Docs'))"));
  assert.ok(A.psDelete(['a b.txt']).includes("Join-Path $Root 'a b.txt'"));
  const org = A.psOrganise({ byType: true, byDate: true });
  assert.ok(org.includes("ToString('yyyy-MM')"));
  assert.ok(org.includes("$Map[$_] = 'Images'"));
  assert.ok(A.bashDelete(["x'y"]).includes("rm -f -- 'x'\\''y'"));
});

test('cronFromLocal converts local time to UTC, shifting weekdays across midnight', () => {
  assert.strictEqual(A.cronFromLocal(7, 0, 660, 'daily'), '0 20 * * *'); // 7am Sydney summer = 20:00 UTC previous day
  assert.strictEqual(A.cronFromLocal(7, 0, 660, 'weekdays'), '0 20 * * 0-4');
  assert.strictEqual(A.cronFromLocal(23, 30, -300, 'weekdays'), '30 4 * * 2-6'); // New York evening -> next UTC day
  assert.strictEqual(A.cronFromLocal(9, 15, 0, 'weekly'), '15 9 * * 1');
  const y = A.actionsWorkflow({ cron: '0 20 * * *', script: 'scripts/organise.sh', folder: 'inbox' });
  assert.ok(y.includes("- cron: '0 20 * * *'") && y.includes('run: bash scripts/organise.sh inbox') && y.includes('workflow_dispatch'));
  assert.ok(A.crontabLine(7, 0, '/Users/me/organise.sh', '/Users/me/Downloads', 'daily').startsWith("0 7 * * * /bin/bash '/Users/me/organise.sh' '/Users/me/Downloads'"));
  assert.ok(A.crontabLine(7, 0, '~/organise.sh', "~/My Downloads", 'daily').includes(`/bin/bash "$HOME"/'organise.sh' "$HOME"/'My Downloads'`));
  assert.ok(A.schtasksLine(7, 5, 'C:\\s.ps1', 'C:\\Down loads', 'weekdays').includes('/SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 07:05'));
});
