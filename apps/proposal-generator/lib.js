/* Proposal Generator — pure logic (no DOM). Browser: window.ProposalLib. Node: require('./lib.js').
   Rule-based extraction from a client's brief, then an editable proposal with timeline and pricing options. */
(function (root) {
  'use strict';
  var B = (typeof require === 'function' && typeof module !== 'undefined' && module.exports) ? require('../../assets/core.js') : root.B;
  var GST = 0.1;

  function r2(n) { return Math.round((+n || 0) * 100) / 100; }
  function round50(n) { return Math.round((+n || 0) / 50) * 50; }
  function num(v, d) { var n = +v; return isFinite(n) ? n : (d || 0); }
  function cap(s) { s = String(s || '').trim(); return s.charAt(0).toUpperCase() + s.slice(1); }
  function uniq(a) { var seen = {}; return a.filter(function (x) { var k = String(x).toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; }); }

  // ---------- brief extraction ----------
  var MUST = /\b(?:must|need(?:s|ed)?|require[sd]?|required|essential|mandatory|has to|have to|critical|non-negotiable)\b/i;
  var SHOULD = /\b(?:should|expect(?:s|ed)?|important|prefer(?:red|ably)?)\b/i;
  var COULD = /\b(?:want(?:s|ed)?|would (?:also |really |ideally )?(?:like|love)|'d (?:also |really )?(?:like|love)|nice to have|ideally|would be (?:great|good|nice)|optional|if possible|bonus|looking for|hoping|keen (?:to|on))\b/i;
  var REQ_WORDS = new RegExp(MUST.source + '|' + SHOULD.source + '|' + COULD.source, 'i');
  var DELIV = /\b(?:pages?|seo|search engine|blog|training session|website|web ?site|site|app|application|portal|dashboard|report|reports|logo|brand(?:ing)?|design|designs|mock-?ups?|prototype|training|documentation|manual|integration|migration|workshop|strategy|plan|audit|system|automation|test(?:ing)? (?:plan|suite|scripts)|video|campaign|brochure|copy|content|newsletter|template|database|api|checkout|booking|e-?commerce|store|shop|crm|policy|handover|framework|pipeline)\b/i;
  var CONSTRAINT = /\b(?:budget|deadline|no later than|must (?:use|work with|integrate|be compatible|run on|be hosted)|compatible|existing|only|cannot|can't|without|limited|maximum|at most|no more than|comply|compliance|WCAG|accessib|privacy|security|secure|hosted in|onshore|Australia(?:n)? (?:hosting|data)|on-?prem|legacy|approval|sign-?off|stakeholders?|PCI|ISO ?27001)\b/i;
  var MONEY = /(?:A\$|AU\$|AUD\s?|\$)\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\s?(?:k|m|million|thousand)?\b|\b\d+(?:\.\d+)?\s?k\s?(?:AUD|dollars)\b/gi;
  function moneyValue(raw) { var n = parseFloat(String(raw).replace(/[^0-9.]/g, '')); if (/m(?:illion)?\b/i.test(raw) && !/thousand/i.test(raw)) n *= 1e6; else if (/k\b|thousand/i.test(raw)) n *= 1e3; return n; }

  function cleanText(t) { return String(t || '').replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[ \t]+/g, ' ').trim(); }
  // Break into units: bullet lines stay whole; prose is split into sentences.
  function units(text) {
    var out = [], section = '';
    cleanText(text).split('\n').forEach(function (line) {
      var l = line.trim(); if (!l) return;
      if (/^(?:from|to|cc|sent|date|subject|re):/i.test(l)) return;
      var bullet = l.match(/^(?:[-*•▪◦–]|\d{1,2}[.)]|[a-z][.)]|\(\w\))\s+(.*)$/);
      if (bullet) { out.push({ text: bullet[1].trim(), bullet: true, section: section }); return; }
      if (/:$/.test(l) && l.length < 80) { section = l.replace(/:$/, ''); return; }
      if (l.length < 60 && !/[.!?]$/.test(l) && /^[A-Z][A-Za-z &/-]+$/.test(l) && l.split(' ').length <= 6) { section = l; return; }
      l.replace(/([.!?])\s+(?=[A-Z0-9"(])/g, '$1\n').split('\n').forEach(function (s) { s = s.trim(); if (s) out.push({ text: s, bullet: false, section: section }); });
    });
    return out;
  }
  function priorityOf(s) { if (MUST.test(s)) return 'Must'; if (SHOULD.test(s)) return 'Should'; if (COULD.test(s)) return 'Could'; return 'Should'; }
  // "We need a new site that..." -> "A new site that..."
  function tidyReq(s) {
    s = s.replace(/^(?:also|and|plus|finally|ideally|importantly|additionally)[, ]+/i, '')
      .replace(/^(?:we|i|our team|the business|they)\s+(?:would (?:also |really )?like|'d (?:also )?like|also need|need|needs|want|wants|require|requires|must have|must|should have|should|are looking for|am looking for|expect|are hoping for|hope to have)\s+(?:to have\s+|to get\s+|you to\s+|someone to\s+)?(?:be able to\s+)?/i, function (m) { return /be able to\s+$/i.test(m) ? 'Able to ' : ''; })
      .replace(/^(?:it|this)\s+(?:must|should|needs to|has to|will need to)\s+/i, '')
      .replace(/^(?:must|should|needs? to|has to|would (?:also )?like(?: to have)?|nice to have:?|ideally,?|optional(?:ly)?:?)\s+(?:be able to\s+)?/i, function (m) { return /be able to/i.test(m) ? 'Able to ' : ''; })
      .replace(/^(?:there (?:must|should|needs to) be|we'd (?:also )?(?:like|love))\s+/i, '')
      .replace(/[.!]+$/, '').trim();
    return cap(s);
  }
  function findDates(text) {
    var out = [], m;
    var MON = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
    var re = new RegExp('\\b(?:(?:by|before|until|from|on|in|for|around|end of|start of|early|mid|late)\\s+)?(?:\\d{1,2}(?:st|nd|rd|th)?\\s+' + MON + '(?:,?\\s+\\d{4})?|' + MON + '\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|(?:the\\s+)?(?:end|start|beginning|middle) of\\s+' + MON + '(?:\\s+\\d{4})?|' + MON + '\\s+\\d{4}|\\d{1,2}/\\d{1,2}/\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|Q[1-4]\\s*(?:\\d{4}|FY\\d{2})?|(?:christmas|easter|new year|eofy|end of (?:the )?financial year)|(?:within|in|over)\\s+\\d+\\s+(?:weeks?|months?|days?)|\\d+\\s+(?:weeks?|months?)\\s+(?:from|after) (?:now|today|starting|kick-?off|approval|sign-?off))', 'gi');
    while ((m = re.exec(text))) {
      var s = Math.max(0, text.lastIndexOf('\n', m.index) + 1, m.index - 80), e = text.indexOf('\n', m.index); e = e < 0 ? text.length : Math.min(e, m.index + m[0].length + 60);
      out.push({ text: m[0].trim(), context: text.slice(s, e).trim() });
    }
    return out;
  }
  // target duration in weeks from "within 8 weeks", "in 3 months", "go live in 10 weeks"
  function targetWeeks(text) {
    var m = String(text).match(/(?:within|in|over|take|takes|about|around|under|less than|no more than)\s+(\d+)\s*(week|month)s?/i) || String(text).match(/(\d+)[- ](week|month)s?\s+(?:timeline|timeframe|project|deadline|turnaround)/i);
    if (!m) return null; return m[2].toLowerCase() === 'month' ? Math.round(+m[1] * 4.33) : +m[1];
  }
  function budgetOf(text) {
    var t = cleanText(text), lines = t.replace(/([.!?])\s+/g, '$1\n').split('\n'), best = null;
    lines.forEach(function (l) {
      if (!/budget|spend|up to|no more than|maximum|max\b|around|approx|between|ballpark|cap|afford|cost/i.test(l)) return;
      var ms = l.match(MONEY); if (!ms) return;
      var vals = ms.map(moneyValue).filter(function (v) { return v > 0; }); if (!vals.length) return;
      var b = { text: l.trim(), min: Math.min.apply(null, vals), max: Math.max.apply(null, vals) };
      if (vals.length === 1) { if (/up to|no more than|maximum|max\b|cap|under|below|less than/i.test(l)) b.min = null; else if (/at least|from|minimum|over/i.test(l)) b.max = null; }
      if (!best || /budget/i.test(l)) best = b;
    });
    return best;
  }
  function clientOf(text) {
    var t = cleanText(text), c = { name: '', company: '', email: '', phone: '' }, m;
    if ((m = t.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/))) c.email = m[0];
    if ((m = t.match(/^from:\s*"?([^<"\n]+?)"?\s*(?:<|$)/im))) c.name = m[1].trim();
    if (!c.name && (m = t.match(/(?:^|\n)\s*(?:kind regards|best regards|warm regards|regards|thanks(?: so much)?|thank you|cheers|many thanks|sincerely),?\s*\n+\s*([A-Z][a-zA-Z'-]+(?: [A-Z][a-zA-Z'-]+){0,2})\s*(?:\n|$)/i))) c.name = m[1].trim();
    if (!c.name && (m = t.match(/\b(?:my name is|i'm|i am)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)/))) c.name = m[1];
    if ((m = t.match(/\b([A-Z][\w&'.-]*(?: [A-Z][\w&'.-]*){0,4} (?:Pty\.? ?Ltd|Pty Limited|Limited|Ltd|Inc|Co\.|Group|Council|Foundation|Association|Clinic|Studio|Cafe|Café|Bakery|Dental|Physio|Plumbing|Electrical|Accounting|Legal|Lawyers|Realty|Consulting|Services|Solutions))\b/))) c.company = m[1].trim();
    else if ((m = t.match(/\b(?:at|from|for|of|with)\s+([A-Z][\w&'-]+(?:\s+[A-Z][\w&'-]+){0,3})(?=[,.\s])/)) && !/^(?:I|We|The|Our|Monday|Tuesday|Wednesday|Thursday|Friday|Christmas|Easter)$/.test(m[1])) c.company = m[1];
    if (!c.company && c.email && !/gmail|outlook|hotmail|yahoo|icloud|bigpond|live\.com|proton/i.test(c.email)) c.company = cap(c.email.split('@')[1].split('.')[0].replace(/-/g, ' '));
    if ((m = t.match(/(?:\+?61\s?|0)[2-478](?:[ -]?\d){8}\b/))) c.phone = m[0].trim();
    if (c.name && c.company && c.company.indexOf(c.name) === 0) c.company = '';
    return c;
  }
  function subjectOf(text) {
    var m = cleanText(text).match(/^(?:subject|re|rfq|rfp|project|title):\s*(.+)$/im);
    return m ? m[1].replace(/^(?:re|fw|fwd):\s*/i, '').trim() : '';
  }
  function extract(text) {
    var t = cleanText(text), us = units(t), reqs = [], constraints = [], deliverables = [];
    us.forEach(function (u) {
      var s = u.text, inReqSection = /requirement|scope|deliverable|need|must|feature|wish ?list|what we want/i.test(u.section);
      if (s.length < 6 || /^(?:hi|hello|dear|thanks|thank you|cheers|regards|kind regards|best)\b/i.test(s)) return;
      var isConstraint = CONSTRAINT.test(s) || MONEY.test(s); MONEY.lastIndex = 0;
      var isReq = REQ_WORDS.test(s) || (u.bullet && (inReqSection || DELIV.test(s)));
      if (/budget|\$\s?\d/i.test(s) && !DELIV.test(s)) isReq = false; // pure budget lines are constraints
      if (/^(?:please|can you|could you|let me know|looking forward|happy to|feel free)/i.test(s) && !DELIV.test(s)) isReq = false;
      if (isReq) {
        var r = { text: tidyReq(s), priority: priorityOf(s), source: s };
        if (/deliverable/i.test(u.section) || (DELIV.test(s) && r.priority !== 'Could' && !/\b(?:must|should|needs to|has to)\b/i.test(r.text))) deliverables.push(r.text);
        reqs.push(r);
      }
      if (isConstraint) constraints.push(s.replace(/[.!]+$/, ''));
    });
    var dates = findDates(t);
    return { requirements: uniqBy(reqs), deliverables: uniq(deliverables), constraints: uniq(constraints), dates: dates, budget: budgetOf(t), client: clientOf(t), subject: subjectOf(t), targetWeeks: targetWeeks(t),
      mentions: { integration: /integrat|api|xero|myob|shopify|stripe|salesforce|hubspot|sync/i.test(t), content: /content|copy|photos?|images?|wording/i.test(t), migration: /migrat|move (?:our|the) (?:data|site)|existing (?:site|data|system)/i.test(t), training: /train|handover|show (?:us|our team)/i.test(t), accessibility: /accessib|wcag/i.test(t), mobile: /mobile|phone|responsive/i.test(t) } };
  }
  function uniqBy(reqs) { var seen = {}; return reqs.filter(function (r) { var k = r.text.toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; }); }

  // ---------- proposal ----------
  var DEFAULT_PROFILE = {
    name: '', contactName: '', abn: '', email: '', phone: '', website: '', address: '', logo: '', gst: true,
    rates: [{ role: 'Project lead', rate: 165 }, { role: 'Specialist', rate: 135 }, { role: 'Designer', rate: 120 }],
    hoursPerWeek: 20, contingency: 15, validDays: 30, paymentDays: 14,
    terms: 'Payment due within {paymentDays} days of each invoice.\nPrices are in Australian dollars{gstNote}.\nThis proposal is valid for {validDays} days from the date above.\nWork outside the agreed scope is quoted as a change request before it starts, at the rates shown.\nYou own the final deliverables once all invoices are paid; we keep ownership of our pre-existing tools and templates and give you a licence to use them in the deliverables.\nEither party may end the engagement with 14 days\' written notice; work done to that date is payable.'
  };
  function phaseTemplate(ex, profile) {
    var n = ex.requirements.length, musts = ex.requirements.filter(function (r) { return r.priority === 'Must'; }).length;
    var build = Math.max(2, Math.ceil((n + musts) / 3)), hpw = num(profile.hoursPerWeek, 20), rates = profile.rates || DEFAULT_PROFILE.rates;
    var role = function (i) { return (rates[Math.min(i, rates.length - 1)] || {}).role || 'Specialist'; };
    var ph = [
      { name: 'Discovery and planning', weeks: 1, role: role(0), desc: 'Kick-off meeting, confirm requirements and priorities, agree the plan and success measures.' },
      { name: 'Design', weeks: Math.max(1, Math.round(build / 2)), role: role(2) , desc: 'Concepts and layouts for review; one round of consolidated feedback.' },
      { name: 'Build', weeks: build, role: role(1), desc: 'Build the agreed scope' + (ex.mentions.integration ? ', including integrations' : '') + ', with progress demos.' },
      { name: 'Testing and refinement', weeks: Math.max(1, Math.round(build / 3)), role: role(1), desc: 'Test against the requirements' + (ex.mentions.accessibility ? ' and accessibility (WCAG 2.2 AA)' : '') + ', fix issues, your acceptance testing.' },
      { name: 'Launch and handover', weeks: 1, role: role(0), desc: 'Go live, ' + (ex.mentions.training ? 'training session, ' : '') + 'handover notes and a check-in after launch.' }
    ];
    if (ex.mentions.migration) ph.splice(3, 0, { name: 'Data / content migration', weeks: 1, role: role(1), desc: 'Move existing content or data across and check it.' });
    // Fit to the client's target duration if one was given (each phase at least 1 week)
    var total = ph.reduce(function (s, p) { return s + p.weeks; }, 0), target = ex.targetWeeks;
    if (target && target < total && target >= ph.length) {
      var scale = target / total; ph.forEach(function (p) { p.weeks = Math.max(1, Math.round(p.weeks * scale)); });
      var over = ph.reduce(function (s, p) { return s + p.weeks; }, 0) - target;
      for (var i = ph.length - 1; over > 0 && i >= 0; i--) if (ph[i].weeks > 1) { ph[i].weeks--; over--; i++; if (i > ph.length - 1) i = ph.length - 1; }
    }
    ph.forEach(function (p) { p.hours = Math.round(p.weeks * hpw); p.parallel = false; });
    return ph;
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function joinList(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function understandingText(ex, title) {
    var must = ex.requirements.filter(function (r) { return r.priority === 'Must'; }).map(function (r) { return r.text.charAt(0).toLowerCase() + r.text.slice(1); });
    var p = [];
    p.push(title ? 'You have asked for a proposal for: ' + title + '.' : 'You have asked for a proposal.');
    if (must.length) p.push('From your brief, the must-haves are: ' + joinList(must.slice(0, 6)) + (must.length > 6 ? ', plus ' + (must.length - 6) + ' more listed below' : '') + '.');
    var nice = ex.requirements.filter(function (r) { return r.priority === 'Could'; }).length;
    if (nice) p.push('You also mentioned ' + nice + ' nice-to-have' + (nice > 1 ? 's' : '') + ', which we have kept as options so you can choose.');
    if (ex.targetWeeks) p.push('You would like it done within about ' + ex.targetWeeks + ' weeks.');
    else if (ex.dates.length) p.push('Timing you mentioned: ' + ex.dates[0].text + '.');
    if (ex.budget) p.push('You mentioned a budget of ' + budgetText(ex.budget) + '; the options below show what fits within it and what it would take to do more.');
    if (ex.constraints.length) p.push('We have noted your constraints (listed under assumptions) and planned around them.');
    return p.join(' ');
  }
  function money(n) { return B.fmt.money(Math.round(n)).replace(/\.00$/, ''); }
  function budgetText(b) { return b.min && b.max && b.min !== b.max ? money(b.min) + '–' + money(b.max) : b.max ? 'up to ' + money(b.max) : money(b.min); }
  function titleFrom(ex) {
    if (ex.subject) return cap(ex.subject.replace(/^(?:request for (?:quote|proposal)|rfq|rfp|quote request|enquiry|inquiry)\s*[:–-]?\s*(?:for\s+)?/i, ''));
    var d = ex.deliverables[0] || (ex.requirements[0] && ex.requirements[0].text) || 'Project';
    return cap(d.replace(/^(?:a|an|the)\s+/i, '').split(/\s+(?:that|which|so|with|where|to)\s+/)[0]).slice(0, 80);
  }
  function build(ex, profile, opts) {
    profile = Object.assign({}, DEFAULT_PROFILE, profile || {}); opts = opts || {};
    var title = opts.title || titleFrom(ex), date = opts.date || today();
    var reqs = ex.requirements, must = reqs.filter(function (r) { return r.priority === 'Must'; }), should = reqs.filter(function (r) { return r.priority === 'Should'; }), could = reqs.filter(function (r) { return r.priority === 'Could'; });
    var scopeOut = ['Ongoing support and maintenance after handover (available as a separate monthly plan)', 'Third-party licences, hosting, domains and paid plug-ins (billed to you at cost or paid directly)', 'Changes after a phase is signed off (handled as change requests)'];
    if (!ex.mentions.content) scopeOut.unshift('Writing content, photography and video (you supply these unless listed above)');
    if (could.length) scopeOut.push('Nice-to-haves not in the base price (see the "Best" option): ' + could.map(function (r) { return r.text.charAt(0).toLowerCase() + r.text.slice(1); }).join('; '));
    var assumptions = ['You will nominate one person to give consolidated feedback and approvals within 3 business days.', 'One round of consolidated changes per design or build review is included.', 'The timeline starts once this proposal is accepted and the deposit is paid.'];
    if (ex.mentions.content) assumptions.push('Content (text and images) is supplied by you before the build phase starts.');
    if (ex.mentions.integration) assumptions.push('Third-party systems provide working access (API keys, test accounts) by the start of the build phase.');
    ex.constraints.forEach(function (c) { if (!/budget|\$\s?\d/i.test(c)) assumptions.push('Constraint noted: ' + c + '.'); });
    var risks = [
      { risk: 'Feedback or content arrives late', mitigation: 'Review dates agreed up front; the timeline moves day-for-day with delays.' },
      { risk: 'Scope grows during the project', mitigation: 'Changes are written up and priced as change requests before work starts.' }
    ];
    if (ex.mentions.integration) risks.push({ risk: 'Third-party system limits or outages', mitigation: 'Check API access in discovery; fall back to a manual export/import if needed.' });
    if (ex.mentions.migration) risks.push({ risk: 'Existing data is messier than expected', mitigation: 'Sample the data in discovery and agree clean-up responsibilities.' });
    var phases = phaseTemplate(ex, profile);
    var p = {
      id: opts.id || 'p' + Date.now().toString(36), status: 'draft', title: title, date: date, ref: opts.ref || 'P-' + date.replace(/-/g, '') + '-' + (opts.seq || 1),
      client: Object.assign({}, ex.client), understanding: understandingText(ex, title),
      requirements: reqs.map(function (r) { return { text: r.text, priority: r.priority }; }),
      scopeIn: must.concat(should).map(function (r) { return r.text; }), scopeOut: scopeOut,
      deliverables: ex.deliverables.length ? ex.deliverables.slice() : must.concat(should).slice(0, 6).map(function (r) { return r.text; }),
      phases: phases, assumptions: assumptions, risks: risks,
      team: uniq(phases.map(function (ph) { return ph.role; })).map(function (r) { return { role: r, who: r === (profile.rates[0] || {}).role ? (profile.contactName || '') : '', responsibility: '' }; }),
      pricing: { show: { fixed: true, tm: true, milestones: true, tiers: true }, contingency: num(profile.contingency, 15), deposit: 30, tierFactors: { good: 0.75, better: 1, best: 1.3 }, recommended: 'better' },
      tiers: {
        good: { name: 'Essential', items: must.map(function (r) { return r.text; }) },
        better: { name: 'Recommended', items: must.concat(should).map(function (r) { return r.text; }) },
        best: { name: 'Complete', items: reqs.map(function (r) { return r.text; }).concat(['30 days of priority support after launch']) }
      },
      terms: profile.terms.replace('{paymentDays}', profile.paymentDays).replace('{validDays}', profile.validDays).replace('{gstNote}', profile.gst ? ' and exclude GST unless shown' : ' (no GST is charged)'),
      brief: opts.brief || '', budget: ex.budget || null, targetWeeks: ex.targetWeeks || null
    };
    return p;
  }

  // ---------- timeline & pricing ----------
  function gantt(phases) {
    var out = [], t = 0, prevStart = 0;
    (phases || []).forEach(function (p, i) {
      var w = Math.max(0, num(p.weeks)), start = p.parallel && i > 0 ? prevStart : t;
      out.push({ name: p.name, start: start, weeks: w, end: start + w });
      prevStart = start; t = Math.max(t, start + w);
    });
    return { bars: out, totalWeeks: t };
  }
  function rateOf(profile, role) { var r = (profile.rates || []).filter(function (x) { return x.role === role; })[0]; return r ? num(r.rate) : num(((profile.rates || [])[0] || {}).rate, 0); }
  function pricing(p, profile) {
    profile = Object.assign({}, DEFAULT_PROFILE, profile || {});
    var gst = profile.gst ? GST : 0, cont = num(p.pricing.contingency) / 100;
    var lines = p.phases.map(function (ph) { var rate = rateOf(profile, ph.role), h = Math.max(0, num(ph.hours)); return { name: ph.name, role: ph.role, hours: h, rate: rate, cost: r2(h * rate) }; });
    var base = lines.reduce(function (s, l) { return s + l.cost; }, 0), hours = lines.reduce(function (s, l) { return s + l.hours; }, 0);
    var fixed = round50(base * (1 + cont));
    var tm = { low: round50(base * 0.85), high: round50(base * 1.25), hours: hours, lowHours: Math.round(hours * 0.85), highHours: Math.round(hours * 1.25) };
    // Milestones: deposit, then each phase's share of the remainder; last one absorbs rounding.
    var dep = Math.min(100, Math.max(0, num(p.pricing.deposit))), ms = [], left = 100 - dep;
    if (dep) ms.push({ label: 'Deposit on acceptance', pct: dep });
    lines.forEach(function (l) { ms.push({ label: 'On completion of ' + l.name.toLowerCase(), pct: base ? Math.round(l.cost / base * left) : Math.round(left / lines.length) }); });
    var sum = ms.reduce(function (s, m) { return s + m.pct; }, 0); if (ms.length) ms[ms.length - 1].pct += 100 - sum;
    ms = ms.filter(function (m) { return m.pct > 0; });
    var alloc = 0; ms.forEach(function (m, i) { m.amount = i === ms.length - 1 ? r2(fixed - alloc) : r2(fixed * m.pct / 100); alloc += m.amount; });
    var f = p.pricing.tierFactors || {}, tiers = ['good', 'better', 'best'].map(function (k) { var price = round50(fixed * num(f[k], 1)); return { key: k, name: p.tiers[k].name, items: p.tiers[k].items, price: price, gst: r2(price * gst), total: r2(price * (1 + gst)) }; });
    return { lines: lines, base: r2(base), hours: hours, fixed: fixed, fixedGst: r2(fixed * gst), fixedTotal: r2(fixed * (1 + gst)), gstRate: gst, tm: tm, milestones: ms, tiers: tiers, rates: profile.rates };
  }

  // ---------- output ----------
  function lines(a) { return (a || []).filter(function (x) { return String(x).trim(); }); }
  function addWeeks(iso, w) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + w * 7); return d.toISOString().slice(0, 10); }
  function toHtml(p, profile, opts) {
    profile = Object.assign({}, DEFAULT_PROFILE, profile || {}); opts = opts || {};
    var e = B.esc, pr = pricing(p, profile), g = gantt(p.phases), show = p.pricing.show, gstWord = pr.gstRate ? ' + GST' : '';
    var para = function (t) { return lines(String(t || '').split(/\n{2,}/)).map(function (x) { return '<p>' + e(x).replace(/\n/g, '<br>') + '</p>'; }).join(''); };
    var ul = function (a) { a = lines(a); return a.length ? '<ul>' + a.map(function (x) { return '<li>' + e(x) + '</li>'; }).join('') + '</ul>' : '<p class="muted">—</p>'; };
    var h = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + e('Proposal — ' + p.title) + '</title><style>' +
      'body{font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d1f24;margin:0;padding:36px;max-width:860px}h1{font-size:30px;line-height:1.2;margin:8px 0}h2{font-size:19px;margin:30px 0 8px;border-bottom:2px solid #b4531b;padding-bottom:4px}h3{font-size:16px;margin:16px 0 6px}' +
      'table{width:100%;border-collapse:collapse;margin:8px 0}th,td{padding:7px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}th{background:#f3f1ea}td.n,th.n{text-align:right;white-space:nowrap}' +
      '.muted{color:#5d6270}.cover{border-bottom:1px solid #ddd;padding-bottom:18px;margin-bottom:10px}.logo{max-height:70px;max-width:220px}.tag{display:inline-block;background:#f3f1ea;border-radius:99px;padding:0 8px;font-size:12px;margin-left:6px}' +
      '.g{display:grid;grid-template-columns:200px 1fr;gap:4px 10px;align-items:center;font-size:13px}.g .track{position:relative;height:16px;background:#f3f1ea;border-radius:4px}.g .bar{position:absolute;top:0;height:16px;background:#b4531b;border-radius:4px}' +
      '.tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}.tier{border:1px solid #ddd;border-radius:10px;padding:12px}.tier.rec{border:2px solid #b4531b}.tier .price{font-size:22px;font-weight:700}' +
      '.sign{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:12px}.sign div{border-top:1px solid #1d1f24;padding-top:4px;margin-top:36px;font-size:13px}' +
      '@media (max-width:600px){body{padding:16px}.g{grid-template-columns:110px 1fr}.sign{grid-template-columns:1fr}}@media print{body{padding:0}h2{break-after:avoid}.tier,.sign{break-inside:avoid}}</style></head><body>';
    h += '<div class="cover">' + (profile.logo ? '<img class="logo" src="' + e(profile.logo) + '" alt=""><br>' : '') + '<span class="muted">Proposal ' + e(p.ref) + ' · ' + e(B.fmt.date(p.date)) + '</span><h1>' + e(p.title) + '</h1>' +
      '<p>Prepared for <b>' + e(p.client.name || 'you') + '</b>' + (p.client.company ? ', ' + e(p.client.company) : '') + '<br>Prepared by <b>' + e(profile.name || 'Your business') + '</b>' + (profile.abn ? ' · ABN ' + e(profile.abn) : '') +
      (profile.contactName ? '<br>Contact: ' + e(profile.contactName) : '') + ([profile.email, profile.phone, profile.website].filter(Boolean).length ? '<br>' + [profile.email, profile.phone, profile.website].filter(Boolean).map(e).join(' · ') : '') + '</p></div>';
    h += '<h2>Your needs</h2>' + para(p.understanding);
    if (p.requirements && p.requirements.length) h += '<table><thead><tr><th>Requirement</th><th>Priority</th></tr></thead><tbody>' + p.requirements.map(function (r) { return '<tr><td>' + e(r.text) + '</td><td>' + e(r.priority) + '</td></tr>'; }).join('') + '</tbody></table>';
    h += '<h2>Scope</h2><h3>Included</h3>' + ul(p.scopeIn) + '<h3>Not included</h3>' + ul(p.scopeOut);
    h += '<h2>Deliverables</h2>' + ul(p.deliverables);
    h += '<h2>Approach and timeline</h2><p class="muted">About ' + g.totalWeeks + ' week' + (g.totalWeeks === 1 ? '' : 's') + ' from acceptance' + (opts.startDate ? ' (starting ' + e(B.fmt.date(opts.startDate)) + ', finishing around ' + e(B.fmt.date(addWeeks(opts.startDate, g.totalWeeks))) + ')' : '') + '.</p><div class="g">' +
      g.bars.map(function (b) { return '<span>' + e(b.name) + '<br><span class="muted">Week ' + (b.start + 1) + (b.weeks > 1 ? '–' + b.end : '') + '</span></span><div class="track"><div class="bar" style="left:' + (b.start / (g.totalWeeks || 1) * 100).toFixed(2) + '%;width:' + (b.weeks / (g.totalWeeks || 1) * 100).toFixed(2) + '%"></div></div>'; }).join('') + '</div>' +
      '<table><thead><tr><th>Phase</th><th>What happens</th><th class="n">Weeks</th></tr></thead><tbody>' + p.phases.map(function (ph) { return '<tr><td>' + e(ph.name) + '</td><td>' + e(ph.desc || '') + '</td><td class="n">' + e(ph.weeks) + '</td></tr>'; }).join('') + '</tbody></table>';
    var team = (p.team || []).filter(function (t) { return t.role; });
    if (team.length) h += '<h2>Team and roles</h2><table><thead><tr><th>Role</th><th>Who</th><th>Responsibility</th></tr></thead><tbody>' + team.map(function (t) { return '<tr><td>' + e(t.role) + '</td><td>' + e(t.who || '') + '</td><td>' + e(t.responsibility || '') + '</td></tr>'; }).join('') + '</tbody></table>';
    h += '<h2>Investment</h2>';
    if (show.tiers) {
      h += '<h3>Options</h3><div class="tiers">' + pr.tiers.map(function (t) { return '<div class="tier' + (t.key === p.pricing.recommended ? ' rec' : '') + '"><b>' + e(t.name) + '</b>' + (t.key === p.pricing.recommended ? '<span class="tag">Recommended</span>' : '') + '<div class="price">' + money(t.price) + '<span class="muted" style="font-size:13px;font-weight:400">' + gstWord + '</span></div>' + ul(t.items) + '</div>'; }).join('') + '</div>';
    }
    if (show.fixed) h += '<h3>Fixed price</h3><p>' + money(pr.fixed) + gstWord + (pr.gstRate ? ' (' + money(pr.fixedTotal) + ' including GST)' : '') + ' for the included scope' + (show.tiers ? ' (the ' + e(p.tiers[p.pricing.recommended].name) + ' option before any option adjustment)' : '') + '.</p>';
    if (show.milestones) h += '<h3>Payment milestones</h3><table><thead><tr><th>Milestone</th><th class="n">%</th><th class="n">Amount' + gstWord + '</th></tr></thead><tbody>' + pr.milestones.map(function (m) { return '<tr><td>' + e(m.label) + '</td><td class="n">' + m.pct + '%</td><td class="n">' + money(m.amount) + '</td></tr>'; }).join('') + '</tbody></table>';
    if (show.tm) h += '<h3>Or: time and materials</h3><p>Billed for actual hours at the rates below. Estimate: ' + pr.tm.lowHours + '–' + pr.tm.highHours + ' hours, about ' + money(pr.tm.low) + '–' + money(pr.tm.high) + gstWord + '. You get a timesheet with every invoice.</p><table><thead><tr><th>Role</th><th class="n">Rate per hour' + gstWord + '</th></tr></thead><tbody>' + (pr.rates || []).map(function (r) { return '<tr><td>' + e(r.role) + '</td><td class="n">' + money(r.rate) + '</td></tr>'; }).join('') + '</tbody></table>';
    h += '<h2>Assumptions</h2>' + ul(p.assumptions);
    var risks = (p.risks || []).filter(function (r) { return r.risk; });
    if (risks.length) h += '<h2>Risks and how we manage them</h2><table><thead><tr><th>Risk</th><th>How we manage it</th></tr></thead><tbody>' + risks.map(function (r) { return '<tr><td>' + e(r.risk) + '</td><td>' + e(r.mitigation || '') + '</td></tr>'; }).join('') + '</tbody></table>';
    h += '<h2>Terms</h2>' + ul(String(p.terms || '').split('\n'));
    h += '<h2>Acceptance</h2><p>To go ahead, sign below (or reply in writing) stating the option you choose. The signed proposal and these terms form our agreement.</p><p>Option chosen: ____________________</p>' +
      '<div class="sign"><div>Signed for ' + e(p.client.company || p.client.name || 'the client') + '<br>Name, title and date</div><div>Signed for ' + e(profile.name || 'us') + '<br>' + e(profile.contactName || 'Name') + ', date</div></div>';
    return h + '</body></html>';
  }
  function toMarkdown(p, profile) {
    profile = Object.assign({}, DEFAULT_PROFILE, profile || {});
    var pr = pricing(p, profile), g = gantt(p.phases), show = p.pricing.show, gw = pr.gstRate ? ' + GST' : '', md = [];
    var li = function (a) { return lines(a).map(function (x) { return '- ' + x; }).join('\n') || '- —'; };
    md.push('# ' + p.title, '', 'Proposal ' + p.ref + ' · ' + p.date, '', '**Prepared for:** ' + [p.client.name, p.client.company].filter(Boolean).join(', ') + '  ', '**Prepared by:** ' + (profile.name || 'Your business') + (profile.abn ? ' (ABN ' + profile.abn + ')' : ''), '');
    md.push('## Your needs', '', p.understanding, '');
    if (p.requirements.length) { md.push('| Requirement | Priority |', '|---|---|'); p.requirements.forEach(function (r) { md.push('| ' + r.text.replace(/\|/g, '\\|') + ' | ' + r.priority + ' |'); }); md.push(''); }
    md.push('## Scope', '', '### Included', '', li(p.scopeIn), '', '### Not included', '', li(p.scopeOut), '', '## Deliverables', '', li(p.deliverables), '');
    md.push('## Approach and timeline', '', 'About ' + g.totalWeeks + ' weeks from acceptance.', '', '| Phase | Weeks | Timing |', '|---|---|---|');
    g.bars.forEach(function (b, i) { md.push('| ' + b.name + ' | ' + b.weeks + ' | Week ' + (b.start + 1) + (b.weeks > 1 ? '–' + b.end : '') + ' ' + '█'.repeat(Math.max(1, Math.round(b.weeks))) + ' |'); });
    md.push('', '## Investment', '');
    if (show.tiers) pr.tiers.forEach(function (t) { md.push('**' + t.name + (t.key === p.pricing.recommended ? ' (recommended)' : '') + ': ' + money(t.price) + gw + '**', '', li(t.items), ''); });
    if (show.fixed) md.push('**Fixed price:** ' + money(pr.fixed) + gw, '');
    if (show.milestones) { md.push('| Milestone | % | Amount' + gw + ' |', '|---|---|---|'); pr.milestones.forEach(function (m) { md.push('| ' + m.label + ' | ' + m.pct + '% | ' + money(m.amount) + ' |'); }); md.push(''); }
    if (show.tm) { md.push('**Time and materials:** about ' + money(pr.tm.low) + '–' + money(pr.tm.high) + gw + ' (' + pr.tm.lowHours + '–' + pr.tm.highHours + ' hours).', ''); pr.rates.forEach(function (r) { md.push('- ' + r.role + ': ' + money(r.rate) + '/hour' + gw); }); md.push(''); }
    md.push('## Assumptions', '', li(p.assumptions), '');
    if (p.risks.length) { md.push('## Risks', '', '| Risk | How we manage it |', '|---|---|'); p.risks.forEach(function (r) { md.push('| ' + r.risk + ' | ' + (r.mitigation || '') + ' |'); }); md.push(''); }
    md.push('## Terms', '', li(String(p.terms || '').split('\n')), '', '## Acceptance', '', 'Option chosen: ________', '', 'Signed for ' + (p.client.company || p.client.name || 'the client') + ': ________________  Date: ________', '', 'Signed for ' + (profile.name || 'us') + ': ________________  Date: ________', '');
    return md.join('\n');
  }
  function toEmail(p, profile) {
    profile = Object.assign({}, DEFAULT_PROFILE, profile || {});
    var pr = pricing(p, profile), g = gantt(p.phases), gw = pr.gstRate ? ' + GST' : '', first = (p.client.name || '').split(' ')[0];
    var t = ['Subject: Proposal — ' + p.title, '', 'Hi' + (first ? ' ' + first : '') + ',', '', 'Thanks for the brief. Here is a summary of how we would approach ' + p.title.charAt(0).toLowerCase() + p.title.slice(1) + '. The full proposal is attached.', ''];
    t.push('What you get:'); lines(p.deliverables).slice(0, 6).forEach(function (d) { t.push('• ' + d); }); t.push('');
    t.push('Timeline: about ' + g.totalWeeks + ' weeks from go-ahead (' + p.phases.map(function (ph) { return ph.name.toLowerCase(); }).join(' → ') + ').', '');
    if (p.pricing.show.tiers) { t.push('Options:'); pr.tiers.forEach(function (x) { t.push('• ' + x.name + ': ' + money(x.price) + gw + (x.key === p.pricing.recommended ? ' (recommended)' : '')); }); }
    else t.push('Fixed price: ' + money(pr.fixed) + gw);
    t.push('', 'If this looks right, reply with the option you prefer and I will send the acceptance and deposit invoice. Happy to talk it through on a quick call.', '', 'Kind regards,', profile.contactName || '', profile.name || '', [profile.phone, profile.email].filter(Boolean).join(' · '));
    return t.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  // ---------- sample ----------
  var SAMPLE_BRIEF = [
    'From: Priya Nair <priya@harbourstreetphysio.com.au>',
    'Subject: Quote request - new website with online booking',
    '',
    'Hi there,',
    '',
    'We are a small physiotherapy clinic in Newtown (Harbour Street Physio) and our current website is old and hard to update. We need a new website with online booking before the end of February 2027.',
    '',
    'Requirements:',
    '- Must work well on mobile phones',
    '- Online booking that syncs with our Cliniko practice software',
    '- Pages for each of our 6 services and 4 practitioners',
    '- We must be able to edit the text and photos ourselves',
    '- Should meet accessibility guidelines (WCAG 2.2 AA) because many of our patients are older',
    '- Basic SEO so we show up for "physio Newtown"',
    '- Would like a blog for exercise tips',
    '- Nice to have: an online shop for resistance bands and heat packs',
    '',
    'We have our logo and colours already, and our photos. We would also like a short training session so our reception team can update the site.',
    '',
    'Our budget is around $8,000 to $12,000 and we would like it done within 8 weeks. The site must be hosted in Australia because of patient privacy.',
    '',
    'Could you send a proposal by Friday?',
    '',
    'Kind regards,',
    'Priya Nair',
    'Practice Manager, Harbour Street Physio',
    '02 9555 0142'
  ].join('\n');
  var SAMPLE_PROFILE = { name: 'Wattle Digital', contactName: 'Alex Morgan', abn: '53 004 085 616', email: 'hello@wattledigital.example', phone: '0400 000 000', website: 'wattledigital.example', gst: true,
    rates: [{ role: 'Project lead', rate: 140 }, { role: 'Web developer', rate: 115 }, { role: 'Designer', rate: 100 }], hoursPerWeek: 12, contingency: 10 };

  function validateFile(j) {
    if (!j || typeof j !== 'object') return 'Not a proposals file.';
    var list = Array.isArray(j) ? j : j.proposals;
    if (!Array.isArray(list)) return 'No proposals in this file.';
    if (list.some(function (p) { return !p || typeof p.title !== 'string' || !Array.isArray(p.phases); })) return 'Some proposals are malformed.';
    return null;
  }

  var L = {
    units: units, extract: extract, tidyReq: tidyReq, priorityOf: priorityOf, findDates: findDates, budgetOf: budgetOf, clientOf: clientOf, targetWeeks: targetWeeks, moneyValue: moneyValue,
    build: build, phaseTemplate: phaseTemplate, gantt: gantt, pricing: pricing, toHtml: toHtml, toMarkdown: toMarkdown, toEmail: toEmail, money: money,
    DEFAULT_PROFILE: DEFAULT_PROFILE, SAMPLE_BRIEF: SAMPLE_BRIEF, SAMPLE_PROFILE: SAMPLE_PROFILE, validateFile: validateFile, addWeeks: addWeeks
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.ProposalLib = L;
})(this);
