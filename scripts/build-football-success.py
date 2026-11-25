"""Build Big Ten play-by-play and conference benchmarks from ESPN parquet files (requires pyarrow)."""
import argparse
import collections
import csv
import io
import gzip
import hashlib
from itertools import groupby
import json
from pathlib import Path
import re
import zipfile

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

MARYLAND = 120
YEARS = (2023, 2024, 2025, 2026)
TEAMS = {
    356: "Illinois", 84: "Indiana", 2294: "Iowa", 120: "Maryland", 130: "Michigan",
    127: "Michigan State", 135: "Minnesota", 158: "Nebraska", 77: "Northwestern",
    194: "Ohio State", 2483: "Oregon", 213: "Penn State", 2509: "Purdue", 164: "Rutgers",
    26: "UCLA", 30: "USC", 264: "Washington", 275: "Wisconsin",
}
JOINED_2024 = {2483, 26, 30, 264}
AS_OF = "2026-11-21"
MATCHED_GAMES = 11
# ESPN tags these conference championship games as regular season.
TITLE_GAMES = {401539475, 401539480, 401673464, 401777353}
# Official final scores for games whose ESPN play-by-play is missing.
FALLBACK_SCORES = {
    2023: {401520169: (38, 15)},  # Penn State–West Virginia
    2024: {401628492: (49, 14), 401628504: (35, 7), 401628508: (14, 7), 401628511: (50, 49)},
}
RELEASE = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_cfb_pbp"
COLUMNS = """
game_id game_play_number homeTeamId awayTeamId homeTeamName awayTeamName
homeFinalScore awayFinalScore status_type_completed seasonType week id text type.text
homeTeamAbbrev awayTeamAbbrev drive.team.abbreviation
period clock.displayValue down distance start.yardsToEndzone start.pos_score_diff
pos_team_id drive.id drive.team.displayName drive.displayResult drive.offensivePlays
drive.start.period.number drive.start.clock.displayValue drive.start.text statYardage
pass rush sack scrimmage_play kneel_down penalty_negated_play penalty_no_play
penalty_offset penalty_enforcement penalty_in_text penalty_flag isPenalty
penalty_all_declined is_pos_team_turnover int_turnover pos_fumble_lost offense_score_play
""".split()
CLOCK_PLAYS = re.compile(r"\bkneels?\b|\btakes? a knee\b|\bspik(?:e|es|ed|ing)\b", re.I)
PASS_WORDS = re.compile(r"\bpass(?:es|ed|ing)?\b", re.I)
RUN_WORDS = re.compile(r"\b(?:runs?|rush(?:es|ed)?)\b", re.I)
# The ESPN row has only the return. UCLA's game book identifies the snap as an interception.
UCLA_INTERCEPTION = 401752879104969801


def read_season(path):
    table = pq.read_table(path, columns=COLUMNS)
    members = list(TEAMS)
    big_ten = pc.or_(pc.is_in(table["homeTeamId"], value_set=pa.array(members)),
                     pc.is_in(table["awayTeamId"], value_set=pa.array(members)))
    return table.filter(pc.and_(big_ten, table["status_type_completed"])).to_pylist()


def classify(play):
    text = play["text"] or ""
    raw_type = play["type.text"]
    if play["kneel_down"] or CLOCK_PLAYS.search(text):
        return None, "Kneel or spike"
    if not play["scrimmage_play"]:
        return None, "Special teams or administrative"
    if play["penalty_negated_play"] or play["penalty_no_play"] or play["penalty_offset"]:
        return None, "Nullified or offsetting penalty"
    flagged = any(play[field] for field in ("isPenalty", "penalty_in_text", "penalty_flag", "penalty_enforcement"))
    if flagged and not (play["penalty_all_declined"] or play["penalty_enforcement"] == "declined"):
        return None, "Enforced or unresolved penalty"
    if not (play["down"] in (1, 2, 3, 4) and play["distance"]
            and 1 <= (play["start.yardsToEndzone"] or 0) <= 100 and play["period"]
            and play["distance"] > 0):
        return None, "Missing down, distance or field position"
    is_interception = play["int_turnover"] or play["id"] == UCLA_INTERCEPTION
    turnover = bool(play["is_pos_team_turnover"] or is_interception or play["pos_fumble_lost"])
    if play["sack"]:
        category, detail = "Dropback", "Sack"
    elif is_interception:
        category, detail = "Dropback", "Interception"
    elif play["pass"] or PASS_WORDS.search(text):
        category, detail = "Dropback", raw_type
    elif play["rush"] or RUN_WORDS.search(text):
        category, detail = "Rush", raw_type
    else:
        category, detail = "Other", raw_type
    only_return = raw_type == "Fumble Return Touchdown" or play["id"] == UCLA_INTERCEPTION
    yards = None if only_return else play["statYardage"]
    if yards is None and not turnover:
        return None, "Missing scrimmage yards"
    distance = min(play["distance"], play["start.yardsToEndzone"])
    needed = (distance * (5, 7, 10, 10)[play["down"] - 1] + 9) // 10
    success = not turnover and not play["sack"] and (
        bool(play["offense_score_play"]) or yards >= needed
    )
    return [play["period"], play["clock.displayValue"], play["down"], distance, category, detail,
            yards, needed, int(success), int(turnover), play["start.yardsToEndzone"],
            play["start.pos_score_diff"], text, str(play["id"])], None


