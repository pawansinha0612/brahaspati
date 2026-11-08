/* Product Listing Optimiser — pure logic: marketplace rules, listing checks + score, safe auto-fixes, template generator,
   bulk CSV mapping. No DOM. Marketplace limits are commonly published figures; marketplaces change them, so the UI says so. */
(function (root) {
  'use strict';

  // ---------- marketplace rules (check the current marketplace rules — these change) ----------
  var RULES = {
    amazon: {
      name: 'Amazon', titleMax: 200, titleIdeal: 80, titleNote: 'Amazon allows up to 200 characters in most categories, but recommends about 80 so the title fits on phones. Some categories are stricter.',
      bullets: 5, bulletMax: 500, bulletIdeal: 250, descMax: 2000, tags: 0, searchTermsBytes: 249, maxWordRepeat: 2,
      badChars: '!$?_{}^¬¦~#<>*', images: 'Main image on a pure white background, product fills ~85% of the frame, at least 1000 px on the longest side so zoom works; up to 9 images. No text, logos or watermarks on the main image.',
      notes: ['Don’t repeat a word more than twice in the title.', 'No promotional words (sale, free shipping, best seller) in the title.', 'Backend search terms: under 249 bytes, no brand names, no repeats of title words.'],
      titleOrder: ['brand', 'product', 'keyFeature', 'material', 'size', 'colour', 'quantity']
    },
    ebay: {
      name: 'eBay', titleMax: 80, titleIdeal: 80, titleNote: 'eBay titles are limited to 80 characters — use them all with words buyers search for.',
      bullets: 0, bulletMax: 0, descMax: 500000, tags: 0, maxWordRepeat: 1, badChars: '!*~<>{}@',
      images: 'At least 500 px on the longest side (1600 px recommended), up to 24 images, no borders, text or added artwork.',
      notes: ['Fill in every item specific (brand, size, colour, material, condition) — buyers filter on them.', 'Avoid “L@@K”, “WOW” and keyword spam; eBay can remove the listing.'],
      titleOrder: ['brand', 'product', 'material', 'colour', 'size', 'keyFeature', 'quantity']
    },
    etsy: {
      name: 'Etsy', titleMax: 140, titleIdeal: 70, titleNote: 'Etsy allows 140 characters but recommends short, clear titles that read naturally — put the most important words first.',
      bullets: 0, bulletMax: 0, descMax: 0, tags: 13, tagMax: 20, maxWordRepeat: 1, badChars: '$^`%&',
      images: 'Up to 20 photos; at least 2000 px on the shortest side is recommended. Use the first photo to show the whole item clearly.',
      notes: ['Use all 13 tags; multi-word phrases like “gift for her” work better than single words.', 'Add materials and occasion/style attributes — Etsy search uses them.'],
      titleOrder: ['product', 'keyFeature', 'material', 'colour', 'size', 'audience', 'brand']
    },
    google: {
      name: 'Shopify / Google Shopping', titleMax: 150, titleIdeal: 70, titleNote: 'Google Shopping allows 150 characters but usually shows the first ~70. Lead with brand and product type.',
      bullets: 0, bulletMax: 0, descMax: 5000, tags: 0, maxWordRepeat: 2, badChars: '!*~<>{}^',
      images: 'At least 100×100 px (250×250 for clothing), 800×800 px or more recommended; no watermarks, promotional text or borders.',
      notes: ['Google rejects promotional text (free shipping, sale, % off) in titles and images.', 'Give brand, GTIN (barcode) or MPN, condition, and colour/size for clothing.'],
      titleOrder: ['brand', 'product', 'keyFeature', 'material', 'colour', 'size', 'quantity']
    }
  };

  // Risky or banned claims. Each: regex, why, fix.
  var CLAIMS = [
    { re: /\b(?:best|#\s?1|number one|no\.?\s?1|top[- ]rated|world'?s (?:best|finest))\b/i, level: 'warn', why: 'Superlative claim (“best”, “#1”) — not allowed in Amazon/Google titles and needs proof under consumer law.', fix: 'Replace with a specific fact (“rated 4.8 by 1,200 buyers”, “10-year warranty”).' },
    { re: /\b(?:cures?|cured|treats?|heals?|healing|prevents?|diagnos\w*|remed(?:y|ies))\b/i, level: 'bad', why: 'Medical claim — cure/treat/heal/prevent wording can make a product a therapeutic good (TGA/FDA) and gets listings removed.', fix: 'Describe what it is and how it feels or is used, not what it fixes.' },
    { re: /\b(?:cancer|covid|coronavirus|virus|arthritis|diabetes|anxiety|depression|insomnia|eczema|psoriasis|adhd|autism|pain relief|relieves? pain)\b/i, level: 'bad', why: 'Mentions a disease or condition — treated as a health claim by marketplaces and regulators.', fix: 'Remove the condition; talk about comfort, materials or use instead.' },
    { re: /\b100\s?%/i, level: 'warn', why: '“100%” claims must be literally true and provable (e.g. “100% cotton” is fine if it is; “100% effective” is not).', fix: 'Keep only if it’s a verifiable composition fact.' },
    { re: /\bguarantee(?:d|s)?\b/i, level: 'warn', why: '“Guaranteed” is a promise you must honour; Amazon and Google don’t allow guarantees in titles.', fix: 'Move warranty details to the description with the real terms.' },
    { re: /\b(?:free shipping|free delivery|on sale|sale|discount|\d+\s?% off|cheapest|lowest price|best price|limited time|hot deal|clearance|bargain|bonus)\b/i, level: 'bad', why: 'Promotional text — not allowed in titles on Amazon, eBay or Google Shopping.', fix: 'Use the marketplace’s promotion tools instead of the title.' },
    { re: /\b(?:fda|tga) (?:approved|registered|listed)\b|\bclinically (?:proven|tested)\b|\bdoctor recommended\b|\bdermatologist (?:approved|recommended)\b/i, level: 'bad', why: 'Regulatory or clinical claim — only allowed with documented approval or studies.', fix: 'Remove unless you hold the evidence, and check the marketplace’s category rules.' },
    { re: /\b(?:anti[- ]?bacterial|antimicrobial|anti[- ]?viral|kills? 99(?:\.9)?%|disinfect\w*|sanitis\w*|sanitiz\w*)\b/i, level: 'bad', why: 'Pesticide/antimicrobial claim — restricted on Amazon and regulated (APVMA/EPA).', fix: 'Remove, or use only if the product is registered for that claim.' },
    { re: /\b(?:eco[- ]?friendly|non[- ]?toxic|chemical[- ]?free|biodegradable|compostable|hypoallergenic|organic|sustainable|carbon[- ]neutral)\b/i, level: 'info', why: 'Environmental or safety claim — the ACCC and FTC expect proof (certification or test results).', fix: 'Be specific: “certified organic cotton (GOTS)”, “home-compostable to AS 5810”.' },
    { re: /\b(?:authentic|genuine|original|replica|inspired by|dupe|knock[- ]?off)\b/i, level: 'info', why: 'Authenticity wording attracts brand-protection complaints if the product isn’t the brand’s own.', fix: 'Only name another brand if you are its authorised seller.' }
  ];

  var STOP = 'a an and the for with of to in on at by from or your you our is are it this that as be'.split(' ');
  var ACRONYMS = 'USB LED LCD UK US USA AU NZ EU UV UVA UVB XS S M L XL XXL XXXL 2XL 3XL 4XL BPA PVC PU ABS GSM SPF HDMI DIY ML L KG MM CM ID PDF A4 A5 A3 TV PC MDF SLR DSLR HD 4K 5G AC DC RGB IP65 IP67 IP68 OZ LB'.split(' ');
  var BENEFIT = /\b(?:you|your|so|helps?|keeps?|makes?|lets?|saves?|easy|easier|enjoy|perfect for|ideal for|great for|without|no more|never|stays?|comfort\w*|protects?|ready to|feel|peace of mind|won'?t|less|fits?)\b/i;

  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function words(s) { return (String(s || '').toLowerCase().match(/[a-z0-9]+(?:['’][a-z]+)?/g) || []); }
  function lines(v) { if (Array.isArray(v)) return v.map(clean).filter(Boolean); return String(v || '').split(/\r?\n|\s*\|\s*/).map(function (s) { return clean(s.replace(/^[-•*·]\s*/, '')); }).filter(Boolean); }
  function list(v) { if (Array.isArray(v)) return v.map(clean).filter(Boolean); return String(v || '').split(/[,;\n]/).map(clean).filter(Boolean); }
  function byteLen(s) { var n = 0; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xd800 && c < 0xdc00) ? (i++, 4) : 3; } return n; }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Count of a phrase (whole words, case-insensitive) in text.
  function countPhrase(text, phrase) {
    var p = words(phrase); if (!p.length) return 0;
    var re = new RegExp('\\b' + p.map(escRe).join('[\\s\\-]+') + '\\b', 'gi');
    return (String(text || '').match(re) || []).length;
  }

  // ---------- readability (Flesch reading ease) ----------
  function syllables(w) {
    w = w.toLowerCase().replace(/[^a-z]/g, ''); if (!w) return 0; if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    var m = w.match(/[aeiouy]{1,2}/g); return Math.max(1, m ? m.length : 1);
  }
  function readability(text) {
    text = clean(text); if (!text) return { score: NaN, sentences: 0, words: 0, avgSentence: 0, label: '' };
    var sents = text.split(/[.!?]+(?:\s|$)|\n/).filter(function (s) { return words(s).length; });
    var ws = words(text), syl = ws.reduce(function (s, w) { return s + syllables(w); }, 0);
    var ns = Math.max(1, sents.length), score = 206.835 - 1.015 * (ws.length / ns) - 84.6 * (syl / Math.max(1, ws.length));
    score = Math.round(Math.max(0, Math.min(100, score)));
    return { score: score, sentences: ns, words: ws.length, avgSentence: Math.round(ws.length / ns * 10) / 10,
      label: score >= 70 ? 'Easy to read' : score >= 50 ? 'Fairly easy' : score >= 30 ? 'Hard going' : 'Very hard to read' };
  }

  // ---------- listing checks ----------
  // listing: { title, bullets (array or text), description, tags, brand, product, size, colour, material, dimensions, care, quantity, keywords (list), searchTerms }
  function normalise(l) {
    l = l || {};
    return { title: clean(l.title), bullets: lines(l.bullets), description: String(l.description || '').trim(), tags: list(l.tags), keywords: list(l.keywords),
      brand: clean(l.brand), product: clean(l.product), size: clean(l.size), colour: clean(l.colour || l.color), material: clean(l.material), dimensions: clean(l.dimensions),
      care: clean(l.care), quantity: clean(l.quantity), keyFeature: clean(l.keyFeature), audience: clean(l.audience), searchTerms: clean(l.searchTerms), sku: clean(l.sku) };
  }

  function check(listing, mk) {
    var R = RULES[mk] || RULES.amazon, l = normalise(listing), issues = [], good = [];
    function add(level, area, msg, fix) { issues.push({ level: level, area: area, msg: msg, fix: fix || '' }); }
    var t = l.title, tl = t.length, all = [t].concat(l.bullets, [l.description], l.tags, [l.searchTerms]).join('\n');

    // title length
    if (!t) add('bad', 'Title', 'There is no title.', 'Write one: brand + product type + key feature + size/colour.');
    else if (tl > R.titleMax) add('bad', 'Title', 'Title is ' + tl + ' characters — over the ' + R.name + ' limit of ' + R.titleMax + '.', 'Cut ' + (tl - R.titleMax) + ' characters; drop repeated or filler words first.');
    else if (tl > R.titleIdeal && R.titleIdeal < R.titleMax) add('info', 'Title', 'Title is ' + tl + ' characters; only about the first ' + R.titleIdeal + ' show on phones and in ads.', 'Put the most important words in the first ' + R.titleIdeal + ' characters.');
    else if (tl < Math.min(40, R.titleMax * 0.4)) add('warn', 'Title', 'Title is short (' + tl + ' characters) — you are leaving search words unused.', 'Add material, size, colour or the main use.');
    else good.push('Title length fits ' + R.name + '.');

    // title structure
    if (t) {
      var tlow = t.toLowerCase();
      if (l.brand) {
        if (tlow.indexOf(l.brand.toLowerCase()) < 0) add(mk === 'etsy' ? 'info' : 'warn', 'Title', 'Brand “' + l.brand + '” is not in the title.', mk === 'etsy' ? 'Optional on Etsy; shoppers search by item, not shop name.' : 'Start the title with the brand.');
        else if (mk !== 'etsy' && tlow.indexOf(l.brand.toLowerCase()) > 0) add('info', 'Title', 'Brand isn’t at the start of the title.', 'Most marketplaces expect “Brand Product …”.');
        else good.push('Brand is in the title.');
      }
      if (l.product && countPhrase(t, l.product) === 0) add('warn', 'Title', 'The product type “' + l.product + '” isn’t in the title.', 'Shoppers search for the product type — include it early.');
      var attrs = [['size', l.size], ['colour', l.colour], ['material', l.material], ['quantity', l.quantity]].filter(function (a) { return a[1]; });
      var inTitle = attrs.filter(function (a) { return countPhrase(t, a[1]) > 0 || tlow.indexOf(a[1].toLowerCase()) >= 0; });
      if (attrs.length && !inTitle.length) add('warn', 'Title', 'None of the key attributes (' + attrs.map(function (a) { return a[0]; }).join(', ') + ') are in the title.', 'Add the size, colour or material buyers filter by.');
      if (!/\d/.test(t) && !l.size && !l.quantity) add('info', 'Title', 'No size, quantity or measurement in the title.', 'Numbers (“500 ml”, “Set of 4”) help buyers compare.');

      // duplicates
      var counts = {}; words(t).forEach(function (w) { if (STOP.indexOf(w) < 0 && w.length > 1) counts[w] = (counts[w] || 0) + 1; });
      var dups = Object.keys(counts).filter(function (w) { return counts[w] > R.maxWordRepeat; });
      if (dups.length) add(mk === 'amazon' ? 'bad' : 'warn', 'Title', 'Repeated word' + (dups.length > 1 ? 's' : '') + ': ' + dups.map(function (w) { return '“' + w + '” ×' + counts[w]; }).join(', ') + '.', R.name + ' allows a word ' + (R.maxWordRepeat === 1 ? 'once' : 'at most ' + R.maxWordRepeat + ' times') + '; repeating doesn’t help ranking.');

      // caps
      var capsWords = (t.match(/\b[A-Z]{3,}\b/g) || []).filter(function (w) { return ACRONYMS.indexOf(w) < 0 && !(l.brand && l.brand.toUpperCase() === l.brand && l.brand.indexOf(w) >= 0); });
      var letters = t.replace(/[^A-Za-z]/g, '');
      if (letters.length > 10 && letters === letters.toUpperCase()) add('bad', 'Title', 'The whole title is in CAPITALS.', 'Use Title Case or sentence case — all caps reads as shouting and breaks most marketplace rules.');
      else if (capsWords.length) add('warn', 'Title', 'Words in ALL CAPS: ' + capsWords.slice(0, 6).join(', ') + '.', 'Only use capitals for real acronyms (USB, LED) or a brand written that way.');

      // special characters / emoji
      var bad = []; for (var i = 0; i < t.length; i++) if (R.badChars.indexOf(t[i]) >= 0 && bad.indexOf(t[i]) < 0) bad.push(t[i]);
      if (/[☀-➿]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/.test(t)) bad.push('emoji');
      if (bad.length) add('warn', 'Title', 'Characters ' + R.name + ' discourages in titles: ' + bad.join(' ') + '.', 'Remove them; use plain words and commas or dashes.');
    }

    // claims (anywhere)
    var seen = {};
    CLAIMS.forEach(function (c) {
      var g = new RegExp(c.re.source, 'gi'), found = (all.match(g) || []).map(function (s) { return s.toLowerCase(); });
      found = found.filter(function (f, i) { return found.indexOf(f) === i; });
      if (!found.length) return;
      if (/^100/.test(found[0]) && /\b100\s?%\s*(?:cotton|wool|linen|silk|polyester|leather|merino|cashmere|bamboo|natural|pure|recycled|organic|hemp)\b/i.test(all) && !/\b100\s?%\s*(?:effective|safe|satisf|guarantee|money)/i.test(all)) return;
      if (seen[c.why]) return; seen[c.why] = 1;
      add(c.level, 'Claims', '“' + found.slice(0, 4).join('”, “') + '” — ' + c.why, c.fix);
    });

    // keywords
    var kw = l.keywords.map(function (k) {
      var inTitle = countPhrase(t, k), inBullets = countPhrase(l.bullets.join('\n'), k), inDesc = countPhrase(l.description, k), inTags = l.tags.filter(function (x) { return countPhrase(x, k) > 0; }).length + countPhrase(l.searchTerms, k);
      var total = inTitle + inBullets + inDesc + inTags;
      return { keyword: k, title: inTitle, bullets: inBullets, description: inDesc, tags: inTags, total: total };
    });
    var bodyWords = words([t].concat(l.bullets, [l.description]).join(' ')).length;
    kw.forEach(function (k) { k.density = bodyWords ? (k.title + k.bullets + k.description) * words(k.keyword).length / bodyWords : 0; });
    if (kw.length) {
      var missing = kw.filter(function (k) { return !k.total; }), notTitle = kw.filter(function (k) { return k.total && !k.title; });
      if (missing.length) add('warn', 'Keywords', 'Not used anywhere: ' + missing.map(function (k) { return '“' + k.keyword + '”'; }).join(', ') + '.', 'Work them into a bullet or the description' + (R.tags ? ', or add as tags' : '') + '.');
      if (kw[0] && !kw[0].title) add('warn', 'Keywords', 'Your main keyword “' + kw[0].keyword + '” is not in the title.', 'The first keyword in your list is treated as the main one — put it in the title.');
      else if (notTitle.length > kw.length / 2) add('info', 'Keywords', notTitle.length + ' keywords appear only in the body, not the title.', 'Titles carry the most search weight; include the top 2–3.');
      var stuffed = kw.filter(function (k) { return k.density > 0.04 && k.title + k.bullets + k.description > 3; });
      if (stuffed.length) add('warn', 'Keywords', 'Keyword stuffing: ' + stuffed.map(function (k) { return '“' + k.keyword + '” ' + (k.density * 100).toFixed(1) + '%'; }).join(', ') + ' of the words.', 'Keep each keyword under about 3% — write for people first.');
      if (!missing.length) good.push('All ' + kw.length + ' target keywords are used.');
    }

    // bullets
    if (R.bullets) {
      if (!l.bullets.length) add('bad', 'Bullets', 'No bullet points.', 'Add ' + R.bullets + ' bullets — they are what most shoppers read.');
      else {
        if (l.bullets.length < R.bullets) add('warn', 'Bullets', 'Only ' + l.bullets.length + ' of ' + R.bullets + ' bullet points used.', 'Use all ' + R.bullets + ': main benefit, materials, size/fit, care, what’s in the box.');
        if (l.bullets.length > R.bullets) add('warn', 'Bullets', l.bullets.length + ' bullets — ' + R.name + ' shows ' + R.bullets + '.', 'Merge or cut to ' + R.bullets + '.');
        var long = l.bullets.filter(function (b) { return b.length > R.bulletMax; }), wordy = l.bullets.filter(function (b) { return b.length > R.bulletIdeal && b.length <= R.bulletMax; });
        if (long.length) add('bad', 'Bullets', long.length + ' bullet(s) over ' + R.bulletMax + ' characters.', 'Shorten them.');
        else if (wordy.length) add('info', 'Bullets', wordy.length + ' bullet(s) over ' + R.bulletIdeal + ' characters — long bullets get skimmed.', 'Aim for one idea per bullet.');
        var featOnly = l.bullets.filter(function (b) { return !BENEFIT.test(b); });
        if (featOnly.length) add('warn', 'Bullets', featOnly.length + ' bullet(s) list a feature but not why it matters: “' + featOnly[0].slice(0, 60) + (featOnly[0].length > 60 ? '…' : '') + '”.', 'Add the benefit: “… so your coffee stays hot for 6 hours”.');
        else good.push('Every bullet explains a benefit.');
        var caps = l.bullets.filter(function (b) { var x = b.replace(/[^A-Za-z]/g, ''); return x.length > 20 && x === x.toUpperCase(); });
        if (caps.length) add('warn', 'Bullets', caps.length + ' bullet(s) written entirely in capitals.', 'Only a short lead-in (“LEAK-PROOF:”) in capitals, if at all.');
      }
    }
    // description
    if (!l.description) { if (mk !== 'amazon' || !l.bullets.length) add('warn', 'Description', 'No description.', 'Add 2–4 short paragraphs: who it’s for, what it does, materials and care, what’s included.'); }
    else {
      if (R.descMax && l.description.length > R.descMax) add('bad', 'Description', 'Description is ' + l.description.length + ' characters — over ' + R.descMax + '.', 'Shorten it.');
      var rd = readability(l.description);
      if (rd.score < 50) add('info', 'Description', 'Readability ' + rd.score + '/100 (' + rd.label + '); sentences average ' + rd.avgSentence + ' words.', 'Use shorter sentences and everyday words.');
      if (words(l.description).length < 40) add('info', 'Description', 'Description is very short (' + words(l.description).length + ' words).', 'Say who it’s for, how to use it and how to care for it.');
    }
    // tags
    if (R.tags) {
      if (l.tags.length < R.tags) add('warn', 'Tags', l.tags.length + ' of ' + R.tags + ' tags used.', 'Use all ' + R.tags + ' — each one is another way to be found.');
      if (l.tags.length > R.tags) add('bad', 'Tags', l.tags.length + ' tags — the limit is ' + R.tags + '.', 'Remove the weakest.');
      var longT = l.tags.filter(function (x) { return x.length > R.tagMax; });
      if (longT.length) add('bad', 'Tags', 'Tags over ' + R.tagMax + ' characters: ' + longT.join(', ') + '.', 'Shorten or split them.');
      var lowT = l.tags.map(function (x) { return x.toLowerCase(); }), dupT = lowT.filter(function (x, i) { return lowT.indexOf(x) !== i; });
      if (dupT.length) add('warn', 'Tags', 'Duplicate tags: ' + dupT.join(', ') + '.', 'Replace with new phrases.');
      var single = l.tags.filter(function (x) { return x.indexOf(' ') < 0; });
      if (l.tags.length && single.length > l.tags.length / 2) add('info', 'Tags', single.length + ' single-word tags.', 'Multi-word phrases (“linen tea towel”) match how people search.');
    }
    if (mk === 'amazon' && l.searchTerms) {
      var b = byteLen(l.searchTerms); if (b > R.searchTermsBytes) add('bad', 'Search terms', 'Backend search terms are ' + b + ' bytes — Amazon ignores everything if it’s over ' + R.searchTermsBytes + '.', 'Remove words already in the title and any brand names.');
    }

    // missing attributes
    var need = [['size', 'Size'], ['colour', 'Colour'], ['material', 'Material'], ['dimensions', 'Dimensions'], ['care', 'Care instructions']];
    var missingAttr = need.filter(function (a) { return !l[a[0]]; }).map(function (a) { return a[1]; });
    if (missingAttr.length) add(missingAttr.length >= 3 ? 'warn' : 'info', 'Attributes', 'Missing: ' + missingAttr.join(', ') + '.', 'Fill them in (and the marketplace’s own fields) — missing attributes hide you from filtered searches and cause returns.');
    var notMentioned = need.filter(function (a) { return l[a[0]] && all.toLowerCase().indexOf(l[a[0]].toLowerCase()) < 0; }).map(function (a) { return a[1].toLowerCase(); });
    if (notMentioned.length) add('info', 'Attributes', 'You entered ' + notMentioned.join(', ') + ' but the listing text never mentions it.', 'Say it in a bullet or the description too.');

    var W = { bad: 14, warn: 6, info: 2 }, score = 100;
    issues.forEach(function (i) { score -= W[i.level]; });
    score = Math.max(0, Math.min(100, score));
    var order = { bad: 0, warn: 1, info: 2 }; issues.sort(function (a, b) { return order[a.level] - order[b.level]; });
    return { marketplace: mk, rules: R, score: score, grade: score >= 85 ? 'Strong' : score >= 65 ? 'Good, could be better' : score >= 40 ? 'Needs work' : 'Weak', issues: issues, good: good, keywords: kw,
      readability: readability([l.bullets.join('. '), l.description].join('\n')), titleLength: tl };
  }

  // ---------- safe automatic fixes for a title ----------
  function titleCase(w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }
  function fixTitle(title, mk, brand) {
    var R = RULES[mk] || RULES.amazon, t = clean(title), brandU = String(brand || '').toUpperCase();
    // promotional phrases out
    t = t.replace(/\bL@@K\b|\bWOW\b/gi, ' ');
    t = t.replace(/\b(?:free shipping|free delivery|on sale|sale|\d+\s?% off|limited time|hot deal|best seller|best price|lowest price|cheapest|clearance|bargain|top[- ]rated|number one|no\.?\s?1)\b|#\s?1\b/gi, ' ');
    if (!/\bbest\b/i.test(brand || '')) t = t.replace(/\bbest\b/gi, ' ');
    // banned characters and emoji
    t = t.replace(/[☀-➿]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/g, ' ');
    t = t.split('').map(function (c) { return R.badChars.indexOf(c) >= 0 ? ' ' : c; }).join('');
    // caps -> Title Case except acronyms/brand
    t = t.replace(/\b[A-Z]{3,}\b/g, function (w) { return ACRONYMS.indexOf(w) >= 0 || (brandU && brandU === String(brand) && brandU.indexOf(w) >= 0) ? w : titleCase(w); });
    // repeated words beyond the limit
    var counts = {};
    t = t.split(' ').filter(function (w) {
      var k = w.toLowerCase().replace(/[^a-z0-9]/g, ''); if (!k || STOP.indexOf(k) >= 0) return true;
      counts[k] = (counts[k] || 0) + 1; return counts[k] <= R.maxWordRepeat;
    }).join(' ');
    t = t.replace(/\s+([,.;:])/g, '$1').replace(/([,\-–|])\s*(?=[,\-–|])/g, '').replace(/\s+/g, ' ').replace(/^[\s,\-–|]+|[\s,\-–|]+$/g, '');
    if (t.length > R.titleMax) { t = t.slice(0, R.titleMax); t = t.slice(0, t.lastIndexOf(' ') > 0 ? t.lastIndexOf(' ') : R.titleMax).replace(/[\s,\-–|]+$/, ''); }
    return t;
  }

  // ---------- generator (templates, no AI) ----------
  // attrs: { brand, product, keyFeature, material, size, colour, quantity, audience, useCase, features:[{feature, benefit}], care, dimensions, inBox }
  function genTitle(attrs, mk) {
    var R = RULES[mk] || RULES.amazon, a = normalise(attrs);
    var parts = R.titleOrder.map(function (k) {
      var v = a[k]; if (!v) return null;
      if (k === 'audience') v = 'for ' + v.replace(/^for\s+/i, '');
      if (k === 'quantity' && /^\d+$/.test(v)) v = 'Pack of ' + v;
      return { k: k, v: v };
    }).filter(Boolean);
    function join(ps) {
      if (mk === 'etsy') return ps.map(function (p) { return p.v; }).join(', ').replace(/, for /, ' for ');
      if (mk === 'ebay') return ps.map(function (p) { return p.v; }).join(' ');
      var head = ps.filter(function (p) { return p.k === 'brand' || p.k === 'product'; }).map(function (p) { return p.v; }).join(' ');
      var rest = ps.filter(function (p) { return p.k !== 'brand' && p.k !== 'product'; }).map(function (p) { return p.v; });
      return head + (rest.length ? (head ? ' – ' : '') + rest.join(', ') : '');
    }
    // drop lowest-priority parts until it fits
    var drop = ['quantity', 'audience', 'colour', 'size', 'material', 'keyFeature', 'brand'];
    var out = join(parts), i = 0;
    while (out.length > R.titleMax && i < drop.length) { var k = drop[i++]; parts = parts.filter(function (p) { return p.k !== k; }); out = join(parts); }
    return fixTitle(out, mk, a.brand);
  }
  function sentence(s) { s = clean(s); if (!s) return ''; s = s.charAt(0).toUpperCase() + s.slice(1); return /[.!?]$/.test(s) ? s : s + '.'; }
  function genBullets(attrs, mk) {
    var a = normalise(attrs), feats = (attrs && attrs.features) || [], out = [];
    feats.forEach(function (f) {
      if (!f || !clean(f.feature)) return;
      var head = clean(f.feature).toUpperCase().length <= 28 ? clean(f.feature).toUpperCase() : clean(f.feature);
      out.push(head + (f.benefit ? ': ' + sentence(f.benefit) : ''));
    });
    if (a.material) out.push('MATERIALS: ' + sentence(a.material + ', built to last so you can use it every day') + (a.care ? ' ' + sentence('Care: ' + a.care) : ''));
    else if (a.care) out.push('EASY CARE: ' + sentence(a.care));
    if (a.size || a.dimensions) out.push('SIZE: ' + sentence([a.size, a.dimensions].filter(Boolean).join(', ') + ' — check the measurements so you know it fits'));
    if (attrs && attrs.inBox) out.push('IN THE BOX: ' + sentence(attrs.inBox));
    if (attrs && attrs.useCase) out.push('PERFECT FOR: ' + sentence(attrs.useCase));
    var max = (RULES[mk] || RULES.amazon).bullets || 5;
    return out.slice(0, max);
  }
  function genDescription(attrs) {
    var a = normalise(attrs), f = (attrs && attrs.features) || [], p = [];
    var name = [a.brand, a.product].filter(Boolean).join(' ') || 'This product';
    p.push(sentence(name + (a.keyFeature ? ' — ' + a.keyFeature.replace(/^./, function (c) { return c.toLowerCase(); }) : '') + (a.audience ? ', made for ' + a.audience.replace(/^for\s+/i, '') : '')) + (attrs && attrs.useCase ? ' ' + sentence('Use it for ' + attrs.useCase.replace(/^./, function (c) { return c.toLowerCase(); })) : ''));
    var fb = f.filter(function (x) { return x && x.feature; }).map(function (x) { return sentence(x.benefit ? x.feature + ' — ' + x.benefit.replace(/^./, function (c) { return c.toLowerCase(); }) : x.feature); });
    if (fb.length) p.push(fb.join(' '));
    var spec = [a.material && 'Material: ' + a.material, a.colour && 'Colour: ' + a.colour, a.size && 'Size: ' + a.size, a.dimensions && 'Dimensions: ' + a.dimensions, a.quantity && 'Quantity: ' + a.quantity].filter(Boolean);
    if (spec.length) p.push(spec.join('\n'));
    if (a.care) p.push('Care: ' + sentence(a.care));
    if (attrs && attrs.inBox) p.push('In the box: ' + sentence(attrs.inBox));
    return p.join('\n\n');
  }
  function genTags(attrs) {
    var a = normalise(attrs), base = a.product.toLowerCase(), t = [];
    function push(s) { s = clean(s).toLowerCase(); if (s && s.length <= 20 && t.indexOf(s) < 0) t.push(s); }
    var last = base.split(' ').pop(), mat = a.material.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
    push(base); list(a.keywords).forEach(push);
    if (mat) { push(mat + ' ' + last); push(mat + ' ' + base); push(mat); }
    if (a.colour) { push(a.colour + ' ' + last); push(a.colour.split(' ').pop() + ' ' + last); }
    if (attrs && attrs.useCase) String(attrs.useCase).split(/,|\band\b|\bor\b/).map(function (u) { return clean(u).replace(/^(?:the|a|an|your)\s+/i, ''); }).filter(Boolean).forEach(function (u) { push(u + ' ' + last); });
    if (a.audience) a.audience.replace(/^for\s+/i, '').split(/,|\band\b/).map(clean).filter(Boolean).forEach(function (u) { push('gift for ' + u); push(last + ' for ' + u); });
    if (a.size) push(a.size + ' ' + last);
    return t.slice(0, 13);
  }

  // ---------- bulk CSV ----------
  // Map a CSV row (any capitalisation; bullet1..bullet5 or a single "bullets" column split by | or new lines) to a listing.
  function fromRow(row) {
    var g = {}; Object.keys(row || {}).forEach(function (k) { g[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = row[k]; });
    var bullets = [];
    for (var i = 1; i <= 10; i++) { var v = g['bullet' + i] || g['bulletpoint' + i] || g['feature' + i]; if (v) bullets.push(v); }
    if (!bullets.length && g.bullets) bullets = lines(g.bullets);
    return { sku: g.sku || g.id || '', title: g.title || g.name || g.productname || '', bullets: bullets, description: g.description || g.body || g.bodyhtml || '', tags: g.tags || g.keywordtags || '',
      keywords: g.keywords || g.targetkeywords || '', brand: g.brand || g.vendor || '', product: g.product || g.producttype || g.type || '', size: g.size || '', colour: g.colour || g.color || '',
      material: g.material || g.materials || '', dimensions: g.dimensions || '', care: g.care || g.careinstructions || '', quantity: g.quantity || g.packsize || '', searchTerms: g.searchterms || '', marketplace: (g.marketplace || '').toLowerCase() };
  }
  function mkKey(v, fallback) { v = String(v || '').toLowerCase(); if (RULES[v]) return v; if (/shopify|google/.test(v)) return 'google'; if (/ebay/.test(v)) return 'ebay'; if (/etsy/.test(v)) return 'etsy'; if (/amazon/.test(v)) return 'amazon'; return fallback || 'amazon'; }
  function bulk(rows, defaultMk) {
    return (rows || []).map(function (row, i) {
      var l = fromRow(row), mk = mkKey(l.marketplace, defaultMk), r = check(l, mk);
      return { row: i + 1, sku: l.sku, title: l.title, marketplace: RULES[mk].name, mk: mk, score: r.score, grade: r.grade, problems: r.issues.filter(function (x) { return x.level !== 'info'; }).length,
        top: r.issues.slice(0, 3).map(function (x) { return x.msg; }).join(' | '), fixedTitle: fixTitle(l.title, mk, l.brand), listing: l, result: r };
    });
  }
  function bulkCsvRows(results) {
    return results.map(function (r) { return { row: r.row, sku: r.sku, marketplace: r.marketplace, score: r.score, grade: r.grade, problems: r.problems, title: r.title, suggested_title: r.fixedTitle, title_length: r.title.length, top_issues: r.top }; });
  }

  function sample() {
    return {
      marketplace: 'amazon',
      listing: {
        title: 'BEST Insulated Water Bottle Stainless Steel Water Bottle - Keeps Drinks Cold 24 Hours!! FREE SHIPPING water bottle',
        bullets: ['Double-wall vacuum insulation', '18/8 food-grade stainless steel, BPA free lid', 'LEAK PROOF LID WITH CARRY LOOP', 'Cures dehydration headaches and helps you drink more water every day'],
        description: 'Our bottle is the best bottle. It is made from stainless steel and it has a lid and it can be used at the gym and the office and the beach and in the car and it is guaranteed to never leak no matter what happens to it in your bag.',
        brand: 'Coastline', product: 'Water Bottle', size: '750 ml', colour: 'Sage Green', material: 'Stainless steel', dimensions: '', care: '', quantity: '',
        keywords: 'insulated water bottle, stainless steel water bottle, leak proof bottle, gym bottle, kids water bottle', tags: ''
      },
      attrs: {
        brand: 'Coastline', product: 'Insulated Water Bottle', keyFeature: 'Keeps Drinks Cold 24 Hours', material: '18/8 Stainless Steel', size: '750 ml', colour: 'Sage Green', quantity: '',
        audience: 'adults and teens', useCase: 'the gym, school, hiking and the office', dimensions: '7.5 × 27 cm, 380 g', care: 'Hand wash; the lid is top-rack dishwasher safe', inBox: 'Bottle, leak-proof lid and a spare seal',
        keywords: 'insulated water bottle, stainless steel water bottle, leak proof bottle',
        features: [{ feature: 'Double-wall vacuum insulation', benefit: 'keeps water icy for 24 hours and coffee hot for 12, so you are never stuck with a lukewarm drink' },
          { feature: 'Leak-proof screw lid', benefit: 'toss it in your bag without worrying about spills' }, { feature: 'Wide mouth', benefit: 'fits ice cubes and is easy to clean' }]
      },
      csv: 'sku,marketplace,title,brand,product,colour,size,material,bullet1,bullet2,bullet3,description,tags,keywords\n' +
        'WB-750-SG,amazon,"Coastline Insulated Water Bottle – 750 ml Stainless Steel, Sage Green",Coastline,Water Bottle,Sage Green,750 ml,Stainless steel,"Keeps drinks cold for 24 hours so you can enjoy ice water all day","Leak-proof lid lets you carry it in any bag","Wide mouth fits ice cubes and is easy to clean","Double-wall insulated bottle for gym, school and work.",,insulated water bottle\n' +
        'TT-LIN-3,etsy,Linen Tea Towel Set of 3 - Natural Stonewashed Kitchen Towels,,Tea Towel,Natural,50 x 70 cm,Linen,,,,"Soft stonewashed linen tea towels, set of 3. Machine wash warm.","linen tea towel,kitchen towel,housewarming gift,linen,natural linen,stonewashed linen,tea towels",linen tea towel\n' +
        'CAN-SOY-LAV,google,LAVENDER SOY CANDLE - BEST RELAXING CANDLE CURES ANXIETY - SALE,Bloom & Wick,Candle,Purple,300 g,Soy wax,,,,"Hand-poured lavender soy candle.",,soy candle\n' +
        'EB-HP-01,ebay,Wireless Headphones Bluetooth Headphones Over Ear Headphones Noise Cancelling L@@K,Generic,Headphones,Black,,,,,,"Bluetooth 5.3 headphones",,bluetooth headphones'
    };
  }

  var L = { RULES: RULES, CLAIMS: CLAIMS, ACRONYMS: ACRONYMS, words: words, countPhrase: countPhrase, syllables: syllables, readability: readability, byteLen: byteLen, normalise: normalise, check: check,
    fixTitle: fixTitle, genTitle: genTitle, genBullets: genBullets, genDescription: genDescription, genTags: genTags, fromRow: fromRow, mkKey: mkKey, bulk: bulk, bulkCsvRows: bulkCsvRows, sample: sample };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.ListingLib = L;
})(this);
