# LongMemEval-S mini run (Tier B)

Five knowledge-update questions from LongMemEval-S, to measure real token use and cost before phase 1. Status: run on 26 Nov 2026, results in `runs/mini-2026-11-27` and in the main README. Five questions are a sample, not a score.

## Conditions

| Condition | What happens |
|---|---|
| full | The model alone gets the whole chat history (about 120k tokens) in one prompt. The official step-by-step long-context prompt of the LongMemEval repo, history in date order. |
| board | Tier B. One fresh board on staging per question. The model reads the sessions in date order and keeps the board current through five tools (create_item, update_item, record_decision, move_item, read_board), each mapped to one Listspace REST call and described with Listspace's own tool text (`config/tool-defs.json`, generated from `listspace-app/public/openapi.json` by `scripts/gen-tools.mjs`). After the last session the model answers from the board only, in a fresh call. |

Both run for `claude-sonnet-5-5` and `gpt-6.2-sol`, effort low, provider default sampling, as in the v2 protocol.

How the board condition works, and where it differs from a live MCP session:

- The providers in `src/providers.mjs` take one system and one user message and have no tool-use protocol. The keeper therefore calls tools by replying with one JSON object, `{"calls": [...], "done": true|false}`, and the tool results come back in the next user message. The tool descriptions are Listspace's own. The call format is ours.
- Each session starts with the board as it is now (lists, items with their text) in the prompt, like start_session. The keeper gets at most 8 tool calls and 4 turns per session (`config/protocol.json`, `caps`). Calls past the cap are skipped and logged.
- The final answer view is the board read through the API: every open item with its full text, plus the board's decisions and the Inbox. start_session itself lists item titles only, so the text of each item is read with get_item. This is a deliberate choice, so the answer is one call.
- record_decision always lands in the Inbox as a proposal (only the user confirms). The answer prompt tells the model that a Proposed decision is what the person said. Only 5 proposals can wait per board, further ones answer 429 and go back to the keeper as a failed call. This is a known wrinkle of the method, not a bug: report it.

## Dataset

LongMemEval-S, cleaned version, by Di Wu et al. (ICLR 2025). Licence: MIT (the dataset card on Hugging Face and the code repo both say MIT).

