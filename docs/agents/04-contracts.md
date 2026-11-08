# 04. Contracts between the stages

All three objects are JSON. Field names are final; add fields, never rename. Worked values are for account
47788 under the layoff twist (r = 0.55, h = 0, C = 0, T = 6) and are taken from the live API.

## IntakeHandoff (Stage A → user → Stage B)

`GET /api/context/{account_id}/handoff`

```json
{
  "account_id": 47788,
  "context_version": 3,
  "confirmed_context": {
    "goals": [{"type": "move_out", "label": "Move out", "target_months": 12, "priority": 1}],
    "concerns": [{"type": "income_loss", "label": "income loss"}],
    "constraints": [{"type": "expected_rent", "amount": 1800}, {"type": "can_free_up_per_month", "amount": 300},
                    {"type": "income_replacement", "fraction": 0.55, "months": 6, "label": "EI at 55%"}],
    "preferences": [{"type": "risk_preference", "choice": "safety"}],
    "upcoming_events": []
  },
  "slots": {"filled": ["goal", "goal_timing", "worry", "rent", "flexibility", "income_replacement", "risk"], "missing": []},
  "suggested_shock": {"income_fraction": 0.55, "bills_increase": 0.0, "one_off_cost": 0.0, "horizon_months": 6,
                      "reason": "You said you worry about losing your job; EI typically replaces 55% for up to 6 months."},
  "open_questions": [],
  "last_replan": {"recommended": "buffer_first", "prob_shortfall_under_stress": 0.41, "goal": "Move out"}
}
```

Rules: `confirmed_context` only contains confirmed items (pending proposals are excluded); `suggested_shock`
is derived by `intake.suggested_shock` from concerns and constraints, never by the model alone.

## PlanningSnapshot (built in Python for the council)

```json
{
  "account_id": 47788,
  "metrics": {"typical_inflow": 11493.34, "typical_spending": 10927.03, "typical_fixed_costs": 0.0, "household_bills": 0.0,
              "buffer": 25792.11, "typical_surplus": 566.31, "baseline_runway_label": "no shortfall (120+)", "months_available": 30},
  "shock": {"income_fraction": 0.55, "bills_increase": 0.0, "one_off_cost": 0.0, "horizon_months": 6},
  "shock_report": {
    "shocked": {"income_after": 6321.33, "spending_after": 10927.03, "buffer_left": 25792.11, "monthly_gap": 4605.69, "runway_label": "5.6", "runway_status": "finite"},
    "verdict": {"survives": false, "shortfall_over_horizon": 1842.0, "verdict": "Does not make it. Cash runs out after 5.6 months, 0.4 months short, a $1,842 shortfall."},
    "goal_plan": {"cash_needed": 27634.0, "additional_buffer_needed": 1842.0, "capacity_to_save_per_month": 566.31, "months_to_target": 3.3, "note": "Set aside the typical monthly surplus of $566; at that pace the extra $1,842 takes about 3.3 months."},
    "backup_plan": {"immediate_need": 0.0, "recurring_gap": 4605.69, "monthly_improvement_needed": 307.0, "note": "To last 6 months, free up $307 a month (cut spending or add income). The remaining buffer of $25,792 covers the rest of the $4,606 monthly gap."},
    "tipping_point": {"kind": "already_fails", "note": "Even with no bill increase the account lasts only 5.6 months under this income shock."},
    "explanation": {"primary_driver": "income", "summary": "Income fell by $5,172 a month"}
  },
  "context": {"...": "IntakeHandoff.confirmed_context plus asked_questions"},
  "comparison": {"goal": {"type": "move_out", "label": "Move out", "target_amount": 32781.0, "target_months": 12},
                 "stress_label": "Stress: layoff at 55% for 6 months starting month 3",
                 "weights": {"resilience": 0.8, "goal": 0.2}, "capacity_per_month": 866.31, "emergency_target": 27634.0,
                 "recommended": "buffer_first", "why": "...",
                 "strategies": [{"key": "stay", "prob_shortfall_under_stress": 0.40, "goal_progress_at_deadline": 0.0}, {"key": "buffer_first", "...": "..."}]},
  "roadmap": {"this_week": ["..."], "this_month": ["..."], "next_three_months": ["..."], "next_year": ["..."]}
}
```

Exact values are whatever the services return at call time; the point is the shape and that **the council
receives numbers, not raw rows**.

## CouncilResult (Stage B → UI and Pip)

`POST /api/council/plan`

```json
{
  "account_id": 47788, "mode": "adk", "elapsed_s": 21.4, "context_version": 3,
  "snapshot_digest": {"I": "$11,493", "S": "$10,927", "B": "$25,792", "runway": "5.6", "gap": "$4,606", "verdict": "Does not make it."},
  "draft": {
    "headline": "Under a six-month layoff at 55% income this account does not make it: official runway 5.6 months, $1,842 short.",
    "verdict_ref": {"label": "official runway", "value": "5.6", "source": "shock_report.shocked.runway_label"},
    "goal_actions": [{"title": "Add $1,842 to the buffer before the shock", "amount": 1842, "when": "next_three_months",
                      "effect": "Covers the six-month shortfall", "tradeoff": "3.3 months of surplus go to the buffer, not the move",
                      "assumption": "Capacity = typical surplus $566", "review_trigger": "Any month inflow is below typical"}],
    "backup_actions": [{"title": "Free up $307 a month if the layoff happens", "amount": 307, "when": "this_month", "effect": "Lasts the full 6 months",
                        "tradeoff": "Pauses the move-out contribution", "assumption": "Cash flows constant through the horizon", "review_trigger": "The day income changes"}],
    "assumptions": ["EI replaces 55% from month one; the replacement period is 14 to 45 weeks"],
    "numbers_used": [{"label": "monthly gap", "value": "$4,606", "source": "shock_report.shocked.monthly_gap"}]
  },
  "advocate": {"fits_customer": true, "conflicts": [], "acceptable_tradeoffs": ["Move-out delayed by about 3 months while the buffer is topped up"],
               "question_for_customer": null, "requested_changes": ["Keep the $300/month the customer said they can free up as the backup amount, not $307"]},
  "challenger": {"failure_cases": ["If the layoff lasts 9 months instead of 6: runway 5.6, short by $15,660"],
                 "evidence": [{"label": "runway at 9-month horizon", "value": "5.6", "source": "tool:alternate_shocks"}],
                 "requested_changes": ["State the 9-month case in unresolved"],
                 "confidence_note": "Model output for a chosen scenario on anonymized data; not a forecast and not a real-world probability of the event."},
  "final": {"...draft fields...", "changes_made": ["Backup amount set to $300/month (Advocate: matches what the customer said they can free up)",
                                                   "Added the 9-month layoff gap to unresolved (Challenger)"],
            "unresolved": ["A layoff longer than 6 months is not covered: at 9 months the gap is $15,660"]},
  "summary_spoken": "Under a six-month layoff at 55% income you run out after 5.6 months, about $1,842 short. Adding $1,842 to your buffer over three months closes it. If it happens, freeing up $300 a month keeps you whole. A longer layoff is not covered.",
  "tool_log": [{"tool": "alternate_shocks", "args": {"horizon_months": 6}, "result_digest": "6 shocks, 4 horizons"}]
}
```

Rules: `final` is what the UI shows as "the plan"; `draft` stays visible for the before/after. `mode` is
`fallback` whenever no LLM ran, `partial` when any agent fell back. The result never changes
`context_version`; if the advocate asks a question, the UI routes it to the chat for consent.
