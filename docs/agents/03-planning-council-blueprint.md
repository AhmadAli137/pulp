# 03. Planning council blueprint (Stage B, Google ADK)

Three agents review one plan. The Financial Consultant owns the answer; the Customer Advocate and the Scenario
Challenger must be able to change it. Everything numeric comes from the existing Python services.

## Directory layout

```
backend/app/agents/
  __init__.py
  snapshot.py        build_snapshot(account_id, shock) -> PlanningSnapshot (dict)       [Python only]
  tools.py           thin ADK FunctionTools over existing services                    [Python only]
  evidence.py        deterministic evidence packs: check_constraints, alternate_shocks, tipping summary
  schemas.py         Pydantic: DraftPlan, AdvocateReview, ChallengerReview, FinalPlan, CouncilResult
  prompts.py         the three instruction strings (copied from this file)
  council.py         build_council() -> SequentialAgent; run_council(snapshot, budget_s) -> CouncilResult
  fallback.py        fallback_council(snapshot) -> CouncilResult  (no LLM)
backend/app/api/council.py      POST /api/council/plan, GET /api/council/{id}/last
backend/tests/test_council.py
frontend/src/pages/Goals.tsx    "Council review" panel (and a compact card on Home after "Review my plan")
```

Install: add `google-adk>=1.0` to `backend/requirements.txt` (not to the Vercel `requirements.txt` until the
function size has been checked; the fallback keeps Vercel working without it).

Environment: ADK reads `GOOGLE_API_KEY`. In `backend/app/config.py` add
`os.environ.setdefault("GOOGLE_API_KEY", GEMINI_API_KEY)` and `ADK_MODEL = os.environ.get("ADK_MODEL", GEMINI_MODEL)`.

## 1. Snapshot (`snapshot.py`)

```python
def build_snapshot(account_id: int, shock: dict) -> dict:
    m = get_metrics(account_id)                                     # KeyError -> 404 upstream
    report = full_shock_report(m, r=shock["income_fraction"], h=shock["bills_increase"],
                               one_off=shock["one_off_cost"], horizon_months=shock["horizon_months"])
    ctx = cm.load_context(account_id)
    comparison = compare_strategies(m, ctx, n_paths=300)
    rm = build_roadmap(m, ctx, comparison)
    return {
        "account_id": account_id,
        "metrics": {k: v for k, v in m.to_dict().items() if k not in ("history", "buffer_rows")},
        "shock": shock,
        "shock_report": report,                                       # baseline, shocked, verdict, goal_plan, backup_plan, tipping_point, explanation
        "context": cm.summarize(ctx),
        "comparison": {k: comparison[k] for k in ("goal", "stress_label", "weights", "capacity_per_month",
                                                   "emergency_target", "recommended", "why")}
                       | {"strategies": [{k: s[k] for k in ("key", "label", "feasible", "monthly_contribution",
                                                             "prob_shortfall_under_stress", "goal_progress_at_deadline",
                                                             "months_to_goal_deterministic")} for s in comparison["strategies"]]},
        "roadmap": {k: rm[k] for k in ("this_week", "this_month", "next_three_months", "next_year")},
    }
```

Strip chart arrays (`buffer_median_path`, percentiles) before injecting; they are long and the agents never need them.

## 2. Tools (`tools.py`)

Each tool is a plain function with a docstring (ADK turns it into a declaration). They return dicts of
numbers that already exist or are computed by the services. No tool writes memory.

```python
def run_shock(account_id: int, income_fraction: float, bills_increase: float, one_off_cost: float, horizon_months: int) -> dict:
    """Official sponsor shock for an alternative scenario. Returns runway, verdict, goal plan, backup plan."""
def simulate_paths(account_id: int, income_fraction: float, bills_increase: float, one_off_cost: float,
                   shock_start: int, shock_duration: int, horizon_months: int,
                   freed_up_per_month: float = 0.0, goal_contribution_per_month: float = 0.0, goal_target: float = 0.0) -> dict:
    """Monte Carlo projection (seeded). Returns prob_below_zero_any, median_min_buffer, median_end_buffer, goal_reached_share and the disclaimer."""
def tipping_point(account_id: int, income_fraction: float, one_off_cost: float, horizon_months: int) -> dict:
    """Largest household-bill increase absorbable through the horizon."""
def compare_strategies_tool(account_id: int) -> dict:
    """Four strategies under the context-shaped stress; recommended key, why, weights."""
def check_constraints(account_id: int, monthly_contribution: float, freed_up_per_month: float) -> dict:
    """Deterministic fit check: compares a proposed monthly amount with typical surplus, stated can_free_up_per_month, expected rent, startup budget; returns conflicts[]."""
def alternate_shocks(account_id: int, horizon_months: int) -> dict:
    """Evidence pack: official runway under 6 fixed shocks (baseline, layoff 55%, bills +15%, repair = 1 month S, combined, income 70%) plus horizon sensitivity (3, 6, 9, 12 months)."""
```