def cfbd_fallback(path, game_id, scores):
    """Normalize a game absent from the ESPN drives feed."""
    columns = """
    game_id id_play game_play_number home_team_id away_team_id home_team away_team pos_team pos_score_diff_start
    week period clock_minutes clock_seconds
    play_type play_text drive_id drive_result drive_start_period drive_time_minutes_start drive_time_seconds_start
    drive_start_yards_to_goal rush pass sack int down distance yards_to_goal yards_gained offense_score_play
    penalty_flag penalty_declined penalty_offset penalty_no_play turnover_vec
    """.split()
    table = pq.read_table(path, columns=columns, filters=[("game_id", "=", game_id)])
    results = []
    for row in table.to_pylist():
        home, away = row["home_team"], row["away_team"]
        home_id, away_id = row["home_team_id"], row["away_team_id"]
        names = {home: home_id, away: away_id}
        yard = row["drive_start_yards_to_goal"]
        field = f"{int(yard)} yd to goal" if yard is not None else ""
        results.append({
            "game_id": row["game_id"], "game_play_number": row["game_play_number"],
            "homeTeamId": home_id, "awayTeamId": away_id, "homeTeamName": home, "awayTeamName": away,
            "homeFinalScore": scores[0], "awayFinalScore": scores[1], "seasonType": 2, "week": row["week"],
            "id": f"cfbd:{int(row['id_play'])}", "text": row["play_text"], "type.text": row["play_type"],
            "period": row["period"], "clock.displayValue": format_clock(row["clock_minutes"], row["clock_seconds"]),
            "down": int(row["down"] or 0), "distance": int(row["distance"] or 0),
            "start.yardsToEndzone": int(row["yards_to_goal"] or 0),
            "start.pos_score_diff": int(row["pos_score_diff_start"] or 0), "pos_team_id": names.get(row["pos_team"]),
            "homeTeamAbbrev": home, "awayTeamAbbrev": away, "drive.team.abbreviation": None,
            "drive.id": row["drive_id"], "drive.offensivePlays": None, "drive.displayResult": row["drive_result"],
            "drive.start.period.number": row["drive_start_period"], "drive.start.text": field,
            "drive.start.clock.displayValue": format_clock(row["drive_time_minutes_start"], row["drive_time_seconds_start"]),
            "statYardage": int(row["yards_gained"]) if row["yards_gained"] is not None else None,
            "pass": row["pass"], "rush": row["rush"], "sack": row["sack"],
            "scrimmage_play": any(row[key] for key in ("pass", "rush", "sack", "int", "turnover_vec")),
            "kneel_down": False, "penalty_negated_play": False, "penalty_no_play": row["penalty_no_play"],
            "penalty_offset": row["penalty_offset"], "penalty_enforcement": None, "penalty_in_text": False,
            "penalty_flag": row["penalty_flag"], "isPenalty": row["penalty_flag"],
            "penalty_all_declined": row["penalty_declined"], "is_pos_team_turnover": row["turnover_vec"],
            "int_turnover": row["int"], "pos_fumble_lost": False, "offense_score_play": row["offense_score_play"]
        })
    assert results, f"Missing game {game_id} in the CFBD fallback"
    return results


def format_clock(minutes, seconds):
    return f"{int(minutes)}:{int(seconds):02d}" if minutes is not None and seconds is not None else None


def empty_dataset():
    return {"games": [], "drives": [], "plays": [], "excluded": collections.Counter(), "withheldClocks": 0}


