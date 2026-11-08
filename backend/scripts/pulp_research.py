"""Rebuild PULP's research artifact and export two publication-ready charts."""
from pathlib import Path
import json
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from app.services.pulp_research import findings

def main():
    out=Path(__file__).resolve().parents[2]/'docs'
    out.mkdir(exist_ok=True)
    d=findings()
    (out/'pulp-findings.json').write_text(json.dumps(d,indent=2),encoding='utf-8')
    plt.rcParams.update({'font.family':'DejaVu Sans','axes.spines.top':False,'axes.spines.right':False})
    fig,ax=plt.subplots(figsize=(9,5.4),layout='constrained')
    groups=d['volatility'];rates=[g['rate'] for g in groups]
    ax.bar([g['label'] for g in groups],rates,color='#F97316',width=.55,yerr=[[g['rate']-g['interval'][0] for g in groups],[g['interval'][1]-g['rate'] for g in groups]],capsize=5)
    for i,g in enumerate(groups):ax.text(i,g['interval'][1]+.4,f"{g['events']}/{g['accounts']} ({g['rate']:.2f}%)",ha='center',fontsize=10)
    ax.set(ylim=(0,16),ylabel='Accounts with subsequent negative-balance days (%)',xlabel='Incoming-funds volatility in first 12 months',title='PULP | Variable inflows and next-year negative balances')
    fig.supxlabel('3,660 accounts · Months 13–24 outcome · 95% Wilson intervals · Association, not causation',fontsize=9)
    fig.savefig(out/'volatility-finding.png',dpi=180);plt.close(fig)
    fig,ax=plt.subplots(figsize=(9,5.4),layout='constrained')
    deciles=d['deciles'];ax.bar([g['decile'] for g in deciles],[g['median_runway'] for g in deciles],color='#183F2D',width=.65)
    ax.set(xlabel='Typical incoming-funds decile (lowest to highest)',ylabel='Median official runway (months)',title='PULP | Higher inflows do not guarantee a longer runway',xticks=range(1,11))
    fig.supxlabel('4,500 accounts · 55% retained inflow + 15% higher household bills · Simulated outcomes',fontsize=9)
    fig.savefig(out/'inflow-runway-finding.png',dpi=180);plt.close(fig)
    print('Verified and exported:',len(groups),'volatility groups and',len(deciles),'inflow deciles')

if __name__=='__main__':main()
