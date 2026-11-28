import csv,gzip,json,sys
from collections import Counter,defaultdict
from pathlib import Path
from analyze import classify

year=int(sys.argv[1])
suffix=str(year)[2:] if year!=2027 else ''
kinds=['shooting','other personal non-shooting','offensive','loose-ball','flagrant','technical','unknown']
crosswalk={r['contest_id']:r['gid'] for r in csv.DictReader(open(f'expanded/crosswalk_{year}.csv'))}
games={r['gid']:r for r in csv.DictReader(open(f'expanded/audited_{year}.csv'))}
if year==2027:
    games={gid:r for gid,r in games.items() if r['date']>'2026-11-17'}
allowed={c:gid for c,gid in crosswalk.items() if gid in games}
poss=Counter(); names={}; seen=set()
with gzip.open('data/poss'+suffix,'rt') as f:
    for r in csv.DictReader(f):
        contest=r['contest_id']
        gid=allowed.get(contest)
        if not gid or r['poss_team_espn_team_id'] not in (games[gid]['h'],games[gid]['a']):continue
        key=(contest,r['period'],r['poss_num'])
        if key in seen:continue
        seen.add(key)
        for side in ('home','away'):
            team=r[side+'_espn_team_id']
            if team not in (games[gid]['h'],games[gid]['a']):continue
            lineup={}
            for n in range(1,6):
                player=r[f'{side}_{n}_player_id']
                name=r[f'{side}_{n}_clean_name']
                if player and name and name.lower()!='team':lineup[player]=name
            for player,name in lineup.items():
                poss[gid,team,player]+=1
                names[team,player]=name

types=defaultdict(lambda:[[0]*7,[0]*7])
events=defaultdict(list)
seen.clear()
with gzip.open('data/'+('ncaa_csv' if year==2027 else 'ncaa'+suffix),'rt') as f:
    for r in csv.DictReader(f):
        event=r['event_type']
        if event not in ('Commits Foul','Draw Foul'):continue
        gid=allowed.get(r['contest_id'])
        if not gid:continue
        game=games[gid]
        team=r['event_team_espn_team_id']
        if team not in (game['h'],game['a']):
            if r['event_team']==r['home']:team=r['home_espn_team_id']
            elif r['event_team']==r['away']:team=r['away_espn_team_id']
        if team not in (game['h'],game['a']):continue
        key=(gid,r['period'],r['clock'],event,r['event_description'],team,r['home_score'],r['away_score'])
        if key in seen:continue
        seen.add(key)
        player=r['player_1_id']
        events[gid,r['period'],r['clock']].append((event,team,player,kinds.index(classify(r))))
for (gid,_,_),rows in events.items():
    committed=[(team,kind) for event,team,_,kind in rows if event=='Commits Foul']
    for event,team,player,kind in rows:
        key=(gid,team,player)
        if key not in poss:continue
        if event=='Commits Foul':types[key][0][kind]+=1
        else:
            opposite=[k for t,k in committed if t!=team]
            # Only a unique opponent commitment supplies a drawn-foul type.
            types[key][1][opposite[0] if len(opposite)==1 else 6]+=1
data=[]
for (gid,team,player),n in sorted(poss.items()):
    ct,dt=types[gid,team,player]
    data.append(dict(id=player,g=gid,t=team,p=n/2,c=sum(ct),d=sum(dt),name=names[team,player],ct=ct,dt=dt))
path=Path(f'expanded/players-{year}.json.gz')
with gzip.GzipFile(path,'wb',mtime=0) as f:
    f.write(json.dumps(data,separators=(',',':'),ensure_ascii=False).encode())
print(year,len(data),'player games',len({r['id'] for r in data}),'players',len({r['g'] for r in data}),'games',path.stat().st_size,flush=True)
