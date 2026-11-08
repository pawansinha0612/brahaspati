# Brahaspati

Free tools for small businesses, creators and everyday life. Every tool runs in your browser, so your files and
data stay on your device. You don't need an account.

**Live:** https://pawansinha0612.github.io/brahaspati/

## Tools

| Area | Tools |
| --- | --- |
| Business | Excel & CSV Intelligence, Small Business Admin, Website Health Checker, Decision Simulator, Contract Risk Scanner, Proposal Generator, Business Process Mapper, Compliance Calendar, Vendor Comparison, Employee Onboarding, Business Continuity Planner, Tender Response Assistant, Review & Feedback Miner, Inventory Forecasting, Appointment No-show Predictor |
| Industry apps | Property Inspection Assistant, Construction Project Tracker, Tradie Business Manager, Pet Business Manager, Restaurant Profit Calculator, Cleaning Business OS, Logistics Control Tower, Gym & Studio Manager |
| Online sellers | Returns Intelligence, Product Listing Optimiser, Competitor Price Watcher, Digital Product Store, Affiliate Content Manager |
| Creators | Creator Autopilot, Content Insights, AI Story Studio, Video Editor |
| Personal | Money Command Centre, Job Application Copilot, Knowledge Brain, Automation Hub, Everyday English, Home Inventory Vault, Family Memory Timeline, Smart Trip Planner, Subscription Leak Detector, Life Admin Vault |
| Utilities | File Converter, PDF Intelligence, Screenshot Reader, Meeting Minutes & Decision Tracker, Inbox Intelligence, Knowledge Graph Builder |
| Developers & testers | Regex Builder, SQL Assistant, Website Change Monitor, JSON & API Response Diff, Test Data Generator, Log Analyser, Architecture Diagram Generator, Distributed Trace Explainer, Database Performance Lab, Test Coverage Intelligence, Visual Regression Checker, Dependency Risk Monitor |

The full list, with descriptions, is in [`apps.json`](apps.json). The home page is built from it.

## ProductForge

The industry apps (property, tradie, construction, cleaning, pet, logistics, gym) are built on `forge/`.
It's a shared engine for small-business records that gives you lists, boards, forms, calendars, reminders, printable
documents, photos, signatures, CSV and backup. Each new app is mostly configuration. See [`forge/README.md`](forge/README.md).

## Install it as an app

Brahaspati is an installable web app. In Chrome or Edge, choose **Install** in the address bar; on iPhone, use
Share → **Add to Home Screen**. Pages you've opened then work offline (`sw.js`, network first with an offline copy).

## Optional AI helper

Every tool works without AI. On the [AI settings](ai/) page, a visitor can turn on either:

- an **in-browser model** (WebLLM). It's private and free, but needs WebGPU and a one-off download.
- **their own free Google Gemini key**. The key is stored only in their browser.

## How it's built

There's no build step and no server. These are plain HTML and JavaScript files, served by GitHub Pages.

```
assets/style.css   shared look (light and dark)
assets/core.js     shared helpers: storage, CSV, files, tables, downloads, CDN libraries
assets/ai.js       optional AI helper
apps/<slug>/       one folder per tool: index.html, lib.js (pure logic), app.js (page wiring)
tests/             node:test tests for each tool's lib.js
```

Run the tests with Node 20 or later:

```
node --test tests/*.test.js
```

GitHub Actions runs the same tests on every push.

### Adding a tool

1. Copy an existing `apps/<slug>/` folder.
2. Add an entry to `apps.json`.
3. Add `tests/<slug>.test.js`.

Keep the logic in `lib.js` so that Node can test it.

## Licence

MIT
