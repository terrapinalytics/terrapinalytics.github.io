"""Refresh the rankings' financial evidence from the published source panels."""

import argparse
import csv
import io
import json
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[1]
FINANCE = ROOT / 'assets/finance'
COACHING = ROOT / 'assets/coaching'
YEAR = 2025
CPI = {2022: 292.655, 2023: 304.702, 2024: 313.689, 2025: 321.943}

# Key, source field, school-detail label. All values are current-year nominal dollars.
METRICS = {
    'ncaa': (
        ('ncaa_football_expenses_FY2025_usd', 'football_expenditure_usd', 'NCAA football expenses'),
        ('ncaa_2025_total_expenditure_usd', 'total_expenditure_usd', 'NCAA athletics expenses'),
        ('ncaa_2025_ticket_sales_revenue_usd', 'ticket_sales_revenue_usd', 'NCAA athletics ticket revenue'),
        ('ncaa_2025_donor_contributions_revenue_usd', 'donor_contributions_revenue_usd', 'NCAA athletics contributions'),
        ('ncaa_2025_coaches_compensation_usd', 'coaches_compensation_expenditure_usd', 'NCAA athletics-wide coaches compensation'),
        ('ncaa_2025_conference_ncaa_media_postseason_usd', 'conference_ncaa_media_postseason_revenue_usd', 'NCAA conference / NCAA / media / postseason revenue'),
    ),
    'eada': (
        ('eada_football_expenses_FY2025_usd', 'football_expenditure_usd', 'EADA football expenses'),
        ('eada_athletics_expenses_FY2025_usd', 'total_expenditure_usd', 'EADA athletics expenses'),
        ('eada_athletics_revenue_FY2025_usd', 'total_revenue_usd', 'EADA athletics revenue'),
        ('eada_football_revenue_FY2025_usd', 'football_revenue_usd', 'EADA football attributed revenue'),
        ('eada_recruiting_expenses_FY2025_usd', 'recruiting_expenditure_usd', 'EADA athletics-wide recruiting expenses'),
    ),
}


def read_panel(filename):
    with (FINANCE / filename).open(newline='', encoding='utf-8') as handle:
        rows = list(csv.DictReader(handle))
    indexed = {(row['school'], int(row['fiscal_year'])): row for row in rows}
    if len(indexed) != len(rows):
        raise ValueError(f'Duplicate school-year in {filename}')
    return indexed


def football_expenses(row):
    if row.get('football_expenditure_valid_for_comparison', 'true').lower() == 'true':
        return row.get('football_expenditure_usd', '')
    return ''


def complete_eada_average(panel, school, start, real=False):
    values = []
    for year in range(start, start + 3):
        amount = football_expenses(panel.get((school, year), {}))
        if amount == '':
            return ''
        values.append(float(amount) * (CPI[YEAR] / CPI[year] if real else 1))
    return mean(values)


def build():
    panels = {
        'ncaa': read_panel('fbs_ncaa_finances_FY2005_FY2025.csv'),
        'eada': read_panel('fbs_eada_finances_FY2001_FY2025.csv'),
    }
    input_path = COACHING / 'program_inputs.csv'
    with input_path.open(newline='', encoding='utf-8') as handle:
        data = csv.DictReader(handle)
        fields = list(data.fieldnames)
        inputs = list(data)

    definitions = [
        dict(key=key, label=label, format='money', definition='FY2025 · nominal USD')
        for fields_by_source in METRICS.values() for key, _, label in fields_by_source
    ]
    keys = [metric['key'] for metric in definitions]
    fields.extend(key for key in keys if key not in fields)
    evidence = {}
    for row in inputs:
        school = row['school']
        school_evidence = {}
        for family, metrics in METRICS.items():
            source = panels[family].get((school, YEAR), {})
            overrides = json.loads(source.get('metric_source_overrides') or '{}')
            for key, field, _ in metrics:
                value = football_expenses(source) if field == 'football_expenditure_usd' else source.get(field, '')
                row[key] = value
                school_evidence[key] = {
                    'value': float(value) if value else None,
                    'url': (overrides.get(field) or source.get('source_url', '')) if value else '',
                    'status': source.get('data_status', ''),
                }
            if source.get('total_expenditure_usd') and family == 'eada':
                row['eada_2025_total'] = source['total_expenditure_usd']
            if football_expenses(source):
                year_key, value_key = {
                    'eada': ('eada_latest_fy', 'eada_football_expenses_latest_usd'),
                    'ncaa': ('ncaa_football_expenses_latest_fy', 'ncaa_football_expenses_latest_usd'),
                }[family]
                if not row[year_key] or float(row[year_key]) <= YEAR:
                    row[year_key] = str(YEAR)
                    row[value_key] = football_expenses(source)
        for key, start, real in (
            ('eada_football_expenses_mean_FY2022_2024_nominal_usd', 2022, False),
            ('eada_football_expenses_mean_FY2023_2025_nominal_usd', 2023, False),
            ('eada_football_expenses_mean_FY2023_2025_2025usd', 2023, True),
        ):
            if not row[key]:
                row[key] = complete_eada_average(panels['eada'], school, start, real)
        evidence[school] = school_evidence

    output = io.StringIO(newline='')
    writer = csv.DictWriter(output, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    writer.writerows(inputs)
    series = json.dumps({'metrics': definitions, 'schools': evidence}, ensure_ascii=False, separators=(',', ':'))
    return {input_path: output.getvalue(), COACHING / 'ranking-finance.json': series + '\n'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify the committed outputs.')
    args = parser.parse_args()
    for path, content in build().items():
        if args.check:
            if not path.exists() or path.read_text(encoding='utf-8') != content:
                raise SystemExit(f'{path.relative_to(ROOT)} needs to be rebuilt')
        else:
            path.write_text(content, encoding='utf-8')
