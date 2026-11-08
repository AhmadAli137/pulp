# 05. Testing and acceptance

## Automated (pytest, offline, must pass in CI)

| Area | Test | Pass condition |
|---|---|---|
| Intake slots | `test_intake.py::test_slots_from_context` | `slot_status` marks goal/timing/worry from a confirmed context; missing list correct |
| Intake handoff | `test_handoff_shape` | `GET /api/context/{id}/handoff` matches 04-contracts; pending proposals excluded |
| Suggested shock | `test_suggested_shock` | income_loss → r 0.55 T 6; rising_costs → h 0.15; both → combined; none → None |
| Intake flow (offline) | `test_two_turn_intake` | move-out + job-loss message then "$1,800 rent" yields the three expected proposals and no repeated question |
| Council fallback | `test_fallback_council_layoff` | headline contains the official runway label; backup amount equals `backup_plan.monthly_improvement_needed` |
| Parity | `test_number_refs_exist` | every `NumberRef.value` appears in the serialized snapshot or tool log |
| 404 | `test_unknown_account` | `/api/council/plan` with id 1 → 404, no agent run |
| ADK stub | `test_adk_path_with_stub` | monkeypatched Runner returns canned state → `mode="adk"`, schemas validate |
| Timeout | `test_partial_on_timeout` | stub sleeping past budget → `mode="partial"`, elapsed < budget + 2 s |
| Consent | `test_council_never_writes_context` | `context_version` unchanged after a council run |
| Existing | all 50 current tests | still pass |

## Manual (demo laptop, with the real Gemini key)

1. Offline toggle: stop the key, run the full flow; everything still answers with `mode` offline/fallback.
2. Latency: intake turn under 15 s; council under 45 s; measure with the `elapsed_s` field three times.
3. Parity spot check: pick three numbers in the council's text and find each in Shock Lab or the snapshot.
4. Voice: ten consecutive spoken turns on Chrome without a stuck mic; "yes" confirms, "no" discards.
5. Replanning: "buy a home in five years" → confirm → "start a business next year, irregular income" → confirm → Goals shows a changed recommendation with reasons; council re-run shows the new stress label.
6. Unknown id, non-numeric id, empty message: clear errors, no crash.

## Acceptance (what "done" means for each stage)

Stage A is done when a judge can speak three sentences and end with a confirmed context of at least goal,
timeline and worry, a spoken summary, and a "Review my plan" button that carries the suggested shock.

Stage B is done when `POST /api/council/plan` returns a `CouncilResult` in both `adk` and `fallback` modes for
any valid account, the final plan differs from the draft only by changes traceable to a review, every number
in the result is traceable to the snapshot or a tool call, and the UI shows the three reviews side by side.

## Demo rehearsal checklist

- [ ] Context for the demo account deleted (Settings)
- [ ] Intro plays or is skipped deliberately
- [ ] Account 47788 loaded through Pip, twist spoken, verdict card shown
- [ ] Goal and worry confirmed by voice, diff sentence heard
- [ ] "Review my plan" → council panel with three columns in under 45 s, `mode` visible
- [ ] One number from the panel verified live in Shock Lab
- [ ] Fallback demonstrated once by toggling `prefer_fallback` (shows resilience to AI outages)
