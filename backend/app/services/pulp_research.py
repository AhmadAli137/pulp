"""Reproducible longitudinal research; one observation per account."""
from functools import lru_cache
import math
import numpy as np
import pandas as pd
from .data_store import get_store
from .financial_profiles import get_population


def interval(events, n):
    p = events / n
    z = 1.96
    center = (p + z*z/(2*n))/(1+z*z/n)
    half = z*math.sqrt(p*(1-p)/n + z*z/(4*n*n))/(1+z*z/n)
    return [100*(center-half), 100*(center+half)]


@lru_cache(maxsize=1)
def findings():
    rows = []
    for account_id, history in get_store().monthly.groupby('account_id', sort=True):
        if len(history) < 24:
            continue
        early, later = history.iloc[:12], history.iloc[12:24]
        mean = early.money_in.mean()
        if mean <= 0:
            continue
        rows.append(dict(account_id=int(account_id), cv=float(early.money_in.std(ddof=1)/mean),
            event=bool((later.days_below_zero > 0).any()), prior=bool((early.days_below_zero > 0).any()),
            inflow=float(early.money_in.median()), spending=float(early.money_out.median()),
            balance=float(early.avg_daily_balance.mean())))
    df = pd.DataFrame(rows)
    df['quartile'] = pd.qcut(df.cv, 4, labels=[1,2,3,4])
    def grouped(frame):
        result = []
        for q, g in frame.groupby('quartile', observed=True):
            n, events = len(g), int(g.event.sum())
            result.append(dict(quartile=int(q), label=['Lowest','Lower middle','Upper middle','Highest'][int(q)-1],
                accounts=n, events=events, rate=100*events/n, interval=interval(events,n),
                median_inflow=float(g.inflow.median()), median_spending=float(g.spending.median()),
                median_balance=float(g.balance.median()), prior_rate=100*float(g.prior.mean())))
        return result
    volatility = grouped(df)
    # Hold quartile boundaries fixed for sensitivity analyses; never regroup on outcomes.
    no_prior = grouped(df[~df.prior])
    strata = {}
    for covariate in ['inflow','spending','balance']:
        buckets = pd.qcut(df[covariate], 4, labels=False, duplicates='drop')
        strata[covariate] = [dict(stratum=int(k)+1, groups=grouped(df[buckets==k])) for k in sorted(buckets.unique())]
    pop = get_population().copy()
    gap = pop.S + .15*pop.H - .55*pop.I
    pop['rw'] = np.where(pop.B<=0,0,np.where(gap<=0,120,np.minimum(pop.B/np.where(gap>0,gap,1),120)))
    pop['decile'] = pd.qcut(pop.I,10,labels=range(1,11))
    def deciles(frame):
        return [dict(decile=int(k), accounts=len(g), median_runway=float(g.rw.median()),
                     median_inflow=float(g.I.median())) for k,g in frame.groupby('decile',observed=True)]
    active = pop[(pop.months>=24) & (pop.I>0) & (pop.S>0)]
    return dict(accounts=len(pop), eligible_accounts=len(df), excluded_accounts=len(pop)-len(df),
        volatility=volatility, relative_rate=volatility[-1]['rate']/volatility[0]['rate'],
        no_prior_negative=no_prior, confounder_strata=strata,
        deciles=deciles(pop), deciles_active_history=deciles(active),
        method='First 12 chronological months: sample standard deviation / mean incoming funds. Quartiles use these values only. Outcome: any negative-balance days in months 13–24. One observation per account.',
        shock='55% of typical inflow retained, household bills +15%, no upfront expense. Official runway capped at 120; no-shortfall accounts coded as 120 for quantiles.',
        limitations=['Association, not causation; incoming funds are not verified wages.',
            'Only 6 events in the lowest-volatility group; uncertainty intervals matter.',
            'Prior negative balances, initial funding, spending, account age and calendar periods may confound the association.',
            'Stratified sensitivity checks are descriptive, not a causal or fully adjusted model.',
            'Historical Czech banking records adapted by the organizers to CAD; no military, veteran or athlete labels.'],
        source='Tangerine-provided PKDD\'99 Financial dataset; all supplied money values are CAD.')
