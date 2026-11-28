import csv
import gzip
import re
import statistics
from collections import defaultdict
from pathlib import Path

DATA = Path('data')

def read(name, compressed=False):
    opener = gzip.open if compressed else open
    with opener(DATA / name, 'rt', newline='') as source:
        yield from csv.DictReader(source)

def load_games(suffix='', through=None):
    schedule = {r['id']: r for r in read('sched'+suffix)}
    eligible_confs = {r['groups_id'] for r in schedule.values() if r['groups_is_conference'].lower()=='true'}
    team_confs = {}
    for r in schedule.values():
        if r['conference_competition'].lower()=='true' and r['groups_id'] in eligible_confs:
            for side in ('home','away'):
                team_confs[r[side+'_id']] = r['groups_id']
    sides = defaultdict(dict)
    for r in read('box'+suffix):
        if r['season_type'] in ('2','3') and (through is None or r['game_date'] <= through):
            sides[r['game_id']][r['team_id']] = r
    games = {}
    for gid, team_rows in sides.items():
        r = schedule.get(gid)
        if not r or r['status_type_completed'].lower()!='true' or len(team_rows)!=2:
            continue
        h,a = r['home_id'],r['away_id']
        if {h,a} != team_rows.keys():
            continue
        hc,ac = [team_confs.get(r[s+'_id'],r[s+'_conference_id']) for s in ('home','away')]
        if not {hc,ac} <= eligible_confs:
            continue
        def poss(x):
            return (int(x['field_goals_attempted']) - int(x['offensive_rebounds'])
                    + int(x['total_turnovers']) + .475*int(x['free_throws_attempted']))
        try:
            b = [team_rows[t] for t in (h,a)]
            pf = [int(x['fouls']) for x in b]
            pace = statistics.mean(map(poss,b))
            if pace<=0: continue
        except (ValueError,TypeError):
            continue
        headline=r['notes_headline']
        if r['tournament_id']=='22' or re.search(r'NCAA Men.s Basketball (Championship|Tournament)',headline,re.I):
            kind='NCAA tournament'
        elif r['conference_competition'].lower()=='true' and r['tournament_id'] and hc==ac:
            kind='conference tournament'
        elif r['season_type']=='3':
            kind='other postseason'
        elif r['conference_competition'].lower()=='true':
            kind='conference regular season'
        elif headline:
            kind='nonconference regular season with event label'
        else:
            kind='nonconference regular season'
        games[gid]=(b[0]['game_date'],h,a,hc,ac,r['neutral_site'].lower(),kind,pf,pace,
                    r['home_short_display_name'],r['away_short_display_name'],headline)
    crews=defaultdict(set)
    for r in read('off'+suffix):
        name=' '.join(r['official_full_name'].split())
        if name: crews[r['game_id']].add(name)
    return games, crews

def classify(r):
    if r['foul_class'] in ('technical','adminTechnical') or 'technical' in r['event_description'].lower():
        return 'technical'
    if r['is_flagrant']=='true':
        return 'flagrant'
    if r['foul_class']=='offensive':
        return 'offensive'
    if r['is_shooting_foul']=='true':
        return 'shooting'
    if r['is_looseball_foul']=='true':
        return 'loose-ball'
    if r['foul_class']=='personal':
        return 'other personal non-shooting'
    return 'unknown'
