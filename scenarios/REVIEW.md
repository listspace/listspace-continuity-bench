# Review record

This file records reviews. The scenario files are not edited for it, so the hashes frozen in `protocol.lock.json` stay valid.

| Date | Who | What was reviewed | Outcome |
|---|---|---|---|
| 2026-11-25 | Jordi | s004 to s010 as drafted (v1), and the v1 prompts | "fine" |
| 2026-11-26 | Jordi | `scenarios/CHANGES-v2.md`, the list of v2 changes to s001 to s010 | "fine". Jordi kept the B2 arm. |
| 2026-11-26 | Jordi | `scenarios/CHANGES-v3.md`, 37 reworded or added lines so every confirmation is said directly by the decider | "fine". Given after the v3 run had finished, not before it. |

Notes:

- The `review.reviewed_by_jordi: false` flag inside s004 to s010 was written before the v2 review and is left as it is. This file is the record that the v2 changes were reviewed.
- Jordi reviewed the change list, not every chat line. The generated chatter was not read line by line.
- The v2 run (`runs/v2-2026-11-26`) found that some v2 chat lines say "Sofia wants" or "Ravi moved" where the answer key counts a confirmation. A strict reader can take that as unconfirmed. See `RESULTS.md` in that folder. This is not covered by the review above.
