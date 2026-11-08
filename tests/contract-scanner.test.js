const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps/contract-scanner/lib.js');
const S = require('../apps/contract-scanner/samples.js');

const ids = (r) => r.summary.map(s => s.id);
const sev = (r, id) => (r.summary.find(s => s.id === id) || {}).severity;
const det = (r, id) => (r.summary.find(s => s.id === id) || {}).details || {};

test('number words and durations', () => {
  assert.strictEqual(L.wordsToNum('ninety'), 90);
  assert.strictEqual(L.wordsToNum('twenty-one'), 21);
  assert.strictEqual(L.wordsToNum('one hundred and twenty'), 120);
  assert.strictEqual(L.normaliseNumbers('thirty (30) days and sixty days'), '30 days and 60 days');
  assert.deepStrictEqual(L.parseDuration('a period of two (2) years'), { value: 2, unit: 'year', business: false, days: 730, text: '2 years' });
  assert.strictEqual(L.parseDuration('within 10 business days').days, 14);
  assert.strictEqual(L.parseDuration('no duration here'), null);
});

test('notice periods are extracted in their many phrasings', () => {
  assert.strictEqual(L.noticeDays("at least ninety (90) days' written notice").days, 90);
  assert.strictEqual(L.noticeDays('by giving a notice of not less than 60 days').days, 60);
  assert.strictEqual(L.noticeDays('not less than 3 months before the end of the term').days, 90);
  assert.strictEqual(L.noticeDays("four (4) weeks' notice").days, 28);
  assert.strictEqual(L.noticeDays('may terminate on 5 business days notice').business, true);
  assert.strictEqual(L.noticeDays('may terminate immediately'), null);
});

test('payment terms: net days, interest, late fees', () => {
  assert.strictEqual(L.paymentTerms('Payment terms are Net 30.').netDays, 30);
  const p = L.paymentTerms('Invoices are payable within fourteen (14) days of the date of the invoice. Overdue amounts attract interest at 1.5% per month and a late payment fee of $50.');
  assert.strictEqual(p.netDays, 14);
  assert.strictEqual(p.interest, 1.5); assert.strictEqual(p.interestPer, 'month'); assert.strictEqual(p.interestYearly, 18);
  assert.strictEqual(p.lateFee, '$50');
  assert.ok(L.paymentTerms('payable end of month following invoice').eom);
});

test('clauses split at numbered headings, sub-clauses keep the parent heading, schedules split too', () => {
  const c = L.splitClauses('AGREEMENT\nBetween A and B.\n\n1. Term\n1.1 Starts 1 July 2026.\n1.2 Runs 12 months.\n2. Fees\nPay $10 within 30 days.\n\nSchedule 2 – Prices\nWidgets $5.');
  assert.deepStrictEqual(c.map(x => x.num), ['', '1.1', '1.2', '2', 'Schedule 2']);
  assert.strictEqual(c[1].heading, 'Term');
  assert.strictEqual(c[3].heading, 'Fees');
  assert.strictEqual(c[3].text, 'Pay $10 within 30 days.');
  assert.strictEqual(c[4].heading, 'Schedule 2 — Prices');
  // "30 days after" at the start of a line is not a heading
  assert.strictEqual(L.splitClauses('1. Payment\nThe fee is due\n30 days after invoice.').length, 1);
});

