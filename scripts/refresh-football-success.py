"""Refresh the published football data from completed ESPN games."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import gzip
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
from zoneinfo import ZoneInfo

from dashboard_sources import ESPN, RELEASE, fetch, json_from

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / 'scripts/build-football-success.py'
SITE = ROOT / 'assets/football-success'


def schedule_for(team, year):
    doc = json_from(f'{ESPN}/football/college-football/teams/{team}/schedule?season={year}')
    if str(doc['team']['id']) != str(team) or not doc['events']:
        raise ValueError(f'Missing schedule for team {team}')
    eastern = ZoneInfo('America/New_York')
    rows = []
    for event in doc['events']:
        competition = event['competitions'][0]
        if competition['status']['type']['name'] != 'STATUS_FINAL':
            continue
        sides = competition['competitors']
        scores = {int(side['team']['id']): int(side['score']['value']) for side in sides}
        if len(scores) != 2 or team not in scores:
            raise ValueError(f'Invalid final for team {team}: {event["id"]}')
        day = datetime.fromisoformat(competition['date']).astimezone(eastern).date()
        rows.append(dict(id=str(event['id']), team=str(team), date=str(day),
                         scores=[scores[team], next(v for k, v in scores.items() if k != team)]))
    return rows


def main():
    config = runpy.run_path(str(BUILDER))
    teams = list(config['TEAMS'])
    years = config['YEARS']
    with TemporaryDirectory() as temp:
        work = Path(temp)
        inputs = work / 'inputs'
        inputs.mkdir()
        output = work / 'output'
        schedule = work / 'schedule.json'
        sources = [(f'{year}.parquet', 'espn_cfb_pbp', year) for year in years]
        sources += [(f'cfbd-{year}.parquet', 'cfbfastR_cfb_pbp', year)
                    for year in config['FALLBACK_SCORES']]
        with ThreadPoolExecutor(max_workers=8) as pool:
            downloads = [pool.submit(fetch, f'{RELEASE}/{tag}/play_by_play_{year}.parquet',
                                     inputs / filename) for filename, tag, year in sources]
            finals = [row for team_rows in pool.map(lambda team: schedule_for(team, years[-1]), teams)
                      for row in team_rows]
            for download in downloads:
                download.result()
        if len({(r['id'], r['team']) for r in finals}) != len(finals):
            raise ValueError('Duplicate ESPN schedule rows')
        schedule.write_text(json.dumps(finals))
        subprocess.run([sys.executable, str(BUILDER), str(inputs), '--schedule', str(schedule),
                        '--output', str(output)], check=True)
        changed = False
        for path in sorted((output / 'teams').glob('*.json')):
            before = json.loads((SITE / 'teams' / path.name).read_text())
            after = json.loads(path.read_text())
            old_games = {r[0] for r in before['games']}
            new_games = {r[0] for r in after['games']}
            if not old_games <= new_games or len(new_games) != len(after['games']):
                raise ValueError(f'Lost or duplicate football games in {path.name}')
            changed |= before != after
        benchmark = 'benchmark-teams.json.gz'
        with gzip.open(output / benchmark) as proposed, gzip.open(SITE / benchmark) as previous:
            changed |= json.load(proposed) != json.load(previous)
        coverage = 'coverage.json'
        before = json.loads((SITE / coverage).read_text())
        after = json.loads((output / coverage).read_text())
        if after['asOf'] < before['asOf']:
            raise ValueError('Football coverage date regressed')
        changed |= {k: v for k, v in before.items() if k != 'sources'} != {
            k: v for k, v in after.items() if k != 'sources'}
        if changed:
            shutil.copytree(output, SITE, dirs_exist_ok=True)
            print(f'Football data updated through {after["asOf"]}.')
        else:
            print('Football data is unchanged.')


if __name__ == '__main__':
    main()
