# listspace-continuity-bench

Does your AI work from the current plan?

## What this is for

Plans change during a project. A launch date moves, a hosting choice is replaced, someone acts on a proposal nobody confirmed. A week later you open a fresh AI session and ask what was decided. This repository measures whether that session answers from the current, confirmed decision, or from one that was replaced or never confirmed, depending on where the project's memory lives.

Most memory benchmarks ask whether an AI can recall an old fact. This one asks whether it knows which fact is still true and who confirmed it.

It was built by Listspace, which makes a shared project board for people and their AIs. That is a conflict of interest, so everything is here to check: the scenarios, the answer keys, the prompts, the frozen protocol of every run, the raw answers and every miss. MIT licence.

## Who wrote the scenarios

Three scenarios (s001 to s003) were written by hand. The other seven (s004 to s010) were drafted with an AI. A person reviewed the list of changes to them, not every chat line (`scenarios/REVIEW.md`), and they carry `review.reviewed_by_jordi: false`. Every answer key in all ten is checked by code against the events of its scenario (`node bench.mjs validate`), so a key cannot disagree with what happened, but nobody has judged by hand whether those seven chats read like real projects.

## Two parts

1. **Our own scenarios** (the root of this repo). Ten synthetic agency projects of 3, 10 and 30 sessions, made for this test, with the traps real projects have. Four memory set-ups: the full chat (A), notes kept by an AI (B and B2), and the Listspace board (C). Multiple choice, scored by lookup, no AI judge.
2. **LongMemEval** (`longmemeval/`). Questions about facts that change over time from a public dataset we did not write (Wu et al., ICLR 2025), with histories of about 115,000 tokens. Here the AI keeps a real Listspace board itself through Listspace's tools, session by session, and answers from the board. Scored with the dataset's official judge.

## Results so far

Three runs of part 1, two models (Claude Sonnet 5.5, gpt-6.2-sol), three repetitions each.

- `runs/pilot-2026-11-26`: found two flaws in our own question set. Not a result. See `FINDINGS.md` there.
- `runs/v2-2026-11-26`: found a wording flaw in our chats (confirmations written as wishes). Not a result.
- `runs/v3-2026-11-26`: the run we stand behind. Every set-up was between 96.7% and 100% right on the status questions, and no answer took a replaced or unconfirmed decision as current. What separated the set-ups was size: by 30 sessions the full chat was about 18 times the text of the board, for the same answers.

What v3 does not show: the board in part 1 was filled from the true sequence of events, so it is the best case. Part 2 is where an AI keeps the board itself.

One mini run of part 2 (`longmemeval/runs/mini-2026-11-27`): five knowledge-update questions, the same two models, the official gpt-4o judge.

- All 20 answers were right: the full chat and the board kept by the AI, for both models.
- To answer, the full chat meant reading 102,000 to 172,000 tokens; the board 15,000 to 25,000.
- Keeping the board cost more than reading the chat once: about $1.80 per history against $0.21 to $0.34. The board pays off when a project is asked more than one question; this run asks one.
- Left to themselves, both AIs kept the board as a long list of notes (Claude 288 items, GPT 798) and recorded few or no decisions.
- Five questions show that the method works and what it costs. They are not a score.

The run stopped twice and both stops are in the files: once on the judge's API key permission (`mini-2026-11-27-attempt1-judge401`, one answer made) and once on an Anthropic account spending limit, after which it was resumed (`run-config.json`, `resumes`). The resume finished every call and then crashed while writing its summary; `longmemeval/scripts/rebuild-summary.mjs` rebuilt the summary from the saved rows.

## Protocol history

The v1 pilot (tag `pilot-v1`, `protocol.lock.v1.json`) found two flaws in the question set and the notes keeper, v2 fixed them (`scenarios/CHANGES-v2.md`, `protocol.lock.v2.json`), and the v2 run showed that confirmations written as wishes or relays cost the notes arms answers, so v3 rewrites them (`scenarios/CHANGES-v3.md`, `protocol.lock.json`). Every lock was committed before its first answer, and earlier runs stay published.

## What is measured

A scenario is a short project history: sessions in which decisions are proposed, confirmed and replaced, and tasks are added and finished. A fresh AI session gets one memory condition and answers closed questions about the project right now.

| Condition | What the fresh session receives |
|---|---|
| A. Chat | Every past session's conversation, in order |
| B. Notes | A markdown notes file that an AI kept, session by session |
| C. Board | The Listspace board view: decisions marked Confirmed, Replaced or Proposed (with history), tasks in plan order |
| B2. Notes, structured keeper | The same notes idea with a stronger, structured keeper prompt. A sensitivity arm so nobody can say B was handicapped |
| D. Continuity SDK (optional, not run) | The governed claim store from `continuity-sdk`, an earlier Yellow House Digital project that is not public. Authority states PD, SU, RNA, CAC |

All conditions get the same system prompt, including one sentence saying a decision counts only once a person confirmed it. The test is memory structure, not instruction.

