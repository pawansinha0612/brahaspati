/* Regex Builder — pure logic: plain-English composer, regex explainer, tester, language literals. No DOM. */
(function (root) {
  'use strict';

  // ---------- catalogue of common patterns ----------
  // keys: words/phrases that pick the pattern (longest phrase wins). src has no anchors.
  var CATALOGUE = [
    { id: 'email', name: 'Email address', keys: ['email address', 'email', 'e-mail'], src: "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}", example: 'jane.doe@example.com.au' },
    { id: 'au-mobile', name: 'Australian mobile number', keys: ['australian mobile', 'au mobile', 'mobile number', 'mobile phone', 'mobile'], src: "(?:\\+?61\\s?|0)4\\d{2}\\s?\\d{3}\\s?\\d{3}", example: '0412 345 678 or +61 412 345 678' },
    { id: 'au-phone', name: 'Australian phone number (landline or mobile)', keys: ['australian phone', 'au phone', 'phone number', 'telephone', 'phone', 'landline'], src: "(?:\\+?61\\s?|0)[2-478](?:[ -]?\\d){8}", example: '(02) 9876 5432 is written 02 9876 5432' },
    { id: 'au-postcode', name: 'Australian postcode', keys: ['australian postcode', 'au postcode', 'postcode', 'post code'], src: "\\b(?:0[289]\\d{2}|[1-9]\\d{3})\\b", example: '2000, 0800, 3141' },
    { id: 'abn', name: 'ABN (11 digits, spaces allowed)', keys: ['australian business number', 'abn'], src: "\\b\\d{2}\\s?\\d{3}\\s?\\d{3}\\s?\\d{3}\\b", example: '51 824 753 556', note: 'Shape only — a real ABN also needs the checksum test.' },
    { id: 'acn', name: 'ACN (9 digits)', keys: ['australian company number', 'acn'], src: "\\b\\d{3}\\s?\\d{3}\\s?\\d{3}\\b", example: '004 085 616' },
    { id: 'tfn', name: 'Tax file number (shape only)', keys: ['tax file number', 'tfn'], src: "\\b\\d{3}\\s?\\d{3}\\s?\\d{2,3}\\b", example: '123 456 782' },
    { id: 'bsb', name: 'BSB number', keys: ['bsb'], src: "\\b\\d{3}-?\\d{3}\\b", example: '062-000' },
    { id: 'au-state', name: 'Australian state or territory', keys: ['australian state', 'state abbreviation', 'state code'], src: "\\b(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\\b", example: 'NSW, VIC, ACT' },
    { id: 'url', name: 'Web address (URL)', keys: ['web address', 'website', 'url', 'link', 'web link'], src: "https?:\\/\\/[^\\s/$.?#][^\\s]*", example: 'https://example.com/path?q=1' },
    { id: 'domain', name: 'Domain name', keys: ['domain name', 'domain', 'hostname'], src: "\\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+[A-Za-z]{2,}\\b", example: 'shop.example.com.au' },
    { id: 'ipv4', name: 'IPv4 address', keys: ['ipv4 address', 'ipv4', 'ip address', 'ip'], src: "\\b(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\b", example: '192.168.0.1' },
    { id: 'ipv6', name: 'IPv6 address (full or shortened)', keys: ['ipv6 address', 'ipv6'], src: "(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,7}:|(?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|::(?:[0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4}|::", example: '2001:db8::1' },
    { id: 'mac', name: 'MAC address', keys: ['mac address', 'mac'], src: "\\b[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}\\b", example: '00:1A:2B:3C:4D:5E' },
    { id: 'date-dmy', name: 'Date dd/mm/yyyy', keys: ['dd/mm/yyyy', 'australian date', 'au date', 'date dd/mm', 'day month year', 'date'], src: "\\b(?:0?[1-9]|[12]\\d|3[01])\\/(?:0?[1-9]|1[0-2])\\/\\d{4}\\b", example: '08/11/2026' },
    { id: 'date-mdy', name: 'US date mm/dd/yyyy', keys: ['mm/dd/yyyy', 'us date', 'american date'], src: "\\b(?:0?[1-9]|1[0-2])\\/(?:0?[1-9]|[12]\\d|3[01])\\/\\d{4}\\b", example: '11/08/2026' },
    { id: 'date-iso', name: 'ISO date yyyy-mm-dd', keys: ['yyyy-mm-dd', 'iso date', 'iso 8601 date'], src: "\\b\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])\\b", example: '2026-11-08' },
    { id: 'datetime-iso', name: 'ISO timestamp', keys: ['iso timestamp', 'iso datetime', 'timestamp', 'datetime', 'date time'], src: "\\b\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:?\\d{2})?", example: '2026-11-08T09:30:00+11:00' },
    { id: 'time24', name: 'Time 24-hour hh:mm(:ss)', keys: ['24 hour time', '24-hour time', 'hh:mm', 'time'], src: "\\b(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?\\b", example: '09:30, 23:59:59' },
    { id: 'time12', name: 'Time 12-hour with am/pm', keys: ['12 hour time', '12-hour time', 'am/pm', 'am pm time'], src: "\\b(?:0?[1-9]|1[0-2]):[0-5]\\d\\s?[AaPp][Mm]\\b", example: '9:30 am' },
    { id: 'money', name: 'Money amount ($1,234.56)', keys: ['dollar amount', 'money', 'price', 'currency', 'dollars', 'amount', 'cost'], src: "-?\\$\\s?\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?", example: '$1,234.56' },
    { id: 'percent', name: 'Percentage', keys: ['percentage', 'percent'], src: "-?\\d+(?:\\.\\d+)?\\s?%", example: '12.5%' },
    { id: 'decimal', name: 'Decimal number', keys: ['decimal number', 'decimal', 'float', 'floating point'], src: "-?\\d+\\.\\d+", example: '3.14' },
    { id: 'integer', name: 'Whole number', keys: ['whole number', 'integer'], src: "-?\\d+", example: '42' },
    { id: 'uuid', name: 'UUID / GUID', keys: ['uuid', 'guid'], src: "[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}", example: '7f3a9c21-55e0-4b7d-9a0c-2d1e6f8b4c10' },
    { id: 'hex-colour', name: 'Hex colour', keys: ['hex colour', 'hex color', 'colour code', 'color code', 'hex code'], src: "#(?:[0-9A-Fa-f]{3}){1,2}\\b", example: '#b4531b, #fff' },
    { id: 'card', name: 'Credit-card-shaped number (for masking)', keys: ['credit card', 'card number', 'pan'], src: "\\b(?:\\d[ -]?){12,15}\\d\\b", example: '4111 1111 1111 1111', note: 'Shape only, for finding and masking. It does not check the Luhn checksum.' },
    { id: 'log-level', name: 'Log level', keys: ['log level', 'log levels', 'severity'], src: "\\b(?:TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|CRITICAL)\\b", example: 'ERROR, WARN' },
    { id: 'http-status', name: 'HTTP status code', keys: ['http status', 'status code'], src: "\\b[1-5]\\d{2}\\b", example: '404' },
    { id: 'semver', name: 'Version number (semver)', keys: ['semantic version', 'semver', 'version number', 'version'], src: "\\bv?\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?\\b", example: '1.4.2, v2.0.0-beta.1' },
    { id: 'username', name: 'Username (3–16 letters, digits, _ or -)', keys: ['username', 'user name', 'handle'], src: "[A-Za-z0-9_-]{3,16}", example: 'jane_doe' },
    { id: 'strong-password', name: 'Strong password (8+ with upper, lower, digit, symbol)', keys: ['strong password', 'password'], src: "(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}", anchor: true, example: 'Tr1cky!pass' },
    { id: 'hashtag', name: 'Hashtag', keys: ['hashtag', 'hash tag'], src: "#[A-Za-z0-9_]+", example: '#brisbane' },
    { id: 'mention', name: '@mention', keys: ['@mention', 'mention', 'twitter handle'], src: "@[A-Za-z0-9_]{1,30}", example: '@pawan' },
    { id: 'filename', name: 'File name with extension', keys: ['file name', 'filename', 'file extension'], src: "[\\w,\\s-]+\\.[A-Za-z0-9]{1,5}", example: 'report-2026.pdf' },
    { id: 'slug', name: 'URL slug', keys: ['slug', 'url slug'], src: "[a-z0-9]+(?:-[a-z0-9]+)*", example: 'my-blog-post' },
    { id: 'jwt', name: 'JSON Web Token (JWT)', keys: ['json web token', 'jwt'], src: "eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+", example: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123' },
    { id: 'html-tag', name: 'HTML tag', keys: ['html tag', 'html element', 'xml tag'], src: "<\\/?[A-Za-z][A-Za-z0-9-]*(?:\\s[^<>]*)?\\/?>", example: '<div class="x">' },
    { id: 'trailing-space', name: 'Trailing whitespace', keys: ['trailing whitespace', 'trailing spaces', 'trailing space'], src: "[ \\t]+$", flags: 'm', example: 'text   ' },
    { id: 'repeated-word', name: 'Repeated word (the the)', keys: ['repeated word', 'duplicate word', 'doubled word', 'repeated words'], src: "\\b(\\w+)\\s+\\1\\b", flags: 'i', example: 'the the' },
    { id: 'blank-line', name: 'Blank line', keys: ['blank line', 'empty line', 'blank lines', 'empty lines'], src: "^\\s*$", flags: 'm', example: '' },
    { id: 'uk-postcode', name: 'UK postcode', keys: ['uk postcode', 'british postcode'], src: "\\b[A-Z]{1,2}\\d[A-Z\\d]?\\s?\\d[A-Z]{2}\\b", flags: 'i', example: 'SW1A 1AA' },
    { id: 'us-zip', name: 'US ZIP code', keys: ['zip code', 'zipcode', 'zip'], src: "\\b\\d{5}(?:-\\d{4})?\\b", example: '90210' },
    { id: 'number-plate', name: 'Australian number plate (common NSW/VIC shapes)', keys: ['number plate', 'licence plate', 'license plate', 'rego'], src: "\\b(?:[A-Z]{3}\\s?\\d{2}[A-Z]|[A-Z]{3}\\s?\\d{3}|\\d[A-Z]{2}\\s?\\d[A-Z]{2})\\b", example: 'ABC12D' }
  ];

  // ---------- helpers ----------
  // true when the pattern has a | outside any group or class (so it needs wrapping before joining)
  function hasTopAlt(src) {
    var d = 0, inCls = false;
    for (var i = 0; i < src.length; i++) {
      var c = src.charAt(i);
      if (c === '\\') { i++; continue; }
      if (inCls) { if (c === ']') inCls = false; continue; }
      if (c === '[') inCls = true; else if (c === '(') d++; else if (c === ')') d--; else if (c === '|' && d === 0) return true;
    }
    return false;
  }
  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); }
  var NUMWORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, sixteen: 16, twenty: 20 };
  function num(s) { s = String(s).toLowerCase(); return /^\d+$/.test(s) ? +s : NUMWORDS[s]; }
  var NUM = '(\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|sixteen|twenty)';

  // character-class units
  var UNITS = [
    { re: 'upper(?:case|-case)? letters?|capital letters?|capitals?', src: '[A-Z]', label: 'uppercase letter' },
    { re: 'lower(?:case|-case)? letters?|small letters?', src: '[a-z]', label: 'lowercase letter' },
    { re: 'hex(?:adecimal)? (?:digits?|characters?|chars?)', src: '[0-9A-Fa-f]', label: 'hex digit' },
    { re: 'alphanumeric(?: characters?| chars?)?|letters? (?:or|and) (?:digits?|numbers?)', src: '[A-Za-z0-9]', label: 'letter or digit' },
    { re: 'word characters?', src: '\\w', label: 'word character' },
    { re: 'digits?|numbers?|numerals?|numeric(?: characters?)?', src: '\\d', label: 'digit' },
    { re: 'letters?|alphabetic(?: characters?)?|alpha characters?', src: '[A-Za-z]', label: 'letter' },
    { re: 'whitespace(?: characters?)?|spaces?|blanks?', src: '\\s', label: 'whitespace' },
    { re: 'tabs?', src: '\\t', label: 'tab' },
    { re: '(?:special characters?|symbols?|punctuation(?: marks?)?)', src: '[^A-Za-z0-9\\s]', label: 'symbol' },
    { re: 'vowels?', src: '[AEIOUaeiou]', label: 'vowel' },
    { re: 'characters?|chars?|anything|any character', src: '.', label: 'character' },
    { re: 'words?', src: 'WORD', label: 'word' },
    { re: 'dots?|full stops?|periods?', src: '\\.', label: 'dot' },
    { re: 'hyphens?|dashes?|minus signs?', src: '-', label: 'hyphen' },
    { re: 'underscores?', src: '_', label: 'underscore' },
    { re: 'commas?', src: ',', label: 'comma' },
    { re: 'colons?', src: ':', label: 'colon' },
    { re: '(?:forward )?slash(?:es)?', src: '\\/', label: 'slash' },
    { re: 'at signs?', src: '@', label: '@' }
  ];
  var UNIT_RE = '(' + UNITS.map(function (u) { return u.re; }).join('|') + ')';
  function unitOf(word) {
    for (var i = 0; i < UNITS.length; i++) if (new RegExp('^(?:' + UNITS[i].re + ')$', 'i').test(word)) return UNITS[i];
    return null;
  }
  function quant(src, min, max) {
    var q = max === Infinity ? (min === 0 ? '*' : min === 1 ? '+' : '{' + min + ',}') : min === max ? (min === 1 ? '' : '{' + min + '}') : (min === 0 && max === 1 ? '?' : '{' + min + ',' + max + '}');
    if (src === 'WORD') {
      if (min === max) return min === 1 ? '\\w+' : '\\w+(?:\\s+\\w+){' + (min - 1) + '}';
      return '\\w+(?:\\s+\\w+){' + Math.max(0, min - 1) + ',' + (max === Infinity ? '' : max - 1) + '}';
    }
    return src + q;
  }
  function single(src) { return src === 'WORD' ? '\\w+' : src; }

  var FILLER = /^(?:a|an|the|and|with|that|which|is|are|be|it|of|to|i|want|need|match|matches|matching|find|finds|text|string|strings|value|values|line|lines|input|regex|pattern|for|some|please|has|have|should|must|only|then|in|any|valid)$/i;

  // Lists like: one of red, green or blue | one of "a", "b"
  function parseList(s) {
    return s.split(/\s*,\s*(?:or\s+)?|\s+or\s+/).map(function (x) { return x.trim().replace(/^["'“‘]|["'”’]$/g, ''); }).filter(Boolean);
  }

  // Find the catalogue entry named at the start of str (longest key wins)
  function catalogueAt(str) {
    var best = null, bestLen = 0, low = str.toLowerCase();
    CATALOGUE.forEach(function (c) {
      c.keys.forEach(function (k) {
        if (k.length > bestLen && low.indexOf(k) === 0 && !/[a-z0-9]/.test(low.charAt(k.length))) { best = c; bestLen = k.length; }
      });
    });
    return best ? { item: best, len: bestLen } : null;
  }

  // ---------- plain English -> regex ----------
  // Returns { pattern, flags, steps:[...], used:[catalogue ids], ignored:[words], ok }
  function build(desc) {
    var s = String(desc || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();
    var flags = { i: false, m: false, g: true, s: false }, steps = [], used = [], ignored = [];
    var pieces = [], looks = [], wholeWord = false, wholeLine = false;
    var mode = null; // 'start' | 'end' | 'contains' | 'optional'
    var pos = 0;

    function addPiece(src, label, opts) {
      opts = opts || {};
      var p = { src: src, label: label, start: mode === 'start', end: mode === 'end', optional: mode === 'optional' || opts.optional };
      if (mode === 'contains' || mode === 'notcontains') {
        var body = src.length === 1 || /^\\.$|^\[[^\]]*\]$/.test(src) ? src : '(?:' + src + ')';
        looks.push({ src: mode === 'notcontains' ? '(?!.*' + body + ')' : '(?=.*' + body + ')', label: (mode === 'notcontains' ? 'must not contain ' : 'must contain ') + label, raw: src, neg: mode === 'notcontains' });
      } else pieces.push(p);
      if (p.optional) p.src = (/^(?:\\.|\[[^\]]*\]|.)$/.test(src) ? src : '(?:' + src + ')') + '?';
      steps.push((mode === 'start' ? 'starts with ' : mode === 'end' ? 'ends with ' : mode === 'optional' ? 'optional ' : mode === 'contains' || mode === 'notcontains' ? '' : '') + (mode === 'contains' || mode === 'notcontains' ? looks[looks.length - 1].label : label));
      mode = null;
    }

    var rules = [
      // global switches
      { re: /^(?:case[- ]?insensitive|ignor(?:e|ing) case|any case|upper or lower ?case)\b/i, fn: function () { flags.i = true; steps.push('ignore upper/lower case (i flag)'); } },
      { re: /^(?:as a )?whole words?\b|^(?:as a )?separate words?\b|^on its own\b/i, fn: function () { wholeWord = true; steps.push('whole word only (\\b on both sides)'); } },
      { re: /^(?:the )?(?:whole|entire|full) (?:line|string|input|text|value)\b|^nothing else\b|^exact(?:ly)? match\b/i, fn: function () { wholeLine = true; steps.push('must match the whole text (^ … $)'); } },
      { re: /^(?:each|every|per) line\b|^multi-?line\b/i, fn: function () { flags.m = true; steps.push('^ and $ work per line (m flag)'); } },
      { re: /^dot ?all\b|^across lines\b/i, fn: function () { flags.s = true; steps.push('dot also matches new lines (s flag)'); } },
      { re: /^(?:first match only|only the first)\b/i, fn: function () { flags.g = false; steps.push('first match only (no g flag)'); } },
      // modes
      { re: /^(?:that |which |and )?(?:starts?|begins?|starting|beginning)(?: with)?\b/i, fn: function () { mode = 'start'; } },
      { re: /^(?:that |which |and )?(?:ends?|ending|finishes|finishing)(?: with)?\b/i, fn: function () { mode = 'end'; } },
      { re: /^(?:that |which |and )?(?:does not|doesn't|must not|mustn't|should not|shouldn't|cannot|can't) (?:contain|include|have)\b|^without (?:any )?\b|^no\s+(?=(?:digits?|numbers?|spaces?|letters?|symbols?|special|whitespace|upper|lower))/i, fn: function () { mode = 'notcontains'; } },
      { re: /^(?:that |which |and )?(?:contains?|containing|includes?|including|must (?:contain|include|have)|has at least one|with at least one|at least one)\b/i, fn: function () { mode = 'contains'; } },
      { re: /^(?:optional(?:ly)?|maybe|possibly)\b/i, fn: function () { mode = 'optional'; } },
      { re: /^(?:followed by|then|and then|after that|next)\b/i, fn: function () {} },
      // one of a, b or c
      { re: /^(?:one of|either|any of)\s+((?:"[^"]*"|'[^']*'|[^\s,]+)(?:\s*(?:,\s*(?:or\s+)?|\s+or\s+)(?:"[^"]*"|'[^']*'|[^\s,]+))+)/i, fn: function (m) {
        var items = parseList(m[1]); addPiece('(?:' + items.map(escapeRe).join('|') + ')', 'one of ' + items.join(', '));
      } },
      // quantities with units
      { re: new RegExp('^between\\s+' + NUM + '\\s+and\\s+' + NUM + '\\s+' + UNIT_RE + '\\b', 'i'), fn: function (m) { var u = unitOf(m[3]); addPiece(quant(u.src, num(m[1]), num(m[2])), num(m[1]) + '–' + num(m[2]) + ' ' + u.label + 's'); } },
      { re: new RegExp('^' + NUM + '\\s*(?:to|-|–)\\s*' + NUM + '\\s+' + UNIT_RE + '\\b', 'i'), fn: function (m) { var u = unitOf(m[3]); addPiece(quant(u.src, num(m[1]), num(m[2])), num(m[1]) + '–' + num(m[2]) + ' ' + u.label + 's'); } },
      { re: new RegExp('^(?:at least|minimum(?: of)?|min)\\s+' + NUM + '\\s+' + UNIT_RE + '\\b', 'i'), fn: function (m) { var u = unitOf(m[2]); addPiece(quant(u.src, num(m[1]), Infinity), 'at least ' + num(m[1]) + ' ' + u.label + 's'); } },
      { re: new RegExp('^(?:up to|at most|no more than|maximum(?: of)?|max)\\s+' + NUM + '\\s+' + UNIT_RE + '\\b', 'i'), fn: function (m) { var u = unitOf(m[2]); addPiece(quant(u.src, mode === 'contains' ? 1 : 0, num(m[1])), 'up to ' + num(m[1]) + ' ' + u.label + 's'); } },
      { re: new RegExp('^(?:exactly\\s+)?' + NUM + '\\s+' + UNIT_RE + '\\b', 'i'), fn: function (m) { var u = unitOf(m[2]), n = num(m[1]); addPiece(quant(u.src, n, n), n + ' ' + u.label + (n === 1 ? '' : 's')); } },
      { re: new RegExp('^(?:one or more|some|several|a run of|many)\\s+' + UNIT_RE + '\\b', 'i'), fn: function (m) { var u = unitOf(m[1]); addPiece(quant(u.src, 1, Infinity), 'one or more ' + u.label + 's'); } },
      { re: new RegExp('^(?:zero or more|any number of|optional)\\s+' + UNIT_RE + '\\b', 'i'), fn: function (m) { var u = unitOf(m[1]); addPiece(quant(u.src, 0, Infinity), 'any number of ' + u.label + 's'); } },
      // literal text: quoted, or "the word X", "the text X"
      { re: /^(?:the (?:word|text|letters?|characters?|symbol|prefix|suffix|string)\s+)?("([^"]+)"|'([^']+)')/i, fn: function (m) { var t = m[2] || m[3]; addPiece(escapeRe(t), '“' + t + '”'); } },
      { re: /^the word\s+(\S+)/i, fn: function (m) { var t = m[1].replace(/[,;]$/, ''); addPiece('\\b' + escapeRe(t) + '\\b', 'the word “' + t + '”'); } },
      { re: /^the (?:text|prefix|suffix)\s+(\S+)/i, fn: function (m) { var t = m[1].replace(/[,;]$/, ''); addPiece(escapeRe(t), '“' + t + '”'); } },
      // plain unit words: "digits", "a letter", "letters"
      { re: new RegExp('^(?:an?\\s+)?' + UNIT_RE + '\\b', 'i'), fn: function (m) {
        var u = unitOf(m[1]), plural = /s$/i.test(m[1]) && !/^(?:alphanumeric|whitespace|anything)$/i.test(m[1]) && !/ss$/i.test(m[1]);
        if (mode === 'contains' || mode === 'notcontains') addPiece(single(u.src), (plural ? u.label + 's' : 'a ' + u.label));
        else addPiece(plural ? quant(u.src, 1, Infinity) : single(u.src), plural ? 'one or more ' + u.label + 's' : 'one ' + u.label);
      } }
    ];

    while (pos < s.length) {
      var rest = s.slice(pos), m;
      var ws = rest.match(/^(?:[\s,;]|\.(?=\s|$))+/);
      if (ws) { pos += ws[0].length; continue; }
      // catalogue names
      var cat = catalogueAt(rest);
      if (cat) {
        used.push(cat.item.id); var src = cat.item.src;
        if (cat.item.flags) cat.item.flags.split('').forEach(function (f) { flags[f] = true; });
        if (cat.item.anchor) wholeLine = true;
        addPiece(hasTopAlt(src) ? '(?:' + src + ')' : src, cat.item.name);
        pos += cat.len; continue;
      }
      var hit = false;
      for (var i = 0; i < rules.length; i++) {
        m = rest.match(rules[i].re);
        if (m && m[0]) { rules[i].fn(m); pos += m[0].length; hit = true; break; }
      }
      if (hit) continue;
      var word = rest.match(/^\S+/)[0];
      // after starts/ends/contains, an unknown word is literal text
      if (mode) {
        var lit = word.replace(/[,;]$/, '');
        // keep "starts with INV-" style literal plus any glued punctuation
        addPiece(escapeRe(lit), '“' + lit + '”'); pos += word.length; continue;
      }
      if (!FILLER.test(word.replace(/[,;.]$/, ''))) ignored.push(word.replace(/[,;.]$/, ''));
      pos += word.length;
    }

    // ---------- compose ----------
    var startP = pieces.filter(function (p) { return p.start; }), endP = pieces.filter(function (p) { return p.end && !p.start; });
    var mid = pieces.filter(function (p) { return !p.start && !p.end; });
    var body = startP.concat(mid).map(function (p) { return p.src; }).join('');
    if (startP.length && endP.length && !mid.length) body += '.*';
    body += endP.map(function (p) { return p.src; }).join('');
    var pat = body, lookSrc = looks.map(function (l) { return l.src; }).join('');
    if (!body && looks.length === 1 && !looks[0].neg) { pat = looks[0].raw; lookSrc = ''; }
    else if (!body && looks.length) { pat = '^' + lookSrc + '.*$'; lookSrc = ''; wholeLine = false; }
    if (pat && wholeWord) pat = '\\b' + (hasTopAlt(pat) ? '(?:' + pat + ')' : pat) + '\\b';
    var anchorAll = wholeLine || lookSrc;
    if (pat && anchorAll) {
      var inner = pat.replace(/^\^/, '').replace(/\$$/, '');
      if (hasTopAlt(inner)) inner = '(?:' + inner + ')';
      pat = '^' + lookSrc + inner + '$';
    } else if (pat) {
      if (startP.length && pat.charAt(0) !== '^') pat = '^' + pat;
      if (endP.length && pat.slice(-1) !== '$') pat = pat + '$';
    }
    if (flags.m === false && anchorAll && /\n/.test(desc || '')) flags.m = true;
    var f = (flags.g ? 'g' : '') + (flags.i ? 'i' : '') + (flags.m ? 'm' : '') + (flags.s ? 's' : '');
    return { pattern: pat, flags: f, steps: steps, used: used, ignored: ignored, ok: !!pat };
  }

  // ---------- explainer ----------
  var ESC = {
    d: 'a digit (0–9)', D: 'any character that is not a digit', w: 'a word character (letter, digit or _)', W: 'any character that is not a word character',
    s: 'a whitespace character (space, tab, new line)', S: 'any character that is not whitespace', b: 'a word boundary', B: 'not a word boundary',
    n: 'a new line', r: 'a carriage return', t: 'a tab', f: 'a form feed', v: 'a vertical tab', 0: 'a NUL character',
    A: 'the very start of the text (not in JavaScript)', Z: 'the very end of the text (not in JavaScript)', z: 'the very end of the text (not in JavaScript)', G: 'where the last match ended (not in JavaScript)'
  };

  function describeClass(body) {
    var neg = body.charAt(0) === '^'; if (neg) body = body.slice(1);
    var parts = [], i = 0;
    while (i < body.length) {
      var c = body.charAt(i), item;
      if (c === '\\') { var e = body.charAt(i + 1); item = ESC[e] ? ESC[e].replace(/^an? /, '') : 'a literal “' + e + '”'; if (e === 'b') item = 'backspace'; i += 2; }
      else { item = c; i++; }
      if (body.charAt(i) === '-' && i + 1 < body.length) {
        var to = body.charAt(i + 1); if (to === '\\') { to = body.charAt(i + 2); i++; }
        item = c + ' to ' + to; i += 2;
      } else if (item.length === 1) item = item === ' ' ? 'a space' : '“' + item + '”';
      parts.push(item);
    }
    return (neg ? 'any character except ' : 'one of: ') + parts.join(', ');
  }

  function describeQuant(q) {
    var lazy = /[^?]\?$|^[*+?]\?$|\}\?$/.test(q) && q.length > 1, poss = /[*+}]\+$/.test(q) && q.length > 1;
    var base = q.replace(/[?+]$/, function (x) { return (lazy || poss) ? '' : x; });
    var m, d;
    if (base === '*') d = 'zero or more times'; else if (base === '+') d = 'one or more times'; else if (base === '?') d = 'optional (zero or one time)';
    else if ((m = base.match(/^\{(\d+)\}$/))) d = 'exactly ' + m[1] + ' time' + (m[1] === '1' ? '' : 's');
    else if ((m = base.match(/^\{(\d+),\}$/))) d = m[1] + ' or more times';
    else if ((m = base.match(/^\{(\d*),(\d+)\}$/))) d = 'between ' + (m[1] || '0') + ' and ' + m[2] + ' times';
    else d = 'repeat ' + base;
    if (lazy) d += ', as few as possible (lazy)';
    if (poss) d += ', without backtracking (possessive — not in JavaScript)';
    return d;
  }

  // Tokenise a regex source into [{text, kind, desc, depth}]
  function explain(src) {
    var out = [], i = 0, depth = 0, groupNo = 0, stack = [];
    function push(text, kind, desc) { out.push({ text: text, kind: kind, desc: desc, depth: depth }); }
    while (i < src.length) {
      var c = src.charAt(i), m, rest = src.slice(i);
      if (c === '\\') {
        var e = src.charAt(i + 1);
        if ((m = rest.match(/^\\k<([A-Za-z_]\w*)>/))) { push(m[0], 'backref', 'the same text the group “' + m[1] + '” matched'); i += m[0].length; }
        else if ((m = rest.match(/^\\([1-9]\d?)/))) { push(m[0], 'backref', 'the same text group ' + m[1] + ' matched'); i += m[0].length; }
        else if ((m = rest.match(/^\\x[0-9A-Fa-f]{2}|^\\u[0-9A-Fa-f]{4}|^\\u\{[0-9A-Fa-f]+\}/))) { push(m[0], 'escape', 'the character with code ' + m[0].slice(2).replace(/[{}]/g, '')); i += m[0].length; }
        else if ((m = rest.match(/^\\[pP]\{([^}]+)\}/))) { push(m[0], 'escape', (e === 'P' ? 'not ' : '') + 'a Unicode “' + m[1] + '” character'); i += m[0].length; }
        else if (ESC[e]) { push('\\' + e, e === 'b' || e === 'B' || e === 'A' || e === 'Z' || e === 'z' || e === 'G' ? 'anchor' : 'class', ESC[e]); i += 2; }
        else { push('\\' + e, 'literal', 'a literal “' + e + '”'); i += 2; }
      } else if (c === '[') {
        var j = i + 1; if (src.charAt(j) === '^') j++; if (src.charAt(j) === ']') j++;
        while (j < src.length && src.charAt(j) !== ']') { if (src.charAt(j) === '\\') j++; j++; }
        var cls = src.slice(i, j + 1); push(cls, 'class', describeClass(cls.slice(1, -1))); i = j + 1;
      } else if (c === '(') {
        var g;
        if ((m = rest.match(/^\(\?<([A-Za-z_]\w*)>/)) || (m = rest.match(/^\(\?P<([A-Za-z_]\w*)>/))) { groupNo++; g = 'named group “' + m[1] + '” (group ' + groupNo + ')'; }
        else if ((m = rest.match(/^\(\?:/))) g = 'group (not captured)';
        else if ((m = rest.match(/^\(\?=/))) g = 'look ahead: must be followed by';
        else if ((m = rest.match(/^\(\?!/))) g = 'look ahead: must NOT be followed by';
        else if ((m = rest.match(/^\(\?<=/))) g = 'look behind: must come after';
        else if ((m = rest.match(/^\(\?<!/))) g = 'look behind: must NOT come after';
        else if ((m = rest.match(/^\(\?>/))) g = 'atomic group (no backtracking — not in JavaScript)';
        else if ((m = rest.match(/^\(\?([imsxu]+)\)/))) { push(m[0], 'flag', 'turn on flags “' + m[1] + '” from here (not in JavaScript)'); i += m[0].length; continue; }
        else if ((m = rest.match(/^\(\?([imsxu-]+):/))) g = 'group with flags “' + m[1] + '”';
        else { m = ['(']; groupNo++; g = 'capture group ' + groupNo; }
        push(m[0], 'group', 'start of ' + g); stack.push(g); depth++; i += m[0].length;
      } else if (c === ')') {
        depth = Math.max(0, depth - 1); var open = stack.pop(); push(')', 'group', 'end of ' + (open || 'group')); i++;
      } else if ((m = rest.match(/^(?:\*|\+|\?|\{\d+(?:,\d*)?\}|\{,\d+\})[?+]?/))) {
        push(m[0], 'quant', describeQuant(m[0])); i += m[0].length;
      } else if (c === '|') { push('|', 'alt', 'OR — either the part before or the part after'); i++; }
      else if (c === '^') { push('^', 'anchor', 'start of the text (or of a line with the m flag)'); i++; }
      else if (c === '$') { push('$', 'anchor', 'end of the text (or of a line with the m flag)'); i++; }
      else if (c === '.') { push('.', 'class', 'any character except a new line (including new lines with the s flag)'); i++; }
      else {
        // group runs of plain literal characters (but leave the last one alone if a quantifier follows)
        m = rest.match(/^[^\\[\]()|^$.*+?{}]+/); var lit = m ? m[0] : c;
        if (lit.length > 1 && /^[*+?{]/.test(src.charAt(i + lit.length))) lit = lit.slice(0, -1);
        push(lit, 'literal', lit === ' ' ? 'a space' : 'the text “' + lit + '”'); i += lit.length;
      }
    }
    return out;
  }

  var FLAG_TEXT = { g: 'g — find every match, not just the first', i: 'i — ignore upper/lower case', m: 'm — ^ and $ match at each line', s: 's — dot matches new lines too', u: 'u — full Unicode mode', y: 'y — sticky (match only at lastIndex)', d: 'd — record match positions' };
  function explainFlags(flags) { return String(flags || '').split('').filter(function (f) { return FLAG_TEXT[f]; }).map(function (f) { return FLAG_TEXT[f]; }); }

  // ---------- flavour notes ----------
  function flavourNotes(src, flags) {
    var n = [];
    if (/\(\?<[A-Za-z_]/.test(src)) n.push('Named groups: JavaScript, Java and C# write (?<name>…). Python’s re module uses (?P<name>…) — the Python copy below converts it for you.');
    if (/\(\?P</.test(src)) n.push('(?P<name>…) is Python syntax. JavaScript and Java need (?<name>…).');
    if (/\(\?<[=!]/.test(src)) n.push('Look-behind works in modern JavaScript (ES2018+), Java and C#. Python and Java need a fixed or bounded length inside the look-behind.');
    if (/[*+}]\+/.test(src.replace(/\\./g, '')) || /\(\?>/.test(src)) n.push('Possessive quantifiers and atomic groups work in Java, C# (atomic only) and Python 3.11+, but not in JavaScript.');
    if (/\\[AZzG]/.test(src)) n.push('\\A, \\Z and \\z are not supported in JavaScript — use ^ and $ without the m flag.');
    if (/\(\?[imsx]+\)/.test(src)) n.push('Inline flags like (?i) work in Python, Java and C#, but not in most JavaScript engines — use the flags box instead.');
    if (/\\d|\\w|\\b/.test(src)) n.push('\\d and \\w: Python 3 matches any Unicode digit or letter by default (e.g. Arabic digits); JavaScript, Java and C# (with RegexOptions.ECMAScript) stick to ASCII unless told otherwise.');
    if (/\$/.test(src.replace(/\\\$/g, ''))) n.push('$ in Python, Java and C# also matches just before a final new line; in JavaScript it only matches at the very end (unless m is on).');
    if (/\\p\{/.test(src)) n.push('\\p{…} needs the u flag in JavaScript; Python’s re module does not support it (the third-party regex module does).');
    if (/s/.test(flags || '')) n.push('The s (dot-all) flag is re.DOTALL in Python, Pattern.DOTALL in Java and RegexOptions.Singleline in C#.');
    if (/y/.test(flags || '')) n.push('The y (sticky) flag only exists in JavaScript.');
    if (!n.length) n.push('Everything used here works the same in JavaScript, Python, Java and C#.');
    return n;
  }

  // ---------- language literals ----------
  function toPythonSyntax(src) { return src.replace(/\(\?<([A-Za-z_]\w*)>/g, '(?P<$1>').replace(/\\k<([A-Za-z_]\w*)>/g, '(?P=$1)'); }
  function literals(src, flags) {
    flags = flags || '';
    var jsFlags = flags.replace(/[^dgimsuyv]/g, '');
    var js = '/' + src.replace(/(^|[^\\])\//g, '$1\\/').replace(/(^|[^\\])\//g, '$1\\/') + '/' + jsFlags;
    // "\/" is only needed inside JavaScript /…/ literals
    src = src.replace(/((?:^|[^\\])(?:\\\\)*)\\\//g, '$1/');
    var py = toPythonSyntax(src), pyFlags = [], javaFlags = [], csFlags = [];
    if (flags.indexOf('i') >= 0) { pyFlags.push('re.IGNORECASE'); javaFlags.push('Pattern.CASE_INSENSITIVE'); csFlags.push('RegexOptions.IgnoreCase'); }
    if (flags.indexOf('m') >= 0) { pyFlags.push('re.MULTILINE'); javaFlags.push('Pattern.MULTILINE'); csFlags.push('RegexOptions.Multiline'); }
    if (flags.indexOf('s') >= 0) { pyFlags.push('re.DOTALL'); javaFlags.push('Pattern.DOTALL'); csFlags.push('RegexOptions.Singleline'); }
    var pyStr = (/\\$/.test(py.replace(/\\\\/g, '')) || (py.indexOf('"') >= 0 && py.indexOf("'") >= 0))
      ? '"' + py.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
      : py.indexOf('"') >= 0 ? "r'" + py + "'" : 'r"' + py + '"';
    var javaStr = '"' + src.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    var csStr = '@"' + src.replace(/"/g, '""') + '"';
    return {
      js: js,
      jsString: 'new RegExp(' + JSON.stringify(src) + (jsFlags ? ', ' + JSON.stringify(jsFlags) : '') + ')',
      python: 'import re\npattern = re.compile(' + pyStr + (pyFlags.length ? ', ' + pyFlags.join(' | ') : '') + ')\nmatches = pattern.findall(text)',
      java: 'import java.util.regex.*;\nPattern pattern = Pattern.compile(' + javaStr + (javaFlags.length ? ', ' + javaFlags.join(' | ') : '') + ');\nMatcher m = pattern.matcher(text);',
      csharp: 'using System.Text.RegularExpressions;\nvar regex = new Regex(' + csStr + (csFlags.length ? ', ' + csFlags.join(' | ') : '') + ');\nvar matches = regex.Matches(text);',
      pythonPattern: pyStr, javaPattern: javaStr, csharpPattern: csStr
    };
  }

  // ---------- tester ----------
  function compile(src, flags) {
    try { return { re: new RegExp(src, flags) }; } catch (e) { return { error: e.message.replace(/^Invalid regular expression: (\/.*\/[a-z]*: )?/, '') }; }
  }
  function test(src, flags, text, limit) {
    limit = limit || 1000; flags = flags || '';
    var c = compile(src, flags.indexOf('g') >= 0 ? flags : flags + 'g'); if (c.error) return { error: c.error, matches: [] };
    var re = c.re, out = [], m, globalOn = flags.indexOf('g') >= 0;
    if (src === '') return { matches: [], error: null };
    while ((m = re.exec(text)) && out.length < limit) {
      out.push({ index: m.index, end: m.index + m[0].length, text: m[0], groups: m.slice(1), named: m.groups ? Object.assign({}, m.groups) : null });
      if (m[0] === '') re.lastIndex++;
      if (!globalOn) break;
    }
    return { matches: out, error: null, truncated: out.length >= limit };
  }
  function replace(src, flags, text, replacement) {
    var c = compile(src, flags || ''); if (c.error) return { error: c.error, text: text };
    try { return { text: String(text).replace(c.re, replacement), error: null }; } catch (e) { return { error: e.message, text: text }; }
  }

  var L = { CATALOGUE: CATALOGUE, build: build, explain: explain, explainFlags: explainFlags, flavourNotes: flavourNotes, literals: literals, toPythonSyntax: toPythonSyntax, test: test, replace: replace, compile: compile, escapeRe: escapeRe, catalogueAt: catalogueAt, hasTopAlt: hasTopAlt };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.RegexLib = L;
})(this);
