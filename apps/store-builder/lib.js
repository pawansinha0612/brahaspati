/* Digital Product Store — pure logic: a tiny store-only ZIP writer, and a generator for a standalone storefront
   (one index.html with Product JSON-LD, SEO meta, three templates). Payments are the seller's own links. No DOM. */
(function (root) {
  'use strict';

  // ---------- bytes ----------
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(s));
    var out = [], str = unescape(encodeURIComponent(String(s))); for (var i = 0; i < str.length; i++) out.push(str.charCodeAt(i)); return new Uint8Array(out);
  }
  var CRC_TABLE = (function () { var t = [], c; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { var c = 0xFFFFFFFF; for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function b64ToBytes(b64) {
    var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', s = String(b64).replace(/[^A-Za-z0-9+/]/g, ''), out = new Uint8Array(Math.floor(s.length * 3 / 4)), o = 0;
    for (var i = 0; i < s.length; i += 4) {
      var n = (A.indexOf(s[i]) << 18) | (A.indexOf(s[i + 1]) << 12) | ((s[i + 2] ? A.indexOf(s[i + 2]) : 0) << 6) | (s[i + 3] ? A.indexOf(s[i + 3]) : 0);
      if (o < out.length) out[o++] = (n >> 16) & 255; if (o < out.length && s[i + 2]) out[o++] = (n >> 8) & 255; if (o < out.length && s[i + 3]) out[o++] = n & 255;
    }
    return out.slice(0, o);
  }
  // data:image/jpeg;base64,... -> {mime, ext, bytes}
  function dataUrlToBytes(u) {
    var m = String(u || '').match(/^data:([\w.+-]+\/[\w.+-]+)?(;base64)?,(.*)$/); if (!m) return null;
    var mime = m[1] || 'application/octet-stream', bytes = m[2] ? b64ToBytes(m[3]) : utf8(decodeURIComponent(m[3]));
    var ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' }[mime] || 'bin';
    return { mime: mime, ext: ext, bytes: bytes };
  }

  // ---------- ZIP (store only, no compression) ----------
  // files: [{name, data (string | Uint8Array), date?}] -> Uint8Array. UTF-8 names (flag bit 11).
  function zip(files, when) {
    var d = when || new Date(), parts = [], central = [], offset = 0;
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2));
    var dosDate = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    function u16(a, v) { a.push(v & 255, (v >>> 8) & 255); }
    function u32(a, v) { a.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255); }
    files.forEach(function (f) {
      var name = utf8(String(f.name).replace(/^\/+/, '')), data = typeof f.data === 'string' ? utf8(f.data) : f.data, crc = crc32(data);
      var h = []; u32(h, 0x04034b50); u16(h, 20); u16(h, 0x0800); u16(h, 0); u16(h, dosTime); u16(h, dosDate); u32(h, crc); u32(h, data.length); u32(h, data.length); u16(h, name.length); u16(h, 0);
      var head = new Uint8Array(h); parts.push(head, name, data);
      var c = []; u32(c, 0x02014b50); u16(c, 20); u16(c, 20); u16(c, 0x0800); u16(c, 0); u16(c, dosTime); u16(c, dosDate); u32(c, crc); u32(c, data.length); u32(c, data.length);
      u16(c, name.length); u16(c, 0); u16(c, 0); u16(c, 0); u16(c, 0); u32(c, 0); u32(c, offset);
      central.push(new Uint8Array(c), name);
      offset += head.length + name.length + data.length;
    });
    var cdSize = central.reduce(function (s, x) { return s + x.length; }, 0), e = [];
    u32(e, 0x06054b50); u16(e, 0); u16(e, 0); u16(e, files.length); u16(e, files.length); u32(e, cdSize); u32(e, offset); u16(e, 0);
    var all = parts.concat(central, [new Uint8Array(e)]), total = all.reduce(function (s, x) { return s + x.length; }, 0), out = new Uint8Array(total), p = 0;
    all.forEach(function (x) { out.set(x, p); p += x.length; });
    return out;
  }
  // Minimal reader for stored ZIPs (used by tests and to double-check our own output): -> [{name, data}]
  function unzip(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), eocd = -1;
    for (var i = bytes.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Not a zip');
    var n = dv.getUint16(eocd + 10, true), cd = dv.getUint32(eocd + 16, true), out = [];
    var dec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(cd, true) !== 0x02014b50) throw new Error('Bad central directory');
      var size = dv.getUint32(cd + 20, true), nl = dv.getUint16(cd + 28, true), xl = dv.getUint16(cd + 30, true), cl = dv.getUint16(cd + 32, true), off = dv.getUint32(cd + 42, true), crc = dv.getUint32(cd + 16, true);
      var name = bytes.slice(cd + 46, cd + 46 + nl), lnl = dv.getUint16(off + 26, true), lxl = dv.getUint16(off + 28, true), start = off + 30 + lnl + lxl, data = bytes.slice(start, start + size);
      if (crc32(data) !== crc) throw new Error('CRC mismatch');
      out.push({ name: dec ? dec.decode(name) : String.fromCharCode.apply(null, name), data: data });
      cd += 46 + nl + xl + cl;
    }
    return out;
  }

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'item'; }
  // Only http(s) and mailto links are allowed in the store (no javascript: etc.)
  function safeUrl(u) { u = String(u || '').trim(); return /^(https?:\/\/|mailto:)/i.test(u) ? u : ''; }
  function hex(c, fallback) { c = String(c || '').trim(); if (/^#[0-9a-f]{3}$/i.test(c)) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : fallback; }
  function luminance(c) { var v = [1, 3, 5].map(function (i) { var x = parseInt(c.substr(i, 2), 16) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }
  function contrast(a, b) { var x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function inkFor(bg) { return contrast(bg, '#ffffff') >= contrast(bg, '#111111') ? '#ffffff' : '#111111'; }
  function provider(u) {
    u = String(u || '').toLowerCase();
    if (/gumroad\.com|gum\.co/.test(u)) return 'Gumroad'; if (/lemonsqueezy\.com/.test(u)) return 'Lemon Squeezy'; if (/buy\.stripe\.com|checkout\.stripe\.com/.test(u)) return 'Stripe';
    if (/paypal\.(com|me)/.test(u)) return 'PayPal'; if (/payhip\.com/.test(u)) return 'Payhip'; if (/etsy\.com/.test(u)) return 'Etsy'; if (/ko-fi\.com/.test(u)) return 'Ko-fi';
    return '';
  }
  function money(n, cur) { var v = +n; if (isNaN(v)) return ''; if (v === 0) return 'Free'; try { return v.toLocaleString('en-AU', { style: 'currency', currency: cur || 'AUD' }); } catch (e) { return (cur || '$') + ' ' + v.toFixed(2); } }

  var TEMPLATES = { minimal: 'Minimal — clean, white, lots of space', bold: 'Bold — big coloured header, chunky cards', catalogue: 'Catalogue — compact list for many products' };

  function normalise(s) {
    s = s || {};
    var primary = hex(s.primary, '#b4531b'), bg = hex(s.background, '#ffffff'), text = hex(s.text, '#1d1f24');
    var products = (s.products || []).filter(function (p) { return p && String(p.title || '').trim(); }).map(function (p, i) {
      return { id: p.id || 'p' + i, title: String(p.title).trim(), description: String(p.description || '').trim(), price: p.price === '' || p.price == null ? NaN : +p.price, compareAt: +p.compareAt || 0,
        image: p.image || '', buyLink: safeUrl(p.buyLink), category: String(p.category || '').trim(), badge: String(p.badge || '').trim(), format: String(p.format || '').trim(), slug: slug(p.title) };
    });
    var cats = []; products.forEach(function (p) { if (p.category && cats.indexOf(p.category) < 0) cats.push(p.category); });
    return {
      name: String(s.name || 'My Store').trim(), tagline: String(s.tagline || '').trim(), about: String(s.about || '').trim(), logo: s.logo || '',
      template: TEMPLATES[s.template] ? s.template : 'minimal', primary: primary, background: bg, text: text, primaryInk: inkFor(primary), currency: /^[A-Z]{3}$/.test(s.currency || '') ? s.currency : 'AUD',
      products: products, categories: cats, faq: (s.faq || []).filter(function (f) { return f && f.q && f.a; }), testimonials: (s.testimonials || []).filter(function (t) { return t && t.quote; }),
      emailLink: safeUrl(s.emailLink), emailText: String(s.emailText || 'Get new releases and freebies by email.').trim(), contact: String(s.contact || '').trim(),
      seoTitle: String(s.seoTitle || '').trim(), seoDescription: String(s.seoDescription || '').trim(), siteUrl: safeUrl(s.siteUrl).replace(/\/?$/, '/'), shareImage: s.shareImage || '',
      footer: String(s.footer || '').trim(), lang: s.lang || 'en-AU'
    };
  }

  // Warnings shown in the builder before downloading.
  function checks(store) {
    var s = normalise(store), w = [];
    if (!s.products.length) w.push({ level: 'bad', msg: 'Add at least one product.' });
    s.products.forEach(function (p) {
      if (!p.buyLink) w.push({ level: 'bad', msg: '“' + p.title + '” has no buy link (it must start with https://).' });
      if (isNaN(p.price)) w.push({ level: 'warn', msg: '“' + p.title + '” has no price.' });
      if (!p.image) w.push({ level: 'warn', msg: '“' + p.title + '” has no image.' });
      if (p.description.length < 40) w.push({ level: 'info', msg: '“' + p.title + '” has a very short description — say what’s inside and who it’s for.' });
    });
    if (contrast(s.primary, s.primaryInk) < 4.5) w.push({ level: 'warn', msg: 'Button text may be hard to read on your main colour — pick a darker or lighter colour.' });
    if (contrast(s.background, s.text) < 4.5) w.push({ level: 'bad', msg: 'Text colour and background are too similar to read.' });
    if (!s.seoDescription) w.push({ level: 'info', msg: 'Add an SEO description (shown by Google and when the link is shared).' });
    if (!s.siteUrl || s.siteUrl === '/') w.push({ level: 'info', msg: 'Add your store’s web address once you know it, so search engines get the right link.' });
    if (!s.contact) w.push({ level: 'info', msg: 'Add a contact email — buyers trust stores they can reach (and Australian Consumer Law still applies to digital products).' });
    return w;
  }

  function jsonLd(s) {
    var list = { '@context': 'https://schema.org', '@type': 'ItemList', name: s.name, itemListElement: s.products.map(function (p, i) {
      var prod = { '@type': 'Product', name: p.title, description: p.description.slice(0, 500) || p.title, url: (s.siteUrl && s.siteUrl !== '/' ? s.siteUrl : '') + '#' + p.slug };
      if (p.image && !/^data:/.test(p.image)) prod.image = (/^https?:/.test(p.image) ? '' : (s.siteUrl && s.siteUrl !== '/' ? s.siteUrl : '')) + p.image;
      if (p.category) prod.category = p.category;
      prod.brand = { '@type': 'Brand', name: s.name };
      if (!isNaN(p.price)) prod.offers = { '@type': 'Offer', price: p.price.toFixed(2), priceCurrency: s.currency, availability: 'https://schema.org/InStock', url: p.buyLink || undefined };
      return { '@type': 'ListItem', position: i + 1, item: prod };
    }) };
    return JSON.stringify(list, null, 1).replace(/</g, '\\u003c');
  }

  function css(s) {
    var t = s.template, base = ':root{--p:' + s.primary + ';--pi:' + s.primaryInk + ';--bg:' + s.background + ';--tx:' + s.text + ';--mut:color-mix(in srgb,var(--tx) 65%,var(--bg));--ln:color-mix(in srgb,var(--tx) 14%,var(--bg));--card:color-mix(in srgb,var(--tx) 3%,var(--bg))}' +
      '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}img{max-width:100%;display:block}a{color:var(--p)}' +
      '.w{max-width:1080px;margin:0 auto;padding:0 18px}header.top{padding:18px 0;border-bottom:1px solid var(--ln)}header.top .w{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.logo{height:44px;width:auto}.brand{font-weight:800;font-size:20px;color:var(--tx);text-decoration:none}' +
      'nav.top{margin-left:auto;display:flex;gap:16px;font-size:15px;flex-wrap:wrap}nav.top a{color:var(--tx);text-decoration:none;opacity:.8}.hero{padding:44px 0 24px}.hero h1{font-size:clamp(28px,5vw,44px);line-height:1.15;margin:0 0 10px}.hero p{font-size:18px;color:var(--mut);max-width:62ch;margin:0}' +
      '.btn{display:inline-block;background:var(--p);color:var(--pi);padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:700;border:0;cursor:pointer;font-size:15px}.btn:hover{filter:brightness(1.08)}.btn.ghost{background:transparent;color:var(--p);border:2px solid var(--p)}' +
      '.filters{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 18px}.filters button{border:1px solid var(--ln);background:var(--bg);color:var(--tx);padding:6px 12px;border-radius:99px;cursor:pointer;font:inherit;font-size:14px}.filters button[aria-pressed=true]{background:var(--p);color:var(--pi);border-color:var(--p)}' +
      '.grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}.card{border:1px solid var(--ln);border-radius:12px;overflow:hidden;background:var(--card);display:flex;flex-direction:column}.card .img{aspect-ratio:4/3;background:var(--ln);overflow:hidden}.card .img img{width:100%;height:100%;object-fit:cover}' +
      '.card .body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:8px;flex:1}.card h3{margin:0;font-size:18px;line-height:1.3}.card p{margin:0;color:var(--mut);font-size:15px;white-space:pre-line}.meta{font-size:13px;color:var(--mut)}.price{font-size:20px;font-weight:800}.was{text-decoration:line-through;color:var(--mut);font-weight:400;font-size:15px;margin-left:6px}' +
      '.buy{margin-top:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-top:6px}.badge{display:inline-block;font-size:12px;font-weight:700;padding:2px 9px;border-radius:99px;background:var(--p);color:var(--pi);align-self:flex-start}.via{font-size:12px;color:var(--mut)}' +
      'section.blk{padding:34px 0;border-top:1px solid var(--ln)}section.blk h2{font-size:26px;margin:0 0 14px}.quotes{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}blockquote{margin:0;padding:16px;border-left:4px solid var(--p);background:var(--card);border-radius:0 10px 10px 0}blockquote footer{margin-top:8px;font-size:14px;color:var(--mut)}' +
      'details{border:1px solid var(--ln);border-radius:10px;padding:10px 14px;margin:8px 0;background:var(--card)}summary{cursor:pointer;font-weight:700}.signup{background:var(--card);border:1px solid var(--ln);border-radius:12px;padding:22px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:space-between}' +
      'footer.site{padding:26px 0 40px;color:var(--mut);font-size:14px;border-top:1px solid var(--ln);margin-top:20px}[hidden]{display:none!important}';
    if (t === 'bold') base += 'header.top{background:var(--p);border:0}header.top .brand,nav.top a{color:var(--pi)}.hero{background:var(--p);color:var(--pi);padding:30px 0 56px}.hero p{color:var(--pi);opacity:.9}.hero .btn{background:var(--pi);color:var(--p)}' +
      '.card{border:0;border-radius:18px;box-shadow:0 6px 24px rgba(0,0,0,.12)}main>.w:first-of-type{margin-top:-30px}.card h3{font-size:20px}.btn{border-radius:99px;padding:12px 22px}';
    if (t === 'catalogue') base += '.grid{grid-template-columns:1fr;gap:12px}.card{flex-direction:row;align-items:stretch}.card .img{flex:0 0 150px;aspect-ratio:1}.card .body{flex-direction:row;flex-wrap:wrap;align-items:center;gap:6px 16px}.card .txt{flex:1 1 260px;display:flex;flex-direction:column;gap:6px}' +
      '.card .buy{margin:0;flex:0 0 auto;padding:0}.hero{padding:28px 0 10px}@media(max-width:560px){.card{flex-direction:column}.card .img{flex:none;aspect-ratio:16/9}}';
    return base;
  }

  // store -> standalone HTML. imageSrc(product|'logo'|'share', dataUrl) lets the caller swap data URLs for file paths.
  function buildHtml(store, opts) {
    opts = opts || {}; var s = normalise(store), img = opts.imageSrc || function (k, u) { return u; };
    var title = s.seoTitle || s.name + (s.tagline ? ' — ' + s.tagline : ''), desc = s.seoDescription || s.tagline || s.about.slice(0, 155);
    var share = s.shareImage ? img('share', s.shareImage) : '', shareAbs = share && !/^data:/.test(share) ? (/^https?:/.test(share) ? share : (s.siteUrl !== '/' ? s.siteUrl : '') + share) : '';
    var h = [];
    h.push('<!doctype html>', '<html lang="' + esc(s.lang) + '">', '<head>', '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + esc(title) + '</title>', '<meta name="description" content="' + esc(desc) + '">',
      s.siteUrl !== '/' ? '<link rel="canonical" href="' + esc(s.siteUrl) + '">' : '',
      '<meta property="og:type" content="website">', '<meta property="og:title" content="' + esc(title) + '">', '<meta property="og:description" content="' + esc(desc) + '">',
      s.siteUrl !== '/' ? '<meta property="og:url" content="' + esc(s.siteUrl) + '">' : '', shareAbs ? '<meta property="og:image" content="' + esc(shareAbs) + '">' : '',
      '<meta name="twitter:card" content="' + (shareAbs ? 'summary_large_image' : 'summary') + '">', '<meta name="theme-color" content="' + s.primary + '">',
      '<meta name="generator" content="Brahaspati Digital Product Store">',
      '<style>' + css(s) + '</style>', '<script type="application/ld+json">' + jsonLd(s) + '</script>', '</head>', '<body>');
    h.push('<header class="top"><div class="w">' + (s.logo ? '<img class="logo" src="' + esc(img('logo', s.logo)) + '" alt="' + esc(s.name) + ' logo">' : '') + '<a class="brand" href="#">' + esc(s.name) + '</a>' +
      '<nav class="top"><a href="#products">Products</a>' + (s.testimonials.length ? '<a href="#reviews">Reviews</a>' : '') + (s.faq.length ? '<a href="#faq">FAQ</a>' : '') + (s.contact ? '<a href="mailto:' + esc(s.contact) + '">Contact</a>' : '') + '</nav></div></header>');
    h.push('<main><section class="hero"><div class="w"><h1>' + esc(s.tagline || s.name) + '</h1>' + (s.about ? '<p>' + esc(s.about) + '</p>' : '') + (s.template === 'bold' && s.products.length ? '<p style="margin-top:18px"><a class="btn" href="#products">Browse the shop</a></p>' : '') + '</div></section>');
    h.push('<div class="w" id="products">');
    if (s.categories.length > 1) h.push('<div class="filters" role="group" aria-label="Filter by category"><button type="button" data-cat="" aria-pressed="true">All</button>' + s.categories.map(function (c) { return '<button type="button" data-cat="' + esc(c) + '" aria-pressed="false">' + esc(c) + '</button>'; }).join('') + '</div>');
    h.push('<div class="grid">' + s.products.map(function (p) {
      var via = provider(p.buyLink);
      return '<article class="card" id="' + esc(p.slug) + '" data-cat="' + esc(p.category) + '">' + (p.image ? '<div class="img"><img src="' + esc(img(p, p.image)) + '" alt="' + esc(p.title) + '" loading="lazy"></div>' : '') +
        '<div class="body"><div class="txt">' + (p.badge ? '<span class="badge">' + esc(p.badge) + '</span>' : '') + '<h3>' + esc(p.title) + '</h3>' +
        ((p.category || p.format) ? '<div class="meta">' + esc([p.category, p.format].filter(Boolean).join(' · ')) + '</div>' : '') + (p.description ? '<p>' + esc(p.description) + '</p>' : '') + '</div>' +
        '<div class="buy">' + (isNaN(p.price) ? '' : '<span class="price">' + esc(money(p.price, s.currency)) + (p.compareAt > p.price ? '<span class="was">' + esc(money(p.compareAt, s.currency)) + '</span>' : '') + '</span>') +
        (p.buyLink ? '<a class="btn" href="' + esc(p.buyLink) + '" rel="noopener" target="_blank">' + (p.price === 0 ? 'Get it free' : 'Buy now') + '</a>' + (via ? '<span class="via">Secure checkout via ' + esc(via) + '</span>' : '') : '<span class="via">Coming soon</span>') + '</div></div></article>';
    }).join('') + '</div></div>');
    if (s.testimonials.length) h.push('<section class="blk" id="reviews"><div class="w"><h2>What buyers say</h2><div class="quotes">' + s.testimonials.map(function (t) { return '<blockquote><div>“' + esc(t.quote) + '”</div>' + (t.name ? '<footer>— ' + esc(t.name) + '</footer>' : '') + '</blockquote>'; }).join('') + '</div></div></section>');
    if (s.emailLink) h.push('<section class="blk"><div class="w"><div class="signup"><div><h2 style="margin:0 0 4px;font-size:22px">Stay in the loop</h2><div>' + esc(s.emailText) + '</div></div><a class="btn" href="' + esc(s.emailLink) + '" rel="noopener" target="_blank">Sign up</a></div></div></section>');
    if (s.faq.length) h.push('<section class="blk" id="faq"><div class="w"><h2>Questions</h2>' + s.faq.map(function (f) { return '<details><summary>' + esc(f.q) + '</summary><p>' + esc(f.a) + '</p></details>'; }).join('') + '</div></section>');
    h.push('</main><footer class="site"><div class="w">' + (s.footer ? esc(s.footer) + '<br>' : '') + '© ' + new Date().getFullYear() + ' ' + esc(s.name) + (s.contact ? ' · <a href="mailto:' + esc(s.contact) + '">' + esc(s.contact) + '</a>' : '') +
      '<br><span style="font-size:12px">Payments are handled by the checkout provider linked on each product.</span></div></footer>');
    if (s.categories.length > 1) h.push('<script>(function(){var b=document.querySelectorAll(".filters button"),c=document.querySelectorAll(".card");for(var i=0;i<b.length;i++)b[i].addEventListener("click",function(){var v=this.getAttribute("data-cat");for(var j=0;j<b.length;j++)b[j].setAttribute("aria-pressed",String(b[j]===this));for(var k=0;k<c.length;k++)c[k].hidden=!!v&&c[k].getAttribute("data-cat")!==v;});})();</script>');
    h.push('</body>', '</html>');
    return h.filter(function (x) { return x !== ''; }).join('\n') + '\n';
  }

  var README = 'Your store — how to put it online for free\n==========================================\n\n' +
    'This folder is a complete website: index.html plus an images folder. No server or database is needed.\n\n' +
    'Option A — Netlify Drop (2 minutes, no account needed to try)\n  1. Unzip this file.\n  2. Go to https://app.netlify.com/drop\n  3. Drag the unzipped folder onto the page. You get a web address straight away.\n  4. Create a free account to keep the site and choose a nicer name.\n\n' +
    'Option B — GitHub Pages (free, permanent)\n  1. Sign in at https://github.com and create a new PUBLIC repository (e.g. my-store).\n  2. Click "uploading an existing file" and drag in index.html and the images folder. Commit.\n  3. Settings -> Pages -> Source: "Deploy from a branch", Branch: main, folder / (root) -> Save.\n  4. After a minute your store is at https://YOUR-NAME.github.io/my-store/\n\n' +
    'Updating: rebuild in the Brahaspati store builder, download again and replace the files.\n' +
    'Payments: each Buy button goes to your own Gumroad / Lemon Squeezy / Stripe / PayPal link. They handle payment, delivery of the file and receipts.\n';

  // Build the downloadable package. mode 'zip' -> images as separate files; 'html' -> single file with data-URL images.
  function buildPackage(store, mode) {
    if (mode === 'html') return { html: buildHtml(store), files: [] };
    var files = [], used = {};
    function file(base, dataUrl) {
      if (!/^data:/.test(dataUrl || '')) return dataUrl;
      if (used[dataUrl]) return used[dataUrl];
      var b = dataUrlToBytes(dataUrl); if (!b) return dataUrl;
      var name = 'images/' + base + '.' + b.ext, n = 2; while (files.some(function (f) { return f.name === name; })) name = 'images/' + base + '-' + n++ + '.' + b.ext;
      files.push({ name: name, data: b.bytes }); used[dataUrl] = name; return name;
    }
    var html = buildHtml(store, { imageSrc: function (k, u) { return file(k === 'logo' ? 'logo' : k === 'share' ? 'share' : slug(k.title), u); } });
    var all = [{ name: 'index.html', data: html }].concat(files, [{ name: 'README.txt', data: README }]);
    return { html: html, files: all, zip: zip(all) };
  }

  function sample() {
    function svg(bg, fg, label) { return 'data:image/svg+xml;base64,' + (typeof btoa !== 'undefined' ? btoa : function (x) { return Buffer.from(x, 'binary').toString('base64'); })('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="' + bg + '"/><rect x="250" y="120" width="300" height="380" rx="14" fill="#fff" opacity=".92"/><rect x="290" y="180" width="220" height="20" rx="6" fill="' + fg + '"/><rect x="290" y="220" width="160" height="14" rx="6" fill="' + fg + '" opacity=".5"/><rect x="290" y="250" width="200" height="14" rx="6" fill="' + fg + '" opacity=".5"/><text x="400" y="560" font-family="sans-serif" font-size="40" font-weight="700" fill="#fff" text-anchor="middle">' + label + '</text></svg>'); }
    return {
      name: 'Tidy Desk Templates', tagline: 'Templates that make small-business admin quick', about: 'Ready-to-use spreadsheets, planners and guides for Australian sole traders. Download instantly, edit in Excel, Google Sheets or Canva.',
      template: 'minimal', primary: '#1f6f5c', background: '#fbfaf7', text: '#1d1f24', currency: 'AUD', contact: 'hello@example.com',
      emailLink: 'https://example.com/newsletter', emailText: 'One email a month with a free template and new releases. No spam.',
      seoTitle: 'Tidy Desk Templates — spreadsheets and planners for sole traders', seoDescription: 'Invoice trackers, BAS checklists, content planners and guides for Australian small businesses. Instant download.',
      siteUrl: 'https://example.github.io/tidy-desk/', footer: 'ABN 00 000 000 000 (sample)',
      products: [
        { id: 's1', title: 'Invoice & Payment Tracker', description: 'Google Sheets + Excel tracker: invoices, due dates, overdue alerts and a GST summary for your BAS.', price: 19, compareAt: 29, category: 'Spreadsheets', format: 'XLSX + Google Sheets', badge: 'Best seller', buyLink: 'https://example.gumroad.com/l/invoice-tracker', image: svg('#1f6f5c', '#1f6f5c', 'Invoice Tracker') },
        { id: 's2', title: 'BAS Quarter Checklist', description: 'A one-page printable checklist so you never miss a step when lodging your quarterly BAS.', price: 0, category: 'Guides', format: 'PDF', buyLink: 'https://example.lemonsqueezy.com/checkout/buy/bas', image: svg('#2557d6', '#2557d6', 'BAS Checklist') },
        { id: 's3', title: '90-Day Content Planner', description: 'Plan three months of social posts in an afternoon. Includes 120 post prompts for service businesses.', price: 24, category: 'Planners', format: 'Canva + PDF', buyLink: 'https://buy.stripe.com/test_example', image: svg('#b4531b', '#b4531b', 'Content Planner') },
        { id: 's4', title: 'Pricing Your Services Guide', description: 'A 28-page guide with worked examples: hourly vs package pricing, how to raise prices, and scripts for the conversation.', price: 15, category: 'Guides', format: 'PDF', buyLink: 'https://www.paypal.com/ncp/payment/EXAMPLE', image: svg('#6b4bb8', '#6b4bb8', 'Pricing Guide') }
      ],
      faq: [{ q: 'How do I get my files?', a: 'Straight after payment you get a download link on screen and by email from the checkout provider.' }, { q: 'Do they work on a Mac?', a: 'Yes — spreadsheets open in Excel, Numbers or Google Sheets; Canva files open in your browser.' }, { q: 'Can I get a refund?', a: 'If a file doesn’t work for you, email us within 14 days and we’ll fix it or refund you.' }],
      testimonials: [{ quote: 'The invoice tracker saved me hours at BAS time.', name: 'Mel, bookkeeper (sample)' }, { quote: 'Clear, simple and actually made for Australia.', name: 'Raj, electrician (sample)' }]
    };
  }

  var L = { TEMPLATES: TEMPLATES, utf8: utf8, crc32: crc32, b64ToBytes: b64ToBytes, dataUrlToBytes: dataUrlToBytes, zip: zip, unzip: unzip, esc: esc, slug: slug, safeUrl: safeUrl, hex: hex, contrast: contrast, inkFor: inkFor,
    provider: provider, money: money, normalise: normalise, checks: checks, jsonLd: jsonLd, buildHtml: buildHtml, buildPackage: buildPackage, README: README, sample: sample };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.StoreLib = L;
})(this);
