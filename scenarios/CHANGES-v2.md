# Scenario changes, v1 to v2

Written 2026-11-26 after the v1 pilot (tag `pilot-v1`). Jordi reviewed v1 on 2026-11-25. Review only what is listed here. No story, decision, person or answer key changed unless a line below says so. `node bench.mjs validate` passes for all ten.

## Changes in every scenario

1. **Plan and done lines.** Every task added is named in plan order in one chat line ("Plan, in order: A, B, C." in session 1, "Added to the plan: X." later). Every finished task has a line "Done: X." in the session where it was finished. Before, the open task (the `next_task` answer) appeared nowhere in the chat. A validator now fails any scenario where a task is missing from the chat.
2. **Realistic length.** About 250 tokens a session in the 3 session scenarios, about 360 in the 10 and 30 session ones (v1 was about 45). The extra length is neutral chatter (late calls, audio problems, weather, holiday talk). It names no task, decision or date, and it is built from a fixed pool of sentences, so it repeats some wording. It is padding, not story.
3. **Old filler removed.** The v1 filler lines ("invoice sent", "status deck shorter") turned into noise tasks in the notes. They are gone.
4. **`was_confirmed` options fixed.** The "No" option is always "No, it was proposed but never confirmed", and "Yes" is always "Yes, confirmed". In v1 the "No" text carried reasons that only the chat knew, which made the board arm abstain. A validator enforces the fixed texts.
5. **Every condition opens with the same line** naming the agency side and the client side.

## Per scenario

**s001, s002, s003 (hand written, 3 sessions).** Only the plan and done lines and the chatter were added, no story line touched. s003 also changed one option text: "No, only proposed" became "No, it was proposed but never confirmed" (same meaning, same status).

**s004 podcast rebrand (3 sessions).** Added Nadia, on the client side. Session 2: she says the microphone mark already went to the sticker printer, which is the old decision acted on after it was replaced. Session 3: she says Pavel is "basically fine" with Harbor Hall and she told the caterer to pencil in a date, which is hearsay and not a confirmation. Removed "That is not a yes yet". Key unchanged.

**s005 dental booking app (3 sessions).** Added Tessa, front desk lead. Session 2: the printed poster still promises the booking widget (old decision acted on). Session 3: she says Marcus "personally" thinks 40,000 euros is fine and finance only has to stamp it (hearsay). Removed "it is not agreed". Key unchanged.

**s006 outdoor shop migration (10 sessions).** Added Kiran, who runs the warehouse. Session 6: suppliers all have 1 June in their calendars, after go-live moved to 22 June (old date restated). Session 8: Dana asks Kiran to tell suppliers about 15 June. Session 9: Kiran assumes payments are sorted because the bank gateway is already on staging. Session 7: developers wire in the bank's gateway. Removed the explicit "Ravi has not signed off". The gateway was never confirmed, as before.

**s007 housing report microsite (10 sessions).** Added Bilal, Greta's designer. Session 6: he mocked up the map page before it is confirmed. Session 7: he used the new building photo in the board preview slide before the hero image is confirmed. Session 8: the translation vendor quote still lists two languages after Polish was added (old decision restated). Session 9: Noor asks the vendor to requote. Removed "stays an open proposal" and "still undecided" style lines. Keys unchanged: the garden photo is still the confirmed hero image.

**s008 theatre season campaign (10 sessions). HARD CASE.** Added Jamal, box office lead. Session 6: he asks whether the subscriber letter still goes out with 9 September (after the move to 23 September). Session 7: Wei only says she will check. Session 8: Jamal keeps planning social video only (old channel mix). Session 9: Jamal tells the box office the poster pickup is the 20th, because the posters are "with Northside", which is a proposal acted on and never confirmed. Session 8: Wei says the files went to Northside "as we agreed in the agency channel". Session 10: Sofia is only comparing two other quotes. Removed "Sofia has not signed off". One ops change: session 9 now also finishes "Set up the ad accounts" (it was done in v1 chat but not in the ops). The answer keys are unchanged, `next_task` is still "Order the posters".

**s009 logistics CRM rollout (30 sessions).** Added Karl (client IT) and Fenna (Hilde's assistant). Old decisions restated after they were replaced: Karl still scripts a single cutover weekend (session 12), the runbook still says three regional waves (session 23), Fenna says the board slides show 15 June (session 16), asks for the 13 July notice to go to the depots (session 28), and Karl tells depot managers the academy sessions start in July (session 10, an unconfirmed proposal acted on). Removed the explicit "HR has still not agreed" and "only my assumption" lines. Keys unchanged.

**s010 festival film site (30 sessions). HARD CASE.** Added Rosa, festival press. Old values restated after they were replaced: the press release says 12 September (session 13) and then 19 September (session 20) when the launch is 5 September, the brochure links the box office page (session 14). The sponsor logo: Priya only suggests it (session 15), Rosa tells the sponsor it is done (session 18), Priya puts it on staging "to show how it looks" (session 24), and Rosa asks if it is in on launch day (session 29). It is never confirmed, and no line says so. Keys unchanged.

## Known limits left in v2

- The chatter is generated padding, so the 30 session chats are long but not rich. The traps are the hand written lines listed above.
- Only 2 of 10 scenarios are hard on purpose (s008, s010). Most `was_confirmed` answers are "No", so a model that always says no would score well on that type, and s003 is the only "Yes" case.
- `next_task` still tests set arithmetic over a long list, which the board does by structure. It is reported on its own and never pooled.
