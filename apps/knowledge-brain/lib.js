/* Knowledge Brain — pure logic (no DOM). Chunking, BM25 search, extractive answers,
   TextRank-lite summaries, key facts, RAG prompt, library export/import. Works in Node for tests. */
(function (root) {
  'use strict';
  var STOP = ('a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its ' +
    'me my no not of on or our she so than that the their them then there these they this to too was we were what when where which ' +
    'who whom why will with would you your yours about after all also am any because before being both each few further here ' +
    'just more most must now only other over own same should some such through under until up very while').split(' ');
  var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = 1; });

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // Very light stemmer so "invoices" matches "invoice" and "paying" ~ "pay".
  function stem(w) {
    if (w.length > 5 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /ed$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /[^s]s$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function words(text) { return String(text || '').toLowerCase().match(/[a-z0-9À-ɏ]+(?:'[a-z]+)?/g) || []; }
  function tokenize(text) {
    return words(text).filter(function (w) { return !STOPSET[w] && (w.length > 1 || /\d/.test(w)); }).map(stem);
  }

  function splitSentences(text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim(); if (!t) return [];
    var out = t.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || [t];
    // Re-join splits after common abbreviations and decimals
    var res = [];
    out.forEach(function (s) {
      s = s.trim(); if (!s) return;
      var prev = res[res.length - 1];
      if (prev && /\b(e\.g|i\.e|etc|Mr|Mrs|Ms|Dr|St|No|vs|Pty|Ltd|approx)\.$/i.test(prev)) res[res.length - 1] = prev + ' ' + s;
      else res.push(s);
    });
    return res;
  }

  // Split text into ~size-char chunks with overlap, preferring sentence/space boundaries.
  function chunk(text, opts) {
    opts = opts || {}; var size = opts.size || 800, overlap = opts.overlap == null ? 150 : opts.overlap;
    var t = String(text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (!t) return [];
    if (t.length <= size) return [{ text: t, start: 0 }];
    var out = [], start = 0;
    while (start < t.length) {
      var end = Math.min(t.length, start + size);
      if (end < t.length) {
        var win = t.slice(start + Math.floor(size * 0.6), end);
        var m = win.match(/[\s\S]*[.!?\n]\s/); // last sentence end in the window tail
        if (m) end = start + Math.floor(size * 0.6) + m[0].length;
        else { var sp = t.lastIndexOf(' ', end); if (sp > start + size * 0.5) end = sp; }
      }
      out.push({ text: t.slice(start, end).trim(), start: start });
      if (end >= t.length) break;
      var next = end - overlap;
      var sp2 = t.indexOf(' ', next); if (sp2 > -1 && sp2 < end) next = sp2 + 1;
      start = Math.max(next, start + 1);
    }
    return out;
  }

  // pages: [{page, text}] (page may be a number or a label like a sheet name)
  function chunkDocument(doc, opts) {
    var res = [], n = 0;
    (doc.pages || []).forEach(function (p) {
      chunk(p.text, opts).forEach(function (c) { res.push({ id: doc.id + ':' + (n++), docId: doc.id, docName: doc.name, page: p.page, text: c.text }); });
    });
    return res;
  }

  // ---------- BM25 ----------
  function buildIndex(chunks) {
    var df = {}, docs = [], total = 0;
    chunks.forEach(function (c) {
      var toks = tokenize(c.text), tf = {};
      toks.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
      Object.keys(tf).forEach(function (t) { df[t] = (df[t] || 0) + 1; });
      docs.push({ tf: tf, len: toks.length }); total += toks.length;
    });
    return { df: df, docs: docs, N: chunks.length, avgdl: chunks.length ? total / chunks.length : 0 };
  }
  function idf(index, t) { var n = index.df[t] || 0; return Math.log(1 + (index.N - n + 0.5) / (n + 0.5)); }
  function bm25(index, i, qterms, k1, b) {
    var d = index.docs[i], s = 0; k1 = k1 || 1.2; b = b == null ? 0.75 : b;
    qterms.forEach(function (t) {
      var f = d.tf[t]; if (!f) return;
      s += idf(index, t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / (index.avgdl || 1)));
    });
    return s;
  }
  // -> [{chunk, score, index}] best first. opts: {limit, docIds:[...]}
  function search(index, chunks, query, opts) {
    opts = opts || {};
    var q = tokenize(query).filter(function (t, i, a) { return a.indexOf(t) === i; });
    if (!q.length) return [];
    var allow = opts.docIds && opts.docIds.length ? opts.docIds : null, res = [];
    for (var i = 0; i < chunks.length; i++) {
      if (allow && allow.indexOf(chunks[i].docId) < 0) continue;
      var s = bm25(index, i, q); if (s > 0) res.push({ chunk: chunks[i], score: s, index: i });
    }
    res.sort(function (a, b) { return b.score - a.score; });
    return res.slice(0, opts.limit || 20);
  }

  // Escaped snippet around the first match, with <mark> on matching words.
  function highlight(text, query, maxLen) {
    maxLen = maxLen || 260; text = String(text || '');
    if (text.length > maxLen) text = text.replace(/\s+/g, ' '); // keep line breaks when showing the whole text
    var q = tokenize(query); var lowerWords = {};
    q.forEach(function (t) { lowerWords[t] = 1; });
    var re = /[A-Za-z0-9À-ɏ]+(?:'[A-Za-z]+)?/g, m, first = -1;
    while ((m = re.exec(text))) { if (lowerWords[stem(m[0].toLowerCase())]) { first = m.index; break; } }
    var start = 0;
    if (text.length > maxLen) { start = Math.max(0, first - Math.floor(maxLen / 3)); var sp = text.indexOf(' ', start); if (start > 0 && sp > -1 && sp - start < 30) start = sp + 1; }
    var piece = text.slice(start, start + maxLen);
    var out = '', last = 0; re.lastIndex = 0;
    while ((m = re.exec(piece))) {
      if (lowerWords[stem(m[0].toLowerCase())]) { out += esc(piece.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>'; last = m.index + m[0].length; }
    }
    out += esc(piece.slice(last));
    return (start > 0 ? '… ' : '') + out + (start + maxLen < text.length ? ' …' : '');
  }

  // ---------- extractive answer ----------
  // results: from search(). Returns {sentences:[{text, cite, chunk, score}], sources:[chunk]}.
  function extractiveAnswer(query, results, opts) {
    opts = opts || {}; var max = opts.max || 3, top = results.slice(0, opts.chunks || 5);
    var q = tokenize(query).filter(function (t, i, a) { return a.indexOf(t) === i; });
    if (!q.length || !top.length) return { sentences: [], sources: [] };
    var best = top[0].score || 1, cands = [];
    top.forEach(function (r, ri) {
      splitSentences(r.chunk.text).forEach(function (s, si) {
        var toks = tokenize(s); if (toks.length < 3) return;
        var set = {}; toks.forEach(function (t) { set[t] = 1; });
        var hits = q.filter(function (t) { return set[t]; }).length; if (!hits) return;
        var overlap = hits / q.length, density = hits / Math.sqrt(toks.length);
        var score = overlap * 2 + density * 0.5 + (r.score / best) * 0.8 - si * 0.02;
        cands.push({ text: s, chunk: r.chunk, rank: ri, score: score, key: s.toLowerCase() });
      });
    });
    cands.sort(function (a, b) { return b.score - a.score; });
    var picked = [], seen = {};
    for (var i = 0; i < cands.length && picked.length < max; i++) { if (seen[cands[i].key]) continue; seen[cands[i].key] = 1; picked.push(cands[i]); }
    var sources = [];
    picked.forEach(function (p) { var k = sources.indexOf(p.chunk); if (k < 0) { sources.push(p.chunk); k = sources.length - 1; } p.cite = k + 1; delete p.key; });
    return { sentences: picked, sources: sources };
  }

  // ---------- TextRank-lite summary ----------
  function summarise(text, n) {
    n = n || 5; var sents = splitSentences(text).filter(function (s) { return s.length > 25 && s.length < 600; });
    if (sents.length <= n) return sents;
    if (sents.length > 400) sents = sents.slice(0, 400);
    var toks = sents.map(function (s) { var o = {}; tokenize(s).forEach(function (t) { o[t] = 1; }); return o; });
    var sizes = toks.map(function (o) { return Object.keys(o).length; });
    var N = sents.length, W = [];
    for (var i = 0; i < N; i++) {
      W.push(new Array(N).fill(0));
      for (var j = 0; j < i; j++) {
        var c = 0; for (var k in toks[i]) if (toks[j][k]) c++;
        var w = c && sizes[i] > 1 && sizes[j] > 1 ? c / (Math.log(sizes[i]) + Math.log(sizes[j])) : 0;
        W[i][j] = w; W[j][i] = w;
      }
    }
    var sums = W.map(function (r) { return r.reduce(function (a, b) { return a + b; }, 0) || 1; });
    var sc = new Array(N).fill(1);
    for (var it = 0; it < 20; it++) {
      var nx = new Array(N).fill(0.15);
      for (var a = 0; a < N; a++) for (var b = 0; b < N; b++) if (W[b][a]) nx[a] += 0.85 * W[b][a] / sums[b] * sc[b];
      sc = nx;
    }
    // Small boost for lead sentences
    var order = sents.map(function (s, i) { return { i: i, s: sc[i] * (i < 3 ? 1.15 : 1) }; }).sort(function (x, y) { return y.s - x.s; });
    return order.slice(0, n).map(function (o) { return o.i; }).sort(function (x, y) { return x - y; }).map(function (i) { return sents[i]; });
  }

  // ---------- key facts ----------
  var MONTHS = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  function uniq(a) { var s = {}, o = []; a.forEach(function (x) { x = x.trim(); var k = x.toLowerCase(); if (x && !s[k]) { s[k] = 1; o.push(x); } }); return o; }
  function keyFacts(text) {
    var t = String(text || '');
    var dateRe = new RegExp('\\b(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.]\\d{1,2}[/.]\\d{2,4}|\\d{1,2}(?:st|nd|rd|th)?\\s+' + MONTHS + ',?\\s+\\d{4}|' + MONTHS + '\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|' + MONTHS + '\\s+\\d{4})\\b', 'g');
    var emails = t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
    var urls = (t.match(/\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+/g) || []).map(function (u) { return u.replace(/[.,;:]+$/, ''); });
    var amounts = t.match(/(?:[$€£¥₹]|\b(?:AUD|USD|NZD|EUR|GBP|INR)\s?)\s?-?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|million|billion|bn)\b)?|\b\d[\d,]*(?:\.\d+)?\s?(?:dollars|AUD|USD|per cent|percent)\b|\b\d+(?:\.\d+)?%/gi) || [];
    var noEmail = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, ' ').replace(dateRe, ' ');
    var phones = (noEmail.match(/(?:\+\d{1,3}[\s-]?)?(?:\(\d{1,4}\)[\s-]?)?\d(?:[\s-]?\d){7,11}\b/g) || []).filter(function (p) {
      var d = p.replace(/\D/g, ''); return d.length >= 8 && d.length <= 13 && !/^\d{4}$/.test(p.trim());
    });
    // Capitalised phrases of 2-4 words that are not at a sentence start only
    var names = [], nameRe = /\b([A-Z][a-z]+(?:[ -](?:[A-Z][a-z]+|of|and|&|de|van)){1,3}(?: [A-Z][a-z]+)?)\b/g, m;
    var skip = /^(The|This|That|These|Those|A|An|In|On|At|For|If|When|We|You|I|It|Our|Please|Dear|Hi|Hello|Thanks|Thank|Contact|Call|Email|Phone|See|Meet|Ask|Send|Note|Visit|Read|Pay|Sign|Regards|From|To|By|With|Ask|Attn|Re|Subject|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/;
    while ((m = nameRe.exec(t))) {
      var ph = m[1].replace(/ (of|and|&|de|van)$/, '');
      if (new RegExp('^' + MONTHS + '\\b').test(ph)) continue;
      if (skip.test(ph)) { ph = ph.replace(skip, '').trim(); if (ph.split(' ').length < 2) continue; }
      names.push(ph);
    }
    var counts = {}; names.forEach(function (n) { counts[n] = (counts[n] || 0) + 1; });
    return {
      dates: uniq(t.match(dateRe) || []), amounts: uniq(amounts), emails: uniq(emails), phones: uniq(phones), urls: uniq(urls),
      names: uniq(names).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 30)
    };
  }

  // ---------- AI prompt (retrieval-augmented) ----------
  function ragPrompt(query, results, maxChars) {
    maxChars = maxChars || 6000; var used = 0, parts = [];
    results.forEach(function (r, i) {
      if (used > maxChars) return;
      var txt = r.chunk.text.slice(0, Math.max(200, maxChars - used)); used += txt.length;
      parts.push('[' + (i + 1) + '] ' + r.chunk.docName + (r.chunk.page != null ? ' (page ' + r.chunk.page + ')' : '') + '\n' + txt);
    });
    return 'Answer the question using ONLY the sources below. Cite sources inline as [1], [2]. ' +
      'If the sources do not contain the answer, say "The documents don\'t say." Keep it short and plain.\n\n' +
      'SOURCES\n' + parts.join('\n\n') + '\n\nQUESTION: ' + query + '\nANSWER:';
  }

  // ---------- library export / import ----------
  function exportLibrary(docs) {
    return JSON.stringify({ app: 'brahaspati-knowledge-brain', version: 1, exported: new Date().toISOString(), docs: docs.map(function (d) {
      return { id: d.id, name: d.name, type: d.type, added: d.added, pages: d.pages };
    }) });
  }
  function importLibrary(json) {
    var data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || data.app !== 'brahaspati-knowledge-brain' || !Array.isArray(data.docs)) throw new Error('This is not a Knowledge Brain library file.');
    return data.docs.filter(function (d) { return d && d.id && d.name && Array.isArray(d.pages); }).map(function (d) {
      return { id: String(d.id), name: String(d.name), type: d.type || 'text', added: d.added || new Date().toISOString(),
        pages: d.pages.map(function (p) { return { page: p.page, text: String(p.text || '') }; }) };
    });
  }

  // HTML -> plain text without a DOM (for .html notes)
  function htmlToText(html) {
    return String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  var L = { tokenize: tokenize, stem: stem, splitSentences: splitSentences, chunk: chunk, chunkDocument: chunkDocument, buildIndex: buildIndex,
    search: search, highlight: highlight, extractiveAnswer: extractiveAnswer, summarise: summarise, keyFacts: keyFacts, ragPrompt: ragPrompt,
    exportLibrary: exportLibrary, importLibrary: importLibrary, htmlToText: htmlToText, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.KnowledgeLib = L;
})(this);
