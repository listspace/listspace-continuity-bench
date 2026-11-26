# Scenario changes, v2 to v3

Written 2026-11-26 after the v2 run (tag `protocol-v2`). The v2 run showed that the notes arms lost answers where the chat read a confirmation as a wish or a relay ("Sofia wants...", "Ravi moved go-live..."). The answer key counted these as confirmations, a strict reader did not.

**The one change in v3:** every confirmation is now said directly by the person with authority, with the word "Confirmed", in a chat line of their own. The reason is in the same line or the line before it. A validator now fails any scenario where a confirm op has no such line (`CONFIRM_WORDS`: confirmed, confirm, approved, agreed).

Nothing else changed. The deliberate traps stay unconfirmed and untouched: hearsay (Nadia, Tessa, Kiran, Fenna, Rosa, Bilal, Jamal, Karl), someone without authority, "let's go with X" with a hedging reply, and agency lines like "The developers started wiring in the bank's gateway". No answer key, option or op changed. Plan and done lines, chatter and every other line are as in v2. s001 to s003 are hand written: their relayed lines are kept word for word and a direct line is added after each.

37 places changed (replace = the old line is gone, after = a line was added after the old line, which stays).

## s001

- Session 1, added after:
  - Old: "Marta: Tom confirmed 14 March as the launch date on the call."
  - New: "Tom: Confirmed, 14 March. It matches the spring menu campaign."
  - Why: Hand written. Relay kept, direct line added after it. No existing word changed.
- Session 2, added after:
  - Old: "Marta: Tom says the 14 March date is too early because the photo shoot slipped. New date: 4 April. He confirmed by email."
  - New: "Tom: Confirmed, launch on 4 April. The photo shoot slipped two weeks."
  - Why: Hand written. Relay kept, direct line added.
## s002

- Session 1, added after:
  - Old: "Dev: Ines picked a monthly subscription for members. She confirmed it."
  - New: "Ines: Confirmed, a monthly subscription. It is the simplest for regular members."
  - Why: Hand written. Relay kept, direct line added.
- Session 2, added after:
  - Old: "Dev: Ines now wants class packs of ten instead of a subscription, because tourists use the studio too. She confirmed the change in the shared chat."
  - New: "Ines: Confirmed, ten-class packs instead. Tourists use the studio and will not subscribe."
  - Why: Hand written. Relay kept, direct line added.
## s003

- Session 1, added after:
  - Old: "Lucia: Pablo confirmed a 48-page report, print and PDF."
  - New: "Pablo: Confirmed, 48 pages, print and PDF. It matches last year's format."
  - Why: Hand written. Relay kept, direct line added.
- Session 2, added after:
  - Old: "Lucia: Budget cut. Pablo confirmed 32 pages, PDF only, no print."
  - New: "Pablo: Confirmed, 32 pages, PDF only. The board cut the budget."
  - Why: Hand written. Relay kept, direct line added.
- Session 2, added after:
  - Old: "Lucia: Pablo also confirmed the illustrated style."
  - New: "Pablo: Confirmed, the illustrated style. It is warmer than last year's photo style."
  - Why: Hand written. Relay kept, direct line added.
- Session 3, added after:
  - Old: "Lucia: The board found money again. Pablo confirmed 40 pages, PDF plus a small print run."
  - New: "Pablo: Confirmed, 40 pages, PDF plus a small print run. The board restored part of the budget."
  - Why: Hand written. Relay kept, direct line added.
## s004

- Session 1, replaced:
  - Old: "Ines: Pavel approved the microphone mark on the call."
  - New: "Pavel: Confirmed, the retro microphone mark. It fits the show's analog sound."
  - Why: Relayed by the agency in the past tense. Now the decider says it directly.
- Session 2, replaced:
  - Old: "Ines: Pavel's co-host found the microphone too dated. Pavel now wants a rounded wordmark and said so in the shared chat."
  - New: "Ines: Pavel's co-host does not like the microphone mark." then "Pavel: Confirmed, we switch to a rounded wordmark. The co-host found the microphone too dated."
  - Why: Read as a wish, not a decision.
## s005

- Session 1, replaced:
  - Old: "Lena: Marcus agreed we embed a hosted booking widget. It is the fastest way to ship before the spring promotion."
  - New: "Marcus: Confirmed, embed a hosted booking widget. It is the fastest way to ship before the spring promotion."
  - Why: Relayed by the agency in the past tense. Now the decider says it directly.
