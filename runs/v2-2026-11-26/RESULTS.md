# Results, v2 run of 2026-11-26

Run: protocol v2 (tag `protocol-v2`), 10 synthetic scenarios, 3 runs per question, models `claude-sonnet-5-5` and `gpt-6.2-sol`, sampling at the provider default (no temperature sent), reasoning effort low. 1,380 calls, completed, $5.98 of the $14 budget. Raw rows: `results.jsonl`. Intervals: `scripts/analyze.mjs`, output in `analysis.json`.

## What is measured, and what is not

The question: after a project has changed its mind, does a fresh AI session answer from the current confirmed decision, or from one that was replaced or never confirmed? Each answer is multiple choice with a shuffled option order, scored by lookup against an authored status. No judge model is used.

Read these limits first:

1. **Ten synthetic scenarios, written by us.** We sell one of the products being compared. The chats are fictional, partly generated padding, and cleaner than real projects. These rates describe this set only, not real projects.
2. **Multiple choice.** It is easier than free recall and shows less stale belief than real use would.
3. **Condition C is not a board an AI kept.** In Tier A, C is rendered by code from the ground truth events that also define the answer key. It is the ceiling for a board that is kept fully current, not what happens when an AI has to keep it current. Tier B (the AI maintains a real board through MCP calls) tests that, and has not been run. A 100 percent for C says the information is there and the models read it. It does not say Listspace users get 100 percent.
4. **Small n.** Ten scenarios. The intervals are wide. Where a cell is all correct, the bootstrap interval collapses to 100 to 100, which understates the real uncertainty. With 10 scenarios, an observed 0 failures in 10 scenarios is also consistent with a true failure rate of up to about 30 percent per scenario.
5. **The v2 answer keys have a wording problem.** Some chat lines say "Sofia wants the budget split" or "Ravi moved go-live to 15 June" where the key counts a confirmation. A strict reader, such as the B2 keeper told that hints are not confirmations, can read these as unconfirmed. That costs B and B2 answers that may be partly the scenario's fault. See the examples below. Fix the chat wording before any public number.

## The conditions

| | What the fresh session receives |
|---|---|
| A. Chat | Every past session's conversation, in order, never truncated |
| B. Notes | A notes file an AI kept, one keeper call per session, a plain prompt, 450 word cap |
| B2. Notes, structured keeper | The same, with a structured prompt: CONFIRMED, REPLACED, PROPOSED lines and a plan list. A sensitivity arm so B is not handicapped |
| C. Board | A board rendered from the ground truth: decisions marked Confirmed, Replaced, Proposed with who and why, and tasks in plan order |

All conditions get the same system prompt (including "a decision counts only once a person confirmed it") and the same one line naming the agency side and the client side.

## Status questions (current_decision, was_confirmed, who_decided)

Percent, mean over scenarios, 95 percent bootstrap interval over scenarios in brackets. 90 answers per cell (10 scenarios, 3 question types, 3 runs).

| Model | Condition | Correct | Stale belief | Cannot tell | Mean input tokens per answer |
|---|---|---|---|---|---|
| claude-sonnet-5-5 | A chat | 97.8 (93.3 to 100.0) | 0.0 (0.0 to 0.0) | 2.2 (0.0 to 6.7) | 5,141 (2,442 to 8,565) |
| claude-sonnet-5-5 | B notes | 83.3 (70.0 to 96.7) | 3.3 (0.0 to 10.0) | 13.3 (0.0 to 26.7) | 1,194 (909 to 1,488) |
| claude-sonnet-5-5 | B2 notes | 70.0 (56.7 to 83.3) | 0.0 (0.0 to 0.0) | 30.0 (16.7 to 43.3) | 563 (499 to 634) |
| claude-sonnet-5-5 | C board | 100.0 (100.0 to 100.0) | 0.0 (0.0 to 0.0) | 0.0 (0.0 to 0.0) | 612 (538 to 691) |
| gpt-6.2-sol | A chat | 95.6 (87.8 to 100.0) | 0.0 (0.0 to 0.0) | 4.4 (0.0 to 11.1) | 3,429 (1,618 to 5,716) |
| gpt-6.2-sol | B notes | 86.7 (72.2 to 97.8) | 2.2 (0.0 to 6.7) | 11.1 (1.1 to 26.7) | 535 (427 to 645) |
| gpt-6.2-sol | B2 notes | 68.9 (52.2 to 85.6) | 3.3 (0.0 to 10.0) | 27.8 (13.3 to 43.3) | 347 (305 to 396) |
| gpt-6.2-sol | C board | 100.0 (100.0 to 100.0) | 0.0 (0.0 to 0.0) | 0.0 (0.0 to 0.0) | 405 (354 to 460) |

