/* Job Application Copilot — pure logic (no DOM). Browser: window.JobLib. Node: require(). */
(function (root) {
  'use strict';

  // ---------- skills dictionary: "Name|alias|alias" grouped by type ----------
  var RAW = {
    language: 'JavaScript|js|ecmascript, TypeScript|ts, Python, Java, C#|csharp|c sharp, C++|cpp, Go|golang, Rust, Ruby, PHP, Kotlin, Swift, Scala, Dart, Objective-C, Perl, R language|r programming, MATLAB, Bash|shell scripting|shell script, PowerShell, Groovy, Elixir, Haskell, Lua, VBA, SQL, PL/SQL, T-SQL, HTML|html5, CSS|css3, Sass|scss, GraphQL, Solidity, COBOL',
    frontend: 'React|react.js|reactjs, Angular|angularjs, Vue|vue.js|vuejs, Svelte, Next.js|nextjs, Nuxt, Redux, jQuery, Tailwind|tailwind css, Bootstrap, Webpack, Vite, Storybook, React Native, Flutter, Ionic, Electron, Web Components, Accessibility|a11y|wcag, Responsive design, Material UI|mui, Figma',
    backend: 'Node.js|nodejs|node, Express|express.js, NestJS, Django, Flask, FastAPI, Spring|spring boot|springboot, .NET|dotnet|asp.net|.net core, Ruby on Rails|rails, Laravel, Microservices|microservice, REST|rest api|restful|rest apis, gRPC, SOAP, WebSockets|websocket, Kafka|apache kafka, RabbitMQ, Redis, Elasticsearch|elastic search, OAuth|oauth2|oauth 2.0, JWT, OpenAPI|swagger, Event-driven architecture|event driven, Serverless, API design, Hibernate, Entity Framework',
    data: 'PostgreSQL|postgres, MySQL, SQL Server|mssql, Oracle, MongoDB|mongo, DynamoDB, Cassandra, SQLite, Snowflake, BigQuery, Redshift, Databricks, Spark|apache spark|pyspark, Hadoop, Airflow|apache airflow, dbt, ETL|elt, Data warehousing|data warehouse, Data modelling|data modeling, Pandas, NumPy, Power BI|powerbi, Tableau, Looker, Excel|microsoft excel, Data analysis|data analytics, Data visualisation|data visualization, Statistics, A/B testing|ab testing, Google Analytics|ga4',
    ai: 'Machine learning|ml, Deep learning, TensorFlow, PyTorch, scikit-learn|sklearn, NLP|natural language processing, Computer vision, LLM|llms|large language models, Generative AI|genai|gen ai, Prompt engineering, RAG|retrieval augmented generation, LangChain, OpenAI, Hugging Face|huggingface, MLOps, Vector databases|vector database',
    cloud: 'AWS|amazon web services, Azure|microsoft azure, GCP|google cloud|google cloud platform, Docker, Kubernetes|k8s, Terraform, CloudFormation, Ansible, Helm, Lambda|aws lambda, EC2, S3, ECS, EKS, CloudWatch, Linux, Unix, Nginx, Apache, Git, GitHub, GitLab, Bitbucket, CI/CD|ci cd|cicd|continuous integration|continuous delivery|continuous deployment, Jenkins, GitHub Actions, GitLab CI, Azure DevOps|azure pipelines, CircleCI, Bamboo, TeamCity, ArgoCD|argo cd, DevOps, Infrastructure as code|iac, SRE|site reliability, Networking|tcp/ip, DNS, Load balancing|load balancer, CDN, Cloudflare',
    security: 'Security testing, OWASP, Penetration testing|pen testing|pentesting, Burp Suite, ZAP|owasp zap, SAST, DAST, Vulnerability scanning, IAM, SSO|single sign-on, SAML, Encryption, ISO 27001, Essential Eight, PCI DSS|pci, SOC 2|soc2, GDPR, Privacy Act',
    qa: 'Test automation|automation testing|automated testing|test automation framework, Manual testing, Selenium|selenium webdriver|webdriver, Playwright, Cypress, WebdriverIO|wdio, Puppeteer, TestCafe, Appium, Espresso, XCUITest, Detox, Cucumber, BDD|behaviour driven development|behavior driven development, Gherkin, TDD|test driven development, SpecFlow, Robot Framework, JUnit, TestNG, NUnit, xUnit, pytest, Jest, Mocha, Chai, Jasmine, Vitest, RestAssured|rest assured|rest-assured, Postman, Newman, SoapUI|soap ui, Karate, API testing|api test automation, Contract testing|pact, Integration testing, Unit testing, End-to-end testing|e2e testing|e2e, Regression testing, Smoke testing, Exploratory testing, Functional testing, UAT|user acceptance testing, Mobile testing, Cross-browser testing|cross browser testing, Visual testing|visual regression, Accessibility testing, Test strategy, Test planning|test plan, Test cases|test case design, Test management, Jira, Xray, Zephyr, TestRail, qTest, ALM|hp alm|quality center, Defect management|bug tracking, Risk-based testing|risk based testing, Shift-left|shift left, ISTQB, Page Object Model|pom, BrowserStack, Sauce Labs|saucelabs, LambdaTest, Allure, Test data management, Mocking|wiremock|mock servers, Database testing, ETL testing, Data quality, Quality engineering|quality assurance|qa',
    perf: 'Performance testing|performance test|perf testing, Load testing|load test, Stress testing, Soak testing|endurance testing, Spike testing, Scalability testing, JMeter|apache jmeter, k6|grafana k6, Gatling, LoadRunner|micro focus loadrunner, NeoLoad, Locust, Artillery, BlazeMeter, Performance engineering, Capacity planning, APM, Dynatrace, New Relic|newrelic, AppDynamics, Datadog, Grafana, Prometheus, Splunk, ELK|elk stack|kibana, OpenTelemetry, Profiling, Web performance|core web vitals|lighthouse, Chaos engineering, Observability, Monitoring',
    method: 'Agile, Scrum, Kanban, SAFe, Waterfall, Sprint planning, Jira Align, Confluence, Lean, ITIL, Six Sigma, PRINCE2, PMP, Product management, Project management, Requirements gathering|requirements analysis, Business analysis, User stories, Acceptance criteria, Stakeholder management, Release management, Change management, Incident management, Root cause analysis|rca, Code review|code reviews, Pair programming, Technical documentation|documentation, System design, Design patterns, OOP|object oriented programming|object-oriented, Clean code, SOLID, Domain-driven design|ddd, Architecture',
    soft: 'Communication|communication skills|written and verbal communication, Leadership, Mentoring|coaching, Teamwork|collaboration|team player, Problem solving|problem-solving, Critical thinking, Attention to detail|detail oriented|detail-oriented, Time management, Adaptability|flexibility, Stakeholder engagement, Customer focus|customer service|client facing|client-facing, Negotiation, Presentation skills|presenting, Ownership|accountability, Initiative|self-starter|self starter|proactive, Analytical skills|analytical, Decision making, Conflict resolution, Emotional intelligence, Creativity, Continuous improvement, Organisational skills|organizational skills, Working autonomously|work independently|autonomous, Prioritisation|prioritization, Cross-functional|cross functional',
    domain: 'Banking, Financial services|fintech, Payments, Insurance, Superannuation, Healthcare, Government, Telecommunications|telco, Retail, E-commerce|ecommerce, Gaming|wagering, Logistics, Education, SaaS, Mining, Energy, Media'
  };
  var CAT_LABEL = { language: 'Languages', frontend: 'Front end', backend: 'Back end', data: 'Data', ai: 'AI / ML', cloud: 'Cloud & DevOps', security: 'Security', qa: 'Testing & QA', perf: 'Performance', method: 'Ways of working', soft: 'Soft skills', domain: 'Industry' };
  // Short or common-word aliases that cause false hits unless written exactly
  var CASE_SENSITIVE = { 'Go': 1, 'R language': 1, 'node': 1, 'ts': 1, 'js': 1, 'ml': 1, 'pom': 1, 'qa': 1, 'e2e': 1, 'iac': 1, 'pact': 1, 'S3': 1, 'EC2': 1, 'ECS': 1, 'EKS': 1, 'APM': 1, 'ALM': 1, 'ZAP': 1, 'IAM': 1, 'Swift': 1, 'Rust': 1, 'Spring': 1, 'Express': 1, 'Lean': 1, 'Apache': 1, 'Mocha': 1, 'Chai': 1, 'Ionic': 1, 'Helm': 1, 'Locust': 1, 'Karate': 1, 'Detox': 1, 'Cucumber': 1, 'Gaming': 1, 'Mining': 1, 'Energy': 1, 'Media': 1, 'Retail': 1, 'Education': 1, 'Monitoring': 1, 'Lambda': 1 };

  var SKILLS = [];
  Object.keys(RAW).forEach(function (cat) {
    RAW[cat].split(/,\s*/).forEach(function (entry) {
      var parts = entry.split('|').map(function (s) { return s.trim(); }).filter(Boolean);
      var name = parts[0];
      // all-caps acronyms (REST, SOLID, SQL) must be written in caps, otherwise "the rest of" or "solid skills" would match
      var terms = parts.map(function (t) { return { t: t, cs: !!CASE_SENSITIVE[t] || (/^[A-Z0-9\/]{2,6}$/.test(t) && /[A-Z]/.test(t)) }; });
      if (name === 'Go') terms = [{ t: 'Go', cs: true }, { t: 'golang', cs: false }];
      if (name === 'R language') terms = [{ t: 'R language', cs: false }, { t: 'R programming', cs: false }];
      SKILLS.push({ name: name, cat: cat, terms: terms });
    });
  });
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); }
  SKILLS.forEach(function (s) {
    s.res = s.terms.map(function (x) {
      var body = escRe(x.t).replace(/\\? /g, '[\\s-]+');
      // boundaries: not inside another word; allow a trailing full stop
      return new RegExp('(^|[^A-Za-z0-9+#])' + body + '(?![A-Za-z0-9+#]|\\.[A-Za-z0-9])', x.cs ? 'g' : 'gi');
    });
  });
  // -> [{name, cat, count}] sorted by count. Longer matches win, so "GitHub Actions" is not also counted as "GitHub".
  function extractSkills(text) {
    text = String(text || '');
    var spans = [];
    SKILLS.forEach(function (s) {
      s.res.forEach(function (re) {
        re.lastIndex = 0; var m;
        while ((m = re.exec(text))) {
          var start = m.index + m[1].length, end = m.index + m[0].length;
          // "Go" as a verb ("go live", "go-to") is common in ads
          if (!(s.name === 'Go' && /^[\s-]+(live|to|ahead)\b/i.test(text.slice(end, end + 8)))) spans.push({ s: s, start: start, end: end });
          if (re.lastIndex === m.index) re.lastIndex++;
        }
      });
    });
    spans.sort(function (a, b) { return (b.end - b.start) - (a.end - a.start) || a.start - b.start; });
    var taken = [], counts = {};
    spans.forEach(function (sp) {
      if (taken.some(function (t) { return sp.start < t.end && t.start < sp.end; })) return;
      taken.push(sp); var c = counts[sp.s.name] = counts[sp.s.name] || { name: sp.s.name, cat: sp.s.cat, count: 0 }; c.count++;
    });
    return Object.keys(counts).map(function (k) { return counts[k]; }).sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
  }

  // ---------- keyword extraction (for things the dictionary does not know) ----------
  var STOP = ('a an the and or but if then else of to in on at by for with from as is are was were be been being this that these those it its our your their we you they ' +
    'i me my he she his her them who whom which what when where why how all any both each few more most other some such no nor not only own same so than too very ' +
    'can will just should now may might must would could shall do does did doing have has had having about above after again against below between into through during ' +
    'before under over up down out off further once here there also etc via per across within including include includes e.g ie eg plus able using use used ' +
    // job-ad filler
    'role roles position job opportunity opportunities candidate candidates successful applicant applicants apply application team teams work working company organisation organization ' +
    'business businesses client clients customer customers experience experienced years year strong excellent good great proven demonstrated ability abilities skills skill knowledge ' +
    'understanding responsibilities responsible key looking join environment new well within across day days based support supporting ensure ensuring provide providing ' +
    'deliver delivering delivery high quality range various multiple across including relevant related required requirements requirement essential desirable preferred ' +
    'highly role-based must-have nice-to-have benefits salary package australia sydney melbourne brisbane perth adelaide canberra hybrid remote office flexible ' +
    'full-time part-time permanent contract month months week weeks hours etc us we\'re you\'ll you\'re we\'ll it\'s don\'t who\'s what\'s get make like help people best ' +
    'one two three four five six seven eight nine ten run runs build builds test tests testing tester testers write own lead design maintain analyse analyze major every before ' +
    'manage managing improve improving create creating develop developing developer developers engineer engineers engineering technical technology technologies tools tool ' +
    'solutions solution product products projects project platform platforms systems system process processes practices practice +').split(/\s+/);
  var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = 1; });

  function tokens(text) { return String(text || '').toLowerCase().match(/[a-z][a-z0-9+#.\/-]*[a-z0-9+#]|[a-z]/g) || []; }
  function skillWordSet() {
    var s = {}; SKILLS.forEach(function (k) { k.terms.forEach(function (t) { t.t.toLowerCase().split(/\s+/).forEach(function (w) { s[w] = 1; }); }); }); return s;
  }
  var SKILL_WORDS = null;

  // -> [{term, count}] uni- and bi-grams that are not filler and not already a known skill
  function extractKeywords(text, limit) {
    SKILL_WORDS = SKILL_WORDS || skillWordSet();
    var tk = tokens(text), uni = {}, bi = {};
    for (var i = 0; i < tk.length; i++) {
      var w = tk[i]; if (STOPSET[w] || w.length < 3 || /^\d/.test(w)) continue;
      uni[w] = (uni[w] || 0) + 1;
      var n = tk[i + 1];
      if (n && !STOPSET[n] && n.length >= 3 && !/^\d/.test(n)) { var b = w + ' ' + n; bi[b] = (bi[b] || 0) + 1; }
    }
    var out = [];
    Object.keys(bi).forEach(function (b) { if (bi[b] >= 2 && !extractSkills(b).length) out.push({ term: b, count: bi[b] * 1.5 }); });
    Object.keys(uni).forEach(function (u) {
      if (SKILL_WORDS[u]) return;
      var inBi = out.some(function (o) { return o.term.split(' ').indexOf(u) >= 0 && o.count / 1.5 >= uni[u]; });
      if (!inBi && uni[u] >= 2) out.push({ term: u, count: uni[u] });
    });
    return out.sort(function (a, b) { return b.count - a.count || a.term.localeCompare(b.term); }).slice(0, limit || 25);
  }

  // ---------- requirement lines ----------
  var REQ_RE = /(\d+)\s*\+?\s*(?:-\s*\d+\s*)?(?:years?|yrs?)|must have|must be|required|essential|mandatory|minimum|at least|degree|bachelor|master'?s|certification|certified|citizen|citizenship|working rights|right to work|visa|clearance|baseline|nv1|nv2|police check|driver'?s licen[cs]e/i;
  function splitLines(text) {
    return String(text || '').split(/\r?\n|(?<=[.;])\s+(?=[A-Z•\-*])/).map(function (l) { return l.replace(/^[\s•*\-–·o]+/, '').trim(); }).filter(function (l) { return l.length > 3; });
  }
  function resumeYears(text) {
    var max = 0, re = /(\d{1,2})\s*\+?\s*(?:years?|yrs?)/gi, m;
    while ((m = re.exec(text))) max = Math.max(max, +m[1]);
    // also infer from date ranges like 2015 - Present / 2016–2024
    var yrs = [], now = new Date().getFullYear(), r2 = /\b((?:19|20)\d{2})\s*[-–to]+\s*((?:19|20)\d{2}|present|current|now)\b/gi;
    while ((m = r2.exec(text))) yrs.push([+m[1], /\d/.test(m[2]) ? +m[2] : now]);
    if (yrs.length) { var first = Math.min.apply(null, yrs.map(function (y) { return y[0]; })), last = Math.max.apply(null, yrs.map(function (y) { return y[1]; })); max = Math.max(max, last - first); }
    return max;
  }
  var REQ_HEAD = /^(what you('ll| will)? (bring|need|have)|requirements?|about you|who you are|skills (and|&) experience|you (will )?have|essential( criteria)?|selection criteria|key criteria|qualifications|must haves?|to be successful)\b/i;
  var NICE_HEAD = /^(nice to have|desirable|bonus|preferred|highly regarded|it would be great)/i;
  var OTHER_HEAD = /^(what you('ll| will)? do|responsibilities|the role|about (the|us|our)|benefits|perks|why (join|work)|what we offer|how to apply|day to day)\b/i;
  // Lines that state requirements: under a "What you bring" style heading, or containing words like "5+ years", "required"
  function requirementLines(jd) {
    var section = '', out = [];
    String(jd || '').split(/\r?\n/).forEach(function (raw) {
      var l = raw.replace(/^[\s•*\-–·o]+(?=\S)/, '').trim(); if (!l) return;
      var isHead = l.length < 60 && !/[.;]$/.test(l) && !/^[•*\-–·]/.test(raw.trim());
      if (isHead && REQ_HEAD.test(l)) { section = 'req'; if (!/:\s*\S/.test(l)) return; }
      else if (isHead && NICE_HEAD.test(l)) { section = 'nice'; if (!/:\s*\S/.test(l)) return; }
      else if (isHead && OTHER_HEAD.test(l)) { section = ''; return; }
      if (l.length > 260) return;
      var nice = section === 'nice' || NICE_HEAD.test(l) || /desirable|highly regarded|a plus|bonus|nice to have/i.test(l);
      if (section || REQ_RE.test(l)) out.push({ line: l.replace(/^(nice to have|desirable)\s*:\s*/i, ''), nice: nice });
    });
    return out;
  }
  function detectRequirements(jd, resume) {
    var ry = resume != null ? resumeYears(resume) : null, rskills = resume != null ? names(extractSkills(resume)) : null;
    return requirementLines(jd).map(function (x) {
      var line = x.line, r = { line: line, type: 'other', status: 'check', note: '', nice: x.nice };
      var y = line.match(/(\d+)\s*\+?\s*(?:-\s*\d+\s*)?(?:years?|yrs?)/i);
      if (y) {
        r.type = 'years'; r.years = +y[1];
        if (ry != null) { r.status = ry >= r.years ? 'met' : ry > 0 ? 'gap' : 'check'; r.note = ry ? 'Your resume shows about ' + ry + ' years.' : 'Add your years of experience to the resume.'; }
      } else if (/citizen|working rights|right to work|visa|clearance|baseline|nv1|nv2|police check/i.test(line)) { r.type = 'eligibility'; r.note = 'Say clearly in your resume or cover letter if you meet this.'; }
      else if (/degree|bachelor|master|certif|istqb|aws certified/i.test(line)) { r.type = 'qualification'; r.note = 'List the exact qualification name if you have it.'; }
      var ls = names(extractSkills(line));
      if (rskills && ls.length) {
        var miss = ls.filter(function (s) { return rskills.indexOf(s) < 0; });
        // "Playwright or Cypress" is met by either one; lists without "or" need all of them
        var anyOk = /\bor\b|\//i.test(line) && miss.length < ls.length;
        if (r.type === 'other' || r.type === 'years') {
          if ((!miss.length || anyOk) && r.status !== 'gap') r.status = 'met';
          else if (miss.length) { r.status = 'gap'; r.note = (r.note ? r.note + ' ' : '') + 'Not in your resume: ' + miss.join(', ') + '.'; }
        } else if (miss.length && !anyOk) r.note += ' Also not in your resume: ' + miss.join(', ') + '.';
      }
      return r;
    });
  }
  function names(list) { return list.map(function (x) { return x.name; }); }

  // ---------- resume vs JD ----------
  var BULLET_TEMPLATES = {
    qa: 'Built/extended {skill} tests for [feature or system], cutting regression time from [X] to [Y] and catching [N] defects before release.',
    perf: 'Ran {skill} for [system] at [N] users / [N] requests per second, found [bottleneck] and helped cut p95 response time by [X]%.',
    language: 'Wrote [component/tool] in {skill} that [did what], used by [who], saving [time/money].',
    frontend: 'Delivered [screen/feature] in {skill} for [N] users, improving [metric, e.g. load time or conversion] by [X]%.',
    backend: 'Designed and built [service/API] with {skill}, handling [N] requests a day with [X]% uptime.',
    data: 'Used {skill} to [analyse/model/move] [dataset], giving [team] [insight or saving] that led to [decision/result].',
    ai: 'Applied {skill} to [problem], improving [accuracy/time/cost] by [X] compared with [baseline].',
    cloud: 'Set up {skill} for [pipeline/environment], cutting deployment time from [X] to [Y] and [reducing failures/cost].',
    security: 'Ran {skill} on [system], found and helped fix [N] issues including [example], before [audit/release].',
    method: 'Worked in {skill} with [team size] people, [what you changed], which improved [velocity/quality/predictability].',
    soft: 'Showed {skill} when [situation]: [what you did], and the result was [outcome with a number if possible].',
    domain: 'Worked in {skill} on [product/system], dealing with [rules/regulation/scale specific to the industry].'
  };
  var WEAK = /^(responsible for|worked on|helped|assisted|involved in|participated in|duties included|tasked with)/i;

  function matchResume(resume, jd) {
    resume = String(resume || ''); jd = String(jd || '');
    var jdSkills = extractSkills(jd), resSkills = extractSkills(resume), have = {};
    resSkills.forEach(function (s) { have[s.name] = s.count; });
    var reqLines = requirementLines(jd).filter(function (x) { return !x.nice; }).map(function (x) { return x.line; }).join('\n');
    var reqSkills = {}; extractSkills(reqLines).forEach(function (s) { reqSkills[s.name] = 1; });
    var weighted = jdSkills.map(function (s) {
      var w = Math.min(s.count, 4) + (reqSkills[s.name] ? 2 : 0);
      if (s.cat === 'soft' || s.cat === 'domain') w *= 0.5;
      return { name: s.name, cat: s.cat, count: s.count, weight: w, required: !!reqSkills[s.name], inResume: !!have[s.name] };
    }).sort(function (a, b) { return b.weight - a.weight; });
    var tot = 0, got = 0; weighted.forEach(function (s) { tot += s.weight; if (s.inResume) got += s.weight; });

    var kws = extractKeywords(jd, 20), lowRes = resume.toLowerCase();
    var kwRows = kws.map(function (k) { return { term: k.term, count: k.count, inResume: new RegExp('(^|[^a-z0-9])' + escRe(k.term).replace(/ /g, '[\\s-]+')).test(lowRes) }; });
    var kt = 0, kg = 0; kwRows.forEach(function (k) { kt += k.count; if (k.inResume) kg += k.count; });

    var skillPart = tot ? got / tot : null, kwPart = kt ? kg / kt : null;
    if (kwRows.length < 3 && skillPart != null) kwPart = null; // too few repeated words to judge fairly
    var score = skillPart == null && kwPart == null ? 0 : skillPart == null ? kwPart : kwPart == null ? skillPart : skillPart * 0.75 + kwPart * 0.25;
    var missing = weighted.filter(function (s) { return !s.inResume; });
    return {
      score: Math.round(score * 100),
      skillScore: skillPart == null ? null : Math.round(skillPart * 100),
      keywordScore: kwPart == null ? null : Math.round(kwPart * 100),
      matched: weighted.filter(function (s) { return s.inResume; }),
      missing: missing,
      keywords: kwRows,
      requirements: detectRequirements(jd, resume),
      extraSkills: resSkills.filter(function (s) { return !weighted.some(function (w) { return w.name === s.name; }); }).map(function (s) { return s.name; }),
      suggestions: suggestions(resume, missing, kwRows)
    };
  }

  function suggestions(resume, missing, kwRows) {
    var out = [];
    missing.filter(function (s) { return s.cat !== 'soft'; }).slice(0, 5).forEach(function (s) {
      out.push({ kind: 'bullet', skill: s.name, text: (BULLET_TEMPLATES[s.cat] || BULLET_TEMPLATES.method).replace('{skill}', s.name), why: s.required ? 'Listed as a requirement in the ad.' : 'Mentioned ' + s.count + '× in the ad.' });
    });
    var soft = missing.filter(function (s) { return s.cat === 'soft'; }).slice(0, 2);
    soft.forEach(function (s) { out.push({ kind: 'bullet', skill: s.name, text: BULLET_TEMPLATES.soft.replace('{skill}', s.name.toLowerCase()), why: 'The ad asks for it; show it with an example rather than just listing it.' }); });
    var lines = resume.split(/\r?\n/).map(function (l) { return l.replace(/^[\s•*\-–·]+/, '').trim(); }).filter(Boolean);
    var weak = lines.filter(function (l) { return WEAK.test(l); });
    if (weak.length) out.push({ kind: 'tip', text: weak.length + ' line(s) start with weak phrases like “responsible for” or “worked on”. Start with a strong verb instead: built, led, cut, automated, designed, delivered.', example: weak[0] });
    var nums = (resume.match(/\d+\s*%|\$\s?\d|\d+x\b|\b\d{2,}\b/g) || []).length;
    if (lines.length > 8 && nums < 4) out.push({ kind: 'tip', text: 'Very few numbers. Add results such as “cut test time by 40%”, “200+ tests”, or “10 releases a month”.' });
    var words = resume.split(/\s+/).filter(Boolean).length;
    if (words > 1100) out.push({ kind: 'tip', text: 'About ' + words + ' words. For most Australian roles 2–3 pages is plenty; trim older roles to a line or two.' });
    var missKw = kwRows.filter(function (k) { return !k.inResume; }).slice(0, 6).map(function (k) { return k.term; });
    if (missKw.length) out.push({ kind: 'tip', text: 'The ad repeats these words that your resume does not use: ' + missKw.join(', ') + '. Use the same wording where it is true for you — recruiters and screening tools look for it.' });
    return out;
  }

  // Skills that keep coming up across all saved job ads but are not in the resume
  function skillGaps(jds, resume) {
    var have = {}; extractSkills(resume || '').forEach(function (s) { have[s.name] = 1; });
    var agg = {}, n = 0;
    (jds || []).forEach(function (jd) {
      var text = typeof jd === 'string' ? jd : jd.text, label = typeof jd === 'string' ? '' : jd.label || '';
      if (!text) return; n++;
      extractSkills(text).forEach(function (s) {
        var a = agg[s.name] = agg[s.name] || { name: s.name, cat: s.cat, ads: 0, mentions: 0, from: [] };
        a.ads++; a.mentions += s.count; if (label) a.from.push(label);
      });
    });
    return Object.keys(agg).map(function (k) { var a = agg[k]; a.share = n ? a.ads / n : 0; a.inResume = !!have[k]; return a; })
      .sort(function (a, b) { return b.ads - a.ads || b.mentions - a.mentions; });
  }

  // ---------- interview questions ----------
  var QBANK = {
    'Selenium': ['How do you deal with flaky Selenium tests? Walk me through a real one you fixed.', 'Explicit vs implicit waits — which do you use and why?', 'How have you structured a Selenium framework so it scales to hundreds of tests?'],
    'Playwright': ['Why would you pick Playwright over Selenium or Cypress for a new project?', 'How do you use fixtures, auto-waiting and tracing in Playwright?', 'How would you run Playwright tests in parallel in CI and keep them independent?'],
    'Cypress': ['What are Cypress’s limits (tabs, iframes, multiple domains) and how have you worked around them?', 'How do you stub network calls with cy.intercept and when should you not?'],
    'Appium': ['How do you set up Appium tests to run on both Android and iOS with one codebase?', 'How do you make mobile tests stable on real devices in a device farm?'],
    'API testing': ['How do you decide what to test in an API beyond the happy path?', 'How do you test authentication, rate limits and error responses?', 'Talk me through an API bug you found that UI tests would have missed.'],
    'Postman': ['How do you organise Postman collections, environments and variables for a team?', 'How do you run Postman collections in CI with Newman?'],
    'RestAssured': ['Show how you would validate a JSON schema and chain requests in RestAssured.'],
    'Contract testing': ['What problem does contract testing solve that integration tests do not?', 'Consumer-driven contracts — who owns the contract and how does it flow through CI?'],
    'Test strategy': ['You join a team with no automated tests and a release in six weeks. What do you do first?', 'How do you decide what to automate and what to keep manual?', 'How would you describe the test pyramid, and when is it the wrong model?'],
    'Regression testing': ['Your regression suite takes 4 hours. How would you bring it under 30 minutes?'],
    'Exploratory testing': ['How do you plan and report an exploratory testing session?'],
    'BDD': ['When has BDD helped a team, and when has it just added overhead?', 'How do you write good Gherkin scenarios that are not just UI scripts?'],
    'Cucumber': ['How do you keep Cucumber step definitions reusable and avoid a giant steps file?'],
    'CI/CD': ['Where do tests run in your ideal pipeline, and what blocks a release?', 'How do you handle a test that fails in CI but passes locally?'],
    'Jenkins': ['How have you set up Jenkins pipelines for test runs and reporting?'],
    'GitHub Actions': ['How would you split a slow test suite across parallel GitHub Actions jobs?'],
    'Performance testing': ['How do you work out a realistic load model for a performance test?', 'Explain the difference between load, stress, soak and spike tests with an example of each.', 'Response times look fine but throughput drops at 300 users. How do you investigate?'],
    'Load testing': ['How do you decide how many virtual users and what think time to use?', 'What would you include in a load test report for non-technical stakeholders?'],
    'JMeter': ['How do you correlate dynamic values like session tokens in JMeter?', 'How do you run JMeter at scale without the load generator becoming the bottleneck?'],
    'k6': ['How do you use thresholds and checks in k6 to pass or fail a build?', 'How would you model a ramp-up and steady state with k6 scenarios?'],
    'Gatling': ['How do you structure Gatling simulations and feeders for realistic data?'],
    'LoadRunner': ['How do you handle correlation and parameterisation in LoadRunner VuGen?'],
    'Dynatrace': ['How have you used Dynatrace (or another APM) to find the root cause of a slow transaction?'],
    'Grafana': ['Which dashboards and metrics would you set up to watch a load test live?'],
    'Observability': ['What is the difference between monitoring and observability? Give an example where it mattered.'],
    'JavaScript': ['Explain the event loop and how async/await works under the hood.', 'What is the difference between == and ===, and between let, const and var?'],
    'TypeScript': ['How does TypeScript help in a test framework? Give an example of a type that caught a bug.'],
    'Python': ['How do fixtures work in pytest and how do you share them?', 'What are list comprehensions and generators, and when would you use a generator?'],
    'Java': ['Explain the difference between an interface and an abstract class with an example from your work.', 'How does garbage collection affect performance in a Java service?'],
    'C#': ['What are async/await pitfalls in C#?', 'How do you use dependency injection in .NET?'],
    'SQL': ['Write a query to find duplicate customer emails.', 'INNER vs LEFT JOIN — give a testing example where the difference matters.', 'How would you check data was migrated correctly between two databases?'],
    'React': ['How do you avoid unnecessary re-renders in React?', 'How do you test a React component that fetches data?'],
    'Node.js': ['How would you find a memory leak in a Node.js service?'],
    'Microservices': ['How do you test a feature that spans five microservices owned by different teams?', 'What are the trade-offs of microservices versus a modular monolith?'],
    'REST': ['What makes an API RESTful? Which status codes would you return for validation errors and missing resources?'],
    'Kafka': ['How would you test an event-driven flow that goes through Kafka?'],
    'AWS': ['Which AWS services have you used and for what? How did you keep costs under control?', 'How would you design a test environment in AWS that can be spun up and torn down on demand?'],
    'Azure': ['How have you used Azure DevOps or Azure services in a delivery pipeline?'],
    'Docker': ['How do you use Docker to make test environments repeatable?', 'What is the difference between an image and a container?'],
    'Kubernetes': ['How would you troubleshoot a pod that keeps restarting?', 'How do readiness and liveness probes affect a rolling deployment?'],
    'Terraform': ['How do you manage Terraform state for a team?'],
    'Git': ['Merge vs rebase — when do you use each?'],
    'Agile': ['How does testing fit into a two-week sprint so it is not squeezed at the end?', 'What does “done” mean in your team?'],
    'Scrum': ['What do you do when stories keep arriving untestable at sprint planning?'],
    'Jira': ['How do you write a bug report that gets fixed quickly?'],
    'Stakeholder management': ['Tell me about a time you had to tell a senior stakeholder the release was not ready.'],
    'Security testing': ['How would you check a login page for the OWASP Top 10 basics?'],
    'Accessibility': ['How do you test a page for accessibility? Which tools and which manual checks?'],
    'Accessibility testing': ['What WCAG 2.2 AA issues do you find most often, and how do you report them?'],
    'Machine learning': ['How would you test a feature whose output comes from a machine learning model?'],
    'LLM': ['How would you evaluate and test an LLM-based feature where answers vary each run?'],
    'Leadership': ['Tell me about a time you led a team through a difficult change.'],
    'Mentoring': ['How have you helped a junior colleague grow? What changed for them?'],
    'Communication': ['Explain a technical problem you solved as if I were a non-technical manager.'],
    'Problem solving': ['Walk me through the hardest bug you have tracked down.']
  };
  var CAT_Q = {
    language: 'How have you used {skill} in your recent work, and what would you do differently now?',
    frontend: 'Describe something you built with {skill} that you are proud of, and how you tested it.',
    backend: 'How have you designed, tested and monitored a service built with {skill}?',
    data: 'Tell me about a time you used {skill} to answer a business question.',
    ai: 'How have you used {skill}, and how did you measure whether it worked?',
    cloud: 'What have you set up or automated with {skill}, and what went wrong along the way?',
    security: 'How have you applied {skill} in a project?',
    qa: 'How have you used {skill}, and how did it change the team’s release confidence?',
    perf: 'Describe a performance problem you found using {skill}, and what fixed it.',
    method: 'How has {skill} worked in your recent teams? What would you change?',
    soft: 'Give me an example that shows your {skill}.',
    domain: 'What do you know about the risks and rules that matter in {skill}?'
  };
  var BEHAVIOURAL = [
    { theme: 'Conflict', q: 'Tell me about a time you disagreed with a colleague or manager. What happened?' },
    { theme: 'Failure', q: 'Tell me about a mistake you made at work. What did you learn?' },
    { theme: 'Pressure', q: 'Describe a time you had to deliver under a tight deadline.' },
    { theme: 'Initiative', q: 'Tell me about something you improved without being asked.' },
    { theme: 'Influence', q: 'Describe a time you convinced others to change how they worked.' },
    { theme: 'Quality', q: 'Tell me about a time you found a serious issue late. What did you do?' },
    { theme: 'Ambiguity', q: 'Describe a project where the requirements were unclear. How did you move forward?' },
    { theme: 'Feedback', q: 'Tell me about difficult feedback you received and what you did with it.' },
    { theme: 'Teamwork', q: 'Describe your role in a team that worked really well. What made it work?' },
    { theme: 'Customer', q: 'Tell me about a time you went out of your way for a customer or user.' },
    { theme: 'Prioritising', q: 'Describe a time you had too many priorities. How did you choose?' },
    { theme: 'Learning', q: 'Tell me about a tool or skill you had to learn quickly for a project.' },
    { theme: 'Leadership', q: 'Tell me about a time you led without formal authority.' },
    { theme: 'Change', q: 'Describe a big change at work and how you handled it.' },
    { theme: 'Motivation', q: 'Why this role, and why this company?' },
    { theme: 'Strengths', q: 'What would your last manager say is your biggest strength, and one area to work on?' }
  ];
  var STAR = 'Situation — where and when, in one or two sentences.\nTask — what you were responsible for.\nAction — what YOU did, step by step (say “I”, not “we”).\nResult — what changed, with a number if you can, and what you learned.';
  var ASK_THEM = ['What does success look like in the first 90 days?', 'What is the biggest challenge the team is facing right now?', 'How do you measure quality and how are releases decided?', 'How does the team handle on-call, incidents or production issues?', 'What does the interview process look like from here?'];

  function interviewQuestions(jd, opts) {
    opts = opts || {};
    var skills = extractSkills(jd).slice(0, opts.maxSkills || 10), tech = [];
    skills.forEach(function (s) {
      var bank = QBANK[s.name];
      if (bank) bank.slice(0, opts.perSkill || 2).forEach(function (q) { tech.push({ skill: s.name, cat: s.cat, q: q }); });
      else if (s.cat !== 'soft') tech.push({ skill: s.name, cat: s.cat, q: CAT_Q[s.cat].replace('{skill}', s.name) });
    });
    // behavioural: lead with themes that match the soft skills in the ad
    var soft = skills.filter(function (s) { return s.cat === 'soft'; }).map(function (s) { return s.name.toLowerCase(); });
    var beh = BEHAVIOURAL.slice().sort(function (a, b) {
      var sa = soft.some(function (x) { return x.indexOf(a.theme.toLowerCase()) >= 0; }) ? -1 : 0, sb = soft.some(function (x) { return x.indexOf(b.theme.toLowerCase()) >= 0; }) ? -1 : 0;
      return sa - sb;
    });
    skills.filter(function (s) { return s.cat === 'soft' && QBANK[s.name]; }).forEach(function (s) { beh.unshift({ theme: s.name, q: QBANK[s.name][0] }); });
    return { technical: tech, behavioural: beh.slice(0, opts.behavioural || 8), star: STAR, askThem: ASK_THEM };
  }

  // ---------- tracker ----------
  var STATUSES = ['saved', 'applied', 'screen', 'interview', 'offer', 'rejected'];
  var STATUS_LABEL = { saved: 'Saved', applied: 'Applied', screen: 'Phone screen', interview: 'Interview', offer: 'Offer', rejected: 'Rejected' };
  var RANK = { saved: 0, applied: 1, screen: 2, interview: 3, offer: 4 };

  function setStatus(app, status, dateIso) {
    var a = Object.assign({}, app); a.history = (app.history || []).slice();
    if (a.status !== status) a.history.push({ status: status, date: dateIso });
    a.status = status; if (status === 'applied' && !a.applied) a.applied = dateIso;
    return a;
  }
  function highestStage(app) {
    var best = 0; (app.history || []).concat([{ status: app.status }]).forEach(function (h) { if (RANK[h.status] > best) best = RANK[h.status]; });
    return best;
  }
  function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }

  function trackerStats(apps, todayIso) {
    apps = apps || [];
    var by = {}; STATUSES.forEach(function (s) { by[s] = 0; }); apps.forEach(function (a) { by[a.status] = (by[a.status] || 0) + 1; });
    var sent = apps.filter(function (a) { return a.status !== 'saved'; });
    // any reply from the employer counts as a response, including a rejection
    var responded = sent.filter(function (a) { return highestStage(a) >= 2 || a.status === 'rejected'; });
    var reached = function (n) { return sent.filter(function (a) { return highestStage(a) >= n; }).length; };
    var waits = []; sent.forEach(function (a) { var first = (a.history || []).filter(function (h) { return RANK[h.status] >= 2 || h.status === 'rejected'; })[0]; if (first && a.applied) waits.push(daysBetween(a.applied, first.date)); });
    var open = apps.filter(function (a) { return a.status !== 'offer' && a.status !== 'rejected'; });
    var overdue = open.filter(function (a) { return a.nextDate && a.nextDate < todayIso; });
    var stale = apps.filter(function (a) { return a.status === 'applied' && a.applied && daysBetween(a.applied, todayIso) >= 14 && !a.nextDate; }); // ones with a next action date show as overdue instead
    return {
      total: apps.length, byStatus: by, sent: sent.length,
      responseRate: sent.length ? responded.length / sent.length : null,
      interviewRate: sent.length ? reached(3) / sent.length : null,
      offerRate: sent.length ? reached(4) / sent.length : null,
      avgDaysToReply: waits.length ? Math.round(waits.reduce(function (x, y) { return x + y; }, 0) / waits.length) : null,
      overdue: overdue, stale: stale, active: open.length
    };
  }

  // ---------- salary (AUD) ----------
  var SUPER_RATE = 0.12; // Superannuation Guarantee from 1 July 2025
  // 2026–27 resident rates (16% bracket drops to 15% from 1 July 2026). Rough guide only.
  var BRACKETS = [[18200, 0], [45000, 0.15], [135000, 0.30], [190000, 0.37], [Infinity, 0.45]];
  function incomeTax(taxable) {
    var tax = 0, prev = 0;
    for (var i = 0; i < BRACKETS.length; i++) { var top = BRACKETS[i][0]; if (taxable > prev) tax += (Math.min(taxable, top) - prev) * BRACKETS[i][1]; prev = top; }
    var lito = taxable <= 37500 ? 700 : taxable <= 45000 ? 700 - (taxable - 37500) * 0.05 : taxable <= 66667 ? 325 - (taxable - 45000) * 0.015 : 0;
    tax = Math.max(0, tax - Math.max(0, lito));
    var medicare = taxable * 0.02;
    return Math.round(tax + medicare);
  }
  function normalise(amount, includesSuper, rate) {
    rate = rate == null ? SUPER_RATE : rate; amount = Number(amount) || 0;
    var base = includesSuper ? amount / (1 + rate) : amount;
    return { base: Math.round(base), superAmt: Math.round(base * rate), package: Math.round(base * (1 + rate)), takeHome: Math.round(base - incomeTax(base)) };
  }
  function compareSalary(o) {
    var rate = o.superRate == null ? SUPER_RATE : o.superRate;
    var exp = o.expected ? normalise(o.expected, o.expectedIncludesSuper, rate) : null, off = o.offered ? normalise(o.offered, o.offeredIncludesSuper, rate) : null;
    var r = { expected: exp, offered: off, diff: null, diffPct: null, verdict: '' };
    if (exp && off) {
      r.diff = off.base - exp.base; r.diffPct = exp.base ? r.diff / exp.base : null;
      r.verdict = r.diff >= 0 ? 'The offer meets or beats what you asked for.' : Math.abs(r.diffPct) <= 0.05 ? 'Close — within 5%. A small counter-offer is reasonable.' : 'Below what you asked for by ' + Math.round(Math.abs(r.diffPct) * 100) + '%. Consider countering with your number and the reasons.';
      if (o.offeredIncludesSuper !== o.expectedIncludesSuper) r.verdict += ' (One figure included super and the other did not — both are compared as base salary here.)';
    }
    return r;
  }
  // "120k", "$120,000", "120-140k" -> {min,max}
  function parseSalaryRange(s) {
    var str = String(s || '').toLowerCase().replace(/,/g, '');
    var nums = (str.match(/\d+(\.\d+)?\s*k?/g) || []).map(function (x) { var n = parseFloat(x); return /k/.test(x) || n < 1000 ? n * 1000 : n; }).filter(function (n) { return n >= 10000; });
    if (!nums.length) return null;
    return { min: Math.min.apply(null, nums), max: Math.max.apply(null, nums) };
  }

  // ---------- samples ----------
  var SAMPLE_JD = 'Senior QA Automation Engineer — Sydney (hybrid)\n\nAbout the role\nJoin our payments platform team to lead test automation across web and API. You will build and maintain our Playwright framework in TypeScript, own API testing with Postman and RestAssured, and run performance testing with k6 before major releases.\n\nWhat you will do\n• Design the test strategy for new payment features with developers and product owners\n• Build Playwright tests in TypeScript and run them in GitHub Actions on every pull request\n• Write API tests for REST microservices and contract tests with Pact\n• Run load testing with k6 and analyse results in Grafana and Datadog\n• Mentor two junior testers and champion shift-left testing\n\nWhat you bring\n• 5+ years of experience in test automation\n• Strong TypeScript or JavaScript skills\n• Experience with Playwright or Cypress\n• Experience testing REST APIs and microservices\n• Performance testing experience with k6, JMeter or Gatling\n• CI/CD experience (GitHub Actions or Jenkins), Docker\n• Solid SQL skills for test data and database testing\n• Excellent communication and stakeholder management\n• Experience in payments or financial services is highly desirable\n• Full Australian working rights required\n\nNice to have: AWS, Kubernetes, ISTQB certification, accessibility testing.';
  var SAMPLE_RESUME = 'Priya Sharma — QA Engineer\nSydney NSW · priya@example.com\n\nSummary\nQA engineer with 6 years of experience in test automation for banking and insurance web apps. Australian citizen.\n\nExperience\nQA Automation Engineer, Big Bank (2021 – Present)\n• Built a Selenium WebDriver framework in Java with TestNG and the Page Object Model covering 450 regression tests\n• Responsible for API testing using Postman and Newman in Jenkins pipelines\n• Cut regression time from 2 days to 3 hours by running tests in parallel on BrowserStack\n• Wrote SQL queries in Oracle to set up and check test data\n• Worked on JMeter load tests for the home loan application\n\nTest Analyst, Insurance Co (2019 – 2021)\n• Manual and exploratory testing of claims portal; logged defects in Jira\n• Wrote test cases in TestRail and supported UAT with business users\n\nSkills\nJava, Selenium, TestNG, Cucumber, BDD, Postman, JMeter, SQL, Jenkins, Git, Jira, Agile, Scrum\n\nCertifications\nISTQB Foundation';
  var SAMPLE_APPS = [
    { company: 'PayRight', role: 'Senior QA Automation Engineer', status: 'interview', link: 'https://example.com/jobs/1', salary: '130-145k + super', daysAgo: 18, next: 'Prepare Playwright demo for tech interview', nextIn: 2, history: [['applied', 18], ['screen', 11], ['interview', 4]], jd: SAMPLE_JD },
    { company: 'Harbour Health', role: 'Test Lead', status: 'applied', link: '', salary: '150k', daysAgo: 20, next: 'Follow up with recruiter', nextIn: -1, history: [['applied', 20]] },
    { company: 'CloudNine Retail', role: 'Performance Test Engineer', status: 'screen', link: '', salary: '120-135k', daysAgo: 9, next: 'Phone screen with Sam', nextIn: 1, history: [['applied', 9], ['screen', 3]], jd: 'Performance Test Engineer. Must have 3+ years with JMeter or k6, LoadRunner a plus. Load testing, stress testing and soak testing of microservices on AWS. Dynatrace or New Relic APM. Analyse bottlenecks, report to stakeholders. CI/CD with Jenkins. Python or JavaScript scripting. Agile.' },
    { company: 'GovTech Services', role: 'Automation Tester', status: 'rejected', link: '', salary: '', daysAgo: 30, next: '', history: [['applied', 30], ['rejected', 21]], jd: 'Automation Tester for a government agency. Baseline security clearance required (Australian citizenship). Selenium, C#, SpecFlow, Azure DevOps, API testing, accessibility testing to WCAG 2.2 AA. Agile delivery.' },
    { company: 'Kanga Fintech', role: 'SDET', status: 'saved', link: '', salary: '140-160k', daysAgo: 1, next: 'Tailor resume and apply', nextIn: 3, history: [], jd: 'SDET to build test frameworks in TypeScript with Playwright and Jest. Contract testing with Pact. Kafka event testing. Docker, Kubernetes, GitHub Actions. 4+ years experience. Payments domain.' }
  ];

  var L = {
    SKILLS: SKILLS, CAT_LABEL: CAT_LABEL, extractSkills: extractSkills, extractKeywords: extractKeywords, detectRequirements: detectRequirements, resumeYears: resumeYears,
    matchResume: matchResume, skillGaps: skillGaps, interviewQuestions: interviewQuestions, QBANK: QBANK, BEHAVIOURAL: BEHAVIOURAL, STAR: STAR,
    STATUSES: STATUSES, STATUS_LABEL: STATUS_LABEL, setStatus: setStatus, highestStage: highestStage, trackerStats: trackerStats, daysBetween: daysBetween,
    SUPER_RATE: SUPER_RATE, incomeTax: incomeTax, normaliseSalary: normalise, compareSalary: compareSalary, parseSalaryRange: parseSalaryRange,
    SAMPLE_JD: SAMPLE_JD, SAMPLE_RESUME: SAMPLE_RESUME, SAMPLE_APPS: SAMPLE_APPS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.JobLib = L;
})(this);