- Source: https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned (code: https://github.com/xiaowu0162/LongMemEval)
- File: `data/longmemeval_s_cleaned.json`, 277,383,467 bytes, sha256 `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442` (checked on every run). `data/` is gitignored.
- Re-download: `curl -L -o longmemeval/data/longmemeval_s_cleaned.json https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json`
- `reference/evaluate_qa.official.py` is the official judge script (MIT), kept for reference.

Questions: 5 of the 78 knowledge-update questions, picked by a seeded shuffle of the sorted ids (seed `lme-mini-2026-11-27`, `node longmemeval/run.mjs select`). The ids are in `config/selected-questions.json`: ed4ddc30, 4d6b87c8, e493bb7c, 8fb83627, eace081b. The 78 include 6 abstention questions (`_abs`); none of these five is one.

## Scoring

The official LongMemEval judge: `gpt-4o-2024-08-06` through chat completions, temperature 0, max_tokens 10, the per-type prompts copied verbatim from `src/evaluation/evaluate_qa.py`. A reply containing "yes" is correct. The judge model is written on every judge row (`judge_is_official`), in `summary.json` and printed at the end of the run. If you pass `--judge-model <other>` the run says SUBSTITUTE everywhere and the numbers are not comparable to published ones. The run needs `OPENAI_API_KEY` for the judge, also when both models are Claude.

For a second opinion with the unmodified official script: `hypotheses.<model>.<condition>.jsonl` in each run folder is in its input format, so `python longmemeval/reference/evaluate_qa.official.py gpt-4o <hypotheses file> longmemeval/data/longmemeval_s_cleaned.json` works.

## Staging account

The board condition runs against Listspace's staging server, which is ours. To rerun it, ask us for a staging account, or point the API base at your own Listspace account (the harness refuses anything but staging, so that needs a one-line change in `src/api.mjs`). The steps we followed:

Do not paste the token into a chat or a file. Nothing here creates the account.

1. Open https://staging.listspace.app and sign up with a throwaway address (a plus address of yours works). Confirm the email.
2. Settings > Your AI: set the agent access level of the account to 5 (Full). Level 4 sends board archiving to the Inbox, and the clean-up script needs it to apply.
3. Settings > Your AI > API tokens: create a token named `lme-mini`. Copy it once (`ls_` and 43 characters).
4. Store it in your User environment, in PowerShell:
   `[Environment]::SetEnvironmentVariable('LISTSPACE_STAGING_TOKEN', '<paste the token>', 'User')`
   Open a new PowerShell window afterwards.
5. If staging's Free plan limits the number of boards, upgrade the throwaway account or note it: the run needs 10 boards (5 questions, 2 models).

The harness reads `LISTSPACE_STAGING_TOKEN` at call time only and refuses any base URL other than `https://staging-backend.listspace.app/functions/v1/api/v1`, including a different host, port, path or a redirect. Tokens are sent only in the Authorization header and are redacted from error text.

## Commands (from the repo root)

Estimate, no keys and no network:

```powershell
node longmemeval/run.mjs dry-run --budget 25
```

The run, keys loaded from the User environment in the same line:

```powershell
$env:ANTHROPIC_API_KEY=[Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY','User'); $env:OPENAI_API_KEY=[Environment]::GetEnvironmentVariable('OPENAI_API_KEY','User'); $env:LISTSPACE_STAGING_TOKEN=[Environment]::GetEnvironmentVariable('LISTSPACE_STAGING_TOKEN','User'); node longmemeval/run.mjs run --budget 25 --models claude-sonnet-5-5,gpt-6.2-sol --out longmemeval/runs/mini-2026-11-27
```

Before you start, check the prices in `../config/prices.json` and the provisional judge price in `config/judge.json` against their source pages. `--budget` is a hard stop: before every call the meter checks that the worst case (estimated input plus the full output cap) still fits, and aborts cleanly otherwise. Rows already written stay.

Clean up afterwards (archives the boards the run made, never deletes):

```powershell
$env:LISTSPACE_STAGING_TOKEN=[Environment]::GetEnvironmentVariable('LISTSPACE_STAGING_TOKEN','User'); node longmemeval/cleanup.mjs --run longmemeval/runs/mini-2026-11-27
```

Add `--dry-run` to list the boards first. Run it after an aborted run as well: `boards.jsonl` is written as each board is created.

## Resume after an error

If a run stops on a provider error (an HTTP 400 usage limit, a 503, a budget abort), continue it in the same folder:

```powershell
node longmemeval/run.mjs run --resume longmemeval/runs/mini-2026-11-27 --budget 25 --dry-run   # units still to run and their estimated cost, no keys needed
node longmemeval/run.mjs run --resume longmemeval/runs/mini-2026-11-27 --budget 25             # keys loaded as above
```

- It refuses unless the dataset sha256, the selected questions, the protocol, the models, the conditions, the judge model and the API base match the first attempt (it prints each difference).
- A unit (model, question, condition) is done only if it has a judge row. Done units are skipped. Every other unit starts from scratch. A board unit that was mid-keeping gets a NEW board; the old one is added to `boards.jsonl` again with `abandoned: true`, so `cleanup.mjs` still archives it.
- `results.jsonl` is only appended to. New rows carry `attempt`. The earlier rows of redone units stay but are listed under `resumes[].units_redone` in `run-config.json` and left out of `summary.json`, the hypotheses files and the printed summary (`rows_excluded_as_abandoned`). Their cost still counts as spent.
- `--budget` is the total for the whole run: what is already spent is subtracted first. The previous `summary.json` is kept as `summary.attempt-N.json`, and the resume (time, previous status and error, skipped and redone units, abandoned boards, outcome) is recorded in `run-config.json`.

## Where results land

`longmemeval/runs/mini-2026-11-27/` (gitignored):

- `results.jsonl`: one row per call. `keeper_turn` (usage, cost, the model's reply), `tool_call` (tool, ok, error), `answer` (hypothesis, usage, cost, for the board condition the keeper totals and the board text the model answered from), `judge` (model, official flag, label).
- `summary.json`: status, spend, and per model and condition: correct, tokens, cost, cost per question, keeper turns, tool calls and failures.
- `hypotheses.<model>.<condition>.jsonl`: official judge input format.
- `boards.jsonl`: board ids for the clean-up. `run-config.json`: everything needed to repeat the run (no secrets).

The first thing to read is cost per question in `summary.json` against the dry-run numbers, and `tool_calls_failed`.

## Tests

`node --test longmemeval/test/` (also part of `npm test`). Fake providers, a fake Listspace API behind a fake fetch, a fake judge; no network and no keys. Covers the budget abort, the tool loop bound, the staging-only guard, answer extraction, reply parsing, the judge call and seeded selection.
