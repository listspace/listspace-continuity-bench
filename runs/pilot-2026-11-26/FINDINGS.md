# Pilot 2026-11-26: findings

Protocol v1, 10 synthetic scenarios, 3 runs, conditions A (chat), B (notes kept by an AI), C (Listspace board view), models claude-sonnet-5-5 and gpt-6.2-sol. 930 calls, $5.25.

**Bottom line:** the pilot found two defects in our own question set, not a result. No rate from this pilot is a headline.

## Correct answers out of 60 per cell (both models pooled)

| Question type | A chat | B notes | C board |
|---|---|---|---|
| current_decision | 54 | 60 | 60 |
| was_confirmed | 60 | 60 | 36 |
| next_task | 13 | 2 | 60 |
| who_decided | 57 | 57 | 60 |

Stale belief and unparseable answers: 0 in every cell.

## 1. next_task is unfair by construction

The key is the first task not done, in the order tasks were added. Tasks exist only as `task_add` ops; the chat names a task only when it is finished. The correct next task appears in the chat in 1 of 10 scenarios (s002). A and B abstaining is correct behaviour. C wins 60 of 60 only because the board prints the task list in plan order. B's task lists are also polluted by filler lines (invoice sent, status deck shorter) that keepers turn into tasks.

## 2. was_confirmed: C's 24 misses are answer-key defects

All 24 misses are "cannot tell" picks in s005 to s010. The correct "No" option there carries a reason that exists only in the chat (for example "waiting on a legal answer"). The board render shows the status clearly (`PROPOSED, NOT CONFIRMED` / `CONFIRMED ... by ... Reason`), but not that chat-only reason, so the models correctly refused the over-specified option. s001 to s004, which use a plain "No, it was proposed but never confirmed", score 24 of 24. Smaller gap: no condition renders who is client and who is agency.

## 3. Stale belief 0%: the set cannot produce it

Chats are about 45 to 60 tokens per session (design target 400). Each change is one direct line with the replacement right after it, open proposals are flagged in the same line, and old values are never restated. 720 correct answers show the models read short, explicit text well; they say nothing about long, messy projects.

## 4. Cost: $5.25 against $3.30 estimated

- Keeper calls $3.52 against $2.01: Sonnet's notes averaged 2,117 output tokens against 700 assumed (5.6k characters despite "under about 800 words"); GPT matched the assumption.
- Answer calls $1.73 against $1.29: Claude's tokenizer gives about 20% more tokens than the estimate, and Sonnet wrote prose before the JSON in 44% of answers (mean 78 output tokens against 10).
- Keep at least 1.7x headroom until a second pilot measures real lengths.

Scoring risk: `scoreReply` takes the first `{...}` in a reply. Use the last JSON object and tighten the answer prompt.

## Fixes before the next run

1. Information parity: every fact an answer key depends on is recoverable from the chat ("Plan: next up is X, then Y"). Validator fails if the next task never appears in a chat line.
2. One fixed text for every unconfirmed answer ("No, it was proposed but never confirmed"); validator check on was_confirmed options.
3. Realistic chats at 300 to 400 tokens per session with traps: a teammate repeats an old date, "let's go with X" with a hedging client reply, a confirmation from someone without authority, an old decision restated after it was replaced, a reversal back, implicit changes. About 10% hard cases without explicit flags.
4. Cut or flag task-like filler.
5. A client and agency header in all three conditions.
6. Report next_task separately, never pooled. A keeper length cap that works, and a second keeper prompt as a sensitivity check.
7. Re-review the keys, refreeze as protocol v2, rerun.

## Fair to say publicly about this pilot

The method and repo; the 930-call cost; that the pilot caught two flaws in our own question set; that short, explicit histories do not separate the conditions. Not the 90 versus 75 percent gap.

## Does the real product output share the weakness? (added 2026-11-26, read only check of listspace-app)

No product bug found for the two pilot defects. The was_confirmed misses were an answer key problem, and next_task failed because the chat never held the plan. Two differences between the C render and the real tools are worth checking before C is called "the Listspace view":

1. start_session compact lists settled (Confirmed) decisions only by item id, title and claim_key (first 25), without decided_by or because. A fresh session that needs "who confirmed it and why" has to call get_item per decision. The C render in this bench prints both inline, so it is richer than the compact output.
2. start_session and get_board list decisions as settled (Confirmed), in_dispute (Conflict) and on_record (Proposed). Replaced decisions are not in those lists, so the REPLACED history lines in the C render come from get_item (replaced_by, receipts), not from the board listing.

Both come from the tool descriptions in backend/functions/_shared/listspace/mcp.ts and decisions.ts (DecisionOut: label, decided_by, because, replaced_by, receipts). Not verified against a live call. If confirmed, either file as a product gap (compact start_session omits decided_by and because) or state in the report that C is a full export, the ceiling, as the design doc already says.
