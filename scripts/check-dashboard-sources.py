"""Report source release status for the curated recruiting and financial panels."""
import csv
from datetime import date
import json
import os
from pathlib import Path
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dashboard_sources import fetch, json_from

ROOT = Path(__file__).resolve().parents[1]
EADA = 'https://ope.ed.gov/athletics/api/dataFiles/fileList'
KNIGHT = 'https://knightnewhousedata.org/'
KNIGHT_COMMISSION = 'https://www.knightcommission.org/finances-college-sports/'
RECRUITING = 'https://247sports.com/season/{year}-football/compositerecruitrankings/'


def finance_status():
    for file, name in [
        ('fbs_eada_finances_FY2001_FY2025.csv', 'EADA'),
        ('fbs_ncaa_finances_FY2005_FY2025.csv', 'NCAA'),
    ]:
        with (ROOT / 'assets/finance' / file).open() as source:
            published = max(int(row['fiscal_year']) for row in csv.DictReader(source))
        if name == 'EADA':
            catalog = json_from(EADA)
            available = max(int(row['Year']) for row in catalog)
            status = f'FY{available} is the latest catalog year, FY{published} is published.'
            yield f'- [EADA catalog]({EADA}) · {status}' + (
                ' **New year requires panel import and validation.**' if available > published else '')
        else:
            try:
                raw = fetch(KNIGHT).decode()
                years = re.findall(r'updated with\s+(20\d{2})\s+Financial Data', raw, re.I)
                if not years:
                    raise ValueError('release-year marker unavailable')
                available = max(map(int, years))
                yield f'- [Knight-Newhouse]({KNIGHT}) · FY{available} advertised, FY{published} published.' + (
                    ' **New year requires panel import and validation.**' if available > published else '')
            except (URLError, ValueError) as error:
                yield (f'- [Knight-Newhouse]({KNIGHT}) requires review ({error}). '
                       f'Published NCAA panel ends at FY{published}. '
                       f'[Knight Commission releases]({KNIGHT_COMMISSION})')


def recruiting_status():
    text = (ROOT / 'assets/recruiting/data.js').read_text()
    snapshot, _ = json.JSONDecoder().raw_decode(text.split('=', 1)[1].lstrip())
    latest = max(int(player[0]) for player in snapshot['players'])
    year = max(latest + 1, date.today().year + (date.today().month >= 8))
    url = RECRUITING.format(year=year)
    try:
        html = fetch(url).decode()
        if 'Client Challenge' in html or 'Recruit Rankings' not in html:
            raise ValueError('ranked rows are unavailable to the runner')
        yield f'- [247Sports Composite class {year}]({url}) is reachable. Published map ends at {latest}. Review source coverage and coordinates before importing.'
    except (HTTPError, URLError, ValueError) as error:
        yield f'- [247Sports Composite class {year}]({url}) requires review ({error}). Published map ends at {latest}.'
    token = os.environ.get('CFBD_API_KEY')
    if token:
        request = Request(f'https://api.collegefootballdata.com/recruiting/players?year={year}&classification=HighSchool',
                          headers={'Authorization': f'Bearer {token}'})
        with urlopen(request, timeout=30) as response:
            rows = json.load(response)
        if not isinstance(rows, list):
            raise ValueError('Unexpected CFBD recruiting response')
        yield f'- CFBD class {year} returned {len(rows):,} high-school entries for comparison against the Composite.'


def main():
    results = ['## Terrapinalytics source review']
    failures = []
    for check in (finance_status, recruiting_status):
        try:
            results.extend(check())
        except (URLError, ValueError, KeyError) as error:
            results.append(f'- {check.__name__} could not complete ({error}).')
            failures.append(check.__name__)
    results.append('\nReview results in this run summary. Published data changes require normalized inputs and validation.')
    content = '\n'.join(results) + '\n'
    print(content)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
            summary.write(content)
    if failures:
        raise SystemExit(f'Source checks failed: {", ".join(failures)}')


if __name__ == '__main__':
    main()