def prepare_drives(records):
    """Use the possession on the rated snap, even when a feed drive label is wrong."""
    feed_drives = collections.defaultdict(list)
    for record in sorted(records, key=lambda row: row["game_play_number"]):
        feed_drives[record["drive.id"]].append(record)
    drives, excluded = [], collections.Counter()
    withheld = 0
    head = records[0]
    team_ids = {head["homeTeamId"], head["awayTeamId"]}
    abbrevs = {head["homeTeamAbbrev"]: head["homeTeamId"], head["awayTeamAbbrev"]: head["awayTeamId"]}
    for rows in feed_drives.values():
        first = rows[0]
        # Retain the pilot's drive indices when possession agrees with the feed.
        runs = []
        for record in rows:
            play, reason = classify(record)
            if play is None:
                excluded[reason] += 1
                continue
            owner = record["pos_team_id"]
            if owner not in team_ids:
                excluded["Unresolved possession"] += 1
                continue
            if not runs or runs[-1][0] != owner:
                runs.append((owner, []))
            runs[-1][1].append(play)
        if not runs and first["drive.id"] and first["drive.offensivePlays"]:
            owner = abbrevs.get(first["drive.team.abbreviation"])
            if owner in team_ids:
                runs.append((owner, []))
        for owner, plays in runs:
            for _, stretch in groupby(plays, key=lambda play: tuple(play[:2])):
                stretch = list(stretch)
                if len(stretch) >= 3 and stretch[0][1]:
                    for play in stretch:
                        play[1] = None
                        withheld += 1
            if len(runs) > 1 or not first["drive.id"]:
                if not plays:
                    continue
                period, clock, field, result = plays[0][0], plays[0][1], "", "Unreported"
            else:
                period, clock, field, result = (first["drive.start.period.number"],
                    first["drive.start.clock.displayValue"], first["drive.start.text"],
                    first["drive.displayResult"] or "Unreported")
                if not period and plays:
                    period = plays[0][0]
            drives.append((owner, period, clock, field, result, plays))
    return drives, excluded, withheld


def distance_group(yards):
    return 0 if yards <= 3 else 1 if yards <= 6 else 2


def append_game(data, head, year, team, drives, excluded, withheld, benchmark, league_game, number_in_season):
    home = head["homeTeamId"] == team
    post = head["seasonType"] == 3
    week = head["week"]
    week_key = f"{head['seasonType']}:{week}"
    opponent = head["awayTeamName"] if home else head["homeTeamName"]
    scores = [head["homeFinalScore"], head["awayFinalScore"]]
    game_index = len(data["games"])
    venue = "Neutral" if head["game_id"] == 401551770 else "Home" if home else "Away"
    data["games"].append([str(head["game_id"]), year, "Postseason" if post else f"Week {week}",
        opponent, venue, *(scores if home else reversed(scores)), week_key, league_game, number_in_season])
    data["excluded"].update(excluded)
    data["withheldClocks"] += withheld
    for number, (owner, period, start, field, result, plays) in enumerate(drives, 1):
        offense = int(team == owner)
        drive_index = len(data["drives"])
        data["drives"].append([game_index, number, offense, period, start, field, result, len(plays)])
        for play in plays:
            data["plays"].append([drive_index, *play])
            if year == 2023 and team in JOINED_2024:
                continue
            margin = play[11] if offense else -(play[11] or 0)
            situation = (margin > 0) - (margin < 0) if margin is not None else 0
            matched_window = number_in_season is not None and number_in_season <= MATCHED_GAMES
            key = (year, week_key, offense, play[0], play[2], play[4], distance_group(play[3]), situation,
                   league_game, matched_window, team)
            cell = benchmark[key]
            cell[0] += play[8] if offense else 1 - play[8]
            cell[1] += 1


