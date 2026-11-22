from pathlib import Path
from math import prod
from statistics import mean, median, quantiles
import csv, io, zipfile
root = Path(__file__).resolve().parents[1]
output = root / 'assets/finance/escalation'
archive = zipfile.ZipFile(root/'assets/coaching/supporting_data.zip')
def read(name):
    return list(csv.DictReader(io.TextIOWrapper(archive.open('normalized/'+name+'.csv'))))
def positive(value):
    if not value:
        return None
    v = float(value)
    return v if v > 0 else None
years = list(range(2010,2026))
base = 2019
ncaa = read('ncaa_mfrs_finances')
eada = read('eada_finances')
cpi = {int(r['year']): float(r['cpi_u_annual']) for r in read('cpi_annual')}
with (root/'assets/finance/ranked_eada_finances_FY2001_FY2025.csv').open() as scope:
    ranked_eada = list(csv.DictReader(scope))
conferences = {row['school']: row['conference_current'] for row in ranked_eada}
eada_scope = {(row['unitid'], row['fiscal_year']): row['school'] for row in ranked_eada}
if len(eada_scope) != len(ranked_eada):
    raise ValueError('Ranked EADA institution-year keys must be unique')
power = {s for s,c in conferences.items() if c in ('ACC','Big Ten','Big 12','SEC')}
g6 = set(conferences)-power
def indexed(rows):
    return {(r['school'], int(r['fiscal_year'])): r for r in rows if r['school'] in conferences and r['fiscal_year'].isdigit() and int(r['fiscal_year']) in years}
n = indexed(ncaa)
e = {}
for row in eada:
    school = eada_scope.get((row['unitid'], row['fiscal_year']))
    if school is None or not row['fiscal_year'].isdigit():
        continue
    key = school, int(row['fiscal_year'])
    if key in e:
        raise ValueError(f'Duplicate EADA observation for {key}')
    if key[1] in years:
        e[key] = row
public = {s for (s,y),r in n.items() if y==2019 and positive(r['total_expenditure_usd'])}
assert len(public)==62 and len(public & power)==53 and len(public & g6)==9
assert all(positive(n[s,y]['total_expenditure_usd']) for s in public for y in years)
assert all(positive(e[s,y]['total_expenditure_usd']) for s in conferences for y in years)
def build(label, scope, source, dataset, cohort, metric, cutoff=2010, valid=None):
    obs = {}
    for y in years:
        vals = {}
        for s in sorted(cohort):
            row = dataset.get((s,y))
            if row and (valid is None or valid(row)):
                value = positive(row.get(metric))
                if value is not None:
                    vals[s] = value
        obs[y] = vals
    rate = {}
    entries = []
    for y in years:
        if y<cutoff: continue
        now=obs[y]
        prev=obs.get(y-1,{}) if y>cutoff else {}
        growth=[now[s]/prev[s]-1 for s in now.keys() & prev.keys()]
        rate[y]=median(growth) if growth else None
        quartiles=quantiles(growth,n=4,method='inclusive') if len(growth)>=2 else [None]*3
        entries.append(dict(year=y,n=len(now),pairs=len(growth),change=rate[y],
                            q25=quartiles[0],q75=quartiles[2],level=median(now.values())))
    for r in entries:
        y=r['year']; lo=min(y,base); hi=max(y,base)
        index = 100*prod(1+rate[z] for z in range(lo+1,hi+1))**(1 if y>=base else -1)
        r.update(index=index,level_index=100*r['level']/obs_median(obs,base),
                 real_index=index/(cpi[y]/cpi[base]))
    return dict(label=label,scope=scope,source=source,metric=metric,entries=entries)