Wrap with `FunctionTool(fn)` or pass the callables directly in `tools=[...]`.

## 3. Schemas (`schemas.py`)

```python
class NumberRef(BaseModel):
    label: str              # "official runway", "monthly gap", ...
    value: str              # the exact string as it appears in the snapshot or a tool result, e.g. "5.6", "$4,606"
    source: str             # "shock_report.shocked.runway_label" or "tool:run_shock(r=0.7)"

class Action(BaseModel):
    title: str; amount: Optional[float] = None; when: Literal["this_week","this_month","next_three_months","next_year"]
    effect: str; tradeoff: str; assumption: str; review_trigger: str

class DraftPlan(BaseModel):
    headline: str                     # one sentence verdict, quoting the official runway
    verdict_ref: NumberRef
    goal_actions: list[Action]        # before the shock
    backup_actions: list[Action]      # if it happens
    assumptions: list[str]
    numbers_used: list[NumberRef]

class AdvocateReview(BaseModel):
    fits_customer: bool
    conflicts: list[str]              # "Plan asks for $566/mo but customer said they can free up $300"
    acceptable_tradeoffs: list[str]
    question_for_customer: Optional[str]   # at most one
    requested_changes: list[str]

class ChallengerReview(BaseModel):
    failure_cases: list[str]          # "Fails if the layoff lasts 9 months: runway 5.6 < 9"
    evidence: list[NumberRef]
    requested_changes: list[str]
    confidence_note: str              # must include the simulation disclaimer when Monte Carlo is cited

class FinalPlan(DraftPlan):
    changes_made: list[str]           # what the revision changed and which review asked for it
    unresolved: list[str]             # gaps neither plan nor review could close (money and time)

class CouncilResult(BaseModel):
    account_id: int; mode: Literal["adk","partial","fallback"]; elapsed_s: float
    snapshot_digest: dict             # I, S, H, B, runway label, gap, verdict
    draft: DraftPlan; advocate: AdvocateReview; challenger: ChallengerReview; final: FinalPlan
    summary_spoken: str               # <= 60 words, for Pip to read
    context_version: int
```

Parity rule enforced in code: every `NumberRef.value` must occur verbatim in the serialized snapshot or in a
tool result captured during the run; otherwise the ref is dropped and `mode` degrades to `partial`.

## 4. Agent instructions (`prompts.py`)

Inject `{snapshot_json}` with ADK's instruction templating (`instruction=lambda ctx: ...` or `{state_key}`).

**Financial Consultant (draft)**

```
You are the Financial Consultant in PULP's planning council. You build the first plan for one anonymized bank account.
Non-negotiable: every dollar or month you mention must be copied from SNAPSHOT or from a tool result; cite it in numbers_used.
Never compute, round differently, or estimate. Never claim the account belongs to the person.
SNAPSHOT: {snapshot_json}
Write a DraftPlan:
- headline: the official verdict with the official runway (shock_report.verdict.verdict and shock_report.shocked.runway_label).
- goal_actions: from shock_report.goal_plan and roadmap (before the shock): amount, effect, trade-off, assumption, review trigger.
- backup_actions: from shock_report.backup_plan (immediate need and monthly amount separately).
- assumptions: cash flows constant through the horizon; capacity = typical surplus plus stated free-up; EI note if income_fraction = 0.55.
Keep it under 220 words of prose across fields. Output only the schema.
```

**Customer Advocate**

```
You are the Customer Advocate. Your only loyalty is to what the customer confirmed (SNAPSHOT.context).
Check the DraftPlan ({consultant_draft}) against: goals (type, timeline, amount), constraints (can_free_up_per_month, expected_rent,
startup_budget, income_replacement), preferences (risk_preference), upcoming events.
Call check_constraints with the draft's monthly amounts to get deterministic conflicts; do not invent affordability.
Return AdvocateReview. Rules: cite numbers only from SNAPSHOT or tool results; at most one question_for_customer, and only if a
missing fact would change the plan; requested_changes must be concrete ("cap contribution at $300/mo until rent is known").
If the plan fits, say so and list the trade-offs the customer is accepting.
```

**Scenario Challenger**

```
You are the Scenario Challenger. Assume the DraftPlan ({consultant_draft}) is wrong somewhere and find out where.
Use alternate_shocks for the official runway under other shocks and horizons, tipping_point for how much bills could rise, and
simulate_paths (seeded) for a Monte Carlo view with the plan's monthly amounts applied.
Return ChallengerReview: failure_cases are concrete ("layoff lasting 9 months: runway 5.6, short by $X"), each backed by a NumberRef
from a tool result. Monte Carlo figures must be labelled as model output for the chosen scenario, never as a real-world probability;
copy the tool's disclaimer into confidence_note. requested_changes must be actionable and ranked by impact.
```

**Financial Consultant (revise)**

