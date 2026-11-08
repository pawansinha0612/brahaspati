/* Made-up sample tender and content library for "Load sample data". Not a real tender. */
(function (root) {
  'use strict';
  var RFT = [
    'Request for Tender RFT 2026-114',
    'Grounds Maintenance Services — Riverbend Shire Council',
    '',
    '1 Introduction',
    '1.1 Riverbend Shire Council (the Principal) invites tenders for grounds maintenance of parks, reserves and streetscapes for an initial term of 3 years with two 1-year extension options.',
    '1.2 This RFT was issued on 2 November 2026.',
    '',
    '2 Key dates',
    '2.1 A non-mandatory site briefing will be held at 10:00am AEDT on 17 November 2026 at the Council depot, 4 Mill Lane, Riverbend.',
    '2.2 Questions must be submitted via VendorPanel by 5:00pm AEDT on 24 November 2026.',
    '2.3 Tenders close at 2:00pm AEDT on Thursday, 3 December 2026.',
    '2.4 Tenders must remain valid for 120 days after the closing date.',
    '2.5 Council expects to notify the outcome by 12 February 2027 and services will commence on 1 March 2027.',
    '',
    '3 Submission requirements',
    '3.1 Tenders must be lodged electronically via VendorPanel. Hard copy or emailed tenders will not be accepted.',
    '3.2 The response to the evaluation criteria must not exceed 20 A4 pages, using a minimum 11 point font.',
    '3.3 Pricing must be submitted in the Excel pricing schedule provided, with all prices shown exclusive of GST.',
    '3.4 Tenderers must complete and sign the Form of Tender and all returnable schedules.',
    '3.5 Contact Officer: Megan Walsh, Procurement Officer, procurement@riverbend.example.gov.au, (03) 5555 0123.',
    '',
    '4 Mandatory requirements',
    '4.1 The tenderer must hold public liability insurance of not less than $20 million per occurrence.',
    '4.2 The tenderer must hold workers compensation insurance as required by law.',
    '4.3 The tenderer shall provide a WHS management plan and Safe Work Method Statements for mowing, tree work and chemical spraying.',
    '4.4 All staff applying herbicides are required to hold a current ChemCert accreditation.',
    '4.5 The tenderer must provide a completed modern slavery questionnaire.',
    '4.6 The Principal may reject any tender that is incomplete.',
    '',
    '5 Specification',
    '5.1 The contractor must mow all Category A parks every 14 days between October and April.',
    '5.2 The contractor shall respond to urgent safety requests within 4 hours, 7 days a week.',
    '5.3 Green waste must be disposed of at a licensed facility and recycled where possible.',
    '5.4 Tenderers should describe how they will minimise noise near schools and aged care facilities.',
    '5.5 It is desirable that the contractor uses battery-powered or low-emission equipment.',
    '5.6 Tenderers should provide a monthly report with GPS-verified service records.',
    '5.7 Preference will be given to tenderers who employ local residents and apprentices.',
    '',
    '6 Evaluation criteria',
    'Price 40%',
    'Experience and capability 25%',
    'Methodology and work health and safety 20%',
    'Environmental sustainability 10%',
    'Local industry participation 5%',
    '',
    '7 Evaluation',
    '7.1 Tenderers should provide two case studies of similar council contracts completed in the last five years, and CVs of the proposed supervisor.',
    '7.2 Tenderers must provide three referees.'
  ].join('\n');

  var LIBRARY = [
    { id: 'lib1', title: 'WHS approach — outdoor crews', type: 'Past answer', tags: 'whs safety swms risk incident', text: 'Our WHS management system is certified to ISO 45001. Every crew starts the day with a pre-start meeting and works under task-specific Safe Work Method Statements covering mowing, tree work, chemical spraying and traffic management. Incidents and near misses are reported in our app within one hour and reviewed weekly by the operations manager. We have had no lost-time injuries in the last 24 months.' },
    { id: 'lib2', title: 'Case study — Lakeside City parks contract', type: 'Case study', tags: 'council parks mowing case study experience', text: 'From 2022 to 2025 we maintained 140 parks and reserves for Lakeside City Council under a $1.2 million a year contract. We met 99% of mowing cycles on time, cut complaint numbers by 38% and introduced GPS-verified service records with a monthly report to the council.' },
    { id: 'lib3', title: 'Environmental policy and low-emission fleet', type: 'Policy', tags: 'environment sustainability battery emissions green waste recycling', text: 'Forty per cent of our handheld equipment is battery-powered, and all new mowers purchased since 2024 are low-emission models. Green waste is taken to licensed composting facilities and 92% is recycled. Our environmental management system follows ISO 14001.' },
    { id: 'lib4', title: 'CV — Daniel Brooks, Contract Supervisor', type: 'CV', tags: 'cv supervisor horticulture experience chemcert', text: 'Daniel has 15 years in open-space maintenance, including 8 years supervising council contracts. Certificate III in Horticulture, current ChemCert accreditation, first aid and traffic control tickets.' },
    { id: 'lib5', title: 'Local employment and apprentices', type: 'Past answer', tags: 'local employment apprentices community industry participation', text: 'Eighty per cent of our field staff live within 30 km of their worksites. We currently employ six apprentices and partner with the regional TAFE on a horticulture traineeship program.' },
    { id: 'lib6', title: 'Noise management near sensitive sites', type: 'Past answer', tags: 'noise schools aged care community scheduling', text: 'Near schools, hospitals and aged care facilities we schedule mowing outside drop-off, pick-up and rest times, use battery-powered blowers and trimmers, and notify site managers 48 hours in advance.' }
  ];
  root.TenderSample = { RFT: RFT, LIBRARY: LIBRARY };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TenderSample;
})(this);