def obs_median(obs,year):return median(obs[year].values())
p4_public=public & power
football_good=lambda r:r['football_expense_valid_for_comparison'].lower()!='false'
series=[
  build('Total athletics expense','Reporting Power Four','NCAA / Knight-Newhouse',n,p4_public,'total_expenditure_usd'),
  build('Total athletics expense','All ranked public schools','NCAA / Knight-Newhouse',n,public,'total_expenditure_usd'),
  build('Total athletics expense','Ranked public Group of Six','NCAA / Knight-Newhouse',n,public & g6,'total_expenditure_usd'),
  build('Total athletics expense','Same 53 reporting Power Four','EADA',e,p4_public,'total_expenditure_usd'),
  build('Total athletics expense','All 79 dashboard schools','EADA',e,set(conferences),'total_expenditure_usd'),
  build('Football expense','Reporting Power Four','NCAA / Knight-Newhouse',n,p4_public,'football_expenditure_usd',valid=football_good),
  build('Football expense','Power Four incl. Notre Dame','EADA',e,power,'football_expenditure_usd'),
  build('Men’s basketball expense','Power Four incl. Notre Dame','EADA',e,power,'mens_basketball_expenditure_usd'),
  build('Women’s basketball expense','Power Four incl. Notre Dame','EADA',e,power,'womens_basketball_expenditure_usd'),
  build('Coaches compensation','Reporting Power Four','NCAA / Knight-Newhouse',n,p4_public,'coaches_compensation_expenditure_usd'),
  build('Non-coaching staff compensation','Reporting Power Four','NCAA / Knight-Newhouse',n,p4_public,'noncoaching_staff_compensation_expenditure_usd'),
  build('Facilities, debt and equipment','Reporting Power Four','NCAA / Knight-Newhouse',n,p4_public,'facilities_debt_equipment_expenditure_usd',cutoff=2015),
  build('Recruiting expense (all sports)','Power Four incl. Notre Dame','EADA',e,power,'recruiting_expenditure_usd')
]

def mean_shares(source, cohort_name, dataset, cohort, categories, remaining=None):
    totals = {}
    amounts = {}
    for school in sorted(cohort):
        row = dataset[school, 2025]
        total = int(row['total_expenditure_usd'])
        parts = {
            name: int(row[field + '_usd']) for name, field in categories.items()
        }
        if remaining:
            parts[remaining] = total - sum(parts.values())
        assert sum(parts.values()) == total, (source, school)
        assert all(part >= 0 for part in parts.values()), (source, school)
        totals[school] = total
        amounts[school] = parts
    total = sum(totals.values())
    return [
        dict(fiscal_year=2025, source=source, cohort=cohort_name, category=category,
             schools=len(cohort), total_expense_usd=total,
             category_expense_usd=sum(parts[category] for parts in amounts.values()),
             mean_school_share=mean(parts[category]/totals[school] for school, parts in amounts.items()),
             pooled_share=sum(parts[category] for parts in amounts.values())/total)
        for category in [*categories] + ([remaining] if remaining else [])
    ]

ncaa_categories = {
    'Facilities, debt and equipment': 'facilities_debt_equipment_expenditure',
    'Coaches compensation': 'coaches_compensation_expenditure',
    'Non-coaching staff compensation': 'noncoaching_staff_compensation_expenditure',
    'Athlete scholarships and related support': 'athlete_scholarships_related_support_kn',
    'Game expenses and travel': 'game_expenses_and_travel',
    'Other expenses': 'other_expenses',
    'Recruiting': 'recruiting_expenses_all_athletics',
    'Competition guarantees': 'competition_guarantees_expenses',
    'Medical expenses': 'medical_expenses',
    'Coaching severance': 'coaching_severance_expenditure',
    'Institutional NIL revenue share': 'institutional_nil_share_expenditure',
    'Excess transfers back': 'excess_transfers_back',
}
eada_sports = {
    'Football': 'football_expenditure',
    "Men's basketball": 'mens_basketball_expenditure',
    "Women's basketball": 'womens_basketball_expenditure',
    'Unallocated to teams': 'unallocated_expenditure',
}
budget = mean_shares('NCAA / Knight-Newhouse','53 reporting Power Four',n,p4_public,ncaa_categories)
budget += mean_shares('EADA','68 Power Four incl. Notre Dame',e,power,eada_sports,'Other sports (residual)')
for source in {'NCAA / Knight-Newhouse','EADA'}:
    rows = [row for row in budget if row['source'] == source]
    assert abs(sum(row['mean_school_share'] for row in rows)-1) < 1e-12
    assert abs(sum(row['pooled_share'] for row in rows)-1) < 1e-12

def write(name, rows):
    with (output/name).open('w', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)

annual = [
    dict(series=s['label'], cohort=s['scope'], source=s['source'], source_field=s['metric'],
         base_year=base, cpi_u=cpi[r['year']], cpi_index=100*cpi[r['year']]/cpi[base], **r)
    for s in series for r in s['entries']
]
write('annual_series.csv', annual)
write('budget_weights_fy2025.csv', budget)
for r in budget:
    print(r['category'],round(100*r['mean_school_share'],2),round(100*r['pooled_share'],2))
