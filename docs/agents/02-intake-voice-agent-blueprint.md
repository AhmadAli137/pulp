# 02. Intake voice agent blueprint (Stage A)

Goal: in under three minutes of conversation, learn the life context the bank data lacks, get explicit
confirmation, and hand a clean `IntakeHandoff` to the planning council. Pip (the tangerine) is the persona.

## What exists today (reuse, don't rebuild)

| Piece | File | Keep / change |
|---|---|---|
| Chat turn with Gemini tools + validated extraction | `backend/app/services/gemini_agent.py` (`gemini_turn`, `AgentExtraction`) | keep; add intake state |
| Vultr provider | `vultr_inference.py` | keep |
| Offline extractor and question heuristic | `gemini_agent.py` (`offline_extract`, `QUESTION_BANK`, `next_question`) | keep; extend question bank |
| Memory with proposals and confirm | `context_manager.py` | keep; add `intake_sessions` |
| Replan + diff | `feedback_loop.py` | keep |
| Browser voice in/out | `frontend/src/hooks/useSpeech.ts` | keep as the default voice stack |
| Gemini native audio relay (websocket) | `backend/app/api/voice.py`, `frontend/src/voice.js`, `public/pcm-worklet.js` | optional upgrade; not wired to the UI, untested |
| Home chat UI with inline proposals | `frontend/src/pages/Home.tsx` | keep; add intake progress + "Review my plan" |

## Conversation design

### Slots (what intake is trying to fill)

| Slot | Field in context | Required for handoff | Default if unknown |
|---|---|---|---|
| primary goal type + label | `goals[0].type/label` | yes | emergency_fund (labelled default) |
| goal timeline | `goals[0].target_months` | yes | by type (`strategy_optimizer.DEFAULT_GOAL_MONTHS`) |
| goal amount | `goals[0].target_amount` | no | derived + labelled assumption |
| biggest worry | `concerns[0].type` | yes | income_loss (default stress) |
| income replacement if worry is job loss | `constraints.income_replacement` | no | EI 55% for 6 months (sponsor twist) |
| monthly flexibility | `constraints.can_free_up_per_month` | no | 0 (surplus only) |
| expected rent (if moving out) | `constraints.expected_rent` | if goal = move_out | ask |
| startup budget (if business) | `constraints.startup_budget` | if goal = entrepreneurship | ask |
| risk preference | `preferences.risk_preference` | no | balanced |
| upcoming events | `upcoming_events[]` | no | none |

### State machine

```
GREET ──▶ ASK(slot) ──▶ LISTEN ──▶ EXTRACT ──▶ PROPOSE ──▶ CONFIRM? ──yes──▶ STORE+REPLAN ──▶ next slot or WRAP
                                      │                       │ no
                                      │                       └──▶ DISCARD ──▶ next slot
                                      └── nothing extracted ──▶ CLARIFY (once) ──▶ next slot
WRAP ──▶ SUMMARY (spoken, ≤ 60 words) ──▶ HANDOFF ready ──▶ offer "Review my plan"
```

Stop conditions: all required slots filled, or 6 questions asked, or the user says "that's it / let's see the
plan". Never ask a question whose key is already in `asked_questions`.

### Question policy

`next_question` already scores `relevance − burden − 0.5 × times_asked`. Add these entries to `QUESTION_BANK`:

| key | text | relevance when |
|---|---|---|
| `twist` | "Is there a specific shock you want me to test, like a layoff, a rent increase or a big repair?" | no concern and no suggested shock yet (0.75) |
| `replacement_months` | "If you lost your job, roughly how many months of income support would you have?" | concern income_loss, `income_replacement` has no `months` (0.8) |
| `review` | "Want me to have the plan reviewed before we lock it in?" | required slots filled (0.5) → triggers Stage B |

### Extraction contract

Keep `AgentExtraction` as the single schema. Both Gemini (`response_schema`) and Vultr (`json_schema`) already
emit it; the offline extractor produces the same shape. Add two optional fields:

