"""Build season-to-date D-I profiles from paired hoopR team box scores."""
import csv
import json
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from urllib.request import urlopen

today = date.today()
season = today.year + (today.month >= 10)
release = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_mens_college_basketball_team_boxscores"
teams_url = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?groups=50&limit=1000"
fields = "field_goals_made field_goals_attempted three_point_field_goals_made three_point_field_goals_attempted total_turnovers offensive_rebounds defensive_rebounds steals free_throws_made free_throws_attempted assists blocks".split()


def rates(a, b):
    fg, fga, three, attempts, to, orb, drb, _, ft, fta = [a[k] for k in fields[:10]]
    possessions = fga - orb + to + .475 * fta
    def pct(n, d):
        return 100 * n / d if d else None
    return [pct(fg + .5 * three, fga), pct(fg-three, fga-attempts),
            pct(three, attempts), pct(attempts, fga), pct(to, possessions),
            pct(b["steals"], possessions), pct(to-b["steals"], possessions),
            pct(orb, orb+b["defensive_rebounds"]), pct(drb, drb+b["offensive_rebounds"]),
            pct(fta, fga), pct(ft, fta), pct(a["assists"], fg), pct(b["blocks"], fga-attempts)]


def build(teams, rows, players, bios):
    ids = {t["team"]["id"] for t in teams["sports"][0]["leagues"][0]["teams"]}
    games = defaultdict(dict)
    for row in rows:
        if row["team_id"] in ids and row["opponent_team_id"] in ids and row["season_type"] in ("2", "3"):
            games[row["game_id"]][row["team_id"]] = row
    totals = defaultdict(lambda: [Counter(), Counter()])
    included = set()
    dates = []
    for sides in games.values():
        if len(sides) != 2:
            continue
        a, b = sides.values()
        try:
            stats = [Counter({k: int(s[k]) for k in fields}) for s in (a, b)]
        except ValueError:
            continue
        for i, team in enumerate((a, b)):
            own, opp = totals[team["team_id"]]
            own.update(stats[i])
            opp.update(stats[1-i])
        included.add(a["game_id"])
        dates.append(a["game_date"])
    profiles = {t: [rates(a,b), rates(b,a)] for t,(a,b) in totals.items()}
    for side in range(2):
        for i in range(13):
            low = (i in (4,5,6,12)) != bool(side)
            values = {t: round(p[side][i], 8) for t,p in profiles.items() if p[side][i] is not None}
            ordered = sorted(values.values(), reverse=not low)
            ranks = {v: r for r,v in reversed(list(enumerate(ordered, 1)))}
            for t,v in values.items():
                profiles[t][side][i] = [round(v,1), ranks[v]]
    if len(profiles) < 2:
        raise ValueError("Insufficient Division I box scores")
    minutes = defaultdict(Counter)
    game_minutes = defaultdict(float)
    for row in players:
        if row["game_id"] in included and row["minutes"]:
            n = float(row["minutes"])
            if n > 0:
                minutes[row["team_id"]][row["athlete_id"]] += n
                game_minutes[row["game_id"]] += n
    bio = {r["athlete_id"]: r for r in bios}
    duration = Counter()
    for game in included:
        # Ten players on court. Round the combined box minutes to the nearest OT.
        length = max(40, round(game_minutes[game] / 50) * 5)
        for team in games[game]:
            duration[team] += length
    comparison = {}
    def possessions(s):
        return s["field_goals_attempted"] - s["offensive_rebounds"] + s["total_turnovers"] + .475*s["free_throws_attempted"]
    for team, (own, opp) in totals.items():
        tempo = 20*(possessions(own)+possessions(opp))/duration[team]
        heights, experience = [], []
        rotation = [(pid,m) for pid,m in minutes[team].items() if m >= .1*duration[team]]
        for pid, m in rotation:
            row = bio.get(pid,{})
            if row.get("height"):
                heights.append((float(row["height"]), m))
            if row.get("experience_years") and int(row["experience_years"]) >= 1:
                experience.append((int(row["experience_years"])-1, m))
        frontcourt = .4 * sum(m for _,m in heights)
        remaining, weighted = frontcourt, 0
        for h,m in sorted(heights, reverse=True):
            used = min(remaining,m)
            weighted += h*used
            remaining -= used
        height = weighted/frontcourt if frontcourt and len(heights)==len(rotation) else None
        years = (sum(y*m for y,m in experience)/sum(m for _,m in experience)
                 if experience and len(experience)==len(rotation) else None)
        comparison[team] = [tempo,height,years]
    for i in range(3):
        values = sorted((p[i] for p in comparison.values() if p[i] is not None),reverse=True)
        for row in comparison.values():
            if row[i] is not None:
                row[i] = [round(row[i],2),values.index(row[i])+1]
    return {"through":max(dates), "teams":profiles, "comparison":comparison}


def season_rows(tag, file):
    url = f"https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_mens_college_basketball_{tag}/{file}_{season}.csv"
    with urlopen(url, timeout=90) as response:
        return csv.DictReader(response.read().decode().splitlines())


if __name__ == "__main__":
    with urlopen(teams_url, timeout=40) as response:
        teams = json.load(response)
    data = build(teams, season_rows("team_boxscores","team_box"),
                 season_rows("player_boxscores","player_box"), season_rows("player_core","player_core"))
    ids = json.loads(Path(__file__).with_name("torvik-team-ids.json").read_text())
    with urlopen(f"https://barttorvik.com/{season}_team_results.csv", timeout=60) as response:
        ratings = list(csv.DictReader(response.read().decode().splitlines()))
    margins = sorted((float(r["adjoe"])-float(r["adjde"]) for r in ratings), reverse=True)
    data["adjusted"] = {}
    for r in ratings:
        team = ids.get(r["team"])
        if team:
            offense, defense = float(r["adjoe"]), float(r["adjde"])
            data["adjusted"][team] = [[offense,int(r["oe Rank"])],[defense,int(r["de Rank"])],
                                      [offense-defense,1+margins.index(offense-defense)]]
    Path("assets/basketball-live/profiles.json").write_text(json.dumps(data, separators=(",",":")))
