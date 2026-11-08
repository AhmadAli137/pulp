"""REST API for PULP."""
from __future__ import annotations

import math
from typing import Any

import json

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from .. import schemas
from ..services import context_manager as cm
from ..services.cohort_analysis import cohort_for, research_summary
from ..services.council import council_available, run_council, run_council_stream
from ..services.explainer import build_scenes, narrate
from ..services.director import PERSONAS, SHOCK_DECK, stage_stream
from ..services.archetypes import flag_catalog, get_archetypes
from ..services.hunter import get_findings
from ..services.narrator import narrative_for
from ..services.features import FEATURE_DOCS, flag_matrix, get_features
from ..services.resilience_history import default_validation
from ..services.data_store import get_store
from ..services.feedback_loop import replan, replanning_diff
from ..services.financial_profiles import get_metrics, get_population, percentile_of
from ..services.gemini_agent import chat, next_question, provider_info
from ..services.roadmap import build_roadmap
from ..services.scenario_engine import ScenarioSpec, StrategyAdjust, branches, resolve_preset, simulate_both
from ..services.strategy_optimizer import compare_strategies
from ..services.tangerine_metrics import full_shock_report
from ..config import GEMINI_API_KEY, GEMINI_MODEL

router = APIRouter(prefix="/api")


def _clean(o: Any) -> Any:
    """Replace NaN/inf with None so JSON is valid."""
    if isinstance(o, float):
        return None if (math.isnan(o) or math.isinf(o)) else o
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    return o


def _metrics_or_404(account_id: int):
    store = get_store()
    if not store.has_account(account_id):
        raise HTTPException(status_code=404, detail=f"Account {account_id} is not in the dataset.",
                            headers={"X-Hint": "Try one of the sample accounts from /api/accounts/sample or any id in accounts.csv."})
    return get_metrics(account_id, store)


@router.get("/health")
def health():
    store = get_store()
    return {"ok": True, "accounts": len(store.account_ids), "data_dir": str(store.data_dir),
            "gemini_configured": bool(GEMINI_API_KEY), "gemini_model": GEMINI_MODEL if GEMINI_API_KEY else None, "context_storage": cm.storage_backend(),
            "council": council_available(), **provider_info()}


@router.get("/accounts/sample")
def sample_accounts(n: int = Query(8, ge=1, le=50)):
    store = get_store()
    pop = get_population()
    ids = store.sample_ids(n)
    # add a few hand-picked illustrative types from the data (not identities): a surplus account, a deficit account, a loan holder
    extra = []
    elig = pop[pop.I > 0]
    extra.append(int(elig.surplus.idxmax()))
    extra.append(int(elig.spending_ratio.idxmax()))
    loans = elig[elig.P > 0]
    if not loans.empty:
        extra.append(int(loans.index[0]))
    rows = []
    for a in list(dict.fromkeys(ids + extra)):
        r = pop.loc[a]
        rows.append({"account_id": int(a), "I": float(r.I), "S": float(r.S), "B": float(r.B), "months": int(r.months),
                     "has_active_loan": bool(r.P > 0), "tag": ("largest surplus" if a == extra[0] else "highest spending ratio" if a == extra[1] else "active loan" if len(extra) > 2 and a == extra[2] else "random")})
    return {"accounts": rows, "total_accounts": len(store.account_ids), "id_range": [store.account_ids[0], store.account_ids[-1]]}