- Session 2, replaced:
  - Old: "Lena: Marcus reversed the booking approach. Clinics need patients to reschedule inside the app, so we build booking into the app on the clinics' own scheduling system. He said yes by email."
  - New: "Lena: Marcus sent his answer on the booking approach." then "Marcus: Confirmed, build booking into the app on the clinics' own scheduling system. Clinics need patients to reschedule inside the app."
  - Why: Relayed by the agency in the past tense. Now the decider says it directly.
## s006

- Session 1, replaced:
  - Old: "Dana: Kickoff with Ravi. He agreed to go live on 1 June, ahead of the hiking season."
  - New: "Dana: Kickoff with Ravi." then "Ravi: Confirmed, we go live on 1 June, before the summer hiking season."
  - Why: Relayed by the agency in the past tense. Now the decider says it directly.
- Session 2, replaced:
  - Old: "Dana: Ravi wants free shipping above 80 euros, in line with competitors."
  - New: "Ravi: Confirmed, free shipping above 80 euros. It matches the competitor threshold."
  - Why: Read as a wish, not a decision.
- Session 4, replaced:
  - Old: "Dana: Product photos are late. Ravi moved the go-live date to 22 June."
  - New: "Dana: The product photos are late." then "Ravi: Confirmed, the new go-live date is 22 June. The photos arrive late."
  - Why: Relayed by the agency in the past tense. Now the decider says it directly.
- Session 6, replaced:
  - Old: "Dana: Ravi checked margins on bulky items and wants free shipping above 100 euros instead of 80."
  - New: "Dana: Ravi checked the margins on bulky items." then "Ravi: Confirmed, free shipping above 100 euros instead of 80. Margins on bulky items are thinner than expected."
  - Why: Read as a wish, not a decision.
- Session 8, replaced:
  - Old: "Dana: The photos arrived early. Ravi moved go-live to 15 June."
  - New: "Dana: The photos arrived early." then "Ravi: Confirmed, go live on 15 June. The photos arrived early and the season starts sooner."
  - Why: Relayed by the agency in the past tense. Now the decider says it directly.
## s007

- Session 1, replaced:
  - Old: "Noor: Kickoff with Greta. She wants English and Spanish, the two largest tenant groups."
  - New: "Noor: Kickoff with Greta." then "Greta: Confirmed, English and Spanish. They are the two largest tenant groups."
  - Why: Read as a wish, not a decision.
- Session 2, replaced:
  - Old: "Noor: Greta chose the community garden photo as the hero image. Residents in it gave consent."
  - New: "Greta: Confirmed, the community garden photo is the hero image. The residents in it gave consent."
  - Why: Relayed by the agency in the past tense. Now the decider says it directly.
- Session 5, replaced:
  - Old: "Noor: A new funder asked for Polish. Greta added it to the languages."
  - New: "Noor: A new funder asked for Polish." then "Greta: Confirmed, add Polish to the languages, because a new funder asked for it."
  - Why: Relayed by the agency in the past tense. Now the decider says it directly.
## s008

- Session 1, replaced:
  - Old: "Wei: Kickoff with Sofia. She wants the season announced on 9 September, in line with the subscriber renewal letter."
  - New: "Wei: Kickoff with Sofia." then "Sofia: Confirmed, we announce the season on 9 September. It lines up with the subscriber renewal letter."
  - Why: Read as a wish, not a decision.
- Session 2, replaced:
  - Old: "Wei: Sofia wants most of the budget in social video, because the growth target is a younger audience."
  - New: "Sofia: Confirmed, most of the budget goes into social video. The growth target is a younger audience."
  - Why: Read as a wish, not a decision.
- Session 5, replaced:
  - Old: "Wei: The board approval slipped to mid-September. Sofia moved the announcement to 23 September."
  - New: "Wei: The board approval slipped to mid-September." then "Sofia: Confirmed, we announce on 23 September instead."
  - Why: Relayed by the agency in the past tense. Now the decider says it directly.
- Session 7, replaced:
  - Old: "Wei: Subscriber data shows older subscribers still renew by post. Sofia wants the budget split between social video and print."
  - New: "Wei: Subscriber data shows older subscribers still renew by post." then "Sofia: Confirmed, split the budget between social video and print, because older subscribers still renew by post."
  - Why: Read as a wish, not a decision.
