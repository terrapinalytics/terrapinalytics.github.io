import sys
from pathlib import Path
import re
import numpy as np
import pandas as pd
from analyze import DATA, load_games, read

DEST=Path('expanded')
KINDS=['shooting','other_personal','offensive','looseball','flagrant','technical','unknown']
PEERS={'zach edey','hunter dickinson','oscar tshiebwe','armando bacot','trayce jackson davis','adama sanogo','drew timme','ryan kalkbrenner','donovan clingan','graham ike','kofi cockburn','johni broome','kyle filipowski','oso ighodaro','n faly dante','kel el ware'}
def norm(name):
    return re.sub(r'[^a-z0-9]+',' ',name.lower()).strip()
def suffix(year):
    return '' if year==2027 else str(year)[2:]
def save(df,name,year):
    df.to_csv(DEST/f'{name}_{year}.csv',index=False)

def load(year):
    s=suffix(year)
    games,crews=load_games(s)
    schedule={r['id']:r for r in read('sched'+s)}
    conference_names={r['groups_id']:r['groups_name'] for r in schedule.values() if r['groups_is_conference'].lower()=='true'}
    box={(r['game_id'],r['team_id']):r for r in read('box'+s) if r['game_id'] in games}
    featured=[]
    for gid,g in games.items():
        date,h,a,hc,ac,neutral,stage,pf,pace,hn,an,_=g
        sched=schedule[gid]
        row=dict(gid=gid,year=year,date=date,h=h,a=a,hc=hc,ac=ac,hconf=conference_names.get(hc,hc),aconf=conference_names.get(ac,ac),neutral=neutral=='true',stage=stage,
                 hf=pf[0],af=pf[1],pace=pace,hn=hn,an=an,venue_id=sched['venue_id'],venue=sched['venue_full_name'],
                 attendance=sched['attendance'],crew='|'.join(sorted(crews[gid])),n_refs=len(crews[gid]),periods=sched['status_period'])
        for side,tid in [('h',h),('a',a)]:
            r=box[gid,tid]
            for k in ['field_goals_attempted','three_point_field_goals_attempted','offensive_rebounds','total_turnovers','free_throws_attempted','steals','blocks','points_in_paint','fast_break_points','team_score','technical_fouls','flagrant_fouls']:
                row[side+'_'+k]=pd.to_numeric(r.get(k),errors='coerce')
        featured.append(row)
    frame=pd.DataFrame(featured)
    save(frame,'games',year)
    return frame

