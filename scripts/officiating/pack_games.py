import csv
import statistics
from datetime import datetime
from zoneinfo import ZoneInfo

kinds=['shooting','other_personal','offensive','looseball','flagrant','technical','unknown']

def audited(work, year):
    out=[]
    for r in csv.DictReader((work / f"expanded/audited_{year}.csv").open()):
        out.append(dict(id=r['gid'],date=r['date'],h=r['h'],a=r['a'],hn=r['hn'],an=r['an'],
            hc=r['hconf'],ac=r['aconf'],n=r['neutral']=='True',stage=r['stage'],p=round(float(r['pace']),4),
            hf=int(r['hf']),af=int(r['af']),ht=[int(float(r.get('h_'+k) or 0)) for k in kinds],
            at=[int(float(r.get('a_'+k) or 0)) for k in kinds],clean=r['exact_after']=='True' or r['exact_withtech']=='True',
            refs=r['crew'].split('|') if r['crew'] else []))
    return out

def boxscore_summary(event,doc,team_confs,team_names):
    g=event['competitions'][0]
    sides={c['homeAway'][0]:c['team']['id'] for c in g['competitors']}
    box={r['team']['id']:{s['name']:s['displayValue'] for s in r['statistics']} for r in doc.get('boxscore',{}).get('teams',[])}
    def stats(team):
        row=box[team]
        fga=int(row['fieldGoalsMade-fieldGoalsAttempted'].split('-')[-1])
        fta=int(row['freeThrowsMade-freeThrowsAttempted'].split('-')[-1])
        return int(row['fouls']),fga-int(row['offensiveRebounds'])+int(row['totalTurnovers'])+.475*fta
    hf,hp=stats(sides['h'])
    af,ap=stats(sides['a'])
    refs=sorted({' '.join(r['fullName'].split()) for r in doc.get('gameInfo',{}).get('officials',[]) if r.get('fullName')})
    stage='conference regular season' if g.get('conferenceCompetition') else ('nonconference regular season with event label' if g.get('notes') else 'nonconference regular season')
    date=datetime.fromisoformat(event['date']).astimezone(ZoneInfo('America/New_York')).date().isoformat()
    h,a=sides['h'],sides['a']
    return dict(id=event['id'],date=date,h=h,a=a,hn=team_names[h],an=team_names[a],hc=team_confs[h],ac=team_confs[a],
        n=bool(g.get('neutralSite')),stage=stage,p=round(statistics.mean([hp,ap]),4),hf=hf,af=af,ht=[0]*7,at=[0]*7,clean=False,refs=refs)
