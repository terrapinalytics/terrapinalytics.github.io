"""Build and validate the current season using the original officiating model."""
from concurrent.futures import ThreadPoolExecutor
import csv
from datetime import date, datetime, timedelta
import gzip
import json
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
from zoneinfo import ZoneInfo

from dashboard_sources import ESPN, RELEASE, fetch, json_from
from officiating.pack_games import audited, boxscore_summary

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'assets/fouls'
SEASON = 2027
ESPN_MBB = f'{ESPN}/basketball/mens-college-basketball'
SOURCES = {
    'box': ('espn_mens_college_basketball_team_boxscores', 'team_box_{year}.csv'),
    'sched': ('espn_mens_college_basketball_schedules', 'mbb_schedule_{year}.csv'),
    'off': ('espn_mens_college_basketball_officials', 'officials_{year}.csv'),
    'ncaa_csv': ('ncaa_mbb_pbp', 'ncaa_mbb_pbp_{year}.csv.gz'),
    'poss': ('ncaa_mbb_possessions', 'ncaa_mbb_possessions_{year}.csv.gz'),
}
# Big Ten box-score totals for missing ESPN lines on November 27, 2026.
# Fields are team ID, field-goal attempts, free-throw attempts, ORB, TO, and PF.
BOX_FALLBACK = {
    '401920737': [('111', 54, 14, 12, 16, 17), ('77', 61, 14, 11, 13, 13)],
    '401929289': [('213', 54, 21, 12, 14, 20), ('344', 61, 27, 13, 5, 19)],
}