def build(source):
    output = {team: empty_dataset() for team in TEAMS}
    bench = collections.defaultdict(lambda: [0, 0])
    sources = []
    for year in YEARS:
        members = set(TEAMS) - JOINED_2024 if year == 2023 else set(TEAMS)
        team_games = collections.Counter()
        path = source / f"{year}.parquet"
        sources.append({"season": year, "url": f"{RELEASE}/play_by_play_{year}.parquet",
                        "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        by_game = collections.defaultdict(dict)
        for play in read_season(path):
            by_game[play["game_id"]][play["id"]] = play
        fallback_path = source / f"cfbd-{year}.parquet"
        for game_id, scores in FALLBACK_SCORES.get(year, {}).items():
            if game_id in by_game:
                continue
            by_game[game_id] = {row["id"]: row for row in cfbd_fallback(fallback_path, game_id, scores)}
            sources.append({"season": year, "game_id": str(game_id),
                            "url": RELEASE.replace("espn_cfb_pbp", "cfbfastR_cfb_pbp") + f"/play_by_play_{year}.parquet",
                            "sha256": hashlib.sha256(fallback_path.read_bytes()).hexdigest()})
        games = [list(plays.values()) for plays in by_game.values()]
        for records in sorted(games, key=lambda rows: (rows[0]["seasonType"], rows[0]["week"], rows[0]["game_id"])):
            head = records[0]
            if year == 2026 and head["seasonType"] != 2:
                continue
            if year == 2026 and head["week"] > 12:
                continue
            teams = (head["homeTeamId"], head["awayTeamId"])
            regular = head["seasonType"] == 2 and head["game_id"] not in TITLE_GAMES
            league_game = regular and all(team in members for team in teams)
            drives, excluded, withheld = prepare_drives(records)
            for team in teams:
                if team not in output:
                    continue
                if regular:
                    team_games[team] += 1
                number_in_season = team_games[team] if regular else None
                append_game(output[team], head, year, team, drives, excluded, withheld, bench, league_game, number_in_season)
    assert [sum(game[1] == year for game in output[MARYLAND]["games"]) for year in YEARS] == [13, 12, 12, 11]
    index = {"teams": [[str(team), name] for team, name in TEAMS.items()], "asOf": AS_OF, "matchedGames": MATCHED_GAMES, "joinedIn2024": sorted(JOINED_2024), "sources": sources}
    return output, [list(key) + totals for key, totals in bench.items()], index


CSV_COLUMNS = ["season", "week", "game_id", "team", "opponent", "venue", "team_score", "opponent_score", "unit",
               "drive", "drive_result", "period", "clock", "down", "distance", "play_type", "feed_type", "yards_gained",
               "yards_needed", "possession_team_success", "team_success", "turnover", "yards_to_goal",
               "team_score_margin_before_play", "description", "play_id", "big_ten_league_game", "regular_season_game_number"]


def write_exports(output, path):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("README.txt", (
            f"Big Ten football play-by-play, 2023–{YEARS[-1]} through {AS_OF}.\n"
            "One row per rated snap per current Big Ten team perspective. Games involving two covered teams "
            "appear in both perspectives. For distinct snaps, use game_id and play_id together.\n"
            "team_success is an offensive success or defensive stop for the team column. Thresholds are "
            "50%, 70%, or 100% of yards to go on first, second, or third/fourth down.\n"
            "Source: SportsDataverse ESPN parquet files, with CollegeFootballData for five games missing from ESPN. "
            "Venue is the schedule designation. Blank clocks include repeated times suppressed from the feed.\n"
            "big_ten_league_game marks regular-season games between Big Ten members that season. "
            "regular_season_game_number is the team's chronological regular-season game number.\n"
        ))
        for year in YEARS:
            with archive.open(f"big_ten_football_plays_{year}.csv", "w") as stream:
                with io.TextIOWrapper(stream, encoding="utf-8", newline="") as text_file:
                    writer = csv.writer(text_file)
                    writer.writerow(CSV_COLUMNS)
                    for team, data in output.items():
                        for drive_index, period, clock, down, to_go, category, detail, gain, needed, good, turnover, field, score, text, play_id in data["plays"]:
                            game_index, number, offense, _, _, _, result, _ = data["drives"][drive_index]
                            game_id, season, week, opponent, venue, own, opp, _, league, ordinal = data["games"][game_index]
                            if season != year:
                                continue
                            if text and text[0] in "=+@-\t\r":
                                text = "'" + text
                            writer.writerow([season, week, game_id, TEAMS[team], opponent, venue, own, opp,
                                "Offense" if offense else "Defense", number, result, period, clock, down, to_go,
                                category, detail, gain, needed, good, good if offense else 1 - good, turnover, field,
                                score if offense or score is None else -score, text, play_id, int(league), ordinal])


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("parquet_directory", type=Path)
    args = parser.parse_args()
    data, benchmark, index = build(args.parquet_directory)
    build_path = Path(__file__).resolve().parents[1] / "assets" / "football-success"
    team_path = build_path / "teams"
    team_path.mkdir(exist_ok=True)
    for team_id, team_data in data.items():
        write_json(team_path / f"{team_id}.json", team_data)
        counts = collections.Counter(game[1] for game in team_data["games"])
        print(TEAMS[team_id], sorted(counts.items()), len(team_data["plays"]))
    write_json(build_path / "coverage.json", index)
    with gzip.open(build_path / "benchmark-teams.json.gz", "wt", encoding="utf-8") as compressed:
        json.dump(benchmark, compressed, separators=(",", ":"))
    write_exports(data, build_path / "big-ten-football-plays.zip")
