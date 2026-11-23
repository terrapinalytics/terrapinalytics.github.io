"""Score program_inputs.csv within the published 137-job field; print the ranking CSV."""
import csv
import sys
from bisect import bisect_left, bisect_right
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[1]
WEIGHTS = {'resources': .30, 'recruiting': .20, 'conference': .20, 'fans': .15, 'ceiling': .15}
# Editorial assessments of the 2026 football platform, including independent Notre Dame.
TIER_MINIMUMS = (85, 75, 65, 50, 35)

PLATFORM = {'SEC':100,'Big Ten':100,'Independent':95,'ACC':78,'Big 12':78,'American':44,
            'Pac-12':44,'Mountain West':33,'Sun Belt':33,'MAC':26,'C-USA':26}

def blend(*terms):
    observed = [(w, v) for w, v in terms if v is not None]
    return sum(w*v for w,v in observed)/sum(w for w,v in observed) if observed else None

def score(rows):
    def percentile(key, reverse=False, anchor=None):
        pairs = [(float(r[key]), r['school']) for r in rows if r.get(key) not in ('',None)]
        values = sorted(v for v,_ in pairs)
        # Put sparse disclosures on the same scale as the reporting schools' anchor.
        scale = sorted(anchor[s] for _,s in pairs if anchor.get(s) is not None) if anchor else []
        result = {}
        for v,s in pairs:
            q = (bisect_left(values,v)+bisect_right(values,v)-1)/(2*(len(values)-1)) if len(values)>1 else .5
            if reverse:q = 1-q
            if scale:
                pos=q*(len(scale)-1); i=int(pos)
                result[s]=scale[i]+(pos-i)*(scale[min(i+1,len(scale)-1)]-scale[i])
            else:result[s]=100*q
        return result
    def combine(*terms):
        return {r['school']:blend(*[(w, col.get(r['school'])) for w,col in terms]) for r in rows}
    def cols(keys,anchor=None):
        return combine(*[(1,percentile(k,anchor=anchor)) for k in keys])
    budget=combine((1,percentile('ncaa_football_expenses_mean_FY2022_2024_usd')),(1,percentile('eada_football_expenses_mean_FY2022_2024_2025usd')))
    staff=cols(['head_coach_total_pay_2025_usd','assistant_pool_2024_usd','ncaa_football_coaching_payroll_mean_FY2022_2024_usd'],budget)
    roster=cols(['football_roster_athletic_secondary_2026_estimate','football_roster_cbs247_2026_estimate','football_roster_si_2026_estimate','football_direct_revenue_share_FY2026_usd'],budget)
    dept=cols(['eada_2025_total','ncaa_2025_total_expenditure_usd'])
    donors=percentile('ncaa_2025_donor_contributions_revenue_usd',anchor=budget)
    resources=combine((50,budget),(18,staff),(12,roster),(12,dept),(8,donors))
    classes=percentile('recruiting_rank_mean_2021_2025',True)
    talent=percentile('roster_talent_rank_2026',True,classes)
    recruiting=combine((38,percentile('local_top1000_per_class')),(32,classes),(20,talent),(10,percentile('transfer_rating',anchor=classes)))
    crowds=cols(['attendance_average_mean_2022_2024_phase4','attendance_average_2025'])
    fans=combine((37,crowds),(16,percentile('historical_crowd')),(12,percentile('current_venue_capacity_2026_metadata')),(10,percentile('ncaa_2025_ticket_sales_revenue_usd',anchor=crowds)),(25,percentile('all_time_win_pct')))
    longrun=combine((1,percentile('sp_rating_mean_2016_2025')),(1,percentile('fpi_rank_mean_2016_2025',True)))
    current=percentile('sagarin_week12')
    strength={}
    for r in rows:
        s=r['school']
        history=.75*min(10,int(r['rated_seasons']))/10
        strength[s]=blend((history,longrun[s]),(1-history,current[s]))
    results=[]
    for r in rows:
        s=r['school']; c=r['conference_master']
        league=sorted(strength[other['school']] for other in rows if other['conference_master']==c)
        title_path=(100*(bisect_left(league,strength[s])+bisect_right(league,strength[s])-1)/(2*(len(league)-1))
                    if len(league)>1 else strength[s])
        ceiling=.72*strength[s]+.28*title_path
        components=dict(resources=resources[s],recruiting=recruiting[s],conference=PLATFORM[c],fans=fans[s],ceiling=ceiling)
        total=sum(WEIGHTS[k]*v for k,v in components.items())
        results.append(dict(school=s,conference=c,score=round(total,4),**{k+'_score':round(v,4) for k,v in components.items()},previous_rank=r.get('previous_rank','')))
    results.sort(key=lambda r:(-r['score'],r['school']))
    for i,r in enumerate(results,1):
        r.update(rank=i,tier=1+sum(r['score']<t for t in TIER_MINIMUMS))
    for i,r in enumerate(sorted(results,key=lambda r: (-(r['score']-.20*r['conference_score']),r['school'])),1):
        r['rank_without_conference']=i
    return results

if __name__ == '__main__':
    with (ROOT/'assets/coaching/program_inputs.csv').open() as f:
        result=score(list(csv.DictReader(f)))
    writer=csv.DictWriter(sys.stdout,fieldnames=['rank','school','conference','tier','score',*[k+'_score' for k in WEIGHTS],'previous_rank','rank_without_conference'],lineterminator='\n')
    writer.writeheader()
    writer.writerows(result)