@router.get("/customers/{account_id}")
def get_customer(account_id: int):
    m = _metrics_or_404(account_id)
    store = get_store()
    pop = get_population()
    acct = store.account_row(account_id)
    district = store.district_row(int(acct.district_id)) if acct is not None else None
    so = store.standing_orders_for(account_id)
    d = m.to_dict()
    history = d.pop("history")
    d["history_months"] = len(history)
    d["account"] = {
        "district_id": int(acct.district_id) if acct is not None else None,
        "district_name": str(district.district_name) if district is not None else None,
        "region": str(district.region) if district is not None else None,
        "statement_frequency": str(acct.frequency) if acct is not None else None,
        "account_opened": str(acct.account_opened) if acct is not None else None,
    }
    d["standing_orders"] = [{"amount": float(r.amount), "purpose": (str(r.purpose) if isinstance(r.purpose, str) else "other")} for r in so.itertuples(index=False)] if not so.empty else []
    d["population_percentiles"] = {
        "typical_inflow": percentile_of(pop, "I", m.typical_inflow),
        "typical_spending": percentile_of(pop, "S", m.typical_spending),
        "buffer": percentile_of(pop, "B", m.buffer),
        "spending_ratio": percentile_of(pop[pop.I > 0], "spending_ratio", m.spending_ratio) if m.typical_inflow > 0 else None,
    }
    d["show_the_math"] = {
        "I": {"label": "Typical inflow (median money_in)", "value": m.typical_inflow, "n_months": m.months_available},
        "S": {"label": "Typical spending (median money_out)", "value": m.typical_spending},
        "F": {"label": "Typical fixed costs (median of household_bills + insurance + loan_payments per month)", "value": m.typical_fixed_costs},
        "H": {"label": "Household bills (median household_bills)", "value": m.household_bills},
        "B": {"label": f"Buffer (mean avg_daily_balance over last {m.buffer_months_used} months)", "value": m.buffer, "rows": m.buffer_rows},
        "P": {"label": "Active loan payment (loans.csv monthly_payment if running at end of 2025)", "value": m.active_loan_payment},
        "baseline_gap": {"label": "Baseline monthly gap S - I", "value": m.baseline_gap},
        "baseline_runway": {"label": "Baseline runway", "value": m.baseline_runway_label},
    }
    d["sources"] = {"monthly_summary.csv": "I, S, F, H, B, history", "loans.csv": "P", "accounts.csv / districts.csv": "district, statement frequency", "standing_orders.csv": "recurring obligations snapshot"}
    d["data_note"] = "Observed records are anonymized bank data (PKDD'99 via Tangerine). Nothing here identifies the account holder."
    return _clean(d)


@router.get("/customers/{account_id}/history")
def get_history(account_id: int):
    m = _metrics_or_404(account_id)
    return _clean({"account_id": account_id, "months": m.months_available, "first_month": m.first_month, "last_month": m.last_month,
                   "history": m.history, "inflow_mix": m.inflow_mix, "outflow_mix": m.outflow_mix,
                   "observed": {"negative_balance_days": m.observed_negative_balance_days, "months_with_negative_days": m.observed_months_below_zero,
                                "min_balance": m.observed_min_balance}})


@router.get("/customers/{account_id}/cohort")
def get_cohort(account_id: int):
    _metrics_or_404(account_id)
    return _clean(cohort_for(account_id))


@router.get("/customers/{account_id}/insights")
def get_insights(account_id: int, use_ai: bool = Query(True)):
    """Stage 1 profile: rule-based flags with evidence, behavioural archetype, and the narrator's sentences
    (Gemini on ADK when configured, templated otherwise). Every number comes from the feature table."""
    _metrics_or_404(account_id)
    return _clean(narrative_for(account_id, use_ai=use_ai))


@router.get("/research/archetypes")
def get_research_archetypes():
    """Behavioural archetypes over all accounts: cluster statistics (code) and names (Gemini or rules)."""
    doc = get_archetypes()
    return _clean({k: v for k, v in doc.items() if k != "labels"} | {"flag_catalog": flag_catalog()})


@router.get("/research/hunter")
def get_research_hunter():
    """Pattern Hunter findings (the ADK hypothesis loop, run offline) or the deterministic battery."""
    return _clean(get_findings())


@router.get("/research/validation")
def get_research_validation():
    """Ground truth: our flags and the simulated layoff against the loans that actually went bad."""
    f = get_features()
    return _clean(default_validation(f, get_store().loans, flag_matrix(f)))


