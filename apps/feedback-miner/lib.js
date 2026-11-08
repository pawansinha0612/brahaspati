/* Review & Feedback Miner — pure logic (no DOM). Browser: window.FeedbackLib; Node: require(). */
(function (root) {
  'use strict';

  // ---------- helpers ----------
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function guessColumns(headers, fields) {
    var cands = [];
    fields.forEach(function (f, fi) {
      headers.forEach(function (h, hi) {
        var n = String(h).trim().toLowerCase();
        for (var i = 0; i < f.re.length; i++) if (f.re[i].test(n)) { cands.push({ key: f.key, h: h, score: i * 10 + fi * 0.01 + hi * 0.0001 }); break; }
      });
    });
    cands.sort(function (a, b) { return a.score - b.score; });
    var map = {}, used = {};
    cands.forEach(function (c) { if (map[c.key] == null && !used[c.h]) { map[c.key] = c.h; used[c.h] = 1; } });
    fields.forEach(function (f) { if (map[f.key] == null) map[f.key] = ''; });
    return map;
  }
  var FIELDS = [
    { key: 'text', label: 'Review / feedback text', required: true, re: [/^(review|feedback|comment|comments|body|content|text|message|review text|review body|review content)$/, /review|feedback|comment|body|content|text|message|response|answer/] },
    { key: 'rating', label: 'Star rating / score', re: [/^(rating|stars|star rating|score|review rating|overall)$/, /rating|stars?|score|nps/] },
    { key: 'date', label: 'Date', re: [/^(date|review date|created( at)?|submitted( at)?|published( at)?)$/, /date|created|submitted|time|published/] },
    { key: 'product', label: 'Product / SKU / location', re: [/^(product|sku|item|product name|product title|variant|location|branch|store)$/, /product|sku|item|variant|location|branch|store|service/] },
    { key: 'author', label: 'Reviewer name', re: [/^(author|name|reviewer|customer|reviewer name|display name|user)$/, /author|name|reviewer|customer|user/] },
    { key: 'title', label: 'Review title', re: [/^(title|headline|summary|review title)$/, /title|headline|summary/] },
    { key: 'source', label: 'Source', re: [/^(source|platform|site|channel)$/, /source|platform|site|channel/] }
  ];
  function detectColumns(headers) { return guessColumns(headers, FIELDS); }

  var MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  function detectDateOrder(values) {
    var dmy = 0, mdy = 0;
    values.forEach(function (v) { var m = String(v || '').trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-]\d{2,4}/); if (!m) return; if (+m[1] > 12) dmy++; if (+m[2] > 12) mdy++; });
    return mdy > dmy ? 'mdy' : 'dmy';
  }
  function parseDate(v, order) {
    var s = String(v == null ? '' : v).trim(), m; if (!s) return null;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return Date.UTC(+m[1], m[2] - 1, +m[3]);
    if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/))) { var y = +m[3]; if (y < 100) y += 2000; var a = +m[1], b = +m[2]; if (order === 'mdy') { var t = a; a = b; b = t; } return b >= 1 && b <= 12 && a >= 1 && a <= 31 ? Date.UTC(y, b - 1, a) : null; }
    if ((m = s.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/)) && MON[m[2].toLowerCase()] != null) return Date.UTC(+m[3], MON[m[2].toLowerCase()], +m[1]);
    if ((m = s.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/)) && MON[m[1].toLowerCase()] != null) return Date.UTC(+m[3], MON[m[1].toLowerCase()], +m[2]);
    if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/)) && MON[m[1].toLowerCase()] != null) return Date.UTC(+m[2], MON[m[1].toLowerCase()], 1);
    return null;
  }
  function parseRating(v) {
    if (v == null) return null; var s = String(v).trim(); if (!s) return null;
    var stars = (s.match(/★/g) || []).length; if (stars) return stars;
    var m = s.match(/(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(\d+)/i); if (m) return +m[1] / +m[2] * 5;
    m = s.match(/-?\d+(?:\.\d+)?/); return m ? +m[0] : null;
  }

  // ---------- sentiment lexicon (AFINN-style, -5..+5, plus review-specific words) ----------
  var LEX_SRC = 'amazing:4 awesome:4 excellent:4 outstanding:5 fantastic:4 brilliant:4 superb:5 perfect:3 wonderful:4 great:3 good:2 nice:2 lovely:3 love:3 loved:3 loves:3 ' +
    'best:3 better:2 happy:3 pleased:3 glad:2 impressed:3 recommend:2 recommended:2 friendly:2 helpful:2 polite:2 professional:2 welcoming:2 attentive:2 kind:2 caring:2 ' +
    'clean:2 tidy:1 spotless:3 comfortable:2 comfy:2 soft:1 sturdy:2 durable:2 solid:1 reliable:2 quick:1 fast:2 prompt:2 efficient:2 easy:1 smooth:1 beautiful:3 gorgeous:3 ' +
    'stunning:4 cute:2 fresh:1 affordable:2 reasonable:1 bargain:2 worth:2 value:1 thanks:2 thank:2 grateful:3 delighted:3 enjoy:2 enjoyed:2 fun:2 relaxing:2 relaxed:2 ' +
    'warm:1 calm:1 accommodating:2 knowledgeable:2 thorough:2 genuine:2 honest:2 quality:1 premium:2 flawless:3 favourite:2 favorite:2 pleasant:2 exceeded:3 wow:3 ' +
    'bad:-3 terrible:-3 awful:-3 horrible:-3 worst:-3 poor:-2 poorly:-2 disappointing:-2 disappointed:-2 disappointment:-2 unhappy:-2 upset:-2 angry:-3 annoyed:-2 annoying:-2 ' +
    'frustrated:-2 frustrating:-2 rude:-3 unfriendly:-2 unprofessional:-3 dismissive:-2 arrogant:-2 ignored:-2 unhelpful:-2 careless:-2 dirty:-2 filthy:-3 messy:-2 smelly:-2 ' +
    'smell:-1 smelled:-1 stink:-3 stinks:-3 broken:-3 broke:-2 breaks:-2 damaged:-3 cracked:-2 faulty:-3 defective:-3 leak:-2 leaks:-2 leaking:-2 leaked:-2 ripped:-2 torn:-2 ' +
    'tear:-1 pilling:-2 pilled:-2 flimsy:-2 cheap:-1 cheaply:-2 useless:-2 rubbish:-3 junk:-3 waste:-2 wasted:-2 overpriced:-3 expensive:-1 pricey:-1 late:-1 delayed:-2 delay:-2 ' +
    'slow:-2 wait:-1 waited:-1 waiting:-1 missing:-2 lost:-2 wrong:-2 mistake:-2 error:-2 problem:-2 problems:-2 issue:-1 issues:-1 complaint:-2 complain:-2 refund:-1 ' +
    'return:-1 returned:-1 returning:-1 scam:-4 fraud:-4 misleading:-3 inaccurate:-2 confusing:-2 confused:-2 difficult:-1 hard:-1 tight:-1 uncomfortable:-2 itchy:-2 ' +
    'scratchy:-2 painful:-2 hurt:-2 rushed:-2 overbooked:-2 cancelled:-1 canceled:-1 unreliable:-2 dead:-2 died:-2 fails:-2 failed:-2 fail:-2 stopped:-1 sad:-2 shame:-2 ' +
    'unacceptable:-3 ridiculous:-3 pathetic:-3 hate:-3 hated:-3 sucks:-3 meh:-1 average:-1 mediocre:-2 bland:-2 noisy:-1 cold:-1 crowded:-1 chaotic:-2 disorganised:-2 ' +
    'disorganized:-2 ignore:-1 lied:-3 lie:-2 never:-1 nobody:-1 unanswered:-2 fake:-3 sloppy:-2 bent:-1 dented:-2 scratched:-2 crushed:-2 soggy:-2 tiny:-1 ' +
    'ok:1 okay:1 fine:1 decent:1 alright:1';
  var LEX = {}; LEX_SRC.split(/\s+/).forEach(function (p) { var i = p.lastIndexOf(':'); LEX[p.slice(0, i)] = +p.slice(i + 1); });
  var PHRASES = [
    ['waste of money', -3], ['waste of time', -3], ['fell apart', -3], ['came apart', -3], ['stopped working', -3], ['never again', -3], ['rip off', -3], ['ripped off', -3],
    ['money back', -1], ['kept waiting', -2], ['too small', -2], ['too big', -2], ['too large', -2], ['too tight', -2], ['too loose', -2], ['runs small', -1], ['runs large', -1],
    ['not as described', -3], ['not worth', -2], ['no one', -1], ['highly recommend', 3], ['five stars', 3], ['5 stars', 3], ['well made', 2], ['fits perfectly', 3],
    ['fit perfectly', 3], ['true to size', 2], ['worth every', 3], ['on time', 1], ['above and beyond', 4], ['went out of their way', 3], ['top notch', 3], ['spot on', 3],
    ['value for money', 2], ['will be back', 3], ['coming back', 2], ['would not recommend', -3], ["wouldn't recommend", -3], ['do not buy', -3], ["don't buy", -3]
  ].map(function (p) { return { re: new RegExp('\\b' + p[0].replace(/ /g, '\\s+') + '\\b', 'gi'), score: p[1], text: p[0] }; });
  var NEGATORS = /^(not|no|never|none|nobody|nothing|neither|nor|without|hardly|barely|cannot|cant|dont|didnt|doesnt|isnt|wasnt|wont|wouldnt|arent|werent|havent|hasnt|couldnt|shouldnt|aint|.*n't)$/;
  var BOOST = { very: 1.5, really: 1.5, extremely: 1.8, so: 1.4, super: 1.5, incredibly: 1.8, absolutely: 1.7, totally: 1.5, completely: 1.6, highly: 1.5, most: 1.3, truly: 1.4, utterly: 1.8, such: 1.3,
    slightly: 0.5, somewhat: 0.6, bit: 0.6, little: 0.7, kinda: 0.6, fairly: 0.7, rather: 0.8, mostly: 0.8 };

  function tokens(s) { return String(s).toLowerCase().replace(/[’']/g, "'").match(/[a-z0-9]+(?:'[a-z]+)?|__p\d+/g) || []; }
  /* Score one piece of text. Returns {sum, score (-1..1), hits:[{w,s}]} */
  function sentiment(text) {
    var s = String(text || ''), phraseHits = [];
    PHRASES.forEach(function (p, i) { s = s.replace(p.re, function () { phraseHits.push(i); return ' __p' + i + ' '; }); });
    var parts = s.split(/\bbut\b|\bhowever\b|\balthough\b|\bthough\b/i), total = 0, hits = [];
    parts.forEach(function (part, pi) {
      var weight = parts.length > 1 ? (pi < parts.length - 1 ? 0.5 : 1.5) : 1, tk = tokens(part);
      tk.forEach(function (w, i) {
        var v = /^__p\d+$/.test(w) ? PHRASES[+w.slice(3)].score : LEX[w]; if (v == null) return;
        var label = /^__p\d+$/.test(w) ? PHRASES[+w.slice(3)].text : w;
        for (var j = Math.max(0, i - 3); j < i; j++) if (NEGATORS.test(tk[j].replace(/'/g, ''))) { v *= -0.75; label = 'not ' + label; break; }
        if (i > 0 && BOOST[tk[i - 1]]) v *= BOOST[tk[i - 1]];
        v *= weight; total += v; hits.push({ w: label, s: v });
      });
    });
    var score = total / Math.sqrt(total * total + 15);
    if (/!{2,}/.test(text) && total) score = Math.max(-1, Math.min(1, score * 1.1));
    return { sum: total, score: score, hits: hits };
  }
  function splitSentences(text) {
    return String(text || '').replace(/([.!?]+)\s+/g, '$1\n').replace(/\s+-\s+|;/g, '\n').split(/\s*\n\s*/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 1; });
  }

  // ---------- themes ----------
  function kw(list) { return new RegExp('\\b(' + list.join('|') + ')', 'i'); }
  var THEMES = {
    service: [
      { id: 'wait', name: 'Wait time', re: kw(['wait', 'waited', 'waiting', 'queue', 'running late', 'ran late', 'on time', 'late', 'delay', 'took forever', 'hour', 'minutes', 'mins', 'punctual']), neg: /\b(waited|kept waiting|waiting (for )?(over |almost |nearly )?\d+|\d+\s*(min|minutes|mins)\s*(late|wait|past)|running (really |so )?late|ran late|took forever|still waiting|late again)\b/i,
        idea: 'Track how late appointments run and build buffer time between bookings; text customers if you are running more than 10 minutes behind.', reply: 'We are sorry you were kept waiting — your time matters, and we are changing how we space out appointments so it doesn\'t happen again.' },
      { id: 'staff', name: 'Staff attitude', re: kw(['staff', 'receptionist', 'reception', 'team', 'stylist', 'therapist', 'technician', 'manager', 'owner', 'rude', 'friendly', 'attitude', 'polite', 'welcom', 'service was', 'girl', 'guy', 'lady', 'she', 'he ']), neg: /\b(rude|dismissive|unfriendly|ignored|attitude|unprofessional|arrogant|condescending|didn'?t listen|not listen)/i,
        idea: 'Share the specific feedback with the team in a short huddle; agree a standard greeting and how to handle unhappy customers.', reply: 'We are sorry about how you were treated. That is not the standard we hold ourselves to, and we have raised it with the team directly.' },
      { id: 'price', name: 'Price & value', re: kw(['price', 'priced', 'expensive', 'cheap', 'cost', 'charged', 'charge', 'overpriced', 'value', 'worth', '\\$', 'pricey', 'bill', 'fee']), neg: /\b(overpriced|expensive|pricey|overcharged|charged (me )?(extra|more)|hidden (fee|cost)|not worth|rip ?off)\b/i,
        idea: 'Publish prices clearly (including extras) before booking, and explain what is included so the value is visible.', reply: 'Thank you for the feedback on pricing. We want every visit to feel worth it, and we are making our prices and inclusions clearer up front.' },
      { id: 'clean', name: 'Cleanliness', re: kw(['clean', 'dirty', 'hygien', 'messy', 'tidy', 'dust', 'smell', 'filthy', 'spotless', 'bathroom', 'toilet', 'hair on', 'hair all over', 'basin']), neg: /\b(dirty|filthy|messy|unhygienic|dusty|smelly|stinks?|smell(s|ed)? (bad|awful|terrible|funny|off|musty)|stain|hair (on the floor|everywhere|all over))/i,
        idea: 'Add a visible cleaning checklist between customers and a daily end-of-day clean, and spot-check it weekly.', reply: 'We are sorry the space wasn\'t up to standard. We have tightened our cleaning routine between every customer.' },
      { id: 'booking', name: 'Booking & scheduling', re: kw(['book', 'booking', 'booked', 'appointment', 'reschedul', 'cancel', 'online system', 'website', 'app ', 'double booked', 'availability', 'slot']), neg: /\b(double[- ]booked|lost (my )?booking|no record|couldn'?t book|cancel+ed on me|reschedul\w+ (without|twice|again)|booking (system|app|site) (is|was) (a )?(nightmare|terrible|broken|confusing)|hard to book)/i,
        idea: 'Test your online booking yourself on a phone each month; send instant confirmations and make rescheduling self-serve.', reply: 'We are sorry about the trouble with your booking. We are fixing the gap in our booking process that caused it.' },
      { id: 'comms', name: 'Communication', re: kw(['call', 'called', 'phone', 'email', 'reply', 'replied', 'respond', 'message', 'text', 'contact', 'told', 'explain', 'informed', 'update']), neg: /\b(no (reply|response|call back|one (called|answered))|never (replied|responded|called|heard)|didn'?t (call|reply|respond|explain|tell)|not (told|informed)|unanswered|ignored my)/i,
        idea: 'Set a rule to answer every call, email and message within one business day, and confirm changes in writing.', reply: 'We are sorry we didn\'t keep you properly informed. We now reply to every message within one business day.' },
      { id: 'result', name: 'Quality of the work', re: kw(['result', 'cut', 'colour', 'color', 'treatment', 'massage', 'job', 'work', 'outcome', 'finish', 'nails', 'session']), neg: /\b(botched|uneven|patchy|wrong colou?r|not what I asked|had to (get it )?fix|redo|re-do|didn'?t (work|help))/i,
        idea: 'Confirm what the customer wants before starting (photos help) and offer a free fix-up within 7 days.', reply: 'We are sorry the result wasn\'t what you hoped for. We would love the chance to put it right at no cost.' }
    ],
    product: [
      { id: 'fit', name: 'Size & fit', re: kw(['size', 'sizing', 'fit', 'fits', 'fitted', 'small', 'large', 'big', 'tight', 'loose', 'snug', 'length', 'long', 'short', 'waist', 'too ']), neg: /\b(too (small|big|large|tight|loose|short|long)|runs? (small|large|big)|size(d)? (up|down)|order(ed)? a size|doesn'?t fit|didn'?t fit|tight (around|across|on)|had to (return|exchange))/i,
        idea: 'Update the size chart with real garment measurements and add a "fits small — size up" note if most fit complaints say too small.', reply: 'We are sorry the fit wasn\'t right. We are updating our size guide, and we are happy to exchange for another size free of charge.' },
      { id: 'quality', name: 'Quality & durability', re: kw(['quality', 'broke', 'broken', 'durable', 'flimsy', 'cheap', 'fell apart', 'came apart', 'seam', 'stitch', 'pilling', 'pilled', 'tear', 'ripped', 'hole', 'last', 'wash', 'faded', 'crack', 'material', 'fabric', 'sturdy', 'well made', 'leak']), neg: /\b(broke|broken|fell apart|came apart|flimsy|pill(ed|ing)|ripped|torn|hole|faded|cracked|leak\w*|after (one|two|a few|\d+) (wash|use|week|month)\w*|cheaply made|poor quality|stopped working)/i,
        idea: 'Pull the batch dates for these complaints and raise them with the supplier; consider a stronger material or a quality check before dispatch.', reply: 'We are sorry it didn\'t hold up — that\'s not good enough. We have passed this to our supplier and would like to replace it or refund you.' },
      { id: 'shipping', name: 'Shipping & delivery', re: kw(['shipping', 'shipped', 'delivery', 'delivered', 'arrive', 'arrived', 'courier', 'post', 'tracking', 'dispatch', 'days', 'weeks', 'parcel', 'australia post', 'late']), neg: /\b(took (\d+|two|three|over a|nearly a|almost a) (days|weeks?)|arrived late|still (hasn'?t|not) arrived|never arrived|lost in (the )?(post|transit)|no tracking|delayed|late delivery|slow (delivery|shipping))/i,
        idea: 'Show realistic delivery times at checkout, send tracking automatically, and review your courier if delays cluster in one period.', reply: 'We are sorry your order took so long. We are reviewing our courier and now send tracking with every order.' },
      { id: 'packaging', name: 'Packaging', re: kw(['packag', 'box', 'boxed', 'wrapped', 'wrapping', 'bag', 'plastic', 'arrived damaged', 'squashed', 'crushed', 'dented']), neg: /\b(arrived (damaged|broken|crushed|dented)|squashed|crushed|dented|poorly packed|no padding|box was (damaged|broken|open)|too much plastic|excessive packaging)/i,
        idea: 'Add padding or a sturdier box for fragile items, and drop-test a packed parcel; cut unnecessary plastic.', reply: 'We are sorry it arrived damaged. We have changed how we pack this item, and we will send a replacement straight away.' },
      { id: 'battery', name: 'Battery & charging', re: kw(['battery', 'charge', 'charging', 'charger', 'hours', 'power', 'drain', 'died', 'dies']), neg: /\b(battery (life )?(is |was )?(terrible|poor|bad|awful|weak|dies|died|drains?)|dies (after|within|in)|won'?t (hold|take) (a )?charge|stopped charging|only lasts?|drains? (fast|quickly))/i,
        idea: 'State the real battery life from your own testing, check for a faulty batch, and include charging tips in the box.', reply: 'We are sorry about the battery problems. That isn\'t normal for this product, so please contact us for a replacement under warranty.' },
      { id: 'instructions', name: 'Instructions & setup', re: kw(['instruction', 'manual', 'setup', 'set up', 'assemble', 'assembly', 'install', 'pair', 'pairing', 'how to', 'guide']), neg: /\b(no instructions|instructions (are |were )?(useless|confusing|unclear|missing|terrible)|hard to (set up|assemble|install|pair)|couldn'?t (figure|work out|pair|set)|confusing (setup|instructions))/i,
        idea: 'Rewrite the quick-start guide with pictures and add a 2-minute setup video link (QR code) in the box.', reply: 'We are sorry setup was confusing. We are rewriting our instructions and adding a short video — here is a step-by-step guide in the meantime.' },
      { id: 'value', name: 'Price & value', re: kw(['price', 'expensive', 'cheap', 'value', 'worth', 'money', 'cost', 'overpriced', 'bargain', '\\$']), neg: /\b(overpriced|not worth|waste of money|too expensive|rip ?off|cheaper elsewhere)/i,
        idea: 'Explain what makes the product worth the price on the listing (materials, warranty), or review the price against competitors.', reply: 'Thanks for the honest feedback on value. We want you to feel it was money well spent, so we\'d like to make this right.' },
      { id: 'accuracy', name: 'Matches the description', re: kw(['description', 'described', 'photo', 'picture', 'colour', 'color', 'looks different', 'expected', 'listing', 'advertised']), neg: /\b(not as (described|pictured|advertised)|looks (nothing|different)|colou?r (is |was )?(different|off|not)|different (to|from) the (photo|picture)|misleading)/i,
        idea: 'Re-shoot product photos in natural light, list exact colours and dimensions, and add customer photos to the listing.', reply: 'We are sorry it wasn\'t what you expected from the listing. We are updating the photos and description to be more accurate.' },
      { id: 'support', name: 'Customer service', re: kw(['customer service', 'support', 'contacted', 'email', 'reply', 'responded', 'refund', 'exchange', 'return', 'helpful', 'chat']), neg: /\b(no (reply|response)|never (replied|responded|heard back)|still waiting (for|on) (a |my )?(refund|reply)|refused (a )?(refund|return)|unhelpful|ignored)/i,
        idea: 'Reply to every support message within one business day and make the returns process self-serve.', reply: 'We are sorry our support let you down. We now reply to every message within one business day — please reach out and we\'ll sort it immediately.' }
    ]
  };
  function themesFor(mode) { return THEMES[mode] || THEMES.service; }

  /* Score every review: sentiment + theme mentions with per-sentence polarity. */
  function scoreReview(r, mode) {
    var themes = themesFor(mode), text = (r.title ? r.title + '. ' : '') + r.text, sents = splitSentences(text), whole = sentiment(text);
    var ts = whole.score, label;
    if (r.rating != null) {
      var star = (r.rating - 3) / 2, comb = 0.6 * star + 0.4 * ts;
      label = r.rating <= 2 ? 'negative' : r.rating >= 4 ? (ts < -0.5 ? 'mixed' : 'positive') : (ts < -0.1 ? 'negative' : ts > 0.3 ? 'positive' : 'mixed');
      r.score = comb;
    } else { r.score = ts; label = ts <= -0.2 ? 'negative' : ts >= 0.2 ? 'positive' : 'mixed'; }
    r.textScore = ts; r.label = label; r.mentions = [];
    sents.forEach(function (s) {
      var ss = sentiment(s).score;
      // when a sentence has a specific complaint cue (e.g. "waited 40 minutes"), other themes that only share a keyword
      // ("book a slot") are treated as neutral so one complaint isn't counted under several themes
      var cued = themes.some(function (t) { return t.re.test(s) && t.neg && t.neg.test(s); });
      themes.forEach(function (t) {
        if (!t.re.test(s)) return;
        var neg = t.neg && t.neg.test(s), pol = neg ? Math.min(ss, -0.4) : (cued && ss < 0.2 ? 0 : ss);
        if (!neg && !cued && Math.abs(ss) < 0.05 && r.label === 'negative') pol = -0.15;
        r.mentions.push({ theme: t.id, sentence: s, score: pol, polarity: pol <= -0.1 ? 'neg' : pol >= 0.2 ? 'pos' : 'neutral' });
      });
    });
    if (mode === 'product') {
      var low = text.toLowerCase();
      r.sizeDir = /too (small|tight|short)|runs? small|size(d)? up|order(ed)? (a|one) size (up|bigger|larger)|tight (around|across|on)/.test(low) ? 'small' : /too (big|large|loose|long)|runs? (large|big)|size(d)? down|order(ed)? (a|one) size (down|smaller)|baggy/.test(low) ? 'large' : null;
    }
    return r;
  }

  // ---------- importing ----------
  function fromTable(rows, map) {
    var order = map.date ? detectDateOrder(rows.map(function (r) { return r[map.date]; })) : 'dmy';
    var out = [], ratings = [];
    rows.forEach(function (r, i) {
      var text = String(r[map.text] == null ? '' : r[map.text]).trim(); var title = map.title ? String(r[map.title] || '').trim() : '';
      if (!text && !title) return;
      var rt = map.rating ? parseRating(r[map.rating]) : null; if (rt != null) ratings.push(rt);
      out.push({ id: 'r' + i, text: text, title: title, rating: rt, date: map.date ? parseDate(r[map.date], order) : null, product: map.product ? String(r[map.product] || '').trim() : '',
        author: map.author ? String(r[map.author] || '').trim() : '', source: map.source ? String(r[map.source] || '').trim() : '' });
    });
    normaliseRatings(out, ratings); return out;
  }
  // 10-point or 100-point scores -> 1..5 stars
  function normaliseRatings(list, ratings) {
    var max = Math.max.apply(null, ratings.concat([0])), min = Math.min.apply(null, ratings.concat([99]));
    var f = max > 10 ? function (v) { return 1 + v / 100 * 4; } : max > 5 ? (min === 0 ? function (v) { return 1 + v / 10 * 4; } : function (v) { return 1 + (v - 1) / 9 * 4; }) : null;
    list.forEach(function (r) { if (r.rating != null) { if (f) r.rating = f(r.rating); r.rating = Math.max(1, Math.min(5, r.rating)); } });
  }
  /* Pasted text: one review per paragraph (or per line if there are no blank lines). Picks up "5 stars", "★★★★☆", "4/5". */
  function fromPaste(text) {
    var t = String(text || '').replace(/\r/g, '').trim(); if (!t) return [];
    var blocks = /\n\s*\n/.test(t) ? t.split(/\n\s*\n/) : t.split('\n');
    return blocks.map(function (b, i) {
      var s = b.trim(), rating = null, m;
      if ((m = s.match(/^\s*(★+)(☆*)\s*[-:–]?\s*/))) { rating = m[1].length; s = s.slice(m[0].length); }
      else if ((m = s.match(/^\s*(\d(?:\.\d)?)\s*(?:\/\s*5|stars?|★)\s*[-:–.]?\s*/i))) { rating = +m[1]; s = s.slice(m[0].length); }
      else if ((m = s.match(/\s*[-–(]?\s*(\d)\s*(?:\/\s*5|stars?)\)?\s*$/i))) { rating = +m[1]; s = s.slice(0, m.index); }
      return { id: 'p' + i, text: s.trim(), title: '', rating: rating, date: null, product: '', author: '', source: 'pasted' };
    }).filter(function (r) { return r.text.length > 2; });
  }

  // ---------- analysis ----------
  var STOP = {}; ('a an the and or but if then so to of in on at for with from by as is was were are be been being it its it\'s this that these those i me my we our you your he she they them their his her ' +
    'have has had do does did not no very really just too also again all any some more most much many there here what which who when where why how than can could would should will ' +
    'get got one two after before about into out up down over only even still back am im i\'m ive i\'ve dont don\'t didn\'t wasn\'t isn\'t').split(' ').forEach(function (w) { STOP[w] = 1; });
  function phrases(reviews, filter, minCount, polarity) {
    var c = {}, seenIn = {};
    reviews.filter(filter).forEach(function (r) {
      var tk = tokens((r.title ? r.title + ' ' : '') + r.text), seen = {};
      for (var n = 2; n <= 3; n++) for (var i = 0; i + n <= tk.length; i++) {
        var g = tk.slice(i, i + n); if (STOP[g[0]] || STOP[g[n - 1]] || g.some(function (w) { return /^\d+$/.test(w) || /^__p/.test(w); })) continue;
        var k = g.join(' '); if (seen[k]) continue; seen[k] = 1; c[k] = (c[k] || 0) + 1;
      }
    });
    var list = Object.keys(c).filter(function (k) { if (c[k] < (minCount || 3)) return false; var sc = sentiment(k).sum; return polarity === 'neg' ? sc <= 0 : polarity === 'pos' ? sc >= 0 : true; }).map(function (k) { return { phrase: k, count: c[k] }; }).sort(function (a, b) { return b.count - a.count || b.phrase.split(' ').length - a.phrase.split(' ').length; });
    // drop bigrams fully covered by an equally frequent trigram
    return list.filter(function (p) { return !list.some(function (q) { return q !== p && q.count >= p.count && q.phrase.indexOf(p.phrase) >= 0 && q.phrase.length > p.phrase.length; }); }).slice(0, 20);
  }
  function monthKey(t) { var d = new Date(t); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2); }
  function pickQuotes(mentions, polarity, n) {
    var list = mentions.filter(function (m) { return m.polarity === polarity && m.sentence.length >= 25 && m.sentence.length <= 240; });
    list.sort(function (a, b) { return polarity === 'neg' ? a.score - b.score : b.score - a.score; });
    var out = [], seen = {}; list.forEach(function (m) { var k = m.sentence.toLowerCase().slice(0, 40); if (out.length < n && !seen[k]) { seen[k] = 1; out.push(m); } });
    return out;
  }

  /* Full analysis. opts: {recentMonths (2), priorMonths (4)} */
  function analyse(reviews, mode, opts) {
    opts = opts || {}; mode = mode === 'product' ? 'product' : 'service';
    var themes = themesFor(mode), list = reviews.map(function (r) { return scoreReview(Object.assign({}, r), mode); }), N = list.length;
    var res = { mode: mode, n: N, themes: [], months: [], emerging: [], products: [], ideas: [] };
    if (!N) return res;
    var rated = list.filter(function (r) { return r.rating != null; });
    res.avgRating = rated.length ? rated.reduce(function (s, r) { return s + r.rating; }, 0) / rated.length : null;
    res.counts = { positive: 0, mixed: 0, negative: 0 }; list.forEach(function (r) { res.counts[r.label]++; });
    res.avgScore = list.reduce(function (s, r) { return s + r.score; }, 0) / N;
    // themes
    themes.forEach(function (t) {
      var ms = [], negReviews = {}, posReviews = {}, allReviews = {};
      list.forEach(function (r) { r.mentions.forEach(function (m) { if (m.theme !== t.id) return; m.review = r; ms.push(m); allReviews[r.id] = 1; if (m.polarity === 'neg') negReviews[r.id] = 1; if (m.polarity === 'pos') posReviews[r.id] = 1; }); });
      var negMs = ms.filter(function (m) { return m.polarity === 'neg'; }), negCount = Object.keys(negReviews).length, posCount = Object.keys(posReviews).length;
      var negativity = negMs.length ? negMs.reduce(function (s, m) { return s - m.score; }, 0) / negMs.length : 0;
      res.themes.push({ id: t.id, name: t.name, mentions: Object.keys(allReviews).length, negative: negCount, positive: posCount, negativity: negativity,
        complaintScore: negCount * negativity, share: negCount / N, quotesNeg: pickQuotes(ms, 'neg', 3), quotesPos: pickQuotes(ms, 'pos', 2), idea: t.idea });
    });
    res.complaints = res.themes.filter(function (t) { return t.negative > 0; }).sort(function (a, b) { return b.complaintScore - a.complaintScore; });
    res.praise = res.themes.filter(function (t) { return t.positive > 0; }).sort(function (a, b) { return b.positive - a.positive; });
    res.negPhrases = phrases(list, function (r) { return r.label === 'negative'; }, Math.max(2, Math.round(N * 0.01)), 'neg');
    res.posPhrases = phrases(list, function (r) { return r.label === 'positive'; }, Math.max(2, Math.round(N * 0.01)), 'pos');
    // months
    var dated = list.filter(function (r) { return r.date != null; });
    if (dated.length) {
      var g = {}; dated.forEach(function (r) {
        var k = monthKey(r.date), m = g[k] = g[k] || { month: k, n: 0, neg: 0, ratingSum: 0, rated: 0, scoreSum: 0, themes: {} };
        m.n++; if (r.label === 'negative') m.neg++; m.scoreSum += r.score; if (r.rating != null) { m.ratingSum += r.rating; m.rated++; }
        var seen = {}; r.mentions.forEach(function (x) { if (x.polarity === 'neg' && !seen[x.theme]) { seen[x.theme] = 1; m.themes[x.theme] = (m.themes[x.theme] || 0) + 1; } });
      });
      var keys = Object.keys(g).sort(), first = keys[0], last = keys[keys.length - 1], all = [];
      for (var y = +first.slice(0, 4), mo = +first.slice(5) - 1; y * 12 + mo <= +last.slice(0, 4) * 12 + (+last.slice(5) - 1); mo++) { if (mo > 11) { mo = 0; y++; } all.push(y + '-' + ('0' + (mo + 1)).slice(-2)); }
      res.months = all.map(function (k) { var m = g[k] || { month: k, n: 0, neg: 0, rated: 0, ratingSum: 0, scoreSum: 0, themes: {} }; return { month: k, n: m.n, negShare: m.n ? m.neg / m.n : null, avgRating: m.rated ? m.ratingSum / m.rated : null, avgScore: m.n ? m.scoreSum / m.n : null, themes: m.themes }; });
      res.emerging = emerging(res.months, themes, opts.recentMonths || 2, opts.priorMonths || 4);
    }
    // products
    if (list.some(function (r) { return r.product; })) {
      var pg = {}; list.forEach(function (r) { var k = r.product || '(not given)'; (pg[k] = pg[k] || []).push(r); });
      res.products = Object.keys(pg).map(function (k) {
        var rs = pg[k], rr = rs.filter(function (r) { return r.rating != null; }), tc = {};
        rs.forEach(function (r) { var seen = {}; r.mentions.forEach(function (m) { if (m.polarity === 'neg' && !seen[m.theme]) { seen[m.theme] = 1; tc[m.theme] = (tc[m.theme] || 0) + 1; } }); });
        var top = Object.keys(tc).sort(function (a, b) { return tc[b] - tc[a]; }).map(function (id) { return { id: id, name: themes.filter(function (t) { return t.id === id; })[0].name, count: tc[id] }; });
        var small = rs.filter(function (r) { return r.sizeDir === 'small'; }).length, large = rs.filter(function (r) { return r.sizeDir === 'large'; }).length;
        return { product: k, n: rs.length, avgRating: rr.length ? rr.reduce(function (s, r) { return s + r.rating; }, 0) / rr.length : null, negShare: rs.filter(function (r) { return r.label === 'negative'; }).length / rs.length,
          topIssues: top.slice(0, 3), small: small, large: large };
      }).sort(function (a, b) { return b.negShare * b.n - a.negShare * a.n; });
      res.ideas = improvementIdeas(res.products, themes, mode);
    } else if (res.complaints.length) {
      res.ideas = res.complaints.slice(0, 5).map(function (t) { return { product: '', theme: t.name, count: t.negative, text: t.idea }; });
    }
    res.reviews = list;
    return res;
  }
  function emerging(months, themes, recentN, priorN) {
    var withData = months.filter(function (m) { return m.n > 0; }); if (withData.length < recentN + 2) return [];
    var recent = withData.slice(-recentN), prior = withData.slice(-(recentN + priorN), -recentN);
    var rn = recent.reduce(function (s, m) { return s + m.n; }, 0), pn = prior.reduce(function (s, m) { return s + m.n; }, 0);
    return themes.map(function (t) {
      var rc = recent.reduce(function (s, m) { return s + (m.themes[t.id] || 0); }, 0), pc = prior.reduce(function (s, m) { return s + (m.themes[t.id] || 0); }, 0);
      var rs = rn ? rc / rn : 0, ps = pn ? pc / pn : 0;
      return { id: t.id, name: t.name, recentCount: rc, priorCount: pc, recentShare: rs, priorShare: ps, growth: ps ? rs / ps : null, from: recent[0].month, to: recent[recent.length - 1].month };
    }).filter(function (e) { return e.recentCount >= 3 && e.recentShare >= Math.max(1.5 * e.priorShare, e.priorShare + 0.04); })
      .sort(function (a, b) { return (b.recentShare - b.priorShare) - (a.recentShare - a.priorShare); });
  }
  function improvementIdeas(products, themes, mode) {
    var ideas = [];
    products.forEach(function (p) {
      p.topIssues.forEach(function (iss) {
        if (iss.count < 3 && iss.count / p.n < 0.2) return;
        var t = themes.filter(function (x) { return x.id === iss.id; })[0], text = t.idea;
        if (iss.id === 'fit' && (p.small || p.large)) {
          var dir = p.small >= p.large ? 'small' : 'large', k = Math.max(p.small, p.large);
          text = k + ' of ' + p.n + ' reviews say it runs ' + dir + (p.small && p.large ? ' (' + Math.min(p.small, p.large) + ' say the opposite)' : '') + '. ' +
            (dir === 'small' ? 'Add "fits small — we recommend sizing up" to the listing and update the size chart with real measurements.' : 'Add "fits large — consider sizing down" to the listing and update the size chart.');
        }
        ideas.push({ product: p.product, theme: iss.name, count: iss.count, share: iss.count / p.n, text: text });
      });
    });
    return ideas.sort(function (a, b) { return b.count - a.count; });
  }

  /* Reply draft for a negative review. opts: {business, contact, signoff} */
  function replyDraft(r, mode, opts) {
    opts = opts || {}; var themes = themesFor(mode), first = String(r.author || '').trim().split(/\s+/)[0];
    if (!first || /anonymous|customer|verified|buyer|a google user/i.test(r.author || '')) first = '';
    var negThemes = []; (r.mentions || []).forEach(function (m) { if (m.polarity === 'neg' && negThemes.indexOf(m.theme) < 0) negThemes.push(m.theme); });
    var lines = negThemes.slice(0, 2).map(function (id) { return themes.filter(function (t) { return t.id === id; })[0].reply; });
    if (!lines.length) lines.push('We are sorry your experience didn\'t meet your expectations, and we appreciate you taking the time to tell us.');
    var contact = opts.contact || (mode === 'product' ? '[your support email]' : '[your phone or email]');
    var ask = mode === 'product' ? 'Please email us at ' + contact + ' with your order number' + (r.product ? ' (' + r.product + ')' : '') + ' and we will sort it out for you.' : 'Please get in touch on ' + contact + ' — we would really like the chance to make it right.';
    return 'Hi ' + (first || 'there') + ',\n\nThank you for your honest feedback. ' + lines.join(' ') + '\n\n' + ask + '\n\n' + (opts.signoff || 'Kind regards,') + '\n' + (opts.business || '[Your business name]');
  }

  // ---------- CSV of scored reviews ----------
  function reviewRows(res) {
    var names = {}; themesFor(res.mode).forEach(function (t) { names[t.id] = t.name; });
    return (res.reviews || []).map(function (r) {
      var neg = [], pos = []; r.mentions.forEach(function (m) { var n = names[m.theme]; if (m.polarity === 'neg' && neg.indexOf(n) < 0) neg.push(n); if (m.polarity === 'pos' && pos.indexOf(n) < 0) pos.push(n); });
      return { Date: r.date ? new Date(r.date).toISOString().slice(0, 10) : '', Product: r.product, Author: r.author, Rating: r.rating == null ? '' : Math.round(r.rating * 10) / 10,
        Sentiment: r.label, Score: Math.round(r.score * 100) / 100, Complaints: neg.join('; '), Praise: pos.join('; '), Review: (r.title ? r.title + ' — ' : '') + r.text };
    });
  }

  // ---------- sample data (made up) ----------
  function sampleData(mode, endIso) {
    var R = rng(mode === 'product' ? 77 : 33), end = Date.parse((endIso || '2026-11-08') + 'T00:00:00Z'), DAY = 86400000;
    function pick(a) { return a[Math.floor(R() * a.length)]; }
    var names = ['Sarah M', 'James T', 'Priya K', 'Liam O', 'Chloe W', 'Ben R', 'Mia S', 'Noah P', 'Aisha B', 'Tom H', 'Emma L', 'Jack D', 'Olivia N', 'Raj V', 'Grace F', 'Lucas Z', 'Zoe C', 'Ethan G', 'Hannah J', 'Sam Y', 'A Google user'];
    var rows = [];
    if (mode !== 'product') {
      var P = {
        staff: ['Jess was lovely and really listened to what I wanted.', 'The whole team is so friendly and welcoming.', 'Marco is an absolute legend, best cut I\'ve had in years.', 'Staff were professional and made me feel relaxed.', 'Reception was warm and helpful.'],
        result: ['Love my new colour!', 'The balayage turned out perfect.', 'Great cut, exactly what I asked for.', 'My hair has never looked better.', 'Brilliant result, so many compliments.'],
        clean: ['The salon is spotless and smells amazing.', 'Always clean and tidy.'],
        price: ['Fair prices for the quality.', 'Good value compared to the city salons.'],
        booking: ['Booking online was quick and easy.', 'Easy to get an appointment that suited me.']
      };
      var N = {
        wait: ['I waited 40 minutes past my appointment time with no apology.', 'They were running really late and nobody told me.', 'Kept waiting for over half an hour, which is not ok when you book a slot.', 'Waited 25 minutes before anyone even started.', 'Ran late again — third time this year.'],
        staff: ['The receptionist was rude and dismissive when I asked a question.', 'The stylist had a bad attitude and barely spoke to me.', 'Felt ignored the whole time.'],
        price: ['Way overpriced for a basic trim.', 'Charged me extra for a toner nobody mentioned. Hidden costs are not cool.', 'Too expensive for what you get.'],
        booking: ['The online booking system is a nightmare, it lost my booking.', 'Got double-booked and was sent home.', 'They rescheduled without asking me, twice.'],
        comms: ['Called three times and no one called back.', 'Never replied to my email about the colour issue.'],
        result: ['Colour came out patchy and I had to get it fixed elsewhere.', 'The cut was uneven, not what I asked for.'],
        clean: ['Hair all over the floor and the basins looked dirty.']
      };
      for (var i = 0; i < 280; i++) {
        var t = end - Math.floor(R() * 365) * DAY, ageM = (end - t) / DAY / 30.44, recent = ageM < 2;
        var good = R() < (recent ? 0.5 : 0.8), parts = [], rating;
        if (good) {
          parts.push(pick(P[pick(['staff', 'staff', 'result', 'result', 'clean', 'price', 'booking'])])); if (R() < 0.6) parts.push(pick(P[pick(['staff', 'result', 'clean', 'booking'])]));
          if (R() < 0.3) parts.push(pick(['Highly recommend!', 'Will be back.', 'Thanks team!', 'Five stars.']));
          if (R() < 0.12) parts.push(pick(N.wait).replace('no apology', 'but they apologised')); rating = R() < 0.75 ? 5 : 4;
        } else {
          var w = recent ? ['wait', 'wait', 'wait', 'wait', 'wait', 'staff', 'price', 'booking', 'comms', 'result'] : (ageM > 5 && ageM < 8 ? ['booking', 'booking', 'booking', 'wait', 'staff', 'price', 'result', 'comms', 'clean'] : ['wait', 'staff', 'price', 'price', 'booking', 'comms', 'result', 'clean']);
          var th = pick(w); parts.push(pick(N[th])); if (R() < 0.45) { var th2 = pick(w); if (th2 !== th) parts.push(pick(N[th2])); }
          if (R() < 0.35) parts.push(pick(['The actual haircut was fine though.', 'Shame, because the colour was nice.', 'Not coming back.', 'Very disappointed.']));
          rating = R() < 0.45 ? 1 : R() < 0.7 ? 2 : 3;
        }
        rows.push({ Date: new Date(t).toISOString().slice(0, 10), Reviewer: pick(names), Rating: rating, Review: parts.join(' '), Source: pick(['Google', 'Google', 'Facebook', 'Fresha']) });
      }
      return { headers: ['Date', 'Reviewer', 'Rating', 'Review', 'Source'], rows: rows.sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }) };
    }
    var prods = [
      { p: 'Studio Leggings', w: 0.26, bad: 0.38, issues: ['fit', 'fit', 'fit', 'fit', 'fit', 'quality'], good: ['Super soft and squat-proof.', 'Love the high waist, so comfortable.', 'Fits perfectly once I sized up.'] },
      { p: 'Trail Bottle 750ml', w: 0.24, bad: 0.35, issues: ['leak', 'leak', 'leak', 'packaging'], good: ['Keeps water cold all day.', 'Great bottle, sturdy and well made.'] },
      { p: 'Everyday Hoodie', w: 0.2, bad: 0.15, issues: ['pilling', 'fit', 'shipping'], good: ['Cosy and warm, great quality.', 'My new favourite hoodie.', 'True to size and really soft.'] },
      { p: 'Sport Earbuds', w: 0.15, bad: 0.4, issues: ['battery', 'battery', 'battery', 'setup'], good: ['Sound is great and they stay in during runs.', 'Pairing was easy and quick.'] },
      { p: 'Yoga Mat Pro', w: 0.15, bad: 0.25, issues: ['smell', 'packaging', 'accuracy'], good: ['Great grip, perfect for hot yoga.', 'Thick and comfortable on my knees.'] }
    ];
    var NP = {
      fit: ['Runs small — I had to return them and order a size up.', 'Way too tight around the waist, definitely size up.', 'Too small, the size chart is wrong.', 'Ordered my usual size and they were too small.'],
      quality: ['Seam ripped after two washes.', 'Started pilling after one wash, poor quality for the price.'],
      leak: ['The lid leaks everywhere, soaked my bag.', 'Leaked after a week, the seal is cheaply made.', 'Leaking from the lid every time I tilt it.', 'New lid design leaks, my old one was fine.'],
      packaging: ['Arrived dented, the box had no padding.', 'Box was crushed when it arrived and the item was scratched.'],
      pilling: ['Pilled badly after a few washes.', 'Fabric started pilling within a month.'],
      battery: ['Battery dies after about 2 hours, not the 8 advertised.', 'The right earbud won\'t hold a charge anymore.', 'Battery life is terrible.'],
      setup: ['Instructions are useless, took ages to pair.', 'Couldn\'t figure out how to pair them, no proper manual.'],
      smell: ['Strong chemical smell that won\'t go away.', 'Smelled awful for a week.'],
      accuracy: ['Colour is different from the photo, much darker.', 'Not as pictured, looks nothing like the listing.'],
      shipping: ['Took three weeks to arrive.', 'Delivery was delayed with no tracking updates.']
    };
    for (var j = 0; j < 320; j++) {
      var u = R(), acc = 0, pr = prods[0]; for (var k = 0; k < prods.length; k++) { acc += prods[k].w; if (u <= acc) { pr = prods[k]; break; } }
      var tt = end - Math.floor(R() * 300) * DAY, dmo = new Date(tt).getUTCMonth(), xmas = dmo === 11 || dmo === 0;
      // the bottle supplier changed about two months ago: leak complaints jump (an emerging issue)
      var badP = pr.p === 'Trail Bottle 750ml' ? ((end - tt) / DAY < 61 ? 0.75 : 0.08) : pr.bad;
      var bad = R() < badP + (xmas ? 0.1 : 0), parts2 = [], rt;
      if (!bad) { parts2.push(pick(pr.good)); if (R() < 0.4) parts2.push(pick(['Fast delivery too.', 'Arrived quickly and well packaged.', 'Highly recommend!', 'Worth every cent.'])); if (pr.p === 'Studio Leggings' && R() < 0.25) parts2.push('Runs a bit small so size up.'); rt = R() < 0.7 ? 5 : 4; }
      else {
        var is = xmas && R() < 0.5 ? 'shipping' : pick(pr.issues); parts2.push(pick(NP[is]));
        if (R() < 0.3) parts2.push(pick(['Customer service never replied to my email.', 'Disappointed.', 'Otherwise looks nice.', 'Would not recommend.']));
        rt = R() < 0.4 ? 1 : R() < 0.75 ? 2 : 3;
      }
      rows.push({ 'Review date': new Date(tt).toISOString().slice(0, 10), Product: pr.p, 'Star rating': rt, 'Review title': '', 'Review body': parts2.join(' '), 'Reviewer name': pick(names).replace('A Google user', 'Verified buyer') });
    }
    return { headers: ['Review date', 'Product', 'Star rating', 'Review title', 'Review body', 'Reviewer name'], rows: rows.sort(function (a, b) { return a['Review date'] < b['Review date'] ? 1 : -1; }) };
  }

  var L = {
    FIELDS: FIELDS, THEMES: THEMES, LEX: LEX, rng: rng, guessColumns: guessColumns, detectColumns: detectColumns, parseDate: parseDate, parseRating: parseRating,
    sentiment: sentiment, splitSentences: splitSentences, themesFor: themesFor, scoreReview: scoreReview, fromTable: fromTable, fromPaste: fromPaste,
    phrases: phrases, analyse: analyse, emerging: emerging, replyDraft: replyDraft, reviewRows: reviewRows, sampleData: sampleData
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.FeedbackLib = L;
})(this);
