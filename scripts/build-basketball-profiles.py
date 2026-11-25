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
fields = "field_goals_made field_goals_attempted three_point_field_goals_made three_point_field_goals_attempted total_turnovers offensive_rebounds defensive_rebounds steals free_throws_made free_throws_attempted".split()


def rates(a, b):
    fg, fga, three, attempts, to, orb, drb, _, ft, fta = [a[k] for k in fields]
    possessions = fga - orb + to + .475 * fta
    def pct(n, d):
        return 100 * n / d if d else None
    return [pct(fg + .5 * three, fga), pct(fg-three, fga-attempts),
            pct(three, attempts), pct(attempts, fga), pct(to, possessions),
            pct(b["steals"], possessions), pct(to-b["steals"], possessions),
            pct(orb, orb+b["defensive_rebounds"]), pct(drb, drb+b["offensive_rebounds"]),
            pct(fta, fga), pct(ft, fta)]


def build(teams, rows):
    ids = {t["team"]["id"] for t in teams["sports"][0]["leagues"][0]["teams"]}
    games = defaultdict(dict)
    for row in rows:
        if row["team_id"] in ids and row["opponent_team_id"] in ids and row["season_type"] in ("2", "3"):
            games[row["game_id"]][row["team_id"]] = row
    totals = defaultdict(lambda: [Counter(), Counter()])
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
        dates.append(a["game_date"])
    profiles = {t: [rates(a,b), rates(b,a)] for t,(a,b) in totals.items()}
    for side in range(2):
        for i in range(11):
            low = (i in (4,5,6)) != bool(side)
            values = {t: round(p[side][i], 8) for t,p in profiles.items() if p[side][i] is not None}
            ordered = sorted(values.values(), reverse=not low)
            ranks = {v: r for r,v in reversed(list(enumerate(ordered, 1)))}
            for t,v in values.items():
                profiles[t][side][i] = [round(v,1), ranks[v]]
    if len(profiles) < 2:
        raise ValueError("Insufficient Division I box scores")
    return {"through":max(dates), "teams":profiles}


if __name__ == "__main__":
    with urlopen(teams_url, timeout=40) as response:
        teams = json.load(response)
    with urlopen(f"{release}/team_box_{season}.csv", timeout=60) as response:
        data = build(teams, csv.DictReader(response.read().decode().splitlines()))
    Path("assets/basketball-live/profiles.json").write_text(json.dumps(data, separators=(",",":")))