def fill_known_box_gaps(path):
    with path.open(newline='') as file:
        reader = csv.DictReader(file)
        fields = reader.fieldnames
        present = {(r['game_id'], r['team_id']) for r in reader
                   if r['game_id'] in BOX_FALLBACK and r['fouls']}
    with path.open('a', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        for gid, rows in BOX_FALLBACK.items():
            for tid, fga, fta, oreb, turnovers, fouls in rows:
                if (gid, tid) not in present:
                    writer.writerow(dict(game_id=gid, team_id=tid, season_type='2',
                                         game_date='2026-11-27', field_goals_attempted=fga,
                                         free_throws_attempted=fta, offensive_rebounds=oreb,
                                         total_turnovers=turnovers, fouls=fouls))


def read_gzip(path):
    with gzip.open(path, 'rt') as file:
        return json.load(file)


def write_gzip(path, data):
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
    path.write_bytes(gzip.compress(raw, mtime=0))


def finals_on(day):
    return json_from(f'{ESPN_MBB}/scoreboard?dates={day:%Y%m%d}&groups=50&limit=300')['events']


def summarize(event, conferences, names):
    summary = json_from(f'{ESPN_MBB}/summary?event={event["id"]}')
    return boxscore_summary(event, summary, conferences, names)


def refresh(work, today):
    first = (today - timedelta(days=7)).isoformat()
    originals = read_gzip(SITE / f'games-{SEASON}.json.gz')
    original = {game['id']: game for game in originals}
    if len(original) != len(originals):
        raise ValueError('Published game IDs are duplicated')
    games = original.copy()
    work.joinpath('data').mkdir()
    schedule_days = [today - timedelta(days=n) for n in range(7, -1, -1)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        downloads = [pool.submit(fetch, f'{RELEASE}/{tag}/{name.format(year=SEASON)}',
                                 work / 'data' / file) for file, (tag, name) in SOURCES.items()]
        boards = list(pool.map(finals_on, schedule_days))
        for download in downloads:
            download.result()
    fill_known_box_gaps(work / 'data/box')
    for script in ('expand_data.py', 'build_players.py'):
        subprocess.run([sys.executable, str(ROOT / 'scripts/officiating' / script),
                        str(SEASON)], cwd=work, check=True)
    source_games = audited(work, SEASON)
    teams = {game[side]: (game[side+'c'], game[side+'n'])
             for game in originals + source_games for side in ('h', 'a')}
    for game in source_games:
        if game['date'] < first:
            continue
        previous = original.get(game['id'])
        if previous:
            if (game['h'], game['a'], game['date']) != (previous['h'], previous['a'], previous['date']):
                raise ValueError(f'Disagreeing game identity for {game["id"]}')
            if previous['clean'] and not game['clean']:
                raise ValueError(f'Published foul reconciliation regressed for {game["id"]}')
            if len(previous['refs']) == 3 and len(game['refs']) < 3:
                game['refs'] = previous['refs']
        games[game['id']] = game
    logos = json.loads((ROOT / 'assets/team-logos/index.json').read_text())
    d1 = set(teams) | {row['file'][:-4] for row in logos if 'mens-basketball' in row['sports']}
    missing = {}
    for event in (event for board in boards for event in board):
        gid = event['id']
        if (gid not in games and event['status']['type']['name'] == 'STATUS_FINAL'
                and all(side['team']['id'] in d1 for side in event['competitions'][0]['competitors'])):
            missing[gid] = event
    conferences = {key: value[0] for key, value in teams.items()}
    names = {key: value[1] for key, value in teams.items()}
    with ThreadPoolExecutor(max_workers=8) as pool:
        for gid, game in zip(missing, pool.map(lambda e: summarize(e, conferences, names), missing.values())):
            games[gid] = game
    for game in games.values():
        if game['p'] <= 0 or len(game['ht']) != 7 or len(game['at']) != 7:
            raise ValueError(f'Invalid game row {game["id"]}')
        if game['clean']:
            expected = (game['hf'], game['af'])
            counts = (game['ht'], game['at'])
            if tuple(map(sum, counts)) != expected and tuple(sum(r)-r[5] for r in counts) != expected:
                raise ValueError(f'Fouls do not reconcile for {game["id"]}')

    players_path = SITE / f'players-{SEASON}.json.gz'
    original_players = read_gzip(players_path)

    def player_key(row):
        return row['g'], row['t'], row['id']

    players = {player_key(row): row for row in original_players}
    fresh = read_gzip(work / f'expanded/players-{SEASON}.json.gz')
    if len(players) != len(original_players) or len(fresh) != len({player_key(row) for row in fresh}):
        raise ValueError('Duplicate player-game rows')
    for row in fresh:
        if row['g'] in games and games[row['g']]['date'] >= first:
            players[player_key(row)] = row
    for row in players.values():
        game = games[row['g']]
        if (row['t'] not in (game['h'], game['a']) or row['p'] <= 0
                or sum(row['ct']) != row['c'] or sum(row['dt']) != row['d']):
            raise ValueError(f'Invalid player denominator or foul count in {row["g"]}')
    player_rows = list(players.values())
    if games == original and player_rows == original_players:
        print('Officiating data is unchanged.')
        return

    meta_path = SITE / 'meta.json'
    meta = json.loads(meta_path.read_text())
    meta['through'] = max(g['date'] for g in games.values())
    meta['typesThrough'] = max(g['date'] for g in games.values() if g['clean'])
    meta['crewThrough'] = max(g['date'] for g in games.values() if len(g['refs']) == 3)
    meta['playersThrough'] = max(games[r['g']]['date'] for r in player_rows)
    season = next(row for row in meta['seasons'] if row['year'] == SEASON)
    season.update(games=len(games), clean=sum(g['clean'] for g in games.values()),
                  crew=sum(len(g['refs']) == 3 for g in games.values()))
    print(f'Added {len(games)-len(original)} games through {meta["through"]}; {season}.')
    write_gzip(SITE / f'games-{SEASON}.json.gz',
               sorted(games.values(), key=lambda game: (game['date'], game['id']), reverse=True))
    if player_rows != original_players:
        write_gzip(players_path, player_rows)
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')

    def label(key):
        day = date.fromisoformat(meta[key])
        return f'{day:%B} {day.day}'

    project = ROOT / 'projects/officiating.qmd'
    note = (f'For 2026–27, box scores extend through {label("through")}, referee crews through '
            f'{label("crewThrough")}, reconciled foul types through {label("typesThrough")}, '
            f'and tracked player possessions through {label("playersThrough")}.')
    original_text = project.read_text()
    updated, matches = re.subn(r'For 2026–27, .+?(?=\n|$)', note, original_text)
    if matches != 1:
        raise ValueError('Unable to find officiating coverage sentence')
    project.write_text(updated)


if __name__ == '__main__':
    today = datetime.now(ZoneInfo('America/New_York')).date()
    with TemporaryDirectory() as work:
        refresh(Path(work), today)