Question types, four per scenario: `current_decision` (what is the current choice on X), `was_confirmed` (did the client ever confirm Y), `next_task` (what is next), `who_decided` (who confirmed the current Z, and why).

Questions are multiple choice with a shuffled option order and an explicit "cannot tell" option. Each option has an authored status: `current`, `replaced`, `unconfirmed`, `distractor` or `unknown`. Scoring is a lookup, with no judge model.

Metrics:

- correct: share of answers that pick the `current` option.
- stale-belief rate: share that pick a `replaced` or `unconfirmed` option as if it were settled.
- abstain rate: share that pick "cannot tell".
- context tokens needed, from the provider's own usage counts.

## Scenario schema

See `scenarios/*.json`. A scenario has `sessions[]` (each with `date`, `chat[]` lines and structured `ops[]`) and `questions[]`.

Ops: `propose {key,text,by}`, `confirm {key,by,reason}` (confirms the latest proposal on that key and replaces the previous confirmed one), `task_add {id,title}`, `task_done {id}`.

`node bench.mjs validate` folds the ops into ground truth and fails if any answer key disagrees with the events. Every scenario must pass before it is frozen.

## Commands

```bash
npm test                 # unit tests, no network
node bench.mjs validate  # answer keys against events
node bench.mjs plan      # context size per condition (chars/4, a guide only)
node bench.mjs hashes    # sha256 of each scenario file, for the protocol lock
node bench.mjs run --dry-run --models <id,id> --runs 3 [--scenarios s001,s002] [--budget 50]
node bench.mjs run --budget 50 --models <id,id> --runs 3 --temp default --out runs/<stamp> [--scenarios ...]
```

`run --dry-run` prints the call count, estimated tokens and estimated cost per model and condition, and calls nothing. It needs no key and no lock file. The estimate uses assumptions in `protocol.draft.json` (output tokens per call, notes size, characters per token) that the pilot replaces with measured numbers.

A real `run` refuses to start unless `--budget`, `--models`, `--runs`, `--temp` and `--out` are given, every model has a verified price in `config/prices.json` (price, `source_url` and `verified_on`), the provider key is in the environment (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`), and `protocol.lock.json` exists with matching scenario hashes. It does not retry, because a retry changes the conditions mid-run: a provider error stops the run. A run that stopped on a provider error (for example an HTTP 503) continues with `node bench.mjs run --resume <dir> --budget <USD> --temp default`: it checks that the lock, the prices and the settings are exactly those of the first attempt, runs only the calls that have no row yet (same order, seeds and option orders, notes already kept are reused, nothing is called twice), counts what was already spent against the budget, and records the resume (time, previous error, calls missing, calls added) in `run-config.json` so a report can say the run was resumed. `--dry-run` with `--resume` prints only the missing calls and their cost. Before every call the runner checks that the worst case (estimated input plus the full output cap) fits in the remaining budget, and aborts cleanly if not. Rows are appended to `<out>/results.jsonl` as they happen, so an aborted run keeps what it had. Provider calls use plain `fetch` (Anthropic Messages API, OpenAI Responses API); keys are read from the environment at call time and never logged or written.

## What is needed to run it

1. API keys for one Claude model and one GPT model, in the environment.
2. A spend cap. The runner aborts before a call that could pass `--budget`.
3. Checked scenarios. `node bench.mjs validate` must pass for every scenario before a freeze.
4. A frozen `protocol.lock.json`: copy `protocol.draft.json`, add `scenario_sha256` from `node bench.mjs hashes`, review the prompts and the model pins, and commit it before the first answer.
5. For the Tier B arm (the AI keeps the notes and the board), a test Listspace account.

## Sampling note

The design doc says temperature 0. The current Claude models reject temperature (Sonnet 5.5 returns a 400 for any non-default value, Opus 5.5 removed the parameter), so the protocol records sampling as `provider_default` and the runner sends no temperature unless a model sets `send_temperature` and the protocol holds a number. `--temp` must match the protocol value (`default` is accepted). Results hold for provider-default sampling; run-to-run variation is covered by the 3 runs with shuffled option order.

## Method rules

Reused from the baseline protocol of `continuity-sdk`, an earlier Yellow House Digital project that is not public. The thinking behind it, and behind this benchmark, starts in the article [Beyond Chat Memory](https://yellowhousedigital.com/writing/beyond-chat-memory) and the paper it links to.

- Freeze first. Scenarios, keys, prompts and the analysis plan are committed before the first answer.
- The weaker condition is not weakened further. Chat and notes get the same model, the same care and the same instruction.
- No mid-run fixes. A defect is logged, the run completes, a re-run is published as a re-run.
- Publish the misses, every question and every wrong answer.
- Keys come from the environment only.

## Licence

MIT (see `LICENSE`). Method and results are meant to be checked by someone who does not work at Listspace. `longmemeval/reference/evaluate_qa.official.py` is from the LongMemEval repository (https://github.com/xiaowu0162/LongMemEval), MIT, by its authors, kept unchanged for reference.
