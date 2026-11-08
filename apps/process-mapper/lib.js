/* Business Process Mapper — pure logic (no DOM).
   - parseSteps(text): typed/pasted step lists -> process model (roles, decisions, systems, inputs/outputs, flags)
   - transcriptToSteps(text): VTT / SRT / plain meeting notes -> a numbered step list to review
   - parseEventLog / mine: CSV event log -> directly-follows graph, variants, waits, bottlenecks
   - toMermaid / minedToMermaid, buildSOP (Markdown + HTML), improvements (hints) */
(function (root) {
  'use strict';

  // ---------- small helpers ----------
  function trim(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function cap(s) { s = trim(s); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function titleCase(s) { return trim(s).replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }); }
  function uniq(a) { var o = []; a.forEach(function (x) { if (x && o.indexOf(x) < 0) o.push(x); }); return o; }
  function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // Words that usually name a role / team when they start a step ("Customer emails order", "Warehouse picks stock")
  var ROLE_WORDS = ['customer', 'client', 'admin', 'administrator', 'office', 'manager', 'owner', 'director', 'warehouse', 'accounts', 'accountant',
    'bookkeeper', 'finance', 'sales', 'salesperson', 'staff', 'employee', 'driver', 'courier', 'supervisor', 'team leader', 'team', 'reception',
    'receptionist', 'support', 'technician', 'tech', 'installer', 'dispatch', 'purchasing', 'buyer', 'supplier', 'vendor', 'hr', 'payroll',
    'marketing', 'operations', 'ops', 'it', 'nurse', 'doctor', 'chef', 'kitchen', 'front desk', 'store', 'shop', 'assistant', 'coordinator',
    'scheduler', 'estimator', 'project manager', 'site manager', 'foreman', 'tradie', 'apprentice', 'agent', 'broker', 'approver', 'system'];
  var SYSTEMS = ['Xero', 'MYOB', 'QuickBooks', 'Excel', 'Google Sheets', 'spreadsheet', 'email', 'Outlook', 'Gmail', 'Shopify', 'WooCommerce', 'CRM',
    'Salesforce', 'HubSpot', 'SharePoint', 'Teams', 'Slack', 'phone', 'SMS', 'website', 'portal', 'ERP', 'POS', 'Square', 'Stripe', 'PayPal',
    'Deputy', 'ServiceM8', 'Tradify', 'simPRO', 'Trello', 'Asana', 'Monday', 'Jira', 'Dropbox', 'Google Drive', 'OneDrive', 'Word', 'PDF',
    'paper form', 'whiteboard', 'calendar', 'Google Calendar', 'WhatsApp', 'DocuSign', 'Zendesk', 'Freshdesk', 'Cin7', 'Unleashed', 'Airtable', 'Notion'];
  var DOCS = ['purchase order', 'order', 'invoice', 'quote', 'quotation', 'receipt', 'timesheet', 'report', 'form', 'contract', 'job card', 'work order',
    'delivery docket', 'packing slip', 'payment', 'refund', 'credit note', 'booking', 'application', 'request', 'ticket', 'checklist', 'statement',
    'approval', 'estimate', 'proposal', 'schedule', 'roster', 'stock', 'goods', 'parcel', 'enquiry', 'complaint', 'claim', 'certificate'];
  var OUT_VERBS = /\b(creates?|create|sends?|send|generates?|generate|issues?|issue|produces?|produce|raises?|raise|prepares?|prepare|writes?|write|emails?|email|posts?|ships?|dispatch(?:es)?|lodges?|files?|updates?|update|records?|record|books?|book)\b/i;
  var IN_VERBS = /\b(receives?|receive|gets?|checks?|check|reviews?|review|reads?|read|opens?|open|collects?|collect|verif(?:y|ies)|approves?|approve|downloads?|matches?|reconciles?)\b/i;
  var WAIT_RE = /\b(waits?|waiting|until|pending|awaiting|on hold|hold|chase|chases|follow[- ]?up|queue|queued|overnight|next day|batch(?:ed)?)\b/i;
  var APPROVAL_RE = /\b(approv\w*|sign[- ]?off|signs off|authori[sz]\w*|endorse\w*)\b/i;
  var REKEY_RE = /\b(re-?enter\w*|re-?key\w*|re-?typ\w*|retyp\w*|(?:cop(?:y|ies)|types?|keys?|enters?|transfers?) (?:and paste )?(?:[\w'$-]+ ){0,4}(?:into|onto|across to)|manually (?:enter|type|copy|update|record|key)\w*|double[- ]entry|print(?:s)? and scan\w*|\bagain\b(?=.*\b(?:in|into)\b))/i;
  var CHECK_RE = /\b(check\w*|verif\w*|review\w*|reconcil\w*|inspect\w*|confirm\w*|audit\w*|validat\w*|match\w*)\b/i;
  var END_RE = /\b(end|stop|close (?:the )?(?:job|ticket|case)|cancel\w*|reject\w*|finish(?:ed)?|done)\b/i;
  var GOTO_RE = /\b(?:go|goes|return|returns|loop|loops|back)\s+(?:back\s+)?to\s+step\s+(\d+)/i;

  // Minutes from "(10 min)", "2 hours", "1.5 hrs", "2 days" (working day = 8 h)
  function parseDuration(text) {
    var m = String(text || '').match(/(\d+(?:\.\d+)?)\s*(minutes?|mins?|m\b|hours?|hrs?|h\b|days?|d\b|weeks?|wks?)/i);
    if (!m) return null;
    var n = parseFloat(m[1]), u = m[2].toLowerCase();
    if (/^m/.test(u)) return n;
    if (/^h/.test(u)) return n * 60;
    if (/^d/.test(u)) return n * 8 * 60;
    return n * 5 * 8 * 60;
  }
  function fmtMinutes(min) {
    if (min == null || isNaN(min)) return '';
    if (min < 1) return Math.round(min * 60) + ' sec';
    if (min < 60) return Math.round(min) + ' min';
    if (min < 60 * 24) return (Math.round(min / 6) / 10) + ' h';
    return (Math.round(min / 60 / 2.4) / 10) + ' days';
  }

  function findSystems(text) {
    var found = [];
    SYSTEMS.forEach(function (s) {
      var re = new RegExp('\\b' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      if (re.test(text)) found.push(s === s.toLowerCase() ? cap(s) : s);
    });
    // "in Acme Portal", "using FooApp", "via BarSystem" (capitalised names)
    var re2 = /\b(?:in|using|via|through|into|on)\s+(?:the\s+)?([A-Z][A-Za-z0-9]+(?:\s[A-Z][A-Za-z0-9]+)?)/g, m;
    while ((m = re2.exec(text))) { if (!/^(The|A|An|If|Step|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/.test(m[1])) found.push(m[1]); }
    // drop "Email" if "Outlook"/"Gmail" found etc. — keep simple: de-duplicate case-insensitively
    var seen = {}, out = [];
    found.forEach(function (f) { var k = f.toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push(f); } });
    return out;
  }
  function findDocs(text) {
    var t = String(text || '').toLowerCase(), out = [];
    DOCS.forEach(function (d) {
      if (new RegExp('\\b' + d + 's?\\b').test(t) && !out.some(function (o) { return o.indexOf(d) >= 0; })) out.push(d);
    });
    return out;
  }

  // Pull a role out of a step: "Admin: checks stock", "Checks stock (Admin)", "... by the warehouse", "Warehouse picks order"
  function extractRole(text, known) {
    var t = trim(text), m;
    if ((m = t.match(/^\[?([A-Za-z][A-Za-z &/'-]{1,30}?)\]?\s*[:|]\s+(.+)$/)) && m[1].split(' ').length <= 4) return { role: titleCase(m[1]), text: m[2] };
    if ((m = t.match(/^(.+?)\s*\(([A-Za-z][A-Za-z &/'-]{1,30})\)\s*\.?$/)) && !/\d/.test(m[2]) && !parseDuration(m[2])) return { role: titleCase(m[2]), text: m[1] };
    if ((m = t.match(/^(.+?)\s+by\s+(?:the\s+|our\s+|a\s+|an\s+)?([A-Za-z][A-Za-z&' -]{1,30}?)(?:\s+(?:team|department|dept))?\s*\.?$/i))) {
      var cand = m[2].toLowerCase();
      if (ROLE_WORDS.indexOf(cand) >= 0 || known.indexOf(titleCase(cand)) >= 0 || /team|manager|officer|staff/.test(cand)) return { role: titleCase(m[2]), text: m[1] };
    }
    // leading role word: "The warehouse picks...", "Customer emails order"
    var lower = t.toLowerCase().replace(/^(the|our|a|an)\s+/, '');
    var all = known.map(function (k) { return k.toLowerCase(); }).concat(ROLE_WORDS).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < all.length; i++) {
      var w = all[i];
      if (lower.indexOf(w + ' ') === 0 || lower.indexOf(w + "'s ") === 0) {
        var rest = t.slice(t.toLowerCase().indexOf(w) + w.length).replace(/^'s\s+/, ' ').trim();
        if (rest && /^[a-z]/i.test(rest)) return { role: titleCase(w === 'it' ? 'IT' : w === 'hr' ? 'HR' : w), text: rest, keepSubject: true };
      }
    }
    return { role: '', text: t };
  }

  function splitSentences(text) {
    return String(text || '').split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/).map(trim).filter(Boolean);
  }

  // Break raw text into raw step strings.
  function rawSteps(text) {
    var src = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (!src) return [];
    var lines = src.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var out = [];
    // a single paragraph with arrows or "N." markers inline
    if (lines.length <= 2 && /(→|->|=>|\s\d+[.)]\s)/.test(src)) {
      src.split(/\s*(?:→|->|=>)\s*|\s+(?=\d+[.)]\s)/).forEach(function (p) { p = trim(p); if (p) out.push(p); });
    } else {
      lines.forEach(function (l) {
        if (/(→|->|=>)/.test(l)) l.split(/\s*(?:→|->|=>)\s*/).forEach(function (p) { if (trim(p)) out.push(p); });
        else out.push(l);
      });
    }
    // strip numbering / bullets; join "if/else" continuation lines onto the previous step
    var res = [];
    out.forEach(function (p) {
      var s = trim(p).replace(/^(?:step\s*)?\d+[.):-]?\s+/i, '').replace(/^[-*•·]\s+/, '').replace(/[.;]$/, '');
      if (!s) return;
      if (res.length && /^(else|otherwise|if not|or else)\b/i.test(s) && /\bif\b|\bwhen\b/i.test(res[res.length - 1]) && !/\b(else|otherwise)\b/i.test(res[res.length - 1])) {
        res[res.length - 1] += ', ' + s; return;
      }
      res.push(s);
    });
    // a single long paragraph -> sentences / "then"
    if (res.length === 1 && res[0].length > 140) {
      var parts = [];
      splitSentences(res[0]).forEach(function (s) { s.split(/,?\s+(?:and )?then\s+/i).forEach(function (x) { if (trim(x)) parts.push(trim(x).replace(/[.]$/, '')); }); });
      if (parts.length > 1) return parts;
    }
    return res;
  }

  // "if out of stock, notify customer, else create invoice" -> {cond, yes, no}
  function parseDecision(s) {
    var m = s.match(/^(.*?)(?:,\s*|\s+|^)(if|when|unless|in case)\s+(.+?)(?:,\s+|\s+then\s+|\s+[-–:]\s+|:\s+)(.+?)(?:[,;.]?\s*(?:else|otherwise|if not)[,:]?\s+(.+))?$/i);
    if (!m) return null;
    var pre = trim(m[1]).replace(/[,;:]$/, ''), kw = m[2].toLowerCase(), cond = trim(m[3]), yes = trim(m[4]), no = trim(m[5] || '');
    if (!cond || !yes) return null;
    if (kw === 'unless') { var tmp = yes; yes = no || ''; no = tmp; cond = cond; }
    return { pre: pre, cond: cond, yes: yes, no: no, unless: kw === 'unless' };
  }

  function stepFlags(text) {
    return {
      wait: WAIT_RE.test(text), approval: APPROVAL_RE.test(text), rekey: REKEY_RE.test(text), check: CHECK_RE.test(text)
    };
  }

  function branchInfo(text) {
    var t = trim(text), g = t.match(GOTO_RE);
    return { text: cap(t.replace(GOTO_RE, '').replace(/[,;]\s*$/, '').replace(/\s*\(?\s*(?:and\s+)?(?:end|stop)\s*\)?\s*$/i, '').trim() || t),
      goto: g ? +g[1] : null, end: /\(\s*end\s*\)|\b(?:and\s+)?(?:end|stop)s?\s*(?:the process|here)?\s*\.?$/i.test(t) || /^(?:end|stop|cancel\w*|close)\b/i.test(t) };
  }

  // Main parser -> model {steps:[...], roles:[...], systems:[...]}
  function parseSteps(text, opts) {
    opts = opts || {};
    var raws = rawSteps(text), known = (opts.roles || []).slice(), steps = [], lastRole = '';
    raws.forEach(function (raw, i) {
      var mins = parseDuration(raw.match(/\(([^)]*\d[^)]*)\)/) ? raw.match(/\(([^)]*\d[^)]*)\)/)[1] : '');
      var clean = trim(raw.replace(/\(([^)]*\d\s*(?:minutes?|mins?|hours?|hrs?|days?|weeks?|h|m|d)[^)]*)\)/i, ''));
      var r = extractRole(clean, known);
      if (r.role && known.indexOf(r.role) < 0) known.push(r.role);
      var body = r.text, step = { n: i + 1, raw: raw, role: r.role || '', inferredRole: false, minutes: mins, systems: findSystems(clean), kind: 'task' };
      if (!step.role && lastRole && !opts.noInherit) { step.role = lastRole; step.inferredRole = true; }
      var d = parseDecision(body);
      if (d) {
        step.kind = 'decision';
        step.label = d.pre ? cap(d.pre) : '';
        step.question = cap(d.cond.replace(/\?$/, '')) + '?';
        step.yes = branchInfo(d.yes);
        step.no = d.no ? branchInfo(d.no) : null;
        // with an else branch and no explicit goto/end: "yes" path ends there, "no" path carries on
        if (step.no && step.yes.goto == null && !step.yes.end && !/\b(continue|carry on|proceed)\b/i.test(d.yes)) step.yes.end = true;
        if (step.yes && /\b(continue|carry on|proceed)\b/i.test(d.yes)) step.yes.end = false;
        if (step.yes.goto == null && !step.yes.end && step.no && step.no.end) step.yes.end = false;
      } else {
        var g = body.match(GOTO_RE);
        step.label = cap(r.keepSubject ? body : body);
        if (g) { step.goto = +g[1]; step.label = cap(trim(body.replace(GOTO_RE, '').replace(/[,;]\s*(and)?\s*$/i, ''))) || step.label; }
        if (END_RE.test(body) && /^(?:end|stop|close|cancel|finish|done)/i.test(body)) step.end = true;
      }
      var all = body;
      step.flags = stepFlags(all);
      var docs = findDocs(all);
      step.outputs = OUT_VERBS.test(all) ? docs.slice(0, 2) : [];
      step.inputs = !step.outputs.length && (IN_VERBS.test(all) || i === 0) ? docs.slice(0, 2) : [];
      if (step.kind === 'decision') step.flags.check = true;
      steps.push(step);
      if (step.role) lastRole = step.role;
    });
    // a role first seen on step 3 should not leave steps 1-2 blank when they clearly continue
    var roles = uniq(steps.map(function (s) { return s.role; }));
    var systems = uniq([].concat.apply([], steps.map(function (s) { return s.systems; })));
    return { steps: steps, roles: roles, systems: systems };
  }

  // ---------- transcripts / notes ----------
  function cleanTranscript(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n'), out = [], speaker = '';
    lines.forEach(function (l) {
      var t = l.trim();
      if (!t || /^WEBVTT/i.test(t) || /^NOTE\b/.test(t) || /^\d+$/.test(t) || /^(STYLE|REGION)$/.test(t)) return;
      if (/-->/.test(t)) return;
      var m = t.match(/^<v\s+([^>]+)>(.*)$/i);
      if (m) { speaker = trim(m[1]); t = m[2]; }
      t = t.replace(/<[^>]+>/g, '');
      var sm = t.match(/^([A-Z][A-Za-z .'-]{1,30}):\s+(.*)$/);
      if (sm) { speaker = sm[1]; t = sm[2]; }
      if (t) out.push({ speaker: speaker, text: t });
    });
    // merge consecutive cues from the same speaker
    var merged = [];
    out.forEach(function (o) {
      var last = merged[merged.length - 1];
      if (last && last.speaker === o.speaker && !/[.!?]$/.test(last.text)) last.text += ' ' + o.text; else merged.push({ speaker: o.speaker, text: o.text });
    });
    return merged;
  }
  var FILLER = /\b(um+|uh+|erm|ah|you know|i mean|like,|sort of|kind of|basically|actually|literally|right\?|okay so|ok so|so yeah|yeah)\b,?\s*/gi;
  var SEQ = /^(?:and\s+)?(?:so\s+)?(?:first(?:ly)?|then|next|after that|afterwards|once (?:that'?s|it'?s|they'?ve|we'?ve|i'?ve)?|finally|lastly|step \d+|at the end|when|if|before|after)\b/i;
  var ACTION = /\b(does|do|takes?|fills?|completes?|visits?|arrives?|delivers?|collects?|inspects?|quotes?|writes?|goes|puts?|moves?|gets?|makes?|scans?|attaches?|saves?|submits?|signs?|check|checks|send|sends|create|creates|enter|enters|email|emails|call|calls|approve|approves|review|reviews|update|updates|book|books|pick|picks|pack|packs|ship|ships|invoice|invoices|pay|pays|record|records|upload|uploads|print|prints|sign|signs|log|logs|raise|raises|assign|assigns|schedule|schedules|notify|notifies|confirm|confirms|receive|receives|order|orders|copy|copies|type|types|file|files|reconcile|reconciles|issue|issues|prepare|prepares|forward|forwards|chase|chases|close|closes)\b/i;

  function transcriptToSteps(text) {
    var cues = cleanTranscript(text), steps = [];
    cues.forEach(function (c) {
      splitSentences(c.text).forEach(function (s) {
        var t = trim(s.replace(FILLER, ' ').replace(/\s+,/g, ','));
        for (var k = 0; k < 3; k++) t = t.replace(/^[\s,]*(?:and|so|but|ok(?:ay)?|well|right)\b[\s,]*/i, '');
        t = t.replace(/\b(and|but|so),\s+/gi, '$1 ');
        var seq = SEQ.test(t);
        t = trim(t.replace(/^(?:first(?:ly)?|next|after that|afterwards|finally|lastly|then)\b[\s,]*/i, ''));
        if (t.length < 8 || /\?$/.test(t)) return;
        if (!(seq || ACTION.test(t))) return;
        // "I"/"we" -> the speaker's role is unknown; keep the speaker as a hint
        var hint = c.speaker && /^(i|we)\b/i.test(t) ? c.speaker + ': ' : '';
        t = t.replace(/^(?:i|we)\s+(?:then\s+)?(?:just\s+)?/i, '').replace(/^(?:you|they)\s+(?:then\s+)?(?:just\s+)?/i, '');
        steps.push(hint + cap(t.replace(/[.!]+$/, '')));
      });
    });
    // drop exact duplicates
    var seen = {};
    steps = steps.filter(function (s) { var k = s.toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; });
    return steps.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n');
  }

  // Dictated speech (no punctuation): break on "then / next / after that / finally" and on pauses (one segment per pause)
  function speechToSteps(segments) {
    var text = [].concat(segments || []).map(function (x) { return trim(x); }).filter(Boolean).map(function (x) { return cap(x) + '.'; }).join(' ');
    text = text.replace(/\s+(?:and\s+)?(then|next|after that|afterwards|finally|once that'?s done)\s+/gi, function (m, w) { return '. ' + cap(w) + ' '; });
    return transcriptToSteps(text);
  }

  // ---------- event logs (process mining) ----------
  function guessColumns(headers) {
    var find = function (re) { for (var i = 0; i < headers.length; i++) if (re.test(headers[i])) return headers[i]; return ''; };
    return {
      caseId: find(/case|ticket|order|job|^id$|instance|trace|request/i),
      activity: find(/activity|step|task|event|action|status|stage/i),
      time: find(/time|date|start|created|when/i),
      role: find(/role|resource|user|who|team|person|assignee|owner|by/i)
    };
  }
  // "2026-03-02 09:15", "2026-03-02T09:15:00Z", "02/03/2026 9:15 am" (day-first) -> ms (treated as UTC wall clock)
  function parseTime(v) {
    var s = trim(v), m;
    if (!s) return NaN;
    if (/^\d{10,13}$/.test(s)) return s.length === 13 ? +s : +s * 1000;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) return Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i))) {
      var y = +m[3]; if (y < 100) y += 2000; var h = +(m[4] || 0);
      if (m[7]) { var pm = /pm/i.test(m[7]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
      return Date.UTC(y, m[2] - 1, +m[1], h, +(m[5] || 0), +(m[6] || 0));
    }
    var d = Date.parse(s); return isNaN(d) ? NaN : d;
  }
  function parseEventLog(rows, cols) {
    var events = [], skipped = 0;
    (rows || []).forEach(function (r, i) {
      var c = trim(r[cols.caseId]), a = trim(r[cols.activity]), t = parseTime(r[cols.time]);
      if (!c || !a || isNaN(t)) { skipped++; return; }
      events.push({ caseId: c, activity: a, time: t, role: cols.role ? trim(r[cols.role]) : '', i: i });
    });
    return { events: events, skipped: skipped };
  }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
  function median(a) { if (!a.length) return null; var b = a.slice().sort(function (x, y) { return x - y; }), m = Math.floor(b.length / 2); return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }

  function mine(events) {
    var cases = {}, order = [];
    events.forEach(function (e) { if (!cases[e.caseId]) { cases[e.caseId] = []; order.push(e.caseId); } cases[e.caseId].push(e); });
    var edges = {}, acts = {}, variants = {}, starts = {}, ends = {}, durations = [], roleCount = {};
    order.forEach(function (id) {
      var tr = cases[id].sort(function (a, b) { return a.time - b.time || a.i - b.i; });
      var seq = tr.map(function (e) { return e.activity; });
      var key = seq.join(' → ');
      variants[key] = variants[key] || { path: seq, count: 0, durations: [] };
      variants[key].count++;
      starts[seq[0]] = (starts[seq[0]] || 0) + 1; ends[seq[seq.length - 1]] = (ends[seq[seq.length - 1]] || 0) + 1;
      var dur = (tr[tr.length - 1].time - tr[0].time) / 60000; durations.push(dur); variants[key].durations.push(dur);
      tr.forEach(function (e, k) {
        acts[e.activity] = acts[e.activity] || { name: e.activity, count: 0, cases: {}, waitsIn: [] };
        acts[e.activity].count++; acts[e.activity].cases[id] = 1;
        if (e.role) { roleCount[e.activity] = roleCount[e.activity] || {}; roleCount[e.activity][e.role] = (roleCount[e.activity][e.role] || 0) + 1; }
        if (k > 0) {
          var p = tr[k - 1], ek = p.activity + '\u0000' + e.activity, w = (e.time - p.time) / 60000;
          edges[ek] = edges[ek] || { from: p.activity, to: e.activity, count: 0, waits: [] };
          edges[ek].count++; edges[ek].waits.push(w); acts[e.activity].waitsIn.push(w);
        }
      });
    });
    var activities = Object.keys(acts).map(function (k) {
      var a = acts[k], rc = roleCount[k] || {}, role = Object.keys(rc).sort(function (x, y) { return rc[y] - rc[x]; })[0] || '';
      var rework = 0; order.forEach(function (id) { var n = cases[id].filter(function (e) { return e.activity === k; }).length; if (n > 1) rework++; });
      return { name: k, count: a.count, cases: Object.keys(a.cases).length, role: role, avgWaitBefore: mean(a.waitsIn), medianWaitBefore: median(a.waitsIn), reworkCases: rework };
    }).sort(function (x, y) { return y.count - x.count; });
    var edgeList = Object.keys(edges).map(function (k) { var e = edges[k]; return { from: e.from, to: e.to, count: e.count, avgMinutes: mean(e.waits), medianMinutes: median(e.waits), maxMinutes: Math.max.apply(null, e.waits) }; })
      .sort(function (x, y) { return y.count - x.count; });
    var variantList = Object.keys(variants).map(function (k) { var v = variants[k]; return { path: v.path, key: k, count: v.count, share: v.count / order.length, avgMinutes: mean(v.durations) }; })
      .sort(function (x, y) { return y.count - x.count || x.path.length - y.path.length; });
    // bottlenecks: transitions with the longest average wait, weighted by how often they happen
    var totalWait = edgeList.reduce(function (s, e) { return s + e.avgMinutes * e.count; }, 0) || 1;
    var bottlenecks = edgeList.filter(function (e) { return e.avgMinutes > 0; }).map(function (e) {
      return { from: e.from, to: e.to, count: e.count, avgMinutes: e.avgMinutes, shareOfWait: e.avgMinutes * e.count / totalWait };
    }).sort(function (x, y) { return y.shareOfWait - x.shareOfWait; }).slice(0, 5);
    var loops = edgeList.filter(function (e) {
      return e.from === e.to || edgeList.some(function (o) { return o.from === e.to && o.to === e.from; });
    });
    return {
      caseCount: order.length, eventCount: events.length, activities: activities, edges: edgeList, variants: variantList,
      starts: starts, ends: ends, avgCaseMinutes: mean(durations), medianCaseMinutes: median(durations), bottlenecks: bottlenecks, loops: loops
    };
  }
  // Turn the most common variant into a step list so the SOP / diagram tools can use it
  function minedToSteps(m) {
    if (!m.variants.length) return '';
    var actRole = {}; m.activities.forEach(function (a) { actRole[a.name] = a.role; });
    var path = m.variants[0].path;
    return path.map(function (a, i) {
      var e = i > 0 ? m.edges.filter(function (x) { return x.from === path[i - 1] && x.to === a; })[0] : null;
      return (i + 1) + '. ' + (actRole[a] ? actRole[a] + ': ' : '') + a + (e && e.avgMinutes >= 1 ? ' (wait ' + fmtMinutes(e.avgMinutes).replace(' ', ' ') + ')' : '');
    }).join('\n');
  }

  // ---------- Mermaid ----------
  function mLabel(s) { return '"' + String(s == null ? '' : s).replace(/"/g, '#quot;').replace(/[\r\n]+/g, ' ').replace(/[<>]/g, function (c) { return c === '<' ? '#lt;' : '#gt;'; }) + '"'; }
  function laneId(i) { return 'lane' + i; }

  function toMermaid(model, opts) {
    opts = opts || {};
    var steps = model.steps || [], lines = ['flowchart ' + (opts.direction || 'TD')], lanes = {}, laneOrder = [], edges = [];
    if (!steps.length) return lines.concat(['  empty["No steps yet"]']).join('\n');
    function lane(role) { var r = role || 'Unassigned'; if (!lanes[r]) { lanes[r] = []; laneOrder.push(r); } return lanes[r]; }
    var needEnd = false;
    steps.forEach(function (s, i) {
      var id = 'S' + s.n, l = lane(s.role), txt = s.label || s.raw;
      if (s.minutes && opts.showTimes !== false) txt += ' (' + fmtMinutes(s.minutes) + ')';
      if (s.kind === 'decision') {
        if (s.label) { l.push('    ' + id + 'a[' + mLabel(s.label) + ']'); edges.push('  ' + id + 'a --> ' + id); }
        l.push('    ' + id + '{' + mLabel(s.question) + '}');
        var next = steps[i + 1] ? 'S' + steps[i + 1].n + (steps[i + 1].kind === 'decision' && steps[i + 1].label ? 'a' : '') : 'END';
        [['yes', s.unless ? 'No' : 'Yes'], ['no', s.unless ? 'Yes' : 'No']].forEach(function (b) {
          var br = s[b[0]];
          if (!br) { edges.push('  ' + id + ' -->|' + b[1] + '| ' + next); if (next === 'END') needEnd = true; return; }
          var bid = id + b[0].charAt(0).toUpperCase();
          l.push('    ' + bid + '[' + mLabel(br.text) + ']');
          edges.push('  ' + id + ' -->|' + b[1] + '| ' + bid);
          if (br.goto) edges.push('  ' + bid + ' -.->|back to step ' + br.goto + '| S' + br.goto);
          else if (br.end) { edges.push('  ' + bid + ' --> END'); needEnd = true; }
          else { edges.push('  ' + bid + ' --> ' + next); if (next === 'END') needEnd = true; }
        });
      } else {
        l.push('    ' + id + '[' + mLabel(txt) + ']');
        if (s.goto) edges.push('  ' + id + ' -.->|back to step ' + s.goto + '| S' + s.goto);
        else if (s.end) { edges.push('  ' + id + ' --> END'); needEnd = true; }
        else if (steps[i + 1]) edges.push('  ' + id + ' --> S' + steps[i + 1].n + (steps[i + 1].kind === 'decision' && steps[i + 1].label ? 'a' : ''));
        else { edges.push('  ' + id + ' --> END'); needEnd = true; }
      }
    });
    var first = steps[0], firstId = 'S' + first.n + (first.kind === 'decision' && first.label ? 'a' : '');
    lines.push('  START([' + mLabel(opts.startLabel || 'Start') + '])');
    var useLanes = opts.swimlanes !== false && laneOrder.length > 1 || (laneOrder.length === 1 && laneOrder[0] !== 'Unassigned' && opts.swimlanes !== false);
    laneOrder.forEach(function (r, i) {
      if (useLanes) { lines.push('  subgraph ' + laneId(i) + '[' + mLabel(r) + ']'); lines.push('    direction TB'); }
      lanes[r].forEach(function (n) { lines.push(useLanes ? n : n.replace(/^ {4}/, '  ')); });
      if (useLanes) lines.push('  end');
    });
    if (needEnd) lines.push('  END([' + mLabel(opts.endLabel || 'End') + '])');
    lines.push('  START --> ' + firstId);
    edges.forEach(function (e) { lines.push(e); });
    // highlight risky steps
    var cls = { wait: [], approval: [], rekey: [] };
    steps.forEach(function (s) { ['wait', 'approval', 'rekey'].forEach(function (k) { if (s.flags && s.flags[k]) cls[k].push('S' + s.n); }); });
    lines.push('  classDef wait stroke-dasharray: 5 4;');
    lines.push('  classDef approval stroke-width:3px;');
    if (cls.wait.length) lines.push('  class ' + uniq(cls.wait).join(',') + ' wait;');
    if (cls.approval.length) lines.push('  class ' + uniq(cls.approval).join(',') + ' approval;');
    return lines.join('\n');
  }

  function minedToMermaid(m, opts) {
    opts = opts || {};
    var minCount = opts.minCount || 1, ids = {}, lines = ['flowchart ' + (opts.direction || 'LR')], lanes = {}, laneOrder = [];
    var kept = m.edges.filter(function (e) { return e.count >= minCount; });
    var actNames = m.activities.filter(function (a) { return kept.some(function (e) { return e.from === a.name || e.to === a.name; }) || m.starts[a.name] || m.ends[a.name]; });
    actNames.forEach(function (a, i) { ids[a.name] = 'A' + i; var r = opts.swimlanes === false ? '' : (a.role || ''); if (!lanes[r]) { lanes[r] = []; laneOrder.push(r); } lanes[r].push(a); });
    lines.push('  START([' + mLabel('Start') + '])');
    laneOrder.forEach(function (r, i) {
      var inLane = r && laneOrder.length > 0;
      if (inLane) lines.push('  subgraph ' + laneId(i) + '[' + mLabel(r) + ']');
      lanes[r].forEach(function (a) { lines.push((inLane ? '    ' : '  ') + ids[a.name] + '[' + mLabel(a.name + ' (' + a.count + ')') + ']'); });
      if (inLane) lines.push('  end');
    });
    lines.push('  END([' + mLabel('End') + '])');
    Object.keys(m.starts).forEach(function (a) { if (ids[a]) lines.push('  START -->|' + m.starts[a] + '| ' + ids[a]); });
    var slow = m.bottlenecks.length ? m.bottlenecks[0] : null;
    kept.forEach(function (e) {
      if (!ids[e.from] || !ids[e.to]) return;
      var lbl = e.count + (e.avgMinutes >= 1 ? ' · ' + fmtMinutes(e.avgMinutes) : '');
      lines.push('  ' + ids[e.from] + (slow && slow.from === e.from && slow.to === e.to ? ' ==>|' : ' -->|') + mLabel(lbl) + '| ' + ids[e.to]);
    });
    Object.keys(m.ends).forEach(function (a) { if (ids[a]) lines.push('  ' + ids[a] + ' -->|' + m.ends[a] + '| END'); });
    return lines.join('\n');
  }

  // ---------- improvement hints ----------
  function improvements(model, mined) {
    var steps = model.steps || [], out = [];
    var handoffs = 0;
    for (var i = 1; i < steps.length; i++) if (steps[i].role && steps[i - 1].role && steps[i].role !== steps[i - 1].role) handoffs++;
    var waits = steps.filter(function (s) { return s.flags && s.flags.wait; });
    var appr = steps.filter(function (s) { return s.flags && s.flags.approval; });
    var rekey = steps.filter(function (s) { return s.flags && s.flags.rekey; });
    var loops = steps.filter(function (s) { return s.goto || (s.yes && s.yes.goto) || (s.no && s.no.goto); });
    var noRole = steps.filter(function (s) { return !s.role; });
    if (handoffs) out.push({ level: handoffs > 3 ? 'warn' : 'info', key: 'handoffs', count: handoffs, text: handoffs + ' handoff' + (handoffs > 1 ? 's' : '') + ' between people or teams. Each handoff is a place where work waits or gets lost — can one person own more consecutive steps, or can a shared checklist travel with the job?' });
    if (waits.length) out.push({ level: 'warn', key: 'wait', count: waits.length, text: 'Waiting steps: ' + waits.map(function (s) { return 'step ' + s.n; }).join(', ') + '. Add a time limit and an automatic reminder, or remove the wait by doing the work in parallel.' });
    if (rekey.length) out.push({ level: 'bad', key: 'rekey', count: rekey.length, text: 'Manual re-keying at ' + rekey.map(function (s) { return 'step ' + s.n; }).join(', ') + '. Typing the same data twice causes errors — look for an integration, import or a single form that feeds both systems.' });
    if (appr.length > 1) out.push({ level: 'warn', key: 'approvals', count: appr.length, text: appr.length + ' approval steps. Consider an approval limit (e.g. under $500 needs no sign-off) or one combined approval.' });
    else if (appr.length === 1) out.push({ level: 'info', key: 'approvals', count: 1, text: 'One approval step (step ' + appr[0].n + '). Make sure there is a back-up approver when that person is away.' });
    if (loops.length) out.push({ level: 'warn', key: 'loops', count: loops.length, text: 'Rework loops at ' + loops.map(function (s) { return 'step ' + s.n; }).join(', ') + '. Find out why work is sent back and fix it at the source (clearer request form, checklist before submitting).' });
    if (model.systems && model.systems.length > 3) out.push({ level: 'info', key: 'systems', count: model.systems.length, text: model.systems.length + ' different systems/tools (' + model.systems.join(', ') + '). Fewer tools usually means fewer copy-paste steps.' });
    if (noRole.length) out.push({ level: 'info', key: 'roles', count: noRole.length, text: noRole.length + ' step' + (noRole.length > 1 ? 's have' : ' has') + ' no responsible role. Write it as "Role: action" so everyone knows who does it.' });
    var untimed = steps.filter(function (s) { return s.minutes == null; }).length;
    if (steps.length && untimed === steps.length) out.push({ level: 'info', key: 'times', count: 0, text: 'Add rough times like "(10 min)" to steps to see total effort and where the time goes.' });
    if (mined) {
      if (mined.bottlenecks[0]) { var b = mined.bottlenecks[0]; out.push({ level: 'bad', key: 'bottleneck', count: b.count, text: 'Biggest wait: "' + b.from + '" → "' + b.to + '" averages ' + fmtMinutes(b.avgMinutes) + ' (' + Math.round(b.shareOfWait * 100) + '% of all waiting time).' }); }
      var rw = mined.activities.filter(function (a) { return a.reworkCases > 0; });
      if (rw.length) out.push({ level: 'warn', key: 'rework', count: rw.length, text: 'Repeated activities (rework): ' + rw.map(function (a) { return a.name + ' (' + a.reworkCases + ' cases)'; }).join(', ') + '.' });
      if (mined.variants.length > 1) { var top = mined.variants[0]; out.push({ level: top.share < 0.5 ? 'warn' : 'info', key: 'variants', count: mined.variants.length, text: mined.variants.length + ' different paths; the most common one covers ' + Math.round(top.share * 100) + '% of cases.' + (top.share < 0.5 ? ' Low standardisation — agree one standard path.' : '') }); }
    }
    if (!out.length && steps.length) out.push({ level: 'ok', key: 'none', count: 0, text: 'No obvious problems found. Check the times on each step and ask the people doing it where they get stuck.' });
    return { handoffs: handoffs, waits: waits.length, approvals: appr.length, rekey: rekey.length, loops: loops.length, hints: out };
  }

  // ---------- SOP ----------
  function raci(model, meta) {
    var roles = model.roles.length ? model.roles : ['Unassigned'], owner = (meta && meta.ownerRole) || '';
    return model.steps.map(function (s, i) {
      var row = { step: s.n, task: s.kind === 'decision' ? (s.label ? s.label + ' — ' : '') + s.question : s.label }, next = model.steps[i + 1];
      roles.forEach(function (r) {
        var v = '';
        if (s.role === r || (!s.role && r === 'Unassigned')) v = 'R';
        if (owner && r === owner) v = v ? v + '/A' : 'A';
        else if (!v && s.flags && s.flags.approval && s.role === r) v = 'A';
        if (!v && next && next.role === r && next.role !== s.role) v = 'I';
        row[r] = v;
      });
      return row;
    });
  }
  function totalMinutes(model) { var t = 0, any = false; model.steps.forEach(function (s) { if (s.minutes) { t += s.minutes; any = true; } }); return any ? t : null; }

  function sopData(model, meta, mined) {
    meta = meta || {};
    var imp = improvements(model, mined);
    var controls = [];
    model.steps.forEach(function (s) {
      if (s.kind === 'decision') controls.push({ step: s.n, type: 'Decision', text: s.question });
      else if (s.flags.approval) controls.push({ step: s.n, type: 'Approval', text: s.label });
      else if (s.flags.check) controls.push({ step: s.n, type: 'Check', text: s.label });
    });
    var kpis = [];
    var tm = totalMinutes(model);
    if (tm) kpis.push({ name: 'Hands-on time per case (estimate)', target: fmtMinutes(tm) });
    if (mined && mined.avgCaseMinutes != null) kpis.push({ name: 'Average end-to-end time (from event log)', target: fmtMinutes(mined.avgCaseMinutes) });
    if (mined && mined.medianCaseMinutes != null) kpis.push({ name: 'Median end-to-end time (from event log)', target: fmtMinutes(mined.medianCaseMinutes) });
    kpis.push({ name: 'Cases completed without rework', target: '≥ 95%' });
    if (controls.some(function (c) { return c.type === 'Approval'; })) kpis.push({ name: 'Approvals turned around within 1 working day', target: '≥ 90%' });
    kpis.push({ name: 'Handoffs in the process', target: String(imp.handoffs) });
    return {
      title: meta.title || 'Standard operating procedure', owner: meta.owner || '', version: meta.version || '1.0', date: meta.date || '',
      purpose: meta.purpose || ('Describe how we ' + (meta.title ? meta.title.toLowerCase() : 'run this process') + ' the same way every time, so work is done correctly and on time.'),
      scope: meta.scope || ('Covers the process from "' + ((model.steps[0] && (model.steps[0].label || model.steps[0].question)) || 'start') + '" to "' + ((model.steps[model.steps.length - 1] && (model.steps[model.steps.length - 1].label || model.steps[model.steps.length - 1].question)) || 'end') + '".'),
      roles: model.roles, systems: model.systems, raci: raci(model, meta), steps: model.steps, controls: controls, kpis: kpis, hints: imp.hints,
      revisions: (meta.revisions && meta.revisions.length) ? meta.revisions : [{ version: meta.version || '1.0', date: meta.date || '', author: meta.owner || '', change: 'First version' }]
    };
  }
  function stepLine(s) {
    if (s.kind === 'decision') {
      var t = (s.label ? s.label + '. ' : '') + 'Decide: ' + s.question;
      if (s.yes) t += ' If yes: ' + s.yes.text + (s.yes.goto ? ' (go back to step ' + s.yes.goto + ')' : s.yes.end ? ' (process ends)' : '') + '.';
      if (s.no) t += ' If no: ' + s.no.text + (s.no.goto ? ' (go back to step ' + s.no.goto + ')' : s.no.end ? ' (process ends)' : '') + '.';
      else t += ' If no: continue.';
      return t;
    }
    return s.label + (s.goto ? ' (then go back to step ' + s.goto + ')' : '') + (s.end ? ' (process ends)' : '');
  }
  function mdCell(s) { return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' '); }
  function mdTable(head, rows) {
    return '| ' + head.map(mdCell).join(' | ') + ' |\n|' + head.map(function () { return ' --- '; }).join('|') + '|\n' + rows.map(function (r) { return '| ' + r.map(mdCell).join(' | ') + ' |'; }).join('\n') + '\n';
  }
  function sopMarkdown(model, meta, mined, mermaid) {
    var d = sopData(model, meta, mined), roles = d.roles.length ? d.roles : ['Unassigned'];
    var md = '# ' + d.title + '\n\n';
    md += '**Process owner:** ' + (d.owner || '—') + '  \n**Version:** ' + d.version + '  \n**Date:** ' + (d.date || '—') + '\n\n';
    md += '## 1. Purpose\n\n' + d.purpose + '\n\n## 2. Scope\n\n' + d.scope + '\n\n';
    md += '## 3. Roles and responsibilities (RACI)\n\nR = does the work, A = accountable, I = kept informed (next in line).\n\n';
    md += mdTable(['#', 'Task'].concat(roles), d.raci.map(function (r) { return [r.step, r.task].concat(roles.map(function (x) { return r[x] || ''; })); })) + '\n';
    if (d.systems.length) md += '**Systems and tools used:** ' + d.systems.join(', ') + '\n\n';
    md += '## 4. Procedure\n\n';
    d.steps.forEach(function (s) {
      md += s.n + '. **' + (s.role || 'Unassigned') + ':** ' + stepLine(s) + (s.minutes ? ' _(about ' + fmtMinutes(s.minutes) + ')_' : '') + '\n';
      var extra = [];
      if (s.systems.length) extra.push('System: ' + s.systems.join(', '));
      if (s.inputs.length) extra.push('Input: ' + s.inputs.join(', '));
      if (s.outputs.length) extra.push('Output: ' + s.outputs.join(', '));
      if (extra.length) md += '   - ' + extra.join(' · ') + '\n';
    });
    md += '\n## 5. Decision points and controls\n\n';
    md += d.controls.length ? mdTable(['Step', 'Type', 'Control'], d.controls.map(function (c) { return [c.step, c.type, c.text]; })) : 'No checks or approvals recorded. Consider adding at least one check before work leaves the business.\n';
    md += '\n## 6. Measures (KPIs) and time estimates\n\n' + mdTable(['Measure', 'Target / current'], d.kpis.map(function (k) { return [k.name, k.target]; }));
    md += '\n## 7. Improvement notes\n\n' + d.hints.map(function (h) { return '- ' + h.text; }).join('\n') + '\n';
    if (mermaid) md += '\n## 8. Process diagram\n\n```mermaid\n' + mermaid + '\n```\n';
    md += '\n## ' + (mermaid ? '9' : '8') + '. Revision history\n\n' + mdTable(['Version', 'Date', 'Author', 'Change'], d.revisions.map(function (r) { return [r.version, r.date, r.author, r.change]; }));
    return md;
  }
  function sopHtml(model, meta, mined, svg) {
    var d = sopData(model, meta, mined), roles = d.roles.length ? d.roles : ['Unassigned'], e = escHtml;
    var tbl = function (head, rows) { return '<table><thead><tr>' + head.map(function (h) { return '<th>' + e(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + e(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'; };
    var h = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + e(d.title) + '</title><style>' +
      'body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d1f24;background:#fff;max-width:900px;margin:24px auto;padding:0 16px}' +
      'h1{font-size:26px;margin:0 0 6px}h2{font-size:18px;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}table{border-collapse:collapse;width:100%;font-size:13px;margin:6px 0}' +
      'th,td{border:1px solid #ccc;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f1ede4}.meta{color:#555}.small{font-size:12px;color:#555}ol li{margin:4px 0}.diagram svg{max-width:100%;height:auto}' +
      '@media print{body{margin:0}h2{break-after:avoid}table,li{break-inside:avoid}}</style></head><body>';
    h += '<h1>' + e(d.title) + '</h1><p class="meta">Process owner: ' + e(d.owner || '—') + ' · Version ' + e(d.version) + ' · ' + e(d.date || '') + '</p>';
    h += '<h2>1. Purpose</h2><p>' + e(d.purpose) + '</p><h2>2. Scope</h2><p>' + e(d.scope) + '</p>';
    h += '<h2>3. Roles and responsibilities (RACI)</h2><p class="small">R = does the work, A = accountable, I = kept informed (next in line).</p>' +
      tbl(['#', 'Task'].concat(roles), d.raci.map(function (r) { return [r.step, r.task].concat(roles.map(function (x) { return r[x] || ''; })); }));
    if (d.systems.length) h += '<p><b>Systems and tools used:</b> ' + e(d.systems.join(', ')) + '</p>';
    h += '<h2>4. Procedure</h2><ol>' + d.steps.map(function (s) {
      var extra = [];
      if (s.systems.length) extra.push('System: ' + s.systems.join(', '));
      if (s.inputs.length) extra.push('Input: ' + s.inputs.join(', '));
      if (s.outputs.length) extra.push('Output: ' + s.outputs.join(', '));
      return '<li><b>' + e(s.role || 'Unassigned') + ':</b> ' + e(stepLine(s)) + (s.minutes ? ' <i>(about ' + e(fmtMinutes(s.minutes)) + ')</i>' : '') + (extra.length ? '<br><span class="small">' + e(extra.join(' · ')) + '</span>' : '') + '</li>';
    }).join('') + '</ol>';
    h += '<h2>5. Decision points and controls</h2>' + (d.controls.length ? tbl(['Step', 'Type', 'Control'], d.controls.map(function (c) { return [c.step, c.type, c.text]; })) : '<p>No checks or approvals recorded.</p>');
    h += '<h2>6. Measures (KPIs) and time estimates</h2>' + tbl(['Measure', 'Target / current'], d.kpis.map(function (k) { return [k.name, k.target]; }));
    h += '<h2>7. Improvement notes</h2><ul>' + d.hints.map(function (x) { return '<li>' + e(x.text) + '</li>'; }).join('') + '</ul>';
    var n = 8;
    if (svg) h += '<h2>' + (n++) + '. Process diagram</h2><div class="diagram">' + svg + '</div>';
    h += '<h2>' + n + '. Revision history</h2>' + tbl(['Version', 'Date', 'Author', 'Change'], d.revisions.map(function (r) { return [r.version, r.date, r.author, r.change]; }));
    return h + '</body></html>';
  }

  var SAMPLE_STEPS = [
    '1. Customer: emails an order to sales@ (2 min)',
    '2. Admin: checks stock in Excel (10 min)',
    '3. If out of stock, notify the customer by email, else create the invoice in Xero (5 min)',
    '4. Admin: copies the order details into the Shopify portal (8 min)',
    '5. If the order is over $2,000, manager approves the discount',
    '6. Warehouse: picks and packs the goods (20 min)',
    '7. Warehouse waits for the courier pickup (4 hours)',
    '8. Driver: delivers the parcel and gets a signature (1 day)',
    '9. Accounts: reconciles the payment in Xero (5 min)'
  ].join('\n');
  var SAMPLE_VTT = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:06.000\n<v Priya>So, um, first the customer fills in the booking form on our website.\n\n2\n00:00:06.500 --> 00:00:12.000\n<v Priya>Then I check the calendar for a free slot and, you know, I call them to confirm.\n\n3\n00:00:12.500 --> 00:00:18.000\n<v Sam>After that I type the job into ServiceM8 again because it doesn\'t sync.\n\n4\n00:00:18.500 --> 00:00:24.000\n<v Sam>The technician does the job and takes photos.\n\n5\n00:00:24.500 --> 00:00:30.000\n<v Priya>Finally I send the invoice from Xero and we wait for payment.\n';
  var SAMPLE_LOG = (function () {
    var rows = [['case_id', 'activity', 'timestamp', 'role']];
    var paths = [
      ['Receive order', 'Check stock', 'Create invoice', 'Pick and pack', 'Ship'],
      ['Receive order', 'Check stock', 'Create invoice', 'Pick and pack', 'Ship'],
      ['Receive order', 'Check stock', 'Create invoice', 'Pick and pack', 'Ship'],
      ['Receive order', 'Check stock', 'Manager approval', 'Create invoice', 'Pick and pack', 'Ship'],
      ['Receive order', 'Check stock', 'Notify out of stock', 'Check stock', 'Create invoice', 'Pick and pack', 'Ship'],
      ['Receive order', 'Check stock', 'Create invoice', 'Pick and pack', 'Ship'],
      ['Receive order', 'Check stock', 'Manager approval', 'Create invoice', 'Pick and pack', 'Ship'],
      ['Receive order', 'Check stock', 'Notify out of stock']
    ];
    var role = { 'Receive order': 'Sales', 'Check stock': 'Admin', 'Create invoice': 'Admin', 'Manager approval': 'Manager', 'Notify out of stock': 'Admin', 'Pick and pack': 'Warehouse', 'Ship': 'Warehouse' };
    var gap = { 'Check stock': 35, 'Create invoice': 20, 'Manager approval': 300, 'Pick and pack': 240, 'Ship': 1100, 'Notify out of stock': 15 };
    paths.forEach(function (p, i) {
      var t = Date.UTC(2026, 9, 5 + i, 9, 0);
      p.forEach(function (a, k) {
        if (k) t += (gap[a] || 30) * 60000 * (1 + (i % 3) * 0.2);
        if (k && p[k - 1] === 'Notify out of stock') t += 2 * 24 * 60 * 60000;
        var d = new Date(t);
        rows.push(['ORD-' + (1001 + i), a, d.toISOString().slice(0, 16).replace('T', ' '), role[a]]);
      });
    });
    return rows.map(function (r) { return r.join(','); }).join('\n');
  })();

  var L = {
    parseSteps: parseSteps, rawSteps: rawSteps, parseDecision: parseDecision, extractRole: extractRole, findSystems: findSystems, findDocs: findDocs,
    parseDuration: parseDuration, fmtMinutes: fmtMinutes, cleanTranscript: cleanTranscript, transcriptToSteps: transcriptToSteps, speechToSteps: speechToSteps,
    guessColumns: guessColumns, parseTime: parseTime, parseEventLog: parseEventLog, mine: mine, minedToSteps: minedToSteps,
    toMermaid: toMermaid, minedToMermaid: minedToMermaid, improvements: improvements, raci: raci, sopData: sopData,
    sopMarkdown: sopMarkdown, sopHtml: sopHtml, totalMinutes: totalMinutes,
    SAMPLE_STEPS: SAMPLE_STEPS, SAMPLE_VTT: SAMPLE_VTT, SAMPLE_LOG: SAMPLE_LOG
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.ProcessMapperLib = L;
})(this);