What the numbers support:

- A and C are close and their intervals overlap. Chat is read well at these lengths.
- B and B2 lose answers against A and C, mostly by saying "cannot tell". B2 loses more than B for both models, so the stricter, structured keeper did worse, not better. The B versus B2 gap is not a Listspace result. It shows how much a notes file depends on its keeper prompt.
- Stale belief is rare in every condition: 8 of 720 status answers in total.
- Input tokens: A grows with history. By history length (mean input tokens per answer, Sonnet): A 1,314 at 3 sessions, 5,153 at 10, 14,691 at 30. C is 504, 656, 813. For gpt-6.2-sol, A is 869, 3,421, 9,839 and C is 330, 434, 547. These are token counts as reported by the providers, for this padded synthetic chat.
- Correct by history length (status questions, per cell n is 18 to 45 answers, no intervals): Sonnet A 96, 100, 100 percent; Sonnet B 100, 78, 50; Sonnet B2 80, 67, 50; GPT B 98, 67, 89; GPT B2 91, 44, 50. C is 100 at every length for both models. B and B2 degrade with longer history, A does not.

## next_task, reported on its own

In v1 this question was unanswerable from chat. In v2 the plan is stated in the chat and every condition gets it right.

| Model | Condition | Answers | Correct | Stale | Cannot tell |
|---|---|---|---|---|---|
| both | A, B, B2, C | 30 per model and condition | 100.0 (100.0 to 100.0) | 0.0 | 0.0 |

All 240 next_task answers are correct, so this question no longer separates anything at this length. It is not pooled with the others.

## By question type, correct percent

| Model | Condition | current_decision | was_confirmed | who_decided |
|---|---|---|---|---|
| claude-sonnet-5-5 | A | 100.0 (100.0 to 100.0) | 100.0 (100.0 to 100.0) | 93.3 (80.0 to 100.0) |
| claude-sonnet-5-5 | B | 90.0 (70.0 to 100.0) | 100.0 (100.0 to 100.0) | 60.0 (30.0 to 90.0) |
| claude-sonnet-5-5 | B2 | 80.0 (50.0 to 100.0) | 100.0 (100.0 to 100.0) | 30.0 (0.0 to 60.0) |
| claude-sonnet-5-5 | C | 100.0 (100.0 to 100.0) | 100.0 (100.0 to 100.0) | 100.0 (100.0 to 100.0) |
| gpt-6.2-sol | A | 100.0 (100.0 to 100.0) | 100.0 (100.0 to 100.0) | 86.7 (63.3 to 100.0) |
| gpt-6.2-sol | B | 100.0 (100.0 to 100.0) | 90.0 (70.0 to 100.0) | 70.0 (43.3 to 93.3) |
| gpt-6.2-sol | B2 | 70.0 (40.0 to 100.0) | 100.0 (100.0 to 100.0) | 36.7 (10.0 to 66.7) |
| gpt-6.2-sol | C | 100.0 (100.0 to 100.0) | 100.0 (100.0 to 100.0) | 100.0 (100.0 to 100.0) |

30 answers per cell (10 scenarios, 3 runs of one question each), intervals over scenarios.

## Where B and B2 lose answers