```
Revise your DraftPlan using {advocate_review} and {challenger_review}. Accept a requested change when it is backed by a cited number or a
confirmed constraint; otherwise explain in changes_made why you kept the original. Produce FinalPlan with changes_made (what and who asked)
and unresolved (gaps in dollars and months that neither plan nor backup closes). Then write summary_spoken: at most 60 words, plain
language, the verdict first, one action, one caveat. Numbers only from SNAPSHOT or tool results.
```

## 5. Orchestration (`council.py`)

```python
from google.adk.agents import LlmAgent, ParallelAgent, SequentialAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

def build_council(snapshot_json: str) -> SequentialAgent:
    consultant = LlmAgent(name="consultant_draft", model=ADK_MODEL, instruction=CONSULTANT_DRAFT.replace("{snapshot_json}", snapshot_json),
                          tools=[run_shock, compare_strategies_tool], output_key="consultant_draft")
    advocate = LlmAgent(name="advocate", model=ADK_MODEL, instruction=ADVOCATE.replace("{snapshot_json}", snapshot_json),
                        tools=[check_constraints], output_key="advocate_review")
    challenger = LlmAgent(name="challenger", model=ADK_MODEL, instruction=CHALLENGER.replace("{snapshot_json}", snapshot_json),
                          tools=[alternate_shocks, tipping_point, simulate_paths], output_key="challenger_review")
    reviser = LlmAgent(name="consultant_revise", model=ADK_MODEL, instruction=CONSULTANT_REVISE, output_schema=FinalPlan, output_key="final_plan")
    return SequentialAgent(name="pulp_council", sub_agents=[consultant, ParallelAgent(name="reviews", sub_agents=[advocate, challenger]), reviser])
```

Notes that save time:

- ADK does not allow `tools` and `output_schema` on the same agent. Agents with tools return JSON text; parse it with the Pydantic model and retry once with a "fix the JSON" message on failure. The reviser has no tools, so it can use `output_schema`.
- Run with `Runner(agent=root, app_name="pulp", session_service=InMemorySessionService())`, `run_async(user_id="judge", session_id=<uuid>, new_message=types.Content(role="user", parts=[types.Part(text="Build and review the plan.")]))`, and read `session.state["consultant_draft"]`, `["advocate_review"]`, `["challenger_review"]`, `["final_plan"]` afterwards.
- Wrap the whole run in `asyncio.wait_for(..., timeout=45)`. On timeout, keep whatever state keys exist and fill the rest from `fallback.py`; set `mode="partial"`.
- Record every tool call (name, args, result digest) into `tool_log`; the UI shows it as evidence.

## 6. Fallback (`fallback.py`)

Pure Python, always available, used for `mode="fallback"` and for tests:

- draft: headline = `shock_report.verdict.verdict`; actions from `roadmap` and the two plans.
- advocate: `check_constraints(...)` conflicts rendered as sentences; `fits_customer = not conflicts`.
- challenger: `alternate_shocks` rows that fail the horizon → failure cases; `tipping_point.note`; one `simulate` with the recommended strategy → evidence with the disclaimer.
- final: draft plus `changes_made = ["Deterministic review: " + each requested change applied where the numbers support it]`.
- summary_spoken: template "`{verdict}` Before anything happens, `{goal_plan.note}` If it hits, `{backup_plan.note}`" trimmed to 60 words.

## 7. Endpoint (`api/council.py`)

```python
class CouncilRequest(BaseModel):
    account_id: int
    shock: ShockInputs = ShockInputs(income_fraction=0.55, bills_increase=0, one_off_cost=0, horizon_months=6)
    prefer_fallback: bool = False

@router.post("/api/council/plan", response_model=CouncilResult)
def post_council(req): 404 on unknown id → snapshot → (fallback if no key or prefer_fallback) → run_council → store in context doc under "council_results" (keep last 5) → return
```

## 8. UI panel (`Goals.tsx`, and a compact card on Home)

Three columns under the strategy comparison:

| Consultant | Advocate | Challenger |
|---|---|---|
| headline, goal actions, backup actions | fits badge, conflicts, trade-offs, the one question (with a "Answer in chat" link) | failure cases with evidence chips, requested changes |

Below: "Final plan after review" with `changes_made` and `unresolved`, a `mode` chip (adk / partial / fallback), elapsed time, and a "Read aloud" button that speaks `summary_spoken`. Every NumberRef renders as a chip with its `source` in the tooltip.

## 9. Tests (`test_council.py`)

- fallback council on 47788 with the layoff shock: headline contains "5.6"; advocate conflicts empty when no constraints; challenger lists the 9-month horizon failure; summary ≤ 60 words.
- parity: every `NumberRef.value` in the fallback result occurs in the serialized snapshot or tool log.
- unknown account → 404 before any agent.
- ADK path with a stubbed `Runner` (monkeypatch) returning canned state → `mode="adk"`, schema validation passes.
- timeout path: stub that sleeps → `mode="partial"` within budget.
- context consent: council result never changes `context_version`.
