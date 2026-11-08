/* Architecture Diagram Generator — pure logic, no DOM.
   Inputs (plain description, docker-compose, Kubernetes YAML, folder tree) -> model {nodes, edges}
   -> Mermaid flowchart (layers) or C4 container diagram, draw.io XML, layered layout. */
(function (root) {
  'use strict';

  // ---------- model helpers ----------
  var LAYERS = [
    { id: 'client', label: 'Clients' }, { id: 'edge', label: 'Edge' }, { id: 'service', label: 'Services' },
    { id: 'data', label: 'Data & messaging' }, { id: 'external', label: 'External services' }
  ];
  var KIND = {
    user: { layer: 'client', icon: '👤', label: 'user' }, web: { layer: 'client', icon: '🖥️', label: 'web app' }, mobile: { layer: 'client', icon: '📱', label: 'mobile app' },
    cdn: { layer: 'edge', icon: '🌐', label: 'CDN' }, gateway: { layer: 'edge', icon: '🚪', label: 'API gateway' }, lb: { layer: 'edge', icon: '⚖️', label: 'load balancer' }, proxy: { layer: 'edge', icon: '🔀', label: 'proxy' }, ingress: { layer: 'edge', icon: '🚪', label: 'ingress' },
    service: { layer: 'service', icon: '⚙️', label: 'service' }, worker: { layer: 'service', icon: '🛠️', label: 'worker' }, function: { layer: 'service', icon: 'λ', label: 'function' }, k8sservice: { layer: 'service', icon: '🔌', label: 'k8s service' },
    database: { layer: 'data', icon: '🗄️', label: 'database' }, cache: { layer: 'data', icon: '⚡', label: 'cache' }, queue: { layer: 'data', icon: '📨', label: 'queue / stream' }, storage: { layer: 'data', icon: '🪣', label: 'storage' }, search: { layer: 'data', icon: '🔎', label: 'search' }, config: { layer: 'data', icon: '📝', label: 'config' }, volume: { layer: 'data', icon: '💾', label: 'volume' },
    external: { layer: 'external', icon: '☁️', label: 'external service' }, infra: { layer: 'external', icon: '🏗️', label: 'infrastructure' }
  };
  var EDGE = { calls: 'calls', reads: 'reads', writes: 'writes', readwrite: 'reads/writes', publishes: 'publishes', consumes: 'consumes', routes: 'routes', uses: 'uses', mounts: 'mounts', config: 'config', depends: 'depends on' };

  // Known technology words -> kind + nice label
  var TECH = [
    [/\b(react(?:\.?js)?|vue(?:\.?js)?|angular|svelte|next\.?js|nuxt|web ?app|website|web front-?end|front-?end|spa|single[- ]page app|browser|portal)\b/i, 'web'],
    [/\b(ios|android|mobile app|mobile|flutter|react native)\b/i, 'mobile'],
    [/\b(users?|customers?|clients?|admins?|staff)\b/i, 'user'],
    [/\b(cdn|cloudfront|cloudflare|akamai|fastly)\b/i, 'cdn'],
    [/\b(api[- ]?gateway|gateway|kong|apigee|bff|backend for frontend)\b/i, 'gateway'],
    [/\b(load[- ]?balancer|alb|elb|haproxy)\b/i, 'lb'],
    [/\b(nginx|traefik|envoy|reverse proxy|caddy|ingress)\b/i, 'proxy'],
    [/\b(postgres(?:ql)?|mysql|mariadb|mongo(?:db)?|dynamo(?:db)?|sql server|mssql|oracle|cockroach(?:db)?|cassandra|sqlite|aurora|firestore|supabase|database|db)\b/i, 'database'],
    [/\b(redis|memcached?|valkey|cache)\b/i, 'cache'],
    [/\b(kafka|rabbitmq|rabbit|sqs|sns|pub\/?sub|nats|kinesis|event ?bus|eventbridge|service bus|message queue|queue|stream|topic|celery)\b/i, 'queue'],
    [/\b(s3|blob storage|gcs|object storage|bucket|minio)\b/i, 'storage'],
    [/\b(elastic(?:search)?|opensearch|solr|algolia|meilisearch)\b/i, 'search'],
    [/\b(stripe|paypal|twilio|sendgrid|mailgun|auth0|okta|cognito|firebase|openai|salesforce|xero|shopify|google maps|slack|segment|sentry|datadog|square|braintree|adyen|zendesk|hubspot|mailchimp|postmark)\b/i, 'external'],
    [/\b(lambda|cloud functions?|azure functions?|serverless function)\b/i, 'function'],
    [/\b(workers?|consumers?|cron|scheduler|job runner|jobs)\b/i, 'worker']
  ];
  function kindOf(text) { for (var i = 0; i < TECH.length; i++) if (TECH[i][0].test(text)) return TECH[i][1]; return null; }
  function slug(s) { var x = String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); return /^[a-z]/.test(x) ? x : 'n_' + x; }
  function cap(s) { s = String(s).trim(); return /^[a-z][A-Z]/.test(s) ? s : s.charAt(0).toUpperCase() + s.slice(1); }
  function Model() { this.nodes = []; this.edges = []; this.idx = {}; this.warnings = []; }
  Model.prototype.node = function (id, label, kind, extra) {
    id = slug(id); var n = this.idx[id];
    if (!n) { n = { id: id, label: label, kind: kind || 'service', layer: KIND[kind || 'service'].layer, meta: [] }; this.idx[id] = n; this.nodes.push(n); }
    else if (kind && (n.kind === 'service' && kind !== 'service' || !n.kind)) { n.kind = kind; n.layer = KIND[kind].layer; }
    if (extra) Object.keys(extra).forEach(function (k) { if (k === 'meta') n.meta = n.meta.concat(extra.meta.filter(function (m) { return n.meta.indexOf(m) < 0; })); else n[k] = extra[k]; });
    return n;
  };
  Model.prototype.edge = function (from, to, type, label) {
    from = slug(from); to = slug(to); if (from === to || !this.idx[from] || !this.idx[to]) return;
    var dup = this.edges.filter(function (e) { return e.from === from && e.to === to && e.type === type; })[0]; if (dup) return dup;
    var e = { from: from, to: to, type: type || 'calls', label: label || EDGE[type] || type }; this.edges.push(e); return e;
  };
  Model.prototype.done = function () { return { nodes: this.nodes, edges: this.edges, warnings: this.warnings }; };

  // ---------- (a) plain-English description ----------
  var VERBS = [
    [/\b(sends? (?:e-?mails?|sms|texts?|push notifications?|notifications?|messages?) (?:via|through|with|using)|(?:pays|charges?|bills?) (?:through|via|with|using)|logs? in (?:through|via|with))\b/i, 'calls'],
    [/\b(publish(?:es|ing)?|emits?|produces?|pushes?|sends? (?:events?|messages?) (?:to|into|through|via)|events? (?:go|goes|flow|are sent) (?:through|via|to|into)|go(?:es)? through|via|through)\b/i, 'publishes'],
    [/\b(consumes?|subscribes? to|listens? (?:to|on)|reads? (?:events|messages) from|pulls? from|picks? up from)\b/i, 'consumes'],
    [/\b(writes? to|stores? (?:data |files |them |it |\w+ )?in|saves? (?:\w+ )?to|persists? to|inserts? into|uploads? (?:\w+ )?to|puts? (?:files )?in)\b/i, 'writes'],
    [/\b(reads? from|queries|looks? up|fetches from|loads? from)\b/i, 'reads'],
    [/\b(uses?|backed by|on top of|talks? to (?:its|a|the) (?:db|database))\b/i, 'uses'],
    [/\b(routes? (?:requests )?to|forwards? to|proxies (?:to)?|load[- ]balances (?:across|to)|fronts?|sits in front of)\b/i, 'routes'],
    [/\b(calls?|talks? to|hits?|requests?|connects? to|invokes?|sends? requests to|integrates with|goes to|posts to|depends on|authenticates (?:with|via|against)|charges? (?:through|via|with)|notif(?:y|ies) (?:via|through|with))\b/i, 'calls']
  ];
  // Find component mentions in a clause -> [{id,label,kind,start,end}]
  function mentions(clause, known) {
    var out = [], m, taken = [];
    function free(a, b) { return !taken.some(function (t) { return a < t[1] && b > t[0]; }); }
    function push(label, kind, a, b) { if (!free(a, b)) return; taken.push([a, b]); out.push({ label: label, kind: kind, start: a, end: b }); }
    // "orders and payments services" -> two services
    var re = /\b((?:[a-z][\w-]*,\s*)*[a-z][\w-]*(?:,?\s+and\s+[a-z][\w-]*))\s+(services|workers|apis|databases|dbs|queues|lambdas|functions)\b/gi;
    while ((m = re.exec(clause))) {
      var names = m[1].split(/\s*,\s*|\s+and\s+/).filter(Boolean), kindW = m[2].toLowerCase(), k = /work/.test(kindW) ? 'worker' : /data|db/.test(kindW) ? 'database' : /queue/.test(kindW) ? 'queue' : /lambda|function/.test(kindW) ? 'function' : 'service';
      var pos = m.index;
      names.forEach(function (nm) { var at = clause.indexOf(nm, pos); push(cap(nm) + ' ' + (k === 'service' ? 'service' : k === 'database' ? 'DB' : k), k, at, at + nm.length); pos = at + nm.length; });
      taken.push([m.index, m.index + m[0].length]);
    }
    // "<name> service|worker|api|db|queue|bucket|cache|app"
    re = /\b((?:the |a |an |our |its |their )?)([A-Za-z][\w.-]*(?:\s+[A-Za-z][\w.-]*)?)\s+(service|microservice|worker|api|db|database|queue|topic|bucket|cache|app|application|function|lambda|gateway|frontend|front-end|backend|back-end|server|cluster|store|indexer|processor|scheduler|crawler|consumer|producer|poller|aggregator|handler|engine|bot|job)\b/gi;
    while ((m = re.exec(clause))) {
      var name = m[2], type = m[3].toLowerCase(), words = name.split(/\s+/);
      if (/^(which|that|then|and|it|to|from|the|a|an|with|via|through|into|in|on|calls?|uses?|routes?|reads?|writes?|sends?|talks?)$/i.test(words[0])) { words.shift(); name = words.join(' '); }
      if (!name || /^(which|that|then|and|it|to|from|the|a|an|with|via|through|into|in|on|calls?|uses?|routes?|reads?|writes?|sends?|talks?)$/i.test(words[words.length - 1] || '')) { re.lastIndex = m.index + 1; continue; }
      var a = m.index + m[1].length + m[0].slice(m[1].length).indexOf(name), tk = kindOf(name + ' ' + type) || 'service';
      if (/^(db|database|store)$/.test(type) || /^(postgres|mysql|mongo)/i.test(name)) tk = 'database';
      else if (/^(queue|topic)$/.test(type)) tk = 'queue'; else if (type === 'bucket') tk = 'storage'; else if (type === 'cache') tk = 'cache';
      else if (/^(worker|indexer|processor|scheduler|crawler|consumer|producer|poller|aggregator|handler|bot|job)$/.test(type)) tk = 'worker'; else if (/^(function|lambda)$/.test(type)) tk = 'function'; else if (type === 'gateway') tk = 'gateway';
      else if (/^(app|application|frontend|front-end)$/.test(type)) tk = kindOf(name) === 'mobile' || /mobile|ios|android/i.test(name) ? 'mobile' : 'web';
      else if (tk === 'user' || tk === 'web' && type !== 'app') tk = 'service';
      var lbl = /^(api|db|app|cache|queue|bucket|gateway|worker|service|function)$/.test(type) ? cap(name) + ' ' + (type === 'db' ? 'DB' : type === 'api' ? 'API' : type) : cap(name + ' ' + type);
      if (tk === 'external' || tk === 'database' && /^(postgres|mysql|mongo)/i.test(name) && type === 'database') lbl = cap(name);
      push(lbl, tk, a, m.index + m[0].length);
    }
    // bare technology names (Postgres, Kafka, Stripe, React web app)
    TECH.forEach(function (t) {
      var r = new RegExp(t[0].source, 'gi'), mm;
      while ((mm = r.exec(clause))) {
        var w = mm[0];
        if (t[1] === 'user' && !/^(users?|customers?|admins?|staff)$/i.test(w)) continue;
        if (/^(db|database|queue|stream|topic|cache|gateway|front-?end|portal|jobs|workers?|consumers?|mobile|ingress|bucket)$/i.test(w) && !/^(the |a |an |our )$/i.test(clause.slice(Math.max(0, mm.index - 4), mm.index)) && t[1] !== 'gateway') continue;
        push(niceTech(w, t[1]), t[1], mm.index, mm.index + w.length);
      }
    });
    // short names of components already seen ("orders" -> Orders service)
    (known || []).forEach(function (k) {
      var r = new RegExp('\\b' + k.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), mm;
      while ((mm = r.exec(clause))) push(k.label, k.kind, mm.index, mm.index + mm[0].length);
    });
    out.sort(function (a, b) { return a.start - b.start; });
    // "Next.js website", "Postgres database" -> one component
    for (var i = out.length - 1; i > 0; i--) {
      var a = out[i - 1], b = out[i];
      if (/^\s+$/.test(clause.slice(a.end, b.start)) && a.kind !== 'user' && b.kind !== 'user') {
        var kind = a.kind === b.kind ? a.kind : (b.kind === 'service' ? a.kind : b.kind);
        out.splice(i - 1, 2, { label: a.label + ' ' + b.label.charAt(0).toLowerCase() + b.label.slice(1), kind: kind, start: a.start, end: b.end });
      }
    }
    return out;
  }
  function niceTech(w, kind) {
    var map = { postgres: 'Postgres', postgresql: 'Postgres', mysql: 'MySQL', mongodb: 'MongoDB', mongo: 'MongoDB', dynamodb: 'DynamoDB', redis: 'Redis', kafka: 'Kafka', rabbitmq: 'RabbitMQ', rabbit: 'RabbitMQ', sqs: 'SQS', sns: 'SNS', s3: 'S3', stripe: 'Stripe', twilio: 'Twilio', sendgrid: 'SendGrid', auth0: 'Auth0', nginx: 'nginx', cdn: 'CDN', elasticsearch: 'Elasticsearch', react: 'React web app', 'react.js': 'React web app', vue: 'Vue web app', angular: 'Angular web app', ios: 'iOS app', android: 'Android app', users: 'Users', user: 'Users', customers: 'Customers', customer: 'Customers', 'api gateway': 'API gateway', 'api-gateway': 'API gateway', gateway: 'API gateway', 'load balancer': 'Load balancer', cloudfront: 'CloudFront', cloudflare: 'Cloudflare', lambda: 'Lambda', openai: 'OpenAI', xero: 'Xero', 'web app': 'Web app', website: 'Website', 'mobile app': 'Mobile app', browser: 'Browser', admins: 'Admins', staff: 'Staff' };
    var k = w.toLowerCase(); return map[k] || cap(w);
  }
  function verbBetween(text) { for (var i = 0; i < VERBS.length; i++) if (VERBS[i][0].test(text)) return VERBS[i][1]; return null; }
  function parseDescription(text) {
    var M = new Model(), lastSubs = [], lastObjs = [];
    var sentences = String(text || '').replace(/\r/g, '').split(/(?:[.;!?]+(?=\s|$)\s*|\n+\s*|,\s*(?:and\s+)?(?=then\b)|\s+then\s+)/i).map(function (s) { return s.trim(); }).filter(Boolean);
    var PRON_ONE = /^\s*(it|this|this service|that service|he|she)\b/i, PRON_MANY = /^\s*(they|both|these|those|each|all of them|both of them)\b/i;
    sentences.forEach(function (sent) {
      var known = [];
      M.nodes.forEach(function (n) { var w = n.label.split(' '); if (w.length > 1 && /^(service|worker|API|DB|app|queue|cache|function|bucket)$/i.test(w[w.length - 1])) known.push({ alias: w.slice(0, -1).join(' '), label: n.label, kind: n.kind }); });
      var ms = mentions(sent, known); if (!ms.length) return;
      ms.forEach(function (x) { x.id = M.node(x.label, x.label, x.kind).id; });
      var head = sent.slice(0, ms[0].start), subs = null, startAt = 0, hv = verbBetween(head);
      if (PRON_MANY.test(head) && (lastObjs.length > 1 || lastSubs.length)) subs = lastObjs.length > 1 ? lastObjs.slice() : lastSubs.slice();
      else if (PRON_ONE.test(head) && lastSubs.length) subs = lastSubs.slice(0, 1);
      else if (/^\s*(which|that)\b/i.test(head) && lastObjs.length) subs = lastObjs.slice(-1);
      else if (/^\s*(events?|messages?|jobs?|notifications?|requests?|traffic|data|orders?|updates?)\b/i.test(head) && lastSubs.length) subs = lastSubs.slice();
      else if (hv) {
        // unknown subject before the verb: "A search indexer consumes from ..." -> new component
        var vm = null; VERBS.some(function (v) { var r = head.match(v[0]); if (r) vm = r; return !!r; });
        var np = head.slice(0, vm ? vm.index : head.length).replace(/^\s*(?:a|an|the|our|then|and|also)\s+/i, '').replace(/[,\s]+$/, '').trim();
        if (np && /^[A-Za-z][\w .-]{1,40}$/.test(np) && np.split(/\s+/).length <= 4) {
          var k = kindOf(np) || (/(?:er|or)s?$/i.test(np) ? 'worker' : 'service'); if (k === 'user' && !/^(users?|customers?|admins?|staff)$/i.test(np)) k = 'service';
          subs = [M.node(cap(np), cap(np), k).id];
        } else subs = lastSubs.length ? lastSubs.slice() : [ms[0].id];
      } else { subs = [ms[0].id]; startAt = 1; }
      var verb = null, objs = [], chain = null, lastTargets = [];
      for (var i = startAt; i < ms.length; i++) {
        var between = sent.slice(i === 0 ? 0 : ms[i - 1].end, ms[i].start), v = verbBetween(between);
        var andJoin = /^\s*(,|and|or|&|,\s*and)\s*(a|an|the|its|their)?\s*$/i.test(between);
        var target = ms[i].id, tk = M.idx[target].kind, tl = M.idx[target].layer;
        if (i > startAt && /\b(which|that|who)\b/i.test(between)) subs = [ms[i - 1].id];
        // "... to a notifications worker" after "through Kafka" -> the worker consumes from Kafka
        if (chain && /^\s*(to|into|onto|and on to|then to)\s*(a|an|the)?\s*$/i.test(between)) { M.edge(chain, target, 'consumes'); objs.push(target); continue; }
        // "calls the backend through Cloudflare" -> caller -> Cloudflare -> backend
        if (/^\s*(through|via|behind|using)\s*(a|an|the|our)?\s*$/i.test(between) && (tl === 'edge') && lastTargets.length) {
          var via = target;
          subs.forEach(function (s) { lastTargets.forEach(function (t) { M.edges = M.edges.filter(function (e) { return !(e.from === s && e.to === t); }); M.edge(s, via, 'calls'); }); });
          lastTargets.forEach(function (t) { M.edge(via, t, 'routes'); }); objs.push(via); continue;
        }
        if (v) verb = v; else if (!andJoin && !verb) verb = 'calls';
        var type = verb;
        if (/^\s*(through|via)\b/i.test(between) || /\b(through|via)\s*(a|an|the)?\s*$/i.test(between) && !/\b(sends?|calls?|routes?)\b/i.test(between)) type = tk === 'queue' ? 'publishes' : 'calls';
        if (type === 'uses' || type === 'calls' || type === 'publishes' && tk !== 'queue') {
          if (tk === 'database' || tk === 'storage') type = 'readwrite'; else if (tk === 'cache' || tk === 'search') type = 'reads'; else if (tk === 'queue') type = 'publishes'; else type = type === 'publishes' ? 'calls' : 'calls';
        }
        if (type === 'routes' && !subs.every(function (s) { return M.idx[s].layer === 'edge'; })) type = 'calls';
        if (!andJoin) lastTargets = [];
        subs.forEach(function (s) {
          if (type === 'consumes') M.edge(target, s, 'consumes');
          else M.edge(s, target, M.idx[s].kind === 'user' && tl === 'client' ? 'uses' : type);
        });
        if (type === 'publishes' && tk === 'queue') chain = target;
        lastTargets.push(target); objs.push(target);
      }
      lastSubs = subs; lastObjs = objs;
    });
    if (!M.nodes.length) M.warnings.push('No components recognised. Try naming things like “orders service”, “Postgres”, “Kafka”, “React web app”.');
    return M.done();
  }

  // ---------- tiny YAML subset parser (block maps/lists, flow [..] and {..}, quotes, comments, multi-doc) ----------
  function yamlScalar(v) {
    v = v.trim(); if (v === '') return null;
    if (/^".*"$/.test(v)) { try { return JSON.parse(v); } catch (e) { return v.slice(1, -1); } }
    if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
    if (/^\[.*\]$/.test(v)) return splitFlow(v.slice(1, -1)).map(yamlScalar);
    if (/^\{.*\}$/.test(v)) { var o = {}; splitFlow(v.slice(1, -1)).forEach(function (p) { var i = p.indexOf(':'); if (i > 0) o[p.slice(0, i).trim().replace(/^["']|["']$/g, '')] = yamlScalar(p.slice(i + 1)); }); return o; }
    if (/^(true|yes|on)$/i.test(v)) return true; if (/^(false|no|off)$/i.test(v)) return false; if (/^(null|~)$/i.test(v)) return null;
    if (/^-?\d+(\.\d+)?$/.test(v) && !/^0\d/.test(v)) return +v;
    return v;
  }
  function splitFlow(s) { var out = [], depth = 0, q = null, cur = ''; for (var i = 0; i < s.length; i++) { var c = s[i]; if (q) { cur += c; if (c === q) q = null; continue; } if (c === '"' || c === "'") { q = c; cur += c; continue; } if (c === '[' || c === '{') depth++; if (c === ']' || c === '}') depth--; if (c === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += c; } if (cur.trim()) out.push(cur.trim()); return out; }
  function stripComment(line) { var q = null; for (var i = 0; i < line.length; i++) { var c = line[i]; if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i); } return line; }
  function parseYAML(text) {
    var docs = [], cur = [];
    String(text || '').replace(/\r\n?/g, '\n').split('\n').forEach(function (l) { if (/^---\s*$/.test(l) || /^\.\.\.\s*$/.test(l)) { docs.push(cur); cur = []; } else cur.push(l); });
    docs.push(cur);
    return docs.map(parseYAMLDoc).filter(function (d) { return d != null; });
  }
  function parseYAMLDoc(lines) {
    var L = [];
    for (var i = 0; i < lines.length; i++) {
      var raw = stripComment(lines[i]); if (!raw.trim()) continue;
      var ind = raw.match(/^ */)[0].length, t = raw.trim();
      // block scalars | and > : gather following more-indented lines
      var bm = t.match(/^(.*?:\s*|-\s+)([|>])[-+]?\s*$/);
      if (bm) { var body = []; for (var j = i + 1; j < lines.length && (!lines[j].trim() || lines[j].match(/^ */)[0].length > ind); j++) body.push(lines[j].trim()); i = j - 1; L.push({ ind: ind, t: bm[1] + JSON.stringify(body.join(bm[2] === '|' ? '\n' : ' ')) }); continue; }
      L.push({ ind: ind, t: t });
    }
    if (!L.length) return null;
    var pos = 0;
    function block(ind) {
      if (pos >= L.length) return null;
      if (/^-(\s|$)/.test(L[pos].t)) return list(L[pos].ind);
      return map(L[pos].ind);
    }
    function keyVal(t) { var m = t.match(/^("[^"]*"|'[^']*'|[^:]+?)\s*:(?:\s+(.*)|\s*$)/); return m ? { k: m[1].replace(/^["']|["']$/g, ''), v: m[2] == null ? '' : m[2] } : null; }
    function map(ind) {
      var o = {};
      while (pos < L.length && L[pos].ind === ind && !/^-(\s|$)/.test(L[pos].t)) {
        var kv = keyVal(L[pos].t); pos++;
        if (!kv) continue;
        if (kv.v.trim() !== '') o[kv.k] = yamlScalar(kv.v);
        else if (pos < L.length && (L[pos].ind > ind || L[pos].ind === ind && /^-(\s|$)/.test(L[pos].t))) o[kv.k] = block(L[pos].ind);
        else o[kv.k] = null;
      }
      return o;
    }
    function list(ind) {
      var a = [];
      while (pos < L.length && L[pos].ind === ind && /^-(\s|$)/.test(L[pos].t)) {
        var rest = L[pos].t.replace(/^-\s*/, '');
        if (!rest) { pos++; a.push(pos < L.length && L[pos].ind > ind ? block(L[pos].ind) : null); continue; }
        var kv = keyVal(rest);
        if (kv && !/^["']/.test(rest) && !/^\{/.test(rest)) {
          // "- key: value" starts a map whose other keys are indented to the key's column
          var col = ind + (L[pos].t.length - rest.length); L[pos] = { ind: col, t: rest };
          a.push(map(col));
        } else { a.push(yamlScalar(rest)); pos++; }
      }
      return a;
    }
    var out = block(L[0].ind);
    return out;
  }

  // ---------- (b) docker-compose ----------
  function guessKind(name, image) {
    var s = (image || '') + ' ' + name, k = kindOf(String(image || '').split(/[:@]/)[0].split('/').pop() || '') || kindOf(name);
    if (/postgres|mysql|mariadb|mongo|mssql|cockroach|cassandra|couchdb|neo4j|clickhouse/i.test(s)) return 'database';
    if (/redis|memcached|valkey/i.test(s)) return 'cache';
    if (/kafka|zookeeper|rabbitmq|nats|activemq|localstack|redpanda/i.test(s)) return 'queue';
    if (/minio|azurite/i.test(s)) return 'storage';
    if (/elasticsearch|opensearch|meilisearch|solr/i.test(s)) return 'search';
    if (/nginx|traefik|caddy|haproxy|envoy/i.test(s)) return 'proxy';
    if (/worker|celery|sidekiq|consumer|cron|scheduler|queue-runner/i.test(name)) return 'worker';
    if (/^(web|frontend|front|ui|client|app-web|site|www)$|frontend|react|angular|vue|next/i.test(name)) return 'web';
    if (/gateway|kong/i.test(s)) return 'gateway';
    if (/mailhog|mailpit|smtp|stripe-mock/i.test(s)) return 'external';
    return k && k !== 'user' && k !== 'mobile' ? k : 'service';
  }
  function listOf(v) { if (!v) return []; if (Array.isArray(v)) return v.map(String); if (typeof v === 'object') return Object.keys(v); return [String(v)]; }
  function parseCompose(text) {
    var M = new Model(), doc;
    try { doc = parseYAML(text)[0]; } catch (e) { M.warnings.push('Could not read the YAML: ' + e.message); return M.done(); }
    var bare = doc && typeof doc === 'object' && Object.keys(doc).length && Object.keys(doc).every(function (k) { return doc[k] && typeof doc[k] === 'object' && (doc[k].image || doc[k].build); });
    var services = doc && (doc.services || (bare ? doc : null));
    if (!services || typeof services !== 'object') { M.warnings.push('No “services:” section found.'); return M.done(); }
    var names = Object.keys(services);
    function link(a, b) {
      var ka = M.idx[slug(a)].kind, k = M.idx[slug(b)].kind;
      if (k === 'queue' && ka === 'worker') return M.edge(b, a, 'consumes');
      M.edge(a, b, k === 'database' ? 'readwrite' : k === 'cache' ? 'reads' : k === 'queue' ? 'publishes' : 'calls');
    }
    var netCount = doc.networks && typeof doc.networks === 'object' ? Object.keys(doc.networks).length : 0;
    names.forEach(function (n) {
      var s = services[n] || {}, kind = guessKind(n, s.image), meta = [];
      if (s.image) meta.push(String(s.image)); else if (s.build) meta.push('build: ' + (typeof s.build === 'string' ? s.build : s.build.context || '.'));
      var ports = listOf(s.ports).map(function (p) { return String(typeof p === 'object' ? (p.published + ':' + p.target) : p); });
      if (ports.length) meta.push('ports ' + ports.join(', '));
      if (netCount > 1 && listOf(s.networks).length) meta.push('net: ' + listOf(s.networks).join(', '));
      M.node(n, n, kind, { meta: meta, ports: ports, networks: listOf(s.networks), image: s.image || '' });
    });
    names.forEach(function (n) {
      var s = services[n] || {};
      listOf(s.depends_on).concat(listOf(s.links).map(function (l) { return l.split(':')[0]; })).forEach(function (d) {
        if (!services[d]) return; link(n, d);
      });
      // hostnames in environment values (DATABASE_URL=postgres://db:5432)
      var env = s.environment, vals = Array.isArray(env) ? env.map(function (x) { return String(x).split('=').slice(1).join('='); }) : env && typeof env === 'object' ? Object.keys(env).map(function (k) { return String(env[k]); }) : [];
      vals.forEach(function (v) { names.forEach(function (o) { if (o !== n && new RegExp('(?:^|[/@=:,\\s])' + o.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '(?::\\d+|/|$|,)').test(v)) link(n, o); }); });
      // named volumes
      listOf(s.volumes).forEach(function (v) {
        var src = typeof v === 'object' ? v.source : String(v).split(':')[0];
        if (src && doc.volumes && Object.prototype.hasOwnProperty.call(doc.volumes, src)) { M.node('vol_' + src, src, 'volume', { meta: ['volume'] }); M.edge(n, 'vol_' + src, 'mounts'); }
      });
    });
    // published ports on a web/proxy -> a "Users" node calling them
    var entry = M.nodes.filter(function (x) { return x.ports && x.ports.length && (x.kind === 'proxy' || x.kind === 'web' || x.kind === 'gateway'); });
    if (!entry.length) entry = M.nodes.filter(function (x) { return x.ports && x.ports.length && x.kind === 'service'; });
    if (entry.length) { M.node('users', 'Users', 'user'); entry.forEach(function (x) { M.edge('users', x.id, 'calls', 'HTTP ' + x.ports[0].split(':')[0]); }); }
    var nets = {}; M.nodes.forEach(function (x) { (x.networks || []).forEach(function (nw) { (nets[nw] = nets[nw] || []).push(x.id); }); });
    var groups = Object.keys(nets).filter(function (k) { return Object.keys(nets).length > 1; }).map(function (k) { return { id: 'net_' + slug(k), label: 'network: ' + k, members: nets[k] }; });
    var out = M.done(); out.groups = groups; return out;
  }

  // ---------- (c) Kubernetes manifests ----------
  function parseK8s(text) {
    var M = new Model(), docs;
    try { docs = parseYAML(text); } catch (e) { M.warnings.push('Could not read the YAML: ' + e.message); return M.done(); }
    var items = []; docs.forEach(function (d) { if (d && d.kind === 'List' && Array.isArray(d.items)) items = items.concat(d.items); else if (d && d.kind) items.push(d); });
    var workloads = [], services = [];
    items.forEach(function (o) {
      var name = (o.metadata && o.metadata.name) || 'unnamed', k = o.kind;
      if (/^(Deployment|StatefulSet|DaemonSet|Job|CronJob|ReplicaSet|Pod)$/.test(k)) {
        var spec = k === 'CronJob' ? (((o.spec || {}).jobTemplate || {}).spec || {}) : (o.spec || {});
        var tpl = k === 'Pod' ? o : (spec.template || {}), pod = (tpl.spec || {}), labels = ((tpl.metadata || {}).labels) || ((o.metadata || {}).labels) || {};
        var containers = (pod.containers || []), img = containers.map(function (c) { return c.image; }).filter(Boolean);
        var kind = guessKind(name, img.join(' ')); if (kind === 'service' && /Job|CronJob/.test(k)) kind = 'worker';
        var n = M.node(k + '_' + name, name, kind, { meta: [k + (spec.replicas ? ' ×' + spec.replicas : '')].concat(img), labels: labels });
        workloads.push(n);
        // config references
        var refs = [];
        containers.forEach(function (c) {
          (c.envFrom || []).forEach(function (e) { if (e.configMapRef) refs.push(['ConfigMap', e.configMapRef.name]); if (e.secretRef) refs.push(['Secret', e.secretRef.name]); });
          (c.env || []).forEach(function (e) { var vf = e.valueFrom || {}; if (vf.configMapKeyRef) refs.push(['ConfigMap', vf.configMapKeyRef.name]); if (vf.secretKeyRef) refs.push(['Secret', vf.secretKeyRef.name]); });
        });
        (pod.volumes || []).forEach(function (v) { if (v.configMap) refs.push(['ConfigMap', v.configMap.name]); if (v.secret) refs.push(['Secret', v.secret.secretName]); if (v.persistentVolumeClaim) refs.push(['PVC', v.persistentVolumeClaim.claimName]); });
        n.refs = refs;
        n.envText = JSON.stringify(containers.map(function (c) { return c.env || []; }));
      } else if (k === 'Service') {
        var sp = o.spec || {}, ports = (sp.ports || []).map(function (p) { return p.port + (p.targetPort ? '→' + p.targetPort : ''); });
        var sn = M.node('Service_' + name, name, 'k8sservice', { meta: ['Service' + (sp.type && sp.type !== 'ClusterIP' ? ' (' + sp.type + ')' : '')].concat(ports.length ? ['port ' + ports.join(', ')] : []), selector: sp.selector || {}, svcType: sp.type || 'ClusterIP', svcName: name });
        services.push(sn);
      } else if (k === 'Ingress') {
        var rules = ((o.spec || {}).rules || []), backends = [], hosts = [];
        var def = (o.spec || {}).defaultBackend || (o.spec || {}).backend; if (def) backends.push({ svc: def.service ? def.service.name : def.serviceName, path: '/' });
        rules.forEach(function (r) { if (r.host) hosts.push(r.host); (((r.http || {}).paths) || []).forEach(function (p) { var b = p.backend || {}; backends.push({ svc: b.service ? b.service.name : b.serviceName, path: p.path || '/', host: r.host }); }); });
        M.node('Ingress_' + name, name, 'ingress', { meta: ['Ingress'].concat(hosts), backends: backends });
      } else if (k === 'ConfigMap' || k === 'Secret') {
        M.node(k + '_' + name, name, 'config', { meta: [k] });
      } else if (k === 'PersistentVolumeClaim') {
        M.node('PVC_' + name, name, 'volume', { meta: ['PersistentVolumeClaim'] });
      } else if (k === 'HorizontalPodAutoscaler') {
        var t = ((o.spec || {}).scaleTargetRef || {}); M.warnings.push('Autoscaler ' + name + ' scales ' + t.kind + ' ' + t.name + '.');
      }
    });
    // Service -> workloads by selector
    services.forEach(function (s) {
      var sel = s.selector, keys = Object.keys(sel || {}); if (!keys.length) return;
      var hits = workloads.filter(function (w) { return keys.every(function (k) { return String((w.labels || {})[k]) === String(sel[k]); }); });
      if (!hits.length) M.warnings.push('Service ' + s.label + ' selects ' + keys.map(function (k) { return k + '=' + sel[k]; }).join(', ') + ' but no workload has those labels.');
      hits.forEach(function (w) { M.edge(s.id, w.id, 'routes'); });
      if (s.svcType === 'LoadBalancer' || s.svcType === 'NodePort') { M.node('users', 'Users', 'user'); M.edge('users', s.id, 'calls', s.svcType); }
    });
    // Ingress -> Service
    M.nodes.filter(function (n) { return n.kind === 'ingress'; }).forEach(function (ing) {
      M.node('users', 'Users', 'user'); M.edge('users', ing.id, 'calls', 'HTTPS');
      (ing.backends || []).forEach(function (b) { if (!b.svc) return; var t = 'Service_' + b.svc; if (!M.idx[slug(t)]) { M.node(t, b.svc, 'k8sservice', { meta: ['Service (not in these files)'] }); } M.edge(ing.id, t, 'routes', b.path && b.path !== '/' ? b.path : 'routes'); });
    });
    // workloads -> config, and workload -> service when env mentions the service's DNS name
    workloads.forEach(function (w) {
      (w.refs || []).forEach(function (r) { var id = (r[0] === 'PVC' ? 'PVC_' : r[0] + '_') + r[1]; if (!M.idx[slug(id)]) M.node(id, r[1], r[0] === 'PVC' ? 'volume' : 'config', { meta: [r[0] + ' (not in these files)'] }); M.edge(w.id, id, r[0] === 'PVC' ? 'mounts' : 'config'); });
      services.forEach(function (s) {
        if (!w.envText || M.edges.some(function (e) { return e.from === s.id && e.to === w.id; })) return;
        if (new RegExp('[/"@:=]' + s.svcName.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '(?:[.:/"]|$)').test(w.envText)) {
          var target = M.edges.filter(function (e) { return e.from === s.id && e.type === 'routes'; }).map(function (e) { return M.idx[e.to]; })[0];
          var tk = target ? target.kind : 'service'; M.edge(w.id, s.id, tk === 'database' ? 'readwrite' : tk === 'queue' ? 'publishes' : 'calls');
        }
      });
    });
    if (!items.length) M.warnings.push('No Kubernetes objects found (each needs “kind:” and “metadata: name:”).');
    return M.done();
  }

  // ---------- (d) folder tree ----------
  function parseTreeLines(text) {
    var out = [], stack = [];
    String(text || '').replace(/\r/g, '').split('\n').forEach(function (line) {
      if (!line.trim() || /^\d+ director(?:y|ies)/.test(line.trim())) return;
      var m = line.match(/^((?:[│| ]   |    |\t|  )*)(?:[├└|`]──\s?|[├└|`]--\s?)?(.*)$/), prefix = m[1] || '', name = m[2].trim();
      if (!name) return;
      var depth = Math.round(prefix.replace(/\t/g, '    ').length / 4) + (/[├└`]/.test(line) || /^\|--/.test(line.trim()) ? 1 : 0);
      if (!/[├└`]|\|--/.test(line)) depth = Math.floor((line.match(/^\s*/)[0].replace(/\t/g, '    ').length) / 2);
      name = name.replace(/\/$/, '');
      stack = stack.slice(0, depth); stack[depth] = name;
      out.push({ depth: depth, name: name, path: stack.filter(Boolean).join('/') });
    });
    // first line "." or a root name with deeper children
    if (out.length > 1 && out[0].depth === 0 && out.slice(1).every(function (x) { return x.depth > 0; })) { var r = out[0].name; out = out.slice(1).map(function (x) { return { depth: x.depth - 1, name: x.name, path: x.path.replace(new RegExp('^' + r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/'), '') }; }); }
    return out;
  }
  function parseTree(text) {
    var M = new Model(), items = parseTreeLines(text), paths = items.map(function (x) { return x.path.toLowerCase(); });
    function hasPath(re) { return paths.filter(function (p) { return re.test(p); }); }
    function top(p) { return p.split('/')[0]; }
    var fe = [], be = [], workers = [], mobiles = [], dbs = [], infra = [];
    function addDir(list, dir) { if (list.indexOf(dir) < 0) list.push(dir); }
    items.forEach(function (it) {
      var p = it.path.toLowerCase(), parts = p.split('/'), name = parts[parts.length - 1];
      var unit = parts.length > 1 && /^(apps|services|packages|src|modules|microservices|projects|cmd|functions|lambdas)$/.test(parts[0]) ? parts.slice(0, 2).join('/') : parts[0];
      if (it.depth > 3) return;
      if (/(^|\/)(migrations?|db\/migrate|alembic|flyway|liquibase|prisma|schema\.sql|sql)($|\/)/.test(p)) addDir(dbs, unit);
      if (/(^|\/)(terraform|infra|infrastructure|k8s|kubernetes|helm|charts|deploy|deployment|ansible|pulumi|cdk|\.github\/workflows|docker-compose\.ya?ml|dockerfile)($|\/)/.test(p)) addDir(infra, parts[0]);
      if (/(^|\/)(ios|android|mobile)$/.test(name) && it.depth <= 1) addDir(mobiles, unit);
      if (/(^|\/)(worker|workers|jobs|queue|consumer|consumers|cron|scheduler)s?$/.test(name) && it.depth <= 2) addDir(workers, unit === parts[0] && it.depth <= 1 ? p : unit);
      if (/^(web|frontend|front-end|client|ui|webapp|site|www|dashboard|admin|portal)$/.test(name) && it.depth <= 1) addDir(fe, unit === parts[0] && it.depth === 1 ? p : unit);
      else if (/^(package\.json|next\.config\.[jt]s|vite\.config\.[jt]s|angular\.json|index\.html)$/.test(name) && hasPath(new RegExp('^' + parts.slice(0, -1).join('/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/(src/)?(components|pages|app|public)')).length) addDir(fe, parts.slice(0, -1).join('/') || '.');
      if (/^(api|server|backend|back-end|service|services|app|core)$/.test(name) && it.depth <= 1 && !/^(web|frontend|client|ui)/.test(parts[0])) addDir(be, it.depth === 1 && /^(apps|services|packages|src)$/.test(parts[0]) ? p : parts[0]);
      else if (/^(go\.mod|requirements\.txt|pyproject\.toml|pom\.xml|build\.gradle|gemfile|composer\.json|cargo\.toml|main\.go|manage\.py|app\.py|server\.[jt]s)$/.test(name) && parts.length >= 2 && parts.length <= 3 && /^(apps|services|packages|cmd)$/.test(parts[0])) addDir(be, parts.slice(0, 2).join('/'));
    });
    // "services/orders" style folders are each a service
    items.filter(function (it) { return it.depth === 1 && /^(services|microservices|apps|packages|functions|lambdas)\//i.test(it.path) && !/\.\w+$/.test(it.name); }).forEach(function (it) {
      var p = it.path.toLowerCase(), n = it.name.toLowerCase();
      if (/^(web|frontend|client|ui|webapp|site|dashboard|admin|portal)$/.test(n)) addDir(fe, p); else if (/^(ios|android|mobile)$/.test(n)) addDir(mobiles, p); else if (/worker|jobs|consumer|cron/.test(n)) addDir(workers, p); else if (!/^(shared|common|lib|libs|utils|config|types|ui-kit|design-system|docs|scripts|tools)$/.test(n)) addDir(be, p);
    });
    var units = fe.concat(workers, mobiles);
    // keep the most specific folders: drop "services" when "services/orders" is there
    be = be.filter(function (b) { return units.indexOf(b) < 0 && !be.concat(units).some(function (o) { return o !== b && o.indexOf(b + '/') === 0; }); });
    function lbl(p) { var w = p.split('/'); return w[w.length - 1].replace(/[-_]+/g, ' '); }
    fe.forEach(function (p) { M.node('fe_' + p, cap(lbl(p)) + ' (frontend)', /mobile|ios|android/.test(p) ? 'mobile' : 'web', { meta: [p + '/'] }); });
    mobiles.forEach(function (p) { M.node('mob_' + p, cap(lbl(p)) + ' app', 'mobile', { meta: [p + '/'] }); });
    be.forEach(function (p) { M.node('be_' + p, cap(lbl(p)) + (/service|api|server|backend/i.test(lbl(p)) ? '' : ' service'), 'service', { meta: [p + '/'] }); });
    workers.forEach(function (p) { M.node('wk_' + p, cap(lbl(p)) + (/worker/i.test(lbl(p)) ? '' : ' worker'), 'worker', { meta: [p + '/'] }); });
    var dbOwners = dbs.map(function (p) { return p; });
    if (dbs.length) M.node('database', 'Database', 'database', { meta: ['migrations in ' + dbs.map(function (d) { return d + '/'; }).join(', ')] });
    if (infra.length) M.node('infra', 'Infra & deploy', 'infra', { meta: [infra.map(function (p) { return p + (/\./.test(p) ? '' : '/'); }).join(', ')] });
    var beIds = be.map(function (p) { return slug('be_' + p); }), gw = null;
    if (fe.length || mobiles.length) M.node('users', 'Users', 'user');
    if (be.length > 2 && (fe.length || mobiles.length)) { gw = M.node('gateway', 'API gateway (assumed)', 'gateway'); }
    fe.concat(mobiles).forEach(function (p) {
      var id = slug((fe.indexOf(p) >= 0 ? 'fe_' : 'mob_') + p); M.edge('users', id, 'uses');
      if (gw) M.edge(id, gw.id, 'calls'); else beIds.forEach(function (b) { M.edge(id, b, 'calls'); });
    });
    if (gw) beIds.forEach(function (b) { M.edge(gw.id, b, 'routes'); });
    if (dbs.length) {
      var owners = be.filter(function (b) { return dbOwners.some(function (d) { return d === b || d.indexOf(b + '/') === 0 || b.indexOf(d + '/') === 0; }); });
      (owners.length ? owners : be).forEach(function (b) { M.edge('be_' + b, 'database', 'readwrite'); });
      workers.forEach(function (w) { M.edge('wk_' + w, 'database', 'readwrite'); });
    }
    if (workers.length && be.length && !dbs.length) workers.forEach(function (w) { M.edge('be_' + be[0], 'wk_' + w, 'publishes', 'jobs'); });
    if (infra.length) beIds.concat(fe.map(function (f) { return slug('fe_' + f); }), workers.map(function (w) { return slug('wk_' + w); })).slice(0, 8).forEach(function (t) { M.edge('infra', t, 'depends', 'deploys'); });
    if (!M.nodes.length) M.warnings.push('No frontend, backend, worker, database or infra folders recognised. Paste the output of `tree -d -L 3`.');
    return M.done();
  }

  // ---------- Mermaid output ----------
  function mmText(s) { return String(s).replace(/"/g, '#quot;').replace(/[<>]/g, ''); }
  function shape(n, text) {
    var t = '"' + text + '"';
    switch (n.kind) {
      case 'database': return '[(' + t + ')]';
      case 'queue': return '[[' + t + ']]';
      case 'cache': case 'search': return '[(' + t + ')]';
      case 'user': return '([' + t + '])';
      case 'web': case 'mobile': return '(' + t + ')';
      case 'gateway': case 'lb': case 'proxy': case 'ingress': case 'cdn': return '{{' + t + '}}';
      case 'external': return '>' + t + ']';
      case 'config': case 'volume': return '[/' + t + '/]';
      case 'storage': return '[(' + t + ')]';
      default: return '[' + t + ']';
    }
  }
  function arrow(e) {
    var lbl = e.label ? '|' + mmText(e.label) + '|' : '';
    if (e.type === 'publishes' || e.type === 'consumes') return ' -.->' + lbl + ' ';
    if (e.type === 'config' || e.type === 'mounts' || e.type === 'depends') return ' -.->' + lbl + ' ';
    if (e.type === 'routes') return ' ==>' + lbl + ' ';
    return ' -->' + lbl + ' ';
  }
  function toMermaid(model, opts) {
    opts = opts || {};
    if (opts.view === 'c4') return toC4(model, opts);
    var dir = opts.direction || 'LR', icons = opts.icons !== false, o = ['flowchart ' + dir];
    LAYERS.forEach(function (ly) {
      var ns = model.nodes.filter(function (n) { return n.layer === ly.id; }); if (!ns.length) return;
      if (opts.layers !== false) o.push('  subgraph ' + ly.id + '_layer["' + ly.label + '"]', '    direction ' + (dir === 'LR' ? 'TB' : 'LR'));
      ns.forEach(function (n) {
        var text = (icons ? KIND[n.kind].icon + ' ' : '') + mmText(n.label) + (opts.details !== false && n.meta && n.meta.length ? '<br/><small>' + mmText(n.meta.slice(0, 2).join(' · ')).slice(0, 60) + '</small>' : '');
        o.push((opts.layers !== false ? '    ' : '  ') + n.id + shape(n, text));
      });
      if (opts.layers !== false) o.push('  end');
    });
    model.edges.forEach(function (e) { o.push('  ' + e.from + arrow(e) + e.to); });
    o.push('  classDef client fill:#e8f0fe,stroke:#2557d6,color:#1d1f24', '  classDef edge fill:#fdf1e7,stroke:#b4531b,color:#1d1f24', '  classDef service fill:#eef7f0,stroke:#1f7a46,color:#1d1f24', '  classDef data fill:#fff6e0,stroke:#a66300,color:#1d1f24', '  classDef external fill:#f3f1ea,stroke:#5d6270,color:#1d1f24,stroke-dasharray:4 3');
    LAYERS.forEach(function (ly) { var ids = model.nodes.filter(function (n) { return n.layer === ly.id; }).map(function (n) { return n.id; }); if (ids.length) o.push('  class ' + ids.join(',') + ' ' + ly.id); });
    return o.join('\n') + '\n';
  }
  function c4q(s) { return '"' + String(s).replace(/"/g, "'") + '"'; }
  function toC4(model, opts) {
    var title = (opts && opts.title) || 'Container view', o = ['C4Container', '  title ' + title];
    var people = model.nodes.filter(function (n) { return n.kind === 'user'; }), ext = model.nodes.filter(function (n) { return n.layer === 'external'; }), inside = model.nodes.filter(function (n) { return n.kind !== 'user' && n.layer !== 'external'; });
    people.forEach(function (n) { o.push('  Person(' + n.id + ', ' + c4q(n.label) + ')'); });
    if (inside.length) {
      o.push('  System_Boundary(sys, ' + c4q((opts && opts.system) || 'Our system') + ') {');
      inside.forEach(function (n) {
        var tech = c4q((n.meta && n.meta[0]) || KIND[n.kind].label), desc = c4q(KIND[n.kind].label);
        var fn = n.kind === 'database' || n.kind === 'cache' || n.kind === 'storage' || n.kind === 'search' || n.kind === 'volume' ? 'ContainerDb' : n.kind === 'queue' ? 'ContainerQueue' : 'Container';
        o.push('    ' + fn + '(' + n.id + ', ' + c4q(n.label) + ', ' + tech + ', ' + desc + ')');
      });
      o.push('  }');
    }
    ext.forEach(function (n) { o.push('  System_Ext(' + n.id + ', ' + c4q(n.label) + ', ' + c4q(KIND[n.kind].label) + ')'); });
    model.edges.forEach(function (e) { o.push('  Rel(' + e.from + ', ' + e.to + ', ' + c4q(e.label || e.type) + ')'); });
    o.push('  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")');
    return o.join('\n') + '\n';
  }

  // Parse a Mermaid flowchart (the subset we write, plus simple hand edits) back to a model for draw.io export
  function parseMermaid(src) {
    var M = new Model(), layer = null;
    var shapeRe = /^([A-Za-z_][\w-]*)\s*(?:(\[\(|\[\[|\(\[|\{\{|\[\/|\(\(|\(|\[|\{|>)\s*("?)([\s\S]*?)\3\s*(\)\]|\]\]|\]\)|\}\}|\/\]|\)\)|\)|\]|\})?)?$/;
    var kindByShape = { '[(': 'database', '[[': 'queue', '([': 'user', '{{': 'gateway', '[/': 'config', '(': 'web', '>': 'external', '((': 'service', '[': 'service', '{': 'service' };
    function clean(t) { return String(t || '').replace(/<br\s*\/?>[\s\S]*$/i, '').replace(/<[^>]+>/g, '').replace(/#quot;/g, '"').replace(/^\W{1,3}\s+(?=\w)/, '').trim(); }
    function nodeTok(tok) {
      tok = tok.trim(); var m = tok.match(shapeRe); if (!m) return null;
      var id = m[1], n = M.idx[id];
      if (m[2] && m[4] != null) { var k = kindByShape[m[2]] || 'service'; n = M.node(id, clean(m[4]) || id, k); n.id = id; if (layer && KIND[layerKind(layer)]) n.layer = layer; }
      else if (!n) { n = M.node(id, id, 'service'); }
      return n;
    }
    function layerKind(l) { return { client: 'web', edge: 'gateway', service: 'service', data: 'database', external: 'external' }[l] || 'service'; }
    M.node = (function (orig) { return function (id, label, kind) { var key = id; var n = this.idx[key]; if (!n) { n = { id: key, label: label, kind: kind, layer: KIND[kind].layer, meta: [] }; this.idx[key] = n; this.nodes.push(n); } else if (label && label !== key) { n.label = label; n.kind = kind; n.layer = KIND[kind].layer; } return n; }; })(M.node);
    String(src || '').split('\n').forEach(function (line) {
      var l = line.trim(); if (!l || /^(flowchart|graph|classDef|class |style |linkStyle|direction|%%)/.test(l)) return;
      var sg = l.match(/^subgraph\s+([\w-]+)/); if (sg) { var lid = sg[1].replace(/_layer$/, ''); layer = LAYERS.some(function (x) { return x.id === lid; }) ? lid : null; return; }
      if (l === 'end') { layer = null; return; }
      var parts = l.split(/\s*(-\.->|==>|-->|---|-\.-|===)\s*(?:\|([^|]*)\|\s*)?/);
      if (parts.length >= 4) {
        for (var i = 0; i + 3 < parts.length; i += 3) {
          var a = nodeTok(parts[i]), b = nodeTok(parts[i + 3]); if (!a || !b) continue;
          var op = parts[i + 1], lab = parts[i + 2] || '';
          M.edges.push({ from: a.id, to: b.id, type: op === '==>' ? 'routes' : op === '-.->' ? (/consum/.test(lab) ? 'consumes' : 'publishes') : 'calls', label: lab.replace(/#quot;/g, '"') });
        }
      } else nodeTok(l.replace(/:::\w+$/, ''));
    });
    return M.done();
  }

  // ---------- layered layout + draw.io ----------
  function layeredLayout(model, opts) {
    opts = opts || {}; var W = opts.nodeW || 170, H = opts.nodeH || 64, gapX = opts.gapX || 90, gapY = opts.gapY || 36;
    var pos = {}, col = 0;
    LAYERS.forEach(function (ly) {
      var ns = model.nodes.filter(function (n) { return n.layer === ly.id; }); if (!ns.length) return;
      // order by average position of predecessors to reduce crossings
      ns.sort(function (a, b) { return avg(a) - avg(b); });
      ns.forEach(function (n, i) { pos[n.id] = { x: 40 + col * (W + gapX), y: 60 + i * (H + gapY), w: W, h: H, layer: ly.id }; });
      col++;
    });
    function avg(n) { var ps = model.edges.filter(function (e) { return e.to === n.id && pos[e.from]; }).map(function (e) { return pos[e.from].y; }); return ps.length ? ps.reduce(function (s, v) { return s + v; }, 0) / ps.length : 1e6 + model.nodes.indexOf(n); }
    return pos;
  }
  function xmlEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var DRAWIO_STYLE = {
    database: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;size=12;fillColor=#fff2cc;strokeColor=#d6b656;',
    cache: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;size=12;fillColor=#fff2cc;strokeColor=#d6b656;',
    storage: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;size=12;fillColor=#fff2cc;strokeColor=#d6b656;',
    search: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;size=12;fillColor=#fff2cc;strokeColor=#d6b656;',
    queue: 'shape=process;whiteSpace=wrap;html=1;backgroundOutline=1;fillColor=#fff2cc;strokeColor=#d6b656;',
    user: 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;',
    web: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;', mobile: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;',
    gateway: 'shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;size=0.15;fillColor=#ffe6cc;strokeColor=#d79b00;',
    external: 'rounded=0;whiteSpace=wrap;html=1;dashed=1;fillColor=#f5f5f5;strokeColor=#666666;',
    config: 'shape=note;whiteSpace=wrap;html=1;size=12;fillColor=#f5f5f5;strokeColor=#999999;', volume: 'shape=note;whiteSpace=wrap;html=1;size=12;fillColor=#f5f5f5;strokeColor=#999999;'
  };
  function toDrawio(model, positions) {
    var pos = positions || layeredLayout(model), cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
    model.nodes.forEach(function (n) {
      var p = pos[n.id] || { x: 0, y: 0, w: 160, h: 60 };
      var st = DRAWIO_STYLE[n.kind] || (KIND[n.kind] && KIND[n.kind].layer === 'edge' ? DRAWIO_STYLE.gateway : 'rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;');
      var value = xmlEsc(n.label) + (n.meta && n.meta.length ? '&lt;br&gt;&lt;font style=&quot;font-size:10px&quot;&gt;' + xmlEsc(xmlEsc(n.meta.slice(0, 2).join(' · '))) + '&lt;/font&gt;' : '');
      cells.push('<mxCell id="' + xmlEsc(n.id) + '" value="' + value + '" style="' + st + '" vertex="1" parent="1"><mxGeometry x="' + Math.round(p.x) + '" y="' + Math.round(p.y) + '" width="' + Math.round(p.w) + '" height="' + Math.round(p.h) + '" as="geometry"/></mxCell>');
    });
    model.edges.forEach(function (e, i) {
      var dashed = /publishes|consumes|config|mounts|depends/.test(e.type) ? 'dashed=1;' : '';
      cells.push('<mxCell id="e' + i + '" value="' + xmlEsc(e.label || '') + '" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;' + dashed + '" edge="1" parent="1" source="' + xmlEsc(e.from) + '" target="' + xmlEsc(e.to) + '"><mxGeometry relative="1" as="geometry"/></mxCell>');
    });
    return '<mxfile host="Brahaspati" type="device"><diagram id="arch" name="Architecture"><mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="1000" math="0" shadow="0"><root>' + cells.join('') + '</root></mxGraphModel></diagram></mxfile>\n';
  }

  function generate(type, text) {
    return type === 'compose' ? parseCompose(text) : type === 'k8s' ? parseK8s(text) : type === 'tree' ? parseTree(text) : parseDescription(text);
  }
  // Guess which input type some pasted text is
  function detect(text) {
    var t = String(text || '');
    if (/^\s*(apiVersion|kind)\s*:/m.test(t) && /^\s*kind\s*:/m.test(t)) return 'k8s';
    if (/^\s*services\s*:/m.test(t)) return 'compose';
    if (/[├└]──|^\s*\|--|^\.\s*$/m.test(t)) return 'tree';
    return 'text';
  }

  var L = { LAYERS: LAYERS, KIND: KIND, parseYAML: parseYAML, parseDescription: parseDescription, parseCompose: parseCompose, parseK8s: parseK8s, parseTree: parseTree, parseTreeLines: parseTreeLines,
    toMermaid: toMermaid, toC4: toC4, parseMermaid: parseMermaid, layeredLayout: layeredLayout, toDrawio: toDrawio, generate: generate, detect: detect, mentions: mentions };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.ArchDiagramLib = L;
})(this);
