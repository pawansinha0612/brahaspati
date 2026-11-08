/* Screenshot Reader — pure text analysis (no DOM). Works on OCR output or pasted text. */
(function (root) {
  'use strict';

  var HTTP_TEXT = {
    400: 'Bad Request', 401: 'Unauthorised', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 408: 'Request Timeout',
    409: 'Conflict', 410: 'Gone', 413: 'Payload Too Large', 415: 'Unsupported Media Type', 422: 'Unprocessable Entity', 429: 'Too Many Requests',
    500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout'
  };

  // OCR often turns stack-frame punctuation into look-alikes; tidy the common ones before matching.
  function clean(text) {
    return String(text == null ? '' : text)
      .replace(/\r\n?/g, '\n')
      .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[ \t]+\n/g, '\n');
  }

  function uniq(arr) { var s = {}, out = []; arr.forEach(function (x) { if (x && !s[x]) { s[x] = 1; out.push(x); } }); return out; }

  function allMatches(re, text, group) {
    var out = [], m; re.lastIndex = 0;
    while ((m = re.exec(text))) { out.push(group == null ? m[0] : m[group]); if (m[0] === '') re.lastIndex++; }
    return out;
  }

  // ---------- entity extraction ----------
  function extract(text) {
    text = clean(text);
    var urls = uniq(allMatches(/\bhttps?:\/\/[^\s<>"')\]]+/gi, text).map(function (u) { return u.replace(/[.,;:]+$/, ''); }));
    var emails = uniq(allMatches(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, text));
    var ips = uniq(allMatches(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, text));
    var ts = [];
    ts = ts.concat(allMatches(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g, text));
    ts = ts.concat(allMatches(/\b\d{1,2}\/\d{1,2}\/\d{2,4}(?:,?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)?/gi, text));
    ts = ts.concat(allMatches(/\b\d{1,2}\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s\d{4}(?:,?\s+\d{1,2}:\d{2}(?::\d{2})?)?/gi, text));
    var timestamps = uniq(ts).filter(function (t, i, a) { return !a.some(function (o, j) { return j !== i && o.length > t.length && o.indexOf(t) >= 0; }); });
    var ids = [];
    ids = ids.concat(allMatches(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, text));
    ids = ids.concat(allMatches(/\b(?:request|trace|correlation|transaction|order|ticket|incident|case|session|error|ref(?:erence)?|txn|job)[ _-]?(?:id|no\.?|number|#)?\s*[:#=]\s*([A-Za-z0-9][\w-]{3,})/gi, text, 1));
    ids = ids.concat(allMatches(/\b[A-Z]{2,10}-\d{1,6}\b/g, text).filter(function (x) { return !/^(ORA|SQLSTATE|HTTP|UTF|ISO|TLS|SHA|RFC)-/.test(x); }));
    return { urls: urls, emails: emails, ips: ips, timestamps: timestamps, ids: uniq(ids) };
  }

  // ---------- error detection ----------
  var RULES = [
    { kind: 'exception', re: /\b((?:[a-z_$][\w$]*\.)*[A-Z][\w$]*(?:Exception|Error))\b(?::\s*([^\n]{0,160}))?/g, label: function (m) { return m[1] + (m[2] ? ': ' + m[2].trim() : ''); } },
    { kind: 'traceback', re: /Traceback \(most recent call last\):/g },
    { kind: 'http', re: /\b(?:HTTP(?:\/\d(?:\.\d)?)?\s*|status(?: code)?:?\s*|error\s*)?\b([45]\d{2})\b(?:\s+([A-Z][A-Za-z ]{2,30}))?/g, test: function (m, text) {
      var code = +m[1]; if (!HTTP_TEXT[code] && !(code >= 400 && code <= 599)) return false;
      // a bare number only counts when a status word or HTTP context is close by
      if (/HTTP|status|error/i.test(m[0])) return true;
      if (m[2] && HTTP_TEXT[code] && m[2].toLowerCase().indexOf(HTTP_TEXT[code].toLowerCase().split(' ')[0]) === 0) return true;
      var around = text.slice(Math.max(0, m.index - 40), m.index + 40);
      return HTTP_TEXT[code] && around.toLowerCase().indexOf(HTTP_TEXT[code].toLowerCase()) >= 0;
    }, label: function (m) { var c = +m[1]; return c + (HTTP_TEXT[c] ? ' ' + HTTP_TEXT[c] : ''); } },
    { kind: 'oracle', re: /\bORA-\d{5}\b(?::\s*[^\n]{0,120})?/g },
    { kind: 'sqlstate', re: /\bSQLSTATE\s*[\[:=]?\s*\]?\s*[0-9A-Z]{5}\b[^\n]{0,120}/g },
    { kind: 'npm', re: /\bnpm ERR!\s*[^\n]{0,140}/g },
    { kind: 'exit', re: /\b(?:exit(?:ed)?(?: with)?(?: code| status)|exit code|returned non-zero exit status)\s*:?\s*(-?\d+)/gi, test: function (m) { return m[1] !== '0'; } },
    { kind: 'timeout', re: /\b(?:timed? ?out|timeout|deadline exceeded|ETIMEDOUT|ECONNRESET|ECONNREFUSED)\b[^\n]{0,100}/gi },
    { kind: 'denied', re: /\b(?:access denied|permission denied|unauthori[sz]ed|forbidden|not authori[sz]ed|EACCES|invalid credentials|authentication failed)\b[^\n]{0,100}/gi },
    { kind: 'failed', re: /\b(?:failed|failure|fatal|could not|cannot|can't|unable to)\b[^\n]{0,120}/gi },
    { kind: 'validation', wholeLine: true, re: /\b(?:is required|required field|must be (?:at least|a valid|between)|invalid (?:email|format|value|date|phone)|please (?:enter|select|provide) a valid|does not match)\b[^\n]{0,100}/gi }
  ];

  var FRAME_RE = /^\s*at\s+([\w$.<>]+)\s*\(([^():]+?):(\d+)(?::\d+)?\)/gm;           // Java/JS: at a.b.C.m(File.java:42)
  var JS_FRAME_RE = /^\s*at\s+(?:([\w$.<> ]+?)\s+\()?((?:file|https?|webpack|node):?[^\s()]*?|\/[^\s()]+?|[\w./\\-]+\.(?:js|ts|mjs|cjs|jsx|tsx)):(\d+):\d+\)?/gm;
  var PY_FRAME_RE = /File "([^"]+)", line (\d+)(?:, in ([\w<>]+))?/g;
  var CS_FRAME_RE = /^\s*at\s+([\w.<>`]+)\([^)]*\)\s+in\s+(.+?):line\s+(\d+)/gm;

  function frames(text) {
    var out = [], m;
    FRAME_RE.lastIndex = 0;
    while ((m = FRAME_RE.exec(text))) out.push({ method: m[1], file: m[2].trim(), line: +m[3], lang: /\.java$/i.test(m[2]) ? 'java' : /\.kt$/i.test(m[2]) ? 'kotlin' : /\.(js|ts|mjs|cjs|jsx|tsx)$/.test(m[2]) ? 'js' : 'java' });
    JS_FRAME_RE.lastIndex = 0;
    while ((m = JS_FRAME_RE.exec(text))) {
      var f = m[2], ln = +m[3];
      if (!out.some(function (o) { return o.line === ln && (o.file === f || f.slice(-o.file.length) === o.file); })) out.push({ method: (m[1] || '(anonymous)').trim(), file: f, line: ln, lang: 'js' });
    }
    PY_FRAME_RE.lastIndex = 0;
    while ((m = PY_FRAME_RE.exec(text))) out.push({ method: m[3] || '', file: m[1], line: +m[2], lang: 'python' });
    CS_FRAME_RE.lastIndex = 0;
    while ((m = CS_FRAME_RE.exec(text))) out.push({ method: m[1], file: m[2].trim(), line: +m[3], lang: 'csharp' });
    return out;
  }

  function lineText(text, idx) { var a = text.lastIndexOf('\n', idx - 1) + 1, b = text.indexOf('\n', idx); return text.slice(a, b < 0 ? text.length : b).slice(0, 200); }
  function lineOf(text, idx) { return text.slice(0, idx).split('\n').length; }

  function findErrors(text) {
    text = clean(text);
    var out = [], seen = {};
    RULES.forEach(function (r) {
      var m; r.re.lastIndex = 0;
      while ((m = r.re.exec(text))) {
        if (m[0] === '') { r.re.lastIndex++; continue; }
        if (r.test && !r.test(m, text)) continue;
        var label = (r.label ? r.label(m) : r.wholeLine ? lineText(text, m.index) : m[0]).trim();
        var key = r.kind + '|' + label.toLowerCase();
        if (seen[key]) continue; seen[key] = 1;
        out.push({ kind: r.kind, text: label, line: lineOf(text, m.index), index: m.index, code: r.kind === 'http' ? +m[1] : r.kind === 'exit' ? +m[1] : null });
      }
    });
    // "failed" lines that are already covered by a more specific hit on the same line add nothing
    var specificLines = {};
    out.forEach(function (e) { if (e.kind !== 'failed') specificLines[e.line] = 1; });
    out = out.filter(function (e) { return e.kind !== 'failed' || !specificLines[e.line]; });
    out.sort(function (a, b) { return a.index - b.index; });
    return out;
  }

  // ---------- classification ----------
  var TYPES = {
    stacktrace: 'Stack trace', http: 'HTTP error page', terminal: 'Terminal or build output', form: 'Form with validation messages',
    dashboard: 'Dashboard or report numbers', chat: 'Chat or messages', generic: 'General text'
  };

  function scoreTypes(text, errors, fr) {
    var t = clean(text), lines = t.split('\n').filter(function (l) { return l.trim(); });
    var s = { stacktrace: 0, http: 0, terminal: 0, form: 0, dashboard: 0, chat: 0, generic: 1 };
    s.stacktrace += fr.length * 3 + (/Traceback \(most recent call last\)/.test(t) ? 6 : 0) + (/\bCaused by:/.test(t) ? 3 : 0);
    if (errors.some(function (e) { return e.kind === 'exception'; })) s.stacktrace += 2;
    errors.forEach(function (e) { if (e.kind === 'http') s.http += 4; });
    if (/\b(?:nginx|apache|cloudflare|IIS|Bad Gateway|Service Unavailable|Not Found|Whitelabel Error Page)\b/i.test(t)) s.http += 2;
    s.terminal += (t.match(/^\s*(?:\$|>|#|PS [A-Z]:\\[^>]*>|C:\\[^>]*>|[\w.-]+@[\w.-]+:[^\n$#]*[$#])\s*\S/gm) || []).length * 2;
    s.terminal += (t.match(/\bnpm (?:ERR!|WARN)|\b(?:pip|yarn|mvn|gradle|docker|kubectl|git|sudo|bash|zsh)\b|BUILD (?:FAILED|SUCCESS)|exit code/gi) || []).length * 1.5;
    s.form += errors.filter(function (e) { return e.kind === 'validation'; }).length * 3 + (t.match(/\b(?:Submit|Sign in|Log in|Password|Email address|First name|Last name|Required)\b/gi) || []).length * 0.7;
    var numericLines = lines.filter(function (l) { return /(?:\$|€|£|%|\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?[kKmM]\b)/.test(l); }).length;
    s.dashboard += numericLines * 0.9 + (t.match(/\b(?:Total|Revenue|Users|Sessions|Conversion|Average|Avg|Today|This month|YTD|KPI|Orders|Sales|Visitors)\b/gi) || []).length * 0.8;
    var chatLines = lines.filter(function (l) { return /^\s*(?:\[?\d{1,2}:\d{2}(?:\s?[AP]M)?\]?\s*)?[A-Z][\w.' -]{1,24}:\s+\S/.test(l) || /^\s*\d{1,2}:\d{2}\s?(?:[AP]M)?\s*$/i.test(l); }).length;
    s.chat += chatLines * 1.5 + (t.match(/\b(?:typing|Seen|Delivered|Reply|replied|Today at|Yesterday at)\b/gi) || []).length;
    return s;
  }

  function classify(text, errors, fr) {
    errors = errors || findErrors(text); fr = fr || frames(clean(text));
    var s = scoreTypes(text, errors, fr), best = 'generic';
    Object.keys(s).forEach(function (k) { if (s[k] > s[best]) best = k; });
    return { type: best, label: TYPES[best], scores: s };
  }

  // ---------- language guess for stack traces ----------
  function guessLang(text, fr) {
    if (/Traceback \(most recent call last\)|File ".+", line \d+/.test(text)) return 'Python';
    if (fr.some(function (f) { return f.lang === 'csharp'; }) || /System\.\w+Exception/.test(text)) return 'C#/.NET';
    if (fr.some(function (f) { return f.lang === 'kotlin'; })) return 'Kotlin';
    if (fr.some(function (f) { return f.lang === 'java'; }) || /\bjava\.\w+\.|\bjavax?\.|\borg\.springframework\b/.test(text)) return 'Java';
    if (fr.some(function (f) { return f.lang === 'js'; }) || /\b(?:TypeError|ReferenceError|SyntaxError|UnhandledPromiseRejection)\b/.test(text)) return 'JavaScript/Node';
    return '';
  }

  // ---------- next steps ----------
  var STEPS = {
    NullPointerException: ['Open the file and line named in the first stack frame from your own code — something used there was null.', 'Check which object on that line can be empty (a lookup result, a request field, an injected bean).', 'Add a null check or make the value required earlier, and add a test for the empty case.'],
    'TypeError': ['Look for a value that is undefined or null where an object was expected — often an API response that came back empty.', 'Use optional chaining (a?.b) or a guard, and log the value just before the failing line.'],
    'ReferenceError': ['A variable or function name is not defined where it is used — check spelling, imports and script load order.'],
    'SyntaxError': ['The code or data could not be parsed. If it mentions JSON, the server probably returned HTML (an error page) instead of JSON.'],
    'KeyError': ['A dictionary key is missing. Print the dict keys, or use dict.get(key) with a default.'],
    'AttributeError': ['An object does not have the attribute used — often None was returned. Check the value on the line in the last frame.'],
    'IndexError': ['A list was shorter than expected. Check the length before indexing.'],
    'ArrayIndexOutOfBoundsException': ['An index went past the end of an array or list. Check loop bounds and empty inputs.'],
    'ClassNotFoundException': ['A class is missing at run time — check the dependency is on the classpath and versions match.'],
    'OutOfMemoryError': ['The process ran out of memory. Look for large collections or leaks; capture a heap dump; raise -Xmx only as a stop-gap.'],
    'SQLException': ['Read the database error code and message; run the same query directly against the database to reproduce.'],
    'ConnectException': ['The service could not reach its target. Check the host/port, that the target is running, firewalls and DNS.'],
    'TimeoutException': ['Something took too long. Check the slow dependency, timeouts and whether the service is overloaded.'],
    'ModuleNotFoundError': ['A Python package is missing. Install it in the same environment (pip install …) and check the virtualenv is active.'],
    'ImportError': ['An import failed. Check the package is installed and the name and version are right.'],
    'ValueError': ['A function got a value of the right type but wrong content — check the input on the failing line.']
  };
  var KIND_STEPS = {
    http4: function (c) {
      var m = { 400: 'The request was malformed — compare the body and headers with the API docs.', 401: 'You are not signed in or the token expired — sign in again or refresh the token.', 403: 'Signed in but not allowed — check the user’s role or permissions.', 404: 'The address or record does not exist — check the URL, ID and environment.', 405: 'Wrong HTTP method — e.g. sending GET where POST is expected.', 408: 'The client took too long to send the request — retry and check the network.', 409: 'Conflict — the record was changed by someone else or already exists.', 413: 'The upload is too large — reduce it or raise the server limit.', 415: 'Wrong Content-Type header — usually needs application/json.', 422: 'The data failed validation — read the field errors in the response body.', 429: 'Rate limited — slow down, add retries with back-off, check the Retry-After header.' };
      return m[c] || 'A client-side (4xx) error — the request needs fixing before retrying.';
    },
    http5: function (c) {
      var m = { 500: 'The server crashed while handling the request — check the server logs at the same timestamp.', 502: 'A proxy got a bad reply from the app behind it — the app may be down or restarting.', 503: 'The service is unavailable or overloaded — check health checks, deploys and capacity.', 504: 'The app behind the proxy took too long — find the slow call (database, external API).' };
      return m[c] || 'A server-side (5xx) error — check the server logs around the same time.';
    },
    oracle: 'Look up the ORA- code in Oracle’s error reference; the number tells you the exact cause (e.g. ORA-00942 = table or view does not exist, ORA-01017 = bad username/password).',
    sqlstate: 'SQLSTATE classes: 23xxx = constraint violation, 42xxx = syntax or missing object, 08xxx = connection problem, 40001 = serialisation/deadlock (retry).',
    npm: 'For npm ERR!: read the first error line, then try deleting node_modules and package-lock.json and running npm install; check your Node version matches the project.',
    exit: 'A command exited with a non-zero code — scroll up to the first error above it; that is usually the real cause.',
    timeout: 'Timeouts: check the target service is up, the network/VPN, and whether the call is slow; raise the timeout only after finding why.',
    denied: 'Permission problems: check you are signed in as the right user, the token has the right scopes, and file or folder permissions.',
    validation: 'Form validation: fix the fields named in the messages (required fields, formats such as email or phone, length limits).',
    failed: 'Read the first “failed” line — later failures are often knock-on effects of the first one.'
  };

  function nextSteps(errors, cls, lang) {
    var out = [];
    errors.forEach(function (e) {
      if (e.kind === 'exception') {
        var name = e.text.split(':')[0].split('.').pop();
        var st = STEPS[name] || STEPS[name.replace(/Error$/, 'Exception')];
        if (st) st.forEach(function (x) { out.push(x); });
        else out.push('Search the exact message “' + e.text.slice(0, 80) + '” together with the library name; check the first frame from your own code.');
      } else if (e.kind === 'http') out.push((e.code >= 500 ? KIND_STEPS.http5 : KIND_STEPS.http4)(e.code));
      else if (KIND_STEPS[e.kind]) out.push(KIND_STEPS[e.kind]);
    });
    if (cls.type === 'stacktrace') out.push('Read the stack from the top for the error, then find the first line that points at your own code (not a framework) — that is where to start.');
    if (cls.type === 'dashboard') out.push('Check the date range and filters shown on the dashboard before comparing numbers.');
    if (!out.length) out.push('No error found. Copy the text, or use the extracted links and IDs below.');
    return uniq(out).slice(0, 8);
  }

  // ---------- summary ----------
  function firstOwnFrame(fr) {
    var lib = /^(java\.|javax\.|jdk\.|sun\.|org\.springframework|org\.apache|org\.hibernate|com\.sun|kotlin\.|node:|internal\/|System\.|Microsoft\.)/;
    for (var i = 0; i < fr.length; i++) if (!lib.test(fr[i].method) && !lib.test(fr[i].file) && !/node_modules|site-packages|lib\/python/.test(fr[i].file)) return fr[i];
    return fr[0];
  }

  function summarise(text, a) {
    var errs = a.errors, fr = a.frames, cls = a.classification, parts = [];
    var exc = errs.filter(function (e) { return e.kind === 'exception'; });
    if (cls.type === 'stacktrace') {
      var lang = a.language ? 'a ' + a.language + ' ' : 'a ';
      var top = exc.length ? exc[exc.length - 1] : null;
      // the root cause in Java is the last "Caused by"; in Python the last line; otherwise the first
      if (exc.length && !/Python/.test(a.language) && !/Caused by:/.test(text)) top = exc[0];
      var where = /Python/.test(a.language) ? fr[fr.length - 1] : firstOwnFrame(fr);
      parts.push('This looks like ' + lang + 'stack trace' + (top ? ': ' + top.text.split(':')[0].split('.').pop() : '') +
        (where ? ' in ' + (where.file.split(/[\\/]/).pop()) + ' line ' + where.line + (where.method ? ' (' + where.method.split('.').slice(-2).join('.') + ')' : '') : '') + '.');
      if (top && top.text.indexOf(':') > 0) parts.push('Message: “' + top.text.slice(top.text.indexOf(':') + 1).trim().slice(0, 140) + '”.');
      if (fr.length) parts.push(fr.length + ' stack frame' + (fr.length === 1 ? '' : 's') + ' found.');
    } else if (cls.type === 'http') {
      var h = errs.filter(function (e) { return e.kind === 'http'; })[0];
      parts.push('This looks like an HTTP error page' + (h ? ': ' + h.text + (h.code >= 500 ? ' (a server-side problem)' : ' (a problem with the request or access)') : '') + '.');
    } else if (cls.type === 'terminal') {
      parts.push('This looks like terminal or build output' + (errs.length ? ' with ' + errs.length + ' problem' + (errs.length === 1 ? '' : 's') + '. The first is: “' + errs[0].text.slice(0, 120) + '”' : '') + '.');
    } else if (cls.type === 'form') {
      var v = errs.filter(function (e) { return e.kind === 'validation'; });
      parts.push('This looks like a form with ' + v.length + ' validation message' + (v.length === 1 ? '' : 's') + (v.length ? ': ' + v.map(function (x) { return '“' + x.text.slice(0, 60) + '”'; }).slice(0, 3).join(', ') : '') + '.');
    } else if (cls.type === 'dashboard') {
      var nums = (clean(text).match(/(?:\$|€|£)\s?\d[\d,]*(?:\.\d+)?[kKmM]?|\b\d[\d,]*(?:\.\d+)?\s?%|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g) || []);
      parts.push('This looks like a dashboard or report with ' + nums.length + ' figure' + (nums.length === 1 ? '' : 's') + (nums.length ? ' (e.g. ' + uniq(nums).slice(0, 4).join(', ') + ')' : '') + '.');
    } else if (cls.type === 'chat') {
      var names = uniq((clean(text).match(/^\s*(?:\[?\d{1,2}:\d{2}(?:\s?[AP]M)?\]?\s*)?([A-Z][\w.' -]{1,24}):\s/gm) || []).map(function (l) { return l.replace(/^\s*(?:\[?\d{1,2}:\d{2}(?:\s?[AP]M)?\]?\s*)?/, '').replace(/:\s*$/, '').trim(); }));
      parts.push('This looks like a chat' + (names.length ? ' between ' + names.slice(0, 4).join(', ') : '') + '.');
    } else {
      var words = clean(text).split(/\s+/).filter(Boolean).length;
      parts.push('This looks like general text (' + words + ' words).');
    }
    if (cls.type !== 'stacktrace' && cls.type !== 'http' && cls.type !== 'terminal' && cls.type !== 'form' && errs.length) {
      parts.push('It mentions ' + errs.length + ' possible error' + (errs.length === 1 ? '' : 's') + ', starting with “' + errs[0].text.slice(0, 100) + '”.');
    }
    var ent = a.entities, bits = [];
    if (ent.urls.length) bits.push(ent.urls.length + ' link' + (ent.urls.length === 1 ? '' : 's'));
    if (ent.ids.length) bits.push(ent.ids.length + ' ID' + (ent.ids.length === 1 ? '' : 's'));
    if (ent.timestamps.length) bits.push(ent.timestamps.length + ' timestamp' + (ent.timestamps.length === 1 ? '' : 's'));
    if (ent.emails.length) bits.push(ent.emails.length + ' email address' + (ent.emails.length === 1 ? '' : 'es'));
    if (bits.length) parts.push('Found ' + bits.join(', ') + '.');
    return parts.join(' ');
  }

  function analyse(text) {
    var t = clean(text);
    var errors = findErrors(t), fr = frames(t), cls = classify(t, errors, fr);
    var a = { text: t, errors: errors, frames: fr, classification: cls, entities: extract(t), language: cls.type === 'stacktrace' ? guessLang(t, fr) : '' };
    a.summary = t.trim() ? summarise(t, a) : '';
    a.steps = t.trim() ? nextSteps(errors, cls, a.language) : [];
    return a;
  }

  var L = { clean: clean, extract: extract, findErrors: findErrors, frames: frames, classify: classify, analyse: analyse, TYPES: TYPES, HTTP_TEXT: HTTP_TEXT };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.ScreenshotLib = L;
})(this);
