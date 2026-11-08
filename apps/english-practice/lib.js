/* Everyday English — pure logic and content (no DOM). Browser: window.EnglishLib. Node: require(). */
(function (root) {
  'use strict';

  // ---------- Australian expressions: [phrase, meaning, example, formality] ----------
  // formality: casual (fine with friends and most workplaces), neutral (fine anywhere), polite (good for work and strangers), slang (very informal), avoid (can offend)
  var EXPRESSIONS = [
    ["G'day", 'Hello', "G'day! How are you going?", 'casual'],
    ['How are you going? / How ya going?', 'How are you? (You can answer “Good, thanks, you?”)', 'How ya going, Priya? — Good thanks, you?', 'casual'],
    ['No worries', 'No problem / You’re welcome / That’s OK', 'Thanks for waiting. — No worries!', 'neutral'],
    ['Arvo', 'Afternoon', 'I’ll call you this arvo.', 'casual'],
    ['Reckon', 'Think, believe', 'I reckon it’ll rain later.', 'casual'],
    ['Heaps', 'A lot; very', 'Thanks heaps for your help.', 'casual'],
    ['Fair dinkum', 'Genuine, true; also “Really?”', 'He’s a fair dinkum expert on this.', 'slang'],
    ['Mate', 'Friend; a friendly way to address anyone', 'Cheers, mate.', 'casual'],
    ['Cheers', 'Thanks; also goodbye', 'Cheers for the coffee!', 'neutral'],
    ['Ta', 'Thanks (short)', 'Ta, that’s perfect.', 'casual'],
    ['Brekkie', 'Breakfast', 'Want to grab brekkie on Saturday?', 'casual'],
    ['Servo', 'Petrol station', 'I need to stop at the servo for fuel.', 'casual'],
    ['Bottle-o', 'Bottle shop (shop that sells alcohol)', 'Can you grab some drinks from the bottle-o?', 'casual'],
    ['Maccas', 'McDonald’s', 'The kids want Maccas for dinner.', 'casual'],
    ['Barbie', 'Barbecue', 'We’re having a barbie on Sunday.', 'casual'],
    ['Esky', 'Portable cooler box', 'Put the drinks in the esky.', 'casual'],
    ['Thongs', 'Flip-flops (sandals)', 'Don’t wear thongs on the bushwalk.', 'casual'],
    ['Sunnies', 'Sunglasses', 'Grab your sunnies, it’s bright out.', 'casual'],
    ['Togs / bathers / swimmers', 'Swimsuit (word depends on the state)', 'Bring your togs to the pool.', 'casual'],
    ['Ute', 'Utility vehicle, small pickup truck', 'He loaded the tools into the ute.', 'neutral'],
    ['Uni', 'University', 'She’s studying nursing at uni.', 'neutral'],
    ['Footy', 'Football — AFL in some states, rugby league in others', 'Are you watching the footy tonight?', 'casual'],
    ['Rego', 'Car registration', 'My rego is due next month.', 'casual'],
    ['Avo', 'Avocado', 'Smashed avo on toast, please.', 'casual'],
    ['Bikkie', 'Biscuit (cookie)', 'Would you like a bikkie with your tea?', 'casual'],
    ['Chockers', 'Completely full', 'The train was chockers this morning.', 'slang'],
    ['Stoked', 'Very happy, excited', 'I’m stoked I got the job!', 'casual'],
    ['Knackered', 'Very tired', 'I’m knackered after that shift.', 'casual'],
    ['Crook', 'Sick, unwell', 'I’m feeling a bit crook today.', 'casual'],
    ['Hard yakka', 'Hard work', 'Moving house is hard yakka.', 'slang'],
    ['Smoko', 'A short break at work', 'Let’s talk about it at smoko.', 'casual'],
    ['Chuck a sickie', 'Take a day off claiming to be sick', 'He chucked a sickie on Friday.', 'slang'],
    ['Flat out', 'Very busy', 'I’m flat out this week — can we meet Monday?', 'casual'],
    ['She’ll be right', 'It will be OK; don’t worry', 'The car’s making a noise, but she’ll be right.', 'casual'],
    ['Too easy', 'No problem; happy to do it', 'Can you send it by five? — Too easy.', 'casual'],
    ['Good on ya', 'Well done; good for you', 'You finished the course? Good on ya!', 'casual'],
    ['Not bad', 'Often means “quite good”', 'How was the movie? — Not bad at all.', 'neutral'],
    ['Bring a plate', 'Bring some food to share (not an empty plate!)', 'It’s a farewell lunch — please bring a plate.', 'neutral'],
    ['BYO', 'Bring your own (usually drinks)', 'The restaurant is BYO, so bring wine if you like.', 'neutral'],
    ['My shout', 'I’ll pay (for drinks, coffee, a meal)', 'Put your wallet away, it’s my shout.', 'casual'],
    ['Your shout', 'Your turn to pay', 'I got the last round — your shout!', 'casual'],
    ['Chuck a U-ey', 'Do a U-turn', 'We missed it — chuck a U-ey.', 'slang'],
    ['Heaps good', 'Very good (South Australia)', 'That pie was heaps good.', 'slang'],
    ['Keen', 'Interested, eager', 'Are you keen for lunch?', 'casual'],
    ['Dunno', 'Don’t know', 'Dunno, I’ll check.', 'casual'],
    ['Defo', 'Definitely', 'I’ll defo be there.', 'slang'],
    ['Suss out', 'Investigate, figure out', 'Let me suss out the parking first.', 'casual'],
    ['Sus', 'Suspicious', 'That email looks a bit sus — don’t click the link.', 'slang'],
    ['Spit the dummy', 'Lose your temper, have a tantrum', 'He spat the dummy when the meeting ran late.', 'slang'],
    ['Dead set', 'Really, truly', 'Dead set, that was the best coffee I’ve had.', 'slang'],
    ['Bloke', 'Man', 'He’s a nice bloke.', 'casual'],
    ['Sheila', 'Woman — old-fashioned and can offend; better not to use', 'Avoid: say “woman” instead.', 'avoid'],
    ['Daggy', 'Unfashionable, uncool (in a harmless way)', 'Dad’s jumper is so daggy.', 'casual'],
    ['Bogan', 'Unsophisticated person — can be insulting', 'Avoid calling people this.', 'avoid'],
    ['Tradie', 'Tradesperson (plumber, electrician, builder)', 'The tradie is coming at eight to fix the hot water.', 'neutral'],
    ['Snag', 'Sausage', 'Grab a snag from the barbie.', 'casual'],
    ['Sausage sizzle', 'Sausage in bread, often sold to raise money', 'There’s a sausage sizzle at Bunnings on Saturday.', 'neutral'],
    ['Sanga', 'Sandwich', 'I packed a sanga for lunch.', 'slang'],
    ['Cuppa', 'Cup of tea or coffee', 'Come in and have a cuppa.', 'casual'],
    ['Flat white', 'Espresso with steamed milk and a thin layer of foam', 'A large flat white, please.', 'neutral'],
    ['Long black', 'Espresso poured over hot water', 'Can I get a long black to take away?', 'neutral'],
    ['Takeaway', 'Food or drink to go', 'Is that for here or takeaway?', 'neutral'],
    ['Doona', 'Duvet, quilt', 'It’s cold — get the thick doona out.', 'casual'],
    ['Op shop', 'Charity second-hand shop', 'I found this jacket at the op shop.', 'neutral'],
    ['Woolies', 'Woolworths supermarket', 'I’ll pick up milk from Woolies.', 'casual'],
    ['Mozzie', 'Mosquito', 'The mozzies are bad tonight.', 'casual'],
    ['The bush', 'The countryside, away from cities', 'They moved out to the bush.', 'neutral'],
    ['Outback', 'The remote inland of Australia', 'We drove through the outback to Uluru.', 'neutral'],
    ['Fortnight', 'Two weeks (pay is often fortnightly)', 'I get paid every fortnight.', 'neutral'],
    ['Would you mind …?', 'Polite request', 'Would you mind sending me the file?', 'polite'],
    ['I was wondering if …', 'Very polite way to ask', 'I was wondering if we could move the meeting.', 'polite'],
    ['Do you reckon you could …?', 'Friendly request', 'Do you reckon you could cover my shift?', 'casual'],
    ['Just checking in', 'Following up gently', 'Just checking in on the report — any update?', 'polite'],
    ['Touch base', 'Have a short catch-up', 'Let’s touch base on Thursday.', 'neutral'],
    ['Circle back', 'Come back to a topic later', 'Can we circle back to the budget after lunch?', 'neutral'],
    ['Across it', 'Fully informed about something', 'Don’t worry, I’m across the changes.', 'neutral'],
    ['On the same page', 'In agreement, understanding the same thing', 'Let’s make sure we’re on the same page.', 'neutral'],
    ['Heads-up', 'Early warning', 'Just a heads-up: the server goes down at six.', 'neutral'],
    ['Run it past (someone)', 'Ask someone to check or approve', 'I’ll run it past my manager.', 'neutral'],
    ['Ballpark figure', 'Rough estimate', 'Can you give me a ballpark figure?', 'neutral'],
    ['Keep me posted', 'Keep me updated', 'Keep me posted on how the interview goes.', 'neutral'],
    ['Sounds good', 'I agree; that works', 'Meet at ten? — Sounds good.', 'neutral'],
    ['No dramas', 'No problem', 'Running five minutes late. — No dramas.', 'casual'],
    ['All good', 'It’s fine; no problem', 'Sorry I missed your call. — All good!', 'casual'],
    ['Sweet as', 'Great, fine', 'I’ll pick you up at six. — Sweet as.', 'slang'],
    ['What are you up to?', 'What are you doing / what are your plans?', 'What are you up to this weekend?', 'casual'],
    ['Catch you later', 'See you later', 'Catch you later, have a good one.', 'casual'],
    ['Have a good one', 'Have a good day', 'Thanks, have a good one!', 'casual'],
    ['Hang on a sec', 'Wait a moment', 'Hang on a sec, I’ll grab a pen.', 'casual'],
    ['Give us a hand?', 'Can you help me? (“us” here means “me”)', 'Give us a hand with these boxes?', 'casual'],
    ['Fair enough', 'That’s reasonable; I accept that', 'I can’t make it, I’m on call. — Fair enough.', 'neutral'],
    ['A fair go', 'A fair chance, equal treatment', 'Everyone deserves a fair go.', 'neutral'],
    ['Yeah, nah', 'No (polite softener)', 'Want another drink? — Yeah, nah, I’m driving.', 'casual'],
    ['Nah, yeah', 'Yes (after thinking)', 'Is it worth it? — Nah, yeah, it’s good.', 'casual'],
    ['Righto', 'OK, alright', 'Righto, let’s get started.', 'casual'],
    ['You’re right', 'No problem (said after someone apologises)', 'Sorry, did I bump you? — You’re right.', 'casual'],
    ['Ripper', 'Excellent', 'What a ripper of a day!', 'slang'],
    ['Bloody oath', 'Absolutely yes (strong; mild swear)', 'Are you coming? — Bloody oath!', 'slang'],
    ['Crikey', 'Expression of surprise', 'Crikey, that’s expensive!', 'casual'],
    ['Tucker', 'Food', 'The tucker at the party was great.', 'slang'],
    ['Grog', 'Alcohol', 'Bring your own grog.', 'slang'],
    ['Stubby', 'Small bottle of beer', 'He grabbed a stubby from the fridge.', 'casual'],
    ['Schooner / middy / pot', 'Beer glass sizes (names change by state)', 'A schooner of pale ale, thanks.', 'casual'],
    ['Rellies', 'Relatives', 'The rellies are visiting for Christmas.', 'casual'],
    ['Brolly', 'Umbrella', 'Take a brolly, it might rain.', 'casual'],
    ['Postie', 'Postal worker', 'The postie left a card — I need to collect the parcel.', 'casual'],
    ['Ambo', 'Ambulance officer, paramedic', 'The ambos arrived in ten minutes.', 'casual'],
    ['Firie', 'Firefighter', 'The firies did an amazing job.', 'casual'],
    ['Journo', 'Journalist', 'A journo called asking for a comment.', 'casual'],
    ['Dob in', 'Report someone (to a boss, police, etc.)', 'Someone dobbed him in for parking there.', 'casual'],
    ['Stuffed', 'Very tired; or broken', 'My laptop is stuffed. / I’m stuffed after the run.', 'casual'],
    ['Spewing', 'Very disappointed or annoyed', 'I’m spewing I missed the concert.', 'slang'],
    ['Bail', 'Cancel plans or leave', 'Sorry, I have to bail tonight.', 'casual'],
    ['Have a go', 'Try', 'You won’t know unless you have a go.', 'neutral'],
    ['Give it a burl', 'Give it a try', 'Never surfed before? Give it a burl!', 'slang'],
    ['Chuck', 'Throw; put', 'Chuck your bag in the boot.', 'casual'],
    ['Boot', 'Car trunk', 'The shopping is in the boot.', 'neutral'],
    ['Arvo tea', 'Afternoon tea (a snack around 3pm)', 'There’s cake for arvo tea in the kitchen.', 'casual'],
    ['Tea', 'Can mean dinner (the evening meal)', 'What’s for tea tonight?', 'casual'],
    ['Pop in / pop over', 'Visit briefly', 'Pop in any time.', 'casual'],
    ['Catch-up', 'An informal meeting', 'Let’s have a quick catch-up after lunch.', 'neutral'],
    ['Over the moon', 'Extremely happy', 'She was over the moon with the offer.', 'neutral'],
    ['Pull your weight', 'Do your fair share of work', 'Everyone on the team needs to pull their weight.', 'neutral'],
    ['Up to speed', 'Fully informed and current', 'Can you bring me up to speed on the project?', 'neutral'],
    ['Call it a day', 'Stop working for today', 'It’s six — let’s call it a day.', 'neutral']
  ].map(function (e, i) { return { id: i, phrase: e[0], meaning: e[1], example: e[2], formality: e[3] }; });

  // ---------- conversations ----------
  var CONVERSATIONS = [
    { id: 'coffee', title: 'Ordering coffee', setting: 'A busy café in the morning', lines: [['Barista', 'Morning! What can I get you?'], ['You', 'Hi, can I get a large flat white, please?'], ['Barista', 'Sure. Full cream or skim?'], ['You', 'Oat milk, if you have it.'], ['Barista', 'No worries. For here or takeaway?'], ['You', 'Takeaway, thanks.'], ['Barista', 'That’s six fifty. Name for the order?'], ['You', 'It’s Ravi. Thanks heaps.']], tip: 'Australians usually say “Can I get…” or “Could I have…”. Adding “please” and “thanks” matters more than perfect grammar.' },
    { id: 'neighbour', title: 'Meeting a neighbour', setting: 'Outside your apartment building', lines: [['Neighbour', 'G’day! You must be new — I’m Kate from number twelve.'], ['You', 'Hi Kate, nice to meet you. I’m Mei. We moved in on Saturday.'], ['Neighbour', 'Welcome! How are you finding the area?'], ['You', 'It’s lovely. Is there a good supermarket nearby?'], ['Neighbour', 'Coles is five minutes’ walk, and there’s a farmers market Sunday mornings.'], ['You', 'That’s great, thanks for the tip.'], ['Neighbour', 'No worries. Knock if you need anything.']], tip: '“How are you finding…?” means “What do you think of…?”. A short, friendly answer plus a question back keeps the chat going.' },
    { id: 'standup', title: 'Team stand-up', setting: 'A 15-minute morning meeting at work', lines: [['Lead', 'Morning all. Arjun, want to kick us off?'], ['You', 'Sure. Yesterday I finished the login tests. Today I’m picking up the payment page.'], ['Lead', 'Any blockers?'], ['You', 'Just one — I’m waiting on test data from the API team.'], ['Lead', 'Okay, I’ll chase that up after this.'], ['You', 'Thanks, that’d be great.']], tip: 'Stand-ups use short phrases: “picking up”, “blockers”, “chase that up” (follow up), “kick us off” (start).' },
    { id: 'gp', title: 'Booking a doctor', setting: 'Calling a GP clinic', lines: [['Reception', 'Good morning, Northside Medical, this is Sarah.'], ['You', 'Hi Sarah, I’d like to make an appointment with a GP, please.'], ['Reception', 'Have you been here before?'], ['You', 'No, it’s my first time.'], ['Reception', 'No problem. Do you have a Medicare card?'], ['You', 'Yes, I do. Is there anything available today?'], ['Reception', 'We have 3:15 with Dr Nguyen.'], ['You', 'Perfect, I’ll take that. Thank you.']], tip: '“GP” is a general practitioner (family doctor). “Bulk billing” means Medicare covers the whole fee.' },
    { id: 'rental', title: 'Rental inspection', setting: 'An open house for a flat to rent', lines: [['Agent', 'Hi there, can I grab your name and number for the sign-in?'], ['You', 'Sure, it’s Ali Hassan, 0412 345 678.'], ['Agent', 'Thanks. Have a look around and let me know if you have any questions.'], ['You', 'Is the rent negotiable, and when is it available?'], ['Agent', 'It’s available from the first. The owner’s firm on price, I’m afraid.'], ['You', 'Fair enough. Are pets allowed?'], ['Agent', 'Pets are considered on application.'], ['You', 'Great. How do I apply?']], tip: '“Firm on price” means they won’t lower it. “Considered on application” means maybe — ask when you apply.' },
    { id: 'smalltalk', title: 'Monday small talk', setting: 'The office kitchen', lines: [['Colleague', 'Hey, how was your weekend?'], ['You', 'Pretty good, thanks. We went to the beach on Sunday. How about you?'], ['Colleague', 'Not bad — just caught up on some sleep. Which beach?'], ['You', 'Manly. It was packed, but the water was great.'], ['Colleague', 'Ah nice. I reckon it’ll be even busier next weekend.'], ['You', 'Probably! Anyway, I’d better get back to it. Catch you later.']], tip: 'Small talk is short and light. Answer, add one detail, then ask back. “I’d better get back to it” is a polite way to leave.' },
    { id: 'bank', title: 'Calling the bank', setting: 'Phone call about a card problem', lines: [['Bank', 'Thanks for calling. Can I start with your full name and date of birth?'], ['You', 'Yes, it’s Sunita Rao, the fourth of March, 1990.'], ['Bank', 'Thanks Sunita. How can I help today?'], ['You', 'I think my card has been charged twice for the same purchase.'], ['Bank', 'I’m sorry to hear that. Which transaction is it?'], ['You', 'It’s eighty-four dollars at Kmart on the second.'], ['Bank', 'I can see that. I’ll lodge a dispute for you — it takes up to ten business days.'], ['You', 'Thanks. Could I get a reference number, please?']], tip: 'Say dates as “the fourth of March”. Always ask for a reference number at the end of a call.' },
    { id: 'shop', title: 'Returning an item', setting: 'At a store counter', lines: [['Staff', 'Hi, how can I help?'], ['You', 'Hi, I’d like to return these headphones. The left side doesn’t work.'], ['Staff', 'Oh, sorry about that. Do you have the receipt?'], ['You', 'Yes, here it is. I bought them last week.'], ['Staff', 'Would you like a replacement or a refund?'], ['You', 'A refund, please, back onto my card.'], ['Staff', 'No worries, just tap your card here.']], tip: 'Under Australian Consumer Law you can get a repair, replacement or refund for faulty items. Say clearly what is wrong and what you want.' },
    { id: 'interview-open', title: 'Interview opening', setting: 'The first minute of a job interview', lines: [['Interviewer', 'Thanks for coming in. Did you find us okay?'], ['You', 'Yes, thanks — the directions were really clear.'], ['Interviewer', 'Great. So, tell me a bit about yourself.'], ['You', 'Sure. I’m a QA engineer with six years’ experience, mostly in banking. Lately I’ve been leading test automation with Playwright.'], ['Interviewer', 'What made you apply for this role?'], ['You', 'I’m keen to work on payments, and I like that your team ships every week.']], tip: 'Keep “tell me about yourself” to about a minute: current role, strongest skill, why this job.' }
  ];

  // ---------- grammar drills (multiple choice) ----------
  var GRAMMAR = [
    { q: 'I ___ in Sydney since 2019.', options: ['live', 'am living', 'have lived'], answer: 2, why: 'Use present perfect (have lived) for something that started in the past and continues now, with “since”.' },
    { q: 'I ___ with your idea.', options: ['am agree', 'agree', 'am agreeing'], answer: 1, why: '“Agree” is a verb, so you don’t need “am”: I agree.' },
    { q: 'She has worked here ___ three years.', options: ['since', 'for', 'from'], answer: 1, why: 'Use “for” with a length of time (three years) and “since” with a starting point (2019).' },
    { q: 'Let’s ___ the plan tomorrow.', options: ['discuss about', 'discuss', 'discuss on'], answer: 1, why: '“Discuss” already includes “about”: discuss the plan. (But: talk about the plan.)' },
    { q: 'This version is ___ than the old one.', options: ['more better', 'more good', 'better'], answer: 2, why: '“Better” is already the comparative of “good”. Don’t add “more”.' },
    { q: 'He ___ like coffee.', options: ['don’t', 'doesn’t', 'not'], answer: 1, why: 'With he/she/it use “doesn’t”.' },
    { q: 'I didn’t see ___ at the office.', options: ['nobody', 'anybody', 'no one'], answer: 1, why: 'Avoid double negatives. “Didn’t” is already negative, so use “anybody”.' },
    { q: 'She is ___ engineer.', options: ['a', 'an', '—'], answer: 1, why: 'Use “an” before a vowel sound: an engineer. And jobs need an article in English.' },
    { q: 'It takes about ___ hour to get there.', options: ['a', 'an', 'the'], answer: 1, why: '“Hour” starts with a silent h, so it has a vowel sound: an hour.' },
    { q: 'He studied at ___ university in Melbourne.', options: ['a', 'an', '—'], answer: 0, why: '“University” starts with a “you” sound, so use “a”.' },
    { q: 'Could you ___ how this works?', options: ['explain me', 'explain to me', 'explain me about'], answer: 1, why: 'We explain something TO someone: explain to me / explain it to me.' },
    { q: 'He ___ me the meeting was cancelled.', options: ['said', 'told', 'said to'], answer: 1, why: '“Tell” takes a person (told me). “Say” doesn’t (he said the meeting…).' },
    { q: 'Can you give me some ___?', options: ['advices', 'advice', 'an advice'], answer: 1, why: '“Advice” is uncountable — no plural, no “an”. Say “some advice” or “a piece of advice”.' },
    { q: 'I need more ___ about the job.', options: ['informations', 'information', 'an information'], answer: 1, why: '“Information” is uncountable.' },
    { q: 'One of my ___ lives in Perth.', options: ['friend', 'friends', 'friend’s'], answer: 1, why: '“One of” is followed by a plural noun: one of my friends.' },
    { q: 'If I ___ you, I’d take the offer.', options: ['was', 'were', 'am'], answer: 1, why: 'In “if I were you”, use “were” (it’s an imaginary situation).' },
    { q: 'They ___ at the meeting yesterday.', options: ['was', 'were', 'is'], answer: 1, why: 'Use “were” with they/we/you.' },
    { q: 'I ___ a car.', options: ['am having', 'have', 'having'], answer: 1, why: 'Verbs for owning (have, own), knowing and liking are not usually used in -ing form.' },
    { q: 'You ___ told me earlier!', options: ['should of', 'should have', 'should’ve of'], answer: 1, why: '“Should’ve” sounds like “should of”, but it is “should have”.' },
    { q: '___ going to be late — the train is delayed.', options: ['Your', 'You’re', 'Youre'], answer: 1, why: '“You’re” = you are. “Your” shows ownership (your bag).' },
    { q: 'The company changed ___ logo.', options: ['it’s', 'its', 'its’'], answer: 1, why: '“Its” shows ownership. “It’s” = it is / it has.' },
    { q: 'Don’t ___ your keys!', options: ['loose', 'lose', 'loss'], answer: 1, why: '“Lose” is the verb (to not have any more). “Loose” means not tight.' },
    { q: 'This is better ___ I expected.', options: ['then', 'than', 'that'], answer: 1, why: 'Use “than” to compare. “Then” is about time (and then…).' },
    { q: 'Please ___ the meeting to 2 pm.', options: ['prepone', 'bring forward', 'advance back'], answer: 1, why: '“Prepone” isn’t used in Australia. Say “bring forward” or “move it earlier”.' },
    { q: 'I will ___ to you by Friday.', options: ['revert back', 'get back', 'return back'], answer: 1, why: 'In Australia “get back to you” is natural. “Revert” sounds odd here, and “back” after return/revert repeats itself.' },
    { q: 'How long ___ you been waiting?', options: ['are', 'have', 'did'], answer: 1, why: 'Present perfect continuous: have you been waiting.' },
    { q: 'Everyone ___ invited to the lunch.', options: ['are', 'is', 'were'], answer: 1, why: '“Everyone” is singular: everyone is.' },
    { q: 'I ___ to the shops yesterday.', options: ['go', 'have went', 'went'], answer: 2, why: 'Past simple for a finished time (yesterday): went. “Have went” is never correct — it’s “have gone”.' },
    { q: 'We ___ finished the report yet.', options: ['didn’t', 'haven’t', 'don’t'], answer: 1, why: 'With “yet”, Australians normally use present perfect: haven’t finished.' },
    { q: 'I’m looking forward to ___ you.', options: ['meet', 'meeting', 'met'], answer: 1, why: 'After “look forward to”, use the -ing form.' },
    { q: 'Can I ___ a large flat white?', options: ['get', 'getting', 'to get'], answer: 0, why: 'After “can”, use the base verb: can I get / could I have.' },
    { q: 'There ___ a lot of people at the beach.', options: ['was', 'were', 'is'], answer: 1, why: '“People” is plural, so “there were”.' }
  ];

  // ---------- speaking prompts: an open question plus a model sentence to say aloud ----------
  var SPEAKING = [
    { prompt: 'Introduce yourself to a new colleague.', model: 'Hi, I’m new on the team. I started on Monday and I’m working on the mobile app.' },
    { prompt: 'Order lunch at a café.', model: 'Could I please get a chicken salad and a long black to take away?' },
    { prompt: 'Ask your manager for a day off.', model: 'Would it be okay if I took next Friday off? I have a family event.' },
    { prompt: 'Describe your weekend.', model: 'It was pretty relaxed. We went for a walk by the harbour and had brunch with friends.' },
    { prompt: 'Explain a delay politely.', model: 'Sorry for the delay. I’m waiting on one more approval and will send it by three.' },
    { prompt: 'Ask a stranger for directions.', model: 'Excuse me, do you know how to get to the train station from here?' },
    { prompt: 'Make a doctor’s appointment.', model: 'Hi, I’d like to book an appointment with a GP this week, please.' },
    { prompt: 'Leave a voicemail for a recruiter.', model: 'Hi, it’s Ravi returning your call about the tester role. You can reach me on this number.' },
    { prompt: 'Disagree politely in a meeting.', model: 'I see your point, but I think we should test it properly before we release it.' },
    { prompt: 'Thank someone for their help.', model: 'Thanks heaps for your help today. I really appreciate it.' },
    { prompt: 'Ask for clarification.', model: 'Sorry, could you say that again? I didn’t quite catch the last part.' },
    { prompt: 'Talk about your job.', model: 'I work as a software tester. I make sure our apps work properly before customers use them.' },
    { prompt: 'Make small talk about the weather.', model: 'It’s a beautiful day, isn’t it? I reckon it’ll be hot this afternoon.' },
    { prompt: 'Complain about a faulty item.', model: 'I bought this kettle last week and it’s stopped working. Could I get a refund, please?' },
    { prompt: 'Answer “Why do you want this job?”', model: 'I’m keen to grow in test automation, and I really like the products your team builds.' },
    { prompt: 'Invite a colleague for coffee.', model: 'Are you keen to grab a coffee after the meeting? My shout.' },
    { prompt: 'Report a problem to your landlord.', model: 'Hi, the hot water stopped working this morning. Could you please send a plumber?' },
    { prompt: 'Say you are running late.', model: 'Hi, just a heads-up that I’m running about ten minutes late. Sorry about that.' },
    { prompt: 'Ask for a reference number.', model: 'Before you go, could I please get a reference number for this call?' },
    { prompt: 'Describe your hometown.', model: 'I grew up in Pune. It’s a busy city with great food and lots of students.' },
    { prompt: 'Accept a job offer.', model: 'Thank you so much for the offer. I’m very happy to accept and I’m looking forward to starting.' },
    { prompt: 'Ask about rent at an inspection.', model: 'Is the rent negotiable, and is the bond four weeks?' },
    { prompt: 'End a phone call politely.', model: 'Thanks for your help. Have a good one. Bye.' },
    { prompt: 'Give an update at stand-up.', model: 'Yesterday I fixed two bugs. Today I’m testing the new search, and I have no blockers.' },
    { prompt: 'Say no to an invitation politely.', model: 'Thanks for the invite, but I can’t make it this time. Maybe next week?' }
  ];

  // ---------- role-play scenarios: branching scripts ----------
  // node: {say, choices:[{text, next, score(2 good,1 ok,0 poor), feedback}]}; next 'end' finishes
  var SCENARIOS = [
    { id: 'cafe', title: 'At the café', desc: 'Order, handle a mix-up and pay.', start: 'a', nodes: {
      a: { who: 'Barista', say: 'Hi there! What can I get for you?', choices: [
        { text: 'Hi! Could I get a small cappuccino, please?', next: 'b', score: 2, feedback: 'Polite and natural.' },
        { text: 'Give me cappuccino.', next: 'b', score: 0, feedback: 'Sounds rude in Australia. Add “Could I get…” and “please”.' },
        { text: 'I want one cappuccino small.', next: 'b', score: 1, feedback: 'Understood, but “I want” is blunt and the word order is off. Try “Could I get a small cappuccino?”' }] },
      b: { who: 'Barista', say: 'Sure. Have here or take away?', choices: [
        { text: 'Take away, thanks.', next: 'c', score: 2, feedback: 'Short and natural.' },
        { text: 'Parcel, please.', next: 'c', score: 0, feedback: '“Parcel” isn’t used for food here. Say “take away”.' },
        { text: 'I will have it here only.', next: 'c', score: 1, feedback: 'Clear, but “only” at the end sounds unusual. Just “Here, thanks.”' }] },
      c: { who: 'Barista', say: 'Here you go — one large latte!', choices: [
        { text: 'Sorry, I think I ordered a small cappuccino.', next: 'd', score: 2, feedback: 'Perfect — “Sorry, I think…” is a soft, polite way to correct someone.' },
        { text: 'This is wrong.', next: 'd', score: 0, feedback: 'Too direct. Softening with “Sorry, I think…” works better.' },
        { text: 'Oh, it’s fine, I’ll take it.', next: 'd', score: 1, feedback: 'Friendly, but you can politely ask for what you ordered.' }] },
      d: { who: 'Barista', say: 'Oh, my bad! I’ll fix that for you. That’s five twenty.', choices: [
        { text: 'No worries. Can I tap my card?', next: 'end', score: 2, feedback: 'Great — “No worries” is exactly what a local would say.' },
        { text: 'Okay. Card.', next: 'end', score: 1, feedback: 'Fine, but a full sentence sounds friendlier.' }] }
    } },
    { id: 'doctor', title: 'At the GP', desc: 'Explain your symptoms clearly.', start: 'a', nodes: {
      a: { who: 'Doctor', say: 'Come in, have a seat. What brings you in today?', choices: [
        { text: 'I’ve had a sore throat and a fever for three days.', next: 'b', score: 2, feedback: 'Clear symptom plus how long — exactly what doctors need.' },
        { text: 'I am having fever since three days.', next: 'b', score: 1, feedback: 'Understood. More natural: “I’ve had a fever for three days.”' },
        { text: 'I’m sick.', next: 'b', score: 0, feedback: 'Too vague. Say what hurts and for how long.' }] },
      b: { who: 'Doctor', say: 'Okay. Any cough or trouble breathing?', choices: [
        { text: 'A bit of a dry cough, but my breathing’s fine.', next: 'c', score: 2, feedback: 'Precise and natural.' },
        { text: 'Yes cough. No breathing.', next: 'c', score: 0, feedback: '“No breathing” sounds alarming! Say “No trouble breathing.”' },
        { text: 'Little cough is there.', next: 'c', score: 1, feedback: 'Understood. More natural: “I have a slight cough.”' }] },
      c: { who: 'Doctor', say: 'Are you taking any medication or do you have any allergies?', choices: [
        { text: 'Just paracetamol. I’m allergic to penicillin.', next: 'd', score: 2, feedback: 'Very important information, clearly given.' },
        { text: 'No.', next: 'd', score: 1, feedback: 'Fine if true — but always mention allergies and anything you’ve taken.' }] },
      d: { who: 'Doctor', say: 'It looks viral. Rest, fluids, and come back if it’s not better in a week. Do you need a medical certificate for work?', choices: [
        { text: 'Yes please, for today and tomorrow.', next: 'end', score: 2, feedback: 'Good — you asked for exactly what you need.' },
        { text: 'What is medical certificate?', next: 'end', score: 1, feedback: 'Good to ask! It’s a note for your employer. Try: “Sorry, what’s a medical certificate for?”' }] }
    } },
    { id: 'interview', title: 'Job interview', desc: 'Answer common questions with confidence.', start: 'a', nodes: {
      a: { who: 'Interviewer', say: 'Thanks for coming in. Tell me a bit about yourself.', choices: [
        { text: 'I’m a tester with five years’ experience in banking apps. Recently I’ve been building automated tests, which I really enjoy.', next: 'b', score: 2, feedback: 'Short, relevant, ends with what you enjoy. Great.' },
        { text: 'I was born in 1992 in Chennai and I did my schooling at…', next: 'b', score: 0, feedback: 'Too far back. Start with your current work, not your life story.' },
        { text: 'Myself Arun. I am having five years experience.', next: 'b', score: 1, feedback: 'Common Indian-English phrasing. In Australia say “I’m Arun. I have five years’ experience.”' }] },
      b: { who: 'Interviewer', say: 'Tell me about a time you disagreed with a team member.', choices: [
        { text: 'In my last project a developer wanted to skip testing. I explained the risk with data from past bugs, and we agreed on a quick smoke test. It caught a major issue.', next: 'c', score: 2, feedback: 'A clear STAR answer: situation, action, result.' },
        { text: 'I never disagree with anyone.', next: 'c', score: 0, feedback: 'Not believable. Interviewers want to see how you handle conflict.' },
        { text: 'Sometimes developers don’t like my bugs, but we sort it out.', next: 'c', score: 1, feedback: 'Too general. Give one real example with a result.' }] },
      c: { who: 'Interviewer', say: 'What are your salary expectations?', choices: [
        { text: 'Based on the role and market, I’m looking at around 120 to 130 thousand plus super. Is that in your range?', next: 'd', score: 2, feedback: 'Confident, specific, mentions super, and turns it into a conversation.' },
        { text: 'Whatever you think is fine.', next: 'd', score: 0, feedback: 'You may get offered less. Give a researched range.' },
        { text: 'I want 30% hike on my current.', next: 'd', score: 1, feedback: '“Hike” is not used for pay here — say “increase”. Better to give a market range.' }] },
      d: { who: 'Interviewer', say: 'Do you have any questions for us?', choices: [
        { text: 'Yes — what would success look like in the first three months?', next: 'end', score: 2, feedback: 'Excellent question. Shows you’re thinking about doing well.' },
        { text: 'No, everything is clear.', next: 'end', score: 0, feedback: 'Always ask at least one question. It shows interest.' },
        { text: 'How many leaves will I get?', next: 'end', score: 1, feedback: 'Fair question, but in Australia say “leave” (not “leaves”) and save it for later stages.' }] }
    } },
    { id: 'rental', title: 'Rental inspection', desc: 'Ask the right questions at an open home.', start: 'a', nodes: {
      a: { who: 'Agent', say: 'Hi, welcome. Can I grab your name and number?', choices: [
        { text: 'Sure, I’m Leila. My number is 0412 555 019.', next: 'b', score: 2, feedback: 'Clear. Say mobile numbers in groups: “oh-four-one-two…”.' },
        { text: 'Why do you need it?', next: 'b', score: 1, feedback: 'Fair to ask, but agents need it for the sign-in and follow-up. Sounds a bit defensive.' }] },
      b: { who: 'Agent', say: 'Thanks. Have a look around. Any questions, just ask.', choices: [
        { text: 'Thanks. Is the rent negotiable, and when is it available?', next: 'c', score: 2, feedback: 'Two useful questions in one.' },
        { text: 'What is the lowest rent you can do?', next: 'c', score: 1, feedback: 'Very direct. In the current market, ask “Is there any flexibility on the rent?”' }] },
      c: { who: 'Agent', say: 'It’s available from the 15th. The owner’s pretty firm on the price.', choices: [
        { text: 'Fair enough. Is there air-conditioning, and who looks after the garden?', next: 'd', score: 2, feedback: 'Good practical questions. “Fair enough” accepts the answer politely.' },
        { text: 'Okay fine.', next: 'd', score: 1, feedback: 'Okay, but use the chance to ask practical questions.' }] },
      d: { who: 'Agent', say: 'There’s a split system in the lounge, and the tenant does the garden. You can apply online tonight.', choices: [
        { text: 'Great, thanks. I’ll apply tonight. Could you email me the link?', next: 'end', score: 2, feedback: 'Shows you’re keen and organised.' },
        { text: 'I will think and revert.', next: 'end', score: 0, feedback: '“Revert” sounds odd in Australia. Say “I’ll think about it and get back to you.”' }] }
    } },
    { id: 'smalltalk', title: 'Workplace small talk', desc: 'Chat in the office kitchen.', start: 'a', nodes: {
      a: { who: 'Colleague', say: 'Morning! How was your weekend?', choices: [
        { text: 'Pretty good, thanks! We went to a market on Saturday. How was yours?', next: 'b', score: 2, feedback: 'Answer + detail + question back. Perfect small talk.' },
        { text: 'Good.', next: 'b', score: 1, feedback: 'A bit short — add one detail and ask back.' },
        { text: 'It was very bad, I had many problems with my landlord and…', next: 'b', score: 0, feedback: 'Small talk stays light. Save big problems for close friends.' }] },
      b: { who: 'Colleague', say: 'Not bad — just took it easy. Are you keen for the Friday drinks this week?', choices: [
        { text: 'Yeah, sounds good! Where is it this time?', next: 'c', score: 2, feedback: 'Natural and friendly.' },
        { text: 'I don’t drink alcohol.', next: 'c', score: 1, feedback: 'Totally fine! You can still go. Try “I don’t drink, but I’m happy to come for a lemonade.”' }] },
      c: { who: 'Colleague', say: 'The pub on the corner, about five. Anyway, I’d better get back to it.', choices: [
        { text: 'Same here. Catch you later!', next: 'end', score: 2, feedback: 'Perfect way to end the chat.' },
        { text: 'Okay bye.', next: 'end', score: 1, feedback: 'Fine — “Catch you later!” sounds more local.' }] }
    } },
    { id: 'bank', title: 'Phone call to the bank', desc: 'Sort out a card problem by phone.', start: 'a', nodes: {
      a: { who: 'Bank', say: 'Thanks for calling. For security, can you tell me your full name and date of birth?', choices: [
        { text: 'Sure. It’s Wei Zhang, the twelfth of June, 1988.', next: 'b', score: 2, feedback: 'Clear. Australians say dates day first.' },
        { text: '1988, June, 12.', next: 'b', score: 1, feedback: 'Understood, but say it day-month-year: “the twelfth of June, 1988”.' }] },
      b: { who: 'Bank', say: 'Thank you. How can I help today?', choices: [
        { text: 'I can see a payment I don’t recognise — 59 dollars to an online store on Tuesday.', next: 'c', score: 2, feedback: 'Specific: amount, merchant and date. Makes the call quick.' },
        { text: 'There is problem in my account.', next: 'c', score: 0, feedback: 'Too vague, and add “a”: “There’s a problem with my account.” Then say what it is.' }] },
      c: { who: 'Bank', say: 'I’ll block that card now and send a new one. It’ll take five to seven business days.', choices: [
        { text: 'Thanks. Can I still use Apple Pay in the meantime?', next: 'd', score: 2, feedback: 'Good follow-up question.' },
        { text: 'Okay.', next: 'd', score: 1, feedback: 'Fine — but ask anything you need to know before hanging up.' }] },
      d: { who: 'Bank', say: 'A new digital card will be ready in the app shortly. Anything else?', choices: [
        { text: 'No, that’s all. Could I get a reference number for this call, please?', next: 'end', score: 2, feedback: 'Always get a reference number. Well done.' },
        { text: 'No thanks, bye.', next: 'end', score: 1, feedback: 'Polite, but a reference number helps if there’s a problem later.' }] }
    } },
    { id: 'govoffice', title: 'Government service centre', desc: 'Get help at a service counter.', start: 'a', nodes: {
      a: { who: 'Officer', say: 'Hi, have you got a ticket number?', choices: [
        { text: 'Yes, it’s B42. I’d like to update my address, please.', next: 'b', score: 2, feedback: 'Clear and to the point.' },
        { text: 'I need to change address. Very urgent.', next: 'b', score: 1, feedback: 'Understood, but “urgent” can sound demanding. Explain why if it really is.' }] },
      b: { who: 'Officer', say: 'No problem. Can I see some ID?', choices: [
        { text: 'Here’s my driver’s licence. I also have a bill with the new address.', next: 'c', score: 2, feedback: 'Bringing proof of address saves time. Great.' },
        { text: 'What ID?', next: 'c', score: 1, feedback: 'Better: “Sure — is a passport okay?”' }] },
      c: { who: 'Officer', say: 'Thanks. Most people can do this online now — do you have an account set up?', choices: [
        { text: 'Not yet. Could you show me how to set it up?', next: 'd', score: 2, feedback: 'Great — asking for help is normal and staff are happy to show you.' },
        { text: 'I don’t like computers.', next: 'd', score: 1, feedback: 'Honest! You can still ask: “Could you help me do it here today?”' }] },
      d: { who: 'Officer', say: 'All done. You’ll get a confirmation by email. Anything else?', choices: [
        { text: 'That’s everything. Thanks so much for your help.', next: 'end', score: 2, feedback: 'Warm and polite.' },
        { text: 'Okay.', next: 'end', score: 1, feedback: 'Add a thank-you — it goes a long way.' }] }
    } }
  ];

  // ---------- seeded daily set ----------
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var a = seed; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function pickN(arr, n, r) { var idx = arr.map(function (_, i) { return i; }), out = []; while (out.length < n && idx.length) out.push(arr[idx.splice(Math.floor(r() * idx.length), 1)[0]]); return out; }
  function dailySet(dateIso) {
    var r = rng(hash('bh-english:' + dateIso));
    return {
      date: dateIso,
      conversation: pickN(CONVERSATIONS, 1, r)[0],
      expressions: pickN(EXPRESSIONS.filter(function (e) { return e.formality !== 'avoid'; }), 3, r),
      grammar: pickN(GRAMMAR, 3, r),
      speaking: pickN(SPEAKING, 1, r)[0]
    };
  }

  // ---------- speech comparison ----------
  var CONTRACTIONS = { "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are', "it's": 'it is', "that's": 'that is', "there's": 'there is', "what's": 'what is', "he's": 'he is', "she's": 'she is',
    "can't": 'cannot', "won't": 'will not', "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not', "haven't": 'have not', "hasn't": 'has not', "couldn't": 'could not', "shouldn't": 'should not', "wouldn't": 'would not',
    "i'll": 'i will', "you'll": 'you will', "we'll": 'we will', "they'll": 'they will', "it'll": 'it will', "i've": 'i have', "we've": 'we have', "you've": 'you have', "they've": 'they have', "i'd": 'i would', "you'd": 'you would', "that'd": 'that would', "let's": 'let us', "g'day": 'gday' };
  var NUMS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  function words(text) {
    var s = String(text || '').toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9' ]+/g, ' ');
    var out = [];
    s.split(/\s+/).forEach(function (w) {
      w = w.replace(/^'+|'+$/g, ''); if (!w) return;
      if (CONTRACTIONS[w]) { out.push.apply(out, CONTRACTIONS[w].split(' ')); return; }
      if (/^\d+$/.test(w) && +w <= 20) { out.push(NUMS[+w]); return; }
      out.push(w.replace(/'s$/, 's'));
    });
    return out;
  }
  function lev(a, b) {
    var m = a.length, n = b.length, d = []; for (var i = 0; i <= m; i++) { d[i] = [i]; } for (var j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  // -> {score 0..100, ops:[{word, said?, status:'ok'|'close'|'missed'|'extra'}], heard, expected}
  function compareSpeech(target, spoken) {
    var t = words(target), s = words(spoken), m = t.length, n = s.length, L = [];
    for (var i = 0; i <= m; i++) { L[i] = []; for (var j = 0; j <= n; j++) L[i][j] = 0; }
    for (i = m - 1; i >= 0; i--) for (j = n - 1; j >= 0; j--) L[i][j] = t[i] === s[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var ops = []; i = 0; j = 0;
    while (i < m || j < n) {
      if (i < m && j < n && t[i] === s[j]) { ops.push({ word: t[i], status: 'ok' }); i++; j++; }
      else if (j < n && (i >= m || L[i][j + 1] > L[i + 1][j])) { ops.push({ word: s[j], status: 'extra' }); j++; }
      else { ops.push({ word: t[i], status: 'missed' }); i++; }
    }
    // a missed word next to an extra word that sounds similar counts as "close" (e.g. "coffee"/"coffees")
    var merged = [];
    for (var k = 0; k < ops.length; k++) {
      var a = ops[k], b = ops[k + 1], c = ops[k + 2];
      // "take away" said as "takeaway" (or the other way round) is fine
      if (b && c && a.status === b.status && a.status !== 'ok' && c.status !== 'ok' && c.status !== a.status && a.word + b.word === c.word) {
        merged.push({ word: a.status === 'missed' ? a.word + ' ' + b.word : c.word, status: 'ok', joined: true }); if (a.status === 'missed') merged.push({ word: '', status: 'okpart' }); k += 2; continue;
      }
      if (b && c && c.status === b.status && a.status !== 'ok' && b.status !== 'ok' && a.status !== b.status && b.word + c.word === a.word) {
        merged.push({ word: a.status === 'missed' ? a.word : b.word + ' ' + c.word, status: 'ok', joined: true }); if (a.status === 'extra') merged.push({ word: '', status: 'okpart' }); k += 2; continue;
      }
      if (b && ((a.status === 'missed' && b.status === 'extra') || (a.status === 'extra' && b.status === 'missed'))) {
        var exp = a.status === 'missed' ? a.word : b.word, said = a.status === 'missed' ? b.word : a.word;
        if (lev(exp, said) <= Math.max(1, Math.floor(exp.length / 3))) { merged.push({ word: exp, said: said, status: 'close' }); k++; continue; }
      }
      merged.push(a);
    }
    var ok = 0, close = 0, extra = 0;
    merged.forEach(function (o) { if (o.status === 'ok' || o.status === 'okpart') ok++; else if (o.status === 'close') close++; else if (o.status === 'extra') extra++; });
    merged = merged.filter(function (o) { return o.status !== 'okpart'; });
    var score = m ? Math.max(0, Math.round(100 * (ok + close * 0.5 - extra * 0.25) / m)) : 0;
    return { score: Math.min(100, score), ops: merged, expected: t, heard: s };
  }

  // ---------- rule-based grammar checker ----------
  var JOBS = 'teacher|doctor|nurse|engineer|student|developer|tester|manager|designer|accountant|lawyer|driver|chef|cleaner|programmer|analyst|consultant|architect|electrician|plumber|carpenter|pharmacist|dentist|scientist|writer|artist|musician|farmer|mechanic|waiter|receptionist|director|officer|volunteer|beginner|expert|citizen|resident|immigrant|software engineer|business analyst|team leader';
  var A_EXCEPT = /^(uni|use|usu|euro|eu|one|once|ukul|uran|ure|uti|u\b|unanim)/i; // vowel letter, consonant sound
  var AN_EXCEPT = /^(hour|honest|honou?r|heir)/i; // consonant letter, vowel sound
  var UNCOUNT = { informations: 'information', advices: 'advice', furnitures: 'furniture', equipments: 'equipment', feedbacks: 'feedback', softwares: 'software', luggages: 'luggage', baggages: 'baggage', homeworks: 'homework', researches: 'research', knowledges: 'knowledge', staffs: 'staff' };
  function keepCase(orig, rep) { return /^[A-Z]/.test(orig) ? rep.charAt(0).toUpperCase() + rep.slice(1) : rep; }

  var RULES = [
    { id: 'am-agree', re: /\b(I am|I'm|I’m|we are|we're|they are|they're|he is|she is)\s+(agree|disagree)\b/gi, fix: function (m, subj, v) { var s = subj.toLowerCase(); var base = /^(i|we|they)/.test(s) ? subj.replace(/\s*(am|are|'m|’m|'re)$/i, '') : subj.replace(/\s+is$/i, ''); return base + ' ' + v + (/^(he|she)/i.test(s) ? 's' : ''); }, why: '“Agree” is a verb. You don’t need “am/is/are” before it.' },
    { id: 'since-duration', re: /\bsince\s+((?:\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|many|several|few|long)\s+(?:years?|months?|weeks?|days?|hours?|minutes?|time))\b/gi, fix: function (m, d) { return 'for ' + (/^long time$/i.test(d) ? 'a long time' : d); }, why: 'Use “for” with a length of time (for two years). Use “since” with a starting point (since 2020).' },
    { id: 'from-long', re: /\b(?:from|since)\s+long\s+time\b/gi, fix: function () { return 'for a long time'; }, why: 'In English we say “for a long time”.' },
    { id: 'perfect-since', re: /\b(I am|I'm|I’m|we are|we're|they are|they're|he is|he's|she is|she's|you are)\s+(living|working|staying|studying|waiting|learning|teaching|using)\b(?=[^.?!]*\b(?:since|for)\s+(?:\d|a |an |one|two|three|four|five|six|seven|eight|nine|ten|many|several|long|last|ages))/gi,
      fix: function (m, subj, v) { var s0 = subj.toLowerCase().replace(/’/g, "'"); var map = { 'i am': 'I have been', "i'm": 'I’ve been', 'we are': 'we have been', "we're": 'we’ve been', 'they are': 'they have been', "they're": 'they’ve been', 'he is': 'he has been', "he's": 'he’s been', 'she is': 'she has been', "she's": 'she’s been', 'you are': 'you have been' }; return keepCase(subj, map[s0]) + ' ' + v; },
      why: 'For something that started in the past and is still true, use the present perfect: I have been living here for two years (not “I am living”).' },
    { id: 'discuss-about', re: /\b(discuss(?:es|ed|ing)?)\s+(about|on)\b/gi, fix: function (m, v) { return v; }, why: '“Discuss” already means “talk about”. Say “discuss the plan”, or “talk about the plan”.' },
    { id: 'more-comparative', re: /\b(more|most)\s+(better|worse|easier|harder|bigger|smaller|faster|cheaper|happier|best|worst|easiest|biggest)\b/gi, fix: function (m, more, adj) { return adj; }, why: 'The word is already a comparative or superlative. Don’t add “more” or “most”.' },
    { id: 'double-neg', re: /\b(don't|doesn't|didn't|can't|won't|never|isn't|aren't|wasn't|haven't|don’t|doesn’t|didn’t|can’t|won’t)\s+((?:\w+\s+){0,2}?)(nothing|nobody|no one|nowhere|none)\b/gi, fix: function (m, neg, mid, w) { return neg + ' ' + mid + { nothing: 'anything', nobody: 'anybody', 'no one': 'anyone', nowhere: 'anywhere', none: 'any' }[w.toLowerCase()]; }, why: 'Two negatives cancel out in standard English. Use “any…” after a negative verb.' },
    { id: 'lower-i', re: /(^|[\s(“"])i(?=\s|'|’|[,.!?]|$)/g, fix: function (m, pre) { return pre + 'I'; }, why: 'The word “I” is always a capital letter.' },
    { id: 'its-is', re: /\b(its)\s+(a|an|the|not|been|very|so|too|going|getting|really|just|my|your|time|ok|okay|fine|good|great|raining|hot|cold|late|true|important|possible|hard|easy)\b/gi, fix: function (m, its, w) { return keepCase(its, 'it’s') + ' ' + w; }, why: '“It’s” means “it is” or “it has”. “Its” (no apostrophe) shows ownership: the dog wagged its tail.' },
    { id: 'its-own', re: /\b(it's|it’s)\s+(own|name|colour|color|size|own|price|purpose|value|logo|owner)\b/gi, fix: function (m, its, w) { return keepCase(its, 'its') + ' ' + w; }, why: 'Ownership is “its” with no apostrophe. “It’s” always means “it is” or “it has”.' },
    { id: 'your-are', re: /\b(your)\s+(welcome|going|not|a|an|the|very|so|too|right|wrong|late|coming|doing|being|looking|getting|making|always|still|probably)\b/gi, fix: function (m, y, w) { return keepCase(y, 'you’re') + ' ' + w; }, why: '“You’re” means “you are”. “Your” shows ownership (your car).' },
    { id: 'youre-own', re: /\b(you're|you’re)\s+(car|house|name|own|job|phone|email|bag|family|friend|mother|father|boss|team|account|number|address|order)\b/gi, fix: function (m, y, w) { return keepCase(y, 'your') + ' ' + w; }, why: 'Ownership is “your”. “You’re” means “you are”.' },
    { id: 'a-an', re: /\b(a|an)\s+([a-z][\w-]*)/gi, test: function (m, art, w) {
        var vowelSound = /^[aeiou]/i.test(w) ? !A_EXCEPT.test(w) : AN_EXCEPT.test(w);
        if (/^[A-Z]{2,}/.test(w)) return false; // acronyms (an MBA, a URL) depend on letter names; skip
        return (art.toLowerCase() === 'a' && vowelSound) || (art.toLowerCase() === 'an' && !vowelSound);
      }, fix: function (m, art, w) { return keepCase(art, art.toLowerCase() === 'a' ? 'an' : 'a') + ' ' + w; }, why: 'Use “an” before a vowel SOUND (an apple, an hour) and “a” before a consonant sound (a car, a university).' },
    { id: 'job-article', re: new RegExp('\\b(I am|I\'m|I’m|he is|she is|he\'s|she\'s|he’s|she’s|my wife is|my husband is|my friend is|you are|working as)\\s+(' + JOBS + ')\\b', 'gi'), fix: function (m, subj, job) { return subj + ' ' + (/^[aeiou]/i.test(job) ? 'an ' : 'a ') + job; }, why: 'Jobs need “a” or “an” in English: I am a teacher.' },
    { id: 'sv-dont', re: /\b(he|she|it|this|that|my \w+)\s+(don't|don’t)\b/gi, fix: function (m, s, d) { return s + ' doesn’t'; }, why: 'With he/she/it, use “doesn’t”.' },
    { id: 'sv-have', re: /\b(he|she|it)\s+(have)\b(?!\s+to\b)/gi, fix: function (m, s) { return s + ' has'; }, why: 'With he/she/it, use “has”.' },
    { id: 'sv-has', re: /\b(I|you|we|they)\s+(has)\b/g, fix: function (m, s) { return s + ' have'; }, why: 'With I/you/we/they, use “have”.' },
    { id: 'sv-3rd', re: /\b(he|she|it)\s+(go|like|want|need|work|live|make|know|think|say|come|play|watch|eat|drink|study|teach|speak|love|feel|look|seem|get|take)\b/gi,
      test: function (m, s, v, off, str) { var before = str.slice(Math.max(0, off - 12), off).toLowerCase(); return !/(does|did|will|can|could|should|would|may|might|must|let|make|help|to|if)\s*$/.test(before) && !/(let|make|made|help|saw|see|watch|heard)\s+$/.test(before); },
      fix: function (m, s, v) { var x = v.toLowerCase(); var t = { go: 'goes', study: 'studies', teach: 'teaches', watch: 'watches' }[x] || x + 's'; return s + ' ' + t; }, why: 'In the present simple, add -s for he/she/it: she works, he goes.' },
    { id: 'they-was', re: /\b(they|we|you)\s+(was)\b/gi, fix: function (m, s) { return s + ' were'; }, why: 'Use “were” with they/we/you.' },
    { id: 'people-is', re: /\b(people|children|police)\s+(is|was|has)\b/gi, fix: function (m, n, v) { return n + ' ' + { is: 'are', was: 'were', has: 'have' }[v.toLowerCase()]; }, why: 'These nouns are plural.' },
    { id: 'everyone-are', re: /\b(everyone|everybody|someone|somebody|nobody|anyone|each one)\s+(are|were|have)\b/gi, fix: function (m, n, v) { return n + ' ' + { are: 'is', were: 'was', have: 'has' }[v.toLowerCase()]; }, why: 'Words like “everyone” and “nobody” take a singular verb: everyone is.' },
    { id: 'have-went', re: /\b(have|has|had|I've|I’ve|we've|they've)\s+(went|did|ate|wrote|spoke|took|came|saw|gave|drank|began|ran|forgot)\b/gi, fix: function (m, h, v) { var pp = { went: 'gone', did: 'done', ate: 'eaten', wrote: 'written', spoke: 'spoken', took: 'taken', came: 'come', saw: 'seen', gave: 'given', drank: 'drunk', began: 'begun', ran: 'run', forgot: 'forgotten' }[v.toLowerCase()]; return h + ' ' + pp; }, why: 'After have/has/had, use the past participle (gone, done, seen), not the past simple.' },
    { id: 'did-past', re: /\b(did|didn't|didn’t|does|doesn't|doesn’t|to|can|could|will|should|must)\s+(went|did|ate|saw|came|took|gave|bought|made|said|told|got|wrote|spoke|knew|thought)\b/gi,
      test: function (m, aux, v) { return !(aux.toLowerCase() === 'to' && /^(did|made|got|said|thought|knew)$/i.test(v)); },
      fix: function (m, aux, v) { var b = { went: 'go', did: 'do', ate: 'eat', saw: 'see', came: 'come', took: 'take', gave: 'give', bought: 'buy', made: 'make', said: 'say', told: 'tell', got: 'get', wrote: 'write', spoke: 'speak', knew: 'know', thought: 'think' }[v.toLowerCase()]; return aux + ' ' + b; }, why: 'After did/does/to/can/will etc., use the base verb: didn’t go, can see.' },
    { id: 'explain-me', re: /\b(explain|explained|explaining|describe|suggest|suggested)\s+(me|him|her|us|them)\b(?!\s+to\b)/gi, fix: function (m, v, p) { return v + ' to ' + p; }, why: 'We explain/describe/suggest something TO someone: explain it to me.' },
    { id: 'said-me', re: /\b(said|say|says)\s+(me|him|her|us|them)\b/gi, fix: function (m, v, p) { return { said: 'told', say: 'tell', says: 'tells' }[v.toLowerCase()] + ' ' + p; }, why: '“Say” doesn’t take a person directly. Use “tell me” or “say to me”.' },
    { id: 'tell-to', re: /\b(tell|told)\s+to\s+(me|him|her|us|them)\b/gi, fix: function (m, v, p) { return v + ' ' + p; }, why: '“Tell” takes the person directly: tell me.' },
    { id: 'myself-name', re: /(?:^|[.!?]\s+)\s*([Mm]yself)\s+([A-Z][a-z]+)/gm, fix: function (m, my, name) { return m.slice(0, m.indexOf(my)) + 'I’m ' + name; }, why: '“Myself Raj” is common in Indian English, but in Australia say “I’m Raj” or “My name is Raj”.' },
    { id: 'uncountable', re: /\b((?:many|several|a few|few)\s+)?(informations|advices|furnitures|equipments|feedbacks|softwares|luggages|baggages|homeworks|researches|knowledges|staffs)\b/gi, fix: function (m, pre, w) { return (pre ? keepCase(pre, 'a lot of ') : '') + (pre ? UNCOUNT[w.toLowerCase()] : keepCase(w, UNCOUNT[w.toLowerCase()])); }, why: 'This noun is uncountable — it has no plural form. Use “some …” or “a piece of …”.' },
    { id: 'stative', re: /\b(am|is|are|was|were)\s+(having|knowing|understanding|liking|wanting|owning|believing|needing)\s+(a|an|the|my|your|his|her|our|their|it|this|that|what|two|three|some|many)\b/gi,
      test: function (m, be, v, d, off, str) { return !(v.toLowerCase() === 'having' && /^(a|an|the)$/i.test(d) && /^\s*(\w+\s+)?(lunch|dinner|breakfast|meeting|party|baby|shower|break|look|go|chat|good|great|bad|hard|rest|drink|coffee|tea)/i.test(str.slice(off + m.length))); },
      fix: function (m, be, v, d) { var base = { having: 'have', knowing: 'know', understanding: 'understand', liking: 'like', wanting: 'want', owning: 'own', believing: 'believe', needing: 'need' }[v.toLowerCase()]; return base + ' ' + d; }, why: 'Verbs about states (have = own, know, understand, like, want, need) usually don’t use the -ing form: I have a car, I know the answer.' },
    { id: 'could-of', re: /\b(could|should|would|must|might)\s+of\b/gi, fix: function (m, v) { return v + ' have'; }, why: 'It sounds like “could of”, but it’s written “could have” (or could’ve).' },
    { id: 'than-then', re: /\b(better|worse|more|less|bigger|smaller|faster|slower|rather|other|higher|lower|older|younger)\s+then\b/gi, fix: function (m, w) { return w + ' than'; }, why: 'Use “than” for comparisons. “Then” is about time.' },
    { id: 'loose-lose', re: /\b(loose)\s+(my|your|his|her|our|their|the|weight|money|it|them|a|track|interest)\b/gi, fix: function (m, l, w) { return keepCase(l, 'lose') + ' ' + w; }, why: '“Lose” = not have any more. “Loose” = not tight.' },
    { id: 'one-of-singular', re: /\bone of (my|the|our|your|his|her|their)\s+(friend|colleague|brother|sister|cousin|client|customer|manager|team|project|reason|problem|favourite|best)\b(?!s)/gi, fix: function (m, d, n) { return 'one of ' + d + ' ' + (n.toLowerCase() === 'favourite' || n.toLowerCase() === 'best' ? n : n + 's'); }, why: '“One of” is followed by a plural noun: one of my friends.', test: function (m, d, n) { return !/^(favourite|best)$/i.test(n); } },
    { id: 'revert', re: /\b(revert)\s+(back\s+)?(to you|to me|soon|shortly|asap)\b/gi, fix: function (m, r, b, t) { return 'get back ' + t; }, why: 'In Australia, “revert” is rarely used to mean “reply”. Say “I’ll get back to you”.', style: true },
    { id: 'return-back', re: /\b(return|returned|returning|revert)\s+back\b/gi, fix: function (m, v) { return v; }, why: '“Return” already includes “back”.', style: true },
    { id: 'prepone', re: /\b(prepone|preponed)\b/gi, fix: function (m, w) { return /d$/.test(w) ? 'brought forward' : 'bring forward'; }, why: '“Prepone” isn’t used in Australia. Say “bring forward” or “move earlier”.', style: true },
    { id: 'do-needful', re: /\b(do the needful)\b/gi, fix: function () { return 'do what’s needed'; }, why: 'Sounds very formal or unusual in Australia. Say exactly what you need: “Could you please send the form?”', style: true },
    { id: 'pass-out', re: /\b(passed out of|pass out from|passed out from)\s+(college|university|uni|school)\b/gi, fix: function (m, p, s) { return 'graduated from ' + s; }, why: 'In Australia “pass out” means to faint. Say “graduated from”.', style: true },
    { id: 'doubt-question', re: /\b(I have (a|one|some) doubts?|my doubt is)\b/gi, fix: function (m) { return /some/i.test(m) ? 'I have some questions' : /my/i.test(m) ? 'my question is' : 'I have a question'; }, why: 'In Australian English “doubt” means you think something is not true. For a question, say “I have a question”.', style: true },
    { id: 'repeat', re: /\b(\w+)\s+\1\b/gi, test: function (m, w) { return !/^(that|had|very|so|bye|no|ha|yeah)$/i.test(w); }, fix: function (m, w) { return w; }, why: 'The same word is repeated.' }
  ];

  // One pass over the text. -> {issues, corrected}
  function onePass(text) {
    var issues = [];
    RULES.forEach(function (r) {
      r.re.lastIndex = 0; var m;
      while ((m = r.re.exec(text))) {
        var args = m.slice().concat([m.index, text]);
        if (r.test && !r.test.apply(null, args)) { if (r.re.lastIndex === m.index) r.re.lastIndex++; continue; }
        var start = m.index, matched = m[0];
        var suggestion = r.fix.apply(null, args);
        if (r.id === 'lower-i') { start += m[1].length; matched = 'i'; suggestion = 'I'; }
        if (r.id !== 'lower-i') suggestion = suggestion.replace(/(^|\s)i(?=\s|'|’|$)/g, '$1I');
        issues.push({ start: start, end: start + matched.length, text: matched, suggestion: suggestion, why: r.why, rule: r.id, style: !!r.style });
        if (r.re.lastIndex === m.index) r.re.lastIndex++;
      }
    });
    issues.sort(function (a, b) { return a.start - b.start || (b.end - b.start) - (a.end - a.start); });
    var kept = [], lastEnd = -1;
    issues.forEach(function (i) { if (i.start >= lastEnd) { kept.push(i); lastEnd = i.end; } });
    var out = '', pos = 0;
    kept.forEach(function (i) { out += text.slice(pos, i.start) + i.suggestion; pos = i.end; });
    out += text.slice(pos);
    return { issues: kept, corrected: out };
  }
  // -> {issues:[{start,end,text,suggestion,why,rule,style,later?}], corrected}
  // Fixes can overlap ("more better then"), so we re-check the corrected text a couple of times.
  // Issues found in later passes have start = -1 (they refer to the partly corrected text).
  function checkGrammar(text) {
    text = String(text || '');
    var first = onePass(text), issues = first.issues.slice(), cur = first.corrected;
    for (var k = 0; k < 2; k++) {
      var next = onePass(cur); if (!next.issues.length) break;
      next.issues.forEach(function (i) { issues.push(Object.assign({}, i, { start: -1, end: -1, later: true })); });
      cur = next.corrected;
    }
    return { issues: issues, corrected: cur };
  }

  // ---------- progress ----------
  function blankProgress() { return { days: {}, speech: [], scenarios: {}, checks: 0, learned: [] }; }
  function addDays(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  // kind: 'conversation' | 'expression' | 'grammar' | 'speaking' | 'roleplay' | 'check' ...
  function recordActivity(p, dateIso, kind, extra) {
    p = p || blankProgress();
    var day = p.days[dateIso] = p.days[dateIso] || { count: 0, done: {} };
    day.count++; day.done[kind] = (day.done[kind] || 0) + 1;
    if (kind === 'speaking' && extra && extra.score != null) p.speech.push({ date: dateIso, score: extra.score, target: extra.target || '' });
    if (kind === 'roleplay' && extra && extra.id) p.scenarios[extra.id] = Math.max(p.scenarios[extra.id] || 0, extra.pct || 0);
    if (kind === 'check') p.checks = (p.checks || 0) + 1;
    return p;
  }
  function streak(p, todayIso) {
    var days = (p && p.days) || {}, n = 0, d = days[todayIso] ? todayIso : addDays(todayIso, -1);
    while (days[d] && days[d].count > 0) { n++; d = addDays(d, -1); }
    var best = 0, run = 0, keys = Object.keys(days).sort(), prev = null;
    keys.forEach(function (k) { run = prev && addDays(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; });
    return { current: n, best: best, activeDays: keys.length };
  }
  function speechTrend(p, lastN) {
    var s = (p && p.speech) || [], by = {};
    s.forEach(function (x) { (by[x.date] = by[x.date] || []).push(x.score); });
    return Object.keys(by).sort().slice(-(lastN || 14)).map(function (d) { var a = by[d]; return { date: d, avg: Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length), n: a.length }; });
  }
  function scenarioResult(scn, path) {
    var max = 0, got = 0; path.forEach(function (c) { max += 2; got += c.score; });
    var pct = max ? Math.round(got / max * 100) : 0;
    return { pct: pct, verdict: pct >= 85 ? 'Excellent — you sound natural and polite.' : pct >= 60 ? 'Good. Check the feedback on the yellow answers.' : 'Keep practising — try the scenario again and pick the most polite, specific answers.' };
  }

  var L = {
    EXPRESSIONS: EXPRESSIONS, CONVERSATIONS: CONVERSATIONS, GRAMMAR: GRAMMAR, SPEAKING: SPEAKING, SCENARIOS: SCENARIOS, RULES: RULES,
    dailySet: dailySet, words: words, compareSpeech: compareSpeech, checkGrammar: checkGrammar,
    blankProgress: blankProgress, recordActivity: recordActivity, streak: streak, speechTrend: speechTrend, scenarioResult: scenarioResult, addDays: addDays
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.EnglishLib = L;
})(this);