test('service sample: the nasty clauses are all caught with the right details', () => {
  const r = L.scan(S.service.text);
  assert.strictEqual(r.type, 'service');
  ['autoRenewal', 'terminationFee', 'indemnity', 'variation', 'guarantee', 'unlimitedLiability', 'exclusivity', 'priceIncrease', 'liabilityCap'].forEach(id => assert.ok(ids(r).includes(id), 'missing ' + id));
  assert.strictEqual(det(r, 'autoRenewal').notice.days, 90);
  assert.strictEqual(det(r, 'autoRenewal').renewalTerm.text, '12 months');
  assert.strictEqual(sev(r, 'priceIncrease'), 'high', '"greater of 5% and CPI" is escalated');
  assert.ok(det(r, 'priceIncrease').cpi);
  assert.strictEqual(sev(r, 'governingLaw'), 'medium', 'Singapore law is flagged for an Australian business');
  assert.strictEqual(det(r, 'governingLaw').place, 'Singapore');
  assert.strictEqual(sev(r, 'termination'), 'medium', 'supplier-only termination for convenience');
  assert.strictEqual(det(r, 'payment').netDays, 7);
  assert.strictEqual(det(r, 'payment').interestYearly, 24);
  assert.match(det(r, 'liabilityCap').cap, /three \(3\) months/);
  assert.ok(det(r, 'ip').supplierOwns);
  assert.ok(det(r, 'privacy').offshore);
  assert.strictEqual(r.score.level, 'High');
  assert.ok(r.score.reasons[0].points >= 12);
  assert.ok(r.missing.some(m => m.id === 'insurance'));
  assert.ok(!r.missing.some(m => m.id === 'termination'));
});

test('service sample key dates: end = start + 36 months − 1 day; notice deadline = end − 90 days; renewal next day', () => {
  const k = L.scan(S.service.text).keyDates.items;
  const by = Object.fromEntries(k.map(i => [i.kind, i.date]));
  assert.deepStrictEqual(by, { start: '2026-07-01', end: '2029-06-30', notice: '2029-04-01', renewal: '2029-07-01' });
});

test('lease sample: lease type, market review, make good, guarantor, option window', () => {
  const r = L.scan(S.lease.text);
  assert.strictEqual(r.type, 'lease');
  ['guarantee', 'makeGood', 'security', 'priceIncrease', 'insurance', 'optionRenew', 'minimumTerm'].forEach(id => assert.ok(ids(r).includes(id), 'missing ' + id));
  assert.strictEqual(det(r, 'priceIncrease').percent, 4);
  assert.ok(det(r, 'priceIncrease').market);
  assert.deepStrictEqual(det(r, 'insurance').amounts, ['$20 million']);
  const by = Object.fromEntries(r.keyDates.items.map(i => [i.kind, i.date]));
  assert.strictEqual(by.end, '2032-01-31');
  assert.strictEqual(by.option, '2031-07-31', 'six calendar months before the end');
  assert.deepStrictEqual(r.parties.map(p => p.role), ['Landlord', 'Tenant', 'Guarantor']);
  assert.strictEqual(r.missing.length, 0);
});

test('NDA and employment samples: type detection, restraint details, sensible missing lists', () => {
  const n = L.scan(S.nda.text);
  assert.strictEqual(n.type, 'nda');
  assert.ok(ids(n).includes('restraint'));
  assert.strictEqual(det(n, 'duration').survives.text, '3 years');
  assert.strictEqual(n.missing.length, 0);
  const e = L.scan(S.employment.text);
  assert.strictEqual(e.type, 'employment');
  assert.strictEqual(det(e, 'restraint').duration.text, '24 months');
  assert.strictEqual(det(e, 'restraint').area, '50 km radius');
  assert.strictEqual(det(e, 'termination').notice.days, 28);
  assert.ok(!e.keyDates.items.some(i => i.kind === 'end'), 'an ongoing job has no end date (the 24-month restraint is not a term)');
});

test('non-exclusive wording is not flagged as exclusivity; mutual indemnity is milder', () => {
  const r = L.scan('1. Licence\nThe Customer receives a non-exclusive licence to use the software.\n2. Law\nThe parties submit to the non-exclusive jurisdiction of the courts of Victoria.\n3. Indemnity\nEach party shall indemnify the other against third-party claims caused by its negligence.');
  assert.ok(!ids(r).includes('exclusivity'));
  assert.strictEqual(sev(r, 'indemnity'), 'medium');
});

test('variation clause is not flagged when changes need written agreement', () => {
  assert.ok(!ids(L.scan('1. Changes\nThe Supplier may vary these terms, but any variation must be in writing signed by both parties.')).includes('variation'));
  assert.ok(ids(L.scan('1. Changes\nWe may change these terms at any time by posting the updated terms on our website.')).includes('variation'));
});