who_decided is where notes fall furthest. The question needs both the person and the reason, and a notes file compresses the reason. B2 abstained on who_decided in 21 of 30 answers for Sonnet and 19 of 30 for GPT. Examples, quoted from `results.jsonl`:

1. **Summary dropped a detail the option needed (B2, Sonnet, s001).** Final notes line: "CONFIRMED Launch date of 4 April (confirmed by Tom, because the photo shoot slipped and 14 March is too early)". The correct option says "Tom, because the photo shoot slipped two weeks". The model replied "The memory gives no duration, but the shift from 14 March to 4 April is three weeks. So 'two weeks' doesn't match the memory" and answered cannot tell. The chat held the detail; the notes did not.
2. **Confirmed decisions written down as proposals (B2, GPT, s008).** The chat says "Sofia wants the budget split between social video and print" and, earlier, "Sofia wants most of the budget in social video". The keeper's final notes: "PROPOSED, NOT CONFIRMED Split the budget between social video and print because older subscribers still renew by post (proposed by Sofia)". Both channel mix decisions are marked unconfirmed, so who_decided has no answer and the model abstains. This is the wording problem in limit 5: the key says Sofia confirmed it, and the keeper was told that hints do not count.
3. **Stale answer from notes that kept the older decision (B, Sonnet, s009).** The final notes say "Wave order by customer tier ... Relayed by Mateo, not stated directly by Hilde", and keep "Customer record migration: three waves. Confirmed by Hilde ... because a one-shot migration is too risky given the duplicates" as the confirmed line. All three Sonnet runs answered "Hilde, because the risk review found too many duplicate records", the replaced reason. The chat line was "Hilde wants the biggest accounts moved last, with the cleanest data. Migration goes by customer tier." GPT answered the same way in 2 of 3 runs.

## Stale belief rows

All eight picked a replaced option. None picked an unconfirmed one as settled.

| Scenario | Model | Condition | Question | Runs | What happened |
|---|---|---|---|---|---|
| s009 | Sonnet | B | who_decided | 3 | Notes kept the second migration decision as confirmed (example 3). Picked "Hilde, because the risk review found too many duplicate records". |
| s009 | GPT | B | who_decided | 2 | Same notes problem, same pick. |
| s006 | GPT | B2 | current_decision | 3 | Final notes: "CONFIRMED Go live on 22 June (confirmed by Ravi...)" and "PROPOSED, NOT CONFIRMED Go live on 15 June (proposed by Dana)". The chat said "Ravi moved go-live to 15 June". The model picked 22 June. |

Every stale row comes from a notes file (B or B2) whose keeper kept an older decision as current. None comes from A or C. The cause is the keeper being strict about indirect phrasing in the v2 chat, so some of these are scenario wording problems, not memory failures.

## Cost

| Part | Calls | Cost |
|---|---|---|
| Answers, claude-sonnet-5-5 | 480 | $2.13 |
| Answers, gpt-6.2-sol | 480 | $1.17 |
| Notes keeper B, Sonnet / GPT | 105 each | $1.28 / $0.51 |
| Notes keeper B2, Sonnet / GPT | 105 each | $0.56 / $0.34 |
| Total | 1,380 | $5.98 |

The dry run estimated $7.98. Keeper output ran shorter than assumed (Sonnet 914 tokens for B and 304 for B2, GPT 337 and 175), and no keeper call hit its output limit. Sonnet wrote prose before the JSON in 193 of 480 answers (mean output 66 tokens), GPT in none (9 tokens). No answer was unparseable.

## Before any number is public

- Fix the v2 wording so a confirmation reads as one wherever the key counts one, then rerun. Right now B and B2 are partly penalized for our phrasing.
- Do not publish a correct rate by condition from this run. The comparison that would matter, a board an AI kept against notes an AI kept, is Tier B.
- What this run can support: the method, the cost, that chat at these lengths is read well, that notes depend heavily on the keeper prompt, and that tokens needed grow with history for chat but not for a board.