def audit(year,frame):
    s=suffix(year)
    cols=['game_date','home_espn_team_id','away_espn_team_id','espn_game_id','contest_id','period','clock','home_score','away_score','event_type','event_description','event_team_espn_team_id','event_team','home','away','player_1_id','player_1_clean_name','foul_class','is_shooting_foul','is_looseball_foul','is_flagrant','is_one_and_one','ft_awarded','poss_team_espn_team_id','event_result']
    data=pd.read_csv(DATA/('ncaa'+s if s else 'ncaa_csv'),compression='gzip',usecols=cols,dtype=str,keep_default_na=False)
    if data.espn_game_id.eq("").any():
        missing=data.espn_game_id.eq('')
        keys=['contest_id','game_date','home_espn_team_id','away_espn_team_id']
        meta=data.loc[missing,keys+['home_score','away_score']].copy()
        for c in ('home_score','away_score'):
            meta[c]=pd.to_numeric(meta[c],errors='coerce')
        meta=meta.groupby(keys,as_index=False).agg({'home_score':'max','away_score':'max'})
        meta['date']=pd.to_datetime(meta.game_date,format='%m/%d/%Y',errors='coerce').dt.strftime('%Y-%m-%d')
        games=frame[['gid','date','h','a','h_team_score','a_team_score']]
        swapped=games.rename(columns={'h':'a','a':'h','h_team_score':'a_team_score','a_team_score':'h_team_score'})
        x=meta.merge(pd.concat([games,swapped]),left_on=['date','home_espn_team_id','away_espn_team_id','home_score','away_score'],
                     right_on=['date','h','a','h_team_score','a_team_score'])
        x=x[~x.contest_id.duplicated(keep=False)&~x.gid.duplicated(keep=False)]
        data.loc[missing,'espn_game_id']=data.loc[missing,'contest_id'].map(x.set_index('contest_id').gid).fillna('')
        print('historical crosswalk',year,len(x),flush=True)
    data=data[data.espn_game_id.isin(frame.gid)].rename(columns={'espn_game_id':'gid'})
    contests=data.groupby(['gid','contest_id'],as_index=False).size()
    n_contests=contests.groupby('gid').size()
    keep=contests.sort_values('size',ascending=False).drop_duplicates('gid')[['gid','contest_id']]
    data=data.merge(keep,on=['gid','contest_id'])
    keep.to_csv(DEST/f'crosswalk_{year}.csv',index=False)
    f=data[data.event_type.isin(['Commits Foul','Draw Foul'])].merge(frame[['gid','h','a']])
    f['tid']=f.event_team_espn_team_id
    miss=~(f.tid.eq(f.h)|f.tid.eq(f.a))
    f.loc[miss & f.event_team.eq(f.home),'tid']=f.h
    f.loc[miss & f.event_team.eq(f.away),'tid']=f.a
    f['kind']=np.select([f.foul_class.isin(['technical','adminTechnical'])|f.event_description.str.contains('technical',case=False),
        f.is_flagrant.eq('true'),f.foul_class.eq('offensive'),f.is_shooting_foul.eq('true'),
        f.is_looseball_foul.eq('true'),f.foul_class.eq('personal')],
        ['technical','flagrant','offensive','shooting','looseball','other_personal'],default='unknown')
    f['name']=f.player_1_clean_name.map(norm)
    m=f.clock.str.extract(r'^(\d+):(\d+(?:\.\d+)?)$').astype(float)
    f['late']=pd.to_numeric(f.period,errors='coerce').ge(2)&(60*m[0]+m[1]).le(120)
    duplicates=['gid','period','clock','event_type','event_description','tid','home_score','away_score']
    f['dup']=f.duplicated(duplicates)
    f['counted']=f.event_type.eq('Commits Foul')
    peer=f[f.name.isin(PEERS)&~f.dup].copy()
    peer['drawn']=peer.event_type.eq('Draw Foul')
    peer['committed']=peer.counted&peer.kind.ne('technical')
    save(peer.groupby(['gid','tid','name'],as_index=False)[['drawn','committed']].sum(),'peers',year)
    q=f[f.counted].copy()
    q['side']=np.select([q.tid.eq(q.h),q.tid.eq(q.a)],['h','a'],default='unassigned')
    q['personal']=q.kind.ne('technical')
    q['before']=q.personal
    q['after']=q.personal&~q.dup
    q['withtech']=~q.dup
    knownpos=q.poss_team_espn_team_id.eq(q.h)|q.poss_team_espn_team_id.eq(q.a)
    q['inferred_defense']=q.kind.isin(['shooting','other_personal'])&knownpos&q.poss_team_espn_team_id.ne(q.tid)&~q.dup
    q['offense_side_personal']=q.kind.eq('other_personal')&knownpos&q.poss_team_espn_team_id.eq(q.tid)&~q.dup
    keys=['gid','side']
    counts=q.groupby(keys)[['before','after','withtech','inferred_defense','offense_side_personal','dup']].sum().unstack(fill_value=0)
    counts.columns=[f'{side}_{field}' for field,side in counts.columns]
    ct=q[~q.dup].groupby(['gid','side','kind']).size().unstack(['side','kind'],fill_value=0)
    ct.columns=[f'{side}_{k}' for side,k in ct.columns]
    early=q[~q.dup&~q.late].groupby(['gid','kind']).size().unstack(fill_value=0).add_prefix('early_')
    counts=counts.join(ct).join(early).fillna(0)
    merged=frame.join(counts,on='gid')
    newcols=[c for c in counts if c not in frame]
    merged[newcols]=merged[newcols].fillna(0)
    for side in ['h','a']:
        for k in KINDS:
            if f'{side}_{k}' not in merged: merged[f'{side}_{k}']=0
    for k in KINDS:
        if f'early_{k}' not in merged: merged[f'early_{k}']=0
    merged['has_pbp']=merged.gid.isin(keep.gid)
    merged['n_contests']=merged.gid.map(n_contests).fillna(0)
    for variant in ['before','after','withtech']:
        merged['exact_'+variant]=merged.has_pbp&(merged.hf==merged['h_'+variant])&(merged.af==merged['a_'+variant])
    save(merged,'audited',year)
    print(year,len(frame),int(merged.has_pbp.sum()),merged[['exact_before','exact_after','exact_withtech']].sum().to_dict(),flush=True)

if __name__=='__main__':
    DEST.mkdir(exist_ok=True)
    year=int(sys.argv[1])
    audit(year,load(year))