@router.get("/research/features")
def get_research_features(feature: str = Query(..., description="feature name from FEATURE_DOCS"), bins: int = Query(4, ge=2, le=10)):
    """Six-month layoff survival by quantile bin of one feature, for the bank-side view."""
    f = get_features()
    if feature not in f.columns or feature not in FEATURE_DOCS:
        raise HTTPException(status_code=404, detail=f"Unknown feature {feature}")
    import numpy as np
    import pandas as pd
    s = pd.to_numeric(f[feature], errors="coerce").replace([np.inf, -np.inf], np.nan).dropna()
    try:
        q = pd.qcut(s, bins, duplicates="drop")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    rows = [{"range": f"{iv.left:.3g} to {iv.right:.3g}", "n": int(len(idx)), "survive6_layoff_pct": float(f.loc[idx, "survives6_layoff"].mean() * 100),
             "survive6_combined_pct": float(f.loc[idx, "survives6_combined"].mean() * 100)} for iv, idx in s.groupby(q, observed=True).groups.items()]
    return {"feature": feature, "meaning": FEATURE_DOCS[feature], "bins": rows}


@router.get("/research/summary")
def get_research():
    return _clean(research_summary())


@router.post("/shocks/calculate")
def post_shock(req: schemas.ShockRequest):
    m = _metrics_or_404(req.account_id)
    r, h, C, T = req.income_fraction, req.bills_increase, req.one_off_cost, req.horizon_months
    if req.preset == "layoff":
        r, h, C, T = 0.55, 0.0, 0.0, 6
    elif req.preset == "furnace":
        r, h, C, T = 1.0, 0.0, m.typical_spending, 6
    elif req.preset == "combined":
        r, h, C, T = 0.55, 0.15, 0.0, 6
    elif req.preset == "baseline":
        r, h, C, T = 1.0, 0.0, 0.0, 6
    if req.one_off_in_months_of_spending is not None and req.preset is None:
        C = req.one_off_in_months_of_spending * m.typical_spending
    rep = full_shock_report(m, r=r, h=h, one_off=C, horizon_months=T)
    rep["applied_inputs"] = {"income_fraction": r, "bills_increase": h, "one_off_cost": C, "horizon_months": T, "preset": req.preset}
    rep["ei_note"] = ("EI regular benefits typically replace 55% of insurable earnings for 14 to 45 weeks. If the replacement period ends before the horizon, "
                      "a new assumption is needed beyond that point; this calculation holds the specified cash flows constant through the horizon.")
    return _clean(rep)


@router.post("/scenarios/simulate")
def post_simulate(req: schemas.SimulateRequest):
    m = _metrics_or_404(req.account_id)
    strat = StrategyAdjust(**req.strategy.model_dump()) if req.strategy else StrategyAdjust()
    sc = req.scenario
    if sc.preset:
        spec = resolve_preset(sc.preset, m, horizon_months=sc.horizon_months, n_paths=sc.n_paths, seed=sc.seed,
                              shock_start=sc.shock_start, strategy=strat)
    else:
        spec = ScenarioSpec(**{k: v for k, v in sc.model_dump().items() if k != "preset"}, strategy=strat)
    return _clean(simulate_both(m, spec))


@router.get("/scenarios/branches/{account_id}")
def get_branches(account_id: int, horizon: int = Query(24, ge=6, le=120), n_paths: int = Query(400, ge=50, le=2000)):
    m = _metrics_or_404(account_id)
    return _clean({"account_id": account_id, "horizon_months": horizon, "branches": branches(m, horizon=horizon, n_paths=n_paths)})


@router.post("/strategies/compare")
def post_compare(req: schemas.CompareRequest):
    m = _metrics_or_404(req.account_id)
    try:
        return _clean(compare_strategies(m, cm.load_context(req.account_id), horizon=req.horizon_months, n_paths=req.n_paths))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/roadmap/{account_id}")
def get_roadmap(account_id: int):
    m = _metrics_or_404(account_id)
    try:
        return _clean(build_roadmap(m, cm.load_context(account_id)))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/context/{account_id}")
