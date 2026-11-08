/* Email Assistant — pure logic: split, classify, prioritise, reply templates with tone, tone checker, subject lines. No DOM. */
(function (root) {
  'use strict';

  // ---------- splitting ----------
  function parseOne(block) {
    var lines = block.replace(/\r\n?/g, '\n').split('\n'), h = {}, i = 0, any = false;
    while (i < lines.length && !lines[i].trim()) i++;
    for (; i < lines.length; i++) {
      var m = lines[i].match(/^(From|To|Cc|Subject|Date|Sent|Reply-To)\s*:\s*(.*)$/i);
      if (!m) break;
      h[m[1].toLowerCase() === 'sent' ? 'date' : m[1].toLowerCase()] = m[2].trim(); any = true;
    }
    var body = lines.slice(i).join('\n');
    // drop quoted history
    body = body.split(/\n(?:On .{5,120} wrote:|-{2,}\s*Original Message\s*-{2,}|_{5,}\s*\nFrom:)/i)[0];
    body = body.split('\n').filter(function (l) { return !/^\s*>/.test(l); }).join('\n').trim();
    var from = h.from || '', fm = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/), name = fm ? fm[1].trim() : '', addr = fm ? fm[2].trim() : (from.match(/[\w.+-]+@[\w.-]+\.\w+/) || [''])[0];
    if (!name && addr) name = addr.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    if (!name) { var sig = body.match(/\n(?:thanks|cheers|regards|kind regards|best|warm regards|many thanks|sincerely)[,!.]?\s*\n+\s*([A-Z][a-z]+(?: [A-Z][a-z]+)?)\s*(?:\n|$)/i); if (sig) name = sig[1]; }
    return { from: from, fromName: name, fromEmail: addr, to: h.to || '', subject: h.subject || '', date: h.date || '', body: body, hasHeaders: any };
  }
  function split(text) {
    var t = String(text || '').replace(/\r\n?/g, '\n').trim(); if (!t) return [];
    var blocks;
    if (/^-{3,}\s*$|^={3,}\s*$/m.test(t)) blocks = t.split(/\n?^(?:-{3,}|={3,})\s*$\n?/m);
    else {
      var idx = [], re = /^From\s*:/gim, m;
      while ((m = re.exec(t))) idx.push(m.index);
      // a "From:" inside quoted history directly after "Original Message" is not a new email
      blocks = idx.length > 1 ? idx.map(function (s, k) { return t.slice(s, idx[k + 1]); }) : [t];
      if (idx.length > 1 && idx[0] > 0 && t.slice(0, idx[0]).trim()) blocks.unshift(t.slice(0, idx[0]));
    }
    return blocks.map(function (b) { return b.trim(); }).filter(Boolean).map(parseOne);
  }

  // ---------- classification ----------
  var CATS = {
    urgent: { label: 'Urgent', weight: 40 },
    complaint: { label: 'Complaint', weight: 30 },
    action: { label: 'Action needed', weight: 25 },
    invoice: { label: 'Invoice / payment', weight: 22 },
    meeting: { label: 'Meeting request', weight: 18 },
    question: { label: 'Question', weight: 15 },
    fyi: { label: 'FYI / newsletter', weight: -25 }
  };
  var SIGNALS = {
    action: [/\bplease\b/gi, /\b(?:could|can|would) you\b/gi, /\bneed you to\b/gi, /\bkindly\b/gi, /\baction required\b/gi, /\blet me know\b/gi, /\b(?:confirm|approve|review|sign|send (?:me|through|over)|fill (?:in|out)|complete|update)\b/gi, /\bwaiting (?:on|for) you\b/gi],
    meeting: [/\bmeet(?:ing|s)?\b/gi, /\bcatch[- ]?up\b/gi, /\b(?:call|zoom|teams|google meet|invite|calendar)\b/gi, /\bavailab(?:le|ility)\b/gi, /\b(?:re)?schedule\b/gi, /\btime slot\b/gi, /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/gi, /\b(?:coffee|lunch) (?:chat|meeting)?\b/gi, /\bfree (?:on|this|next)\b/gi],
    invoice: [/\binvoice\b/gi, /\bpayment\b/gi, /\boverdue\b/gi, /\bamount (?:due|owing|outstanding)\b/gi, /\bremittance\b/gi, /\b(?:bill|receipt|statement|outstanding balance)\b/gi, /\bpaid\b/gi, /[$€£]\s?\d/g, /\b(?:bsb|account number|bank details|due date)\b/gi],
    complaint: [/\bdisappointed\b/gi, /\bunhappy\b/gi, /\bcomplain(?:t|ing)?\b/gi, /\bunacceptable\b/gi, /\bfrustrat(?:ed|ing)\b/gi, /\bpoor (?:service|quality)\b/gi, /\brefund\b/gi, /\bstill (?:waiting|not)\b/gi, /\bnot (?:working|happy|good enough)\b/gi, /\b(?:broken|terrible|worst|awful|ridiculous)\b/gi, /\bescalat(?:e|ing)\b/gi, /\bcancel my\b/gi],
    fyi: [/\bunsubscribe\b/gi, /\bnewsletter\b/gi, /\bfyi\b/gi, /\bfor your (?:information|records)\b/gi, /\bno (?:action|reply) (?:is )?(?:needed|required)\b/gi, /\bview (?:this email )?in (?:your )?browser\b/gi, /\b(?:weekly|monthly) (?:digest|update|roundup)\b/gi, /\bannouncement\b/gi, /\bno-?reply\b/gi, /\bwebinar\b/gi, /\b\d+% off\b/gi, /\bjust (?:letting you know|a heads up)\b/gi],
    urgent: [/\burgent(?:ly)?\b/gi, /\basap\b/gi, /\bas soon as possible\b/gi, /\bimmediately\b/gi, /\b(?:today|tonight|eod|end of (?:the )?day|cob|close of business)\b/gi, /\bby tomorrow\b/gi, /\bdeadline\b/gi, /\bfinal (?:notice|reminder)\b/gi, /\btime[- ]sensitive\b/gi, /\bcritical\b/gi, /\bwithin (?:24|48) hours\b/gi, /!{2,}/g]
  };
  function count(re, text) { re.lastIndex = 0; return (text.match(re) || []).length; }
  function sentences(text) { return (String(text).replace(/\s+/g, ' ').match(/(?:[^.!?]|[.!?](?!\s|$))+(?:[.!?]+(?=\s|$)|$)/g) || []).map(function (s) { return s.trim(); }).filter(Boolean); }

  function extract(e) {
    var text = (e.subject ? e.subject + '. ' : '') + e.body;
    var asks = sentences(e.body).filter(function (s) { return /\?$/.test(s) || /\b(please|could you|can you|would you|need you to|kindly|let me know|I'd like you to|make sure)\b/i.test(s); }).slice(0, 8);
    var dates = []; var dre = /\b(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day|today|tomorrow|tonight|eod|end of (?:the )?(?:day|week|month)|next week|this week|\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?|\d{1,2}(?:st|nd|rd|th)? (?:of )?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}(?:st|nd|rd|th)?|\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/gi, m;
    while ((m = dre.exec(text))) if (dates.indexOf(m[0].toLowerCase()) < 0) dates.push(m[0].toLowerCase());
    var amounts = []; var are = /(?:[$€£]|AUD\s?|USD\s?)\s?\d[\d,]*(?:\.\d{1,2})?(?:\s?(?:k|m))?/gi;
    while ((m = are.exec(text))) if (amounts.indexOf(m[0]) < 0) amounts.push(m[0]);
    var refs = (text.match(/\b(?:INV|PO|REF|ORD|TKT|CASE)[-#\s]?\d{2,}\b|#\d{3,}\b/gi) || []).filter(function (x, i, a) { return a.indexOf(x) === i; });
    return { asks: asks, dates: dates, amounts: amounts, refs: refs };
  }

  function classify(e) {
    var text = (e.subject || '') + '\n' + e.body, scores = {};
    Object.keys(SIGNALS).forEach(function (k) { scores[k] = SIGNALS[k].reduce(function (s, re) { return s + count(re, text); }, 0); });
    scores.question = sentences(e.body).filter(function (s) { return /\?$/.test(s); }).length;
    if (/^\s*(?:re|fw|fwd)\s*:/i.test(e.subject || '') && scores.fyi) scores.fyi--;
    if (/no-?reply|newsletter|news@|marketing@|updates@/i.test(e.from || '')) scores.fyi += 3;
    var x = extract(e);
    if (/\b(?:urgent|asap|immediately)\b/i.test(e.subject || '')) scores.urgent += 2;
    var cats = Object.keys(scores).filter(function (k) { return scores[k] >= (k === 'action' || k === 'meeting' || k === 'invoice' ? 2 : 1); })
      .sort(function (a, b) { return scores[b] - scores[a] || CATS[b].weight - CATS[a].weight; });
    // an email that's mostly marketing isn't "action needed" just because it says "please"
    if (cats.indexOf('fyi') >= 0 && scores.fyi >= 2 && scores.complaint === 0 && scores.urgent < 2) cats = ['fyi'].concat(cats.filter(function (c) { return c === 'question'; }));
    var primary = cats.filter(function (c) { return c !== 'urgent'; })[0] || (cats[0] || 'fyi');
    var urgency = Math.min(100, scores.urgent * 25 + (scores.complaint ? 10 : 0) + (/\boverdue|final notice\b/i.test(text) ? 20 : 0));
    var priority = Math.max(0, Math.min(100, 30 + cats.reduce(function (s, c) { return s + (c === 'urgent' ? 0 : CATS[c].weight); }, 0) * 0.6 + urgency * 0.5 + Math.min(x.asks.length, 3) * 4));
    if (primary === 'fyi' && urgency < 25) priority = Math.min(priority, 15);
    return { primary: primary, label: CATS[primary].label, categories: cats.map(function (c) { return { id: c, label: CATS[c].label, score: scores[c] }; }), scores: scores, urgency: urgency, urgent: urgency >= 50, priority: Math.round(priority), extract: x };
  }

  function prioritise(emails) {
    return emails.map(function (e, i) { var c = classify(e); return Object.assign({ index: i }, e, { analysis: c, suggested: suggestTemplates(c) }); })
      .sort(function (a, b) { return b.analysis.priority - a.analysis.priority || a.index - b.index; });
  }

  // ---------- tone phrase sets (0 warm, 1 neutral, 2 formal) ----------
  var PHRASES = {
    greet: ['Hi {name},', 'Hi {name},', 'Dear {name},'],
    thanks: ['Thanks so much for', 'Thanks for', 'Thank you for'],
    sorry: ['I’m really sorry', 'Sorry', 'I apologise'],
    please: ['Would you mind', 'Could you please', 'I would be grateful if you could'],
    followup: ['Just checking in on', 'I’m following up on', 'I am writing to follow up on'],
    happy: ['I’d love to', 'I’m happy to', 'I would be pleased to'],
    sadly: ['Unfortunately', 'Unfortunately', 'Regrettably'],
    close: ['Let me know if there’s anything else I can do!', 'Let me know if you have any questions.', 'Please do not hesitate to contact me should you require any further information.'],
    signoff: ['Cheers,', 'Kind regards,', 'Yours sincerely,'],
    hope: ['Hope you’re having a great week!', '', 'I trust this email finds you well.']
  };
  function phrase(k, tone) { return PHRASES[k][Math.max(0, Math.min(2, tone == null ? 1 : tone))]; }

  // {{greet}} etc. are tone phrases; {field} are user fields
  var TEMPLATES = [
    { id: 'accept-meeting', name: 'Accept a meeting', for: ['meeting'], fields: ['name', 'when', 'topic'], subject: 'Re: {topic}', body: '{{greet}}\n\n{{hope}}\n{{thanks}} the invite — {when} works well for me. {{happy}} talk about {topic}.\n\n{{close}}\n\n{{signoff}}\n{me}' },
    { id: 'decline-meeting', name: 'Decline a meeting', for: ['meeting'], fields: ['name', 'when', 'reason'], subject: 'Re: meeting on {when}', body: '{{greet}}\n\n{{thanks}} the invite. {{sadly}} I can’t make {when} because {reason}. If it helps, I can read the notes afterwards or send my input beforehand.\n\n{{close}}\n\n{{signoff}}\n{me}' },
    { id: 'propose-time', name: 'Suggest another meeting time', for: ['meeting'], fields: ['name', 'option1', 'option2'], subject: 'New time for our meeting', body: '{{greet}}\n\n{{thanks}} getting in touch. That time doesn’t work for me, but I’m free {option1} or {option2}. Would either of those suit you?\n\n{{signoff}}\n{me}' },
    { id: 'request-meeting', name: 'Ask for a meeting', for: [], fields: ['name', 'topic', 'length', 'options'], subject: 'Quick chat about {topic}?', body: '{{greet}}\n\n{{hope}}\nWould you have {length} for a quick chat about {topic}? I’m free {options}, or happy to work around you.\n\n{{signoff}}\n{me}' },
    { id: 'chase-payment', name: 'Chase an overdue payment', for: ['invoice'], fields: ['name', 'invoice', 'amount', 'due'], subject: 'Invoice {invoice} — payment reminder', body: '{{greet}}\n\n{{followup}} invoice {invoice} for {amount}, which was due on {due}. {{please}} let me know when payment will be made, or if there’s a problem with the invoice?\n\nI’ve attached a copy in case it went astray.\n\n{{thanks}} sorting this out.\n\n{{signoff}}\n{me}' },
    { id: 'final-payment', name: 'Final payment notice (firm but polite)', for: ['invoice'], fields: ['name', 'invoice', 'amount', 'deadline'], subject: 'Final reminder: invoice {invoice}', body: '{{greet}}\n\nInvoice {invoice} for {amount} is now well overdue, and I haven’t been able to reach you about it. {{please}} arrange payment by {deadline}. If I don’t hear back by then, I’ll need to pause further work and look at next steps.\n\nIf something’s gone wrong, just reply and we can work out a plan.\n\n{{signoff}}\n{me}' },
    { id: 'payment-sent', name: 'Confirm payment sent', for: ['invoice'], fields: ['name', 'invoice', 'amount', 'date'], subject: 'Payment sent: {invoice}', body: '{{greet}}\n\nJust confirming I paid invoice {invoice} ({amount}) on {date}. It may take a business day or two to show up.\n\n{{signoff}}\n{me}' },
    { id: 'send-invoice', name: 'Send an invoice', for: [], fields: ['name', 'invoice', 'amount', 'due'], subject: 'Invoice {invoice}', body: '{{greet}}\n\n{{thanks}} your business. Please find invoice {invoice} for {amount} attached, due on {due}. Payment details are on the invoice.\n\n{{close}}\n\n{{signoff}}\n{me}' },
    { id: 'quote-sent', name: 'Send a quote', for: ['question'], fields: ['name', 'job', 'amount', 'valid'], subject: 'Quote for {job}', body: '{{greet}}\n\n{{thanks}} asking. I’ve attached a quote for {job} — the total is {amount}, and it’s valid until {valid}.\n\nIf you’d like to go ahead, just reply to this email and I’ll lock in a start date.\n\n{{close}}\n\n{{signoff}}\n{me}' },
    { id: 'apologise-delay', name: 'Apologise for a delay', for: ['complaint', 'action'], fields: ['name', 'item', 'newdate'], subject: 'Update on {item}', body: '{{greet}}\n\n{{sorry}} for the delay with {item}. It will be with you by {newdate}, and I’ll let you know straight away if anything changes.\n\n{{thanks}} your patience.\n\n{{signoff}}\n{me}' },
    { id: 'complaint-reply', name: 'Reply to a complaint', for: ['complaint'], fields: ['name', 'issue', 'fix', 'when'], subject: 'Re: {issue}', body: '{{greet}}\n\n{{thanks}} letting me know, and {{sorry_lc}} about {issue}. That’s not the experience we want you to have.\n\nHere’s what I’m doing about it: {fix}. You’ll hear from me by {when}.\n\n{{close}}\n\n{{signoff}}\n{me}' },
    { id: 'refund', name: 'Offer a refund', for: ['complaint'], fields: ['name', 'amount', 'days'], subject: 'Your refund', body: '{{greet}}\n\n{{sorry}} things didn’t work out. I’ve processed a refund of {amount}; it should reach your account within {days} business days.\n\n{{close}}\n\n{{signoff}}\n{me}' },
    { id: 'follow-up', name: 'Follow up (no reply yet)', for: ['action', 'question'], fields: ['name', 'topic'], subject: 'Following up: {topic}', body: '{{greet}}\n\n{{followup}} my email about {topic}. I know things get busy — when you have a moment, could you let me know where it’s at?\n\n{{thanks}} your help.\n\n{{signoff}}\n{me}' },
    { id: 'ask-info', name: 'Ask for more information', for: ['action', 'question'], fields: ['name', 'topic', 'needed'], subject: 'Re: {topic}', body: '{{greet}}\n\n{{thanks}} your email about {topic}. Before I can go ahead, {{please_lc}} send me {needed}?\n\n{{signoff}}\n{me}' },
    { id: 'answer-question', name: 'Answer a question', for: ['question'], fields: ['name', 'answer'], subject: 'Re: your question', body: '{{greet}}\n\n{{thanks}} getting in touch. {answer}\n\n{{close}}\n\n{{signoff}}\n{me}' },
    { id: 'say-no', name: 'Say no politely', for: ['action'], fields: ['name', 'request', 'alternative'], subject: 'Re: {request}', body: '{{greet}}\n\n{{thanks}} thinking of me for {request}. {{sadly}} I can’t take it on right now without letting other work slip. {alternative}\n\n{{signoff}}\n{me}' },
    { id: 'confirm-done', name: 'Confirm it’s done', for: ['action'], fields: ['name', 'task'], subject: 'Done: {task}', body: '{{greet}}\n\nQuick note to let you know {task} is done.\n\n{{close}}\n\n{{signoff}}\n{me}' },
    { id: 'acknowledge', name: 'Acknowledge — will reply properly soon', for: ['action', 'question', 'complaint', 'urgent'], fields: ['name', 'when'], subject: 'Re: your email', body: '{{greet}}\n\n{{thanks}} your email — I’ve got it and I’ll come back to you properly by {when}.\n\n{{signoff}}\n{me}' },
    { id: 'thank-you', name: 'Say thank you', for: ['fyi'], fields: ['name', 'for'], subject: 'Thank you', body: '{{greet}}\n\n{{thanks}} {for}. It really made a difference.\n\n{{signoff}}\n{me}' },
    { id: 'intro', name: 'Introduce two people', for: [], fields: ['name', 'other', 'reason'], subject: 'Introduction: {name} ↔ {other}', body: '{{greet}}\n\nI’d like to introduce you to {other}. I think you two should talk because {reason}. I’ll leave it with you both to take it from here.\n\n{{signoff}}\n{me}' },
    { id: 'out-of-office', name: 'Out of office', for: [], fields: ['back', 'contact'], subject: 'Out of office until {back}', body: 'Hello,\n\n{{thanks}} your email. I’m away until {back} with limited access to email. For anything urgent, please contact {contact}.\n\n{{signoff}}\n{me}' },
    { id: 'job-follow-up', name: 'Job application follow-up', for: [], fields: ['name', 'role', 'date'], subject: 'Following up: {role} application', body: '{{greet}}\n\n{{followup}} my application for the {role} role, which I sent on {date}. I’m still very interested and would welcome the chance to talk.\n\n{{thanks}} your time.\n\n{{signoff}}\n{me}' },
    { id: 'job-thanks', name: 'Thank you after an interview', for: [], fields: ['name', 'role', 'highlight'], subject: 'Thank you — {role} interview', body: '{{greet}}\n\n{{thanks}} your time today. I really enjoyed hearing about {highlight}, and it made me even keener on the {role} role.\n\n{{close}}\n\n{{signoff}}\n{me}' },
    { id: 'reschedule', name: 'Reschedule something', for: ['meeting'], fields: ['name', 'what', 'newtime'], subject: 'Can we move {what}?', body: '{{greet}}\n\n{{sorry}}, but something has come up. Could we move {what} to {newtime}? If that doesn’t suit, let me know a time that does.\n\n{{signoff}}\n{me}' },
    { id: 'deadline-extension', name: 'Ask for more time', for: ['action', 'urgent'], fields: ['name', 'task', 'newdate', 'reason'], subject: 'Request: more time for {task}', body: '{{greet}}\n\n{{please}} give me until {newdate} for {task}? {reason} I want to make sure it’s done properly.\n\n{{thanks}} understanding.\n\n{{signoff}}\n{me}' },
    { id: 'unsubscribe', name: 'Ask to be removed from a list', for: ['fyi'], fields: ['email'], subject: 'Please unsubscribe {email}', body: 'Hello,\n\nPlease remove {email} from your mailing list.\n\n{{thanks}} your help.\n\n{{signoff}}\n{me}' }
  ];
  var FIELD_LABELS = { name: 'Their name', when: 'When', topic: 'Topic', reason: 'Reason', option1: 'Time option 1', option2: 'Time option 2', length: 'How long (e.g. 20 minutes)', options: 'Your free times',
    invoice: 'Invoice number', amount: 'Amount', due: 'Due date', deadline: 'Deadline', date: 'Date', job: 'Job', valid: 'Valid until', item: 'What is late', newdate: 'New date', issue: 'The problem',
    fix: 'What you’re doing', days: 'Business days', needed: 'What you need', answer: 'Your answer', request: 'What they asked', alternative: 'Alternative you can offer', task: 'Task', for: 'What you’re thanking them for',
    other: 'Other person', back: 'Back on', contact: 'Urgent contact', role: 'Role', highlight: 'Something you enjoyed', what: 'What to move', newtime: 'New time', email: 'Email address', me: 'Your name' };

  function fill(id, values, tone) {
    var t = TEMPLATES.filter(function (x) { return x.id === id; })[0]; if (!t) return null;
    values = values || {};
    function val(k) { var v = values[k]; return v && String(v).trim() ? String(v).trim() : '[' + (FIELD_LABELS[k] || k) + ']'; }
    function sub(str) {
      return str.replace(/\{\{(\w+?)(_lc)?\}\}/g, function (_, k, lc) { var p = phrase(k, tone); if (lc && !/^I\b/.test(p)) p = p.charAt(0).toLowerCase() + p.slice(1); return p.replace('{name}', val('name')); })
        .replace(/\{(\w+)\}/g, function (_, k) { return val(k); });
    }
    var body = sub(t.body).replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n\n\n/g, '\n\n');
    body = body.split('\n').filter(function (l, i, a) { return !(l === '' && a[i - 1] === ''); }).join('\n');
    return { subject: sub(t.subject), body: body.trim(), missing: t.fields.concat(['me']).filter(function (k) { return !(values[k] && String(values[k]).trim()); }) };
  }

  function suggestTemplates(analysis) {
    var cats = analysis.categories.map(function (c) { return c.id; });
    if (!cats.length) cats = [analysis.primary];
    var out = [];
    cats.forEach(function (c) { TEMPLATES.forEach(function (t) { if (t.for.indexOf(c) >= 0 && out.indexOf(t.id) < 0) out.push(t.id); }); });
    return out.slice(0, 5);
  }

  // ---------- tone checker ----------
  var BLUNT = [
    [/\bas per my (?:last|previous) email\b/i, 'Can read as passive-aggressive.', 'As I mentioned earlier,'],
    [/\bper my (?:last|previous) email\b/i, 'Can read as passive-aggressive.', 'As I mentioned earlier,'],
    [/\bas (?:previously|already) (?:stated|mentioned|discussed)\b/i, 'Sounds like a telling-off.', 'To recap,'],
    [/\bI already (?:told|said to) you\b/i, 'Sounds frustrated.', 'Just to recap what I mentioned before,'],
    [/\bnot sure if you (?:saw|got) my (?:last )?email\b/i, 'Can read as a dig.', 'I wanted to bring this back to the top of your inbox.'],
    [/\bfriendly reminder\b/i, 'Often reads as not-so-friendly.', 'Just a quick reminder'],
    [/\bgoing forward\b/i, 'Can sound like a reprimand.', 'From now on, it would help if…'],
    [/\bwith (?:all )?due respect\b/i, 'Usually signals disrespect.', 'I see it a bit differently:'],
    [/\bno offen[cs]e,? but\b/i, 'Signals the next bit will offend.', '(remove it and state the point kindly)'],
    [/\byou (?:failed|forgot|neglected) to\b/i, 'Blames the reader.', 'It looks like … was missed'],
    [/\byou need to\b/i, 'Sounds like an order.', 'Could you please'],
    [/\byou should have\b/i, 'Sounds like blame.', 'Next time, it would help to'],
    [/\bwhy (?:haven't|didn't|hasn't|wasn't) you\b/i, 'Sounds accusing.', 'Could you let me know where … is at?'],
    [/\bobviously\b/i, 'Can make the reader feel silly.', '(remove it)'],
    [/\bclearly\b/i, 'Can sound condescending.', '(remove it)'],
    [/\bjust do\b/i, 'Blunt.', 'Could you please'],
    [/\bthat'?s not my (?:problem|job|fault)\b/i, 'Sounds dismissive.', 'That sits with … — I’ll connect you with them.'],
    [/\bI'?m not sure why\b/i, 'Can sound accusing.', 'Could you help me understand'],
    [/\bplease advise\b/i, 'Stiff and vague.', 'Could you let me know …?'],
    [/\bkindly\b/i, 'Can read as stiff or demanding.', 'Please'],
    [/\bASAP\b/, 'Vague and pushy.', 'by [day/time] if possible'],
    [/\bsorry to bother you\b/i, 'Undersells your request.', 'I hope you’re well —'],
    [/\bI just wanted to\b/i, 'Hedging weakens your message.', 'I wanted to'],
    [/\bthanks in advance\b/i, 'Presumes a yes.', 'Thanks for your help with this.'],
    [/\bper our conversation\b/i, 'Stiff.', 'Following our chat,'],
    [/\bwhatever\b/i, 'Sounds dismissive.', '(remove it)'],
    [/\bfine\.\s*$/im, 'A one-word “Fine.” reads as annoyed.', 'That works for me.']
  ];
  var ACRONYMS = /^(ASAP|FYI|EOD|COB|AUD|USD|GST|ABN|BSB|PDF|CEO|CFO|CTO|HR|IT|API|URL|PO|NSW|VIC|QLD|ACT|WA|SA|NT|TAS|AM|PM|OK|ID|UK|USA|NZ|AU|ETA|FAQ|KPI|ROI|SEO|CSV|MVP|TBC|TBD|QA|UI|UX|CRM|ERP|SQL|AWS|IOU|RSVP|PS|NB)$/;

  function toneCheck(draft) {
    var text = String(draft || ''), issues = [];
    BLUNT.forEach(function (b) { var m = text.match(b[0]); if (m && !issues.some(function (x) { return x.text.toLowerCase().indexOf(m[0].toLowerCase()) >= 0; })) issues.push({ type: 'phrase', severity: 'warn', text: m[0], why: b[1], suggestion: b[2] }); });
    var caps = (text.match(/\b[A-Z]{3,}\b/g) || []).filter(function (w) { return !ACRONYMS.test(w); });
    if (caps.length >= 2 || /\b[A-Z]{3,}(?:\s+[A-Z]{2,}){1,}\b/.test(text.replace(/\b(ASAP|FYI|EOD|COB)\b/g, ''))) issues.push({ type: 'caps', severity: 'bad', text: caps.slice(0, 5).join(' '), why: 'Words in ALL CAPS read as shouting.', suggestion: 'Use normal case, and bold one key word if you must.' });
    var bangs = (text.match(/!/g) || []).length;
    if (/!{2,}/.test(text)) issues.push({ type: 'exclaim', severity: 'warn', text: (text.match(/!{2,}/) || [''])[0], why: 'Several exclamation marks in a row look angry or over-excited.', suggestion: 'Use one “!” at most.' });
    else if (bangs > 3) issues.push({ type: 'exclaim', severity: 'info', text: bangs + ' exclamation marks', why: 'Lots of “!” can feel over the top.', suggestion: 'Keep one or two.' });
    if (/\?{2,}/.test(text)) issues.push({ type: 'questions', severity: 'warn', text: (text.match(/\?{2,}/) || [''])[0], why: '“??” reads as impatient.', suggestion: 'Use a single “?”.' });
    sentences(text).forEach(function (s) { var n = s.split(/\s+/).length; if (n > 35) issues.push({ type: 'long', severity: 'info', text: s.slice(0, 80) + '…', why: 'This sentence has ' + n + ' words — hard to read on a phone.', suggestion: 'Split it into two or three shorter sentences.' }); });
    var words = text.split(/\s+/).filter(Boolean).length;
    if (words > 250) issues.push({ type: 'length', severity: 'info', text: words + ' words', why: 'Long emails often don’t get read in full.', suggestion: 'Put the ask in the first two lines, or use bullet points.' });
    if (words > 20 && !/\b(thanks|thank you|cheers|appreciate|grateful)\b/i.test(text)) issues.push({ type: 'thanks', severity: 'info', text: '', why: 'No thanks or appreciation anywhere.', suggestion: 'Add a short “Thanks for your help”.' });
    if (words > 15 && !/^(hi|hello|hey|dear|good (?:morning|afternoon)|g'?day)\b/i.test(text.trim())) issues.push({ type: 'greeting', severity: 'info', text: '', why: 'No greeting at the start.', suggestion: 'Start with “Hi [name],”.' });
    var score = Math.max(0, 100 - issues.reduce(function (s, i) { return s + (i.severity === 'bad' ? 25 : i.severity === 'warn' ? 12 : 4); }, 0));
    return { issues: issues, score: score, verdict: score >= 85 ? 'Friendly and clear' : score >= 60 ? 'Mostly fine — a few things to soften' : 'Could come across as harsh' };
  }

  // Replace flagged phrases with their softer alternative (only where the suggestion is literal text)
  function soften(draft) {
    var t = String(draft || '');
    BLUNT.forEach(function (b) { if (!/^\(|…|\[/.test(b[2])) t = t.replace(new RegExp(b[0].source, b[0].flags.replace('g', '') + 'g'), function (m) { var s = b[2]; return /^[A-Z]/.test(m) ? s : s.charAt(0).toLowerCase() + s.slice(1); }); });
    t = t.replace(/,\s*,/g, ',').replace(/\b[A-Z]{2,}(?:[\s,]+[A-Z]{2,})+\b/g, function (run) { return run.split(/(\s+|,)/).map(function (w) { return ACRONYMS.test(w) && w !== 'OK' ? w : w.toLowerCase(); }).join(''); }).replace(/(^|[.!?]\s+)([a-z])/g, function (_, a, c) { return a + c.toUpperCase(); }).replace(/!{2,}/g, '!').replace(/\?{2,}/g, '?');
    t = t.replace(/\b[A-Z]{3,}\b/g, function (w) { return ACRONYMS.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase(); });
    return t;
  }

  // ---------- subject lines ----------
  var STOP = /^(the|a|an|and|or|but|to|of|in|on|for|with|at|by|from|is|are|was|were|be|been|it|this|that|i|we|you|they|he|she|my|our|your|me|us|hi|hello|dear|please|thanks|thank|just|can|could|would|will|about|have|has|do|does|did|so|if|as|not|there|here|let|know|also|any|some|get|got|need|want|meet|meeting|next|week|talk|call|chat|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|time|quick|catch|morning|afternoon|soon|via|re)$/i;
  var FILLER = /^(available|availability|free|able|mentioned|earlier|still|waiting|obviously|clearly|holding|everything|anything|something|replied|reply|send|sent|asap|really|very|much|more|been|being|going|make|sure|back|again|already|other|into|over|then|than|what|when|where|which|while|who|why|how|okay|yes|hey|regards|cheers|best|sincerely|kind|warm|wanted|hope|well|good|great|thing|things|haven't|hasn't|didn't|don't|can't|won't|it's|i'm|i've|we're|you're|looking|forward|following|attached|find|ago|day|days)$/i;
  function topicOf(text) {
    // ignore the greeting line and everything from the sign-off down
    var lines = String(text || '').split('\n');
    if (/^\s*(hi|hello|hey|dear|good (?:morning|afternoon)|g'?day)\b/i.test(lines[0] || '')) lines.shift();
    var end = lines.findIndex(function (l) { return /^\s*(thanks|thank you|cheers|regards|kind regards|best|warm regards|many thanks|sincerely|yours)[,!.]?\s*$/i.test(l); });
    if (end >= 0) lines = lines.slice(0, end);
    var words = lines.join(' ').replace(/[^\w\s'-]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2 && !STOP.test(w) && !FILLER.test(w) && !/^\d+$/.test(w); });
    var freq = {}, first = {}; words.forEach(function (w, i) { var k = w.toLowerCase(); freq[k] = (freq[k] || 0) + 1; if (first[k] == null) first[k] = i; });
    // most frequent first, then longer words (more likely to be the subject), then earlier
    return Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a] || b.length - a.length || first[a] - first[b]; }).slice(0, 3);
  }
  function subjectSuggestions(body, category) {
    var a = classify({ subject: '', body: String(body || '') }), cat = category || a.primary, x = a.extract;
    var topic = topicOf(body).join(' '), T = topic ? topic.charAt(0).toUpperCase() + topic.slice(1) : 'Quick question';
    var when = x.dates[0] ? ' by ' + x.dates[0] : '';
    var out = [];
    if (cat === 'meeting') out.push('Meeting request: ' + T, 'Quick catch-up about ' + topic + '?', T + ' — are you free' + (x.dates[0] ? ' ' + x.dates[0] : ' this week') + '?');
    else if (cat === 'invoice') out.push((x.refs[0] ? 'Invoice ' + x.refs[0] : 'Invoice') + (x.amounts[0] ? ' — ' + x.amounts[0] : '') + ' — payment reminder', 'Payment for ' + topic, (x.refs[0] || 'Invoice') + ': due' + (when || ' soon'));
    else if (cat === 'complaint') out.push('Problem with ' + topic, 'Following up on ' + topic + ' — need help', 'Issue: ' + T);
    else if (cat === 'question') out.push('Quick question about ' + topic, 'Question: ' + T, T + '?');
    else out.push('Action needed: ' + T + when, 'Request: ' + T, T + ' — can you help' + when + '?');
    if (a.urgent) out.unshift('Urgent: ' + T + when);
    return out.map(function (s) { return s.replace(/\s+/g, ' ').trim().slice(0, 78); }).filter(function (s, i, arr) { return arr.indexOf(s) === i; }).slice(0, 4);
  }

  function mailto(to, subject, body) {
    return 'mailto:' + encodeURIComponent(to || '').replace(/%40/g, '@').replace(/%2C/gi, ',') + '?subject=' + encodeURIComponent(subject || '') + '&body=' + encodeURIComponent(body || '');
  }

  var L = { split: split, classify: classify, extract: extract, prioritise: prioritise, TEMPLATES: TEMPLATES, FIELD_LABELS: FIELD_LABELS, PHRASES: PHRASES, fill: fill, suggestTemplates: suggestTemplates, toneCheck: toneCheck, soften: soften, subjectSuggestions: subjectSuggestions, mailto: mailto, CATS: CATS };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.EmailLib = L;
})(this);
