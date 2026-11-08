/* Contract Risk Scanner — pure logic (no DOM). Browser: window.ContractLib. Node: require('./lib.js').
   Rule-based: regular expressions find common clause types, numbers and dates. It is a reading aid, NOT legal advice. */
(function (root) {
  'use strict';
  var B = (typeof require === 'function' && typeof module !== 'undefined' && module.exports) ? require('../../assets/core.js') : root.B;

  // ---------- number words ----------
  var UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  var TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  var NUMWORD = '(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|one hundred(?: and \\w+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)';
  function wordsToNum(w) {
    w = String(w).toLowerCase().trim();
    if (/^\d+(\.\d+)?$/.test(w)) return +w;
    if (/^one hundred/.test(w)) { var rest = w.replace(/^one hundred( and)?\s*/, ''); return 100 + (rest ? wordsToNum(rest) || 0 : 0); }
    var parts = w.split(/[- ]/), n = 0;
    for (var i = 0; i < parts.length; i++) { if (parts[i] in TENS) n += TENS[parts[i]]; else if (parts[i] in UNITS) n += UNITS[parts[i]]; else return null; }
    return n;
  }
  // "thirty (30) days" -> "30 days", "sixty days" -> "60 days"
  function normaliseNumbers(s) {
    return String(s)
      .replace(new RegExp('\\b' + NUMWORD + '\\s*\\((\\d+)\\)', 'gi'), '$1')
      .replace(new RegExp('\\b(' + NUMWORD + ')\\b(?=\\s*(?:\\(|business |calendar |clear |working |consecutive )?\\s*(?:days?|weeks?|months?|years?|per ?cent|%))', 'gi'), function (m) { var n = wordsToNum(m); return n == null ? m : String(n); });
  }
  var UNIT_DAYS = { day: 1, week: 7, month: 30, year: 365 };
  // Find a duration in text: {value, unit, days, text}
  function parseDuration(s) {
    var m = normaliseNumbers(s).match(/(\d+(?:\.\d+)?)\s*(?:\)\s*)?(business |calendar |clear |working |consecutive )?(day|week|month|year)s?\b/i);
    if (!m) return null;
    var unit = m[3].toLowerCase(), v = +m[1], days = v * UNIT_DAYS[unit];
    if (m[2] && /business|working/i.test(m[2])) days = Math.ceil(v * 7 / 5);
    return { value: v, unit: unit, business: !!(m[2] && /business|working/i.test(m[2])), days: days, text: m[0].replace(/\s*\)\s*/, ' ') };
  }

  // ---------- text & clauses ----------
  function cleanText(t) {
    return String(t || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[ \t]+/g, ' ')
      .replace(/([^\n.;:])[ ]?\n[ ]?(?=[a-z(%$])/g, '$1 ') // join soft-wrapped lines (PDFs, emails) that continue mid-sentence
      .replace(/\n{3,}/g, '\n\n').trim();
  }
  var HEAD_NUM = /^\s*(?:clause\s+|section\s+|article\s+)?(\d{1,2}(?:\.\d{1,2}){0,3})[.)]?\s+(\S.*)$/i;
  var HEAD_SCHED = /^\s*(schedule|annexure|appendix|exhibit|part)\s+([0-9A-Z]{1,3})\b[.:\s-]*(.*)$/i;
  function isCapsHeading(line) { var l = line.trim(); return l.length >= 4 && l.length <= 70 && /[A-Z]/.test(l) && l === l.toUpperCase() && !/[.;,]$/.test(l) && /^[A-Z0-9 &'()\/-]+$/.test(l); }
  function shortTitle(s) { s = s.trim(); var m = s.match(/^([^.:;]{2,70})(?:[.:;]|$)/); return m && m[1].split(' ').length <= 9 ? m[1].trim() : s.split(' ').slice(0, 7).join(' ') + '…'; }
  // Split into clauses at numbered headings (1., 2.3, Clause 4), Schedules and ALL-CAPS headings.
  function splitClauses(text) {
    text = cleanText(text);
    var lines = text.split('\n'), out = [], cur = { num: '', heading: 'Opening / parties', lines: [] }, top = '';
    function push() { var body = cur.lines.join('\n').trim(); if (body || cur.num) out.push({ num: cur.num, heading: cur.heading, text: body }); }
    lines.forEach(function (line) {
      var m = line.match(HEAD_NUM), s = !m && line.match(HEAD_SCHED);
      // A line such as "30 days after..." or "2026 rent" is not a heading: require a letter after the number and a sensible number.
      if (m && /^[A-Za-z"(]/.test(m[2]) && +m[1].split('.')[0] <= 60 && !/^(?:days?|weeks?|months?|years?|business|calendar|working|per\b|percent|hours?|minutes?|km|kilomet|am\b|pm\b|and\b|or\b|to\b|of\b)/i.test(m[2])) {
        push();
        var isTop = m[1].indexOf('.') < 0, title = shortTitle(m[2]);
        var isTitleOnly = m[2].length <= 70 && !/[.;]$/.test(m[2].trim()) && m[2].split(' ').length <= 9;
        if (isTop) top = title;
        cur = { num: m[1], heading: isTop ? title : (top || title), lines: isTitleOnly && isTop ? [] : [m[2]] };
      } else if (s) {
        push(); var st = s[3].replace(/^[\s—–:-]+/, '').trim(); top = (s[1] + ' ' + s[2] + (st ? ' — ' + st : '')).trim();
        cur = { num: s[1][0].toUpperCase() + s[1].slice(1).toLowerCase() + ' ' + s[2], heading: top, lines: [] };
      } else if (isCapsHeading(line) && cur.lines.join('').length > 0) {
        push(); top = line.trim(); cur = { num: '', heading: line.trim(), lines: [] };
      } else cur.lines.push(line);
    });
    push();
    return out.filter(function (c) { return c.text; }) // heading-only lines live on as the heading of their sub-clauses
      .map(function (c, i) { c.index = i; return c; });
  }

  // ---------- extractors ----------
  function noticeDays(s) {
    var t = normaliseNumbers(s), m;
    var res = [
      /(?:at least|not less than|no less than|minimum of|a minimum of)?\s*(\d+)\s*(?:\)\s*)?(business |calendar |clear |working )?(day|week|month)s?'?\s*(?:prior |advance |previous )?(?:written )?notice/i,
      /notice (?:period )?of (?:at least |not less than |no less than )?(\d+)\s*(business |calendar |clear |working )?(day|week|month)s?/i,
      /(?:at least|not less than|no less than)\s*(\d+)\s*(business |calendar |clear |working )?(day|week|month)s?\s*(?:before|prior to)/i,
      /(\d+)\s*(business |calendar |working )?(day|week|month)s?\s*(?:before|prior to) (?:the )?(?:end|expiry|expiration)/i
    ];
    for (var i = 0; i < res.length; i++) if ((m = t.match(res[i]))) {
      var v = +m[1], u = m[3].toLowerCase(), d = v * UNIT_DAYS[u]; if (m[2] && /business|working/i.test(m[2])) d = Math.ceil(v * 7 / 5);
      return { days: d, value: v, unit: u, business: !!(m[2] && /business|working/i.test(m[2])), text: v + ' ' + (m[2] || '').trim() + (m[2] ? ' ' : '') + u + (v === 1 ? '' : 's') };
    }
    return null;
  }
  function paymentTerms(s) {
    var t = normaliseNumbers(s), o = {}, m;
    if ((m = t.match(/\bnet\s*(\d+)\b/i)) || (m = t.match(/within\s+(\d+)\s*(?:business |calendar )?days?\s+(?:of|from|after)\s+(?:the\s+)?(?:date of\s+|receipt of\s+|issue of\s+)?(?:a\s+|the\s+|each\s+|any\s+|an\s+)?(?:valid\s+|correctly rendered\s+|tax\s+)?invoice/i)) ||
        (m = t.match(/(\d+)\s*days?\s+(?:from|after|of)\s+(?:the\s+)?(?:date of\s+)?(?:the\s+)?invoice/i)) || (m = t.match(/payable\s+within\s+(\d+)\s*days?/i))) o.netDays = +m[1];
    if ((m = t.match(/end of (?:the )?month (?:following|after)/i))) o.eom = true;
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:%|per ?cent)\s*(?:per\s+|a\s+|each\s+)?(annum|year|month|week|day)/i))) { o.interest = +m[1]; o.interestPer = /annum|year/i.test(m[2]) ? 'year' : m[2].toLowerCase(); o.interestYearly = o.interest * ({ year: 1, month: 12, week: 52, day: 365 })[o.interestPer]; }
    if ((m = t.match(/late (?:payment )?(?:fee|charge|administration fee)[^.$]{0,40}(\$\s?[\d,]+(?:\.\d{2})?)/i)) || (m = t.match(/(\$\s?[\d,]+(?:\.\d{2})?)[^.]{0,40}late (?:payment )?(?:fee|charge)/i))) o.lateFee = m[1].replace(/\s/g, '');
    if (/in advance/i.test(t)) o.inAdvance = true;
    return o;
  }
  function percentIn(s) { var m = normaliseNumbers(s).match(/(\d+(?:\.\d+)?)\s*(?:%|per ?cent)/i); return m ? +m[1] : null; }
  function restraintDetails(s) {
    var o = {}, d = parseDuration((s.match(/(?:for|during)\s+(?:a\s+)?(?:period\s+of\s+)?[^.;]{0,30}?(?:day|week|month|year)s?[^.;]{0,40}(?:after|following|from)/i) || [s])[0]);
    if (d) o.duration = d;
    var a = s.match(/within\s+(?:a\s+)?(?:radius of\s+)?(\d+)\s*(?:km|kilomet(?:re|er)s?)/i) || s.match(/(\d+)\s*(?:km|kilomet(?:re|er)s?)\s*(?:radius|of)/i);
    if (a) o.area = a[1] + ' km radius';
    else if ((a = s.match(/(?:anywhere )?in (?:the )?(?:state of |Commonwealth of )?(Australia|New South Wales|Victoria|Queensland|Western Australia|South Australia|Tasmania|Northern Territory|Australian Capital Territory|ACT|NSW|VIC|QLD|WA|SA|TAS|NT|New Zealand|[A-Z][a-z]+ (?:metropolitan|CBD) area|the world)\b/))) o.area = a[1];
    return o;
  }
  function capDetails(s) {
    var m = s.match(/(?:shall not exceed|will not exceed|limited to|capped at|cap(?:ped)? of|maximum (?:aggregate )?(?:amount )?of|not exceed)\s*(?:the\s+(?:lesser|greater)\s+of\s+)?([^.;]{0,120})/i);
    return m ? m[1].trim().replace(/\s+/g, ' ').slice(0, 120) : null;
  }
  function lawPlace(s) {
    var m = s.match(/laws? (?:in force )?(?:of|in) (?:the )?(?:State of |Commonwealth of |Province of )?([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+){0,3})/);
    return m ? m[1].replace(/ (and|Australia)$/, function (x) { return x === ' Australia' ? ' Australia' : ''; }) : null;
  }
  var AU_PLACES = /Australia|New South Wales|Victoria|Queensland|Western Australia|South Australia|Tasmania|Northern Territory|Australian Capital Territory/;

  // ---------- detectors ----------
  // sev: high (3), medium (2), low (1), info (0). Each test is run on one clause; `when` refines.
  var D = [
    { id: 'autoRenewal', label: 'Automatic renewal / rollover', sev: 'high',
      re: /automatic(?:ally)?\s+(?:be\s+)?(?:renew|extend|roll)|auto-?renew|(?:shall|will)\s+(?:be\s+)?(?:renew|extend)(?:ed|s)?\s+(?:automatically|for\s+(?:a\s+)?(?:further|successive|subsequent|additional))|roll(?:s|ed)?\s*over|rollover|successive (?:renewal )?(?:periods|terms)|evergreen|continue(?:s)?\s+(?:on|for)\s+(?:a\s+)?(?:month[- ]to[- ]month|monthly|rolling)/i,
      explain: 'The contract keeps going (and you keep paying) unless someone cancels in time. Miss the notice window and you may be locked in for another full term.',
      ask: ['Can we change this to renew only if we both agree in writing?', 'Will you send a reminder before the renewal date?', 'Can a renewed term be cancelled on 30 days\' notice instead of a full new term?'],
      details: function (s) { var o = {}, n = noticeDays(s), d = parseDuration((s.match(/(?:further|successive|additional|subsequent|renewal)\s+(?:term|period)s?\s+of\s+[^.;,]{1,30}|for\s+(?:a\s+)?(?:further|successive|additional)\s+(?:period|term)s?\s+of\s+[^.;,]{1,30}|for\s+(?:a\s+)?(?:further|successive|additional)\s+[^.;,]{1,30}?(?:month|year)s?/i) || [''])[0]); if (n) o.notice = n; if (d) o.renewalTerm = d; return o; } },
    { id: 'termination', label: 'Termination and notice', sev: 'low',
      re: /terminat(?:e|ion|es|ed|ing)|cancel(?:lation|led|s)?\s+(?:this|the)\s+(?:agreement|contract)|end this agreement/i,
      explain: 'How either side can end the contract and how much notice is needed. Check whether you can leave for convenience, or only if the other side does something wrong.',
      ask: ['Can we terminate for convenience on reasonable notice, the same as you can?', 'What do we owe if we terminate early?', 'What happens to our data and work in progress on termination?'],
      details: function (s) { var o = {}, n = noticeDays(s); if (n) o.notice = n; if (/for convenience|without cause|for any reason|at any time/i.test(s)) o.convenience = true; if (/immediately|immediate effect/i.test(s)) o.immediate = true; return o; },
      bump: function (det, s) { return det.convenience && /(?:supplier|provider|company|landlord|lessor|we|us|employer|licensor)\s+may\s+(?:terminate|end)[^.]{0,80}(?:for convenience|without cause|for any reason|at any time)/i.test(s) && !/either party may/i.test(s) ? 'medium' : null; } },
    { id: 'payment', label: 'Payment terms', sev: 'low',
      re: /\bpay(?:able|ment|ments)?\b[^.]{0,80}\b(?:within|days|invoice|in advance|monthly|net)\b|\binvoice[sd]?\b|\bnet\s*\d+\b|late (?:payment )?fee|interest (?:on|at|is payable|will be charged)|overdue (?:amounts|rent|invoices)|\b(?:salary|wages?)\b|paid (?:weekly|fortnightly|monthly)/i,
      explain: 'When money is due, and what happens if it is late. Long payment terms hurt your cash flow if you are the one being paid; late fees and interest matter if you are paying.',
      ask: ['Can payment terms be 14 days (or 30 days if we are paying)?', 'Is there a grace period before late fees or interest start?', 'Can disputed invoice amounts be withheld without penalty while we sort them out?'],
      details: paymentTerms,
      bump: function (det) { return (det.interestYearly && det.interestYearly > 12) || (det.netDays && det.netDays > 45) ? 'medium' : null; } },
    { id: 'priceIncrease', label: 'Price increases / CPI', sev: 'medium',
      re: /\bCPI\b|consumer price index|(?:increase|adjust|review|vary)(?:d|s)?\s+(?:the\s+)?(?:fees?|prices?|charges?|rates?|rent|subscription)|(?:fees?|prices?|charges?|rates?|rent)\s+(?:will|shall|may)\s+(?:be\s+)?(?:increase|adjust|review)|price (?:review|adjustment|increase)|market (?:rent )?review|(?:annual|yearly)\s+(?:increase|review|escalation)|escalat(?:e|ion)/i,
      explain: 'The price can go up during the contract. A fixed percentage is predictable; "at our discretion" or market reviews are not.',
      ask: ['Can increases be capped (for example CPI or 3%, whichever is lower)?', 'How much notice will we get of an increase, and can we leave without a fee if we do not accept it?'],
      details: function (s) { var o = {}, p = percentIn(s); if (p != null) o.percent = p; if (/\bCPI\b|consumer price index/i.test(s)) o.cpi = true; if (/greater of/i.test(s)) o.greaterOf = true; if (/(?:sole|absolute) discretion|from time to time|at any time/i.test(s)) o.discretion = true; if (/market/i.test(s)) o.market = true; return o; },
      bump: function (det) { return det.discretion || det.greaterOf || (det.percent && det.percent > 5) ? 'high' : null; } },
    { id: 'liabilityCap', label: 'Limit on liability', sev: 'info',
      re: /limitation of liability|limit(?:ation)? (?:on|of) liability|(?:aggregate|total|maximum)\s+liability|liability[^.]{0,100}(?:shall not exceed|will not exceed|limited to|capped)|(?:not|never)\s+be\s+liable\s+for\s+(?:any\s+)?(?:indirect|consequential)/i,
      explain: 'Caps how much one side can claim from the other if things go wrong. Check whose liability is capped and whether the cap is realistic compared with what you could lose.',
      ask: ['Does the cap apply to both parties equally?', 'Is the cap at least the fees paid over 12 months, and are data breaches and IP infringement outside the cap?'],
      details: function (s) { var o = {}, c = capDetails(s); if (c) o.cap = c; if (/consequential|indirect|loss of profit/i.test(s)) o.excludesConsequential = true; return o; } },
    { id: 'unlimitedLiability', label: 'Unlimited liability', sev: 'high',
      re: /unlimited liability|liability[^.]{0,60}(?:is|shall be|will be)\s+unlimited|(?:without|no)\s+limit(?:ation)?\s+(?:on|to|of)\s+(?:its|your|the customer's|the client's)?\s*liability|nothing in this (?:agreement|clause) limits[^.]{0,40}liability/i,
      explain: 'One side has no ceiling on what it could be asked to pay. If that side is you, a single claim could exceed the value of the whole contract.',
      ask: ['Can our total liability be capped (for example at the fees paid in the last 12 months)?', 'Which specific losses must stay uncapped, and why?'] },
    { id: 'indemnity', label: 'Indemnity', sev: 'high',
      re: /indemnif(?:y|ies|ied|ication)|\bindemnit(?:y|ies)\b|hold\s+(?:\w+\s+)?harmless/i,
      explain: 'You promise to cover the other side\'s losses (often including legal costs), sometimes even when they caused part of the problem. Indemnities often sit outside any liability cap.',
      ask: ['Can the indemnity be limited to losses caused by our breach or negligence, reduced to the extent you contributed?', 'Is the indemnity mutual?', 'Does the liability cap apply to the indemnity?'],
      details: function (s) { var o = {}; if (/mutual|each party (?:shall|will|must) indemnify/i.test(s)) o.mutual = true; if (/reduced to the extent|proportionate/i.test(s)) o.proportionate = true; return o; },
      bump: function (det) { return det.mutual || det.proportionate ? 'medium' : null; } },
    { id: 'exclusivity', label: 'Exclusivity', sev: 'medium',
      strip: /non-?\s?exclusive(?:ly)?\s+(?:supplier|provider|basis|arrangement|distributor|rights?|right to|licen[cs]e|dealing|jurisdiction)|(?:non-)?exclusive jurisdiction/gi,
      re: /exclusiv(?:e|ely)\s+(?:supplier|provider|basis|arrangement|distributor|rights?|right to|licen[cs]e|dealing)|exclusivity|sole (?:and exclusive )?(?:supplier|provider|distributor)|(?:shall|will|must) not (?:engage|appoint|purchase from|use|acquire)[^.]{0,40}(?:any )?(?:other|third|alternative)/i,
      explain: 'You may only buy from (or sell to) this party for the stated products or area. That limits your options if price or service slips.',
      ask: ['Can exclusivity end if service levels or prices are not met?', 'Can the scope (products, area, time) be narrowed?'] },
    { id: 'restraint', label: 'Non-compete / non-solicit (restraint)', sev: 'high',
      re: /non-?compet|non-?solicit|restraint of trade|restraint period|restrain(?:ed)? from|(?:(?:shall|will|must|may) not|neither party (?:shall|will|may))[^.]{0,80}(?:compete|solicit|entice|carry on (?:a|any) (?:similar|competing|competitive)|be (?:engaged|concerned|interested) in)/i,
      explain: 'Limits what you can do after the contract ends — who you can work for, which clients you can approach, and where. In Australia courts only enforce restraints that are reasonable, but fighting one is costly.',
      ask: ['Can the restraint period and area be reduced to what genuinely protects the business?', 'Does it apply only to clients we actually dealt with?', 'Is it a cascading clause (several periods/areas) — which one is intended?'],
      details: restraintDetails },
    { id: 'assignment', label: 'Assignment / change of control', sev: 'low',
      re: /\bassign(?:ment|s|ed)?\b[^.]{0,80}(?:rights|agreement|obligations|consent)|novat(?:e|ion)|change (?:of|in) control|transfer (?:this agreement|its rights)/i,
      explain: 'Whether either side can hand the contract to someone else (for example if their business is sold). If they can and you cannot, you could end up dealing with a stranger.',
      ask: ['Can assignment by either party require the other\'s written consent (not to be unreasonably withheld)?', 'Can we assign to a buyer of our business without consent?'] },
    { id: 'ip', label: 'Intellectual property ownership', sev: 'medium',
      re: /intellectual property|copyright|moral rights|(?:ownership|title)\s+(?:of|in|to)\s+(?:all\s+)?(?:deliverables|work product|materials|the (?:software|work))|vests?\s+in|\blicen[cs]e\s+(?:to use|is granted)/i,
      explain: 'Who owns what gets created. If you are paying for work, make sure you own it (or have a broad licence). If you are creating it, keep ownership of your existing tools and templates.',
      ask: ['Will we own the deliverables once paid for, or receive a perpetual licence?', 'Is pre-existing IP (templates, code libraries) clearly excluded and licensed?'],
      details: function (s) { var o = {}; if (/(?:vest|belong|owned by|remain the property of)[^.]{0,40}(?:supplier|provider|contractor|consultant|licensor|company)/i.test(s)) o.supplierOwns = true; if (/assign[^.]{0,40}(?:customer|client)/i.test(s)) o.assignedToClient = true; return o; } },
    { id: 'confidentiality', label: 'Confidentiality', sev: 'info',
      re: /confidential(?:ity)?|non-?disclosure/i,
      explain: 'Rules on keeping each other\'s information private. Check how long it lasts and the exceptions (information already public, required by law).',
      ask: ['Is the confidentiality obligation mutual?', 'How long does it last after the contract ends?'],
      details: function (s) { var o = {}, d = parseDuration((s.match(/(?:for|period of)\s+[^.;]{0,20}(?:year|month)s?\s+(?:after|following|from)/i) || [''])[0]); if (d) o.survives = d; if (/perpetu|indefinite|in perpetuity/i.test(s)) o.perpetual = true; return o; } },
    { id: 'governingLaw', label: 'Governing law / jurisdiction', sev: 'info',
      re: /governed by|governing law|laws? (?:in force )?(?:of|in) (?:the )?(?:State of |Commonwealth of )?[A-Z][a-z]+[^.]{0,40}(?:apply|govern)|(?:non-)?exclusive jurisdiction|submit to the (?:non-exclusive |exclusive )?jurisdiction/i,
      explain: 'Which state or country\'s law applies and where disputes go to court. A far-away jurisdiction makes any dispute slower and dearer for you.',
      ask: ['Can the governing law and courts be in our state?'],
      details: function (s) { var o = {}, p = lawPlace(s); if (p) o.place = p; return o; },
      bump: function (det) { return det.place && !AU_PLACES.test(det.place) ? 'medium' : null; } },
    { id: 'disputes', label: 'Dispute resolution', sev: 'info',
      re: /dispute resolution|\bdisputes?\b[^.]{0,80}(?:mediat|arbitrat|negotiat|escalat|refer)|arbitrat(?:ion|or)|mediat(?:ion|or)/i,
      explain: 'The steps for sorting out a disagreement before (or instead of) court. Mediation is usually cheap; arbitration can be expensive and private.',
      ask: ['Is there a step of senior managers talking, then mediation, before anything formal?', 'Who pays for mediation or arbitration?'],
      details: function (s) { var o = {}; if (/arbitrat/i.test(s)) o.arbitration = true; if (/mediat/i.test(s)) o.mediation = true; return o; },
      bump: function (det) { return det.arbitration ? 'low' : null; } },
    { id: 'minimumTerm', label: 'Minimum term / lock-in', sev: 'medium',
      re: /minimum (?:term|period|commitment|contract)|initial term|lock-?in|fixed term|(?:not|cannot) (?:be )?(?:entitled|able|permitted) to terminate[^.]{0,40}(?:before|during|prior)|term of (?:this (?:agreement|lease) is|the lease is)|(?:lease|agreement|contract) (?:is |will be )?for a (?:term|period) of|for a (?:fixed |initial )?term of/i,
      explain: 'You are committed for a set period. Leaving early may mean paying out the rest of the term.',
      ask: ['Can we have a break clause (for example after 12 months on 3 months\' notice)?', 'What exactly is payable if we leave early?'],
      details: function (s) { var o = {}, d = parseDuration((s.match(/(?:term|period|commitment)\s+(?:of|is)\s+[^.;]{1,40}?(?:day|week|month|year)s?/i) || [''])[0]); if (d) o.term = d; return o; } },
    { id: 'terminationFee', label: 'Early termination fee / break cost', sev: 'high',
      re: /(?:early\s+)?termination (?:fee|charge|payment)|break (?:fee|cost)|cancellation (?:fee|charge)|liquidated damages|(?:pay|payable)[^.]{0,80}(?:remaining|balance of the|remainder of the|unexpired)\s+(?:term|months|fees|period|charges)|all (?:fees|amounts|charges) (?:for|over) the (?:remaining|unexpired)/i,
      explain: 'Leaving early costs money — sometimes everything you would have paid for the rest of the term.',
      ask: ['Can the fee reduce over time, or be capped at (say) 3 months of fees?', 'Is the fee waived if we leave because you breached the contract?'],
      details: function (s) { var o = {}, m = s.match(/(\$\s?[\d,]+(?:\.\d{2})?)/); if (m) o.amount = m[1].replace(/\s/g, ''); if (/remaining|balance of the|remainder|unexpired/i.test(s)) o.restOfTerm = true; var p = percentIn(s); if (p != null) o.percent = p; return o; } },
    { id: 'privacy', label: 'Data and privacy', sev: 'info',
      re: /privacy|personal (?:information|data)|data protection|data breach|Privacy Act|\bAPPs?\b|customer data|data (?:security|storage|sovereignty)|stored (?:outside|offshore)/i,
      explain: 'How personal information is handled. If the other side holds your customers\' data, you remain responsible under the Privacy Act in many cases.',
      ask: ['Where is our data stored (onshore?) and who can access it?', 'How fast will you tell us about a data breach?', 'Will you return or delete our data when the contract ends?'],
      details: function (s) { var o = {}; if (/outside Australia|offshore|overseas/i.test(s)) o.offshore = true; var n = s.match(/(\d+)\s*hours?/i); if (n) o.breachNoticeHours = +n[1]; return o; },
      bump: function (det) { return det.offshore ? 'low' : null; } },
    { id: 'insurance', label: 'Insurance requirements', sev: 'low',
      re: /insurance|insured|public liability|professional indemnity|workers'? compensation|product liability/i,
      explain: 'Covers you must hold (and prove). Check you already have them at the required amounts, or price them in.',
      ask: ['Are the required cover amounts in line with the size of this job?', 'Do you need to be named on our policy, and is a certificate of currency enough?'],
      details: function (s) { var o = {}, m = s.match(/\$\s?\d[\d,]*(?:\.\d+)?\s*(?:million|m\b)?/gi); if (m) o.amounts = m.map(function (x) { return x.replace(/\s+/g, ' ').trim(); }); return o; } },
    { id: 'guarantee', label: 'Personal guarantee', sev: 'high',
      re: /personal(?:ly)?\s+guarant|guarantor|(?:directors?|principals?)\s+(?:shall|will|must)\s+guarantee|guarantee and indemnity|jointly and severally liable/i,
      explain: 'A person (usually a director or owner) promises to pay personally if the business does not. That puts your house and savings at risk, not just the company.',
      ask: ['Can the personal guarantee be removed, capped at a fixed amount, or limited in time?', 'Will a bank guarantee or larger deposit do instead?'] },
    { id: 'variation', label: 'One-sided right to change terms', sev: 'high',
      re: /(?:may|reserves? the right to)\s+(?:vary|amend|change|modify|update)\s+(?:these|this|the|any of the)\s+(?:terms|agreement|conditions|prices|fees|services)|by posting (?:the )?(?:updated|new|revised)|(?:terms|agreement) (?:may|can) be (?:varied|amended|changed) (?:at any time|from time to time)/i,
      explain: 'The other side can change the deal after you sign. Usually by email or by updating a web page.',
      ask: ['Can changes only take effect with both parties\' written agreement?', 'If you change terms, can we leave without any fee?'],
      when: function (s) { return !/(?:only|must|shall)\s+be\s+(?:varied|amended)[^.]{0,30}(?:writing|agreement|signed)|variation[^.]{0,40}(?:in writing|signed by (?:both|each))/i.test(s); } },
    { id: 'forceMajeure', label: 'Force majeure', sev: 'info',
      re: /force majeure|beyond (?:its|their|the party's) reasonable control|act of god/i,
      explain: 'Who carries the risk of events nobody controls (floods, pandemics, outages). Check you can exit if it drags on.',
      ask: ['If a force majeure event lasts more than 30–60 days, can either party terminate without cost?'] },
    { id: 'security', label: 'Bond / deposit / bank guarantee', sev: 'low',
      re: /security deposit|\bbond\b|bank guarantee|security amount/i,
      explain: 'Money held as security. Check how much, when it comes back and what can be taken from it.',
      ask: ['When and how is the bond/guarantee returned?', 'Can it reduce after a period of on-time payments?'] },
    { id: 'makeGood', label: 'Make good / reinstatement', sev: 'medium',
      re: /make good|reinstat(?:e|ement)[^.]{0,40}premises|restore the premises|remove (?:all )?(?:the )?(?:tenant's )?(?:fixtures|fit-?out)/i,
      explain: 'At the end of a lease you may have to return the premises to their original state at your cost — sometimes tens of thousands of dollars.',
      ask: ['Can we agree a written condition report at the start (with photos)?', 'Can make-good be limited to fair wear and tear, or settled as a fixed cash amount?'] },
    { id: 'warranty', label: 'Warranties and disclaimers', sev: 'info',
      re: /warrant(?:y|ies|s)|as is|fit(?:ness)? for (?:a |any )?particular purpose|merchantab/i,
      explain: 'Promises about quality and what happens if something is faulty. Australian Consumer Law guarantees cannot be excluded, even if the contract says "as is".',
      ask: ['What is the warranty period and what is the remedy (repair, replace, refund)?'],
      details: function (s) { var o = {}; if (/\bas is\b|disclaim|exclude[sd]? all (?:warranties|conditions)/i.test(s)) o.disclaimer = true; return o; },
      bump: function (det) { return det.disclaimer ? 'medium' : null; } },
    { id: 'probation', label: 'Probation', sev: 'info', re: /probation(?:ary)? period|probation/i,
      explain: 'A trial period during which notice is usually shorter.', ask: ['How long is probation and what notice applies during it?'] },
    { id: 'employmentStandards', label: 'Award / National Employment Standards', sev: 'info', re: /National Employment Standards|\bNES\b|Fair Work|modern award|\baward\b|enterprise agreement/i,
      explain: 'Minimum legal entitlements that a contract cannot go below.', ask: ['Which award (if any) covers this role, and what classification?'] },
    { id: 'returnDestroy', label: 'Return or destroy information', sev: 'info', re: /return or destroy|destroy[^.]{0,30}(?:confidential|information|copies)|return (?:all )?(?:confidential|documents|materials)/i,
      explain: 'What happens to shared information when the relationship ends.', ask: ['Can we keep one archive copy for legal/record-keeping reasons?'] },
    { id: 'permittedDisclosure', label: 'Permitted disclosures', sev: 'info', re: /required by law|already (?:in the )?public|publicly available|independently developed|lawfully (?:received|obtained)/i,
      explain: 'Standard exceptions to confidentiality (already public, required by law). Their absence makes an NDA stricter than normal.', ask: [] },
    { id: 'duration', label: 'How long obligations last', sev: 'info', re: /(?:continue|survive|remain in force|last|apply)s?[^.]{0,60}(?:for a period of|for|until)\s+[^.]{0,25}(?:year|month)s?|perpetu|indefinitely|survives? (?:the )?(?:termination|expiry)/i,
      explain: 'How long the promises keep binding you, including after the contract ends.', ask: [],
      details: function (s) { var o = {}, d = parseDuration((s.match(/(?:for a period of|for)\s+[^.]{0,25}?(?:year|month)s?/i) || [''])[0]); if (d) o.survives = d; if (/perpetu|indefinitely/i.test(s)) o.perpetual = true; return o; } },
    { id: 'optionRenew', label: 'Option to renew / extend', sev: 'info', re: /option to (?:renew|extend)|(?:option|right) (?:for|of) (?:a )?further term/i,
      explain: 'A right (usually yours) to extend. Options are lost if notice is not given in the exact window — diarise it.', ask: ['Can the option be exercised any time in the last 6–3 months rather than a single deadline?'],
      details: function (s) { var o = {}, n = noticeDays(s), d = parseDuration((s.match(/further (?:term|period)s? of [^.;,]{1,20}/i) || [''])[0]); if (n) o.notice = n; if (d) o.renewalTerm = d; return o; } },
    { id: 'delivery', label: 'Delivery, title and risk', sev: 'info', re: /delivery|title[^.]{0,30}pass|risk[^.]{0,30}pass|incoterm|\bDDP\b|\bFOB\b|\bEXW\b/i,
      explain: 'When goods are delivered and when ownership and the risk of loss move to the buyer.', ask: ['When do title and risk pass, and who insures the goods in transit?'] }
  ];
  var SEV_POINTS = { high: 12, medium: 6, low: 2, info: 0 };
  var SEV_ORDER = { high: 3, medium: 2, low: 1, info: 0 };
  var DETECTORS = {}; D.forEach(function (d) { DETECTORS[d.id] = d; });

  // ---------- contract types & checklists ----------
  var TYPES = {
    service: { label: 'Service agreement', expect: ['termination', 'payment', 'liabilityCap', 'ip', 'confidentiality', 'governingLaw', 'disputes', 'privacy', 'insurance', 'forceMajeure', 'warranty'] },
    lease: { label: 'Commercial lease', expect: ['termination', 'payment', 'priceIncrease', 'minimumTerm', 'assignment', 'insurance', 'security', 'makeGood', 'governingLaw', 'disputes'] },
    supply: { label: 'Supply agreement', expect: ['payment', 'termination', 'liabilityCap', 'priceIncrease', 'delivery', 'warranty', 'insurance', 'governingLaw', 'disputes', 'forceMajeure'] },
    employment: { label: 'Employment contract', expect: ['termination', 'payment', 'confidentiality', 'ip', 'employmentStandards', 'probation', 'privacy', 'governingLaw'] },
    nda: { label: 'Non-disclosure agreement (NDA)', expect: ['confidentiality', 'permittedDisclosure', 'returnDestroy', 'duration', 'governingLaw'] }
  };
  var MISSING_WHY = {
    termination: 'No clear way to end the contract. Without it you may be stuck, or it may be unclear how much notice to give.',
    payment: 'No clear payment terms. Disagreements about when money is due are the most common contract dispute.',
    liabilityCap: 'No limit on liability. Your exposure (or theirs) could be far bigger than the contract value.',
    ip: 'Nothing about who owns the work. By default the creator usually keeps copyright — the payer may not own what it paid for.',
    confidentiality: 'No confidentiality clause. Sensitive information you share may not be protected.',
    governingLaw: 'No governing law. If there is a dispute, even deciding which court hears it costs money.',
    disputes: 'No dispute process. A cheap step such as mediation before court can save a lot.',
    privacy: 'Nothing on personal information. If they handle your customers\' data, you need rules on security, storage and breaches.',
    insurance: 'No insurance requirements. If the other side causes damage and has no insurance, you may not recover anything.',
    forceMajeure: 'No force majeure clause. It is unclear who carries the risk of floods, pandemics or outages.',
    warranty: 'No warranty or quality promise. Agree what "done properly" means and the fix if it is not.',
    priceIncrease: 'No rent or price review clause. Check this is intentional — some leases put reviews in a schedule.',
    minimumTerm: 'No stated term or duration. Check when the obligations start and end.',
    assignment: 'Nothing on assignment. Can the other side hand the contract to someone else (or can you, if you sell the business)?',
    security: 'No bond or bank guarantee mentioned. Check whether one is expected elsewhere (e.g. in a letter of offer).',
    makeGood: 'No make-good clause. Find out now what condition the premises must be returned in.',
    delivery: 'Nothing on delivery, or when title and risk pass. Who carries the loss if goods are damaged in transit?',
    employmentStandards: 'No reference to the National Employment Standards or an award. Entitlements may be unclear.',
    probation: 'No probation period. Fine if intended, but notice during the first months may be longer than expected.',
    permittedDisclosure: 'No standard exceptions (already public, required by law). The NDA may be stricter than usual.',
    returnDestroy: 'Nothing about returning or destroying information when the NDA ends.',
    duration: 'No end date for the obligations. Check how long you are bound — "forever" is unusual except for trade secrets.'
  };
  function detectType(text) {
    var t = text.toLowerCase(), c = function (re) { return (t.match(re) || []).length; };
    var s = {
      lease: c(/\blease\b|landlord|tenant|lessor|lessee|premises|\brent\b|outgoings/g) * 2,
      employment: c(/\bemployee\b|\bemployer\b|employment|salary|superannuation|annual leave|probation|position description/g) * 2,
      nda: c(/non-disclosure|confidential information|disclosing party|receiving party|recipient/g) * 1.5 + (/non-disclosure agreement|confidentiality agreement|\bnda\b/.test(t) ? 10 : 0),
      supply: c(/\bgoods\b|supply agreement|purchase order|delivery|\bproducts?\b|\bbuyer\b|\bpurchaser\b/g) * 1.5,
      service: c(/\bservices?\b|service agreement|service levels?|statement of work|\bsow\b|deliverables|consult|subscription|support/g)
    };
    var best = 'service', v = -1; Object.keys(s).forEach(function (k) { if (s[k] > v) { v = s[k]; best = k; } });
    return { type: best, scores: s };
  }

  // ---------- dates, money, parties ----------
  var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  var MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  var DATE_RES = [
    { re: new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:day\\s+of\\s+)?' + MON + ',?\\s+(\\d{4})\\b', 'gi'), f: function (m) { return [+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]]; } },
    { re: new RegExp('\\b' + MON + '\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b', 'gi'), f: function (m) { return [+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]]; } },
    { re: /\b(\d{4})-(\d{2})-(\d{2})\b/g, f: function (m) { return [+m[1], +m[2] - 1, +m[3]]; } },
    { re: /\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\b/g, f: function (m) { return [+m[3], +m[2] - 1, +m[1]]; } } // Australian day-first
  ];
  function iso(y, mo, d) { var x = new Date(Date.UTC(y, mo, d)); if (x.getUTCFullYear() !== y || x.getUTCMonth() !== mo || x.getUTCDate() !== d) return null; return x.toISOString().slice(0, 10); }
  function addDays(isoDate, n) { var x = new Date(isoDate + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  function addMonths(isoDate, n) { var p = isoDate.split('-').map(Number), x = new Date(Date.UTC(p[0], p[1] - 1 + n, 1)); var last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(p[2], last)); return x.toISOString().slice(0, 10); }
  function addDuration(isoDate, d) { if (!d) return null; if (d.unit === 'year') return addMonths(isoDate, d.value * 12); if (d.unit === 'month') return addMonths(isoDate, d.value); return addDays(isoDate, d.unit === 'week' ? d.value * 7 : d.value); }
  // Date that is `notice` before an ISO date (months are calendar months)
  function before(isoDate, notice) { return notice.unit === 'month' && !notice.business ? addMonths(isoDate, -notice.value) : addDays(isoDate, -notice.days); }
  function findDates(text) {
    var out = [], seen = {};
    DATE_RES.forEach(function (r) {
      r.re.lastIndex = 0; var m;
      while ((m = r.re.exec(text))) {
        var p = r.f(m), d = iso(p[0], p[1], p[2]); if (!d || seen[m.index]) continue; seen[m.index] = 1;
        out.push({ date: d, raw: m[0], index: m.index, before: text.slice(Math.max(0, m.index - 90), m.index), after: text.slice(m.index + m[0].length, m.index + m[0].length + 40) });
      }
    });
    return out.sort(function (a, b) { return a.index - b.index; });
  }
  function findMoney(text) {
    var re = /(?:A\$|AU\$|AUD\s?|\$)\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?(?:\s?(?:million|m|k)\b)?|\b\d{1,3}(?:,\d{3})+(?:\.\d{2})?\s?(?:AUD|dollars)\b/gi, out = [], m, seen = {};
    while ((m = re.exec(text))) {
      var raw = m[0].trim(), n = parseFloat(raw.replace(/[^0-9.]/g, '')); if (/million|m$/i.test(raw)) n *= 1e6; else if (/k$/i.test(raw)) n *= 1e3;
      var ctxStart = Math.max(text.lastIndexOf('.', m.index) + 1, text.lastIndexOf('\n', m.index) + 1, m.index - 120);
      var ctxEnd = text.slice(m.index).search(/[.\n](?:\s|$)/); ctxEnd = ctxEnd < 0 ? text.length : Math.min(m.index + ctxEnd + 1, m.index + 160);
      var key = raw + '|' + text.slice(ctxStart, ctxEnd).trim(); if (seen[key]) continue; seen[key] = 1;
      out.push({ raw: raw, value: n, context: text.slice(ctxStart, ctxEnd).replace(/\s+/g, ' ').trim(), gst: /plus GST|\+ ?GST|excl(?:uding|\.)? GST|ex GST/i.test(text.slice(m.index, m.index + 40)) ? 'plus GST' : /incl(?:uding|\.)? GST|inc GST/i.test(text.slice(m.index, m.index + 40)) ? 'incl. GST' : '' });
    }
    return out;
  }
  function findParties(text) {
    var cut = text.search(/\n\s*(?:clause\s+)?1[.)]?\s+[A-Z]/i), head = text.slice(0, cut > 0 ? Math.min(cut, 3000) : 3000), parties = [], m, seen = {};
    // Name (ABN ...) ("Role")  or  Name ("Role")  or  Name, ABN ..., (the "Role")
    var re = /([A-Z][A-Za-z0-9&.,'’ -]{2,90}?)\s*(?:,?\s*\(?\s*(?:ABN|ACN)[:\s]*([\d ]{9,14})\)?)?\s*,?\s*\((?:the\s+|hereinafter\s+(?:called\s+|referred to as\s+)?)?["'“]([A-Z][A-Za-z ]{1,30})["'”]\)/g;
    while ((m = re.exec(head))) {
      var name = m[1].replace(/^(?:between|and|by|parties|this agreement is made between)\s+/i, '').replace(/^(?:\d+\.?\s*)/, '').trim().replace(/[,\s]+$/, '');
      name = name.replace(/^.*\b(?:between|and)\s+/i, '');
      if (name.length < 2 || seen[m[3]] || /\b(?:date|term|agreement|services?|premises|purpose|information|period|fee|rent)\b/i.test(m[3]) || /\b(?:on|is|are|will|shall|commences?)\b/.test(name)) continue; seen[m[3]] = 1;
      parties.push({ name: name, role: m[3].trim(), abn: m[2] ? m[2].replace(/\s+/g, ' ').trim() : '' });
    }
    if (!parties.length) {
      var co = head.match(/[A-Z][A-Za-z0-9&' -]{1,60}\s(?:Pty\.?\s?Ltd|Pty\.?\s?Limited|Limited|Ltd|Inc\.?|LLC)\b/g) || [];
      co.forEach(function (c) { c = c.replace(/^(?:between|and|by)\s+/i, '').trim(); if (!seen[c]) { seen[c] = 1; parties.push({ name: c, role: '', abn: '' }); } });
      var b = !parties.length && head.match(/between\s+([^,\n(]{3,80}?)\s+and\s+([^,\n(.]{3,80})/i);
      if (b) { parties.push({ name: b[1].trim(), role: '', abn: '' }); parties.push({ name: b[2].trim(), role: '', abn: '' }); }
    }
    return parties.slice(0, 6);
  }

  // ---------- scan ----------
  function scan(text, opts) {
    opts = opts || {};
    var clean = cleanText(text), clauses = splitClauses(clean), flags = [];
    clauses.forEach(function (c) {
      var body = c.text; if (!body.trim()) return; // heading-only lines are covered by their sub-clauses
      D.forEach(function (d) {
        var m = (d.strip ? body.replace(d.strip, ' ') : body).match(d.re); if (!m) return;
        if (d.when && !d.when(body)) return;
        var det = d.details ? d.details(body) : {}, sev = d.sev, b = d.bump ? d.bump(det, body) : null;
        if (b && SEV_ORDER[b] > SEV_ORDER[sev]) sev = b; else if (b && d.id === 'indemnity') sev = b; // mutual/proportionate indemnity is milder
        flags.push({ id: d.id, label: d.label, severity: sev, clause: c.index, clauseNum: c.num, heading: c.heading, match: m[0], details: det, explain: d.explain });
      });
    });
    // a liability cap clause that only says "nothing limits liability for..." is not a cap
    var typeInfo = detectType(clean), type = opts.type && TYPES[opts.type] ? opts.type : typeInfo.type;
    var found = {}; flags.forEach(function (f) { found[f.id] = (found[f.id] || 0) + 1; });
    var missing = TYPES[type].expect.filter(function (id) { return !found[id]; }).map(function (id) { return { id: id, label: DETECTORS[id].label, why: MISSING_WHY[id] || '' }; });
    var dates = findDates(clean), keyDates = keyDatesFrom(clean, dates, flags);
    var score = riskScore(flags, missing);
    return { text: clean, clauses: clauses, flags: flags, type: type, detectedType: typeInfo.type, typeLabel: TYPES[type].label, missing: missing, dates: dates, keyDates: keyDates,
      money: findMoney(clean), parties: findParties(clean), score: score, questions: questions(flags, missing), summary: summaryOf(flags) };
  }
  // One entry per clause type (worst severity, all clause refs)
  function summaryOf(flags) {
    var by = {};
    flags.forEach(function (f) {
      var s = by[f.id] || (by[f.id] = { id: f.id, label: f.label, severity: f.severity, clauses: [], details: {}, explain: f.explain });
      if (SEV_ORDER[f.severity] > SEV_ORDER[s.severity]) s.severity = f.severity;
      s.clauses.push(f.clauseNum || f.heading);
      Object.keys(f.details || {}).forEach(function (k) { if (s.details[k] == null) s.details[k] = f.details[k]; });
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return SEV_ORDER[b.severity] - SEV_ORDER[a.severity] || a.label.localeCompare(b.label); });
  }
  function riskScore(flags, missing) {
    var per = {}, reasons = [];
    flags.forEach(function (f) { var p = SEV_POINTS[f.severity]; if (!per[f.id] || per[f.id].points < p) per[f.id] = { points: p, f: f }; });
    var total = 0;
    Object.keys(per).forEach(function (k) {
      var x = per[k]; if (!x.points) return; total += x.points;
      reasons.push({ points: x.points, text: x.f.label + ' (' + (x.f.clauseNum ? 'clause ' + x.f.clauseNum : x.f.heading) + ')' + detailText(x.f.id, x.f.details) });
    });
    missing.forEach(function (m) { var p = /termination|payment|liabilityCap/.test(m.id) ? 6 : 3; total += p; reasons.push({ points: p, text: 'Missing: ' + m.label }); });
    reasons.sort(function (a, b) { return b.points - a.points; });
    var score = Math.min(100, total);
    return { score: score, level: score >= 50 ? 'High' : score >= 25 ? 'Medium' : 'Low', reasons: reasons };
  }
  function detailText(id, d) {
    d = d || {}; var bits = [];
    if (d.notice) bits.push(d.notice.text + ' notice');
    if (d.market) bits.push('market review');
    if (d.renewalTerm) bits.push('renews for ' + d.renewalTerm.text);
    if (d.netDays) bits.push('payment within ' + d.netDays + ' days');
    if (d.eom) bits.push('end of month following');
    if (d.interest) bits.push('interest ' + d.interest + '% per ' + d.interestPer);
    if (d.lateFee) bits.push('late fee ' + d.lateFee);
    if (d.cpi) bits.push('CPI-linked');
    if (d.percent != null && id === 'priceIncrease') bits.push(d.percent + '%');
    if (d.greaterOf) bits.push('"greater of" — always the higher rise');
    if (d.discretion) bits.push('at their discretion');
    if (d.cap) bits.push('cap: ' + d.cap);
    if (d.duration) bits.push(d.duration.text);
    if (d.area) bits.push(d.area);
    if (d.term) bits.push(d.term.text);
    if (d.amount) bits.push(d.amount);
    if (d.restOfTerm) bits.push('rest of the term payable');
    if (d.place) bits.push(d.place);
    if (d.mutual) bits.push('mutual');
    if (d.convenience) bits.push('termination for convenience');
    if (d.supplierOwns) bits.push('supplier keeps ownership');
    if (d.offshore) bits.push('data may go offshore');
    if (d.amounts) bits.push(d.amounts.join(', '));
    if (d.survives) bits.push('lasts ' + d.survives.text + ' after');
    if (d.perpetual) bits.push('no end date');
    if (d.disclaimer) bits.push('"as is" / disclaimers');
    return bits.length ? ' — ' + bits.join('; ') : '';
  }
  function questions(flags, missing) {
    var out = [], seen = {};
    summaryOf(flags).filter(function (s) { return s.severity !== 'info'; }).forEach(function (s) {
      (DETECTORS[s.id].ask || []).forEach(function (q) { if (!seen[q]) { seen[q] = 1; out.push({ topic: s.label, q: q, severity: s.severity }); } });
    });
    missing.forEach(function (m) { var q = 'The contract has nothing on ' + m.label.toLowerCase() + ' — can we add a clause?'; out.push({ topic: m.label, q: q, severity: 'missing' }); });
    return out;
  }

  // Key dates: start, end (stated or start + term), renewal, notice deadline (= end − notice period).
  function keyDatesFrom(text, dates, flags) {
    var out = [], start = null, end = null;
    dates.forEach(function (d) {
      var b = d.before.toLowerCase(), a = d.after.toLowerCase();
      if (!start && /(commenc\w*|start\w*|effective|begin\w*|from)\W{0,20}(date\W{0,10})?(is|on|of|means|:)?\s*(the\s+)?$/.test(b.slice(-60))) start = d;
      else if (!end && /(expir\w*|end\w*|until|terminat\w* on|ending on|end date|expiry date|finish\w*|to and including|up to)\W{0,20}(date\W{0,10})?(is|on|of|means|:)?\s*(the\s+)?$/.test(b.slice(-60))) end = d;
      else if (!start && /^\s*\(?(?:the\s+)?["']?(?:commencement|start|effective)\s+date/.test(a)) start = d;
    });
    // "from 1 July 2026 to 30 June 2029"
    var rng = text.match(new RegExp('from\\s+(?:and including\\s+)?(\\d{1,2}(?:st|nd|rd|th)?\\s+' + MON + ',?\\s+\\d{4})\\s+(?:to|until|and ending on)\\s+(?:and including\\s+)?(\\d{1,2}(?:st|nd|rd|th)?\\s+' + MON + ',?\\s+\\d{4})', 'i'));
    if (rng) { var ds = findDates(rng[0]); if (ds.length >= 2) { start = start || ds[0]; end = end || ds[1]; } }
    var term = null, tm = normaliseNumbers(text).match(/(?:initial|fixed|minimum)?\s*\bterm\s+of\s+(?:this\s+(?:agreement|lease|contract)\s+(?:is|will be)\s+)?(\d+)\s*(month|year)s?|for\s+(?:an?\s+)?(?:initial\s+|fixed\s+)?period\s+of\s+(\d+)\s*(month|year)s?\s+(?:commencing|starting|beginning|from)/i);
    if (tm) term = { value: +(tm[1] || tm[3]), unit: (tm[2] || tm[4]).toLowerCase(), text: (tm[1] || tm[3]) + ' ' + (tm[2] || tm[4]).toLowerCase() + 's' };
    var endDate = end ? end.date : null, endSrc = end ? 'stated in the contract ("' + end.raw + '")' : '';
    if (!endDate && start && term) { endDate = addDays(addDuration(start.date, term), -1); endSrc = 'start date + ' + term.text + ' term'; }
    if (start) out.push({ kind: 'start', label: 'Start date', date: start.date, source: 'stated in the contract ("' + start.raw + '")' });
    if (endDate) out.push({ kind: 'end', label: 'End of current term', date: endDate, source: endSrc });
    var renew = flags.filter(function (f) { return f.id === 'autoRenewal'; })[0];
    var withNotice = flags.filter(function (f) { return f.details && f.details.notice && (f.id === 'autoRenewal' || f.id === 'termination'); });
    var notice = (renew && renew.details.notice) || (withNotice[0] && withNotice[0].details.notice) || null;
    if (endDate && notice) {
      out.push({ kind: 'notice', label: (renew ? 'Last day to give notice so it does not renew' : 'Last day to give notice to end at term end') + ' (' + notice.text + ' before)', date: before(endDate, notice), source: 'end date − ' + notice.text + (notice.business ? ' (business days approximated as calendar weeks — check public holidays)' : '') });
    }
    var opt = flags.filter(function (f) { return f.id === 'optionRenew' && f.details.notice; })[0];
    if (endDate && opt) out.push({ kind: 'option', label: 'Last day to exercise the option to renew (' + opt.details.notice.text + ' before end)', date: before(endDate, opt.details.notice), source: 'end date − ' + opt.details.notice.text });
    if (endDate && renew) {
      var rt = renew.details.renewalTerm || term;
      out.push({ kind: 'renewal', label: 'Automatic renewal starts' + (rt ? ' (for ' + rt.text + ')' : ''), date: addDays(endDate, 1), source: 'day after the current term ends' });
    }
    return { items: out.sort(function (a, b) { return a.date < b.date ? -1 : 1; }), term: term, notice: notice };
  }

  // ---------- outputs ----------
  function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) { var out = [], s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); }
  function ics(items, title, stamp) {
    stamp = stamp || '20260101T000000Z';
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Brahaspati//Contract Risk Scanner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    items.forEach(function (it, i) {
      var d = it.date.replace(/-/g, ''), next = addDays(it.date, 1).replace(/-/g, '');
      lines.push('BEGIN:VEVENT', 'UID:' + d + '-' + it.kind + '-' + i + '@brahaspati', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + next,
        fold('SUMMARY:' + icsEscape((title ? title + ': ' : '') + it.label)), fold('DESCRIPTION:' + icsEscape(it.source + '. Check against the signed contract.')));
      if (it.kind === 'notice') lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape('Contract notice deadline in 14 days'), 'TRIGGER:-P14D', 'END:VALARM');
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }
  // Clause text as HTML with every flagged phrase wrapped in <mark>
  function highlight(text, phrases) {
    var spans = [];
    (phrases || []).forEach(function (p) {
      if (!p) return; var i = text.indexOf(p);
      while (i >= 0) { spans.push([i, i + p.length]); i = text.indexOf(p, i + p.length); }
    });
    spans.sort(function (a, b) { return a[0] - b[0]; });
    var merged = []; spans.forEach(function (s) { var l = merged[merged.length - 1]; if (l && s[0] <= l[1]) l[1] = Math.max(l[1], s[1]); else merged.push(s.slice()); });
    var out = '', pos = 0; merged.forEach(function (s) { out += B.esc(text.slice(pos, s[0])) + '<mark>' + B.esc(text.slice(s[0], s[1])) + '</mark>'; pos = s[1]; });
    return out + B.esc(text.slice(pos));
  }
  function reportHtml(r, name, today) {
    var e = B.esc;
    var h = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + e('Contract review — ' + (name || 'contract')) + '</title><style>' +
      'body{font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d1f24;margin:0;padding:32px;max-width:860px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}' +
      'table{width:100%;border-collapse:collapse;margin:8px 0}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}th{background:#f3f1ea}.muted{color:#5d6270}' +
      '.legal{border:2px solid #a66300;background:#fff7e6;padding:10px 14px;border-radius:8px}.high{color:#b42318;font-weight:700}.medium{color:#a66300;font-weight:700}.low{color:#1f7a46}.info{color:#5d6270}@media print{body{padding:0}}</style></head><body>';
    h += '<p class="muted">Contract review · ' + e(today || '') + '</p><h1>' + e(name || 'Contract') + '</h1>';
    h += '<p class="legal"><b>Not legal advice.</b> This is an automatic, rule-based reading aid. It can miss clauses or misread them. Have a lawyer review anything important before you sign.</p>';
    h += '<p>Type: <b>' + e(r.typeLabel) + '</b> · Risk score: <b class="' + r.score.level.toLowerCase() + '">' + r.score.score + '/100 (' + r.score.level + ')</b></p>';
    if (r.parties.length) h += '<p>Parties: ' + r.parties.map(function (p) { return e(p.name) + (p.role ? ' ("' + e(p.role) + '")' : '') + (p.abn ? ' ABN ' + e(p.abn) : ''); }).join('; ') + '</p>';
    h += '<h2>Why this score</h2><ul>' + r.score.reasons.map(function (x) { return '<li>' + e(x.text) + ' <span class="muted">+' + x.points + '</span></li>'; }).join('') + '</ul>';
    if (r.keyDates.items.length) h += '<h2>Key dates</h2><table><thead><tr><th>Date</th><th>What</th><th>How we got it</th></tr></thead><tbody>' + r.keyDates.items.map(function (k) { return '<tr><td>' + e(k.date) + '</td><td>' + e(k.label) + '</td><td class="muted">' + e(k.source) + '</td></tr>'; }).join('') + '</tbody></table>';
    h += '<h2>What we found</h2><table><thead><tr><th>Clause type</th><th>Level</th><th>Where</th><th>What it means</th></tr></thead><tbody>' +
      r.summary.map(function (s) { return '<tr><td><b>' + e(s.label) + '</b>' + e(detailText(s.id, s.details)) + '</td><td class="' + s.severity + '">' + e(s.severity) + '</td><td>' + e(s.clauses.filter(Boolean).join(', ')) + '</td><td>' + e(s.explain) + '</td></tr>'; }).join('') + '</tbody></table>';
    if (r.missing.length) h += '<h2>Usually present in a ' + e(r.typeLabel.toLowerCase()) + ' but not found</h2><ul>' + r.missing.map(function (m) { return '<li><b>' + e(m.label) + '</b> — ' + e(m.why) + '</li>'; }).join('') + '</ul>';
    if (r.questions.length) h += '<h2>Questions to ask the other party</h2><ol>' + r.questions.map(function (q) { return '<li>' + e(q.q) + ' <span class="muted">(' + e(q.topic) + ')</span></li>'; }).join('') + '</ol>';
    if (r.money.length) h += '<h2>Money amounts mentioned</h2><table><thead><tr><th>Amount</th><th>Context</th></tr></thead><tbody>' + r.money.map(function (m) { return '<tr><td>' + e(m.raw) + (m.gst ? ' <span class="muted">' + e(m.gst) + '</span>' : '') + '</td><td>' + e(m.context) + '</td></tr>'; }).join('') + '</tbody></table>';
    h += '<p class="muted">Made with the free Brahaspati Contract Risk Scanner. The contract text never left the browser.</p></body></html>';
    return h;
  }

  var L = {
    wordsToNum: wordsToNum, normaliseNumbers: normaliseNumbers, parseDuration: parseDuration, cleanText: cleanText, splitClauses: splitClauses,
    noticeDays: noticeDays, paymentTerms: paymentTerms, restraintDetails: restraintDetails, DETECTORS: DETECTORS, TYPES: TYPES, detectType: detectType,
    findDates: findDates, findMoney: findMoney, findParties: findParties, scan: scan, keyDatesFrom: keyDatesFrom, addDays: addDays, addMonths: addMonths,
    ics: ics, highlight: highlight, reportHtml: reportHtml, detailText: detailText, SEV_ORDER: SEV_ORDER
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.ContractLib = L;
})(this);