## s009

- Session 1, replaced:
  - Old: "Mateo: Kickoff with Hilde. She wants all customer records moved in one cutover, as the simplest option."
  - New: "Mateo: Kickoff with Hilde." then "Hilde: Confirmed, one cutover for all customer records. It is the simplest cutover."
  - Why: Read as a wish, not a decision.
- Session 2, replaced:
  - Old: "Mateo: Hilde set go-live for 15 June, the end of the fiscal quarter."
  - New: "Hilde: Confirmed, go live on 15 June. It is the end of the fiscal quarter."
  - Why: Relayed by the agency in the past tense. Now the decider says it directly.
- Session 9, replaced:
  - Old: "Mateo: The duplicate review shows a one shot migration is too risky. Hilde moved to three regional waves."
  - New: "Mateo: The duplicate review shows a one shot migration is too risky." then "Hilde: Confirmed, we migrate in three regional waves. The risk review found too many duplicate records."
  - Why: Relayed by the agency in the past tense. Now the decider says it directly.
- Session 11, replaced:
  - Old: "Mateo: Hilde wants single sign-on in phase one. The security audit requires it."
  - New: "Hilde: Confirmed, single sign-on goes into phase one. The security audit requires it."
  - Why: Read as a wish, not a decision.
- Session 14, replaced:
  - Old: "Mateo: The duplicate cleanup takes longer than planned. Hilde moved go-live to 13 July."
  - New: "Mateo: The duplicate cleanup takes longer than planned." then "Hilde: Confirmed, go live on 13 July instead."
  - Why: Relayed by the agency in the past tense. Now the decider says it directly.
- Session 22, replaced:
  - Old: "Mateo: Hilde wants the biggest accounts moved last, with the cleanest data. Migration goes by customer tier."
  - New: "Hilde: Confirmed, migrate by customer tier, largest accounts last. The largest accounts need the cleanest data."
  - Why: Read as a wish, not a decision. This line caused stale answers in the v2 run.
- Session 26, replaced:
  - Old: "Mateo: The warehouse peak runs to the end of July. Hilde set go-live for 3 August."
  - New: "Mateo: The warehouse peak runs to the end of July." then "Hilde: Confirmed, go live on 3 August. The warehouse peak ends 31 July."
  - Why: Relayed by the agency in the past tense. Now the decider says it directly.
## s010

- Session 2, replaced:
  - Old: "Priya: Tomasz wants the site to launch on 12 September, two weeks before the festival."
  - New: "Tomasz: Confirmed, the site launches on 12 September, two weeks before the festival."
  - Why: Read as a wish, not a decision.
- Session 3, replaced:
  - Old: "Priya: Tomasz wants tickets sold through the festival's own box office page, so the festival keeps the audience data."
  - New: "Tomasz: Confirmed, we sell tickets through the festival's own box office page. It keeps the audience data."
  - Why: Read as a wish, not a decision.
- Session 6, replaced:
  - Old: "Priya: Tomasz wants captions on every trailer. The arts council grant requires it."
  - New: "Tomasz: Confirmed, captions on every trailer. The arts council grant requires it."
  - Why: Read as a wish, not a decision.
- Session 10, replaced:
  - Old: "Priya: The trailer edit slipped by a week. Tomasz moved the launch to 19 September."
  - New: "Priya: The trailer edit slipped by a week." then "Tomasz: Confirmed, the launch moves to 19 September."
  - Why: Relayed by the agency in the past tense. Now the decider says it directly.
- Session 12, replaced:
  - Old: "Priya: The box office page failed the load test. Tomasz moved to an external ticket platform."
  - New: "Priya: The box office page failed the load test." then "Tomasz: Confirmed, we move to an external ticket platform."
  - Why: Relayed by the agency in the past tense. Now the decider says it directly.
- Session 19, replaced:
  - Old: "Priya: The festival moved its opening a week earlier. Tomasz moved the site launch to 5 September."
  - New: "Priya: The festival moved its opening a week earlier." then "Tomasz: Confirmed, the site launch moves to 5 September."
  - Why: Relayed by the agency in the past tense. Now the decider says it directly.
