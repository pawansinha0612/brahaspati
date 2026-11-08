/* Architecture Diagram Generator — DOM wiring. Logic lives in lib.js (ArchDiagramLib). */
(function () {
  'use strict';
  var A = window.ArchDiagramLib, $ = B.$, esc = B.esc;
  var MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
  var TYPES = ['text', 'compose', 'k8s', 'tree'];
  var state = Object.assign({ type: 'text', inputs: {}, view: 'layers', dir: 'LR', icons: true, details: true, fit: true }, B.store.get('arch:state', {}));
  var model = null, generated = '', renderSeq = 0, lastSvg = '';

  var SAMPLES = {
    text: 'React web app calls an API gateway which routes to orders and payments services; orders uses Postgres; payments calls Stripe; events go through Kafka to a notifications worker.\nThe orders service caches product prices in Redis. Customers use the React web app and an iOS app. The iOS app calls the API gateway.',
    compose: 'services:\n  web:\n    build: ./frontend\n    ports:\n      - "3000:3000"\n    depends_on:\n      - api\n  api:\n    image: node:20-alpine\n    ports: ["8080:8080"]\n    environment:\n      DATABASE_URL: postgres://app:secret@db:5432/app\n      REDIS_URL: redis://cache:6379\n      AMQP_URL: amqp://rabbit:5672\n    depends_on:\n      db:\n        condition: service_healthy\n      cache:\n        condition: service_started\n    networks: [front, back]\n  worker:\n    build:\n      context: ./worker\n    environment:\n      - QUEUE_URL=amqp://rabbit:5672\n      - DATABASE_URL=postgres://db/app\n    depends_on: [rabbit, db]\n    networks:\n      - back\n  db:\n    image: postgres:16\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n    networks: [back]\n  cache:\n    image: redis:7\n    networks: [back]\n  rabbit:\n    image: rabbitmq:3-management\n    networks: [back]\n  mailpit:\n    image: axllent/mailpit\n    ports: ["8025:8025"]\nvolumes:\n  pgdata:\nnetworks:\n  front:\n  back:\n',
    k8s: 'apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: shop-ingress\nspec:\n  rules:\n    - host: shop.example.com\n      http:\n        paths:\n          - path: /api\n            pathType: Prefix\n            backend:\n              service:\n                name: api-svc\n                port:\n                  number: 80\n          - path: /\n            pathType: Prefix\n            backend:\n              service:\n                name: web-svc\n                port:\n                  number: 80\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: web-svc\nspec:\n  selector:\n    app: web\n  ports:\n    - port: 80\n      targetPort: 3000\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: api-svc\nspec:\n  selector:\n    app: api\n  ports:\n    - port: 80\n      targetPort: 8080\n---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n        - name: web\n          image: ghcr.io/example/web:2.0.0\n---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\nspec:\n  replicas: 3\n  selector:\n    matchLabels:\n      app: api\n  template:\n    metadata:\n      labels:\n        app: api\n    spec:\n      containers:\n        - name: api\n          image: ghcr.io/example/api:1.4.2\n          envFrom:\n            - configMapRef:\n                name: api-config\n          env:\n            - name: DB_HOST\n              value: postgres-svc\n            - name: DB_PASSWORD\n              valueFrom:\n                secretKeyRef:\n                  name: db-secret\n                  key: password\n---\napiVersion: apps/v1\nkind: StatefulSet\nmetadata:\n  name: postgres\nspec:\n  serviceName: postgres-svc\n  template:\n    metadata:\n      labels:\n        app: postgres\n    spec:\n      containers:\n        - name: postgres\n          image: postgres:16\n      volumes:\n        - name: data\n          persistentVolumeClaim:\n            claimName: pg-data\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: postgres-svc\nspec:\n  selector:\n    app: postgres\n  ports:\n    - port: 5432\n---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: api-config\ndata:\n  LOG_LEVEL: info\n',
    tree: '.\n├── apps\n│   ├── web\n│   │   ├── package.json\n│   │   └── src\n│   │       └── components\n│   └── mobile\n├── services\n│   ├── orders\n│   │   ├── go.mod\n│   │   └── migrations\n│   ├── payments\n│   │   └── requirements.txt\n│   └── notifications-worker\n├── infra\n│   ├── terraform\n│   └── k8s\n├── docker-compose.yml\n└── README.md\n\n12 directories, 5 files'
  };

  function save() { B.store.set('arch:state', state); }
  TYPES.forEach(function (t) {
    var ta = $('#in-' + t); ta.value = state.inputs[t] || '';
    ta.addEventListener('input', function () { state.inputs[t] = ta.value; save(); });
  });
  $('#view').value = state.view; $('#dir').value = state.dir; $('#icons').checked = state.icons; $('#details').checked = state.details; $('#fit').checked = state.fit;
  $('#diagram').classList.toggle('fit', state.fit);
  var showTab = B.tabs($('[data-tabs="ad"]'), function (id) { state.type = id; save(); });

  function opts() { return { view: $('#view').value, direction: $('#dir').value, icons: $('#icons').checked, details: $('#details').checked }; }
  function status(t) { $('#status').textContent = t || ''; }

  function generate() {
    var t = state.type, text = $('#in-' + t).value;
    if (!text.trim()) { B.toast('Paste or type something first — or load the sample'); return; }
    var guess = A.detect(text);
    model = A.generate(t, text);
    var w = model.warnings.slice();
    if (guess !== t && guess !== 'text' && !model.nodes.length) w.unshift('This looks like ' + { compose: 'a docker-compose file', k8s: 'Kubernetes YAML', tree: 'a folder tree' }[guess] + ' — try the matching tab.');
    $('#warnings').innerHTML = w.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
    if (!model.nodes.length) { $('#out').hidden = true; return; }
    generated = A.toMermaid(model, opts());
    $('#src').value = generated; $('#srcErr').textContent = '';
    renderFound();
    $('#out').hidden = false;
    render(generated);
  }
  function renderFound() {
    var by = {}; model.nodes.forEach(function (n) { by[n.id] = n; });
    $('#found').innerHTML = '<p class="small" style="margin:0">' + model.nodes.length + ' components, ' + model.edges.length + ' connections.</p>' +
      A.LAYERS.map(function (ly) {
        var ns = model.nodes.filter(function (n) { return n.layer === ly.id; }); if (!ns.length) return '';
        return '<h3 style="margin:10px 0 2px;font-size:15px">' + esc(ly.label) + '</h3><ul class="comp">' + ns.map(function (n) { return '<li>' + esc(A.KIND[n.kind].icon + ' ' + n.label) + ' <span class="muted small">' + esc(A.KIND[n.kind].label) + '</span></li>'; }).join('') + '</ul>';
      }).join('') +
      (model.edges.length ? '<h3 style="margin:10px 0 2px;font-size:15px">Connections</h3><ul class="comp">' + model.edges.map(function (e) { return '<li>' + esc((by[e.from] || {}).label + ' → ' + (by[e.to] || {}).label) + ' <span class="muted small">' + esc(e.label) + '</span></li>'; }).join('') + '</ul>' : '');
  }

  // ---------- Mermaid rendering ----------
  function dark() { var t = document.documentElement.getAttribute('data-theme'); return t ? t === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); }
  var mermaidReady = null;
  function loadMermaid() {
    if (!mermaidReady) mermaidReady = B.loadScript(MERMAID).then(function () {
      window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark() ? 'dark' : 'default', flowchart: { htmlLabels: false, curve: 'basis', useMaxWidth: false }, c4: { useMaxWidth: false } });
      return window.mermaid;
    }, function (e) { mermaidReady = null; throw e; });
    return mermaidReady;
  }
  function render(src) {
    var seq = ++renderSeq; status('Drawing…');
    return loadMermaid().then(function (mm) {
      return mm.parse(src).then(function () { return mm.render('arch-svg-' + seq, src); });
    }).then(function (r) {
      if (seq !== renderSeq) return;
      lastSvg = r.svg; $('#diagram').innerHTML = r.svg; $('#srcErr').textContent = ''; status('');
    }).catch(function (e) {
      if (seq !== renderSeq) return;
      var msg = String((e && (e.message || e.str)) || e).split('\n').slice(0, 3).join(' ');
      if (/Could not load/.test(msg)) { status('The diagram library could not be downloaded (offline?). You can still copy or download the Mermaid text and draw.io file.'); return; }
      $('#srcErr').innerHTML = '<span class="bad">Mermaid can’t read this: ' + esc(msg.slice(0, 200)) + '</span>'; status('');
      // mermaid leaves an error element behind
      B.$$('[id^="darch-svg-"]').forEach(function (x) { x.remove(); });
    });
  }
  var srcTimer;
  $('#src').addEventListener('input', function () { clearTimeout(srcTimer); srcTimer = setTimeout(function () { render($('#src').value); }, 450); });
  $('#resetSrc').addEventListener('click', function () { if (!generated) return; $('#src').value = generated; render(generated); });
  ['view', 'dir', 'icons', 'details'].forEach(function (id) {
    $('#' + id).addEventListener('change', function () {
      state.view = $('#view').value; state.dir = $('#dir').value; state.icons = $('#icons').checked; state.details = $('#details').checked; save();
      $('#dir').disabled = state.view === 'c4';
      if (model && model.nodes.length) { generated = A.toMermaid(model, opts()); $('#src').value = generated; render(generated); }
    });
  });
  $('#dir').disabled = state.view === 'c4';
  $('#fit').addEventListener('change', function () { state.fit = $('#fit').checked; save(); $('#diagram').classList.toggle('fit', state.fit); });
  $('#go').addEventListener('click', generate);
  $('#sample').addEventListener('click', function () {
    var t = state.type; $('#in-' + t).value = SAMPLES[t]; state.inputs[t] = SAMPLES[t]; save(); generate();
  });

  // ---------- exports ----------
  function name(ext) { return 'architecture-' + state.type + '.' + ext; }
  function svgEl() { return $('#diagram svg'); }
  function svgString() {
    var el = svgEl(); if (!el) return null;
    var c = el.cloneNode(true), vb = (el.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    if (vb.length === 4) { c.setAttribute('width', Math.ceil(vb[2])); c.setAttribute('height', Math.ceil(vb[3])); }
    c.removeAttribute('style'); c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    var bg = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() || '#ffffff';
    c.setAttribute('style', 'background-color:' + bg);
    return new XMLSerializer().serializeToString(c);
  }
  $('#dlSvg').addEventListener('click', function () { var s = svgString(); if (!s) { B.toast('No diagram yet'); return; } B.download(name('svg'), s, 'image/svg+xml'); });
  $('#dlPng').addEventListener('click', function () {
    var s = svgString(); if (!s) { B.toast('No diagram yet'); return; }
    var el = svgEl(), vb = (el.getAttribute('viewBox') || '0 0 800 600').split(/\s+/).map(Number), scale = 2;
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas'); c.width = Math.ceil(vb[2] * scale); c.height = Math.ceil(vb[3] * scale);
      var x = c.getContext('2d'); x.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() || '#fff'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(img, 0, 0, c.width, c.height);
      try { c.toBlob(function (b) { B.download(name('png'), b); }); } catch (e) { B.toast('This browser blocked the PNG — download the SVG instead'); }
    };
    img.onerror = function () { B.toast('Could not make a PNG — download the SVG instead'); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  });
  $('#dlMmd').addEventListener('click', function () { if (!$('#src').value.trim()) return; B.download(name('mmd'), $('#src').value, 'text/plain;charset=utf-8'); });
  $('#copyMmd').addEventListener('click', function () { if ($('#src').value.trim()) B.copy($('#src').value); });
  $('#dlDrawio').addEventListener('click', function () {
    if (!model) { B.toast('No diagram yet'); return; }
    var src = $('#src').value, m = model, pos = null;
    if (/^\s*(flowchart|graph)\b/.test(src)) {
      m = A.parseMermaid(src);
      // positions from the rendered SVG so draw.io matches what you see
      var el = svgEl();
      if (el) {
        var r = el.getBoundingClientRect(), vb = (el.getAttribute('viewBox') || '').split(/\s+/).map(Number), k = vb.length === 4 && r.width ? vb[2] / r.width : 1;
        pos = {};
        B.$$('g.node', el).forEach(function (g) {
          var mm = /^flowchart-(.+)-\d+$/.exec(g.id || ''); if (!mm) return;
          var b = g.getBoundingClientRect();
          pos[mm[1]] = { x: (b.left - r.left) * k, y: (b.top - r.top) * k, w: Math.max(40, b.width * k), h: Math.max(30, b.height * k) };
        });
        if (!m.nodes.every(function (n) { return pos[n.id]; })) pos = null;
      }
    }
    B.download(name('drawio'), A.toDrawio(m, pos || A.layeredLayout(m)), 'application/xml');
  });

  // ---------- start ----------
  if (state.inputs[state.type] && state.inputs[state.type].trim()) generate();
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { mermaidReady = null; if (model) render($('#src').value); }); } catch (e) { /* older browsers */ }
})();
