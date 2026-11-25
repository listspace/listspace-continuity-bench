# listspace-continuity-bench

Does your AI work from the current plan?

Memory benchmarks mostly ask whether an AI can recall an old fact. This one asks a different question. After a project has changed its mind several times, does a fresh AI session answer from the current confirmed decision, or from one that was replaced or never confirmed?

Status: pilot-ready scaffold. Ten scenarios (three hand written, seven drafted by an AI agent and not yet reviewed by Jordi), deterministic scoring, a validator, provider calls, a spend meter and a dry run. No model has been called. Nothing here is a result.

## What is measured

A scenario is a short project history: sessions in which decisions are proposed, confirmed and replaced, and tasks are added and finished. A fresh AI session gets one memory condition and answers closed questions about the project right now.

| Condition | What the fresh session receives |
|---|---|
| A. Chat | Every past session's conversation, in order |
| B. Notes | A markdown notes file that an AI kept, session by session |
| C. Board | The Listspace board view: decisions marked Confirmed, Replaced or Proposed (with history), tasks in plan order |
| D. Continuity SDK (optional) | The governed claim store from `continuity-sdk`, authority states PD, SU, RNA, CAC |

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

A real `run` refuses to start unless `--budget`, `--models`, `--runs`, `--temp` and `--out` are given, every model has a verified price in `config/prices.json` (price, `source_url` and `verified_on`), the provider key is in the environment (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`), and `protocol.lock.json` exists with matching scenario hashes. It does not retry, because a retry changes the conditions mid-run: a provider error stops the run. Before every call the runner checks that the worst case (estimated input plus the full output cap) fits in the remaining budget, and aborts cleanly if not. Rows are appended to `<out>/results.jsonl` as they happen, so an aborted run keeps what it had. Provider calls use plain `fetch` (Anthropic Messages API, OpenAI Responses API); keys are read from the environment at call time and never logged or written.

## What is needed to run it

1. API keys for one Claude model and one GPT model, in the environment.
2. A spend cap. The runner aborts before a call that could pass `--budget`.
3. Reviewed scenarios. Three are hand written. Seven (s004 to s010) are drafted by an AI agent and carry `review.reviewed_by_jordi: false`. Every chat transcript and answer key is read by a person before the freeze.
4. A frozen `protocol.lock.json`: copy `protocol.draft.json`, add `scenario_sha256` from `node bench.mjs hashes`, review the prompts and the model pins, and commit it before the first answer.
5. For the Tier B arm (the AI keeps the notes and the board), a test Listspace account.

## Sampling note

The design doc says temperature 0. The current Claude models reject temperature (Sonnet 5.5 returns a 400 for any non-default value, Opus 5.5 removed the parameter), so the protocol records sampling as `provider_default` and the runner sends no temperature unless a model sets `send_temperature` and the protocol holds a number. `--temp` must match the protocol value (`default` is accepted). Results hold for provider-default sampling; run-to-run variation is covered by the 3 runs with shuffled option order.

## Method rules, reused from continuity-sdk BASELINE_PROTOCOL

- Freeze first. Scenarios, keys, prompts and the analysis plan are committed before the first answer.
- The weaker condition is not weakened further. Chat and notes get the same model, the same care and the same instruction.
- No mid-run fixes. A defect is logged, the run completes, a re-run is published as a re-run.
- Publish the misses, every question and every wrong answer.
- Keys come from the environment only.

## Licence

MIT. Method and results are meant to be checked by someone who does not work at Listspace.
