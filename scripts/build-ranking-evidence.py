"""Build the rankings dashboard's comparable evidence from published yearly panels."""
import argparse
from collections import Counter, defaultdict
import csv
import io
import json
from math import cos, radians, sin
from pathlib import Path
from statistics import mean
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
FINANCE = ROOT / 'assets/finance'
COACHING = ROOT / 'assets/coaching'
OUTPUT = COACHING / 'ranking-evidence.json'
MIN_YEARS = 2
FINANCE_YEARS = set(range(2016, 2026)) - {2020, 2021}
SEASONS = set(range(2016, 2026)) - {2020}
NCAA = 'NCAA MFRS / Knight-Newhouse'
EADA = 'EADA'


def csv_rows(path):
    with path.open(newline='', encoding='utf-8-sig') as file:
        return list(csv.DictReader(file))


def archived_rows(archive, table):
    with archive.open(f'normalized/{table}.csv') as raw:
        return list(csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig')))


def indexed(rows, key, years, year_field):
    values = defaultdict(dict)
    for row in rows:
        year = int(row[year_field])
        if year in years and row[key] != '':
            school = row['school']
            if year in values[school]:
                raise ValueError(f'Duplicate {key} for {school} in {year}')
            values[school][year] = float(row[key])
    return values


def summarize(values, source, factors=None, minimum=MIN_YEARS):
    result = {}
    for school, observations in values.items():
        if len(observations) < minimum:
            continue
        years = sorted(observations)
        adjusted = [observations[year] * (factors[year] if factors else 1) for year in years]
        result[school] = {'value': round(mean(adjusted), 4), 'years': years, 'source': source}
    return result


def rank_highest(values):
    ranked = {}
    previous_score = None
    rank = 0
    for position, (school, entry) in enumerate(
            sorted(values.items(), key=lambda item: item[1]['value'], reverse=True), start=1):
        if entry['value'] != previous_score:
            rank = position
            previous_score = entry['value']
        ranked[school] = {**entry, 'value': rank}
    return ranked


def recruiting_markets(programs):
    """Allocate nearby talent by straight-line distance to the current FBS footprint."""
    campuses = {}
    for row in csv_rows(COACHING / 'fbs-campus-locations.csv'):
        school = row['school']
        if school in campuses:
            raise ValueError(f'Duplicate campus for {school}')
        campuses[school] = radians(float(row['latitude'])), radians(float(row['longitude']))
    if campuses.keys() != programs.keys():
        raise ValueError('Recruiting market campuses must match all ranked schools')

    map_data = (ROOT / 'assets/recruiting/data.js').read_text().split('=', 1)[1].strip().rstrip(';')
    recruits = json.loads(map_data)['players']
    years = list(range(2022, 2027))
    local_threshold = sin(100 / (2 * 3958.7613)) ** 2
    regional_threshold = sin(250 / (2 * 3958.7613)) ** 2
    totals = {school: [0, 0, 0.0] for school in campuses}
    for year, _, rank, *_rest, latitude, longitude, _destination, _profile in recruits:
        if year not in years or not rank or rank > 1000 or latitude is None or longitude is None:
            continue
        lat, lon = radians(latitude), radians(longitude)
        nearby = {}
        for school, (campus_lat, campus_lon) in campuses.items():
            distance = sin((lat - campus_lat) / 2) ** 2 + cos(lat) * cos(campus_lat) * sin((lon - campus_lon) / 2) ** 2
            if distance <= local_threshold:
                nearby[school] = 1
                totals[school][0] += 1
            elif distance <= regional_threshold:
                nearby[school] = 0.5
                totals[school][1] += 1
        denominator = max(1, sum(nearby.values()))
        for school, weight in nearby.items():
            totals[school][2] += weight / denominator
    return [
        {school: {'value': round(values[i] / len(years), 4), 'years': years,
                  'source': '247Sports Composite / CFBD locations'}
         for school, values in totals.items()}
        for i in range(3)
    ]


def roster_estimates(rows):
    labels = {'CBS_FB': 'CBS / 247Sports', 'CBS_FB_ND': 'CBS / 247Sports',
              'SI_FB': 'Sports Illustrated', 'ATH_REPRINT': 'The Athletic (via RealGM)',
              'FSU_ALT': 'Alternate published estimate'}
    estimates = defaultdict(list)
    for row in rows:
        code = row['source_id']
        if row['sport'].lower() != 'football' or row['season'] != '2026' or code not in labels:
            continue
        bounds = [float(row[field]) for field in ('lower_usd', 'upper_usd') if row[field]]
        point = row['approx_point_usd']
        if not bounds and not point:
            continue
        estimates[row['school']].append((list(labels).index(code), {
            'value': float(point) if point else mean(bounds), 'reported': row['reported_value'],
            'source': labels[code], 'url': row['source_url'], 'note': row['qualification'],
        }))
    result = {}
    for school, entries in estimates.items():
        ordered = [entry for _, entry in sorted(entries, key=lambda pair: pair[0])]
        result[school] = {**ordered[0], 'years': [2026], 'alternatives': ordered}
    return result


def conference_evidence(ncaa, payouts, programs, membership, factors):
    aliases = {'American Athletic': 'American', 'Mid-American': 'MAC', 'Conference USA': 'C-USA'}

    def current_league(row):
        school = row['school']
        league = programs.get(school)
        historical = membership.get((school, int(row['fiscal_year']) - 1))
        return league not in (None, 'Independent') and aliases.get(historical, historical) == league

    comparable = [row for row in ncaa if current_league(row)]
    reports = summarize(indexed(comparable, 'conference_ncaa_media_postseason_revenue_usd',
                                FINANCE_YEARS, 'fiscal_year'), NCAA, factors, minimum=1)
    verified_payouts = [
        r for r in payouts if r['conference'] in ('ACC', 'Big Ten', 'Big 12')
        and r['actual_or_projection'] == 'actual reported cash'
        and programs.get(r['school']) == r['conference']
        and membership.get((r['school'], int(r['fiscal_year']) - 1)) == r['conference']
    ]
    counts = Counter((r['school'], r['fiscal_year']) for r in verified_payouts)
    unique = [r for r in verified_payouts if counts[r['school'], r['fiscal_year']] == 1]
    payments = summarize(indexed(unique, 'distribution_cash_usd', FINANCE_YEARS, 'fiscal_year'),
                         'Conference Form 990', factors, minimum=1)
    payout_sources = {(r['school'], int(r['fiscal_year'])): r['source_url'] for r in unique}
    for school, entry in payments.items():
        entry['url'] = payout_sources[school, entry['years'][-1]]
    return payments | reports


def build():
    index = {int(row['fiscal_year']): float(row['index']) for row in
             csv_rows(FINANCE / 'escalation/explorer_series.csv')
             if row['series_id'] == 'Fixed-weight composite' and row['index']}
    factors = {year: index[2025] / index[year] for year in FINANCE_YEARS}
    ncaa = csv_rows(FINANCE / 'fbs_ncaa_finances_FY2005_FY2025.csv')
    eada = csv_rows(FINANCE / 'fbs_eada_finances_FY2001_FY2025.csv')
    rankings = json.loads((COACHING / 'rankings.json').read_text())
    programs = {row['school']: row['conference'] for row in rankings['programs']}
    with ZipFile(COACHING / 'supporting_data.zip') as archive:
        payroll = archived_rows(archive, 'ncaa_mfrs_finances')
        payouts = archived_rows(archive, 'conference_distributions')
        roster = archived_rows(archive, 'nil_roster_source_observations')
        attendance = archived_rows(archive, 'football_attendance')
        recruiting = archived_rows(archive, 'recruiting_classes')
        transfers = archived_rows(archive, 'transfer_team_summary')
        sp = archived_rows(archive, 'cfbd_sp_2005_2025')
        membership = {(row['school'], int(row['season'])): row['conference_season']
                      for row in sp if row['membership_check'] == 'in_year_fbs_list'}

    def financial(rows, field, source=NCAA):
        return summarize(indexed(rows, field, FINANCE_YEARS, 'fiscal_year'), source, factors)

    metrics = []
    schools = {school: {} for school in programs}

    def add(key, label, definition, fmt, values, url):
        metrics.append(dict(key=key, label=label, definition=definition, format=fmt, url=url))
        for school in schools.keys() & values.keys():
            schools[school][key] = values[school]

    money_note = 'FY2016–25 average, excluding FY2020–21 · FY2025 athletics-cost dollars'
    finance_link = '../../projects/finance.html'
    source_link = 'supporting_data.zip'
    spending_ncaa = financial([r for r in ncaa if r['football_expenditure_valid_for_comparison'] != 'false'],
                             'football_expenditure_usd')
    spending_eada = financial(eada, 'football_expenditure_usd', EADA)
    add('evidence_football_spending', 'Football spending',
        money_note + ' · NCAA where at least two years are available, otherwise EADA',
        'money-rounded', spending_eada | spending_ncaa, finance_link)
    add('evidence_football_payroll', 'Football coaching payroll', money_note,
        'money-rounded', financial(payroll, 'football_coaching_compensation_usd'), finance_link)
    add('evidence_roster_estimate', 'Football NIL / roster estimate',
        'Published 2026 estimate or range · nominal dollars · scope varies by source',
        'money-rounded', roster_estimates(roster), source_link)
    add('evidence_contributions', 'Athletics contributions', money_note, 'money-rounded',
        financial(ncaa, 'donor_contributions_revenue_usd'), finance_link)
    local, regional, adjusted = recruiting_markets(programs)
    recruiting_link = '../../projects/program-rankings.html#recruiting-market-overlap'
    add('evidence_recruits_local', 'Local recruits', 'Top-1,000 prospects per class within 100 miles · 2022–26',
        'number', local, recruiting_link)
    add('evidence_recruits_regional', 'Regional recruits', 'Top-1,000 prospects per class over 100 and within 250 miles · 2022–26',
        'number', regional, recruiting_link)
    add('evidence_recruits_adjusted', 'Nearby talent share',
        'Recruit equivalents per class after sharing credit with nearby FBS schools · 2022–26',
        'number', adjusted, recruiting_link)
    add('evidence_hs_rank', 'Avg. high-school class rank', '2016–25 class average, excluding the 2021 recruiting cycle · 1 is best',
        'integer', summarize(indexed(recruiting, 'rank', set(range(2016, 2026)) - {2021}, 'year'),
                            'CollegeFootballData recruiting classes'), source_link)
    transfer_ratings = summarize(indexed(transfers, 'incoming_mean_rating', set(range(2022, 2027)), 'season'),
                                 'CollegeFootballData transfer portal')
    add('evidence_transfer_rank', 'Transfer recruiting rank',
        'Ranks schools by average incoming transfer rating, 2022–26 · 1 is best',
        'integer', rank_highest({school: entry for school, entry in transfer_ratings.items() if school in programs}),
        source_link)
    add('evidence_conference_revenue', 'Conference-related revenue',
        'Current league only · FY2016–25, excluding FY2020–21 · FY2025 athletics-cost dollars',
        'money-rounded', conference_evidence(ncaa, payouts, programs, membership, factors), finance_link)
    attendance = [row for row in attendance if row['covid_restricted'].lower() != 'true' and
                  row['fbs_eligible'].lower() == 'true']
    add('evidence_attendance', 'Home attendance per game', '2010–25 season average, excluding 2020 and flagged restricted seasons',
        'integer', summarize(indexed(attendance, 'average_home_attendance', set(range(2010, 2026)) - {2020},
                                     'season'), 'NCAA attendance / reconstructed season reports'), source_link)
    add('evidence_ticket_sales', 'Athletics ticket sales', money_note, 'money-rounded',
        financial(ncaa, 'ticket_sales_revenue_usd'), finance_link)
    add('evidence_sp_rank', 'Avg. SP+ rank', '2016–25 national FBS rank, excluding 2020 · 1 is best', 'integer',
        summarize(indexed([row for row in sp if row['membership_check'] == 'in_year_fbs_list'],
                          'ranking', SEASONS, 'season'), 'CollegeFootballData SP+'), source_link)
    add('evidence_historical_srs_rank', 'Historical SRS rank', '1980–2015 average season rank · 1 is best',
        'integer',
        summarize(indexed(csv_rows(COACHING / 'historical-srs-ranks.csv'), 'srs_rank',
                          set(range(1980, 2016)), 'season'), 'Sports Reference SRS'),
        '../../projects/program-rankings.html#historical-performance')
    return json.dumps(dict(metrics=metrics, schools=schools),
                      ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    content = build()
    if args.check:
        if OUTPUT.read_text() != content:
            raise SystemExit(f'{OUTPUT.name} differs from the published evidence inputs')
    else:
        OUTPUT.write_text(content)