```python
class AgentExtraction(BaseModel):
    ...
    suggested_shock: Optional[dict] = None   # {"income_fraction": 0.55, "bills_increase": 0, "one_off_cost": 0, "horizon_months": 6, "reason": "..."}
    intake_complete: bool = False            # model believes required slots are filled
```

The server decides completeness itself (slots table); `intake_complete` from the model is advisory.

### Confirmation protocol (unchanged, now spoken)

1. Pip says what it heard in one sentence and reads the proposal: "I'll save: goal move out in 12 months, worry job loss. OK?"
2. Voice "yes / save it / confirm" → `POST /api/context/confirm`. Voice "no / skip" → reject. Anything else → treat as a new message, proposal stays pending.
3. After confirm, speak the replanning diff in one sentence (`diff.reasons[0]`).

Implement the yes/no detection client-side with a tiny regex before sending to the API; do not send "yes" to
the model.

## Voice stack

**Default (works today, no credentials):** browser `SpeechRecognition` for input and `speechSynthesis` for
output via `useSpeech.ts`. Needs Chrome or Edge and HTTPS or localhost. Keep.

**Upgrade (optional):** the Gemini native-audio relay in `api/voice.py` (`/api/agent/voice/{account_id}`
websocket, PCM worklet). To wire it:

1. Add a toggle in Home ("Live voice") that opens the socket using `frontend/src/voice.js` `startVoice`.
2. The relay already declares tools `get_financial_profile`, `calculate_shock`, `propose_scenario`. Add
   `propose_context_update` that calls `context_manager.propose` so spoken context lands as a proposal.
3. Any error on the socket → close it and fall back to browser speech with a visible notice.
4. Do not ship it to judges unless it has survived ten consecutive turns on the demo laptop.

Vercel note: websockets are not supported by Vercel functions. The relay only works on the Vultr/Docker
deployment or locally. The browser stack works everywhere.

## Backend changes (small)

`backend/app/services/intake.py` (new):

```python
REQUIRED_SLOTS = ("goal", "goal_timing", "worry")

def slot_status(summary: dict) -> dict:  # which slots are filled, from context_manager.summarize
def is_complete(summary: dict) -> bool
def suggested_shock(summary: dict) -> dict | None   # concerns -> sponsor-style shock
def build_handoff(account_id: int) -> dict          # IntakeHandoff (see 04-contracts.md)
```

Routes: `GET /api/context/{id}/handoff` → `build_handoff`; `/api/agent/chat` response gains
`intake: {complete, filled, missing, suggested_shock}`.

## Frontend changes

- Progress chips under the chat box: filled slots in green, missing in grey ("goal · timeline · worry · flexibility").
- When `intake.complete`, show "Review my plan" (calls `POST /api/council/plan` with `suggested_shock`), and Pip asks the `review` question.
- Speak replies when the mic was used for the last message (auto), otherwise only if "read aloud" is on.

## Error handling

| Failure | Behaviour |
|---|---|
| Mic permission denied | message "You can keep typing", input focused |
| No speech detected in 8 s | stop listening, keep text |
| Extraction finds nothing twice | Pip asks the clarify question once, then moves to the next slot |
| API error | bubble with the message; the last proposal stays pending |
| User says a number only | treated as account id if ≥ 3 digits (exists) |

## Test script (manual, 2 minutes)

1. Load 47788. Say "I want to move out next year but I'm worried about losing my job." Expect a proposal with goal move_out (12 months), concern income_loss, and the next question about rent.
2. Say "Rent would be about $1,800." Expect constraint expected_rent 1800; next question about income replacement or flexibility.
3. Say "I'd get EI for six months and could free up about $300 a month." Expect constraints income_replacement and can_free_up_per_month.
4. Say "yes" to each proposal; confirm the diff sentence is spoken and context version increments.
5. Say "review my plan". Expect the council panel to open with `mode` adk or fallback and Pip to read a summary under 60 words.

Automated versions of 1 to 4 belong in `backend/tests/test_intake.py` using `prefer_offline=True`.
