"""Build the rankings dashboard's comparable evidence from published yearly panels."""
import argparse
from collections import defaultdict
import csv
import io
import json
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


def summarize(values, source, factors=None):
    result = {}
    for school, observations in values.items():
        if len(observations) < MIN_YEARS:
            continue
        years = sorted(observations)
        adjusted = [observations[year] * (factors[year] if factors else 1) for year in years]
        result[school] = {'value': round(mean(adjusted), 4), 'years': years, 'source': source}
    return result


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
        'money', spending_eada | spending_ncaa, finance_link)
    add('evidence_football_payroll', 'Football coaching payroll', money_note,
        'money', financial(payroll, 'football_coaching_compensation_usd'), finance_link)
    add('evidence_contributions', 'Athletics contributions', money_note, 'money',
        financial(ncaa, 'donor_contributions_revenue_usd'), finance_link)
    add('evidence_hs_rank', 'High-school class rank', '2016–25 class average, excluding the 2021 recruiting cycle',
        'number', summarize(indexed(recruiting, 'rank', set(range(2016, 2026)) - {2021}, 'year'),
                            'CollegeFootballData recruiting classes'), source_link)
    add('evidence_transfer_rating', 'Incoming transfer rating',
        '2022–26 average of annual ratings for rated incoming transfers',
        'rating', summarize(indexed(transfers, 'incoming_mean_rating', set(range(2022, 2027)), 'season'),
                            'CollegeFootballData transfer portal'), source_link)
    same_league = [r for r in ncaa if programs.get(r['school']) and
                   membership.get((r['school'], int(r['fiscal_year']) - 1)) == programs[r['school']]]
    add('evidence_conference_revenue', 'Conference, NCAA, media and postseason revenue',
        money_note + ' · football seasons in the current league only',
        'money', financial(same_league, 'conference_ncaa_media_postseason_revenue_usd'), finance_link)
    attendance = [row for row in attendance if row['covid_restricted'].lower() != 'true' and
                  row['fbs_eligible'].lower() == 'true']
    add('evidence_attendance', 'Home attendance per game', '2010–25 season average, excluding 2020 and flagged restricted seasons',
        'integer', summarize(indexed(attendance, 'average_home_attendance', set(range(2010, 2026)) - {2020},
                                     'season'), 'NCAA attendance / reconstructed season reports'), source_link)
    add('evidence_ticket_sales', 'Athletics ticket sales', money_note, 'money',
        financial(ncaa, 'ticket_sales_revenue_usd'), finance_link)
    add('evidence_sp_rating', 'SP+ rating', '2016–25 FBS season average, excluding 2020', 'number',
        summarize(indexed([row for row in sp if row['membership_check'] == 'in_year_fbs_list'],
                          'rating', SEASONS, 'season'), 'CollegeFootballData SP+'), source_link)
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
