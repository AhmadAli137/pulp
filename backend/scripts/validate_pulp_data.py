"""Read all supplied files once and reconcile transaction flows to monthly summaries."""
from pathlib import Path
import argparse
import json
import sys
import pandas as pd
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.config import find_data_dir, REPO_ROOT

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, help="Full organizer export including transactions.csv")
    args = parser.parse_args()
    path = args.data_dir.resolve() if args.data_dir else find_data_dir()
    accounts=pd.read_csv(path/'accounts.csv'); monthly=pd.read_csv(path/'monthly_summary.csv');loans=pd.read_csv(path/'loans.csv')
    assert not accounts.account_id.duplicated().any()
    assert not monthly.duplicated(['account_id','month']).any()
    assert not monthly.isna().any().any()
    assert set(monthly.account_id)==set(accounts.account_id)
    assert set(loans.account_id)<=set(accounts.account_id)
    assert not loans.account_id.duplicated().any()
    parts_in=['cash_deposits','transfers_in','pension_in','interest_in']
    parts_out=['household_bills','insurance','loan_payments','bank_fees','cash_withdrawals_genuine','card_withdrawals','transfers_out_other']
    assert np.allclose(monthly[parts_in].sum(axis=1),monthly.money_in,rtol=0,atol=.00001)
    assert np.allclose(monthly[parts_out].sum(axis=1),monthly.money_out,rtol=0,atol=.00001)
    aggregate=[];count=0;ids=set();minimum=None;maximum=None
    for chunk in pd.read_csv(path/'transactions.csv',chunksize=100000,dtype={'partner_bank':str}):
        count+=len(chunk)
        assert chunk.transaction_id.is_unique
        current=set(chunk.transaction_id)
        assert not current & ids
        ids.update(current)
        assert set(chunk.account_id)<=set(accounts.account_id)
        assert (chunk.amount>=0).all()
        assert np.allclose(chunk.signed_amount.abs(),chunk.amount,rtol=0,atol=.00001)
        credit=chunk.direction.eq('credit (money in)')
        assert np.allclose(chunk.signed_amount,np.where(credit,chunk.amount,-chunk.amount),rtol=0,atol=.00001)
        chunk['month']=chunk.date.str[:7]
        cents=(chunk.amount*100).round().astype('int64')
        chunk['incoming']=cents.where(credit,0);chunk['outgoing']=cents.where(~credit,0)
        aggregate.append(chunk.groupby(['account_id','month'])[['incoming','outgoing']].sum())
        low,high=chunk.date.min(),chunk.date.max()
        minimum=min(minimum,low) if minimum else low;maximum=max(maximum,high) if maximum else high
    totals=pd.concat(aggregate).groupby(level=[0,1]).sum()
    summary=monthly.set_index(['account_id','month'])
    aligned=totals.reindex(summary.index,fill_value=0)
    in_error=(aligned.incoming-(summary.money_in*100).round().astype('int64')).abs()
    out_error=(aligned.outgoing-(summary.money_out*100).round().astype('int64')).abs()
    assert in_error.max()==0 and out_error.max()==0,'Transaction totals differ from the supplied summary'
    extra={p.stem:len(pd.read_csv(p)) for p in path.glob('*.csv') if p.stem not in ['accounts','monthly_summary','loans','transactions']}
    result=dict(accounts=len(accounts),monthly_rows=len(monthly),loans=len(loans),transactions=count,other_files=extra,
        first_transaction=minimum,last_transaction=maximum,duplicate_monthly_keys=0,unknown_accounts=0,
        transaction_inflow_max_error_cents=int(in_error.max()),transaction_outflow_max_error_cents=int(out_error.max()),
        currency='CAD as supplied by organizer',status='passed')
    (REPO_ROOT/'docs/data-validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result,indent=2))

if __name__=='__main__':main()
