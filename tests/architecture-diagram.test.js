const test = require('node:test');
const assert = require('node:assert');
const A = require('../apps/architecture-diagram/lib.js');

const edges = (m) => m.edges.map((e) => e.from + ' ' + e.type + ' ' + e.to);
const kinds = (m) => Object.fromEntries(m.nodes.map((n) => [n.id, n.kind]));

test('description: the classic example becomes typed edges across layers', () => {
  const m = A.parseDescription('React web app calls an API gateway which routes to orders and payments services; orders uses Postgres; payments calls Stripe; events go through Kafka to a notifications worker');
  assert.deepStrictEqual(edges(m), [
    'react_web_app calls api_gateway', 'api_gateway routes orders_service', 'api_gateway routes payments_service',
    'orders_service readwrite postgres', 'payments_service calls stripe', 'payments_service publishes kafka', 'kafka consumes notifications_worker'
  ]);
  const layer = Object.fromEntries(m.nodes.map((n) => [n.id, n.layer]));
  assert.deepStrictEqual([layer.react_web_app, layer.api_gateway, layer.orders_service, layer.postgres, layer.kafka, layer.stripe], ['client', 'edge', 'service', 'data', 'data', 'external']);
});
test('description: pronouns, "both", "through Cloudflare", unknown subjects, compound names', () => {
  const m = A.parseDescription('Customers use an iOS app and a Next.js website. Both call the backend API through Cloudflare. The backend API reads from Redis and writes to MongoDB. It uploads images to S3 and sends emails via SendGrid. A billing worker consumes jobs from SQS and calls Xero.');
  const e = edges(m);
  ['customers uses ios_app', 'customers uses next_js_website', 'ios_app calls cloudflare', 'next_js_website calls cloudflare', 'cloudflare routes backend_api',
    'backend_api reads redis', 'backend_api writes mongodb', 'backend_api writes s3', 'backend_api calls sendgrid', 'sqs consumes billing_worker', 'billing_worker calls xero'].forEach((x) => assert.ok(e.includes(x), x));
  assert.ok(!e.includes('ios_app calls backend_api'), 'direct edge replaced by the via route');
  const m2 = A.parseDescription('A search indexer consumes from RabbitMQ and writes to Elasticsearch.');
  assert.strictEqual(kinds(m2).search_indexer, 'worker');
  assert.ok(edges(m2).includes('rabbitmq consumes search_indexer'));
  assert.strictEqual(A.parseDescription('hello there').warnings.length, 1);
});
test('YAML subset: nested maps, lists of maps, flow style, quotes, comments, block scalars, multi-doc', () => {
  const docs = A.parseYAML('a: 1\nb: "x # not comment" # comment\nc: [1, two, "3"]\nd: { e: f, g: [h] }\nlist:\n  - name: one\n    port: 80\n  - two\nscript: |\n  line 1\n  line 2\n---\nkind: Second\n');
  assert.strictEqual(docs.length, 2);
  assert.deepStrictEqual(docs[0], { a: 1, b: 'x # not comment', c: [1, 'two', '3'], d: { e: 'f', g: ['h'] }, list: [{ name: 'one', port: 80 }, 'two'], script: 'line 1\nline 2' });
  assert.strictEqual(docs[1].kind, 'Second');
});
test('docker-compose: depends_on (list and map), env hostnames, volumes, ports, worker consumes queue', () => {
  const m = A.parseCompose('services:\n  web:\n    build: ./web\n    ports: ["3000:3000"]\n    depends_on: [api]\n  api:\n    image: node:20\n    environment:\n      DATABASE_URL: postgres://u:p@db:5432/app\n    depends_on:\n      cache:\n        condition: service_started\n  worker:\n    build: ./worker\n    environment:\n      - AMQP=amqp://mq:5672\n  db:\n    image: postgres:16\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n  cache:\n    image: redis:7\n  mq:\n    image: rabbitmq:3\nvolumes:\n  pgdata:\n');
  const k = kinds(m);
  assert.deepStrictEqual([k.web, k.api, k.worker, k.db, k.cache, k.mq, k.vol_pgdata, k.users], ['web', 'service', 'worker', 'database', 'cache', 'queue', 'volume', 'user']);
  const e = edges(m);
  ['web calls api', 'api readwrite db', 'api reads cache', 'mq consumes worker', 'db mounts vol_pgdata', 'users calls web'].forEach((x) => assert.ok(e.includes(x), x));
  assert.ok(m.nodes.find((n) => n.id === 'web').meta.includes('ports 3000:3000'));
  assert.ok(A.parseCompose('nothing: here').warnings.length);
});
test('Kubernetes: Ingress → Service → Deployment by selector, ConfigMap/Secret refs, env → Service DNS', () => {
  const y = 'kind: Ingress\nmetadata:\n  name: ing\nspec:\n  rules:\n    - host: a.example.com\n      http:\n        paths:\n          - path: /api\n            backend:\n              service:\n                name: api-svc\n---\nkind: Service\nmetadata:\n  name: api-svc\nspec:\n  selector:\n    app: api\n---\nkind: Deployment\nmetadata:\n  name: api\nspec:\n  replicas: 2\n  template:\n    metadata:\n      labels:\n        app: api\n    spec:\n      containers:\n        - name: api\n          image: acme/api:1\n          envFrom:\n            - configMapRef:\n                name: api-cfg\n          env:\n            - name: DB\n              value: pg-svc\n---\nkind: StatefulSet\nmetadata:\n  name: pg\nspec:\n  template:\n    metadata:\n      labels: { app: pg }\n    spec:\n      containers:\n        - image: postgres:16\n---\nkind: Service\nmetadata: { name: pg-svc }\nspec:\n  selector: { app: pg }\n---\nkind: Service\nmetadata: { name: orphan }\nspec:\n  selector: { app: nothing }\n';
  const m = A.parseK8s(y), e = edges(m);
  ['users calls ingress_ing', 'ingress_ing routes service_api_svc', 'service_api_svc routes deployment_api', 'deployment_api config configmap_api_cfg', 'service_pg_svc routes statefulset_pg', 'deployment_api readwrite service_pg_svc'].forEach((x) => assert.ok(e.includes(x), x));
  assert.strictEqual(kinds(m).statefulset_pg, 'database');
  assert.ok(m.edges.find((x) => x.to === 'service_api_svc').label === '/api');
  assert.ok(m.warnings.some((w) => /orphan/.test(w)));
});
test('folder tree: tree output and plain indentation; frontend, services, workers, migrations, infra', () => {
  const t = '.\n├── apps\n│   ├── web\n│   │   ├── package.json\n│   │   └── src\n│   │       └── components\n│   └── mobile\n├── services\n│   ├── orders\n│   │   ├── go.mod\n│   │   └── migrations\n│   ├── payments\n│   │   └── requirements.txt\n│   └── notifications-worker\n├── infra\n│   └── terraform\n└── README.md\n\n10 directories, 4 files';
  const lines = A.parseTreeLines(t);
  assert.ok(lines.find((l) => l.path === 'services/orders/migrations' && l.depth === 2));
  const m = A.parseTree(t), k = kinds(m), e = edges(m);
  assert.strictEqual(k.fe_apps_web, 'web'); assert.strictEqual(k.mob_apps_mobile, 'mobile');
  assert.strictEqual(k.be_services_orders, 'service'); assert.strictEqual(k.be_services_payments, 'service');
  assert.strictEqual(k.wk_services_notifications_worker, 'worker'); assert.strictEqual(k.database, 'database'); assert.strictEqual(k.infra, 'infra');
  assert.ok(e.includes('be_services_orders readwrite database')); assert.ok(!e.includes('be_services_payments readwrite database'));
  assert.ok(e.includes('fe_apps_web calls be_services_orders'));
  const indented = A.parseTree('frontend\n  src\n    components\nbackend\n  app.py\n  migrations\n');
  assert.deepStrictEqual(indented.nodes.map((n) => n.kind).sort(), ['database', 'service', 'user', 'web']);
});
test('Mermaid flowchart: layers as subgraphs, shapes per kind, dashed async edges, escaped quotes', () => {
  const m = A.parseDescription('React web app calls the "orders" service; orders service uses Postgres and publishes to Kafka');
  const src = A.toMermaid(m, { direction: 'TB' });
  assert.match(src, /^flowchart TB\n/);
  assert.match(src, /subgraph data_layer\["Data & messaging"\]/);
  assert.match(src, /postgres\[\("🗄️ Postgres"\)\]/);
  assert.match(src, /kafka\[\["📨 Kafka"\]\]/);
  assert.match(src, /orders_service -\.->\|publishes\| kafka/);
  assert.ok(!/"[^"\n]*"[^"\n]*"\]/.test(src.replace(/#quot;/g, '')));
  const plain = A.toMermaid(m, { icons: false, layers: false });
  assert.ok(!/subgraph/.test(plain) && !/🗄️/.test(plain));
});
test('C4 container view: people, boundary, Db/Queue containers, external systems, relations', () => {
  const m = A.parseDescription('Customers use a React web app. The React web app calls the orders service. Orders service uses Postgres and calls Stripe; it publishes to Kafka.');
  const c4 = A.toMermaid(m, { view: 'c4' });
  assert.match(c4, /^C4Container/);
  assert.match(c4, /Person\(customers, "Customers"\)/);
  assert.match(c4, /ContainerDb\(postgres/); assert.match(c4, /ContainerQueue\(kafka/);
  assert.match(c4, /System_Ext\(stripe/);
  assert.match(c4, /Rel\(orders_service, postgres, "reads\/writes"\)/);
});
test('parseMermaid round-trips our output and reads simple hand-written flowcharts', () => {
  const m = A.parseDescription('React web app calls an API gateway which routes to orders and payments services; orders uses Postgres');
  const back = A.parseMermaid(A.toMermaid(m));
  assert.deepStrictEqual(back.nodes.map((n) => n.id).sort(), m.nodes.map((n) => n.id).sort());
  assert.strictEqual(back.edges.length, m.edges.length);
  assert.strictEqual(back.nodes.find((n) => n.id === 'postgres').label, 'Postgres');
  const h = A.parseMermaid('graph TD\n  A[Shop] --> B[(Orders DB)]\n  A -.-> C>Stripe]\n  B --> D');
  assert.deepStrictEqual(h.nodes.map((n) => n.kind), ['service', 'database', 'external', 'service']);
  assert.strictEqual(h.edges.length, 3);
});
test('draw.io export: valid mxGraph cells, layered positions, escaped labels, dashed async edges', () => {
  const m = A.parseCompose('services:\n  api:\n    image: "acme/api:1 & 2"\n    depends_on: [mq]\n  mq:\n    image: kafka\n');
  const pos = A.layeredLayout(m);
  assert.ok(pos.api.x < pos.mq.x, 'services column before data column');
  const x = A.toDrawio(m);
  assert.match(x, /^<mxfile/); assert.match(x, /<\/mxfile>\n$/);
  assert.strictEqual((x.match(/vertex="1"/g) || []).length, m.nodes.length);
  assert.strictEqual((x.match(/edge="1"/g) || []).length, m.edges.length);
  assert.ok(x.includes('acme/api:1 &amp;amp; 2') && !/&\s/.test(x));
  assert.ok(/dashed=1;" edge="1" parent="1" source="api" target="mq"/.test(x));
});
test('detect input type', () => {
  assert.strictEqual(A.detect('services:\n  a:\n    image: x'), 'compose');
  assert.strictEqual(A.detect('apiVersion: v1\nkind: Service'), 'k8s');
  assert.strictEqual(A.detect('.\n├── src'), 'tree');
  assert.strictEqual(A.detect('web app calls api'), 'text');
});
