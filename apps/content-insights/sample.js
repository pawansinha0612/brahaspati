/* Synthetic sample exports (made-up numbers) in the same shape as YouTube Studio and Meta Business Suite CSV downloads.
   Browser: window.InsightsSample. Node: require('./sample.js'). */
(function (root) {
  'use strict';
  function rng(a) { return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  var TITLES = [
    'When my mother found the old letter', 'Would you forgive your brother after this?', 'The tailor who never charged the orphan', 'My father kept this secret for 20 years',
    'This is why you never judge a delivery boy', 'Nobody noticed what Dadi did every night…', 'Rainy bus stop, two strangers, one umbrella', '3 seconds that changed her wedding day',
    'Why did the teacher cry at the school gate?', 'Grandpa’s last promise 💔', 'The rent receipts nobody knew about', 'POV: you finally learn why your sister stayed silent',
    'Office canteen comedy', 'Tea stall morning routine', 'When the rich groom met the poor cobbler', 'माँ की चिट्ठी — mother’s letter',
    'Train platform goodbye… wait for the ending', 'My son’s first salary', 'Village kitchen secret recipe', 'How one rupee changed a life',
    'The night nurse and the lonely patient', 'Brother sold his bike for this?', 'This old watch hides a betrayal', 'Rooftop kite festival',
    'When papa came home early', 'Forgive me, maa — a heart touching story', 'Street food vendor saves a stranger', 'Did she choose love or family?',
    'Temple courtyard: the lost child', 'Wedding hall after the guests leave', 'My grandmother’s sewing machine', 'Funny auto-rickshaw argument',
    'The sacrifice a father never mentions', 'Why the shopkeeper refused the money?', 'Bhai’s secret phone call', 'Last day at the old house…',
    'Daughter’s report card surprise', 'When the orphan became a doctor', 'Monsoon cricket match', 'What the old letter really said'
  ];
  var EMO = /mother|maa|माँ|father|papa|dadi|grandpa|grandmother|sister|brother|bhai|son|daughter|cry|heart|sacrifice|betrayal|forgive|orphan|lonely|promise|goodbye|last/i;
  function iso(d) { return d.toISOString().slice(0, 10); }
  function build(platform) {
    var r = rng(platform === 'youtube' ? 11 : 29), start = Date.UTC(2026, 6, 1), rows = [];
    TITLES.forEach(function (t, i) {
      var dur = [14, 22, 28, 35, 42, 48, 55, 58, 65, 75, 88, 120][Math.floor(r() * 12)];
      var date = new Date(start + i * 3 * 86400000 + Math.floor(r() * 2) * 86400000);
      var hour = [7, 8, 12, 13, 18, 19, 20, 21, 22][Math.floor(r() * 9)];
      var base = 4000 + r() * 9000;
      if (EMO.test(t)) base *= 2.1;
      if (/\?/.test(t)) base *= 1.5;
      if (/^(when|my)\b/i.test(t)) base *= 1.3;
      if (dur > 30 && dur <= 60) base *= 1.6; else if (dur > 90) base *= 0.6;
      var dow = date.getUTCDay(); if (dow === 0 || dow === 6) base *= 1.25;
      if (hour >= 18 && hour < 22) base *= 1.3;
      if (/comedy|funny|routine|cricket|kite/i.test(t)) base *= 0.45;
      var views = Math.round(base * (0.7 + r() * 0.6));
      var pct = Math.min(98, Math.max(18, (EMO.test(t) ? 62 : 44) - (dur > 60 ? 15 : 0) + (r() * 20 - 10)));
      var likes = Math.round(views * (0.04 + r() * 0.05)), shares = Math.round(views * (EMO.test(t) ? 0.012 + r() * 0.02 : 0.002 + r() * 0.006)), comments = Math.round(views * (0.003 + r() * 0.006));
      rows.push({ t: t, dur: dur, date: date, hour: hour, views: views, pct: pct, likes: likes, shares: shares, comments: comments, reach: Math.round(views * (0.75 + r() * 0.2)) });
    });
    return rows;
  }
  function q(v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function hms(s) { s = Math.round(s); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h + ':' + (m < 10 ? '0' : '') + m + ':' + (x < 10 ? '0' : '') + x; }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function youtube() {
    var rows = build('youtube');
    var head = 'Content,Video title,Video publish time,Duration,Views,Watch time (hours),Subscribers,Average view duration,Average percentage viewed (%),Impressions,Impressions click-through rate (%),Likes,Shares,Comments added';
    var tot = rows.reduce(function (s, x) { return s + x.views; }, 0);
    var lines = ['Total,,,,' + tot + ',,,,,,,,,'];
    rows.forEach(function (x, i) {
      var avs = x.dur * x.pct / 100;
      lines.push(['vid' + (1000 + i), q(x.t), q(MON[x.date.getUTCMonth()] + ' ' + x.date.getUTCDate() + ', ' + x.date.getUTCFullYear()), x.dur, x.views, (x.views * avs / 3600).toFixed(4),
        Math.round(x.views / 400), hms(avs), x.pct.toFixed(2), Math.round(x.views * 3.2), (100 / 3.2 * 0.31).toFixed(2), x.likes, x.shares, x.comments].join(','));
    });
    return head + '\n' + lines.join('\n') + '\n';
  }
  function facebook() {
    var rows = build('facebook');
    var head = 'Post ID,Page ID,Page name,Title,Description,Duration (sec),Publish time,Permalink,Post type,Views,Reach,"Reactions, Comments and Shares",Reactions,Comments,Shares,Seconds viewed,Average Seconds viewed';
    var lines = rows.map(function (x, i) {
      var d = x.date, pt = (d.getUTCMonth() + 1 < 10 ? '0' : '') + (d.getUTCMonth() + 1) + '/' + (d.getUTCDate() < 10 ? '0' : '') + d.getUTCDate() + '/' + d.getUTCFullYear() + ' ' + (x.hour < 10 ? '0' : '') + x.hour + ':30';
      var avs = x.dur * x.pct / 100;
      return ['1220' + (5000 + i), '998877', 'Sample Story Page', q(x.t), q(x.t + ' #emotional #family #story'), x.dur, pt, 'https://www.facebook.com/reel/' + (5000 + i), 'Reel',
        x.views, x.reach, x.likes + x.comments + x.shares, x.likes, x.comments, x.shares, Math.round(x.views * avs), avs.toFixed(1)].join(',');
    });
    return head + '\n' + lines.join('\n') + '\n';
  }
  var S = { youtube: youtube, facebook: facebook, iso: iso };
  if (typeof module !== 'undefined' && module.exports) module.exports = S; else root.InsightsSample = S;
})(this);
