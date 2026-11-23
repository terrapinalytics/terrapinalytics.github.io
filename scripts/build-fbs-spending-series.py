"""Add current FBS and G6 coverage to the matched-school spending explorer."""
import csv
from collections import defaultdict
from pathlib import Path
from statistics import median

FINANCE = Path(__file__).resolve().parents[1] / 'assets/finance'
SERIES = FINANCE / 'escalation/explorer_series.csv'
POWER = {'ACC', 'Big Ten', 'Big 12', 'SEC', 'Independent', 'Independents', 'FBS Independents'}
BASE = 2019
METRICS = {
    'NCAA': (
        ('total_expenditure_usd', 'Total athletics expenses', 'Benchmarks'),
        ('football_expenditure_usd', 'Football expenses', 'Sports'),
        ('coaches_compensation_expenditure_usd', 'Athletics-wide coaches compensation', 'Spending categories'),
    ),
    'EADA': (
        ('total_expenditure_usd', 'Total athletics expenses', 'Benchmarks'),
        ('football_expenditure_usd', 'Football allocated expenses', 'Sports'),
        ('recruiting_expenditure_usd', 'Athletics-wide recruiting expenses', 'Spending categories'),
    ),
}
PANELS = {'NCAA': 'fbs_ncaa_finances_FY2005_FY2025.csv', 'EADA': 'fbs_eada_finances_FY2001_FY2025.csv'}


def build_series(source, label, group, cohort, values, cpi):
    ratios = {}
    pairs = {}
    for year, current in values.items():
        previous = values.get(year - 1, {})
        common = previous.keys() & current.keys()
        pairs[year] = len(common)
        if common:
            ratios[year] = median(current[school] / previous[school] for school in common)

    indices = {BASE: 100} if BASE in values else {}
    for year in range(BASE + 1, 2026):
        if year - 1 in indices and year in ratios:
            indices[year] = indices[year - 1] * ratios[year]
    for year in range(BASE - 1, min(values) - 1, -1):
        if year + 1 in indices and year + 1 in ratios:
            indices[year] = indices[year + 1] / ratios[year + 1]
    # A series with no FY2019 observation retains its own continuous runs.
    run = {}
    for year in sorted(values):
        if year not in indices:
            indices[year] = indices[year - 1] * ratios[year] if year - 1 in indices and year in ratios else 100
        run[year] = run.get(year - 1, year) if year in ratios else year
        yield {
            'series_id': f'{source} total spending|{cohort}' if group == 'Benchmarks' else f'{source} {label}|{cohort}',
            'series': label, 'source': 'NCAA / Knight-Newhouse' if source == 'NCAA' else source,
            'cohort': cohort, 'group': group, 'unit': 'USD',
            'fiscal_year': year, 'median_nominal_usd': median(values[year].values()),
            'index': indices[year], 'annual_growth_rate': ratios[year] - 1 if year in ratios else '',
            'reporting_schools': len(values[year]), 'matched_pairs': pairs[year], 'run_start_year': run[year],
            'cpi_u': cpi.get(year, ''),
            'notes': 'Current conference membership defines the cohort. Adjacent-year index links use the median change among schools with positive observations in both years. Coverage varies by fiscal year.',
        }


def main():
    with SERIES.open(encoding='utf-8', newline='') as source:
        reader = csv.DictReader(source)
        fields = reader.fieldnames
        original = list(reader)
    cpi = {int(row['fiscal_year']): row['cpi_u'] for row in original if row['cpi_u']}
    additions = []
    for source, filename in PANELS.items():
        with (FINANCE / filename).open(encoding='utf-8', newline='') as handle:
            panel = list(csv.DictReader(handle))
        for field, label, group in METRICS[source]:
            for cohort in ('FBS', 'Group of Six'):
                values = defaultdict(dict)
                for row in panel:
                    if cohort == 'Group of Six' and (row['conference_current'] in POWER or row['school'] == 'Notre Dame'):
                        continue
                    if field == 'football_expenditure_usd' and row.get('football_expenditure_valid_for_comparison') == 'false':
                        continue
                    value = float(row[field] or 0)
                    if value > 0:
                        values[int(row['fiscal_year'])][row['school']] = value
                if values:
                    additions.extend(build_series(source, label, group, cohort, values, cpi))
    generated = {row['series_id'] for row in additions}
    with SERIES.open('w', encoding='utf-8', newline='') as output:
        writer = csv.DictWriter(output, fields, lineterminator='\n')
        writer.writeheader()
        writer.writerows(row for row in original if row['series_id'] not in generated)
        writer.writerows(additions)


if __name__ == '__main__':
    main()