test('stated end date, range dates and day-first numeric dates', () => {
  const r = L.scan('1. Term\nThis agreement runs from 1 March 2027 to 28 February 2028 and will automatically renew for further periods of 12 months unless either party gives 30 days notice.\n2. Other\nSigned 15/02/2027.');
  const by = Object.fromEntries(r.keyDates.items.map(i => [i.kind, i.date]));
  assert.deepStrictEqual(by, { start: '2027-03-01', end: '2028-02-28', notice: '2028-01-29', renewal: '2028-02-29' });
  assert.ok(r.dates.some(d => d.date === '2027-02-15'), 'AU day-first date');
  assert.deepStrictEqual(L.findDates('due 31/02/2027').length, 0, 'impossible dates are ignored');
});

test('money amounts with GST hints and context', () => {
  const m = L.findMoney('The fee is $2,450 plus GST per month. Insurance of $20 million. Deposit AUD 5,000.');
  assert.deepStrictEqual(m.map(x => x.value), [2450, 20000000, 5000]);
  assert.strictEqual(m[0].gst, 'plus GST');
  assert.match(m[1].context, /Insurance/);
});

test('.ics export is RFC 5545 shaped with CRLF, all-day events, escaping and an alarm on the notice date', () => {
  const r = L.scan(S.service.text);
  const ics = L.ics(r.keyDates.items, 'IT, support; Cloudnine', '20261108T000000Z');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends with CRLF');
  assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 4);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20290401'));
  assert.ok(ics.includes('IT\\, support\\; Cloudnine'));
  assert.ok(ics.includes('TRIGGER:-P14D'));
  ics.split('\r\n').forEach(l => assert.ok(l.length <= 75, 'line folded: ' + l));
});

test('highlight escapes HTML and marks every match', () => {
  const h = L.highlight('<b>auto renew</b> and auto renew', ['auto renew']);
  assert.strictEqual(h, '&lt;b&gt;<mark>auto renew</mark>&lt;/b&gt; and <mark>auto renew</mark>');
});

test('report includes the not-legal-advice note, questions and escaped names', () => {
  const r = L.scan(S.service.text);
  const html = L.reportHtml(r, 'Cloud <IT>', '2026-11-08');
  assert.ok(html.includes('Not legal advice'));
  assert.ok(html.includes('Cloud &lt;IT&gt;'));
  assert.ok(html.includes('Questions to ask the other party'));
  assert.ok(!/undefined|NaN/.test(html));
  assert.ok(r.questions.length >= 10);
  assert.ok(r.questions.some(q => q.severity === 'missing'));
});

test('a plain, fair contract scores low', () => {
  const fair = '1. Services\nThe Contractor will paint the office.\n2. Payment\nInvoices are payable within 14 days of the invoice date.\n3. Termination\nEither party may terminate on 14 days written notice.\n4. Liability\nEach party\'s total liability is limited to the contract price.\n5. Insurance\nThe Contractor holds public liability insurance of $10 million.\n6. Law\nThis agreement is governed by the laws of Queensland. Disputes go to mediation first.\n7. Ownership\nIntellectual property in the colour plan is assigned to the Customer on payment.\n8. Confidentiality\nEach party keeps the other\'s information confidential.\n9. Privacy\nPersonal information is handled under the Privacy Act.\n10. Force majeure\nNeither party is liable for delays beyond its reasonable control.\n11. Warranty\nThe Contractor warrants the work for 12 months.';
  const r = L.scan(fair, { type: 'service' });
  assert.strictEqual(r.score.level, 'Low', JSON.stringify(r.score.reasons));
  assert.strictEqual(r.missing.length, 0);
});

test('soft-wrapped lines (from PDFs and emails) are joined so clauses read as sentences', () => {
  const r = L.scan('1. Term\nThis agreement will automatically\nrenew for successive periods of 12 months unless either party gives\n60 days notice.\n2. Payment\nPayable within 30 days\nof invoice.');
  assert.strictEqual(r.clauses[0].text, 'This agreement will automatically renew for successive periods of 12 months unless either party gives\n60 days notice.');
  assert.strictEqual(det(r, 'autoRenewal').notice.days, 60);
  assert.strictEqual(det(r, 'payment').netDays, 30);
});
