/* Knowledge Graph Builder — pure logic, no DOM, no AI.
   Text -> paragraphs/sentences -> entity mentions (people, organisations, projects, topics, decisions, dates, emails)
   -> alias merging -> co-occurrence graph -> layout, lists and exports. */
(function (root) {
  'use strict';

  function set(s) { var o = {}; s.split(/\s+/).forEach(function (w) { if (w) o[w] = 1; }); return o; }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  var STOP = set('a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing done down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself also may might must shall cannot can\'t won\'t don\'t didn\'t isn\'t aren\'t wasn\'t let us via per etc within without across onto upon around among however therefore thus yet still already please thanks thank regards hi hello dear one two three new next last first second many much get got make made need needs needed use used using like well able want see said says say going go goes will shall would one\'s it\'s we\'ll i\'ll we\'re i\'m they\'re you\'re we\'ve i\'ve that\'s there\'s what\'s every each another either neither whether since though although unless until while upon');
  var GENERIC = set('board committee project projects program programme pilot plan plans time times thing things people person team teams meeting meetings week weeks day days today tomorrow yesterday month months year years item items update updates note notes work part lot way ways number numbers issue issues point points end start group email emails document documents page pages report reports section question questions information info details detail matter matters case cases area areas place everyone anyone someone something anything nothing everything morning afternoon evening minute minutes hour hours yes okay ok sure good great best better');
  // a name word: Smith, O'Brien, Smith-Jones, McDonald
  var NW = "(?:[A-Z][a-z]*(?:['’-][A-Z]?[a-z]+)+|(?:Mc|Mac)[A-Z][a-z]+|[A-Z][a-z]+)";
  var HONORIFIC = 'Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Professor|Sir|Dame|Cr|Councillor|Hon';
  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  var MON_RE = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  // Capitalised words that are not people's names (sentence starters, places, calendar words, document words)
  var NOT_NAME = set('the this that these those a an and or but if when where what why how who which our your their my his her its we you they he she it i project program programme initiative department council group board committee team meeting agenda minutes report plan strategy policy update review summary introduction background phase stage sprint release version draft final annual quarterly monthly weekly daily monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december street st road rd avenue ave lane drive highway australia australian sydney melbourne brisbane perth adelaide hobart darwin canberra queensland victoria tasmania nsw vic qld new south wales western northern territory capital city north south east west central national federal state government services service system systems data limited ltd pty inc group company corporation university bank office head chief officer manager director executive lead senior junior general key next last dear hi hello thanks regards kind best subject re fwd from to cc date sent attachments total item action decision decisions actions risk risks note notes question questions yes no ok q1 q2 q3 q4 fy mr mrs ms dr prof sir is are was were has have had will would should could can may might must also please see per via all any each every some most many more new old high low first second third one two three ai api it hr finance legal sales marketing operations support customer customers client clients product products platform portal app website online digital cloud internet email phone mobile web software logistics health energy media labs studio capital ventures consulting engineering construction property legal insurance retail foods pharma network networks security');
  var FIRST = set('aaron adam adrian aisha alan alex alexander alexandra ali alice alicia alison amanda amelia amir amit amy ana andrea andrew angela anil anita ann anna anne anthony anuj arjun ash ashley aya ben benjamin beth bianca bill bob brad brendan brian bruce caitlin cameron carla carlos carol caroline catherine charlie charlotte chen chloe chris christine claire craig dan daniel david deepa deepak diana dimitri dylan ed eddie elena eliza elizabeth ella ellie emily emma eric erin ethan eva fatima fiona frank gary george georgia grace greg hamish hannah harry heather helen henry hiro holly hugo ian isaac isabella isla jack jacob james jamie jane janet jason jay jen jenny jess jessica jill jim jo joan joanne joe john jon jonathan jordan jose joseph josh joshua julia julie justin karen kate katherine kathy katie kelly ken kevin kim kumar kylie laura lauren leah lee leo li liam lily linda lisa liz lucas lucy luke maria mark martin mary matt matthew max maya megan mei melissa mia michael michelle mike ming mohammed muhammad nadia naomi natalie nathan neha nick nicole nikhil noah olivia oliver omar oscar pam patrick paul pawan peter phil philip pooja prakash priya rachel raj rajesh ravi rebecca richard rob robert rohan ross ruby russell ryan sam samantha sanjay sara sarah scott sean seb shane sharon simon sofia sophie stephen steve steven stuart sue susan suresh tanya tara tess thomas tim tom tony tracy vanessa vijay vikram wei will william yan yuki zac zoe zara');
  var ACRONYM = set('API APIS ASAP ATO ABN ACN AUD USD GST BAS CEO CFO CTO COO CIO HR IT KPI KPIS ROI SEO CSV PDF XLSX DOCX HTML JSON SQL AWS GCP UAT QA UI UX CRM ERP SLA SLAS MVP TBC TBD FYI EOD COB NSW VIC QLD ACT TAS NOTE NOTES FAQ RFP RFQ SOW POC NDA GDPR ISO IPO LLC PLC LTD PTY INC CORP ETA AGM EBITDA YTD MOM QOQ YOY OKR OKRS PMO BAU WFH NA TODO DONE OPEN CLOSED URGENT DRAFT FINAL IMPORTANT ACTION ACTIONS DECISION DECISIONS AGENDA MINUTES ITEM ITEMS RISK RISKS ISSUE ISSUES ATTENDEES APOLOGIES SUBJECT FROM DATE TOTAL NULL TRUE FALSE NONE HTTP HTTPS WWW COM');
  var ORG_SUFFIX = '(?:Pty\\.?\\s+Ltd\\.?|Pty\\.?\\s+Limited|Limited|Ltd\\.?|Inc\\.?|LLC|PLC|Corp(?:oration)?\\.?|Group|Council|Department|Dept\\.?|Agency|Authority|University|Bank|Foundation|Institute|Commission|Ministry|Holdings|Partners|Associates|Consulting|Technologies|Solutions|Industries|Enterprises|Trust|Society|Association|Hospital|School|College)';
  var PROJ_WORD = '(?:project|program|programme|initiative|rollout|roll-out|migration|implementation|workstream)';
  var DECIDE = /\b(decided|decision (?:was|is|to)|agreed|approved|resolved|signed off|endorsed|ratified|we(?:'ll| will) go with|chose to|opted to|the board (?:approved|endorsed)|motion carried)\b/i;
  var PERSON_CTX = /^\s*(?:raised|flagged|met|sent|fixed|manages|leads|led|wants|needs|joined|left|approved|signed|owns|runs|chaired|said|says|says,|will|would|agreed|asked|noted|explained|confirmed|wrote|emailed|called|presented|suggested|proposed|reported|mentioned|added|replied|is|was|has|had|from|\(|,\s*(?:who|our|the|head|chief|manager|director|lead|senior|ceo|cfo|cto))/i;

  // ---------- text structure ----------
  var ABBR = /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|Pty|Ltd|Inc|Co|No|vs|Corp|Dept|approx|etc|[A-Z])\.|\b(?:e\.g|i\.e)\.)$/;
  function splitSentences(text) {
    var out = [], s = String(text || '').replace(/\s+/g, ' ').trim(), re = /[.!?]+["')\]]*\s+(?=["'(\[]?[A-Z0-9])/g, m, last = 0;
    while ((m = re.exec(s))) {
      var cut = m.index + m[0].length, piece = s.slice(last, cut).trim();
      if (ABBR.test(s.slice(Math.max(0, m.index - 8), m.index + 1))) continue;
      if (piece) out.push(piece); last = cut;
    }
    if (s.slice(last).trim()) out.push(s.slice(last).trim());
    return out;
  }
  // -> [{text, sentences:[...]}]; lines that are bullets or follow a full stop start a new segment
  function structure(text) {
    var paras = String(text || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/);
    var out = [];
    paras.forEach(function (p) {
      var lines = p.split('\n').map(function (l) { return l.trim(); }).filter(Boolean); if (!lines.length) return;
      var segs = [], cur = '';
      lines.forEach(function (l) {
        var bullet = /^(?:[-*•–]|\d+[.)])\s+/.test(l);
        if (cur && (bullet || /[.!?:;]["')]?$/.test(cur) || l.length < 60 && cur.length < 60 && !/[,]$/.test(cur))) { segs.push(cur); cur = ''; }
        cur = (cur ? cur + ' ' : '') + l.replace(/^(?:[-*•–]|\d+[.)])\s+/, '');
      });
      if (cur) segs.push(cur);
      var sents = []; segs.forEach(function (sg) { sents = sents.concat(splitSentences(sg)); });
      if (sents.length) out.push({ text: lines.join(' '), sentences: sents });
    });
    return out;
  }

  // ---------- keys ----------
  function titleCase(s) { return String(s).toLowerCase().replace(/(^|[\s'’-])([a-z])/g, function (_, a, c) { return a + c.toUpperCase(); }); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'& ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function orgKey(s) { return norm(s).replace(/^the /, '').replace(/\b(pty|ltd|limited|inc|llc|plc|corp|corporation|co)\b/g, '').replace(/\s+/g, ' ').trim(); }
  function projKey(s) { return norm(s).replace(/^the /, '').replace(/\b(project|program|programme|initiative|codename|code name)\b/g, '').replace(/\s+/g, ' ').trim(); }
  function conceptKey(s) { return norm(s).split(' ').map(function (w, i, a) { return i === a.length - 1 && w.length > 4 && /[^s]s$/.test(w) ? w.slice(0, -1) : w; }).join(' '); }
  function keyFor(type, name) { return type === 'organisation' ? orgKey(name) : type === 'project' ? projKey(name) : type === 'concept' ? conceptKey(name) : type === 'email' ? String(name).toLowerCase() : norm(name); }

  // ---------- dates ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function monIdx(m) { return MONTHS.findIndex(function (x) { return x.slice(0, 3) === m.toLowerCase().slice(0, 3); }); }
  function findDates(s) {
    var out = [], m, re;
    function add(y, mo, d, raw, idx) { if (mo < 0 || mo > 11 || y < 1900 || y > 2100 || (d && (d < 1 || d > 31))) return; out.push({ iso: y + '-' + pad(mo + 1) + (d ? '-' + pad(d) : ''), raw: raw, index: idx }); }
    re = /\b(\d{4})-(\d{2})-(\d{2})\b/g; while ((m = re.exec(s))) add(+m[1], +m[2] - 1, +m[3], m[0], m.index);
    re = /\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g; while ((m = re.exec(s))) add(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1], m[0], m.index);
    re = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + MON_RE + ',?\\s+(\\d{4})\\b', 'gi'); while ((m = re.exec(s))) add(+m[3], monIdx(m[2]), +m[1], m[0], m.index);
    re = new RegExp('\\b' + MON_RE + '\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b', 'gi'); while ((m = re.exec(s))) add(+m[3], monIdx(m[1]), +m[2], m[0], m.index);
    re = new RegExp('(?:^|[^\\d\\s]\\s*|\\s)' + MON_RE + '\\s+(\\d{4})\\b', 'gi');
    while ((m = re.exec(s))) { var at = m.index + m[0].indexOf(m[1]); if (!out.some(function (o) { return at >= o.index && at < o.index + o.raw.length; })) add(+m[2], monIdx(m[1]), 0, m[0].slice(m[0].indexOf(m[1])), at); }
    return out.sort(function (a, b) { return a.index - b.index; });
  }

  // ---------- RAKE-style keyphrases ----------
  // weak=true: also return 2–3 word phrases seen once (candidates to confirm across documents)
  function keyphrases(paras, limit, weak) {
    var phrases = {}, freq = {}, deg = {};
    paras.forEach(function (p) {
      p.sentences.forEach(function (s) {
        var toks = s.replace(/[,.;:!?()"“”\[\]{}\/|•…]+/g, ' | ').split(/\s+/).filter(Boolean), run = [];
        function flush() {
          // every 1–3 word piece of a run is a candidate; long runs ("customer portal migration depends") still count
          for (var i = 0; i < run.length; i++) for (var len = 1; len <= 3 && i + len <= run.length; len++) {
            var part = run.slice(i, i + len), raw = part.join(' '), k = conceptKey(raw), caps = part.filter(function (w) { return /^[A-Z]/.test(w); }).length;
            if (!phrases[k]) phrases[k] = { label: raw.toLowerCase(), count: 0, capped: 0, words: part.map(function (w) { return w.toLowerCase(); }) };
            phrases[k].count++; if (caps === part.length) phrases[k].capped++;
          }
          run.forEach(function (w) { w = w.toLowerCase(); freq[w] = (freq[w] || 0) + 1; deg[w] = (deg[w] || 0) + Math.min(run.length, 3); });
          run = [];
        }
        toks.forEach(function (t) {
          var w = t.replace(/^['’-]+|['’-]+$/g, ''), lw = w.toLowerCase();
          if (t === '|' || !w || has(STOP, lw) || lw.length < 3 || !/^[a-z][a-z'’-]*$/i.test(w) || /@/.test(w)) flush(); else run.push(w);
        });
        flush();
      });
    });
    var list = Object.keys(phrases).map(function (k) {
      var p = phrases[k], score = p.words.reduce(function (s, w) { return s + deg[w] / freq[w]; }, 0);
      return { key: k, label: p.label, count: p.count, score: score * Math.log(1 + p.count), proper: p.capped > p.count / 2, words: p.words };
    }).filter(function (p) {
      if (p.proper) return false;
      if (p.words.every(function (w) { return has(GENERIC, w); })) return false;
      if (p.words.length === 1 && (weak || p.count < 3 || p.label.length < 5)) return false;
      return (p.count >= 2 || weak) && !has(STOP, p.words[p.words.length - 1]) && !has(GENERIC, p.words[0]) && !has(GENERIC, p.words[p.words.length - 1]);
    }).sort(function (a, b) { return b.score - a.score; });
    // keep the longest phrase when a shorter one only appears inside it
    var picked = [];
    list.forEach(function (p) {
      if (picked.length >= (limit || 8)) return;
      if (picked.some(function (q) { return (' ' + q.key + ' ').indexOf(' ' + p.key + ' ') >= 0 && q.count >= p.count - 1 || (' ' + p.key + ' ').indexOf(' ' + q.key + ' ') >= 0; })) return;
      picked.push(p);
    });
    return picked;
  }

  // ---------- entity extraction for one document ----------
  // doc: {id, name, text} -> {docId, mentions:[{t,n,s,p,x,e?}], decisions:[{text,date,s,p}], sentences}
  function extract(doc) {
    var paras = structure(doc.text), mentions = [], decisions = [], sentIdx = -1, fullNames = [];
    var exclusion = []; // [start,end] ranges inside the current sentence already claimed
    function claim(st, en) { for (var i = 0; i < exclusion.length; i++) if (st < exclusion[i][1] && en > exclusion[i][0]) return false; exclusion.push([st, en]); return true; }
    function snip(s) { return s.length > 260 ? s.slice(0, 257) + '…' : s; }
    paras.forEach(function (para, pi) {
      para.sentences.forEach(function (s) {
        sentIdx++; exclusion = []; var m, re, x = snip(s);
        function add(t, n, st, en, extra) { n = String(n).replace(/\s+/g, ' ').trim(); if (!n) return; if (st != null && !claim(st, en)) return; var o = { t: t, n: n, s: sentIdx, p: pi, x: x }; if (extra) Object.assign(o, extra); mentions.push(o); }
        // emails with display names: "Jane Smith <jane@acme.com>"
        re = new RegExp('"?(' + NW + '(?:\\s+' + NW + '){1,2})"?\\s*<([\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+)>', 'g');
        while ((m = re.exec(s))) { add('person', m[1], m.index, m.index + m[0].length, { e: m[2].toLowerCase() }); fullNames.push(m[1]); }
        re = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;
        while ((m = re.exec(s))) add('email', m[0].toLowerCase(), m.index, m.index + m[0].length);
        // honorifics: Dr Priya Shah, Ms Lee
        re = new RegExp('\\b(?:' + HONORIFIC + ')\\.?\\s+(' + NW + '(?:\\s+' + NW + '){0,2})', 'g');
        while ((m = re.exec(s))) { add('person', m[1], m.index, m.index + m[0].length, { h: 1 }); if (/\s/.test(m[1])) fullNames.push(m[1]); }
        // organisations
        re = new RegExp('\\b((?:The\\s+)?(?:[A-Z][\\w&\'’.-]*\\s+){1,4}?' + ORG_SUFFIX + ')(?![\\w])', 'g');
        while ((m = re.exec(s))) {
          var org = m[1].replace(/^The\s+/, ''), words = org.split(/\s+/);
          while (words.length > 1 && (has(NOT_NAME, words[0].toLowerCase()) && !/^(?:[A-Z]{2,}|National|Australian|Commonwealth|State|City|Western|Northern|South|North|East|West|New|Central|General|Federal)$/.test(words[0]))) words.shift();
          org = words.join(' ');
          if (words.length >= 2) add('organisation', org.replace(/\.$/, ''), m.index + m[0].indexOf(words[0]), m.index + m[0].length);
        }
        re = /\b((?:Department|Ministry|University|Office|Bank|Council|Commission|Institute) of(?: the)? [A-Z][\w'-]+(?:(?:,? and| &|,)? [A-Z][\w'-]+){0,4})/g;
        while ((m = re.exec(s))) add('organisation', m[1], m.index, m.index + m[0].length);
        // projects
        re = /\b(?:[Pp]roject|[Pp]rogram(?:me)?|[Ii]nitiative|[Cc]ode-?\s?name(?:d)?)\s+["“']?([A-Z][\w-]*(?:\s+[A-Z0-9][\w-]*){0,2})["”']?/g;
        while ((m = re.exec(s))) add('project', m[1], m.index, m.index + m[0].length);
        re = new RegExp('\\b((?:[A-Z][\\w-]*\\s+){1,3}?)' + PROJ_WORD + '\\b', 'gi');
        while ((m = re.exec(s))) {
          var pw = m[1].trim().split(/\s+/).filter(function (w) { return /^[A-Z]/.test(w); });
          while (pw.length && has(NOT_NAME, pw[0].toLowerCase()) && !/^[A-Z]{3,}$/.test(pw[0])) pw.shift();
          if (pw.length && /^[A-Z]/.test(m[1])) add('project', pw.join(' '), m.index + m[0].indexOf(pw[0]), m.index + m[0].length);
        }
        re = /\b[A-Z][A-Z0-9]{3,11}\b/g;
        while ((m = re.exec(s))) if (!has(ACRONYM, m[0]) && /[A-Z]{4}/.test(m[0]) && s.replace(/[^A-Za-z]/g, '').replace(/[a-z]/g, '').length < s.replace(/[^A-Za-z]/g, '').length * 0.5) add('project', titleCase(m[0]), m.index, m.index + m[0].length, { code: 1 });
        // people: two or three capitalised words
        re = new RegExp('\\b(' + NW + '|[A-Z]\\.?)\\s+(' + NW + ')(?:\\s+(' + NW + '))?\\b', 'g');
        var listLine = /^(?:present|attendees|attendance|apologies|participants|to|cc|from)\s*:/i.test(s);
        while ((m = re.exec(s))) {
          var parts = [m[1], m[2], m[3]].filter(Boolean), first = parts[0].replace(/\.$/, '').toLowerCase();
          if (parts.some(function (w) { return has(NOT_NAME, w.toLowerCase()); })) {
            // retry from the second word ("Thanks Jane Smith" -> "Jane Smith")
            if (has(NOT_NAME, parts[0].toLowerCase()) && parts.length === 3 && !has(NOT_NAME, parts[1].toLowerCase()) && !has(NOT_NAME, parts[2].toLowerCase()) && has(FIRST, parts[1].toLowerCase())) {
              var st2 = m.index + m[0].indexOf(parts[1]); add('person', parts[1] + ' ' + parts[2], st2, m.index + m[0].length); fullNames.push(parts[1] + ' ' + parts[2]);
            } else if (parts.length === 3 && !has(NOT_NAME, parts[0].toLowerCase()) && !has(NOT_NAME, parts[1].toLowerCase()) && has(FIRST, first)) {
              add('person', parts[0] + ' ' + parts[1], m.index, m.index + parts[0].length + 1 + parts[1].length); fullNames.push(parts[0] + ' ' + parts[1]);
            }
            continue;
          }
          var after = s.slice(m.index + m[0].length, m.index + m[0].length + 30);
          var initial = /^[A-Z]\.?$/.test(parts[0]);
          var nm = parts.join(' ').replace(/\s+/g, ' ');
          if (has(FIRST, first) || PERSON_CTX.test(after) || initial || listLine) {
            if (initial) nm = parts[0].replace(/\.?$/, '.') + ' ' + parts.slice(1).join(' ');
            add('person', nm, m.index, m.index + m[0].length, initial ? { i: 1 } : null);
            if (!initial) fullNames.push(nm);
          } else if (!parts.some(function (w) { var lw = w.toLowerCase(); return has(GENERIC, lw) || has(STOP, lw); })) {
            add('person', nm, m.index, m.index + m[0].length, { w: 1 }); // weak: kept only if confirmed elsewhere
          }
        }
        // dates
        findDates(s).forEach(function (d) { add('date', d.iso, d.index, d.index + d.raw.length, { raw: d.raw }); });
        // decisions
        if (DECIDE.test(s) && s.split(/\s+/).length >= 4) {
          var dd = findDates(s)[0];
          decisions.push({ text: x, date: dd ? dd.iso : '', s: sentIdx, p: pi });
        }
      });
    });
    // second pass: single first names / surnames that match a full name in this document
    var byFirst = {}, bySur = {};
    fullNames.forEach(function (n) { var w = n.split(/\s+/); if (w.length < 2) return; var f = w[0].toLowerCase(), l = w[w.length - 1].toLowerCase(); (byFirst[f] = byFirst[f] || {})[norm(n)] = n; (bySur[l] = bySur[l] || {})[norm(n)] = n; });
    var si = -1;
    paras.forEach(function (para, pi) {
      para.sentences.forEach(function (s) {
        si++; var re = /\b([A-Z][a-z'’-]{2,})\b/g, m, taken = mentions.filter(function (x) { return x.s === si && x.t === 'person'; }).map(function (x) { return x.n; }).join(' ');
        while ((m = re.exec(s))) {
          var w = m[1].toLowerCase(), hit = null;
          if (byFirst[w] && Object.keys(byFirst[w]).length === 1) hit = byFirst[w][Object.keys(byFirst[w])[0]];
          else if (bySur[w] && Object.keys(bySur[w]).length === 1 && !has(FIRST, w)) hit = bySur[w][Object.keys(bySur[w])[0]];
          if (hit && taken.indexOf(m[1]) < 0) { mentions.push({ t: 'person', n: hit, s: si, p: pi, x: s.length > 260 ? s.slice(0, 257) + '…' : s, alias: m[1] }); taken += ' ' + hit; }
        }
      });
    });
    // topics: strong ones repeat in this document; weak ones are kept only if another document has them too
    var strongK = keyphrases(paras, 10), sk = {}; strongK.forEach(function (k) { sk[k.key] = 1; });
    var weakK = keyphrases(paras, 25, true).filter(function (k) { return !sk[k.key]; });
    strongK.map(function (k) { return [k, null]; }).concat(weakK.map(function (k) { return [k, { w: 1 }]; })).forEach(function (pair) {
      var k = pair[0], si2 = -1;
      paras.forEach(function (para, pi) {
        para.sentences.forEach(function (s) { si2++; if ((' ' + conceptKey(s) + ' ').indexOf(' ' + k.key + ' ') >= 0 || s.toLowerCase().indexOf(k.label) >= 0) mentions.push(Object.assign({ t: 'concept', n: k.label, s: si2, p: pi, x: s.length > 260 ? s.slice(0, 257) + '…' : s }, pair[1])); });
      });
    });
    return { docId: doc.id, mentions: mentions, decisions: decisions, sentences: si + 1, paragraphs: paras.length };
  }

  // ---------- alias merging across all documents ----------
  // -> map "type|key" -> canonical "type|key"
  function aliasMap(extractions) {
    var persons = {}, emailToName = {}, map = {};
    extractions.forEach(function (ex) {
      ex.mentions.forEach(function (m) {
        if (m.t === 'person' && !m.i && !m.w && /\s/.test(m.n)) persons[norm(m.n)] = (persons[norm(m.n)] || 0) + 1;
        if (m.t === 'person' && m.e) emailToName[m.e] = norm(m.n);
      });
    });
    var full = Object.keys(persons);
    function uniq(list) { return list.length === 1 ? list[0] : null; }
    extractions.forEach(function (ex) {
      ex.mentions.forEach(function (m) {
        var k = m.t + '|' + keyFor(m.t, m.n); if (map[k]) return;
        if (m.t === 'person') {
          var n = norm(m.n), w = n.split(' ');
          if (m.i || /^[a-z]$/.test(w[0])) { // initial + surname
            var t = uniq(full.filter(function (f) { var fw = f.split(' '); return fw.length > 1 && fw[0][0] === w[0][0] && fw[fw.length - 1] === w[w.length - 1]; }));
            if (t) map[k] = 'person|' + t;
          } else if (w.length === 1) { // "Dr Patel" or "Priya"
            var t2 = uniq(full.filter(function (f) { var fw = f.split(' '); return fw[fw.length - 1] === w[0] || fw[0] === w[0]; }));
            if (t2) map[k] = 'person|' + t2;
          }
        } else if (m.t === 'email') {
          var e = m.n.toLowerCase(), nm = emailToName[e];
          if (!nm) { var lp = e.split('@')[0].replace(/[0-9]+/g, '').split(/[._-]+/).filter(Boolean); if (lp.length >= 2) { var guess = lp.join(' '); if (persons[guess]) nm = guess; else { var g2 = uniq(full.filter(function (f) { var fw = f.replace(/'/g, '').split(' '); return fw[0] === lp[0] && fw[fw.length - 1] === lp[lp.length - 1] || fw[0][0] === lp[0] && lp[0].length === 1 && fw[fw.length - 1] === lp[lp.length - 1]; })); if (g2) nm = g2; } } }
          if (nm) map[k] = 'person|' + nm;
        }
      });
    });
    return map;
  }

  // ---------- graph ----------
  // docs: [{id,name}], extractions: [{docId, mentions, decisions}] -> {nodes, edges, decisions, docs}
  function build(docs, extractions, opts) {
    opts = opts || {};
    var docName = {}; docs.forEach(function (d) { docName[d.id] = d.name; });
    var amap = aliasMap(extractions), nodes = {}, edges = {}, decisions = [];
    // weak mentions (unconfirmed names, one-off phrases) count only when confirmed: strong somewhere, or a topic in 2+ documents
    var strong = {}, seenIn = {};
    extractions.forEach(function (ex) { ex.mentions.forEach(function (m) { var k = m.t + '|' + keyFor(m.t, m.n), c = amap[k] || k; if (!m.w) strong[c] = 1; (seenIn[c] = seenIn[c] || {})[ex.docId] = 1; }); });
    function keep(m) { if (!m.w) return true; var k = m.t + '|' + keyFor(m.t, m.n), c = amap[k] || k; return strong[c] || (m.t === 'concept' && Object.keys(seenIn[c]).length >= 2) || (m.t === 'person' && Object.keys(seenIn[c]).length >= 3); }
    function nodeFor(m) {
      var k = m.t + '|' + keyFor(m.t, m.n); if (!keyFor(m.t, m.n)) return null;
      var c = amap[k] || k, id = c;
      var n = nodes[id] || (nodes[id] = { id: id, type: c.split('|')[0], label: null, labels: {}, aliases: {}, mentions: 0, docs: {}, snippets: [], emails: {} });
      if (c === k || m.t === n.type && /\s/.test(m.n)) n.labels[m.n] = (n.labels[m.n] || 0) + 1;
      if (m.t === 'email') n.emails[m.n] = 1; else if (m.e) n.emails[m.e] = 1;
      if (m.alias) n.aliases[m.alias] = 1;
      if (c !== k) n.aliases[m.n] = 1;
      return n;
    }
    extractions.forEach(function (ex) {
      var bySent = {}, byPara = {}, inDoc = {};
      ex.mentions.forEach(function (m) {
        if (!keep(m)) return;
        var n = nodeFor(m); if (!n) return;
        n.mentions++; n.docs[ex.docId] = (n.docs[ex.docId] || 0) + 1;
        if (n.snippets.length < 40 && !n.snippets.some(function (x) { return x.docId === ex.docId && x.s === m.s; })) n.snippets.push({ docId: ex.docId, doc: docName[ex.docId] || ex.docId, s: m.s, text: m.x, ai: !!m.ai });
        (bySent[m.s] = bySent[m.s] || {})[n.id] = 1; (byPara[m.p] = byPara[m.p] || {})[n.id] = 1; inDoc[n.id] = (inDoc[n.id] || 0) + 1;
      });
      function link(ids, w, kind) {
        ids = Object.keys(ids); if (ids.length > 40) ids = ids.slice(0, 40);
        for (var i = 0; i < ids.length; i++) for (var j = i + 1; j < ids.length; j++) {
          var a = ids[i] < ids[j] ? ids[i] : ids[j], b = ids[i] < ids[j] ? ids[j] : ids[i], k = a + '\u0001' + b;
          var e = edges[k] || (edges[k] = { source: a, target: b, weight: 0, sentence: 0, paragraph: 0, document: 0, docs: {} });
          e.weight += w; e[kind]++; e.docs[ex.docId] = 1;
        }
      }
      Object.keys(bySent).forEach(function (s) { link(bySent[s], 3, 'sentence'); });
      Object.keys(byPara).forEach(function (p) { link(byPara[p], 1, 'paragraph'); });
      var top = {}; Object.keys(inDoc).sort(function (a, b) { return inDoc[b] - inDoc[a]; }).slice(0, 12).forEach(function (id) { top[id] = 1; });
      link(top, 0.5, 'document');
      (ex.decisions || []).forEach(function (d) {
        var who = ex.mentions.filter(function (m) { return m.s === d.s && keep(m); }).map(function (m) { var n = nodeFor(m); return n && n.id; }).filter(Boolean).filter(function (x, i, a) { return a.indexOf(x) === i; });
        decisions.push({ text: d.text, date: d.date, docId: ex.docId, doc: docName[ex.docId] || ex.docId, entities: who });
      });
    });
    var list = Object.keys(nodes).map(function (id) {
      var n = nodes[id], labels = Object.keys(n.labels);
      n.label = labels.sort(function (a, b) { return n.labels[b] - n.labels[a] || b.length - a.length; })[0] || id.split('|')[1];
      if (n.type === 'person' && n.label === n.label.toLowerCase()) n.label = titleCase(n.label);
      delete n.aliases[n.label];
      n.aliases = Object.keys(n.aliases).concat(labels.filter(function (l) { return l !== n.label; })).filter(function (x, i, a) { return a.indexOf(x) === i; });
      n.docCount = Object.keys(n.docs); n.docIds = n.docCount; n.docCount = n.docIds.length; n.emails = Object.keys(n.emails);
      delete n.labels; delete n.docs; return n;
    });
    var ids = {}; list.forEach(function (n) { ids[n.id] = n; });
    var elist = Object.keys(edges).map(function (k) { var e = edges[k]; e.docIds = Object.keys(e.docs); delete e.docs; e.weight = Math.round(e.weight * 10) / 10; return e; })
      .filter(function (e) { return ids[e.source] && ids[e.target]; });
    list.forEach(function (n) { n.degree = 0; n.strength = 0; });
    elist.forEach(function (e) { ids[e.source].degree++; ids[e.target].degree++; ids[e.source].strength += e.weight; ids[e.target].strength += e.weight; });
    decisions.sort(function (a, b) { return (a.date || '9999').localeCompare(b.date || '9999'); });
    return { nodes: list.sort(function (a, b) { return b.mentions - a.mentions; }), edges: elist.sort(function (a, b) { return b.weight - a.weight; }), decisions: decisions, docs: docs.map(function (d) { return { id: d.id, name: d.name }; }) };
  }

  // ---------- filtering / lists ----------
  // f: {types:{person:true,...}, minWeight, docId, search, maxNodes}
  function filter(g, f) {
    f = f || {};
    var q = norm(f.search || ''), types = f.types || null, max = f.maxNodes || 150;
    var keep = g.nodes.filter(function (n) {
      if (types && !types[n.type]) return false;
      if (f.docId && n.docIds.indexOf(f.docId) < 0) return false;
      return true;
    });
    var keepIds = {}; keep.forEach(function (n) { keepIds[n.id] = n; });
    var edges = g.edges.filter(function (e) { return keepIds[e.source] && keepIds[e.target] && e.weight >= (f.minWeight || 0) && (!f.docId || e.docIds.indexOf(f.docId) >= 0); });
    if (q) {
      var hit = {}; keep.forEach(function (n) { if (norm(n.label).indexOf(q) >= 0 || n.aliases.some(function (a) { return norm(a).indexOf(q) >= 0; }) || n.emails.some(function (e) { return e.indexOf(q) >= 0; })) hit[n.id] = 1; });
      var nb = {}; Object.keys(hit).forEach(function (id) { nb[id] = 1; });
      edges.forEach(function (e) { if (hit[e.source]) nb[e.target] = 1; if (hit[e.target]) nb[e.source] = 1; });
      keep = keep.filter(function (n) { return nb[n.id]; });
      keepIds = {}; keep.forEach(function (n) { keepIds[n.id] = n; });
      edges = edges.filter(function (e) { return keepIds[e.source] && keepIds[e.target]; });
      keep.forEach(function (n) { n.hit = !!hit[n.id]; });
    } else keep.forEach(function (n) { n.hit = false; });
    if ((f.minWeight || 0) > 0) { var linked = {}; edges.forEach(function (e) { linked[e.source] = linked[e.target] = 1; }); keep = keep.filter(function (n) { return linked[n.id] || n.hit; }); }
    keep = keep.slice().sort(function (a, b) { return (b.hit - a.hit) || b.mentions - a.mentions; }).slice(0, max);
    keepIds = {}; keep.forEach(function (n) { keepIds[n.id] = 1; });
    return { nodes: keep, edges: edges.filter(function (e) { return keepIds[e.source] && keepIds[e.target]; }) };
  }
  function top(g, type, n) { return g.nodes.filter(function (x) { return x.type === type; }).sort(function (a, b) { return b.mentions - a.mentions || b.docCount - a.docCount; }).slice(0, n || 10); }
  function collaborators(g, n) {
    var ids = {}; g.nodes.forEach(function (x) { ids[x.id] = x; });
    return g.edges.filter(function (e) { return ids[e.source] && ids[e.target] && ids[e.source].type === 'person' && ids[e.target].type === 'person'; })
      .slice(0, n || 20).map(function (e) { return { a: ids[e.source].label, b: ids[e.target].label, weight: e.weight, sentences: e.sentence, documents: e.docIds.length }; });
  }
  function neighbours(g, id) {
    var ids = {}; g.nodes.forEach(function (x) { ids[x.id] = x; });
    return g.edges.filter(function (e) { return e.source === id || e.target === id; }).map(function (e) { var o = ids[e.source === id ? e.target : e.source]; return { node: o, weight: e.weight }; }).filter(function (x) { return x.node; });
  }

  // ---------- force-directed layout (Fruchterman–Reingold with cooling) ----------
  function rand(seed) { var s = seed || 1; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function createSim(nodes, edges, w, h, seed) {
    var r = rand(seed || 7), idx = {}, N = nodes.length || 1, area = w * h, k = Math.sqrt(area / N) * 0.9, temp = Math.min(w, h) / 6;
    nodes.forEach(function (n, i) { idx[n.id] = i; if (n.x == null || isNaN(n.x)) { n.x = w / 2 + (r() - 0.5) * w * 0.8; n.y = h / 2 + (r() - 0.5) * h * 0.8; } n.dx = 0; n.dy = 0; });
    var maxW = Math.max.apply(null, edges.map(function (e) { return e.weight; }).concat([1]));
    var E = edges.map(function (e) { return [idx[e.source], idx[e.target], 0.4 + 0.6 * e.weight / maxW]; }).filter(function (e) { return e[0] != null && e[1] != null; });
    function tick() {
      var i, j, a, b, dx, dy, d2, d, f;
      for (i = 0; i < nodes.length; i++) { nodes[i].dx = 0; nodes[i].dy = 0; }
      for (i = 0; i < nodes.length; i++) for (j = i + 1; j < nodes.length; j++) {
        a = nodes[i]; b = nodes[j]; dx = a.x - b.x; dy = a.y - b.y; d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = r() - 0.5; dy = r() - 0.5; d2 = 0.5; }
        if (d2 > k * k * 16) continue;
        f = k * k / d2; a.dx += dx * f; a.dy += dy * f; b.dx -= dx * f; b.dy -= dy * f;
      }
      E.forEach(function (e) { a = nodes[e[0]]; b = nodes[e[1]]; dx = a.x - b.x; dy = a.y - b.y; d = Math.sqrt(dx * dx + dy * dy) || 0.01; f = d / k * e[2]; a.dx -= dx * f; a.dy -= dy * f; b.dx += dx * f; b.dy += dy * f; });
      var moved = 0;
      for (i = 0; i < nodes.length; i++) {
        a = nodes[i]; a.dx += (w / 2 - a.x) * 0.02 * k / 10; a.dy += (h / 2 - a.y) * 0.02 * k / 10;
        if (a.fixed) continue;
        d = Math.sqrt(a.dx * a.dx + a.dy * a.dy) || 1; var step = Math.min(d, temp);
        a.x += a.dx / d * step; a.y += a.dy / d * step; moved += step;
        a.x = Math.max(10, Math.min(w - 10, a.x)); a.y = Math.max(10, Math.min(h - 10, a.y));
      }
      temp = Math.max(0.5, temp * 0.97);
      return moved / N;
    }
    return { tick: tick, heat: function (t) { temp = t || Math.min(w, h) / 10; }, temperature: function () { return temp; } };
  }
  function layout(nodes, edges, w, h, iterations, seed) { var sim = createSim(nodes, edges, w, h, seed); for (var i = 0; i < (iterations || 200); i++) sim.tick(); return nodes; }

  // ---------- exports ----------
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function nodesCSV(g) {
    return ['id,label,type,mentions,documents,degree,aliases,emails'].concat(g.nodes.map(function (n) { return [n.id, n.label, n.type, n.mentions, n.docCount, n.degree, n.aliases.join('; '), n.emails.join('; ')].map(csvCell).join(','); })).join('\n') + '\n';
  }
  function edgesCSV(g) {
    var ids = {}; g.nodes.forEach(function (n) { ids[n.id] = n; });
    return ['source,target,source_label,target_label,weight,same_sentence,same_paragraph,same_document,documents'].concat(g.edges.map(function (e) { return [e.source, e.target, (ids[e.source] || {}).label, (ids[e.target] || {}).label, e.weight, e.sentence, e.paragraph, e.document, e.docIds.length].map(csvCell).join(','); })).join('\n') + '\n';
  }
  function xml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; }); }
  function toGraphML(g) {
    var o = ['<?xml version="1.0" encoding="UTF-8"?>', '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
      '  <key id="label" for="node" attr.name="label" attr.type="string"/>', '  <key id="type" for="node" attr.name="type" attr.type="string"/>',
      '  <key id="mentions" for="node" attr.name="mentions" attr.type="int"/>', '  <key id="documents" for="node" attr.name="documents" attr.type="int"/>',
      '  <key id="weight" for="edge" attr.name="weight" attr.type="double"/>', '  <graph id="knowledge" edgedefault="undirected">'];
    g.nodes.forEach(function (n) { o.push('    <node id="' + xml(n.id) + '"><data key="label">' + xml(n.label) + '</data><data key="type">' + n.type + '</data><data key="mentions">' + n.mentions + '</data><data key="documents">' + n.docCount + '</data></node>'); });
    g.edges.forEach(function (e, i) { o.push('    <edge id="e' + i + '" source="' + xml(e.source) + '" target="' + xml(e.target) + '"><data key="weight">' + e.weight + '</data></edge>'); });
    o.push('  </graph>', '</graphml>');
    return o.join('\n') + '\n';
  }
  function toJSON(g) {
    return JSON.stringify({ generator: 'Brahaspati Knowledge Graph Builder', documents: g.docs, nodes: g.nodes.map(function (n) { return { id: n.id, label: n.label, type: n.type, mentions: n.mentions, documents: n.docIds, aliases: n.aliases, emails: n.emails, snippets: n.snippets.slice(0, 10) }; }), edges: g.edges, decisions: g.decisions }, null, 2);
  }

  // ---------- optional AI result -> extra mentions ----------
  // ai: {people:[], organisations:[], projects:[], topics:[]} ; text of the document to find snippets
  function mentionsFromAI(ai, text) {
    var paras = structure(text), out = [], groups = { person: ai.people, organisation: ai.organisations || ai.organizations, project: ai.projects, concept: ai.topics };
    Object.keys(groups).forEach(function (t) {
      (Array.isArray(groups[t]) ? groups[t] : []).slice(0, 40).forEach(function (name) {
        name = String(name || '').trim(); if (!name || name.length > 80) return;
        var si = -1, found = false, low = name.toLowerCase();
        paras.forEach(function (p, pi) { p.sentences.forEach(function (s) { si++; if (s.toLowerCase().indexOf(low) >= 0) { found = true; out.push({ t: t, n: name, s: si, p: pi, x: s.length > 260 ? s.slice(0, 257) + '…' : s, ai: 1 }); } }); });
        if (!found) out.push({ t: t, n: name, s: -1, p: -1, x: '(named by AI — exact wording not found in the text)', ai: 1 });
      });
    });
    return out;
  }

  var L = { splitSentences: splitSentences, structure: structure, findDates: findDates, keyphrases: keyphrases, extract: extract, aliasMap: aliasMap, build: build, filter: filter, top: top, collaborators: collaborators, neighbours: neighbours,
    createSim: createSim, layout: layout, nodesCSV: nodesCSV, edgesCSV: edgesCSV, toGraphML: toGraphML, toJSON: toJSON, mentionsFromAI: mentionsFromAI, keyFor: keyFor, norm: norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.KnowledgeGraphLib = L;
})(this);
