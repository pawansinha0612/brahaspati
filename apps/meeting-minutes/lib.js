/* Meeting Minutes — pure logic: transcript parsing, extraction, due dates, Markdown/email/.ics output. No DOM. */
(function (root) {
  'use strict';

  var DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var NOT_NAMES = /^(note|notes|action|actions|action item|decision|decisions|todo|to do|agenda|date|time|attendees|present|apologies|subject|re|summary|minutes|meeting|question|risk|next steps|ai|q|a|http|https|warning|error|info|update|updates|item|items|location|where|when|owner|due|re|cc|to|from)$/i;

  // ---------- time helpers ----------
  function toSeconds(ts) {
    if (!ts) return null;
    var m = String(ts).trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
    if (!m) return null;
    return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (m[4] ? +('0.' + m[4]) : 0);
  }
  function fmtDuration(sec) {
    sec = Math.round(sec || 0); var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? h + 'h ' + m + 'm' : m ? m + 'm ' + (s < 10 ? '0' : '') + s + 's' : s + 's';
  }
  function validName(n) {
    n = String(n || '').trim();
    if (!n || n.length > 40 || NOT_NAMES.test(n)) return false;
    if (!/^[A-Z\u00C0-\u024F@][\w.'\u00C0-\u024F-]*(?:\s+[\w.'()\u00C0-\u024F-]+){0,3}$/.test(n)) return false;
    return !/\d{2}/.test(n);
  }
  function cleanName(n) { return String(n).replace(/\s*\((?:guest|external|host|she\/her|he\/him|they\/them)\)\s*$/i, '').replace(/^@/, '').trim(); }

  // ---------- parsing ----------
  // returns { format, utterances: [{speaker, text, start, end}] }
  function parse(text) {
    var t = String(text == null ? '' : text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    var lines = t.split('\n'), out = [], fmt = 'plain';
    var TIMING = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)/;
    if (/^WEBVTT/.test(t.trim()) || lines.some(function (l) { return TIMING.test(l); })) {
      fmt = /^WEBVTT/.test(t.trim()) ? 'vtt' : 'srt';
      for (var i = 0; i < lines.length; i++) {
        var m = lines[i].match(TIMING); if (!m) continue;
        var start = toSeconds(m[1]), end = toSeconds(m[2]), body = [];
        for (i++; i < lines.length && lines[i].trim() !== '' && !TIMING.test(lines[i]); i++) body.push(lines[i]);
        // a bare cue number right before the next timing line belongs to the next cue (SRT)
        if (body.length > 1 && /^\d+$/.test(body[body.length - 1].trim()) && TIMING.test(lines[i] || '')) body.pop();
        i--;
        var txt = body.join(' ').trim(), speaker = null, v;
        if ((v = txt.match(/^<v(?:\.[\w.-]+)?\s+([^>]+)>([\s\S]*?)(?:<\/v>)?$/))) { speaker = cleanName(v[1]); txt = v[2]; }
        else if ((v = txt.match(/^([^:]{1,40}):\s+(.+)$/)) && validName(v[1])) { speaker = cleanName(v[1]); txt = v[2]; }
        txt = txt.replace(/<[^>]+>/g, '').trim();
        if (!txt) continue;
        var prev = out[out.length - 1];
        if (prev && prev.speaker === speaker && speaker && start - prev.end < 2) { prev.text += ' ' + txt; prev.end = end; }
        else out.push({ speaker: speaker, text: txt, start: start, end: end });
      }
      return { format: fmt, utterances: out };
    }
    var TS = '\\[?((?:\\d{1,2}:)?\\d{1,2}:\\d{2}(?:\\s?[AaPp][Mm])?)\\]?';
    var inline = new RegExp('^\\s*(?:' + TS + '\\s*[-–]?\\s*)?([^:\\[\\]]{1,40}?)\\s*(?:\\(' + '((?:\\d{1,2}:)?\\d{1,2}:\\d{2})' + '\\))?\\s*:\\s+(.+)$');
    var header = new RegExp('^\\s*(?:' + TS + '\\s+)?([^:\\[\\]\\d][^:\\[\\]]{0,39}?)\\s*(?:' + TS + ')?\\s*$');
    var cur = null, sawSpeaker = false;
    for (var j = 0; j < lines.length; j++) {
      var line = lines[j], s = line.trim(); if (!s) { cur = cur && cur.speaker ? cur : null; continue; }
      var a = s.match(inline);
      if (a && validName(a[2]) && !/^(https?|ftp)$/i.test(a[2])) {
        var sp = cleanName(a[2]); sawSpeaker = true;
        cur = { speaker: sp, text: a[4].trim(), start: toSeconds(stripAmPm(a[1] || a[3])), end: null };
        out.push(cur); continue;
      }
      // Teams/Otter style: "Name  0:05" (or "[10:02 AM] Name") on its own line, words on following lines
      var hd = s.match(header), next = (lines[j + 1] || '').trim();
      var nh = next.match(header);
      if (hd && (hd[1] || hd[3]) && validName(hd[2]) && next && !(nh && (nh[1] || nh[3]))) {
        cur = { speaker: cleanName(hd[2]), text: '', start: toSeconds(stripAmPm(hd[1] || hd[3])), end: null }; out.push(cur); sawSpeaker = true; continue;
      }
      var bullet = s.replace(/^(?:[-*•–]|\d+[.)])\s+/, '');
      if (cur && cur.speaker && !/^(?:[-*•–]|\d+[.)])\s+/.test(s)) { cur.text += (cur.text ? ' ' : '') + s; continue; }
      cur = { speaker: null, text: bullet, start: null, end: null }; out.push(cur);
    }
    out = out.filter(function (u) { return u.text.trim(); });
    // fill end times from the next start
    for (var k = 0; k < out.length; k++) if (out[k].start != null && out[k].end == null) { var nx = out.slice(k + 1).filter(function (u) { return u.start != null; })[0]; if (nx && nx.start >= out[k].start) out[k].end = nx.start; }
    return { format: sawSpeaker ? 'speakers' : 'plain', utterances: out };
  }
  function stripAmPm(ts) {
    if (!ts) return ts; var m = String(ts).match(/^(\d{1,2}):(\d{2})\s?([AaPp])[Mm]$/);
    if (!m) return ts; var h = +m[1] % 12 + (/p/i.test(m[3]) ? 12 : 0); return h + ':' + m[2] + ':00';
  }

  // ---------- sentences ----------
  function sentences(text) {
    return String(text).replace(/\s+/g, ' ').match(/(?:[^.!?]|[.!?](?!\s|$))+(?:[.!?]+(?=\s|$)|$)/g) || [];
  }
  function tidy(s) { return s.replace(/^\s*(?:(?:ok(?:ay)?|so|yeah|yep|right|um+|uh+|and|but|well|alright|great|cool|sure)[,.]?\s+)+/i, '').trim().replace(/^./, function (c) { return c.toUpperCase(); }); }

  // ---------- dates ----------
  function parseISO(d) { var m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3])) : null; }
  function iso(d) { return d ? d.toISOString().slice(0, 10) : ''; }
  function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }
  // Next given weekday strictly after d
  function nextDow(d, dow) { var diff = (dow - d.getUTCDay() + 7) % 7; return addDays(d, diff === 0 ? 7 : diff); }
  function mondayOf(d) { return addDays(d, -((d.getUTCDay() + 6) % 7)); }

  // Finds a due-date phrase in text, resolved against the meeting date (YYYY-MM-DD). -> {date, phrase} or null
  function resolveDue(text, meetingDate) {
    var base = parseISO(meetingDate) || parseISO(iso(new Date())), s = ' ' + String(text).toLowerCase() + ' ', m;
    function r(date, phrase) { return { date: iso(date), phrase: phrase }; }
    if ((m = s.match(/\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/))) {
      var y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : base.getUTCFullYear(), dt = new Date(Date.UTC(y, m[2] - 1, +m[1]));
      if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) { if (!m[3] && dt < base) dt = new Date(Date.UTC(y + 1, m[2] - 1, +m[1])); return r(dt, m[0].trim()); }
    }
    var mon = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
    if ((m = s.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + mon + '\\b')))) return monthDay(+m[1], m[2], m[0]);
    if ((m = s.match(new RegExp('\\b' + mon + '\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b')))) return monthDay(+m[2], m[1], m[0]);
    function monthDay(day, mo, phrase) { var mi = MONTHS.indexOf(mo.slice(0, 3)), d = new Date(Date.UTC(base.getUTCFullYear(), mi, day)); if (d < base) d = new Date(Date.UTC(base.getUTCFullYear() + 1, mi, day)); return r(d, phrase.trim()); }
    if ((m = s.match(/\b(eod|e\.o\.d\.?|end of (?:the )?day|cob|close of business|today|tonight|this afternoon|this arvo|asap)\b/))) return r(base, m[1]);
    if ((m = s.match(/\b(tomorrow|tmrw)\b/))) return r(addDays(base, 1), m[1]);
    if ((m = s.match(/\bday after tomorrow\b/))) return r(addDays(base, 2), m[0]);
    if ((m = s.match(/\bin (\d+|a|one|two|three|four) (day|week)s?\b/))) { var n = { a: 1, one: 1, two: 2, three: 3, four: 4 }[m[1]] || +m[1]; return r(addDays(base, n * (m[2] === 'week' ? 7 : 1)), m[0].trim()); }
    if ((m = s.match(/\bnext (monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/))) {
      var di = dayIndex(m[1]); return r(addDays(mondayOf(base), 7 + (di + 6) % 7), m[0]);
    }
    if ((m = s.match(/\b(?:by|on|before|this|until|due|from)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)\b/))) {
      // avoid "sat" as in "we sat down", "sun", "wed" as words: require the full name or a preceding by/on/this
      if (m[1].length > 3 || /\b(by|on|before|this|until|due)\s/.test(m[0])) return r(nextDow(base, dayIndex(m[1])), m[0].trim());
    }
    if ((m = s.match(/\b(end of (?:the |this )?week|eow|by the weekend)\b/))) { var f = base.getUTCDay() === 5 ? base : nextDow(base, 5); return r(f, m[1]); }
    if ((m = s.match(/\b(next week)\b/))) return r(addDays(mondayOf(base), 11), m[1]);
    if ((m = s.match(/\b(end of (?:the |this )?month|eom)\b/))) return r(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)), m[1]);
    if ((m = s.match(/\b(next month)\b/))) return r(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 2, 0)), m[1]);
    return null;
  }
  function dayIndex(w) { w = w.slice(0, 3); for (var i = 0; i < 7; i++) if (DAYS[i].slice(0, 3) === w) return i; return -1; }

  // ---------- extraction ----------
  var DECISION = /\b(we(?:'ll| will) go with|let'?s go with|going with|we(?:'ve| have)? agreed|agreed|we agree|(?:we )?decided|decision(?: is|:)|we(?:'ll| will) use|we(?:'re| are) going to use|let'?s|signed off|sign-off|approved|final call|we(?:'ll| will) stick with|settled on)\b/i;
  var RISK = /\b(risks?|blockers?|blocked|blocking|concerns?|concerned|worried|worry|might slip|could slip|slipping|delay(?:ed|s)?|behind schedule|at risk|dependenc(?:y|ies)|depends on|bottleneck|tight deadline|won'?t make|not going to make|problem|issue with)\b/i;
  var ACTION_SELF = /\b(I(?:'ll| will| can| am going to|'m going to| shall| need to| have to|'ll need to| should|'ll have to)|I'm on it|leave it with me|I'll take (?:that|this))\b/i;
  var ACTION_GENERIC = /\b(we need to|we should|need to|needs to|someone (?:should|needs to|has to)|to-?do|follow up on|action:)\b/i;
  var NOT_ACTION = /\b(I(?:'ll| will) (?:be honest|admit|say|just say|tell you|be quick)|I can see|I can hear|I can't hear|I think|I guess)\b/i;

  function findOwner(sent, speaker, people) {
    var m, peopleRe = people.length ? people.map(function (p) { return p.split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') : null;
    if ((m = sent.match(/@([A-Z][\w.-]*(?:\s[A-Z][\w-]*)?)/))) return matchPerson(m[1], people);
    if ((m = sent.match(/^\s*(?:action|todo|ai)\s*(?:item)?\s*[:\-–]\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*(?:to|will|[:\-–])\s/i))) return matchPerson(m[1], people);
    if ((m = sent.match(/\b([A-Z][a-z]+),?\s+(?:can|could|would) you\b/)) && !/^(So|And|But|Okay|Ok|Then|Also|Maybe)$/.test(m[1])) return matchPerson(m[1], people);
    if ((m = sent.match(/\b(?:can|could|would) you\b[^?]*?,\s*([A-Z][a-z]+)\s*\??$/))) return matchPerson(m[1], people);
    if ((m = sent.match(/^\s*([A-Z][a-z]+),?\s+please\s+\w/)) && !/^(So|And|But|Okay|Ok|Then|Also|Maybe|Yes|No|Hi|Hey|Thanks)$/.test(m[1])) return matchPerson(m[1], people);
    if (peopleRe && (m = sent.match(new RegExp('\\b(' + peopleRe + ')(?:\\s[A-Z][a-z]+)?\\s+(?:will|is going to|to|can|has to|needs to|should|is on|takes)\\b')))) return matchPerson(m[1], people);
    if ((m = sent.match(/\b([A-Z][a-z]+)\s+(?:will|is going to)\s+(?!be\b)/)) && !/^(It|This|That|There|We|They|He|She|Who|Which|What|Everyone|Nobody|Someone|Everything|The)$/.test(m[1]) && sent.indexOf(m[0]) > 0) return matchPerson(m[1], people);
    if (ACTION_SELF.test(sent) && !NOT_ACTION.test(sent)) return speaker || 'Me';
    return null;
  }
  function matchPerson(n, people) {
    n = cleanName(n); var low = n.toLowerCase();
    for (var i = 0; i < people.length; i++) if (people[i].toLowerCase() === low || people[i].toLowerCase().split(' ')[0] === low.split(' ')[0]) return people[i];
    return n;
  }

  function extract(text, meetingDate) {
    var parsed = parse(text), utt = parsed.utterances;
    var speakers = []; utt.forEach(function (u) { if (u.speaker && speakers.indexOf(u.speaker) < 0) speakers.push(u.speaker); });
    var listed = []; utt.forEach(function (u) { var m = u.text.match(/^(?:attendees|present|participants)\s*[:\-]\s*(.+)$/i); if (m) m[1].split(/\s*(?:,|;|\band\b)\s*/).forEach(function (n) { n = n.trim(); if (n && listed.indexOf(n) < 0) listed.push(n); }); });
    var attendees = speakers.slice(); listed.forEach(function (n) { if (!attendees.some(function (a) { return a.toLowerCase() === n.toLowerCase(); })) attendees.push(n); });

    var decisions = [], actions = [], questions = [], risks = [], numbers = [], seen = {};
    function once(kind, s) { var k = kind + '|' + s.toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; }

    utt.forEach(function (u, ui) {
      if (/^(?:attendees|present|participants)\s*[:\-]/i.test(u.text)) return;
      var explicitDecision = /^\s*(?:decision|decided|agreed)\s*[:\-–]\s*/i.test(u.text), explicitAction = /^\s*(?:action(?: item)?s?|todo|to do|ai)\s*[:\-–]\s*/i.test(u.text);
      var explicitQ = /^\s*(?:question|q|open question)\s*[:\-–]\s*/i.test(u.text), explicitRisk = /^\s*(?:risks?|blockers?|issues?)\s*[:\-–]\s*/i.test(u.text);
      var sents = explicitAction || explicitDecision || explicitQ || explicitRisk ? [u.text] : sentences(u.text);
      sents.forEach(function (raw) {
        var s = raw.trim(); if (!s) return;
        var clean = tidy(s.replace(/^\s*(?:decision|decided|agreed|action(?: item)?s?|todo|to do|ai|question|q|open question|risks?|blockers?|issues?)\s*[:\-–]\s*/i, ''));
        var isQ = /\?\s*$/.test(s) || explicitQ;
        var nm, nre = /(?:[$€£]\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|million|thousand|bn)?|\b\d[\d,]*(?:\.\d+)?\s?(?:%|percent|per cent|k\b|users|customers|people|days|weeks|hours|hrs|minutes|mins|sprints|tickets|bugs|orders|dollars|aud|usd|ms|seconds|gb|mb|tb))/gi;
        while ((nm = nre.exec(s))) { var val = nm[0].trim(); if (once('n', val + '|' + clean)) numbers.push({ value: val, context: clean, speaker: u.speaker }); }
        var owner = findOwner(s, u.speaker, attendees);
        var askQ = /\b(?:can|could|would) you\b/i.test(s);
        // actions
        if (explicitAction || askQ || (owner && !(isQ && !askQ)) || (ACTION_GENERIC.test(s) && !isQ)) {
          if (!(NOT_ACTION.test(s) && !explicitAction) && clean.split(' ').length >= 3) {
            var who = owner;
            if (!who && askQ) { var nx = utt[ui + 1]; if (nx && nx.speaker && nx.speaker !== u.speaker && /^(?:yes|yep|yeah|sure|will do|on it|ok|okay|no worries|can do|I(?:'ll| will| can))/i.test(nx.text.trim())) who = nx.speaker; }
            var due = resolveDue(s, meetingDate);
            if (once('a', clean)) actions.push({ owner: who || 'Unassigned', task: clean.replace(/\?$/, '.'), due: due ? due.date : '', dueText: due ? due.phrase : '', speaker: u.speaker, at: u.start });
            if (!askQ || explicitAction) return;
          }
        }
        if (explicitDecision || (DECISION.test(s) && !isQ)) { if (once('d', clean)) decisions.push({ text: clean, speaker: u.speaker }); return; }
        if (isQ && !askQ) {
          var answered = false, nxt = utt[ui + 1];
          if (!explicitQ && s === sents[sents.length - 1].trim() && nxt && nxt.speaker && nxt.speaker !== u.speaker && !/\?\s*$/.test(nxt.text) && !/\b(not sure|don'?t know|no idea|tbd|to be confirmed|check|find out|get back to you|good question|unclear|let me look)\b/i.test(nxt.text)) answered = true;
          if (!answered && clean.split(' ').length >= 3 && once('q', clean)) questions.push({ text: clean, speaker: u.speaker });
        }
        if (explicitRisk || RISK.test(s)) { if (once('r', clean)) risks.push({ text: clean, speaker: u.speaker }); }
      });
    });

    // talk time
    var stats = {}, totalWords = 0, totalSec = 0;
    utt.forEach(function (u) {
      var k = u.speaker || '(no speaker)', w = u.text.split(/\s+/).filter(Boolean).length;
      stats[k] = stats[k] || { speaker: k, words: 0, turns: 0, seconds: 0 };
      stats[k].words += w; stats[k].turns++; totalWords += w;
      if (u.start != null && u.end != null && u.end > u.start) { stats[k].seconds += u.end - u.start; totalSec += u.end - u.start; }
    });
    var talk = Object.keys(stats).map(function (k) { var s = stats[k]; s.share = totalWords ? s.words / totalWords : 0; s.timeShare = totalSec ? s.seconds / totalSec : null; return s; })
      .sort(function (a, b) { return b.words - a.words; });
    var times = utt.filter(function (u) { return u.start != null; }), dur = null;
    if (times.length) { var last = times[times.length - 1]; dur = (last.end || last.start) - times[0].start; }
    return { format: parsed.format, utterances: utt, attendees: attendees, decisions: decisions, actions: actions, questions: questions, risks: risks, numbers: numbers, talk: talk, duration: dur, meetingDate: meetingDate || '' };
  }

  // ---------- output ----------
  function niceDate(isoStr) {
    var d = parseISO(isoStr); if (!d) return isoStr || '';
    return DAYS[d.getUTCDay()].charAt(0).toUpperCase() + DAYS[d.getUTCDay()].slice(1, 3) + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()].charAt(0).toUpperCase() + MONTHS[d.getUTCMonth()].slice(1) + ' ' + d.getUTCFullYear();
  }
  function toMarkdown(min, title) {
    title = title || 'Meeting minutes';
    var o = ['# ' + title, ''];
    if (min.meetingDate) o.push('**Date:** ' + niceDate(min.meetingDate) + (min.duration ? ' · **Length:** ' + fmtDuration(min.duration) : '')); o.push('');
    if (min.attendees.length) o.push('**Attendees:** ' + min.attendees.join(', '));
    o.push('');
    function sec(h, items, fmt) { o.push('## ' + h); if (!items.length) o.push('_None noted._'); else items.forEach(function (x) { o.push(fmt(x)); }); o.push(''); }
    sec('Decisions', min.decisions, function (d) { return '- ' + d.text; });
    o.push('## Action items');
    if (!min.actions.length) o.push('_None noted._');
    else { o.push('| Owner | Action | Due |', '| --- | --- | --- |'); min.actions.forEach(function (a) { o.push('| ' + mdCell(a.owner) + ' | ' + mdCell(a.task) + ' | ' + (a.due ? niceDate(a.due) : '—') + ' |'); }); }
    o.push('');
    sec('Open questions', min.questions, function (q) { return '- ' + q.text + (q.speaker ? ' _(' + q.speaker + ')_' : ''); });
    sec('Risks and blockers', min.risks, function (r) { return '- ' + r.text; });
    if (min.numbers.length) sec('Key numbers', min.numbers, function (n) { return '- **' + n.value + '** — ' + n.context; });
    return o.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  function mdCell(s) { return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' '); }
  function toEmail(min, title) {
    title = title || 'Meeting minutes';
    var o = ['Hi all,', '', 'Here are the notes from ' + (min.meetingDate ? 'our meeting on ' + niceDate(min.meetingDate) : 'today’s meeting') + '.', ''];
    if (min.attendees.length) o.push('Attendees: ' + min.attendees.join(', '), '');
    function list(h, items, fmt) { if (!items.length) return; o.push(h.toUpperCase()); items.forEach(function (x, i) { o.push((i + 1) + '. ' + fmt(x)); }); o.push(''); }
    list('Decisions', min.decisions, function (d) { return d.text; });
    list('Action items', min.actions, function (a) { return a.owner + ' — ' + a.task + (a.due ? ' (due ' + niceDate(a.due) + ')' : ''); });
    list('Open questions', min.questions, function (q) { return q.text; });
    list('Risks and blockers', min.risks, function (r) { return r.text; });
    o.push('Let me know if I’ve missed or misheard anything.', '', 'Thanks');
    return { subject: title + (min.meetingDate ? ' — ' + niceDate(min.meetingDate) : ''), body: o.join('\n') };
  }
  function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) { var out = [], i = 0; while (line.length - i > 74) { out.push((i ? ' ' : '') + line.slice(i, i + (i ? 73 : 74))); i += i ? 73 : 74; } out.push((i ? ' ' : '') + line.slice(i)); return out.join('\r\n'); }
  function toICS(actions, title, stamp) {
    var now = stamp || new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Brahaspati//Meeting Minutes//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    actions.filter(function (a) { return a.due; }).forEach(function (a, i) {
      var d = a.due.replace(/-/g, ''), nd = iso(addDays(parseISO(a.due), 1)).replace(/-/g, '');
      lines.push('BEGIN:VEVENT', 'UID:' + d + '-' + i + '-' + Math.abs(hash(a.task)) + '@brahaspati', 'DTSTAMP:' + now, 'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + nd,
        fold('SUMMARY:' + icsEscape('Action: ' + a.task.slice(0, 120) + (a.owner && a.owner !== 'Unassigned' ? ' (' + a.owner + ')' : ''))),
        fold('DESCRIPTION:' + icsEscape('From ' + (title || 'meeting minutes') + '. Owner: ' + a.owner + '.\n' + a.task)), 'TRANSP:TRANSPARENT', 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  // =====================================================================
  // Decision tracker: a library of meetings, actions tracked across them
  // =====================================================================
  var STATUSES = ['open', 'done', 'blocked', 'dropped'];
  var TSTOP = /^(the|a|an|and|or|to|of|for|on|in|at|by|with|from|is|be|will|i|we|you|it|this|that|please|can|could|would|should|need|needs|send|get|do|make|by|next|week|friday|monday|tuesday|wednesday|thursday|today|tomorrow|eod|end|our|my|your|their|up|out|over|again|also|still|then|sure|so)$/i;
  function tokens(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2 && !TSTOP.test(w); }).map(function (w) { return w.replace(/(ing|ed|es|s)$/, '').slice(0, 6); }); }
  // 0..1 overlap of the meaningful words in two action texts
  function similarity(a, b) {
    var A = tokens(a), Bt = tokens(b); if (!A.length || !Bt.length) return 0;
    var sa = {}, sb = {}; A.forEach(function (w) { sa[w] = 1; }); Bt.forEach(function (w) { sb[w] = 1; });
    var inter = Object.keys(sa).filter(function (w) { return sb[w]; }).length, uni = Object.keys(Object.assign({}, sa, sb)).length;
    var small = Math.min(Object.keys(sa).length, Object.keys(sb).length);
    return Math.max(inter / uni, small >= 2 ? inter / small * 0.85 : 0);
  }
  function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  // Make a library entry from extract() output (after your edits)
  function toEntry(min, opts) {
    opts = opts || {};
    return {
      id: opts.id || rid(), title: opts.title || 'Meeting', date: opts.date || min.meetingDate || iso(new Date()), savedAt: new Date().toISOString(),
      transcript: String(opts.transcript || '').slice(0, 100000), attendees: (min.attendees || []).slice(),
      decisions: (min.decisions || []).map(function (d) { return { id: rid(), text: d.text, speaker: d.speaker || null }; }),
      actions: (min.actions || []).filter(function (a) { return String(a.task || '').trim(); }).map(function (a) { return { id: rid(), owner: a.owner || 'Unassigned', task: a.task, due: a.due || '', status: a.status || 'open' }; }),
      questions: (min.questions || []).map(function (q) { return q.text; }), risks: (min.risks || []).map(function (r) { return r.text; })
    };
  }
  // Saving the same meeting again (same title and date) replaces it but keeps statuses you set
  function upsertMeeting(library, entry) {
    var lib = (library || []).slice(), i = lib.findIndex(function (m) { return m.title.toLowerCase() === entry.title.toLowerCase() && m.date === entry.date; });
    if (i >= 0) {
      var old = lib[i];
      entry.id = old.id;
      entry.actions.forEach(function (a) { var o = old.actions.filter(function (x) { return similarity(x.task, a.task) >= 0.8; })[0]; if (o) { a.status = o.status; a.id = o.id; } });
      lib[i] = entry;
    } else lib.push(entry);
    return lib.sort(function (a, b) { return a.date.localeCompare(b.date) || String(a.savedAt).localeCompare(String(b.savedAt)); });
  }
  function samePerson(a, b) {
    a = String(a || '').toLowerCase(); b = String(b || '').toLowerCase();
    if (!a || !b || a === 'unassigned' || b === 'unassigned') return true;
    return a === b || a.split(' ')[0] === b.split(' ')[0];
  }
  // -> [{key, task, owner, due, status, overdue, carried, meetings:[{id,title,date}], refs:[{meetingId, actionId}], firstSeen, lastSeen}]
  function buildTracker(library, today) {
    today = today || iso(new Date());
    var items = [];
    (library || []).slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (m) {
      m.actions.forEach(function (a) {
        var best = null, bestS = 0;
        items.forEach(function (it) {
          if (it.meetings.some(function (x) { return x.id === m.id; })) return; // not the same meeting twice
          var s = similarity(it.task, a.task), need = samePerson(it.owner, a.owner) ? 0.5 : 0.75;
          if (s >= need && s > bestS) { best = it; bestS = s; }
        });
        if (best) {
          best.meetings.push({ id: m.id, title: m.title, date: m.date }); best.refs.push({ meetingId: m.id, actionId: a.id });
          best.task = a.task; if (a.owner && a.owner !== 'Unassigned' && !(samePerson(best.owner, a.owner) && best.owner.length > a.owner.length)) best.owner = a.owner; if (a.due) best.due = a.due;
          best.status = a.status || 'open'; best.lastSeen = m.date;
        } else items.push({ key: a.id, task: a.task, owner: a.owner || 'Unassigned', due: a.due || '', status: a.status || 'open', meetings: [{ id: m.id, title: m.title, date: m.date }], refs: [{ meetingId: m.id, actionId: a.id }], firstSeen: m.date, lastSeen: m.date });
      });
    });
    items.forEach(function (it) { it.carried = it.meetings.length - 1; it.overdue = (it.status === 'open' || it.status === 'blocked') && !!it.due && it.due < today; it.daysOverdue = it.overdue ? Math.round((parseISO(today) - parseISO(it.due)) / 86400000) : 0; });
    var rank = { blocked: 0, open: 1, done: 2, dropped: 3 };
    return items.sort(function (a, b) { return (b.overdue - a.overdue) || rank[a.status] - rank[b.status] || (a.due || '9999').localeCompare(b.due || '9999'); });
  }
  // Change status of a tracked item everywhere it appears. Returns a new library.
  function setStatus(library, item, status) {
    if (STATUSES.indexOf(status) < 0) return library;
    return library.map(function (m) {
      if (!item.refs.some(function (r) { return r.meetingId === m.id; })) return m;
      var c = Object.assign({}, m); c.actions = m.actions.map(function (a) { return item.refs.some(function (r) { return r.actionId === a.id; }) ? Object.assign({}, a, { status: status }) : a; }); return c;
    });
  }
  function updateAction(library, item, fields) {
    return library.map(function (m) {
      var c = Object.assign({}, m); c.actions = m.actions.map(function (a) { return item.refs.some(function (r) { return r.actionId === a.id; }) ? Object.assign({}, a, fields) : a; }); return c;
    });
  }
  function byPerson(items) {
    var out = {};
    items.forEach(function (it) { var k = it.owner || 'Unassigned'; (out[k] = out[k] || { owner: k, items: [], open: 0, overdue: 0, done: 0, blocked: 0 }).items.push(it); var p = out[k]; if (it.status === 'open') p.open++; if (it.status === 'blocked') p.blocked++; if (it.status === 'done') p.done++; if (it.overdue) p.overdue++; });
    return Object.keys(out).map(function (k) { return out[k]; }).sort(function (a, b) { return (b.overdue - a.overdue) || (b.open + b.blocked) - (a.open + a.blocked) || a.owner.localeCompare(b.owner); });
  }
  function decisionLog(library, query) {
    var q = String(query || '').toLowerCase().split(/\s+/).filter(Boolean), out = [];
    (library || []).forEach(function (m) { m.decisions.forEach(function (d) { out.push({ text: d.text, speaker: d.speaker, meeting: m.title, date: m.date, meetingId: m.id }); }); });
    return out.filter(function (d) { var hay = (d.text + ' ' + d.meeting + ' ' + (d.speaker || '')).toLowerCase(); return q.every(function (w) { return hay.indexOf(w) >= 0; }); })
      .sort(function (a, b) { return b.date.localeCompare(a.date); });
  }
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function trackerCSV(items) {
    return ['Owner,Action,Due,Status,Overdue,Times raised,First raised,Last raised,Meetings'].concat(items.map(function (it) {
      return [it.owner, it.task, it.due, it.status, it.overdue ? 'yes' : '', it.meetings.length, it.firstSeen, it.lastSeen, it.meetings.map(function (m) { return m.date + ' ' + m.title; }).join('; ')].map(csvCell).join(',');
    })).join('\r\n') + '\r\n';
  }
  function decisionsCSV(decs) { return ['Date,Meeting,Decision,Said by'].concat(decs.map(function (d) { return [d.date, d.meeting, d.text, d.speaker || ''].map(csvCell).join(','); })).join('\r\n') + '\r\n'; }
  function trackerMarkdown(items, decs, today) {
    var o = ['# Action and decision tracker', '', '_As at ' + niceDate(today || iso(new Date())) + '_', '', '## Actions', ''];
    if (!items.length) o.push('_None._');
    else { o.push('| Owner | Action | Due | Status | Raised |', '| --- | --- | --- | --- | --- |'); items.forEach(function (it) { o.push('| ' + mdCell(it.owner) + ' | ' + mdCell(it.task) + ' | ' + (it.due ? niceDate(it.due) : '—') + (it.overdue ? ' ⚠️ overdue' : '') + ' | ' + it.status + ' | ' + it.meetings.length + (it.carried ? '× (carried over)' : '×') + ' |'); }); }
    o.push('', '## Decisions', '');
    if (!decs.length) o.push('_None._'); else decs.forEach(function (d) { o.push('- **' + niceDate(d.date) + '** (' + d.meeting + '): ' + d.text); });
    return o.join('\n') + '\n';
  }
  // Pre-meeting agenda from what's still open
  function agenda(items, library, opts) {
    opts = opts || {}; var today = opts.date || iso(new Date());
    var open = items.filter(function (it) { return it.status === 'open' || it.status === 'blocked'; });
    var overdue = open.filter(function (it) { return it.overdue; }), blocked = open.filter(function (it) { return it.status === 'blocked'; });
    var carried = open.filter(function (it) { return it.carried >= 1 && !it.overdue && it.status !== 'blocked'; });
    var rest = open.filter(function (it) { return overdue.indexOf(it) < 0 && blocked.indexOf(it) < 0 && carried.indexOf(it) < 0; });
    var last = (library || []).slice().sort(function (a, b) { return b.date.localeCompare(a.date); })[0];
    var o = ['# ' + (opts.title || 'Agenda'), '', '**Date:** ' + niceDate(today), ''], n = 1;
    function sec(h, list, fmt) { if (!list.length) return; o.push('## ' + (n++) + '. ' + h); list.forEach(function (x) { o.push('- ' + fmt(x)); }); o.push(''); }
    var who = function (it) { return it.owner + ' — ' + it.task + (it.due ? ' (due ' + niceDate(it.due) + ')' : ''); };
    sec('Overdue actions — what’s in the way?', overdue, function (it) { return who(it) + ' — ' + it.daysOverdue + ' day' + (it.daysOverdue === 1 ? '' : 's') + ' late'; });
    sec('Blocked — what do we need to unblock?', blocked, who);
    sec('Carried over from earlier meetings — keep, change or drop?', carried, function (it) { return who(it) + ' — raised ' + it.meetings.length + ' times since ' + niceDate(it.firstSeen); });
    sec('Open actions — quick updates', rest, who);
    if (last && last.questions && last.questions.length) sec('Open questions from ' + last.title + ' (' + niceDate(last.date) + ')', last.questions, function (q) { return q; });
    if (last && last.risks && last.risks.length) sec('Risks to check', last.risks, function (r) { return r; });
    o.push('## ' + (n++) + '. New business', '- ', '', '## ' + n + '. Decisions and actions from today', '- ');
    return o.join('\n') + '\n';
  }

  var L = { STATUSES: STATUSES, similarity: similarity, toEntry: toEntry, upsertMeeting: upsertMeeting, buildTracker: buildTracker, setStatus: setStatus, updateAction: updateAction, byPerson: byPerson, decisionLog: decisionLog, trackerCSV: trackerCSV, decisionsCSV: decisionsCSV, trackerMarkdown: trackerMarkdown, agenda: agenda,
    parse: parse, sentences: sentences, resolveDue: resolveDue, extract: extract, toMarkdown: toMarkdown, toEmail: toEmail, toICS: toICS, fmtDuration: fmtDuration, niceDate: niceDate, toSeconds: toSeconds };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.MinutesLib = L;
})(this);