def get_context(account_id: int):
    _metrics_or_404(account_id)
    ctx = cm.load_context(account_id)
    return {"context": ctx, "summary": cm.summarize(ctx), "next_question": next_question(cm.summarize(ctx), cm.summarize(ctx)["pending_proposals"])}


@router.delete("/context/{account_id}")
def delete_context(account_id: int):
    _metrics_or_404(account_id)
    ctx = cm.reset_context(account_id)
    return {"context": ctx, "summary": cm.summarize(ctx)}


@router.post("/context/propose")
def post_propose(req: schemas.ProposeRequest):
    _metrics_or_404(req.account_id)
    prop = cm.propose(req.account_id, [c.model_dump() for c in req.changes], source=req.source, rationale=req.rationale)
    return {"proposal": prop, "summary": cm.summarize(cm.load_context(req.account_id))}


@router.post("/context/confirm")
def post_confirm(req: schemas.ConfirmRequest):
    _metrics_or_404(req.account_id)
    try:
        res = cm.confirm(req.account_id, req.proposal_id, accept=req.accept)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Proposal {req.proposal_id} not found for account {req.account_id}.")
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    out = {"proposal": res["proposal"], "applied": res["applied"], "summary": cm.summarize(res["context"]), "replan": None}
    if req.accept and req.replan and res['applied']:
        out["replan"] = _clean(replan(req.account_id, reason=f"confirmed proposal {req.proposal_id}"))
    return out


@router.post("/context/edit")
def post_edit(req: schemas.EditRequest):
    _metrics_or_404(req.account_id)
    res = cm.direct_edit(req.account_id, req.change.model_dump())
    out = {"applied": res["applied"], "summary": cm.summarize(res["context"]), "replan": None}
    if req.replan:
        out["replan"] = _clean(replan(req.account_id, reason="direct context edit"))
    return out


@router.post("/agent/chat")
def post_chat(req: schemas.ChatRequest):
    _metrics_or_404(req.account_id)
    return _clean(chat(req.account_id, req.message, prefer_offline=req.prefer_offline))


@router.get("/agent/session/{account_id}")
def get_planning_session(account_id: int):
    _metrics_or_404(account_id)
    from ..services.planning_session import current
    return _clean(current(account_id))


@router.post("/agent/plan")
def post_plan(req: schemas.PlanRequest):
    """Stage 3 council: deterministic fan-out, then Strategist, code validation and Challenger (Google ADK, Gemini) in sequence,
    then deterministic validation and ranking. Works without AI (mode = offline)."""
    m = _metrics_or_404(req.account_id)
    one_off = req.one_off_cost
    if req.one_off_in_months_of_spending is not None:
        one_off = req.one_off_in_months_of_spending * m.typical_spending
    from ..services.planning_session import publish
    plan = run_council(req.account_id, m, r=req.income_fraction, h=req.bills_increase, one_off=one_off,
                       duration=req.shock_duration, horizon=req.horizon_months, n_paths=req.n_paths, use_ai=req.use_ai)
    return _clean(publish(req.account_id, plan))


@router.post("/agent/explain")
def post_explain(req: schemas.PlanRequest):
    """Council plus the Explainer: the ranked plan and a scene script (habit, runway, two futures, lever)."""
    m = _metrics_or_404(req.account_id)
    one_off = req.one_off_cost if req.one_off_in_months_of_spending is None else req.one_off_in_months_of_spending * m.typical_spending
    insights = narrative_for(req.account_id, use_ai=req.use_ai)
    plan = run_council(req.account_id, m, r=req.income_fraction, h=req.bills_increase, one_off=one_off,
                       duration=req.shock_duration, horizon=req.horizon_months, n_paths=req.n_paths, use_ai=req.use_ai)
    scenes, source = narrate(build_scenes(insights, plan), use_ai=req.use_ai)
    return _clean({"account_id": req.account_id, "insight": insights, "plan": plan, "scenes": scenes, "scenes_source": source})


