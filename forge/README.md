# ProductForge — build a small-business records app from a config

ProductForge is the shared engine behind the industry apps (property inspection, tradie manager, construction
tracker, cleaning OS, …). You describe your **entities** (the things the business keeps records of), their
**fields**, and a few extras (reminders, dashboard tiles, printable documents). Forge generates the rest:

- list view with search, filters, sortable columns and CSV export/import per entity
- board view by a status field (drag cards, or use the drop-down on each card — works on touch and keyboard)
- create/edit form in a dialog, with validation and computed fields
- detail view with linked records ("Jobs (3)" under a customer) and "+ Job" buttons
- calendar (month/week, Monday first) for any date/datetime field, with .ics download
- "Needs attention" reminders from date rules (e.g. 12 months after the last vaccination), with .ics download
- recurring copies (weekly / fortnightly / monthly) of a record via **Repeat…**
- printable documents (quote, invoice, report, checklist) with the shared business details + logo
- photos (downscaled to 1600 px JPEG, stored in IndexedDB), checklists, signatures, line items
- full JSON backup/restore (optionally with photos), "Load sample data", "Delete all data", storage used

**Honest limits** (say these in your app's "How it works" box): it is static and browser-only. There is no login,
no sync between devices, no billing, no server-side reminders. Data lives in this browser (localStorage key
`bh:forge:<app id>`, photos in IndexedDB database `forge-photos`). Moving devices = download a backup and restore it.

## Files

| File | What |
|---|---|
| `forge/forge-core.js` | Pure logic, no DOM, UMD (`window.ForgeCore` / `require('../forge/forge-core.js')`). Schema validation, coercion, record validation, query/sort, board grouping, recurrence, reminders, calendar events, .ics, CSV mapping, totals/GST, tiles, backup, printable HTML. Tested in `tests/forge.test.js`. |
| `forge/forge-ui.js` | DOM layer: `Forge.app(config)` → returns `api`. Also `Forge.photos`, `Forge.downscale`, `Forge.print`, `Forge.business`. |
| `forge/forge.css` | Styles for the generated UI. Tokens only. Also has `.fg-gantt` bars for timeline views. |
| `forge/forge.js` | Optional checker (adds forge.css if missing, logs load-order mistakes). In Node it re-exports the core. |

## Page skeleton (`apps/<slug>/index.html`)

```html
<link rel="stylesheet" href="../../assets/style.css">
<link rel="stylesheet" href="../../forge/forge.css">
…
<main class="wrap">
  <section class="hero"><p class="eyebrow">Industry · pets</p><h1>Pet Business</h1><p class="lead">…</p></section>
  <div id="app"></div>
  <details class="panel"><summary><b>How it works and its limits</b></summary>…</details>
</main>
<script src="../../assets/core.js"></script>
<script src="../../forge/forge-core.js"></script>
<script src="../../forge/forge-ui.js"></script>
<script src="./lib.js"></script>   <!-- your pure domain logic, UMD, can require('../../forge/forge-core.js') in Node -->
<script src="./app.js"></script>   <!-- your Forge.app({...}) config -->
```

Forge renders the sample-data button, privacy line, tabs (Overview, one per entity, your extra tabs, Calendar,
Reminders, Settings) inside `#app`.

## A complete minimal app (pet grooming, ~90 lines)

```js
/* apps/pet-business/app.js */
(function () {
  'use strict';
  var C = window.ForgeCore, esc = C.esc;

  Forge.app({
    id: 'pet-business',               // storage key bh:forge:pet-business — never change it after launch
    name: 'Pet Business', mount: '#app',
    quickAdd: ['bookings'],           // "New booking" button next to Load sample data
    entities: {
      owners: {
        label: 'Owners', single: 'Owner', title: 'name', list: ['name', 'phone', 'email'],
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'phone', label: 'Phone', type: 'phone' },
          { key: 'email', label: 'Email', type: 'email' }
        ]
      },
      pets: {
        label: 'Pets', single: 'Pet', title: 'name', list: ['name', 'owner', 'species', 'vaccinated'],
        fields: [
          { key: 'name', label: 'Pet name', type: 'text', required: true },
          { key: 'owner', label: 'Owner', type: 'link', entity: 'owners', required: true, filter: true },
          { key: 'species', label: 'Species', type: 'select', options: ['Dog', 'Cat', 'Other'] },
          { key: 'weight', label: 'Weight (kg)', type: 'number', min: 0, max: 120 },
          { key: 'vaccinated', label: 'Last C5 vaccination', type: 'date' },
          { key: 'photos', label: 'Photos', type: 'photos' },
          { key: 'notes', label: 'Notes', type: 'longtext' }
        ]
      },
      bookings: {
        label: 'Bookings', single: 'Booking', board: 'status', calendar: ['start'], durationField: 'hours',
        recurring: 'start', recurringReset: { status: 'Booked' }, sort: { key: 'start', dir: 'desc' },
        title: function (r, api) { return api.title('pets', r.pet) + ' · ' + String(r.start || '').replace('T', ' '); },
        list: ['start', 'pet', 'service', 'status', 'price'], listTotals: ['price'],
        fields: [
          { key: 'pet', label: 'Pet', type: 'link', entity: 'pets', required: true },
          { key: 'start', label: 'Start', type: 'datetime', required: true },
          { key: 'hours', label: 'Hours', type: 'number', default: 1.5 },
          { key: 'service', label: 'Service', type: 'select', options: ['Full groom', 'Wash', 'Nails'] },
          { key: 'status', label: 'Status', type: 'select', required: true,
            options: ['Booked', 'Checked in', { value: 'Done', label: 'Done', tone: 'ok' }, { value: 'No-show', label: 'No-show', tone: 'bad' }] },
          { key: 'tasks', label: 'Groom checklist', type: 'checklist', items: ['Brush out', 'Bath', 'Dry', 'Nails', 'Ears'] },
          { key: 'extras', label: 'Extras', type: 'lines' },
          { key: 'price', label: 'Price incl. GST', type: 'money', compute: function (r) { return C.totals(r.extras, { extras: [{ amount: 85 }] }).total; } },
          { key: 'signature', label: 'Owner pick-up signature', type: 'signature', dateField: 'signedOn' },
          { key: 'signedOn', label: 'Signed on', type: 'date' }
        ],
        actions: [{ label: 'Mark done', when: function (b) { return b.status !== 'Done'; },
          run: function (b, api) { api.save('bookings', Object.assign({}, b, { status: 'Done' })); } }]
      }
    },
    reminders: [
      { entity: 'pets', date: 'vaccinated', offsetMonths: 12, warnDays: 30, pastDays: 365, label: 'Vaccination due' },
      { entity: 'bookings', date: 'start', warnDays: 1, label: 'Booking', when: function (b) { return b.status === 'Booked'; } }
    ],
    dashboard: {
      tiles: [
        { label: 'Pets', entity: 'pets', kind: 'count' },
        { label: 'Takings (done)', entity: 'bookings', kind: 'sum', field: 'price', where: function (b) { return b.status === 'Done'; } },
        { label: 'Bookings today', value: function (api) { return api.list('bookings').filter(function (b) { return C.dayOf(b.start) === api.today(); }).length; } }
      ],
      charts: [{ title: 'Bookings by service', entity: 'bookings', by: 'service' }]
    },
    documents: [{ id: 'receipt', label: 'receipt', entity: 'bookings', build: function (b, api) {
      var t = C.totals(b.extras, { extras: [{ label: 'Groom', amount: 85 }] });
      return { title: 'Tax invoice', number: 'B-' + b.id.slice(-5), date: C.dayOf(b.start), lines: b.extras, totals: t,
        extras: [{ label: 'Groom', amount: 85 }], sections: [{ heading: 'Checklist', checklist: b.tasks }],
        signatures: [{ label: 'Owner', image: b.signature, date: b.signedOn }] };
    } }],
    tabs: [{ id: 'today', label: 'Today', after: 'bookings', render: function (el, api) {
      el.innerHTML = '<p>' + esc(api.list('bookings').length) + ' bookings in total.</p>';
    } }],
    sample: function (today) {
      return { owners: [{ id: 'o1', name: 'Mia Nguyen', phone: '0412 555 101' }],
        pets: [{ id: 'p1', name: 'Biscuit', owner: 'o1', species: 'Dog', vaccinated: C.addMonths(today, -11) }],
        bookings: [{ id: 'b1', pet: 'p1', start: today + 'T10:00', service: 'Full groom', status: 'Booked' }] };
    }
  });
})();
```

## Config reference

### App
`id` (required, lower-case-dashes, is the storage key) · `name` · `mount` (selector or element) · `entities` ·
`reminders` · `dashboard` · `documents` · `tabs` · `sample(today, api)` → `{entityKey: [records], _extra?}` ·
`quickAdd: [entityKeys]` · `photoMax` (px, default 1600) · `afterSample(api)` · `dashboardLabel`.

Problems in the config are printed to the console by `ForgeCore.validateSchema(cfg)` — call it in your tests too.

### Entity
| key | meaning |
|---|---|
| `label`, `single` | Tab name ("Jobs") and one record ("Job"). |
| `title` | Field key, or `function (rec, api)` returning the record's name. |
| `fields` | Array of fields (below). |
| `list` | Field keys shown as table columns (default: first 5 simple fields). `listTotals: [keys]` adds a total row. |
| `board` | Key of a `select` field → adds the Board view (columns in option order). `cardFields` = extra lines on cards. `defaultView: 'board'`. |
| `calendar` | Array of date/datetime field keys to show on the calendar. `durationField` = hours field for .ics end times. |
| `recurring` | Date/datetime key → adds **Repeat…**. `recurringShift` (other date keys moved by the same days), `recurringReset` (values for copies), `recurringClear` (keys removed in copies). Photos/signatures are cleared and checklists reset in copies. |
| `sort` | `{ key, dir: 'asc' \| 'desc' }` default sort. Select fields sort in option order; empty values go last. |
| `tab: false` | No tab of its own; opens in a dialog from links. |
| `onNew(draft, api)` | Fill defaults when a new record form opens (e.g. next number). |
| `onLinkChange(draft, key, api)` | A link field changed in the form; checklist fields (and fields with `refresh: true`) re-render after it. |
| `validate(rec)` | Return `{ fieldKey: 'message' }` for cross-field rules. |
| `beforeSave(draft, api)` / `afterSave(rec, api, isNew)` | Hooks around saving from the form. |
| `onStatus(rec, newValue, api)` | Called when a card is moved on the board (mutate `rec` before it saves). |
| `actions` | `[{ label, when?(rec, api), run(rec, api) }]` buttons on the detail view. |
| `detailExtra(el, rec, api)` | Render anything extra in the detail view. `renderBelow(el, api, visibleRecs)` under the list. |

### Field
Common: `key`, `label`, `type`, `required`, `default` (value, `'today'`, or `function (today)`), `help`,
`placeholder`, `full` (span the whole form row), `hidden`, `filter: true` (adds a filter drop-down; selects get one
automatically unless `filter: false`), `validate(value, rec)` → message, `compute(rec, api)` → read-only computed
value (saved with the record, recalculated on every save), `csv: false`.

| type | value stored | notes |
|---|---|---|
| `text`, `longtext`, `email`, `phone` | string | email/phone are validated |
| `number`, `money` | number or null | `min`, `max` |
| `date` | `'YYYY-MM-DD'` | CSV accepts 08/11/2026 (day first) |
| `datetime` | `'YYYY-MM-DDTHH:MM'` | local wall-clock time |
| `time` | `'HH:MM'` | |
| `select` | option value | `options: ['A', { value, label, tone: 'ok'\|'warn'\|'bad' }]` — tone colours the pill |
| `multiselect` | array of values | shown as checkboxes |
| `checkbox` | boolean | |
| `link` | id of a record in `entity` | `entity: 'customers'`; `addFrom: false` hides the "+ X" button on the target's detail |
| `photos` | array of photo ids | images live in IndexedDB; deleted with the record |
| `checklist` | `[{id, text, group, done, notes, photos, ...}]` | `items: ['a', {text, group}]` defaults; `itemFields: [{key, label, options}]` per-item drop-downs; `itemPhotos: true`; `itemNotes: false`; `autoDone: true` (ticked when every item field is set); `groups: false`; `groupLabel: 'Room'`; `groupItems: [...]` or `function (groupName, draft)` for new groups |
| `signature` | PNG data URL | `dateField: 'signedOn'` is filled with today when signed |
| `lines` | `[{desc, qty, price}]` | shows amounts and a total; use `ForgeCore.totals` for GST |

### Reminders
`{ entity, date, offsetDays?, offsetMonths?, warnDays = 14, pastDays?, label: 'text' | function (rec), when?(rec, today), ruleText? }`
— a record appears when `date + offset` is within `warnDays` ahead, or overdue (only up to `pastDays` ago if set).

### Dashboard
`tiles`: `{ label, entity, kind: 'count'|'sum'|'avg'|'overdue', field (key or fn), date (for overdue), where(rec, today), fmt: 'money'|'num'|'pct'|'hours', tone(v) }`
or `{ label, value(api), fmt, tone }`. `charts`: `{ title, entity, by (key or fn(rec, api)), sum?, where?, fmt, limit }`
(bar charts via `B.barChart`; link fields show the linked record's name). `render(el, api)` for anything else.

### Documents
`{ id, label, entity, when?(rec, api), build(rec, api) → spec }` adds "Print <label>" and "⬇ HTML" to the detail view.
Spec (all optional except title): `title, number, date, meta: [[label, value]], to: { heading, lines: [] }, intro,
lines: [{desc, qty, price}], totals (from ForgeCore.totals), extras: [{label, amount}], gst, paid, sections: [{ heading,
text | html | table: {headers, rows} | checklist: items, columns: [{key, label}] | photos: ids }], photos, signatures:
[{ label, name, image, date }], notes, footer`. Business name/ABN/licence/address/logo/payment details come from
Settings (shared by all forge apps: `B.store` key `forge:business`). "How to pay" is added to titles containing "invoice".

### Extra tabs
`tabs: [{ id, label, after: 'entityKey' | 'tabId', render(el, api) }]` — rendered each time the tab is shown and after
every save. Tab ids become `x-<id>` (use `api.goTab('x-<id>')`).

## The `api` object (second argument everywhere, also returned by `Forge.app`)
`api.list(ek)` · `api.get(ek, id)` · `api.title(ek, recOrId)` · `api.save(ek, rec, quiet?)` (computes fields, stamps
created/updated, persists, re-renders unless quiet) · `api.saveMany(ek, recs)` · `api.remove(ek, id)` ·
`api.edit(ek, recOrIdOrNull, preset)` (opens the form) · `api.open(ek, id)` (detail) · `api.goTab(id)` ·
`api.today()` (local `YYYY-MM-DD`) · `api.data` · `api.extra(key, value?)` (persisted app settings) ·
`api.business()` · `api.print(spec)` · `api.download(name, spec)` · `api.docHTML(spec)` → Promise<html> ·
`api.ics(events, name)` · `api.photoSrc(ids)` → Promise<{id: dataURL}> · `api.addPhoto(dataURL)` → Promise<id> ·
`api.toast(msg)` · `api.core` (= ForgeCore).

## Useful core helpers for your lib.js
`ForgeCore.r2`, `totals(lines, {gst, markupPct, extras, discount})`, `gstFromInclusive`, `linesTotal`, `nextNumber(numbers, 'INV-')`,
`addDays`, `addMonths`, `daysBetween`, `weekStart`, `weekOf`, `weekday` (0 = Monday), `monthGrid`, `dayOf`, `timeOf`,
`expandRecurrence({freq, start, until|count})`, `generateSeries`, `reminders(cfg, data, today)`, `calendarEvents`,
`buildICS(events)`, `toCSV`/`fromCSV`, `groupBy`, `checkItem`, `checklistProgress`, `docHTML(spec, business, photoSrc)`.

## Checklist for a new forge app
1. `lib.js` holds domain rules (pricing, allocation, comparisons) and `sample(today)`; test it with `node:test`.
   Add `assert.deepStrictEqual(require('../forge/forge-core.js').validateSchema(cfg), [])` if you export the config.
2. Sample data uses dates relative to `today` so reminders and the calendar look alive on any day.
3. Keep it honest in the "How it works and its limits" box (no login/sync/billing; reminders need the page open or the .ics file).
4. Browser check at 375 px, light and dark: load sample, open each tab, a detail, a form, the board and the calendar,
   print a document; no console errors and `scrollWidth <= 375`.
