/* Tender Response Assistant — pure logic: requirement extraction, evaluation criteria, submission details and key dates,
   compliance matrix, page/word budgets, content-library matching, draft assembly, go/no-go and final checklist. No DOM. */
(function (root) {
  'use strict';

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clean(s) { return String(s || '').replace(/\u00a0/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\r/g, ''); }

  // ---------- clauses ----------
  var CLAUSE_NO = /^\s*((?:\d+\.)+\d*|\d+\)|\([a-z]{1,3}\)|[a-z]\)|[A-Z]\d+(?:\.\d+)*)\s+/;
  // Split text into clause-ish units, remembering the nearest clause number and heading.
  function clauses(text) {
    var lines = clean(text).split('\n'), out = [], ref = '', section = '', buf = '', bufRef = '';
    function flush() { if (buf.trim()) out.push({ ref: bufRef, section: section, text: buf.replace(/\s+/g, ' ').trim() }); buf = ''; }
    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) { flush(); return; }
      var m = line.match(CLAUSE_NO);
      var isHeading = line.length < 70 && !/[.;:,]$/.test(line) && !/\b(must|shall|should|will|may)\b/i.test(line) && /^[\dA-Z(]/.test(line) && line.split(' ').length <= 9;
      if (m) {
        flush(); var num = m[1];
        if (/^\(|^[a-z]\)/.test(num) && ref) bufRef = ref.replace(/\s*\(.*$/, '') + ' ' + num.replace(/\)$/, ')').replace(/^([a-z])\)$/, '($1)');
        else { ref = num.replace(/\.$/, ''); bufRef = ref; }
        var rest = line.slice(m[0].length);
        if (!/^\(|^[a-z]\)/.test(num) && /^[A-Z]/.test(rest) && !/[.;:,]$/.test(rest) && !/\b(must|shall|should|will|may)\b/i.test(rest) && rest.split(' ').length <= 8) { section = rest; return; }
        buf = rest; return;
      }
      var top = line.match(/^(\d{1,2})\s+([A-Z].*)$/);
      if (top && isHeading) { flush(); ref = top[1]; section = top[2]; return; }
      if (isHeading && !buf) { section = line; return; }
      if (/^[•\-*▪◦·]\s+/.test(line)) { flush(); bufRef = ref; buf = line.replace(/^[•\-*▪◦·]\s+/, ''); return; }
      if (!buf) bufRef = ref;
      buf += ' ' + line;
    });
    flush();
    return out;
  }
  function sentences(s) {
    return s.replace(/\b(e\.g|i\.e|etc|incl|approx|no|cl|pt|Pty|Ltd|vs)\./gi, function (m) { return m.replace('.', '§'); })
      .replace(/([.!?])\s+(?=[A-Z(])/g, '$1\u0001').split('\u0001').map(function (x) { return x.replace(/§/g, '.').trim(); }).filter(Boolean);
  }

  // ---------- requirements ----------
  var MANDATORY = /\b(must(?! not be read)|shall|is required to|are required to|required to|is mandatory|are mandatory|mandatory|will be required|needs? to|is a condition|minimum requirement)\b/i;
  var DESIRABLE = /\b(should|desirable|is desired|preferred|preference will be given|may wish to|are encouraged|is encouraged|ideally|highly regarded|advantageous|may)\b/i;
  var TENDERER = /\b(tenderers?|respondents?|suppliers?|contractors?|offerors?|proponents?|bidders?|you|your|the response|responses|the tender|tenders|submissions?|proposals?|service provider|successful (?:tenderer|respondent|supplier))\b/i;
  var BUYER_SUBJECT = /^(?:the\s+)?(principal|buyer|purchaser|agency|council|department|customer|client|state|commonwealth|evaluation panel|panel|we|our|organisation|company|authority)\b/i;
  function level(s) {
    s = s.replace(/\bnon[- ]mandatory\b|\bnot mandatory\b|\bnot required\b|\boptional\b/gi, ' ');
    if (/\bmust not\b|\bshall not\b/i.test(s)) return 'mandatory';
    if (MANDATORY.test(s)) return 'mandatory';
    if (DESIRABLE.test(s)) return 'desirable';
    return null;
  }
  function isRequirement(s) {
    var lv = level(s); if (!lv) return null;
    if (s.length < 25 || s.length > 600) return null;
    // The buyer's own rights ("The Principal may reject…") are not things the tenderer must do.
    if (BUYER_SUBJECT.test(s) && !TENDERER.test(s.replace(BUYER_SUBJECT, ''))) return null;
    if (lv === 'desirable' && /\bmay\b/i.test(s) && !/\b(should|desirable|preferred|encouraged|ideally|highly regarded|advantageous)\b/i.test(s) && !TENDERER.test(s)) return null;
    if (/^(note|example|for example|this (?:document|rft|rfq|request))\b/i.test(s) && lv === 'desirable') return null;
    return lv;
  }
  function extractRequirements(text) {
    var out = [], seen = {}, n = 0;
    clauses(text).forEach(function (c) {
      sentences(c.text).forEach(function (s) {
        var lv = isRequirement(s); if (!lv) return;
        var key = s.toLowerCase().replace(/\W+/g, ' ').trim(); if (seen[key]) return; seen[key] = 1;
        n++;
        out.push({ id: 'R' + pad3(n), ref: c.ref || '', section: c.section || '', text: s, mandatory: lv === 'mandatory', level: lv,
          status: 'Not started', owner: '', evidence: '', page: '', criterion: '' });
      });
    });
    return out;
  }
  function pad3(n) { return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }

  // ---------- evaluation criteria ----------
  function extractCriteria(text) {
    var lines = clean(text).split('\n').map(function (l) { return l.trim(); }), groups = [], cur = null, inEval = false;
    lines.forEach(function (line, i) {
      if (/evaluation|assessment|selection|weighted|criteria/i.test(line) && line.length < 120 && !/%/.test(line)) { inEval = true; if (cur && cur.items.length) groups.push(cur); cur = { start: i, items: [], ctx: true }; return; }
      var m = line.match(/^(?:[\dA-Za-z]{1,3}[.)]\s*)*(?:criterion\s*\d*\s*[:\-–]?\s*)?([A-Za-z][^%|\t]{2,90}?)\s*(?:[:\-–|\t(]|\.{2,})?\s*\(?\s*(?:weighting\s*[:\-]?\s*)?(\d{1,3}(?:\.\d+)?)\s*%\s*\)?\s*$/i) ||
              line.match(/^(?:[\dA-Za-z]{1,3}[.)]\s*)?(\d{1,3}(?:\.\d+)?)\s*%\s*[:\-–|\t]?\s*([A-Za-z].{2,90})$/);
      if (m) {
        var name = isNaN(+m[1]) ? m[1] : m[2], w = isNaN(+m[1]) ? +m[2] : +m[1];
        name = name.replace(/\s*(?:weighting|weight)\s*$/i, '').replace(/[\s:\-–|(]+$/, '').trim();
        if (/\bgst\b|discount|interest|deposit|retention|liquidated|of the contract|increase|decrease|penalt/i.test(name) || w <= 0 || w > 100) return;
        if (!cur) cur = { start: i, items: [], ctx: inEval };
        cur.items.push({ name: name, weight: w }); return;
      }
      if (cur && cur.items.length && line && i - cur.start > 1 && !/^\s*$/.test(line)) {
        // a non-criterion line ends a run unless it's a sub-description under a criterion
        if (line.length > 140 || /^\d+(\.\d+)+\s/.test(line)) { groups.push(cur); cur = null; inEval = false; }
      }
    });
    if (cur && cur.items.length) groups.push(cur);
    // Best group: sums closest to 100, prefers groups under an "evaluation" heading.
    var best = null, bestScore = -1;
    groups.forEach(function (g) {
      var sum = g.items.reduce(function (a, x) { return a + x.weight; }, 0);
      var score = (Math.abs(sum - 100) < 0.5 ? 100 : 50 - Math.min(49, Math.abs(sum - 100))) + (g.ctx ? 20 : 0) + Math.min(g.items.length, 8);
      if (g.items.length >= 2 && score > bestScore) { bestScore = score; best = g; }
    });
    return best ? best.items.map(function (x, i) { return { id: 'C' + (i + 1), name: x.name, weight: x.weight }; }) : [];
  }

  // ---------- dates ----------
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  var MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  var TZ = { AEST: 10, AEDT: 11, ACST: 9.5, ACDT: 10.5, AWST: 8, NZST: 12, NZDT: 13, UTC: 0, GMT: 0 };
  var TZWORDS = [[/canberra|sydney|melbourne|hobart|act\b|nsw\b|vic(?:toria)?\b|tas(?:mania)?\b/i, 'Australia/Sydney'], [/brisbane|queensland|qld\b/i, 'Australia/Brisbane'], [/adelaide|\bsa\b|south australia/i, 'Australia/Adelaide'], [/darwin|\bnt\b|northern territory/i, 'Australia/Darwin'], [/perth|\bwa\b|western australia/i, 'Australia/Perth']];
  function iso(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function findDates(s) {
    var out = [], m, re;
    re = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + MON + ',?\\s+(\\d{4})\\b', 'ig');
    while ((m = re.exec(s))) out.push({ i: m.index, end: re.lastIndex, date: iso(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]) });
    re = new RegExp('\\b' + MON + '\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b', 'ig');
    while ((m = re.exec(s))) out.push({ i: m.index, end: re.lastIndex, date: iso(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]) });
    re = /\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g;
    while ((m = re.exec(s))) { var y = +m[3]; if (y < 100) y += 2000; if (+m[2] <= 12) out.push({ i: m.index, end: re.lastIndex, date: iso(y, +m[2], +m[1]) }); }
    re = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((m = re.exec(s))) out.push({ i: m.index, end: re.lastIndex, date: m[0] });
    return out.sort(function (a, b) { return a.i - b.i; });
  }
  function findTime(s) {
    var m = s.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i);
    if (m) { var h = +m[1] % 12; if (/p/i.test(m[3])) h += 12; return pad(h) + ':' + (m[2] || '00'); }
    if (/\b12\s*noon\b|\bnoon\b|\bmidday\b/i.test(s)) return '12:00';
    if (/\bmidnight\b/i.test(s)) return '23:59';
    m = s.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:hrs?|hours?|h\b)?/i) || s.match(/\b([01]\d|2[0-3])([0-5]\d)\s*(?:hrs|hours)\b/i);
    if (m) return pad(+m[1]) + ':' + m[2];
    return '';
  }
  function findTZ(s) {
    var m = s.match(/\b(AEST|AEDT|ACST|ACDT|AWST|NZST|NZDT|UTC|GMT)\b/); if (m) return m[1];
    for (var i = 0; i < TZWORDS.length; i++) if (TZWORDS[i][0].test(s) && /time|local/i.test(s)) return TZWORDS[i][1];
    if (/local time/i.test(s)) return 'local';
    return '';
  }
  var DATE_LABELS = [
    [/\bquestions?\b|clarifications?|enquir(?:y|ies)|queries/i, 'Last day for questions'],
    [/clos(?:e|es|ing)|deadline for (?:submission|lodg|response)|submissions? (?:are )?due|lodge(?:d|ment)? (?:by|no later)|must be (?:received|submitted|lodged)|due date/i, 'Tender closes'],
    [/briefing|information session|industry session|site (?:visit|inspection|meeting)|walk[- ]?through/i, 'Briefing / site visit'],
    [/register|registration|intention to (?:respond|tender|bid)/i, 'Register / intent to respond'],
    [/validity|valid for|remain open/i, 'Offer validity'],
    [/award|notif(?:y|ication)|outcome|announce/i, 'Expected outcome'],
    [/commence|start date|contract start|services? (?:start|begin)/i, 'Contract start'],
    [/issued?|release date|published/i, 'Tender issued']
  ];
  function utcFor(date, time, tz) {
    var off = TZ[tz]; if (off == null || !time) return '';
    var p = date.split('-').map(Number), t = time.split(':').map(Number);
    var ms = Date.UTC(p[0], p[1] - 1, p[2], t[0], t[1]) - off * 3600e3, d = new Date(ms);
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z';
  }
  function keyDates(text) {
    var out = [], seen = {};
    clean(text).split('\n').forEach(function (line) {
      var l = line.trim(); if (!l) return;
      var ds = findDates(l); if (!ds.length) return;
      ds.forEach(function (d, k) {
        var near = l.slice(k ? ds[k - 1].end : 0, Math.min(l.length, d.end + 40)), lbl = null;
        for (var i = 0; i < DATE_LABELS.length; i++) if (DATE_LABELS[i][0].test(near)) { lbl = DATE_LABELS[i][1]; break; }
        if (!lbl) for (var j = 0; j < DATE_LABELS.length; j++) if (DATE_LABELS[j][0].test(l)) { lbl = DATE_LABELS[j][1]; break; }
        if (!lbl) return;
        var tail = l.slice(Math.max(0, d.i - 40), Math.min(l.length, d.end + 40)), time = findTime(tail) || findTime(l), tz = findTZ(l);
        var key = lbl + d.date; if (seen[key]) return; seen[key] = 1;
        out.push({ label: lbl, date: d.date, time: time, tz: tz, source: l.slice(0, 200) });
      });
    });
    return out.sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; });
  }

  // ---------- submission instructions ----------
  var PORTALS = ['AusTender', 'Tenders.net', 'VendorPanel', 'TenderLink', 'eTendering', 'NSW eTendering', 'buy.nsw', 'BuyNSW', 'Tenders VIC', 'Buying for Victoria', 'QTenders', 'Tenders WA', 'SA Tenders', 'Tenders Tasmania', 'ACT Tenders', 'NT Tenders', 'Quotes and Tenders Online', 'Ariba', 'Coupa', 'TenderSearch', 'ICN Gateway', 'eProcure', 'Procurement portal', 'tender box'];
  function submission(text) {
    var t = clean(text), lower = t.toLowerCase(), o = { formats: [], pageLimits: [], wordLimits: [], portals: [], contacts: [], emails: [], phones: [], urls: [], copies: '', fonts: '', lodgement: [] };
    var pos = [].concat.apply([], t.split('\n').map(sentences)).filter(function (x) { return !/not (?:be )?accepted|will not be|cannot be|not permitted/i.test(x); }).join('\n');
    if (/lodged electronically|electronic(?:ally)? (?:lodg|submi)|online portal|via (?:the )?(?:portal|vendorpanel|austender|tenderlink)/i.test(pos)) o.formats.push('Electronic lodgement');
    if (/\bpdf\b/i.test(pos)) o.formats.push('PDF');
    if (/\b(?:microsoft word|word format|word document|\.docx?)\b/i.test(pos)) o.formats.push('Word');
    if (/\b(excel|\.xlsx?|spreadsheet)\b/i.test(pos)) o.formats.push('Excel');
    if (/hard ?cop(?:y|ies)|printed cop|bound cop/i.test(pos)) o.formats.push('Hard copy');
    if (/\busb\b|flash drive/i.test(pos)) o.formats.push('USB');
    var m, re = /(?:maximum of|max(?:imum)?\.?|not (?:to )?exceed|no more than|limited to|up to|limit of)\s*(\d{1,3})\s*(?:x\s*)?(?:a4\s*)?(?:single[- ]sided\s*|double[- ]sided\s*)?pages?|(\d{1,3})\s*(?:x\s*)?(?:a4\s*)?pages?\s*(?:maximum|max|limit|in total)/gi;
    while ((m = re.exec(t))) { var ctx = t.slice(Math.max(0, m.index - 80), m.index).split(/\.\s|\n/).pop().trim(); o.pageLimits.push({ pages: +(m[1] || m[2]), context: (ctx + ' ' + m[0]).trim().slice(0, 140) }); }
    re = /(?:maximum of|max(?:imum)?\.?|not (?:to )?exceed|no more than|limited to|up to|limit of)\s*(\d{1,2},?\d{3}|\d{2,4})\s*words|(\d{1,2},?\d{3}|\d{2,4})\s*words?\s*(?:maximum|max|limit)/gi;
    while ((m = re.exec(t))) { var c2 = t.slice(Math.max(0, m.index - 80), m.index).split(/\.\s|\n/).pop().trim(); o.wordLimits.push({ words: +String(m[1] || m[2]).replace(',', ''), context: (c2 + ' ' + m[0]).trim().slice(0, 140) }); }
    PORTALS.forEach(function (p) { if (lower.indexOf(p.toLowerCase()) >= 0 && o.portals.indexOf(p) < 0) o.portals.push(p); });
    o.emails = uniq(t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []);
    o.phones = uniq((t.match(/(?:\+61\s?[2-478]|\(0[2-478]\)\s?|\b0[2-478])(?:[\s-]?\d){8}\b|\b1[38]00(?:[\s-]?\d){6}\b/g) || []).map(function (x) { return x.trim(); }));
    o.urls = uniq((t.match(/\bhttps?:\/\/[^\s)>\]]+|\bwww\.[^\s)>\]]+/g) || []).map(function (u) { return u.replace(/[.,;]$/, ''); }));
    re = /(?:contact (?:officer|person)|enquiries (?:to|should be directed to)|tender (?:contact|manager|officer)|procurement (?:officer|contact)|contact)\s*[:\-]?\s*/gi;
    while ((m = re.exec(t))) {
      var nmm = t.slice(re.lastIndex, re.lastIndex + 60).match(/^((?:Mr|Ms|Mrs|Dr)\.?\s*)?([A-Z][a-z]+(?:\s[A-Z][a-z'-]+){1,2})/);
      if (!nmm) continue; var nm = ((nmm[1] || '') + nmm[2]).trim();
      if (o.contacts.indexOf(nm) < 0 && !/^(The|All|Any|Tender|Please|Procurement|Officer)\b/.test(nm)) o.contacts.push(nm);
    }
    if ((m = pos.match(/\b(\d+|one|two|three|four|five|six)\s*(?:\(\d+\)\s*)?(?:hard |printed |bound |electronic |unbound )?cop(?:y|ies)/i))) o.copies = m[0];
    if ((m = t.match(/(?:font|typeface)[^.\n]{0,60}?(\d{1,2})\s*(?:pt|point)/i) || t.match(/(\d{1,2})\s*(?:pt|point)\s*(?:font|type)/i))) o.fonts = m[0].trim();
    t.split('\n').forEach(function (l) { if (/\b(lodged?|lodgement|submit(ted)?|upload(ed)?|deliver(ed)?)\b/i.test(l) && /\b(via|through|using|portal|tender box|electronically|email(ed)? to)\b/i.test(l) && !/question|clarification|enquir/i.test(l) && l.trim().length < 300 && o.lodgement.length < 6) o.lodgement.push(l.trim()); });
    return o;
  }
  function uniq(a) { var s = {}; return a.filter(function (x) { var k = x.toLowerCase(); if (s[k]) return false; s[k] = 1; return true; }); }

  // ---------- page / word budgets ----------
  // Largest-remainder rounding so the parts add up to exactly the total.
  function budget(criteria, total, step) {
    step = step || 1; var units = Math.round(total / step);
    var sum = criteria.reduce(function (a, c) { return a + Math.max(0, +c.weight || 0); }, 0);
    if (!sum || !units) return criteria.map(function () { return 0; });
    var raw = criteria.map(function (c) { return Math.max(0, +c.weight || 0) / sum * units; }), base = raw.map(Math.floor);
    var left = units - base.reduce(function (a, b) { return a + b; }, 0);
    raw.map(function (r, i) { return { i: i, f: r - Math.floor(r) }; }).sort(function (a, b) { return b.f - a.f || a.i - b.i; }).slice(0, left).forEach(function (x) { base[x.i]++; });
    return base.map(function (b) { return b * step; });
  }

  // ---------- keyword matching ----------
  var STOP = 'a an and are as at be been but by can could do does for from had has have how if in into is it its may must not of on or our shall should so such than that the their them then there these they this to under up was we were what when where which who will with within would you your all any each other also been being both more most only own same some very per must shall should tenderer tenderers respondent respondents supplier suppliers provide provided demonstrate describe including include includes details detail required requirement requirements ensure response proposed propose services service contract principal'.split(' ');
  var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = 1; });
  function stem(w) { if (w.length <= 4) return w; return w.replace(/(ations?|ings?|ments?|ness|ies|ied|ed|es|s|ly)$/, function (x) { return x === 'ies' || x === 'ied' ? 'y' : ''; }); }
  function tokens(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter(function (w) { return w.length > 2 && !STOPSET[w] && !/^\d+$/.test(w); }).map(stem).filter(function (w) { return w.length > 2; });
  }
  function vectorise(docs) {
    var df = {}, toks = docs.map(tokens);
    toks.forEach(function (ts) { var seen = {}; ts.forEach(function (t) { if (!seen[t]) { seen[t] = 1; df[t] = (df[t] || 0) + 1; } }); });
    var N = docs.length;
    return { df: df, N: N, vec: function (ts) { var tf = {}, v = {}, norm = 0; ts.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; }); Object.keys(tf).forEach(function (t) { var w = (1 + Math.log(tf[t])) * Math.log(1 + (N + 1) / ((df[t] || 0) + 1)); v[t] = w; norm += w * w; }); return { v: v, n: Math.sqrt(norm) || 1 }; } };
  }
  function cosine(a, b) { var s = 0; Object.keys(a.v).forEach(function (k) { if (b.v[k]) s += a.v[k] * b.v[k]; }); return s / (a.n * b.n); }
  // Suggest library items for one requirement. Library item: {id,title,type,tags,text}
  function suggest(reqText, library, k, minScore) {
    if (!library || !library.length) return [];
    var docs = library.map(function (x) { return [x.title, x.tags, x.tags, x.text].join(' '); });
    var model = vectorise(docs.concat([reqText])), q = model.vec(tokens(reqText)), qset = {};
    tokens(reqText).forEach(function (t) { qset[t] = 1; });
    return library.map(function (x, i) {
      var dv = model.vec(tokens(docs[i])), sc = cosine(q, dv);
      var matched = Object.keys(dv.v).filter(function (t) { return qset[t]; });
      return { item: x, score: Math.round(sc * 1000) / 1000, matched: matched.slice(0, 8) };
    }).filter(function (r) { return r.score >= (minScore == null ? 0.08 : minScore); }).sort(function (a, b) { return b.score - a.score; }).slice(0, k || 3);
  }
  // Common words that belong with typical criteria, so "Price" also catches "pricing schedule", etc.
  var SYNONYMS = [
    [/price|cost|value for money|commercial/i, 'price pricing cost rate rates schedule fee fees gst value invoice payment'],
    [/experience|capabilit|past performance|track record|qualification|personnel|team|resourc/i, 'experience capability case study studies referee referees cv cvs similar past qualification accreditation staff personnel supervisor team'],
    [/method|approach|delivery|work plan|technical|solution|service/i, 'methodology approach plan deliver delivery program schedule report reporting respond response time process frequency mow'],
    [/safety|whs|ohs|risk/i, 'safety whs swms risk hazard incident insurance chemical'],
    [/environment|sustainab|green|climate/i, 'environment environmental sustainability green waste recycle emission battery noise energy'],
    [/local|community|social|indigenous|industry participation/i, 'local resident residents apprentice apprentices indigenous community employ employment social'],
    [/quality/i, 'quality iso assurance audit standard']
  ];
  function criterionText(c) { var t = c.name; SYNONYMS.forEach(function (s) { if (s[0].test(c.name)) t += ' ' + s[1]; }); return t; }
  // Assign each requirement to the evaluation criterion it best matches (by words), if any.
  function assignCriteria(reqs, criteria) {
    if (!criteria.length) return reqs;
    var model = vectorise(criteria.map(criterionText).concat(reqs.map(function (r) { return r.text; })));
    var cv = criteria.map(function (c) { return model.vec(tokens(criterionText(c))); });
    reqs.forEach(function (r) {
      if (r.criterion) return;
      var rv = model.vec(tokens(r.text)), best = -1, bi = -1;
      cv.forEach(function (v, i) { var s = cosine(rv, v); if (s > best) { best = s; bi = i; } });
      r.criterion = best > 0.05 ? criteria[bi].id : '';
    });
    return reqs;
  }

  // ---------- drafts ----------
  function excerpt(text, max) { text = String(text || '').trim(); if (text.length <= max) return text; var cut = text.slice(0, max); var p = cut.lastIndexOf('. '); return (p > max * 0.5 ? cut.slice(0, p + 1) : cut + '…'); }
  function draftSection(criterion, reqs, library, opts) {
    opts = opts || {}; var words = opts.words || 0, org = opts.org || '[Your organisation]';
    var mine = reqs.filter(function (r) { return r.criterion === criterion.id; });
    var o = [criterion.name + (criterion.weight ? ' (' + criterion.weight + '% weighting' + (words ? ', about ' + words + ' words' : '') + ')' : ''), ''];
    o.push(org + ' understands that this criterion assesses ' + criterion.name.toLowerCase() + '. In summary: [one or two sentences on why you are the right choice — be specific to this buyer].', '');
    var used = {};
    mine.forEach(function (r) {
      o.push((r.ref ? r.ref + ' ' : '') + '(' + r.id + ') ' + r.text);
      var s = suggest(r.text, (library || []).filter(function (x) { return !used[x.id]; }), 1, 0.1)[0];
      if (s) { used[s.item.id] = 1; o.push('Our response: ' + excerpt(s.item.text, 700) + ' [Adapted from library: ' + s.item.title + ' — tailor to this tender.]'); }
      else o.push('Our response: [How you meet this requirement, with evidence — a number, a past project, a certificate or a policy reference.]');
      o.push('');
    });
    if (!mine.length) {
      var s2 = suggest(criterion.name, library || [], 2, 0.05);
      s2.forEach(function (s) { o.push(excerpt(s.item.text, 700) + ' [From library: ' + s.item.title + ']', ''); });
      if (!s2.length) o.push('[Describe your approach, experience and evidence for this criterion.]', '');
    }
    o.push('Evidence and attachments: [list case studies, CVs, certificates or policies you are attaching for this criterion].');
    return o.join('\n');
  }

  // ---------- compliance matrix export ----------
  var MATRIX_COLS = ['ID', 'Clause', 'Requirement', 'Mandatory', 'Criterion', 'Status', 'Owner', 'Evidence / reference', 'Page'];
  function matrixRows(reqs, criteria) {
    var cname = {}; (criteria || []).forEach(function (c) { cname[c.id] = c.name; });
    return reqs.map(function (r) { return { 'ID': r.id, 'Clause': r.ref, 'Requirement': r.text, 'Mandatory': r.mandatory ? 'Yes' : 'No', 'Criterion': cname[r.criterion] || '', 'Status': r.status, 'Owner': r.owner, 'Evidence / reference': r.evidence, 'Page': r.page }; });
  }
  function matrixSummary(reqs) {
    var s = { total: reqs.length, mandatory: 0, complete: 0, mandatoryOpen: 0, wontComply: 0, unassigned: 0 };
    reqs.forEach(function (r) {
      if (r.mandatory) s.mandatory++;
      if (r.status === 'Complete' || r.status === 'Not applicable') s.complete++;
      else if (r.mandatory) s.mandatoryOpen++;
      if (r.status === 'Will not comply' && r.mandatory) s.wontComply++;
      if (!r.owner) s.unassigned++;
    });
    s.pct = s.total ? Math.round(s.complete / s.total * 100) : 0;
    return s;
  }

  // ---------- go / no-go ----------
  var GONOGO = [
    { id: 'mandatory', name: 'We can meet every mandatory requirement', weight: 3, knockout: true },
    { id: 'capability', name: 'We have done this kind of work before (evidence, references)', weight: 2 },
    { id: 'capacity', name: 'We have the people and time to deliver if we win', weight: 2 },
    { id: 'relationship', name: 'We know the buyer / they know us', weight: 1.5 },
    { id: 'fit', name: 'Fits our strategy and the clients we want', weight: 1 },
    { id: 'competition', name: 'Our chance against likely competitors', weight: 1.5 },
    { id: 'price', name: 'We can price competitively and still make money', weight: 2 },
    { id: 'terms', name: 'Contract terms, insurance and risk are acceptable', weight: 1.5, knockout: true },
    { id: 'time', name: 'Enough time to write a strong response', weight: 1 }
  ];
  function goNoGo(scores) {
    var sum = 0, wsum = 0, answered = 0, ko = [];
    GONOGO.forEach(function (f) {
      var s = scores && scores[f.id]; s = s == null || s === '' ? null : +s;
      wsum += f.weight * 5;
      if (s != null) { answered++; sum += f.weight * s; if (f.knockout && s <= 1) ko.push(f.name); }
    });
    var pct = Math.round(sum / wsum * 100), verdict;
    if (ko.length) verdict = 'No bid';
    else if (answered < GONOGO.length) verdict = 'Incomplete';
    else verdict = pct >= 70 ? 'Bid' : pct >= 50 ? 'Bid with caution' : 'No bid';
    return { pct: pct, verdict: verdict, knockouts: ko, answered: answered, total: GONOGO.length };
  }

  // ---------- final checklist ----------
  var BASE_CHECKS = [
    'All mandatory requirements answered (compliance matrix complete)',
    'Every evaluation criterion has a response within the page / word limit',
    'Pricing schedule completed in the buyer’s format; GST shown as asked',
    'Returnable schedules / forms completed and signed by an authorised person',
    'Statement of departures (or “no departures”) from the draft contract',
    'Conflict of interest declaration',
    'Insurance certificates of currency attached',
    'ABN and company details correct on every form',
    'Referees contacted and willing',
    'Spelling, names and the buyer’s name checked; no leftover [placeholders]',
    'Files named and formatted as instructed; file sizes within portal limits',
    'Lodged before the closing time — allow for portal upload delays; keep the receipt'
  ];
  var DETECT = [
    [/public liability/i, 'Public liability insurance certificate'], [/professional indemnity/i, 'Professional indemnity insurance certificate'],
    [/workers'? comp/i, 'Workers compensation certificate of currency'], [/product liability/i, 'Product liability insurance certificate'],
    [/cyber (?:insurance|liability)/i, 'Cyber insurance certificate'], [/statutory declaration/i, 'Statutory declaration (witnessed)'],
    [/modern slavery/i, 'Modern slavery statement / questionnaire'], [/\bwhs\b|work health and safety|safety management (?:plan|system)/i, 'WHS management plan / safety system evidence'],
    [/quality (?:management|assurance)|iso ?9001/i, 'Quality management evidence (e.g. ISO 9001 certificate)'], [/iso ?27001|information security/i, 'Information security evidence (e.g. ISO 27001)'],
    [/iso ?14001|environmental management/i, 'Environmental management evidence (e.g. ISO 14001)'],
    [/financial statements?|audited accounts|financial capacity/i, 'Financial statements / evidence of financial capacity'],
    [/\bcv'?s?\b|curriculum vitae|résumé|resume/i, 'CVs of key personnel'], [/case stud(?:y|ies)/i, 'Case studies'],
    [/indigenous|aboriginal|first nations/i, 'Indigenous participation plan / statement'], [/local (?:content|industry|participation)/i, 'Local industry participation plan'],
    [/execution page|form of tender|tender form|offer form/i, 'Form of tender / offer signed'], [/bank guarantee|security deposit/i, 'Bank guarantee / security arrangements'],
    [/police check|working with children/i, 'Police / Working with Children checks for staff'], [/\blicen[cs]es?\b|\bregistrations?\b|accreditation/i, 'Licences, registrations and accreditations']
  ];
  function checklist(text) {
    var t = clean(text), out = BASE_CHECKS.map(function (x) { return { text: x, done: false, fromTender: false }; });
    DETECT.forEach(function (d) {
      if (!d[0].test(t)) return;
      var m = t.match(new RegExp('[^.\\n]*' + d[0].source + '[^.\\n]*', 'i')), amt = m && m[0].match(/\$\s?\d[\d,.]*\s*(?:million|m\b)?/i);
      out.push({ text: d[1] + (amt ? ' — ' + amt[0].trim() : ''), done: false, fromTender: true });
    });
    return out;
  }

  // ---------- .ics ----------
  function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) { var out = [], i = 0; while (line.length - i > 74) { out.push((i ? ' ' : '') + line.slice(i, i + (i ? 73 : 74))); i += i ? 73 : 74; } out.push((i ? ' ' : '') + line.slice(i)); return out.join('\r\n'); }
  function nextDay(d) { var p = d.split('-').map(Number), x = new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1)); return x.getUTCFullYear() + pad(x.getUTCMonth() + 1) + pad(x.getUTCDate()); }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function toICS(dates, title, stamp) {
    var now = stamp || new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Brahaspati//Tender Response Assistant//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    dates.forEach(function (d) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return;
      var summary = (title ? title + ': ' : '') + d.label, utc = utcFor(d.date, d.time, d.tz), day = d.date.replace(/-/g, '');
      lines.push('BEGIN:VEVENT', 'UID:' + day + '-' + hash(summary + d.time) + '@brahaspati-tender', 'DTSTAMP:' + now);
      if (utc) { lines.push('DTSTART:' + utc, 'DURATION:PT30M'); }
      else if (d.time && /^Australia\//.test(d.tz)) { lines.push('DTSTART;TZID=' + d.tz + ':' + day + 'T' + d.time.replace(':', '') + '00', 'DURATION:PT30M'); }
      else if (d.time) { lines.push('DTSTART:' + day + 'T' + d.time.replace(':', '') + '00', 'DURATION:PT30M'); }
      else lines.push('DTSTART;VALUE=DATE:' + day, 'DTEND;VALUE=DATE:' + nextDay(d.date));
      lines.push(fold('SUMMARY:' + icsEscape(summary)), fold('DESCRIPTION:' + icsEscape((d.time ? d.time + ' ' + (d.tz || '') + '. ' : '') + (d.source || ''))));
      if (d.label === 'Tender closes') lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(summary), 'TRIGGER:-P2D', 'END:VALARM', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(summary), 'TRIGGER:-PT4H', 'END:VALARM');
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  function analyse(text) {
    var reqs = extractRequirements(text), crit = extractCriteria(text);
    assignCriteria(reqs, crit);
    return { requirements: reqs, criteria: crit, submission: submission(text), dates: keyDates(text), checklist: checklist(text) };
  }

  var L = { clauses: clauses, sentences: sentences, level: level, isRequirement: isRequirement, extractRequirements: extractRequirements, extractCriteria: extractCriteria,
    findDates: findDates, findTime: findTime, findTZ: findTZ, keyDates: keyDates, utcFor: utcFor, submission: submission, budget: budget, tokens: tokens, suggest: suggest,
    assignCriteria: assignCriteria, draftSection: draftSection, MATRIX_COLS: MATRIX_COLS, matrixRows: matrixRows, matrixSummary: matrixSummary, GONOGO: GONOGO, goNoGo: goNoGo,
    checklist: checklist, toICS: toICS, analyse: analyse, esc: esc,
    STATUSES: ['Not started', 'Drafting', 'Review', 'Complete', 'Not applicable', 'Will not comply'] };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.TenderLib = L;
})(this);