@router.get("/agent/run")
async def get_agent_run(account_id: int, income_fraction: float = Query(0.55, ge=0.0, le=5.0), bills_increase: float = Query(0.0, ge=-1.0, le=10.0),
                        one_off_cost: float = Query(0.0, ge=0.0), shock_duration: int = Query(6, ge=1, le=60), horizon_months: int = Query(24, ge=6, le=120),
                        n_paths: int = Query(200, ge=50, le=2000), use_ai: bool = Query(True)):
    """Server-sent events: the whole agentic run as it happens. Events: insight, stage, agent, plan, scenes, done, error."""
    m = _metrics_or_404(account_id)

    def sse(event: str, data) -> str:
        return "event: " + event + "\ndata: " + json.dumps(_clean(data), default=float) + "\n\n"

    async def gen():
        import time
        t0 = time.perf_counter()
        try:
            yield sse("stage", {"name": "insight", "status": "start", "detail": "Reading the Stage 1 profile: flags, archetype, narrator", "seconds": 0.0})
            insights = await run_in_threadpool(narrative_for, account_id, use_ai)
            yield sse("insight", insights)
            yield sse("stage", {"name": "insight", "status": "done", "detail": insights["narrative"]["headline"], "seconds": round(time.perf_counter() - t0, 2)})
            plan = None
            async for etype, data in run_council_stream(account_id, m, r=income_fraction, h=bills_increase, one_off=one_off_cost, duration=shock_duration,
                                                        horizon=horizon_months, n_paths=n_paths, use_ai=use_ai):
                if etype == "plan":
                    plan = data
                yield sse(etype, data)
            yield sse("stage", {"name": "explain", "status": "start", "detail": "Explainer writes the scene script from the plan", "seconds": round(time.perf_counter() - t0, 2)})
            scenes = build_scenes(insights, plan)
            scenes, source = await run_in_threadpool(narrate, scenes, use_ai)
            yield sse("scenes", {"source": source, "scenes": scenes})
            yield sse("stage", {"name": "explain", "status": "done", "detail": f"{len(scenes)} scenes ready", "seconds": round(time.perf_counter() - t0, 2)})
            yield sse("done", {"seconds": round(time.perf_counter() - t0, 2)})
        except Exception as exc:  # noqa: BLE001
            yield sse("error", {"message": f"{type(exc).__name__}: {exc}"[:400]})

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})


@router.get("/agent/deck")
def get_deck():
    """The twist deck: realistic Canadian shocks the stage can deal."""
    return {"cards": [{k: c[k] for k in ("key", "title", "text", "r", "h", "duration")} | {"one_off": c.get("one_off", 0.0), "one_off_months": c.get("one_off_months")} for c in SHOCK_DECK]}


@router.get("/agent/personas")
def get_personas():
    """Who the agents are: role, what they read and write, and the guardrail on each, for the backstage view."""
    return {"personas": PERSONAS}


@router.get("/agent/stage")
async def get_agent_stage(account_id: int, message: str = Query("__intro__", max_length=2000), use_ai: bool = Query(True)):
    """Server-sent events for one stage turn: agent events while the Director works, memory, then a storyboard of beats."""
    _metrics_or_404(account_id)

    def sse(event: str, data) -> str:
        return "event: " + event + "\ndata: " + json.dumps(_clean(data), default=float) + "\n\n"

    async def gen():
        import time
        t0 = time.perf_counter()
        try:
            async for etype, data in stage_stream(account_id, message, use_ai=use_ai):
                yield sse(etype, data)
            yield sse("done", {"seconds": round(time.perf_counter() - t0, 2)})
        except Exception as exc:  # noqa: BLE001
            yield sse("error", {"message": f"{type(exc).__name__}: {exc}"[:400]})

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})


@router.post("/replan")
def post_replan(req: schemas.ReplanRequest):
    _metrics_or_404(req.account_id)
    return _clean(replan(req.account_id, reason=req.reason))


@router.get("/replan/{account_id}/diff")
def get_replan_diff(account_id: int):
    _metrics_or_404(account_id)
    return _clean(replanning_diff(account_id))
