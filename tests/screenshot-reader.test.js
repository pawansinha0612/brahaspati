const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/screenshot-reader/lib.js');

const JAVA = `Exception in thread "main" java.lang.NullPointerException: Cannot invoke "Order.getId()" because "order" is null
\tat com.shop.service.OrderService.process(OrderService.java:42)
\tat com.shop.web.OrderController.submit(OrderController.java:88)
\tat org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:897)`;

const PY = `Traceback (most recent call last):
  File "/app/main.py", line 12, in <module>
    run()
  File "/app/jobs.py", line 30, in run
    total = data["amount"]
KeyError: 'amount'`;

test('Java stack trace: type, exception, own frame and line in summary', () => {
  const a = L.analyse(JAVA);
  assert.strictEqual(a.classification.type, 'stacktrace');
  assert.strictEqual(a.language, 'Java');
  assert.strictEqual(a.frames.length, 3);
  assert.deepStrictEqual(a.frames[0], { method: 'com.shop.service.OrderService.process', file: 'OrderService.java', line: 42, lang: 'java' });
  assert.match(a.summary, /Java stack trace: NullPointerException in OrderService\.java line 42/);
  assert.ok(a.steps.some((s) => /null/i.test(s)));
});

test('Python traceback points at the last frame and KeyError', () => {
  const a = L.analyse(PY);
  assert.strictEqual(a.classification.type, 'stacktrace');
  assert.strictEqual(a.language, 'Python');
  assert.match(a.summary, /KeyError in jobs\.py line 30/);
  assert.ok(a.errors.some((e) => e.kind === 'traceback'));
  assert.ok(a.steps.some((s) => /dict/i.test(s)));
});

test('HTTP error page is classified with status text and server-side hint', () => {
  const a = L.analyse('502 Bad Gateway\n\nnginx/1.18.0 (Ubuntu)');
  assert.strictEqual(a.classification.type, 'http');
  assert.strictEqual(a.errors[0].code, 502);
  assert.match(a.summary, /502 Bad Gateway \(a server-side problem\)/);
  assert.ok(a.steps.some((s) => /proxy/i.test(s)));
});

test('bare numbers are not mistaken for HTTP status codes', () => {
  const e = L.findErrors('We sold 404 units and 500 boxes this week.');
  assert.strictEqual(e.filter((x) => x.kind === 'http').length, 0);
  assert.strictEqual(L.findErrors('GET /api/users returned status 404').filter((x) => x.kind === 'http')[0].code, 404);
});

test('terminal output: npm ERR!, non-zero exit code, but exit code 0 is ignored', () => {
  const a = L.analyse('$ npm install\nnpm ERR! code ERESOLVE\nnpm ERR! could not resolve dependency\nProcess exited with code 1');
  assert.strictEqual(a.classification.type, 'terminal');
  assert.ok(a.errors.some((e) => e.kind === 'npm'));
  assert.ok(a.errors.some((e) => e.kind === 'exit' && e.code === 1));
  assert.strictEqual(L.findErrors('Process exited with code 0').length, 0);
});

test('Oracle, SQLSTATE, timeout and permission errors are detected', () => {
  const kinds = L.findErrors('ORA-00942: table or view does not exist\nSQLSTATE[23000]: Integrity constraint violation\nConnection timed out after 30s\nPermission denied (publickey)').map((e) => e.kind);
  ['oracle', 'sqlstate', 'timeout', 'denied'].forEach((k) => assert.ok(kinds.includes(k), k));
});

test('form validation messages are captured as whole lines', () => {
  const a = L.analyse('Email address\nPlease enter a valid email address\nPassword\nPassword is required\nSign in');
  assert.strictEqual(a.classification.type, 'form');
  assert.ok(a.errors.some((e) => e.text === 'Password is required'));
});

test('dashboard and chat screenshots are recognised', () => {
  assert.strictEqual(L.analyse('Revenue $12,400\nUsers 1,204\nConversion 3.4%\nOrders 88\nAvg order $140.90').classification.type, 'dashboard');
  const c = L.analyse('Priya: did the deploy go out?\nSam: yes at 3pm\nPriya: great thanks');
  assert.strictEqual(c.classification.type, 'chat');
  assert.match(c.summary, /Priya, Sam/);
});

test('extracts URLs (without trailing punctuation), emails, IPs, UUIDs, ref IDs and timestamps', () => {
  const en = L.extract('See https://x.com/a?b=1. Mail ops@shop.com.au from 10.0.0.12 at 2026-11-08T10:15:02Z, ticket: INC-20931, id 7f3a9c21-55e0-4b7d-9a0c-2d1e6f8b4c10 on 08/11/2026 9:30 PM');
  assert.deepStrictEqual(en.urls, ['https://x.com/a?b=1']);
  assert.deepStrictEqual(en.emails, ['ops@shop.com.au']);
  assert.deepStrictEqual(en.ips, ['10.0.0.12']);
  assert.ok(en.ids.includes('INC-20931'));
  assert.ok(en.ids.includes('7f3a9c21-55e0-4b7d-9a0c-2d1e6f8b4c10'));
  assert.ok(en.timestamps.includes('2026-11-08T10:15:02Z'));
  assert.ok(en.timestamps.includes('08/11/2026 9:30 PM'));
});

test('JavaScript and C# frames are parsed', () => {
  const js = L.frames('TypeError: x is undefined\n    at render (/app/src/view.js:17:9)\n    at /app/src/index.js:5:3');
  assert.strictEqual(js.length, 2); assert.strictEqual(js[0].line, 17);
  const cs = L.frames('   at Shop.Orders.Process(Order o) in C:\\src\\Orders.cs:line 51');
  assert.strictEqual(cs[0].line, 51); assert.strictEqual(cs[0].lang, 'csharp');
});

test('empty and plain text give no errors and a generic summary', () => {
  assert.strictEqual(L.analyse('').summary, '');
  const a = L.analyse('Hello world, nothing to see here.');
  assert.strictEqual(a.classification.type, 'generic');
  assert.strictEqual(a.errors.length, 0);
});
